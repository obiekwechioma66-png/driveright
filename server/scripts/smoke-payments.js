// Local payment-flow smoke test. Requires the seeded users and
// PAYSTACK_ALLOW_SIMULATE=1; it creates and removes its own package purchase.
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();
const BASE = process.env.DRIVERIGHT_API_BASE || "http://localhost:4000/api";
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

async function call(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

(async () => {
  let packageId;
  let purchaseId;
  try {
    const login = await call("/auth/login", {
      method: "POST", body: { email: "tunde@example.com", password: "password123" },
    });
    check("seed learner can sign in", login.status === 200 && !!login.json?.token);
    if (!login.json?.token) throw new Error("Seed learner login failed");

    const suffix = Date.now();
    const created = await prisma.package.create({
      data: { name: `Payment smoke ${suffix}`, priceKobo: 50_000, lessonCount: 3 },
    });
    packageId = created.id;
    const selected = await call("/purchases", {
      method: "POST", token: login.json.token, body: { packageId },
    });
    purchaseId = selected.json?.purchase?.id;
    check("learner creates a pending package purchase", selected.status === 201 && selected.json?.purchase?.status === "pending");

    const initialized = await call("/payments/init", {
      method: "POST", token: login.json.token,
      body: { purchaseId, amountKobo: 10_000 },
    });
    const reference = initialized.json?.devSimulate?.reference;
    const savedPayment = reference ? await prisma.payment.findUnique({ where: { reference } }) : null;
    check("payment attempt is saved and local checkout fallback is offered",
      [502, 503].includes(initialized.status) && !!reference && savedPayment?.purchaseId === purchaseId && savedPayment?.status === "pending");
    if (!reference) throw new Error("Local simulation is unavailable; check PAYSTACK_ALLOW_SIMULATE=1 and that no Paystack secret is configured");

    check("bad webhook signature is rejected", (await call("/payments/webhook", {
      method: "POST", body: { event: "charge.success", data: { status: "success", reference, amount: 10_000 } },
    })).status === 401);

    const webhookSecret = process.env.DRIVERIGHT_SMOKE_WEBHOOK_SECRET;
    if (webhookSecret) {
      const event = { event: "charge.success", data: { status: "success", reference, amount: 10_000 } };
      const raw = JSON.stringify(event);
      const signature = crypto.createHmac("sha512", webhookSecret).update(raw).digest("hex");
      const webhook = await fetch(`${BASE}/payments/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
        body: raw,
      });
      check("signed Paystack success webhook records payment and activates purchase", webhook.status === 200);
      const duplicate = await fetch(`${BASE}/payments/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-paystack-signature": signature },
        body: raw,
      });
      check("duplicate success webhook is idempotent", duplicate.status === 200);
    } else {
      const simulated = await call("/payments/simulate", {
        method: "POST", token: login.json.token, body: { reference },
      });
      check("successful simulated payment activates purchase", simulated.status === 200 && simulated.json?.fullyPaid === false);
      check("duplicate success handling is idempotent", (await call("/payments/simulate", {
        method: "POST", token: login.json.token, body: { reference },
      })).status === 200);
    }

    const verified = await call(`/payments/verify?reference=${encodeURIComponent(reference)}`, { token: login.json.token });
    check("callback verification reports saved success and remaining balance",
      verified.status === 200 && verified.json?.payment?.status === "success" && verified.json?.balanceOwedKobo === 40_000);

    const dashboard = await call("/learner/dashboard", { token: login.json.token });
    const purchase = dashboard.json?.purchases?.find((p) => p.id === purchaseId);
    check("learner dashboard shows paid amount, balance and lessons remaining",
      dashboard.status === 200 && purchase?.paidKobo === 10_000 && purchase?.balanceOwedKobo === 40_000 && purchase?.creditsLeft === 3);

    if (results.some((r) => r.startsWith("FAIL"))) process.exitCode = 1;
  } catch (e) {
    console.error("CRASH", e);
    process.exitCode = 1;
  } finally {
    if (purchaseId) await prisma.payment.deleteMany({ where: { purchaseId } });
    if (purchaseId) await prisma.packagePurchase.deleteMany({ where: { id: purchaseId } });
    if (packageId) await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.$disconnect();
    if (results.length) console.log(results.join("\n"));
  }
})().catch((e) => { console.error("CLEANUP FAILED", e); process.exitCode = 1; });
