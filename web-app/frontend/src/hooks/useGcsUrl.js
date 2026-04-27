import { useState, useEffect, useCallback, useRef } from 'react'
import { apiPost } from '../api'

// Refresh 2 minutes before expiry
const REFRESH_BUFFER_MS = 2 * 60 * 1000

/**
 * Converts GCS URLs (gs:// or https://storage.googleapis.com/...) 
 * to signed URLs via the backend. Returns the signed URL or the original if not GCS.
 * Auto-refreshes the signed URL before it expires.
 * 
 * @param {string|null} url - A GCS URL or regular URL
 * @returns {{ signedUrl: string|null, loading: boolean, error: string|null, refresh: () => void }}
 */
export function useGcsUrl(url) {
  const [signedUrl, setSignedUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const refreshTimerRef = useRef(null)
  const isMountedRef = useRef(true)
  const retryCountRef = useRef(0)
  const MAX_RETRIES = 3

  const fetchSignedUrl = useCallback((targetUrl) => {
    if (!targetUrl) {
      setSignedUrl(null)
      return
    }

    // If it's not a GCS URL, use as-is
    if (!targetUrl.startsWith('gs://') && !targetUrl.includes('storage.googleapis.com')) {
      setSignedUrl(targetUrl)
      return
    }

    setLoading(true)
    setError(null)

    apiPost('/gcs/signed-urls', { uris: [targetUrl] })
      .then((data) => {
        if (!isMountedRef.current) return
        const result = data.results?.[0]
        if (result?.url) {
          setSignedUrl(result.url)
          retryCountRef.current = 0 // Reset on success

          // Schedule auto-refresh before expiry
          const expiresInMs = (data.expiresInMinutes || 60) * 60 * 1000
          const refreshIn = Math.max(expiresInMs - REFRESH_BUFFER_MS, 60_000) // at least 1 min

          if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
          refreshTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              console.log('[useGcsUrl] Auto-refreshing signed URL')
              fetchSignedUrl(targetUrl)
            }
          }, refreshIn)
        } else {
          setError(result?.error || 'Signed URL alınamadı')
          setSignedUrl(targetUrl) // fallback
        }
      })
      .catch((err) => {
        if (!isMountedRef.current) return
        setError(err.message)
        setSignedUrl(targetUrl) // fallback to original
      })
      .finally(() => {
        if (isMountedRef.current) setLoading(false)
      })
  }, [])

  // Manual refresh function (e.g. on video error) — with retry limit
  const refresh = useCallback(() => {
    if (retryCountRef.current >= MAX_RETRIES) {
      console.warn('[useGcsUrl] Max retries reached, not refreshing')
      return
    }
    retryCountRef.current += 1
    if (url && (url.startsWith('gs://') || url.includes('storage.googleapis.com'))) {
      console.log('[useGcsUrl] Manual refresh triggered (attempt', retryCountRef.current, ')')
      fetchSignedUrl(url)
    }
  }, [url, fetchSignedUrl])

  useEffect(() => {
    isMountedRef.current = true
    retryCountRef.current = 0
    fetchSignedUrl(url)

    return () => {
      isMountedRef.current = false
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [url, fetchSignedUrl])

  return { signedUrl, loading, error, refresh }
}

/**
 * Batch convert multiple GCS URLs to signed URLs.
 * Auto-refreshes before expiry.
 * @param {string[]} urls
 * @returns {{ signedUrls: Record<string, string>, loading: boolean, refresh: () => void }}
 */
export function useGcsUrls(urls) {
  const [signedUrls, setSignedUrls] = useState({})
  const [loading, setLoading] = useState(false)
  const refreshTimerRef = useRef(null)
  const isMountedRef = useRef(true)

  const fetchBatch = useCallback((targetUrls) => {
    const gcsUrls = (targetUrls || []).filter(
      u => u && (u.startsWith('gs://') || u.includes('storage.googleapis.com'))
    )
    if (gcsUrls.length === 0) {
      const map = {}
      ;(targetUrls || []).forEach(u => { if (u) map[u] = u })
      setSignedUrls(map)
      return
    }

    setLoading(true)

    apiPost('/gcs/signed-urls', { uris: gcsUrls })
      .then((data) => {
        if (!isMountedRef.current) return
        const map = {}
        ;(targetUrls || []).forEach(u => { if (u && !gcsUrls.includes(u)) map[u] = u })
        ;(data.results || []).forEach(r => {
          map[r.uri] = r.url || r.uri
        })
        setSignedUrls(map)

        // Schedule auto-refresh
        const expiresInMs = (data.expiresInMinutes || 60) * 60 * 1000
        const refreshIn = Math.max(expiresInMs - REFRESH_BUFFER_MS, 60_000)

        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            console.log('[useGcsUrls] Auto-refreshing batch signed URLs')
            fetchBatch(targetUrls)
          }
        }, refreshIn)
      })
      .catch(() => {
        if (!isMountedRef.current) return
        const map = {}
        ;(targetUrls || []).forEach(u => { if (u) map[u] = u })
        setSignedUrls(map)
      })
      .finally(() => { if (isMountedRef.current) setLoading(false) })
  }, [])

  const refresh = useCallback(() => {
    fetchBatch(urls)
  }, [urls, fetchBatch])

  useEffect(() => {
    isMountedRef.current = true
    fetchBatch(urls)

    return () => {
      isMountedRef.current = false
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [JSON.stringify(urls), fetchBatch])

  return { signedUrls, loading, refresh }
}
