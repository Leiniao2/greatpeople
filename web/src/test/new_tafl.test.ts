import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import TaflGame, {
  CONFIGS, CONFIG_IDS, EMPTY, ATK, DEF, KING, initialBoard, movesFor, applyMove, kingCaptured, kingEscaped, kingRoutes,
  searchMove, attackerMove, aiMove, startBoard, playTurn, rulesFor, sizeFor, moveLimitFor, throneOf, sideOf, kingLanes,
  type Rules, type Move,
} from '@/components/minigames/TaflGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
afterEach(() => { cleanup(); vi.useRealTimers() })

const R7: Rules = { n: 7, edgeHostileToKing: false, kingArmed: true }
const empty = (n: number) => new Array<number>(n * n).fill(EMPTY)
const at = (n: number, r: number, c: number) => r * n + c

/** Test player: a `depth`-ply search for whichever side the config gives you. */
const playerMove = (b: number[], d: Difficulty, id: string, depth = 2) =>
  searchMove(b, rulesFor(d, id), sideOf(id), { depth, style: 'balanced', nodeBudget: 200_000 })

function playGame(d: Difficulty, id: string, seed: number, depth = 2): { result: 'win' | 'lose'; why: string | null; moves: Move[] } {
  let b = startBoard(d, seed, id)
  const moves: Move[] = []
  for (let ply = 0; ply <= moveLimitFor(d, id); ply++) {
    const m = playerMove(b, d, id, depth)
    if (!m) return { result: 'lose', why: 'stuck', moves }
    moves.push(m)
    const r = playTurn(b, d, id, seed, ply, m)
    if (r.result) return { result: r.result, why: r.why, moves }
    b = r.afterAi!
  }
  throw new Error('the move cap did not end the game')
}

describe('Hnefatafl — rules', () => {
  it('sets up Brandubh, Tablut and Hnefatafl', () => {
    for (const [n, a, dd] of [[7, 8, 4], [9, 16, 8], [11, 24, 12]]) {
      const b = initialBoard(n)
      expect(b.filter(v => v === ATK).length, `${n}`).toBe(a)
      expect(b.filter(v => v === DEF).length).toBe(dd)
      expect(b[throneOf(n)]).toBe(KING)
    }
    expect([1, 2, 3, 4].map(d => sizeFor(d as Difficulty))).toEqual([7, 7, 9, 9])
    expect(startBoard(1, 5, 'birka').filter(v => v === ATK).length).toBe(7)
    expect(startBoard(2, 5, 'birka').filter(v => v === ATK).length).toBe(8)
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
    expect(kingRoutes(b, R7)).toBe(2)
    b[at(7, 0, 1)] = ATK
    expect(kingRoutes(b, R7)).toBe(1)
    expect(kingEscaped(b, R7)).toBe(false)
    b[at(7, 0, 3)] = EMPTY; b[at(7, 0, 6)] = KING
    expect(kingEscaped(b, R7)).toBe(true)
  })
})

