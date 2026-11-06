// Ping-Pong: a top-down table, your bat at the bottom, the computer's at the
// top.  Everything here is pure and deterministic so the tests can play whole
// matches: `step(match, state, dt, input)` advances the rally by dt seconds.
//
// Units: the table is W wide and L long.  The ball flies in a straight line
// bent sideways by spin (a constant sideways acceleration for one flight).
// Where the ball meets your bat sets the angle of the return, and how fast
// the bat is moving at contact puts spin on it.  A ball that leaves the side
// of the table before it reaches the far end line is out: the hitter loses
// the point.  A ball that passes a bat is the point for the other side.
//
// The computer reacts after a short delay, moves at a capped speed, misjudges
// where the ball will arrive by a little, and on higher tiers reads spin,
// aims for the corners away from you and puts spin on its own returns.

import type { Difficulty } from '@/games/types'
import { mulberry32, hashString } from '../_shared'

export const W = 100
export const L = 160
export const ME_Y = L - 8
export const CPU_Y = 8
export const BALL_R = 1.6
export const SPIN_K = 0.12
export const SPIN_MAX = 26
/** Your bat's top speed (table units a second). */
export const ME_SPEED = 240
export const KEY_SPEED = 130
export const SPEED_UP = 1.06
export const FIXED_DT = 1 / 120

export type Side = 'me' | 'cpu'
export type Aim = 'centre' | 'wide' | 'corners'

export interface Theme {
  title: string
  blurb: string
  fact: string
  /** Multiplies the tier's ball speed (a cork is slower, a 40 mm ball too). */
  speed: number
  /** Where the computer sends its returns. */
  aim: Aim
  /** The computer puts spin on its returns from this tier on (5: never). */
  spinFrom: number
  /** The computer drifts back to the middle between shots from this tier on. */
  recoverFrom: number
  /** Your bat's half width (a cigar-box lid is narrow). */
  bat: number
}

export const THEMES: Record<string, Theme> = {
  'parlour-1890s': {
    title: 'After Dinner, 1890s',
    blurb: 'A row of books for a net, a champagne cork for a ball and cigar-box lids for bats.',
    fact: 'Victorians played table tennis after dinner with books for a net, a rounded cork for a ball and cigar-box lids for bats. Jaques of London sold a set called Gossima in 1891 and registered the name Ping-Pong in 1901, selling the American rights to Parker Brothers.',
    speed: 0.9, aim: 'centre', spinFrom: 4, recoverFrom: 3, bat: 8,
  },
  'london-1926': {
    title: 'World Championships, London 1926',
    blurb: 'The first World Championships, played with hard rubber bats.',
    fact: 'The International Table Tennis Federation was founded in 1926, and the first World Championships were held in London that December. Hungary dominated the early years: Roland Jacobi won the first men\'s singles title.',
    speed: 0.95, aim: 'wide', spinFrom: 5, recoverFrom: 2, bat: 9,
  },
  'nagoya-1971': {
    title: 'Nagoya, April 1971',
    blurb: 'The World Championships where a bus ride opened a door between two countries.',
    fact: 'At the 1971 World Championships in Nagoya, the American player Glenn Cowan climbed onto the Chinese team bus and Zhuang Zedong gave him a silk picture of the Huangshan mountains. Days later China invited the US team to visit: Ping-Pong Diplomacy, which led to Nixon\'s trip to China in 1972.',
    speed: 1.05, aim: 'corners', spinFrom: 3, recoverFrom: 1, bat: 9,
  },
  'seoul-1988': {
    title: 'Olympic Debut, Seoul 1988',
    blurb: 'Table tennis enters the Olympic Games. Expect heavy spin.',
    fact: 'Table tennis became an Olympic sport at Seoul in 1988. Yoo Nam-kyu of South Korea won the first men\'s singles gold and Chen Jing of China the first women\'s.',
    speed: 1.0, aim: 'wide', spinFrom: 1, recoverFrom: 1, bat: 9,
  },
  'sydney-2000': {
    title: 'The 40 mm Ball, 2000',
    blurb: 'A bigger ball to slow the rallies, then games to 11.',
    fact: 'After the Sydney Olympics in 2000 the ITTF replaced the 38 mm ball with a 40 mm one to slow the game for spectators, and in 2001 games were shortened from 21 points to 11, with the serve changing every two points.',
    speed: 0.95, aim: 'corners', spinFrom: 2, recoverFrom: 1, bat: 9,
  },
}

