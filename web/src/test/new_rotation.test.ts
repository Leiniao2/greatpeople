// Crop Rotation: the harvest rules, the exact solver (checked against brute
// force), every config × difficulty × seed winnable by the solver's plan
// within the 1–3 minute size budget, and the component wins / loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import RotationGame, {
  CONFIGS, CONFIG_IDS, FIELDS, SEASONS, generate, harvest, seasonValid, replayPlan, solveFrontier, bestWith,
  planBySeason, stillReachable, type Instance,
} from '@/components/minigames/RotationGame'
import { mulberry32, hashString } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006]

function solverPlan(id: string, inst: Instance): number[][] {
  const fr = solveFrontier(CONFIGS[id], inst, 0, inst.fields)
  return planBySeason(bestWith(fr, inst.secTarget).plan!)
}

describe('rotation rules', () => {
  it('drains and restores soil, clamps 0..4, and applies each repeat rule', () => {
    const tf = CONFIGS['three-field']
    expect(harvest(tf, { n: 3, prev: null }, 0, 0)).toMatchObject({ primary: 3, next: { n: 1, prev: 0 } })
    expect(harvest(tf, { n: 3, prev: 0 }, 0, 0).primary).toBe(2) // wheat after wheat
    expect(harvest(tf, { n: 3, prev: 1 }, 0, 0).primary).toBe(3) // oats then wheat is fine
    expect(harvest(tf, { n: 4, prev: null }, 2, 0).next.n).toBe(4)
    expect(harvest(tf, { n: 0, prev: null }, 0, 0).next.n).toBe(0)
    expect(harvest(tf, { n: 2, prev: null }, 0, 1).primary).toBe(4) // bumper
    expect(harvest(tf, { n: 2, prev: null }, 2, -1).primary).toBe(0) // weather never touches non-yielders
    const nf = CONFIGS.norfolk
    expect(harvest(nf, { n: 3, prev: 1 }, 0, 0).primary).toBe(3) // grain after grain −1
    expect(harvest(nf, { n: 3, prev: 2 }, 0, 0).primary).toBe(4)
    const rf = CONFIGS['rice-fish']
    expect(harvest(rf, { n: 2, prev: null }, 1, 0).sec).toBe(0) // fry
    expect(harvest(rf, { n: 2, prev: 1 }, 1, 0).sec).toBe(2) // catch
    expect(harvest(rf, { n: 2, prev: 0 }, 0, 0).primary).toBe(3) // no repeat penalty in paddies
  })

  it('enforces each season quota', () => {
    const inst = generate('three-field', 1, 1)
    const tf = CONFIGS['three-field']
    expect(seasonValid(tf, inst, [0, 0, 0])).toBe(false)
    expect(seasonValid(tf, inst, [0, 0, 3])).toBe(true)
    expect(seasonValid(tf, inst, [0, null, 3])).toBe(false)
    const ch = generate('chinampa', 4, 1)
    expect(seasonValid(CONFIGS.chinampa, ch, [3, 3, 0, 0, 0])).toBe(false)
    expect(seasonValid(CONFIGS.chinampa, ch, [3, 2, 0, 0, 1])).toBe(true)
    const rf = generate('rice-fish', 4, 1) // 5 fields → 3 flooded
    expect(seasonValid(CONFIGS['rice-fish'], rf, [0, 1, 0, 2, 3])).toBe(true)
    expect(seasonValid(CONFIGS['rice-fish'], rf, [0, 1, 0, 1, 3])).toBe(false)
  })

  it('the DP solver matches brute force on small farms', () => {
    for (const id of CONFIG_IDS) for (const seed of [5, 9]) {
      const cfg = CONFIGS[id]
      const inst = generate(id, 1, seed)
      const fr = solveFrontier(cfg, inst, 0, inst.fields)
      const brute: number[] = []
      const F = inst.fields.length, S = inst.seasons, C = cfg.crops.length
      for (let m = 0; m < C ** (F * S); m++) {
        const seasons = Array.from({ length: S }, (_, s) => Array.from({ length: F }, (_, f) => Math.floor(m / C ** (s * F + f)) % C))
        if (!seasons.every(row => seasonValid(cfg, inst, row))) continue
        const p = replayPlan(cfg, inst, seasons)
        brute[p.sec] = Math.max(brute[p.sec] ?? -1, p.primary)
      }
      for (let s = 0; s < Math.max(brute.length, fr.best.length); s++) expect(fr.best[s] ?? -1).toBe(brute[s] ?? -1)
    }
  }, 60000)
})

