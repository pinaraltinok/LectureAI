const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Clean existing data (order matters for FK constraints) ──
  await prisma.reportStudent.deleteMany();
  await prisma.reportTeacher.deleteMany();
  await prisma.survey.deleteMany();
  await prisma.studentEvaluation.deleteMany();
  await prisma.report.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.studentGroup.deleteMany();
  await prisma.group.deleteMany();
  await prisma.teacherCourse.deleteMany();
  await prisma.course.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash('password123', 10);

  // ════════════════════════════════════════════════════════════
  // ── COURSES ────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('📚 Seeding courses...');

  const courseRoblox89 = await prisma.course.create({
    data: {
      course: 'Roblox Game Developer',
      age: '8-9',
      lessonSize: 60,
      moduleNum: 10,
      moduleSize: 4,
    },
  });

  const courseRoblox1012 = await prisma.course.create({
    data: {
      course: 'Roblox Game Developer',
      age: '10-12',
      lessonSize: 90,
      moduleNum: 10,
      moduleSize: 4,
    },
  });

  const coursePython = await prisma.course.create({
    data: {
      course: 'Python Developer',
      age: '10-11',
      lessonSize: 60,
      moduleNum: 10,
      moduleSize: 4,
    },
  });

  const courseScratch = await prisma.course.create({
    data: {
      course: 'Scratch Jr.',
      age: '6-7',
      lessonSize: 60,
      moduleNum: 6,
      moduleSize: 4,
    },
  });

  const courseWeb = await prisma.course.create({
    data: {
      course: 'Web Development',
      age: '12-14',
      lessonSize: 60,
      moduleNum: 10,
      moduleSize: 4,
    },
  });

  const courseUnity = await prisma.course.create({
    data: {
      course: 'Unity Game Development',
      age: '12-14',
      lessonSize: 60,
      moduleNum: 10,
      moduleSize: 4,
    },
  });

  console.log('   ✓ 6 courses created');

  // ════════════════════════════════════════════════════════════
  // ── USERS + PROFILES ───────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('👤 Seeding users...');

  // ── Admin ──
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@lectureai.com',
      password: hash,
      name: 'Sistem Yöneticisi',
      phone: '0500 000 0000',
      role: 'ADMIN',
    },
  });
  const admin = await prisma.admin.create({
    data: { id: adminUser.id },
  });

  // ── Teacher: Zehra Bozkurt (korunacak) ──
  const zehraUser = await prisma.user.create({
    data: {
      email: 'zehra.bozkurt@lectureai.com',
      password: hash,
      name: 'Zehra Bozkurt',
      phone: '0532 000 0001',
      role: 'TEACHER',
    },
  });
  const zehraTeacher = await prisma.teacher.create({
    data: {
      id: zehraUser.id,
      startOfDate: new Date('2024-09-01'),
    },
  });

  // ── Teacher: Ahmet Yılmaz ──
  const ahmetUser = await prisma.user.create({
    data: {
      email: 'ahmet.hoca@lectureai.com',
      password: hash,
      name: 'Ahmet Yılmaz',
      phone: '0532 000 0002',
      role: 'TEACHER',
    },
  });
  const ahmetTeacher = await prisma.teacher.create({
    data: {
      id: ahmetUser.id,
      startOfDate: new Date('2023-03-15'),
    },
  });

  // ── Teacher: Ayşe Demir ──
  const ayseUser = await prisma.user.create({
    data: {
      email: 'ayse.hoca@lectureai.com',
      password: hash,
      name: 'Ayşe Demir',
      phone: '0532 000 0003',
      role: 'TEACHER',
    },
  });
  const ayseTeacher = await prisma.teacher.create({
    data: {
      id: ayseUser.id,
      startOfDate: new Date('2024-01-10'),
    },
  });

  // ── Student: Mehmet Kaya ──
  const mehmetUser = await prisma.user.create({
    data: {
      email: 'ogrenci1@lectureai.com',
      password: hash,
      name: 'Mehmet Kaya',
      phone: '0555 000 0001',
      role: 'STUDENT',
    },
  });
  const mehmetStudent = await prisma.student.create({
    data: {
      id: mehmetUser.id,
      age: 10,
      parent: 'Ali Kaya',
      parentPhone: '0555 000 0010',
    },
  });

  // ── Student: Zeynep Arslan ──
  const zeynepUser = await prisma.user.create({
    data: {
      email: 'ogrenci2@lectureai.com',
      password: hash,
      name: 'Zeynep Arslan',
      phone: '0555 000 0002',
      role: 'STUDENT',
    },
  });
  const zeynepStudent = await prisma.student.create({
    data: {
      id: zeynepUser.id,
      age: 9,
      parent: 'Fatma Arslan',
      parentPhone: '0555 000 0020',
    },
  });

  // ── Student: Emre Çelik ──
  const emreUser = await prisma.user.create({
    data: {
      email: 'ogrenci3@lectureai.com',
      password: hash,
      name: 'Emre Çelik',
      phone: '0555 000 0003',
      role: 'STUDENT',
    },
  });
  const emreStudent = await prisma.student.create({
    data: {
      id: emreUser.id,
      age: 12,
      parent: 'Hasan Çelik',
      parentPhone: '0555 000 0030',
    },
  });

  console.log('   ✓ 7 users created (1 admin, 3 teachers, 3 students)');

  // ════════════════════════════════════════════════════════════
  // ── TEACHER_COURSE ─────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('🔗 Seeding teacher-course assignments...');

  await prisma.teacherCourse.createMany({
    data: [
      { teacherId: zehraTeacher.id, courseId: courseRoblox89.id },
      { teacherId: zehraTeacher.id, courseId: coursePython.id },
      { teacherId: ahmetTeacher.id, courseId: courseRoblox1012.id },
      { teacherId: ahmetTeacher.id, courseId: courseWeb.id },
      { teacherId: ayseTeacher.id, courseId: courseScratch.id },
      { teacherId: ayseTeacher.id, courseId: courseUnity.id },
    ],
  });

  console.log('   ✓ 6 teacher-course assignments');

  // ════════════════════════════════════════════════════════════
  // ── GROUPS ─────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('👥 Seeding groups...');

  const groupZehraRoblox = await prisma.group.create({
    data: {
      courseId: courseRoblox89.id,
      teacherId: zehraTeacher.id,
      schedule: 'Pazartesi 14:00 - 15:00',
    },
  });

  const groupZehraPython = await prisma.group.create({
    data: {
      courseId: coursePython.id,
      teacherId: zehraTeacher.id,
      schedule: 'Çarşamba 10:00 - 11:00',
    },
  });

  const groupAhmetRoblox = await prisma.group.create({
    data: {
      courseId: courseRoblox1012.id,
      teacherId: ahmetTeacher.id,
      schedule: 'Salı 16:00 - 17:30',
    },
  });

  const groupAyseScratch = await prisma.group.create({
    data: {
      courseId: courseScratch.id,
      teacherId: ayseTeacher.id,
      schedule: 'Perşembe 13:00 - 14:00',
    },
  });

  console.log('   ✓ 4 groups created');

  // ════════════════════════════════════════════════════════════
  // ── STUDENT_GROUP ──────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('📋 Seeding student-group enrollments...');

  await prisma.studentGroup.createMany({
    data: [
      { studentId: mehmetStudent.id, groupId: groupZehraRoblox.id },
      { studentId: zeynepStudent.id, groupId: groupZehraRoblox.id },
      { studentId: mehmetStudent.id, groupId: groupZehraPython.id },
      { studentId: emreStudent.id, groupId: groupAhmetRoblox.id },
      { studentId: zeynepStudent.id, groupId: groupAyseScratch.id },
    ],
  });

  console.log('   ✓ 5 student-group enrollments');

  // ════════════════════════════════════════════════════════════
  // ── LESSONS ────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('📖 Seeding lessons...');

  const lesson1 = await prisma.lesson.create({
    data: {
      groupId: groupZehraRoblox.id,
      teacherId: zehraTeacher.id,
      dateTime: new Date('2025-03-10T14:00:00'),
      lessonNo: 1,
    },
  });

  const lesson2 = await prisma.lesson.create({
    data: {
      groupId: groupZehraRoblox.id,
      teacherId: zehraTeacher.id,
      dateTime: new Date('2025-03-17T14:00:00'),
      lessonNo: 2,
    },
  });

  const lesson3 = await prisma.lesson.create({
    data: {
      groupId: groupZehraPython.id,
      teacherId: zehraTeacher.id,
      dateTime: new Date('2025-03-12T10:00:00'),
      lessonNo: 1,
    },
  });

  const lesson4 = await prisma.lesson.create({
    data: {
      groupId: groupAhmetRoblox.id,
      teacherId: ahmetTeacher.id,
      dateTime: new Date('2025-03-11T16:00:00'),
      lessonNo: 1,
    },
  });

  console.log('   ✓ 4 lessons created');

  // ════════════════════════════════════════════════════════════
  // ── REPORTS + REPORT_TEACHER + REPORT_STUDENT ──────────────
  // ════════════════════════════════════════════════════════════
  console.log('📊 Seeding reports...');

  // Report 1: FINALIZED for Zehra's Roblox lesson 1
  const report1 = await prisma.report.create({
    data: {
      adminId: admin.id,
      lessonId: lesson1.id,
      videoUrl: 'https://storage.googleapis.com/lectureai/video1.mp4',
      videoFilename: 'video1.mp4',
      status: 'FINALIZED',
      draftReport: {
        overallScore: 92,
        engagement: 'Çok Yüksek',
        feedback_metni: 'Zehra Hoca ders içeriğine hakimiyeti ve öğrencilerle kurduğu dinamik iletişimle standardın üzerinde bir performans sergilemiştir.',
        speaking_time_rating: '%65',
        actual_duration_min: 60,
        yeterlilikler: '%95',
      },
      finalReport: {
        overallScore: 92,
        engagement: 'Çok Yüksek',
        feedback_metni: 'Zehra Hoca ders içeriğine hakimiyeti ve öğrencilerle kurduğu dinamik iletişimle standardın üzerinde bir performans sergilemiştir.',
        speaking_time_rating: '%65',
        actual_duration_min: 60,
        yeterlilikler: '%95',
        approvedBy: 'admin',
        approvedAt: new Date().toISOString(),
      },
    },
  });

  await prisma.reportTeacher.create({
    data: {
      reportId: report1.id,
      teacherId: zehraTeacher.id,
      score: 92,
    },
  });

  await prisma.reportStudent.createMany({
    data: [
      { reportId: report1.id, studentId: mehmetStudent.id },
      { reportId: report1.id, studentId: zeynepStudent.id },
    ],
  });

  // Report 2: DRAFT for Zehra's Roblox lesson 2
  const report2 = await prisma.report.create({
    data: {
      adminId: admin.id,
      lessonId: lesson2.id,
      videoUrl: 'https://storage.googleapis.com/lectureai/video2.mp4',
      videoFilename: 'video2.mp4',
      status: 'DRAFT',
      draftReport: {
        overallScore: 88,
        engagement: 'Yüksek',
        feedback_metni: 'İkinci derste de iyi bir performans görülmüştür. Öğrenci katılımı yüksek düzeyde devam etmektedir.',
        speaking_time_rating: '%60',
        actual_duration_min: 58,
        yeterlilikler: '%90',
      },
    },
  });

  await prisma.reportTeacher.create({
    data: {
      reportId: report2.id,
      teacherId: zehraTeacher.id,
      score: 88,
    },
  });

  // Report 3: PROCESSING for Ahmet's lesson
  await prisma.report.create({
    data: {
      lessonId: lesson4.id,
      videoUrl: 'https://storage.googleapis.com/lectureai/video3.mp4',
      videoFilename: 'video3.mp4',
      status: 'PROCESSING',
    },
  });

  console.log('   ✓ 3 reports created');

  // ════════════════════════════════════════════════════════════
  // ── STUDENT_EVALUATIONS ────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('💬 Seeding student evaluations...');

  await prisma.studentEvaluation.createMany({
    data: [
      {
        teacherId: zehraTeacher.id,
        studentId: mehmetStudent.id,
        note: 'Mehmet, bu derste çok iyi bir ilerleme gösterdin. Devam et!',
      },
      {
        teacherId: zehraTeacher.id,
        studentId: zeynepStudent.id,
        note: 'Zeynep, ödev teslimlerinde biraz daha dikkatli olmalısın.',
      },
      {
        teacherId: ahmetTeacher.id,
        studentId: emreStudent.id,
        note: 'Emre, Roblox projesinde yaratıcılığını gösterdin, harika!',
      },
    ],
  });

  console.log('   ✓ 3 student evaluations');

  // ════════════════════════════════════════════════════════════
  // ── SURVEYS ────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('📝 Seeding surveys...');

  await prisma.survey.createMany({
    data: [
      {
        studentId: mehmetStudent.id,
        lessonId: lesson1.id,
        rating: 5,
        note: 'Çok faydalı bir ders, hoca çok ilgili.',
      },
      {
        studentId: zeynepStudent.id,
        lessonId: lesson1.id,
        rating: 4,
        note: 'Dersi sevdim ama biraz hızlı geçti.',
      },
    ],
  });

  console.log('   ✓ 2 surveys');

  // ════════════════════════════════════════════════════════════
  console.log('\n✅ Seed completed successfully!');
  console.log(`   Admin:    ${adminUser.email}`);
  console.log(`   Teachers: ${zehraUser.email}, ${ahmetUser.email}, ${ayseUser.email}`);
  console.log(`   Students: ${mehmetUser.email}, ${zeynepUser.email}, ${emreUser.email}`);
  console.log('   Password for all: password123');
  console.log(`   Courses:  6`);
  console.log(`   Groups:   4`);
  console.log(`   Lessons:  4`);
  console.log(`   Reports:  3`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