describe('Hnefatafl — variants', () => {
  it('each config is a different rule twist', () => {
    const keys = CONFIG_IDS.map(id => { const c = CONFIGS[id]; return `${c.mode}:${c.escape}:${c.kingArmed}:${c.weakKing}` })
    expect(new Set(keys).size).toBe(CONFIG_IDS.length)
    expect(CONFIG_IDS).toEqual(expect.arrayContaining(['birka', 'ballinderry', 'linnaeus', 'tawlbwrdd']))
    for (const id of CONFIG_IDS) expect(CONFIGS[id].intro.length, id).toBeGreaterThan(40)
  })

  it('ballinderry: the king is unarmed, and the edge never counts against him', () => {
    for (const d of DIFFS) {
      expect(rulesFor(d, 'ballinderry').kingArmed).toBe(false)
      expect(rulesFor(d, 'ballinderry').edgeHostileToKing).toBe(false)
    }
    expect(rulesFor(3, 'birka').edgeHostileToKing).toBe(true)
    // King moves to (1,1) beside an attacker at (1,2) with a defender at (1,3): no capture when unarmed.
    const b = empty(7); b[at(7, 1, 0)] = KING; b[at(7, 1, 2)] = ATK; b[at(7, 1, 3)] = DEF
    expect(applyMove(b, rulesFor(1, 'ballinderry'), { from: at(7, 1, 0), to: at(7, 1, 1) }).captured).toEqual([])
    expect(applyMove(b, rulesFor(1, 'birka'), { from: at(7, 1, 0), to: at(7, 1, 1) }).captured).toEqual([at(7, 1, 2)])
  })

  it('linnaeus: any edge square is an escape', () => {
    const r = rulesFor(2, 'linnaeus')
    const b = empty(7); b[at(7, 2, 2)] = KING
    expect(kingLanes(b, r)).toHaveLength(4)
    expect(kingRoutes(b, rulesFor(2, 'birka'))).toBe(0)
    b[at(7, 0, 2)] = ATK
    expect(kingRoutes(b, r)).toBe(3)
    const e = empty(7); e[at(7, 0, 2)] = KING
    expect(kingEscaped(e, r)).toBe(true)
    expect(kingEscaped(e, rulesFor(2, 'birka'))).toBe(false)
  })

  it('linnaeus: off the throne the king is weak — two attackers take him; beside the throne he needs four', () => {
    const r = rulesFor(2, 'linnaeus')
    const b = empty(7); b[at(7, 1, 1)] = KING; b[at(7, 1, 0)] = ATK; b[at(7, 5, 2)] = ATK
    const after = applyMove(b, r, { from: at(7, 5, 2), to: at(7, 1, 2) })
    expect(after.captured).toEqual([at(7, 1, 1)])
    expect(kingCaptured(after.board, r)).toBe(true)
    expect(kingCaptured(applyMove(b, rulesFor(2, 'birka'), { from: at(7, 5, 2), to: at(7, 1, 2) }).board, rulesFor(2, 'birka'))).toBe(false)
    // Beside the throne (3,2): a sandwich of two is not enough.
    const t = empty(7); t[at(7, 3, 2)] = KING; t[at(7, 2, 2)] = ATK; t[at(7, 6, 2)] = ATK; t[throneOf(7)] = DEF
    const t2 = applyMove(t, r, { from: at(7, 6, 2), to: at(7, 4, 2) })
    expect(t2.captured).toEqual([])
    expect(kingCaptured(t2.board, r)).toBe(false)
  })

  it('tawlbwrdd: you play the attackers; holding to the cap wins, an escape loses; edge escape on 9×9', () => {
    expect(sideOf('tawlbwrdd')).toBe('A')
    expect(sideOf('birka')).toBe('D')
    expect(rulesFor(2, 'tawlbwrdd').edgeEscape).toBe(false)
    expect(rulesFor(3, 'tawlbwrdd').edgeEscape).toBe(true)
    expect(rulesFor(1, 'tawlbwrdd').edgeHostileToKing).toBe(true)
    expect(startBoard(1, 3, 'tawlbwrdd').filter(v => v === DEF).length).toBe(3)
    expect(startBoard(1, 3, 'tawlbwrdd').filter(v => v === ATK).length).toBe(8)
    // The computer moves the defenders.
    const b = startBoard(2, 1, 'tawlbwrdd')
    const m = movesFor(b, 7, 'A')[0]
    const r = playTurn(b, 2, 'tawlbwrdd', 1, 0, m)
    const ai = r.ai!
    expect([DEF, KING]).toContain(r.afterMine[ai.from])
    // On the last move, surviving is a win; in a defending config the cap is a loss.
    const g = playGame(2, 'tawlbwrdd', 1)
    expect(g).toMatchObject({ result: 'win', why: 'limit' })
    expect(g.moves).toHaveLength(moveLimitFor(2, 'tawlbwrdd'))
  })
})

describe('Hnefatafl — time budget', () => {
  it('small boards and short caps: ≤16 of your moves at D1, ≤30 at D4, never 11×11', () => {
    for (const id of CONFIG_IDS) {
      const caps = DIFFS.map(d => moveLimitFor(d, id))
      expect(caps[0], id).toBeLessThanOrEqual(16)
      expect(caps[3], id).toBeLessThanOrEqual(30)
      expect(caps.every((c, i) => i === 0 || c >= caps[i - 1]), id).toBe(true)
    }
    expect(DIFFS.every(d => sizeFor(d) <= 9)).toBe(true)
  })

  it('a strong player wins D1 quickly (median ≤ 10 moves) but a random one usually loses', () => {
    for (const id of CONFIG_IDS) {
      const lens = [1, 2, 3, 4, 5].map(seed => playGame(1, id, seed))
      expect(lens.filter(g => g.result === 'win').length, id).toBeGreaterThanOrEqual(3)
      const sorted = lens.map(g => g.moves.length).sort((a, b) => a - b)
      if (CONFIGS[id].mode === 'defend') expect(sorted[2], `${id} median`).toBeLessThanOrEqual(10)
      let lost = 0
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        let b = startBoard(1, seed, id)
        for (let ply = 0; ; ply++) {
          const ms = movesFor(b, 7, sideOf(id))
          const r = playTurn(b, 1, id, seed, ply, ms[(seed * 7 + ply * 13) % ms.length])
          if (r.result) { if (r.result === 'lose') lost++; break }
          b = r.afterAi!
        }
      }
      expect(lost, `${id} random player`).toBeGreaterThanOrEqual(3)
    }
  }, 60_000)
})

