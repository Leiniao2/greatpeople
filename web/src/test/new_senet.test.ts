// Senet: Kendall's rules engine, the expectimax AI, and the component.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import SenetGame, {
  CONFIGS, CONFIG_IDS, initialState, legalMoves, applyMove, passTurn, winner, aiMove, throwSticks, throwAt,
  waterDest, startFor, midgameState, hitSquare, type State, type Player, type Move,
} from '@/components/minigames/SenetGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

const DIFFS: Difficulty[] = [1, 2, 3, 4]

/** Build a state from { square: owner }. */
function mk(sq: Record<number, number>, turn: Player = 1, pieces = 5, off: [number, number] = [0, 0]): State {
  const board = Array(32).fill(0)
  for (const [k, v] of Object.entries(sq)) board[Number(k)] = v
  return { board, off, turn, pieces }
}
const targets = (st: State, roll: number, from?: number) =>
  legalMoves(st, roll).filter(m => !m.backward && (from === undefined || m.from === from)).map(m => m.to)

describe('senet engine', () => {
  it('starts alternating on 1..2N with the lead on the even squares', () => {
    const st = initialState(5, true)
    expect(st.board.slice(1, 11)).toEqual([2, 1, 2, 1, 2, 1, 2, 1, 2, 1])
    expect(st.board.slice(11).every(v => v === 0)).toBe(true)
    const st7 = initialState(7, false)
    expect(st7.board[14]).toBe(2)
    expect(st7.board.filter(v => v === 1)).toHaveLength(7)
  })
  it('throws: odds 4/6/4/1/1 in 16, and only 1, 4, 5 throw again', () => {
    const rng = mulberry32(42)
    const n = 32000, c = [0, 0, 0, 0, 0, 0]
    for (let i = 0; i < n; i++) c[throwSticks(rng).value]++
    expect(c[0]).toBe(0)
    expect(c[2] / n).toBeCloseTo(6 / 16, 1)
    expect(c[1] / n).toBeCloseTo(4 / 16, 1)
    expect(c[5] / n).toBeGreaterThan(0.04)
    expect(c[5] / n).toBeLessThan(0.085)
    expect(throwAt(7, 1, 3)).toEqual(throwAt(7, 1, 3))
    const st = mk({ 5: 1 })
    expect(applyMove(st, { from: 5, to: 6 }, 1).turn).toBe(1)
    expect(applyMove(st, { from: 5, to: 7 }, 2).turn).toBe(2)
    expect(applyMove(st, { from: 5, to: 8 }, 3).turn).toBe(2)
    expect(applyMove(st, { from: 5, to: 9 }, 4).turn).toBe(1)
    expect(applyMove(st, { from: 5, to: 10 }, 5).turn).toBe(1)
  })
  it('landing on a lone enemy swaps; own pieces block landing', () => {
    const st = mk({ 3: 1, 6: 2, 5: 1 })
    expect(targets(st, 3, 3)).toEqual([6])
    const after = applyMove(st, { from: 3, to: 6 }, 3)
    expect(after.board[6]).toBe(1)
    expect(after.board[3]).toBe(2)
    expect(targets(st, 2, 3)).toEqual([]) // own piece on 5
  })
  it('a pair protects, a row of three blocks passing', () => {
    const pair = mk({ 3: 1, 6: 2, 7: 2 })
    expect(targets(pair, 3, 3)).toEqual([])
    expect(targets(pair, 5, 3)).toEqual([8]) // passing a pair is fine
    const wall = mk({ 3: 1, 5: 2, 6: 2, 7: 2 })
    expect(targets(wall, 5, 3)).toEqual([]) // would pass the blockade
    expect(targets(wall, 1, 3)).toEqual([4])
  })
  it('every piece must land exactly on 26', () => {
    const st = mk({ 24: 1 })
    expect(targets(st, 2)).toEqual([26])
    expect(targets(st, 3)).toEqual([]) // would jump past 26
  })
  it('26 → 27 falls into the water and goes back to 15 (or before it)', () => {
    const st = mk({ 26: 1, 1: 2 })
    expect(targets(st, 1)).toEqual([27])
    const a = applyMove(st, { from: 26, to: 27 }, 1)
    expect(a.board[15]).toBe(1)
    expect(a.board[26]).toBe(0)
    const busy = mk({ 26: 1, 15: 2, 14: 2 })
    expect(waterDest(busy.board)).toBe(13)
  })
  it('bear off with exact throws: 5 from 26, 3 from 28, 2 from 29, 1 from 30', () => {
    expect(targets(mk({ 26: 1 }), 5)).toEqual([31])
    expect(targets(mk({ 28: 1 }), 3)).toEqual([31])
    expect(targets(mk({ 28: 1 }), 4)).toEqual([])
    expect(targets(mk({ 29: 1 }), 2)).toEqual([31])
    expect(targets(mk({ 30: 1 }), 1)).toEqual([31])
    expect(targets(mk({ 30: 1 }), 2)).toEqual([])
    const st = mk({ 30: 1 }, 1, 5, [4, 0])
    const done = applyMove(st, { from: 30, to: 31 }, 1)
    expect(done.off).toEqual([5, 0])
    expect(winner(done)).toBe(1)
  })
  it('safe squares 26, 28–30 cannot be swapped', () => {
    expect(targets(mk({ 24: 1, 26: 2 }), 2)).toEqual([])
    expect(targets(mk({ 26: 1, 28: 2 }), 2)).toEqual([])
  })
  it('no forward move forces a backward move; none at all is a pass', () => {
    // 30 needs a 1; a 3 can't bear off, so the lone piece on 10 must go back.
    const st = mk({ 30: 1, 10: 1, 11: 2, 12: 2, 13: 2 })
    const ms = legalMoves(st, 3)
    expect(ms).toEqual([{ from: 10, to: 7, backward: true }])
    const stuck = mk({ 30: 1 })
    expect(legalMoves(stuck, 3)).toEqual([])
    expect(passTurn(stuck, 3).turn).toBe(2)
    expect(passTurn(stuck, 4).turn).toBe(1)
  })
})

