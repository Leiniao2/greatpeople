import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import type { Difficulty } from '@/games/types'
import TelegraphNetGame, {
  CONFIGS, CONFIG_IDS, makeNet, mst, steiner, bestChain, complete, wireCost, budgetFor, fewestTowers, linked, sizeFor, secondsFor, type Link,
} from '@/components/minigames/TelegraphNetGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6]

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Telegraph Network — solvers', () => {
  const L = (id: string, u: number, v: number, cost: number): Link => ({ id, u, v, cost })
  it('Kruskal picks the cheapest tree', () => {
    const links = [L('a', 0, 1, 1), L('b', 1, 2, 2), L('c', 0, 2, 5), L('d', 2, 3, 1)]
    expect(mst(4, links, [true, true, true, true]).cost).toBe(4)
  })
  it('an optional relay is used only when it saves wire', () => {
    const links = [L('a', 0, 1, 10), L('b', 0, 2, 3), L('c', 1, 2, 3)]
    expect(steiner(3, links, [true, true, false]).cost).toBe(6)
    expect(steiner(3, [L('a', 0, 1, 5), ...links.slice(1)], [true, true, false]).cost).toBe(5)
  })
  it('the chain may not branch, so it can cost more than the tree', () => {
    // A star centred on 1: the tree is cheap, a single line is not.
    const links = [L('a', 0, 1, 1), L('b', 1, 2, 1), L('c', 1, 3, 1), L('d', 2, 3, 4)]
    expect(mst(4, links, [true, true, true, true]).cost).toBe(3)
    expect(bestChain(4, links, 0, 3).cost).toBe(6)
  })
})

describe('Telegraph Network — every level is winnable and sized', () => {
  it('every config × difficulty × seed has a verified optimum', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const s of SEEDS) {
      const net = makeNet(id, CONFIGS[id], d, s)
      const tag = `${id}@${d}#${s}`
      const { required, optional } = sizeFor(net.mode, d)
      expect(net.nodes.length, tag).toBe(required + optional)
      expect(net.nodes.length).toBeLessThanOrEqual(16)
      if (net.mode === 'semaphore') {
        const best = fewestTowers(net)
        expect(best.count).toBe(net.optimum)
        const active = net.nodes.map((_, i) => net.required[i] || (net.solution as number[]).includes(i))
        expect(linked(net.nodes.length, net.links, net.required, active), tag).toBe(true)
        expect(net.optimum).toBeLessThanOrEqual(budgetFor(net, d))
        continue
      }
      const sol = net.solution as string[]
      expect(complete(net, sol), tag).toBe(true)
      expect(wireCost(net, sol)).toBe(net.optimum)
      expect(net.optimum).toBeLessThanOrEqual(budgetFor(net, d))
      if (net.mode === 'mst') expect(mst(net.nodes.length, net.links, net.required).cost).toBe(net.optimum)
    }
  })
  it('timers stay within three minutes and levels vary with the seed', () => {
    for (const d of DIFFS) expect(secondsFor(d)).toBeLessThanOrEqual(180)
    for (const id of CONFIG_IDS) {
      const seen = new Set(SEEDS.map(s => JSON.stringify(makeNet(id, CONFIGS[id], 3, s).nodes)))
      expect(seen.size, id).toBe(SEEDS.length)
    }
  })
})

describe('Telegraph Network — component', () => {
  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const net = makeNet(id, CONFIGS[id], d, 2)
      const { container } = render(createElement(TelegraphNetGame, { configId: id, difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-node]').length).toBe(net.nodes.length)
      if (net.mode !== 'semaphore') expect(container.querySelectorAll('[data-link]').length).toBe(net.links.length)
      cleanup()
    }
  })

  it('building the optimum wins exactly once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of [1, 4] as Difficulty[]) {
      const net = makeNet(id, CONFIGS[id], d, 7)
      const onWin = vi.fn(), onLose = vi.fn()
      const { container } = render(createElement(TelegraphNetGame, { configId: id, difficulty: d, seed: 7, onWin, onLose }))
      for (const x of net.solution) {
        const sel = net.mode === 'semaphore' ? `[data-node="${x}"]` : `[data-link="${x}"]`
        fireEvent.click(container.querySelector(sel)!)
      }
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onWin, `${id}@${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('wasting every tower loses exactly once', () => {
    vi.useFakeTimers()
    const d: Difficulty = 3
    const net = makeNet('chappe', CONFIGS.chappe, d, 5)
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(TelegraphNetGame, { configId: 'chappe', difficulty: d, seed: 5, onWin, onLose }))
    // Build and abandon the same hill until the stone runs out.
    const hill = net.required.indexOf(false)
    for (let k = 0; k < 2 * budgetFor(net, d) + 2; k++) fireEvent.click(container.querySelector(`[data-node="${hill}"]`)!)
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('running out of time loses exactly once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(TelegraphNetGame, { configId: 'morse', difficulty: 4, seed: 1, onWin, onLose }))
    act(() => { vi.advanceTimersByTime((secondsFor(4) + 1) * 1000) })
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
