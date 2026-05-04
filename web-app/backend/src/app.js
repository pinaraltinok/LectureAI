require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./utils/swagger');
const fs = require('fs');
const path = require('path');

// ─── Express App ─────────────────────────────────────────────
const app = express();
app.disable('x-powered-by'); // Prevent Express version fingerprinting

// Trust first reverse proxy hop (Cloud Run) for correct req.secure and cookies
app.set('trust proxy', 1);

// ─── Security: Helmet (HTTP security headers) ───────────────
app.use(helmet({
  contentSecurityPolicy: false,        // Disable CSP for SPA compatibility
  crossOriginEmbedderPolicy: false,    // Allow video embeds
}));

// ─── Security: CORS (restrict origins) ──────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',             // Vite dev server
  'http://localhost:5174',             // Vite dev server (alt port)
  'http://localhost:3001',             // Backend self (Swagger)
  'https://lectureai.online',         // Production domain
  'https://www.lectureai.online',     // Production www subdomain
  'https://lectureai-679435321951.europe-west4.run.app', // Cloud Run direct URL
  process.env.FRONTEND_URL,           // Production frontend (env override)
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, Postman)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error('CORS politikası ihlali: Bu kaynaktan erişim engellendi.'));
  },
  credentials: true,                  // Allow cookies (httpOnly JWT)
}));

// ─── Security: Rate Limiting ────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes
  max: 200,                           // 200 requests per window per IP
  message: { error: 'Çok fazla istek gönderildi. Lütfen 15 dakika bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },    // We handle trust proxy at Express level
  skip: (req) => {
    // Exempt pipeline worker webhooks (server-to-server, PubSub-triggered)
    return req.path.startsWith('/api/pipeline/');
  },
});
app.use('/api', apiLimiter);

// Strict rate limit for auth endpoints (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes
  max: 15,                            // 15 login attempts per window
  message: { error: 'Çok fazla giriş denemesi. Lütfen 15 dakika bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ─── Body Parsers ────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: '550mb' }));
app.use(express.urlencoded({ extended: true, limit: '550mb' }));

// ─── Ensure uploads directory exists ─────────────────────────
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Serve uploaded files ────────────────────────────────────
// Note: Auth removed because <video> elements cannot send httpOnly cookies.
// File names contain timestamps making them effectively unguessable.
app.use('/uploads', express.static(path.resolve(uploadDir), {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.mp4', '.webm', '.ogg'].includes(ext)) {
      res.set('Content-Type', ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : 'video/ogg');
      res.set('Accept-Ranges', 'bytes');
    }
  },
}));

// ─── Swagger UI (only in development) ────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'LectureAI API Documentation',
    })
  );
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

// ─── Routes ──────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/teacher', require('./routes/teacher.routes'));
app.use('/api/student', require('./routes/student.routes'));
app.use('/api/gcs', require('./routes/gcs.routes'));
app.use('/api', require('./routes/analysis.routes'));
app.use('/api/pipeline', require('./routes/pipeline.routes'));

// ─── Serve Frontend (if build exists) ────────────────────────
const frontendPath = path.join(__dirname, '..', 'public');
const frontendIndex = path.join(frontendPath, 'index.html');
if (fs.existsSync(frontendIndex)) {
  app.use(express.static(frontendPath));
}

