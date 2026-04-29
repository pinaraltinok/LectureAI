const prisma = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * GET /api/student/courses
 * Returns groups the student is enrolled in, with course info.
 */
async function getCourses(req, res) {
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
    groupName: sg.group.name,
    courseName: sg.group.course.course,
    age: sg.group.course.age,
    moduleSize: sg.group.course.moduleSize,
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
}

/**
 * GET /api/student/evaluations
 * Returns evaluation notes from teachers for this student.
 */
async function getEvaluations(req, res) {
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
}

/**
 * POST /api/student/survey/submit
 * Submits a survey with rating (1-5) and optional note.
 */
async function submitSurvey(req, res) {
  const studentId = req.user.userId;
  const { lessonId, rating, note } = req.body;

  if (!lessonId || !rating) throw new AppError('lessonId ve rating gereklidir.', 400);
  if (rating < 1 || rating > 5) throw new AppError('Rating değeri 1-5 arasında olmalıdır.', 400);

  // Verify student is in a group that has this lesson
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { group: { include: { studentGroups: { where: { studentId } } } } },
  });

  if (!lesson || lesson.group.studentGroups.length === 0) {
    throw new AppError('Bu derse kayıtlı değilsiniz.', 403);
  }

  // Check if already submitted
  const existing = await prisma.survey.findFirst({ where: { studentId, lessonId } });
  if (existing) throw new AppError('Bu ders için zaten anket gönderdiniz.', 409);

  const survey = await prisma.survey.create({
    data: { studentId, lessonId, rating: parseInt(rating), note: note || null },
  });

  return res.status(201).json({ id: survey.id, message: 'Anket başarıyla gönderildi.' });
}

/**
 * GET /api/student/surveys
 * Returns all surveys submitted by this student, with lesson & course info.
 */
async function getMySurveys(req, res) {
  const studentId = req.user.userId;

  const surveys = await prisma.survey.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    include: {
      lesson: {
        include: {
          group: {
            include: {
              course: { select: { course: true, age: true, moduleSize: true } },
              teacher: { include: { user: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const result = surveys.map(s => ({
    id: s.id,
    rating: s.rating,
    note: s.note,
    createdAt: s.createdAt,
    lessonNo: s.lesson.lessonNo,
    courseName: s.lesson.group.course.course,
    courseAge: s.lesson.group.course.age,
    moduleSize: s.lesson.group.course.moduleSize,
    teacherName: s.lesson.group.teacher.user.name,
  }));

  return res.json(result);
}

/**
 * GET /api/student/lesson/:lessonId
 * Returns lesson details including video URL and course info.
 */
async function getLessonDetail(req, res) {
  const studentId = req.user.userId;
  const { lessonId } = req.params;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      group: {
        include: {
          course: true,
          teacher: { include: { user: { select: { name: true } } } },
          studentGroups: { where: { studentId }, select: { studentId: true } },
        },
      },
    },
  });

  if (!lesson || lesson.group.studentGroups.length === 0) {
    throw new AppError('Bu derse erişim yetkiniz yok.', 403);
  }

  return res.json({
    id: lesson.id,
    lessonNo: lesson.lessonNo,
    dateTime: lesson.dateTime,
    videoUrl: lesson.videoUrl,
    videoFilename: lesson.videoFilename,
    courseName: lesson.group.course.course,
    moduleSize: lesson.group.course.moduleSize,
    courseAge: lesson.group.course.age,
    teacherName: lesson.group.teacher.user.name,
    schedule: lesson.group.schedule,
  });
}

/**
 * GET /api/student/lesson/:lessonId/notes
 * Returns all timestamped notes for a lesson by the current student.
 */
async function getLessonNotes(req, res) {
  const studentId = req.user.userId;
  const { lessonId } = req.params;

  const notes = await prisma.studentNote.findMany({
    where: { studentId, lessonId },
    orderBy: { timestamp: 'asc' },
  });

  return res.json(notes.map(n => ({
    id: n.id,
    timestamp: n.timestamp,
    note: n.note,
    createdAt: n.createdAt,
  })));
}

/**
 * POST /api/student/lesson/:lessonId/notes
 * Creates a timestamped note on a lesson video.
 */
async function createLessonNote(req, res) {
  const studentId = req.user.userId;
  const { lessonId } = req.params;
  const { timestamp, note } = req.body;

  if (timestamp === undefined || !note) throw new AppError('timestamp ve note gereklidir.', 400);

  // Verify student enrollment
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { group: { include: { studentGroups: { where: { studentId } } } } },
  });
  if (!lesson || lesson.group.studentGroups.length === 0) {
    throw new AppError('Bu derse kayıtlı değilsiniz.', 403);
  }

  const created = await prisma.studentNote.create({
    data: { studentId, lessonId, timestamp: parseInt(timestamp), note },
  });

  return res.status(201).json({ id: created.id, timestamp: created.timestamp, note: created.note, createdAt: created.createdAt });
}

/**
 * PUT /api/student/lesson/:lessonId/notes/:noteId
 */
async function updateLessonNote(req, res) {
  const studentId = req.user.userId;
  const { noteId } = req.params;
  const { note } = req.body;

  if (!note) throw new AppError('Not alanı gereklidir.', 400);

  const existing = await prisma.studentNote.findUnique({ where: { id: noteId } });
  if (!existing) throw new AppError('Not bulunamadı.', 404);
  if (existing.studentId !== studentId) throw new AppError('Bu notu düzenleme yetkiniz yok.', 403);

  const updated = await prisma.studentNote.update({ where: { id: noteId }, data: { note } });
  return res.json({ id: updated.id, timestamp: updated.timestamp, note: updated.note });
}

/**
 * DELETE /api/student/lesson/:lessonId/notes/:noteId
 */
async function deleteLessonNote(req, res) {
  const studentId = req.user.userId;
  const { noteId } = req.params;

  const existing = await prisma.studentNote.findUnique({ where: { id: noteId } });
  if (!existing) throw new AppError('Not bulunamadı.', 404);
  if (existing.studentId !== studentId) throw new AppError('Bu notu silme yetkiniz yok.', 403);

  await prisma.studentNote.delete({ where: { id: noteId } });
  return res.json({ message: 'Not silindi.' });
}

module.exports = { getCourses, getEvaluations, submitSurvey, getMySurveys, getLessonDetail, getLessonNotes, createLessonNote, updateLessonNote, deleteLessonNote };
