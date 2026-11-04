// Caravan Trail (Snake): each route plays its own rule (orders / dunes /
// spoil); sound maps, deterministic food, an autopilot that wins every
// config × difficulty × seed inside the time budget, and a component that
// wins/loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import SnakeGame, {
  CONFIG_IDS, CONFIGS, newGame, step, autopilot, autoplay, tickMs, groundOk, tierFor, type SnakeState, type Dir,
} from '@/components/minigames/SnakeGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42, 1006, 31337, 99991]

function play(configId: string, d: Difficulty, seed: number) {
  const { game, state, attempts } = newGame(configId, d, seed)
  const s: SnakeState = autoplay(game, state)
  return { game, s, attempts }
}

describe('snake engine', () => {
  it('moves, grows, refuses to reverse and crashes on edges and itself', () => {
    const { game, state } = newGame('silk-road', 1, 1)
    const head = state.body[0]
    const s1 = step(game, state, 'L') // reversing is ignored
    expect(s1.body[0]).toBe(head + 1)
    expect(s1.body.length).toBe(3)
    let s = state
    for (let i = 0; i < 20 && s.status === 'playing'; i++) s = step(game, s, 'R')
    expect(s.status).toBe('crashed')
    // A caravan of five turning tightly bites its own tail.
    const g2 = { ...game, blocked: Array(game.size * game.size).fill(false) }
    const n = game.size
    const loop: SnakeState = { ...state, blocked: g2.blocked, body: [2 * n + 2, 2 * n + 3, 3 * n + 3, 3 * n + 2, 3 * n + 1], dir: 'L', food: 0, decoy: -1 }
    expect(step(g2, loop, 'D').status).toBe('crashed')
  })

  it('food placement is deterministic from the seed', () => {
    const a = play('sahara', 3, 77), b = play('sahara', 3, 77)
    expect(a.s.body).toEqual(b.s.body)
    expect(a.s.eaten).toBe(b.s.eaten)
    expect(newGame('sahara', 3, 77).state.food).not.toBe(-1)
  })

  it('the pace quickens with every delivery but never below the floor', () => {
    const { game, state } = newGame('incense-route', 2, 5)
    expect(tickMs(game, state)).toBe(game.tier.startMs)
    expect(tickMs(game, { ...state, eaten: 100 })).toBe(game.tier.minMs)
    for (const d of DIFFS.slice(1)) expect(tierFor(CONFIGS['silk-road'], d).target).toBeGreaterThan(tierFor(CONFIGS['silk-road'], (d - 1) as Difficulty).target)
  })

  it('every route plays a different rule', () => {
    // The base routes each play a different rule; story-themed routes reuse one of them.
    const BASE = ['silk-road', 'sahara', 'incense-route']
    expect(new Set(BASE.map(id => CONFIGS[id].variant)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(b => CONFIGS[b].variant), id).toContain(CONFIGS[id].variant)
    for (const d of DIFFS) {
      expect(tierFor(CONFIGS['silk-road'], d).decoyPenalty).toBe(2)
      expect(tierFor(CONFIGS['silk-road'], d).duneEvery).toBe(0)
      expect(tierFor(CONFIGS.sahara, d).duneEvery).toBeGreaterThan(0)
      expect(tierFor(CONFIGS.sahara, d).freshSteps).toBe(0)
      expect(tierFor(CONFIGS['incense-route'], d).freshSteps).toBeGreaterThan(0)
      expect(tierFor(CONFIGS['incense-route'], d).decoyPenalty).toBe(0)
    }
  })

  it('orders: the wrong bale adds two camels that join over the next steps, and moves', () => {
    const { game, state } = newGame('silk-road', 1, 3)
    expect(state.decoy).toBeGreaterThanOrEqual(0)
    expect(state.decoy).not.toBe(state.food)
    const n = game.size
    const open = Array(n * n).fill(false)
    const g = { ...game, blocked: open }
    const head = 5 * n + 5
    const s0: SnakeState = { ...state, blocked: open, body: [head, head - 1, head - 2], dir: 'R', decoy: head + 1, food: 0 }
    const s1 = step(g, s0, 'R')
    expect(s1.status).toBe('playing')
    expect(s1.eaten).toBe(0)
    expect(s1.grow).toBe(2)
    expect(s1.decoy).not.toBe(head + 1)
    const s2 = step(g, s1, 'R'), s3 = step(g, s2, 'R'), s4 = step(g, s3, 'R')
    expect([s1, s2, s3, s4].map(x => x.body.length)).toEqual([3, 4, 5, 5])
  })

  it('spoil: a load not reached within its allowance ends the journey', () => {
    const { game, state } = newGame('incense-route', 1, 3)
    expect(state.fresh).toBe(game.tier.freshSteps)
    // Circle forever away from the goods.
    let s = state
    const ring: Dir[] = ['U', 'R', 'D', 'L']
    const n = game.size
    const open = { ...game, blocked: Array(n * n).fill(false) }
    s = { ...s, blocked: open.blocked, food: 0 }
    for (let k = 0; k < 200 && s.status === 'playing'; k++) s = step(open, s, ring[k % 4])
    expect(s.status).toBe('crashed')
    expect(s.crash).toMatch(/spoiled/)
    // A load is reset to full freshness when delivered, and is always laid within reach.
    const head = state.body[0]
    const near: SnakeState = { ...state, food: head + 1 }
    const after = step(game, near, 'R')
    expect(after.eaten).toBe(1)
    expect(after.fresh).toBe(game.tier.freshSteps)
  })

  it('time budget: targets, boards and a perfect run fit a short challenge', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const t = tierFor(CONFIGS[id], d)
      expect(t.size).toBeLessThanOrEqual(15)
      expect(t.target).toBeLessThanOrEqual(scale4(d, [10, 14, 18, 24]))
      expect(t.target).toBeGreaterThanOrEqual(10)
      for (const seed of SEEDS.slice(0, 3)) {
        const { game, state } = newGame(id, d, seed)
        let s = state, ms = 0, hungry = 0
        for (let k = 0; k < 6000 && s.status === 'playing'; k++) {
          ms += tickMs(game, s)
          const e = s.eaten
          s = step(game, s, autopilot(game, s, hungry))
          hungry = s.eaten > e ? 0 : hungry + 1
        }
        expect(s.status).toBe('won')
        // A perfect run: 10–35 s of game clock at D1, under 60 s at D4.
        expect(ms / 1000, `${id} d${d} ${seed}`).toBeLessThanOrEqual(d === 1 ? 35 : 60)
        expect(ms / 1000).toBeGreaterThanOrEqual(8)
      }
    }
  })

  for (const id of CONFIG_IDS) for (const d of DIFFS) {
    it(`${id} d${d}: sound maps and the autopilot delivers every load`, () => {
      const tries: number[] = []
      for (const seed of SEEDS) {
        const { game } = newGame(id, d, seed)
        expect(groundOk(game.size, game.blocked), `${seed}`).toBe(true)
        const { s, attempts } = play(id, d, seed)
        tries.push(attempts)
        // Usually the first map works; thinning is a rare fallback.
        if (attempts <= 6) expect(game.blocked.filter(Boolean).length, `${seed}`).toBeGreaterThanOrEqual(game.tier.obstacles - 1)
        expect(s.status, `${id} d${d} seed ${seed}: ${s.crash}`).toBe('won')
        expect(s.eaten).toBe(game.tier.target)
        expect(groundOk(game.size, s.blocked)).toBe(true)
        if (game.tier.duneEvery) expect(s.blocked.filter(Boolean).length).toBeGreaterThan(game.blocked.filter(Boolean).length)
      }
      expect(Math.max(...tries)).toBeLessThanOrEqual(12)
      expect(tries.filter(t => t === 1).length).toBeGreaterThanOrEqual(SEEDS.length / 2)
    })
  }
})

