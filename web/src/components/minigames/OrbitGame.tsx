import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Orbits: set a launch (or a pair of burns) and watch Newton's gravity do the
// rest.  The Sun sits at the origin with GM = 1, so distances are in AU and
// one year is 2π time units.  Every control is a stepper over a short list of
// values, so a level is a finite set of settings; the generator simulates all
// of them with the same fixed-step leapfrog integrator the game uses and keeps
// a seeded level only if some setting wins and few enough do.
//
// Four scenarios, each with its own goal:
//   kepler     launch a planet so its ellipse passes through Tycho's sightings
//   hohmann    two burns from Earth's orbit onto a target planet's orbit
//              (D3+: and arrive when the planet is there)
//   slingshot  your rocket alone cannot reach the outer system; swing past a
//              moving Jupiter to get there (D3+: through a target sector)
//   halley     choose the comet's speed so it returns on the predicted date
//              (Kepler's 3rd law; D2+ aphelion band; D3+ Jupiter perturbs it)
//
//   Shots: D1 5, D2 5, D3 4, D4 4.  Preview of the start of the path at D1–D2.

export type Kind = 'kepler' | 'hohmann' | 'slingshot' | 'halley'

interface OrbitConfig {
  title: string
  intro: string
  fact: string
  kind: Kind
}

