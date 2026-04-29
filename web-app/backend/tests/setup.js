/**
 * Test Setup — Creates test entities using the CURRENT Prisma schema.
 *
 * Seeds fresh test data and returns JWT tokens + entity IDs.
 * All tests use this shared setup for consistency.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'lectureai-dev-secret-key-2024';

async function seedTestData() {
  // Clean in reverse dependency order
  await prisma.studentNote.deleteMany();
  await prisma.survey.deleteMany();
  await prisma.studentEvaluation.deleteMany();
  await prisma.reportStudent.deleteMany();
  await prisma.reportTeacher.deleteMany();
  await prisma.report.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.studentGroup.deleteMany();
  await prisma.group.deleteMany();
  await prisma.teacherCourse.deleteMany();
  await prisma.course.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash('test123', 10);

  // ── Users + role profiles ────────────────────────────────
  const adminUser = await prisma.user.create({
    data: { email: 'admin@test.com', password: hash, name: 'Test Admin', role: 'ADMIN' },
  });
  await prisma.admin.create({ data: { id: adminUser.id } });

  const teacherUser = await prisma.user.create({
    data: { email: 'teacher@test.com', password: hash, name: 'Test Teacher', role: 'TEACHER' },
  });
  await prisma.teacher.create({ data: { id: teacherUser.id, startOfDate: new Date() } });

  const studentUser = await prisma.user.create({
    data: { email: 'student@test.com', password: hash, name: 'Test Student', role: 'STUDENT' },
  });
  await prisma.student.create({ data: { id: studentUser.id, age: 12, parent: 'Test Veli', parentPhone: '05551234567' } });

  // ── Course ───────────────────────────────────────────────
  const course = await prisma.course.create({
    data: { course: 'Test Kurs', age: '10-12', lessonSize: 60, moduleNum: 1, moduleSize: 4 },
  });

  // ── TeacherCourse ────────────────────────────────────────
  await prisma.teacherCourse.create({
    data: { teacherId: teacherUser.id, courseId: course.id },
  });

  // ── Group ────────────────────────────────────────────────
  const group = await prisma.group.create({
    data: { courseId: course.id, teacherId: teacherUser.id, name: 'Test Grup', schedule: 'Pzt-Çar 15:00' },
  });

  // ── StudentGroup ─────────────────────────────────────────
  await prisma.studentGroup.create({
    data: { studentId: studentUser.id, groupId: group.id },
  });

  // ── Lesson ───────────────────────────────────────────────
  const lesson = await prisma.lesson.create({
    data: { groupId: group.id, teacherId: teacherUser.id, lessonNo: 1, videoUrl: 'gs://test/video.mp4' },
  });

  // ── Report (DRAFT) ───────────────────────────────────────
  const draftReport = await prisma.report.create({
    data: {
      lessonId: lesson.id,
      status: 'DRAFT',
      draftReport: { overallScore: 85, genel_sonuc: 'Beklentilere uygundu.', yeterlilikler: 'İyi' },
    },
  });
  await prisma.reportTeacher.create({
    data: { reportId: draftReport.id, teacherId: teacherUser.id, score: 4.2 },
  });

  // ── Report (FINALIZED) ───────────────────────────────────
  const finalReport = await prisma.report.create({
    data: {
      lessonId: lesson.id, adminId: adminUser.id, status: 'FINALIZED',
      draftReport: { overallScore: 92 },
      finalReport: { overallScore: 92, approvedBy: adminUser.id, approvedAt: new Date().toISOString() },
    },
  });
  await prisma.reportTeacher.create({
    data: { reportId: finalReport.id, teacherId: teacherUser.id, score: 4.6 },
  });

  // ── Tokens ───────────────────────────────────────────────
  const makeToken = (user) =>
    jwt.sign({ userId: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '1h' });

  return {
    prisma,
    tokens: { admin: makeToken(adminUser), teacher: makeToken(teacherUser), student: makeToken(studentUser) },
    ids: {
      admin: adminUser.id, teacher: teacherUser.id, student: studentUser.id,
      course: course.id, group: group.id, lesson: lesson.id,
      draftReport: draftReport.id, finalReport: finalReport.id,
    },
  };
}

async function cleanup() {
  await prisma.$disconnect();
}

module.exports = { seedTestData, cleanup, prisma };
