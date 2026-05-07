const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const asyncHandler = require('../middleware/asyncHandler');
const {
  getCourses, getEvaluations, submitSurvey, getMySurveys,
  getLessonDetail, getLessonNotes, createLessonNote, updateLessonNote, deleteLessonNote,
  getMyReports,
} = require('../controllers/student.controller');

router.get('/courses', auth, roleGuard('STUDENT'), asyncHandler(getCourses));
router.get('/evaluations', auth, roleGuard('STUDENT'), asyncHandler(getEvaluations));
router.post('/survey/submit', auth, roleGuard('STUDENT'), asyncHandler(submitSurvey));
router.get('/surveys', auth, roleGuard('STUDENT'), asyncHandler(getMySurveys));

// Lesson video player + timestamped notes
router.get('/lesson/:lessonId', auth, roleGuard('STUDENT'), asyncHandler(getLessonDetail));
router.get('/lesson/:lessonId/notes', auth, roleGuard('STUDENT'), asyncHandler(getLessonNotes));
router.post('/lesson/:lessonId/notes', auth, roleGuard('STUDENT'), asyncHandler(createLessonNote));
router.put('/lesson/:lessonId/notes/:noteId', auth, roleGuard('STUDENT'), asyncHandler(updateLessonNote));
router.delete('/lesson/:lessonId/notes/:noteId', auth, roleGuard('STUDENT'), asyncHandler(deleteLessonNote));

// Student Voice Analysis Reports
router.get('/reports', auth, roleGuard('STUDENT'), asyncHandler(getMyReports));

module.exports = router;
