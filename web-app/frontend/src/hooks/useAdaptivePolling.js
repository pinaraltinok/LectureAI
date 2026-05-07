import { useEffect, useRef } from 'react'

export default function useAdaptivePolling({
  task,
  enabled = true,
  baseIntervalMs = 60000,
  maxBackoffMs = 300000,
  runImmediately = true,
}) {
  const timerRef = useRef(null)
  const backoffRef = useRef(baseIntervalMs)
  const taskRef = useRef(task)
  taskRef.current = task

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const schedule = (ms) => {
      clearTimer()
      if (cancelled || document.visibilityState === 'hidden') return
      timerRef.current = setTimeout(runOnce, ms)
    }

    const runOnce = async () => {
      if (cancelled || document.visibilityState === 'hidden') return
      try {
        await taskRef.current()
        backoffRef.current = baseIntervalMs
        schedule(baseIntervalMs)
      } catch (err) {
        if (err?.status === 429) {
          const retryAfterMs = Number.isFinite(err?.retryAfterSec)
            ? err.retryAfterSec * 1000
            : backoffRef.current
          backoffRef.current = Math.min(
            Math.max(retryAfterMs, backoffRef.current * 2),
            maxBackoffMs
          )
          schedule(backoffRef.current)
          return
        }
        schedule(baseIntervalMs)
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearTimer()
      } else {
        schedule(0)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    if (runImmediately) schedule(0)
    else schedule(baseIntervalMs)

    return () => {
      cancelled = true
      clearTimer()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, baseIntervalMs, maxBackoffMs, runImmediately])
}
