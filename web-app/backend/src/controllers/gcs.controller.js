const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Initialize Storage with explicit credentials
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const credentialPath = path.join(projectRoot, 'senior-design-488908-1d5d3e1681ee.json');
const storage = new Storage({ keyFilename: credentialPath });

// Signed URL expires in 60 minutes (1 hour) – videos are typically longer than 15 min
const SIGNED_URL_EXPIRY_MINUTES = 60;

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

/**
 * GET /api/gcs/stream?bucket=BUCKET&object=OBJECT_PATH
 * Streams a GCS object directly through the backend (proxy).
 * Supports HTTP Range headers for video seeking.
 * This URL never expires — the backend authenticates with GCS on each request.
 */
async function streamFile(req, res) {
  try {
    const { bucket, object } = req.query;

    if (!bucket || !object) {
      return res.status(400).json({ error: 'bucket ve object parametreleri gereklidir.' });
    }

    const ALLOWED_BUCKETS = ['lectureai_full_videos', 'lectureai_processed'];
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return res.status(403).json({ error: "Bu bucket'a erişim izni yok." });
    }

    const file = storage.bucket(bucket).file(object);

    // Check if file exists and get metadata
    const [metadata] = await file.getMetadata();
    const fileSize = parseInt(metadata.size, 10);
    const contentType = metadata.contentType || 'application/octet-stream';

    const range = req.headers.range;

    if (range) {
      // Parse Range header: "bytes=start-end"
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 5 * 1024 * 1024 - 1, fileSize - 1);
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      });

      const stream = file.createReadStream({ start, end });
      stream.on('error', (err) => {
        console.error('GCS stream error:', err.message);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      stream.pipe(res);
    } else {
      // No range — send entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      });

      const stream = file.createReadStream();
      stream.on('error', (err) => {
        console.error('GCS stream error:', err.message);
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      stream.pipe(res);
    }
  } catch (err) {
    console.error('StreamFile error:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Dosya stream edilemedi: ' + err.message });
    }
  }
}

module.exports = { getSignedUrl, getBatchSignedUrls, streamFile };
