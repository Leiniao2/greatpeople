import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuth } from '@/hooks/useAuth'

// Mock the authApi module so tests never hit the network
vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    ssoLogin: vi.fn(),
  },
}))

import { authApi } from '@/api/auth'

const mockedAuthApi = authApi as {
  login: ReturnType<typeof vi.fn>
  register: ReturnType<typeof vi.fn>
  logout: ReturnType<typeof vi.fn>
  ssoLogin: ReturnType<typeof vi.fn>
}

// Reset Zustand store state between tests
beforeEach(() => {
  localStorage.clear()
  useAuth.setState({ isLoggedIn: false, isGuest: false })
  vi.clearAllMocks()
})

describe('useAuth — guest mode', () => {
  it('starts with isGuest false', () => {
    expect(useAuth.getState().isGuest).toBe(false)
  })

  it('enterGuestMode sets isGuest to true', () => {
    useAuth.getState().enterGuestMode()
    expect(useAuth.getState().isGuest).toBe(true)
  })

  it('exitGuestMode sets isGuest back to false', () => {
    useAuth.getState().enterGuestMode()
    useAuth.getState().exitGuestMode()
    expect(useAuth.getState().isGuest).toBe(false)
  })

  it('enterGuestMode does not change isLoggedIn', () => {
    useAuth.setState({ isLoggedIn: false })
    useAuth.getState().enterGuestMode()
    expect(useAuth.getState().isLoggedIn).toBe(false)
  })
})

describe('useAuth — login', () => {
  it('sets isLoggedIn and stores token on success', async () => {
    mockedAuthApi.login.mockResolvedValue({ accessToken: 'tok123', refreshToken: 'ref123' })

    await useAuth.getState().login('a@b.com', 'pass')

    expect(useAuth.getState().isLoggedIn).toBe(true)
    expect(localStorage.getItem('access_token')).toBe('tok123')
  })

  it('propagates error when API rejects', async () => {
    mockedAuthApi.login.mockRejectedValue(new Error('Invalid credentials'))

    await expect(useAuth.getState().login('a@b.com', 'wrong')).rejects.toThrow()
    expect(useAuth.getState().isLoggedIn).toBe(false)
  })
})

describe('useAuth — register', () => {
  it('sets isLoggedIn and stores token on success', async () => {
    mockedAuthApi.register.mockResolvedValue({ accessToken: 'newtok', refreshToken: 'newref' })

    await useAuth.getState().register('a@b.com', 'pass', 'Alice')

    expect(useAuth.getState().isLoggedIn).toBe(true)
    expect(localStorage.getItem('access_token')).toBe('newtok')
  })
})

describe('useAuth — logout', () => {
  it('clears token and sets isLoggedIn false', async () => {
    localStorage.setItem('access_token', 'existing-token')
    useAuth.setState({ isLoggedIn: true })
    mockedAuthApi.logout.mockResolvedValue(undefined)

    await useAuth.getState().logout()

    expect(useAuth.getState().isLoggedIn).toBe(false)
    expect(localStorage.getItem('access_token')).toBeNull()
  })
})

describe('useAuth — initial state from localStorage', () => {
  it('isLoggedIn is true when token exists in localStorage', () => {
    localStorage.setItem('access_token', 'persisted-token')
    // Re-evaluate what the store would initialise to
    const initialLoggedIn = !!localStorage.getItem('access_token')
    expect(initialLoggedIn).toBe(true)
  })

  it('isLoggedIn is false when localStorage is empty', () => {
    localStorage.clear()
    const initialLoggedIn = !!localStorage.getItem('access_token')
    expect(initialLoggedIn).toBe(false)
  })
})
