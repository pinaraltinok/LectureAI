const { getStorageClient } = require('../utils/gcp');
const path = require('path');

// Initialize Storage with centralized credentials
const storage = getStorageClient();

// Signed URL expires in 60 minutes (1 hour)
const SIGNED_URL_EXPIRY_MINUTES = 60;

// Allowed buckets (whitelist)
const ALLOWED_BUCKETS = ['lectureai_full_videos', 'lectureai_processed', 'lectureai_student_audios'];

/**
 * Security: Validates GCS object path against path traversal attacks.
 * Blocks: ../ sequences, null bytes, absolute paths, backslashes.
 */
function isValidObjectPath(objectPath) {
  if (!objectPath || typeof objectPath !== 'string') return false;
  if (objectPath.includes('..')) return false;           // Path traversal
  if (objectPath.includes('\0')) return false;            // Null byte injection
  if (objectPath.startsWith('/')) return false;           // Absolute path
  if (objectPath.includes('\\')) return false;            // Windows backslash
  if (objectPath.length > 1024) return false;             // Path length limit
  return true;
}

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

    // Security: path traversal prevention
    if (!isValidObjectPath(object)) {
      return res.status(400).json({ error: 'Geçersiz dosya yolu.' });
    }

    // Security: only allow our known buckets
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return res.status(403).json({ error: 'Bu kaynağa erişim izni yok.' });
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
    return res.status(500).json({ error: 'Dosya URL\'i oluşturulamadı.' });
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

    const BATCH_ALLOWED_BUCKETS = ALLOWED_BUCKETS;
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
              if (!BATCH_ALLOWED_BUCKETS.includes(bucket)) return { uri, error: 'Erişim izni yok' };
              const [url] = await storage.bucket(bucket).file(decodeURIComponent(object)).getSignedUrl({
                version: 'v4', action: 'read', expires,
              });
              return { uri, url };
            }
            return { uri, error: 'Geçersiz GCS URI formatı' };
          }

          const [, bucket, object] = match;
          if (!BATCH_ALLOWED_BUCKETS.includes(bucket)) return { uri, error: 'Erişim izni yok' };

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
    return res.status(500).json({ error: 'Sunucu hatası oluştu.' });
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

    // Security: path traversal prevention
    if (!isValidObjectPath(object)) {
      return res.status(400).json({ error: 'Geçersiz dosya yolu.' });
    }

    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return res.status(403).json({ error: 'Bu kaynağa erişim izni yok.' });
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
      return res.status(500).json({ error: 'Dosya yüklenemedi.' });
    }
  }
}

/**
 * POST /api/gcs/upload-url
 * Generates a signed URL for UPLOADING a file directly to GCS from the browser.
 * This bypasses Cloud Run (32MB) and Cloudflare (100MB) body size limits.
 * Body: { filename: "video.mp4", contentType: "video/mp4" }
 */
async function getUploadSignedUrl(req, res) {
  try {
    const { filename, contentType } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'filename parametresi gereklidir.' });
    }

    const mimeType = contentType || 'video/mp4';
    const sanitized = filename.replace(/[^a-zA-Z0-9_\-().]/g, '_');
    const gcsFileName = `Lesson_Records/${Date.now()}_${sanitized}`;
    const bucket = 'lectureai_full_videos';

    const [url] = await storage
      .bucket(bucket)
      .file(gcsFileName)
      .getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + 60 * 60 * 1000, // 1 hour
        contentType: mimeType,
      });

    return res.json({
      uploadUrl: url,
      gcsUri: `gs://${bucket}/${gcsFileName}`,
      filename: sanitized,
      expiresInMinutes: 60,
    });
  } catch (err) {
    console.error('GetUploadSignedUrl error:', err.message);
    return res.status(500).json({ error: 'Upload URL oluşturulamadı.' });
  }
}

module.exports = { getSignedUrl, getBatchSignedUrls, streamFile, getUploadSignedUrl };
