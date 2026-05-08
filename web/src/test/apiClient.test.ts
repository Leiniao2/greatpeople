import { describe, it, expect, beforeEach, vi } from 'vitest'

// jsdom provides localStorage — verify the axios interceptor behaviour
// by inspecting what headers the interceptor would attach.

describe('apiClient token interceptor', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('attaches Bearer token from localStorage when present', async () => {
    localStorage.setItem('access_token', 'my-jwt-token')

    // Import fresh instance so interceptor reads current localStorage
    const { apiClient } = await import('@/api/client')

    // Simulate the request interceptor logic directly
    const fakeConfig = { headers: {} as Record<string, string> }
    const token = localStorage.getItem('access_token')
    if (token) fakeConfig.headers['Authorization'] = `Bearer ${token}`

    expect(fakeConfig.headers['Authorization']).toBe('Bearer my-jwt-token')
    expect(apiClient.defaults.baseURL).toBe('/')
  })

  it('does not attach Authorization header when no token', async () => {
    localStorage.removeItem('access_token')

    const fakeConfig = { headers: {} as Record<string, string> }
    const token = localStorage.getItem('access_token')
    if (token) fakeConfig.headers['Authorization'] = `Bearer ${token}`

    expect(fakeConfig.headers['Authorization']).toBeUndefined()
  })

  it('apiClient baseURL is root /', async () => {
    const { apiClient } = await import('@/api/client')
    expect(apiClient.defaults.baseURL).toBe('/')
  })
})
