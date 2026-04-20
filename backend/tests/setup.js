/**
 * Test setup helper — creates test users and returns JWT tokens for each role.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Use a deterministic secret for tests
const JWT_SECRET = process.env.JWT_SECRET || 'lectureai-dev-secret-key-2024';

/**
 * Cleans all data and creates a fresh set of test users and entities.
 * Returns tokens and IDs for use in tests.
 */
async function seedTestData() {
  // Clean in dependency order
  await prisma.badge.deleteMany();
  await prisma.survey.deleteMany();
  await prisma.mentorFeedback.deleteMany();
  await prisma.personalNote.deleteMany();
  await prisma.analysisJob.deleteMany();
  await prisma.lessonEnrollment.deleteMany();
  await prisma.parentStudent.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash('test123', 10);

  // ── Users ──────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: { email: 'admin@test.com', password: hash, name: 'Test Admin', role: 'ADMIN' },
  });

  const teacher = await prisma.user.create({
    data: { email: 'teacher@test.com', password: hash, name: 'Test Teacher', role: 'TEACHER', branch: 'Matematik' },
  });

  const student = await prisma.user.create({
    data: { email: 'student@test.com', password: hash, name: 'Test Student', role: 'STUDENT' },
  });

  const student2 = await prisma.user.create({
    data: { email: 'student2@test.com', password: hash, name: 'Test Student 2', role: 'STUDENT' },
  });

  const parent = await prisma.user.create({
    data: { email: 'parent@test.com', password: hash, name: 'Test Parent', role: 'PARENT' },
  });

  // ── Lesson ─────────────────────────────────────────────────
  const lesson = await prisma.lesson.create({
    data: { title: 'Test Ders', moduleCode: 'TEST101', teacherId: teacher.id },
  });

  // ── Enrollment ─────────────────────────────────────────────
  await prisma.lessonEnrollment.create({
    data: { lessonId: lesson.id, studentId: student.id },
  });

  // ── Parent link ────────────────────────────────────────────
  await prisma.parentStudent.create({
    data: { parentId: parent.id, studentId: student.id },
  });

  // ── Analysis job (DRAFT) ───────────────────────────────────
  const draftJob = await prisma.analysisJob.create({
    data: {
      videoUrl: 'https://test.com/video.mp4',
      teacherId: teacher.id,
      lessonId: lesson.id,
      status: 'DRAFT',
      draftReport: { overallScore: 85, engagement: 'Yüksek', suggestions: ['Test'] },
    },
  });

  // ── Analysis job (FINALIZED) ───────────────────────────────
  const finalizedJob = await prisma.analysisJob.create({
    data: {
      videoUrl: 'https://test.com/video2.mp4',
      teacherId: teacher.id,
      lessonId: lesson.id,
      status: 'FINALIZED',
      draftReport: { overallScore: 92 },
      finalReport: { overallScore: 92, approvedBy: admin.id, approvedAt: new Date().toISOString() },
    },
  });

  // ── Mentor Feedback ────────────────────────────────────────
  const feedback = await prisma.mentorFeedback.create({
    data: { teacherId: teacher.id, studentId: student.id, lessonId: lesson.id, note: 'Test notu' },
  });

  // ── Badge ──────────────────────────────────────────────────
  await prisma.badge.create({
    data: { studentId: student.id, title: 'Test Rozet', description: 'Test açıklama' },
  });

  // ── Generate tokens ────────────────────────────────────────
  const makeToken = (user) =>
    jwt.sign({ userId: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, {
      expiresIn: '1h',
    });

  return {
    prisma,
    tokens: {
      admin: makeToken(admin),
      teacher: makeToken(teacher),
      student: makeToken(student),
      student2: makeToken(student2),
      parent: makeToken(parent),
    },
    ids: {
      admin: admin.id,
      teacher: teacher.id,
      student: student.id,
      student2: student2.id,
      parent: parent.id,
      lesson: lesson.id,
      draftJob: draftJob.id,
      finalizedJob: finalizedJob.id,
      feedback: feedback.id,
    },
  };
}

async function cleanup() {
  await prisma.$disconnect();
}

module.exports = { seedTestData, cleanup, prisma };
