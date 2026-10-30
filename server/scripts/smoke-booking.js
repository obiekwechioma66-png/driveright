// Booking engine tests — clash cases first-class citizens (AGENTS rule 1).
// Creates its own isolated instructors/learners, then cleans up after itself.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();
const BASE = process.env.DRIVERIGHT_API_BASE || "http://localhost:4000/api";

const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

async function call(path, { method = "GET", token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// UTC+1 helper: a Lagos wall time on dateStr -> UTC Date
const T = (dateStr, hhmm) => new Date(`${dateStr}T${hhmm}:00+01:00`);
const addDays = (n) => {
  const d = new Date(Date.now() + n * 86400000);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

let createdUserIds = [];
const NAMES = { A: "Booker A", B: "Booker B", C: "Booker C", D: "Booker D" };

async function makeTestUser(name, role) {
  const suffix = Date.now() + Math.floor(Math.random() * 1e6);
  const user = await prisma.user.create({
    data: {
      name, email: `${name.toLowerCase().replace(/\s/g, "")}${suffix}@test.local`,
      role, passwordHash: await bcrypt.hash("password123", 10),
      ...(role === "learner" ? { learnerProfile: { create: {} } } : {}),
      ...(role === "instructor" ? { instructorProfile: { create: {} } } : {}),
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeTestInstructor(name, weekday) {
  const user = await makeTestUser(name, "instructor");
  return prisma.instructor.update({
    where: { userId: user.id },
    data: { availability: { create: { weekday, startTime: "06:00", endTime: "20:00" } } },
  });
}

async function login(user) {
  const found = user.id ? user : await prisma.user.findUnique({ where: { id: user.userId } });
  const r = await call("/auth/login", { method: "POST", body: { email: found.email, password: "password123" } });
  return r.json.token;
}

async function cleanup() {
  const userIds = createdUserIds;
  createdUserIds = [];
  if (!userIds.length) return;
  await prisma.lesson.deleteMany({ where: { OR: [{ learner: { userId: { in: userIds } } }, { instructor: { userId: { in: userIds } } }] } });
  await prisma.packagePurchase.deleteMany({ where: { learner: { userId: { in: userIds } } } });
  await prisma.payment.deleteMany({ where: { learner: { userId: { in: userIds } } } });
  await prisma.availability.deleteMany({ where: { instructor: { userId: { in: userIds } } } });
  await prisma.learner.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.instructor.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

(async () => {
  try {
    const date = addDays(14);          // booking day, far enough to be future
    const otherDate = addDays(15);     // weekday differs from `date` by construction
    const weekday = new Date(T(date, "12:00")).getUTCDay();

    // ---- fixtures ---------------------------------------------------------
    const inst1 = await makeTestInstructor("Test Instructor One", weekday);
    const inst2 = await makeTestInstructor("Test Instructor Two", weekday);
    const standard = await prisma.package.findFirst({ where: { name: "Standard" } });

    const mkLearner = async (name, withCredits) => {
      const user = await makeTestUser(name, "learner");
      if (withCredits)
        await prisma.packagePurchase.create({
          data: { learnerId: (await prisma.learner.findUnique({ where: { userId: user.id } })).id,
                  packageId: standard.id, lessonsTotal: 12, status: "active" },
        });
      const learner = await prisma.learner.findUnique({ where: { userId: user.id } });
      return { token: await login(user), learnerId: learner.id, userId: user.id };
    };
    const A = await mkLearner(NAMES.A, true);
    const B = await mkLearner(NAMES.B, true);
    const C = await mkLearner(NAMES.C, true);
    const D = await mkLearner(NAMES.D, false); // the "no credit" case

    // ---- 1. availability shows only FREE slots ----------------------------
    const av1 = await call(`/instructors/${inst1.id}/availability?date=${date}`, { token: A.token });
    const slotList = av1.json?.slots || [];
    check("availability lists slots 06:00-19:00 (14 slots)", av1.status === 200 && slotList.length === 14, `${slotList.length} slots`);
    const slot09 = slotList.find((s) => s.lagos === "09:00");
    const slot10 = slotList.find((s) => s.lagos === "10:00");
    const slot12 = slotList.find((s) => s.lagos === "12:00");
    check("slots carry UTC + Lagos labels", !!slot09 && T(date, "09:00").toISOString() === slot09.startsAtUTC);

    // ---- 2. booking works -------------------------------------------------
    const book = await call("/lessons", { method: "POST", token: A.token, body: { instructorId: inst1.id, startsAtUTC: slot09.startsAtUTC } });
    check("learner A books 09:00 with inst1", book.status === 201 && book.json?.purchaseUsed, `credited from: ${book.json?.purchaseUsed}`);

    const av2 = await call(`/instructors/${inst1.id}/availability?date=${date}`, { token: C.token });
    check("09:00 no longer offered once booked", !(av2.json?.slots || []).some((s) => s.lagos === "09:00"));

    // ---- 3. CLASH: instructor double-booked -------------------------------
    const instClash = await call("/lessons", { method: "POST", token: B.token, body: { instructorId: inst1.id, startsAtUTC: slot09.startsAtUTC } });
    check("CLASH: second learner, same instructor+slot -> 409", instClash.status === 409, instClash.json?.error);

    // same instructor, overlapping slot (|Δstart| < 60min) — also blocked
    const overlap = await call("/lessons", { method: "POST", token: B.token, body: { instructorId: inst1.id, startsAtUTC: slot10 ? T(date, "09:30").toISOString() : null } });
    check("CLASH: overlapping 09:30 start -> 409", overlap.status === 409, overlap.json?.error);

    // adjacent booking is ALLOWED (09:00-10:00 exists; 10:00-11:00 is free)
    const adjacent = await call("/lessons", { method: "POST", token: B.token, body: { instructorId: inst1.id, startsAtUTC: slot10.startsAtUTC } });
    check("adjacent slot 10:00 books fine for B", adjacent.status === 201);

    // ---- 4. CLASH: learner double-booked (across instructors) -------------
    const learnerClash = await call("/lessons", { method: "POST", token: A.token, body: { instructorId: inst2.id, startsAtUTC: slot09.startsAtUTC } });
    check("CLASH: same learner, other instructor, same time -> 409", learnerClash.status === 409, learnerClash.json?.error);

    // learner A sees their own lesson's slot hidden in availability
    const avA = await call(`/instructors/${inst2.id}/availability?date=${date}`, { token: A.token });
    check("A's own 09:00 hidden from A's availability view", !(avA.json?.slots || []).some((s) => s.lagos === "09:00"));

    // ---- 5. outside weekly availability -----------------------------------
    const outside = await call("/lessons", { method: "POST", token: C.token, body: { instructorId: inst1.id, startsAtUTC: T(otherDate, "09:00").toISOString() } });
    check("slot outside bookable hours -> 422", outside.status === 422, outside.json?.error);
    const emptyDay = await call(`/instructors/${inst1.id}/availability?date=${otherDate}`, { token: C.token });
    check("no availability rows -> zero slots offered", emptyDay.status === 200 && (emptyDay.json?.slots || []).length === 0, `${emptyDay.json?.slots?.length ?? "?"} slots`);

    // ---- 6. no active purchase with credit --------------------------------
    const noCredit = await call("/lessons", { method: "POST", token: D.token, body: { instructorId: inst1.id, startsAtUTC: slot12.startsAtUTC } });
    check("booking without credits -> 402", noCredit.status === 402, noCredit.json?.error);

    // ---- 7. credit actually decremented ------------------------------------
    const dashA = await call("/learner/dashboard", { token: A.token });
    const aPurchase = dashA.json?.purchases?.[0];
    check("A's credits dropped 12 -> 11", dashA.status === 200 && aPurchase?.creditsLeft === 11, `creditsLeft=${aPurchase?.creditsLeft}`);

    // ---- 8. cancelled lessons release slots --------------------------------
    const lessonRow = await prisma.lesson.findFirst({ where: { learnerId: A.learnerId, startsAt: T(date, "09:00") } });
    await prisma.lesson.update({ where: { id: lessonRow.id }, data: { status: "cancelled" } });
    const avAfterCancel = await call(`/instructors/${inst1.id}/availability?date=${date}`, { token: C.token });
    check("cancellation frees the slot again", (avAfterCancel.json?.slots || []).some((s) => s.lagos === "09:00"));

    console.log(results.join("\n"));
    console.log(results.some((r) => r.startsWith("FAIL")) ? "\n>>> SOME CHECKS FAILED" : "\n>>> ALL CHECKS PASSED");
  } catch (e) {
    console.error("CRASH", e);
  } finally {
    await cleanup();
    console.log("(test fixtures cleaned up)");
    await prisma.$disconnect();
  }
})();