function scale4(d: Difficulty, v: [number, number, number, number]) { return v[d - 1] }

const KEY: Record<Dir, string> = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }

describe('SnakeGame component', () => {
  it('renders every config at every difficulty, idle until the first input', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(SnakeGame, { configId: id, difficulty: d, seed: 4, onWin: () => {}, onLose: () => {} }))
      act(() => { vi.advanceTimersByTime(5000) })
      expect(screen.getByTestId('snake-eaten').textContent).toMatch(/^0 \//)
      expect(screen.getByTestId('snake-rule').textContent).toBe(CONFIGS[id].rule)
      expect(!!screen.queryByTestId('snake-decoy')).toBe(CONFIGS[id].variant === 'orders')
      expect(!!screen.queryByTestId('snake-fresh')).toBe(CONFIGS[id].variant === 'spoil')
      cleanup()
    }
  })

  it('an autopilot-driven run calls onWin once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    const params = { target: 3 }
    const { game, state } = newGame('silk-road', 2, 9, params)
    render(createElement(SnakeGame, { configId: 'silk-road', difficulty: 2, seed: 9, params, onWin, onLose }))
    let s = state
    for (let i = 0; i < 400 && s.status === 'playing'; i++) {
      const d = autopilot(game, s)
      act(() => { fireEvent.keyDown(window, { key: KEY[d] }) })
      if (i === 0 && d === s.dir) act(() => { fireEvent.keyDown(window, { key: ' ' }) })
      act(() => { vi.advanceTimersByTime(tickMs(game, s)) })
      s = step(game, s, d)
    }
    expect(s.status).toBe('won')
    expect(screen.getByTestId('snake-eaten').textContent).toMatch(/^3 \/ 3/)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('driving straight into the edge calls onLose once, and unmounting stops the loop', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(SnakeGame, { configId: 'incense-route', difficulty: 1, seed: 2, onWin, onLose }))
    act(() => { fireEvent.keyDown(window, { key: 'ArrowUp' }) })
    for (let i = 0; i < 60; i++) act(() => { vi.advanceTimersByTime(300) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
    cleanup()
    const again = vi.fn()
    const { unmount } = render(createElement(SnakeGame, { configId: 'sahara', difficulty: 1, seed: 2, onWin: again, onLose: again }))
    act(() => { fireEvent.keyDown(window, { key: 'ArrowUp' }) })
    unmount()
    for (let i = 0; i < 60; i++) act(() => { vi.advanceTimersByTime(300) })
    expect(again).not.toHaveBeenCalled()
  })
})