/** Play a game of `config` at difficulty `ad`: player 1 uses the AI policy at `hd` (or random moves). */
function playGame(config: string, seed: number, hd: Difficulty | 'random', ad: Difficulty): { winner: Player; throws: number } {
  let st = startFor(config, ad, seed)
  const idx = [0, 0]
  const pick = mulberry32(seed ^ 0x51ed)
  let throws = 0
  for (let turn = 0; turn < 4000; turn++) {
    const p = st.turn
    const roll = throwAt(seed, p, idx[p - 1]++).value
    if (p === 1) throws++
    const rng = mulberry32(seed * 31 + turn)
    let m: Move | null
    if (p === 1 && hd === 'random') { const ms = legalMoves(st, roll); m = ms.length ? ms[Math.floor(pick() * ms.length)] : null }
    else m = aiMove(st, roll, p === 1 ? (hd as Difficulty) : ad, rng)
    st = m ? applyMove(st, m, roll) : passTurn(st, roll)
    const w = winner(st)
    if (w) return { winner: w, throws }
  }
  throw new Error('game did not finish')
}

describe('senet AI', () => {
  it('returns legal moves fast at every difficulty', () => {
    const rng = mulberry32(5)
    let worst = 0
    for (const d of DIFFS) {
      for (let s = 0; s < 6; s++) {
        let st = initialState(7, true)
        // Walk into a mid-game position.
        for (let k = 0; k < 30; k++) {
          const roll = throwAt(s, st.turn, k).value
          const m = aiMove(st, roll, 2, rng)
          st = m ? applyMove(st, m, roll) : passTurn(st, roll)
          if (winner(st)) break
        }
        for (let roll = 1; roll <= 5; roll++) {
          const legal = legalMoves(st, roll)
          const t0 = performance.now()
          const m = aiMove(st, roll, d, rng)
          worst = Math.max(worst, performance.now() - t0)
          if (legal.length) expect(legal).toContainEqual(m as Move)
          else expect(m).toBeNull()
        }
      }
    }
    expect(worst).toBeLessThan(300)
  })

  it('every config × difficulty: a strong player wins often, a random one less, and games are short', () => {
    // Time budget: a player throw plus the replies is ~5 s, so the median
    // game must stay within ~22 of the player's throws at D1 (≈ 1.5 min) and
    // ~34 at D4 (≈ 3 min).  A full Kendall game is 50–80 throws.
    const N = 30
    const rows: string[] = []
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      let wins = 0, rwins = 0
      const throws: number[] = []
      for (let s = 1; s <= N; s++) {
        const r = playGame(id, s * 7919, 3, d)
        if (r.winner === 1) wins++
        throws.push(r.throws)
        if (playGame(id, s * 7919, 'random', d).winner === 1) rwins++
      }
      throws.sort((a, b) => a - b)
      const median = throws[N >> 1]
      rows.push(`${id} D${d}: ${Math.round((wins / N) * 100)}% (random ${Math.round((rwins / N) * 100)}%) median ${median}`)
      expect(wins / N, `${id}@${d} strong`).toBeGreaterThan(d === 1 ? 0.5 : 0.2)
      expect(median, `${id}@${d} median throws`).toBeLessThanOrEqual(d === 1 ? 24 : 34)
      if (d >= 3) expect(rwins / N, `${id}@${d} random player should mostly lose`).toBeLessThan(0.45)
    }
    console.log('senet:', rows.join(' | '))
  }, 120_000)
})

