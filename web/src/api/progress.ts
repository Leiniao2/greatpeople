import { apiClient } from './client'

export interface StoryProgress {
  completed: boolean
  /** Highest stage reached (0–3); a reopened story resumes here. */
  stage: number
  completedAt?: string
}

export interface ArcadeProgress {
  /** Number of levels cleared from the bottom of the track. */
  cleared: number
  /** Best stars (1–3) per level index; 0 = not cleared. */
  stars: number[]
}

export interface ProgressDoc {
  version: 1
  updatedAt: string | null
  stories: Record<string, StoryProgress>
  unlockedCards: string[]
  /** Arcade ladders: levels cleared per game type and the stars earned on each. */
  arcade?: Record<string, ArcadeProgress>
}

export const progressApi = {
  get: () => apiClient.get<ProgressDoc>('/profile/progress').then(r => r.data),
  put: (doc: ProgressDoc) => apiClient.put<ProgressDoc>('/profile/progress', doc).then(r => r.data),
}
