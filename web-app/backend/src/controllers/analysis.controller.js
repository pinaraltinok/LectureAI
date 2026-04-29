const { Storage } = require('@google-cloud/storage');
const { PubSub } = require('@google-cloud/pubsub');
const path = require('path');
const { GCP_PROJECT_ID, PUBSUB_TOPIC, PROCESSED_BUCKET } = require('../config/constants');

const credentialPath = path.resolve(__dirname, '..', '..', '..', '..', 'senior-design-488908-1d5d3e1681ee.json');

let storage, pubsub;
try {
  storage = new Storage({ keyFilename: credentialPath });
} catch (e) {
  console.warn('[Analysis] GCS client init failed:', e.message);
}
try {
  pubsub = new PubSub({ projectId: GCP_PROJECT_ID, keyFilename: credentialPath });
} catch (e) {
  console.warn('[Analysis] PubSub client init failed:', e.message);
}

function getBucket() {
  return storage.bucket(PROCESSED_BUCKET);
}

/**
 * POST /api/analyze/:videoId
 * Publishes an analysis request to Pub/Sub topic `lecture-analysis-requested`.
 * The orchestrator pipeline will pick it up and process the video.
 */
async function analyze(req, res) {
  try {
    const { videoId } = req.params;
    const teacherName = req.query.teacher_name || req.body.teacher_name || 'Teacher';

    if (!pubsub) {
      return res.status(500).json({ error: 'PubSub client not initialized' });
    }

    const topic = pubsub.topic(PUBSUB_TOPIC);
    const payload = JSON.stringify({
      video_id: videoId,
      teacher_name: teacherName,  // Orchestrator bu field'ı bekliyor
    });

    const messageId = await topic.publishMessage({ data: Buffer.from(payload) });
    console.log(`[PubSub] Message ${messageId} published for video_id=${videoId}`);

    return res.json({ status: 'processing', video_id: videoId, messageId });
  } catch (err) {
    console.error('[Analyze] Error:', err.message);
    return res.status(500).json({ error: 'Analiz isteği gönderilemedi: ' + err.message });
  }
}

/**
 * GET /api/status/:videoId
 * Checks if the analysis report exists in GCS.
 * Frontend can poll this every 5 seconds.
 */
async function status(req, res) {
  try {
    const { videoId } = req.params;
    const blob = getBucket().blob(`reports/${videoId}.json`);
    const [exists] = await blob.exists();

    if (exists) {
      return res.json({ status: 'completed', video_id: videoId });
    }
    return res.json({ status: 'processing', video_id: videoId });
  } catch (err) {
    console.error('[Status] Error:', err.message);
    return res.status(500).json({ error: 'Durum kontrol edilemedi: ' + err.message });
  }
}

/**
 * GET /api/report/:videoId
 * Downloads and returns the analysis report JSON from GCS.
 */
async function report(req, res) {
  try {
    const { videoId } = req.params;
    const blob = getBucket().blob(`reports/${videoId}.json`);
    const [exists] = await blob.exists();

    if (!exists) {
      return res.status(404).json({ error: 'Rapor henüz hazır değil' });
    }

    const [content] = await blob.download();
    const reportData = JSON.parse(content.toString());
    return res.json(reportData);
  } catch (err) {
    console.error('[Report] Error:', err.message);
    return res.status(500).json({ error: 'Rapor okunamadı: ' + err.message });
  }
}

/**
 * GET /api/pdf/:videoId
 * Generates a 1-hour signed URL for the analysis PDF.
 */
async function pdf(req, res) {
  try {
    const { videoId } = req.params;
    const blob = getBucket().blob(`pdfs/${videoId}.pdf`);
    const [exists] = await blob.exists();

    if (!exists) {
      return res.status(404).json({ error: 'PDF henüz hazır değil' });
    }

    const [url] = await blob.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    return res.json({ url, video_id: videoId });
  } catch (err) {
    console.error('[PDF] Error:', err.message);
    return res.status(500).json({ error: 'PDF URL oluşturulamadı: ' + err.message });
  }
}

module.exports = { analyze, status, report, pdf };
