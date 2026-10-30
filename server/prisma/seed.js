// DriveRight sample data. Safe to re-run: clears then inserts the same set.
// Run with: npx prisma db seed  (see "prisma" block in package.json)
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const seedSchoolSettings = require("./seed-settings");

const prisma = new PrismaClient();

// Lagos is UTC+1: a 10:00 Lagos lesson is 09:00 UTC (rule 6: store UTC).
const lagosLesson = (dayOffset, hourUTC) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d;
};

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  // Wipe in FK-safe order
  await prisma.lessonRating.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.packagePurchase.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.package.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.skill.deleteMany();
  await prisma.learner.deleteMany();
  await prisma.instructor.deleteMany();
  await prisma.user.deleteMany();

  // ---- people -----------------------------------------------------------
  const [{ id: adminUserId }, { id: chikeUserId }, { id: tundeUserId }] = await Promise.all(
    [
      ["Amaka Eze", "admin@driveright.ng", "admin"],
      ["Chike Okafor", "chike@driveright.ng", "instructor"],
      ["Tunde Bello", "tunde@example.com", "learner"],
    ].map(([name, email, role]) =>
      prisma.user.create({ data: { name, email, role, passwordHash } })
    )
  );

  const instructor = await prisma.instructor.create({
    data: {
      userId: chikeUserId,
      phone: "+2348020001111",
      bio: "8 years coaching Lagos learners — patient, structured, test-day calm.",
      availability: {
        create: [
          // No availability on Sunday (weekday 0)
          { weekday: 1, startTime: "08:00", endTime: "16:00" }, // Mon
          { weekday: 3, startTime: "08:00", endTime: "16:00" }, // Wed
          { weekday: 5, startTime: "08:00", endTime: "16:00" }, // Fri
          { weekday: 6, startTime: "09:00", endTime: "13:00" }, // Sat
        ],
      },
    },
  });

  const learner = await prisma.learner.create({
    data: {
      userId: tundeUserId,
      instructorId: instructor.id,
      dateOfBirth: new Date("2004-03-14"),
      address: "12 Adeola Odeku St, Victoria Island, Lagos",
    },
  });

  // ---- skills (progress tracker; stages strictly sequential) -------------
  const skill = async (stage, name, displayOrder) =>
    prisma.skill.create({ data: { stage, name, displayOrder } });
  await Promise.all([
    skill("parking", "Mirror discipline", 1),
    skill("parking", "Clutch & brake control", 2),
    skill("parking", "Reversing", 3),
    skill("parking", "Hill starts", 4),
    skill("parking", "Bay parking", 5),
    skill("parking", "Parallel parking", 6),
    skill("highway", "Lane discipline", 7),
    skill("highway", "Overtaking", 8),
    skill("highway", "Roundabouts", 9),
    skill("highway", "Night driving", 10),
  ]);

  // ---- packages (prices in kobo) ----------------------------------------
  const [{ id: basicsId }, { id: standardId }, { id: testPrepId }] = await Promise.all(
    [
      ["Basics", "First lessons on quiet roads. 60-minute lessons, one instructor.", 8_000_000, 6],
      ["Standard", "Full course: Parking then Highway stage. Priority evening & weekend slots.", 15_000_000, 12],
      ["Test-prep", "Mock tests, examiner-route practice, test-day confidence coaching.", 9_000_000, 6],
    ].map(([name, description, priceKobo, lessonCount]) =>
      prisma.package.create({ data: { name, description, priceKobo, lessonCount } })
    )
  );

  // ---- purchase + payments (balance owed = price − Σ successful payments) -
  const purchase = await prisma.packagePurchase.create({
    data: {
      learnerId: learner.id,
      packageId: standardId,
      lessonsTotal: 12,
      status: "active",
      paidAt: new Date(),
    },
  });
  // ₦150,000 price: ₦100,000 paid, ₦50,000 pending transfer → balance owed ₦50,000
  await prisma.payment.create({
    data: {
      purchaseId: purchase.id,
      learnerId: learner.id,
      amountKobo: 10_000_000,
      method: "card",
      reference: "PS-SEED-0001",
      status: "success",
    },
  });
  await prisma.payment.create({
    data: {
      purchaseId: purchase.id,
      learnerId: learner.id,
      amountKobo: 5_000_000,
      method: "transfer",
      reference: "PS-SEED-0002",
      status: "pending",
    },
  });

  // ---- lessons + progress ratings ---------------------------------------
  // Completed lesson 5 days ago: 3 of 6 Parking skills rated (history per lesson)
  const done = await prisma.lesson.create({
    data: {
      learnerId: learner.id,
      instructorId: instructor.id,
      purchaseId: purchase.id,
      startsAt: lagosLesson(-5, 9),
      status: "completed",
      completedAt: lagosLesson(-5, 10),
      instructorNote: "Good first session — mirror checks are already a habit.",
      ratings: {
        create: [
          { skillId: (await prisma.skill.findFirst({ where: { name: "Mirror discipline" } })).id, rating: "confident", note: "Checks without prompting." },
          { skillId: (await prisma.skill.findFirst({ where: { name: "Clutch & brake control" } })).id, rating: "improving", note: "Smooth starts, brakes a bit late." },
          { skillId: (await prisma.skill.findFirst({ where: { name: "Reversing" } })).id, rating: "not_yet" },
        ],
      },
    },
  });

  // Booked lesson: Saturday in 3 days, 10:00 Lagos (inside Sat 09:00–13:00 availability)
  await prisma.lesson.create({
    data: {
      learnerId: learner.id,
      instructorId: instructor.id,
      purchaseId: purchase.id,
      startsAt: lagosLesson(3, 9),
      status: "booked",
    },
  });

  await seedSchoolSettings(prisma);
}

main()
  .then(async () => {
    console.log("Seed complete ✔");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
