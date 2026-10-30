import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAssetPreload } from '@/hooks/useAssetPreload'

// jsdom never fetches images, so these tests drive the hook through its timers.

describe('useAssetPreload', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('is ready after minMs when there is nothing to load', async () => {
    const { result } = renderHook(() => useAssetPreload([], { minMs: 300 }))
    expect(result.current.ready).toBe(false)
    expect(result.current.progress).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(result.current.ready).toBe(true)
  })

  it('starts at zero progress with pending images', () => {
    const { result } = renderHook(() => useAssetPreload(['/a.webp', '/b.webp'], { minMs: 0, timeoutMs: 5000 }))
    expect(result.current.ready).toBe(false)
    expect(result.current.progress).toBe(0)
  })

  it('gives up waiting after timeoutMs so a stalled image cannot block the page', async () => {
    const { result } = renderHook(() => useAssetPreload(['/portraits/never.webp'], { minMs: 0, timeoutMs: 1000 }))
    await act(() => vi.advanceTimersByTimeAsync(999))
    expect(result.current.ready).toBe(false)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(result.current.ready).toBe(true)
  })
})
