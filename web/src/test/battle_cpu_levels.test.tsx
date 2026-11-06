// The computer's level: the easy one never starts a fight; normal attacks
// public cards when clearly ahead; hard also opens events, hits hidden cards
// and kills.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { useReducer } from 'react'
import type { CpuLevel, GameState, OnboardCard } from '@/types'
import { BattleGame } from '@/battle/BattleGame'
import { ALL_GP_CARDS, freshTurnActions, gameReducer, initGame, makeEventCard } from '@/battle/engine'

afterEach(() => { cleanup(); vi.useRealTimers() })

const byStrength = [...ALL_GP_CARDS].sort((a, b) => b.strength - a.strength)
const strong = byStrength[0].id, weak = byStrength[byStrength.length - 1].id

/** The computer's turn: its strong Great Person faces your weak one in city 0. */
function board(level: CpuLevel, opts: { event: boolean; hidden?: boolean }): GameState {
  const gs = initGame({ mode: 'generic', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all', playerNames: ['You'], numComputers: 1, noHazards: true, freePlay: true, cpuLevel: level })
  const oc = (cardId: string, playerId: string, isPublic: boolean): OnboardCard =>
    ({ instanceId: `${cardId}-x`, cardId, type: 'gp', playerId, isPublic, justDeployed: false, achievementTicks: 0 })
  return {
    ...gs,
    currentPlayerIdx: 1, turnActions: freshTurnActions(), pendingSummary: null, summaryQueue: [], pendingRewards: [],
    players: gs.players.map((p, i) => ({
      ...p, gpHand: [], pendingSuccessors: [], followerHand: [],
      eventHand: i === 1 ? [makeEventCard('strength', 'local_event', 'ev')] : [],
    })),
    locations: gs.locations.map((l, i) => ({
      ...l, activeEvent: null, eventRoundsLeft: 0,
      cards: i === 0 ? [oc(weak, 'player-0', !opts.hidden), oc(strong, 'player-1', true)] : [],
    })),
  }
}

function play(start: GameState): GameState {
  let latest = start
  function Harness() {
    const [state, dispatch] = useReducer(gameReducer, start)
    latest = state
    return <BattleGame gameState={state} dispatch={dispatch} onExit={() => {}} />
  }
  vi.useFakeTimers()
  render(<Harness />)
  act(() => { vi.advanceTimersByTime(1500) })
  return latest
}

const fought = (s: GameState) => s.log.some(l => /attack/i.test(l)) || s.pendingSummary?.kind === 'combat'
const yoursLeft = (s: GameState) => s.locations[0].cards.some(c => c.playerId === 'player-0')

describe('computer levels in play', () => {
  it('hard opens a local event where it leads and kills your card', () => {
    const s = play(board('hard', { event: true }))
    expect(s.locations[0].activeEvent?.stat).toBe('strength')
    expect(fought(s)).toBe(true)
    expect(yoursLeft(s)).toBe(false)
    expect(s.players[0].archive).toContain(weak)
  })

  it('hard attacks hidden cards too', () => {
    const s = play(board('hard', { event: true, hidden: true }))
    expect(fought(s)).toBe(true)
  })

  it('easy never starts a fight', () => {
    const s = play(board('easy', { event: true }))
    expect(s.locations[0].activeEvent).toBeNull()
    expect(fought(s)).toBe(false)
    expect(yoursLeft(s)).toBe(true)
  })
})
