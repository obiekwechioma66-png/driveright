const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const RESEND_API = "https://api.resend.com/emails";
const POLL_MS = 60_000;
const DUE_WINDOW_MS = 5 * 60_000;
const LOCK_STALE_MS = 5 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function formatLessonTime(startsAt) {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(startsAt);
}

async function sendReminderEmail(lesson) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be configured");

  const learnerName = lesson.learner.user.name;
  const instructorName = lesson.instructor.user.name;
  const instructorEmail = lesson.instructor.user.email;
  const lessonTime = formatLessonTime(lesson.startsAt);
  const subject = `Lesson reminder: ${lessonTime}`;
  const text = [
    `Hello ${learnerName},`,
    "",
    "This is your reminder that you have a driving lesson in about 24 hours.",
    `Date and time: ${lessonTime}`,
    `Instructor: ${instructorName}`,
    "",
    "DriveRight Driving School",
  ].join("\n");
  const html = `<p>Hello ${escapeHtml(learnerName)},</p>
<p>This is your reminder that you have a driving lesson in about 24 hours.</p>
<p><strong>Date and time:</strong> ${escapeHtml(lessonTime)}<br>
<strong>Instructor:</strong> ${escapeHtml(instructorName)}</p>
<p>DriveRight Driving School</p>`;

  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // Retries and duplicate worker instances share the same provider key.
      "Idempotency-Key": `lesson-reminder/${lesson.id}`,
    },
    body: JSON.stringify({
      from,
      to: lesson.learner.user.email,
      bcc: instructorEmail,
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.id)
    throw new Error(`Resend rejected lesson reminder (${response.status}): ${payload?.message || "unknown error"}`);
  return payload.id;
}

async function deliverLessonReminder(lessonId, now = new Date()) {
  const staleBefore = new Date(now.getTime() - LOCK_STALE_MS);
  const claimed = await prisma.$executeRaw`
    UPDATE "Lesson" SET "reminderClaimedAt" = ${now}
    WHERE "id" = ${lessonId}
      AND "status" = 'booked'
      AND "reminderSentAt" IS NULL
      AND ("reminderClaimedAt" IS NULL OR "reminderClaimedAt" < ${staleBefore})
  `;
  if (claimed !== 1) return false;

  try {
    const currentLesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        learner: { include: { user: { select: { name: true, email: true } } } },
        instructor: { include: { user: { select: { name: true, email: true } } } },
      },
    });
    if (!currentLesson || currentLesson.status !== "booked") {
      await prisma.$executeRaw`UPDATE "Lesson" SET "reminderClaimedAt" = NULL WHERE "id" = ${lessonId} AND "reminderSentAt" IS NULL`;
      return false;
    }
    const emailId = await sendReminderEmail(currentLesson);
    await prisma.$executeRaw`
      UPDATE "Lesson"
      SET "reminderSentAt" = ${new Date()}, "reminderEmailId" = ${emailId}
      WHERE "id" = ${lessonId} AND "status" = 'booked' AND "reminderSentAt" IS NULL
    `;
    console.log(`Lesson reminder sent for lesson ${lessonId}`);
    return true;
  } catch (error) {
    await prisma.$executeRaw`UPDATE "Lesson" SET "reminderClaimedAt" = NULL WHERE "id" = ${lessonId} AND "reminderSentAt" IS NULL`;
    console.error(`Lesson reminder failed for lesson ${lessonId}: ${error.message}`);
    return false;
  }
}

async function runReminderSweep(now = new Date()) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return 0;

  // The job polls once a minute and only processes reminders due in the last
  // five minutes, so a lesson is never emailed early and short restarts recover.
  const dueAfter = new Date(now.getTime() + DAY_MS - DUE_WINDOW_MS);
  const dueAt = new Date(now.getTime() + DAY_MS);
  const lessons = await prisma.$queryRaw`
    SELECT "id" FROM "Lesson"
    WHERE "status" = 'booked'
      AND "reminderSentAt" IS NULL
      AND "startsAt" > ${dueAfter}
      AND "startsAt" <= ${dueAt}
    ORDER BY "startsAt" ASC
    LIMIT 100
  `;

  let delivered = 0;
  for (const lesson of lessons)
    if (await deliverLessonReminder(lesson.id, now)) delivered += 1;
  return delivered;
}

function startLessonReminderJob() {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    console.warn("Lesson reminder job is idle; configure RESEND_API_KEY and RESEND_FROM_EMAIL to enable it.");
    return null;
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runReminderSweep();
    } catch (error) {
      console.error(`Lesson reminder sweep failed: ${error.message}`);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(tick, POLL_MS);
  timer.unref?.();
  return timer;
}

module.exports = { startLessonReminderJob, runReminderSweep };
