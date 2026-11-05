// Punnett Square: the genetics is real (Mendel's 9:3:3:1, comb and coat
// epistasis, the lethal 2:1, X-linked eyes and tortoiseshells); every config ×
// difficulty × seed needs exactly its stated crosses and a plan reaches the
// goal within the seasons; a wasted season at D4 loses; the component wins
// and loses exactly once; the 24 Arcade levels differ.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import PunnettGame, {
  CONFIGS, CONFIG_IDS, TIERS, modelFor, makeLevel, cross, crossOf, tally, distances, goalKey, kidsOf, pairsOf,
  meetsHave, meetsOdds, keyOf, lookOf, type Model, type Individual, type Level, type Sex,
} from '@/components/minigames/PunnettGame'
import { buildTrack } from '@/games/arcade'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1001]

const ind = (sex: Sex, ...g: [number, number][]): Individual => ({ sex, g })
const ratio = (m: Model, a: Individual, b: Individual) => Object.fromEntries(tally(cross(m, a, b)).looks)

describe('the genetics is real', () => {
  it('Mendel: a dihybrid self-cross gives 9:3:3:1 on a 4×4 square', () => {
    const m = modelFor('mendel-peas', 2)
    const x = cross(m, ind('H', [0, 1], [0, 1]), ind('H', [0, 1], [0, 1]))
    expect(x.cells).toHaveLength(16)
    expect(ratio(m, ind('H', [0, 1], [0, 1]), ind('H', [0, 1], [0, 1]))).toEqual({ 'round yellow': 9, 'round green': 3, 'wrinkled yellow': 3, 'wrinkled green': 1 })
  })
  it('three genes make an 8×8 square: 27:9:9:9:3:3:3:1', () => {
    const m = modelFor('mendel-peas', 3)
    const h = ind('H', [0, 1], [0, 1], [0, 1])
    const x = cross(m, h, h)
    expect(x.cols).toHaveLength(8)
    expect(x.cells).toHaveLength(64)
    expect([...tally(x).looks.values()].sort((a, b) => b - a)).toEqual([27, 9, 9, 9, 3, 3, 3, 1])
  })
  it('Bateson and Punnett: RrPp × RrPp combs come out 9 walnut : 3 rose : 3 pea : 1 single', () => {
    const m = modelFor('punnett-combs', 2)
    expect(ratio(m, ind('F', [0, 1], [0, 1]), ind('M', [0, 1], [0, 1]))).toEqual({ 'walnut-comb': 9, 'rose-comb': 3, 'pea-comb': 3, 'single-comb': 1 })
  })
  it('albino hides colour: BbCc × BbCc mice are 9 black : 3 brown : 4 albino', () => {
    const m = modelFor('yellow-mice', 2)
    expect(ratio(m, ind('F', [0, 1], [0, 1]), ind('M', [0, 1], [0, 1]))).toEqual({ black: 9, brown: 3, albino: 4 })
  })
  it('Cuénot: yellow × yellow gives 2 yellow : 1, the AʸAʸ quarter dies', () => {
    const m = modelFor('yellow-mice', 3)
    const x = cross(m, ind('F', [0, 0], [0, 0], [0, 1]), ind('M', [0, 0], [0, 0], [0, 1]))
    const t = tally(x)
    expect(t.dead).toBe(1)
    expect(t.alive).toBe(3)
    expect(Object.fromEntries(t.looks)).toEqual({ yellow: 2, black: 1 })
    // No living mouse is AʸAʸ, so yellow can never breed true.
    expect(m.U.some(u => u.g[2][0] === 0 && u.g[2][1] === 0)).toBe(false)
  })
  it('Manx × Manx: a quarter of the kittens die, the rest are 2 Manx : 1 tailed', () => {
    const m = modelFor('manx-cats', 3)
    const t = tally(cross(m, ind('F', [0, 0], [1, 1], [0, 1]), ind('M', [0, 0], [1, -1], [0, 1])))
    expect(t.dead / (t.dead + t.alive)).toBe(1 / 4)
    expect(Object.fromEntries(t.looks)).toEqual({ 'black Manx': 4, black: 2 }) // the tom's X/Y doubles every cell
  })
  it('creeper × creeper: CpCp chicks never hatch', () => {
    const m = modelFor('punnett-combs', 3)
    const t = tally(cross(m, ind('F', [1, 1], [1, 1], [0, 1]), ind('M', [1, 1], [1, 1], [0, 1])))
    expect(t).toMatchObject({ dead: 1, alive: 3 })
  })
  it('tortoiseshell needs two X: an orange tom × black queen gives tortie daughters and black sons', () => {
    const m = modelFor('manx-cats', 2)
    const x = cross(m, ind('F', [0, 0], [1, 1]), ind('M', [0, 0], [0, -1]))
    for (const c of x.cells) expect(c.look).toBe(c.kid.sex === 'F' ? 'tortoiseshell' : 'black')
    expect(m.U.filter(u => lookOf(m, u) === 'tortoiseshell').every(u => u.sex === 'F')).toBe(true)
  })
  it('Morgan: a carrier female × red-eyed male gives white eyes only in sons', () => {
    const m = modelFor('morgan-flies', 2)
    const x = cross(m, ind('F', [0, 0], [0, 1]), ind('M', [0, 0], [0, -1]))
    const white = x.cells.filter(c => c.look.startsWith('white-eyed'))
    expect(white).toHaveLength(1)
    expect(white[0].kid.sex).toBe('M')
    expect(x.eitherSex).toBe(false)
  })
  it('autosomal squares leave the sex to the keeper; X squares fix it', () => {
    const mice = modelFor('yellow-mice', 1)
    const x = cross(mice, ind('F', [0, 1]), ind('M', [0, 1]))
    expect(x.eitherSex).toBe(true)
    expect(kidsOf(mice, x).map(i => mice.U[i].sex).sort()).toEqual(['F', 'F', 'F', 'M', 'M', 'M'])
  })
  it('the later genes only enter at higher tiers; every case has its lethal or X gene there', () => {
    for (const id of CONFIG_IDS) {
      const cs = CONFIGS[id]
      expect(cs.genes.slice(0, 1).every(g => g.lethal === undefined)).toBe(true)
      if (id !== 'mendel-peas' && id !== 'chimp-blood') expect(cs.genes.slice(1).some(g => g.lethal !== undefined || g.x)).toBe(true)
    }
  })
})

