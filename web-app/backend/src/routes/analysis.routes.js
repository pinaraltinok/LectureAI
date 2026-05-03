const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const asyncHandler = require('../middleware/asyncHandler');
const { analyze, status, report, pdf } = require('../controllers/analysis.controller');

/**
 * POST /api/analyze/:videoId?teacher_name=Teacher
 * Publishes analysis request to Pub/Sub `lecture-analysis-requested` topic.
 * Auth: ADMIN only.
 */
router.post('/analyze/:videoId', auth, roleGuard('ADMIN'), asyncHandler(analyze));

/**
 * GET /api/status/:videoId
 * Checks if the report exists in GCS (poll every 5 seconds from frontend).
 * Auth: ADMIN or TEACHER.
 */
router.get('/status/:videoId', auth, roleGuard('ADMIN', 'TEACHER'), asyncHandler(status));

/**
 * GET /api/report/:videoId
 * Returns the full analysis report JSON from GCS.
 * Auth: ADMIN or TEACHER.
 */
router.get('/report/:videoId', auth, roleGuard('ADMIN', 'TEACHER'), asyncHandler(report));

/**
 * GET /api/pdf/:videoId
 * Returns a 1-hour signed URL for the PDF report.
 * Auth: ADMIN or TEACHER.
 */
router.get('/pdf/:videoId', auth, roleGuard('ADMIN', 'TEACHER'), asyncHandler(pdf));

module.exports = router;
