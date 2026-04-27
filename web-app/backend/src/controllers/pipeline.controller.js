const { Storage } = require('@google-cloud/storage');

const storage = new Storage();

const PROCESSED_BUCKET =
  process.env.GCS_BUCKET_PROCESSED || process.env.GCS_BUCKET_NAME || 'lectureai_processed';

function _sanitizeVideoId(videoId) {
  if (!videoId || typeof videoId !== 'string') {
    return null;
  }
  if (videoId.includes('/') || videoId.includes('..')) {
    return null;
  }
  return videoId.trim();
}

function _summarizeState(state) {
  if (!state || typeof state !== 'object') {
    return 'Durum bilinmiyor.';
  }
  const bits = [];
  if (state.audio_done || state.audio_artifact_exists) {
    bits.push('Ses hazır');
  } else {
    bits.push('Ses bekleniyor');
  }
  if (state.cv_done || state.cv_artifact_exists) {
    bits.push('CV hazır');
  } else {
    bits.push('CV bekleniyor');
  }
  if (state.report_done || (state.report_json_exists && state.report_pdf_exists)) {
    bits.push('Rapor + PDF tamam');
  } else if (state.report_json_exists) {
    bits.push('Rapor JSON var, PDF eksik olabilir');
  } else if (state.report_error) {
    bits.push(`Rapor hatası: ${String(state.report_error).slice(0, 120)}`);
  } else {
    bits.push('Rapor henüz yok veya işleniyor');
  }
  if (state.last_signal) {
    bits.push(`Son sinyal: ${state.last_signal}`);
  }
  return bits.join(' · ');
}

/**
 * GET /api/pipeline/videos/:videoId
 * GCS: pipeline_state/{videoId}.json + pipeline_events/{videoId}.json (varsa)
 */
async function getVideoPipeline(req, res) {
  try {
    const videoId = _sanitizeVideoId(req.params.videoId);
    if (!videoId) {
      return res.status(400).json({ error: 'Geçersiz videoId.' });
    }

    const bucket = storage.bucket(PROCESSED_BUCKET);
    const stateFile = bucket.file(`pipeline_state/${videoId}.json`);
    const eventsFile = bucket.file(`pipeline_events/${videoId}.json`);

    let state = null;
    try {
      const [buf] = await stateFile.download();
      state = JSON.parse(buf.toString('utf-8'));
    } catch (err) {
      if (err.code === 404) {
        return res.status(404).json({
          error: 'Bu video için henüz pipeline_state yok.',
          videoId,
          hint: 'İlk Pub/Sub sinyali veya worker çağrısından sonra oluşur.',
        });
      }
      throw err;
    }

    let events = [];
    try {
      const [ebuf] = await eventsFile.download();
      const parsed = JSON.parse(ebuf.toString('utf-8'));
      events = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err.code !== 404) {
        console.warn('pipeline_events read failed:', err.message);
      }
    }

    const timeline = [...events].sort((a, b) =>
      String(a.received_at || '').localeCompare(String(b.received_at || '')),
    );

    return res.json({
      videoId,
      bucket: PROCESSED_BUCKET,
      state,
      events: timeline,
      summary_tr: _summarizeState(state),
    });
  } catch (err) {
    console.error('getVideoPipeline error:', err);
    return res.status(500).json({ error: 'Pipeline durumu okunamadı: ' + err.message });
  }
}

/**
 * POST /api/pipeline/worker-events
 * Worker’ların BACKEND_STATUS_WEBHOOK ile gönderdiği gövdeyi kabul eder,
 * pipeline_events/{videoId}.json içine append eder.
 *
 * Güvenlik: PIPELINE_WEBHOOK_SECRET tanımlıysa Authorization: Bearer <secret> zorunlu.
 */
async function postWorkerPipelineEvent(req, res) {
  try {
    const secret = (process.env.PIPELINE_WEBHOOK_SECRET || '').trim();
    if (secret) {
      const auth = req.headers.authorization || '';
      if (auth !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Geçersiz veya eksik webhook yetkisi.' });
      }
    }

    const { video_id: videoIdRaw, stage, status, detail } = req.body || {};
    const videoId = _sanitizeVideoId(String(videoIdRaw || ''));
    if (!videoId) {
      return res.status(400).json({ error: 'video_id alanı zorunlu ve geçerli olmalı.' });
    }
    if (!stage || !status) {
      return res.status(400).json({ error: 'stage ve status alanları zorunlu.' });
    }

    const bucket = storage.bucket(PROCESSED_BUCKET);
    const eventsFile = bucket.file(`pipeline_events/${videoId}.json`);

    let events = [];
    try {
      const [buf] = await eventsFile.download();
      const parsed = JSON.parse(buf.toString('utf-8'));
      events = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
    }

    const entry = {
      received_at: new Date().toISOString(),
      video_id: videoId,
      stage: String(stage),
      status: String(status),
      detail: detail != null ? String(detail) : '',
    };
    events.push(entry);

    await eventsFile.save(JSON.stringify(events, null, 2), {
      contentType: 'application/json; charset=utf-8',
      resumable: false,
    });

    return res.json({ ok: true, videoId, events_count: events.length });
  } catch (err) {
    console.error('postWorkerPipelineEvent error:', err);
    return res.status(500).json({ error: 'Olay kaydedilemedi: ' + err.message });
  }
}

module.exports = {
  getVideoPipeline,
  postWorkerPipelineEvent,
};
