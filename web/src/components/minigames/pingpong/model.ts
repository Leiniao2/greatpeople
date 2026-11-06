// Ping-Pong: a top-down table, your half at the bottom, the computer's at the
// top.  Everything here is pure and deterministic so the tests can play whole
// matches: `step(match, state, dt, input)` advances the rally by dt seconds.
//
// Units: the table is W wide and L long, the net at NET.  Each shot is two
// arcs: from the bat to a bounce on the far half, then on from the bounce
// until it would drop to the floor.  The receiver may only hit it after the
// bounce, with a round bat moved anywhere in their own half, over the table
// or off it.  A shot that lands off the far half is the hitter's fault
// (long, wide or into the net); a ball that bounces in and drops unreturned
// is the hitter's point.
//
// The swing sets the shot.  Where the ball meets the bat picks the line (the
// centre sends it down the middle, the rim to a corner).  Forward bat speed
// is power: a block lands short, a drive deep, a smash deeper and faster, and
// too much flies off the end.  Swinging forward also gives topspin (the ball
// kicks on after the bounce), pulling back chops it with backspin (it dies),
// and a sideways swing gives sidespin (it curves in the air and kicks off
// the bounce).  Incoming spin comes off your bat too: topspin flies long,
// backspin drops short and needs lifting with more power, and sidespin
// pushes your return sideways.
//
// The computer reads where the ball will be, reacts after a short delay and
// moves at a capped speed.  Below tier 3 it reads the flight as if there were
// no spin.  It aims away from you on higher tiers, spins its own shots, and
// sprays them when it is stretched, rushed or confused by spin.

import type { Difficulty } from '@/games/types'
import { mulberry32, hashString } from '../_shared'

export const W = 100
export const L = 160
export const NET = L / 2
export const BALL_R = 1.6
/** Sideways acceleration of a ball with full sidespin. */
export const SIDE_MAX = 30
/** Forward bat speed (table units a second) that gives full power. */
export const POWER_FULL = 150
/** Power above which a shot is a smash. */
export const SMASH = 1
/** Your bat's top speed. */
export const ME_SPEED = 260
export const KEY_SPEED = 140
export const SPEED_UP = 1.06
export const PACE_MAX = 1.7
export const FIXED_DT = 1 / 120
/** How long the bat's speed is averaged over, in seconds. */
const SWING_TAU = 0.04

export type Side = 'me' | 'cpu'
export type Aim = 'centre' | 'wide' | 'corners'
export interface Pt { x: number; y: number }

/** Where each side's bat may go: its own half of the room, never past the net. */
export const ZONE: Record<Side, { x0: number; x1: number; y0: number; y1: number }> = {
  me: { x0: -30, x1: W + 30, y0: NET + 5, y1: L + 32 },
  cpu: { x0: -30, x1: W + 30, y0: -32, y1: NET - 5 },
}
export const HOME: Record<Side, Pt> = { me: { x: W / 2, y: L + 10 }, cpu: { x: W / 2, y: -10 } }

export interface Theme {
  title: string
  blurb: string
  fact: string
  /** Multiplies the tier's ball speed (a cork is slower, a 40 mm ball too). */
  speed: number
  /** Where the computer sends its returns. */
  aim: Aim
  /** The computer puts spin on its shots from this tier on (5: never). */
  spinFrom: number
  /** The computer drifts back to the middle between shots from this tier on. */
  recoverFrom: number
  /** Your bat's radius (a cigar-box lid is small). */
  bat: number
}

