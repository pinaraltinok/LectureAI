const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const asyncHandler = require('../middleware/asyncHandler');
const {
  getStudentOverview,
  getStudentMentorNotes,
  getQualityApprovals,
} = require('../controllers/parent.controller');

/**
 * @swagger
 * tags:
 *   name: Parent
 *   description: Veli — Şeffaf İzleme
 */

/**
 * @swagger
 * /api/parent/student/overview:
 *   get:
 *     summary: Öğrenci genel görünüm
 *     description: Çocuğun etkileşim seviyesi (Lider, Aktif vb.) ve kazandığı rozetler.
 *     tags: [Parent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Öğrenci genel bilgiler
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StudentOverview'
 *       404:
 *         description: Bağlı öğrenci bulunamadı
 */
router.get('/student/overview', auth, roleGuard('PARENT'), asyncHandler(getStudentOverview));

/**
 * @swagger
 * /api/parent/student/mentor-notes:
 *   get:
 *     summary: Mentorluk mesajları
 *     description: Öğretmenin çocuk hakkında yazdığı mentorluk mesajlarını görüntüleme.
 *     tags: [Parent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mentorluk notları
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MentorFeedbackItem'
 *       404:
 *         description: Bağlı öğrenci bulunamadı
 */
router.get('/student/mentor-notes', auth, roleGuard('PARENT'), asyncHandler(getStudentMentorNotes));

/**
 * @swagger
 * /api/parent/quality-approvals:
 *   get:
 *     summary: Kalite onay durumu
 *     description: Derslerin LectureAI kalite onayından geçip geçmediğini izleme.
 *     tags: [Parent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kalite onay listesi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/QualityApproval'
 *       404:
 *         description: Bağlı öğrenci bulunamadı
 */
router.get('/quality-approvals', auth, roleGuard('PARENT'), asyncHandler(getQualityApprovals));

module.exports = router;
