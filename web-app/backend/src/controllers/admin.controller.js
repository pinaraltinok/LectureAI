const prisma = require('../config/db');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { PubSub } = require('@google-cloud/pubsub');

// ─── GCP Config ─────────────────────────────────────────────
const PROJECT_ID = 'senior-design-488908';
const PUBSUB_TOPIC = 'lecture-analysis-requested';  // Orchestrator dinliyor
const PROCESSED_BUCKET = 'lectureai_processed';     // Orchestrator sonuçları buraya yazar

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const credentialPath = path.join(projectRoot, 'senior-design-488908-1d5d3e1681ee.json');

let gcsStorage;
try {
  gcsStorage = new Storage({ keyFilename: credentialPath });
} catch (e) {
  console.warn('[GCS] Storage client init failed:', e.message);
}

let pubsub;
try {
  pubsub = new PubSub({ projectId: PROJECT_ID, keyFilename: credentialPath });
} catch (e) {
  console.warn('[PubSub] Client init failed:', e.message);
}

const VIDEO_BUCKET = 'lectureai_full_videos';
const VIDEO_PREFIX = 'Lesson_Records';

// In-memory progress tracking for active analysis jobs
const analysisProgress = new Map();

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
    const [teachers, unassignedCount] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'TEACHER' },
        select: {
          id: true,
          name: true,
          email: true,
          branch: true,
          analysisJobs: {
            orderBy: { updatedAt: 'desc' },
            select: { id: true, finalReport: true, draftReport: true, status: true },
          },
        },
      }),
      prisma.analysisJob.count({ where: { teacherId: null } }),
    ]);

    const result = teachers.map((t) => {
      const allReports = t.analysisJobs;
      const latestJob = allReports.length > 0 ? allReports[0] : null;
      const fr = latestJob?.finalReport || latestJob?.draftReport || null;

      let lastScore = null;
      if (fr) {
        if (fr.overallScore != null) {
          lastScore = fr.overallScore;
        } else if (fr.yeterlilikler) {
          const match = String(fr.yeterlilikler).match(/(\d+)/);
          lastScore = match ? parseInt(match[1]) : null;
        }
      }

      return {
        id: t.id,
        name: t.name,
        email: t.email,
        branch: t.branch,
        lastScore,
        latestJobId: latestJob?.id || null,
        reportCount: allReports.length + unassignedCount,
      };
    });

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
    const teacherName = req.body.teacherName || '';

    if (!file && !videoUrl) {
      return res.status(400).json({ error: 'Video dosyası veya videoUrl gereklidir.' });
    }

    let resolvedUrl = videoUrl || null;
    let videoFilename = file ? file.originalname : null;

    // If a file was uploaded via multer, upload it to GCS bucket
    if (file && !videoUrl && gcsStorage) {
      try {
        const gcsFileName = `${VIDEO_PREFIX}/${file.filename}`;
        const localFilePath = path.resolve(file.destination, file.filename);

        await gcsStorage.bucket(VIDEO_BUCKET).upload(localFilePath, {
          destination: gcsFileName,
          metadata: {
            contentType: file.mimetype || 'video/mp4',
            metadata: { originalName: file.originalname },
          },
        });

        resolvedUrl = `gs://${VIDEO_BUCKET}/${gcsFileName}`;
        console.log(`[Upload] Video uploaded to GCS: ${resolvedUrl}`);
      } catch (gcsErr) {
        console.error('[Upload] GCS upload failed, falling back to local:', gcsErr.message);
        resolvedUrl = `/uploads/${file.filename}`;
      }
    } else if (file && !videoUrl) {
      resolvedUrl = `/uploads/${file.filename}`;
    }

    const job = await prisma.analysisJob.create({
      data: {
        videoUrl: resolvedUrl,
        videoFilename,
        status: 'PENDING',
      },
    });

    // Auto-trigger video analysis if a GCS URI is provided
    if (resolvedUrl && (resolvedUrl.startsWith('gs://') || resolvedUrl.startsWith('https://storage.googleapis.com/'))) {
      triggerVideoAnalysis(job.id, resolvedUrl, teacherName);
    }

    return res.status(201).json({
      jobId: job.id,
      status: job.status,
      videoUrl: resolvedUrl,
      message: 'Video başarıyla yüklendi. Analiz kuyruğuna alındı.',
    });
  } catch (err) {
    console.error('UploadAnalysis error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * Publishes analysis request to Pub/Sub topic.
 * The orchestrator pipeline listens on `lecture-analysis-requested`,
 * processes the video, and writes results to GCS:
 *   - lectureai_processed/reports/{video_id}.json
 *   - lectureai_processed/pdfs/{video_id}.pdf
 */
async function triggerVideoAnalysis(jobId, videoUri, teacherName) {
  // Extract video_id from the GCS URI (filename without extension)
  const videoId = extractVideoId(videoUri);

  console.log(`[Analysis] Publishing to Pub/Sub for jobId=${jobId}, video_id=${videoId}`);

  // Initialize progress
  analysisProgress.set(jobId, {
    stage: 'queued',
    message: 'Analiz isteği gönderiliyor...',
    percent: 5,
    startedAt: new Date().toISOString(),
    videoId,
  });

  // Update DB status to PROCESSING
  await prisma.analysisJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSING' },
  }).catch((err) => console.error(`[Analysis] Status update error for ${jobId}:`, err));

  // Publish message to Pub/Sub
  try {
    if (!pubsub) throw new Error('PubSub client not initialized');

    const topic = pubsub.topic(PUBSUB_TOPIC);
    const payload = JSON.stringify({
      video_id: videoId,
      teacher_name: teacherName || 'Teacher',  // Orchestrator bunu bekliyor
    });

    const messageId = await topic.publishMessage({ data: Buffer.from(payload) });
    console.log(`[PubSub] Message ${messageId} published to ${PUBSUB_TOPIC} for video_id=${videoId}`);

    analysisProgress.set(jobId, {
      ...analysisProgress.get(jobId),
      stage: 'processing',
      message: 'Video analiz ediliyor...',
      percent: 20,
    });

    // Start polling GCS for the report
    pollGCSForReport(jobId, videoId);

  } catch (err) {
    console.error(`[PubSub] Publish failed for ${jobId}:`, err.message);
    analysisProgress.set(jobId, { stage: 'failed', message: 'Pub/Sub mesajı gönderilemedi', percent: 0 });
    await prisma.analysisJob.update({
      where: { id: jobId },
      data: { status: 'PENDING', adminFeedback: `PubSub publish failed: ${err.message}` },
    }).catch(() => {});
  }
}