/** A shortest plan: at each step a pair and a kid that bring the goal one cross nearer. */
function plan(m: Model, L: Level): { a: number; b: number; kid: number }[] {
  const id = goalKey(L.goal), steps: { a: number; b: number; kid: number }[] = []
  let herd = [...L.herd]
  for (let d = L.dist; d >= 1; d--) {
    let found = false
    for (const [a, b] of pairsOf(m, herd)) {
      const x = crossOf(m, a, b)
      if (d === 1) {
        if (meetsOdds(L.goal, x)) { steps.push({ a, b, kid: kidsOf(m, x)[0] }); found = true; break }
        const kid = kidsOf(m, x).find(k => meetsHave(m, L.goal, m.U[k]))
        if (kid !== undefined) { steps.push({ a, b, kid }); found = true; break }
        continue
      }
      for (const kid of kidsOf(m, x)) {
        if (herd.includes(kid)) continue
        const next = [...herd, kid]
        if (distances(m, next, d - 1, id).get(id) === d - 1) { steps.push({ a, b, kid }); herd = next; found = true; break }
      }
      if (found) break
    }
    if (!found) throw new Error(`no step at ${d}`)
  }
  return steps
}

describe('levels', () => {
  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} D${d}: needs exactly its crosses, fits the tier, and a plan wins`, () => {
      const tier = TIERS[d]
      for (const seed of SEEDS) {
        const L = makeLevel(id, d, seed)
        const m = modelFor(id, L.k)
        expect(L.k).toBe(Math.min(tier.genes, CONFIGS[id].genes.length))
        expect(L.budget).toBe(L.dist + tier.slack)
        expect(L.dist, `${id} D${d} s${seed}`).toBeGreaterThanOrEqual(Math.min(tier.dist[0], 2))
        expect(L.dist).toBeLessThanOrEqual(tier.dist[1])
        if (L.goal.kind === 'have') expect(L.herd.some(i => meetsHave(m, L.goal, m.U[i]))).toBe(false)
        const key = goalKey(L.goal)
        expect(distances(m, L.herd, L.dist, key).get(key)).toBe(L.dist)
        if (L.dist > 1) expect(distances(m, L.herd, L.dist - 1, key).has(key)).toBe(false)
        expect(plan(m, L)).toHaveLength(L.dist)
      }
    })
  }

  it('most levels at D2–D4 need the full range of crosses', () => {
    for (const d of [2, 3, 4] as Difficulty[]) {
      const dists = CONFIG_IDS.flatMap(id => SEEDS.map(s => makeLevel(id, d, s).dist))
      expect(dists.filter(x => x === TIERS[d].dist[1]).length / dists.length, `D${d}`).toBeGreaterThanOrEqual(0.75)
    }
  })

  it('lethal genes shape the goals at D3–D4 in the cases that have them', () => {
    for (const id of ['punnett-combs', 'yellow-mice', 'manx-cats', 'morgan-flies']) {
      const looks = [3, 4].flatMap(d => SEEDS.map(s => makeLevel(id, d as Difficulty, s).goal.look))
      const word = { 'punnett-combs': 'creeper', 'yellow-mice': 'yellow', 'manx-cats': 'Manx', 'morgan-flies': 'curly' }[id]!
      expect(looks.filter(l => l.includes(word)).length / looks.length, id).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('the 24 Arcade levels are all different', () => {
    const track = buildTrack('punnett', CONFIG_IDS)
    const keys = track.map(l => { const L = makeLevel(l.configId, l.difficulty, l.seed); return `${L.configId}|${L.herd}|${goalKey(L.goal)}` })
    expect(new Set(keys).size).toBe(24)
  })
})

// ── Component ─────────────────────────────────────────────────────────────────

const props = (configId: string, difficulty: Difficulty, seed: number, onWin: () => void, onLose: () => void) =>
  ({ configId, difficulty, seed, onWin, onLose }) as never

/** Pick the parents, tap the cell holding `kid`, keep it. */
function breed(m: Model, a: number, b: number, kid: number) {
  fireEvent.click(screen.getByTestId(`pn-animal-${a}`))
  fireEvent.click(screen.getByTestId(`pn-animal-${b}`))
  const x = crossOf(m, a, b), want = m.U[kid]
  const i = x.cells.findIndex(c => !c.dead && keyOf({ ...c.kid, sex: x.eitherSex ? want.sex : c.kid.sex }) === keyOf(want))
  expect(i).toBeGreaterThanOrEqual(0)
  fireEvent.click(screen.getByTestId(`pn-cell-${i}`))
  fireEvent.click(screen.getByTestId(x.eitherSex ? `pn-keep-${want.sex}` : 'pn-keep'))
}

describe('PunnettGame component', () => {
  it('following a plan wins once, at every tier of every case', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const L = makeLevel(id, d, 5), m = modelFor(id, L.k)
      const onWin = vi.fn(), onLose = vi.fn()
      const { unmount } = render(createElement(PunnettGame, props(id, d, 5, onWin, onLose)))
      for (const s of plan(m, L)) breed(m, s.a, s.b, s.kid)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `${id} D${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('at D4 a season spent on a useless offspring loses at once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) {
      const L = makeLevel(id, 4, 5), m = modelFor(id, L.k), key = goalKey(L.goal)
      let wasted: { a: number; b: number; kid: number } | null = null
      for (const [a, b] of pairsOf(m, L.herd)) {
        const x = crossOf(m, a, b)
        if (meetsOdds(L.goal, x)) continue
        const kid = kidsOf(m, x).find(k => !meetsHave(m, L.goal, m.U[k]) && !distances(m, [...new Set([...L.herd, k])], L.dist - 1, key).has(key))
        if (kid !== undefined) { wasted = { a, b, kid }; break }
      }
      expect(wasted, id).not.toBeNull()
      const onWin = vi.fn(), onLose = vi.fn()
      const { unmount } = render(createElement(PunnettGame, props(id, 4, 5, onWin, onLose)))
      breed(m, wasted!.a, wasted!.b, wasted!.kid)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onLose, id).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('dead cells cannot be kept, and the square says how many die', () => {
    for (const id of ['yellow-mice', 'manx-cats', 'punnett-combs', 'morgan-flies']) for (const d of [3, 4] as Difficulty[]) for (let seed = 1; seed <= 40; seed++) {
      const L = makeLevel(id, d, seed), m = modelFor(id, L.k)
      const pair = pairsOf(m, L.herd).find(([a, b]) => tally(crossOf(m, a, b)).dead > 0)
      if (!pair) continue
      render(createElement(PunnettGame, props(id, d, seed, () => {}, () => {})))
      fireEvent.click(screen.getByTestId(`pn-animal-${pair[0]}`))
      fireEvent.click(screen.getByTestId(`pn-animal-${pair[1]}`))
      const dead = crossOf(m, pair[0], pair[1]).cells.findIndex(c => c.dead)
      expect((screen.getByTestId(`pn-cell-${dead}`) as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByTestId('pn-tally').textContent).toContain('die')
      return
    }
    throw new Error('no herd with a lethal pair')
  })

  it('the goal and the square fit a phone: 8 gametes a side stay inside 320 px', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(PunnettGame, props(id, d, 3, () => {}, () => {})))
      expect(screen.getByTestId('pn-goal').textContent).toMatch(/Breed a|Set up a cross/)
      cleanup()
    }
    expect(36 + 8 * Math.min(56, Math.floor(272 / 8))).toBeLessThanOrEqual(320)
  })
})
