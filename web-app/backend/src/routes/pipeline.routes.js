const express = require('express');

const router = express.Router();
const auth = require('../middleware/auth');
const roleGuard = require('../middleware/roleGuard');
const {
  getVideoPipeline,
  postWorkerPipelineEvent,
} = require('../controllers/pipeline.controller');

/**
 * Worker webhook (Cloud Run workers). Secured with PIPELINE_WEBHOOK_SECRET when set.
 */
router.post('/worker-events', postWorkerPipelineEvent);

/**
 * Admin / teacher timeline from GCS pipeline_state + pipeline_events.
 */
router.get(
  '/videos/:videoId',
  auth,
  roleGuard('ADMIN', 'TEACHER'),
  getVideoPipeline,
);

module.exports = router;
