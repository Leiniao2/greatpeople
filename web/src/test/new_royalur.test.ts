// Royal Game of Ur: Finkel's rules engine, the expectimax AI per difficulty,
// measured win rates of a strong player, and the component's outcome wiring.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import RoyalUrGame, {
  CONFIGS, CONFIG_IDS, HOME, ROLL_PROBS, initialState, rollDice, legalMoves, applyMove, passTurn, winner,
  aiMove, searchMove, setupFor, type UrRules, type UrState, type Player,
} from '@/components/minigames/RoyalUrGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

const FINKEL = CONFIGS.finkel.rules
const BLITZ = CONFIGS.blitz.rules
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const st = (human: number[], ai: number[], turn: Player = 0): UrState => ({ pos: [human, ai], turn })
const tos = (s: UrState, roll: number, rules: UrRules = FINKEL) => legalMoves(s, roll, rules).map(m => `${m.from}>${m.to}${m.capture ? 'x' : ''}`).sort()

describe('engine', () => {
  it('starts with every piece waiting; D1 gives a head start, D4 lets the AI throw first', () => {
    expect(initialState(FINKEL)).toEqual(st([0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]))
    const d1 = initialState(FINKEL, setupFor(1))
    expect(d1.pos[0].filter(p => p === HOME)).toHaveLength(1)
    expect(initialState(FINKEL, setupFor(4)).turn).toBe(1)
  })
  it('enters pieces along the route and moves the distance thrown', () => {
    expect(tos(initialState(FINKEL), 3)).toEqual(['0>3'])
    expect(tos(st([0, 5, 0], [0, 0, 0]), 2)).toEqual(['0>2', '5>7'])
  })
  it('a 0 throw has no move; passing hands the turn over', () => {
    expect(legalMoves(st([0, 3], [0, 0]), 0, FINKEL)).toEqual([])
    expect(passTurn(st([0, 3], [0, 0])).turn).toBe(1)
  })
  it('cannot land on your own piece', () => {
    expect(tos(st([2, 4], [0, 0]), 2)).toEqual(['4>6'])
    expect(tos(st([1, 3, 0], [0]), 2)).toEqual(['0>2', '3>5'])
  })
  it('bears off only with an exact throw', () => {
    expect(tos(st([13, 15], [0, 0]), 2)).toEqual(['13>15'])
    expect(tos(st([13, 15], [0, 0]), 3)).toEqual([])
    expect(tos(st([14, 15], [0, 0]), 1)).toEqual(['14>15'])
  })
  it('captures on shared squares and sends the piece back to the start', () => {
    const s = st([3, 0], [6, 0])
    const m = legalMoves(s, 3, FINKEL).find(x => x.to === 6)!
    expect(m.capture).toBe(true)
    const r = applyMove(s, m, FINKEL)
    expect(r.state.pos[1]).toEqual([0, 0])
    expect(r.state.pos[0]).toEqual([6, 0])
    expect(r.state.turn).toBe(1)
  })
  it('private squares never collide: both players can sit on their own square 3', () => {
    expect(tos(st([1], [3]), 2)).toEqual(['1>3'])
    expect(legalMoves(st([1], [3]), 2, FINKEL)[0].capture).toBe(false)
  })
  it('the central rosette is safe in Finkel rules but not in Blitz', () => {
    const s = st([6, 0], [8, 0])
    expect(tos(s, 2)).toEqual(['0>2'])
    expect(tos(s, 2, BLITZ)).toEqual(['0>2', '6>8x'])
  })
  it('a rosette earns another throw; in Blitz so does a capture', () => {
    const r = applyMove(st([0, 0], [0, 0]), { from: 0, to: 4, capture: false }, FINKEL)
    expect(r.extra).toBe(true); expect(r.state.turn).toBe(0)
    const c = applyMove(st([5, 0], [7, 0]), { from: 5, to: 7, capture: true }, BLITZ)
    expect(c.extra).toBe(true); expect(c.state.turn).toBe(0)
    const f = applyMove(st([5, 0], [7, 0]), { from: 5, to: 7, capture: true }, FINKEL)
    expect(f.extra).toBe(false)
  })
  it('a throw with no legal move is a pass', () => {
    // Only piece is on 14 and the throw is 2.
    expect(legalMoves(st([14, 15], [0, 0]), 2, FINKEL)).toEqual([])
  })
  it('detects the winner', () => {
    expect(winner(st([15, 15], [0, 3]))).toBe(0)
    expect(winner(st([15, 3], [15, 15]))).toBe(1)
    expect(winner(st([15, 3], [15, 2]))).toBe(null)
  })
  it('dice follow the binomial 1/16, 4/16, 6/16, 4/16, 1/16', () => {
    const rng = mulberry32(42), counts = [0, 0, 0, 0, 0], N = 32000
    for (let i = 0; i < N; i++) { const t = rollDice(rng); expect(t.tips.filter(Boolean).length).toBe(t.total); counts[t.total]++ }
    counts.forEach((c, k) => expect(Math.abs(c / N - ROLL_PROBS[k])).toBeLessThan(0.01))
    // Seeded: the same seed throws the same dice.
    const a = mulberry32(7), b = mulberry32(7)
    expect(Array.from({ length: 20 }, () => rollDice(a).total)).toEqual(Array.from({ length: 20 }, () => rollDice(b).total))
  })
})

