const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const jobs = await p.analysisJob.findMany({
    include: {
      teacher: { select: { name: true } },
      lesson: { select: { title: true, moduleCode: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n=== Toplam ${jobs.length} analiz kaydı ===\n`);

  jobs.forEach((j, i) => {
    console.log(`--- [${i + 1}] ---`);
    console.log(`  ID:        ${j.id}`);
    console.log(`  Status:    ${j.status}`);
    console.log(`  Video:     ${j.videoFilename || j.videoUrl || '-'}`);
    console.log(`  Teacher:   ${j.teacher?.name || '-'}`);
    console.log(`  Lesson:    ${j.lesson?.title || '-'} (${j.lesson?.moduleCode || '-'})`);
    console.log(`  Created:   ${j.createdAt}`);
    console.log(`  Draft:     ${j.draftReport ? JSON.stringify(j.draftReport).substring(0, 150) + '...' : 'YOK'}`);
    console.log(`  Final:     ${j.finalReport ? JSON.stringify(j.finalReport).substring(0, 150) + '...' : 'YOK'}`);
    console.log(`  Feedback:  ${j.adminFeedback || '-'}`);
    console.log('');
  });

  await p.$disconnect();
}
main();
