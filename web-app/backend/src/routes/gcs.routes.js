const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getSignedUrl, getBatchSignedUrls } = require('../controllers/gcs.controller');

/**
 * GET /api/gcs/signed-url?bucket=BUCKET&object=OBJECT_PATH
 * Returns a 15-minute signed URL for a single GCS object.
 */
router.get('/signed-url', auth, getSignedUrl);

/**
 * POST /api/gcs/signed-urls
 * Body: { uris: ["gs://bucket/object", ...] }
 * Returns signed URLs for multiple GCS objects at once.
 */
router.post('/signed-urls', auth, getBatchSignedUrls);

module.exports = router;
