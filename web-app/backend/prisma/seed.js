const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean existing data
  await prisma.badge.deleteMany();
  await prisma.survey.deleteMany();
  await prisma.mentorFeedback.deleteMany();
  await prisma.personalNote.deleteMany();
  await prisma.analysisJob.deleteMany();
  await prisma.lessonEnrollment.deleteMany();
  await prisma.parentStudent.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash('password123', 10);

  // ── Users ──────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: 'admin@lectureai.com',
      password: hash,
      name: 'Sistem Yöneticisi',
      role: 'ADMIN',
    },
  });

  const teacher1 = await prisma.user.create({
    data: {
      email: 'ahmet.hoca@lectureai.com',
      password: hash,
      name: 'Ahmet Yılmaz',
      role: 'TEACHER',
      branch: 'Matematik',
    },
  });

  const teacher2 = await prisma.user.create({
    data: {
      email: 'ayse.hoca@lectureai.com',
      password: hash,
      name: 'Ayşe Demir',
      role: 'TEACHER',
      branch: 'Fizik',
    },
  });

  const student1 = await prisma.user.create({
    data: {
      email: 'ogrenci1@lectureai.com',
      password: hash,
      name: 'Mehmet Kaya',
      role: 'STUDENT',
    },
  });

  const student2 = await prisma.user.create({
    data: {
      email: 'ogrenci2@lectureai.com',
      password: hash,
      name: 'Zeynep Arslan',
      role: 'STUDENT',
    },
  });

  const parent1 = await prisma.user.create({
    data: {
      email: 'veli1@lectureai.com',
      password: hash,
      name: 'Ali Kaya',
      role: 'PARENT',
    },
  });

  // ── Lessons ────────────────────────────────────────────────
  const lesson1 = await prisma.lesson.create({
    data: {
      title: 'Diferansiyel Denklemler',
      moduleCode: 'MATH301',
      teacherId: teacher1.id,
    },
  });

  const lesson2 = await prisma.lesson.create({
    data: {
      title: 'Kuantum Mekaniği',
      moduleCode: 'PHYS401',
      teacherId: teacher2.id,
    },
  });

  // ── Enrollments ────────────────────────────────────────────
  await prisma.lessonEnrollment.createMany({
    data: [
      { lessonId: lesson1.id, studentId: student1.id },
      { lessonId: lesson1.id, studentId: student2.id },
      { lessonId: lesson2.id, studentId: student1.id },
    ],
  });

  // ── Parent-Student Links ──────────────────────────────────
  await prisma.parentStudent.create({
    data: {
      parentId: parent1.id,
      studentId: student1.id,
    },
  });

  // ── Analysis Jobs ──────────────────────────────────────────
  const job1 = await prisma.analysisJob.create({
    data: {
      videoUrl: 'https://storage.googleapis.com/lectureai/video1.mp4',
      videoFilename: 'video1.mp4',
      teacherId: teacher1.id,
      lessonId: lesson1.id,
      status: 'DRAFT',
      draftReport: {
        overallScore: 82,
        engagement: 'Yüksek',
        suggestions: ['Daha fazla örnek verin', 'Tempo biraz yavaşlatılabilir'],
      },
    },
  });

  await prisma.analysisJob.create({
    data: {
      videoUrl: 'https://storage.googleapis.com/lectureai/video2.mp4',
      videoFilename: 'video2.mp4',
      teacherId: teacher1.id,
      lessonId: lesson1.id,
      status: 'FINALIZED',
      draftReport: {
        overallScore: 90,
        engagement: 'Çok Yüksek',
        suggestions: ['Harika ders!'],
      },
      finalReport: {
        overallScore: 90,
        engagement: 'Çok Yüksek',
        suggestions: ['Harika ders!'],
        approvedBy: 'admin',
        approvedAt: new Date().toISOString(),
      },
    },
  });

  // ── Mentor Feedbacks ───────────────────────────────────────
  await prisma.mentorFeedback.createMany({
    data: [
      {
        teacherId: teacher1.id,
        studentId: student1.id,
        lessonId: lesson1.id,
        note: 'Mehmet, diferansiyel denklemlerde çok iyi bir ilerleme gösteriyorsun. Devam et!',
      },
      {
        teacherId: teacher1.id,
        studentId: student2.id,
        lessonId: lesson1.id,
        note: 'Zeynep, ödev teslimlerinde biraz daha dikkatli olmalısın.',
      },
    ],
  });

  // ── Surveys ────────────────────────────────────────────────
  await prisma.survey.create({
    data: {
      studentId: student1.id,
      lessonId: lesson1.id,
      contentQuality: 5,
      teachingMethod: 4,
      engagement: 5,
      materials: 4,
      overall: 5,
      anonymousComment: 'Çok faydalı bir ders, hoca çok ilgili.',
    },
  });

  // ── Personal Notes ─────────────────────────────────────────
  await prisma.personalNote.create({
    data: {
      teacherId: teacher1.id,
      content: 'Bir sonraki derste Laplace dönüşümüne geçilecek. Örnekler hazırla.',
      lessonTag: 'MATH301',
    },
  });

  // ── Badges ─────────────────────────────────────────────────
  await prisma.badge.createMany({
    data: [
      {
        studentId: student1.id,
        title: 'Aktif Katılımcı',
        description: 'Ders içi etkileşimlerde üst sıralarda yer aldı.',
      },
      {
        studentId: student1.id,
        title: 'Lider',
        description: 'Grup çalışmalarında liderlik rolü üstlendi.',
      },
    ],
  });

  console.log('✅ Seed completed successfully!');
  console.log(`   Admin:   ${admin.email}`);
  console.log(`   Teacher: ${teacher1.email}, ${teacher2.email}`);
  console.log(`   Student: ${student1.email}, ${student2.email}`);
  console.log(`   Parent:  ${parent1.email}`);
  console.log('   Password for all: password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
