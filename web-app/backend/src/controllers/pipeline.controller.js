const { Storage } = require('@google-cloud/storage');
const path = require('path');
const { analysisProgress } = require('./admin.controller');
const { PROCESSED_BUCKET } = require('../config/constants');

// ─── GCS Client ─────────────────────────────────────────────
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const credentialPath = path.join(projectRoot, 'senior-design-488908-1d5d3e1681ee.json');

let gcsStorage;
try { gcsStorage = new Storage({ keyFilename: credentialPath }); } catch (e) { console.warn('[Pipeline] GCS init failed:', e.message); }

// ─── In-memory pipeline events store ────────────────────────
// Map<videoId, Array<{ stage, status, detail, receivedAt }>>
const pipelineEvents = new Map();

// ─── Stage → Admin Progress mapping ────────────────────────
const STAGE_PROGRESS_MAP = {
  'audio:started':                    { stage: 'processing', message: 'Ses analizi başladı...',           percent: 10 },
  'audio:processing':                 { stage: 'processing', message: 'Ses dosyası işleniyor...',         percent: 15 },
  'audio:gcs_uploaded':               { stage: 'processing', message: 'Ses dosyası yüklendi...',          percent: 20 },
  'audio:completed':                  { stage: 'processing', message: 'Ses analizi tamamlandı.',          percent: 25 },
  'audio:skipped_existing':           { stage: 'processing', message: 'Ses analizi (mevcut, atlandı).',   percent: 25 },
  'cv:started':                       { stage: 'processing', message: 'Görüntü analizi başladı...',       percent: 30 },
  'cv:triggering_modal':              { stage: 'processing', message: 'Görüntü modeli tetikleniyor...',   percent: 35 },
  'cv:triggered':                     { stage: 'processing', message: 'Görüntü analizi tetiklendi.',      percent: 40 },
  'cv:completed':                     { stage: 'processing', message: 'Görüntü analizi tamamlandı.',      percent: 50 },
  'cv:skipped_existing':              { stage: 'processing', message: 'Görüntü analizi (mevcut, atlandı).', percent: 50 },
  'orchestrator:state_updated':       { stage: 'processing', message: 'Pipeline durumu güncellendi...',   percent: 52 },
  'orchestrator:waiting_for_dependencies': { stage: 'processing', message: 'Bağımlılıklar bekleniyor...', percent: 53 },
  'orchestrator:started':             { stage: 'reporting',  message: 'Rapor oluşturma başladı...',       percent: 55 },
  'orchestrator:loading_audio_input': { stage: 'reporting',  message: 'Ses verileri yükleniyor...',       percent: 58 },
  'orchestrator:report_generation_started': { stage: 'reporting', message: 'Rapor oluşturuluyor...',      percent: 65 },
  'orchestrator:llm_provider_try':    { stage: 'reporting',  message: 'LLM modeli deneniyor...',          percent: 70 },
  'orchestrator:llm_provider_ok':     { stage: 'reporting',  message: 'LLM yanıtı alındı.',              percent: 75 },
  'orchestrator:llm_provider_failed': { stage: 'reporting',  message: 'LLM denemesi başarısız, tekrar deneniyor...', percent: 70 },
  'orchestrator:llm_retry_wait':      { stage: 'reporting',  message: 'LLM tekrar denemesi bekleniyor...', percent: 70 },
  'orchestrator:pdf_generation_started':    { stage: 'uploading', message: 'PDF oluşturuluyor...',        percent: 85 },
  'orchestrator:pdf_generation_completed':  { stage: 'uploading', message: 'PDF tamamlandı.',             percent: 90 },
  'orchestrator:completed':           { stage: 'completed',  message: 'Analiz tamamlandı!',              percent: 100 },
  'orchestrator:failed':              { stage: 'failed',     message: 'Analiz başarısız oldu.',           percent: 0 },
  'orchestrator:skipped_report_exists': { stage: 'completed', message: 'Rapor zaten mevcut.',             percent: 100 },
};

/**
 * POST /api/pipeline/worker-events
 * Receives events from pipeline workers (audio, cv, orchestrator).
 * Auth: Bearer token matching PIPELINE_WEBHOOK_SECRET (optional in dev).
 */
