const prisma = require('../config/db');

/**
 * GET /api/admin/stats
 * Institution-wide statistics: average score, active teachers, pending analyses.
 */
async function getStats(req, res) {
  try {
    const [activeTeachers, totalStudents, totalLessons, pendingAnalysis, finalizedJobs] =
      await Promise.all([
        prisma.user.count({ where: { role: 'TEACHER' } }),
        prisma.user.count({ where: { role: 'STUDENT' } }),
        prisma.lesson.count(),
        prisma.analysisJob.count({
          where: { status: { in: ['PENDING', 'PROCESSING', 'DRAFT'] } },
        }),
        prisma.analysisJob.findMany({
          where: { status: 'FINALIZED', finalReport: { not: null } },
          select: { finalReport: true },
        }),
      ]);

    // Calculate average institution score from finalized reports
    let institutionScore = 0;
    if (finalizedJobs.length > 0) {
      const scores = finalizedJobs
        .map((j) => (j.finalReport && typeof j.finalReport === 'object' ? j.finalReport.overallScore : null))
        .filter((s) => s !== null && s !== undefined);
      if (scores.length > 0) {
        institutionScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      }
    }

    return res.json({
      institutionScore,
      activeTeachers,
      totalStudents,
      totalLessons,
      pendingAnalysis,
    });
  } catch (err) {
    console.error('GetStats error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/admin/teachers
 * List all teachers with their branches and latest finalized AI scores.
 */
async function getTeachers(req, res) {
  try {
    const teachers = await prisma.user.findMany({
      where: { role: 'TEACHER' },
      select: {
        id: true,
        name: true,
        email: true,
        branch: true,
        analysisJobs: {
          where: { status: 'FINALIZED', finalReport: { not: null } },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { finalReport: true },
        },
      },
    });

    const result = teachers.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      branch: t.branch,
      lastScore:
        t.analysisJobs.length > 0 && t.analysisJobs[0].finalReport
          ? t.analysisJobs[0].finalReport.overallScore || null
          : null,
    }));

    return res.json(result);
  } catch (err) {
    console.error('GetTeachers error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/admin/analysis/upload
 * Uploads a lesson video. Returns a jobId.
 * In production, the file would be stored to GCS; here we store metadata only.
 */
async function uploadAnalysis(req, res) {
  try {
    const file = req.file;
    const videoUrl = req.body.videoUrl;

    if (!file && !videoUrl) {
      return res.status(400).json({ error: 'Video dosyası veya videoUrl gereklidir.' });
    }

    const job = await prisma.analysisJob.create({
      data: {
        videoUrl: videoUrl || (file ? `/uploads/${file.filename}` : null),
        videoFilename: file ? file.originalname : null,
        status: 'PENDING',
      },
    });

    return res.status(201).json({
      jobId: job.id,
      status: job.status,
      message: 'Video başarıyla yüklendi. Analiz kuyruğuna alındı.',
    });
  } catch (err) {
    console.error('UploadAnalysis error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/admin/analysis/assign
 * Assigns an uploaded job to a teacher + lesson.
 */
async function assignAnalysis(req, res) {
  try {
    const { jobId, teacherId, lessonId } = req.body;

    if (!jobId || !teacherId || !lessonId) {
      return res.status(400).json({ error: 'jobId, teacherId ve lessonId gereklidir.' });
    }

    const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ error: 'Analiz işi bulunamadı.' });
    }

    const updated = await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        teacherId,
        lessonId,
        status: 'PROCESSING',
      },
    });

    return res.json({
      jobId: updated.id,
      status: updated.status,
      message: 'Analiz başarıyla atandı. İşleniyor.',
    });
  } catch (err) {
    console.error('AssignAnalysis error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/admin/analysis/draft/:jobId
 * Returns the AI-generated draft report for a specific job.
 */
async function getDraft(req, res) {
  try {
    const { jobId } = req.params;

    const job = await prisma.analysisJob.findUnique({
      where: { id: jobId },
      include: {
        teacher: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true, moduleCode: true } },
      },
    });

    if (!job) {
      return res.status(404).json({ error: 'Analiz işi bulunamadı.' });
    }

    return res.json({
      jobId: job.id,
      status: job.status,
      draftReport: job.draftReport,
      teacher: job.teacher,
      lesson: job.lesson,
      createdAt: job.createdAt,
    });
  } catch (err) {
    console.error('GetDraft error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/admin/analysis/regenerate
 * Requests AI to regenerate the report with admin feedback.
 */
async function regenerateAnalysis(req, res) {
  try {
    const { jobId, feedback } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId gereklidir.' });
    }

    const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ error: 'Analiz işi bulunamadı.' });
    }

    // In production, this would trigger an AI re-analysis pipeline.
    // Here we simulate by updating status and storing admin feedback.
    const updated = await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        adminFeedback: feedback || null,
        status: 'PROCESSING',
        draftReport: {
          ...(typeof job.draftReport === 'object' ? job.draftReport : {}),
          regeneratedAt: new Date().toISOString(),
          adminFeedback: feedback,
        },
      },
    });

    return res.json({
      jobId: updated.id,
      status: updated.status,
      message: 'Rapor yeniden oluşturulması için kuyruğa alındı.',
    });
  } catch (err) {
    console.error('RegenerateAnalysis error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/admin/analysis/finalize
 * Approves the draft report. Seals and publishes it.
 */
async function finalizeAnalysis(req, res) {
  try {
    const { jobId } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'jobId gereklidir.' });
    }

    const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ error: 'Analiz işi bulunamadı.' });
    }

    if (!job.draftReport) {
      return res.status(400).json({ error: 'Onaylanacak taslak rapor bulunamadı.' });
    }

    const updated = await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: 'FINALIZED',
        finalReport: {
          ...(typeof job.draftReport === 'object' ? job.draftReport : {}),
          approvedBy: req.user.userId,
          approvedAt: new Date().toISOString(),
        },
      },
    });

    return res.json({
      jobId: updated.id,
      status: updated.status,
      message: 'Rapor onaylandı ve yayınlandı.',
    });
  } catch (err) {
    console.error('FinalizeAnalysis error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

module.exports = {
  getStats,
  getTeachers,
  uploadAnalysis,
  assignAnalysis,
  getDraft,
  regenerateAnalysis,
  finalizeAnalysis,
};
