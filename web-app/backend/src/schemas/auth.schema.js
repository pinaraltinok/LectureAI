/**
 * Auth Request Schemas — Zod validation for authentication endpoints.
 * Ensures input data integrity before reaching the controller layer.
 */
const { z } = require('zod');

const loginSchema = z.object({
  email: z.string().email('Geçerli bir email adresi giriniz.'),
  password: z.string().min(1, 'Şifre gereklidir.'),
});

const registerSchema = z.object({
  name: z.string().min(2, 'Ad en az 2 karakter olmalıdır.').max(100, 'Ad en fazla 100 karakter olabilir.'),
  email: z.string().email('Geçerli bir email adresi giriniz.'),
  password: z.string()
    .min(8, 'Şifre en az 8 karakter olmalıdır.')
    .regex(/[A-Za-z]/, 'Şifre en az bir harf içermelidir.')
    .regex(/[0-9]/, 'Şifre en az bir rakam içermelidir.'),
  // Security: only student and teacher can self-register
  // Admin accounts must be created by existing admins via /api/admin/users
  role: z.enum(['student', 'teacher']).default('student'),
  phone: z.string().max(20).optional(),
  age: z.union([z.string(), z.number()]).optional(),
  parent: z.string().max(100).optional(),
  parentPhone: z.string().max(20).optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(20).optional(),
  age: z.union([z.string(), z.number()]).optional(),
  parent: z.string().max(100).optional(),
  parentPhone: z.string().max(20).optional(),
});

module.exports = { loginSchema, registerSchema, updateProfileSchema };
