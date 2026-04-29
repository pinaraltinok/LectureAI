const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getSignedUrl, getBatchSignedUrls, streamFile } = require('../controllers/gcs.controller');

/**
 * GET /api/gcs/signed-url?bucket=BUCKET&object=OBJECT_PATH
 * Returns a 1-hour signed URL for a single GCS object.
 */
router.get('/signed-url', auth, asyncHandler(getSignedUrl));

/**
 * POST /api/gcs/signed-urls
 * Body: { uris: ["gs://bucket/object", ...] }
 * Returns signed URLs for multiple GCS objects at once.
 */
router.post('/signed-urls', auth, asyncHandler(getBatchSignedUrls));

/**
 * GET /api/gcs/stream?bucket=BUCKET&object=OBJECT_PATH
 * Streams a GCS file directly through the backend (never expires).
 * Supports Range headers for video seeking.
 */
router.get('/stream', auth, asyncHandler(streamFile));

module.exports = router;