export const THEMES: Record<string, Theme> = {
  'parlour-1890s': {
    title: 'After Dinner, 1890s',
    blurb: 'A row of books for a net, a champagne cork for a ball and cigar-box lids for bats.',
    fact: 'Victorians played table tennis after dinner with books for a net, a rounded cork for a ball and cigar-box lids for bats. Jaques of London sold a set called Gossima in 1891 and registered the name Ping-Pong in 1901, selling the American rights to Parker Brothers.',
    speed: 0.9, aim: 'centre', spinFrom: 4, recoverFrom: 3, bat: 7,
  },
  'london-1926': {
    title: 'World Championships, London 1926',
    blurb: 'The first World Championships, played with hard rubber bats.',
    fact: 'The International Table Tennis Federation was founded in 1926, and the first World Championships were held in London that December. Hungary dominated the early years: Roland Jacobi won the first men\'s singles title.',
    speed: 0.95, aim: 'wide', spinFrom: 5, recoverFrom: 2, bat: 8,
  },
  'nagoya-1971': {
    title: 'Nagoya, April 1971',
    blurb: 'The World Championships where a bus ride opened a door between two countries.',
    fact: 'At the 1971 World Championships in Nagoya, the American player Glenn Cowan climbed onto the Chinese team bus and Zhuang Zedong gave him a silk picture of the Huangshan mountains. Days later China invited the US team to visit: Ping-Pong Diplomacy, which led to Nixon\'s trip to China in 1972.',
    speed: 1.05, aim: 'corners', spinFrom: 3, recoverFrom: 1, bat: 8,
  },
  'seoul-1988': {
    title: 'Olympic Debut, Seoul 1988',
    blurb: 'Table tennis enters the Olympic Games. Expect heavy spin.',
    fact: 'Table tennis became an Olympic sport at Seoul in 1988. Yoo Nam-kyu of South Korea won the first men\'s singles gold and Chen Jing of China the first women\'s.',
    speed: 1.0, aim: 'wide', spinFrom: 1, recoverFrom: 1, bat: 8,
  },
  'sydney-2000': {
    title: 'The 40 mm Ball, 2000',
    blurb: 'A bigger ball to slow the rallies, then games to 11.',
    fact: 'After the Sydney Olympics in 2000 the ITTF replaced the 38 mm ball with a 40 mm one to slow the game for spectators, and in 2001 games were shortened from 21 points to 11, with the serve changing every two points.',
    speed: 0.95, aim: 'corners', spinFrom: 2, recoverFrom: 1, bat: 8,
  },
}

export const THEME_IDS = Object.keys(THEMES)

export interface Tier {
  /** Ground speed of a rally ball at the serve (table units a second). */
  speed: number
  cpuSpeed: number
  /** Seconds before the computer starts moving to a ball coming its way. */
  reaction: number
  /** How far off (table units) the computer's read of the ball can be. */
  error: number
  /** How much a hard ball (a stretch, pace, spin) shakes the computer's return. */
  nerve: number
  /** Points to win, and the lead needed. */
  target: number
  winBy: number
  /** The computer's bat radius. */
  cpuBat: number
  /** How far toward a corner a hit off your bat's rim goes (1: the corner). */
  spread: number
  /** How deep (from the net) the computer's shots land. */
  depth: [number, number]
}

export const TIERS: Record<Difficulty, Tier> = {
  1: { speed: 80,  cpuSpeed: 55,  reaction: 0.35, error: 6,   nerve: 1.0, target: 5,  winBy: 1, cpuBat: 7,   spread: 0.84, depth: [30, 55] },
  2: { speed: 92,  cpuSpeed: 62,  reaction: 0.28, error: 4.5, nerve: 0.75, target: 7,  winBy: 2, cpuBat: 7.5, spread: 0.92, depth: [28, 64] },
  3: { speed: 100, cpuSpeed: 70,  reaction: 0.22, error: 3.5, nerve: 0.55, target: 9, winBy: 2, cpuBat: 8,   spread: 0.96, depth: [24, 70] },
  4: { speed: 110, cpuSpeed: 78,  reaction: 0.16, error: 2.5, nerve: 0.4, target: 11, winBy: 2, cpuBat: 8.5, spread: 1.0, depth: [20, 74] },
}

export interface Match {
  theme: string
  difficulty: Difficulty
  seed: number
  speed: number
  maxSpeed: number
  cpuSpeed: number
  reaction: number
  error: number
  nerve: number
  target: number
  winBy: number
  bat: number
  cpuBat: number
  spread: number
  depth: [number, number]
  aim: Aim
  cpuSpin: boolean
  spinAware: boolean
  recover: boolean
  firstServer: Side
}

