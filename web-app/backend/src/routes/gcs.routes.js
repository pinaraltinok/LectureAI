const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getSignedUrl, getBatchSignedUrls, streamFile, getUploadSignedUrl } = require('../controllers/gcs.controller');

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
 * No auth required — browser <video> tags don't send cookies.
 * Security: bucket whitelist + path validation in controller.
 */
router.get('/stream', asyncHandler(streamFile));

/**
 * POST /api/gcs/upload-url
 * Body: { filename, contentType }
 * Returns a signed URL for uploading directly to GCS from the browser.
 * Bypasses Cloud Run (32MB) and Cloudflare (100MB) body size limits.
 */
router.post('/upload-url', auth, asyncHandler(getUploadSignedUrl));

module.exports = router;
