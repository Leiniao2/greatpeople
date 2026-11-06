// Ping-Pong: the physics (bat angle, spin, out, scoring, serve rotation),
// that a careful player beats the computer at every theme × tier × seed, that
// standing still loses, that the computer gets stronger with the tier, and
// that the component plays, follows the pointer and keys, and reports once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import PingPongGame, { CONFIG_IDS } from '@/components/minigames/PingPongGame'
import {
  THEMES, TIERS, W, ME_Y, CPU_Y, FIXED_DT, makeMatch, initialState, step, serverAfter, matchWinner, crossing,
  landingFor, returnShot, playMatch, goodBot, lazyBot, humanBot, type Match, type State,
} from '@/components/minigames/pingpong/model'
import { buildTrack } from '@/games/arcade'
import type { GameKey } from '@/games/registry'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42]

/** A state with the ball in flight. */
function flying(m: Match, ball: State['ball'], extra: Partial<State> = {}): State {
  return { ...initialState(m), phase: 'play', timer: 0, ball, lastHit: ball.vy > 0 ? 'cpu' : 'me', ...extra }
}
function runUntil(m: Match, s: State, until: (s: State) => boolean, input = {}, seconds = 5): State {
  for (let t = 0; t < seconds && !until(s); t += FIXED_DT) s = step(m, s, FIXED_DT, input)
  return s
}

describe('ping-pong physics', () => {
  const m = makeMatch('london-1926', 2, 1)

  it('the ball flies straight without spin and bends with it', () => {
    const b = { x: 40, y: 40, vx: 5, vy: 50, a: 0 }
    expect(crossing(b, ME_Y).x).toBeCloseTo(40 + 5 * (ME_Y - 40) / 50)
    const curved = crossing({ ...b, a: 6 }, ME_Y)
    expect(curved.x).toBeGreaterThan(crossing(b, ME_Y).x)
    // The model's flight matches the prediction.
    const s = runUntil(m, flying(m, { ...b, a: 6 }, { me: curved.x }), x => x.ball.vy < 0)
    expect(s.stats.meHits).toBe(1)
  })

  it('where the ball meets the bat picks where the return lands', () => {
    expect(landingFor(m, 0)).toBe(W / 2)
    expect(landingFor(m, -1)).toBeLessThan(W / 2 - 40)
    expect(landingFor(m, 1)).toBeGreaterThan(W / 2 + 40)
    const speed = 100, t = (ME_Y - CPU_Y) / speed
    const shot = returnShot(m, 20, 0.5, 0, speed)
    expect(20 + shot.vx * t).toBeCloseTo(landingFor(m, 0.5))
    expect(shot.a).toBe(0)
    expect(returnShot(m, 20, 0, 200, speed).a).toBeGreaterThan(0)    // a moving bat spins the ball
    expect(returnShot(m, 20, 0, -200, speed).a).toBeLessThan(0)
  })

  it('a hit off the rim of your bat sends it to the far corner, a square one to the middle', () => {
    for (const off of [-0.8, 0, 0.8]) {
      const arrive = 30
      let s = flying(m, { x: arrive, y: ME_Y - 20, vx: 0, vy: 80, a: 0 }, { me: arrive - off * m.bat })
      s = runUntil(m, s, x => x.ball.vy < 0, { target: arrive - off * m.bat })
      expect(s.lastHit).toBe('me')
      expect(crossing(s.ball, CPU_Y).x).toBeCloseTo(landingFor(m, off), 0)
    }
  })

  it('a missed ball is the other side\'s point; a ball off the side is the hitter\'s fault', () => {
    let s = runUntil(m, flying(m, { x: 90, y: ME_Y - 20, vx: 0, vy: 80, a: 0 }, { me: 10 }), x => x.phase !== 'play', { target: 10 })
    expect(s.score).toEqual([0, 1])
    expect(s.lastPoint).toEqual({ to: 'cpu', why: 'miss' })
    s = runUntil(m, flying(m, { x: 95, y: 80, vx: 60, vy: -80, a: 0 }, { lastHit: 'me' }), x => x.phase !== 'play')
    expect(s.lastPoint).toEqual({ to: 'cpu', why: 'out' })
    s = runUntil(m, flying(m, { x: 5, y: 80, vx: -60, vy: 80, a: 0 }, { lastHit: 'cpu' }), x => x.phase !== 'play')
    expect(s.lastPoint).toEqual({ to: 'me', why: 'out' })
  })

  it('the ball gets faster every hit, up to a cap', () => {
    let s = flying(m, { x: 50, y: ME_Y - 10, vx: 0, vy: m.speed, a: 0 })
    const speeds: number[] = []
    for (let i = 0; i < 40 && s.phase === 'play'; i++) {
      s = runUntil(m, s, x => x.ball.vy < 0 || x.phase !== 'play', goodBot(m, s))
      speeds.push(Math.abs(s.ball.vy))
      s = runUntil(m, s, x => x.ball.vy > 0 || x.phase !== 'play')
    }
    expect(speeds[1]).toBeGreaterThan(speeds[0])
    expect(Math.max(...speeds)).toBeLessThanOrEqual(m.maxSpeed + 1e-9)
  })

  it('serve changes every two points, every point at deuce', () => {
    const mm = { ...makeMatch('sydney-2000', 4, 1), firstServer: 'me' as const }
    expect([0, 1, 2, 3, 4, 5].map(p => serverAfter(mm, p))).toEqual(['me', 'me', 'cpu', 'cpu', 'me', 'me'])
    expect([20, 21, 22, 23].map(p => serverAfter(mm, p))).toEqual(['me', 'cpu', 'me', 'cpu'])
    const d1 = { ...makeMatch('sydney-2000', 1, 1), firstServer: 'cpu' as const }
    expect([0, 1, 2, 3, 8].map(p => serverAfter(d1, p))).toEqual(['cpu', 'cpu', 'me', 'me', 'cpu'])
  })

  it('a match is won at the target, by two from the tier that says so', () => {
    const d4 = makeMatch('seoul-1988', 4, 1), d1 = makeMatch('seoul-1988', 1, 1)
    expect(matchWinner(d1, [5, 4])).toBe('me')
    expect(matchWinner(d4, [11, 10])).toBeNull()
    expect(matchWinner(d4, [12, 10])).toBe('me')
    expect(matchWinner(d4, [9, 11])).toBe('cpu')
    expect(TIERS[1].target).toBeLessThan(TIERS[4].target)
  })

  it('the same inputs replay the same match, whatever the frame size', () => {
    const mm = makeMatch('nagoya-1971', 3, 9)
    const a = playMatch(mm, goodBot, 60), b = playMatch(mm, goodBot, 60)
    expect(a.score).toEqual(b.score)
    let x = initialState(mm), y = initialState(mm)
    for (let i = 0; i < 600; i++) x = step(mm, x, 1 / 60, { target: 40 })
    for (let i = 0; i < 200; i++) y = step(mm, y, 1 / 20, { target: 40 })
    expect(y.ball.x).toBeCloseTo(x.ball.x, 6)
    expect(y.score).toEqual(x.score)
  })
})

