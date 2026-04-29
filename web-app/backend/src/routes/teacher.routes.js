const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const asyncHandler = require('../middleware/asyncHandler');
const {
  getTeacherLessons, getGroupStudents, createStudentEvaluation,
  updateStudentEvaluation, deleteStudentEvaluation,
  getMyEvaluations, getReports, getSurveys, getTeacherStats,
  getMyProgress,
} = require('../controllers/teacher.controller');

router.get('/lessons', auth, roleGuard('TEACHER'), asyncHandler(getTeacherLessons));
router.get('/lessons/:groupId/students', auth, roleGuard('TEACHER'), asyncHandler(getGroupStudents));
router.get('/stats', auth, roleGuard('TEACHER'), asyncHandler(getTeacherStats));
router.get('/reports', auth, roleGuard('TEACHER'), asyncHandler(getReports));
router.get('/progress', auth, roleGuard('TEACHER'), asyncHandler(getMyProgress));
router.get('/reports/:lessonId/surveys', auth, roleGuard('TEACHER'), asyncHandler(getSurveys));
router.get('/my-evaluations', auth, roleGuard('TEACHER'), asyncHandler(getMyEvaluations));
router.post('/student-evaluation', auth, roleGuard('TEACHER'), asyncHandler(createStudentEvaluation));
router.put('/student-evaluation/:id', auth, roleGuard('TEACHER'), asyncHandler(updateStudentEvaluation));
router.delete('/student-evaluation/:id', auth, roleGuard('TEACHER'), asyncHandler(deleteStudentEvaluation));

module.exports = router;
