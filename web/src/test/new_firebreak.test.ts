// Firebreak: the fire-spread physics (wind, sparks, fuel, tools), every
// config × difficulty × seed is solver-verified, losable by doing nothing and
// beyond the naive plans at D3/D4, and the component settles exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import FirebreakGame, {
  CONFIGS, CONFIG_IDS, TIERS, generate, initialState, step, status, runIdle, solve, replay, illegal,
  frontGreedy, ringGreedy, minActsFor, type Level, type Kind, type Rules, type Action, type State,
} from '@/components/minigames/FirebreakGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5]

const BASE_RULES: Rules = CONFIGS['london-1666'].rules

/** Tiny map from rows of letters: T timber, S stone, . open, ~ water. */
function mini(map: string[], fires: number[], targets: number[], rules: Partial<Rules> = {}, tools: Level['tools'] = { hook: 5, powder: 2, bucket: 2 }): Level {
  const K: Record<string, Kind> = { T: 'timber', S: 'stone', '.': 'open', '~': 'water' }
  const r = { ...BASE_RULES, spot: 1, ...rules }
  return {
    rows: map.length, cols: map[0].length, kind: map.join('').split('').map(ch => K[ch]),
    targets, depots: [], fires, winds: [r.wind], tools, brigade: 0, deadline: 80, minActs: 0, rules: r,
  }
}
const wait = (lv: Level, s: State, n = 1) => { for (let k = 0; k < n; k++) s = step(lv, s, { t: 'wait' })!; return s }

