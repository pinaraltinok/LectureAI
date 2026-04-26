const prisma = require('../config/db');

/**
 * GET /api/teacher/lessons
 * Returns all groups and their lessons taught by this teacher.
 */
async function getTeacherLessons(req, res) {
  try {
    const teacherId = req.user.userId;
    const groups = await prisma.group.findMany({
      where: { teacherId },
      include: {
        course: true,
        lessons: { orderBy: { lessonNo: 'asc' } },
        studentGroups: { include: { student: { include: { user: { select: { name: true } } } } } },
      },
    });

    const result = groups.map(g => ({
      groupId: g.id,
      courseName: g.course.course,
      age: g.course.age,
      schedule: g.schedule,
      studentCount: g.studentGroups.length,
      lessons: g.lessons.map(l => ({ id: l.id, lessonNo: l.lessonNo, dateTime: l.dateTime })),
    }));

    return res.json(result);
  } catch (err) {
    console.error('GetTeacherLessons error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/teacher/lessons/:groupId/students
 * Returns students in a specific group.
 */
async function getGroupStudents(req, res) {
  try {
    const { groupId } = req.params;
    const teacherId = req.user.userId;

    const group = await prisma.group.findFirst({ where: { id: groupId, teacherId } });
    if (!group) return res.status(404).json({ error: 'Grup bulunamadı veya bu gruba yetkiniz yok.' });

    const studentGroups = await prisma.studentGroup.findMany({
      where: { groupId },
      include: { student: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });

    const students = studentGroups.map(sg => ({
      id: sg.student.id,
      name: sg.student.user.name,
      email: sg.student.user.email,
      age: sg.student.age,
    }));
    return res.json(students);
  } catch (err) {
    console.error('GetGroupStudents error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/teacher/student-evaluation
 * Sends a student evaluation note.
 */
async function createStudentEvaluation(req, res) {
  try {
    const { studentId, note } = req.body;
    const teacherId = req.user.userId;

    if (!studentId || !note) return res.status(400).json({ error: 'studentId ve note gereklidir.' });

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Öğrenci bulunamadı.' });

    const evaluation = await prisma.studentEvaluation.create({
      data: { teacherId, studentId, note },
    });

    return res.status(201).json({ id: evaluation.id, message: 'Değerlendirme notu başarıyla gönderildi.' });
  } catch (err) {
    console.error('CreateStudentEvaluation error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/teacher/my-evaluations
 * Returns all evaluation notes written by this teacher.
 */
async function getMyEvaluations(req, res) {
  try {
    const teacherId = req.user.userId;
    const evaluations = await prisma.studentEvaluation.findMany({
      where: { teacherId },
      include: { student: { include: { user: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    const result = evaluations.map(e => ({
      id: e.id,
      studentId: e.studentId,
      studentName: e.student.user.name,
      note: e.note,
      createdAt: e.createdAt,
    }));
    return res.json(result);
  } catch (err) {
    console.error('GetMyEvaluations error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/teacher/reports
 * Returns analysis reports linked to this teacher.
 */
async function getReports(req, res) {
  try {
    const teacherId = req.user.userId;
    const reportTeachers = await prisma.reportTeacher.findMany({
      where: { teacherId },
      include: {
        report: {
          include: { lesson: { include: { group: { include: { course: true } } } } },
        },
      },
    });

    const result = reportTeachers
      .filter(rt => rt.report && ['DRAFT', 'FINALIZED'].includes(rt.report.status))
      .map(rt => {
        const j = rt.report;
        return {
          jobId: j.id,
          courseName: j.lesson?.group?.course?.course || null,
          lessonNo: j.lesson?.lessonNo || null,
          videoUrl: j.videoUrl,
          videoFilename: j.videoFilename,
          status: j.status,
          score: rt.score,
          finalReport: j.status === 'FINALIZED' ? j.finalReport : j.draftReport,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
        };
      });

    return res.json(result);
  } catch (err) {
    console.error('GetReports error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/teacher/reports/:lessonId/surveys
 * Returns aggregated survey results for a lesson.
 */
async function getSurveys(req, res) {
  try {
    const { lessonId } = req.params;
    const teacherId = req.user.userId;

    const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, teacherId } });
    if (!lesson) return res.status(404).json({ error: 'Ders bulunamadı.' });

    const surveys = await prisma.survey.findMany({ where: { lessonId } });

    if (surveys.length === 0) {
      return res.json({ lessonId, totalResponses: 0, averageRating: 0, notes: [] });
    }

    const avgRating = Math.round((surveys.reduce((s, sv) => s + sv.rating, 0) / surveys.length) * 10) / 10;

    return res.json({
      lessonId,
      totalResponses: surveys.length,
      averageRating: avgRating,
      notes: surveys.filter(s => s.note).map(s => s.note),
    });
  } catch (err) {
    console.error('GetSurveys error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/teacher/stats
 * Returns computed statistics for the teacher dashboard.
 */
async function getTeacherStats(req, res) {
  try {
    const teacherId = req.user.userId;

    const [groups, evaluationCount, reportCount] = await Promise.all([
      prisma.group.findMany({
        where: { teacherId },
        include: { studentGroups: { select: { studentId: true } }, lessons: { include: { surveys: { select: { rating: true } } } } },
      }),
      prisma.studentEvaluation.count({ where: { teacherId } }),
      prisma.reportTeacher.count({ where: { teacherId } }),
    ]);

    const studentIds = new Set(groups.flatMap(g => g.studentGroups.map(sg => sg.studentId)));
    const allSurveys = groups.flatMap(g => g.lessons.flatMap(l => l.surveys));
    const avgScore = allSurveys.length > 0
      ? Math.round((allSurveys.reduce((s, sv) => s + sv.rating, 0) / allSurveys.length) * 10) / 10
      : 0;

    return res.json({
      totalStudents: studentIds.size,
      feedbackScore: avgScore,
      totalGroups: groups.length,
      totalLessons: groups.reduce((s, g) => s + g.lessons.length, 0),
      reportCount,
      evaluationCount,
    });
  } catch (err) {
    console.error('GetTeacherStats error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

module.exports = {
  getTeacherLessons, getGroupStudents, createStudentEvaluation,
  getMyEvaluations, getReports, getSurveys, getTeacherStats,
};
