const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { requireAuth, requireRole } = require("../middleware/auth");

const prisma = new PrismaClient();
const router = express.Router();
const SETTINGS_ID = "school";
const PHONE_RE = /^(?:0[789]\d{9}|\+234[789]\d{9})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOCIAL_FIELDS = ["instagram", "facebook", "x", "tiktok", "youtube"];

const cleanPhone = (value) => String(value || "").replace(/[\s()-]/g, "");
const blankSettings = () => ({
  id: SETTINGS_ID,
  address: "",
  phone: "",
  whatsappNumber: "",
  email: "",
  instagram: null,
  facebook: null,
  x: null,
  tiktok: null,
  youtube: null,
  updatedAt: null,
});

async function readSettings() {
  const rows = await prisma.$queryRaw`
    SELECT "id", "address", "phone", "whatsappNumber", "email",
      "instagram", "facebook", "x", "tiktok", "youtube", "updatedAt"
    FROM "SchoolSettings" WHERE "id" = ${SETTINGS_ID} LIMIT 1
  `;
  return rows[0] || null;
}

function validateSettings(body) {
  const address = String(body.address || "").trim();
  const phone = cleanPhone(body.phone);
  const whatsappNumber = cleanPhone(body.whatsappNumber);
  const email = String(body.email || "").trim().toLowerCase();
  if (address.length < 5 || address.length > 300) return { error: "Enter a school address (5–300 characters)." };
  if (!PHONE_RE.test(phone)) return { error: "Enter a Nigerian phone number, such as 08012345678 or +2348012345678." };
  if (!PHONE_RE.test(whatsappNumber)) return { error: "Enter a valid Nigerian WhatsApp number." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid school email address." };

  const data = { address, phone, whatsappNumber, email };
  for (const field of SOCIAL_FIELDS) {
    const value = body[field] == null ? "" : String(body[field]).trim();
    if (value.length > 200) return { error: `${field} must be 200 characters or fewer.` };
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value))
      return { error: `${field} must be a handle or an http(s) profile URL.` };
    data[field] = value || null;
  }
  return { data };
}

// Public contact details shared by the site footer and Contact page.
router.get("/school-settings", async (_req, res) => {
  try {
    res.json({ settings: await readSettings() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load school contact details" });
  }
});

router.get("/admin/school-settings", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    res.json({ settings: (await readSettings()) || blankSettings() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load school settings" });
  }
});

router.patch("/admin/school-settings", requireAuth, requireRole("admin"), async (req, res) => {
  const validated = validateSettings(req.body || {});
  if (validated.error) return res.status(400).json({ error: validated.error });
  const { address, phone, whatsappNumber, email, instagram, facebook, x, tiktok, youtube } = validated.data;
  const updatedAt = new Date();
  try {
    await prisma.$executeRaw`
      INSERT INTO "SchoolSettings"
        ("id", "address", "phone", "whatsappNumber", "email", "instagram", "facebook", "x", "tiktok", "youtube", "updatedAt")
      VALUES
        (${SETTINGS_ID}, ${address}, ${phone}, ${whatsappNumber}, ${email}, ${instagram}, ${facebook}, ${x}, ${tiktok}, ${youtube}, ${updatedAt})
      ON CONFLICT ("id") DO UPDATE SET
        "address" = excluded."address",
        "phone" = excluded."phone",
        "whatsappNumber" = excluded."whatsappNumber",
        "email" = excluded."email",
        "instagram" = excluded."instagram",
        "facebook" = excluded."facebook",
        "x" = excluded."x",
        "tiktok" = excluded."tiktok",
        "youtube" = excluded."youtube",
        "updatedAt" = excluded."updatedAt"
    `;
    res.json({ settings: await readSettings() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save school settings" });
  }
});

module.exports = router;
