// Geometry sequences: every challenge is 2–4 construction steps ending on the
// config's own construction.  Every step must be reachable at every tier,
// never a free win, keep its handles on the canvas, and the whole sequence
// must be completable from the seeded (carried-over) starts by nudging alone.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import type { Difficulty } from '@/games/types'
import GeometryGame, {
  CONFIGS, CONFIG_IDS, PRELUDES, VW, VH, type Params, type GeometryConfig,
  applyDrag, isValid, isWin, nudge, snap, stepsFor, stepStart, stepSeed, stepTarget,
} from '@/components/minigames/GeometryGame'

afterEach(cleanup)
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1)

function allShapes(cfg: GeometryConfig): Params[] {
  let shapes: Params[] = [{}]
  for (const def of cfg.params) {
    const values: number[] = []
    for (let v = def.min; v <= def.max + 1e-9; v += def.step) values.push(snap(v, def))
    shapes = shapes.flatMap(p => values.map(v => ({ ...p, [def.key]: v })))
  }
  return shapes.filter(p => isValid(cfg, p))
}

/** Walk from `from` to `to` one nudge at a time, trying both parameter orders. */
function nudgeTo(cfg: GeometryConfig, from: Params, to: Params): Params {
  const orders = [cfg.params.map(d => d.key), cfg.params.map(d => d.key).reverse()]
  let best = from
  for (const order of orders) {
    let p = from
    for (let round = 0; round < 3; round++) for (const key of order) {
      for (let i = 0; i < 1000 && p[key] !== to[key]; i++) {
        const next = nudge(cfg, p, key, p[key] < to[key] ? 1 : -1)
        if (next === p) break
        p = next
      }
    }
    if (JSON.stringify(p) === JSON.stringify(to)) return p
    best = p
  }
  return best
}

describe('geometry sequences', () => {
  it('every config has preludes, and step count scales with difficulty', () => {
    for (const id of CONFIG_IDS) {
      expect(PRELUDES[id]?.length ?? 0, id).toBeGreaterThanOrEqual(1)
      let prev = 0
      for (const d of DIFFS) {
        const steps = stepsFor(id, d)
        expect(steps.length, `${id} d${d}`).toBeGreaterThanOrEqual(2)
        expect(steps.length, `${id} d${d}`).toBeLessThanOrEqual(4)
        expect(steps.length, `${id} d${d}`).toBeLessThanOrEqual(stepTarget(d))
        expect(steps.length, `${id} d${d}`).toBeGreaterThanOrEqual(prev)
        expect(steps[steps.length - 1], `${id} d${d} ends on the config`).toBe(CONFIGS[id])
        prev = steps.length
      }
    }
    // Most configs reach the full four steps at the top tiers.
    expect(CONFIG_IDS.filter(id => stepsFor(id, 4).length === 4).length).toBeGreaterThanOrEqual(CONFIG_IDS.length - 3)
  })

  for (const id of CONFIG_IDS) {
    it(`${id}: every prelude is reachable, fair and on the canvas`, () => {
      for (const [si, cfg] of (PRELUDES[id] ?? []).entries()) {
        const tag = `${id} prelude ${si} (${cfg.title})`
        for (let d = 1; d < 4; d++) expect(cfg.tol[d], tag).toBeLessThanOrEqual(cfg.tol[d - 1])
        const shapes = allShapes(cfg)
        expect(shapes.length, tag).toBeGreaterThan(3)
        for (const d of DIFFS) {
          const wins = shapes.filter(p => isWin(cfg, p, d))
          expect(wins.length, `${tag} d${d}`).toBeGreaterThan(0)
          expect(wins.length / shapes.length, `${tag} d${d} win share`).toBeLessThanOrEqual(0.15)
        }
        for (const p of shapes) cfg.handles.forEach((h, i) => {
          const [x, y] = h.pos(p)
          expect(x >= 0 && x <= VW && y >= 0 && y <= VH, `${tag} ${JSON.stringify(p)}`).toBe(true)
          expect(applyDrag(cfg, p, i, x, y), `${tag} ${JSON.stringify(p)} handle ${i}`).toEqual(p)
        })
      }
    })

    it(`${id}: the whole sequence can be completed at every difficulty`, () => {
      for (const d of DIFFS) {
        const steps = stepsFor(id, d)
        for (const seed of SEEDS) {
          let carry: Params | undefined
          steps.forEach((cfg, si) => {
            const tag = `${id} d${d} seed ${seed} step ${si}`
            const start = stepStart(cfg, stepSeed(seed, si), carry)
            expect(isValid(cfg, start), tag).toBe(true)
            for (const tier of DIFFS) expect(isWin(cfg, start, tier), `${tag}: free win at d${tier}`).toBe(false)
            const wins = allShapes(cfg).filter(p => isWin(cfg, p, d))
            // Aim for the winning shape nearest the start, as a player would.
            const dist = (p: Params) => cfg.params.reduce((s, def) => s + Math.abs(p[def.key] - start[def.key]) / def.step, 0)
            const goal = wins.sort((a, b) => dist(a) - dist(b))[0]
            const reached = nudgeTo(cfg, start, goal)
            expect(isWin(cfg, reached, d), `${tag}: reached ${JSON.stringify(reached)} aiming at ${JSON.stringify(goal)}`).toBe(true)
            carry = reached
          })
        }
      }
    })
  }

  it('the UI walks through every step and wins', () => {
    let won = 0
    const steps = stepsFor('pythagorean', 4)
    render(createElement(GeometryGame, { configId: 'pythagorean', difficulty: 4, seed: 3, onWin: () => { won++ }, onLose: () => {} }))
    for (let si = 0; si < steps.length; si++) {
      const cfg = steps[si]
      const goal = allShapes(cfg).find(p => isWin(cfg, p, 4))!
      // Read the current values and press −/+ until they match the goal.
      for (const def of cfg.params) {
        for (let guard = 0; guard < 40; guard++) {
          const chips = screen.getAllByRole('button', { name: '+' })
          const g = cfg.given.findIndex(gv => gv.param === def.key)
          const text = chips[g].parentElement!.textContent!
          const cur = Number(text.replace(/[^0-9.\-]+/g, ' ').trim().split(/\s+/).pop())
          if (cur === goal[def.key]) break
          fireEvent.click(cur < goal[def.key] ? chips[g] : screen.getAllByRole('button', { name: '−' })[g])
        }
      }
      fireEvent.click(screen.getByRole('button', { name: si === steps.length - 1 ? 'Set in stone' : `Check step ${si + 1}` }))
      if (si < steps.length - 1) fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Next: `) }))
    }
    expect(screen.getByText(/Construction holds!/)).toBeTruthy()
    void won
  })
})