describe('ping-pong matches', () => {
  it('a careful player beats the computer on every theme, tier and seed; standing still loses', () => {
    const bad: string[] = []
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const m = makeMatch(id, d, seed)
      const good = playMatch(m, goodBot)
      if (good.winner !== 'me') bad.push(`${id} D${d} s${seed} good ${good.score.join('-')}`)
      const lazy = playMatch(m, lazyBot)
      if (lazy.winner !== 'cpu') bad.push(`${id} D${d} s${seed} lazy ${lazy.score.join('-')}`)
    }
    expect(bad).toEqual([])
  })

  it('the computer is stronger on every higher tier against a player with human limits', () => {
    for (const id of CONFIG_IDS) {
      const share = DIFFS.map(d => {
        let mine = 0, all = 0
        for (const seed of SEEDS) {
          const s = playMatch(makeMatch(id, d, seed), humanBot(0.25, 6))
          mine += s.score[0]; all += s.score[0] + s.score[1]
        }
        return mine / all
      })
      expect(share[0], `${id} D1 ${share}`).toBeGreaterThan(0.6)
      expect(share[3], `${id} D4 ${share}`).toBeLessThan(share[0] - 0.15)
    }
  })

  it('a well-angled shot beats the computer even when it starts in the middle', () => {
    for (const d of DIFFS) {
      const m = makeMatch('nagoya-1971', d, 1)
      const speed = m.maxSpeed, t = (ME_Y - CPU_Y) / speed
      const reach = m.cpuSpeed * (t - m.reaction) + m.cpuBat
      expect(reach, `D${d}`).toBeLessThan(Math.abs(landingFor(m, 0.95) - W / 2))
    }
  })

  it('the tiers raise the ball speed and the computer\'s skill', () => {
    for (let d = 2; d <= 4; d++) {
      const a = TIERS[(d - 1) as Difficulty], b = TIERS[d as Difficulty]
      expect(b.speed).toBeGreaterThan(a.speed)
      expect(b.cpuSpeed).toBeGreaterThan(a.cpuSpeed)
      expect(b.reaction).toBeLessThan(a.reaction)
    }
  })

  it('every theme carries a title, blurb and fact; all 24 Arcade levels make a match', () => {
    for (const id of CONFIG_IDS) for (const k of ['title', 'blurb', 'fact'] as const) expect(THEMES[id][k].length, `${id}.${k}`).toBeGreaterThan(10)
    const track = buildTrack(('pingpong' as string) as GameKey, CONFIG_IDS)
    expect(track).toHaveLength(24)
    for (const l of track) {
      const m = makeMatch(l.configId, l.difficulty, l.seed)
      expect(m.theme).toBe(l.configId)
      expect(m.target).toBe(TIERS[l.difficulty].target)
    }
  })
})

