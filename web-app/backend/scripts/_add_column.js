/**
 * Add the referenceAudioUrl column to the students table on production DB
 * using Prisma's raw SQL execution.
 */
const { PrismaClient } = require('@prisma/client');

// Override DATABASE_URL to point to production
const prodUrl = 'postgresql://postgres:kYERU8%285qt%2C%3E5UT%7B@34.12.29.49:5432/lectureai?sslmode=prefer';
const prisma = new PrismaClient({ datasources: { db: { url: prodUrl } } });

async function main() {
  try {
    // Check if column exists
    const check = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'students' AND column_name = 'referenceAudioUrl'
    `;

    if (check.length > 0) {
      console.log('Column referenceAudioUrl already exists');
    } else {
      await prisma.$executeRawUnsafe(`ALTER TABLE "students" ADD COLUMN "referenceAudioUrl" TEXT`);
      console.log('✅ Column referenceAudioUrl added to students table');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  await prisma.$disconnect();
}

main();
