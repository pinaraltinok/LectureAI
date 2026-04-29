const prisma = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * GET /api/teacher/lessons
 * Returns all groups and their lessons taught by this teacher.
 */
async function getTeacherLessons(req, res) {
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
    groupName: g.name,
    courseName: g.course.course,
    age: g.course.age,
    moduleSize: g.course.moduleSize,
    schedule: g.schedule,
    studentCount: g.studentGroups.length,
    lessons: g.lessons.map(l => ({ id: l.id, lessonNo: l.lessonNo, dateTime: l.dateTime })),
  }));

  return res.json(result);
}

/**
 * GET /api/teacher/lessons/:groupId/students
 * Returns students in a specific group.
 */
async function getGroupStudents(req, res) {
  const { groupId } = req.params;
  const teacherId = req.user.userId;

  const group = await prisma.group.findFirst({ where: { id: groupId, teacherId } });
  if (!group) throw new AppError('Grup bulunamadı veya bu gruba yetkiniz yok.', 404);

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
}

/**
 * POST /api/teacher/student-evaluation
 * Sends a student evaluation note.
 */
async function createStudentEvaluation(req, res) {
  const { studentId, note } = req.body;
  const teacherId = req.user.userId;

  if (!studentId || !note) throw new AppError('studentId ve note gereklidir.', 400);

  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student) throw new AppError('Öğrenci bulunamadı.', 404);

  const evaluation = await prisma.studentEvaluation.create({
    data: { teacherId, studentId, note },
  });

  return res.status(201).json({ id: evaluation.id, message: 'Değerlendirme notu başarıyla gönderildi.' });
}

/**
 * GET /api/teacher/my-evaluations
 * Returns all evaluation notes written by this teacher.
 */
async function getMyEvaluations(req, res) {
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
}

/**
 * GET /api/teacher/reports
 * Returns analysis reports linked to this teacher.
 */
async function getReports(req, res) {
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
        moduleSize: j.lesson?.group?.course?.moduleSize || 4,
        lessonNo: j.lesson?.lessonNo || null,
        videoUrl: j.lesson?.videoUrl || null,
        videoFilename: j.lesson?.videoFilename || null,
        status: j.status,
        score: rt.score,
        finalReport: j.status === 'FINALIZED' ? j.finalReport : j.draftReport,
        createdAt: j.createdAt,
        updatedAt: j.updatedAt,
      };
    });

  return res.json(result);
}

/**
 * GET /api/teacher/reports/:lessonId/surveys
 * Returns aggregated survey results for a lesson.
 */
async function getSurveys(req, res) {
  const { lessonId } = req.params;
  const teacherId = req.user.userId;

  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, teacherId } });
  if (!lesson) throw new AppError('Ders bulunamadı.', 404);

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
}

/**
 * GET /api/teacher/stats
 * Returns computed statistics for the teacher dashboard.
 */
async function getTeacherStats(req, res) {
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
}

/**
 * PUT /api/teacher/student-evaluation/:id
 * Updates an existing evaluation note (only by the original teacher).
 */
async function updateStudentEvaluation(req, res) {
  const { id } = req.params;
  const { note } = req.body;
  const teacherId = req.user.userId;

  if (!note) throw new AppError('Not alanı gereklidir.', 400);

  const evaluation = await prisma.studentEvaluation.findUnique({ where: { id } });
  if (!evaluation) throw new AppError('Değerlendirme bulunamadı.', 404);
  if (evaluation.teacherId !== teacherId) throw new AppError('Bu değerlendirmeyi düzenleme yetkiniz yok.', 403);

  await prisma.studentEvaluation.update({ where: { id }, data: { note } });
  return res.json({ message: 'Değerlendirme başarıyla güncellendi.' });
}

/**
 * DELETE /api/teacher/student-evaluation/:id
 * Deletes an evaluation note (only by the original teacher).
 */
async function deleteStudentEvaluation(req, res) {
  const { id } = req.params;
  const teacherId = req.user.userId;

  const evaluation = await prisma.studentEvaluation.findUnique({ where: { id } });
  if (!evaluation) throw new AppError('Değerlendirme bulunamadı.', 404);
  if (evaluation.teacherId !== teacherId) throw new AppError('Bu değerlendirmeyi silme yetkiniz yok.', 403);

  await prisma.studentEvaluation.delete({ where: { id } });
  return res.json({ message: 'Değerlendirme başarıyla silindi.' });
}

/**
 * GET /api/teacher/progress
 * Returns time-series progress data for the authenticated teacher's chart.
 */
async function getMyProgress(req, res) {
  const teacherId = req.user.userId;

  const reportTeachers = await prisma.reportTeacher.findMany({
    where: {
      teacherId,
      report: { status: { in: ['DRAFT', 'FINALIZED'] } },
    },
    include: {
      report: {
        include: {
          lesson: {
            include: { group: { include: { course: true } } },
          },
        },
      },
    },
  });

  const dataPoints = reportTeachers
    .filter(rt => rt.report)
    .map(rt => {
      const report = rt.report;
      const fr = report.finalReport || report.draftReport || {};
      const lesson = report.lesson;

      let score = rt.score;
      if (score == null && fr.overallScore != null) score = fr.overallScore;
      if (score == null && fr.genel_sonuc != null) {
        const parsed = parseFloat(fr.genel_sonuc);
        if (!isNaN(parsed)) score = parsed;
      }
      if (score == null && fr.yeterlilikler) {
        const map = { 'çok iyi': 5, 'iyi': 4, 'orta': 3, 'geliştirilmeli': 2, 'düşük': 2, 'yetersiz': 1 };
        score = map[fr.yeterlilikler.toLowerCase()] || null;
      }
      if (score == null) score = 3;
      if (score > 5) score = score / 20;

      const date = lesson?.dateTime || report.createdAt;
      const label = lesson
        ? `${lesson.group?.course?.course || ''} - Ders ${lesson.lessonNo || ''}`
        : '';

      return { date, score: Math.round(score * 10) / 10, label };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return res.json(dataPoints);
}

module.exports = {
  getTeacherLessons, getGroupStudents, createStudentEvaluation,
  updateStudentEvaluation, deleteStudentEvaluation,
  getMyEvaluations, getReports, getSurveys, getTeacherStats,
  getMyProgress,
};
