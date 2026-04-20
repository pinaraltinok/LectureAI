const prisma = require('../config/db');

/**
 * GET /api/parent/student/overview
 * Returns the child's engagement level and badges.
 */
async function getStudentOverview(req, res) {
  try {
    const parentId = req.user.userId;

    // Find parent-student link
    const links = await prisma.parentStudent.findMany({
      where: { parentId },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            badges: {
              orderBy: { earnedAt: 'desc' },
            },
            receivedFeedbacks: {
              select: { id: true },
            },
            enrollments: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (links.length === 0) {
      return res.status(404).json({ error: 'Bağlı öğrenci bulunamadı.' });
    }

    const results = links.map((link) => {
      const student = link.student;
      // Determine engagement level based on feedback count and badges
      const feedbackCount = student.receivedFeedbacks.length;
      const badgeCount = student.badges.length;
      let engagementLevel = 'Pasif';
      if (badgeCount >= 3 || feedbackCount >= 5) engagementLevel = 'Lider';
      else if (badgeCount >= 1 || feedbackCount >= 2) engagementLevel = 'Aktif';
      else if (feedbackCount >= 1) engagementLevel = 'Katılımcı';

      return {
        studentId: student.id,
        studentName: student.name,
        engagementLevel,
        enrolledCourses: student.enrollments.length,
        badges: student.badges.map((b) => ({
          title: b.title,
          description: b.description,
          earnedAt: b.earnedAt,
        })),
      };
    });

    return res.json(results);
  } catch (err) {
    console.error('GetStudentOverview error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/parent/student/mentor-notes
 * Returns mentorship notes about the parent's child.
 */
async function getStudentMentorNotes(req, res) {
  try {
    const parentId = req.user.userId;

    // Get linked students
    const links = await prisma.parentStudent.findMany({
      where: { parentId },
      select: { studentId: true },
    });

    if (links.length === 0) {
      return res.status(404).json({ error: 'Bağlı öğrenci bulunamadı.' });
    }

    const studentIds = links.map((l) => l.studentId);

    const notes = await prisma.mentorFeedback.findMany({
      where: { studentId: { in: studentIds } },
      include: {
        teacher: { select: { name: true } },
        student: { select: { name: true } },
        lesson: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = notes.map((n) => ({
      id: n.id,
      teacherName: n.teacher.name,
      studentName: n.student.name,
      lessonTitle: n.lesson?.title || null,
      note: n.note,
      createdAt: n.createdAt,
    }));

    return res.json(result);
  } catch (err) {
    console.error('GetStudentMentorNotes error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/parent/quality-approvals
 * Returns whether the child's lessons have passed LectureAI quality approval.
 */
async function getQualityApprovals(req, res) {
  try {
    const parentId = req.user.userId;

    // Get linked students
    const links = await prisma.parentStudent.findMany({
      where: { parentId },
      select: { studentId: true },
    });

    if (links.length === 0) {
      return res.status(404).json({ error: 'Bağlı öğrenci bulunamadı.' });
    }

    const studentIds = links.map((l) => l.studentId);

    // Get enrolled lessons for the students
    const enrollments = await prisma.lessonEnrollment.findMany({
      where: { studentId: { in: studentIds } },
      include: {
        lesson: {
          include: {
            analysisJobs: {
              where: { status: 'FINALIZED' },
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: { finalReport: true, updatedAt: true, status: true },
            },
          },
        },
      },
    });

    // Deduplicate lessons
    const seenLessons = new Set();
    const results = [];
    for (const e of enrollments) {
      if (seenLessons.has(e.lesson.id)) continue;
      seenLessons.add(e.lesson.id);

      const latestJob = e.lesson.analysisJobs[0];
      results.push({
        lessonTitle: e.lesson.title,
        moduleCode: e.lesson.moduleCode,
        status: latestJob ? 'Onaylandı' : 'Beklemede',
        score: latestJob?.finalReport?.overallScore || null,
        approvedAt: latestJob?.updatedAt || null,
      });
    }

    return res.json(results);
  } catch (err) {
    console.error('GetQualityApprovals error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

module.exports = { getStudentOverview, getStudentMentorNotes, getQualityApprovals };
