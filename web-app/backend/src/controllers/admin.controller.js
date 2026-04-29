/**
 * Admin Controller — Thin Controller Layer.
 *
 * This controller is a lightweight adapter between HTTP requests and service
 * layer methods. It handles only:
 *   1. Request parsing (extracting params, body, query)
 *   2. Delegating to appropriate service
 *   3. Formatting the HTTP response
 *
 * All business logic resides in the services/ directory.
 *
 * Architecture: 3-Tier Layered Architecture (Buschmann et al., POSA, 1996)
 *   Routes (HTTP) → Controller (thin) → Service (logic) → Prisma (data)
 *
 * SOLID: Single Responsibility — HTTP request/response handling only
 */
const prisma = require('../config/db');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { PubSub } = require('@google-cloud/pubsub');
const AppError = require('../utils/AppError');
const {
  GCP_PROJECT_ID, PUBSUB_TOPIC, PROCESSED_BUCKET,
  VIDEO_BUCKET, VIDEO_PREFIX, GCS_POLL_INTERVAL, GCS_MAX_POLLS,
} = require('../config/constants');

// ─── Service Layer Imports (via Composition Root — DIP) ─────
const { reportService, userService, courseService, groupService } = require('../services');

// ─── GCP Clients ────────────────────────────────────────────
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const credentialPath = path.join(projectRoot, 'senior-design-488908-1d5d3e1681ee.json');

let gcsStorage;
try { gcsStorage = new Storage({ keyFilename: credentialPath }); } catch (e) { console.warn('[GCS] Storage client init failed:', e.message); }

let pubsub;
try { pubsub = new PubSub({ projectId: GCP_PROJECT_ID, keyFilename: credentialPath }); } catch (e) { console.warn('[PubSub] Client init failed:', e.message); }

const analysisProgress = new Map();

// ═══════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════
async function getStats(req, res) {
  const [activeTeachers, totalStudents, totalLessons, pendingAnalysis, finalizedJobs] = await Promise.all([
    prisma.teacher.count(),
    prisma.student.count(),
    prisma.lesson.count(),
    prisma.report.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
    prisma.report.findMany({ where: { status: 'FINALIZED', finalReport: { not: null } }, select: { finalReport: true } }),
  ]);

  let institutionScore = 0;
  if (finalizedJobs.length > 0) {
    const scores = finalizedJobs.map(j => j.finalReport?.overallScore).filter(s => s != null);
    if (scores.length > 0) institutionScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }

  return res.json({ institutionScore, activeTeachers, totalStudents, totalLessons, pendingAnalysis });
}

// ═══════════════════════════════════════════════════════════
// TEACHERS
// ═══════════════════════════════════════════════════════════
async function getTeachers(req, res) {
  const teachers = await prisma.teacher.findMany({
    include: {
      user: { select: { id: true, name: true, email: true, phone: true } },
      reportTeachers: { orderBy: { report: { updatedAt: 'desc' } }, include: { report: { select: { id: true, finalReport: true, draftReport: true, status: true } } } },
    },
  });

  const result = teachers.map(t => {
    const allReports = t.reportTeachers;
    const latest = allReports[0]?.report || null;
    const fr = latest?.finalReport || latest?.draftReport || null;
    let lastScore = t.reportTeachers[0]?.score || null;
    if (!lastScore && fr?.overallScore != null) lastScore = fr.overallScore;

    return {
      id: t.id, name: t.user.name, email: t.user.email, phone: t.user.phone,
      startOfDate: t.startOfDate, lastScore, latestJobId: latest?.id || null, reportCount: allReports.length,
    };
  });

  return res.json(result);
}

