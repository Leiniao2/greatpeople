// Royal Game of Ur: Finkel's rules engine, the expectimax AI per difficulty,
// measured win rates of a strong player, and the component's outcome wiring.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import RoyalUrGame, {
  CONFIGS, CONFIG_IDS, HOME, ROLL_PROBS, initialState, rollDice, legalMoves, applyMove, passTurn, winner,
  aiMove, searchMove, setupFor, rulesFor, startFor, midgameState, goalOf, isShared, HEAD_START_SQUARE,
  type UrRules, type UrState, type Player,
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
    expect(initialState(FINKEL)).toEqual({ ...st([0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]), caps: [0, 0] })
    const d1 = initialState(FINKEL, setupFor(1))
    expect(d1.pos[0].filter(p => p === HEAD_START_SQUARE)).toHaveLength(1)
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
function playGame(cfg: string, human: (s: UrState, roll: number, rules: UrRules) => ReturnType<typeof searchMove>, diff: Difficulty, seed: number): { winner: Player; throws: number } {
  const rules = rulesFor(cfg, diff)
  const dice = mulberry32(seed), airng = mulberry32(seed ^ 0x9e3779b9)
  let s = startFor(cfg, diff, seed)
  let throws = 0
  for (let turn = 0; turn < 5000; turn++) {
    const w = winner(s, rules)
    if (w !== null) return { winner: w, throws }
    const roll = rollDice(dice).total
    if (s.turn === 0) throws++
    const m = s.turn === 0 ? human(s, roll, rules) : aiMove(s, roll, diff, airng, rules)
    if (!m) { s = passTurn(s); continue }
    expect(legalMoves(s, roll, rules)).toContainEqual(m)
    s = applyMove(s, m, rules).state
  }
  throw new Error('game did not finish')
}
const strong = (s: UrState, roll: number, rules: UrRules) => searchMove(s, roll, rules, 2)

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
  it('every config × difficulty is won by a strong player in a good share of seeded games, and short', () => {
    // Time budget: a player throw plus the computer's reply is ~5 s, so the
    // median game must stay within ~18 of the player's throws at D1 (≈ 1.5 min)
    // and ~32 at D4 (≈ 3 min).
    const N = 30
    const rows: string[] = []
    for (const cfg of CONFIG_IDS) for (const d of DIFFS) {
      let wins = 0
      const throws: number[] = []
      for (let i = 0; i < N; i++) {
        const r = playGame(cfg, strong, d, 1000 + i)
        if (r.winner === 0) wins++
        throws.push(r.throws)
      }
      throws.sort((a, b) => a - b)
      const median = throws[N >> 1]
      rows.push(`${cfg} D${d}: ${Math.round((wins / N) * 100)}% · median ${median} throws`)
      expect(wins / N, `${cfg} D${d} win rate`).toBeGreaterThan(d === 1 ? 0.55 : 0.2)
      expect(median, `${cfg} D${d} median throws`).toBeLessThanOrEqual(d === 1 ? 22 : 32)
    }
    console.log('royalur strong player:', rows.join(' | '))
  }, 120_000)
  it('balance: a sensible (2-ply) player wins ≥ 65% at D1 and ≥ 42% at D4 (target 45%), falling with difficulty', () => {
    const N = 200
    for (const cfg of CONFIG_IDS) {
      const rate = (d: Difficulty) => { let w = 0; for (let i = 0; i < N; i++) if (playGame(cfg, strong, d, 1000 + i).winner === 0) w++; return w / N }
      const r1 = rate(1), r4 = rate(4)
      expect(r1, `${cfg} D1`).toBeGreaterThanOrEqual(0.65)
      expect(r4, `${cfg} D4`).toBeGreaterThanOrEqual(0.42)
      expect(r4, `${cfg} D4 < D1`).toBeLessThan(r1)
    }
  }, 120_000)
  it('a weak (random) player still loses to the D4 AI most of the time, so every config is losable', () => {
    const rng = mulberry32(5)
    const random = (s: UrState, roll: number, rules: UrRules) => { const ms = legalMoves(s, roll, rules); return ms.length ? ms[Math.floor(rng() * ms.length)] : null }
    for (const cfg of CONFIG_IDS) {
      let losses = 0
      for (let i = 0; i < 20; i++) if (playGame(cfg, random, 4, 500 + i).winner === 1) losses++
      expect(losses, cfg).toBeGreaterThan(12)
    }
  }, 60_000)
})

describe('variants and time budget', () => {
  it('each config is a distinct rule set', () => {
    expect(CONFIG_IDS).toEqual(expect.arrayContaining(['finkel', 'blitz', 'quick', 'raid']))
    const sig = CONFIG_IDS.map(id => { const r = rulesFor(id, 2); return JSON.stringify([r.safeCentral, r.captureBonus, goalOf(r) < r.pieces, !!r.raid, !!CONFIGS[id].midgame]) })
    expect(new Set(sig).size).toBe(CONFIG_IDS.length)
  })
  it('goals per difficulty stay small: never a full seven-piece race', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const r = rulesFor(id, d)
      if (r.raid) expect(r.raid, `${id}@${d} raid`).toBeLessThanOrEqual(3)
      else if (CONFIGS[id].midgame) expect(goalOf(r), `${id}@${d} mid-game pieces`).toBeLessThanOrEqual(d === 1 ? 2 : 3)
      else expect(goalOf(r), `${id}@${d} goal from an empty board`).toBeLessThanOrEqual(d === 1 ? 1 : 2)
    }
  })
  it('first to bear off the goal wins, even with pieces left', () => {
    const rules = rulesFor('finkel', 2) // 2 of 7
    expect(winner(st([15, 15, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0]), rules)).toBe(0)
    expect(winner(st([15, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0]), rules)).toBe(null)
  })
  it('a raid is won by captures', () => {
    const rules = rulesFor('raid', 1)
    expect(rules.raid).toBe(2)
    expect(rules.safeCentral).toBe(false)
    let s: UrState = { pos: [[3, 0, 0, 0, 0], [6, 0, 0, 0, 0]], turn: 0, caps: [1, 0] }
    const m = legalMoves(s, 3, rules).find(x => x.capture)!
    s = applyMove(s, m, rules).state
    expect(s.caps).toEqual([2, 0])
    expect(winner(s, rules)).toBe(0)
  })
  it("the Guards' game starts mid-game: fair, seeded, no clashes", () => {
    for (const d of DIFFS) for (let seed = 1; seed < 40; seed++) {
      const r = rulesFor('quick', d)
      const s = startFor('quick', d, seed)
      expect(s).toEqual(startFor('quick', d, seed))
      expect(s.pos[0]).toHaveLength(r.pieces)
      expect(s.pos.flat().every(p => p >= 1 && p < HOME)).toBe(true)
      expect(s.pos[0].some(p => isShared(p) && s.pos[1].includes(p))).toBe(false)
      const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
      if (d === 1) expect(sum(s.pos[0])).toBeGreaterThan(sum(s.pos[1]))
      else expect(sum(s.pos[0])).toBe(sum(s.pos[1]))
    }
    expect(midgameState(rulesFor('quick', 2), 1)).not.toEqual(midgameState(rulesFor('quick', 2), 2))
  })
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
