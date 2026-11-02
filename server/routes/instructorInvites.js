const express = require("express");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { requireAuth, requireRole } = require("../middleware/auth");

const prisma = new PrismaClient();
const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^(?:0[789]\d{9}|\+234[789]\d{9})$/;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const sha256 = (token) => crypto.createHash("sha256").update(token).digest("hex");
const cleanPhone = (value) => String(value || "").replace(/[\s()-]/g, "");

router.get("/admin/instructor-invites", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const invites = await prisma.instructorInvite.findMany({
      orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, email: true, createdAt: true, expiresAt: true, acceptedAt: true, revokedAt: true },
    });
    const now = new Date();
    res.json({ invites: invites.map((invite) => ({
      ...invite,
      status: invite.revokedAt ? "revoked" : invite.acceptedAt ? "accepted" : invite.expiresAt <= now ? "expired" : "pending",
    })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load instructor invitations" });
  }
});

router.post("/admin/instructor-invites", requireAuth, requireRole("admin"), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid instructor email address." });

  try {
    if (await prisma.user.findUnique({ where: { email } }))
      return res.status(409).json({ error: "An account already exists for that email." });
    const active = await prisma.instructorInvite.findFirst({
      where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (active) return res.status(409).json({ error: "A valid invitation already exists for that email." });

    const configuredBaseUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL || "";
    if (process.env.NODE_ENV === "production" && !configuredBaseUrl)
      return res.status(503).json({ error: "Set APP_BASE_URL on the API host before sending instructor invitations." });
    const baseUrl = String(configuredBaseUrl || "http://localhost:5173").replace(/\/+$/, "");
    let parsedBaseUrl;
    try { parsedBaseUrl = new URL(baseUrl); } catch { return res.status(503).json({ error: "APP_BASE_URL is invalid." }); }
    if (process.env.NODE_ENV === "production" && parsedBaseUrl.protocol !== "https:")
      return res.status(503).json({ error: "APP_BASE_URL must use HTTPS in production." });

    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invite = await prisma.instructorInvite.create({
      data: { email, tokenHash: sha256(token), inviterId: req.user.id, expiresAt },
    });
    const inviteUrl = `${parsedBaseUrl.origin}/staff/invite?token=${encodeURIComponent(token)}`;
    let emailSent = false;

    if (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL,
            to: email,
            subject: "You’re invited to join DriveRight as an instructor",
            text: `You have been invited to join DriveRight as an instructor. Set up your account using this link within 7 days: ${inviteUrl}`,
            html: `<p>You have been invited to join DriveRight as an instructor.</p><p><a href="${inviteUrl}">Accept your invitation and create your account</a></p><p>This invitation expires in 7 days.</p>`,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.id) throw new Error(payload?.message || `Email provider returned ${response.status}`);
        emailSent = true;
      } catch (error) {
        await prisma.instructorInvite.delete({ where: { id: invite.id } });
        console.error(`Instructor invitation email failed: ${error.message}`);
        return res.status(502).json({ error: "The invitation email could not be sent. Check the Resend configuration and try again." });
      }
    }

    res.status(201).json({
      invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt, status: "pending" },
      emailSent,
      ...(!emailSent ? { inviteUrl, notice: "Email is not configured; copy and share this one-time invitation link." } : {}),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create instructor invitation" });
  }
});

router.delete("/admin/instructor-invites/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const invite = await prisma.instructorInvite.findUnique({ where: { id: req.params.id } });
    if (!invite) return res.status(404).json({ error: "Invitation not found." });
    if (invite.acceptedAt) return res.status(409).json({ error: "An accepted invitation cannot be revoked." });
    await prisma.instructorInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not revoke invitation" });
  }
});

router.patch("/admin/learners/:learnerId/instructor", requireAuth, requireRole("admin"), async (req, res) => {
  const rawInstructorId = req.body?.instructorId;
  const instructorId = rawInstructorId == null || rawInstructorId === "" ? null : String(rawInstructorId);
  try {
    const learner = await prisma.learner.findUnique({ where: { id: req.params.learnerId } });
    if (!learner) return res.status(404).json({ error: "Learner not found." });
    if (instructorId) {
      const instructor = await prisma.instructor.findUnique({ where: { id: instructorId } });
      if (!instructor) return res.status(400).json({ error: "Choose an active instructor account." });
    }
    const updated = await prisma.learner.update({
      where: { id: learner.id },
      data: { instructorId },
      include: { instructor: { include: { user: { select: { name: true } } } } },
    });
    res.json({ learnerId: updated.id, instructorId: updated.instructorId, instructor: updated.instructor?.user.name || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update learner assignment" });
  }
});

router.get("/staff/invitations/:token", async (req, res) => {
  const token = String(req.params.token || "");
  if (!token || token.length > 200) return res.status(410).json({ error: "This invitation link is invalid." });
  try {
    const invite = await prisma.instructorInvite.findUnique({ where: { tokenHash: sha256(token) } });
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date())
      return res.status(410).json({ error: "This invitation is invalid, expired, or already used." });
    res.json({ email: invite.email, expiresAt: invite.expiresAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not verify this invitation" });
  }
});

router.post("/staff/invitations/accept", async (req, res) => {
  const token = String(req.body?.token || "");
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const phone = cleanPhone(req.body?.phone);
  const address = String(req.body?.address || "").trim();
  if (!token || token.length > 200) return res.status(400).json({ error: "This invitation link is invalid." });
  if (name.length < 2 || name.length > 120) return res.status(400).json({ error: "Enter your full name." });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ error: "Enter a valid Nigerian phone number." });
  if (address.length > 300) return res.status(400).json({ error: "Address must be 300 characters or fewer." });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await prisma.$transaction(async (tx) => {
      const invite = await tx.instructorInvite.findUnique({ where: { tokenHash: sha256(token) } });
      if (!invite || invite.email !== email || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) {
        const error = new Error("This invitation is invalid, expired, or already used."); error.status = 410; throw error;
      }
      if (await tx.user.findUnique({ where: { email } })) {
        const error = new Error("An account already exists for this email."); error.status = 409; throw error;
      }
      const user = await tx.user.create({
        data: { name, email, passwordHash, phone: phone || null, address: address || null, role: "instructor", instructorProfile: { create: { phone: phone || null } } },
      });
      await tx.instructorInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    });
    res.status(201).json({ user: result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: "Could not accept instructor invitation" });
  }
});

module.exports = router;
