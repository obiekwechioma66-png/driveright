// Safe, non-destructive sample settings seeder; never clears users or lessons.
const { PrismaClient } = require("@prisma/client");

async function seedSchoolSettings(prisma) {
  await prisma.$executeRaw`
    INSERT INTO "SchoolSettings"
      ("id", "address", "phone", "whatsappNumber", "email", "instagram", "facebook", "x", "tiktok", "youtube", "updatedAt")
    VALUES
      (
        'school',
        '12 Adeola Odeku Street, Victoria Island, Lagos, Nigeria',
        '07044003353',
        '08012345678',
        'driveright@gmail.com',
        'driverightofficial',
        'driverightofficial',
        'DriveRightNG',
        '@driveright.ng',
        '@DriveRightNG',
        ${new Date()}
      )
    ON CONFLICT ("id") DO NOTHING
  `;
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedSchoolSettings(prisma)
    .then(() => console.log("Sample school contact settings added (existing settings preserved)."))
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}

module.exports = seedSchoolSettings;
