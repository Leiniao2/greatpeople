import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import TaflGame, {
  CONFIGS, CONFIG_IDS, EMPTY, ATK, DEF, KING, initialBoard, movesFor, applyMove, kingCaptured, kingEscaped, kingRoutes,
  searchMove, attackerMove, startBoard, playTurn, rulesFor, sizeFor, moveLimitFor, throneOf, type Rules, type Move,
} from '@/components/minigames/TaflGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
afterEach(() => { cleanup(); vi.useRealTimers() })

const R7: Rules = { n: 7, edgeHostileToKing: false, kingArmed: true }
const empty = (n: number) => new Array<number>(n * n).fill(EMPTY)
const at = (n: number, r: number, c: number) => r * n + c

/** Defender player for tests: two-ply search (its move, the attackers' best reply). */
const defenderMove = (b: number[], d: Difficulty) => searchMove(b, rulesFor(d), 'D', { depth: 2, style: 'balanced', nodeBudget: 200_000 })

function playGame(d: Difficulty, id: string, seed: number): { result: 'win' | 'lose' | 'limit'; moves: Move[] } {
  let b = startBoard(d, seed, id)
  const moves: Move[] = []
  for (let ply = 0; ply < moveLimitFor(d); ply++) {
    const m = defenderMove(b, d)
    if (!m) return { result: 'lose', moves }
    moves.push(m)
    const r = playTurn(b, d, CONFIGS[id].style, seed, ply, m)
    if (r.result) return { result: r.result, moves }
    b = r.afterAi!
  }
  return { result: 'limit', moves }
}

describe('Hnefatafl — rules', () => {
  it('sets up Brandubh, Tablut and Hnefatafl', () => {
    for (const [n, a, dd] of [[7, 8, 4], [9, 16, 8], [11, 24, 12]]) {
      const b = initialBoard(n)
      expect(b.filter(v => v === ATK).length, `${n}`).toBe(a)
      expect(b.filter(v => v === DEF).length).toBe(dd)
      expect(b[throneOf(n)]).toBe(KING)
    }
    expect([1, 2, 3, 4].map(d => sizeFor(d as Difficulty))).toEqual([7, 7, 9, 11])
    expect(startBoard(1, 5, 'birka').filter(v => v === ATK).length).toBe(6)
  })

  it('pieces slide like rooks, only the king stops on the throne or corners, and the empty throne can be crossed', () => {
    const b = empty(7)
    b[at(7, 3, 0)] = DEF
    b[at(7, 0, 1)] = ATK
    b[at(7, 6, 5)] = KING
    const def = movesFor(b, 7, 'D').filter(m => m.from === at(7, 3, 0)).map(m => m.to)
    expect(def).not.toContain(throneOf(7))
    expect(def).toContain(at(7, 3, 4)) // crossed the empty throne
    expect(def).not.toContain(at(7, 0, 0))
    const atk = movesFor(b, 7, 'A').map(m => m.to)
    expect(atk).not.toContain(at(7, 0, 0))
    const king = movesFor(b, 7, 'D').filter(m => m.from === at(7, 6, 5)).map(m => m.to)
    expect(king).toContain(at(7, 6, 6))
  })

  it('custodial capture: between two enemies, or against a corner or the empty throne', () => {
    let b = empty(7)
    b[at(7, 2, 2)] = DEF; b[at(7, 2, 1)] = ATK; b[at(7, 5, 3)] = ATK
    let r = applyMove(b, R7, { from: at(7, 5, 3), to: at(7, 2, 3) })
    expect(r.captured).toEqual([at(7, 2, 2)])
    // Moving between two enemies is safe.
    b = empty(7); b[at(7, 2, 1)] = DEF; b[at(7, 2, 3)] = DEF; b[at(7, 5, 2)] = ATK
    r = applyMove(b, R7, { from: at(7, 5, 2), to: at(7, 2, 2) })
    expect(r.captured).toEqual([])
    // Corner as anvil.
    b = empty(7); b[at(7, 0, 1)] = ATK; b[at(7, 4, 2)] = DEF
    r = applyMove(b, R7, { from: at(7, 4, 2), to: at(7, 0, 2) })
    expect(r.captured).toEqual([at(7, 0, 1)])
    // Empty throne as anvil; the armed king also captures.
    b = empty(7); b[at(7, 3, 2)] = ATK; b[at(7, 3, 0)] = KING
    r = applyMove(b, R7, { from: at(7, 3, 0), to: at(7, 3, 1) })
    expect(r.captured).toEqual([at(7, 3, 2)])
    expect(applyMove(b, { ...R7, kingArmed: false }, { from: at(7, 3, 0), to: at(7, 3, 1) }).captured).toEqual([]) // an unarmed king cannot
    b = empty(7); b[at(7, 1, 2)] = ATK; b[at(7, 1, 3)] = DEF; b[at(7, 1, 0)] = KING
    expect(applyMove(b, { ...R7, kingArmed: false }, { from: at(7, 1, 0), to: at(7, 1, 1) }).captured).toEqual([])
    expect(applyMove(b, R7, { from: at(7, 1, 0), to: at(7, 1, 1) }).captured).toEqual([at(7, 1, 2)])
  })

  it('the king needs four sides closed; the throne counts, the edge only from D3', () => {
    const b = empty(7)
    b[at(7, 2, 2)] = KING
    b[at(7, 1, 2)] = ATK; b[at(7, 3, 2)] = ATK; b[at(7, 2, 1)] = ATK
    expect(kingCaptured(b, R7)).toBe(false)
    b[at(7, 2, 3)] = ATK
    expect(kingCaptured(b, R7)).toBe(true)
    // Next to the throne: three attackers suffice.
    const t = empty(7)
    t[at(7, 2, 3)] = KING; t[at(7, 1, 3)] = ATK; t[at(7, 2, 2)] = ATK; t[at(7, 2, 4)] = ATK
    expect(kingCaptured(t, R7)).toBe(true)
    // On the edge: safe at D1–2, three attackers capture from D3.
    const e = empty(9)
    e[at(9, 0, 4)] = KING; e[at(9, 0, 3)] = ATK; e[at(9, 0, 5)] = ATK; e[at(9, 1, 4)] = ATK
    expect(kingCaptured(e, { ...rulesFor(2), n: 9 })).toBe(false)
    expect(kingCaptured(e, { ...rulesFor(3), n: 9 })).toBe(true)
  })

  it('escape: a king on a corner wins; open lanes to corners are counted', () => {
    const b = empty(7)
    b[at(7, 0, 3)] = KING
    expect(kingRoutes(b, 7)).toBe(2)
    b[at(7, 0, 1)] = ATK
    expect(kingRoutes(b, 7)).toBe(1)
    b[at(7, 0, 3)] = EMPTY; b[at(7, 0, 6)] = KING
    expect(kingEscaped(b, 7)).toBe(true)
  })
})

