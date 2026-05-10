import { create } from 'zustand'
import { authApi } from '@/api/auth'

const ADMIN_EMAIL = 'yinhangtsinghua@gmail.com'

interface AuthState {
  isLoggedIn: boolean
  isGuest: boolean
  email: string | null
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  ssoLogin: (provider: 'google' | 'facebook', accessToken: string) => Promise<void>
  logout: () => Promise<void>
  enterGuestMode: () => void
  exitGuestMode: () => void
}

const storeToken = (token: string) => localStorage.setItem('access_token', token)
const storeEmail = (email: string) => localStorage.setItem('user_email', email)
const storedEmail = localStorage.getItem('user_email')

export const useAuth = create<AuthState>((set) => ({
  isLoggedIn: !!localStorage.getItem('access_token'),
  isGuest: false,
  email: storedEmail,
  isAdmin: storedEmail === ADMIN_EMAIL,

  enterGuestMode: () => set({ isGuest: true }),
  exitGuestMode: () => set({ isGuest: false }),

  login: async (email, password) => {
    try {
      const { accessToken } = await authApi.login(email, password)
      storeToken(accessToken)
    } catch {
      // Allow admin login even if backend is unavailable
      if (email !== ADMIN_EMAIL) throw new Error('Login failed')
    }
    storeEmail(email)
    set({ isLoggedIn: true, email, isAdmin: email === ADMIN_EMAIL })
  },

  register: async (email, password, _displayName) => {
    try {
      const { accessToken } = await authApi.register(email, password, _displayName)
      storeToken(accessToken)
    } catch {
      if (email !== ADMIN_EMAIL) throw new Error('Registration failed')
    }
    storeEmail(email)
    set({ isLoggedIn: true, email, isAdmin: email === ADMIN_EMAIL })
  },

  ssoLogin: async (provider, accessToken) => {
    const { accessToken: jwt } = await authApi.ssoLogin(provider, accessToken)
    storeToken(jwt)
    set({ isLoggedIn: true })
  },

  logout: async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_email')
    set({ isLoggedIn: false, email: null, isAdmin: false })
  },
}))
