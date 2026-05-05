/**
 * Report Service — Factory function implementing Dependency Inversion.
 *
 * The `db` parameter (Prisma client) is injected from outside,
 * allowing the service to work with any object that satisfies
 * the same interface (Duck Typing). This enables unit testing
 * with mock database clients.
 *
 * SOLID: Dependency Inversion Principle (Martin, 2017)
 *   "High-level modules should not depend on low-level modules.
 *    Both should depend on abstractions."
 *
 * @param {import('@prisma/client').PrismaClient} db - Injected data access layer
 * @returns {object} Report service methods
 */
const AppError = require('../utils/AppError');

function createReportService(db) {
  async function getDraft(jobId) {
    const report = await db.report.findUnique({
      where: { id: jobId },
      include: {
        reportTeachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
        lesson: { include: { group: { include: { course: true } } } },
      },
    });
    if (!report) throw new AppError('Rapor bulunamadı.', 404);
    return report;
  }

  async function regenerate(jobId, feedback) {
    if (!jobId) throw new AppError('jobId gereklidir.', 400);
    const report = await db.report.findUnique({ where: { id: jobId } });
    if (!report) throw new AppError('Rapor bulunamadı.', 404);

    return db.report.update({
      where: { id: jobId },
      data: {
        adminFeedback: feedback || null,
        status: 'PROCESSING',
        draftReport: {
          ...(typeof report.draftReport === 'object' ? report.draftReport : {}),
          regeneratedAt: new Date().toISOString(),
          adminFeedback: feedback,
        },
      },
    });
  }

  async function finalize(jobId, adminId) {
    if (!jobId) throw new AppError('jobId gereklidir.', 400);
    const report = await db.report.findUnique({ where: { id: jobId } });
    if (!report) throw new AppError('Rapor bulunamadı.', 404);
    if (!report.draftReport) throw new AppError('Onaylanacak taslak rapor bulunamadı.', 400);

    return db.report.update({
      where: { id: jobId },
      data: {
        status: 'FINALIZED',
        adminId,
        finalReport: {
          ...(typeof report.draftReport === 'object' ? report.draftReport : {}),
          approvedBy: adminId,
          approvedAt: new Date().toISOString(),
        },
      },
    });
  }

  async function getTeacherReports(teacherId) {
    const teacher = await db.teacher.findUnique({
      where: { id: teacherId },
      include: { user: { select: { name: true } } },
    });
    if (!teacher) throw new AppError('Eğitmen bulunamadı.', 404);

    const reportTeachers = await db.reportTeacher.findMany({
      where: { teacherId },
      include: {
        report: {
          include: { lesson: { include: { group: { include: { course: true } } } } },
        },
      },
      orderBy: { report: { createdAt: 'desc' } },
    });

    const reports = reportTeachers.map(rt => {
      const j = rt.report;
      const rpt = j.finalReport || j.draftReport || {};
      return {
        jobId: j.id, videoUrl: j.lesson?.videoUrl || rpt._videoUrl || null,
        localVideoUrl: rpt._localVideoUrl || null,
        videoFilename: j.lesson?.videoFilename || null,
        status: j.status, createdAt: j.createdAt,
        courseName: j.lesson?.group?.course?.course || null, moduleSize: j.lesson?.group?.course?.moduleSize || 4,
        lessonNo: j.lesson?.lessonNo || null, groupName: j.lesson?.group?.name || null,
        schedule: j.lesson?.group?.schedule || null, age: j.lesson?.group?.course?.age || null,
        assignedTeacher: teacher.user.name, isUnassigned: false, score: rt.score,
        genel_sonuc: rpt.genel_sonuc || null, yeterlilikler: rpt.yeterlilikler || null,
        speaking_time_rating: rpt.speaking_time_rating || null, feedback_metni: rpt.feedback_metni || null,
      };
    });

    return { teacher: { id: teacher.id, name: teacher.user.name }, reports };
  }

  /**
   * Extracts a numeric score from report JSON.
   * Shared utility for progress calculations.
   */
  function extractScore(reportTeacher) {
    const report = reportTeacher.report;
    const fr = report.finalReport || report.draftReport || {};

    let score = reportTeacher.score;
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
    return Math.round(score * 10) / 10;
  }

  async function getTeacherProgress(teacherId) {
    const reportTeachers = await db.reportTeacher.findMany({
      where: {
        teacherId,
        report: { status: { in: ['DRAFT', 'FINALIZED'] } },
      },
      include: {
        report: {
          include: { lesson: { include: { group: { include: { course: true } } } } },
        },
      },
    });

    return reportTeachers
      .filter(rt => rt.report)
      .map(rt => {
        const lesson = rt.report.lesson;
        const date = lesson?.dateTime || rt.report.createdAt;
        const label = lesson
          ? `${lesson.group?.course?.course || ''} - Ders ${lesson.lessonNo || ''}`
          : '';
        return { date, score: extractScore(rt), label };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  return { getDraft, regenerate, finalize, getTeacherReports, getTeacherProgress, extractScore };
}

module.exports = createReportService;