describe('fire physics', () => {
  // 3×5 strip of timber, fire in the middle, wind blowing west (from the east).
  const map = ['TTTTT', 'TTTTT', 'TTTTT']
  it('spreads downwind at once, crosswind after a turn, never upwind in a strong wind', () => {
    const lv = mini(map, [7], [], { wind: { dr: 0, dc: -1 } })
    const s1 = wait(lv, initialState(lv))
    expect(s1.fire[6]).toBeGreaterThan(0) // downwind (west)
    expect(s1.fire[2]).toBe(0)            // crosswind: not yet
    expect(s1.fire[8]).toBe(0)            // upwind
    const s2 = wait(lv, s1)
    expect(s2.fire[2]).toBeGreaterThan(0)
    expect(s2.fire[12]).toBeGreaterThan(0)
    expect(s2.fire[8]).toBe(0)
    const end = runIdle(lv, s2).end
    expect(end.fire[9]).toBe(0) // the far east end never burns
  })

  it('a light wind lets a fire creep upwind after a turn (Rome)', () => {
    const lv = mini(map, [7], [], { wind: { dr: 0, dc: -1 }, upwind: true })
    const s1 = wait(lv, initialState(lv))
    expect(s1.fire[8]).toBe(0)
    expect(wait(lv, s1).fire[8]).toBeGreaterThan(0)
  })

  it('a burning house turns to ash after its burn time', () => {
    const lv = mini(['T.'], [0], [])
    const s = wait(lv, initialState(lv), 2)
    expect(s.fire[0]).toBe(-1)
    expect(status(lv, s).won).toBe(true)
  })

  it('sparks of strength 2 leap a one-cell gap but not a two-cell gap', () => {
    const one = mini(['TT.T'], [1], [3], { wind: { dr: 0, dc: 1 }, spot: 2 })
    expect(runIdle(one, initialState(one)).status.lost).toBeTruthy()
    const two = mini(['TT..T'], [1], [4], { wind: { dr: 0, dc: 1 }, spot: 2 })
    expect(runIdle(two, initialState(two)).status.won).toBe(true)
    const calm = mini(['TT.T'], [1], [3], { wind: { dr: 0, dc: 1 }, spot: 1 })
    expect(runIdle(calm, initialState(calm)).status.won).toBe(true)
  })

  it('stone needs two scorched turns; Chicago stone catches at once', () => {
    const lv = mini(['TS'], [0], [], { wind: { dr: 0, dc: 1 } })
    const s1 = wait(lv, initialState(lv))
    expect(s1.fire[1]).toBe(0)
    expect(wait(lv, s1).fire[1]).toBeGreaterThan(0)
    const chi = mini(['TS'], [0], [], { wind: { dr: 0, dc: 1 }, stoneResist: 1 })
    expect(wait(chi, initialState(chi)).fire[1]).toBeGreaterThan(0)
    // A single-turn fire is too brief to light stone that needs two scorches.
    const brief = mini(['TS'], [0], [], { wind: { dr: 0, dc: 1 }, timberBurn: 1 })
    expect(runIdle(brief, initialState(brief)).end.fire[1]).toBe(0)
  })

  it('hooks cannot work beside the fire; gunpowder can and clears a cross', () => {
    const lv = mini(['TTTTT', 'TTTTT', 'TTTTT'], [5], [9], { wind: { dr: 0, dc: 1 } })
    const s = initialState(lv)
    expect(illegal(lv, s, { t: 'hook', i: 6 })).toMatch(/hot/)
    expect(illegal(lv, s, { t: 'hook', i: 7 })).toBeNull()
    expect(illegal(lv, s, { t: 'hook', i: 9 })).toMatch(/building/)
    expect(illegal(lv, s, { t: 'powder', i: 8 })).toMatch(/marked/)
    const p = step(lv, s, { t: 'powder', i: 6 })!
    for (const j of [1, 7, 11]) expect(p.kind[j]).toBe('rubble')
    expect(p.tools.powder).toBe(1)
  })

  it('bucket chains reach only near water; a soaked house will not catch while wet', () => {
    const lv = mini(['TTTT~'], [0], [], { wind: { dr: 0, dc: 1 } })
    const s = initialState(lv)
    expect(illegal(lv, s, { t: 'bucket', i: 1 })).toMatch(/water/)
    const w = step(lv, s, { t: 'bucket', i: 2 })!
    expect(w.wet[2]).toBeGreaterThan(0)
    const later = wait(lv, w, 1)
    expect(later.fire[2]).toBe(0)
    // Dousing a burning house puts it out.
    const lv2 = mini(['TT~'], [1], [])
    const d = step(lv2, initialState(lv2), { t: 'bucket', i: 1 })!
    expect(d.fire[1]).toBe(-1)
  })

  it('the Edo brigade works only within its reach and moves to where it worked', () => {
    const lv = { ...mini(['TTTTTTTT'], [7], [], { brigadeReach: 2 }), brigade: 0 }
    const s = initialState(lv)
    expect(illegal(lv, s, { t: 'hook', i: 3 })).toMatch(/far/)
    const m = step(lv, s, { t: 'move', i: 2 })!
    expect(m.brigade).toBe(2)
    expect(illegal(lv, m, { t: 'hook', i: 3 })).toBeNull()
  })

  it('Moscow: torches light stores; the stores must all catch by the deadline', () => {
    const lv: Level = { ...mini(['TTTT.T'], [], [5], { offense: true, wind: { dr: 0, dc: 1 } }, { torch: 1, hook: 1 }), depots: [1, 3], deadline: 6 }
    expect(runIdle(lv, initialState(lv)).status.lost).toMatch(/Grande/)
    expect(illegal(lv, initialState(lv), { t: 'torch', i: 5 })).toMatch(/Kremlin/)
    expect(replay(lv, [{ t: 'torch', i: 0 }]).status.won).toBe(true)
    expect(replay({ ...lv, deadline: 2 }, [{ t: 'torch', i: 0 }]).status.lost).toBeTruthy()
  })

  it('the simulation is deterministic', () => {
    const a = generate(CONFIGS['rome-64'].rules, 3, 77), b = generate({ ...CONFIGS['rome-64'].rules }, 3, 77)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('firebreak levels', () => {
  for (const id of CONFIG_IDS) {
    it(`${id}: every difficulty × seed is winnable, losable and not trivial`, () => {
      const rules = CONFIGS[id].rules
      for (const d of DIFFS) {
        const looks = new Set<string>()
        for (const seed of SEEDS) {
          const lv = generate(rules, d, seed)
          const tag = `${id} d${d} s${seed}`
          const s0 = initialState(lv)
          const st0 = status(lv, s0)
          expect(st0.won || !!st0.lost, tag).toBe(false)
          expect(lv.rows, tag).toBe(TIERS[d - 1].rows)
          // Doing nothing loses.
          expect(runIdle(lv, s0).status.lost, tag).toBeTruthy()
          // A search finds a plan within the level's own tool budget.
          const sol = solve(lv, s0, TIERS[d - 1].maxActs)
          expect(sol, tag).not.toBeNull()
          const r = replay(lv, sol!.plan)
          expect(r.ok, tag).toBe(true)
          expect(r.status.won, tag).toBe(true)
          if (d >= 3) {
            expect(lv.minActs, tag).toBeGreaterThanOrEqual(minActsFor(rules, d))
            expect(frontGreedy(lv), `${tag} front greedy`).toBe(false)
            expect(ringGreedy(lv), `${tag} ring greedy`).toBe(false)
          }
          if (rules.offense) expect(lv.tools.torch!, tag).toBeLessThan(lv.depots.length)
          looks.add(lv.kind.join('') + lv.fires.join() + lv.targets.join())
        }
        expect(looks.size, `${id} d${d} varies by seed`).toBeGreaterThan(1)
      }
    })
  }
})

function click(a: Action) {
  if (a.t === 'wait') { act(() => { fireEvent.click(screen.getByTestId('fb-wait')) }); return }
  act(() => { fireEvent.click(screen.getByTestId(`fb-tool-${a.t}`)) })
  act(() => { fireEvent.click(screen.getByTestId(`fb-cell-${a.i}`)) })
}

describe('FirebreakGame component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(FirebreakGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('fb-turn').textContent).toContain('Turn 0')
      cleanup()
    }
  })

  for (const id of CONFIG_IDS) {
    it(`a solver-driven win calls onWin once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      const lv = generate(CONFIGS[id].rules, 2, 11)
      const sol = solve(lv, initialState(lv), TIERS[1].maxActs)!
      render(createElement(FirebreakGame, { configId: id, difficulty: 2, seed: 11, onWin, onLose }))
      for (const a of sol.plan) {
        if (!screen.queryByTestId('fb-wait')) break
        click(a)
      }
      if (screen.queryByTestId('fb-burnout')) act(() => { fireEvent.click(screen.getByTestId('fb-burnout')) })
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
    })
  }

  for (const id of ['london-1666', 'moscow-1812']) {
    it(`letting it burn calls onLose once (${id})`, () => {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(FirebreakGame, { configId: id, difficulty: 3, seed: 5, onWin, onLose }))
      act(() => { fireEvent.click(screen.getByTestId('fb-burnout')) })
      expect(screen.queryByTestId('fb-burnout')).toBeNull()
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onLose).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
    })
  }

  it('an illegal tap shows why and costs nothing', () => {
    const lv = generate(CONFIGS['london-1666'].rules, 1, 8)
    render(createElement(FirebreakGame, { configId: 'london-1666', difficulty: 1, seed: 8, onWin: () => {}, onLose: () => {} }))
    act(() => { fireEvent.click(screen.getByTestId(`fb-cell-${lv.targets[0]}`)) })
    expect(screen.getByTestId('fb-msg').textContent).not.toBe('')
    expect(screen.getByTestId('fb-turn').textContent).toContain('Turn 0')
  })
})
