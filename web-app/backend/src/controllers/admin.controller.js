const prisma = require('../config/db');
const { spawn } = require('child_process');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

// GCS client for uploading videos to bucket
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const credentialPath = path.join(projectRoot, 'senior-design-488908-1d5d3e1681ee.json');
let gcsStorage;
try {
  gcsStorage = new Storage({ keyFilename: credentialPath });
} catch (e) {
  console.warn('[GCS] Storage client init failed, video upload to bucket will not work:', e.message);
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
          select: { id: true, finalReport: true },
        },
      },
    });

    const result = teachers.map((t) => {
      const latestJob = t.analysisJobs.length > 0 ? t.analysisJobs[0] : null;
      const fr = latestJob?.finalReport || null;

      // Extract score from any available field
      let lastScore = null;
      if (fr) {
        if (fr.overallScore != null) {
          lastScore = fr.overallScore;
        } else if (fr.yeterlilikler) {
          // Parse "92%" or "%92" → 92 → scale to /20 gives 4.6
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
 * Submits a Vertex AI Custom Job with GPU for video analysis.
 * Polls for completion and updates the AnalysisJob status.
 */
function triggerVideoAnalysis(jobId, videoUri, teacherName) {
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const credentialPath = path.join(projectRoot, 'senior-design-488908-1d5d3e1681ee.json');
  const scriptPath = path.join(projectRoot, 'scripts', 'submit_vertex_job.py');

  console.log(`[Analysis] Triggering Vertex AI job for ${jobId}: ${videoUri}`);

  // Initialize progress
  analysisProgress.set(jobId, {
    stage: 'queued',
    message: 'GPU analiz işi kuyruğa alınıyor...',
    percent: 5,
    startedAt: new Date().toISOString(),
  });

  // Update status to PROCESSING
  prisma.analysisJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSING' },
  }).catch((err) => console.error(`[Analysis] Status update error for ${jobId}:`, err));

  // Submit Vertex AI job
  const args = [
    scriptPath,
    '--video-uri', videoUri,
    '--teacher-name', teacherName || 'Unknown',
    '--credential-path', credentialPath,
  ];

  const child = spawn('python', args, {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: {
      ...process.env,
      PYTHONIOENCODING: 'utf-8',
      GOOGLE_APPLICATION_CREDENTIALS: credentialPath,
    },
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (data) => {
    const text = data.toString();
    stdout += text;
    console.log(`[Vertex:${jobId}] ${text.trim()}`);
  });

  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  child.on('close', async (code) => {
    if (code !== 0) {
      console.error(`[Vertex] Submit failed for ${jobId} (code ${code}): ${stderr}`);
      analysisProgress.set(jobId, { stage: 'failed', message: 'GPU job gönderilemedi', percent: 0 });
      await prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: 'PENDING', adminFeedback: `Vertex AI submit failed: ${stderr.slice(0, 500)}` },
      }).catch(() => {});
      return;
    }

    // Extract Vertex AI job name from output
    let vertexJobName = '';
    try {
      const resultLine = stdout.split('\n').find((l) => l.includes('[RESULT]'));
      if (resultLine) {
        const parsed = JSON.parse(resultLine.substring(resultLine.indexOf('{')));
        vertexJobName = parsed.job_name;
      }
    } catch (e) { /* ignore */ }

    console.log(`[Vertex] Job submitted for ${jobId}: ${vertexJobName}`);

    analysisProgress.set(jobId, {
      stage: 'processing',
      message: 'GPU üzerinde video analiz ediliyor...',
      percent: 30,
      vertexJobName,
    });

    // Poll Vertex AI job for completion
    pollVertexJob(jobId, vertexJobName, videoUri, credentialPath);
  });

  child.on('error', (err) => {
    console.error(`[Vertex] Spawn error for ${jobId}:`, err.message);
  });
}

/**
 * Polls a Vertex AI Custom Job until completion.
 * When done, reads the report from GCS and updates the DB.
 */
