const prisma = require('../config/db');

// ─── Mentorluk & Geri Bildirim ──────────────────────────────

/**
 * GET /api/teacher/lessons/:lessonId/students
 * Returns students enrolled in a specific lesson.
 */
async function getLessonStudents(req, res) {
  try {
    const { lessonId } = req.params;
    const teacherId = req.user.userId;

    // Verify the lesson belongs to this teacher
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, teacherId },
    });

    if (!lesson) {
      return res.status(404).json({ error: 'Ders bulunamadı veya bu derse yetkiniz yok.' });
    }

    const enrollments = await prisma.lessonEnrollment.findMany({
      where: { lessonId },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const students = enrollments.map((e) => e.student);
    return res.json(students);
  } catch (err) {
    console.error('GetLessonStudents error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/teacher/mentor-feedback
 * Sends a mentorship note to a specific student.
 */
async function createMentorFeedback(req, res) {
  try {
    const { studentId, lessonId, note } = req.body;
    const teacherId = req.user.userId;

    if (!studentId || !note) {
      return res.status(400).json({ error: 'studentId ve note gereklidir.' });
    }

    // Verify student exists
    const student = await prisma.user.findFirst({
      where: { id: studentId, role: 'STUDENT' },
    });
    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
    }

    const feedback = await prisma.mentorFeedback.create({
      data: {
        teacherId,
        studentId,
        lessonId: lessonId || null,
        note,
      },
    });

    return res.status(201).json({
      id: feedback.id,
      message: 'Mentorluk notu başarıyla gönderildi.',
    });
  } catch (err) {
    console.error('CreateMentorFeedback error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/teacher/my-feedbacks
 * Returns all mentorship notes written by this teacher.
 */
async function getMyFeedbacks(req, res) {
  try {
    const teacherId = req.user.userId;

    const feedbacks = await prisma.mentorFeedback.findMany({
      where: { teacherId },
      include: {
        student: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = feedbacks.map((f) => ({
      id: f.id,
      studentId: f.student.id,
      studentName: f.student.name,
      lessonId: f.lesson?.id || null,
      lessonTitle: f.lesson?.title || null,
      note: f.note,
      createdAt: f.createdAt,
    }));

    return res.json(result);
  } catch (err) {
    console.error('GetMyFeedbacks error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Raporlar & İçgörüler ───────────────────────────────────

/**
 * GET /api/teacher/reports
 * Returns admin-approved (finalized) analysis reports for this teacher.
 */
async function getReports(req, res) {
  try {
    const teacherId = req.user.userId;

    const jobs = await prisma.analysisJob.findMany({
      where: { teacherId, status: 'FINALIZED' },
      include: {
        lesson: { select: { id: true, title: true, moduleCode: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = jobs.map((j) => ({
      jobId: j.id,
      lessonId: j.lesson?.id || null,
      lessonTitle: j.lesson?.title || null,
      moduleCode: j.lesson?.moduleCode || null,
      finalReport: j.finalReport,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    }));

    return res.json(result);
  } catch (err) {
    console.error('GetReports error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/teacher/reports/:lessonId/surveys
 * Returns aggregated & anonymized survey results for a lesson.
 */
async function getSurveys(req, res) {
  try {
    const { lessonId } = req.params;
    const teacherId = req.user.userId;

    // Verify the lesson belongs to this teacher
    const lesson = await prisma.lesson.findFirst({
      where: { id: lessonId, teacherId },
    });
    if (!lesson) {
      return res.status(404).json({ error: 'Ders bulunamadı veya bu derse yetkiniz yok.' });
    }

    const surveys = await prisma.survey.findMany({
      where: { lessonId },
    });

    if (surveys.length === 0) {
      return res.json({
        lessonId,
        totalResponses: 0,
        averages: { contentQuality: 0, teachingMethod: 0, engagement: 0, materials: 0, overall: 0 },
        anonymousComments: [],
      });
    }

    const avg = (field) =>
      Math.round((surveys.reduce((sum, s) => sum + s[field], 0) / surveys.length) * 10) / 10;

    return res.json({
      lessonId,
      totalResponses: surveys.length,
      averages: {
        contentQuality: avg('contentQuality'),
        teachingMethod: avg('teachingMethod'),
        engagement: avg('engagement'),
        materials: avg('materials'),
        overall: avg('overall'),
      },
      anonymousComments: surveys
        .filter((s) => s.anonymousComment)
        .map((s) => s.anonymousComment),
    });
  } catch (err) {
    console.error('GetSurveys error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/teacher/personal-notes
 * Returns the teacher's personal study notes.
 */
async function getPersonalNotes(req, res) {
  try {
    const teacherId = req.user.userId;

    const notes = await prisma.personalNote.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(notes);
  } catch (err) {
    console.error('GetPersonalNotes error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/teacher/personal-notes
 * Creates a new personal note for the teacher.
 */
async function createPersonalNote(req, res) {
  try {
    const { content, lessonTag } = req.body;
    const teacherId = req.user.userId;

    if (!content) {
      return res.status(400).json({ error: 'Not içeriği gereklidir.' });
    }

    const note = await prisma.personalNote.create({
      data: {
        teacherId,
        content,
        lessonTag: lessonTag || null,
      },
    });

    return res.status(201).json(note);
  } catch (err) {
    console.error('CreatePersonalNote error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

module.exports = {
  getLessonStudents,
  createMentorFeedback,
  getMyFeedbacks,
  getReports,
  getSurveys,
  getPersonalNotes,
  createPersonalNote,
};
