const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { requireAuth, requireRole } = require("../middleware/auth");

const prisma = new PrismaClient();
const router = express.Router();

function validate(body) {
  const learnerName = String(body.learnerName || "").trim();
  const quote = String(body.quote || "").trim();
  const rating = Number(body.rating ?? 5);
  if (learnerName.length < 2 || learnerName.length > 120) return { error: "Enter a name between 2 and 120 characters." };
  if (quote.length < 12 || quote.length > 700) return { error: "Review text must be 12–700 characters." };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Rating must be between 1 and 5 stars." };
  return { data: { learnerName, quote, rating, active: Boolean(body.active) } };
}

router.get("/testimonials", async (_req, res) => {
  try {
    const testimonials = await prisma.testimonial.findMany({
      where: { active: true }, orderBy: { createdAt: "desc" }, take: 12,
      select: { id: true, learnerName: true, quote: true, rating: true },
    });
    res.json({ testimonials });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load learner reviews" });
  }
});

router.get("/admin/testimonials", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    res.json({ testimonials: await prisma.testimonial.findMany({ orderBy: { createdAt: "desc" } }) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load learner reviews" });
  }
});

router.post("/admin/testimonials", requireAuth, requireRole("admin"), async (req, res) => {
  const v = validate(req.body || {});
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    const testimonial = await prisma.testimonial.create({ data: v.data });
    res.status(201).json({ testimonial });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not save learner review" });
  }
});

router.patch("/admin/testimonials/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const current = await prisma.testimonial.findUnique({ where: { id: req.params.id } });
    if (!current) return res.status(404).json({ error: "Review not found." });
    const v = validate({ ...current, ...req.body });
    if (v.error) return res.status(400).json({ error: v.error });
    const testimonial = await prisma.testimonial.update({ where: { id: current.id }, data: v.data });
    res.json({ testimonial });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update learner review" });
  }
});

router.delete("/admin/testimonials/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await prisma.testimonial.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ error: "Review not found." });
    console.error(error);
    res.status(500).json({ error: "Could not delete learner review" });
  }
});

module.exports = router;
