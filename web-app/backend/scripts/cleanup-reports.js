/**
 * Cleanup script: Delete all orphan reports (no teacher, no lesson assigned)
 * These are duplicate reports created by the broken GCS sync.
 * 
 * Usage: node scripts/cleanup-reports.js
 */
const prisma = require('../src/config/db');

async function cleanup() {
  console.log('🧹 Rapor temizleme başlıyor...\n');

  // 1. Count before
  const totalBefore = await prisma.report.count();
  console.log(`📊 Toplam rapor: ${totalBefore}`);

  // 2. Find orphan reports (no lesson, no teacher)
  const orphans = await prisma.report.findMany({
    where: {
      lessonId: null,
      reportTeachers: { none: {} },
    },
    select: { id: true, status: true, createdAt: true },
  });

  console.log(`🗑  Silinecek yetim (orphan) rapor: ${orphans.length}`);

  if (orphans.length === 0) {
    console.log('✅ Silinecek rapor yok.');
    await prisma.$disconnect();
    return;
  }

  const orphanIds = orphans.map(o => o.id);

  // 3. Delete related records first (cascade might handle, but be safe)
  const delStudents = await prisma.reportStudent.deleteMany({
    where: { reportId: { in: orphanIds } },
  });
  console.log(`   ↳ ReportStudent silindi: ${delStudents.count}`);

  const delTeachers = await prisma.reportTeacher.deleteMany({
    where: { reportId: { in: orphanIds } },
  });
  console.log(`   ↳ ReportTeacher silindi: ${delTeachers.count}`);

  // 4. Delete orphan reports
  const deleted = await prisma.report.deleteMany({
    where: { id: { in: orphanIds } },
  });
  console.log(`\n✅ ${deleted.count} yetim rapor silindi.`);

  const totalAfter = await prisma.report.count();
  console.log(`📊 Kalan rapor: ${totalAfter}`);

  await prisma.$disconnect();
}

cleanup().catch(e => {
  console.error('❌ Hata:', e);
  process.exit(1);
});