/**
 * Extracts video_id from a GCS URI.
 * e.g. "gs://lectureai_full_videos/Lesson_Records/my_video.mp4" → "my_video"
 */
function extractVideoId(videoUri) {
  const filename = videoUri.split('/').pop();
  return filename.replace(/\.[^.]+$/, ''); // Remove extension
}

/**
 * Polls GCS bucket for report completion.
 * Checks lectureai_processed/reports/{video_id}.json every 5 seconds.
 */
function pollGCSForReport(jobId, videoId) {
  const POLL_INTERVAL = 5000; // 5 seconds — as recommended
  const MAX_POLLS = 720;      // max ~60 minutes
  let pollCount = 0;

  const stageMessages = [
    { at: 6,  stage: 'processing', message: 'Video işleniyor...', percent: 30 },
    { at: 24, stage: 'processing', message: 'Görüntü analizi devam ediyor...', percent: 45 },
    { at: 60, stage: 'processing', message: 'Yüz ve jest analizi yapılıyor...', percent: 60 },
    { at: 120, stage: 'reporting', message: 'Metrikler hesaplanıyor...', percent: 75 },
    { at: 180, stage: 'reporting', message: 'Rapor oluşturuluyor...', percent: 85 },
  ];

  const interval = setInterval(async () => {
    pollCount++;

    // Update stage message based on elapsed polls
    const msg = [...stageMessages].reverse().find((s) => pollCount >= s.at);
    if (msg) {
      analysisProgress.set(jobId, {
        ...analysisProgress.get(jobId),
        stage: msg.stage,
        message: msg.message,
        percent: msg.percent,
      });
    }

    // Check if report JSON exists in GCS
    try {
      if (!gcsStorage) throw new Error('GCS client not initialized');

      const reportBlob = gcsStorage.bucket(PROCESSED_BUCKET).file(`reports/${videoId}.json`);
      const [exists] = await reportBlob.exists();

      if (exists) {
        clearInterval(interval);
        console.log(`[GCS] Report found for video_id=${videoId}, downloading...`);

        analysisProgress.set(jobId, {
          ...analysisProgress.get(jobId),
          stage: 'uploading',
          message: 'Rapor okunuyor...',
          percent: 95,
        });

        // Download and parse the report
        const [content] = await reportBlob.download();
        let draftReport = {};
        try {
          draftReport = JSON.parse(content.toString());
        } catch (e) {
          console.error(`[GCS] Report parse error for ${jobId}:`, e.message);
        }

        // Update DB with the draft report
        await prisma.analysisJob.update({
          where: { id: jobId },
          data: { status: 'DRAFT', draftReport },
        });

        console.log(`[Analysis] Job ${jobId} completed successfully (video_id=${videoId}).`);
        analysisProgress.set(jobId, { stage: 'completed', message: 'Analiz tamamlandı!', percent: 100, videoId });
        setTimeout(() => analysisProgress.delete(jobId), 5 * 60 * 1000);
      } else {
        if (pollCount % 12 === 0) { // Log every ~60 seconds
          console.log(`[GCS] Poll #${pollCount}: report not ready yet for video_id=${videoId}`);
        }
      }
    } catch (e) {
      if (pollCount % 12 === 0) {
        console.error(`[GCS] Poll error for ${jobId}:`, e.message);
      }
    }

    if (pollCount >= MAX_POLLS) {
      clearInterval(interval);
      console.error(`[Analysis] Job ${jobId} timed out after ${MAX_POLLS} polls`);
      analysisProgress.set(jobId, { stage: 'failed', message: 'Analiz zaman aşımına uğradı', percent: 0 });
      await prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: 'PENDING', adminFeedback: 'Analysis timed out waiting for report' },
      }).catch(() => {});
    }
  }, POLL_INTERVAL);
}

