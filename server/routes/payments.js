// Paystack payments (test mode). Amounts stay in kobo end-to-end.
// Rule 2: balance owed = package price − Σ successful payments (computed, never stored).
// Flow: init -> Paystack hosted checkout -> (webhook + verify fallback) -> payment
// marked success -> purchase flips pending -> active in ONE transaction.
const express = require("express");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const CALLBACK = process.env.PAYSTACK_CALLBACK_URL || "http://localhost:5173/payment/callback";
const SIMULATE_ALLOWED = process.env.PAYSTACK_ALLOW_SIMULATE === "1";
const PAYSTACK_API = "https://api.paystack.co";

// ---- POST /api/payments/init — learner starts a payment --------------------
router.post("/init", requireAuth, requireRole("learner"), async (req, res) => {
  try {
    const learner = await prisma.learner.findUnique({ where: { userId: req.user.id } });
    if (!learner) return res.status(404).json({ error: "Learner profile missing" });

    const purchase = await prisma.packagePurchase.findUnique({
      where: { id: String(req.body?.purchaseId || "") },
      include: { package: true, payments: true },
    });
    if (!purchase || purchase.learnerId !== learner.id)
      return res.status(404).json({ error: "Purchase not found" });

    const paid = purchase.payments.filter((x) => x.status === "success").reduce((s, x) => s + x.amountKobo, 0);
    const balance = Math.max(0, purchase.package.priceKobo - paid);
    if (balance === 0)
      return res.status(400).json({ error: "This purchase is already fully paid" });

    // Optional partial amount (instalments); default: everything still owed
    const amount = Math.round(Number(req.body?.amountKobo ?? balance));
    if (!(amount >= 10_000 && amount <= balance))
      return res.status(400).json({ error: `Amount must be between ₦100 and the ₦${balance / 100} still owed` });

    const reference = "PRD" + Date.now() + crypto.randomBytes(4).toString("hex");
    const payment = await prisma.payment.create({
      data: { purchaseId: purchase.id, learnerId: learner.id, amountKobo: amount, method: "card", reference, status: "pending" },
    });

    if (!SECRET) return res.status(503).json({
      error: "Paystack is not configured yet (PAYSTACK_SECRET_KEY missing)",
      payment,
      devSimulate: SIMULATE_ALLOWED ? { reference } : undefined,
    });

    let initRes;
    try {
      initRes = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: req.user.email,
          amount, // kobo
          reference,
          currency: "NGN",
          callback_url: `${CALLBACK}?reference=${reference}`,
          metadata: { purchaseId: purchase.id, learnerId: learner.id, packageName: purchase.package.name },
        }),
      });
      initRes.json = await initRes.json().catch(() => null);
    } catch {
      return res.status(502).json({ error: "Could not reach Paystack", devSimulate: SIMULATE_ALLOWED ? { reference } : undefined });
    }

    if (!initRes.ok || initRes.json?.status !== true) {
      return res.status(502).json({
        error: "Paystack rejected the payment start (check your test keys)",
        detail: initRes.json?.message || null,
        devSimulate: SIMULATE_ALLOWED ? { reference } : undefined,
      });
    }

    res.status(201).json({ reference, authorization_url: initRes.json.data.authorization_url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not start payment" });
  }
});

// Marks one reference as successful — idempotent, shared by webhook + verify.
async function markSuccess(reference, amountKoboFromPaystack) {
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) return { handled: false, reason: "unknown reference" };
  if (payment.status === "success") return { handled: true, idempotent: true };
  if (amountKoboFromPaystack != null && amountKoboFromPaystack !== payment.amountKobo)
    return { handled: false, reason: "amount mismatch" };

  return prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { reference }, data: { status: "success" } });
    const purchase = await tx.packagePurchase.findUnique({
      where: { id: payment.purchaseId },
      include: { payments: true, package: true },
    });
    const fullyPaid = purchase.payments
      .filter((p) => p.status === "success" || p.reference === reference)
      .reduce((s, p) => s + p.amountKobo, 0) >= purchase.package.priceKobo;
    await tx.packagePurchase.update({
      where: { id: purchase.id },
      data: { status: "active", paidAt: purchase.paidAt ?? new Date() },
    });
    return {
      handled: true, idempotent: false,
      fullyPaid, purchaseId: purchase.id,
      packageName: purchase.package.name,
    };
  });
}

