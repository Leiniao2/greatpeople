import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Eureka — buoyancy and displacement with real densities.  Four configs, each
// a different physical rule:
//
//   hiero-crown     overflow = volume.  n crowns of equal mass; one is gold
//                   alloyed with silver (gold 19.32, silver 10.49 g/cm³), so it
//                   is bulkier and spills more.  Lower any group of crowns into
//                   a brim-full vessel and read the overflow (rounded to the
//                   jar's marks); a dunk only tells whether the fake is in the
//                   group, so the dunks must halve the suspects.  Then accuse.
//   plimsoll-line   draft = displacement ÷ (ρ × waterplane area) for a box
//                   hull.  Crane crates aboard until the ship floats inside the
//                   band at her load line, then cast off.  D3+: crates give only
//                   material and volume (mass = ρV), and the dock is fresh water
//                   (1.000) while the line is for the sea (1.025).
//   cartesian-diver Boyle: the trapped air shrinks as p rises (pV = const), and
//                   the pressure grows with depth too, so the diver's balance is
//                   unstable.  Squeeze the bottle to hold the diver inside the
//                   target band(s) long enough, before time runs out.
//   vasa-stability  GM = KB + BM − KG for a box hull (KB = T/2, BM = B²/12T).
//                   Choose ballast and how many guns go on the upper deck, then
//                   let the sailors run across.  Too little ballast and she
//                   heels until the lower gunports flood (or capsizes); too
//                   much and she sits so deep the ports are awash anyway.
//
//   tier   crown (n/dunks/jar)   plimsoll (crates/band/slack)   diver (bands×hold, width, lag)   vasa (guns, window, tests)   ≈ time
//   D1     4 / 2 / 1 mL, ref     5 / 10 cm / +8                1×4 s, 6 cm, none                24, ≤8 steps, 5             ~1 min
//   D2     6 / 3 / 2 mL, ref     6 / 7 cm / +6                 1×6 s, 4 cm, none                32, ≤5 steps, 5             ~1.5 min
//   D3     8 / 3 / 2 mL          7 / 6 cm / +4, ρV, fresh dock 2×5 s, 4 cm, 0.4 s           40, ≤3 steps, 5, king       ~2–2.5 min
//   D4     12 / 4 / 2 mL         8 / 4 cm / +3, ρV, fresh dock 3×5 s, 3 cm, 0.6 s           48, ≤2 steps, 5, king       ~3 min
//
// Every level is generated from the seed and proved winnable in the tests
// (binary search, subset enumeration, a PD controller, a bisection search).

export type Kind = 'crown' | 'plimsoll' | 'diver' | 'vasa'

interface EurekaConfig {
  title: string
  rule: string
  intro: string
  fact: string
  kind: Kind
}

