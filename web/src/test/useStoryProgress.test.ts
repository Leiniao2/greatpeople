import { describe, it, expect } from 'vitest'
import { mergeProgress, emptyProgress } from '@/hooks/useStoryProgress'

describe('mergeProgress', () => {
  it('is additive: completion wins, stage is the max, cards are a union', () => {
    const a = { ...emptyProgress(), updatedAt: '2026-01-01T00:00:00Z',
      stories: { x: { completed: false, stage: 2 }, y: { completed: true, stage: 3, completedAt: 't1' } },
      unlockedCards: ['imhotep'] }
    const b = { ...emptyProgress(), updatedAt: '2026-02-01T00:00:00Z',
      stories: { x: { completed: true, stage: 1, completedAt: 't2' }, z: { completed: false, stage: 0 } },
      unlockedCards: ['gandhi', 'imhotep'] }
    const m = mergeProgress(a, b)
    expect(m.stories.x).toEqual({ completed: true, stage: 2, completedAt: 't2' })
    expect(m.stories.y).toEqual({ completed: true, stage: 3, completedAt: 't1' })
    expect(m.stories.z).toEqual({ completed: false, stage: 0 })
    expect(m.unlockedCards).toEqual(['imhotep', 'gandhi'])
    expect(m.updatedAt).toBe('2026-02-01T00:00:00Z')
  })

  it('tolerates an empty side', () => {
    const a = { ...emptyProgress(), stories: { x: { completed: true, stage: 3 } }, unlockedCards: ['a'] }
    expect(mergeProgress(a, emptyProgress())).toEqual(a)
    expect(mergeProgress(emptyProgress(), a)).toEqual(a)
  })
})
