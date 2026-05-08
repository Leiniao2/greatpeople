import { create } from 'zustand'
import { authApi } from '@/api/auth'

interface AuthState {
  isLoggedIn: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  isLoggedIn: !!localStorage.getItem('access_token'),

  login: async (email, password) => {
    const { accessToken } = await authApi.login(email, password)
    localStorage.setItem('access_token', accessToken)
    set({ isLoggedIn: true })
  },

  register: async (email, password, displayName) => {
    const { accessToken } = await authApi.register(email, password, displayName)
    localStorage.setItem('access_token', accessToken)
    set({ isLoggedIn: true })
  },

  logout: async () => {
    await authApi.logout()
    localStorage.removeItem('access_token')
    set({ isLoggedIn: false })
  },
}))