describe('rotation instances', () => {
  it('every config × difficulty × seed is winnable, sized for 1–3 minutes, and not won at random', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const cfg = CONFIGS[id]
      const inst = generate(id, d, seed)
      expect(inst.fields.length).toBe(FIELDS[d - 1])
      expect(inst.seasons).toBe(SEASONS[d - 1])
      expect(inst.fields.length * inst.seasons).toBeLessThanOrEqual(20)
      expect(inst.target).toBeGreaterThan(0)
      expect(inst.target).toBeLessThanOrEqual(inst.optimum)
      if (cfg.secondaryLabel) expect(inst.secTarget).toBeGreaterThan(0)
      else expect(inst.secTarget).toBe(0)
      const plan = solverPlan(id, inst)
      expect(plan.length).toBe(inst.seasons)
      for (const row of plan) expect(seasonValid(cfg, inst, row)).toBe(true)
      const p = replayPlan(cfg, inst, plan)
      expect(p.primary).toBe(inst.optimum)
      expect(p.sec).toBeGreaterThanOrEqual(inst.secTarget)
      // After every solver season the target is still reachable.
      for (let k = 1; k <= plan.length; k++) expect(stillReachable(cfg, inst, k, replayPlan(cfg, inst, plan.slice(0, k)))).toBe(true)
      // Random legal plans almost never succeed: the choices matter.
      const rng = mulberry32(hashString(`${id}:${d}:${seed}`))
      let wins = 0
      for (let k = 0; k < 60; k++) {
        const seasons = Array.from({ length: inst.seasons }, () => {
          let row: number[]
          do { row = inst.fields.map(() => Math.floor(rng() * cfg.crops.length)) } while (!seasonValid(cfg, inst, row))
          return row
        })
        const r = replayPlan(cfg, inst, seasons)
        if (r.primary >= inst.target && r.sec >= inst.secTarget) wins++
      }
      expect(wins).toBeLessThan(12)
    }
  }, 60000)

  it('a 24-level ladder rarely repeats a farm', () => {
    for (const id of CONFIG_IDS) {
      const seen = new Set<string>()
      for (let i = 0; i < 24; i++) {
        const inst = generate(id, (Math.floor(i / 6) + 1) as Difficulty, hashString(`arcade:rotation:${i}`))
        seen.add(JSON.stringify([inst.fields, inst.weather, inst.target, inst.secTarget]))
      }
      expect(seen.size).toBe(24)
    }
  })

  it('params override title and intro', () => {
    render(createElement(RotationGame, { configId: 'norfolk', difficulty: 1, seed: 1, params: { title: 'Raynham Hall', intro: 'Custom intro' }, onWin: () => {}, onLose: () => {} }))
    expect(screen.getByText('Raynham Hall')).toBeTruthy()
    expect(screen.getByText('Custom intro')).toBeTruthy()
  })
})

function playSeasons(seasons: number[][]) {
  for (const row of seasons) {
    if (!screen.queryByTestId('rot-commit')) return // already settled
    row.forEach((c, f) => {
      act(() => { fireEvent.click(screen.getByTestId(`rot-crop-${c}`)) })
      act(() => { fireEvent.click(screen.getByTestId(`rot-cell-${f}`)) })
    })
    act(() => { fireEvent.click(screen.getByTestId('rot-commit')) })
  }
}

describe('RotationGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(RotationGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('rot-primary')).toBeTruthy()
      expect(screen.getAllByTestId(/^rot-cell-/).length).toBe(FIELDS[d - 1])
      cleanup()
    }
  })

  it('playing the solver plan calls onWin once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const inst = generate(id, 4, 11)
      render(createElement(RotationGame, { configId: id, difficulty: 4, seed: 11, onWin, onLose }))
      playSeasons(solverPlan(id, inst))
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('an illegal season cannot be brought in, and a barren plan calls onLose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const id = 'three-field'
    const inst = generate(id, 2, 5)
    render(createElement(RotationGame, { configId: id, difficulty: 2, seed: 5, onWin, onLose }))
    // All wheat breaks the fallow rule: the button stays disabled.
    playSeasons([inst.fields.map(() => 0)])
    expect(screen.getByTestId('rot-season').textContent).toContain('1 of')
    // Re-tapping the same crop clears a field; start over with all fallow.
    inst.fields.forEach((_, f) => { act(() => { fireEvent.click(screen.getByTestId(`rot-cell-${f}`)) }) })
    playSeasons(Array.from({ length: inst.seasons }, () => inst.fields.map(() => 3)))
    // Lost as soon as the target is out of reach, not only at the last season.
    expect(screen.queryByTestId('rot-commit')).toBeNull()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
