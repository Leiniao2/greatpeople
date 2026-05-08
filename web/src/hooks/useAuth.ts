import { create } from 'zustand'
import { authApi } from '@/api/auth'

interface AuthState {
  isLoggedIn: boolean
  isGuest: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  ssoLogin: (provider: 'google' | 'facebook', accessToken: string) => Promise<void>
  logout: () => Promise<void>
  enterGuestMode: () => void
  exitGuestMode: () => void
}

const storeToken = (token: string) => localStorage.setItem('access_token', token)

export const useAuth = create<AuthState>((set) => ({
  isLoggedIn: !!localStorage.getItem('access_token'),
  isGuest: false,
  enterGuestMode: () => set({ isGuest: true }),
  exitGuestMode: () => set({ isGuest: false }),

  login: async (email, password) => {
    const { accessToken } = await authApi.login(email, password)
    storeToken(accessToken)
    set({ isLoggedIn: true })
  },

  register: async (email, password, displayName) => {
    const { accessToken } = await authApi.register(email, password, displayName)
    storeToken(accessToken)
    set({ isLoggedIn: true })
  },

  ssoLogin: async (provider, accessToken) => {
    const { accessToken: jwt } = await authApi.ssoLogin(provider, accessToken)
    storeToken(jwt)
    set({ isLoggedIn: true })
  },

  logout: async () => {
    await authApi.logout()
    localStorage.removeItem('access_token')
    set({ isLoggedIn: false })
  },
}))
