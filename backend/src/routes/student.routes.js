const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const { getCourses, getMentorNotes, submitSurvey } = require('../controllers/student.controller');

/**
 * @swagger
 * tags:
 *   name: Student
 *   description: Öğrenci — Gelişim ve Değerlendirme
 */

/**
 * @swagger
 * /api/student/courses:
 *   get:
 *     summary: Kayıtlı dersler
 *     description: Kayıtlı dersler ve modül bazlı ilerleme durumu.
 *     tags: [Student]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ders listesi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/CourseItem'
 */
router.get('/courses', auth, roleGuard('STUDENT'), getCourses);

/**
 * @swagger
 * /api/student/mentor-notes:
 *   get:
 *     summary: Mentorluk notları
 *     description: Öğretmenlerin bu öğrenci için yazdığı özel gelişim notları.
 *     tags: [Student]
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
 */
router.get('/mentor-notes', auth, roleGuard('STUDENT'), getMentorNotes);

/**
 * @swagger
 * /api/student/survey/submit:
 *   post:
 *     summary: Anket gönder
 *     description: 5 kategorili detaylı anket ve anonim yorum gönderimi.
 *     tags: [Student]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SurveySubmitRequest'
 *     responses:
 *       201:
 *         description: Anket gönderildi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 message:
 *                   type: string
 *       403:
 *         description: Bu derse kayıtlı değilsiniz
 *       409:
 *         description: Bu ders için zaten anket gönderilmiş
 */
router.post('/survey/submit', auth, roleGuard('STUDENT'), submitSurvey);

module.exports = router;
