const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/asyncHandler');
const { analyze, status, report, pdf } = require('../controllers/analysis.controller');

/**
 * POST /api/analyze/:videoId?teacher_name=Teacher
 * Publishes analysis request to Pub/Sub `lecture-analysis-requested` topic.
 */
router.post('/analyze/:videoId', asyncHandler(analyze));

/**
 * GET /api/status/:videoId
 * Checks if the report exists in GCS (poll every 5 seconds from frontend).
 */
router.get('/status/:videoId', asyncHandler(status));

/**
 * GET /api/report/:videoId
 * Returns the full analysis report JSON from GCS.
 */
router.get('/report/:videoId', asyncHandler(report));

/**
 * GET /api/pdf/:videoId
 * Returns a 1-hour signed URL for the PDF report.
 */
router.get('/pdf/:videoId', asyncHandler(pdf));

module.exports = router;