export const CONFIGS: Record<string, EurekaConfig> = {
  'hiero-crown': {
    title: 'Hiero’s Crown',
    rule: 'Overflow = volume',
    intro: 'All the crowns weigh the same, but one goldsmith mixed silver into his gold. Silver is lighter, so the fake is bulkier and spills more water. Tap crowns into the basket, lower it into the brim-full vessel and read the overflow. Then accuse the cheat.',
    fact: 'Vitruvius (De architectura, Book IX) tells how King Hiero II of Syracuse asked Archimedes whether a goldsmith had mixed silver into a votive crown. Archimedes saw the bath overflow as he stepped in, then compared the water the crown spilled with that of equal masses of gold and silver, and caught the cheat.',
    kind: 'crown',
  },
  'plimsoll-line': {
    title: 'The Plimsoll Line',
    rule: 'Draft = load ÷ (ρ × area)',
    intro: 'Crane the cargo aboard until the ship floats inside the band at her load line, then cast off. A box hull sinks by the cargo’s mass divided by water density times the deck area. Overload her and the line goes under; load far too much and she sinks at the quay.',
    fact: 'Samuel Plimsoll campaigned against overloaded “coffin ships”. The Merchant Shipping Act of 1876 made a load-line mark compulsory on British ships, and from 1890 the Board of Trade fixed where it went, including a higher line for fresh water, where a ship floats deeper.',
    kind: 'plimsoll',
  },
  'cartesian-diver': {
    title: 'The Cartesian Diver',
    rule: 'Boyle: pV = constant',
    intro: 'Squeeze the bottle to raise the pressure: the bubble in the diver shrinks and it sinks. Deeper water squeezes the bubble too, so the diver never rests on its own. Hold it inside the marked band until the bar fills.',
    fact: 'Raffaello Magiotti described the diver in 1648, and it was soon named after René Descartes. Squeezing the bottle raises the pressure, the trapped air shrinks as Boyle’s law (1662) says, and the diver loses buoyancy.',
    kind: 'diver',
  },
  'vasa-stability': {
    title: 'The Vasa, 1628',
    rule: 'GM = KB + BM − KG',
    intro: 'Choose the ballast in the hold and how many guns go on the upper deck, then have the sailors run across the deck. Weight down low makes her stiff, but every tonne also sinks her deeper. If the lower gunports dip under, she floods.',
    fact: 'The warship Vasa capsized and sank in Stockholm harbour on her maiden voyage, 10 August 1628, about 1300 m out. Before she sailed, a test in which 30 sailors ran across her deck was stopped when she heeled badly: she was top-heavy, with too little ballast for two gundecks.',
    kind: 'vasa',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

export const RHO = { gold: 19.32, silver: 10.49, fresh: 1.0, sea: 1.025, glass: 2.5 } as const
export const G = 9.81
export const P0 = 101.325 // kPa

const round = (x: number, step: number) => Math.round(x / step) * step
const between = (rng: Rng, a: number, b: number) => a + (b - a) * rng()

// ── Crown ─────────────────────────────────────────────────────────────────────

export interface CrownLevel {
  kind: 'crown'
  n: number
  dunks: number
  /** Mass of every crown, g. */
  mass: number
  /** Silver mass fraction of the fake. */
  f: number
  /** Jar resolution, mL. */
  res: number
  fake: number
  reference: boolean
}

/** Volume (mL) of a crown of mass m (g) with silver mass fraction f. */
export const alloyVolume = (m: number, f: number) => m * ((1 - f) / RHO.gold + f / RHO.silver)
export const crownVolume = (L: CrownLevel, i: number) => alloyVolume(L.mass, i === L.fake ? L.f : 0)
/** Overflow read on the jar for a group of crowns. */
export function crownReading(L: CrownLevel, group: number[]): number {
  const v = group.reduce((s, i) => s + crownVolume(L, i), 0)
  return +round(v, L.res).toFixed(3)
}
/** What a group of g pure-gold crowns would read. */
export const goldReading = (L: CrownLevel, g: number) => +round(g * L.mass / RHO.gold, L.res).toFixed(3)

export function genCrown(d: Difficulty, rng: Rng): CrownLevel {
  const n = scale(d, [4, 6, 8, 12]), dunks = scale(d, [2, 3, 3, 4]), res = scale(d, [1, 2, 2, 2])
  const [f0, f1] = scale(d, [[0.25, 0.35], [0.2, 0.3], [0.12, 0.2], [0.1, 0.15]] as const)
  const [m0, m1] = scale(d, [[800, 1200], [900, 1400], [1000, 1500], [1200, 1800]] as const)
  for (;;) {
    const mass = round(between(rng, m0, m1), 10)
    const f = +between(rng, f0, f1).toFixed(3)
    if (alloyVolume(mass, f) - alloyVolume(mass, 0) >= 2 * res) {
      return { kind: 'crown', n, dunks, mass, f, res, fake: randInt(rng, 0, n - 1), reference: d <= 2 }
    }
  }
}

/** Halving strategy: dunk half the suspects; returns the crown it accuses and the dunks used. */
export function solveCrown(L: CrownLevel): { accuse: number; used: number; groups: number[][] } {
  let cand = Array.from({ length: L.n }, (_, i) => i)
  const groups: number[][] = []
  while (cand.length > 1) {
    const half = cand.slice(0, Math.ceil(cand.length / 2))
    groups.push(half)
    cand = crownReading(L, half) > goldReading(L, half.length) ? half : cand.slice(half.length)
  }
  return { accuse: cand[0], used: groups.length, groups }
}

// ── Plimsoll ──────────────────────────────────────────────────────────────────

export interface Crate { label: string; mass: number; material: string | null; volume: number | null }
export interface PlimLevel {
  kind: 'plimsoll'
  length: number
  beam: number
  /** Hull depth, keel to deck, m. */
  depth: number
  light: number
  crates: Crate[]
  /** Load line: the deepest allowed draft at sea, m. */
  line: number
  tol: number
  dockRho: number
  showMass: boolean
  cap: number
}

export const MATERIALS: { name: string; rho: number }[] = [
  { name: 'Wheat', rho: 0.78 },
  { name: 'Coal', rho: 0.83 },
  { name: 'Pine timber', rho: 0.5 },
  { name: 'Rock salt', rho: 1.15 },
  { name: 'Iron rails', rho: 7.87 },
]

export const draftOf = (L: PlimLevel, mass: number, rho: number) => (L.light + mass) / (rho * L.length * L.beam)
export const loadedMass = (L: PlimLevel, on: boolean[]) => L.crates.reduce((s, c, i) => s + (on[i] ? c.mass : 0), 0)
export const seaDraft = (L: PlimLevel, on: boolean[]) => draftOf(L, loadedMass(L, on), RHO.sea)
export const dockDraft = (L: PlimLevel, on: boolean[]) => draftOf(L, loadedMass(L, on), L.dockRho)
export const plimWins = (L: PlimLevel, on: boolean[]) => {
  const t = seaDraft(L, on)
  return t <= L.line + 1e-9 && t >= L.line - L.tol - 1e-9
}
export const plimSinks = (L: PlimLevel, on: boolean[]) => dockDraft(L, on) > L.depth

const subsetOf = (n: number, mask: number) => Array.from({ length: n }, (_, i) => (mask >> i & 1) === 1)

/** Every winning set of crates (as booleans), by subset enumeration. */
export function solvePlimsoll(L: PlimLevel): boolean[][] {
  const out: boolean[][] = []
  for (let mask = 0; mask < 1 << L.crates.length; mask++) {
    const on = subsetOf(L.crates.length, mask)
    if (plimWins(L, on) && !plimSinks(L, on)) out.push(on)
  }
  return out
}

export function genPlimsoll(d: Difficulty, rng: Rng): PlimLevel {
  const n = scale(d, [5, 6, 7, 8]), tol = scale(d, [0.1, 0.07, 0.06, 0.04])
  const maxWins = scale(d, [4, 3, 2, 2]), slack = scale(d, [8, 6, 4, 3])
  const derived = d >= 3
  for (;;) {
    const length = randInt(rng, 40, 70), beam = randInt(rng, 8, 11)
    const area = length * beam
    const light = round(area * between(rng, 1.4, 1.9), 10)
    const crates: Crate[] = []
    for (let i = 0; i < n; i++) {
      const target = between(rng, 40, 400)
      if (!derived) { crates.push({ label: `Crate ${i + 1}`, mass: round(target, 10), material: null, volume: null }); continue }
      const m = MATERIALS[randInt(rng, 0, MATERIALS.length - 1)]
      const volume = m.rho > 2 ? Math.max(5, Math.round(target / m.rho)) : Math.max(10, round(target / m.rho, 10))
      crates.push({ label: `${m.name} ${volume} m³`, mass: +(m.rho * volume).toFixed(1), material: m.name, volume })
    }
    const chosen = shuffle(crates.map((_, i) => i), rng).slice(0, Math.ceil(n / 2))
    const onStar = crates.map((_, i) => chosen.includes(i))
    const tStar = (light + loadedMass({ crates } as PlimLevel, onStar)) / (RHO.sea * area)
    const line = +(tStar + tol * between(rng, 0.15, 0.85)).toFixed(2)
    const dockRho = derived ? RHO.fresh : RHO.sea
    const all = crates.map(() => true)
    const base: PlimLevel = { kind: 'plimsoll', length, beam, depth: 0, light, crates, line, tol, dockRho, showMass: !derived, cap: 0 }
    const tAll = dockDraft(base, all)
    if (tAll - line < 0.6) continue
    base.depth = +(line + Math.max(0.35, 0.45 * (tAll - line))).toFixed(2)
    if (base.depth < line * RHO.sea / dockRho + 0.1 || tAll <= base.depth) continue
    if (!plimWins(base, onStar)) continue
    const wins = solvePlimsoll(base)
    if (wins.length < 1 || wins.length > maxWins) continue
    if (plimWins(base, crates.map(() => false)) || plimWins(base, all)) continue
    const minSize = Math.min(...wins.map(w => w.filter(Boolean).length))
    base.cap = minSize + slack
    return base
  }
}

// ── Cartesian diver ───────────────────────────────────────────────────────────

export interface Band { lo: number; hi: number }
export interface DiverLevel {
  kind: 'diver'
  /** Water column height, m. */
  height: number
  /** Glass volume and air volume at surface pressure, m³; diver mass, kg. */
  vGlass: number
  vAir0: number
  mass: number
  /** Squeeze (kPa) that makes the diver neutral right at the surface. */
  neutral0: number
  maxSqueeze: number
  bands: Band[]
  hold: number
  lag: number
  drag: number
  limit: number
}

export interface DiverState { h: number; v: number; p: number; t: number; band: number; held: number; done: 'win' | 'lose' | null }

export const DIVER_TICK = 0.05 // s of simulated time per UI tick
const DIVER_SUB = 5
const SQUEEZE_STEP = 0.05

/** Squeeze (kPa) at which the diver is neutral at depth h (m). */
export const neutralSqueeze = (L: DiverLevel, h: number) => L.neutral0 - RHO.fresh * G * h

/** Net downward acceleration, m/s², at depth h with effective squeeze p (kPa). */
export function diverAccel(L: DiverLevel, h: number, p: number): number {
  const P = P0 + p + RHO.fresh * G * h
  const vAir = L.vAir0 * P0 / P
  const buoy = 1000 * (L.vGlass + vAir)
  return G * (L.mass - buoy) / (1.5 * L.mass)
}

export const diverStart = (): DiverState => ({ h: 0, v: 0, p: 0, t: 0, band: 0, held: 0, done: null })

/** Advance one UI tick with squeeze command `cmd` (kPa). Pure. */
export function diverStep(L: DiverLevel, s0: DiverState, cmd: number): DiverState {
  if (s0.done) return s0
  const s = { ...s0 }
  const c = Math.max(0, Math.min(L.maxSqueeze, cmd))
  const dt = DIVER_TICK / DIVER_SUB
  for (let k = 0; k < DIVER_SUB; k++) {
    s.p = L.lag > 0 ? s.p + (c - s.p) * Math.min(1, dt / L.lag) : c
    const a = diverAccel(L, s.h, s.p) - L.drag * s.v
    s.v += a * dt
    s.h += s.v * dt
    if (s.h <= 0) { s.h = 0; if (s.v < 0) s.v = 0 }
    if (s.h >= L.height) { s.h = L.height; if (s.v > 0) s.v = 0 }
    s.t += dt
    const b = L.bands[s.band]
    if (s.h >= b.lo && s.h <= b.hi) s.held += dt
    else s.held = 0
    if (s.held >= L.hold) {
      s.band += 1; s.held = 0
      if (s.band >= L.bands.length) { s.band = L.bands.length - 1; s.done = 'win'; return s }
    }
    if (s.t >= L.limit) { s.done = 'lose'; return s }
  }
  return s
}

/** A PD controller on depth that aims for the current band's centre. */
export function diverController(L: DiverLevel, s: DiverState): number {
  const b = L.bands[s.band]
  const c = (b.lo + b.hi) / 2
  const u = neutralSqueeze(L, c) - 40 * (s.h - c) - 60 * s.v
  // A squeezed hand takes time: aim at where the effective pressure should be.
  return +round(Math.max(0, Math.min(L.maxSqueeze, u)), SQUEEZE_STEP).toFixed(2)
}

/** Run a policy until the level ends. */
export function runDiver(L: DiverLevel, policy: (s: DiverState) => number): DiverState {
  let s = diverStart()
  while (!s.done) s = diverStep(L, s, policy(s))
  return s
}

export function genDiver(d: Difficulty, rng: Rng): DiverLevel {
  const height = 0.3
  const vGlass = 1.2e-6 // a 3 g glass tube, ρ = 2.5
  const vAir0 = between(rng, 1.8, 2.4) * 1e-6
  const neutral0 = +between(rng, 4, 7).toFixed(2)
  const vAirN = vAir0 * P0 / (P0 + neutral0)
  const mass = 1000 * (vGlass + vAirN)
  const nb = scale(d, [1, 1, 2, 3]), w = scale(d, [0.06, 0.04, 0.04, 0.03])
  const bands: Band[] = []
  for (let i = 0; i < nb; i++) {
    let c = 0
    for (let tries = 0; tries < 50; tries++) {
      c = +between(rng, 0.07 + w / 2, height - 0.03 - w / 2).toFixed(3)
      if (!bands.length || Math.abs(c - (bands[bands.length - 1].lo + w / 2)) > 0.08) break
    }
    bands.push({ lo: +(c - w / 2).toFixed(3), hi: +(c + w / 2).toFixed(3) })
  }
  return {
    kind: 'diver', height, vGlass, vAir0, mass, neutral0, maxSqueeze: +(neutral0 + 3).toFixed(2),
    bands, hold: scale(d, [4, 6, 5, 5]), lag: scale(d, [0, 0, 0.4, 0.6]), drag: 2.5, limit: scale(d, [60, 90, 120, 170]),
  }
}

// ── Vasa ──────────────────────────────────────────────────────────────────────

export interface VasaLevel {
  kind: 'vasa'
  beam: number
  length: number
  rho: number
  hull: number
  kgHull: number
  kgBallast: number
  step: number
  steps: number
  guns: number
  gunMass: number
  kgLower: number
  kgUpper: number
  /** Most guns the lower deck can take. */
  capLower: number
  /** Fewest guns allowed on the upper deck. */
  minUpper: number
  sailors: number
  lever: number
  /** Height of the lower gunport sills above the keel, m. */
  sill: number
  tests: number
  showGM: boolean
}

export interface VasaResult {
  ok: boolean
  draft: number
  gm: number
  heel: number
  freeboard: number
  dip: number
  /** freeboard − dip; negative means the ports flood. */
  margin: number
  why: 'ok' | 'capsize' | 'tender' | 'deep' | 'awash'
}

function vasaCore(L: VasaLevel, bIdx: number, upper: number) {
  const b = bIdx * L.step
  const lower = L.guns - upper
  const disp = L.hull + b + L.guns * L.gunMass
  const draft = disp / (L.rho * L.length * L.beam)
  const kb = draft / 2, bm = L.beam ** 2 / (12 * draft)
  const kg = (L.hull * L.kgHull + b * L.kgBallast + lower * L.gunMass * L.kgLower + upper * L.gunMass * L.kgUpper) / disp
  const gm = kb + bm - kg
  const freeboard = L.sill - draft
  const tan = gm > 0 ? L.sailors * 0.075 * L.lever / (disp * gm) : Infinity
  const dip = L.beam / 2 * tan
  return { draft, gm, freeboard, tan, dip, margin: freeboard <= 0 ? freeboard : freeboard - dip }
}

export function evalVasa(L: VasaLevel, bIdx: number, upper: number): VasaResult {
  const c = vasaCore(L, bIdx, upper)
  const heel = Number.isFinite(c.tan) ? Math.atan(c.tan) * 180 / Math.PI : 90
  const base = { draft: c.draft, gm: c.gm, heel, freeboard: c.freeboard, dip: c.dip, margin: c.margin }
  if (c.freeboard <= 0) return { ...base, ok: false, heel: 0, dip: 0, why: 'awash' }
  if (c.gm <= 0) return { ...base, ok: false, why: 'capsize' }
  if (c.margin > 0) return { ...base, ok: true, why: 'ok' }
  // Which way to go: would a little more ballast help?
  const more = bIdx < L.steps ? vasaCore(L, bIdx + 1, upper).margin : -Infinity
  return { ...base, ok: false, why: more > c.margin ? 'tender' : 'deep' }
}

export const vasaUppers = (L: VasaLevel) => {
  const lo = Math.max(L.minUpper, L.guns - L.capLower)
  return Array.from({ length: L.guns - lo + 1 }, (_, i) => lo + i)
}

/** Every winning (ballast step, upper guns) setting. */
export function solveVasa(L: VasaLevel): [number, number][] {
  const out: [number, number][] = []
  for (const u of vasaUppers(L)) for (let b = 0; b <= L.steps; b++) if (evalVasa(L, b, u).ok) out.push([b, u])
  return out
}

/** Bisection on ballast with the guns as low as allowed, using only the tender/deep verdict. */
export function bisectVasa(L: VasaLevel): { tests: number; win: boolean; ballast: number; upper: number } {
  const u = vasaUppers(L)[0]
  let lo = 0, hi = L.steps, tests = 0
  while (lo <= hi && tests < 20) {
    const mid = Math.floor((lo + hi) / 2)
    tests++
    const r = evalVasa(L, mid, u)
    if (r.ok) return { tests, win: true, ballast: mid, upper: u }
    if (r.why === 'tender' || r.why === 'capsize') lo = mid + 1
    else hi = mid - 1
  }
  return { tests, win: false, ballast: -1, upper: u }
}

export function genVasa(d: Difficulty, rng: Rng): VasaLevel {
  const guns = scale(d, [24, 32, 40, 48])
  const maxWin = scale(d, [8, 5, 3, 2])
  for (;;) {
    const L: VasaLevel = {
      kind: 'vasa', beam: 11.7, length: 21.5, rho: RHO.fresh,
      hull: round(between(rng, 650, 760), 10), kgHull: +between(rng, 5.7, 6.2).toFixed(2), kgBallast: 1.2,
      step: 20, steps: 0, guns, gunMass: 1.5, kgLower: 5.2, kgUpper: 7.4,
      capLower: guns - randInt(rng, Math.ceil(guns / 4), Math.ceil(guns / 3)),
      minUpper: 0, sailors: 10, lever: 4.8, sill: +between(rng, 6.2, 6.6).toFixed(2),
      tests: 5, showGM: d <= 2,
    }
    if (d >= 3) L.minUpper = Math.min(guns, guns - L.capLower + randInt(rng, 2, 6))
    // The ports sit about a metre above the water once she is just stiff
    // enough; the heaviest ballast puts them under at rest.
    const area = L.rho * L.length * L.beam
    const u0 = vasaUppers(L)[0]
    L.sill = 99; L.steps = 200
    let b0 = 0
    while (b0 < 200 && vasaCore(L, b0, u0).gm <= 0) b0++
    if (b0 < 3 || b0 >= 200) continue
    L.sill = +(vasaCore(L, b0, u0).draft + between(rng, 0.9, 1.4)).toFixed(2)
    L.steps = Math.ceil((L.sill * area - L.hull - guns * L.gunMass) / L.step) + 1
    if (evalVasa(L, 0, u0).ok) continue
    // More sailors narrow the window; take the fewest that make it narrow enough.
    let found = false
    for (let s = 10; s <= 300; s += 2) {
      L.sailors = s
      const w = solveVasa(L).filter(([, u]) => u === u0).length
      if (w === 0) break
      if (w <= maxWin) { found = true; break }
    }
    if (!found) continue
    if (evalVasa(L, Math.floor(L.steps / 2), u0).ok) continue
    const bis = bisectVasa(L)
    if (!bis.win || bis.tests > L.tests - (d <= 2 ? 1 : 0)) continue
    return L
  }
}

// ── Levels ────────────────────────────────────────────────────────────────────

export type Level = CrownLevel | PlimLevel | DiverLevel | VasaLevel

export function generate(kind: Kind, difficulty: Difficulty, seed: number): Level {
  const rng = mulberry32(seed ^ hashString('eureka:' + kind))
  switch (kind) {
    case 'crown': return genCrown(difficulty, rng)
    case 'plimsoll': return genPlimsoll(difficulty, rng)
    case 'diver': return genDiver(difficulty, rng)
    case 'vasa': return genVasa(difficulty, rng)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

type Outcome = ReturnType<typeof useGameOutcome>
interface PanelProps<T> { L: T; o: Outcome }

const btn = 'h-11 rounded-xl font-bold text-sm disabled:opacity-40'
const btnMain = `${btn} bg-accent text-accent-fg active:scale-[0.98]`
const btnSoft = `${btn} bg-panel border border-line text-ink active:scale-[0.98]`

function CrownPanel({ L, o }: PanelProps<CrownLevel>) {
  const [sel, setSel] = useState<number[]>([])
  const [log, setLog] = useState<{ group: number[] | null; reading: number }[]>([])
  const used = log.filter(e => e.group).length
  const left = L.dunks - used
  const last = log[log.length - 1]
  const toggle = (i: number) => { if (!o.settled) setSel(s => (s.includes(i) ? s.filter(x => x !== i) : [...s, i].sort((a, b) => a - b))) }
  const dunk = () => {
    if (o.settled || !sel.length || left <= 0) return
    setLog(l => [...l, { group: sel, reading: crownReading(L, sel) }])
  }
  const reference = () => { if (!o.settled) setLog(l => [...l, { group: null, reading: goldReading(L, 1) }]) }
  const accuse = () => {
    if (o.settled || sel.length !== 1) return
    if (sel[0] === L.fake) o.win()
    else o.lose(`Crown ${sel[0] + 1} was pure gold — the cheat was crown ${L.fake + 1}`)
  }
  const fill = last ? Math.min(1, last.reading / Math.max(60, L.n * L.mass / RHO.gold)) : 0

  return (
    <>
      <p className="text-ink-2 text-xs font-bold" data-testid="eu-goal">
        Each crown weighs {L.mass} g. Gold is {RHO.gold} g/cm³, silver {RHO.silver}. Jar marks every {L.res} mL.
      </p>
      <svg viewBox="0 0 360 150" className="w-full max-w-[420px] mx-auto rounded-lg border border-line bg-paper block">
        <rect x={60} y={60} width={130} height={80} rx={6} fill="#6aa5c8" fillOpacity={0.5} stroke="#475569" strokeWidth={2} />
        <path d="M190 64 L215 64 L240 96" fill="none" stroke="#475569" strokeWidth={3} />
        <rect x={60} y={38} width={130} height={18} rx={4} fill="#a16207" fillOpacity={0.25} stroke="#a16207" />
        <text x={125} y={51} textAnchor="middle" fontSize={11} fill="#713f12">{sel.length ? `♛ ×${sel.length}` : 'basket empty'}</text>
        <rect x={230} y={40} width={50} height={100} fill="none" stroke="#475569" strokeWidth={2} />
        <rect x={232} y={140 - 98 * fill} width={46} height={98 * fill} fill="#6aa5c8" fillOpacity={0.8} />
        {Array.from({ length: 11 }, (_, k) => <line key={k} x1={280} x2={286} y1={140 - k * 9.8} y2={140 - k * 9.8} stroke="#475569" />)}
        <text x={300} y={95} fontSize={13} fontWeight={700} fill="currentColor" data-testid="eu-reading">{last ? `${last.reading} mL` : '— mL'}</text>
      </svg>
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: L.n }, (_, i) => (
          <button key={i} type="button" data-testid={`crown-${i}`} onClick={() => toggle(i)} disabled={o.settled}
            className={`h-11 rounded-lg border text-xs font-bold ${sel.includes(i) ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink'}`}>
            ♛{i + 1}
          </button>
        ))}
      </div>
      {!o.settled && (
        <div className="flex gap-2">
          <button type="button" data-testid="eu-dunk" onClick={dunk} disabled={!sel.length || left <= 0} className={`flex-1 ${btnMain}`}>
            Lower basket ({left} left)
          </button>
          {L.reference && <button type="button" data-testid="eu-ref" onClick={reference} className={`px-3 ${btnSoft}`}>Gold ingot</button>}
          <button type="button" data-testid="eu-accuse" onClick={accuse} disabled={sel.length !== 1} className={`px-3 ${btnSoft}`}>Accuse</button>
        </div>
      )}
      <ul className="text-[11px] text-ink-2 leading-relaxed" data-testid="eu-log">
        {log.map((e, k) => (
          <li key={k}>{e.group ? `Crowns ${e.group.map(i => i + 1).join(', ')}` : `Pure gold ingot, ${L.mass} g`}: <b>{e.reading} mL</b> spilled</li>
        ))}
      </ul>
    </>
  )
}

function PlimsollPanel({ L, o }: PanelProps<PlimLevel>) {
  const [on, setOn] = useState<boolean[]>(() => L.crates.map(() => false))
  const [moves, setMoves] = useState(0)
  const draft = dockDraft(L, on)
  const toggle = (i: number) => {
    if (o.settled) return
    const next = on.map((x, j) => (j === i ? !x : x))
    const m = moves + 1
    setOn(next); setMoves(m)
    if (plimSinks(L, next)) o.lose(`She sank at the quay: ${dockDraft(L, next).toFixed(2)} m draft, hull only ${L.depth} m deep`)
    else if (m >= L.cap && !plimWins(L, next)) o.lose('The crane crew has had enough — out of moves')
  }
  const sail = () => {
    if (o.settled) return
    const t = seaDraft(L, on)
    if (plimWins(L, on)) o.win()
    else if (t > L.line) o.lose(`Overloaded: ${t.toFixed(2)} m at sea, the line is at ${L.line.toFixed(2)} m`)
    else o.lose(`Sailing light: ${t.toFixed(2)} m at sea, ${(L.line - L.tol).toFixed(2)}–${L.line.toFixed(2)} m wanted`)
  }
  // Drawing: water at y=110, 26 px per metre.
  const s = Math.min(26, 80 / L.depth)
  const keel = 110 + Math.min(draft, L.depth + 0.3) * s
  return (
    <>
      <p className="text-ink-2 text-xs font-bold" data-testid="eu-goal">
        Hull {L.length} × {L.beam} m, {L.light} t empty. Sea draft must be {(L.line - L.tol).toFixed(2)}–{L.line.toFixed(2)} m.
        {L.dockRho < RHO.sea ? ' The dock is fresh water (1.000 t/m³); the sea is 1.025.' : ' Sea water, 1.025 t/m³.'}
      </p>
      <svg viewBox="0 0 360 200" className="w-full max-w-[420px] mx-auto rounded-lg border border-line bg-paper block" data-testid="eu-ship" data-draft={draft.toFixed(3)}>
        <g style={{ transition: 'transform 0.6s', transform: `translateY(${keel - 110 - L.depth * s / 2}px)` }}>
          <path d={`M40 ${110 - L.depth * s / 2} L320 ${110 - L.depth * s / 2} L300 ${110 + L.depth * s / 2} L60 ${110 + L.depth * s / 2} Z`} fill="#7c5a3a" stroke="#3f2d1d" strokeWidth={2} />
          {Array.from({ length: Math.floor(L.depth * 2) + 1 }, (_, k) => {
            const y = 110 + L.depth * s / 2 - k * 0.5 * s
            return <g key={k}><line x1={62} x2={k % 2 ? 68 : 74} y1={y} y2={y} stroke="#fef3c7" />{k % 2 === 0 && <text x={76} y={y + 3} fontSize={8} fill="#fef3c7">{k / 2}</text>}</g>
          })}
          <circle cx={190} cy={110 + L.depth * s / 2 - L.line * s} r={9} fill="none" stroke="#fef3c7" strokeWidth={2} />
          <line x1={176} x2={204} y1={110 + L.depth * s / 2 - L.line * s} y2={110 + L.depth * s / 2 - L.line * s} stroke="#fef3c7" strokeWidth={2} />
          <text x={210} y={110 + L.depth * s / 2 - L.line * s + 3} fontSize={8} fill="#fef3c7">S {L.line.toFixed(2)}</text>
          {on.map((x, i) => x && <rect key={i} x={70 + i * 30} y={110 - L.depth * s / 2 - 14} width={26} height={14} fill="#d6b97c" stroke="#713f12" />)}
        </g>
        <rect x={0} y={110} width={360} height={90} fill="#4f93c4" fillOpacity={0.55} />
        <text x={8} y={196} fontSize={10} fill="#0f172a" data-testid="eu-draft">Draft here {draft.toFixed(2)} m</text>
        <text x={352} y={196} fontSize={10} fill="#0f172a" textAnchor="end">deck at {L.depth} m</text>
      </svg>
      <div className="grid grid-cols-2 gap-1.5">
        {L.crates.map((c, i) => (
          <button key={i} type="button" data-testid={`crate-${i}`} onClick={() => toggle(i)} disabled={o.settled}
            className={`min-h-11 px-2 py-1 rounded-lg border text-[11px] font-bold text-left ${on[i] ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink'}`}>
            {on[i] ? '⬇ ' : ''}{L.showMass ? `${c.label} · ${c.mass} t` : c.label}
          </button>
        ))}
      </div>
      {!L.showMass && (
        <p className="text-[10px] text-muted">Bulk density, t/m³: {MATERIALS.map(m => `${m.name.toLowerCase()} ${m.rho}`).join(' · ')}</p>
      )}
      <div className="flex items-center gap-2">
        <span className={`text-[11px] font-bold tabular-nums ${L.cap - moves <= 2 ? 'text-red-600' : 'text-muted'}`} data-testid="eu-moves">Crane {moves}/{L.cap}</span>
        {!o.settled && <button type="button" data-testid="eu-sail" onClick={sail} className={`flex-1 ${btnMain}`}>Cast off</button>}
      </div>
    </>
  )
}

function DiverPanel({ L, o }: PanelProps<DiverLevel>) {
  const [running, setRunning] = useState(false)
  const [state, setState] = useState<DiverState>(diverStart)
  const [cmd, setCmd] = useState(0)
  const cmdRef = useRef(0)
  cmdRef.current = cmd
  const stRef = useRef(state)
  const { win, lose, settled } = o

  useEffect(() => {
    if (!running || settled) return
    const iv = setInterval(() => {
      const next = diverStep(L, stRef.current, cmdRef.current)
      stRef.current = next
      setState(next)
      if (next.done === 'win') { clearInterval(iv); win() }
      else if (next.done === 'lose') { clearInterval(iv); lose('Out of time — the diver would not settle') }
    }, DIVER_TICK * 1000)
    return () => clearInterval(iv)
  }, [running, settled, L, win, lose])

  const H = 200, top = 20, px = H / L.height
  const band = L.bands[state.band]
  const set = (v: number) => setCmd(+Math.max(0, Math.min(L.maxSqueeze, v)).toFixed(2))
  const vAir = L.vAir0 * P0 / (P0 + state.p + RHO.fresh * G * state.h)
  return (
    <>
      <p className="text-ink-2 text-xs font-bold" data-testid="eu-goal">
        Hold the diver in the {L.bands.length > 1 ? `bands in turn (${state.band + 1}/${L.bands.length})` : 'band'} for {L.hold} s. {Math.max(0, Math.ceil(L.limit - state.t))} s left.
      </p>
      <svg viewBox="0 0 360 240" className="w-full max-w-[420px] mx-auto rounded-lg border border-line bg-paper block"
        data-testid="eu-bottle" data-depth={state.h.toFixed(5)} data-vel={state.v.toFixed(5)} data-band={state.band}>
        <rect x={130} y={top} width={100} height={H} rx={10} fill="#6aa5c8" fillOpacity={0.45} stroke="#475569" strokeWidth={2} />
        {L.bands.map((b, k) => (
          <rect key={k} x={132} y={top + b.lo * px} width={96} height={(b.hi - b.lo) * px}
            fill={k === state.band ? '#34d399' : '#94a3b8'} fillOpacity={k === state.band ? 0.4 : 0.15} />
        ))}
        <g transform={`translate(180 ${top + state.h * px})`}>
          <rect x={-6} y={0} width={12} height={22} rx={4} fill="#e2e8f0" fillOpacity={0.7} stroke="#334155" />
          <rect x={-5} y={1} width={10} height={Math.min(20, vAir / L.vAir0 * 14)} rx={3} fill="#ffffff" />
        </g>
        {Array.from({ length: 7 }, (_, k) => <g key={k}><line x1={232} x2={240} y1={top + k * 0.05 * px} y2={top + k * 0.05 * px} stroke="#475569" />
          <text x={244} y={top + k * 0.05 * px + 3} fontSize={9} fill="currentColor">{k * 5} cm</text></g>)}
        <rect x={20} y={top + H - 8} width={90} height={8} rx={4} fill="#e2e8f0" />
        <rect x={20} y={top + H - 8} width={90 * Math.min(1, state.held / L.hold)} height={8} rx={4} fill="#34d399" />
        <text x={20} y={top + H - 14} fontSize={9} fill="currentColor">held {state.held.toFixed(1)} s</text>
        <text x={20} y={top + 12} fontSize={10} fill="currentColor">depth {(state.h * 100).toFixed(1)} cm</text>
        <text x={20} y={top + 26} fontSize={10} fill="currentColor">band {(band.lo * 100).toFixed(0)}–{(band.hi * 100).toFixed(0)} cm</text>
      </svg>
      <div className="bg-panel border border-line rounded-lg px-2.5 py-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-2 font-bold">Squeeze</span>
          <span className="text-accent font-bold tabular-nums">+{cmd.toFixed(2)} kPa</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button type="button" aria-label="squeeze less" onClick={() => set(cmd - 0.1)} disabled={settled} className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">−</button>
          <input type="range" min={0} max={L.maxSqueeze} step={SQUEEZE_STEP} value={cmd} aria-label="Squeeze" data-testid="eu-squeeze"
            disabled={settled} onChange={e => set(Number(e.target.value))} className="flex-1 h-8 touch-pan-y" />
          <button type="button" aria-label="squeeze more" onClick={() => set(cmd + 0.1)} disabled={settled} className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">+</button>
        </div>
      </div>
      {!running && !settled && <button type="button" data-testid="eu-start" onClick={() => setRunning(true)} className={btnMain}>Start</button>}
    </>
  )
}

function VasaPanel({ L, o }: PanelProps<VasaLevel>) {
  const uppers = vasaUppers(L)
  const [b, setB] = useState(0)
  const [u, setU] = useState(uppers[0])
  const [used, setUsed] = useState(0)
  const [last, setLast] = useState<VasaResult | null>(null)
  const live = evalVasa(L, b, u)
  const left = L.tests - used
  const test = () => {
    if (o.settled || used >= L.tests) return
    const r = evalVasa(L, b, u)
    setLast(r); setUsed(used + 1)
    if (r.ok) o.win()
    else if (used + 1 >= L.tests) o.lose(r.why === 'capsize' ? 'She capsized at the quay' : 'The gunports flooded — no more trials')
  }
  const heel = last ? Math.min(40, last.heel) : 0
  const s = 9 // px per m
  const draft = live.draft
  return (
    <>
      <p className="text-ink-2 text-xs font-bold" data-testid="eu-goal">
        {L.sailors} sailors will run to one side. Keep the lower gunports (sill {L.sill} m above the keel) out of the water.
        {L.minUpper > 0 ? ` The king wants at least ${L.minUpper} guns on the upper deck.` : ''}
      </p>
      <svg viewBox="0 0 360 200" className="w-full max-w-[420px] mx-auto rounded-lg border border-line bg-paper block" data-testid="eu-hull">
        <g transform={`rotate(${heel} 180 120)`}>
          <g transform={`translate(${180 - L.beam / 2 * s} ${120 + draft * s - 9 * s})`}>
            <rect x={0} y={0} width={L.beam * s} height={9 * s} fill="#7c5a3a" stroke="#3f2d1d" strokeWidth={2} />
            <rect x={2} y={9 * s - b * L.step / 300 * s - 2} width={L.beam * s - 4} height={b * L.step / 300 * s} fill="#78716c" />
            <line x1={0} x2={L.beam * s} y1={(9 - L.kgLower) * s} y2={(9 - L.kgLower) * s} stroke="#fef3c7" strokeOpacity={0.6} />
            <line x1={0} x2={L.beam * s} y1={(9 - L.kgUpper) * s} y2={(9 - L.kgUpper) * s} stroke="#fef3c7" strokeOpacity={0.6} />
            {[0, L.beam * s - 6].map(x => <rect key={x} x={x} y={(9 - L.sill) * s - 6} width={6} height={6} fill="#111827" />)}
          </g>
        </g>
        <rect x={0} y={120} width={360} height={80} fill="#4f93c4" fillOpacity={0.55} />
        <text x={8} y={194} fontSize={10} fill="#0f172a">draft {draft.toFixed(2)} m · freeboard to ports {(L.sill - draft).toFixed(2)} m{L.showGM ? ` · GM ${live.gm.toFixed(2)} m` : ''}</text>
      </svg>
      <div className="bg-panel border border-line rounded-lg px-2.5 py-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-2 font-bold">Stone ballast</span>
          <span className="text-accent font-bold tabular-nums" data-testid="eu-ballast-val">{b * L.step} t</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button type="button" aria-label="less ballast" onClick={() => setB(Math.max(0, b - 1))} disabled={o.settled} className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">−</button>
          <input type="range" min={0} max={L.steps} step={1} value={b} aria-label="Ballast" data-testid="eu-ballast" disabled={o.settled}
            onChange={e => setB(Number(e.target.value))} className="flex-1 h-8 touch-pan-y" />
          <button type="button" aria-label="more ballast" onClick={() => setB(Math.min(L.steps, b + 1))} disabled={o.settled} className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">+</button>
        </div>
      </div>
      <div className="bg-panel border border-line rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-ink-2 font-bold">Guns: <span data-testid="eu-upper-val">{L.guns - u} lower · {u} upper</span></span>
        <div className="flex gap-1">
          <button type="button" data-testid="eu-upper-down" aria-label="move a gun down" onClick={() => setU(Math.max(uppers[0], u - 1))} disabled={o.settled} className="w-9 h-8 rounded-md bg-paper border border-line text-ink font-bold">▼</button>
          <button type="button" data-testid="eu-upper-up" aria-label="move a gun up" onClick={() => setU(Math.min(L.guns, u + 1))} disabled={o.settled} className="w-9 h-8 rounded-md bg-paper border border-line text-ink font-bold">▲</button>
        </div>
      </div>
      <p className="text-[10px] text-muted">Lower deck takes {L.capLower} guns of {L.gunMass} t; ballast lies {L.kgBallast} m above the keel; gundecks at {L.kgLower} and {L.kgUpper} m.</p>
      {!o.settled && <button type="button" data-testid="eu-test" onClick={test} className={btnMain}>Run the sailors across ({left} left)</button>}
      {last && (
        <p className="text-[11px] leading-relaxed text-ink-2" data-testid="eu-note">
          {last.why === 'capsize' && <b className="text-red-600">Capsized: GM {last.gm.toFixed(2)} m is not above zero. </b>}
          {last.why === 'awash' && <b className="text-red-600">The ports are under water before anyone moves. </b>}
          {(last.why === 'tender' || last.why === 'deep') && <b className="text-red-600">Ports flooded. </b>}
          {last.why !== 'capsize' && last.why !== 'awash' && <>Heel {last.heel.toFixed(1)}°, GM {last.gm.toFixed(2)} m: the ports dipped {last.dip.toFixed(2)} m with {last.freeboard.toFixed(2)} m to spare. </>}
          {L.showGM && last.why === 'tender' && 'She is too tender: more weight down low.'}
          {L.showGM && last.why === 'deep' && 'She floats too deep: less ballast.'}
        </p>
      )}
    </>
  )
}

export default function EurekaGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'hiero-crown')
  const L = useMemo(() => generate(config.kind, difficulty, seed), [config.kind, difficulty, seed])
  const o = useGameOutcome({ onWin, onLose })
  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div>
        <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title} · {config.rule}</p>
        <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
      </div>
      {L.kind === 'crown' && <CrownPanel L={L} o={o} />}
      {L.kind === 'plimsoll' && <PlimsollPanel L={L} o={o} />}
      {L.kind === 'diver' && <DiverPanel L={L} o={o} />}
      {L.kind === 'vasa' && <VasaPanel L={L} o={o} />}
      <OutcomeBanner outcome={o.outcome} detail={config.fact} winTitle="Eureka!" loseTitle={o.reason ?? 'Not this time'} />
    </div>
  )
}
