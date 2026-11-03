// Caravan Trail (Snake): sound maps, deterministic food, an autopilot that
// wins every config × difficulty × seed, and a component that wins/loses once.
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
    const loop: SnakeState = { ...state, blocked: g2.blocked, body: [2 * n + 2, 2 * n + 3, 3 * n + 3, 3 * n + 2, 3 * n + 1], dir: 'L', food: 0 }
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

const KEY: Record<Dir, string> = { U: 'ArrowUp', D: 'ArrowDown', L: 'ArrowLeft', R: 'ArrowRight' }

describe('SnakeGame component', () => {
  it('renders every config at every difficulty, idle until the first input', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      render(createElement(SnakeGame, { configId: id, difficulty: d, seed: 4, onWin: () => {}, onLose: () => {} }))
      act(() => { vi.advanceTimersByTime(5000) })
      expect(screen.getByTestId('snake-eaten').textContent).toMatch(/^0 \//)
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
