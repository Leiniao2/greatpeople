import { describe, it, expect } from 'vitest'
import { ARCADE_TRACKS, LEVELS_PER_TRACK, buildTrack, difficultyForLevel, levelChallenge, levelCode, starsForAttempts } from '@/games/arcade'
import { GAMES, GAME_KEYS } from '@/games/registry'
import { mergeProgress, emptyProgress } from '@/hooks/useStoryProgress'

describe('arcade tracks', () => {
  it('has a track for every registered game type', () => {
    expect(ARCADE_TRACKS).toEqual(GAME_KEYS)
    expect(ARCADE_TRACKS.length).toBeGreaterThan(50)
  })

  it('difficulty rises 1→4 in four equal tiers', () => {
    const tiers = Array.from({ length: LEVELS_PER_TRACK }, (_, i) => difficultyForLevel(i))
    expect(tiers.slice(0, 6).every(d => d === 1)).toBe(true)
    expect(tiers.slice(18).every(d => d === 4)).toBe(true)
    expect([...new Set(tiers)]).toEqual([1, 2, 3, 4])
  })

  it('every track has 20+ levels, valid configs and unique seeds', async () => {
    for (const key of ARCADE_TRACKS) {
      const mod = await GAMES[key].load()
      const ids = mod.CONFIG_IDS ?? []
      const track = buildTrack(key, ids)
      expect(track.length, key).toBeGreaterThanOrEqual(20)
      expect(new Set(track.map(l => l.seed)).size, `${key} seeds`).toBe(track.length)
      for (const l of track) expect(ids.length === 0 || ids.includes(l.configId), `${key} ${l.configId}`).toBe(true)
      // Uses as many different configs as it can.
      expect(new Set(track.map(l => l.configId)).size, `${key} variety`).toBe(Math.min(ids.length || 1, track.length))
      // Consecutive levels avoid repeating a config when there is a choice.
      if (ids.length > 1) for (let i = 1; i < track.length; i++) expect(track[i].configId, `${key} @${i}`).not.toBe(track[i - 1].configId)
    }
  })

  it('builds a playable minigame challenge for a level', () => {
    const ch = levelChallenge({ index: 7, game: 'maze', configId: 'cedar-forest', difficulty: 2, seed: 42 })
    expect(ch).toMatchObject({ type: 'minigame', game: 'maze', configId: 'cedar-forest', difficulty: 2, seed: 42, id: 'arcade:maze:7' })
    expect(ch.instruction).toContain('B2')
  })

  it('labels levels A1–D6', () => {
    expect([0, 5, 6, 7, 18, 23].map(levelCode)).toEqual(['A1', 'A6', 'B1', 'B2', 'D1', 'D6'])
  })

  it('stars reward first-try clears', () => {
    expect([0, 1, 2, 5].map(starsForAttempts)).toEqual([3, 2, 1, 1])
  })

  it('merging progress keeps the furthest level and best stars', () => {
    const a = { ...emptyProgress(), arcade: { maze: { cleared: 3, stars: [3, 1, 2] } } }
    const b = { ...emptyProgress(), arcade: { maze: { cleared: 2, stars: [1, 3] }, sudoku: { cleared: 1, stars: [2] } } }
    const m = mergeProgress(a, b)
    expect(m.arcade).toEqual({ maze: { cleared: 3, stars: [3, 3, 2] }, sudoku: { cleared: 1, stars: [2] } })
    expect(mergeProgress(emptyProgress(), emptyProgress()).arcade).toBeUndefined()
  })
})
