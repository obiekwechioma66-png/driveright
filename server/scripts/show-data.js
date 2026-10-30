// Prints the seeded sample data — a quick visual check of the schema + rows.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const naira = (kobo) => "NGN " + (kobo / 100).toLocaleString();

async function main() {
  const users = await p.user.findMany({ select: { name: true, email: true, role: true } });
  console.log("USERS");
  for (const u of users) console.log("  " + u.name.padEnd(15) + u.email.padEnd(25) + u.role);

  const av = await p.instructor.findFirst({ include: { user: { select: { name: true } }, availability: true } });
  console.log("\nINSTRUCTOR WEEKLY AVAILABILITY — " + av.user.name);
  for (const a of av.availability.sort((x, y) => x.weekday - y.weekday))
    console.log("  weekday " + a.weekday + " " + a.startTime + "-" + a.endTime + " (Lagos)");

  const pkgs = await p.package.findMany();
  console.log("\nPACKAGES");
  for (const k of pkgs) console.log("  " + k.name.padEnd(10) + naira(k.priceKobo).padStart(12) + "  / " + k.lessonCount + " lessons");

  const pu = await p.packagePurchase.findFirst({ include: { package: true, payments: true, learner: { include: { user: true } } } });
  const paid = pu.payments.filter((x) => x.status === "success").reduce((s, x) => s + x.amountKobo, 0);
  console.log("\nPURCHASE — learner " + pu.learner.user.name + " / " + pu.package.name + " (" + pu.status + ")");
  for (const x of pu.payments) console.log("  payment  " + x.method.padEnd(8) + naira(x.amountKobo).padStart(12) + "  " + x.status);
  console.log("  balance owed = " + naira(pu.package.priceKobo - paid) + "   (computed, never stored)");

  const lessons = await p.lesson.findMany({
    include: { ratings: { include: { skill: true } }, instructor: { include: { user: { select: { name: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  console.log("\nLESSONS (startsAt shown in UTC; 60-minute lessons)");
  for (const l of lessons) {
    console.log("  " + l.startsAt.toISOString().slice(0, 16).replace("T", " ") + " UTC | " + l.instructor.user.name + " | " + l.status);
    for (const r of l.ratings) console.log("      rating: [" + r.skill.stage + "] " + r.skill.name + " = " + r.rating);
  }

  const skills = await p.skill.findMany({ orderBy: { displayOrder: "asc" } });
  console.log("\nSKILLS (" + skills.length + ")");
  for (const s of skills) console.log("  [" + s.stage + "] " + s.name);

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