export const THEME_IDS = Object.keys(THEMES)

export interface Tier {
  /** Rally speed at the serve (table lengths a second × L). */
  speed: number
  cpuSpeed: number
  /** Seconds before the computer starts moving to a ball coming its way. */
  reaction: number
  /** How far off (table units) the computer's read of the ball can be. */
  error: number
  /** How much a hard ball (a stretch, heavy spin) shakes the computer's return. */
  nerve: number
  /** Points to win, and the lead needed. */
  target: number
  winBy: number
  /** The computer's bat half width. */
  cpuBat: number
  /**
   * Where your return lands is set by where the ball meets your bat: the
   * centre sends it to the middle of the far end, the rim to a corner, and
   * past the corner (off the table) when spread is above 1.
   */
  spread: number
}

export const TIERS: Record<Difficulty, Tier> = {
  1: { speed: 80,  cpuSpeed: 40, reaction: 0.35, error: 6,   nerve: 1.2, target: 5,  winBy: 1, cpuBat: 8, spread: 0.84 },
  2: { speed: 95,  cpuSpeed: 50, reaction: 0.28, error: 4.5, nerve: 1.0, target: 7,  winBy: 2, cpuBat: 8.5, spread: 0.94 },
  3: { speed: 100, cpuSpeed: 54, reaction: 0.21, error: 3.5, nerve: 0.8, target: 9,  winBy: 2, cpuBat: 9, spread: 0.96 },
  4: { speed: 112, cpuSpeed: 60, reaction: 0.15, error: 2.5, nerve: 0.7, target: 11, winBy: 2, cpuBat: 9.5, spread: 1.0 },
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
    speed, maxSpeed: speed * 1.7,
    cpuSpeed: t.cpuSpeed, reaction: t.reaction, error: t.error, nerve: t.nerve,
    target: t.target, winBy: t.winBy,
    bat: th.bat, cpuBat: t.cpuBat, spread: t.spread,
    aim: difficulty >= 3 && th.aim === 'centre' ? 'wide' : th.aim,
    cpuSpin: difficulty >= th.spinFrom,
    spinAware: difficulty >= 3,
    recover: difficulty >= th.recoverFrom,
    firstServer: mulberry32(hashString(`pingpong:${seed}`))() < 0.5 ? 'me' : 'cpu',
  }
}

export interface Ball { x: number; y: number; vx: number; vy: number; a: number }

export interface State {
  phase: 'serve' | 'play' | 'over'
  /** Seconds left in the pause before the serve. */
  timer: number
  ball: Ball
  me: number
  meV: number
  cpu: number
  /** Where the computer is heading (null: holding). */
  cpuGoal: number | null
  /** Seconds before the computer reacts to the ball now in flight. */
  react: number
  /** Where the computer's bat was when you hit the ball now in flight. */
  readFrom: number
  lastHit: Side
  server: Side
  score: [number, number]
  /** Draw counter for the seeded noise. */
  n: number
  lastPoint: { to: Side; why: 'miss' | 'out' } | null
  winner: Side | null
  /** Rally statistics, for the tests and the readout. */
  stats: { meHits: number; cpuHits: number; rallies: number; longest: number; rally: number }
}

