import { useEffect, useRef, useState } from 'react'

// URLs that have already been fetched and decoded in this session.  Pages
// share artwork (a portrait shown in Collection is the same file Epic uses),
// so revisiting a page or switching tabs should not show the loader again.
const loaded = new Set<string>()

interface Options {
  /** Keep the loader up at least this long so it doesn't flash. */
  minMs?: number
  /** Give up waiting after this long; images still load in the background. */
  timeoutMs?: number
}

/**
 * Preloads a list of image URLs and reports when they are all decoded.
 * A failed image counts as done — a missing file must not block the page.
 */
export function useAssetPreload(urls: string[], { minMs = 400, timeoutMs = 8000 }: Options = {}) {
  const pending = urls.filter(u => !loaded.has(u))
  const [done, setDone] = useState(0)
  const [ready, setReady] = useState(pending.length === 0 && minMs === 0)
  const startedAt = useRef(Date.now())

  // Only re-run when the set of URLs actually changes.
  const key = pending.join('\n')

  useEffect(() => {
    let cancelled = false
    let finished = 0
    const total = pending.length
    const start = startedAt.current
    const timers: ReturnType<typeof setTimeout>[] = []

    const finish = () => {
      if (cancelled) return
      const wait = Math.max(0, minMs - (Date.now() - start))
      if (wait === 0) setReady(true)
      else timers.push(setTimeout(() => { if (!cancelled) setReady(true) }, wait))
    }

    if (total === 0) { finish(); return () => { cancelled = true; timers.forEach(clearTimeout) } }

    const settle = (url: string) => {
      loaded.add(url)
      finished++
      if (cancelled) return
      setDone(finished)
      if (finished === total) finish()
    }

    for (const url of pending) {
      const img = new Image()
      img.src = url
      // decode() resolves once the image is ready to paint, not merely
      // fetched.  Fall back to load/error events where it is unavailable.
      const decoded = typeof img.decode === 'function'
        ? img.decode()
        : new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() })
      decoded.catch(() => {}).finally(() => settle(url))
    }

    timers.push(setTimeout(() => { if (!cancelled && finished < total) finish() }, timeoutMs))

    return () => { cancelled = true; timers.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { ready, progress: pending.length === 0 ? 1 : done / pending.length }
}
