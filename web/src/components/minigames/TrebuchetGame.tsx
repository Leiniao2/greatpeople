import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, randInt, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Trebuchet — set the engine, loose the stone and let gravity (and, in the
// harder scenes, air drag and wind) fly it.  The flight is integrated step by
// step: a = (0, −g) − k·|v − w|·(v − w), with k = ½ρC_dA/m for a stone ball.
//
// A counterweight trebuchet turns the fall of its counterweight into the
// swing of the arm.  With short arm l, long arm + sling R, counterweight M
// falling through H and stone m (efficiency η):
//     ½ω²(M·l² + m·R²) = η·M·g·H   →   v = ω·R
// so a heavier counterweight helps less and less, a longer sling throws
// faster, and the release angle trades height for distance.  The bombard
// instead turns a powder charge c into muzzle speed v = √(2·K·c/m).
//
// Four scenes, each a different rule:
//   keep       Kenilworth 1266: no drag; clear the curtain wall and strike the
//              keep's face inside the marked band.
//   tower      Xiangyang 1273: every stone in the pile weighs something
//              different — retune the engine for each shot to hit the tower.
//   crag       Stirling 1304: the castle stands on a crag; air drag and a wind
//              bend the flight, so the drag-free reckoning falls short or long.
//   walls      Constantinople 1453: a bombard (charge + elevation, with drag);
//              breach the outer wall, then lob a ball over it onto the inner wall.
//
//   Stones: D1 6, D2 5, D3 5, D4 4 (bombard: 8, 7, 6, 5 for two hits).
//   The target band narrows with the tier; D1–D2 preview the start of the arc.
//
// Every level is built from the seed around a randomly chosen winning setting,
// then every setting is simulated: the level is kept only if winners exist for
// every target (and every stone), they are a small share of all settings, and
// neither the starting setting nor all-minimum / all-maximum wins.

export type Kind = 'keep' | 'tower' | 'crag' | 'walls'

interface TrebuchetConfig {
  title: string
  rule: string
  intro: string
  fact: string
  kind: Kind
}

export const CONFIGS: Record<string, TrebuchetConfig> = {
  'kenilworth-1266': {
    title: 'The Siege of Kenilworth, 1266',
    rule: 'Clear the curtain, strike the keep',
    intro: 'The royal engines stand across the mere. Set the counterweight, the sling and the release angle so the stone clears the curtain wall and strikes the keep inside the marked band.',
    fact: 'The siege of Kenilworth (June–December 1266) was the longest in medieval England. Henry III’s engines could not close in across the castle’s great artificial lake, the mere, and the garrison held out until hunger and disease forced it to surrender.',
    kind: 'keep',
  },
  'xiangyang-1273': {
    title: 'The Muslim Trebuchet at Xiangyang, 1273',
    rule: 'Every stone weighs differently',
    intro: 'The stones in the pile are not all alike: the weight of the next one is shown. A heavier stone flies slower from the same engine, so retune for every shot and hit the tower on the wall.',
    fact: 'Kublai Khan’s army took Xiangyang in 1273, after a siege of about five years, with counterweight trebuchets built by Ismail and Ala al-Din, engineers sent from the Ilkhanate; Chinese sources called them “Muslim trebuchets” (Huihui pao). Their stones broke a tower of the walls and the city surrendered.',
    kind: 'tower',
  },
  'stirling-1304': {
    title: 'Warwolf at Stirling, 1304',
    rule: 'Wind and drag, uphill onto the crag',
    intro: 'Stirling Castle sits on its crag. The air drags at the stone and the wind pushes it (see the arrow), so the flight is shorter or longer than the plain arc. Clear the rock and strike the castle wall.',
    fact: 'At the siege of Stirling Castle in 1304 Edward I had a giant trebuchet, “Warwolf”, built. When the garrison offered to surrender, Edward refused until Warwolf had been tried against the walls.',
    kind: 'crag',
  },
  'constantinople-1453': {
    title: 'The Bombards of 1453',
    rule: 'Bombard: breach outer, then inner wall',
    intro: 'Set the powder charge and the elevation of the great bombard; the heavy ball still slows in the air. First strike the outer wall in the band, then lob a ball over it onto the inner wall behind.',
    fact: 'Mehmed II’s bombards battered the Theodosian Walls for six weeks; the largest, cast by the founder Orban, is said to have fired stone balls of about half a tonne but could be loaded only a few times a day. The city fell on 29 May 1453.',
    kind: 'walls',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Physics ───────────────────────────────────────────────────────────────────

export const G = 9.81
const RHO_AIR = 1.225
const CD = 0.47
const GRANITE = 2700
const DEG = Math.PI / 180
export const DT = 0.02

/** Drag coefficient k = ½ρC_dA/m for a granite ball of mass m (kg). */
export function dragK(m: number): number {
  const r = Math.cbrt((3 * m / GRANITE) / (4 * Math.PI))
  return 0.5 * RHO_AIR * CD * Math.PI * r * r / m
}

export interface Engine {
  /** Short arm (m), long arm (m), counterweight drop (m), efficiency. */
  l: number; arm: number; drop: number; eta: number
  /** Height of the release point (m). */
  y0: number
}

/** Release speed of a counterweight trebuchet (energy balance on the arm). */
export function trebuchetSpeed(e: Engine, cwT: number, sling: number, stone: number): number {
  const M = cwT * 1000, R = e.arm + sling
  const w2 = 2 * e.eta * M * G * e.drop / (M * e.l * e.l + stone * R * R)
  return Math.sqrt(w2) * R
}

/** Powder energy delivered to the ball, J per kg of charge. */
export const POWDER_K = 120_000
export const bombardSpeed = (chargeKg: number, ball: number) => Math.sqrt(2 * POWDER_K * chargeKg / ball)

export interface Phys { k: number; wind: number }
export interface Path { xs: Float32Array; ys: Float32Array; n: number }

/** Fly a stone from (0, y0) until it lands (y < 0) or passes xMax. */
export function fly(v: number, angleDeg: number, y0: number, phys: Phys, xMax: number): Path {
  const cap = 1200
  const xs = new Float32Array(cap), ys = new Float32Array(cap)
  let x = 0, y = y0, vx = v * Math.cos(angleDeg * DEG), vy = v * Math.sin(angleDeg * DEG)
  let n = 0
  xs[n] = x; ys[n] = y; n++
  while (n < cap) {
    const rx = vx - phys.wind, ry = vy
    const sp = Math.hypot(rx, ry)
    vx += -phys.k * sp * rx * DT
    vy += (-G - phys.k * sp * ry) * DT
    x += vx * DT; y += vy * DT
    xs[n] = x; ys[n] = y; n++
    if (y < 0 || x > xMax || vx <= 0) break
  }
  return { xs, ys, n }
}

/** Height of the path at x, or null if it never gets that far. */
export function yAt(p: Path, x: number): number | null {
  if (p.xs[p.n - 1] < x) return null
  let lo = 0, hi = p.n - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p.xs[mid] < x) lo = mid; else hi = mid }
  const x0 = p.xs[lo], x1 = p.xs[hi]
  const f = x1 === x0 ? 0 : (x - x0) / (x1 - x0)
  return p.ys[lo] + f * (p.ys[hi] - p.ys[lo])
}

/** Where the stone comes down (x at y = 0), or the last x if it never lands. */
function landX(p: Path): number {
  const i = p.n - 1
  if (p.ys[i] >= 0 || i === 0) return p.xs[i]
  const f = p.ys[i - 1] / (p.ys[i - 1] - p.ys[i])
  return p.xs[i - 1] + f * (p.xs[i] - p.xs[i - 1])
}

// ── Levels ────────────────────────────────────────────────────────────────────

export interface Control { key: string; label: string; values: number[]; unit: string; decimals: number }
/** A wall face at x, solid from the ground to `top`.  As a target, a hit counts in [lo, top]. */
export interface Structure { x: number; top: number; lo: number; depth: number; name: string; target: boolean }
export interface Zone { x0: number; x1: number; name: string }

export interface Level {
  kind: Kind
  difficulty: Difficulty
  engine: 'trebuchet' | 'bombard'
  controls: Control[]
  /** Stone mass for each shot (kg). */
  stones: number[]
  shots: number
  phys: Phys
  y0: number
  eng: Engine
  /** Obstacles (not targets), e.g. a curtain wall or the crag face. */
  obstacles: Structure[]
  /** Targets, to be hit in order. */
  targets: Structure[]
  /** Water or moat drawn on the ground. */
  zones: Zone[]
  /** Height of the crag the castle stands on (crag only). */
  crag: { x0: number; h: number } | null
  /** Height of the city wall the tower stands on (tower only). */
  wallH: number
  preview: number
  viewW: number
  start: number[]
  /** Winning setting for target t with stone 0 (built in). */
  solution: number[][]
  /** Precomputed flights: paths[stoneSlot][comboIndex]. */
  paths: Path[][]
  /** Shot index → which stone slot (distinct masses share paths). */
  slotOf: number[]
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = []
  for (let k = 0; from + k * step <= to + 1e-9; k++) out.push(+(from + k * step).toFixed(6))
  return out
}
const ctl = (key: string, label: string, values: number[], unit: string, decimals: number): Control => ({ key, label, values, unit, decimals })
export const formatValue = (c: Control, v: number) => `${v.toFixed(c.decimals)}${c.unit}`
export const comboCount = (L: Pick<Level, 'controls'>) => L.controls.reduce((n, c) => n * c.values.length, 1)

export function comboIndex(L: Pick<Level, 'controls'>, idx: number[]): number {
  let n = 0
  for (let k = L.controls.length - 1; k >= 0; k--) n = n * L.controls[k].values.length + idx[k]
  return n
}
export function comboOf(L: Pick<Level, 'controls'>, n: number): number[] {
  return L.controls.map(c => { const i = n % c.values.length; n = Math.floor(n / c.values.length); return i })
}

function launchPath(L: Pick<Level, 'engine' | 'controls' | 'eng' | 'phys' | 'y0' | 'viewW'>, idx: number[], stone: number): Path {
  const vals = L.controls.map((c, k) => c.values[idx[k]])
  if (L.engine === 'bombard') {
    const [charge, elev] = vals
    return fly(bombardSpeed(charge, stone), elev, L.y0, L.phys, L.viewW * 1.4)
  }
  const [cw, sling, angle] = vals
  return fly(trebuchetSpeed(L.eng, cw, sling, stone), angle, L.y0, L.phys, L.viewW * 1.4)
}

export interface Shot { win: boolean; reason: string; note: string; path: Path; endX: number; endY: number }

/** Judge a flight against target `t` (earlier targets are now just walls). */
export function judge(L: Level, p: Path, t: number): Omit<Shot, 'path'> {
  const tgt = L.targets[t]
  const walls = [...L.obstacles, ...L.targets.slice(0, t + 1)].sort((a, b) => a.x - b.x)
  for (const s of walls) {
    if (s.x > tgt.x) break
    const y = yAt(p, s.x)
    const lx = landX(p)
    if (y === null || y < 0) {
      const zone = L.zones.find(z => lx >= z.x0 && lx <= z.x1)
      const short = (tgt.x - lx).toFixed(0)
      return { win: false, reason: zone ? `Into the ${zone.name}` : 'Fell short', note: `The stone came down ${short} m short of the ${tgt.name}.`, endX: lx, endY: 0 }
    }
    if (y < s.top) {
      if (s === tgt) {
        if (y >= s.lo) return { win: true, reason: 'Hit', note: `Struck the ${s.name} ${y.toFixed(1)} m up.`, endX: s.x, endY: y }
        return { win: false, reason: 'Too low', note: `Struck the ${s.name} at ${y.toFixed(1)} m — the band starts at ${s.lo.toFixed(1)} m.`, endX: s.x, endY: y }
      }
      return { win: false, reason: `Struck the ${s.name}`, note: `Hit the ${s.name} ${(s.top - y).toFixed(1)} m below its top.`, endX: s.x, endY: y }
    }
    if (s === tgt) {
      const lx2 = landX(p)
      return { win: false, reason: 'Too high', note: `Passed ${(y - s.top).toFixed(1)} m over the ${s.name} and came down ${Math.max(0, lx2 - s.x).toFixed(0)} m behind it.`, endX: lx2, endY: 0 }
    }
  }
  return { win: false, reason: 'Missed', note: 'The stone missed.', endX: landX(p), endY: 0 }
}

export function evaluate(L: Level, idx: number[], t = 0, shot = 0): Shot {
  const p = L.paths[L.slotOf[Math.min(shot, L.slotOf.length - 1)]][comboIndex(L, idx)]
  return { ...judge(L, p, t), path: p }
}

/** All winning settings for target t with the stone of shot `shot`. */
export function solve(L: Level, t = 0, shot = 0): number[][] {
  const slot = L.slotOf[Math.min(shot, L.slotOf.length - 1)]
  const out: number[][] = []
  L.paths[slot].forEach((p, n) => { if (judge(L, p, t).win) out.push(comboOf(L, n)) })
  return out
}

const SHARE_MAX = [0.12, 0.08, 0.06, 0.045]

function descendX(p: Path, y: number): number | null {
  // First x on the falling branch where the path comes down through height y.
  for (let i = 1; i < p.n; i++) {
    if (p.ys[i] < p.ys[i - 1] && p.ys[i - 1] >= y && p.ys[i] < y) {
      const f = (p.ys[i - 1] - y) / (p.ys[i - 1] - p.ys[i])
      return p.xs[i - 1] + f * (p.xs[i] - p.xs[i - 1])
    }
  }
  return null
}

function interior(rng: Rng, n: number): number { return randInt(rng, 1, n - 2) }

export function generate(kind: Kind, difficulty: Difficulty, seed: number, depth = 0): Level {
  const rng = mulberry32(seed ^ hashString('trebuchet:' + kind))
  const d = difficulty
  const bombard = kind === 'walls'
  const shots = bombard ? scale(d, [8, 7, 6, 5]) : scale(d, [6, 5, 5, 4])
  const eng: Engine = kind === 'crag'
    ? { l: 1.6, arm: 10, drop: 3.4, eta: 0.7, y0: 11 }
    : { l: 1.5, arm: 8, drop: 3, eta: 0.7, y0: 9 }
  const controls = bombard
    ? [ctl('charge', 'Powder charge', range(20, 60, 2), ' kg', 0), ctl('elev', 'Elevation', range(0.5, 12, 0.5), '°', 1)]
    : [
        ctl('cw', 'Counterweight', kind === 'crag' ? range(6, 22, 2) : range(4, 20, 2), ' t', 0),
        ctl('sling', 'Sling length', range(2, 8, 1), ' m', 0),
        ctl('angle', 'Release angle', range(25, 65, 5), '°', 0),
      ]

  // Stones and air.
  let stones: number[]
  if (kind === 'tower') {
    const pile = [60, 70, 80, 90, 100, 110, 120]
    stones = Array.from({ length: shots }, (_, i) => (i === 0 ? pile[randInt(rng, 2, 4)] : pile[randInt(rng, 0, pile.length - 1)]))
  } else {
    const m = kind === 'crag' ? 140 : bombard ? 544 : 100
    stones = Array(shots).fill(m)
  }
  const wind = kind === 'crag' ? (rng() < 0.5 ? -1 : 1) * scale(d, [4, 6, 8, 10]) * (0.8 + 0.4 * rng()) : 0
  const phys: Phys = { k: kind === 'crag' || bombard ? dragK(stones[0]) : 0, wind: +wind.toFixed(1) }
  const y0 = bombard ? 1.5 : eng.y0
  const viewW = bombard ? 700 : 300

  const distinct = [...new Set(stones)]
  const slotOf = stones.map(m => distinct.indexOf(m))
  const shell = { engine: (bombard ? 'bombard' : 'trebuchet') as Level['engine'], controls, eng, phys, y0, viewW }
  const N = comboCount(shell)
  const paths = distinct.map(m => Array.from({ length: N }, (_, n) => launchPath(shell, comboOf(shell, n), m)))

  const base: Level = {
    kind, difficulty: d, ...shell, stones, shots, obstacles: [], targets: [], zones: [], crag: null, wallH: 0,
    preview: scale(d, [0.35, 0.2, 0, 0]), start: [], solution: [], paths, slotOf,
  }

  const band = scale(d, [9, 6.5, 5, 4])
  const shareMax = SHARE_MAX[d - 1]

  for (let attempt = 0; attempt < 120; attempt++) {
    const sol = controls.map(c => interior(rng, c.values.length))
    const sp = paths[0][comboIndex(shell, sol)]
    const L: Level = { ...base, obstacles: [], targets: [], zones: [], crag: null, wallH: 0 }

    if (kind === 'keep') {
      const yt = 5 + rng() * 9
      const D = descendX(sp, yt)
      if (D === null || D < 110 || D > 260) continue
      const gap = randInt(rng, 16, 26)
      const yc = yAt(sp, D - gap)
      if (yc === null) continue
      const hc = Math.min(11, yc - 1.2)
      if (hc < 6) continue
      const top = yt + 1 + rng() * 2.5
      L.obstacles = [{ x: D - gap, top: hc, lo: 0, depth: 4, name: 'curtain wall', target: false }]
      L.targets = [{ x: D, top, lo: Math.max(0, top - band), depth: 16, name: 'keep', target: true }]
      L.zones = [{ x0: 30, x1: D - gap - 8, name: 'mere' }]
    } else if (kind === 'tower') {
      const wallH = randInt(rng, 9, 12)
      const th = band + 2
      const lo = wallH + th - band
      const yt = lo + 0.4 + rng() * (band - 0.8)
      const D = descendX(sp, yt)
      if (D === null || D < 110 || D > 260) continue
      L.targets = [{ x: D, top: wallH + th, lo, depth: 7, name: 'tower', target: true }]
      L.obstacles = []
      L.zones = [{ x0: 35, x1: D - 25, name: 'Han river' }]
      L.wallH = wallH
    } else if (kind === 'crag') {
      const h = randInt(rng, 20, 30)
      const top = h + 10
      const lo = top - band
      const yt = lo + 0.4 + rng() * (band - 0.8)
      const D = descendX(sp, yt)
      if (D === null || D < 110 || D > 260) continue
      const ledge = randInt(rng, 10, 16)
      const yc = yAt(sp, D - ledge)
      if (yc === null || yc < h + 0.8) continue
      L.crag = { x0: D - ledge, h }
      L.obstacles = [{ x: D - ledge, top: h, lo: 0, depth: ledge, name: 'castle rock', target: false }]
      L.targets = [{ x: D, top, lo, depth: 14, name: 'castle wall', target: true }]
    } else {
      const lo0 = Math.max(0, 8.5 - band * 1.3)
      const yt = lo0 + 0.4 + rng() * (8.1 - lo0 - 0.4)
      const D = descendX(sp, yt)
      if (D === null || D < 300 || D > 620) continue
      const inner = D + 18
      L.targets = [
        { x: D, top: 8.5, lo: lo0, depth: 3, name: 'outer wall', target: true },
        { x: inner, top: 12, lo: Math.max(0, 12 - band * 1.6), depth: 5, name: 'inner wall', target: true },
      ]
      L.zones = [{ x0: D - 22, x1: D - 3, name: 'moat' }]
    }

    // The built-in solution must win; find winners for every target and stone.
    if (!judge(L, sp, 0).win) continue
    const solution: number[][] = []
    let ok = true
    for (let t = 0; t < L.targets.length && ok; t++) {
      const wins = solve(L, t, 0)
      if (wins.length < 2 || wins.length / N > shareMax) { ok = false; break }
      solution.push(t === 0 ? sol : wins[Math.floor(rng() * wins.length)])
    }
    if (!ok) continue
    if (kind === 'tower') {
      for (let s = 1; s < shots && ok; s++) if (solve(L, 0, s).length < 1) ok = false
      if (!ok) continue
    }
    const mins = controls.map(() => 0)
    const maxs = controls.map(c => c.values.length - 1)
    const loses = (idx: number[]) => L.targets.every((_, t) => !evaluate(L, idx, t, 0).win)
    if (!loses(mins) || !loses(maxs)) continue
    const mid = controls.map(c => Math.floor(c.values.length / 2))
    let start = mid
    if (!loses(start)) start = mid.map((m, k) => (m + 2) % controls[k].values.length)
    if (!loses(start)) continue
    L.solution = solution
    L.start = start
    return L
  }
  // Extremely unlikely: retry with a derived seed.
  if (depth > 8) throw new Error(`trebuchet: no level for ${kind} d${difficulty}`)
  return generate(kind, difficulty, (seed * 31 + 7) >>> 0, depth + 1)
}

// ── Component ─────────────────────────────────────────────────────────────────

const ANIM_MS = 1400
const TICK_MS = 40

function pathD(p: Path, endX: number, frac = 1, sy = 1): string {
  let d = ''
  const step = Math.max(1, Math.floor(p.n / 160))
  const upto = Math.max(2, Math.floor(p.n * frac))
  for (let i = 0; i < upto; i += step) {
    if (p.xs[i] > endX) break
    d += `${i ? 'L' : 'M'}${p.xs[i].toFixed(1)} ${(-p.ys[i] * sy).toFixed(1)}`
  }
  return d
}

function headAt(p: Path, endX: number, frac: number): [number, number] {
  const i = Math.min(p.n - 1, Math.floor((p.n - 1) * frac))
  if (p.xs[i] > endX) { const y = yAt(p, endX) ?? 0; return [endX, Math.max(0, y)] }
  return [p.xs[i], Math.max(0, p.ys[i])]
}

export default function TrebuchetGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'kenilworth-1266')
  const L = useMemo(() => generate(config.kind, difficulty, seed), [config.kind, difficulty, seed])
  const [idx, setIdx] = useState<number[]>(L.start)
  const [used, setUsed] = useState(0)
  const [hits, setHits] = useState(0)
  const [ghosts, setGhosts] = useState<Shot[]>([])
  const [anim, setAnim] = useState<{ shot: Shot; frac: number } | null>(null)
  const [last, setLast] = useState<Shot | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const usedRef = useRef(0)
  const hitsRef = useRef(0)

  useEffect(() => { setIdx(L.start); setUsed(0); setHits(0); setGhosts([]); setLast(null); usedRef.current = 0; hitsRef.current = 0 }, [L])

  const stone = L.stones[Math.min(used, L.stones.length - 1)]
  const preview = useMemo(() => (L.preview > 0 && !settled ? evaluate(L, idx, Math.min(hits, L.targets.length - 1), used) : null), [L, idx, hits, used, settled])

  const setCtl = (k: number, v: number) => {
    if (settled || anim) return
    const n = L.controls[k].values.length
    setIdx(prev => prev.map((x, j) => (j === k ? Math.max(0, Math.min(n - 1, v)) : x)))
  }

  const loose = useCallback(() => {
    if (settled || anim) return
    const shot = evaluate(L, idx, hitsRef.current, usedRef.current)
    usedRef.current += 1
    setUsed(usedRef.current)
    setAnim({ shot, frac: 0 })
  }, [settled, anim, L, idx])

  useEffect(() => {
    if (!anim) return
    const iv = setInterval(() => setAnim(a => (a ? { ...a, frac: Math.min(1, a.frac + TICK_MS / ANIM_MS) } : a)), TICK_MS)
    return () => clearInterval(iv)
  }, [anim !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!anim || anim.frac < 1) return
    const shot = anim.shot
    setAnim(null)
    setLast(shot)
    setGhosts(g => [...g.slice(-2), shot])
    if (shot.win) { hitsRef.current += 1; setHits(hitsRef.current) }
    if (hitsRef.current >= L.targets.length) win()
    else if (usedRef.current >= L.shots) lose(`${shot.reason} — no ${L.engine === 'bombard' ? 'balls' : 'stones'} left`)
  }, [anim, L, win, lose])

  // Scene: x in metres, y exaggerated ×SY so walls read on a phone.
  const tgtLast = L.targets[L.targets.length - 1]
  const W = Math.max(L.viewW * 0.6, tgtLast.x + tgtLast.depth + 25)
  const SY = L.engine === 'bombard' ? 3 : 1.4
  const H = Math.max(W * 0.5, (L.crag ? L.crag.h + 20 : 30) * SY)
  const left = L.shots - used
  const cur = Math.min(hits, L.targets.length - 1)
  const showing = anim?.shot
  const head = showing ? headAt(showing.path, showing.endX, anim!.frac) : null
  const sw = W / 300

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p data-testid="treb-left" className={`font-bold tabular-nums ${left <= 1 ? 'text-red-600' : 'text-accent'}`}>● {left}/{L.shots}</p>
          {L.targets.length > 1 && <p data-testid="treb-hits" className="tabular-nums">hits {hits}/{L.targets.length}</p>}
        </div>
      </div>

      <p className="text-ink-2 text-xs font-bold" data-testid="treb-goal">
        {config.rule}: strike the {L.targets[cur].name} between {L.targets[cur].lo.toFixed(1)} and {L.targets[cur].top.toFixed(1)} m
        {L.targets.length > 1 && cur === 0 ? ', then the inner wall' : ''}.
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted -mt-1">
        <span data-testid="treb-stone">{L.engine === 'bombard' ? 'Ball' : 'Next stone'}: <b className="text-ink-2">{stone} kg</b></span>
        <span>Range: <b className="text-ink-2">{L.targets[cur].x.toFixed(0)} m</b></span>
        {L.phys.k > 0 && <span>Air drag on</span>}
        {L.phys.wind !== 0 && <span data-testid="treb-wind">Wind: <b className="text-ink-2">{L.phys.wind > 0 ? '→ tail' : '← head'} {Math.abs(L.phys.wind).toFixed(1)} m/s</b></span>}
      </div>

      <div className="w-full rounded-xl border border-line overflow-hidden" style={{ background: 'linear-gradient(#dbe8f2, #f3eee2)' }}>
        <svg viewBox={`-8 ${-H} ${W + 8} ${H + 6}`} className="w-full block" style={{ aspectRatio: `${(W + 8) / (H + 6)}` }} data-testid="treb-scene">
          <rect x={-8} y={0} width={W + 16} height={6} fill="#a3946b" />
          {L.zones.map((z, k) => <rect key={k} x={z.x0} y={-0.6} width={z.x1 - z.x0} height={6.6} fill="#6aa5c8" opacity={0.8} />)}
          {L.crag && <path d={`M${L.crag.x0} 0L${L.crag.x0 + 4} ${-L.crag.h * SY}L${W + 8} ${-L.crag.h * SY}L${W + 8} 0Z`} fill="#8b8172" />}
          {L.obstacles.filter(o => o.name !== 'castle rock').map((o, k) => (
            <rect key={k} x={o.x} y={-o.top * SY} width={o.depth} height={o.top * SY} fill="#9c8f78" stroke="#6d6250" strokeWidth={0.6 * sw} />
          ))}
          {L.targets.map((t, k) => {
            const base = L.crag ? L.crag.h : 0
            const done = k < hits
            return (
              <g key={k}>
                <rect x={t.x} y={-t.top * SY} width={t.depth} height={(t.top - base) * SY} fill={done ? '#7c6f5a' : '#b5a68a'} stroke="#6d6250" strokeWidth={0.6 * sw} />
                {k === cur && !settled && <rect data-testid="treb-band" x={t.x - 1.5 * sw} y={-t.top * SY} width={3 * sw} height={(t.top - t.lo) * SY} fill="#ef4444" opacity={0.85} />}
              </g>
            )
          })}
          {L.kind === 'tower' && (() => {
            const t = L.targets[0]
            const wallH = L.wallH
            return <rect x={t.x - 2} y={-wallH * SY} width={t.depth + 30} height={wallH * SY} fill="#9c8f78" stroke="#6d6250" strokeWidth={0.6 * sw} />
          })()}

          {/* engine */}
          <g>
            <rect x={-4 * sw} y={-L.y0 * SY * 0.6} width={8 * sw} height={L.y0 * SY * 0.6} fill="#7a5c3a" />
            <circle cx={0} cy={-L.y0 * SY} r={2.2 * sw} fill="#4b3a26" />
          </g>

          {ghosts.map((g, k) => (
            <path key={k} d={pathD(g.path, g.endX, 1, SY)} fill="none" stroke={g.win ? '#059669' : '#64748b'} strokeOpacity={0.4} strokeWidth={0.8 * sw} />
          ))}
          {preview && !anim && (
            <path data-testid="treb-preview" d={pathD(preview.path, preview.endX, L.preview, SY)} fill="none" stroke="#1e293b" strokeOpacity={0.6} strokeWidth={0.9 * sw} strokeDasharray={`${3 * sw} ${3 * sw}`} />
          )}
          {showing && head && <>
            <path d={pathD(showing.path, showing.endX, anim!.frac, SY)} fill="none" stroke="#b45309" strokeWidth={1.1 * sw} />
            <circle cx={head[0]} cy={-head[1] * SY} r={2 * sw} fill="#44403c" />
          </>}
          {L.phys.wind !== 0 && (
            <g transform={`translate(${W * 0.12} ${-H * 0.85})`}>
              <line x1={L.phys.wind > 0 ? 0 : 24 * sw} x2={L.phys.wind > 0 ? 24 * sw : 0} y1={0} y2={0} stroke="#0f172a" strokeWidth={1.2 * sw} markerEnd="url(#treb-arrow)" />
            </g>
          )}
          <defs>
            <marker id="treb-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0L10 5L0 10Z" fill="#0f172a" />
            </marker>
          </defs>
        </svg>
      </div>

      <div className="flex flex-col gap-2">
        {L.controls.map((c, k) => (
          <div key={c.key} className="bg-panel border border-line rounded-lg px-2.5 py-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-ink-2 font-bold">{c.label}</span>
              <span className="text-accent font-bold tabular-nums" data-testid={`treb-val-${c.key}`}>{formatValue(c, c.values[idx[k]])}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button type="button" aria-label={`decrease ${c.label}`} onClick={() => setCtl(k, idx[k] - 1)} disabled={settled || !!anim}
                className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">−</button>
              <input type="range" min={0} max={c.values.length - 1} step={1} value={idx[k]} data-testid={`treb-ctl-${c.key}`}
                aria-label={c.label} disabled={settled || !!anim}
                onChange={e => setCtl(k, Number(e.target.value))} className="flex-1 h-8 touch-pan-y" />
              <button type="button" aria-label={`increase ${c.label}`} onClick={() => setCtl(k, idx[k] + 1)} disabled={settled || !!anim}
                className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">+</button>
            </div>
          </div>
        ))}
      </div>

      {!settled && (
        <button type="button" data-testid="treb-loose" onClick={loose} disabled={!!anim}
          className={`h-11 rounded-xl font-bold text-sm ${anim ? 'bg-panel text-muted' : 'bg-accent text-accent-fg active:scale-[0.98]'}`}>
          {anim ? 'In flight…' : `${L.engine === 'bombard' ? 'Fire' : 'Loose'} (${left} left)`}
        </button>
      )}

      {last && !anim && (
        <p className="text-[11px] leading-relaxed text-ink-2" data-testid="treb-note">
          <span className={`font-bold ${last.win ? 'text-emerald-700' : 'text-red-600'}`}>{last.reason}. </span>{last.note}
        </p>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The wall is breached!" loseTitle={reason ?? 'The walls still stand'} />
    </div>
  )
}
