// JWT auth middleware. requireAuth verifies the token AND reloads the user,
// so a stale token can never carry a role the database no longer agrees with.
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Sign in required" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    prisma.user
      .findUnique({ where: { id: payload.sub } })
      .then((user) => {
        if (!user) return res.status(401).json({ error: "Account no longer exists" });
        req.user = user; // fresh role from DB, not from the token
        next();
      })
      .catch(() => res.status(500).json({ error: "Auth lookup failed" }));
  } catch {
    return res.status(401).json({ error: "Session expired — sign in again" });
  }
}

// Gate for role-specific pages/endpoints. Usage: requireRole("learner")
const requireRole = (role) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  if (req.user.role !== role)
    return res.status(403).json({ error: `This page is for ${role}s only` });
  next();
};

module.exports = { requireAuth, requireRole };