export const CONFIGS: Record<string, OrbitConfig> = {
  'kepler-ellipse': {
    title: 'Kepler’s Ellipse, 1609',
    intro: 'Tycho Brahe’s sightings of Mars are marked on the chart. Choose the planet’s launch speed and angle so its orbit passes through every sighting and comes all the way round.',
    fact: 'In Astronomia nova (1609) Johannes Kepler used Tycho Brahe’s observations of Mars to show that planets move on ellipses with the Sun at one focus.',
    kind: 'kepler',
  },
  'qing-observatory': {
    title: 'The Beijing Observatory',
    intro: 'The Jesuit astronomers of the Imperial Astronomical Bureau have marked a planet’s sightings on the chart. Choose its launch speed and angle so the orbit passes through every sighting and comes all the way round.',
    fact: 'Jesuit astronomers ran the Qing Imperial Astronomical Bureau in Beijing for over a century. Under Ignaz Kögler the Bureau compiled the Lixiang kaocheng houbian (1742), which brought Kepler’s elliptical orbits into the official calendar.',
    kind: 'kepler',
  },
  'hill-of-the-star': {
    title: 'The Hill of the Star, 1455',
    intro: 'At the end of a 52-year cycle the sky must prove it will go on. The watchers have marked where a wandering light was seen night after night. Choose its launch speed and angle so its path passes through every sighting and comes all the way round.',
    fact: 'Every 52 years the Mexica put out every fire and held the New Fire ceremony: on the Hill of the Star near Tenochtitlan, priests watched for the Pleiades to cross the sky at midnight — the sign the world would go on — and kindled a new fire. Ceremonies were held in 1455, in Tlacaelel’s lifetime, and in 1507.',
    kind: 'kepler',
  },
  'hohmann-transfer': {
    title: 'Hohmann’s Transfer, 1925',
    intro: 'Your ship circles with the Earth. Burn 1 stretches the orbit out to the target planet’s; burn 2 fires automatically at the far point (aphelion) and must round the orbit off.',
    fact: 'The German engineer Walter Hohmann published the fuel-saving two-burn transfer between circular orbits in “Die Erreichbarkeit der Himmelskörper” (1925); probes to Mars still fly close to it.',
    kind: 'hohmann',
  },
  'grand-tour': {
    title: 'Voyager’s Slingshot, 1977',
    intro: 'Your rocket is too weak to reach the outer ring on its own. Time the launch so the ship falls close behind the moving Jupiter and is flung outward by its gravity.',
    fact: 'Voyager 2, launched in 1977, used a rare alignment of the outer planets to swing past Jupiter, Saturn, Uranus and Neptune — gravity assists worked out by Michael Minovitch in the 1960s.',
    kind: 'slingshot',
  },
  'halley-return': {
    title: 'Halley’s Comet, 1758',
    intro: 'Set the comet’s speed at its sighting so it comes back on the predicted date. Kepler’s third law: period² = a³ (years, AU), where a is half the longest width of the ellipse.',
    fact: 'Edmond Halley predicted in 1705 that the comet of 1682 would return in 1758. Alexis Clairaut, adding the pull of Jupiter and Saturn, forecast perihelion for April 1759; it came on 13 March.',
    kind: 'halley',
  },
  'great-comet-1680': {
    title: 'The Great Comet of 1680',
    intro: 'The comet’s positions are marked on the chart as astronomers saw them over the winter of 1680. Choose its speed and angle at the first sighting so its path passes through every mark and comes all the way round.',
    fact: 'Gottfried Kirch found the Great Comet of 1680 on 14 November — the first comet discovered with a telescope. It blazed over Rome as Bernini lay dying; he died on 28 November. Newton used its track in the Principia (1687) to show that comets, like planets, move under the Sun’s gravity on conic orbits.',
    kind: 'kepler',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Physics ───────────────────────────────────────────────────────────────────

export interface Planet { r: number; phase: number; omega: number; mass: number; radius: number }

export function planetPos(p: Planet, t: number): [number, number] {
  const a = p.phase + p.omega * t
  return [p.r * Math.cos(a), p.r * Math.sin(a)]
}

export interface State { x: number; y: number; vx: number; vy: number; t: number; ax: number; ay: number }

function accelInto(s: State, pl: Planet | null) {
  const r2 = s.x * s.x + s.y * s.y
  const r3 = r2 * Math.sqrt(r2)
  let ax = -s.x / r3, ay = -s.y / r3
  if (pl) {
    const [px, py] = planetPos(pl, s.t)
    const dx = px - s.x, dy = py - s.y
    const d2 = dx * dx + dy * dy
    const d3 = d2 * Math.sqrt(d2)
    ax += pl.mass * dx / d3
    ay += pl.mass * dy / d3
  }
  s.ax = ax; s.ay = ay
}

export function makeState(x: number, y: number, vx: number, vy: number, pl: Planet | null, t = 0): State {
  const s: State = { x, y, vx, vy, t, ax: 0, ay: 0 }
  accelInto(s, pl)
  return s
}

/** One kick–drift–kick leapfrog step (symplectic, deterministic). Mutates `s`. */
export function leapfrog(s: State, dt: number, pl: Planet | null) {
  s.vx += s.ax * dt / 2; s.vy += s.ay * dt / 2
  s.x += s.vx * dt; s.y += s.vy * dt; s.t += dt
  accelInto(s, pl)
  s.vx += s.ax * dt / 2; s.vy += s.ay * dt / 2
}

const wrap = (a: number) => { let x = a % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; if (x <= -Math.PI) x += 2 * Math.PI; return x }
const DEG = Math.PI / 180
const KMS = 29.78 // Earth's orbital speed: 1 unit of speed in km/s
const YEAR = 2 * Math.PI
const SUN_R = 0.1

// ── Levels ────────────────────────────────────────────────────────────────────

export interface Control { key: string; label: string; values: number[]; unit: string; decimals: number; factor: number }
export interface Pt { x: number; y: number; t: number }
export interface Shot { win: boolean; reason: string; note: string; path: Pt[] }

export interface Level {
  kind: Kind
  difficulty: Difficulty
  controls: Control[]
  shots: number
  /** Fraction of the path previewed while aiming, 0 for none. */
  preview: number
  chartR: number
  start: number[]
  /** One winning setting, built in by the generator. */
  solution: number[]
  // kepler
  r0: number; theta0: number; markers: { x: number; y: number }[]; tol: number
  // hohmann
  r2: number; rendezvous: boolean; tolAng: number; targetName: string
  // slingshot / hohmann target / halley perturber
  planet: Planet | null
  rFar: number; sector: { c: number; w: number } | null
  // halley
  target: number; window: number; band: [number, number] | null
}

function baseLevel(kind: Kind, d: Difficulty): Level {
  return {
    kind, difficulty: d, controls: [], shots: scale(d, [5, 5, 4, 4]), preview: scale(d, [0.5, 0.3, 0, 0]),
    chartR: 3, start: [], solution: [],
    r0: 1, theta0: 0, markers: [], tol: 0,
    r2: 0, rendezvous: false, tolAng: 0, targetName: '',
    planet: null, rFar: 0, sector: null,
    target: 0, window: 0, band: null,
  }
}

const ctl = (key: string, label: string, values: number[], unit: string, decimals: number, factor = 1): Control =>
  ({ key, label, values, unit, decimals, factor })
const range = (from: number, to: number, step: number) => {
  const out: number[] = []
  for (let k = 0; from + k * step <= to + 1e-9; k++) out.push(+(from + k * step).toFixed(6))
  return out
}
export const formatValue = (c: Control, v: number) => `${(v * c.factor).toFixed(c.decimals)}${c.unit}`

const values = (L: Level, idx: number[]) => L.controls.map((c, k) => c.values[idx[k]])

// ── Kepler ──

function evalKepler(L: Level, idx: number[], record: boolean): Shot {
  const [v, angDeg] = values(L, idx)
  const vc = Math.sqrt(1 / L.r0)
  const th = L.theta0, a = angDeg * DEG
  const tx = -Math.sin(th), ty = Math.cos(th), rx = Math.cos(th), ry = Math.sin(th)
  const dx = tx * Math.cos(a) + rx * Math.sin(a), dy = ty * Math.cos(a) + ry * Math.sin(a)
  const s = makeState(L.r0 * rx, L.r0 * ry, v * vc * dx, v * vc * dy, null)
  const path: Pt[] = record ? [{ x: s.x, y: s.y, t: 0 }] : []
  const mins = L.markers.map(() => Infinity)
  let prev = Math.atan2(s.y, s.x), swept = 0, end = ''
  const dt = 0.01
  for (let i = 1; i <= 9000; i++) {
    leapfrog(s, dt, null)
    for (let m = 0; m < mins.length; m++) {
      const d = Math.hypot(s.x - L.markers[m].x, s.y - L.markers[m].y)
      if (d < mins[m]) mins[m] = d
    }
    if (record && i % 4 === 0) path.push({ x: s.x, y: s.y, t: s.t })
    const r = Math.hypot(s.x, s.y)
    if (r < SUN_R) { end = 'crash'; break }
    if (r > L.chartR) { end = 'escape'; break }
    const ang = Math.atan2(s.y, s.x)
    swept += wrap(ang - prev); prev = ang
    if (Math.abs(swept) >= 2 * Math.PI) { end = 'done'; break }
  }
  if (record) path.push({ x: s.x, y: s.y, t: s.t })
  if (end === 'crash') return { win: false, reason: 'The planet fell into the Sun', note: 'Far too slow, or aimed too steeply inward.', path }
  if (end !== 'done') return { win: false, reason: 'The planet flew off the chart', note: 'Too fast: the orbit opened out past the edge of the chart.', path }
  const missed = mins.map((d, m) => ({ d, m })).filter(o => o.d > L.tol)
  if (missed.length) {
    return {
      win: false, reason: 'The orbit missed a sighting',
      note: `Closest pass: ${mins.map((d, m) => `sighting ${m + 1} ${d.toFixed(2)} AU`).join(', ')} (needs ≤ ${L.tol.toFixed(2)}).`,
      path,
    }
  }
  return { win: true, reason: '', note: 'The ellipse runs through every sighting.', path }
}

function genKepler(d: Difficulty, rng: Rng): Level {
  const L = baseLevel('kepler', d)
  L.r0 = d >= 4 ? +(0.8 + 0.45 * rng()).toFixed(2) : 1
  L.theta0 = rng() * 2 * Math.PI
  L.chartR = 3.2
  L.tol = scale(d, [0.16, 0.11, 0.15, 0.11])
  L.controls = [
    ctl('speed', 'Launch speed', range(0.7, 1.36, 0.02), '× circular', 2),
    ctl('angle', 'Launch angle (outward +)', range(-40, 40, 5), '°', 0),
  ]
  const nMarkers = d >= 3 ? 2 : 1
  let best: { trial: Level; score: number } | null = null
  for (let attempt = 0; attempt < 60 && !(best && attempt >= 12); attempt++) {
    // A random setting whose orbit is a clearly elliptical, fully visible loop.
    const idx = [Math.floor(rng() * L.controls[0].values.length), Math.floor(rng() * L.controls[1].values.length)]
    const trial: Level = { ...L, markers: [] }
    const shot = evalKepler(trial, idx, true)
    if (!shot.win) continue
    const rs = shot.path.map(p => Math.hypot(p.x, p.y))
    const rmin = Math.min(...rs), rmax = Math.max(...rs)
    if (rmax > L.chartR - 0.35 || rmin < 0.3 || (rmax - rmin) / (rmax + rmin) < (d >= 2 ? 0.25 : 0.18)) continue
    const n = shot.path.length
    const spots = nMarkers === 1 ? [0.35 + 0.3 * rng()] : [0.22 + 0.18 * rng(), 0.6 + 0.18 * rng()]
    // Sightings sit exactly on points the integrator visits, so this setting wins.
    trial.markers = spots.map(f => { const p = shot.path[Math.floor(f * n)]; return { x: p.x, y: p.y } })
    trial.solution = idx
    // Keep the candidate whose count of winning settings is nearest the tier's aim.
    const score = Math.abs(keplerApproxWinners(trial) - scale(d, [8, 5, 4, 2]))
    if (!best || score < best.score) best = { trial, score }
  }
  const trial = best?.trial ?? keplerFallback(L, nMarkers)
  trial.start = pickStart(trial, i => evalKepler(trial, i, false).win)
  return trial
}

function keplerFallback(L: Level, nMarkers: number): Level {
  const trial: Level = { ...L, markers: [] }
  const shot = evalKepler(trial, [15, 10], true)
  const n = shot.path.length
  trial.markers = (nMarkers === 1 ? [0.5] : [0.3, 0.7]).map(f => ({ x: shot.path[Math.floor(f * n)].x, y: shot.path[Math.floor(f * n)].y }))
  trial.solution = [15, 10]
  return trial
}

/** Rough count of winning settings from the exact Kepler conic (for level selection only). */
export function keplerApproxWinners(L: Level): number {
  let n = 0
  const vc = Math.sqrt(1 / L.r0), th = L.theta0
  const x = L.r0 * Math.cos(th), y = L.r0 * Math.sin(th)
  forEachCombo(L, idx => {
    const [v, angDeg] = values(L, idx)
    const a = angDeg * DEG
    const tx = -Math.sin(th), ty = Math.cos(th), rx = Math.cos(th), ry = Math.sin(th)
    const vx = v * vc * (tx * Math.cos(a) + rx * Math.sin(a)), vy = v * vc * (ty * Math.cos(a) + ry * Math.sin(a))
    const v2 = vx * vx + vy * vy, rdv = x * vx + y * vy
    if (v2 / 2 - 1 / L.r0 >= 0) return
    const h = x * vy - y * vx
    const ex = (v2 - 1 / L.r0) * x - rdv * vx, ey = (v2 - 1 / L.r0) * y - rdv * vy
    const e = Math.hypot(ex, ey), p = h * h
    if (p / (1 - e) > L.chartR || p / (1 + e) < SUN_R) return
    const ok = L.markers.every(m => {
      const rm = Math.hypot(m.x, m.y)
      const den = 1 + (ex * m.x + ey * m.y) / rm
      return den > 0 && Math.abs(p / den - rm) <= L.tol
    })
    if (ok) n++
  })
  return n
}

// ── Hohmann ──

interface PhaseA { ok: boolean; reason: string; rA: number; tA: number; thA: number; s: State; path: Pt[] }

function hohmannA(L: Level, dv1: number, record: boolean): PhaseA {
  const s = makeState(1, 0, 0, 1 + dv1, null)
  const path: Pt[] = record ? [{ x: 1, y: 0, t: 0 }] : []
  const dt = 0.01
  let prevVr = 0
  for (let i = 1; i <= 5000; i++) {
    leapfrog(s, dt, null)
    if (record && i % 4 === 0) path.push({ x: s.x, y: s.y, t: s.t })
    const r = Math.hypot(s.x, s.y)
    if (r > L.chartR) return { ok: false, reason: 'The ship sailed off the chart', rA: r, tA: s.t, thA: 0, s, path }
    const vr = (s.x * s.vx + s.y * s.vy) / r
    if (s.t > 0.9 * Math.PI && prevVr > 0 && vr <= 0) {
      if (record) path.push({ x: s.x, y: s.y, t: s.t })
      return { ok: true, reason: '', rA: r, tA: s.t, thA: Math.atan2(s.y, s.x), s, path }
    }
    prevVr = vr
  }
  return { ok: true, reason: '', rA: Math.hypot(s.x, s.y), tA: s.t, thA: Math.atan2(s.y, s.x), s, path }
}

function hohmannB(L: Level, A: PhaseA, dv2: number, record: boolean) {
  const sp = Math.hypot(A.s.vx, A.s.vy)
  const k = (sp + dv2) / sp
  const s = makeState(A.s.x, A.s.y, A.s.vx * k, A.s.vy * k, null, A.s.t)
  const path: Pt[] = []
  let rmin = A.rA, rmax = A.rA, prev = Math.atan2(s.y, s.x), swept = 0, crashed = false
  const dt = 0.01
  for (let i = 1; i <= 9000; i++) {
    leapfrog(s, dt, null)
    if (record && i % 5 === 0) path.push({ x: s.x, y: s.y, t: s.t })
    const r = Math.hypot(s.x, s.y)
    rmin = Math.min(rmin, r); rmax = Math.max(rmax, r)
    if (r < SUN_R) { crashed = true; break }
    if (r > L.chartR) break
    const ang = Math.atan2(s.y, s.x)
    swept += wrap(ang - prev); prev = ang
    if (swept >= 2 * Math.PI) break
  }
  return { rmin, rmax, crashed, path }
}

function evalHohmann(L: Level, idx: number[], record: boolean): Shot {
  const [dv1, dv2, waitDeg = 0] = values(L, idx)
  const wait = waitDeg * DEG
  const A = hohmannA(L, dv1, record)
  const rot = (p: Pt): Pt => ({ x: p.x * Math.cos(wait) - p.y * Math.sin(wait), y: p.x * Math.sin(wait) + p.y * Math.cos(wait), t: p.t + wait })
  const coast: Pt[] = []
  if (record) for (let a = 0; a < wait; a += 0.06) coast.push({ x: Math.cos(a), y: Math.sin(a), t: a })
  if (!A.ok) return { win: false, reason: A.reason, note: 'Burn 1 was far too strong.', path: [...coast, ...A.path.map(rot)] }
  const B = hohmannB(L, A, dv2, record)
  const path = record ? [...coast, ...A.path.map(rot), ...B.path.map(rot)] : []
  const lo = L.r2 - L.tol, hi = L.r2 + L.tol
  let note = `Aphelion ${A.rA.toFixed(2)} AU (target ${L.r2.toFixed(2)}). Final orbit ${B.rmin.toFixed(2)}–${B.rmax.toFixed(2)} AU.`
  if (A.rA < lo) return { win: false, reason: 'Burn 1 fell short of the target orbit', note, path }
  if (A.rA > hi) return { win: false, reason: 'Burn 1 overshot the target orbit', note, path }
  if (B.crashed) return { win: false, reason: 'The ship fell into the Sun', note, path }
  if (B.rmin < lo) return { win: false, reason: 'Burn 2 too weak: the ship sank back inward', note, path }
  if (B.rmax > hi) return { win: false, reason: 'Burn 2 too strong: the ship swung outward', note, path }
  if (L.rendezvous && L.planet) {
    const shipAng = A.thA + wait
    const [px, py] = planetPos(L.planet, A.tA + wait)
    const sep = Math.abs(wrap(Math.atan2(py, px) - shipAng)) / DEG
    note += ` ${L.targetName} was ${sep.toFixed(0)}° away on arrival (needs ≤ ${L.tolAng}°).`
    if (sep > L.tolAng) {
      const ahead = wrap(Math.atan2(py, px) - shipAng) > 0
      return { win: false, reason: `${L.targetName} wasn’t there — it was ${ahead ? 'ahead of' : 'behind'} you`, note, path }
    }
  }
  return { win: true, reason: '', note, path }
}

function solveHohmann(L: Level): number[][] {
  const [c1, c2, c3] = L.controls
  const wins: number[][] = []
  c1.values.forEach((dv1, i1) => {
    const A = hohmannA(L, dv1, false)
    if (!A.ok || Math.abs(A.rA - L.r2) > L.tol) return
    c2.values.forEach((dv2, i2) => {
      const B = hohmannB(L, A, dv2, false)
      if (B.crashed || B.rmin < L.r2 - L.tol || B.rmax > L.r2 + L.tol) return
      if (!c3 || !L.planet) { wins.push([i1, i2]); return }
      c3.values.forEach((w, i3) => {
        const wait = w * DEG
        const [px, py] = planetPos(L.planet!, A.tA + wait)
        if (Math.abs(wrap(Math.atan2(py, px) - A.thA - wait)) / DEG <= L.tolAng) wins.push([i1, i2, i3])
      })
    })
  })
  return wins
}

function genHohmann(d: Difficulty, rng: Rng): Level {
  const L = baseLevel('hohmann', d)
  L.tol = scale(d, [0.15, 0.1, 0.1, 0.06])
  L.rendezvous = d >= 3
  L.tolAng = scale(d, [0, 0, 15, 10])
  const dv = range(0, 0.4, 0.005)
  L.controls = [ctl('burn1', 'Burn 1 (leave Earth’s orbit)', dv, ' km/s', 2, KMS), ctl('burn2', 'Burn 2 (at aphelion)', dv, ' km/s', 2, KMS)]
  if (L.rendezvous) L.controls.push(ctl('wait', 'Coast before burn 1', range(0, 350, 10), '°', 0))
  for (let attempt = 0; ; attempt++) {
    const i1 = attempt < 30 ? 14 + Math.floor(rng() * 23) : 20 // 0.07 … 0.18 Δv
    const trial: Level = { ...L, chartR: 4 }
    const A = hohmannA(trial, dv[i1], false)
    trial.r2 = A.rA
    trial.chartR = A.rA + 0.7
    trial.targetName = A.rA < 1.8 ? 'Mars' : 'Vesta'
    const i2 = dv.findIndex(v => { const B = hohmannB(trial, A, v, false); return !B.crashed && B.rmin >= A.rA - L.tol && B.rmax <= A.rA + L.tol })
    if (i2 < 0) continue
    const omega = Math.sqrt(1 / trial.r2 ** 3)
    const i3 = Math.floor(rng() * 36)
    const w = i3 * 10 * DEG
    // At D3+ the planet is placed so that coasting i3 steps first meets it.
    trial.planet = { r: trial.r2, omega, mass: 0, radius: 0.06, phase: trial.rendezvous ? A.thA + w - omega * (A.tA + w) : rng() * 2 * Math.PI }
    trial.solution = trial.rendezvous ? [i1, i2, i3] : [i1, i2]
    trial.start = pickStart(trial, idx => evalHohmann(trial, idx, false).win)
    return trial
  }
}

// ── Slingshot ──

function evalSling(L: Level, idx: number[], record: boolean): Shot {
  const [v, phaseDeg, angDeg = 0] = values(L, idx)
  const pl: Planet = { ...L.planet!, phase: phaseDeg * DEG }
  const a = angDeg * DEG
  const s = makeState(1, 0, v * Math.sin(a), v * Math.cos(a), pl)
  const path: Pt[] = record ? [{ x: 1, y: 0, t: 0 }] : []
  const dt = 0.006
  let rmax = 1, closest = Infinity, end = ''
  for (let i = 1; i <= 5000; i++) {
    leapfrog(s, dt, pl)
    if (record && i % 8 === 0) path.push({ x: s.x, y: s.y, t: s.t })
    const r = Math.hypot(s.x, s.y)
    rmax = Math.max(rmax, r)
    const [px, py] = planetPos(pl, s.t)
    const dp = Math.hypot(px - s.x, py - s.y)
    closest = Math.min(closest, dp)
    if (r < SUN_R) { end = 'sun'; break }
    if (dp < pl.radius) { end = 'planet'; break }
    if (r >= L.rFar) { end = 'far'; break }
  }
  if (record) path.push({ x: s.x, y: s.y, t: s.t })
  const note = `Got out to ${rmax.toFixed(2)} AU; closest pass to Jupiter ${closest.toFixed(2)} AU.`
  if (end === 'sun') return { win: false, reason: 'The ship fell into the Sun', note, path }
  if (end === 'planet') return { win: false, reason: 'The ship crashed into Jupiter', note, path }
  if (end !== 'far') return { win: false, reason: 'Not enough speed to reach the outer ring', note, path }
  const cross = Math.atan2(s.y, s.x)
  if (L.sector) {
    const off = Math.abs(wrap(cross - L.sector.c)) / DEG
    if (off > L.sector.w / 2) return { win: false, reason: 'Reached the ring, but outside the target sector', note: `${note} Crossed ${off.toFixed(0)}° from the sector’s centre.`, path }
  }
  return { win: true, reason: '', note, path }
}

function genSling(d: Difficulty, rng: Rng): Level {
  const L = baseLevel('slingshot', d)
  for (let attempt = 0; ; attempt++) {
    const Rp = 1.8 + 0.5 * rng()
    const mass = scale(d, [0.04, 0.026, 0.03, 0.026]) * (0.85 + 0.3 * rng())
    const vmin = Math.sqrt(2 - 2 / (1 + Rp)) + 0.01
    const vmax = Math.sqrt(2 - 2 / (1 + Rp + 0.8))
    const speeds = Array.from({ length: 8 }, (_, k) => vmin + (vmax - vmin) * k / 7)
    const trial: Level = {
      ...L, rFar: +(Rp + 1.5).toFixed(2), chartR: Rp + 1.8,
      planet: { r: Rp, phase: 0, omega: Math.sqrt(1 / Rp ** 3), mass: attempt < 6 ? mass : 0.045, radius: 0.09 },
      controls: [
        ctl('speed', 'Launch speed', speeds, ' km/s', 1, KMS),
        ctl('phase', 'Jupiter’s position at launch', range(0, 350, 10), '°', 0),
        ...(d >= 4 ? [ctl('angle', 'Launch angle (outward +)', [-10, 0, 10], '°', 0)] : []),
      ],
    }
    // Random settings until some are flung out to the ring (about one in six).
    const found: { idx: number[]; cross: number }[] = []
    for (let k = 0; k < 60 && found.length < (d >= 3 ? 4 : 1); k++) {
      const idx = trial.controls.map(c => Math.floor(rng() * c.values.length))
      const shot = evalSling(trial, idx, true)
      if (!shot.win) continue
      const p = shot.path[shot.path.length - 1]
      found.push({ idx, cross: Math.atan2(p.y, p.x) })
    }
    if (!found.length) continue
    let pickK = 0
    if (d >= 3) {
      // Aim the sector at the most unusual exit seen, so the common route misses it.
      const w = scale(d, [0, 0, 36, 24])
      let bestScore = -1
      found.forEach((f, k) => {
        const score = found.reduce((m, g) => m + Math.abs(wrap(g.cross - f.cross)), 0)
        if (score > bestScore) { bestScore = score; pickK = k }
      })
      trial.sector = { c: found[pickK].cross + (rng() - 0.5) * 0.4 * w * DEG, w }
    }
    trial.solution = found[pickK].idx
    trial.start = pickStart(trial, i => evalSling(trial, i, false).win)
    return trial
  }
}

// ── Halley ──

function evalHalley(L: Level, idx: number[], record: boolean): Shot {
  const [v, angDeg = 0] = values(L, idx)
  const th = L.theta0, a = angDeg * DEG
  const tx = -Math.sin(th), ty = Math.cos(th), rx = Math.cos(th), ry = Math.sin(th)
  const dx = tx * Math.cos(a) + rx * Math.sin(a), dy = ty * Math.cos(a) + ry * Math.sin(a)
  const pl = L.planet
  const s = makeState(L.r0 * rx, L.r0 * ry, v * dx, v * dy, pl)
  const path: Pt[] = record ? [{ x: s.x, y: s.y, t: 0 }] : []
  const dt = 0.005
  let prev = Math.atan2(s.y, s.x), swept = 0, rmax = L.r0, end = '', tRet = 0
  for (let i = 1; i <= 26000; i++) {
    const t0 = s.t, sw0 = swept
    leapfrog(s, dt, pl)
    if (record && i % 30 === 0) path.push({ x: s.x, y: s.y, t: s.t })
    const r = Math.hypot(s.x, s.y)
    rmax = Math.max(rmax, r)
    if (r < SUN_R) { end = 'sun'; break }
    if (pl) { const [px, py] = planetPos(pl, s.t); if (Math.hypot(px - s.x, py - s.y) < pl.radius) { end = 'planet'; break } }
    if (r > L.chartR) { end = 'escape'; break }
    const ang = Math.atan2(s.y, s.x)
    swept += wrap(ang - prev); prev = ang
    if (swept >= 2 * Math.PI) { end = 'back'; tRet = t0 + dt * (2 * Math.PI - sw0) / (swept - sw0); break }
  }
  if (record) path.push({ x: s.x, y: s.y, t: s.t })
  if (end === 'sun') return { win: false, reason: 'The comet fell into the Sun', note: '', path }
  if (end === 'planet') return { win: false, reason: 'The comet hit Jupiter', note: '', path }
  if (end !== 'back') return { win: false, reason: 'The comet escaped the Solar System', note: 'Too fast: it will never come back.', path }
  const yrs = tRet / YEAR
  const note = `Returned after ${yrs.toFixed(2)} years; farthest point ${rmax.toFixed(2)} AU.`
  if (yrs < L.target - L.window) return { win: false, reason: 'The comet came back too early', note, path }
  if (yrs > L.target + L.window) return { win: false, reason: 'The comet came back too late', note, path }
  if (L.band && (rmax < L.band[0] || rmax > L.band[1])) {
    return { win: false, reason: `Its far point missed the ${L.band[0].toFixed(1)}–${L.band[1].toFixed(1)} AU band`, note, path }
  }
  return { win: true, reason: '', note, path }
}

function genHalley(d: Difficulty, rng: Rng): Level {
  const L = baseLevel('halley', d)
  L.r0 = +(0.75 + 0.3 * rng()).toFixed(2)
  L.theta0 = rng() * 2 * Math.PI
  L.window = scale(d, [0.6, 0.4, 0.35, 0.2])
  const bandHalf = scale(d, [0, 0.5, 0.4, 0.25])
  const vAt = (a: number) => Math.sqrt(2 / L.r0 - 1 / a)
  const vLo = Math.round(vAt(2.6) * KMS * 10) / 10 / KMS
  const speeds = Array.from({ length: 20 }, (_, k) => vLo + k * 0.1 / KMS)
  const aHi = 1 / (2 / L.r0 - speeds[19] ** 2)
  L.chartR = 2 * aHi + 0.3
  L.controls = [ctl('speed', 'Speed at the sighting', speeds, ' km/s', 1, KMS)]
  if (d >= 2) L.controls.push(ctl('angle', 'Direction (outward +)', range(-30, 30, 5), '°', 0))
  if (d >= 3) L.planet = { r: 2.6, phase: rng() * 2 * Math.PI, omega: Math.sqrt(1 / 2.6 ** 3), mass: scale(d, [0, 0, 0.012, 0.018]), radius: 0.1 }
  for (let attempt = 0; ; attempt++) {
    const idx = [3 + Math.floor(rng() * 14), ...(d >= 2 ? [attempt < 20 ? Math.floor(rng() * 13) : 6] : [])]
    const shot = evalHalley({ ...L, target: 0, window: 1e9 }, idx, true)
    const m = /after ([\d.]+) years; farthest point ([\d.]+)/.exec(shot.note)
    if (!m) continue
    const T = +m[1], ra = +m[2]
    const trial: Level = { ...L, target: +(T + (rng() - 0.5) * L.window).toFixed(1) }
    if (Math.abs(trial.target - T) > L.window * 0.9) trial.target = +T.toFixed(1)
    if (bandHalf) {
      const c = ra + (rng() - 0.5) * bandHalf
      trial.band = [+(c - bandHalf).toFixed(1), +(c + bandHalf).toFixed(1)]
      if (ra < trial.band[0] + 0.02 || ra > trial.band[1] - 0.02) trial.band = [+(ra - bandHalf).toFixed(1), +(ra + bandHalf).toFixed(1)]
    }
    trial.solution = idx
    trial.start = pickStart(trial, i => evalHalley(trial, i, false).win)
    return trial
  }
}

// ── Shared generator pieces ──

export function forEachCombo(L: Level, fn: (idx: number[]) => void) {
  const lens = L.controls.map(c => c.values.length)
  const idx = lens.map(() => 0)
  for (;;) {
    fn([...idx])
    let k = 0
    while (k < lens.length) { idx[k]++; if (idx[k] < lens[k]) break; idx[k] = 0; k++ }
    if (k === lens.length) return
  }
}

function pickStart(L: Level, wins: (idx: number[]) => boolean): number[] {
  const mid = L.controls.map(c => Math.floor(c.values.length / 2))
  if (!wins(mid)) return mid
  return mid.map((m, k) => (m + Math.max(3, Math.floor(L.controls[k].values.length / 3))) % L.controls[k].values.length)
}

export const comboCount = (L: Level) => L.controls.reduce((n, c) => n * c.values.length, 1)

export function evaluate(L: Level, idx: number[], record = true): Shot {
  switch (L.kind) {
    case 'kepler': return evalKepler(L, idx, record)
    case 'hohmann': return evalHohmann(L, idx, record)
    case 'slingshot': return evalSling(L, idx, record)
    case 'halley': return evalHalley(L, idx, record)
  }
}

/** Every winning setting (as control indices). */
export function solve(L: Level): number[][] {
  if (L.kind === 'hohmann') return solveHohmann(L)
  const out: number[][] = []
  forEachCombo(L, idx => { if (evaluate(L, idx, false).win) out.push(idx) })
  return out
}

export function generate(kind: Kind, difficulty: Difficulty, seed: number): Level {
  const rng = mulberry32(seed ^ hashString('orbit:' + kind))
  switch (kind) {
    case 'kepler': return genKepler(difficulty, rng)
    case 'hohmann': return genHohmann(difficulty, rng)
    case 'slingshot': return genSling(difficulty, rng)
    case 'halley': return genHalley(difficulty, rng)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const ANIM_MS = 1800
const TICK_MS = 40

function goalText(L: Level): string {
  switch (L.kind) {
    case 'kepler':
      return `Pass within ${L.tol.toFixed(2)} AU of ${L.markers.length === 1 ? 'the sighting' : 'both sightings'} and complete the orbit.`
    case 'hohmann':
      return `Settle on ${L.targetName}’s orbit: ${L.r2.toFixed(2)} ± ${L.tol.toFixed(2)} AU${L.rendezvous ? `, arriving within ${L.tolAng}° of ${L.targetName}` : ''}.`
    case 'slingshot':
      return `Reach the ${L.rFar.toFixed(2)} AU ring${L.sector ? ` inside the marked ${L.sector.w}° sector` : ''}.`
    case 'halley':
      return `Return in ${L.target.toFixed(1)} ± ${L.window.toFixed(2)} years${L.band ? `, far point ${L.band[0].toFixed(1)}–${L.band[1].toFixed(1)} AU` : ''}.`
  }
}

function pathD(path: Pt[], upto = path.length): string {
  let d = ''
  for (let i = 0; i < Math.min(upto, path.length); i++) d += `${i ? 'L' : 'M'}${path[i].x.toFixed(3)} ${(-path[i].y).toFixed(3)}`
  return d
}

export default function OrbitGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'kepler-ellipse')
  const L = useMemo(() => generate(config.kind, difficulty, seed), [config.kind, difficulty, seed])
  const [idx, setIdx] = useState<number[]>(L.start)
  const [used, setUsed] = useState(0)
  const [ghosts, setGhosts] = useState<Shot[]>([])
  const [anim, setAnim] = useState<{ shot: Shot; frac: number } | null>(null)
  const [last, setLast] = useState<Shot | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const usedRef = useRef(0)

  const preview = useMemo(() => (L.preview > 0 ? evaluate(L, idx) : null), [L, idx])

  const setCtl = (k: number, v: number) => {
    if (settled || anim) return
    const n = L.controls[k].values.length
    setIdx(prev => prev.map((x, j) => (j === k ? Math.max(0, Math.min(n - 1, v)) : x)))
  }

  const launch = useCallback(() => {
    if (settled || anim) return
    const shot = evaluate(L, idx)
    usedRef.current += 1
    setUsed(usedRef.current)
    setAnim({ shot, frac: 0 })
  }, [settled, anim, L, idx])

  useEffect(() => {
    if (!anim) return
    const iv = setInterval(() => {
      setAnim(a => (a ? { ...a, frac: Math.min(1, a.frac + TICK_MS / ANIM_MS) } : a))
    }, TICK_MS)
    return () => clearInterval(iv)
  }, [anim !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!anim || anim.frac < 1) return
    const shot = anim.shot
    setAnim(null)
    setLast(shot)
    setGhosts(g => [...g.slice(-2), shot])
    if (shot.win) win()
    else if (usedRef.current >= L.shots) lose(`${shot.reason} — no launches left`)
  }, [anim, L.shots, win, lose])

  const R = L.chartR
  const dot = R * 0.03
  const showing = anim?.shot
  const head = showing ? showing.path[Math.max(0, Math.floor(anim!.frac * (showing.path.length - 1)))] : null
  const tNow = head?.t ?? 0
  const livePlanet: Planet | null = L.planet && (L.kind !== 'hohmann' || L.rendezvous)
    ? (L.kind === 'slingshot' ? { ...L.planet, phase: L.controls[1].values[idx[1]] * DEG } : L.planet)
    : null
  const pp = livePlanet ? planetPos(livePlanet, tNow) : null
  const left = L.shots - used

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p data-testid="orb-left" className={`font-bold tabular-nums ${left <= 1 ? 'text-red-600' : 'text-accent'}`}>🚀 {left}/{L.shots}</p>
        </div>
      </div>

      <p className="text-ink-2 text-xs font-bold" data-testid="orb-goal">{goalText(L)}</p>

      <div className="w-full max-w-[400px] mx-auto rounded-xl border border-line overflow-hidden" style={{ background: 'radial-gradient(circle at 50% 50%, #1d2238 0%, #0b0d17 80%)' }}>
        <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} className="w-full aspect-square block" data-testid="orb-chart">
          {/* reference rings */}
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].filter(r => r < R).map(r => (
            <circle key={r} r={r} fill="none" stroke="#ffffff" strokeOpacity={0.06} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {L.kind === 'hohmann' && <>
            <circle r={1} fill="none" stroke="#60a5fa" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle r={L.r2} fill="none" stroke="#f97316" strokeOpacity={0.25} strokeWidth={2 * L.tol} />
            <circle r={L.r2} fill="none" stroke="#f97316" strokeOpacity={0.7} strokeWidth={1} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          </>}
          {L.kind === 'slingshot' && <>
            <circle r={L.planet!.r} fill="none" stroke="#fbbf24" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle r={L.rFar} fill="none" stroke="#34d399" strokeOpacity={0.8} strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            {L.sector && (() => {
              const a0 = L.sector.c - L.sector.w / 2 * DEG, a1 = L.sector.c + L.sector.w / 2 * DEG
              const r = L.rFar + 0.25
              return <path d={`M0 0L${r * Math.cos(a0)} ${-r * Math.sin(a0)}A${r} ${r} 0 0 0 ${r * Math.cos(a1)} ${-r * Math.sin(a1)}Z`}
                fill="#34d399" fillOpacity={0.12} stroke="#34d399" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            })()}
          </>}
          {L.kind === 'halley' && <>
            {L.band && <circle r={(L.band[0] + L.band[1]) / 2} fill="none" stroke="#a78bfa" strokeOpacity={0.22} strokeWidth={L.band[1] - L.band[0]} />}
            {L.planet && <circle r={L.planet.r} fill="none" stroke="#fbbf24" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
          </>}
          {L.kind === 'kepler' && L.markers.map((m, k) => (
            <g key={k} data-marker={k}>
              <circle cx={m.x} cy={-m.y} r={L.tol} fill="#f472b6" fillOpacity={0.15} stroke="#f472b6" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <circle cx={m.x} cy={-m.y} r={dot * 0.35} fill="#f472b6" />
            </g>
          ))}

          {ghosts.map((g, k) => (
            <path key={k} d={pathD(g.path)} fill="none" stroke={g.win ? '#34d399' : '#94a3b8'} strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {preview && !anim && !settled && (
            <path data-testid="orb-preview" d={pathD(preview.path, Math.ceil(preview.path.length * L.preview))} fill="none" stroke="#e2e8f0" strokeOpacity={0.7} strokeWidth={1.5} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          )}
          {showing && head && <>
            <path d={pathD(showing.path, Math.floor(anim!.frac * (showing.path.length - 1)) + 1)} fill="none" stroke="#fde68a" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <circle cx={head.x} cy={-head.y} r={dot * 0.6} fill="#fef3c7" />
          </>}

          {/* Sun, start, planet */}
          <circle r={dot * 1.4} fill="#fbbf24" />
          <circle r={dot * 2.2} fill="#fbbf24" fillOpacity={0.2} />
          {(L.kind === 'kepler' || L.kind === 'halley') && (
            <circle cx={L.r0 * Math.cos(L.theta0)} cy={-L.r0 * Math.sin(L.theta0)} r={dot * 0.7} fill={L.kind === 'halley' ? '#a5f3fc' : '#ef4444'} />
          )}
          {(L.kind === 'hohmann' || L.kind === 'slingshot') && !showing && <circle cx={1} cy={0} r={dot * 0.7} fill="#60a5fa" />}
          {pp && <circle data-testid="orb-planet" cx={pp[0]} cy={-pp[1]} r={L.kind === 'slingshot' ? dot * 1.1 : dot * 0.8} fill={L.kind === 'hohmann' ? '#f97316' : '#f59e0b'} />}
        </svg>
      </div>

      {L.kind === 'halley' && preview && (
        <p className="text-[10px] text-muted -mt-1" data-testid="orb-readout">
          Preview: a ≈ {(() => { const rs = preview.path.map(p => Math.hypot(p.x, p.y)); return ((Math.min(...rs) + Math.max(...rs)) / 2).toFixed(2) })()} AU
        </p>
      )}

      <div className="flex flex-col gap-2">
        {L.controls.map((c, k) => (
          <div key={c.key} className="bg-panel border border-line rounded-lg px-2.5 py-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-ink-2 font-bold">{c.label}</span>
              <span className="text-accent font-bold tabular-nums" data-testid={`orb-val-${c.key}`}>{formatValue(c, c.values[idx[k]])}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button type="button" aria-label={`decrease ${c.label}`} onClick={() => setCtl(k, idx[k] - 1)} disabled={settled || !!anim}
                className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">−</button>
              <input type="range" min={0} max={c.values.length - 1} step={1} value={idx[k]} data-testid={`orb-ctl-${c.key}`}
                aria-label={c.label} disabled={settled || !!anim}
                onChange={e => setCtl(k, Number(e.target.value))} className="flex-1 h-8 touch-pan-y" />
              <button type="button" aria-label={`increase ${c.label}`} onClick={() => setCtl(k, idx[k] + 1)} disabled={settled || !!anim}
                className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">+</button>
            </div>
          </div>
        ))}
      </div>

      {!settled && (
        <button type="button" data-testid="orb-launch" onClick={launch} disabled={!!anim}
          className={`h-11 rounded-xl font-bold text-sm ${anim ? 'bg-panel text-muted' : 'bg-accent text-accent-fg active:scale-[0.98]'}`}>
          {anim ? 'In flight…' : `Launch (${left} left)`}
        </button>
      )}

      {last && !anim && (
        <p className="text-[11px] leading-relaxed text-ink-2" data-testid="orb-note">
          {!last.win && <span className="font-bold text-red-600">{last.reason}. </span>}{last.note}
        </p>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="A perfect orbit!" loseTitle={reason ?? 'Lost in space'} />
    </div>
  )
}