/**
 * POST /api/admin/analysis/assign
 * Assigns an uploaded job to a teacher + curriculum/lesson.
 * Accepts: { jobId, teacherId, curriculumId, curriculumName, lessonCode }
 * Auto-creates a Lesson record if one doesn't exist for this curriculum+lessonCode+teacher.
 */
async function assignAnalysis(req, res) {
  try {
    const { jobId, teacherId, curriculumId, curriculumName, lessonCode, lessonId } = req.body;

    if (!jobId || !teacherId) {
      return res.status(400).json({ error: 'jobId ve teacherId gereklidir.' });
    }

    const job = await prisma.analysisJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ error: 'Analiz işi bulunamadı.' });
    }

    // Find or create a lesson for this curriculum + lessonCode + teacher
    let resolvedLessonId = lessonId || null;

    if (!resolvedLessonId && curriculumName && lessonCode) {
      // Try to find existing lesson
      const existingLesson = await prisma.lesson.findFirst({
        where: {
          teacherId,
          moduleCode: lessonCode,
          title: { contains: curriculumId || '' },
        },
      });

      if (existingLesson) {
        resolvedLessonId = existingLesson.id;
      } else {
        // Create new lesson
        const newLesson = await prisma.lesson.create({
          data: {
            title: curriculumName,
            moduleCode: lessonCode,
            teacherId,
          },
        });
        resolvedLessonId = newLesson.id;
      }
    }

    const updated = await prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        teacherId,
        lessonId: resolvedLessonId,
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
      videoUrl: job.videoUrl,
      videoFilename: job.videoFilename,
      draftReport: job.draftReport,
      teacher: job.teacher,
      lesson: job.lesson,
      createdAt: job.createdAt,
      finalReport: job.finalReport,
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

/**
 * GET /api/admin/lessons
 * Returns all lessons for dropdown population.
 */
