require('dotenv').config();

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./utils/swagger');
const fs = require('fs');
const path = require('path');

// ─── Express App ─────────────────────────────────────────────
const app = express();

// ─── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Ensure uploads directory exists ─────────────────────────
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Swagger UI ──────────────────────────────────────────────
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'LectureAI API Documentation',
  })
);

// Serve raw OpenAPI spec as JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ─── Serve uploaded files (videos, etc.) ─────────────────────
app.use('/uploads', express.static(path.resolve(uploadDir)));

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
  // Serve index.html for non-API routes (SPA client-side routing)
  if (!req.originalUrl.startsWith('/api') && fs.existsSync(frontendIndex)) {
    return res.sendFile(frontendIndex);
  }
  res.status(404).json({ error: `Route bulunamadı: ${req.method} ${req.originalUrl}` });
});

// ─── Global Error Handler ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Beklenmeyen bir sunucu hatası oluştu.' });
});

module.exports = app;
