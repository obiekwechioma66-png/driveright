const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const PORT = process.env.PORT || 4000;
const { startLessonReminderJob } = require("./services/lessonReminders");

const app = express();
const allowedOrigins = String(process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origin && !allowedOrigins.includes(origin) ? 403 : 204);
  next();
});
// Keep the raw body: Paystack's webhook signature is computed over the raw bytes.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// ---- routes --------------------------------------------------------------
app.use("/api/auth", require("./routes/auth"));
app.use("/api", require("./routes/dashboard"));
app.use("/api/packages", require("./routes/packages"));
app.use("/api/purchases", require("./routes/purchases"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api", require("./routes/schoolSettings"));
app.use("/api", require("./routes/profile"));
app.use("/api", require("./routes/booking"));

// ---- health -------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "driveright-api", time: new Date().toISOString() });
});

// ---- 404 ----------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`DriveRight API listening on http://localhost:${PORT}`);
  startLessonReminderJob();
});