describe('ping-pong component', () => {
  /** Stubs requestAnimationFrame so the test can run the rally clock by hand. */
  function frames() {
    let queue: FrameRequestCallback[] = [], now = 0
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.push(cb); return queue.length })
    vi.stubGlobal('cancelAnimationFrame', () => { queue = [] })
    return (n: number, ms = 50, each?: () => void) => {
      for (let i = 0; i < n; i++) {
        const q = queue; queue = []
        act(() => { for (const cb of q) cb(now) })
        now += ms
        each?.()
      }
    }
  }
  const svgOf = (c: HTMLElement) => c.querySelector('svg[aria-label="Ping-pong table"]') as SVGSVGElement
  function mountAt(svg: SVGSVGElement) {
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: W + 16, height: 172, right: W + 16, bottom: 172, x: 0, y: 0, toJSON: () => ({}) })
  }

  it('the bat follows the pointer and the arrow keys', () => {
    vi.useFakeTimers()
    const run = frames()
    const { container } = render(createElement(PingPongGame, { configId: 'london-1926', difficulty: 1, seed: 1, onWin: () => {}, onLose: () => {} }))
    const svg = svgOf(container); mountAt(svg)
    run(2)
    fireEvent.pointerMove(svg, { clientX: 8 + 20 })
    run(10)
    expect(Number(svg.getAttribute('data-me'))).toBeCloseTo(20, 0)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    run(5)
    expect(Number(svg.getAttribute('data-me'))).toBeGreaterThan(25)
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    const at = Number(svg.getAttribute('data-me'))
    run(5)
    expect(Number(svg.getAttribute('data-me'))).toBeCloseTo(at, 5)
  })

  it('standing still loses the match, reported once', () => {
    vi.useFakeTimers()
    const run = frames()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(PingPongGame, { configId: 'parlour-1890s', difficulty: 1, seed: 3, onWin, onLose }))
    run(1500)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })

  it('playing well wins the match, reported once', () => {
    vi.useFakeTimers()
    const run = frames()
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(PingPongGame, { configId: 'london-1926', difficulty: 1, seed: 2, onWin, onLose }))
    const svg = svgOf(container); mountAt(svg)
    const m = makeMatch('london-1926', 1, 2)
    // Read the table off the svg each frame and move the pointer like the careful bot.
    run(1500, 50, () => {
      const [x, y, vx, vy, a] = (svg.getAttribute('data-ball') ?? '').split(',').map(Number)
      const s: State = { ...initialState(m), phase: svg.getAttribute('data-phase') as State['phase'],
        ball: { x, y, vx, vy, a }, cpu: Number(svg.getAttribute('data-cpu')), me: Number(svg.getAttribute('data-me')) }
      const t = goodBot(m, s).target ?? W / 2
      fireEvent.pointerMove(svg, { clientX: t + 8 })
    })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })
})
