const express = require('express');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const { assignAnalysisSchema, createUserSchema, createGroupSchema, createCourseSchema, createStudentAnalysisSchema } = require('../schemas/admin.schema');
const {
  getStats, getTeachers, uploadAnalysis, createFromUrl, assignAnalysis, getDraft,
  regenerateAnalysis, retryAnalysis, finalizeAnalysis, getLessons, getAnalysisJobs,
  getCourses, getGroups, getAnalysisProgress, getTeacherReports, syncGCSReports,
  createUser, getStudents, assignStudentToGroup, removeStudentFromGroup,
  setTeacherCourses, getTeacherCourses, createGroup, createCourse,
  updateGroup, deleteGroup, updateUser, deleteUser, updateCourse, deleteCourse,
  getTeacherProgress,
  uploadReferenceAudio, createStudentAnalysis, getStudentAnalysisJobs,
} = require('../controllers/admin.controller');

// Multer configuration with security limits
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './uploads'),
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9_\-().]/g, '_');
    cb(null, Date.now() + '_' + sanitized);
  },
});
const ALLOWED_MIMETYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 600 * 1024 * 1024 }, // 600 MB max (ders videoları büyük olabilir)
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece video dosyaları (mp4, webm, mov, avi, mkv) yüklenebilir.'), false);
    }
  },
});

// Audio multer for student reference voice uploads
const ALLOWED_AUDIO_MIMETYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'];
const audioUpload = multer({
  storage: multerStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max for audio
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Sadece ses dosyaları (mp3, wav, ogg, webm, m4a) yüklenebilir.'), false);
    }
  },
});

router.get('/stats', auth, roleGuard('ADMIN'), asyncHandler(getStats));
router.get('/teachers', auth, roleGuard('ADMIN'), asyncHandler(getTeachers));
router.get('/courses', auth, roleGuard('ADMIN'), asyncHandler(getCourses));
router.get('/groups', auth, roleGuard('ADMIN'), asyncHandler(getGroups));
router.get('/lessons', auth, roleGuard('ADMIN'), asyncHandler(getLessons));
router.get('/analysis/jobs', auth, roleGuard('ADMIN'), asyncHandler(getAnalysisJobs));
router.get('/analysis/progress/:jobId', auth, roleGuard('ADMIN'), asyncHandler(getAnalysisProgress));
router.get('/analysis/draft/:jobId', auth, roleGuard('ADMIN'), asyncHandler(getDraft));
router.get('/teacher/:teacherId/reports', auth, roleGuard('ADMIN'), asyncHandler(getTeacherReports));
router.get('/teacher/:teacherId/progress', auth, roleGuard('ADMIN'), asyncHandler(getTeacherProgress));

router.post('/analysis/upload', auth, roleGuard('ADMIN'), upload.single('video'), asyncHandler(uploadAnalysis));
router.post('/analysis/create-from-url', auth, roleGuard('ADMIN'), asyncHandler(createFromUrl));
router.post('/analysis/assign', auth, roleGuard('ADMIN'), validate(assignAnalysisSchema), asyncHandler(assignAnalysis));
router.post('/analysis/regenerate', auth, roleGuard('ADMIN'), asyncHandler(regenerateAnalysis));
router.post('/analysis/retry', auth, roleGuard('ADMIN'), asyncHandler(retryAnalysis));
router.post('/analysis/finalize', auth, roleGuard('ADMIN'), asyncHandler(finalizeAnalysis));
router.post('/sync-reports', auth, roleGuard('ADMIN'), asyncHandler(syncGCSReports));

// User & Group Management
router.get('/students', auth, roleGuard('ADMIN'), asyncHandler(getStudents));
router.post('/users', auth, roleGuard('ADMIN'), validate(createUserSchema), asyncHandler(createUser));
router.post('/student-group/assign', auth, roleGuard('ADMIN'), asyncHandler(assignStudentToGroup));
router.post('/student-group/remove', auth, roleGuard('ADMIN'), asyncHandler(removeStudentFromGroup));
router.get('/teacher/:teacherId/courses', auth, roleGuard('ADMIN'), asyncHandler(getTeacherCourses));
router.post('/teacher-courses', auth, roleGuard('ADMIN'), asyncHandler(setTeacherCourses));
router.post('/groups', auth, roleGuard('ADMIN'), validate(createGroupSchema), asyncHandler(createGroup));
router.post('/courses', auth, roleGuard('ADMIN'), validate(createCourseSchema), asyncHandler(createCourse));
router.put('/groups/:id', auth, roleGuard('ADMIN'), asyncHandler(updateGroup));
router.delete('/groups/:id', auth, roleGuard('ADMIN'), asyncHandler(deleteGroup));
router.put('/users/:id', auth, roleGuard('ADMIN'), asyncHandler(updateUser));
router.delete('/users/:id', auth, roleGuard('ADMIN'), asyncHandler(deleteUser));
router.put('/courses/:id', auth, roleGuard('ADMIN'), asyncHandler(updateCourse));
router.delete('/courses/:id', auth, roleGuard('ADMIN'), asyncHandler(deleteCourse));

// Student Voice Analysis
router.post('/students/:studentId/reference-audio', auth, roleGuard('ADMIN'), audioUpload.single('audio'), asyncHandler(uploadReferenceAudio));
router.post('/student-analysis/create', auth, roleGuard('ADMIN'), validate(createStudentAnalysisSchema), asyncHandler(createStudentAnalysis));
router.get('/student-analysis/jobs', auth, roleGuard('ADMIN'), asyncHandler(getStudentAnalysisJobs));

module.exports = router;
