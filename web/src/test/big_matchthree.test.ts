// Match Three engine: dealing, special pieces, crates, cascades and level goals.
import { describe, it, expect } from 'vitest'
import {
  CONFIGS, CRATE, WILD, MAX_MULT, deal, reshuffle, findRuns, hasValidMove, isValidSwap, validSwaps, planClear,
  planSwapFire, applyPlan, gravity, resolveStep, levelFor, simulate, swapped, startRound, boardSeed,
  type Board, type Piece, type Special,
} from '@/components/minigames/MatchThreeGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

const N = 6
const at = (r: number, c: number) => r * N + c

/** A 6×6 board with no runs in any direction: colour (c + 2r) mod 5. Colour 5 is free for tests. */
function board(over: Record<number, Partial<Piece>> = {}): Board {
  let id = 1
  const cells = Array.from({ length: N * N }, (_, i) => {
    const r = Math.floor(i / N), c = i % N
    return { id: id++, t: (c + 2 * r) % 5, ...over[i] } as Piece
  })
  return { n: N, cells, nextId: id }
}
const paint = (cells: number[], t = 5, sp?: Special): Record<number, Partial<Piece>> =>
  Object.fromEntries(cells.map(i => [i, { t, sp }]))

describe('match three — dealing', () => {
  it('the filler board used below has no runs, even with diagonals', () => {
    expect(findRuns(board(), { diagonal: true })).toEqual([])
  })

  it('every config deals boards with no match and at least one legal swap, across 200 seeds and both sizes', () => {
    for (const [id, cfg] of Object.entries(CONFIGS)) {
      for (const d of [1, 4] as Difficulty[]) {
        const level = levelFor(cfg, d)
        for (let s = 0; s < 200; s++) {
          const { board: b } = startRound(cfg, level, mulberry32(boardSeed(id, s)))
          expect(findRuns(b, cfg.rules).length, `${id}@${d} seed ${s}`).toBe(0)
          expect(hasValidMove(b, cfg.rules), `${id}@${d} seed ${s}`).toBe(true)
          expect(b.cells.every(Boolean)).toBe(true)
          expect(b.cells.filter(p => p!.t === CRATE).length).toBe(level.crates)
        }
      }
    }
  })

  it('is deterministic for a seed and differs between seeds', () => {
    const cfg = CONFIGS['lisbon-spices'], level = levelFor(cfg, 3)
    const a = startRound(cfg, level, mulberry32(42)).board.cells.map(p => p!.t)
    const b = startRound(cfg, level, mulberry32(42)).board.cells.map(p => p!.t)
    const c = startRound(cfg, level, mulberry32(43)).board.cells.map(p => p!.t)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('reshuffle keeps the crates in place and leaves a playable board without matches', () => {
    for (const [id, cfg] of Object.entries(CONFIGS)) {
      const rand = mulberry32(boardSeed(id, 5))
      const b = deal(9, cfg.tiles.length, cfg.rules ?? {}, rand, 6, 2)
      const r = reshuffle(b, cfg.tiles.length, rand, cfg.rules ?? {})
      expect(findRuns(r, cfg.rules).length, id).toBe(0)
      expect(hasValidMove(r, cfg.rules), id).toBe(true)
      b.cells.forEach((p, i) => { if (p!.t === CRATE) expect(r.cells[i]).toBe(p) })
    }
  })
})

describe('match three — special pieces', () => {
  it('a run of four leaves a line clearer on the moved cell (row for horizontal, column for vertical)', () => {
    const h = planClear(board(paint([at(2, 0), at(2, 1), at(2, 2), at(2, 3)])), {}, [at(2, 1)])!
    expect([...h.create]).toEqual([[at(2, 1), { t: 5, sp: 'row' }]])
    expect(h.clear.size).toBe(4)
    const v = planClear(board(paint([at(1, 4), at(2, 4), at(3, 4), at(4, 4)])))!
    expect([...v.create.values()]).toEqual([{ t: 5, sp: 'col' }])
  })

  it('a run of five leaves a trade caravan', () => {
    const p = planClear(board(paint([0, 1, 2, 3, 4].map(c => at(3, c)))))!
    expect([...p.create.values()]).toEqual([{ t: WILD, sp: 'caravan' }])
  })

  it('match-4 configs need five for a line and six for a caravan', () => {
    const rules = { minMatch: 4 }
    expect(planClear(board(paint([0, 1, 2, 3].map(c => at(2, c)))), rules)!.create.size).toBe(0)
    expect([...planClear(board(paint([0, 1, 2, 3, 4].map(c => at(2, c)))), rules)!.create.values()][0].sp).toBe('row')
    expect([...planClear(board(paint([0, 1, 2, 3, 4, 5].map(c => at(2, c)))), rules)!.create.values()][0].sp).toBe('caravan')
  })

  it('an L or T leaves a 3×3 blast at the crossing', () => {
    const l = planClear(board(paint([at(2, 0), at(2, 1), at(2, 2), at(3, 0), at(4, 0)])))!
    expect([...l.create]).toEqual([[at(2, 0), { t: 5, sp: 'bomb' }]])
    const t = planClear(board(paint([at(1, 1), at(1, 2), at(1, 3), at(2, 2), at(3, 2)])))!
    expect([...t.create]).toEqual([[at(1, 2), { t: 5, sp: 'bomb' }]])
  })

  it('a line clearer in a match clears its whole row; a column clearer its column', () => {
    const row = planClear(board({ ...paint([at(2, 1), at(2, 2)]), [at(2, 0)]: { t: 5, sp: 'row' } }))!
    for (let c = 0; c < N; c++) expect(row.clear.has(at(2, c))).toBe(true)
    const col = planClear(board({ ...paint([at(2, 1), at(2, 2)]), [at(2, 0)]: { t: 5, sp: 'col' } }))!
    for (let r = 0; r < N; r++) expect(col.clear.has(at(r, 0))).toBe(true)
  })

  it('a blast clears the 3×3 around it', () => {
    const p = planClear(board({ ...paint([at(3, 1), at(3, 3)]), [at(3, 2)]: { t: 5, sp: 'bomb' } }))!
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) expect(p.clear.has(at(3 + dr, 2 + dc))).toBe(true)
    expect(p.clear.has(at(0, 0))).toBe(false)
  })

  it('swapping a caravan with a good clears every piece of that good; caravan with caravan clears the board', () => {
    const b = board({ [at(0, 0)]: { t: WILD, sp: 'caravan' } })
    expect(isValidSwap(b, at(0, 0), at(0, 1))).toBe(true)
    const s = swapped(b, at(0, 0), at(0, 1))
    const goodT = s.cells[at(0, 0)]!.t
    const plan = planSwapFire(s, at(0, 0), at(0, 1))!
    s.cells.forEach((p, i) => { if (p!.t === goodT) expect(plan.clear.has(i)).toBe(true) })
    expect(plan.clear.has(at(0, 1))).toBe(true)
    expect([...plan.clear].every(i => s.cells[i]!.t === goodT || i === at(0, 1))).toBe(true)

    const two = board({ [at(0, 0)]: { t: WILD, sp: 'caravan' }, [at(0, 1)]: { t: WILD, sp: 'caravan' } })
    expect(planSwapFire(two, at(0, 0), at(0, 1))!.clear.size).toBe(N * N)
  })

  it('two specials swapped together both go off, even without a match', () => {
    const b = board({ [at(2, 2)]: { t: 0, sp: 'row' }, [at(2, 3)]: { t: 1, sp: 'col' } })
    expect(isValidSwap(b, at(2, 2), at(2, 3))).toBe(true)
    const plan = planSwapFire(swapped(b, at(2, 2), at(2, 3)), at(2, 2), at(2, 3))!
    for (let k = 0; k < N; k++) {
      expect(plan.clear.has(at(2, k))).toBe(true)
      expect(plan.clear.has(at(k, 2))).toBe(true) // the column special now sits at (2,2)
    }
  })

  it('specials chain: a blast that catches a line clearer sets it off', () => {
    const b = board({ ...paint([at(3, 1), at(3, 3)]), [at(3, 2)]: { t: 5, sp: 'bomb' }, [at(2, 2)]: { t: 0, sp: 'col' } })
    const p = planClear(b)!
    for (let r = 0; r < N; r++) expect(p.clear.has(at(r, 2))).toBe(true)
    expect(p.fired).toBe(2)
  })
})

describe('match three — crates and gravity', () => {
  it('a match beside a crate cracks it; tough crates take two hits; crates never fall', () => {
    const b = board({ ...paint([at(4, 0), at(4, 1), at(4, 2)]), [at(3, 1)]: { t: CRATE, hp: 1 }, [at(5, 2)]: { t: CRATE, hp: 2 } })
    const plan = planClear(b)!
    expect([...plan.crateHits].sort()).toEqual([at(3, 1), at(5, 2)].sort())
    const { board: after, cratesBroken } = applyPlan(b, plan)
    expect(cratesBroken).toBe(1)
    expect(after.cells[at(3, 1)]).toBeNull()
    expect(after.cells[at(5, 2)]).toMatchObject({ t: CRATE, hp: 1 })
    const fallen = gravity(after, 5, mulberry32(1))
    expect(fallen.cells[at(5, 2)]).toMatchObject({ t: CRATE, hp: 1 })
    expect(fallen.cells.every(Boolean)).toBe(true)
    // The good that sat above the crate's column gap fell past it, not into it.
    expect(fallen.cells[at(4, 2)]!.id).toBe(b.cells[at(3, 2)]!.id)
  })

  it('crates are never part of a swap or a run', () => {
    const b = board({ [at(2, 2)]: { t: CRATE, hp: 1 } })
    expect(isValidSwap(b, at(2, 2), at(2, 3))).toBe(false)
    expect(validSwaps(b).some(([i, j]) => i === at(2, 2) || j === at(2, 2))).toBe(false)
  })

  it('cascade steps multiply the score, up to the cap', () => {
    const b = board(paint([at(2, 0), at(2, 1), at(2, 2)]))
    const one = resolveStep(b, {}, 6, mulberry32(1), 1)!.points
    expect(resolveStep(b, {}, 6, mulberry32(1), 3)!.points).toBe(one * 3)
    expect(resolveStep(b, {}, 6, mulberry32(1), 20)!.points).toBe(one * MAX_MULT)
  })
})

describe('match three — levels', () => {
  it('boards are 8×8 at D1–2 and 9×9 at D3–4; D3–4 play two rounds with crates; goals grow with tier', () => {
    for (const cfg of Object.values(CONFIGS)) {
      const L = ([1, 2, 3, 4] as Difficulty[]).map(d => levelFor(cfg, d))
      expect(L.map(l => l.n)).toEqual([8, 8, 9, 9])
      expect(L.map(l => l.rounds)).toEqual([1, 1, 2, 2])
      expect(L[0].collect).toBe(0)
      expect(L[1].collect).toBeGreaterThan(0)
      expect(L[0].crates + L[1].crates).toBe(0)
      expect(L[2].crates).toBeGreaterThan(0)
      expect(L[0].moves).toBeGreaterThan(L[3].moves)
    }
  })

  it('every config is reachable at every tier by a greedy player (and always at D1)', () => {
    for (const id of Object.keys(CONFIGS)) {
      for (const d of [1, 2, 3, 4] as Difficulty[]) {
        const wins = Array.from({ length: 24 }, (_, s) => simulate(id, d, s + 101)).filter(r => r.won).length
        expect(wins, `${id}@${d}`).toBeGreaterThanOrEqual(d === 1 ? 24 : 18)
      }
    }
  })
})