// ─── Temporary Data Import Endpoint (one-time use) ───────────
app.post('/api/admin/import-data', async (req, res) => {
  try {
    const secret = (req.headers.authorization || '').replace('Bearer ', '');
    if (secret !== (process.env.PIPELINE_WEBHOOK_SECRET || 'lectureai-pipeline-secret-2026')) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const data = req.body;
    const results = { created: 0, skipped: 0, errors: [], idMap: {} };

    // Build user ID mapping: localId → prodId (by email match)
    const userIdMap = {};  // local user id → prod user id
    for (const u of (data.users || [])) {
      const prodUser = await prisma.user.findUnique({ where: { email: u.email } });
      if (prodUser) {
        userIdMap[u.id] = prodUser.id;
        results.skipped++;
        console.log(`[MAP] User ${u.email}: ${u.id} → ${prodUser.id}`);
      } else {
        // Create with original ID
        try {
          await prisma.user.create({ data: { ...u, createdAt: new Date(u.createdAt), updatedAt: new Date(u.updatedAt) } });
          userIdMap[u.id] = u.id;  // Same ID
          results.created++;
          console.log(`[NEW] User ${u.email}: ${u.id}`);
        } catch (e) { results.errors.push(`User ${u.email}: ${e.message.substring(0,100)}`); }
      }
    }
    results.idMap = userIdMap;

    // Helper to remap userId
    const mapUserId = (localId) => userIdMap[localId] || localId;

    // 2. Teachers (remap userId)
    const teacherIdMap = {};  // local teacher id → prod teacher id
    for (const t of (data.teachers || [])) {
      try {
        const mappedUserId = mapUserId(t.userId);
        // Check if teacher already exists for this user
        const exists = await prisma.teacher.findFirst({ where: { userId: mappedUserId } });
        if (exists) { teacherIdMap[t.id] = exists.id; results.skipped++; continue; }
        await prisma.teacher.create({ data: { id: t.id, userId: mappedUserId } });
        teacherIdMap[t.id] = t.id;
        results.created++;
      } catch (e) { results.errors.push(`Teacher: ${e.message.substring(0,100)}`); }
    }

    // 3. Students (remap userId, PRESERVE student ID!)
    const studentIdMap = {};  // local student id → prod student id
    for (const s of (data.students || [])) {
      try {
        const mappedUserId = mapUserId(s.userId);
        const existsById = await prisma.student.findUnique({ where: { id: s.id } });
        if (existsById) { studentIdMap[s.id] = s.id; results.skipped++; continue; }
        const existsByUser = await prisma.student.findFirst({ where: { userId: mappedUserId } });
        if (existsByUser) { studentIdMap[s.id] = existsByUser.id; results.skipped++; continue; }
        await prisma.student.create({ data: { id: s.id, userId: mappedUserId, referenceAudioUrl: s.referenceAudioUrl || null } });
        studentIdMap[s.id] = s.id;
        results.created++;
        console.log(`[NEW] Student ${s.id} (userId: ${mappedUserId})`);
      } catch (e) { results.errors.push(`Student ${s.id}: ${e.message.substring(0,100)}`); }
    }

    // 4. Courses
    for (const c of (data.courses || [])) {
      try {
        const exists = await prisma.course.findUnique({ where: { id: c.id } });
        if (exists) { results.skipped++; continue; }
        const { id, course: courseName, createdAt, updatedAt } = c;
        await prisma.course.create({ data: { id, course: courseName, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) } });
        results.created++;
      } catch (e) { results.errors.push(`Course: ${e.message.substring(0,100)}`); }
    }

    // 5. Groups (remap teacherId!)
    const mapTeacherId = (localId) => teacherIdMap[localId] || localId;
    for (const g of (data.groups || [])) {
      try {
        const exists = await prisma.group.findUnique({ where: { id: g.id } });
        if (exists) { results.skipped++; continue; }
        await prisma.group.create({ data: { id: g.id, courseId: g.courseId, teacherId: mapTeacherId(g.teacherId) } });
        results.created++;
        console.log(`[NEW] Group ${g.id} (teacher: ${mapTeacherId(g.teacherId)})`);
      } catch (e) { results.errors.push(`Group: ${e.message.substring(0,100)}`); }
    }

    // 6. StudentGroups (remap studentId!)
    const mapStudentId = (localId) => studentIdMap[localId] || localId;
    for (const sg of (data.studentGroups || [])) {
      try {
        const mappedStudentId = mapStudentId(sg.studentId);
        const exists = await prisma.studentGroup.findFirst({ where: { studentId: mappedStudentId, groupId: sg.groupId } });
        if (exists) { results.skipped++; continue; }
        await prisma.studentGroup.create({ data: { studentId: mappedStudentId, groupId: sg.groupId } });
        results.created++;
      } catch (e) { results.errors.push(`SG: ${e.message.substring(0,100)}`); }
    }

    // 7. Lessons
    for (const l of (data.lessons || [])) {
      try {
        const exists = await prisma.lesson.findUnique({ where: { id: l.id } });
        if (exists) { results.skipped++; continue; }
        const { id, lessonNo, dateTime, videoUrl, videoFilename, groupId, createdAt, updatedAt } = l;
        await prisma.lesson.create({ data: {
          id, lessonNo, groupId, videoUrl, videoFilename,
          dateTime: dateTime ? new Date(dateTime) : null,
          createdAt: createdAt ? new Date(createdAt) : new Date(),
          updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
        }});
        results.created++;
      } catch (e) { results.errors.push(`Lesson: ${e.message.substring(0,100)}`); }
    }

    // 8. Reports
    for (const r of (data.reports || [])) {
      try {
        const exists = await prisma.report.findUnique({ where: { id: r.id } });
        if (exists) { results.skipped++; continue; }
        const { id, lessonId, status, draftReport, adminFeedback, createdAt, updatedAt } = r;
        await prisma.report.create({ data: {
          id, status, draftReport: draftReport || undefined, adminFeedback,
          lessonId: lessonId || null,
          createdAt: createdAt ? new Date(createdAt) : new Date(),
          updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
        }});
        results.created++;
      } catch (e) { results.errors.push(`Report: ${e.message.substring(0,100)}`); }
    }

    // 9. ReportStudents
    for (const rs of (data.reportStudents || [])) {
      try {
        const exists = await prisma.reportStudent.findFirst({ where: { reportId: rs.reportId, studentId: rs.studentId } });
        if (exists) { results.skipped++; continue; }
        await prisma.reportStudent.create({ data: { reportId: rs.reportId, studentId: rs.studentId } });
        results.created++;
      } catch (e) { results.errors.push(`RS: ${e.message.substring(0,100)}`); }
    }

    await prisma.$disconnect();
    console.log(`[IMPORT] Done: ${results.created} created, ${results.skipped} skipped, ${results.errors.length} errors`);
    res.json(results);
  } catch (err) {
    console.error('[IMPORT] Fatal:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health Check ────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 / SPA Fallback Handler ──────────────────────────────
app.use((req, res) => {
  // Serve index.html for non-API, non-static-asset routes (SPA client-side routing)
  const hasFileExtension = path.extname(req.originalUrl) !== '';
  if (!req.originalUrl.startsWith('/api') && !hasFileExtension && fs.existsSync(frontendIndex)) {
    return res.sendFile(frontendIndex);
  }
  res.status(404).json({ error: 'Sayfa bulunamadı.' });
});

// ─── Global Error Handler (works with asyncHandler + AppError) ─
app.use((err, req, res, next) => {
  // Handle Multer file upload errors with user-friendly messages
  if (err.name === 'MulterError') {
    const multerMessages = {
      LIMIT_FILE_SIZE: 'Dosya boyutu çok büyük. Maksimum 600 MB yüklenebilir.',
      LIMIT_UNEXPECTED_FILE: 'Beklenmeyen dosya alanı.',
    };
    return res.status(400).json({ error: multerMessages[err.code] || 'Dosya yükleme hatası.' });
  }

  // Handle multer fileFilter rejection
  if (err.message && err.message.includes('Sadece video dosyaları')) {
    return res.status(400).json({ error: err.message });
  }

  const statusCode = err.statusCode || 500;
  const message = err.isOperational
    ? err.message
    : 'Beklenmeyen bir sunucu hatası oluştu.';

  // Log full stack for debugging; hide internals from client
  console.error(`[${req.method} ${req.originalUrl}] ${err.message}`, err.stack);
  res.status(statusCode).json({ error: message });
});

module.exports = app;