export type Input = { target?: number | null; dir?: -1 | 0 | 1 }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Seeded noise in [0, 1): the n-th draw of this match. */
function noise(m: Match, n: number): number {
  return mulberry32((m.seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0)()
}

/** Who serves after `points` points have been played. */
export function serverAfter(m: Match, points: number): Side {
  const other: Side = m.firstServer === 'me' ? 'cpu' : 'me'
  const deuceAt = 2 * (m.target - 1)
  const turn = m.winBy > 1 && points >= deuceAt
    ? Math.floor(deuceAt / 2) + (points - deuceAt)
    : Math.floor(points / 2)
  return turn % 2 === 0 ? m.firstServer : other
}

export function matchWinner(m: Match, score: [number, number]): Side | null {
  const [a, b] = score
  if (a >= m.target && a - b >= m.winBy) return 'me'
  if (b >= m.target && b - a >= m.winBy) return 'cpu'
  return null
}

const SERVE_PAUSE = 0.9

export function initialState(m: Match): State {
  return {
    phase: 'serve', timer: SERVE_PAUSE,
    ball: { x: W / 2, y: m.firstServer === 'me' ? ME_Y - 3 : CPU_Y + 3, vx: 0, vy: 0, a: 0 },
    me: W / 2, meV: 0, cpu: W / 2, cpuGoal: null, react: 0, readFrom: W / 2,
    lastHit: m.firstServer, server: m.firstServer,
    score: [0, 0], n: 0, lastPoint: null, winner: null,
    stats: { meHits: 0, cpuHits: 0, rallies: 0, longest: 0, rally: 0 },
  }
}

/** Where a ball now in flight crosses the line y = lineY, ignoring the table sides. */
export function crossing(b: Ball, lineY: number, withSpin = true): { x: number; t: number } {
  const t = (lineY - b.y) / b.vy
  return { x: b.x + b.vx * t + (withSpin ? 0.5 * b.a * t * t : 0), t }
}

/** Where on the far end line a return hit `offset` (−1…1) off the bat's centre is sent. */
export const landingFor = (m: Match, offset: number) => W / 2 + clamp(offset, -1, 1) * (W / 2) * m.spread

/**
 * Your return from x: the ball met `offset` (−1…1) off the bat's centre while
 * the bat moves at batV.  The offset picks where it lands, and bat speed puts
 * on spin that bends it further.
 */
export function returnShot(m: Match, x: number, offset: number, batV: number, speed: number) {
  const t = (ME_Y - CPU_Y) / speed
  return { vx: (landingFor(m, offset) - x) / t, a: clamp(batV * SPIN_K, -SPIN_MAX, SPIN_MAX) }
}

function point(m: Match, s: State, to: Side, why: 'miss' | 'out'): State {
  const score: [number, number] = to === 'me' ? [s.score[0] + 1, s.score[1]] : [s.score[0], s.score[1] + 1]
  const winner = matchWinner(m, score)
  const server = serverAfter(m, score[0] + score[1])
  const stats = { ...s.stats, rallies: s.stats.rallies + 1, longest: Math.max(s.stats.longest, s.stats.rally), rally: 0 }
  return {
    ...s, score, winner, server, stats,
    phase: winner ? 'over' : 'serve', timer: SERVE_PAUSE,
    ball: { x: server === 'me' ? s.me : s.cpu, y: server === 'me' ? ME_Y - 3 : CPU_Y + 3, vx: 0, vy: 0, a: 0 },
    cpuGoal: null, lastPoint: { to, why },
  }
}

/** The computer picks where to send the ball and how much spin to give it. */
function cpuReturn(m: Match, s: State, speed: number, pressure: number): { vx: number; a: number; n: number } {
  let n = s.n
  const r1 = noise(m, n++), r2 = noise(m, n++), r3 = noise(m, n++), r4 = noise(m, n++)
  let goal: number
  if (m.aim === 'centre') goal = W * (0.3 + 0.4 * r1)
  else {
    // Away from your bat: the far side, deeper into the corner on 'corners'.
    const far = s.me < W / 2 ? 1 : -1
    const reach = m.aim === 'corners' ? 0.36 + 0.08 * r1 : 0.18 + 0.16 * r1
    goal = W / 2 + far * reach * W
    if (m.aim === 'wide' && r3 < 0.3) goal = W - goal   // now and then the other way
  }
  goal = clamp(goal + (r2 * 2 - 1) * m.error, 6, W - 6)
  // Under pressure the return can fly wide, even off the table.
  goal += (r4 * 2 - 1) * 44 * pressure * pressure * m.nerve
  const a = m.cpuSpin ? (r3 * 2 - 1) * SPIN_MAX * 0.8 : 0
  const t = (ME_Y - CPU_Y) / speed
  return { vx: (goal - s.ball.x - 0.5 * a * t * t) / t, a, n }
}

/**
 * How hard the incoming ball was for the computer, 0…1: how far it had to
 * travel against how far it can, how fast the ball is, spin it could not
 * read, and how long the rally has gone on.
 */
export function pressureOn(m: Match, s: State, b: Ball): number {
  const t = Math.max(0.05, (ME_Y - CPU_Y) / -b.vy - m.reaction)
  const left = Math.abs(crossing(b, CPU_Y).x - s.readFrom) - m.cpuBat
  const stretch = clamp(left / Math.max(1, m.cpuSpeed * t), 0, 1)
  const pace = clamp((-b.vy / m.speed - 1) / 0.8, 0, 1)
  const spin = Math.abs(b.a) / SPIN_MAX * (m.spinAware ? 0.3 : 0.7)
  const long = Math.min(0.3, s.stats.rally * 0.015)
  return clamp(0.15 + 0.45 * stretch + 0.3 * pace + spin + long, 0, 1)
}

/** The computer's read of where the ball will reach its line. */
function cpuRead(m: Match, s: State): { goal: number; n: number } {
  const c = crossing(s.ball, CPU_Y, m.spinAware)
  const n = s.n
  // A faster ball is harder to read.
  const err = (noise(m, n) * 2 - 1) * m.error * (Math.abs(s.ball.vy) / m.speed)
  return { goal: clamp(c.x + err, 0, W), n: n + 1 }
}

function substep(m: Match, s0: State, dt: number, input: Input): State {
  let s = s0
  // Your bat.
  const prev = s.me
  let me = s.me
  if (input.target != null) me += clamp(input.target - me, -ME_SPEED * dt, ME_SPEED * dt)
  else if (input.dir) me += input.dir * KEY_SPEED * dt
  me = clamp(me, -10, W + 10)
  s = { ...s, me, meV: (me - prev) / dt }

  if (s.phase === 'over') return s

  if (s.phase === 'serve') {
    const timer = s.timer - dt
    const bx = s.server === 'me' ? s.me : s.cpu
    if (timer > 0) {
      // Between points the computer walks back to the middle.
      const cpu = s.cpu + clamp(W / 2 - s.cpu, -m.cpuSpeed * dt, m.cpuSpeed * dt)
      return { ...s, timer, cpu, ball: { ...s.ball, x: s.server === 'me' ? s.me : cpu } }
    }
    // Serve: diagonal-ish, a little different every time.
    let n = s.n
    const r = noise(m, n++)
    const speed = m.speed * 0.9
    const start = clamp(bx, 8, W - 8)
    const goal = clamp(W / 2 + (r * 2 - 1) * W * 0.3, 10, W - 10)
    const fromMe = s.server === 'me'
    const t = (ME_Y - CPU_Y - 6) / speed
    const ball: Ball = { x: start, y: fromMe ? ME_Y - 3 : CPU_Y + 3, vx: (goal - start) / t, vy: fromMe ? -speed : speed, a: 0 }
    s = { ...s, phase: 'play', timer: 0, ball, lastHit: s.server, n, react: fromMe ? m.reaction : 0, cpuGoal: null, readFrom: s.cpu,
      stats: { ...s.stats, rally: 0 } }
    if (fromMe) { const read = cpuRead(m, s); s = { ...s, n: read.n, cpuGoal: read.goal } }
    return s
  }

  // The ball in flight.
  const b = s.ball
  const nb: Ball = { ...b, x: b.x + b.vx * dt + 0.5 * b.a * dt * dt, vx: b.vx + b.a * dt, y: b.y + b.vy * dt }

  // The computer's bat.
  let cpu = s.cpu, react = s.react
  if (b.vy < 0) {
    react = Math.max(0, react - dt)
    if (react === 0 && s.cpuGoal != null) cpu += clamp(s.cpuGoal - cpu, -m.cpuSpeed * dt, m.cpuSpeed * dt)
  } else if (m.recover) cpu += clamp(W / 2 - cpu, -m.cpuSpeed * 0.6 * dt, m.cpuSpeed * 0.6 * dt)
  s = { ...s, cpu, react, ball: nb }

  // Over the side before it reaches the far end: out.
  const toward = nb.vy > 0 ? ME_Y : CPU_Y
  const before = nb.vy > 0 ? nb.y < toward : nb.y > toward
  if (before && (nb.x < 0 || nb.x > W)) return point(m, s, s.lastHit === 'me' ? 'cpu' : 'me', 'out')

  const speed = Math.min(m.maxSpeed, Math.abs(b.vy) * SPEED_UP)
  if (b.vy > 0 && b.y < ME_Y && nb.y >= ME_Y) {
    const x = b.x + (nb.x - b.x) * ((ME_Y - b.y) / (nb.y - b.y))
    const off = (x - s.me) / m.bat
    if (Math.abs(x - s.me) > m.bat + BALL_R) return point(m, s, 'cpu', 'miss')
    const shot = returnShot(m, x, off, s.meV, speed)
    s = { ...s, lastHit: 'me', ball: { x, y: ME_Y, vx: shot.vx, vy: -speed, a: shot.a }, react: m.reaction, readFrom: s.cpu,
      stats: { ...s.stats, meHits: s.stats.meHits + 1, rally: s.stats.rally + 1 } }
    const read = cpuRead(m, s)
    return { ...s, n: read.n, cpuGoal: read.goal }
  }
  if (b.vy < 0 && b.y > CPU_Y && nb.y <= CPU_Y) {
    const x = b.x + (nb.x - b.x) * ((b.y - CPU_Y) / (b.y - nb.y))
    if (Math.abs(x - s.cpu) > m.cpuBat + BALL_R) return point(m, s, 'me', 'miss')
    s = { ...s, ball: { ...nb, x, y: CPU_Y } }
    const shot = cpuReturn(m, s, speed, pressureOn(m, s0, b))
    return { ...s, n: shot.n, lastHit: 'cpu', ball: { x, y: CPU_Y, vx: shot.vx, vy: speed, a: shot.a }, cpuGoal: null,
      stats: { ...s.stats, cpuHits: s.stats.cpuHits + 1, rally: s.stats.rally + 1 } }
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

/** Stands still. */
export const lazyBot = (): Input => ({ target: W / 2 })

/** Moves to where the ball will arrive and meets it square on. */
export function trackerBot(_m: Match, s: State): Input {
  if (s.phase !== 'play' || s.ball.vy <= 0) return { target: W / 2 }
  return { target: crossing(s.ball, ME_Y).x }
}

/**
 * Reads the ball, then meets it off centre so the return goes deep into the
 * corner furthest from the computer's bat.
 */
export function goodBot(m: Match, s: State): Input {
  if (s.phase !== 'play' || s.ball.vy <= 0) return { target: W / 2 }
  const c = crossing(s.ball, ME_Y)
  const xi = clamp(c.x, 0, W)
  const goal = s.cpu < W / 2 ? W - 10 : 10
  const off = clamp((goal - W / 2) / (W / 2 * m.spread), -0.9, 0.9)
  return { target: xi - off * m.bat }
}

/**
 * A player with human limits: starts moving only `reaction` seconds after the
 * computer's hit, misreads the arrival point by up to `error` (more as the
 * ball gets faster), and meets the ball square on, or aims away from the
 * computer, using up to `aim` of the bat, when `aim` is above 0.
 */
export function humanBot(reaction: number, error: number, aim = 0) {
  let rally = -1, seen = 0, wrong = 0
  return (m: Match, s: State): Input => {
    if (s.phase !== 'play' || s.ball.vy <= 0) { rally = -1; return { target: W / 2 } }
    const key = s.stats.cpuHits * 1000 + s.score[0] + s.score[1] * 50
    if (key !== rally) {
      rally = key; seen = 0
      wrong = (noise(m, key * 7 + 3) * 2 - 1) * error * Math.abs(s.ball.vy) / 80
    }
    seen += 1 / 60
    if (seen < reaction) return { target: null }
    const at = crossing(s.ball, ME_Y).x
    if (!aim) return { target: at + wrong }
    const goal = s.cpu < W / 2 ? W - 10 : 10
    return { target: at - clamp((goal - W / 2) / (W / 2 * m.spread), -aim, aim) * m.bat + wrong }
  }
}

/** Plays a whole match with a bot; returns the final state. */
export function playMatch(m: Match, bot: (m: Match, s: State) => Input, maxSeconds = 900): State {
  let s = initialState(m)
  const dt = 1 / 60
  for (let t = 0; t < maxSeconds && s.phase !== 'over'; t += dt) s = step(m, s, dt, bot(m, s))
  return s
}
