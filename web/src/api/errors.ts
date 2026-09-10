import axios from 'axios'

/**
 * User-facing description of a failed API call.
 *
 * Distinguishes "never reached the server" and "server failed" from "server
 * rejected the credentials".  Without this every auth failure reads the same,
 * so a stopped backend is indistinguishable from a bad password — note that a
 * backend that is down surfaces as a 500 from the Vite proxy rather than as a
 * network error, because the proxy answers the request itself.
 */
export function describeApiError(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback
  if (!err.response) return 'Cannot reach the server. Is the backend running?'

  const { status, data } = err.response
  // Only trust a JSON body; a proxy error or SPA fallback returns HTML.
  const detail =
    data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string'
      ? (data as { error: string }).error
      : ''

  if (status === 401 || status === 403) return detail || fallback
  if (status >= 500) {
    return `Server error (${status})${detail ? `: ${detail}` : ''}. Check the backend logs.`
  }
  return detail || fallback
}
