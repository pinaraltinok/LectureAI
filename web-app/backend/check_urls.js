const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const jobs = await p.analysisJob.findMany({
    where: { status: { in: ['DRAFT', 'FINALIZED'] } },
    select: { id: true, videoUrl: true, videoFilename: true, status: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log('\n=== Video URLs ===');
  jobs.forEach(j => console.log(`${j.id.slice(0,8)} | ${j.status} | video: ${j.videoUrl} | file: ${j.videoFilename}`));
  await p.$disconnect();
}
main();
