const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const {
  getCourses, getEvaluations, submitSurvey, getMySurveys,
  getLessonDetail, getLessonNotes, createLessonNote, updateLessonNote, deleteLessonNote,
} = require('../controllers/student.controller');

router.get('/courses', auth, roleGuard('STUDENT'), getCourses);
router.get('/evaluations', auth, roleGuard('STUDENT'), getEvaluations);
router.post('/survey/submit', auth, roleGuard('STUDENT'), submitSurvey);
router.get('/surveys', auth, roleGuard('STUDENT'), getMySurveys);

// Lesson video player + timestamped notes
router.get('/lesson/:lessonId', auth, roleGuard('STUDENT'), getLessonDetail);
router.get('/lesson/:lessonId/notes', auth, roleGuard('STUDENT'), getLessonNotes);
router.post('/lesson/:lessonId/notes', auth, roleGuard('STUDENT'), createLessonNote);
router.put('/lesson/:lessonId/notes/:noteId', auth, roleGuard('STUDENT'), updateLessonNote);
router.delete('/lesson/:lessonId/notes/:noteId', auth, roleGuard('STUDENT'), deleteLessonNote);

module.exports = router;