describe('Hnefatafl — attackers AI', () => {
  it('blocks a single open lane and takes the king when it can', () => {
    const b = empty(7)
    b[at(7, 0, 3)] = KING; b[at(7, 0, 1)] = ATK; b[at(7, 4, 5)] = ATK; b[at(7, 5, 2)] = DEF
    const m = searchMove(b, R7, 'A', { depth: 1, style: 'balanced' })!
    expect([at(7, 0, 4), at(7, 0, 5)]).toContain(m.to)
    const c = empty(7)
    c[at(7, 2, 2)] = KING; c[at(7, 1, 2)] = ATK; c[at(7, 3, 2)] = ATK; c[at(7, 2, 1)] = ATK; c[at(7, 5, 3)] = ATK; c[at(7, 6, 5)] = DEF
    const k = searchMove(c, R7, 'A', { depth: 2, style: 'hunter' })!
    expect(kingCaptured(applyMove(c, R7, k).board, R7)).toBe(true)
  })

  it('answers fast at every difficulty (< 200 ms typical, generous ceiling in CI)', () => {
    for (const d of DIFFS) {
      let b = startBoard(d, 1, 'linnaeus')
      let worst = 0
      for (let ply = 0; ply < 6; ply++) {
        const m = defenderMove(b, d)!
        b = applyMove(b, rulesFor(d), m).board
        const t0 = performance.now()
        const a = attackerMove(b, d, 'hunter', 1, ply)
        worst = Math.max(worst, performance.now() - t0)
        if (!a) break
        b = applyMove(b, rulesFor(d), a).board
      }
      expect(worst, `D${d} worst ${worst.toFixed(0)}ms`).toBeLessThan(400)
    }
  })

  it('is deterministic for a seed', () => {
    const b = startBoard(3, 4, 'birka')
    const m = movesFor(b, 9, 'D')[3]
    const after = applyMove(b, rulesFor(3), m).board
    expect(attackerMove(after, 3, 'balanced', 4, 0)).toEqual(attackerMove(after, 3, 'balanced', 4, 0))
  })
})

describe('Hnefatafl — winnable', () => {
  it('a winning line exists against the AI at D1 and D2 for every config and seed', () => {
    for (const d of [1, 2] as Difficulty[]) for (const id of CONFIG_IDS) for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = playGame(d, id, seed)
      expect(g.result, `${id}@${d}#${seed}`).toBe('win')
    }
  }, 60_000)
  it('the test player also wins some D3 and D4 games', () => {
    for (const d of [3, 4] as Difficulty[]) {
      const wins = CONFIG_IDS.flatMap(id => [1, 2, 5].map(seed => playGame(d, id, seed).result)).filter(r => r === 'win').length
      expect(wins, `D${d}`).toBeGreaterThan(0)
    }
  }, 120_000)
})

describe('Hnefatafl — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(TaflGame, { configId: id, difficulty: d, seed: 1, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-sq]').length).toBe(sizeFor(d) ** 2)
      expect(container.querySelectorAll(`[data-piece="${KING}"]`).length).toBe(1)
      cleanup()
    }
  })

  const click = (container: HTMLElement, i: number) => fireEvent.click(container.querySelector(`[data-sq="${i}"]`)!)

  it('playing the winning line wins exactly once', () => {
    vi.useFakeTimers()
    const id = 'ballinderry', d: Difficulty = 2, seed = 3
    const { moves, result } = playGame(d, id, seed)
    expect(result).toBe('win')
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(TaflGame, { configId: id, difficulty: d, seed, onWin, onLose }))
    for (const m of moves) {
      click(container, m.from); click(container, m.to)
      act(() => { vi.advanceTimersByTime(500) })
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('shuffling one defender back and forth runs out the moves and loses exactly once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(TaflGame, { configId: 'birka', difficulty: 1, seed: 2, onWin, onLose }))
    const board = () => [...container.querySelectorAll<HTMLElement>('[data-sq]')].map(e => Number(e.dataset.piece ?? 0))
    for (let k = 0; k < 60 && !onLose.mock.calls.length; k++) {
      const b = board()
      const m = movesFor(b, 7, 'D').find(mv => b[mv.from] === DEF)
      if (!m) break
      click(container, m.from); click(container, m.to)
      act(() => { vi.advanceTimersByTime(500) })
      act(() => { vi.advanceTimersByTime(1000) })
    }
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
