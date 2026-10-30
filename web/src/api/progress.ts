import { apiClient } from './client'

export interface StoryProgress {
  completed: boolean
  /** Highest stage reached (0–3); a reopened story resumes here. */
  stage: number
  completedAt?: string
}

export interface ProgressDoc {
  version: 1
  updatedAt: string | null
  stories: Record<string, StoryProgress>
  unlockedCards: string[]
}

export const progressApi = {
  get: () => apiClient.get<ProgressDoc>('/profile/progress').then(r => r.data),
  put: (doc: ProgressDoc) => apiClient.put<ProgressDoc>('/profile/progress', doc).then(r => r.data),
}
