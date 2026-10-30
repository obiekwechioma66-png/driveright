// Smoke tests: instructor dashboard buckets (today/this week) + lesson completion.
// Fixtures are created directly via Prisma and cleaned up afterwards.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();
const BASE = "http://localhost:4000/api";
const LAGOS_MS = 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
const lagosDayStartUTC = (daysBack = 0) => {
  const wall = new Date(Date.now() + LAGOS_MS);
  return new Date(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() - daysBack) - LAGOS_MS);
};

async function call(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

let createdUserIds = [];
const mkUser = async (name, role) => {
  const suffix = Date.now() + Math.floor(Math.random() * 1e6);
  const user = await prisma.user.create({
    data: { name, email: `${name.toLowerCase().replace(/\s/g, "")}${suffix}@test.local`, role, passwordHash: await bcrypt.hash("password123", 10) },
  });
  createdUserIds.push(user.id);
  return user;
};
const login = async (user) => {
  const r = await call("/auth/login", { method: "POST", body: { email: user.email, password: "password123" } });
  return r.json.token;
};

async function cleanup() {
  const ids = createdUserIds;
  createdUserIds = [];
  if (!ids.length) return;
  await prisma.lessonRating.deleteMany({ where: { lesson: { OR: [{ learner: { userId: { in: ids } } }, { instructor: { userId: { in: ids } } }] } } });
  await prisma.lesson.deleteMany({ where: { OR: [{ learner: { userId: { in: ids } } }, { instructor: { userId: { in: ids } } }] } });
  await prisma.packagePurchase.deleteMany({ where: { learner: { userId: { in: ids } } } });
  await prisma.learner.deleteMany({ where: { userId: { in: ids } } });
  await prisma.instructor.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

(async () => {
  try {
    // ---- fixtures ----------------------------------------------------------
    const inst1U = await mkUser("Fixture Inst One", "instructor");
    const inst2U = await mkUser("Fixture Inst Two", "instructor");
    const inst1 = await prisma.instructor.update({ where: { userId: inst1U.id }, data: {} }).catch(() =>
      prisma.instructor.create({ data: { userId: inst1U.id } }));
    const inst2 = await prisma.instructor.create({ data: { userId: inst2U.id } });
    const inst1b = await prisma.instructor.findUnique({ where: { userId: inst1U.id } });

    const learnerU = await mkUser("Fixture Learner", "learner");
    const learner = await prisma.learner.create({ data: { userId: learnerU.id, instructorId: inst1b.id } });

    // Three lessons: one finished this morning (TODAY bucket, completable), one
    // ~tomorrow mid-morning (this week), one cancelled (filtered by status).
    const dayStart = lagosDayStartUTC(0).getTime();
    const looksLikeSunday = new Date(Date.now() + LAGOS_MS).getUTCDay() === 0;
    const pastToday = await prisma.lesson.create({
      data: { learnerId: learner.id, instructorId: inst1.id, startsAt: new Date(dayStart + 5 * HOUR_MS), status: "booked" },
    });
    const future = await prisma.lesson.create({
      data: { learnerId: learner.id, instructorId: inst1.id, startsAt: new Date(dayStart + 36 * HOUR_MS), status: "booked" },
    });
    const cancelled = await prisma.lesson.create({
      data: { learnerId: learner.id, instructorId: inst1.id, startsAt: new Date(dayStart - 2 * HOUR_MS), status: "cancelled" },
    });

    const instToken = await login(inst1U);

    // ---- 1. dashboard buckets ----------------------------------------------
    const dash = await call("/instructor/dashboard", { token: instToken });
    const todayIds = (dash.json?.todayLessons || []).map((l) => l.id);
    const weekIds = (dash.json?.weekLessons || []).map((l) => l.id);
    check("finished-today lesson appears in todayLessons", dash.status === 200 && todayIds.includes(pastToday.id));
    // On a Sunday the week window (Mon–Sun) has already ended, so expect nothing there.
    if (looksLikeSunday) {
      check("Sunday: lesson not in today bucket, week is empty", !todayIds.includes(future.id) && weekIds.length === 0, `weekLessons=${weekIds.length}`);
    } else {
      check("tomorrow's lesson appears in weekLessons", weekIds.includes(future.id));
    }
    check("cancelled lesson not listed", !todayIds.includes(cancelled.id) && !weekIds.includes(cancelled.id));
    check("today bucket includes learner name + status", (dash.json.todayLessons.find((l) => l.id === pastToday.id) || {}).learner === learnerU.name);

    // ---- 2. completion ------------------------------------------------------
    const done = await call(`/lessons/${pastToday.id}/complete`, { method: "POST", token: instToken });
    check("instructor completes finished lesson", done.status === 200 && done.json?.lesson?.status === "completed" && !!done.json?.lesson?.completedAt);

    // ---- 3. idempotent ------------------------------------------------------
    const secondTime = await call(`/lessons/${pastToday.id}/complete`, { method: "POST", token: instToken });
    check("re-complete is a no-op (alreadyCompleted)", secondTime.status === 200 && secondTime.json?.alreadyCompleted === true);

    // ---- 4. guards ----------------------------------------------------------
    const notMine = await call(`/lessons/${pastToday.id}/complete`, { method: "POST", token: await login(inst2U) });
    check("another instructor cannot complete (404 masked)", notMine.status === 404, notMine.json?.error);

    const asLearner = await call(`/lessons/${pastToday.id}/complete`, { method: "POST", token: await login(learnerU) });
    check("learner cannot complete (403)", asLearner.status === 403);

    const tooSoon = await call(`/lessons/${future.id}/complete`, { method: "POST", token: instToken });
    check("lesson that has not ended -> 409", tooSoon.status === 409, tooSoon.json?.error);

    const cancelledTry = await call(`/lessons/${cancelled.id}/complete`, { method: "POST", token: instToken });
    check("cancelled lesson -> 409", cancelledTry.status === 409, cancelledTry.json?.error);

    // ---- 5. completed shows in today list after completing ------------------
    const dashAfter = await call("/instructor/dashboard", { token: instToken });
    const completedOnDash = (dashAfter.json?.todayLessons || []).find((l) => l.id === pastToday.id);
    check("lesson now shows Completed in today's list", completedOnDash?.status === "completed" && !!completedOnDash?.completedAtUTC);

    // ---- 6. unknown id ------------------------------------------------------
    const missing = await call("/lessons/nonexistent-id/complete", { method: "POST", token: instToken });
    check("unknown lesson id -> 404", missing.status === 404);

    console.log(results.join("\n"));
    console.log(results.some((r) => r.startsWith("FAIL")) ? "\n>>> SOME CHECKS FAILED" : "\n>>> ALL CHECKS PASSED");
  } catch (e) {
    console.error("CRASH", e);
  } finally {
    await cleanup();
    console.log("(fixtures cleaned up)");
    await prisma.$disconnect();
  }
})();
