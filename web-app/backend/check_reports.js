const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const reports = await p.report.findMany({
    include: {
      reportTeachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
      lesson: { select: { lessonNo: true, videoUrl: true, videoFilename: true, group: { select: { course: { select: { course: true } } } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n=== Toplam ${reports.length} rapor ===\n`);

  reports.forEach((j, i) => {
    console.log(`--- [${i + 1}] ---`);
    console.log(`  ID:        ${j.id}`);
    console.log(`  Status:    ${j.status}`);
    console.log(`  Video:     ${j.lesson?.videoFilename || j.lesson?.videoUrl || '-'}`);
    console.log(`  Teacher:   ${j.reportTeachers[0]?.teacher?.user?.name || '-'}`);
    console.log(`  Lesson:    ${j.lesson?.group?.course?.course || '-'} (Ders ${j.lesson?.lessonNo || '-'})`);
    console.log(`  Created:   ${j.createdAt}`);
    console.log(`  Draft:     ${j.draftReport ? JSON.stringify(j.draftReport).substring(0, 150) + '...' : 'YOK'}`);
    console.log(`  Final:     ${j.finalReport ? JSON.stringify(j.finalReport).substring(0, 150) + '...' : 'YOK'}`);
    console.log(`  Feedback:  ${j.adminFeedback || '-'}`);
    console.log('');
  });

  await p.$disconnect();
}
main();
