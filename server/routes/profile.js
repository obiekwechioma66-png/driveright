const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { requireAuth } = require("../middleware/auth");

const prisma = new PrismaClient();
const router = express.Router();
const cleanPhone = (value) => String(value || "").replace(/[\s()-]/g, "");
const PHONE_RE = /^(?:0[789]\d{9}|\+234[789]\d{9})$/;

async function shapeProfile(user) {
  const rows = await prisma.$queryRaw`SELECT "address" FROM "User" WHERE "id" = ${user.id}`;
  return { name: user.name, email: user.email, phone: user.phone || "", address: rows[0]?.address || "", role: user.role };
}

router.get("/profile", requireAuth, async (req, res) => {
  if (!["learner", "instructor"].includes(req.user.role)) return res.status(403).json({ error: "Profile unavailable" });
  try { res.json({ profile: await shapeProfile(req.user) }); }
  catch (e) { console.error(e); res.status(500).json({ error: "Could not load profile" }); }
});

router.patch("/profile", requireAuth, async (req, res) => {
  if (!["learner", "instructor"].includes(req.user.role)) return res.status(403).json({ error: "Profile unavailable" });
  const phone = cleanPhone(req.body?.phone);
  const address = String(req.body?.address || "").trim();
  if (req.user.role === "learner" && !phone) return res.status(400).json({ error: "A phone number is required for lesson reminders" });
  if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ error: "Enter a valid Nigerian phone number, e.g. 08012345678" });
  if (address.length > 300) return res.status(400).json({ error: "Address must be 300 characters or fewer" });
  try {
    const updated = await prisma.user.update({ where: { id: req.user.id }, data: { phone: phone || null } });
    await prisma.$executeRaw`UPDATE "User" SET "address" = ${address || null} WHERE "id" = ${req.user.id}`;
    if (req.user.role === "learner") {
      await prisma.learner.update({ where: { userId: req.user.id }, data: { address: address || null } });
    } else {
      await prisma.instructor.update({ where: { userId: req.user.id }, data: { phone: phone || null } });
    }
    res.json({ profile: await shapeProfile(updated) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Could not save profile" }); }
});

module.exports = router;