async function markFailure(reference) {
  await prisma.payment.updateMany({
    where: { reference, status: "pending" },
    data: { status: "failed" },
  });
}

// ---- POST /api/payments/webhook — Paystack calls this -----------------------
router.post("/webhook", async (req, res) => {
  try {
    // Verify the signature over the RAW body (Paystack spec).
    const signature = req.headers["x-paystack-signature"] || "";
    const expected = SECRET ? crypto.createHmac("sha512", SECRET).update(req.rawBody || "").digest("hex") : "";
    const signatureBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    const valid = Boolean(SECRET && signatureBytes.length && signatureBytes.length === expectedBytes.length && crypto.timingSafeEqual(signatureBytes, expectedBytes));
    if (!valid) return res.status(401).json({ error: "Bad webhook signature" });

    const event = req.body; // parsed JSON
    if (event?.event === "charge.success" && event.data?.status === "success") {
      const result = await markSuccess(event.data.reference, event.data.amount);
      if (!result.handled) console.warn("webhook ignored:", result.reason);
    } else if (event?.event === "charge.failed" && event.data?.reference) {
      await markFailure(event.data.reference);
    }
    res.json({ received: true }); // always 200 once authenticated
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Webhook handling failed" });
  }
});

// ---- GET /api/payments/verify?reference= — belt & braces after redirect -----
router.get("/verify", requireAuth, requireRole("learner"), async (req, res) => {
  try {
    const reference = String(req.query.reference || "");
    const payment = await prisma.payment.findFirst({
      where: { reference, learner: { userId: req.user.id } },
      include: { purchase: { include: { package: true } } },
    });
    if (!payment) return res.status(404).json({ error: "Payment not found" });

    // Ask Paystack to confirm (same source of truth as the webhook).
    let paystackStatus = null;
    if (SECRET) {
      try {
        const r = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
          headers: { Authorization: `Bearer ${SECRET}` },
        });
        const j = await r.json().catch(() => null);
        if (j?.status === true) {
          paystackStatus = j.data?.status;
          if (paystackStatus === "success") await markSuccess(reference, j.data.amount);
          else if (paystackStatus === "failed") await markFailure(reference);
        }
      } catch {
        // Unreachable (e.g. network outage) — fall through to local state.
      }
    }

    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
    const purchase = await prisma.packagePurchase.findUnique({
      where: { id: payment.purchaseId }, include: { package: true, payments: true },
    });
    const paid = purchase.payments.filter((x) => x.status === "success").reduce((s, x) => s + x.amountKobo, 0);
    res.json({
      payment: { reference: fresh.reference, status: fresh.status, amountKobo: fresh.amountKobo },
      packageName: purchase.package.name,
      purchaseStatus: purchase.status,
      balanceOwedKobo: Math.max(0, purchase.package.priceKobo - paid),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Verification failed" });
  }
});

// ---- POST /api/payments/simulate — DEV ONLY --------------------------------
// Exercises the same success path as the real webhook while the owner tests
// locally without real Paystack keys. Gated by PAYSTACK_ALLOW_SIMULATE=1.
router.post("/simulate", requireAuth, requireRole("learner"), async (req, res) => {
  if (!SIMULATE_ALLOWED) return res.status(403).json({ error: "Simulation is disabled" });
  const { reference } = req.body || {};
  const owned = await prisma.payment.findFirst({
    where: { reference: String(reference || ""), learner: { userId: req.user.id } },
  });
  if (!owned) return res.status(404).json({ error: "Payment not found" });
  const result = await markSuccess(owned.reference, owned.amountKobo); // exactly what the webhook does
  if (!result.handled) return res.status(409).json({ error: result.reason });
  res.json({ ok: true, ...result });
});

module.exports = router;
