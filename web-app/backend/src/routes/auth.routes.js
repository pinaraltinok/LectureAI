const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { login, register, getMe, logout } = require('../controllers/auth.controller');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Kimlik Doğrulama ve Profil
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Kullanıcı girişi
 *     description: Email ve şifre ile giriş yapar. JWT token, role, userId ve name döner.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Başarılı giriş
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Geçersiz kimlik bilgileri
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Yeni hesap oluştur
 *     description: Ad, email, şifre ve rol ile yeni kullanıcı kaydı oluşturur. Otomatik giriş yapar.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [student, teacher, admin]
 *     responses:
 *       201:
 *         description: Hesap oluşturuldu ve giriş yapıldı
 *       409:
 *         description: Email zaten kayıtlı
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Mevcut oturum bilgileri
 *     description: Mevcut oturum bilgilerini ve rol yetkilerini doğrular.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Kullanıcı profili
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Yetkilendirme hatası
 */
router.get('/me', auth, getMe);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Oturumu sonlandır
 *     description: Oturumu sonlandırır. İstemci tarafında token silinmelidir.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Oturum sonlandırıldı
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 */
router.post('/logout', auth, logout);

module.exports = router;
