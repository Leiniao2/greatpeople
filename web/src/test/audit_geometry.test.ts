// Solvability audit for the geometry construction game.  For every config
// and difficulty the target must be exactly reachable from the handles'
// snapped ranges, the seeded start must never already be a win, every handle
// must stay on the canvas, and each handle must be where it says it is
// (dragging it to its own position leaves the shape unchanged).
import { describe, it, expect } from 'vitest'
import type { Difficulty } from '@/games/types'
import {
  CONFIGS, CONFIG_IDS, VW, VH, type Params, type GeometryConfig,
  applyDrag, isValid, isWin, nudge, snap, startParams, tolerance,
} from '@/components/minigames/GeometryGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1)

/** Every snapped, valid parameter combination a config allows. */
function allShapes(cfg: GeometryConfig): Params[] {
  let shapes: Params[] = [{}]
  for (const def of cfg.params) {
    const values: number[] = []
    for (let v = def.min; v <= def.max + 1e-9; v += def.step) values.push(snap(v, def))
    shapes = shapes.flatMap(p => values.map(v => ({ ...p, [def.key]: v })))
  }
  return shapes.filter(p => isValid(cfg, p))
}

// The construction the original quiz answer describes; it must be a win at every tier.
const CANONICAL: Record<string, Params> = {
  'triangle-sum': { B: 70, C: 60 },
  'pythagorean': { a: 3, b: 4 },
  'parallel-lines': { t: 65 },
  'pentagon-interior': { n: 5 },
  'hexagon-interior': { n: 6 },
  'circle-circumference': { r: 7 },
  'sphere-surface': { r: 5 },
  'golden-ratio': { L: 21 },
  'right-triangle-angle': { t: 37 },
  'volume-pyramid': { h: 147 },
  'anaxagoras-shadow': { e: 11.3 },
  'discus-angle': { a: 45 },
  'cylinder-volume': { r: 3, h: 10 },
  'ellipse-area': { a: 8, b: 5 },
  'cone-surface': { r: 2, l: 3 },
  'cube-diagonal': { s: 4 },
}

describe('geometry construction audit', () => {
  it('covers every config', () => {
    expect(CONFIG_IDS.sort()).toEqual(Object.keys(CANONICAL).sort())
  })

  it('tolerance never loosens as difficulty rises', () => {
    for (const id of CONFIG_IDS) {
      const cfg = CONFIGS[id]
      for (let d = 1; d < 4; d++) expect(cfg.tol[d], id).toBeLessThanOrEqual(cfg.tol[d - 1])
    }
  })

  for (const id of CONFIG_IDS) {
    const cfg = CONFIGS[id]
    const shapes = allShapes(cfg)

    describe(id, () => {
      it('the canonical construction wins at every difficulty', () => {
        expect(isValid(cfg, CANONICAL[id])).toBe(true)
        for (const d of DIFFS) expect(isWin(cfg, CANONICAL[id], d), `difficulty ${d}`).toBe(true)
      })

      it('the target is reachable from the snapped handle ranges at every difficulty', () => {
        for (const d of DIFFS) {
          const wins = shapes.filter(p => isWin(cfg, p, d))
          expect(wins.length, `difficulty ${d}`).toBeGreaterThan(0)
          // Not a free win either: most shapes must miss.
          expect(wins.length / shapes.length, `difficulty ${d} win share`).toBeLessThanOrEqual(0.1)
        }
      })

      it('every handle stays on the canvas for every shape', () => {
        for (const p of shapes) {
          for (const h of cfg.handles) {
            const [x, y] = h.pos(p)
            expect(x, `${JSON.stringify(p)} x`).toBeGreaterThanOrEqual(0)
            expect(x, `${JSON.stringify(p)} x`).toBeLessThanOrEqual(VW)
            expect(y, `${JSON.stringify(p)} y`).toBeGreaterThanOrEqual(0)
            expect(y, `${JSON.stringify(p)} y`).toBeLessThanOrEqual(VH)
          }
        }
      })

      it('dragging a handle to its own position is a no-op', () => {
        for (const p of shapes) {
          cfg.handles.forEach((h, i) => {
            const [x, y] = h.pos(p)
            expect(applyDrag(cfg, p, i, x, y), `${JSON.stringify(p)} handle ${i}`).toEqual(p)
          })
        }
      })

      it('the seeded start is valid, snapped and never already a win', () => {
        for (const seed of SEEDS) {
          const p = startParams(cfg, seed)
          expect(isValid(cfg, p), `seed ${seed}`).toBe(true)
          for (const def of cfg.params) expect(p[def.key], `seed ${seed} ${def.key}`).toBe(snap(p[def.key], def))
          for (const d of DIFFS) expect(isWin(cfg, p, d), `seed ${seed} difficulty ${d}`).toBe(false)
        }
        // Different seeds give different starts, so a retry reshuffles.
        expect(new Set(SEEDS.map(s => JSON.stringify(startParams(cfg, s)))).size).toBeGreaterThan(1)
      })

      it('nudging walks every parameter across its whole range', () => {
        for (const def of cfg.params) {
          let p = startParams(cfg, 1)
          for (let i = 0; i < 1000 && p[def.key] < def.max; i++) {
            const next = nudge(cfg, p, def.key, 1)
            if (next === p) break
            p = next
          }
          for (let i = 0; i < 1000 && p[def.key] > def.min; i++) {
            const next = nudge(cfg, p, def.key, -1)
            if (next === p) break
            p = next
          }
          expect(isValid(cfg, p)).toBe(true)
          expect(p[def.key]).toBe(snap(p[def.key], def))
        }
        // The canonical shape can be reached by nudging alone from the start (at tier 4 tolerance).
        let p = startParams(cfg, 7)
        for (const def of cfg.params) {
          for (let i = 0; i < 1000 && p[def.key] !== CANONICAL[id][def.key]; i++) {
            const next = nudge(cfg, p, def.key, p[def.key] < CANONICAL[id][def.key] ? 1 : -1)
            if (next === p) break
            p = next
          }
        }
        expect(isWin(cfg, p, 4), `tolerance ${tolerance(cfg, 4)}: reached ${JSON.stringify(p)}`).toBe(true)
      })
    })
  }
})
