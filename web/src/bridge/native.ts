// Bridge to the native apps when the web app runs inside their WebView.
//
// iOS registers a WKScriptMessageHandler named "gp"; Android exposes a
// JavascriptInterface named "gp" with a postMessage(String) method.  Both
// receive the same JSON strings.  When neither is present (a browser) the
// calls are no-ops.

import type { ProgressDoc } from '@/api/progress'

export type BridgeMessage =
  | { type: 'ready' }
  | { type: 'storyComplete'; slug: string; unlockKey: string | null }
  | { type: 'challengeComplete'; id: string }
  | { type: 'close' }
  | { type: 'progress'; doc: ProgressDoc }

interface NativeWindow {
  webkit?: { messageHandlers?: { gp?: { postMessage: (msg: string) => void } } }
  gp?: { postMessage: (msg: string) => void }
}

/** True when the page was opened by a native app (`?embed=1`). */
export function isEmbedded(): boolean {
  try { return new URLSearchParams(window.location.search).get('embed') === '1' } catch { return false }
}

export function postToNative(msg: BridgeMessage): boolean {
  const w = window as unknown as NativeWindow
  const json = JSON.stringify(msg)
  let sent = false
  try { w.webkit?.messageHandlers?.gp?.postMessage(json); sent = !!w.webkit?.messageHandlers?.gp } catch { /* not iOS */ }
  try { if (w.gp?.postMessage) { w.gp.postMessage(json); sent = true } } catch { /* not Android */ }
  return sent
}

/**
 * The native app passes its JWT in the URL fragment (`#token=…`), which is
 * never sent to the server. Store it and strip it from the address bar.
 * A guest in the native app is passed as `#guest=1` instead; returns true
 * when the page should enter guest mode.
 */
export function adoptTokenFromFragment(): boolean {
  try {
    const hash = window.location.hash.replace(/^#/, '')
    // The fragment is stripped once read, so a reload inside the app (a new
    // deploy, a rotation) would otherwise drop a guest onto the web login.
    if (!hash) return isEmbedded() && sessionStorage.getItem(GUEST_KEY) === '1'
    const params = new URLSearchParams(hash)
    const token = params.get('token')
    const guest = params.get('guest') === '1'
    if (token) { localStorage.setItem('access_token', token); sessionStorage.removeItem(GUEST_KEY) }
    else if (guest) sessionStorage.setItem(GUEST_KEY, '1')
    if (token || guest) window.history.replaceState(null, '', window.location.pathname + window.location.search)
    return !token && guest
  } catch { return false /* storage unavailable */ }
}

const GUEST_KEY = 'gp_native_guest'
