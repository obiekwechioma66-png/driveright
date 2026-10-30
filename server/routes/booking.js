// Booking engine. Lagos = UTC+1 (no DST). Lessons are a fixed 60 minutes,
// stored in UTC (AGENTS rule 6). Double-booking is prevented HERE ONLY,
// as one transaction with the four agreed checks (AGENTS rule 1).
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { requireAuth, requireRole } = require("../middleware/auth");
const { computeProgress } = require("../lib/progress");

const router = express.Router();
const LESSON_MIN = 60;
const LAGOS_MS = 60 * 60 * 1000; // UTC+1
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");

// ONE slot start must align to a clean minute; browsers send ISO strings.
const hhmm = (s) => s.split(":").reduce((m, p) => m * 60 + Number(p), 0);

// UTC instant -> Lagos wall clock { weekday, hh, mm }
function lagosWall(utcDate) {
  const wall = new Date(utcDate.getTime() + LAGOS_MS);
  return { weekday: wall.getUTCDay(), hh: wall.getUTCHours(), mm: wall.getUTCMinutes() };
}

// ---- GET /api/instructors — booking picker ---------------------------------
router.get("/instructors", requireAuth, async (req, res) => {
  try {
    const rows = await prisma.instructor.findMany({ include: { user: { select: { name: true } } } });
    res.json({ instructors: rows.map((r) => ({ id: r.id, name: r.user.name, bio: r.bio })) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load instructors" });
  }
});

// ---- GET /api/instructors/:id/availability?date=YYYY-MM-DD -----------------
// Free 60-min slots only: inside weekly availability, not taken by any
// booked/completed lesson, not in the past, and not clashing with the signed-in
// learner's OWN lessons (they never see a slot they couldn't book).
router.get("/instructors/:id/availability", requireAuth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!DATE_RE.test(String(date || ""))) return res.status(400).json({ error: "Send ?date=YYYY-MM-DD" });

    const instructor = await prisma.instructor.findUnique({
      where: { id: req.params.id },
      include: { availability: true },
    });
    if (!instructor) return res.status(404).json({ error: "Instructor not found" });

    const wall = lagosWall(new Date(`${date}T12:00:00+01:00`)); // midday probe = safe weekday
    const rows = instructor.availability.filter((a) => a.weekday === wall.weekday);

    const dayStartUTC = new Date(`${date}T00:00:00+01:00`).getTime() - 2 * LESSON_MIN * 60000;
    const dayEndUTC = new Date(`${date}T00:00:00+01:00`).getTime() + 26 * 60 * 60000;
    const booked = await prisma.lesson.findMany({
      where: {
        status: { not: "cancelled" },
        startsAt: { gte: new Date(dayStartUTC), lt: new Date(dayEndUTC) },
        OR: [
          { instructorId: instructor.id },
          ...(req.user.role === "learner" ? [{ learner: { userId: req.user.id } }] : []),
        ],
      },
      select: { startsAt: true },
    });
    const bookedBy = new Set(booked.map((l) => l.startsAt.getTime()));

    const now = Date.now();
    const slots = [];
    for (const a of rows) {
      for (let t = hhmm(a.startTime); t + LESSON_MIN <= hhmm(a.endTime); t += LESSON_MIN) {
        const startsAt = new Date(`${date}T${pad(Math.floor(t / 60))}:${pad(t % 60)}:00+01:00`);
        if (startsAt.getTime() <= now) continue;
        if (bookedBy.has(startsAt.getTime())) continue;
        const w = lagosWall(startsAt);
        slots.push({ startsAtUTC: startsAt.toISOString(), lagos: `${pad(w.hh)}:${pad(w.mm)}` });
      }
    }
    slots.sort((x, y) => x.startsAtUTC.localeCompare(y.startsAtUTC));
    res.json({ date, weekday: wall.weekday, slots });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load availability" });
  }
});

