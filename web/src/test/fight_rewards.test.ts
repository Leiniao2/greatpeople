import { describe, expect, it } from 'vitest'
import storyConfigs from '@/data/story_configs.json'
import cardsJson from '@/data/cards.json'
import { FIGHT_REWARD_POOL, humanWon, pickFightReward } from '@/battle/rewards'
import type { GameState } from '@/types'

const storyKeys = new Set(
  (storyConfigs as { portraitKey?: string | null; bonusCard?: { portraitKey?: string } }[])
    .flatMap(s => [s.portraitKey, s.bonusCard?.portraitKey]).filter(Boolean),
)

describe('fight rewards', () => {
  it('covers exactly the Great People without an Epic story', () => {
    const expected = (cardsJson as { portraitKey: string }[]).filter(c => !storyKeys.has(c.portraitKey))
    expect(FIGHT_REWARD_POOL.length).toBe(expected.length)
    expect(FIGHT_REWARD_POOL.length).toBeGreaterThan(0)
    for (const c of FIGHT_REWARD_POOL) expect(storyKeys.has(c.portraitKey!)).toBe(false)
  })

  it('never gives a card already owned, and null once all are collected', () => {
    const all = FIGHT_REWARD_POOL.map(c => c.portraitKey!)
    const owned = all.slice(1)
    expect(pickFightReward(owned)?.portraitKey).toBe(all[0])
    expect(pickFightReward(all)).toBeNull()
    for (let i = 0; i < 50; i++) {
      const r = pickFightReward(all.slice(0, 10))
      expect(all.slice(0, 10)).not.toContain(r!.portraitKey)
    }
  })

  it('only rewards a finished game won by a human', () => {
    const players = [{ id: 'a', isComputer: false }, { id: 'b', isComputer: true }]
    const g = (phase: string, winner: string | null) => ({ phase, winner, players }) as unknown as GameState
    expect(humanWon(g('ended', 'a'))).toBe(true)
    expect(humanWon(g('ended', 'b'))).toBe(false)
    expect(humanWon(g('playing', 'a'))).toBe(false)
    expect(humanWon(g('ended', null))).toBe(false)
  })
})