/** Play one game: the human side uses `human`, the AI side plays at `diff`. Returns the winner. */
function playGame(rules: UrRules, human: (s: UrState, roll: number) => ReturnType<typeof searchMove>, diff: Difficulty, seed: number): Player {
  const dice = mulberry32(seed), airng = mulberry32(seed ^ 0x9e3779b9)
  let s = initialState(rules, setupFor(diff))
  for (let turn = 0; turn < 5000; turn++) {
    const w = winner(s)
    if (w !== null) return w
    const roll = rollDice(dice).total
    const m = s.turn === 0 ? human(s, roll) : aiMove(s, roll, diff, airng, rules)
    if (!m) { s = passTurn(s); continue }
    expect(legalMoves(s, roll, rules)).toContainEqual(m)
    s = applyMove(s, m, rules).state
  }
  throw new Error('game did not finish')
}
const strong = (rules: UrRules) => (s: UrState, roll: number) => searchMove(s, roll, rules, 3)

describe('AI', () => {
  it('returns a legal move within the time budget at every difficulty', () => {
    const rng = mulberry32(3)
    // A busy mid-game position with many options.
    const s = st([0, 2, 5, 7, 9, 11, 13], [0, 1, 3, 6, 10, 12, 14], 1)
    for (const d of DIFFS) for (let roll = 1; roll <= 4; roll++) {
      const t0 = performance.now()
      const m = aiMove(s, roll, d, rng, FINKEL)
      const ms = performance.now() - t0
      expect(ms).toBeLessThan(300)
      expect(legalMoves(s, roll, FINKEL)).toContainEqual(m)
    }
    expect(aiMove(s, 0, 4, rng, FINKEL)).toBeNull()
  })
  it('the searching AI takes captures and heads for the safe rosette', () => {
    const me = st([0, 0, 0], [5, 0, 0], 1)
    const cap = st([7, 0, 0], [5, 0, 0], 1)
    expect(searchMove(cap, 2, FINKEL, 2)).toEqual({ from: 5, to: 7, capture: true })
    expect(searchMove(me, 3, FINKEL, 3)?.to).toBe(8) // heads for the safe rosette
  })
  it('a strong player beats the D1 AI in most seeded games and the D4 AI at least sometimes', () => {
    const rates: Record<string, number> = {}
    for (const [cfg, n] of [['finkel', 30], ['quick', 60]] as const) {
      const rules = CONFIGS[cfg].rules
      for (const d of [1, 4] as Difficulty[]) {
        let wins = 0
        for (let i = 0; i < n; i++) if (playGame(rules, strong(rules), d, 1000 + i) === 0) wins++
        rates[`${cfg} D${d}`] = wins / n
      }
    }
    console.log('royalur strong-player win rates', rates)
    expect(rates['finkel D1']).toBeGreaterThan(0.7)
    expect(rates['quick D1']).toBeGreaterThan(0.6)
    expect(rates['finkel D4']).toBeGreaterThan(0.15)
    expect(rates['quick D4']).toBeGreaterThan(0.15)
  }, 60_000)
  it('a weak (random) player still loses to the D4 AI most of the time, so the game is losable', () => {
    const rules = FINKEL, rng = mulberry32(5)
    let losses = 0
    for (let i = 0; i < 20; i++) {
      const random = (s: UrState, roll: number) => { const ms = legalMoves(s, roll, rules); return ms.length ? ms[Math.floor(rng() * ms.length)] : null }
      if (playGame(rules, random, 4, 500 + i) === 1) losses++
    }
    console.log('royalur random player losses vs D4:', `${losses}/20`)
    expect(losses).toBeGreaterThan(12)
  }, 60_000)
})