// ---- POST /api/lessons — the booking itself (learners) ---------------------
router.post("/lessons", requireAuth, async (req, res) => {
  const { instructorId, startsAtUTC } = req.body || {};
  try {
    const startsAt = new Date(String(startsAtUTC || ""));
    if (!startsAt.getTime())
      return res.status(400).json({ error: "Send a slot start time (UTC instant) from the availability list" });
    if (!instructorId) return res.status(400).json({ error: "Choose an instructor" });

    const learner = await prisma.learner.findUnique({ where: { userId: req.user.id } });
    if (!learner) return res.status(404).json({ error: "Learner profile missing" });

    const instructor = await prisma.instructor.findUnique({ where: { id: String(instructorId) } });
    if (!instructor) return res.status(404).json({ error: "Instructor not found" });

    const lessonEnd = new Date(startsAt.getTime() + LESSON_MIN * 60000);
    const isAdmin = req.user.role === "admin";
    const warnings = [];

    // THE transaction: all four checks + create + credit move, atomically.
    const result = await prisma.$transaction(async (tx) => {
      // check 1 — instructor not busy (overlap = |Δstart| < 60 min)
      const instructorClash = await tx.lesson.findFirst({
        where: {
          instructorId: instructor.id,
          status: { not: "cancelled" },
          startsAt: { gte: new Date(startsAt.getTime() - LESSON_MIN * 60000 + 1), lt: lessonEnd },
        },
      });
      if (instructorClash) {
        const err = new Error("That slot was just taken for this instructor — pick another.");
        err.status = 409;
        throw err;
      }

      // check 2 — this learner not busy with ANY instructor
      const learnerClash = await tx.lesson.findFirst({
        where: {
          learnerId: learner.id,
          status: { not: "cancelled" },
          startsAt: { gte: new Date(startsAt.getTime() - LESSON_MIN * 60000 + 1), lt: lessonEnd },
        },
      });
      if (learnerClash) {
        const err = new Error("You already have a lesson too close to that time.");
        err.status = 409;
        throw err;
      }

      // check 3 — inside the instructor's weekly availability (admin may override)
      let availabilityRows = null;
      if (!isAdmin) {
        availabilityRows = await tx.availability.findMany({ where: { instructorId: instructor.id } });
        if (!instructorAvailContains(availabilityRows, lagosWall(startsAt))) {
          const err = new Error("That time is outside this instructor's bookable hours.");
          err.status = 422;
          throw err;
        }
      } else {
        warnings.push("Admin booking — availability/credit checks overridden if needed.");
      }

      // check 4 — active purchase with remaining credit (admin may override)
      let purchaseUsed = null;
      const candidates = await tx.packagePurchase.findMany({
        where: { learnerId: learner.id, status: "active" },
        include: { package: true },
      });
      const chosen = candidates.find((p) => p.lessonsUsed < p.lessonsTotal) || null;
      if (chosen) {
        await tx.packagePurchase.update({ where: { id: chosen.id }, data: { lessonsUsed: { increment: 1 } } });
        purchaseUsed = chosen.package.name;
      } else if (!isAdmin) {
        const err = new Error("You need an active purchase with lesson credits before booking.");
        err.status = 402;
        throw err;
      }

      const lesson = await tx.lesson.create({
        data: { learnerId: learner.id, instructorId: instructor.id, purchaseId: chosen?.id ?? null, startsAt, status: "booked" },
      });
      return { lesson, warnings, purchaseUsed };
    });

    res.status(201).json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Booking failed" });
  }
});