describe('Hnefatafl — computer AI', () => {
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
      for (const id of ['linnaeus', 'tawlbwrdd']) {
        let b = startBoard(d, 1, id)
        let worst = 0
        for (let ply = 0; ply < 6; ply++) {
          const m = playerMove(b, d, id)!
          b = applyMove(b, rulesFor(d, id), m).board
          const t0 = performance.now()
          const a = aiMove(b, d, id, 1, ply)
          worst = Math.max(worst, performance.now() - t0)
          if (!a) break
          b = applyMove(b, rulesFor(d, id), a).board
        }
        expect(worst, `${id} D${d} worst ${worst.toFixed(0)}ms`).toBeLessThan(400)
      }
    }
  })

  it('is deterministic for a seed', () => {
    const b = startBoard(3, 4, 'birka')
    const m = movesFor(b, 9, 'D')[3]
    const after = applyMove(b, rulesFor(3), m).board
    expect(attackerMove(after, 3, 'balanced', 4, 0)).toEqual(attackerMove(after, 3, 'balanced', 4, 0))
    expect(aiMove(after, 3, 'birka', 4, 0)).toEqual(attackerMove(after, 3, 'balanced', 4, 0, 'birka'))
  })
})

describe('Hnefatafl — winnable and losable', () => {
  it('a search player wins every config × difficulty for some seed, within the cap', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      let win: { seed: number; moves: number } | null = null
      outer: for (const depth of d <= 2 ? [2] : [2, 3]) for (let seed = 1; seed <= 12; seed++) {
        const g = playGame(d, id, seed, depth)
        if (g.result === 'win') { win = { seed, moves: g.moves.length }; break outer }
      }
      expect(win, `${id}@D${d}`).not.toBeNull()
      expect(win!.moves).toBeLessThanOrEqual(moveLimitFor(d, id))
    }
  }, 120_000)

  it('the D1 and D2 search player wins most games', () => {
    for (const d of [1, 2] as Difficulty[]) for (const id of CONFIG_IDS) {
      const wins = [1, 2, 3, 4, 5, 6].filter(seed => playGame(d, id, seed).result === 'win').length
      expect(wins, `${id}@D${d}`).toBeGreaterThanOrEqual(3)
    }
  }, 60_000)

  it('a one-ply player loses at the top levels', () => {
    for (const id of CONFIG_IDS) {
      const lost = [1, 2, 3].filter(seed => playGame(4, id, seed, 1).result === 'lose').length
      expect(lost, id).toBeGreaterThanOrEqual(2)
    }
  }, 60_000)
})

describe('Hnefatafl — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container } = render(createElement(TaflGame, { configId: id, difficulty: d, seed: 1, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-sq]').length).toBe(sizeFor(d) ** 2)
      expect(container.textContent).toContain(`${moveLimitFor(d, id)} moves left`)
      expect(container.querySelectorAll(`[data-piece="${KING}"]`).length).toBe(1)
      cleanup()
    }
  })

  const click = (container: HTMLElement, i: number) => fireEvent.click(container.querySelector(`[data-sq="${i}"]`)!)

  it('playing the winning line wins exactly once', () => {
    vi.useFakeTimers()
    const id = 'ballinderry', d: Difficulty = 2
    const seed = [1, 2, 3, 4, 5, 6].find(sd => playGame(d, id, sd).result === 'win')!
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

  it('as the raider, holding the ring to the cap wins exactly once', () => {
    vi.useFakeTimers()
    const { moves, result } = playGame(1, 'tawlbwrdd', 1)
    expect(result).toBe('win')
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(TaflGame, { configId: 'tawlbwrdd', difficulty: 1, seed: 1, onWin, onLose }))
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
