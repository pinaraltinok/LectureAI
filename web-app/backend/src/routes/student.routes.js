const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const { getCourses, getEvaluations, submitSurvey } = require('../controllers/student.controller');

router.get('/courses', auth, roleGuard('STUDENT'), getCourses);
router.get('/evaluations', auth, roleGuard('STUDENT'), getEvaluations);
router.post('/survey/submit', auth, roleGuard('STUDENT'), submitSurvey);

module.exports = router;
