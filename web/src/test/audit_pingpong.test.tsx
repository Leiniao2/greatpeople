// Ping-Pong: the physics (bounce, power, spin, faults, scoring, serve
// rotation), that a careful player beats the computer at every theme × tier
// × seed, that standing still loses, that the computer gets stronger with the
// tier, and that the component plays, follows the pointer and keys anywhere
// in your half, marks the bounce and reports once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import PingPongGame, { CONFIG_IDS, describeShot } from '@/components/minigames/PingPongGame'
import {
  THEMES, TIERS, W, L, NET, ZONE, POWER_FULL, FIXED_DT, makeMatch, initialState, step, serverAfter, matchWinner,
  launch, afterBounce, predictPath, swingShot, fault, playMatch, goodBot, lazyBot, humanBot,
  type Ball, type Match, type State,
} from '@/components/minigames/pingpong/model'
import { buildTrack } from '@/games/arcade'
import type { GameKey } from '@/games/registry'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 7, 42]

/** A state with `ball` in flight from `by`. */
function flying(m: Match, ball: Ball, by: 'me' | 'cpu', extra: Partial<State> = {}): State {
  return { ...initialState(m), phase: 'play', timer: 0, ball, lastHit: by, cpuGoal: null, ...extra }
}
function runUntil(m: Match, s: State, until: (s: State) => boolean, input = {}, seconds = 5): State {
  for (let t = 0; t < seconds && !until(s); t += FIXED_DT) s = step(m, s, FIXED_DT, input)
  return s
}
const still = { x: 0, y: 0 }
const flat = { top: 0, side: 0 }

