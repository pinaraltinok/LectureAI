const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

/**
 * POST /api/auth/login
 * Authenticates user with email & password, returns JWT token.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email ve şifre gereklidir.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Geçersiz email veya şifre.' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Geçersiz email veya şifre.' });
    }

    const payload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    return res.json({
      token,
      role: user.role,
      userId: user.id,
      name: user.name,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * GET /api/auth/me
 * Returns the current user's profile from the JWT token.
 */
async function getMe(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        branch: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    return res.json({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      branch: user.branch,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('GetMe error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/auth/register
 * Creates a new user account and returns JWT token.
 */
async function register(req, res) {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Ad, email ve şifre gereklidir.' });
    }

    // Map frontend role string to Prisma enum
    const roleMap = {
      student: 'STUDENT',
      teacher: 'TEACHER',
      admin: 'ADMIN',
    };
    const userRole = roleMap[(role || 'student').toLowerCase()] || 'STUDENT';

    // Check if email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Bu email adresi zaten kayıtlı.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: userRole,
      },
    });

    // Auto-login: generate JWT
    const payload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    return res.status(201).json({
      token,
      role: user.role,
      userId: user.id,
      name: user.name,
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}

/**
 * POST /api/auth/logout
 * Stateless logout — client should discard the token.
 */
async function logout(req, res) {
  // With JWT, logout is handled client-side by discarding the token.
  // A more robust solution would use a token blacklist (Redis etc.)
  return res.json({ message: 'Oturum başarıyla sonlandırıldı.' });
}

module.exports = { login, register, getMe, logout };
