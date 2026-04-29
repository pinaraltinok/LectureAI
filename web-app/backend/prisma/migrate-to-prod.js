const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Migrating local data to production...');

  // ── Clean existing data (order matters for FK constraints) ──
  console.log('🗑️  Cleaning existing data...');
  await prisma.studentNote.deleteMany();
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

  // ════════════════════════════════════════════════════════════
  // ── USERS ──────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('👤 Creating users...');

  await prisma.user.create({
    data: {
      id: 'df3caa1a-4c36-49f3-b1e3-a7ac2be08703',
      name: 'Test Admin',
      phone: null,
      email: 'admin@test.com',
      password: '$2a$10$6JIeU8P0Obf9/8oVsxZZtehqjscnLUN2/onjeMU3xnWiIFDY96Idy',
      role: 'ADMIN',
      createdAt: new Date('2026-04-29T07:51:38.785Z'),
      updatedAt: new Date('2026-04-29T07:51:38.785Z'),
    },
  });

  await prisma.user.create({
    data: {
      id: 'be070c68-c148-4ee3-8385-c88cff639a09',
      name: 'Test Teacher',
      phone: null,
      email: 'teacher@test.com',
      password: '$2a$10$6JIeU8P0Obf9/8oVsxZZtehqjscnLUN2/onjeMU3xnWiIFDY96Idy',
      role: 'TEACHER',
      createdAt: new Date('2026-04-29T07:51:38.793Z'),
      updatedAt: new Date('2026-04-29T07:51:38.793Z'),
    },
  });

  await prisma.user.create({
    data: {
      id: '3ae5f944-f5da-4982-8ea6-e56713d3d9d8',
      name: 'Test Student',
      phone: null,
      email: 'student@test.com',
      password: '$2a$10$6JIeU8P0Obf9/8oVsxZZtehqjscnLUN2/onjeMU3xnWiIFDY96Idy',
      role: 'STUDENT',
      createdAt: new Date('2026-04-29T07:51:38.797Z'),
      updatedAt: new Date('2026-04-29T07:51:38.797Z'),
    },
  });

  console.log('   ✓ 3 users created');

  // ════════════════════════════════════════════════════════════
  // ── PROFILES ───────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('👤 Creating profiles...');

  await prisma.admin.create({
    data: { id: 'df3caa1a-4c36-49f3-b1e3-a7ac2be08703' },
  });

  await prisma.teacher.create({
    data: {
      id: 'be070c68-c148-4ee3-8385-c88cff639a09',
      startOfDate: new Date('2026-04-29T07:51:38.793Z'),
    },
  });

  await prisma.student.create({
    data: {
      id: '3ae5f944-f5da-4982-8ea6-e56713d3d9d8',
      age: 12,
      parent: 'Test Veli',
      parentPhone: '05551234567',
    },
  });

  console.log('   ✓ 1 admin, 1 teacher, 1 student profiles');

  // ════════════════════════════════════════════════════════════
  // ── COURSES ────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('📚 Creating courses...');

  await prisma.course.create({
    data: {
      id: 'cmojrau5s000285c81f4y0sw5',
      course: 'Test Kurs',
      age: '10-12',
      lessonSize: 60,
      moduleNum: 1,
      moduleSize: 4,
    },
  });

  console.log('   ✓ 1 course created');

  // ════════════════════════════════════════════════════════════
  // ── TEACHER_COURSES ────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('🔗 Creating teacher-course assignments...');

  await prisma.teacherCourse.create({
    data: {
      teacherId: 'be070c68-c148-4ee3-8385-c88cff639a09',
      courseId: 'cmojrau5s000285c81f4y0sw5',
    },
  });

  console.log('   ✓ 1 teacher-course assignment');

  // ════════════════════════════════════════════════════════════
  // ── GROUPS ─────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('👥 Creating groups...');

  await prisma.group.create({
    data: {
      id: 'ff73471e-7a26-48ce-8b7e-9b633e0eec59',
      name: 'Test Grup',
      courseId: 'cmojrau5s000285c81f4y0sw5',
      teacherId: 'be070c68-c148-4ee3-8385-c88cff639a09',
      schedule: 'Pzt-Çar 15:00',
    },
  });

  console.log('   ✓ 1 group created');

  // ════════════════════════════════════════════════════════════
  // ── STUDENT_GROUPS ─────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('📋 Creating student-group enrollments...');

  await prisma.studentGroup.create({
    data: {
      studentId: '3ae5f944-f5da-4982-8ea6-e56713d3d9d8',
      groupId: 'ff73471e-7a26-48ce-8b7e-9b633e0eec59',
    },
  });

  console.log('   ✓ 1 student-group enrollment');

  // ════════════════════════════════════════════════════════════
  // ── LESSONS ────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('📖 Creating lessons...');

  await prisma.lesson.create({
    data: {
      id: 'c8e209a0-a658-44b2-bcf2-16b5a159fd9d',
      groupId: 'ff73471e-7a26-48ce-8b7e-9b633e0eec59',
      teacherId: 'be070c68-c148-4ee3-8385-c88cff639a09',
      dateTime: new Date('2026-04-29T07:51:38.811Z'),
      lessonNo: 1,
      videoUrl: 'gs://test/video.mp4',
      videoFilename: null,
    },
  });

  console.log('   ✓ 1 lesson created');

  // ════════════════════════════════════════════════════════════
  // ── REPORTS + REPORT_TEACHER ───────────────────────────────
  // ════════════════════════════════════════════════════════════
  console.log('📊 Creating reports...');

  // Report 1: DRAFT
  await prisma.report.create({
    data: {
      id: 'c62aa400-bbe8-47bb-bf46-36ade3ea8c5b',
      adminId: null,
      lessonId: 'c8e209a0-a658-44b2-bcf2-16b5a159fd9d',
      status: 'DRAFT',
      draftReport: {
        genel_sonuc: 'Beklentilere uygundu.',
        overallScore: 85,
        yeterlilikler: 'İyi',
      },
      finalReport: null,
      adminFeedback: null,
      createdAt: new Date('2026-04-29T07:51:38.813Z'),
      updatedAt: new Date('2026-04-29T07:51:38.813Z'),
    },
  });

  await prisma.reportTeacher.create({
    data: {
      id: '25185555-6ac9-4d0e-8c2c-1d39b7183abb',
      reportId: 'c62aa400-bbe8-47bb-bf46-36ade3ea8c5b',
      teacherId: 'be070c68-c148-4ee3-8385-c88cff639a09',
      score: 4.2,
    },
  });

  // Report 2: FINALIZED
  await prisma.report.create({
    data: {
      id: 'f3386771-9895-434c-9545-ed205380f7a8',
      adminId: 'df3caa1a-4c36-49f3-b1e3-a7ac2be08703',
      lessonId: 'c8e209a0-a658-44b2-bcf2-16b5a159fd9d',
      status: 'FINALIZED',
      draftReport: { overallScore: 92 },
      finalReport: {
        approvedAt: '2026-04-29T07:51:38.817Z',
        approvedBy: 'df3caa1a-4c36-49f3-b1e3-a7ac2be08703',
        overallScore: 92,
      },
      adminFeedback: null,
      createdAt: new Date('2026-04-29T07:51:38.818Z'),
      updatedAt: new Date('2026-04-29T07:51:38.818Z'),
    },
  });

  await prisma.reportTeacher.create({
    data: {
      id: '3abbb516-0ae4-43b3-9335-cbbb23354a00',
      reportId: 'f3386771-9895-434c-9545-ed205380f7a8',
      teacherId: 'be070c68-c148-4ee3-8385-c88cff639a09',
      score: 4.6,
    },
  });

  console.log('   ✓ 2 reports created (1 DRAFT, 1 FINALIZED)');

  // ════════════════════════════════════════════════════════════
  console.log('\n✅ Migration completed successfully!');
  console.log('   Users:    admin@test.com, teacher@test.com, student@test.com');
  console.log('   Courses:  1 (Test Kurs)');
  console.log('   Groups:   1 (Test Grup)');
  console.log('   Lessons:  1');
  console.log('   Reports:  2 (1 DRAFT, 1 FINALIZED)');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
