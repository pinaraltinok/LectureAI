const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const AppError = require('../utils/AppError');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/constants');

/**
 * Sets the JWT token as an httpOnly cookie.
 * Token is NOT accessible via JavaScript (F12 console) — only sent by browser automatically.
 */
function setCookieToken(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,          // JavaScript cannot read this cookie
    secure: isProduction,    // HTTPS only in production
    sameSite: 'strict',      // Prevent CSRF
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  });
}

/**
 * POST /api/auth/login
 * Authenticates user with email & password, returns JWT token.
 */
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) throw new AppError('Email ve şifre gereklidir.', 400);

  const user = await prisma.user.findUnique({
    where: { email },
    include: { admin: true, teacher: true, student: true },
  });
  if (!user) throw new AppError('Geçersiz email veya şifre.', 401);

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) throw new AppError('Geçersiz email veya şifre.', 401);

  const payload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  setCookieToken(res, token);

  return res.json({
    role: user.role,
    userId: user.id,
    name: user.name,
  });
}

/**
 * GET /api/auth/me
 * Returns the current user's profile from the JWT token.
 */
async function getMe(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { admin: true, teacher: true, student: true },
  });

  if (!user) throw new AppError('Kullanıcı bulunamadı.', 404);

  const result = {
    userId: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };

  // Add profile-specific fields
  if (user.role === 'STUDENT' && user.student) {
    result.age = user.student.age;
    result.parent = user.student.parent;
    result.parentPhone = user.student.parentPhone;
  }
  if (user.role === 'TEACHER' && user.teacher) {
    result.startOfDate = user.teacher.startOfDate;
  }

  return res.json(result);
}

/**
 * POST /api/auth/register
 * Creates a new user account with profile and returns JWT token.
 */
async function register(req, res) {
  const { name, email, password, phone, role, age, parent: parentName, parentPhone } = req.body;

  if (!name || !email || !password) throw new AppError('Ad, email ve şifre gereklidir.', 400);

  // Map frontend role string to Prisma enum
  const roleMap = { student: 'STUDENT', teacher: 'TEACHER', admin: 'ADMIN' };
  const userRole = roleMap[(role || 'student').toLowerCase()] || 'STUDENT';

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError('Bu email adresi zaten kayıtlı.', 409);

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user + profile in a transaction
  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: phone || null,
        role: userRole,
      },
    });

    // Create role-specific profile
    if (userRole === 'ADMIN') {
      await tx.admin.create({ data: { id: newUser.id } });
    } else if (userRole === 'TEACHER') {
      await tx.teacher.create({
        data: { id: newUser.id, startOfDate: new Date() },
      });
    } else if (userRole === 'STUDENT') {
      await tx.student.create({
        data: {
          id: newUser.id,
          age: age ? parseInt(age) : null,
          parent: parentName || null,
          parentPhone: parentPhone || null,
        },
      });
    }

    return newUser;
  });

  // Auto-login: generate JWT
  const payload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  setCookieToken(res, token);

  return res.status(201).json({
    role: user.role,
    userId: user.id,
    name: user.name,
  });
}

/**
 * PUT /api/auth/me
 * Updates the current user's profile.
 */
async function updateProfile(req, res) {
  const { name, phone, age, parent: parentName, parentPhone } = req.body;
  const userId = req.user.userId;

  // Update base user fields
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (phone !== undefined) updateData.phone = phone || null;

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  // Update role-specific fields
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (user.role === 'STUDENT') {
    const studentData = {};
    if (age !== undefined) studentData.age = age ? parseInt(age) : null;
    if (parentName !== undefined) studentData.parent = parentName || null;
    if (parentPhone !== undefined) studentData.parentPhone = parentPhone || null;

    if (Object.keys(studentData).length > 0) {
      await prisma.student.update({
        where: { id: userId },
        data: studentData,
      });
    }
  }

  // Return updated profile (reuse getMe logic)
  return getMe(req, res);
}

/**
 * POST /api/auth/logout
 * Stateless logout — client should discard the token.
 */
async function logout(req, res) {
  res.clearCookie('token', { httpOnly: true, sameSite: 'strict', path: '/' });
  return res.json({ message: 'Oturum başarıyla sonlandırıldı.' });
}

module.exports = { login, register, getMe, updateProfile, logout };