export function makeMatch(configId: string, difficulty: Difficulty, seed: number): Match {
  const theme = THEMES[configId] ? configId : THEME_IDS[0]
  const th = THEMES[theme], t = TIERS[difficulty] ?? TIERS[1]
  const speed = t.speed * th.speed
  return {
    theme, difficulty, seed,
    speed, maxSpeed: speed * 2.2,
    cpuSpeed: t.cpuSpeed, reaction: t.reaction, error: t.error, nerve: t.nerve,
    target: t.target, winBy: t.winBy,
    bat: th.bat, cpuBat: t.cpuBat, spread: t.spread, depth: t.depth,
    aim: difficulty >= 3 && th.aim === 'centre' ? 'wide' : th.aim,
    cpuSpin: difficulty >= th.spinFrom,
    spinAware: difficulty >= 3,
    recover: difficulty >= th.recoverFrom,
    firstServer: mulberry32(hashString(`pingpong:${seed}`))() < 0.5 ? 'me' : 'cpu',
  }
}

export interface Ball {
  x: number; y: number
  vx: number; vy: number
  /** Sideways acceleration from sidespin. */
  a: number
  /** Spin, −1…1: topspin (+) or backspin (−), and sidespin (+ curves right). */
  top: number
  side: number
  /** Seconds into the current arc, and the arc's length. */
  t: number
  T: number
  /** Peak height of the arc (for drawing). */
  h: number
  /** Where the first arc comes down. */
  land: Pt
  bounced: boolean
  /** Backspin braking after the bounce (per second). */
  drag: number
}

export type ShotKind = 'serve' | 'block' | 'drive' | 'smash' | 'chop'
export interface Shot { kind: ShotKind; power: number; top: number; side: number }
export type Why = 'miss' | 'long' | 'wide' | 'net'

export interface State {
  phase: 'serve' | 'play' | 'over'
  /** Seconds since the match began. */
  clock: number
  /** Seconds left in the pause before the serve. */
  timer: number
  ball: Ball
  me: Pt
  /** Your bat's velocity, averaged over a few hundredths of a second. */
  meV: Pt
  cpu: Pt
  /** Where the computer is heading (null: holding). */
  cpuGoal: Pt | null
  /** Seconds before the computer reacts to the ball now in flight. */
  react: number
  /** How hard it was for the computer to get there, 0…1+. */
  stretch: number
  /** Rally pace: every hit is a little faster. */
  pace: number
  lastHit: Side
  server: Side
  score: [number, number]
  /** Draw counter for the seeded noise. */
  n: number
  /** The last bounce, and whether it was in. */
  bounce: { x: number; y: number; at: number; ok: boolean } | null
  shots: Record<Side, Shot | null>
  lastPoint: { to: Side; why: Why } | null
  winner: Side | null
  /** Rally statistics, for the tests and the readout. */
  stats: { meHits: number; cpuHits: number; rallies: number; longest: number; rally: number }
}

/** Move the bat toward a point (pointer) or in a direction (keys). */
export type Input = { target?: Pt | null; dir?: Pt }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const other = (s: Side): Side => (s === 'me' ? 'cpu' : 'me')

