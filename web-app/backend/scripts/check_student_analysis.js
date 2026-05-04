const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Tüm student_voice analiz joblarını getir
  const jobs = await p.report.findMany({
    where: {
      draftReport: { path: ['_analysisType'], equals: 'student_voice' },
    },
    include: {
      reportStudents: {
        include: { student: { include: { user: { select: { name: true } } } } },
      },
      lesson: {
        include: { group: { include: { course: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (jobs.length === 0) {
    console.log('❌ Henüz hiç öğrenci ses analizi başlatılmamış.');
  } else {
    console.log(`✅ Toplam ${jobs.length} öğrenci ses analizi bulundu:\n`);
    jobs.forEach((j, i) => {
      const dr = (typeof j.draftReport === 'object' && j.draftReport) || {};
      const studentName = j.reportStudents[0]?.student?.user?.name || dr._studentName || '?';
      const courseName = j.lesson?.group?.course?.course || '?';
      const groupName = j.lesson?.group?.name || '?';
      console.log(`  ${i + 1}. ${studentName}`);
      console.log(`     Job ID:  ${j.id}`);
      console.log(`     Status:  ${j.status}`);
      console.log(`     Kurs:    ${courseName} / Grup: ${groupName}`);
      console.log(`     Ref Audio: ${dr._referenceAudioBlob || '-'}`);
      console.log(`     Tarih:   ${j.createdAt.toLocaleString('tr-TR')}`);
      console.log('');
    });
  }

  await p.$disconnect();
})();
