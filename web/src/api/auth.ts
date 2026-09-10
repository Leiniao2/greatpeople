import { apiClient } from './client'
import type { AuthResponse, UserProfile } from '@/types'

export const authApi = {
  me: () => apiClient.get<UserProfile>('/auth/me').then((r) => r.data),

  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/login', { email, password }).then((r) => r.data),

  register: (email: string, password: string, displayName: string) =>
    apiClient.post<AuthResponse>('/auth/register', { email, password, displayName }).then((r) => r.data),

  logout: () => apiClient.post('/auth/logout'),

  ssoLogin: (provider: 'google' | 'facebook', accessToken: string) =>
    apiClient.post<AuthResponse>(`/auth/${provider}`, { accessToken }).then((r) => r.data),
}
