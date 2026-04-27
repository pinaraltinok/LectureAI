const prisma = require('../config/db');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { PubSub } = require('@google-cloud/pubsub');

// ─── GCP Config ─────────────────────────────────────────────
const PROJECT_ID = 'senior-design-488908';
const PUBSUB_TOPIC = 'lecture-analysis-requested';
const PROCESSED_BUCKET = 'lectureai_processed';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const credentialPath = path.join(projectRoot, 'senior-design-488908-1d5d3e1681ee.json');

let gcsStorage;
try { gcsStorage = new Storage({ keyFilename: credentialPath }); } catch (e) { console.warn('[GCS] Storage client init failed:', e.message); }

let pubsub;
try { pubsub = new PubSub({ projectId: PROJECT_ID, keyFilename: credentialPath }); } catch (e) { console.warn('[PubSub] Client init failed:', e.message); }

const VIDEO_BUCKET = 'lectureai_full_videos';
const VIDEO_PREFIX = 'Lesson_Records';
const analysisProgress = new Map();

// ─── Stats ──────────────────────────────────────────────────
async function getStats(req, res) {
  try {
    const [activeTeachers, totalStudents, totalLessons, pendingAnalysis, finalizedJobs] = await Promise.all([
      prisma.teacher.count(),
      prisma.student.count(),
      prisma.lesson.count(),
      prisma.report.count({ where: { status: { in: ['PENDING', 'PROCESSING', 'DRAFT'] } } }),
      prisma.report.findMany({ where: { status: 'FINALIZED', finalReport: { not: null } }, select: { finalReport: true } }),
    ]);

    let institutionScore = 0;
    if (finalizedJobs.length > 0) {
      const scores = finalizedJobs.map(j => j.finalReport?.overallScore).filter(s => s != null);
      if (scores.length > 0) institutionScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
    }

    return res.json({ institutionScore, activeTeachers, totalStudents, totalLessons, pendingAnalysis });
  } catch (err) {
    console.error('GetStats error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Teachers ───────────────────────────────────────────────
async function getTeachers(req, res) {
  try {
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
        id: t.id,
        name: t.user.name,
        email: t.user.email,
        phone: t.user.phone,
        startOfDate: t.startOfDate,
        lastScore,
        latestJobId: latest?.id || null,
        reportCount: allReports.length,
      };
    });

    return res.json(result);
  } catch (err) {
    console.error('GetTeachers error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Upload Analysis ────────────────────────────────────────
async function uploadAnalysis(req, res) {
  try {
    const file = req.file;
    const videoUrl = req.body.videoUrl;
    const teacherName = req.body.teacherName || '';

    if (!file && !videoUrl) return res.status(400).json({ error: 'Video dosyası veya videoUrl gereklidir.' });

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

    // Store video info temporarily in report metadata (will be moved to lesson on assign)
    // For now, we track it by creating a placeholder lesson or storing in report's draftReport
    if (resolvedUrl) {
      await prisma.report.update({ where: { id: report.id }, data: { draftReport: { _videoUrl: resolvedUrl, _videoFilename: videoFilename } } });
    }

    if (resolvedUrl && (resolvedUrl.startsWith('gs://') || resolvedUrl.startsWith('https://storage.googleapis.com/'))) {
      triggerVideoAnalysis(report.id, resolvedUrl, teacherName);
    }

    return res.status(201).json({ jobId: report.id, status: report.status, videoUrl: resolvedUrl, message: 'Video başarıyla yüklendi.' });
  } catch (err) {
    console.error('UploadAnalysis error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Trigger Video Analysis (Pub/Sub) ───────────────────────
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

// ─── Poll GCS for Report ────────────────────────────────────
function pollGCSForReport(jobId, videoId) {
  const POLL_INTERVAL = 5000;
  const MAX_POLLS = 720;
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

    if (pollCount >= MAX_POLLS) {
      clearInterval(interval);
      analysisProgress.set(jobId, { stage: 'failed', message: 'Analiz zaman aşımına uğradı', percent: 0 });
      await prisma.report.update({ where: { id: jobId }, data: { status: 'PENDING', adminFeedback: 'Analysis timed out' } }).catch(() => {});
    }
  }, POLL_INTERVAL);
}

// ─── Assign Analysis ────────────────────────────────────────
async function assignAnalysis(req, res) {
  try {
    const { jobId, teacherId, lessonId, groupId, lessonCode, lessonDate } = req.body;
    if (!jobId || !teacherId) return res.status(400).json({ error: 'jobId ve teacherId gereklidir.' });

    const report = await prisma.report.findUnique({ where: { id: jobId } });
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });

    // Link teacher to report
    await prisma.reportTeacher.upsert({
      where: { reportId_teacherId: { reportId: jobId, teacherId } },
      update: {},
      create: { reportId: jobId, teacherId },
    });

    let resolvedLessonId = lessonId || null;

    // If groupId is provided, create a Lesson record so students in that group can see the video
    if (groupId && lessonCode) {
      const lessonNo = parseInt(lessonCode.match(/L(\d+)/)?.[1] || '1');
      const reportData = (typeof report.draftReport === 'object' && report.draftReport) ? report.draftReport : {};
      const videoUrl = reportData._videoUrl || null;
      const videoFilename = reportData._videoFilename || null;
      const dateTime = lessonDate ? new Date(lessonDate) : new Date();

      const lesson = await prisma.lesson.create({
        data: {
          groupId,
          teacherId,
          lessonNo,
          videoUrl,
          videoFilename,
          dateTime,
        },
      });
      resolvedLessonId = lesson.id;
      console.log(`[Assign] Lesson ${lesson.id} created for group ${groupId}, lessonNo=${lessonNo}`);
    }

    const updated = await prisma.report.update({
      where: { id: jobId },
      data: { lessonId: resolvedLessonId, status: 'PROCESSING' },
    });

    return res.json({ jobId: updated.id, status: updated.status, lessonId: resolvedLessonId, message: 'Analiz başarıyla atandı.' });
  } catch (err) {
    console.error('AssignAnalysis error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Get Draft ──────────────────────────────────────────────
async function getDraft(req, res) {
  try {
    const { jobId } = req.params;
    const report = await prisma.report.findUnique({
      where: { id: jobId },
      include: {
        reportTeachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
        lesson: { include: { group: { include: { course: true } } } },
      },
    });
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });

    const teacher = report.reportTeachers[0];
    return res.json({
      jobId: report.id, status: report.status, videoUrl: report.lesson?.videoUrl || null, videoFilename: report.lesson?.videoFilename || null,
      draftReport: report.draftReport, finalReport: report.finalReport,
      teacher: teacher ? { id: teacher.teacherId, name: teacher.teacher.user.name } : null,
      lesson: report.lesson ? { id: report.lesson.id, lessonNo: report.lesson.lessonNo, course: report.lesson.group?.course?.course } : null,
      createdAt: report.createdAt,
    });
  } catch (err) {
    console.error('GetDraft error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Regenerate Analysis ────────────────────────────────────
async function regenerateAnalysis(req, res) {
  try {
    const { jobId, feedback } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId gereklidir.' });
    const report = await prisma.report.findUnique({ where: { id: jobId } });
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });

    const updated = await prisma.report.update({
      where: { id: jobId },
      data: { adminFeedback: feedback || null, status: 'PROCESSING', draftReport: { ...(typeof report.draftReport === 'object' ? report.draftReport : {}), regeneratedAt: new Date().toISOString(), adminFeedback: feedback } },
    });
    return res.json({ jobId: updated.id, status: updated.status, message: 'Rapor yeniden oluşturulması için kuyruğa alındı.' });
  } catch (err) {
    console.error('RegenerateAnalysis error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Finalize Analysis ──────────────────────────────────────
async function finalizeAnalysis(req, res) {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId gereklidir.' });
    const report = await prisma.report.findUnique({ where: { id: jobId } });
    if (!report) return res.status(404).json({ error: 'Rapor bulunamadı.' });
    if (!report.draftReport) return res.status(400).json({ error: 'Onaylanacak taslak rapor bulunamadı.' });

    const updated = await prisma.report.update({
      where: { id: jobId },
      data: { status: 'FINALIZED', adminId: req.user.userId, finalReport: { ...(typeof report.draftReport === 'object' ? report.draftReport : {}), approvedBy: req.user.userId, approvedAt: new Date().toISOString() } },
    });
    return res.json({ jobId: updated.id, status: updated.status, message: 'Rapor onaylandı ve yayınlandı.' });
  } catch (err) {
    console.error('FinalizeAnalysis error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Get Courses (eski getCurricula) ────────────────────────
async function getCourses(req, res) {
  try {
    const courses = await prisma.course.findMany({ orderBy: { course: 'asc' } });
    return res.json(courses);
  } catch (err) {
    console.error('GetCourses error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Get Groups ─────────────────────────────────────────────
async function getGroups(req, res) {
  try {
    const groups = await prisma.group.findMany({
      include: {
        course: true,
        teacher: { include: { user: { select: { name: true } } } },
        studentGroups: { select: { studentId: true } },
      },
    });
    const result = groups.map(g => ({
      id: g.id, courseId: g.courseId, courseName: g.course.course, teacherId: g.teacherId,
      teacherName: g.teacher.user.name, schedule: g.schedule, studentCount: g.studentGroups.length,
    }));
    return res.json(result);
  } catch (err) {
    console.error('GetGroups error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Get Lessons ────────────────────────────────────────────
async function getLessons(req, res) {
  try {
    const lessons = await prisma.lesson.findMany({
      include: {
        teacher: { include: { user: { select: { name: true } } } },
        group: { include: { course: true } },
      },
      orderBy: { dateTime: 'desc' },
    });
    const result = lessons.map(l => ({
      id: l.id, lessonNo: l.lessonNo, dateTime: l.dateTime,
      courseName: l.group.course.course, groupId: l.groupId,
      teacherId: l.teacherId, teacherName: l.teacher.user.name,
    }));
    return res.json(result);
  } catch (err) {
    console.error('GetLessons error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Get Analysis Jobs ──────────────────────────────────────
async function getAnalysisJobs(req, res) {
  try {
    const jobs = await prisma.report.findMany({
      include: {
        reportTeachers: { include: { teacher: { include: { user: { select: { name: true } } } } } },
        lesson: { include: { group: { include: { course: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const result = jobs.map(j => ({
      jobId: j.id, videoFilename: j.lesson?.videoFilename || null, status: j.status,
      teacherId: j.reportTeachers[0]?.teacherId || null,
      teacherName: j.reportTeachers[0]?.teacher?.user?.name || null,
      lessonId: j.lesson?.id || null,
      lessonNo: j.lesson?.lessonNo || null,
      courseName: j.lesson?.group?.course?.course || null,
      createdAt: j.createdAt, updatedAt: j.updatedAt,
    }));
    return res.json(result);
  } catch (err) {
    console.error('GetAnalysisJobs error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Get Analysis Progress ──────────────────────────────────
async function getAnalysisProgress(req, res) {
  const { jobId } = req.params;
  const progress = analysisProgress.get(jobId);
  if (progress) return res.json({ jobId, ...progress });

  try {
    const report = await prisma.report.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!report) return res.status(404).json({ error: 'İş bulunamadı.' });
    const statusMap = {
      PENDING: { stage: 'queued', message: 'Sırada bekliyor...', percent: 0 },
      PROCESSING: { stage: 'processing', message: 'Analiz devam ediyor...', percent: 50 },
      DRAFT: { stage: 'completed', message: 'Analiz tamamlandı!', percent: 100 },
      FINALIZED: { stage: 'completed', message: 'Rapor onaylandı.', percent: 100 },
    };
    return res.json({ jobId, ...(statusMap[report.status] || statusMap.PENDING) });
  } catch (err) { return res.status(500).json({ error: 'Sunucu hatası.' }); }
}

// ─── Get Teacher Reports ────────────────────────────────────
async function getTeacherReports(req, res) {
  try {
    const { teacherId } = req.params;
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, include: { user: { select: { name: true } } } });
    if (!teacher) return res.status(404).json({ error: 'Eğitmen bulunamadı.' });

    const reportTeachers = await prisma.reportTeacher.findMany({
      where: { teacherId },
      include: {
        report: {
          include: { lesson: { include: { group: { include: { course: true } } } } },
        },
      },
      orderBy: { report: { createdAt: 'desc' } },
    });

    // Also get unassigned reports
    const unassigned = await prisma.report.findMany({
      where: { reportTeachers: { none: {} } },
      include: { lesson: { include: { group: { include: { course: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    const reports = [
      ...reportTeachers.map(rt => {
        const j = rt.report;
        const rpt = j.finalReport || j.draftReport || {};
        return {
          jobId: j.id, videoUrl: j.lesson?.videoUrl || null, videoFilename: j.lesson?.videoFilename || null, status: j.status, createdAt: j.createdAt,
          courseName: j.lesson?.group?.course?.course || null, lessonNo: j.lesson?.lessonNo || null,
          assignedTeacher: teacher.user.name, isUnassigned: false, score: rt.score,
          genel_sonuc: rpt.genel_sonuc || null, yeterlilikler: rpt.yeterlilikler || null,
          speaking_time_rating: rpt.speaking_time_rating || null, feedback_metni: rpt.feedback_metni || null,
        };
      }),
      ...unassigned.map(j => {
        const rpt = j.finalReport || j.draftReport || {};
        return {
          jobId: j.id, videoUrl: j.lesson?.videoUrl || null, videoFilename: j.lesson?.videoFilename || null, status: j.status, createdAt: j.createdAt,
          courseName: j.lesson?.group?.course?.course || null, lessonNo: j.lesson?.lessonNo || null,
          assignedTeacher: null, isUnassigned: true, score: null,
          genel_sonuc: rpt.genel_sonuc || null, yeterlilikler: rpt.yeterlilikler || null,
          speaking_time_rating: rpt.speaking_time_rating || null, feedback_metni: rpt.feedback_metni || null,
        };
      }),
    ];

    return res.json({ teacher: { id: teacher.id, name: teacher.user.name }, reports });
  } catch (err) {
    console.error('GetTeacherReports error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Sync GCS Reports ───────────────────────────────────────
async function syncGCSReports(req, res) {
  try {
    if (!gcsStorage) return res.status(500).json({ error: 'GCS client not initialized' });
    const bucket = gcsStorage.bucket(PROCESSED_BUCKET);
    const [files] = await bucket.getFiles({ prefix: 'reports/' });
    const jsonFiles = files.filter(f => f.name.endsWith('.json'));
    let synced = 0, skipped = 0;

    for (const file of jsonFiles) {
      const videoId = file.name.replace('reports/', '').replace('.json', '');
      if (!videoId) continue;
      const existing = await prisma.report.findFirst({
        where: { OR: [{ lesson: { videoFilename: { contains: videoId } } }, { lesson: { videoUrl: { contains: videoId } } }], status: { in: ['DRAFT', 'FINALIZED'] }, draftReport: { not: null } },
      });
      if (existing) { skipped++; continue; }

      const pendingJob = await prisma.report.findFirst({
        where: { OR: [{ lesson: { videoFilename: { contains: videoId } } }, { lesson: { videoUrl: { contains: videoId } } }], status: { in: ['PROCESSING', 'PENDING'] } },
      });

      const [content] = await file.download();
      let reportData = {};
      try { reportData = JSON.parse(content.toString()); } catch (e) { continue; }

      if (pendingJob) {
        await prisma.report.update({ where: { id: pendingJob.id }, data: { status: 'DRAFT', draftReport: reportData } });
      } else {
        await prisma.report.create({ data: { status: 'DRAFT', draftReport: reportData } });
      }
      synced++;
    }

    return res.json({ synced, skipped, total: jsonFiles.length });
  } catch (err) {
    console.error('SyncGCSReports error:', err);
    return res.status(500).json({ error: 'Senkronizasyon hatası: ' + err.message });
  }
}

// ─── Create User (Admin adds Teacher/Student) ───────────────
async function createUser(req, res) {
  try {
    const { name, email, password, phone, role, age, parent, parentPhone, startOfDate } = req.body;
    if (!name || !email || !role) return res.status(400).json({ error: 'Ad, email ve rol gereklidir.' });

    const roleMap = { student: 'STUDENT', teacher: 'TEACHER', admin: 'ADMIN' };
    const userRole = roleMap[role.toLowerCase()];
    if (!userRole) return res.status(400).json({ error: 'Geçersiz rol.' });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Bu email adresi zaten kayıtlı.' });

    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password || 'password123', 10);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email, password: hashedPassword, phone: phone || null, role: userRole },
      });
      if (userRole === 'ADMIN') await tx.admin.create({ data: { id: newUser.id } });
      else if (userRole === 'TEACHER') await tx.teacher.create({ data: { id: newUser.id, startOfDate: startOfDate ? new Date(startOfDate) : new Date() } });
      else if (userRole === 'STUDENT') await tx.student.create({ data: { id: newUser.id, age: age ? parseInt(age) : null, parent: parent || null, parentPhone: parentPhone || null } });
      return newUser;
    });

    return res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, message: 'Kullanıcı başarıyla oluşturuldu.' });
  } catch (err) {
    console.error('CreateUser error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Get All Students ───────────────────────────────────────
async function getStudents(req, res) {
  try {
    const students = await prisma.student.findMany({
      include: { user: { select: { id: true, name: true, email: true, phone: true } }, studentGroups: { include: { group: { include: { course: true } } } } },
    });
    const result = students.map(s => ({
      id: s.id, name: s.user.name, email: s.user.email, phone: s.user.phone, age: s.age, parent: s.parent, parentPhone: s.parentPhone,
      groups: s.studentGroups.map(sg => ({ groupId: sg.groupId, courseName: sg.group.course.course, schedule: sg.group.schedule })),
    }));
    return res.json(result);
  } catch (err) {
    console.error('GetStudents error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Assign Student to Group ────────────────────────────────
async function assignStudentToGroup(req, res) {
  try {
    const { studentId, groupId } = req.body;
    if (!studentId || !groupId) return res.status(400).json({ error: 'studentId ve groupId gereklidir.' });

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) return res.status(404).json({ error: 'Öğrenci bulunamadı.' });
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) return res.status(404).json({ error: 'Grup bulunamadı.' });

    const existing = await prisma.studentGroup.findUnique({ where: { studentId_groupId: { studentId, groupId } } });
    if (existing) return res.status(409).json({ error: 'Öğrenci zaten bu gruba kayıtlı.' });

    await prisma.studentGroup.create({ data: { studentId, groupId } });
    return res.json({ message: 'Öğrenci gruba başarıyla atandı.' });
  } catch (err) {
    console.error('AssignStudentToGroup error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Remove Student from Group ──────────────────────────────
async function removeStudentFromGroup(req, res) {
  try {
    const { studentId, groupId } = req.body;
    if (!studentId || !groupId) return res.status(400).json({ error: 'studentId ve groupId gereklidir.' });
    await prisma.studentGroup.delete({ where: { studentId_groupId: { studentId, groupId } } });
    return res.json({ message: 'Öğrenci gruptan çıkarıldı.' });
  } catch (err) {
    console.error('RemoveStudentFromGroup error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Set Teacher Courses ────────────────────────────────────
async function setTeacherCourses(req, res) {
  try {
    const { teacherId, courseIds } = req.body;
    if (!teacherId || !Array.isArray(courseIds)) return res.status(400).json({ error: 'teacherId ve courseIds (array) gereklidir.' });

    await prisma.teacherCourse.deleteMany({ where: { teacherId } });
    if (courseIds.length > 0) {
      await prisma.teacherCourse.createMany({ data: courseIds.map(courseId => ({ teacherId, courseId })) });
    }
    return res.json({ message: 'Eğitmen kursları güncellendi.', count: courseIds.length });
  } catch (err) {
    console.error('SetTeacherCourses error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Get Teacher Courses ────────────────────────────────────
async function getTeacherCourses(req, res) {
  try {
    const { teacherId } = req.params;
    const tc = await prisma.teacherCourse.findMany({ where: { teacherId }, include: { course: true } });
    return res.json(tc.map(t => t.course));
  } catch (err) {
    console.error('GetTeacherCourses error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Create Group (assign teacher to group) ─────────────────
async function createGroup(req, res) {
  try {
    const { courseId, teacherId, schedule } = req.body;
    if (!courseId || !teacherId) return res.status(400).json({ error: 'courseId ve teacherId gereklidir.' });

    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ error: 'Kurs bulunamadı.' });
    const teacher = await prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) return res.status(404).json({ error: 'Eğitmen bulunamadı.' });

    const group = await prisma.group.create({ data: { courseId, teacherId, schedule: schedule || null } });
    return res.status(201).json({ id: group.id, courseId, teacherId, schedule: group.schedule, message: 'Grup başarıyla oluşturuldu.' });
  } catch (err) {
    console.error('CreateGroup error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Create Course ──────────────────────────────────────────
async function createCourse(req, res) {
  try {
    const { course, age, lessonSize, moduleNum, moduleSize } = req.body;
    if (!course || !age) return res.status(400).json({ error: 'Kurs adı ve yaş grubu gereklidir.' });

    const existing = await prisma.course.findFirst({ where: { course, age } });
    if (existing) return res.status(409).json({ error: 'Bu isim ve yaş grubuna sahip kurs zaten mevcut.' });

    const newCourse = await prisma.course.create({
      data: {
        course,
        age,
        lessonSize: lessonSize ? parseInt(lessonSize) : 60,
        moduleNum: moduleNum ? parseInt(moduleNum) : 1,
        moduleSize: moduleSize ? parseInt(moduleSize) : 4,
      },
    });
    return res.status(201).json({ ...newCourse, message: 'Kurs başarıyla oluşturuldu.' });
  } catch (err) {
    console.error('CreateCourse error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Update Group ───────────────────────────────────────────
async function updateGroup(req, res) {
  try {
    const { id } = req.params;
    const { teacherId, schedule } = req.body;
    const data = {};
    if (teacherId !== undefined) data.teacherId = teacherId;
    if (schedule !== undefined) data.schedule = schedule;
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Güncellenecek alan belirtilmedi.' });

    const group = await prisma.group.update({ where: { id }, data });
    return res.json({ ...group, message: 'Grup başarıyla güncellendi.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Grup bulunamadı.' });
    console.error('UpdateGroup error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Delete Group ───────────────────────────────────────────
async function deleteGroup(req, res) {
  try {
    const { id } = req.params;
    await prisma.studentGroup.deleteMany({ where: { groupId: id } });
    await prisma.lesson.deleteMany({ where: { groupId: id } });
    await prisma.group.delete({ where: { id } });
    return res.json({ message: 'Grup başarıyla silindi.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Grup bulunamadı.' });
    console.error('DeleteGroup error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Update User ────────────────────────────────────────────
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { name, email, phone, age, parent, parentPhone, startOfDate } = req.body;

    const userData = {};
    if (name) userData.name = name;
    if (email) userData.email = email;
    if (phone !== undefined) userData.phone = phone;

    const user = await prisma.user.update({ where: { id }, data: userData, include: { student: true, teacher: true } });

    if (user.role === 'STUDENT' && user.student) {
      const studentData = {};
      if (age !== undefined) studentData.age = age ? parseInt(age) : null;
      if (parent !== undefined) studentData.parent = parent;
      if (parentPhone !== undefined) studentData.parentPhone = parentPhone;
      if (Object.keys(studentData).length > 0) await prisma.student.update({ where: { id }, data: studentData });
    }
    if (user.role === 'TEACHER' && user.teacher) {
      if (startOfDate !== undefined) await prisma.teacher.update({ where: { id }, data: { startOfDate: new Date(startOfDate) } });
    }

    return res.json({ message: 'Kullanıcı başarıyla güncellendi.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    console.error('UpdateUser error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Delete User ────────────────────────────────────────────
async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({ where: { id }, include: { student: true, teacher: true, admin: true } });
    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

    await prisma.$transaction(async (tx) => {
      if (user.student) {
        await tx.studentGroup.deleteMany({ where: { studentId: id } });
        await tx.studentEvaluation.deleteMany({ where: { studentId: id } });
        await tx.survey.deleteMany({ where: { studentId: id } });
        await tx.reportStudent.deleteMany({ where: { studentId: id } });
        await tx.student.delete({ where: { id } });
      }
      if (user.teacher) {
        await tx.teacherCourse.deleteMany({ where: { teacherId: id } });
        await tx.reportTeacher.deleteMany({ where: { teacherId: id } });
        await tx.group.updateMany({ where: { teacherId: id }, data: { teacherId: id } });
        await tx.teacher.delete({ where: { id } });
      }
      if (user.admin) {
        await tx.admin.delete({ where: { id } });
      }
      await tx.user.delete({ where: { id } });
    });

    return res.json({ message: 'Kullanıcı başarıyla silindi.' });
  } catch (err) {
    console.error('DeleteUser error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Update Course ──────────────────────────────────────────
async function updateCourse(req, res) {
  try {
    const { id } = req.params;
    const { course, age, lessonSize, moduleNum, moduleSize } = req.body;
    const data = {};
    if (course) data.course = course;
    if (age) data.age = age;
    if (lessonSize !== undefined) data.lessonSize = parseInt(lessonSize);
    if (moduleNum !== undefined) data.moduleNum = parseInt(moduleNum);
    if (moduleSize !== undefined) data.moduleSize = parseInt(moduleSize);

    const updated = await prisma.course.update({ where: { id }, data });
    return res.json({ ...updated, message: 'Kurs başarıyla güncellendi.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Kurs bulunamadı.' });
    console.error('UpdateCourse error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

// ─── Delete Course ──────────────────────────────────────────
async function deleteCourse(req, res) {
  try {
    const { id } = req.params;
    const groups = await prisma.group.findMany({ where: { courseId: id } });
    if (groups.length > 0) return res.status(409).json({ error: `Bu kursa bağlı ${groups.length} grup var. Önce grupları silin.` });

    await prisma.teacherCourse.deleteMany({ where: { courseId: id } });
    await prisma.course.delete({ where: { id } });
    return res.json({ message: 'Kurs başarıyla silindi.' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Kurs bulunamadı.' });
    console.error('DeleteCourse error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

module.exports = {
  getStats, getTeachers, uploadAnalysis, assignAnalysis, getDraft,
  regenerateAnalysis, finalizeAnalysis, getLessons, getAnalysisJobs,
  getCourses, getGroups, getAnalysisProgress, getTeacherReports, syncGCSReports,
  createUser, getStudents, assignStudentToGroup, removeStudentFromGroup,
  setTeacherCourses, getTeacherCourses, createGroup, createCourse,
  updateGroup, deleteGroup, updateUser, deleteUser, updateCourse, deleteCourse,
};

