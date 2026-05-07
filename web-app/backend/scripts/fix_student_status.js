/**
 * One-time fix: Update Report records stuck in PROCESSING (student voice analysis)
 * to DRAFT since reports already exist in GCS.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const records = await prisma.report.findMany({
    where: {
      status: 'PROCESSING',
      draftReport: { path: ['_analysisType'], equals: 'student_voice' },
    },
    include: {
      reportStudents: {
        include: { student: { include: { user: { select: { name: true } } } } },
      },
    },
  });

  console.log(`Found ${records.length} PROCESSING student voice analysis records`);

  for (const r of records) {
    const name = r.reportStudents[0]?.student?.user?.name || '?';
    await prisma.report.update({
      where: { id: r.id },
      data: { status: 'DRAFT', updatedAt: new Date() },
    });
    console.log(`✅ ${name} (${r.id}) → DRAFT`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