describe('senet variants and budget', () => {
  it('each config is a distinct challenge', () => {
    const sig = CONFIG_IDS.map(id => { const c = CONFIGS[id]; return `${c.start}/${c.hit}/${c.goal ? 'goal' : 'all'}` })
    expect(new Set(sig).size).toBe(CONFIG_IDS.length)
    for (const id of CONFIG_IDS) expect(CONFIGS[id].fact.length).toBeGreaterThan(20)
  })
  it('pieces left to carry stay small at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const st = startFor(id, d, 5)
      const goal = st.goal ?? st.pieces
      if (CONFIGS[id].start === 'midgame') expect(goal, `${id}@${d}`).toBeLessThanOrEqual(d === 1 ? 2 : 3)
      else expect(goal, `${id}@${d}`).toBeLessThanOrEqual(d <= 2 ? 1 : 2)
    }
  })
  it('first to bear off the goal wins in the New Kingdom opening', () => {
    const st = startFor('new-kingdom', 3, 1)
    expect(st.pieces).toBe(7)
    expect(st.goal).toBe(2)
    expect(winner({ ...st, off: [2, 1] })).toBe(1)
    expect(winner({ ...st, off: [1, 1] })).toBe(null)
  })
  it("the steward's rule throws a hit piece back to the House of Rebirth", () => {
    const st: State = { ...mk({ 18: 1, 20: 2, 3: 2 }), hit: 'rebirth' }
    const m = legalMoves(st, 2).find(x => x.to === 20)!
    expect(hitSquare(st, m)).toBe(15)
    const after = applyMove(st, m, 2)
    expect(after.board[20]).toBe(1)
    expect(after.board[18]).toBe(0)
    expect(after.board[15]).toBe(2)
    // Kendall's swap for comparison.
    const k = applyMove(mk({ 18: 1, 20: 2 }), { from: 18, to: 20 }, 2)
    expect(k.board[18]).toBe(2)
  })
  it('mid-game starts are seeded, fair and inside the board', () => {
    for (const id of CONFIG_IDS.filter(i => CONFIGS[i].start === 'midgame')) for (const d of DIFFS) for (let seed = 1; seed < 30; seed++) {
      const st = startFor(id, d, seed)
      expect(st).toEqual(startFor(id, d, seed))
      const h: number[] = [], a: number[] = []
      for (let q = 1; q <= 30; q++) { if (st.board[q] === 1) h.push(q); if (st.board[q] === 2) a.push(q) }
      expect(h).toHaveLength(st.pieces)
      expect(a).toHaveLength(st.pieces)
      expect([...h, ...a].every(q => q >= (CONFIGS[id].from ?? 8) && q <= 26)).toBe(true)
      const sum = (x: number[]) => x.reduce((p, q) => p + q, 0)
      if (d === 1) expect(sum(h)).toBeGreaterThan(sum(a))
      else expect(sum(h)).toBe(sum(a))
    }
    expect(midgameState(3, 1).board).not.toEqual(midgameState(3, 2).board)
  })
})

describe('SenetGame UI', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(SenetGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByText(CONFIGS[id].title)).toBeTruthy()
      expect(screen.getAllByRole('button', { name: /^square/ })).toHaveLength(30)
      cleanup()
    }
  })

  const seedWhere = (pred: (s: number) => boolean) => { for (let s = 1; s < 5000; s++) if (pred(s)) return s; throw new Error('no seed') }

  it('a scripted win calls onWin once', () => {
    vi.useFakeTimers()
    const seed = seedWhere(s => throwAt(s, 1, 0).value === 1)
    const startBoard = Array(31).fill(0); startBoard[30] = 1; startBoard[3] = 2
    let won = 0, lost = 0
    render(createElement(SenetGame, {
      configId: 'kendall', difficulty: 4, seed, params: { startBoard, startOff: [2, 0] },
      onWin: () => { won++ }, onLose: () => { lost++ },
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Throw sticks' }))
    act(() => { vi.advanceTimersByTime(700) })
    fireEvent.click(screen.getByLabelText(/^square 30 .*your piece/))
    fireEvent.click(screen.getByRole('button', { name: /Bear off/ }))
    act(() => { vi.advanceTimersByTime(3000) })
    expect(won).toBe(1)
    expect(lost).toBe(0)
    cleanup()
    vi.useRealTimers()
  })

  it('a scripted loss calls onLose once', () => {
    vi.useFakeTimers()
    const seed = seedWhere(s => throwAt(s, 2, 0).value === 3)
    const startBoard = Array(31).fill(0); startBoard[28] = 2; startBoard[3] = 1
    let won = 0, lost = 0
    render(createElement(SenetGame, {
      configId: 'tutankhamun', difficulty: 1, seed, params: { startBoard, startOff: [0, 1], startTurn: 2 },
      onWin: () => { won++ }, onLose: () => { lost++ },
    }))
    act(() => { vi.advanceTimersByTime(500) })
    act(() => { vi.advanceTimersByTime(700) })
    act(() => { vi.advanceTimersByTime(600) })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(lost).toBe(1)
    expect(won).toBe(0)
    cleanup()
    vi.useRealTimers()
  })
})
