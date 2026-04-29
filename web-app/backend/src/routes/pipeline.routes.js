const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const asyncHandler = require('../middleware/asyncHandler');
const { postWorkerPipelineEvent, getPipelineStatus } = require('../controllers/pipeline.controller');

/**
 * POST /api/pipeline/worker-events
 * Receives status events from pipeline workers (audio, cv, orchestrator).
 * Auth: Bearer token via PIPELINE_WEBHOOK_SECRET (no JWT — workers don't have user sessions).
 */
router.post('/worker-events', asyncHandler(postWorkerPipelineEvent));

/**
 * GET /api/pipeline/videos/:videoId
 * Returns pipeline timeline: in-memory events + GCS pipeline_state.
 * Auth: JWT + ADMIN or TEACHER role.
 */
router.get('/videos/:videoId', auth, roleGuard('ADMIN', 'TEACHER'), asyncHandler(getPipelineStatus));

module.exports = router;
