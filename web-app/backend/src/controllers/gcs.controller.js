const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Initialize Storage with explicit credentials
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const credentialPath = path.join(projectRoot, 'senior-design-488908-1d5d3e1681ee.json');
const storage = new Storage({ keyFilename: credentialPath });

// Signed URL expires in 15 minutes
const SIGNED_URL_EXPIRY_MINUTES = 15;

/**
 * GET /api/gcs/signed-url?bucket=BUCKET&object=OBJECT_PATH
 * Generates a short-lived signed URL for any GCS object.
 * Requires ADMIN or TEACHER role (enforced in routes).
 */
async function getSignedUrl(req, res) {
  try {
    const { bucket, object } = req.query;

    if (!bucket || !object) {
      return res.status(400).json({ error: 'bucket ve object parametreleri gereklidir.' });
    }

    // Security: only allow our known buckets
    const ALLOWED_BUCKETS = [
      'lectureai_full_videos',
      'lectureai_processed',
    ];
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return res.status(403).json({ error: 'Bu bucket\'a erişim izni yok.' });
    }

    const [url] = await storage
      .bucket(bucket)
      .file(object)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + SIGNED_URL_EXPIRY_MINUTES * 60 * 1000,
      });

    return res.json({ url, expiresInMinutes: SIGNED_URL_EXPIRY_MINUTES });
  } catch (err) {
    console.error('GetSignedUrl error:', err.message);
    return res.status(500).json({ error: 'Signed URL oluşturulamadı: ' + err.message });
  }
}

/**
 * POST /api/gcs/signed-urls
 * Batch endpoint: generates signed URLs for multiple GCS URIs at once.
 * Body: { uris: ["gs://bucket/path1", "gs://bucket/path2"] }
 */
async function getBatchSignedUrls(req, res) {
  try {
    const { uris } = req.body;

    if (!Array.isArray(uris) || uris.length === 0) {
      return res.status(400).json({ error: 'uris dizisi gereklidir.' });
    }

    const ALLOWED_BUCKETS = ['lectureai_full_videos', 'lectureai_processed'];
    const expires = Date.now() + SIGNED_URL_EXPIRY_MINUTES * 60 * 1000;

    const results = await Promise.all(
      uris.map(async (uri) => {
        try {
          // Parse gs://bucket/path/to/object
          const match = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
          if (!match) {
            // Might already be an https:// URL with bucket path
            const httpsMatch = uri.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/);
            if (httpsMatch) {
              const [, bucket, object] = httpsMatch;
              if (!ALLOWED_BUCKETS.includes(bucket)) return { uri, error: 'Bucket izni yok' };
              const [url] = await storage.bucket(bucket).file(decodeURIComponent(object)).getSignedUrl({
                version: 'v4', action: 'read', expires,
              });
              return { uri, url };
            }
            return { uri, error: 'Geçersiz GCS URI formatı' };
          }

          const [, bucket, object] = match;
          if (!ALLOWED_BUCKETS.includes(bucket)) return { uri, error: 'Bucket izni yok' };

          const [url] = await storage.bucket(bucket).file(object).getSignedUrl({
            version: 'v4', action: 'read', expires,
          });
          return { uri, url };
        } catch (e) {
          return { uri, error: e.message };
        }
      })
    );

    return res.json({ results, expiresInMinutes: SIGNED_URL_EXPIRY_MINUTES });
  } catch (err) {
    console.error('BatchSignedUrls error:', err.message);
    return res.status(500).json({ error: 'Sunucu hatası: ' + err.message });
  }
}

module.exports = { getSignedUrl, getBatchSignedUrls };
