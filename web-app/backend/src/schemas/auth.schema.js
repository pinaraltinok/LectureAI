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
  name: z.string().min(1, 'Ad gereklidir.'),
  email: z.string().email('Geçerli bir email adresi giriniz.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır.'),
  role: z.enum(['student', 'teacher', 'admin']).default('student'),
  phone: z.string().optional(),
  age: z.union([z.string(), z.number()]).optional(),
  parent: z.string().optional(),
  parentPhone: z.string().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  age: z.union([z.string(), z.number()]).optional(),
  parent: z.string().optional(),
  parentPhone: z.string().optional(),
});

module.exports = { loginSchema, registerSchema, updateProfileSchema };
