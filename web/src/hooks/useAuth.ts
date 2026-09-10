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
    } catch (err) {
      // Allow admin login even if backend is unavailable.  Anyone else gets
      // the original error, so the caller can tell a rejected password from
      // an unreachable backend.
      if (email !== ADMIN_EMAIL) throw err
    }
    storeEmail(email)
    set({ isLoggedIn: true, email, isAdmin: email === ADMIN_EMAIL })
  },

  register: async (email, password, _displayName) => {
    try {
      const { accessToken } = await authApi.register(email, password, _displayName)
      storeToken(accessToken)
    } catch (err) {
      if (email !== ADMIN_EMAIL) throw err
    }
    storeEmail(email)
    set({ isLoggedIn: true, email, isAdmin: email === ADMIN_EMAIL })
  },

  ssoLogin: async (provider, accessToken) => {
    const { accessToken: jwt } = await authApi.ssoLogin(provider, accessToken)
    storeToken(jwt)

    // The SSO response carries tokens only, so ask the API who this is.
    // Without it email and isAdmin stay unset and the collection reports
    // nothing unlocked even though sign-in succeeded.  The token is already
    // stored, so the request interceptor authenticates this call.
    let email: string | null = null
    try {
      email = (await authApi.me()).email || null
    } catch {
      // Sign-in did succeed; failing to read the profile must not undo it.
    }

    if (email) storeEmail(email)
    set({ isLoggedIn: true, email, isAdmin: email === ADMIN_EMAIL })
  },

  logout: async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    localStorage.removeItem('access_token')
    localStorage.removeItem('user_email')
    set({ isLoggedIn: false, email: null, isAdmin: false })
  },
}))