function pollVertexJob(jobId, vertexJobName, videoUri, credentialPath) {
  const POLL_INTERVAL = 15000; // 15 seconds
  const MAX_POLLS = 240; // max ~60 minutes
  let pollCount = 0;

  const stageMessages = [
    { at: 3, stage: 'downloading', message: 'Video GPU sunucusuna indiriliyor...', percent: 20 },
    { at: 8, stage: 'processing', message: 'Görüntü işleme devam ediyor...', percent: 40 },
    { at: 15, stage: 'processing', message: 'Yüz ve jest analizi yapılıyor...', percent: 55 },
    { at: 25, stage: 'processing', message: 'Metrikler hesaplanıyor...', percent: 70 },
    { at: 35, stage: 'reporting', message: 'Rapor oluşturuluyor...', percent: 85 },
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

    // Check Vertex AI job status via Python
    try {
      const check = spawn('python', ['-c', `
import os, json
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '${credentialPath.replace(/\\/g, '/')}'
from google.cloud import aiplatform
job = aiplatform.CustomJob.get('${vertexJobName}')
print(json.dumps({'state': str(job.state).split('.')[-1], 'error': str(job.error) if job.error else None}))
`], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

      let out = '';
      check.stdout.on('data', (d) => { out += d.toString(); });
      check.on('close', async (code) => {
        if (code !== 0) return;
        try {
          const status = JSON.parse(out.trim().split('\n').pop());
          console.log(`[Vertex:${jobId}] Poll #${pollCount}: ${status.state}`);

          if (status.state === 'JOB_STATE_SUCCEEDED') {
            clearInterval(interval);
            analysisProgress.set(jobId, { stage: 'uploading', message: "Rapor bucket'tan okunuyor...", percent: 95 });

            // Read report from GCS
            await fetchReportFromGCS(jobId, videoUri, credentialPath);

          } else if (status.state === 'JOB_STATE_FAILED' || status.state === 'JOB_STATE_CANCELLED') {
            clearInterval(interval);
            console.error(`[Vertex] Job ${jobId} failed: ${status.error}`);
            analysisProgress.set(jobId, { stage: 'failed', message: 'GPU analizi başarısız oldu', percent: 0 });
            await prisma.analysisJob.update({
              where: { id: jobId },
              data: { status: 'PENDING', adminFeedback: `Vertex AI failed: ${status.error || 'Unknown'}` },
            }).catch(() => {});
            setTimeout(() => analysisProgress.delete(jobId), 5 * 60 * 1000);
          }
        } catch (e) { /* ignore parse errors */ }
      });
    } catch (e) { /* ignore */ }

    if (pollCount >= MAX_POLLS) {
      clearInterval(interval);
      console.error(`[Vertex] Job ${jobId} timed out after ${MAX_POLLS} polls`);
      analysisProgress.set(jobId, { stage: 'failed', message: 'Analiz zaman aşımına uğradı', percent: 0 });
    }
  }, POLL_INTERVAL);
}

/**
 * Reads the analysis report from GCS after Vertex AI job completes.
 */
async function fetchReportFromGCS(jobId, videoUri, credentialPath) {
  try {
    // Parse the expected report path from the video URI
    const uriPath = videoUri.replace('gs://lectureai_full_videos/', '');
    const parentPath = uriPath.split('/').slice(0, -1).join('/');
    const reportGcsPath = `results/${parentPath}/lecture_report.json`;

    const readScript = `
import os, json
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '${credentialPath.replace(/\\/g, '/')}'
from google.cloud import storage
client = storage.Client()
bucket = client.bucket('lectureai_processed')
blob = bucket.blob('${reportGcsPath}')
if blob.exists():
    print(blob.download_as_text())
else:
    print('NOT_FOUND')
`;

    const child = spawn('python', ['-c', readScript], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });

    child.on('close', async (code) => {
      let draftReport = {};
      if (code === 0 && out.trim() !== 'NOT_FOUND') {
        try {
          draftReport = JSON.parse(out.trim());
        } catch (e) {
          console.error(`[Vertex] Report parse error for ${jobId}:`, e.message);
        }
      }

      await prisma.analysisJob.update({
        where: { id: jobId },
        data: { status: 'DRAFT', draftReport },
      });

      console.log(`[Vertex] Job ${jobId} completed successfully.`);
      analysisProgress.set(jobId, { stage: 'completed', message: 'Analiz tamamlandı!', percent: 100 });
      setTimeout(() => analysisProgress.delete(jobId), 5 * 60 * 1000);
    });
  } catch (err) {
    console.error(`[Vertex] Report fetch error for ${jobId}:`, err.message);
    analysisProgress.set(jobId, { stage: 'failed', message: 'Rapor okunamadı', percent: 0 });
  }
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
};