describe('ping-pong physics', () => {
  const m = makeMatch('london-1926', 2, 1)

  it('a shot comes down where it was aimed, sidespin and all, and the path predicts it', () => {
    for (const side of [0, 0.8, -0.8]) {
      const b = launch({ x: 30, y: 20 }, { x: 60, y: 120 }, 90, 0, side)
      const path = predictPath(b)
      const first = path.find(p => p.bounced)!
      expect(first.x).toBeCloseTo(60, 6)
      expect(first.y).toBeCloseTo(120, 6)
      expect(first.t).toBeCloseTo(b.T, 6)
    }
    // Sidespin bends the flight: halfway along it is off the straight line.
    const curved = launch({ x: 50, y: 20 }, { x: 50, y: 120 }, 90, 0, 1)
    const mid = predictPath(curved).find(p => p.t >= curved.T / 2)!
    expect(mid.x).toBeLessThan(50 - 2)
  })

  it('the bounce: topspin kicks on, backspin dies, sidespin kicks sideways', () => {
    const base = launch({ x: 50, y: 20 }, { x: 50, y: 120 }, 90, 0, 0)
    const plain = afterBounce({ ...base, t: base.T })
    const top = afterBounce({ ...base, top: 0.9, t: base.T })
    const back = afterBounce({ ...base, top: -0.9, t: base.T })
    expect(top.vy).toBeGreaterThan(plain.vy)
    expect(back.vy).toBeLessThan(plain.vy)
    expect(back.drag).toBeGreaterThan(0)
    expect(afterBounce({ ...base, side: 0.8, t: base.T }).vx).toBeGreaterThan(plain.vx)
    // Where it goes after the bounce: backspin stays near the bounce.
    const reach = (b: Ball) => { const p = predictPath(b); return p[p.length - 1].y - 120 }
    expect(reach({ ...base, top: -0.9 })).toBeLessThan(reach(base))
    expect(reach({ ...base, top: 0.9 })).toBeGreaterThan(reach(base))
  })

  it('power sets the depth: a block lands short, a drive deep, a smash deeper, too much flies long', () => {
    const at = { x: 50, y: L }
    const depth = (fwd: number) => NET - swingShot(m, at, 0, { x: 0, y: -fwd }, flat, 1).ball.land.y
    const block = depth(0), drive = depth(0.6 * POWER_FULL), smash = depth(1.1 * POWER_FULL), wild = depth(1.6 * POWER_FULL)
    expect(block).toBeLessThan(drive)
    expect(drive).toBeLessThan(smash)
    expect(smash).toBeLessThanOrEqual(NET)
    expect(fault('me', { x: 50, y: NET - wild })).toBe('long')
    const kinds = [0, 0.6, 1.1].map(p => swingShot(m, at, 0, { x: 0, y: -p * POWER_FULL }, flat, 1).shot.kind)
    expect(kinds).toEqual(['block', 'drive', 'smash'])
    // Harder is faster.
    const v = (p: number) => { const b = swingShot(m, at, 0, { x: 0, y: -p * POWER_FULL }, flat, 1).ball; return Math.hypot(b.vx, b.vy) }
    expect(v(1.1)).toBeGreaterThan(v(0.6))
    expect(v(0.6)).toBeGreaterThan(v(0))
  })

  it('the swing sets the spin; incoming spin comes off the bat', () => {
    const at = { x: 50, y: L }
    const shot = (v: { x: number; y: number }, inc = flat) => swingShot(m, at, 0, v, inc, 1)
    expect(shot({ x: 0, y: -100 }).shot.top).toBeGreaterThan(0.2)
    const chop = shot({ x: 0, y: 80 })
    expect(chop.shot.kind).toBe('chop')
    expect(chop.shot.top).toBeLessThan(-0.2)
    expect(shot({ x: 120, y: -60 }).shot.side).toBeGreaterThan(0.5)
    expect(shot({ x: -120, y: -60 }).shot.side).toBeLessThan(-0.5)
    // A block against heavy backspin drops into the net; swinging harder lifts it over.
    expect(shot(still, { top: -1, side: 0 }).ball.land.y).toBe(NET)
    expect(fault('me', shot(still, { top: -1, side: 0 }).ball.land)).toBe('net')
    expect(fault('me', shot({ x: 0, y: -0.5 * POWER_FULL }, { top: -1, side: 0 }).ball.land)).toBeNull()
    // Topspin flies longer off the bat.
    expect(shot(still, { top: 1, side: 0 }).ball.land.y).toBeLessThan(shot(still).ball.land.y)
  })

  it('where the ball meets the bat picks the line', () => {
    const at = { x: 50, y: L }
    const x = (off: number) => swingShot(m, at, off, { x: 0, y: -90 }, flat, 1).ball.land.x
    expect(x(0)).toBeCloseTo(W / 2)
    expect(x(-1)).toBeLessThan(W / 2 - 40)
    expect(x(1)).toBeGreaterThan(W / 2 + 40)
  })

  it('you can only hit it after the bounce, from anywhere in your half, even off the table', () => {
    // A ball coming down at (20, 130) and running on off the left side of the table.
    const b = launch({ x: 60, y: 20 }, { x: 20, y: 130 }, 90, 0, 0)
    const after = predictPath(b).find(p => p.bounced && p.x < 0)!
    expect(after).toBeTruthy()
    const bat = { x: after.x, y: after.y }
    let s = flying(m, b, 'cpu', { me: bat })
    s = runUntil(m, s, x => x.lastHit === 'me' || x.phase !== 'play', { target: bat })
    expect(s.lastHit).toBe('me')
    expect(s.stats.meHits).toBe(1)
    expect(bat.x).toBeLessThan(0)
    // A bat in the way before the bounce does not touch it.
    const early = predictPath(b).find(p => !p.bounced && p.y > ZONE.me.y0 + 5)!
    s = flying(m, b, 'cpu', { me: { x: early.x, y: early.y } })
    s = runUntil(m, s, x => x.ball.bounced || x.phase !== 'play', { target: { x: early.x, y: early.y } })
    expect(s.stats.meHits).toBe(0)
  })

  it('the bat stays in your half: never past the net', () => {
    let s = initialState(m)
    s = runUntil(m, s, () => false, { target: { x: 50, y: 10 } }, 1)
    expect(s.me.y).toBeGreaterThanOrEqual(ZONE.me.y0)
    s = runUntil(m, s, () => false, { target: { x: -80, y: 400 } }, 1)
    expect(s.me).toEqual({ x: ZONE.me.x0, y: ZONE.me.y1 })
  })

  it('faults: off the far half is the hitter\'s; an unreturned ball is the hitter\'s point; the bounce is marked', () => {
    let s = runUntil(m, flying(m, launch({ x: 50, y: L }, { x: 50, y: -10 }, 90, 0, 0), 'me'), x => x.phase !== 'play')
    expect(s.lastPoint).toEqual({ to: 'cpu', why: 'long' })
    expect(s.bounce?.ok).toBe(false)
    s = runUntil(m, flying(m, launch({ x: 50, y: L }, { x: 110, y: 40 }, 90, 0, 0), 'me'), x => x.phase !== 'play')
    expect(s.lastPoint).toEqual({ to: 'cpu', why: 'wide' })
    s = runUntil(m, flying(m, launch({ x: 50, y: 0 }, { x: 50, y: NET }, 90, 0, 0), 'cpu'), x => x.phase !== 'play')
    expect(s.lastPoint).toEqual({ to: 'me', why: 'net' })
    // A good ball you don't reach.
    s = runUntil(m, flying(m, launch({ x: 50, y: 0 }, { x: 80, y: 130 }, 90, 0, 0), 'cpu'), x => x.phase !== 'play', { target: { x: -20, y: L + 20 } })
    expect(s.lastPoint).toEqual({ to: 'cpu', why: 'miss' })
    expect(s.bounce).toMatchObject({ x: 80, y: 130, ok: true })
  })

  it('the rally gets faster every hit, up to a cap', () => {
    const mm = makeMatch('nagoya-1971', 2, 3)
    let s = initialState(mm)
    const bot = goodBot()
    const paces: number[] = []
    for (let t = 0; t < 120 && s.phase !== 'over'; t += 1 / 60) {
      s = step(mm, s, 1 / 60, bot(mm, s))
      if (paces[paces.length - 1] !== s.pace) paces.push(s.pace)
    }
    expect(Math.max(...paces)).toBeGreaterThan(1.2)
    expect(Math.max(...paces)).toBeLessThanOrEqual(1.7 + 1e-9)
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
    const a = playMatch(mm, goodBot(), 60), b = playMatch(mm, goodBot(), 60)
    expect(a.score).toEqual(b.score)
    let x = initialState(mm), y = initialState(mm)
    for (let i = 0; i < 600; i++) x = step(mm, x, 1 / 60, { target: { x: 40, y: L + 5 } })
    for (let i = 0; i < 200; i++) y = step(mm, y, 1 / 20, { target: { x: 40, y: L + 5 } })
    expect(y.ball.x).toBeCloseTo(x.ball.x, 6)
    expect(y.score).toEqual(x.score)
  })

  it('shots read out as the player sees them', () => {
    expect(describeShot({ kind: 'drive', power: 0.64, top: 0.6, side: 0 })).toBe('Drive · 64% · topspin')
    expect(describeShot({ kind: 'chop', power: 0, top: -0.8, side: -0.5 })).toBe('Chop · heavy backspin · curves ←')
  })
})

