const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const {
  getLessonStudents,
  createMentorFeedback,
  getMyFeedbacks,
  getReports,
  getSurveys,
  getPersonalNotes,
  createPersonalNote,
  getTeacherLessons,
  getTeacherStats,
} = require('../controllers/teacher.controller');

/**
 * @swagger
 * tags:
 *   name: Teacher
 *   description: Eğitmen — Mentorluk ve Analiz
 */

// ─── Mentorluk & Geri Bildirim ──────────────────────────────

/**
 * @swagger
 * /api/teacher/lessons/{lessonId}/students:
 *   get:
 *     summary: Derse kayıtlı öğrenciler
 *     description: Derse kayıtlı öğrenci listesini getirir (Geri bildirim yazmak için).
 *     tags: [Teacher]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ders ID'si
 *     responses:
 *       200:
 *         description: Öğrenci listesi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *       404:
 *         description: Ders bulunamadı
 */
router.get('/lessons/:lessonId/students', auth, roleGuard('TEACHER'), getLessonStudents);

/**
 * @swagger
 * /api/teacher/mentor-feedback:
 *   post:
 *     summary: Mentorluk notu gönder
 *     description: Belirli bir öğrenciye özel mentorluk notu gönderir.
 *     tags: [Teacher]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MentorFeedbackRequest'
 *     responses:
 *       201:
 *         description: Not gönderildi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 message:
 *                   type: string
 *       404:
 *         description: Öğrenci bulunamadı
 */
router.post('/mentor-feedback', auth, roleGuard('TEACHER'), createMentorFeedback);

/**
 * @swagger
 * /api/teacher/my-feedbacks:
 *   get:
 *     summary: Gönderilen mentorluk notları
 *     description: Öğretmenin geçmişte öğrencilere yazdığı tüm notlar.
 *     tags: [Teacher]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mentorluk notları listesi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MentorFeedbackItem'
 */
router.get('/my-feedbacks', auth, roleGuard('TEACHER'), getMyFeedbacks);

// ─── Raporlar & İçgörüler ───────────────────────────────────

/**
 * @swagger
 * /api/teacher/reports:
 *   get:
 *     summary: Onaylanmış analiz raporları
 *     description: Admin tarafından onaylanmış geçmiş analiz dökümleri.
 *     tags: [Teacher]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rapor listesi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   jobId:
 *                     type: string
 *                   lessonTitle:
 *                     type: string
 *                   moduleCode:
 *                     type: string
 *                   finalReport:
 *                     type: object
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 */
router.get('/reports', auth, roleGuard('TEACHER'), getReports);

/**
 * @swagger
 * /api/teacher/reports/{lessonId}/surveys:
 *   get:
 *     summary: Anket sonuçları (Agregre/Anonim)
 *     description: Öğrencilerin 5 kategorili anket sonuçları (Agregre/Anonim).
 *     tags: [Teacher]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: lessonId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Ders ID'si
 *     responses:
 *       200:
 *         description: Agregre anket sonuçları
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SurveyAggregation'
 *       404:
 *         description: Ders bulunamadı
 */
router.get('/reports/:lessonId/surveys', auth, roleGuard('TEACHER'), getSurveys);

/**
 * @swagger
 * /api/teacher/personal-notes:
 *   get:
 *     summary: Kişisel notları getir
 *     description: Eğitmenin kendine özel tuttuğu ders çalışma notları.
 *     tags: [Teacher]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kişisel notlar
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   content:
 *                     type: string
 *                   lessonTag:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *   post:
 *     summary: Kişisel not oluştur
 *     description: Eğitmenin kendine özel yeni bir çalışma notu oluşturur.
 *     tags: [Teacher]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PersonalNoteRequest'
 *     responses:
 *       201:
 *         description: Not oluşturuldu
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 content:
 *                   type: string
 *                 lessonTag:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 */
router.get('/personal-notes', auth, roleGuard('TEACHER'), getPersonalNotes);
router.post('/personal-notes', auth, roleGuard('TEACHER'), createPersonalNote);

router.get('/lessons', auth, roleGuard('TEACHER'), getTeacherLessons);
router.get('/stats', auth, roleGuard('TEACHER'), getTeacherStats);

module.exports = router;
