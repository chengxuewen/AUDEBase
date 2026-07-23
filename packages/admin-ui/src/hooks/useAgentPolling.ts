import { useState, useEffect, useRef, useCallback } from 'react'

interface PollingResult<T> {
  data: T | null
  error: Error | null
  loading: boolean
}

/**
 * Generic Agent HTTP polling hook (D25.6.1)
 * Used for IoT device status, print progress, etc.
 *
 * Features:
 * - Fetches immediately on mount, then at interval
 * - Cleans up interval on unmount
 * - Pauses when browser tab is hidden
 * - Returns { data, error, loading }
 */
export function useAgentPolling<T>(
  url: string,
  intervalMs = 5000,
): PollingResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  // ponytail: ref avoids stale closure in setInterval callback
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json.data ?? json)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [url])

  // Main polling effect
  useEffect(() => {
    let active = true

    const poll = async () => {
      if (!active) return
      await fetchData()
    }

    void poll()
    intervalRef.current = setInterval(poll, intervalMs)

    return () => {
      active = false
      clearInterval(intervalRef.current)
    }
  }, [fetchData, intervalMs])

  // Pause on tab hidden
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.hidden) {
        clearInterval(intervalRef.current)
      } else {
        clearInterval(intervalRef.current)
        void fetchData()
        intervalRef.current = setInterval(fetchData, intervalMs)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [fetchData, intervalMs])

  return { data, error, loading }
}
