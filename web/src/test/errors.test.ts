import { describe, it, expect } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { describeApiError } from '@/api/errors'

const FALLBACK = 'Invalid email or password.'

function axiosError(status: number, data: unknown): AxiosError {
  const err = new AxiosError('request failed')
  const headers = new AxiosHeaders()
  err.response = {
    status,
    data,
    statusText: '',
    headers,
    config: { headers },
  }
  return err
}

describe('describeApiError', () => {
  it('falls back for a non-axios error', () => {
    expect(describeApiError(new Error('boom'), FALLBACK)).toBe(FALLBACK)
    expect(describeApiError('not an error', FALLBACK)).toBe(FALLBACK)
  })

  it('reports an unreachable server when there is no response', () => {
    expect(describeApiError(new AxiosError('Network Error'), FALLBACK))
      .toBe('Cannot reach the server. Is the backend running?')
  })

  it('surfaces a 500 as a server error rather than as bad credentials', () => {
    // A stopped backend reaches the app as a 500 from the Vite proxy, so this
    // must not read as a rejected password.
    const msg = describeApiError(axiosError(500, '<!doctype html>'), FALLBACK)
    expect(msg).toContain('Server error (500)')
    expect(msg).not.toBe(FALLBACK)
  })

  it('includes a JSON error detail on a 5xx', () => {
    expect(describeApiError(axiosError(503, { error: 'database disabled' }), FALLBACK))
      .toBe('Server error (503): database disabled. Check the backend logs.')
  })

  it('uses the server detail for a rejected 401', () => {
    expect(describeApiError(axiosError(401, { error: 'Invalid Google token' }), FALLBACK))
      .toBe('Invalid Google token')
  })

  it('falls back on a 401 with no usable body', () => {
    expect(describeApiError(axiosError(401, '<!doctype html>'), FALLBACK)).toBe(FALLBACK)
    expect(describeApiError(axiosError(403, {}), FALLBACK)).toBe(FALLBACK)
  })

  it('ignores a non-string error field', () => {
    expect(describeApiError(axiosError(400, { error: { nested: true } }), FALLBACK)).toBe(FALLBACK)
  })
})
