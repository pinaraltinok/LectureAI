const prisma = require('../config/db');

/**
 * GET /api/student/courses
 * Returns courses the student is enrolled in, with module-level progress.
 */
async function getCourses(req, res) {
  try {
    const studentId = req.user.userId;

    const enrollments = await prisma.lessonEnrollment.findMany({
      where: { studentId },
      include: {
        lesson: {
          include: {
            teacher: { select: { name: true } },
            surveys: {
              where: { studentId },
              select: { id: true },
            },
          },
        },
      },
    });

    const courses = enrollments.map((e) => ({
      lessonId: e.lesson.id,
      title: e.lesson.title,
      moduleCode: e.lesson.moduleCode,
      teacherName: e.lesson.teacher.name,
      hasSurvey: e.lesson.surveys.length > 0,
    }));

    return res.json(courses);
  } catch (err) {
    console.error('GetCourses error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/student/mentor-notes
 * Returns mentorship notes written by teachers for this student.
 */
async function getMentorNotes(req, res) {
  try {
    const studentId = req.user.userId;

    const notes = await prisma.mentorFeedback.findMany({
      where: { studentId },
      include: {
        teacher: { select: { name: true } },
        lesson: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = notes.map((n) => ({
      id: n.id,
      teacherName: n.teacher.name,
      lessonTitle: n.lesson?.title || null,
      note: n.note,
      createdAt: n.createdAt,
    }));

    return res.json(result);
  } catch (err) {
    console.error('GetMentorNotes error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/student/survey/submit
 * Submits a 5-category survey with optional anonymous comment.
 */
async function submitSurvey(req, res) {
  try {
    const studentId = req.user.userId;
    const { lessonId, contentQuality, teachingMethod, engagement, materials, overall, anonymousComment } = req.body;

    if (!lessonId || !contentQuality || !teachingMethod || !engagement || !materials || !overall) {
      return res.status(400).json({ error: 'Tüm anket alanları ve lessonId gereklidir.' });
    }

    // Verify student is enrolled in this lesson
    const enrollment = await prisma.lessonEnrollment.findFirst({
      where: { studentId, lessonId },
    });
    if (!enrollment) {
      return res.status(403).json({ error: 'Bu derse kayıtlı değilsiniz.' });
    }

    // Check if survey already submitted
    const existing = await prisma.survey.findFirst({
      where: { studentId, lessonId },
    });
    if (existing) {
      return res.status(409).json({ error: 'Bu ders için zaten anket gönderdiniz.' });
    }

    // Validate ranges
    const fields = { contentQuality, teachingMethod, engagement, materials, overall };
    for (const [key, val] of Object.entries(fields)) {
      if (val < 1 || val > 5) {
        return res.status(400).json({ error: `${key} değeri 1-5 arasında olmalıdır.` });
      }
    }

    const survey = await prisma.survey.create({
      data: {
        studentId,
        lessonId,
        contentQuality,
        teachingMethod,
        engagement,
        materials,
        overall,
        anonymousComment: anonymousComment || null,
      },
    });

    return res.status(201).json({
      id: survey.id,
      message: 'Anket başarıyla gönderildi.',
    });
  } catch (err) {
    console.error('SubmitSurvey error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

module.exports = { getCourses, getMentorNotes, submitSurvey };
