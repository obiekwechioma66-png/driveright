// Role-gated dashboard payloads. Learning (routes) + business rules live here.
// Rule: balance owed = package price − Σ successful payments (computed, never stored).
const express = require("express");
const { Prisma, PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { requireAuth, requireRole } = require("../middleware/auth");
const { computeProgress } = require("../lib/progress");

const router = express.Router();
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

// Build UTC query bounds from Africa/Lagos wall time (UTC+1, no DST).
function lagosRange(now, daysBack, lengthDays) {
  const wall = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const wallStart = Date.UTC(
    wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - daysBack
  );
  const start = new Date(wallStart - LAGOS_OFFSET_MS);
  return { start, end: new Date(start.getTime() + lengthDays * 24 * 60 * 60 * 1000) };
}

// ---- GET /api/learner/dashboard ------------------------------------------
router.get("/learner/dashboard", requireAuth, requireRole("learner"), async (req, res) => {
  try {
    const profile = await prisma.learner.findUnique({ where: { userId: req.user.id } });
    if (!profile) return res.status(404).json({ error: "Learner profile missing" });

    const purchases = await prisma.packagePurchase.findMany({
      where: { learnerId: profile.id },
      include: { package: true, payments: true },
      orderBy: { paidAt: "desc" },
    });
    const shaped = purchases.map((p) => {
      const paid = p.payments.filter((x) => x.status === "success").reduce((s, x) => s + x.amountKobo, 0);
      return {
        id: p.id,
        status: p.status,
        packageName: p.package.name,
        priceKobo: p.package.priceKobo,
        lessonsTotal: p.lessonsTotal,
        creditsLeft: Math.max(0, p.lessonsTotal - p.lessonsUsed),
        paidKobo: paid,
        balanceOwedKobo: Math.max(0, p.package.priceKobo - paid),
      };
    });

    const nextLesson = await prisma.lesson.findFirst({
      where: { learnerId: profile.id, status: "booked", startsAt: { gte: new Date() } },
      include: { instructor: { include: { user: { select: { name: true } } } } },
      orderBy: { startsAt: "asc" },
    });

    const history = await prisma.lesson.findMany({
      where: { learnerId: profile.id, status: "completed" },
      include: { ratings: { include: { skill: true } } },
      orderBy: { startsAt: "desc" },
    });
    const skills = await prisma.skill.findMany({ orderBy: { displayOrder: "asc" } });
    const progress = computeProgress(skills, history, profile.achievedTestReady);

    res.json({
      user: { name: req.user.name },
      purchases: shaped,
      balanceOwedKobo: shaped.reduce((s, p) => s + p.balanceOwedKobo, 0),
      nextLesson: nextLesson && {
        startsAtUTC: nextLesson.startsAt,
        instructor: nextLesson.instructor.user.name,
      },
      progress,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load learner dashboard" });
  }
});

// ---- GET /api/instructor/dashboard ---------------------------------------
router.get("/instructor/dashboard", requireAuth, requireRole("instructor"), async (req, res) => {
  try {
    const profile = await prisma.instructor.findUnique({ where: { userId: req.user.id } });
    if (!profile) return res.status(404).json({ error: "Instructor profile missing" });

    const now = new Date();
    const todayRange = lagosRange(now, 0, 1);
    const lagosWeekday = new Date(now.getTime() + LAGOS_OFFSET_MS).getUTCDay();
    const weekRange = lagosRange(now, (lagosWeekday + 6) % 7, 7); // Monday through Sunday
    const lessonInclude = {
      learner: { include: { user: { select: { name: true } } } },
      ratings: { select: { skillId: true, rating: true, note: true } },
    };
    const lessonWindow = (range) => ({
      instructorId: profile.id,
      status: { in: ["booked", "completed"] },
      startsAt: { gte: range.start, lt: range.end },
    });

    const [upcoming, learners, completedCount, todayLessons, weekLessons] = await Promise.all([
      prisma.lesson.findMany({
        where: { instructorId: profile.id, status: "booked", startsAt: { gte: now } },
        include: lessonInclude,
        orderBy: { startsAt: "asc" },
        take: 10,
      }),
      prisma.learner.findMany({
        where: { instructorId: profile.id },
        include: { user: { select: { name: true, email: true } }, bookings: { where: { status: "booked" }, select: { id: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      prisma.lesson.count({ where: { instructorId: profile.id, status: "completed" } }),
      prisma.lesson.findMany({ where: lessonWindow(todayRange), include: lessonInclude, orderBy: { startsAt: "asc" } }),
      // "This week" = the REST of the week (tomorrow onward) so today's rows
      // don't appear in both tables.
      prisma.lesson.findMany({
        where: { ...lessonWindow(weekRange), startsAt: { gte: todayRange.end, lt: weekRange.end } },
        include: lessonInclude,
        orderBy: { startsAt: "asc" },
      }),
    ]);

    const skillList = await prisma.skill.findMany({ orderBy: { displayOrder: "asc" } });
    const learnerIds = [...new Set([...learners.map((l) => l.id), ...todayLessons.map((l) => l.learnerId), ...weekLessons.map((l) => l.learnerId)])];
    const profiles = learnerIds.length
      ? await prisma.learner.findMany({ where: { id: { in: learnerIds } } })
      : [];
    const progressHistory = learnerIds.length
      ? await prisma.lesson.findMany({
        where: { learnerId: { in: learnerIds }, status: "completed" },
        include: { ratings: { select: { skillId: true, rating: true, note: true } } },
        orderBy: { startsAt: "desc" },
      })
      : [];
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const historyByLearner = new Map(learnerIds.map((id) => [id, []]));
    for (const lesson of progressHistory) historyByLearner.get(lesson.learnerId)?.push(lesson);
    const progressFor = (learnerId) => computeProgress(
      skillList,
      historyByLearner.get(learnerId) || [],
      profileById.get(learnerId)?.achievedTestReady || false,
    );

    const shapeLesson = (lesson) => {
      const progress = progressFor(lesson.learnerId);
      const ratingStage = progress.activeStage;
      const ratingSkills = progress.perStage.find((stage) => stage.stage === ratingStage)?.skills || [];
      return {
        id: lesson.id,
        learnerId: lesson.learnerId,
        startsAtUTC: lesson.startsAt,
        learner: lesson.learner.user.name,
        status: lesson.status,
        completedAtUTC: lesson.completedAt,
        ratings: lesson.ratings,
        ratingStage,
        ratingSkills,
        progress,
      };
    };

    res.json({
      user: { name: req.user.name },
      todayLessons: todayLessons.map(shapeLesson),
      weekLessons: weekLessons.map(shapeLesson),
      learners: learners.map((l) => ({
        id: l.id,
        name: l.user.name,
        email: l.user.email,
        upcomingLessons: l.bookings.length,
        progress: progressFor(l.id),
      })),
      upcoming: upcoming.map((l) => ({
        startsAtUTC: l.startsAt,
        learner: l.learner.user.name,
      })),
      completedLessons: completedCount,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load instructor dashboard" });
  }
});

// ---- GET /api/admin/dashboard --------------------------------------------
router.get("/admin/dashboard", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const now = new Date();
    const [learnerRows, instructorRows, paymentRows, activePurchases, upcoming, revenueAgg, skills] = await Promise.all([
      prisma.learner.findMany({
        include: {
          user: { select: { name: true, email: true, phone: true, createdAt: true } },
          instructor: { include: { user: { select: { name: true } } } },
          purchases: { include: { package: true, payments: true }, orderBy: { paidAt: "desc" } },
        },
        orderBy: { user: { name: "asc" } },
      }),
      prisma.instructor.findMany({
        include: {
          user: { select: { name: true, email: true, phone: true, createdAt: true } },
          learners: { select: { id: true } },
          bookings: { where: { status: "booked", startsAt: { gte: now } }, select: { id: true } },
        },
        orderBy: { user: { name: "asc" } },
      }),
      prisma.payment.findMany({
        include: {
          learner: { include: { user: { select: { name: true, email: true } } } },
          purchase: { include: { package: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.packagePurchase.count({ where: { status: "active" } }),
      prisma.lesson.count({ where: { status: "booked", startsAt: { gte: now } } }),
      prisma.payment.aggregate({ where: { status: "success" }, _sum: { amountKobo: true } }),
      prisma.skill.findMany({ orderBy: { displayOrder: "asc" } }),
    ]);

    const learnerIds = learnerRows.map((learner) => learner.id);
    const contactUserIds = [...new Set([...learnerRows.map((row) => row.userId), ...instructorRows.map((row) => row.userId)])];
    const userAddresses = contactUserIds.length
      ? await prisma.$queryRaw`SELECT "id", "address" FROM "User" WHERE "id" IN (${Prisma.join(contactUserIds)})`
      : [];
    const addressByUserId = new Map(userAddresses.map((row) => [row.id, row.address]));
    const progressHistory = learnerIds.length
      ? await prisma.lesson.findMany({
        where: { learnerId: { in: learnerIds }, status: "completed" },
        include: { ratings: { select: { skillId: true, rating: true, note: true } } },
        orderBy: { startsAt: "desc" },
      })
      : [];
    const historyByLearner = new Map(learnerIds.map((id) => [id, []]));
    for (const lesson of progressHistory) historyByLearner.get(lesson.learnerId)?.push(lesson);

    const learners = learnerRows.map((learner) => {
      const purchases = learner.purchases.map((purchase) => {
        const paidKobo = purchase.payments
          .filter((payment) => payment.status === "success")
          .reduce((sum, payment) => sum + payment.amountKobo, 0);
        return {
          id: purchase.id,
          packageName: purchase.package.name,
          status: purchase.status,
          lessonsRemaining: Math.max(0, purchase.lessonsTotal - purchase.lessonsUsed),
          balanceOwedKobo: Math.max(0, purchase.package.priceKobo - paidKobo),
        };
      });
      const progress = computeProgress(skills, historyByLearner.get(learner.id) || [], learner.achievedTestReady);
      return {
        id: learner.id,
        name: learner.user.name,
        email: learner.user.email,
        phone: learner.user.phone,
        address: addressByUserId.get(learner.userId) || learner.address || "",
        instructor: learner.instructor?.user.name || null,
        purchases,
        balanceOwedKobo: purchases.reduce((sum, purchase) => sum + purchase.balanceOwedKobo, 0),
        lessonsRemaining: purchases.reduce((sum, purchase) => sum + purchase.lessonsRemaining, 0),
        testReady: progress.testReady,
        progress,
        createdAt: learner.user.createdAt,
      };
    });
    const payments = paymentRows.map((payment) => ({
      id: payment.id,
      learner: payment.learner.user.name,
      learnerEmail: payment.learner.user.email,
      packageName: payment.purchase.package.name,
      method: payment.method,
      amountKobo: payment.amountKobo,
      status: payment.status,
      reference: payment.reference,
      at: payment.createdAt,
    }));
    const instructors = instructorRows.map((instructor) => ({
      id: instructor.id,
      name: instructor.user.name,
      email: instructor.user.email,
      phone: instructor.phone || instructor.user.phone,
      address: addressByUserId.get(instructor.userId) || "",
      learners: instructor.learners.length,
      upcomingLessons: instructor.bookings.length,
    }));
    const revenue = revenueAgg._sum.amountKobo || 0;

    res.json({
      user: { name: req.user.name },
      stats: {
        learners: learners.length,
        instructors: instructors.length,
        activePurchases,
        upcomingLessons: upcoming,
        revenueAllTimeKobo: revenue,
        totalOutstandingBalanceKobo: learners.reduce((sum, learner) => sum + learner.balanceOwedKobo, 0),
        testReadyLearners: learners.filter((learner) => learner.testReady).length,
      },
      learners,
      testReadyLearners: learners.filter((learner) => learner.testReady),
      instructors,
      payments,
      recentPayments: payments.slice(0, 8),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Could not load admin dashboard" });
  }
});

module.exports = router;