describe('RoyalUrGame UI', () => {
  it('renders every config at every difficulty', () => {
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(3)
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      expect(CONFIGS[id].fact.length).toBeGreaterThan(20)
      render(createElement(RoyalUrGame, { configId: id, difficulty: d, seed: 11, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByText(CONFIGS[id].title)).toBeTruthy()
      expect(screen.getAllByLabelText(/^square \d+/).length).toBe(20)
      cleanup()
    }
  })

  it('a scripted win calls onWin once', () => {
    vi.useFakeTimers()
    let won = 0, lost = 0
    render(createElement(RoyalUrGame, {
      configId: 'quick', difficulty: 2, seed: 1, params: { startPos: [[14, 15, 15], [0, 0, 0]], rolls: [1] },
      onWin: () => { won++ }, onLose: () => { lost++ },
    }))
    fireEvent.click(screen.getByText('Roll'))
    act(() => { vi.advanceTimersByTime(700) })
    expect(screen.getByRole('status').textContent).toMatch(/threw 1/)
    // The single move is preselected: tap the home pool to bear off.
    fireEvent.click(screen.getByLabelText(/^your home pieces/))
    act(() => { vi.advanceTimersByTime(1000) })
    act(() => { vi.advanceTimersByTime(1000) })
    expect(won).toBe(1); expect(lost).toBe(0)
    cleanup(); vi.useRealTimers()
  })

  it('a scripted loss calls onLose once', () => {
    vi.useFakeTimers()
    let won = 0, lost = 0
    render(createElement(RoyalUrGame, {
      configId: 'quick', difficulty: 2, seed: 1, params: { startPos: [[0, 0, 0], [13, 15, 15]], rolls: [0, 2] },
      onWin: () => { won++ }, onLose: () => { lost++ },
    }))
    fireEvent.click(screen.getByText('Roll'))
    act(() => { vi.advanceTimersByTime(700) })
    expect(screen.getByRole('status').textContent).toMatch(/threw 0/)
    act(() => { vi.advanceTimersByTime(6000) })
    expect(screen.getByRole('status').textContent).toMatch(/brings every piece home/)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(lost).toBe(1); expect(won).toBe(0)
    cleanup(); vi.useRealTimers()
  })

  it('tapping a piece then its target moves it; the board shows the move', () => {
    vi.useFakeTimers()
    render(createElement(RoyalUrGame, {
      configId: 'finkel', difficulty: 3, seed: 1, params: { startPos: [[0, 2, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]], rolls: [2, 0] },
      onWin: () => {}, onLose: () => {},
    }))
    fireEvent.click(screen.getByText('Roll'))
    act(() => { vi.advanceTimersByTime(700) })
    fireEvent.click(screen.getByLabelText('square 2 yours your piece'))
    fireEvent.click(screen.getByLabelText('square 4 yours rosette'))
    expect(screen.getByLabelText('square 4 yours rosette your piece')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/Rosette/)
    cleanup(); vi.useRealTimers()
  })
})
