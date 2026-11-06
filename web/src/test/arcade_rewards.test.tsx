// Arcade track rewards: finishing every level of a track unlocks one random
// Great Person, once per track, kept across devices when progress merges.
import { createElement } from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import MiniChallengePage, { grantTrackReward } from '@/pages/MiniChallengePage'
import { useStoryProgress, emptyProgress, mergeProgress } from '@/hooks/useStoryProgress'
import { LEVELS_PER_TRACK } from '@/games/arcade'
import { FIGHT_REWARD_POOL } from '@/battle/rewards'

const finished = () => ({ cleared: LEVELS_PER_TRACK, stars: Array(LEVELS_PER_TRACK).fill(3) })
const reset = (arcade = {}, unlockedCards: string[] = []) =>
  useStoryProgress.setState({ doc: { ...emptyProgress(), unlockedCards, arcade } })

beforeEach(() => reset())
afterEach(cleanup)

describe('track rewards', () => {
  it('nothing until every level is cleared', () => {
    reset({ sudoku: { cleared: LEVELS_PER_TRACK - 1, stars: [] } })
    expect(grantTrackReward('sudoku')).toBeNull()
    expect(useStoryProgress.getState().doc.unlockedCards).toEqual([])
  })

  it('clearing the last level unlocks one new Great Person, once', () => {
    reset({ sudoku: { cleared: LEVELS_PER_TRACK - 1, stars: [] } })
    useStoryProgress.getState().clearArcadeLevel('sudoku', LEVELS_PER_TRACK - 1, 2)
    const card = grantTrackReward('sudoku')!
    expect(card).toBeTruthy()
    const key = card.portraitKey ?? card.id
    const doc = useStoryProgress.getState().doc
    expect(doc.unlockedCards).toEqual([key])
    expect(doc.arcade!.sudoku.reward).toBe(key)
    // Replaying the last level, or asking again, gives nothing more.
    useStoryProgress.getState().clearArcadeLevel('sudoku', LEVELS_PER_TRACK - 1, 3)
    expect(grantTrackReward('sudoku')).toBeNull()
    expect(useStoryProgress.getState().doc.unlockedCards).toEqual([key])
    expect(useStoryProgress.getState().doc.arcade!.sudoku.reward).toBe(key)
  })

  it('each track gives its own card, never one already owned', () => {
    const owned = FIGHT_REWARD_POOL.slice(1).map(c => c.portraitKey ?? c.id)
    reset({ sudoku: finished(), maze: finished() }, owned)
    const first = grantTrackReward('sudoku')!
    expect(owned).not.toContain(first.portraitKey ?? first.id)
    // Everything is collected now: the second track has nothing to give.
    expect(grantTrackReward('maze')).toBeNull()
  })

  it('a merge keeps the reward from either side', () => {
    const a = { ...emptyProgress(), arcade: { sudoku: { ...finished(), reward: 'x' } } }
    const b = { ...emptyProgress(), arcade: { sudoku: finished() } }
    expect(mergeProgress(a, b).arcade!.sudoku.reward).toBe('x')
    expect(mergeProgress(b, a).arcade!.sudoku.reward).toBe('x')
    expect('reward' in mergeProgress(b, b).arcade!.sudoku).toBe(false)
  })

  it('a track finished before rewards existed can claim its card from the Arcade', () => {
    reset({ sudoku: finished() })
    render(createElement(MemoryRouter, null, createElement(MiniChallengePage)))
    expect(screen.queryByTestId('reward-card')).toBeNull()
    fireEvent.click(screen.getByTestId('claim-reward'))
    expect(screen.getByTestId('reward-card')).toBeTruthy()
    expect(screen.queryByTestId('claim-reward')).toBeNull()
    expect(useStoryProgress.getState().doc.unlockedCards.length).toBe(1)
  })
})