// ═══════════════════════════════════════════════════════════
// UPLOAD & ANALYSIS (stays in controller — cloud I/O heavy)
// ═══════════════════════════════════════════════════════════
async function uploadAnalysis(req, res) {
  const file = req.file;
  const videoUrl = req.body.videoUrl;
  const teacherName = req.body.teacherName || '';

  if (!file && !videoUrl) throw new AppError('Video dosyası veya videoUrl gereklidir.', 400);

  let resolvedUrl = videoUrl || null;
  let videoFilename = file ? file.originalname : null;

  if (file && !videoUrl && gcsStorage) {
    try {
      const gcsFileName = `${VIDEO_PREFIX}/${file.filename}`;
      const localFilePath = path.resolve(file.destination, file.filename);
      await gcsStorage.bucket(VIDEO_BUCKET).upload(localFilePath, { destination: gcsFileName, metadata: { contentType: file.mimetype || 'video/mp4', metadata: { originalName: file.originalname } } });
      resolvedUrl = `gs://${VIDEO_BUCKET}/${gcsFileName}`;
    } catch (gcsErr) {
      console.error('[Upload] GCS upload failed:', gcsErr.message);
      resolvedUrl = `/uploads/${file.filename}`;
    }
  } else if (file && !videoUrl) {
    resolvedUrl = `/uploads/${file.filename}`;
  }

  const report = await prisma.report.create({ data: { status: 'PENDING' } });

  if (resolvedUrl) {
    await prisma.report.update({ where: { id: report.id }, data: { draftReport: { _videoUrl: resolvedUrl, _videoFilename: videoFilename } } });
  }

  if (resolvedUrl && (resolvedUrl.startsWith('gs://') || resolvedUrl.startsWith('https://storage.googleapis.com/'))) {
    triggerVideoAnalysis(report.id, resolvedUrl, teacherName);
  }

  return res.status(201).json({ jobId: report.id, status: report.status, videoUrl: resolvedUrl, message: 'Video başarıyla yüklendi.' });
}

async function triggerVideoAnalysis(jobId, videoUri, teacherName) {
  const videoId = videoUri.split('/').pop().replace(/\.[^.]+$/, '');
  analysisProgress.set(jobId, { stage: 'queued', message: 'Analiz isteği gönderiliyor...', percent: 5, startedAt: new Date().toISOString(), videoId });
  await prisma.report.update({ where: { id: jobId }, data: { status: 'PROCESSING' } }).catch(err => console.error(`[Analysis] Status update error:`, err));

  try {
    if (!pubsub) throw new Error('PubSub client not initialized');
    const topic = pubsub.topic(PUBSUB_TOPIC);
    const payload = JSON.stringify({ video_id: videoId, teacher_name: teacherName || 'Teacher' });
    const messageId = await topic.publishMessage({ data: Buffer.from(payload) });
    console.log(`[PubSub] Message ${messageId} published for video_id=${videoId}`);
    analysisProgress.set(jobId, { ...analysisProgress.get(jobId), stage: 'processing', message: 'Video analiz ediliyor...', percent: 20 });
    pollGCSForReport(jobId, videoId);
  } catch (err) {
    console.error(`[PubSub] Publish failed:`, err.message);
    analysisProgress.set(jobId, { stage: 'failed', message: 'Pub/Sub mesajı gönderilemedi', percent: 0 });
    await prisma.report.update({ where: { id: jobId }, data: { status: 'PENDING', adminFeedback: `PubSub publish failed: ${err.message}` } }).catch(() => {});
  }
}

function pollGCSForReport(jobId, videoId) {
  let pollCount = 0;
  const stageMessages = [
    { at: 6, stage: 'processing', message: 'Video işleniyor...', percent: 30 },
    { at: 24, stage: 'processing', message: 'Görüntü analizi devam ediyor...', percent: 45 },
    { at: 60, stage: 'processing', message: 'Yüz ve jest analizi yapılıyor...', percent: 60 },
    { at: 120, stage: 'reporting', message: 'Metrikler hesaplanıyor...', percent: 75 },
    { at: 180, stage: 'reporting', message: 'Rapor oluşturuluyor...', percent: 85 },
  ];

  const interval = setInterval(async () => {
    pollCount++;
    const msg = [...stageMessages].reverse().find(s => pollCount >= s.at);
    if (msg) analysisProgress.set(jobId, { ...analysisProgress.get(jobId), stage: msg.stage, message: msg.message, percent: msg.percent });

    try {
      if (!gcsStorage) throw new Error('GCS client not initialized');
      const reportBlob = gcsStorage.bucket(PROCESSED_BUCKET).file(`reports/${videoId}.json`);
      const [exists] = await reportBlob.exists();
      if (exists) {
        clearInterval(interval);
        analysisProgress.set(jobId, { ...analysisProgress.get(jobId), stage: 'uploading', message: 'Rapor okunuyor...', percent: 95 });
        const [content] = await reportBlob.download();
        let draftReport = {};
        try { draftReport = JSON.parse(content.toString()); } catch (e) { console.error(`[GCS] Report parse error:`, e.message); }
        await prisma.report.update({ where: { id: jobId }, data: { status: 'DRAFT', draftReport } });
        analysisProgress.set(jobId, { stage: 'completed', message: 'Analiz tamamlandı!', percent: 100, videoId });
        setTimeout(() => analysisProgress.delete(jobId), 5 * 60 * 1000);
      }
    } catch (e) { if (pollCount % 12 === 0) console.error(`[GCS] Poll error:`, e.message); }

    if (pollCount >= GCS_MAX_POLLS) {
      clearInterval(interval);
      analysisProgress.set(jobId, { stage: 'failed', message: 'Analiz zaman aşımına uğradı', percent: 0 });
      await prisma.report.update({ where: { id: jobId }, data: { status: 'PENDING', adminFeedback: 'Analysis timed out' } }).catch(() => {});
    }
  }, GCS_POLL_INTERVAL);
}

