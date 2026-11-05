import axios, { type AxiosRequestConfig } from 'axios'
import { isEmbedded, postToNative } from '@/bridge/native'

export const apiClient = axios.create({ baseURL: '/' })

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// One renewal at a time: parallel 401s share the same refresh call.
let refreshing: Promise<string | null> | null = null

/** Trade the refresh token for a new access token; null when it is gone or rejected. */
export function refreshAccessToken(): Promise<string | null> {
  const refresh = localStorage.getItem('refresh_token')
  if (!refresh) return Promise.resolve(null)
  refreshing ??= axios
    .post<{ accessToken: string }>('/auth/refresh', null, { headers: { Authorization: `Bearer ${refresh}` } })
    .then((r) => { localStorage.setItem('access_token', r.data.accessToken); return r.data.accessToken })
    .catch(() => null)
    .finally(() => { refreshing = null })
  return refreshing
}

/** The session is over: inside the app, let it sign in natively; on the web, go to the login page. */
function sessionExpired() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  if (isEmbedded() && postToNative({ type: 'signedOut' })) return
  window.location.href = '/login'
}

apiClient.interceptors.response.use(
  (r) => r,
  async (err) => {
    // Only act on 401 if there was already a stored token (expired session).
    // During login attempts there is no token yet, so we let the caller handle the error.
    const config = err.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined
    if (err.response?.status === 401 && localStorage.getItem('access_token')) {
      if (config && !config._retried) {
        const token = await refreshAccessToken()
        if (token) {
          config._retried = true
          config.headers = { ...config.headers, Authorization: `Bearer ${token}` }
          return apiClient(config)
        }
      }
      sessionExpired()
    }
    return Promise.reject(err)
  },
)
