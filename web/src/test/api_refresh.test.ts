import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import axios, { type AxiosAdapter } from 'axios'
import { apiClient } from '@/api/client'

// An expired access token is renewed once with the refresh token and the
// request is replayed; only a rejected refresh ends the session.
describe('api session renewal', () => {
  const defaultAdapter = axios.defaults.adapter
  let calls: string[]
  const respond = (handler: (url: string, auth: string) => [number, unknown]): AxiosAdapter => async (config) => {
    const auth = String(config.headers?.Authorization ?? '')
    calls.push(`${config.url} ${auth}`)
    const [status, data] = handler(config.url ?? '', auth)
    const res = { data, status, statusText: '', headers: {}, config }
    if (status >= 400) throw Object.assign(new axios.AxiosError('fail', String(status), config, null, res), { response: res })
    return res
  }

  beforeEach(() => {
    calls = []
    localStorage.clear()
    window.history.replaceState(null, '', '/collection')
  })
  afterEach(() => {
    axios.defaults.adapter = defaultAdapter
    apiClient.defaults.adapter = defaultAdapter
  })

  it('refreshes an expired token and retries the request', async () => {
    localStorage.setItem('access_token', 'old')
    localStorage.setItem('refresh_token', 'r1')
    const adapter = respond((url, auth) =>
      url === '/auth/refresh' ? (auth === 'Bearer r1' ? [200, { accessToken: 'new' }] : [401, {}])
        : auth === 'Bearer new' ? [200, { ok: true }] : [401, {}])
    axios.defaults.adapter = adapter
    apiClient.defaults.adapter = adapter
    const r = await apiClient.get('/profile/cards')
    expect(r.data).toEqual({ ok: true })
    expect(localStorage.getItem('access_token')).toBe('new')
    expect(calls).toEqual(['/profile/cards Bearer old', '/auth/refresh Bearer r1', '/profile/cards Bearer new'])
  })

  it('clears the session when the refresh token is rejected too', async () => {
    localStorage.setItem('access_token', 'old')
    localStorage.setItem('refresh_token', 'gone')
    const adapter = respond(() => [401, {}])
    axios.defaults.adapter = adapter
    apiClient.defaults.adapter = adapter
    await expect(apiClient.get('/profile/cards')).rejects.toBeTruthy()
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(localStorage.getItem('refresh_token')).toBeNull()
  })
})
