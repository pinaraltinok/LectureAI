const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ── Curricula from the real system ────────────────────────────
const CURRICULA_DATA = [
  // ─── Roblox Game Developer ───────────────────────────────────
  {
    code: '1719',
    name: 'Roblox Game Developer',
    year: 2025, ageRange: '8-9', durationMin: 60, totalLessons: 40,
    modules: 10, lessonsPerModule: 4, language: 'TUR', status: 'Actual',
    bucketCode: 'TUR40W1719',
  },
  {
    code: '1495',
    name: 'Roblox Game Developer',
    year: 2024, ageRange: '10-12', durationMin: 90, totalLessons: 40,
    modules: 10, lessonsPerModule: 4, language: 'TUR', status: 'In Progress',
    bucketCode: 'TUR40W1495',
  },
  {
    code: '1494',
    name: 'Roblox Game Developer',
    year: 2024, ageRange: '8-9', durationMin: 60, totalLessons: 40,
    modules: 10, lessonsPerModule: 4, language: 'TUR', status: 'In Progress',
    bucketCode: 'TUR40W1494',
  },
  {
    code: '1041',
    name: 'Roblox Game Developer',
    year: 2023, ageRange: '10-12', durationMin: 90, totalLessons: 32,
    modules: 8, lessonsPerModule: 4, language: 'TUR', status: 'In Progress',
    bucketCode: 'TUR32W1041',
  },
  {
    code: '955',
    name: 'Roblox Game Developer',
    year: 2023, ageRange: '8-9', durationMin: 60, totalLessons: 32,
    modules: 8, lessonsPerModule: 4, language: 'TUR', status: 'Actual',
    bucketCode: 'TUR32W955',
  },
  // ─── Python Developer ─────────────────────────────────────────
  {
    code: '1500',
    name: 'Python Developer',
    year: 2024, ageRange: '10-11', durationMin: 60, totalLessons: 40,
    modules: 10, lessonsPerModule: 4, language: 'TUR', status: 'In Progress',
    bucketCode: 'TUR40W1500',
  },
  {
    code: '1501',
    name: 'Python Developer',
    year: 2024, ageRange: '12-13', durationMin: 60, totalLessons: 40,
    modules: 10, lessonsPerModule: 4, language: 'TUR', status: 'In Progress',
    bucketCode: 'TUR40W1501',
  },
  // ─── Scratch Jr. ──────────────────────────────────────────────
  {
    code: '1510',
    name: 'Scratch Jr.',
    year: 2024, ageRange: '6-7', durationMin: 60, totalLessons: 24,
    modules: 6, lessonsPerModule: 4, language: 'TUR', status: 'In Progress',
    bucketCode: 'TUR24W1510',
  },
  // ─── Web Development ─────────────────────────────────────────
  {
    code: '1520',
    name: 'Web Development',
    year: 2024, ageRange: '12-14', durationMin: 60, totalLessons: 40,
    modules: 10, lessonsPerModule: 4, language: 'TUR', status: 'In Progress',
    bucketCode: 'TUR40W1520',
  },
  // ─── Unity Game Development ───────────────────────────────────
  {
    code: '1530',
    name: 'Unity Game Development',
    year: 2024, ageRange: '12-14', durationMin: 60, totalLessons: 40,
    modules: 10, lessonsPerModule: 4, language: 'TUR', status: 'In Progress',
    bucketCode: 'TUR40W1530',
  },
];

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
  await prisma.curriculum.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash('password123', 10);

  // ── Curricula ─────────────────────────────────────────────────
  console.log('📚 Seeding curricula...');
  const createdCurricula = {};
  for (const c of CURRICULA_DATA) {
    const curriculum = await prisma.curriculum.create({ data: c });
    createdCurricula[c.code] = curriculum;
  }
  console.log(`   ✓ ${CURRICULA_DATA.length} curricula created`);

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
    },
  });

  const teacher2 = await prisma.user.create({
    data: {
      email: 'ayse.hoca@lectureai.com',
      password: hash,
      name: 'Ayşe Demir',
      role: 'TEACHER',
    },
  });

  const teacher3 = await prisma.user.create({
    data: {
      email: 'zehra.bozkurt@lectureai.com',
      password: hash,
      name: 'Zehra Bozkurt',
      role: 'TEACHER',
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
      title: 'Roblox Game Developer [2024][8-9][60m][40L][TUR][In Progress]',
      moduleCode: 'M1L1',
      teacherId: teacher1.id,
      curriculumId: createdCurricula['1494'].id,
    },
  });

  const lesson2 = await prisma.lesson.create({
    data: {
      title: 'Python Developer [2024][10-11][60m][40L][TUR][In Progress]',
      moduleCode: 'M1L1',
      teacherId: teacher2.id,
      curriculumId: createdCurricula['1500'].id,
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
  await prisma.analysisJob.create({
    data: {
      videoUrl: 'https://storage.googleapis.com/lectureai/video1.mp4',
      videoFilename: 'video1.mp4',
      teacherId: teacher1.id,
      lessonId: lesson1.id,
      status: 'PROCESSING',
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
        feedback_metni: 'Eğitmen ders içeriğine hakimiyeti ve öğrencilerle kurduğu dinamik iletişimle standardın üzerinde bir performans sergilemiştir.',
        speaking_time_rating: '%65',
        actual_duration_min: 60,
        yeterlilikler: '%95',
      },
      finalReport: {
        overallScore: 90,
        engagement: 'Çok Yüksek',
        feedback_metni: 'Eğitmen ders içeriğine hakimiyeti ve öğrencilerle kurduğu dinamik iletişimle standardın üzerinde bir performans sergilemiştir.',
        speaking_time_rating: '%65',
        actual_duration_min: 60,
        yeterlilikler: '%95',
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
        note: 'Mehmet, bu derste çok iyi bir ilerleme gösterdin. Devam et!',
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
      content: 'Bir sonraki derste M1L2 konusuna geçilecek.',
      lessonTag: 'M1L1',
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
  console.log(`   Admin:    ${admin.email}`);
  console.log(`   Teacher:  ${teacher1.email}, ${teacher2.email}, ${teacher3.email}`);
  console.log(`   Student:  ${student1.email}, ${student2.email}`);
  console.log(`   Parent:   ${parent1.email}`);
  console.log(`   Curricula: ${CURRICULA_DATA.length} programmes`);
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
