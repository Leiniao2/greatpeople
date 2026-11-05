// The prize pop-up: a human who won a contest picks Followers or Event cards.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useReducer } from 'react'
import { BattleGame } from '@/battle/BattleGame'
import { gameReducer, grantReward, initGame } from '@/battle/engine'

afterEach(cleanup)

function Harness() {
  const start = (() => {
    let gs = initGame({ mode: 'scenario', matchType: 'pvc', playerMode: 'pvc', eraMode: 'all', startEra: 'Steam', playerNames: ['You'], numComputers: 1, noHazards: true })
    // Skip the opening pick for this test.
    gs = gameReducer(gs, { type: 'CHOOSE_SUCCESSOR', playerId: 'player-0', cardId: gs.players[0].pendingSuccessors[0].options![0] })
    return grantReward({ ...gs, pendingSummary: null, summaryQueue: [] }, 'player-0', 2, 'won the global competition in Culture')
  })()
  const [state, dispatch] = useReducer(gameReducer, start)
  return <><BattleGame gameState={state} dispatch={dispatch} onExit={() => {}} /><p data-testid="hand">{state.players[0].followerHand.length}</p></>
}

describe('prize pop-up', () => {
  it('offers the double prize and gives 4 Followers', () => {
    render(<Harness />)
    expect(screen.getByText('Double prize')).toBeTruthy()
    expect(screen.getByText(/You won the global competition in Culture/)).toBeTruthy()
    const before = Number(screen.getByTestId('hand').textContent)
    fireEvent.click(screen.getByText('Followers').closest('button')!)
    expect(Number(screen.getByTestId('hand').textContent)).toBe(before + 4)
    expect(screen.queryByText('Double prize')).toBeNull()
  })
})
