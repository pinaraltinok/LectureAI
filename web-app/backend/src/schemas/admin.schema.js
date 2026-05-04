/**
 * Admin Request Schemas — Zod validation for admin management endpoints.
 */
const { z } = require('zod');

const assignAnalysisSchema = z.object({
  jobId: z.string().min(1, 'jobId gereklidir.'),
  teacherId: z.string().min(1, 'teacherId gereklidir.'),
  lessonId: z.string().nullable().optional(),
  groupId: z.string().nullable().optional(),
  lessonCode: z.string().nullable().optional(),
  lessonDate: z.string().nullable().optional(),
});

const createUserSchema = z.object({
  name: z.string().min(1, 'Ad gereklidir.'),
  email: z.string().email('Geçerli bir email adresi giriniz.'),
  role: z.enum(['student', 'teacher', 'admin'], { errorMap: () => ({ message: 'Geçersiz rol.' }) }),
  password: z.string().optional(),
  phone: z.string().optional(),
  age: z.union([z.string(), z.number()]).optional(),
  parent: z.string().optional(),
  parentPhone: z.string().optional(),
  startOfDate: z.string().optional(),
});

const createGroupSchema = z.object({
  courseId: z.string().min(1, 'courseId gereklidir.'),
  teacherId: z.string().min(1, 'teacherId gereklidir.'),
  schedule: z.string().optional(),
  name: z.string().optional(),
});

const createCourseSchema = z.object({
  course: z.string().min(1, 'Kurs adı gereklidir.'),
  age: z.string().min(1, 'Yaş grubu gereklidir.'),
  lessonSize: z.union([z.string(), z.number()]).optional(),
  moduleNum: z.union([z.string(), z.number()]).optional(),
  moduleSize: z.union([z.string(), z.number()]).optional(),
});

const submitSurveySchema = z.object({
  lessonId: z.string().min(1, 'lessonId gereklidir.'),
  rating: z.number().min(1).max(5, 'Rating 1-5 arasında olmalıdır.'),
  note: z.string().optional(),
});

const createStudentAnalysisSchema = z.object({
  studentId: z.string().min(1, 'studentId gereklidir.'),
  lessonId: z.string().min(1, 'lessonId gereklidir.'),
});

module.exports = {
  assignAnalysisSchema, createUserSchema, createGroupSchema,
  createCourseSchema, submitSurveySchema, createStudentAnalysisSchema,
};