// ---- POST /api/lessons/:id/complete — instructor completes own lesson -----
router.post("/lessons/:id/complete", requireAuth, requireRole("instructor"), async (req, res) => {
  try {
    const instructor = await prisma.instructor.findUnique({ where: { userId: req.user.id } });
    if (!instructor) return res.status(404).json({ error: "Instructor profile missing" });

    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
    if (!lesson || lesson.instructorId !== instructor.id)
      return res.status(404).json({ error: "Lesson not found" });
    if (lesson.status === "completed") return res.json({ lesson, alreadyCompleted: true });
    if (lesson.status !== "booked")
      return res.status(409).json({ error: "Only booked lessons can be completed." });

    const now = new Date();
    const earliestCompletion = new Date(lesson.startsAt.getTime() + LESSON_MIN * 60000);
    if (now < earliestCompletion)
      return res.status(409).json({ error: "A lesson can be completed after its scheduled 60 minutes have ended." });

    const updated = await prisma.lesson.updateMany({
      where: {
        id: lesson.id,
        instructorId: instructor.id,
        status: "booked",
        startsAt: { lte: new Date(now.getTime() - LESSON_MIN * 60000) },
      },
      data: { status: "completed", completedAt: now },
    });
    if (updated.count !== 1) {
      const current = await prisma.lesson.findUnique({ where: { id: lesson.id } });
      if (current?.status === "completed") return res.json({ lesson: current, alreadyCompleted: true });
      return res.status(409).json({ error: "This lesson changed before it could be completed. Refresh and try again." });
    }

    const completed = await prisma.lesson.findUnique({ where: { id: lesson.id } });
    res.json({ lesson: completed, alreadyCompleted: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not complete lesson" });
  }
});

// ---- POST /api/lessons/:id/ratings — record this lesson's skill history ---
router.post("/lessons/:id/ratings", requireAuth, requireRole("instructor"), async (req, res) => {
  try {
    const instructor = await prisma.instructor.findUnique({ where: { userId: req.user.id } });
    if (!instructor) return res.status(404).json({ error: "Instructor profile missing" });

    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id } });
    if (!lesson || lesson.instructorId !== instructor.id)
      return res.status(404).json({ error: "Lesson not found" });
    if (lesson.status !== "completed")
      return res.status(409).json({ error: "Complete the lesson before rating skills." });

    const ratings = req.body?.ratings;
    if (!Array.isArray(ratings) || ratings.length === 0)
      return res.status(400).json({ error: "Send a rating for every skill in the learner’s current stage." });

    const [learner, skills, history] = await Promise.all([
      prisma.learner.findUnique({ where: { id: lesson.learnerId } }),
      prisma.skill.findMany({ orderBy: { displayOrder: "asc" } }),
      prisma.lesson.findMany({
        where: { learnerId: lesson.learnerId, status: "completed" },
        include: { ratings: { select: { skillId: true, rating: true, note: true } } },
        orderBy: { startsAt: "desc" },
      }),
    ]);
    const progress = computeProgress(skills, history, learner.achievedTestReady);
    if (!progress.activeStage)
      return res.status(409).json({ error: "All Parking and Highway skills are Confident. Use the Test-ready sign-off." });

    const stageSkills = skills.filter((skill) => skill.stage === progress.activeStage);
    const expectedIds = new Set(stageSkills.map((skill) => skill.id));
    const seenIds = new Set();
    const normalized = [];
    for (const entry of ratings) {
      const skillId = String(entry?.skillId || "");
      const rating = String(entry?.rating || "");
      const note = entry?.note == null ? null : String(entry.note).trim();
      if (!expectedIds.has(skillId) || seenIds.has(skillId))
        return res.status(400).json({ error: "Only skills in the learner’s current stage can be rated." });
      if (!["not_yet", "improving", "confident"].includes(rating))
        return res.status(400).json({ error: "Choose Not yet, Improving or Confident for each skill." });
      if (note && note.length > 500)
        return res.status(400).json({ error: "Skill notes must be 500 characters or fewer." });
      seenIds.add(skillId);
      normalized.push({ skillId, rating, note: note || null });
    }
    if (seenIds.size !== expectedIds.size)
      return res.status(400).json({ error: "Rate every skill in the learner’s current stage." });

    await prisma.$transaction(normalized.map((entry) => prisma.lessonRating.upsert({
      where: { lessonId_skillId: { lessonId: lesson.id, skillId: entry.skillId } },
      create: { lessonId: lesson.id, skillId: entry.skillId, rating: entry.rating, note: entry.note },
      update: { rating: entry.rating, note: entry.note },
    })));

    const refreshedHistory = await prisma.lesson.findMany({
      where: { learnerId: lesson.learnerId, status: "completed" },
      include: { ratings: { select: { skillId: true, rating: true, note: true } } },
      orderBy: { startsAt: "desc" },
    });
    const updatedProgress = computeProgress(skills, refreshedHistory, learner.achievedTestReady);
    if (learner.achievedTestReady && !updatedProgress.readyEligible) {
      await prisma.learner.update({ where: { id: learner.id }, data: { achievedTestReady: false } });
    }
    res.json({ progress: updatedProgress, ratedStage: progress.activeStage });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not save skill ratings" });
  }
});

// ---- POST /api/learners/:id/test-ready — gated instructor sign-off ---------
router.post("/learners/:learnerId/test-ready", requireAuth, requireRole("instructor"), async (req, res) => {
  try {
    const instructor = await prisma.instructor.findUnique({ where: { userId: req.user.id } });
    if (!instructor) return res.status(404).json({ error: "Instructor profile missing" });
    const learner = await prisma.learner.findUnique({ where: { id: req.params.learnerId } });
    if (!learner) return res.status(404).json({ error: "Learner not found" });

    if (learner.instructorId !== instructor.id) {
      const taught = await prisma.lesson.findFirst({
        where: { learnerId: learner.id, instructorId: instructor.id },
        select: { id: true },
      });
      if (!taught) return res.status(404).json({ error: "Learner not found" });
    }

    const [skills, history] = await Promise.all([
      prisma.skill.findMany({ orderBy: { displayOrder: "asc" } }),
      prisma.lesson.findMany({
        where: { learnerId: learner.id, status: "completed" },
        include: { ratings: { select: { skillId: true, rating: true, note: true } } },
        orderBy: { startsAt: "desc" },
      }),
    ]);
    const progress = computeProgress(skills, history, learner.achievedTestReady);
    if (!progress.readyEligible)
      return res.status(409).json({ error: "Every Parking and Highway skill must be Confident before Test-ready sign-off." });
    if (learner.achievedTestReady) return res.json({ testReady: true, alreadyMarked: true });

    await prisma.learner.update({ where: { id: learner.id }, data: { achievedTestReady: true } });
    res.json({ testReady: true, alreadyMarked: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not mark learner Test-ready" });
  }
});

// does any availability row cover this Lagos wall time, 60 full minutes?
function instructorAvailContains(rows, wall) {
  const startMin = wall.hh * 60 + wall.mm;
  return rows.some(
    (a) => a.weekday === wall.weekday && hhmm(a.startTime) <= startMin && startMin + LESSON_MIN <= hhmm(a.endTime)
  );
}

module.exports = router;
