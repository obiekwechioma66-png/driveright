// Learner chooses a package. Payment flow arrives in step 4 (Paystack); the
// purchase starts as "pending" so balance owed = full price until payments land.
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.post("/", requireAuth, requireRole("learner"), async (req, res) => {
  try {
    const pkg = await prisma.package.findUnique({ where: { id: String(req.body?.packageId || "") } });
    if (!pkg || !pkg.active) return res.status(404).json({ error: "That package is not available" });

    const learner = await prisma.learner.findUnique({ where: { userId: req.user.id } });
    if (!learner) return res.status(404).json({ error: "Learner profile missing" });

    const purchase = await prisma.packagePurchase.create({
      data: {
        learnerId: learner.id,
        packageId: pkg.id,
        lessonsTotal: pkg.lessonCount,
        status: "pending",
      },
    });
    res.status(201).json({ purchase });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not start that purchase" });
  }
});

module.exports = router;