async function postWorkerPipelineEvent(req, res) {
  // ── Auth check (mandatory — prevents fake pipeline events) ──
  const secret = process.env.PIPELINE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Pipeline] PIPELINE_WEBHOOK_SECRET is not set. Rejecting event.');
    return res.status(500).json({ error: 'Pipeline yapılandırma hatası.' });
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (token !== secret) {
    return res.status(401).json({ error: 'Yetkisiz: Geçersiz pipeline secret.' });
  }

  const { video_id, stage, status, detail } = req.body;

  if (!video_id || !stage) {
    return res.status(400).json({ error: 'video_id ve stage zorunludur.' });
  }

  // ── Store event ──
  const event = {
    stage,
    status: status || 'unknown',
    detail: detail || null,
    receivedAt: new Date().toISOString(),
  };

  if (!pipelineEvents.has(video_id)) {
    pipelineEvents.set(video_id, []);
  }
  pipelineEvents.get(video_id).push(event);

  console.log(`[Pipeline] Event: video_id=${video_id}, stage=${stage}, status=${status}`);

  // ── Update analysisProgress for backward compat ──
  const progressKey = `${stage}:${status}`;
  const mapped = STAGE_PROGRESS_MAP[progressKey];

  if (mapped) {
    // Find the jobId that corresponds to this video_id
    let targetJobId = null;
    for (const [jobId, progress] of analysisProgress.entries()) {
      if (progress.videoId === video_id) {
        targetJobId = jobId;
        break;
      }
    }

    if (targetJobId) {
      const existing = analysisProgress.get(targetJobId) || {};
      analysisProgress.set(targetJobId, {
        ...existing,
        stage: mapped.stage,
        message: mapped.message,
        percent: mapped.percent,
      });
      console.log(`[Pipeline] Progress updated for jobId=${targetJobId}: ${mapped.stage} ${mapped.percent}%`);
    }
  }

  // ── Parse failed detail if JSON ──
  let parsedDetail = detail;
  if (status === 'failed' && detail) {
    try {
      parsedDetail = JSON.parse(detail);
    } catch {
      // detail is plain text, keep as-is
    }
  }

  return res.json({
    ok: true,
    video_id,
    stage,
    status,
    receivedAt: event.receivedAt,
  });
}

/**
 * GET /api/pipeline/videos/:videoId
 * Returns pipeline status: in-memory events + GCS pipeline_state.
 * Auth: JWT + ADMIN/TEACHER role.
 */
async function getPipelineStatus(req, res) {
  const { videoId } = req.params;

  // ── In-memory events ──
  const events = pipelineEvents.get(videoId) || [];

  // ── GCS pipeline_state (optional) ──
  let gcsState = null;
  if (gcsStorage) {
    try {
      const stateFile = gcsStorage.bucket(PROCESSED_BUCKET).file(`pipeline_state/${videoId}.json`);
      const [exists] = await stateFile.exists();
      if (exists) {
        const [content] = await stateFile.download();
        gcsState = JSON.parse(content.toString());
      }
    } catch (e) {
      console.warn(`[Pipeline] GCS state read failed for ${videoId}:`, e.message);
    }
  }

  // ── Build Turkish summary ──
  const summaryParts = [];
  if (gcsState) {
    if (gcsState.audio_done) summaryParts.push('Ses analizi tamamlandı');
    else if (gcsState.audio_artifact_exists) summaryParts.push('Ses dosyası mevcut');
    else summaryParts.push('Ses analizi bekleniyor');

    if (gcsState.cv_done) summaryParts.push('Görüntü analizi tamamlandı');
    else if (gcsState.cv_artifact_exists) summaryParts.push('Görüntü verisi mevcut');
    else summaryParts.push('Görüntü analizi bekleniyor');

    if (gcsState.report_done) summaryParts.push('Rapor hazır');
    else if (gcsState.report_error) summaryParts.push(`Rapor hatası: ${gcsState.report_error}`);
    else if (gcsState.audio_done && gcsState.cv_done) summaryParts.push('Rapor oluşturuluyor');
    else summaryParts.push('Rapor bağımlılıkları bekleniyor');
  } else if (events.length > 0) {
    const last = events[events.length - 1];
    summaryParts.push(`Son olay: ${last.stage} — ${last.status}`);
  } else {
    summaryParts.push('Henüz pipeline olayı yok');
  }

  return res.json({
    videoId,
    events,
    state: gcsState,
    summary_tr: summaryParts.join('. ') + '.',
  });
}

module.exports = { postWorkerPipelineEvent, getPipelineStatus, pipelineEvents };
