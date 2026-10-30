import { describe, it, expect, beforeEach, vi } from 'vitest'
import { adoptTokenFromFragment, isEmbedded, postToNative } from '@/bridge/native'

describe('native bridge', () => {
  beforeEach(() => {
    localStorage.clear()
    delete (window as unknown as { gp?: unknown }).gp
    delete (window as unknown as { webkit?: unknown }).webkit
    window.history.replaceState(null, '', '/play/story/x')
  })

  it('posts to both the iOS and Android handlers when present', () => {
    const android = vi.fn(), ios = vi.fn()
    ;(window as unknown as { gp: unknown }).gp = { postMessage: android }
    ;(window as unknown as { webkit: unknown }).webkit = { messageHandlers: { gp: { postMessage: ios } } }
    expect(postToNative({ type: 'close' })).toBe(true)
    expect(android).toHaveBeenCalledWith('{"type":"close"}')
    expect(ios).toHaveBeenCalledWith('{"type":"close"}')
  })

  it('is a no-op in a plain browser', () => {
    expect(postToNative({ type: 'ready' })).toBe(false)
  })

  it('stores the token from the fragment and strips it from the URL', () => {
    window.history.replaceState(null, '', '/play/story/x?embed=1#token=abc.def.ghi')
    adoptTokenFromFragment()
    expect(localStorage.getItem('access_token')).toBe('abc.def.ghi')
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?embed=1')
    expect(isEmbedded()).toBe(true)
  })
})
