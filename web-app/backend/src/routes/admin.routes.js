const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const {
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
} = require('../controllers/admin.controller');

// Multer configuration for video uploads
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    // Preserve original filename, add timestamp prefix to avoid collisions
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9_\-().]/g, '_');
    const uniqueName = Date.now() + '_' + sanitized;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage: multerStorage });

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Yönetici — Kalite Kontrol ve Atama (Gatekeeper)
 */

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Kurum istatistikleri
 *     description: Kurum geneli başarı puanı, aktif eğitmen ve bekleyen analiz sayıları.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kurum istatistikleri
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminStats'
 *       403:
 *         description: Yetkisiz erişim
 */
router.get('/stats', auth, roleGuard('ADMIN'), getStats);

/**
 * @swagger
 * /api/admin/teachers:
 *   get:
 *     summary: Eğitmen listesi
 *     description: Eğitmen listesi, branşları ve son yayınlanmış AI skorları.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Eğitmen listesi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TeacherListItem'
 */
router.get('/teachers', auth, roleGuard('ADMIN'), getTeachers);

/**
 * @swagger
 * /api/admin/analysis/upload:
 *   post:
 *     summary: Video yükle
 *     description: Ders videosunu yükler. jobId döner.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: Video dosyası
 *               videoUrl:
 *                 type: string
 *                 description: Alternatif olarak video URL'si
 *     responses:
 *       201:
 *         description: Video yüklendi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 */
router.post('/analysis/upload', auth, roleGuard('ADMIN'), upload.single('video'), uploadAnalysis);

/**
 * @swagger
 * /api/admin/analysis/assign:
 *   post:
 *     summary: Analiz ata
 *     description: Yüklenen dersi Eğitmen + Grup + Modül ile eşleştirir.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignRequest'
 *     responses:
 *       200:
 *         description: Analiz atandı
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 */
router.post('/analysis/assign', auth, roleGuard('ADMIN'), assignAnalysis);

/**
 * @swagger
 * /api/admin/analysis/draft/{jobId}:
 *   get:
 *     summary: Taslak rapor
 *     description: AI'nın hazırladığı ancak henüz yayınlanmamış Taslak Rapor içeriği.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Analiz iş ID'si
 *     responses:
 *       200:
 *         description: Taslak rapor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DraftReport'
 *       404:
 *         description: İş bulunamadı
 */
router.get('/analysis/draft/:jobId', auth, roleGuard('ADMIN'), getDraft);

/**
 * @swagger
 * /api/admin/analysis/regenerate:
 *   post:
 *     summary: Raporu yeniden oluştur
 *     description: Admin feedback'i ile AI'dan raporu tekrar oluşturmasını ister.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegenerateRequest'
 *     responses:
 *       200:
 *         description: Rapor kuyrağa alındı
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 */
router.post('/analysis/regenerate', auth, roleGuard('ADMIN'), regenerateAnalysis);

/**
 * @swagger
 * /api/admin/analysis/finalize:
 *   post:
 *     summary: Raporu onayla ve yayınla
 *     description: Taslağı onaylar. Raporu mühürler ve öğretmen/veli erişimine açar.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FinalizeRequest'
 *     responses:
 *       200:
 *         description: Rapor onaylandı
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 */
router.post('/analysis/finalize', auth, roleGuard('ADMIN'), finalizeAnalysis);

router.get('/lessons', auth, roleGuard('ADMIN'), getLessons);
router.get('/analysis/jobs', auth, roleGuard('ADMIN'), getAnalysisJobs);
router.get('/analysis/progress/:jobId', auth, roleGuard('ADMIN'), getAnalysisProgress);
router.get('/curricula', auth, roleGuard('ADMIN'), getCurricula);
router.get('/teacher/:teacherId/reports', auth, roleGuard('ADMIN'), getTeacherReports);
router.post('/sync-reports', auth, roleGuard('ADMIN'), syncGCSReports);

module.exports = router;
