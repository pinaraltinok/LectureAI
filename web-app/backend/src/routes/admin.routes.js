const express = require('express');
const multer = require('multer');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const {
  getStats, getTeachers, uploadAnalysis, assignAnalysis, getDraft,
  regenerateAnalysis, finalizeAnalysis, getLessons, getAnalysisJobs,
  getCourses, getGroups, getAnalysisProgress, getTeacherReports, syncGCSReports,
  createUser, getStudents, assignStudentToGroup, removeStudentFromGroup,
  setTeacherCourses, getTeacherCourses, createGroup, createCourse,
  updateGroup, deleteGroup, updateUser, deleteUser, updateCourse, deleteCourse,
} = require('../controllers/admin.controller');

// Multer configuration
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './uploads'),
  filename: (req, file, cb) => {
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9_\-().]/g, '_');
    cb(null, Date.now() + '_' + sanitized);
  },
});
const upload = multer({ storage: multerStorage });

router.get('/stats', auth, roleGuard('ADMIN'), getStats);
router.get('/teachers', auth, roleGuard('ADMIN'), getTeachers);
router.get('/courses', auth, roleGuard('ADMIN'), getCourses);
router.get('/groups', auth, roleGuard('ADMIN'), getGroups);
router.get('/lessons', auth, roleGuard('ADMIN'), getLessons);
router.get('/analysis/jobs', auth, roleGuard('ADMIN'), getAnalysisJobs);
router.get('/analysis/progress/:jobId', auth, roleGuard('ADMIN'), getAnalysisProgress);
router.get('/analysis/draft/:jobId', auth, roleGuard('ADMIN'), getDraft);
router.get('/teacher/:teacherId/reports', auth, roleGuard('ADMIN'), getTeacherReports);

router.post('/analysis/upload', auth, roleGuard('ADMIN'), upload.single('video'), uploadAnalysis);
router.post('/analysis/assign', auth, roleGuard('ADMIN'), assignAnalysis);
router.post('/analysis/regenerate', auth, roleGuard('ADMIN'), regenerateAnalysis);
router.post('/analysis/finalize', auth, roleGuard('ADMIN'), finalizeAnalysis);
router.post('/sync-reports', auth, roleGuard('ADMIN'), syncGCSReports);

// User & Group Management
router.get('/students', auth, roleGuard('ADMIN'), getStudents);
router.post('/users', auth, roleGuard('ADMIN'), createUser);
router.post('/student-group/assign', auth, roleGuard('ADMIN'), assignStudentToGroup);
router.post('/student-group/remove', auth, roleGuard('ADMIN'), removeStudentFromGroup);
router.get('/teacher/:teacherId/courses', auth, roleGuard('ADMIN'), getTeacherCourses);
router.post('/teacher-courses', auth, roleGuard('ADMIN'), setTeacherCourses);
router.post('/groups', auth, roleGuard('ADMIN'), createGroup);
router.post('/courses', auth, roleGuard('ADMIN'), createCourse);
router.put('/groups/:id', auth, roleGuard('ADMIN'), updateGroup);
router.delete('/groups/:id', auth, roleGuard('ADMIN'), deleteGroup);
router.put('/users/:id', auth, roleGuard('ADMIN'), updateUser);
router.delete('/users/:id', auth, roleGuard('ADMIN'), deleteUser);
router.put('/courses/:id', auth, roleGuard('ADMIN'), updateCourse);
router.delete('/courses/:id', auth, roleGuard('ADMIN'), deleteCourse);

module.exports = router;
