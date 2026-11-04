import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import KonigsbergGame, {
  CONFIGS, CONFIG_IDS, makeCity, eulerWalk, oddNodes, connected, solveFix, postmanRound, minMatching,
  nodesFor, bridgesFor, fixesFor, mistakesFor, secondsFor, type Edge, type City,
} from '@/components/minigames/KonigsbergGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]

afterEach(() => { cleanup(); vi.useRealTimers() })

const fixedEdges = (city: City) => {
  const plan = solveFix(city)!
  return [
    ...city.edges.filter(e => !plan.remove.includes(e.id)),
    ...plan.add.map(([u, v], k) => ({ id: `new${k}`, u, v, w: 1 })),
  ]
}

describe('Seven Bridges — graph logic', () => {
  it('Königsberg itself has no Euler walk; one extra bridge gives one', () => {
    // A = Kneiphof island, B/C = banks, D = east island: 7 bridges.
    const pairs: [number, number][] = [[0, 1], [0, 1], [0, 2], [0, 2], [0, 3], [1, 3], [2, 3]]
    const edges: Edge[] = pairs.map(([u, v], k) => ({ id: `b${k}`, u, v, w: 1 }))
    expect(oddNodes(4, edges)).toHaveLength(4)
    expect(eulerWalk(4, edges)).toBeNull()
    const walk = eulerWalk(4, [...edges, { id: 'x', u: 1, v: 2, w: 1 }])!
    expect(walk.edges).toHaveLength(8)
  })
  it('minimum matching pairs odd corners cheaply', () => {
    const d = [[0, 1, 9, 9], [1, 0, 9, 9], [9, 9, 0, 2], [9, 9, 2, 0]]
    expect(minMatching([0, 1, 2, 3], d).cost).toBe(3)
  })
})

describe('Seven Bridges — every level is winnable and sized for 1–3 minutes', () => {
  it('every config × difficulty × seed verifies', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const city = makeCity(id, CONFIGS[id], d, s)
      const n = city.nodes.length
      const tag = `${id}@${d}#${s}`
      expect(n, tag).toBe(nodesFor(d))
      expect(connected(n, city.edges), tag).toBe(true)
      if (city.mode === 'postman') {
        expect(city.edges.length).toBeLessThanOrEqual(13)
        const r = postmanRound(n, city.edges, city.start)
        expect(r.length).toBe(city.optimum)
        expect(r.nodes[0]).toBe(city.start)
        expect(r.nodes[r.nodes.length - 1]).toBe(city.start)
        expect(r.length).toBeGreaterThan(city.edges.reduce((a, e) => a + e.w, 0))
        continue
      }
      expect(city.edges.length, tag).toBeGreaterThanOrEqual(bridgesFor(d) - 1)
      expect(city.edges.length, tag).toBeLessThanOrEqual(bridgesFor(d) + 4)
      if (city.mode === 'fix') {
        expect(oddNodes(n, city.edges).length, tag).toBe(2 + 2 * fixesFor(d))
        expect(eulerWalk(n, city.edges)).toBeNull()
        const plan = solveFix(city)
        expect(plan, tag).not.toBeNull()
        expect(plan!.add.length + plan!.remove.length).toBe(city.fixes)
        expect(eulerWalk(n, fixedEdges(city)), tag).not.toBeNull()
      } else if (city.mode === 'circuit') {
        expect(oddNodes(n, city.edges)).toHaveLength(0)
        const w = eulerWalk(n, city.edges, city.start)!
        expect(w.nodes[w.nodes.length - 1]).toBe(city.start)
      } else {
        expect(oddNodes(n, city.edges)).toHaveLength(2)
        expect(eulerWalk(n, city.edges)).not.toBeNull()
      }
    }
  })
  it('timers stay within three minutes and levels vary with the seed', () => {
    for (const d of DIFFS) expect(secondsFor(d)).toBeLessThanOrEqual(180)
    const shapes = new Set(SEEDS.map(s => JSON.stringify(makeCity('venice', CONFIGS.venice, 2, s).edges.map(e => [e.u, e.v]))))
    expect(shapes.size).toBe(SEEDS.length)
  })
})

function play(container: HTMLElement, city: City) {
  const node = (i: number) => fireEvent.click(container.querySelector(`[data-node="${i}"]`)!)
  const edge = (id: string) => fireEvent.click(container.querySelector(`[data-edge="${id}"]`)!)
  const n = city.nodes.length
  if (city.mode === 'postman') {
    const { nodes } = postmanRound(n, city.edges, city.start)
    for (const v of nodes.slice(1)) node(v)
    return
  }
  let edges = city.edges
  if (city.mode === 'fix') {
    const plan = solveFix(city)!
    for (const id of plan.remove) edge(id)
    for (const [a, b] of plan.add) { node(a); node(b) }
    fireEvent.click(container.querySelector('[data-testid="walk"]')!)
    edges = fixedEdges(city)
  }
  const w = eulerWalk(n, edges, city.start >= 0 ? city.start : undefined)!
  if (city.start < 0) node(w.nodes[0])
  for (const id of w.edges) edge(id)
}

describe('Seven Bridges — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const city = makeCity(id, CONFIGS[id], d, 3)
      const { container } = render(createElement(KonigsbergGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-node]').length).toBe(city.nodes.length)
      expect(container.querySelectorAll('[data-edge]').length).toBe(city.edges.length)
      cleanup()
    }
  })

  it('the scripted solution wins exactly once in every mode', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 4] as Difficulty[]) {
      const city = makeCity(id, CONFIGS[id], d, 11)
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(KonigsbergGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      play(container, city)
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `${id}@${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('abandoning the walk too often loses exactly once', () => {
    vi.useFakeTimers()
    const d: Difficulty = 2
    const city = makeCity('venice', CONFIGS.venice, d, 4)
    const onWin = vi.fn(), onLose = vi.fn()
    const { container, getByTestId } = render(createElement(KonigsbergGame, { configId: 'venice', difficulty: d, seed: 4, onWin, onLose }))
    const first = city.edges.find(e => e.u === city.start || e.v === city.start)!
    for (let k = 0; k < mistakesFor(d) + 1; k++) {
      fireEvent.click(container.querySelector(`[data-edge="${first.id}"]`)!)
      fireEvent.click(getByTestId('restart'))
    }
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('running out of time loses exactly once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(KonigsbergGame, { configId: 'postman', difficulty: 1, seed: 2, onWin, onLose }))
    act(() => { vi.advanceTimersByTime((secondsFor(1) + 3) * 1000) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