// ═══════════════════════════════════════════════════════════
// ASSIGN ANALYSIS
// ═══════════════════════════════════════════════════════════
async function assignAnalysis(req, res) {
  const { jobId, teacherId, lessonId, groupId, lessonCode, lessonDate } = req.body;
  if (!jobId || !teacherId) throw new AppError('jobId ve teacherId gereklidir.', 400);

  const report = await prisma.report.findUnique({ where: { id: jobId } });
  if (!report) throw new AppError('Rapor bulunamadı.', 404);

  await prisma.reportTeacher.upsert({
    where: { reportId_teacherId: { reportId: jobId, teacherId } },
    update: {},
    create: { reportId: jobId, teacherId },
  });

  let resolvedLessonId = lessonId || null;

  if (groupId && lessonCode) {
    const moduleNo = parseInt(lessonCode.match(/M(\d+)/)?.[1] || '1');
    const lessonInModule = parseInt(lessonCode.match(/L(\d+)/)?.[1] || '1');
    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { course: true } });
    const moduleSize = group?.course?.moduleSize || 4;
    const lessonNo = (moduleNo === 0 && lessonInModule === 0) ? 0 : (moduleNo - 1) * moduleSize + lessonInModule;
    const reportData = (typeof report.draftReport === 'object' && report.draftReport) ? report.draftReport : {};
    const videoUrl = reportData._videoUrl || null;
    const videoFilename = reportData._videoFilename || null;
    const dateTime = lessonDate ? new Date(lessonDate) : new Date();

    const lesson = await prisma.lesson.create({
      data: { groupId, teacherId, lessonNo, videoUrl, videoFilename, dateTime },
    });
    resolvedLessonId = lesson.id;
  }

  const updated = await prisma.report.update({
    where: { id: jobId },
    data: { lessonId: resolvedLessonId, status: 'PROCESSING' },
  });

  return res.json({ jobId: updated.id, status: updated.status, lessonId: resolvedLessonId, message: 'Analiz başarıyla atandı.' });
}

// ═══════════════════════════════════════════════════════════
// REPORTS — delegated to reportService
// ═══════════════════════════════════════════════════════════
async function getDraft(req, res) {
  const report = await reportService.getDraft(req.params.jobId);
  const teacher = report.reportTeachers[0];
  return res.json({
    jobId: report.id, status: report.status,
    videoUrl: report.lesson?.videoUrl || null, videoFilename: report.lesson?.videoFilename || null,
    draftReport: report.draftReport, finalReport: report.finalReport,
    teacher: teacher ? { id: teacher.teacherId, name: teacher.teacher.user.name } : null,
    lesson: report.lesson ? { id: report.lesson.id, lessonNo: report.lesson.lessonNo, course: report.lesson.group?.course?.course } : null,
    createdAt: report.createdAt,
  });
}

async function regenerateAnalysis(req, res) {
  const updated = await reportService.regenerate(req.body.jobId, req.body.feedback);
  return res.json({ jobId: updated.id, status: updated.status, message: 'Rapor yeniden oluşturulması için kuyruğa alındı.' });
}

async function finalizeAnalysis(req, res) {
  const updated = await reportService.finalize(req.body.jobId, req.user.userId);
  return res.json({ jobId: updated.id, status: updated.status, message: 'Rapor onaylandı ve yayınlandı.' });
}

async function getTeacherReports(req, res) {
  const result = await reportService.getTeacherReports(req.params.teacherId);
  return res.json(result);
}

