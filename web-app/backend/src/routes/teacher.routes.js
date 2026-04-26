const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const {
  getTeacherLessons, getGroupStudents, createStudentEvaluation,
  getMyEvaluations, getReports, getSurveys, getTeacherStats,
} = require('../controllers/teacher.controller');

router.get('/lessons', auth, roleGuard('TEACHER'), getTeacherLessons);
router.get('/lessons/:groupId/students', auth, roleGuard('TEACHER'), getGroupStudents);
router.get('/stats', auth, roleGuard('TEACHER'), getTeacherStats);
router.get('/reports', auth, roleGuard('TEACHER'), getReports);
router.get('/reports/:lessonId/surveys', auth, roleGuard('TEACHER'), getSurveys);
router.get('/my-evaluations', auth, roleGuard('TEACHER'), getMyEvaluations);
router.post('/student-evaluation', auth, roleGuard('TEACHER'), createStudentEvaluation);

module.exports = router;
