const prisma = require('../config/db');

/**
 * GET /api/student/courses
 * Returns groups the student is enrolled in, with course info.
 */
async function getCourses(req, res) {
  try {
    const studentId = req.user.userId;

    const studentGroups = await prisma.studentGroup.findMany({
      where: { studentId },
      include: {
        group: {
          include: {
            course: true,
            teacher: { include: { user: { select: { name: true } } } },
            lessons: {
              orderBy: { lessonNo: 'asc' },
              include: {
                surveys: { where: { studentId }, select: { id: true } },
              },
            },
          },
        },
      },
    });

    const courses = studentGroups.map(sg => ({
      groupId: sg.group.id,
      courseName: sg.group.course.course,
      age: sg.group.course.age,
      teacherName: sg.group.teacher.user.name,
      schedule: sg.group.schedule,
      lessons: sg.group.lessons.map(l => ({
        lessonId: l.id,
        lessonNo: l.lessonNo,
        dateTime: l.dateTime,
        hasSurvey: l.surveys.length > 0,
      })),
    }));

    return res.json(courses);
  } catch (err) {
    console.error('GetCourses error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/student/evaluations
 * Returns evaluation notes from teachers for this student.
 */
async function getEvaluations(req, res) {
  try {
    const studentId = req.user.userId;

    const evaluations = await prisma.studentEvaluation.findMany({
      where: { studentId },
      include: {
        teacher: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = evaluations.map(e => ({
      id: e.id,
      teacherName: e.teacher.user.name,
      note: e.note,
      createdAt: e.createdAt,
    }));

    return res.json(result);
  } catch (err) {
    console.error('GetEvaluations error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/student/survey/submit
 * Submits a survey with rating (1-5) and optional note.
 */
async function submitSurvey(req, res) {
  try {
    const studentId = req.user.userId;
    const { lessonId, rating, note } = req.body;

    if (!lessonId || !rating) {
      return res.status(400).json({ error: 'lessonId ve rating gereklidir.' });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating değeri 1-5 arasında olmalıdır.' });
    }

    // Verify student is in a group that has this lesson
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { group: { include: { studentGroups: { where: { studentId } } } } },
    });

    if (!lesson || lesson.group.studentGroups.length === 0) {
      return res.status(403).json({ error: 'Bu derse kayıtlı değilsiniz.' });
    }

    // Check if already submitted
    const existing = await prisma.survey.findFirst({ where: { studentId, lessonId } });
    if (existing) {
      return res.status(409).json({ error: 'Bu ders için zaten anket gönderdiniz.' });
    }

    const survey = await prisma.survey.create({
      data: { studentId, lessonId, rating: parseInt(rating), note: note || null },
    });

    return res.status(201).json({ id: survey.id, message: 'Anket başarıyla gönderildi.' });
  } catch (err) {
    console.error('SubmitSurvey error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

module.exports = { getCourses, getEvaluations, submitSurvey };
