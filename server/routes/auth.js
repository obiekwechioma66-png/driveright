// Sign-up, login, current-user. Roles: learner | instructor | admin.
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const ROLES = ["learner", "instructor", "admin"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanPhone = (value) => String(value || "").replace(/[\s()-]/g, "");
const PHONE_RE = /^(?:0[789]\d{9}|\+234[789]\d{9})$/;

const toUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

// ---- POST /api/auth/register --------------------------------------------
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    const phone = cleanPhone(req.body?.phone);
    const address = String(req.body?.address || "").trim();

    if (!name || typeof name !== "string" || name.trim().length < 2)
      return res.status(400).json({ error: "Enter your full name" });
    if (!EMAIL_RE.test(String(email || "")))
      return res.status(400).json({ error: "Enter a valid email address" });
    if (!password || String(password).length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (!ROLES.includes(role))
      return res.status(400).json({ error: "Choose learner, instructor or admin" });
    if (role === "learner" && !phone)
      return res.status(400).json({ error: "A phone number is required for lesson reminders" });
    if (phone && !PHONE_RE.test(phone))
      return res.status(400).json({ error: "Enter a valid Nigerian phone number, e.g. 08012345678" });
    if (address.length > 300)
      return res.status(400).json({ error: "Address must be 300 characters or fewer" });

    const emailNorm = String(email).trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: emailNorm } });
    if (existing)
      return res.status(409).json({ error: "That email already has an account — log in instead" });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: emailNorm,
        role,
        passwordHash,
        phone: phone || null,
        ...(role === "learner" ? { learnerProfile: { create: { address: address || null } } } : {}),
        ...(role === "instructor" ? { instructorProfile: { create: { phone: phone || null } } } : {}),
      },
    });

    await prisma.$executeRaw`UPDATE "User" SET "address" = ${address || null} WHERE "id" = ${user.id}`;

    res.status(201).json({ token: signToken(user), user: toUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Registration failed" });
  }
});

// ---- POST /api/auth/login ------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = String(email || "").trim().toLowerCase();
    if (!emailNorm || !password)
      return res.status(400).json({ error: "Enter your email and password" });

    const user = await prisma.user.findUnique({ where: { email: emailNorm } });
    const ok = user && (await bcrypt.compare(String(password), user.passwordHash));
    if (!ok) return res.status(401).json({ error: "Wrong email or password" });

    res.json({ token: signToken(user), user: toUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Login failed" });
  }
});

// ---- GET /api/auth/me ----------------------------------------------------
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: toUser(req.user) });
});

module.exports = router;
