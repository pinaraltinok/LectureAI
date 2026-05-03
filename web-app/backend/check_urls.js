const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const reports = await p.report.findMany({
    where: { status: { in: ['DRAFT', 'FINALIZED'] } },
    include: { lesson: { select: { videoUrl: true, videoFilename: true } } },
    orderBy: { createdAt: 'desc' },
  });
  console.log('\n=== Video URLs ===');
  reports.forEach(j => console.log(`${j.id.slice(0,8)} | ${j.status} | video: ${j.lesson?.videoUrl || '-'} | file: ${j.lesson?.videoFilename || '-'}`));
  await p.$disconnect();
}
main();
