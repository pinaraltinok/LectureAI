import { apiPost } from '../api'

/**
 * Resolves a GCS URI (gs://bucket/path or https://storage.googleapis.com/...)
 * to a playable signed HTTPS URL via the backend signed-url endpoint.
 * Returns the original URL if it's already a playable URL, or null if no URL.
 */
export async function resolveVideoUrl(videoUrl) {
  if (!videoUrl) return null

  // Already a playable non-GCS URL (local path, blob, regular https)
  if (
    videoUrl.startsWith('/uploads/') ||
    videoUrl.startsWith('blob:') ||
    videoUrl.startsWith('data:') ||
    (videoUrl.startsWith('http') && !videoUrl.includes('storage.googleapis.com'))
  ) {
    return videoUrl
  }

  // GCS URI — needs signed URL
  if (videoUrl.startsWith('gs://') || videoUrl.includes('storage.googleapis.com')) {
    try {
      const res = await apiPost('/gcs/signed-urls', { uris: [videoUrl] })
      const result = res.results?.[0]
      if (result?.url) return result.url
      console.warn('[resolveVideoUrl] Failed to get signed URL:', result?.error)
      return null
    } catch (err) {
      console.error('[resolveVideoUrl] Error:', err.message)
      return null
    }
  }

  // Unknown format — return as-is
  return videoUrl
}
