/**
 * Centralized application constants — Externalized Configuration.
 *
 * All environment-dependent values are read from process.env with
 * sensible defaults for local development. This eliminates "magic strings"
 * scattered across controller files and provides a single source of truth.
 *
 * Follows the Twelve-Factor App methodology, Factor III: Config.
 * @see {@link https://12factor.net/config}
 *
 * To override in production, set the corresponding environment variable
 * (e.g. GCP_PROJECT_ID, PROCESSED_BUCKET) in Cloud Run / .env file.
 */
module.exports = {
  // ── Google Cloud Platform ──────────────────────────────────
  GCP_PROJECT_ID:     process.env.GCP_PROJECT_ID     || 'senior-design-488908',
  PUBSUB_TOPIC:       process.env.PUBSUB_TOPIC       || 'lecture-analysis-requested',
  PROCESSED_BUCKET:   process.env.PROCESSED_BUCKET   || 'lectureai_processed',
  VIDEO_BUCKET:       process.env.VIDEO_BUCKET        || 'lectureai_full_videos',
  VIDEO_PREFIX:       process.env.VIDEO_PREFIX         || 'Lesson_Records',

  // ── Analysis Pipeline ──────────────────────────────────────
  GCS_POLL_INTERVAL:  parseInt(process.env.GCS_POLL_INTERVAL || '5000', 10),
  GCS_MAX_POLLS:      parseInt(process.env.GCS_MAX_POLLS     || '720', 10),

  // ── Authentication ─────────────────────────────────────────
  JWT_SECRET:         process.env.JWT_SECRET,
  JWT_EXPIRES_IN:     process.env.JWT_EXPIRES_IN || '24h',
};
