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
