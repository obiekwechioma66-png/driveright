// Packages: public browse, admin CRUD, and the learner "choose a package" action.
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const asPositiveInt = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function validatePackage(body) {
  const name = String(body.name || "").trim();
  const description = body.description ? String(body.description).trim() : null;
  const priceKobo = asPositiveInt(body.priceKobo);
  const lessonCount = asPositiveInt(body.lessonCount);
  if (name.length < 2) return { error: "Package name is required" };
  if (!priceKobo) return { error: "Price must be a positive amount" };
  if (!lessonCount) return { error: "Lessons must be a positive number" };
  return { data: { name, description, priceKobo, lessonCount } };
}

// ---- GET /api/packages — public: every active package ---------------------
router.get("/", async (req, res) => {
  try {
    const packages = await prisma.package.findMany({
      where: { active: true },
      orderBy: { priceKobo: "asc" },
    });
    res.json({ packages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load packages" });
  }
});

// ---- GET /api/packages/all — admin: includes deactivated packages ---------
router.get("/all", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const packages = await prisma.package.findMany({
      orderBy: [{ active: "desc" }, { priceKobo: "asc" }],
    });
    res.json({ packages });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load packages" });
  }
});

// ---- POST /api/packages — admin creates -----------------------------------
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const v = validatePackage(req.body || {});
    if (v.error) return res.status(400).json({ error: v.error });
    const pkg = await prisma.package.create({ data: v.data });
    res.status(201).json({ package: pkg });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not create package" });
  }
});

// ---- PATCH /api/packages/:id — admin edits (incl. activate/deactivate) ----
router.patch("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const existing = await prisma.package.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Package not found" });

    // Partial update: only fields present in the body change.
    const body = req.body || {};
    let data = {};
    if (body.name !== undefined || body.description !== undefined ||
        body.priceKobo !== undefined || body.lessonCount !== undefined) {
      const v = validatePackage({
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        priceKobo: body.priceKobo ?? existing.priceKobo,
        lessonCount: body.lessonCount ?? existing.lessonCount,
      });
      if (v.error) return res.status(400).json({ error: v.error });
      data = v.data;
    }
    if (body.active !== undefined) data.active = !!body.active;

    const pkg = await prisma.package.update({ where: { id: existing.id }, data });
    res.json({ package: pkg });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not update package" });
  }
});

// ---- DELETE /api/packages/:id — admin deletes ------------------------------
// Never orphans purchase history: if learners bought this package we refuse
// hard delete and offer deactivation instead.
router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const existing = await prisma.package.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Package not found" });

    const sales = await prisma.packagePurchase.count({ where: { packageId: existing.id } });
    if (sales > 0) {
      const pkg = await prisma.package.update({ where: { id: existing.id }, data: { active: false } });
      return res.json({ package: pkg, deactivated: true,
        message: "Learners already bought this package — it was hidden (deactivated) instead of deleted." });
    }
    await prisma.package.delete({ where: { id: existing.id } });
    res.json({ package: existing, deleted: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not delete package" });
  }
});

// POST /api/purchases lives in routes/purchases.js so learners POST to /api/purchases.

module.exports = router;
