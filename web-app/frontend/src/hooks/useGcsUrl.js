import { useState, useEffect } from 'react'
import { apiPost } from '../api'

/**
 * Converts GCS URLs (gs:// or https://storage.googleapis.com/...) 
 * to signed URLs via the backend. Returns the signed URL or the original if not GCS.
 * 
 * @param {string|null} url - A GCS URL or regular URL
 * @returns {{ signedUrl: string|null, loading: boolean, error: string|null }}
 */
export function useGcsUrl(url) {
  const [signedUrl, setSignedUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!url) {
      setSignedUrl(null)
      return
    }

    // If it's not a GCS URL, use as-is
    if (!url.startsWith('gs://') && !url.includes('storage.googleapis.com')) {
      setSignedUrl(url)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    apiPost('/gcs/signed-urls', { uris: [url] })
      .then((data) => {
        if (cancelled) return
        const result = data.results?.[0]
        if (result?.url) {
          setSignedUrl(result.url)
        } else {
          setError(result?.error || 'Signed URL alınamadı')
          setSignedUrl(url) // fallback
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message)
        setSignedUrl(url) // fallback to original
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [url])

  return { signedUrl, loading, error }
}

/**
 * Batch convert multiple GCS URLs to signed URLs.
 * @param {string[]} urls
 * @returns {{ signedUrls: Record<string, string>, loading: boolean }}
 */
export function useGcsUrls(urls) {
  const [signedUrls, setSignedUrls] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const gcsUrls = (urls || []).filter(
      u => u && (u.startsWith('gs://') || u.includes('storage.googleapis.com'))
    )
    if (gcsUrls.length === 0) {
      // Pass-through all non-GCS
      const map = {}
      ;(urls || []).forEach(u => { if (u) map[u] = u })
      setSignedUrls(map)
      return
    }

    let cancelled = false
    setLoading(true)

    apiPost('/gcs/signed-urls', { uris: gcsUrls })
      .then((data) => {
        if (cancelled) return
        const map = {}
        // Non-GCS pass-through
        ;(urls || []).forEach(u => { if (u && !gcsUrls.includes(u)) map[u] = u })
        // Signed results
        ;(data.results || []).forEach(r => {
          map[r.uri] = r.url || r.uri
        })
        setSignedUrls(map)
      })
      .catch(() => {
        if (cancelled) return
        const map = {}
        ;(urls || []).forEach(u => { if (u) map[u] = u })
        setSignedUrls(map)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [JSON.stringify(urls)])

  return { signedUrls, loading }
}
