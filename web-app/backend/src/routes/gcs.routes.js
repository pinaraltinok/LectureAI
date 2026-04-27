const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getSignedUrl, getBatchSignedUrls, streamFile } = require('../controllers/gcs.controller');

/**
 * GET /api/gcs/signed-url?bucket=BUCKET&object=OBJECT_PATH
 * Returns a 1-hour signed URL for a single GCS object.
 */
router.get('/signed-url', auth, getSignedUrl);

/**
 * POST /api/gcs/signed-urls
 * Body: { uris: ["gs://bucket/object", ...] }
 * Returns signed URLs for multiple GCS objects at once.
 */
router.post('/signed-urls', auth, getBatchSignedUrls);

/**
 * GET /api/gcs/stream?bucket=BUCKET&object=OBJECT_PATH
 * Streams a GCS file directly through the backend (never expires).
 * Supports Range headers for video seeking.
 */
router.get('/stream', auth, streamFile);

module.exports = router;
