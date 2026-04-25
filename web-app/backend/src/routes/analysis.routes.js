const express = require('express');
const router = express.Router();
const { analyze, status, report, pdf } = require('../controllers/analysis.controller');

/**
 * POST /api/analyze/:videoId?teacher_name=Teacher
 * Publishes analysis request to Pub/Sub `lecture-analysis-requested` topic.
 */
router.post('/analyze/:videoId', analyze);

/**
 * GET /api/status/:videoId
 * Checks if the report exists in GCS (poll every 5 seconds from frontend).
 */
router.get('/status/:videoId', status);

/**
 * GET /api/report/:videoId
 * Returns the full analysis report JSON from GCS.
 */
router.get('/report/:videoId', report);

/**
 * GET /api/pdf/:videoId
 * Returns a 1-hour signed URL for the PDF report.
 */
router.get('/pdf/:videoId', pdf);

module.exports = router;