async function getLessons(req, res) {
  try {
    const lessons = await prisma.lesson.findMany({
      include: {
        teacher: { select: { id: true, name: true } },
      },
      orderBy: { title: 'asc' },
    });

    const result = lessons.map((l) => ({
      id: l.id,
      title: l.title,
      moduleCode: l.moduleCode,
      teacherId: l.teacher.id,
      teacherName: l.teacher.name,
    }));

    return res.json(result);
  } catch (err) {
    console.error('GetLessons error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/admin/analysis/jobs
 * Returns all analysis jobs with status, teacher, lesson info.
 */
async function getAnalysisJobs(req, res) {
  try {
    const jobs = await prisma.analysisJob.findMany({
      include: {
        teacher: { select: { id: true, name: true } },
        lesson: { select: { id: true, title: true, moduleCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = jobs.map((j) => ({
      jobId: j.id,
      videoFilename: j.videoFilename,
      status: j.status,
      teacherId: j.teacher?.id || null,
      teacherName: j.teacher?.name || null,
      lessonId: j.lesson?.id || null,
      lessonTitle: j.lesson?.title || null,
      moduleCode: j.lesson?.moduleCode || null,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    }));

    return res.json(result);
  } catch (err) {
    console.error('GetAnalysisJobs error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/admin/curricula
 * Returns all curriculum programmes from the database.
 */
async function getCurricula(req, res) {
  try {
    const curricula = await prisma.curriculum.findMany({
      orderBy: [{ year: 'desc' }, { code: 'asc' }],
    });
    return res.json(curricula);
  } catch (err) {
    console.error('GetCurricula error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/admin/analysis/progress/:jobId
 * Returns the real-time progress of a running analysis job.
 */
async function getAnalysisProgress(req, res) {
  const { jobId } = req.params;
  const progress = analysisProgress.get(jobId);

  if (progress) {
    return res.json({ jobId, ...progress });
  }

  // If no in-memory progress, check DB status
  try {
    const job = await prisma.analysisJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (!job) {
      return res.status(404).json({ error: 'İş bulunamadı.' });
    }

    const statusMap = {
      PENDING: { stage: 'queued', message: 'Sırada bekliyor...', percent: 0 },
      PROCESSING: { stage: 'processing', message: 'Analiz devam ediyor...', percent: 50 },
      DRAFT: { stage: 'completed', message: 'Analiz tamamlandı!', percent: 100 },
      FINALIZED: { stage: 'completed', message: 'Rapor onaylandı.', percent: 100 },
    };
    return res.json({ jobId, ...(statusMap[job.status] || statusMap.PENDING) });
  } catch (err) {
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/admin/teacher/:teacherId/reports
 * Returns all analysis reports for a specific teacher (all statuses),
 * plus any unassigned reports (teacherId is null) so admin can see them.
 */
async function getTeacherReports(req, res) {
  try {
    const { teacherId } = req.params;

    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      select: { id: true, name: true, branch: true },
    });
    if (!teacher) {
      return res.status(404).json({ error: 'Eğitmen bulunamadı.' });
    }

    // Get this teacher's reports AND unassigned reports
    const jobs = await prisma.analysisJob.findMany({
      where: {
        OR: [
          { teacherId },
          { teacherId: null },
        ],
      },
      include: {
        lesson: { select: { id: true, title: true, moduleCode: true } },
        teacher: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const reports = jobs.map((j) => {
      const report = j.finalReport || j.draftReport || {};
      return {
        jobId: j.id,
        videoUrl: j.videoUrl,
        videoFilename: j.videoFilename,
        status: j.status,
        createdAt: j.createdAt,
        lessonTitle: j.lesson?.title || null,
        moduleCode: j.lesson?.moduleCode || null,
        assignedTeacher: j.teacher?.name || null,
        isUnassigned: j.teacherId === null,
        genel_sonuc: report.genel_sonuc || null,
        yeterlilikler: report.yeterlilikler || null,
        speaking_time_rating: report.speaking_time_rating || null,
        feedback_metni: report.feedback_metni || null,
      };
    });

    return res.json({ teacher, reports });
  } catch (err) {
    console.error('GetTeacherReports error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/admin/sync-reports
 * Scans GCS lectureai_processed/reports/ for JSON files and creates
 * AnalysisJob records for any reports not yet in the database.
 */
async function syncGCSReports(req, res) {
  try {
    if (!gcsStorage) {
      return res.status(500).json({ error: 'GCS client not initialized' });
    }

    const bucket = gcsStorage.bucket(PROCESSED_BUCKET);
    const [files] = await bucket.getFiles({ prefix: 'reports/' });

    const jsonFiles = files.filter((f) => f.name.endsWith('.json'));
    let synced = 0;
    let skipped = 0;

    for (const file of jsonFiles) {
      // Extract video_id from filename: reports/my_video.json → my_video
      const videoId = file.name.replace('reports/', '').replace('.json', '');
      if (!videoId) continue;

      // Check if we already have this report in DB (by videoFilename or videoUrl containing videoId)
      const existing = await prisma.analysisJob.findFirst({
        where: {
          OR: [
            { videoFilename: { contains: videoId } },
            { videoUrl: { contains: videoId } },
          ],
          status: { in: ['DRAFT', 'FINALIZED'] },
          draftReport: { not: null },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Also check if there's a PROCESSING/PENDING job that should be updated
      const pendingJob = await prisma.analysisJob.findFirst({
        where: {
          OR: [
            { videoFilename: { contains: videoId } },
            { videoUrl: { contains: videoId } },
          ],
          status: { in: ['PROCESSING', 'PENDING'] },
        },
      });

      // Download and parse the report
      const [content] = await file.download();
      let reportData = {};
      try {
        reportData = JSON.parse(content.toString());
      } catch (e) {
        console.error(`[Sync] Failed to parse ${file.name}:`, e.message);
        continue;
      }

      if (pendingJob) {
        // Update existing pending/processing job
        await prisma.analysisJob.update({
          where: { id: pendingJob.id },
          data: { status: 'DRAFT', draftReport: reportData },
        });
        synced++;
      } else {
        // Create new job record for orphan GCS report
        await prisma.analysisJob.create({
          data: {
            videoFilename: videoId,
            videoUrl: `gs://lectureai_full_videos/Lesson_Records/${videoId}.mp4`,
            status: 'DRAFT',
            draftReport: reportData,
          },
        });
        synced++;
      }
    }

    console.log(`[Sync] GCS reports synced: ${synced} new, ${skipped} already exist, ${jsonFiles.length} total in bucket`);
    return res.json({ synced, skipped, total: jsonFiles.length });
  } catch (err) {
    console.error('SyncGCSReports error:', err);
    return res.status(500).json({ error: 'Senkronizasyon hatası: ' + err.message });
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
  getLessons,
  getAnalysisJobs,
  getCurricula,
  getAnalysisProgress,
  getTeacherReports,
  syncGCSReports,
};