describe('ping-pong matches', () => {
  it('a careful player beats the computer on every theme, tier and seed; standing still loses', () => {
    const bad: string[] = []
    for (const id of CONFIG_IDS) for (const d of DIFFS) for (const seed of SEEDS) {
      const m = makeMatch(id, d, seed)
      const good = playMatch(m, goodBot())
      if (good.winner !== 'me') bad.push(`${id} D${d} s${seed} good ${good.score.join('-')}`)
      const lazy = playMatch(m, lazyBot())
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
  // One screen pixel per table unit: the viewBox starts at (−36, −38).
  const X0 = -36, Y0 = -38
  function mountAt(svg: SVGSVGElement) {
    const w = W - 2 * X0, h = L - 2 * Y0
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) })
  }
  const pointer = (svg: SVGSVGElement, p: { x: number; y: number }) => fireEvent.pointerMove(svg, { clientX: p.x - X0, clientY: p.y - Y0 })
  const batOf = (svg: SVGSVGElement) => (svg.getAttribute('data-me') ?? '').split(',').map(Number)

  it('the bat follows the pointer anywhere in your half, and the arrow keys', () => {
    vi.useFakeTimers()
    const run = frames()
    const { container } = render(createElement(PingPongGame, { configId: 'london-1926', difficulty: 1, seed: 1, onWin: () => {}, onLose: () => {} }))
    const svg = svgOf(container); mountAt(svg)
    run(2)
    pointer(svg, { x: -20, y: L + 20 })     // off the table, to the left and behind
    run(10)
    const [x, y] = batOf(svg)
    expect(x).toBeCloseTo(-20, 0)
    expect(y).toBeCloseTo(L + 20, 0)
    pointer(svg, { x: 70, y: NET + 20 })    // over the table, near the net
    run(10)
    expect(batOf(svg)[1]).toBeCloseTo(NET + 20, 0)
    fireEvent.keyDown(window, { key: 'ArrowUp' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    run(3)
    const [kx, ky] = batOf(svg)
    expect(kx).toBeGreaterThan(75)
    expect(ky).toBeLessThan(NET + 15)
    fireEvent.keyUp(window, { key: 'ArrowUp' })
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    const at = batOf(svg)
    run(5)
    expect(batOf(svg)).toEqual(at)
  })

  it('standing still loses the match, reported once, and every bounce is marked', () => {
    vi.useFakeTimers()
    const run = frames()
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(PingPongGame, { configId: 'parlour-1890s', difficulty: 1, seed: 3, onWin, onLose }))
    let marked = 0, landing = 0
    run(1500, 50, () => {
      if (container.querySelector('[data-testid="bounce"]')) marked++
      if (container.querySelector('[data-testid="landing"]')) landing++
    })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
    expect(marked).toBeGreaterThan(0)
    expect(landing).toBeGreaterThan(0)
  })

  it('playing well wins the match, reported once, and the shots read out', () => {
    vi.useFakeTimers()
    const run = frames()
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(PingPongGame, { configId: 'london-1926', difficulty: 1, seed: 2, onWin, onLose }))
    const svg = svgOf(container); mountAt(svg)
    const m = makeMatch('london-1926', 1, 2)
    const bot = goodBot(0.05)
    // Read the table off the svg each frame and move the pointer like the careful bot.
    run(1500, 50, () => {
      const seen = JSON.parse(svg.getAttribute('data-state') ?? '{}')
      const s: State = { ...initialState(m), ...seen }
      const t = bot(m, s).target
      if (t) pointer(svg, t)
    })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="shots"]')?.textContent).toMatch(/You: (Drive|Smash)/)
  })
})