/** Seeded noise in [0, 1): the n-th draw of this match. */
function noise(m: Match, n: number): number {
  return mulberry32((m.seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0)()
}

/** Who serves after `points` points have been played. */
export function serverAfter(m: Match, points: number): Side {
  const deuceAt = 2 * (m.target - 1)
  const turn = m.winBy > 1 && points >= deuceAt
    ? Math.floor(deuceAt / 2) + (points - deuceAt)
    : Math.floor(points / 2)
  return turn % 2 === 0 ? m.firstServer : other(m.firstServer)
}

export function matchWinner(m: Match, score: [number, number]): Side | null {
  const [a, b] = score
  if (a >= m.target && a - b >= m.winBy) return 'me'
  if (b >= m.target && b - a >= m.winBy) return 'cpu'
  return null
}

const SERVE_PAUSE = 0.9

const restBall = (at: Pt, server: Side): Ball => ({
  x: clamp(at.x, 8, W - 8), y: server === 'me' ? L - 2 : 2, vx: 0, vy: 0, a: 0, top: 0, side: 0,
  t: 0, T: 1, h: 0, land: { x: at.x, y: at.y }, bounced: false, drag: 0,
})

export function initialState(m: Match): State {
  return {
    phase: 'serve', clock: 0, timer: SERVE_PAUSE,
    ball: restBall(HOME[m.firstServer], m.firstServer),
    me: { ...HOME.me }, meV: { x: 0, y: 0 }, cpu: { ...HOME.cpu }, cpuGoal: null, react: 0, stretch: 0, pace: 1,
    lastHit: m.firstServer, server: m.firstServer,
    score: [0, 0], n: 0, bounce: null, shots: { me: null, cpu: null }, lastPoint: null, winner: null,
    stats: { meHits: 0, cpuHits: 0, rallies: 0, longest: 0, rally: 0 },
  }
}

// ── Flight ───────────────────────────────────────────────────────────────────

/**
 * A ball leaving `from` at ground speed `v` that comes down at `land`, curving
 * on the way with its sidespin.
 */
export function launch(from: Pt, land: Pt, v: number, top: number, side: number, h = 8): Ball {
  const T = Math.max(0.25, dist(from, land) / v)
  const a = side * SIDE_MAX
  return {
    x: from.x, y: from.y, vx: (land.x - from.x - 0.5 * a * T * T) / T, vy: (land.y - from.y) / T, a, top, side,
    t: 0, T, h, land: { ...land }, bounced: false, drag: 0,
  }
}

/** The ball after it bounces: topspin kicks it on, backspin checks it, sidespin kicks it sideways. */
export function afterBounce(b: Ball): Ball {
  const f = b.top >= 0 ? 1 + 0.2 * b.top : 1 + 0.3 * b.top
  const back = Math.max(0, -b.top), fwd = Math.max(0, b.top)
  return {
    ...b, x: b.land.x, y: b.land.y,
    vx: (b.vx + b.a * (b.T - b.t)) * f + b.side * 12, vy: b.vy * f, a: b.a * 0.5,
    t: 0, T: clamp(0.55 * b.T * (1 + 0.3 * back - 0.15 * fwd), 0.4, 0.9),
    h: 6 * (1 - 0.4 * b.top), bounced: true, drag: 1.2 * back,
  }
}

function advance(b: Ball, dt: number): Ball {
  const k = b.drag ? Math.exp(-b.drag * dt) : 1
  return {
    ...b,
    x: b.x + b.vx * dt + 0.5 * b.a * dt * dt, y: b.y + b.vy * dt,
    vx: (b.vx + b.a * dt) * k, vy: b.vy * k, t: b.t + dt,
  }
}

/** The ball's height above the table (or floor), for drawing. */
export function height(b: Ball): number {
  const u = clamp(b.t / b.T, 0, 1)
  return (b.bounced ? 0 : 3 * (1 - u)) + 4 * b.h * u * (1 - u)
}

export interface PathPoint { t: number; x: number; y: number; bounced: boolean }

/**
 * Where the ball will be from now until it drops after the bounce.  With
 * `ignoreSpin` the read is the one a player makes who cannot see spin: a
 * straight flight and a plain bounce.
 */
export function predictPath(ball: Ball, ignoreSpin = false, every = 2 * FIXED_DT): PathPoint[] {
  let b = ball
  if (ignoreSpin && !b.bounced) {
    const left = b.T - b.t
    b = { ...b, a: 0, top: 0, side: 0, land: { x: b.x + b.vx * left, y: b.y + b.vy * left } }
  } else if (ignoreSpin) b = { ...b, a: 0, drag: 0 }
  const out: PathPoint[] = []
  for (let t = 0; t < 4; t += every) {
    if (!b.bounced && b.t + every >= b.T) {
      const rest = b.T - b.t
      b = afterBounce({ ...b, t: b.T })
      t += rest - every
      out.push({ t: t + every, x: b.x, y: b.y, bounced: true })
      continue
    }
    if (b.bounced && b.t >= b.T) break
    b = advance(b, every)
    out.push({ t: t + every, x: b.x, y: b.y, bounced: b.bounced })
  }
  return out
}

// ── Shots ────────────────────────────────────────────────────────────────────

/** How far a shot's landing moves for the spin on the ball it returns. */
export const spinCarry = (topIn: number) => (topIn > 0 ? 14 * topIn : 24 * topIn)

/** The far half's landing line for a shot by `by`: `depth` past the net. */
const landY = (by: Side, depth: number) => (depth < 3 ? NET : by === 'me' ? NET - depth : NET + depth)

/**
 * Your shot.  The ball met the bat `off` (−1…1) from its centre while the bat
 * moved at `v`; the incoming ball carried `incoming` spin.
 */
export function swingShot(m: Match, at: Pt, off: number, v: Pt, incoming: Pick<Ball, 'top' | 'side'>, pace: number): { ball: Ball; shot: Shot } {
  const fwd = -v.y
  const power = clamp(fwd / POWER_FULL, 0, 1.7)
  const chop = clamp(-fwd / 110, 0, 1)
  const side = clamp(v.x / 160, -1, 1)
  let kind: ShotKind, depth: number, top: number, factor: number, h: number
  if (chop > 0.25) { kind = 'chop'; depth = 30 + 10 * chop; top = -0.9 * chop; factor = 0.7; h = 10 }
  else if (power < 0.15) { kind = 'block'; depth = 24; top = 0.3 * incoming.top; factor = 0.8; h = 9 }
  else {
    kind = power >= SMASH ? 'smash' : 'drive'
    depth = 22 + 50 * power; top = clamp(0.2 + 0.6 * power, 0, 1); factor = 0.8 + 0.45 * power; h = 9 - 3 * Math.min(1, power)
  }
  depth += spinCarry(incoming.top)
  const aimX = W / 2 + clamp(off, -1, 1) * (W / 2) * m.spread - incoming.side * 10
  const speed = Math.min(m.maxSpeed, m.speed * pace * factor)
  // The line is aimed straight; sidespin then bends it on the way.
  const aim = { x: aimX, y: landY('me', depth) }
  const T = Math.max(0.25, dist(at, aim) / speed)
  const land = { x: aimX + 0.5 * side * SIDE_MAX * T * T, y: aim.y }
  return { ball: launch(at, land, dist(at, land) / T, top, side, h), shot: { kind, power, top, side } }
}

/** Is a landing spot on the half that `by` has to hit?  If not, why not. */
export function fault(by: Side, p: Pt): Why | null {
  const own = by === 'me' ? p.y >= NET : p.y <= NET
  if (own) return 'net'
  if (p.x < 0 || p.x > W) return 'wide'
  if (p.y < 0 || p.y > L) return 'long'
  return null
}

function point(m: Match, s: State, to: Side, why: Why): State {
  const score: [number, number] = to === 'me' ? [s.score[0] + 1, s.score[1]] : [s.score[0], s.score[1] + 1]
  const winner = matchWinner(m, score)
  const server = serverAfter(m, score[0] + score[1])
  const stats = { ...s.stats, rallies: s.stats.rallies + 1, longest: Math.max(s.stats.longest, s.stats.rally), rally: 0 }
  return {
    ...s, score, winner, server, stats,
    phase: winner ? 'over' : 'serve', timer: SERVE_PAUSE, pace: 1,
    ball: restBall(server === 'me' ? s.me : s.cpu, server),
    cpuGoal: null, lastPoint: { to, why },
  }
}

/** The computer picks where to send the ball, how hard and with what spin. */
function cpuShot(m: Match, s: State, at: Pt, pressure: number): { ball: Ball; shot: Shot; n: number } {
  let n = s.n
  const r = Array.from({ length: 7 }, () => noise(m, n++))
  let goal: number
  if (m.aim === 'centre') goal = W * (0.3 + 0.4 * r[0])
  else {
    // Away from your bat: the far side, deeper into the corner on 'corners'.
    const far = s.me.x < W / 2 ? 1 : -1
    const reach = m.aim === 'corners' ? 0.36 + 0.08 * r[0] : 0.18 + 0.16 * r[0]
    goal = W / 2 + far * reach * W
    if (m.aim === 'wide' && r[2] < 0.3) goal = W - goal   // now and then the other way
  }
  goal = clamp(goal + (r[1] * 2 - 1) * m.error, 6, W - 6)
  let depth = m.depth[0] + (m.depth[1] - m.depth[0]) * r[4]
  // Under pressure the shot sprays: wide, long or into the net.
  const shake = pressure * pressure * m.nerve
  goal += (r[3] * 2 - 1) * 36 * shake
  depth += (r[5] * 2 - 1) * 28 * shake
  const top = m.cpuSpin ? (r[6] * 2 - 1) * 0.9 : 0
  const side = m.cpuSpin ? (r[2] * 2 - 1) * 0.7 : 0
  const power = (depth - 22) / 50
  const v = Math.min(m.maxSpeed, m.speed * s.pace * (0.85 + 0.3 * r[4]))
  const ball = launch(at, { x: goal, y: landY('cpu', depth) }, v, top, side, 9 - 3 * clamp(power, 0, 1))
  const kind: ShotKind = top < -0.25 ? 'chop' : power >= SMASH ? 'smash' : power < 0.15 ? 'block' : 'drive'
  return { ball, shot: { kind, power: clamp(power, 0, 1.7), top, side }, n }
}

/**
 * How hard the incoming ball was for the computer, 0…1: how far it had to
 * go in the time it had, how fast the ball is, spin it could not read, and
 * how long the rally has gone on.
 */
export function pressureOn(m: Match, s: State, b: Ball): number {
  const pace = clamp((Math.hypot(b.vx, b.vy) / m.speed - 1) / 0.8, 0, 1)
  const spin = (Math.abs(b.top) + Math.abs(b.side)) / 2 * (m.spinAware ? 0.3 : 0.7)
  const long = Math.min(0.3, s.stats.rally * 0.015)
  return clamp(0.1 + 0.45 * clamp(s.stretch, 0, 1) + 0.3 * pace + spin + long, 0, 1)
}

/** The computer's plan for the ball now coming its way: where to meet it. */
function cpuPlan(m: Match, s: State): { goal: Pt; stretch: number; n: number } {
  const path = predictPath(s.ball, !m.spinAware).filter(p => p.bounced && p.y > ZONE.cpu.y0 && p.y < ZONE.cpu.y1)
  let n = s.n
  if (!path.length) return { goal: { ...s.cpu }, stretch: 1, n }
  let best = path[path.length - 1], stretch = Infinity
  for (const p of path) {
    const need = dist(s.cpu, p) / m.cpuSpeed + m.reaction
    const k = need / p.t
    if (k <= 1) { best = p; stretch = k; break }
    if (k < stretch) { best = p; stretch = k }
  }
  // A faster ball is harder to read.
  const err = m.error * Math.hypot(s.ball.vx, s.ball.vy) / m.speed
  const goal = { x: best.x + (noise(m, n++) * 2 - 1) * err, y: best.y + (noise(m, n++) * 2 - 1) * err * 0.5 }
  return { goal, stretch, n }
}

/** Put a new ball in flight from `by`, and set the computer to work if it is coming its way. */
function inFlight(m: Match, s: State, by: Side, ball: Ball, shot: Shot): State {
  const hits = by === 'me' ? { meHits: s.stats.meHits + 1 } : { cpuHits: s.stats.cpuHits + 1 }
  s = { ...s, ball, lastHit: by, shots: { ...s.shots, [by]: shot }, cpuGoal: null,
    stats: { ...s.stats, ...(shot.kind === 'serve' ? {} : hits), rally: s.stats.rally + 1 } }
  if (by === 'me') {
    const plan = cpuPlan(m, s)
    s = { ...s, n: plan.n, cpuGoal: plan.goal, stretch: plan.stretch, react: m.reaction }
  }
  return s
}

function moveToward(p: Pt, goal: Pt, max: number): Pt {
  const d = dist(p, goal)
  if (d <= max) return { ...goal }
  return { x: p.x + (goal.x - p.x) * max / d, y: p.y + (goal.y - p.y) * max / d }
}
const inZone = (side: Side, p: Pt): Pt => {
  const z = ZONE[side]
  return { x: clamp(p.x, z.x0, z.x1), y: clamp(p.y, z.y0, z.y1) }
}

function substep(m: Match, s0: State, dt: number, input: Input): State {
  let s = { ...s0, clock: s0.clock + dt }
  // Your bat.
  let me = s.me
  if (input.target) me = moveToward(me, input.target, ME_SPEED * dt)
  else if (input.dir) me = { x: me.x + input.dir.x * KEY_SPEED * dt, y: me.y + input.dir.y * KEY_SPEED * dt }
  me = inZone('me', me)
  const k = Math.min(1, dt / SWING_TAU)
  const meV = { x: s.meV.x + ((me.x - s.me.x) / dt - s.meV.x) * k, y: s.meV.y + ((me.y - s.me.y) / dt - s.meV.y) * k }
  s = { ...s, me, meV }

  if (s.phase === 'over') return s

  if (s.phase === 'serve') {
    const timer = s.timer - dt
    if (timer > 0) {
      // Between points the computer walks back to its place.
      const cpu = moveToward(s.cpu, HOME.cpu, m.cpuSpeed * dt)
      return { ...s, timer, cpu, ball: restBall(s.server === 'me' ? s.me : cpu, s.server) }
    }
    // Serve: to a spot on the far half, a little different every time.
    let n = s.n
    const r1 = noise(m, n++), r2 = noise(m, n++), r3 = noise(m, n++), r4 = noise(m, n++)
    const by = s.server
    const from = { x: s.ball.x, y: s.ball.y }
    const x = 15 + 70 * r1, depth = 30 + 35 * r2
    const spin = by === 'cpu' && m.cpuSpin
    const top = spin ? (r3 * 2 - 1) * 0.8 : 0, side = spin ? (r4 * 2 - 1) * 0.6 : 0
    const ball = launch(from, { x, y: landY(by, depth) }, m.speed * 0.85, top, side)
    s = { ...s, phase: 'play', timer: 0, n, bounce: null, stats: { ...s.stats, rally: 0 } }
    return inFlight(m, s, by, ball, { kind: 'serve', power: 0, top, side })
  }

  // The ball in flight.
  const hitter = s.lastHit, receiver = other(hitter)
  let ball = advance(s.ball, dt)
  if (!ball.bounced && ball.t >= ball.T) {
    const why = fault(hitter, ball.land)
    s = { ...s, bounce: { ...ball.land, at: s.clock, ok: !why } }
    if (why) return point(m, { ...s, ball: { ...ball, x: ball.land.x, y: ball.land.y } }, receiver, why)
    ball = afterBounce(ball)
  } else if (ball.bounced && ball.t >= ball.T) return point(m, { ...s, ball }, hitter, 'miss')

  // The computer's bat.
  let cpu = s.cpu, react = s.react
  if (receiver === 'cpu') {
    react = Math.max(0, react - dt)
    if (react === 0 && s.cpuGoal) cpu = moveToward(cpu, s.cpuGoal, m.cpuSpeed * dt)
  } else if (m.recover) cpu = moveToward(cpu, HOME.cpu, m.cpuSpeed * 0.6 * dt)
  cpu = inZone('cpu', cpu)
  s = { ...s, cpu, react, ball }

  // A bounced ball can be hit where it meets the receiver's bat.
  if (!ball.bounced) return s
  const at = { x: ball.x, y: ball.y }
  if (receiver === 'me' && dist(s.me, at) <= m.bat + BALL_R) {
    const shot = swingShot(m, at, (at.x - s.me.x) / m.bat, s.meV, ball, s.pace)
    return inFlight(m, { ...s, pace: Math.min(PACE_MAX, s.pace * SPEED_UP) }, 'me', shot.ball, shot.shot)
  }
  if (receiver === 'cpu' && dist(s.cpu, at) <= m.cpuBat + BALL_R) {
    const shot = cpuShot(m, s, at, pressureOn(m, s, ball))
    return inFlight(m, { ...s, n: shot.n, pace: Math.min(PACE_MAX, s.pace * SPEED_UP) }, 'cpu', shot.ball, shot.shot)
  }
  return s
}

/** Advance by dt seconds in fixed sub-steps, so results do not depend on the frame rate. */
export function step(m: Match, s: State, dt: number, input: Input = {}): State {
  let left = Math.min(dt, 0.1)
  while (left > 1e-9) {
    const d = Math.min(FIXED_DT, left)
    s = substep(m, s, d, input)
    left -= d
  }
  return s
}

// ── Bots, used by the tests to show every level is winnable ────────────────

export type Bot = (m: Match, s: State) => Input

/** Stands still in the middle, behind the table. */
export const lazyBot = (): Bot => () => ({ target: { ...HOME.me } })

/** The forward bat speed that sends a return `depth` past the net. */
export function powerFor(depth: number, topIn: number): number {
  return clamp((depth - 22 - spinCarry(topIn)) / 50, 0.15, 1.2)
}

/**
 * A player who reads the ball, gets in place behind where it will be, and
 * swings through it: aiming `aim` of the way to the corner away from the
 * computer, for a landing `depth` past the net.  `reaction` delays the read,
 * `error` misjudges the line, and `lead` is how far ahead the bot sets its
 * target (one frame).
 */
export function swingBot({ reaction = 0, error = 0, aim = 0.85, depth = 64, lead = 1 / 60 } = {}): Bot {
  let key = '', plan: { t0: number; tc: number; bc: Pt; vs: number } | null = null
  const SW = 0.18
  return (m, s) => {
    if (s.phase !== 'play' || s.lastHit !== 'cpu') { key = ''; plan = null; return { target: { ...HOME.me } } }
    const k = `${s.score}|${s.stats.cpuHits}|${s.stats.rallies}`
    if (k !== key) { key = k; plan = null }
    if (!plan) {
      const since = s.ball.bounced ? s.ball.t + 1 : s.ball.t
      if (since < reaction) return { target: null }
      const path = predictPath(s.ball)
      const wrong = (noise(m, s.stats.cpuHits * 7 + s.score[0] * 31 + s.score[1] * 131) * 2 - 1) * error
      const pick = path.find(p => p.bounced && p.y > ZONE.me.y0 + 2 && p.y < ZONE.me.y1 - 20 &&
        dist(s.me, p) / ME_SPEED + SW + 0.05 <= p.t && path.some(q => q.bounced && q.t <= p.t - 0.08))
        ?? path.find(p => p.bounced && p.y > ZONE.me.y0 + 2)
      if (!pick) return { target: { ...HOME.me } }
      const goal = s.cpu.x < W / 2 ? W - 10 : 10
      const off = clamp((goal - W / 2 + s.ball.side * 10) / ((W / 2) * m.spread), -aim, aim)
      const vs = powerFor(depth, s.ball.top) * POWER_FULL
      plan = { t0: s.clock, tc: pick.t, bc: { x: pick.x - off * m.bat + wrong, y: pick.y }, vs }
    }
    const t = s.clock - plan.t0 + lead
    const back = Math.max(-0.1, Math.min(SW, plan.tc - t))
    return { target: { x: plan.bc.x, y: plan.bc.y + plan.vs * back } }
  }
}

/** A careful player. */
export const goodBot = (lead = 1 / 60): Bot => swingBot({ lead })

/** A player with human limits: slower to read, a little off, and aiming less finely. */
export const humanBot = (reaction: number, error: number, aim = 0.5): Bot => swingBot({ reaction, error, aim })

/** Plays a whole match with a bot; returns the final state. */
export function playMatch(m: Match, bot: Bot, maxSeconds = 900): State {
  let s = initialState(m)
  const dt = 1 / 60
  for (let t = 0; t < maxSeconds && s.phase !== 'over'; t += dt) s = step(m, s, dt, bot(m, s))
  return s
}