async function getTeacherProgress(req, res) {
  const dataPoints = await reportService.getTeacherProgress(req.params.teacherId);
  return res.json(dataPoints);
}

// ═══════════════════════════════════════════════════════════
// LESSONS, JOBS, PROGRESS — lightweight queries stay here
// ═══════════════════════════════════════════════════════════
async function getLessons(req, res) {
  const lessons = await prisma.lesson.findMany({
    include: { teacher: { include: { user: { select: { name: true } } } }, group: { include: { course: true } } },
    orderBy: { dateTime: 'desc' },
  });
  return res.json(lessons.map(l => ({
    id: l.id, lessonNo: l.lessonNo, dateTime: l.dateTime,
    courseName: l.group.course.course, groupId: l.groupId,
    teacherId: l.teacherId, teacherName: l.teacher.user.name,
  })));
}

async function getAnalysisJobs(req, res) {
  const jobs = await prisma.report.findMany({
    include: {
      reportTeachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
      lesson: { include: { group: { include: { course: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json(jobs.map(j => ({
    jobId: j.id, videoFilename: j.lesson?.videoFilename || null, status: j.status,
    teacherId: j.reportTeachers[0]?.teacherId || null,
    teacherName: j.reportTeachers[0]?.teacher?.user?.name || null,
    lessonId: j.lesson?.id || null, lessonNo: j.lesson?.lessonNo || null,
    moduleSize: j.lesson?.group?.course?.moduleSize || 4,
    courseName: j.lesson?.group?.course?.course || null,
    createdAt: j.createdAt, updatedAt: j.updatedAt,
  })));
}

async function getAnalysisProgress(req, res) {
  const { jobId } = req.params;
  const progress = analysisProgress.get(jobId);
  if (progress) return res.json({ jobId, ...progress });

  const report = await prisma.report.findUnique({ where: { id: jobId }, select: { status: true } });
  if (!report) throw new AppError('İş bulunamadı.', 404);
  const statusMap = {
    PENDING: { stage: 'queued', message: 'Sırada bekliyor...', percent: 0 },
    PROCESSING: { stage: 'processing', message: 'Analiz devam ediyor...', percent: 50 },
    DRAFT: { stage: 'completed', message: 'Analiz tamamlandı!', percent: 100 },
    FINALIZED: { stage: 'completed', message: 'Rapor onaylandı.', percent: 100 },
  };
  return res.json({ jobId, ...(statusMap[report.status] || statusMap.PENDING) });
}

// ═══════════════════════════════════════════════════════════
// SYNC GCS REPORTS — cloud I/O stays in controller
// ═══════════════════════════════════════════════════════════
async function syncGCSReports(req, res) {
  if (!gcsStorage) throw new AppError('GCS client not initialized', 500);
  const bucket = gcsStorage.bucket(PROCESSED_BUCKET);
  const [files] = await bucket.getFiles({ prefix: 'reports/' });
  const jsonFiles = files.filter(f => f.name.endsWith('.json'));
  let synced = 0, skipped = 0;

  for (const file of jsonFiles) {
    const videoId = file.name.replace('reports/', '').replace('.json', '');
    if (!videoId) continue;

    const existing = await prisma.report.findFirst({
      where: {
        OR: [
          { lesson: { videoFilename: { contains: videoId } } },
          { lesson: { videoUrl: { contains: videoId } } },
          { draftReport: { path: ['_videoUrl'], string_contains: videoId } },
          { draftReport: { path: ['_videoFilename'], string_contains: videoId } },
          { draftReport: { path: ['video_id'], string_contains: videoId } },
        ],
        status: { in: ['DRAFT', 'FINALIZED'] },
        draftReport: { not: null },
      },
    });
    if (existing) { skipped++; continue; }

    const pendingJob = await prisma.report.findFirst({
      where: {
        OR: [
          { lesson: { videoFilename: { contains: videoId } } },
          { lesson: { videoUrl: { contains: videoId } } },
          { draftReport: { path: ['_videoUrl'], string_contains: videoId } },
          { draftReport: { path: ['_videoFilename'], string_contains: videoId } },
        ],
        status: { in: ['PROCESSING', 'PENDING'] },
      },
    });

    const [content] = await file.download();
    let reportData = {};
    try { reportData = JSON.parse(content.toString()); } catch (e) { continue; }

    if (pendingJob) {
      await prisma.report.update({ where: { id: pendingJob.id }, data: { status: 'DRAFT', draftReport: reportData } });
    } else {
      const duplicateCheck = await prisma.$queryRawUnsafe(
        `SELECT id FROM reports WHERE status IN ('DRAFT', 'FINALIZED') AND draft_report IS NOT NULL AND draft_report::text LIKE $1 LIMIT 1`,
        `%${videoId}%`
      ).catch(() => []);

      if (duplicateCheck.length > 0) { skipped++; continue; }
      await prisma.report.create({ data: { status: 'DRAFT', draftReport: reportData } });
    }
    synced++;
  }

  return res.json({ synced, skipped, total: jsonFiles.length });
}

// ═══════════════════════════════════════════════════════════
// USER MANAGEMENT — delegated to userService
// ═══════════════════════════════════════════════════════════
async function createUser(req, res) {
  const user = await userService.createUser(req.body);
  return res.status(201).json({ ...user, message: 'Kullanıcı başarıyla oluşturuldu.' });
}

async function getStudents(req, res) {
  return res.json(await userService.getStudents());
}

async function assignStudentToGroup(req, res) {
  await userService.assignStudentToGroup(req.body.studentId, req.body.groupId);
  return res.json({ message: 'Öğrenci gruba başarıyla atandı.' });
}

async function removeStudentFromGroup(req, res) {
  await userService.removeStudentFromGroup(req.body.studentId, req.body.groupId);
  return res.json({ message: 'Öğrenci gruptan çıkarıldı.' });
}

async function updateUser(req, res) {
  await userService.updateUser(req.params.id, req.body);
  return res.json({ message: 'Kullanıcı başarıyla güncellendi.' });
}

async function deleteUser(req, res) {
  await userService.deleteUser(req.params.id);
  return res.json({ message: 'Kullanıcı başarıyla silindi.' });
}

// ═══════════════════════════════════════════════════════════
// COURSES — delegated to courseService
// ═══════════════════════════════════════════════════════════
async function getCourses(req, res) {
  return res.json(await courseService.getCourses());
}

async function createCourse(req, res) {
  const course = await courseService.createCourse(req.body);
  return res.status(201).json({ ...course, message: 'Kurs başarıyla oluşturuldu.' });
}

async function updateCourse(req, res) {
  const updated = await courseService.updateCourse(req.params.id, req.body);
  return res.json({ ...updated, message: 'Kurs başarıyla güncellendi.' });
}

async function deleteCourse(req, res) {
  await courseService.deleteCourse(req.params.id);
  return res.json({ message: 'Kurs başarıyla silindi.' });
}

async function getTeacherCourses(req, res) {
  return res.json(await courseService.getTeacherCourses(req.params.teacherId));
}

async function setTeacherCourses(req, res) {
  const count = await courseService.setTeacherCourses(req.body.teacherId, req.body.courseIds);
  return res.json({ message: 'Eğitmen kursları güncellendi.', count });
}

// ═══════════════════════════════════════════════════════════
// GROUPS — delegated to groupService
// ═══════════════════════════════════════════════════════════
async function getGroups(req, res) {
  return res.json(await groupService.getGroups());
}

async function createGroup(req, res) {
  const group = await groupService.createGroup(req.body);
  return res.status(201).json({ id: group.id, name: group.name, courseId: group.courseId, teacherId: group.teacherId, schedule: group.schedule, message: 'Grup başarıyla oluşturuldu.' });
}

async function updateGroup(req, res) {
  const group = await groupService.updateGroup(req.params.id, req.body);
  return res.json({ ...group, message: 'Grup başarıyla güncellendi.' });
}

async function deleteGroup(req, res) {
  await groupService.deleteGroup(req.params.id);
  return res.json({ message: 'Grup başarıyla silindi.' });
}

// ═══════════════════════════════════════════════════════════
module.exports = {
  getStats, getTeachers, uploadAnalysis, assignAnalysis, getDraft,
  regenerateAnalysis, finalizeAnalysis, getLessons, getAnalysisJobs,
  getCourses, getGroups, getAnalysisProgress, getTeacherReports, syncGCSReports,
  createUser, getStudents, assignStudentToGroup, removeStudentFromGroup,
  setTeacherCourses, getTeacherCourses, createGroup, createCourse,
  updateGroup, deleteGroup, updateUser, deleteUser, updateCourse, deleteCourse,
  getTeacherProgress,
  analysisProgress,
};
