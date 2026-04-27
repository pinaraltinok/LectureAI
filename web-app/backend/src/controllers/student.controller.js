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

module.exports = { getCourses, getEvaluations, submitSurvey, getLessonDetail, getLessonNotes, createLessonNote, updateLessonNote, deleteLessonNote };

/**
 * GET /api/student/lesson/:lessonId
 * Returns lesson details including video URL and course info.
 */
async function getLessonDetail(req, res) {
  try {
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
      return res.status(403).json({ error: 'Bu derse erişim yetkiniz yok.' });
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
  } catch (err) {
    console.error('GetLessonDetail error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/student/lesson/:lessonId/notes
 * Returns all timestamped notes for a lesson by the current student.
 */
async function getLessonNotes(req, res) {
  try {
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
  } catch (err) {
    console.error('GetLessonNotes error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/student/lesson/:lessonId/notes
 * Creates a timestamped note on a lesson video.
 */
async function createLessonNote(req, res) {
  try {
    const studentId = req.user.userId;
    const { lessonId } = req.params;
    const { timestamp, note } = req.body;

    if (timestamp === undefined || !note) {
      return res.status(400).json({ error: 'timestamp ve note gereklidir.' });
    }

    // Verify student enrollment
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { group: { include: { studentGroups: { where: { studentId } } } } },
    });
    if (!lesson || lesson.group.studentGroups.length === 0) {
      return res.status(403).json({ error: 'Bu derse kayıtlı değilsiniz.' });
    }

    const created = await prisma.studentNote.create({
      data: { studentId, lessonId, timestamp: parseInt(timestamp), note },
    });

    return res.status(201).json({ id: created.id, timestamp: created.timestamp, note: created.note, createdAt: created.createdAt });
  } catch (err) {
    console.error('CreateLessonNote error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * PUT /api/student/lesson/:lessonId/notes/:noteId
 */
async function updateLessonNote(req, res) {
  try {
    const studentId = req.user.userId;
    const { noteId } = req.params;
    const { note } = req.body;

    if (!note) return res.status(400).json({ error: 'Not alanı gereklidir.' });

    const existing = await prisma.studentNote.findUnique({ where: { id: noteId } });
    if (!existing) return res.status(404).json({ error: 'Not bulunamadı.' });
    if (existing.studentId !== studentId) return res.status(403).json({ error: 'Bu notu düzenleme yetkiniz yok.' });

    const updated = await prisma.studentNote.update({ where: { id: noteId }, data: { note } });
    return res.json({ id: updated.id, timestamp: updated.timestamp, note: updated.note });
  } catch (err) {
    console.error('UpdateLessonNote error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * DELETE /api/student/lesson/:lessonId/notes/:noteId
 */
async function deleteLessonNote(req, res) {
  try {
    const studentId = req.user.userId;
    const { noteId } = req.params;

    const existing = await prisma.studentNote.findUnique({ where: { id: noteId } });
    if (!existing) return res.status(404).json({ error: 'Not bulunamadı.' });
    if (existing.studentId !== studentId) return res.status(403).json({ error: 'Bu notu silme yetkiniz yok.' });

    await prisma.studentNote.delete({ where: { id: noteId } });
    return res.json({ message: 'Not silindi.' });
  } catch (err) {
    console.error('DeleteLessonNote error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
