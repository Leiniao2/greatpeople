import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import {
  mulberry32, hashString, pick, shuffle, randInt, resolveConfig, scale,
  useGameOutcome, useGameTimer, TimerBar, OutcomeBanner, type Rng,
} from './_shared'

// Balance and Lever — torque puzzles.  Every config is a lever, but each one
// works by a different rule, and the player sets the machine by hand (slide
// the fulcrum, add counterweight lumps, move a poise) and then tests it.
// All weights are in kilograms-force (kgf) and lengths in metres unless a
// config says otherwise, so torque = weight × arm in kgf·m.
//
//   lever    Archimedes: a beam on a fulcrum block.  Work is conserved — the
//            men's force × effort arm must beat the stone × load arm, the
//            men must reach the raised bar end (block height × L / load arm),
//            and pushing the bar to the ground lifts the stone block × L /
//            effort arm.  D2+ choose the block; D3+ the beam's own weight.
//   shaduf   Egyptian well-sweep: the counterweight must help both strokes —
//            lifting the full bucket and pulling the empty one down must each
//            take no more than the farmer's pull.  D2+ slide the pivot (the
//            bucket arm must still reach the river); D3+ the pole's weight.
//   statera  Roman steelyard, played live: hang each good, slide the poise
//            until the damped beam settles level (m·a = P·x), record it.
//            A wrong record is a mistake; there is a time limit.  D3+ a
//            second, heavy-range hook; D4 the beam's own weight moves the
//            zero mark off the fulcrum.
//   susong   Su Song's "heavenly balance": a scoop on lever A trips when its
//            weight reaches (P·y + C·x·b/c) ÷ a, with lever B linked in
//            series (D2+).  Set it so the scoop trips nearly full but before
//            it overflows; D3+ a heavier patched scoop must trip too.
//
//   D1  1 control, 4 tests (≈1 min)       D2  2 controls, 4 tests (≈1.5 min)
//   D3  + own weight / second scoop       D4  finer steps, 3 tests (≈3 min)
//
// Every level is generated from the seed; the static levels are checked by
// enumerating every setting (some win, few enough, extremes lose) and the
// steelyard by computing the balancing notch for every good.

export type Kind = 'lever' | 'shaduf' | 'statera' | 'susong'

interface LeverConfig {
  title: string
  rule: string
  intro: string
  fact: string
  kind: Kind
}

export const CONFIGS: Record<string, LeverConfig> = {
  'archimedes-lever': {
    title: 'Archimedes’ Lever, Syracuse',
    rule: 'Work is conserved',
    intro: 'Slide the fulcrum (and pick its block) so the men can reach the bar, push it down with the force they have, and raise the stone high enough. A long effort arm saves force but lifts the stone less.',
    fact: 'Pappus of Alexandria records Archimedes’ boast: “Give me a place to stand and I will move the earth.” Plutarch tells how, for King Hiero II, Archimedes drew a fully laden ship ashore by himself with a compound pulley.',
    kind: 'lever',
  },
  shaduf: {
    title: 'The Shaduf of Thebes',
    rule: 'The counterweight must help both strokes',
    intro: 'Pack mud lumps on the short end (and slide the pivot) so the farmer can both pull the empty bucket down into the river and lift the full one, never pulling harder than he can.',
    fact: 'The shaduf — a pivoted pole with a bucket at one end and a counterweight of mud or stone at the other — appears on Akkadian seals of about 2300 BC and in Egyptian tomb paintings at Thebes from about 1500 BC. It is still used along the Nile.',
    kind: 'shaduf',
  },
  'roman-statera': {
    title: 'The Steelyard of Pompeii',
    rule: 'Sliding poise: m × a = P × x',
    intro: 'Hang each good on the hook and slide the poise along the notches until the beam settles level, then record it. Heavy goods need the heavy-range hook, closer to the load.',
    fact: 'The Roman steelyard (statera) weighed goods with one sliding poise: load × short arm = poise × long arm. Bronze steelyards found at Pompeii have two or three suspension hooks, each with its own graduated scale, for light and heavy loads.',
    kind: 'statera',
  },
  'su-song-escapement': {
    title: 'Su Song’s Heavenly Balance, 1092',
    rule: 'Levers in series: trip = (P·y + C·x·b/c) ÷ a',
    intro: 'Each scoop of the water wheel fills until its weight tips the balance and the wheel steps on. Slide the weights so a scoop trips nearly full — too light and it trips early, too heavy and it overflows.',
    fact: 'Su Song’s astronomical clock tower at Kaifeng (finished 1092) was turned by a water wheel with 36 scoops. Each filled from a constant-level tank until its weight tipped a steelyard-like “heavenly balance” and the wheel advanced one step — an escapement two centuries before Europe’s first mechanical clocks.',
    kind: 'susong',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Physics ───────────────────────────────────────────────────────────────────

/** Net torque about a pivot: Σ weight × signed arm. */
export function torque(loads: { w: number; x: number }[]): number {
  return loads.reduce((t, l) => t + l.w * l.x, 0)
}

/**
 * The Archimedes beam.  Load arm `a`, effort arm `b = L − a`, block height
 * `hf`.  With the stone end on the ground the effort end stands hf·L/a high;
 * pushed to the ground it lifts the stone to hf·L/b.
 */
export function leverPhysics(L: number, a: number, hf: number, W: number, beamW: number) {
  const b = L - a
  // A uniform beam's weight acts at its middle: it helps when the middle is on the men's side.
  const effort = (W * a - beamW * (L / 2 - a)) / b
  return { b, effort, reachH: hf * L / a, lift: hf * L / b }
}

/** The shaduf: pull needed to lift the full bucket (up) and to lower the empty one (down). */
export function shadufForces(poleL: number, xc: number, C: number, We: number, Wf: number, poleW: number) {
  const xb = poleL - xc
  const P = poleW * (poleL / 2 - xc) // pole's own torque, bucket side positive
  return { xb, up: (Wf * xb + P - C * xc) / xb, down: (C * xc - We * xb - P) / xb }
}

/** Su Song's balance: the scoop weight that tips lever A. */
export function tripWeight(a: number, P: number, y: number, C: number, x: number, b: number, c: number): number {
  return (P * y + (c > 0 ? C * x * b / c : 0)) / a
}

/** Steelyard imbalance (load side positive): m·a + T0 − P·x. */
export function stateraTorque(m: number, a: number, T0: number, P: number, x: number): number {
  return m * a + T0 - P * x
}

// ── Levels (lever, shaduf, susong) ────────────────────────────────────────────

export interface Control { key: string; label: string; values: number[]; unit: string; decimals: number }

export interface Trial {
  win: boolean
  reason: string
  note: string
  /** lever: the beam swung all the way down. */
  moved?: boolean
  /** shaduf: which strokes worked. */
  upOk?: boolean; downOk?: boolean; up?: number; down?: number
  /** susong: fill fraction at which each scoop trips (> 1: overflowed). */
  fills?: number[]
}

export interface Level {
  kind: Exclude<Kind, 'statera'>
  difficulty: Difficulty
  controls: Control[]
  shots: number
  start: number[]
  solution: number[]
  // lever
  beamL: number; W: number; men: number; f: number; H: number; reach: number; beamW: number; block: number
  // shaduf
  poleL: number; lump: number; We: number; water: number; Fmax: number; xreach: number; poleW: number; xc: number
  // susong
  armA: number; P: number; C: number; linkB: number; linkC: number; scoops: { s0: number; cap: number }[]; lo: number
}

const SHARE = [0.35, 0.25, 0.16, 0.1] as const
const MAN = 50 // kgf one man can bear down on a bar
const REACH = 2.2 // m, how high a man can grab the bar

function baseLevel(kind: Level['kind'], d: Difficulty): Level {
  return {
    kind, difficulty: d, controls: [], shots: scale(d, [4, 4, 4, 3]), start: [], solution: [],
    beamL: 0, W: 0, men: 0, f: MAN, H: 0, reach: REACH, beamW: 0, block: 0,
    poleL: 0, lump: 0, We: 0, water: 0, Fmax: 0, xreach: 0, poleW: 0, xc: 0,
    armA: 0, P: 0, C: 0, linkB: 0, linkC: 0, scoops: [], lo: 0,
  }
}

const ctl = (key: string, label: string, values: number[], unit: string, decimals: number): Control =>
  ({ key, label, values, unit, decimals })
export const range = (from: number, to: number, step: number) => {
  const out: number[] = []
  for (let k = 0; from + k * step <= to + 1e-9; k++) out.push(+(from + k * step).toFixed(6))
  return out
}
const r1 = (v: number) => Math.round(v * 10) / 10
const fmt = (v: number, d = 1) => v.toFixed(d)
export const formatValue = (c: Control, v: number) => `${v.toFixed(c.decimals)}${c.unit}`

/** The value of control `key` in a setting, or `dflt` when the level has no such control. */
function get(L: Level, idx: number[], key: string, dflt: number): number {
  const k = L.controls.findIndex(c => c.key === key)
  return k < 0 ? dflt : L.controls[k].values[idx[k]]
}

function evalLever(L: Level, idx: number[]): Trial {
  const a = get(L, idx, 'a', 0), hf = get(L, idx, 'hf', L.block)
  const { effort, reachH, lift } = leverPhysics(L.beamL, a, hf, L.W, L.beamW)
  const have = L.men * L.f
  if (reachH > L.reach + 1e-9) {
    return { win: false, moved: false, reason: 'Out of reach', note: `The bar end stands ${fmt(reachH, 2)} m up; the men can reach only ${fmt(L.reach)} m. Move the fulcrum away from the stone or use a lower block.` }
  }
  if (effort > have + 1e-9) {
    return { win: false, moved: false, reason: 'Too heavy', note: `The bar needs ${Math.round(effort)} kgf; ${L.men} men give ${have}. Short by ${Math.round(effort - have)} kgf — lengthen the effort arm.` }
  }
  if (lift < L.H - 1e-9) {
    return { win: false, moved: true, reason: 'Not high enough', note: `The bar went down with ${Math.round(Math.max(0, effort))} kgf, but the stone rose only ${fmt(lift, 2)} m of the ${fmt(L.H, 2)} m needed.` }
  }
  return { win: true, moved: true, reason: 'Raised', note: `${Math.round(Math.max(0, effort))} of ${have} kgf at the bar lifted the stone ${fmt(lift, 2)} m.` }
}

function evalShaduf(L: Level, idx: number[]): Trial {
  const lumps = get(L, idx, 'lumps', 0), xc = get(L, idx, 'xc', L.xc)
  const C = lumps * L.lump
  const { xb, up, down } = shadufForces(L.poleL, xc, C, L.We, L.We + L.water, L.poleW)
  if (L.xreach > 0 && xb < L.xreach - 1e-9) {
    return { win: false, upOk: false, downOk: false, up, down, reason: 'Bucket short of the river', note: `The bucket arm is ${fmt(xb, 2)} m; the river is ${fmt(L.xreach, 2)} m out. Move the pivot toward the counterweight.` }
  }
  const upOk = up <= L.Fmax + 1e-9, downOk = down <= L.Fmax + 1e-9
  const nums = `Lowering the empty bucket took ${fmt(Math.max(0, down))} kgf; lifting the full one took ${fmt(Math.max(0, up))} kgf (he can pull ${fmt(L.Fmax)}).`
  if (!downOk) return { win: false, upOk, downOk, up, down, reason: 'Too much counterweight', note: nums }
  if (!upOk) return { win: false, upOk, downOk, up, down, reason: 'Too little counterweight', note: nums }
  return { win: true, upOk, downOk, up, down, reason: 'Water flows', note: nums }
}

function evalSusong(L: Level, idx: number[]): Trial {
  const y = get(L, idx, 'y', 0), x = get(L, idx, 'x', 0)
  const Wt = tripWeight(L.armA, L.P, y, L.C, x, L.linkB, L.linkC)
  const fills = L.scoops.map(s => (Wt - s.s0) / s.cap)
  const lbl = (k: number) => (L.scoops.length > 1 ? (k ? 'Patched scoop' : 'Scoop') : 'Scoop')
  const parts = fills.map((f, k) => f > 1 + 1e-9
    ? `${lbl(k)} overflowed — the balance holds ${fmt(Wt, 2)} kgf, a full scoop weighs ${fmt(L.scoops[k].s0 + L.scoops[k].cap, 2)}.`
    : `${lbl(k)} tripped ${Math.round(Math.max(0, f) * 100)}% full.`)
  const note = `${parts.join(' ')} Needs ${Math.round(L.lo * 100)}–100%.`
  const over = fills.some(f => f > 1 + 1e-9)
  const early = fills.some(f => f < L.lo - 1e-9)
  if (over) return { win: false, fills, reason: 'Overflowed', note }
  if (early) return { win: false, fills, reason: 'Tripped too early', note }
  return { win: true, fills, reason: 'The wheel steps on', note }
}

export function evaluate(L: Level, idx: number[]): Trial {
  switch (L.kind) {
    case 'lever': return evalLever(L, idx)
    case 'shaduf': return evalShaduf(L, idx)
    case 'susong': return evalSusong(L, idx)
  }
}

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

export const comboCount = (L: Level) => L.controls.reduce((n, c) => n * c.values.length, 1)

/** Every winning setting (as control indices). */
export function solve(L: Level): number[][] {
  const out: number[][] = []
  forEachCombo(L, idx => { if (evaluate(L, idx).win) out.push(idx) })
  return out
}

/** Settings a player might try without thinking: every control at its minimum or maximum. */
export function extremes(L: Level): number[][] {
  return [L.controls.map(() => 0), L.controls.map(c => c.values.length - 1)]
}

function pickStart(L: Level): number[] {
  const mid = L.controls.map(c => Math.floor(c.values.length / 2))
  for (let s = 0; s < 40; s++) {
    const cand = mid.map((m, k) => (m + s * Math.max(1, Math.floor(L.controls[k].values.length / 5)) + s) % L.controls[k].values.length)
    if (!evaluate(L, cand).win) return cand
  }
  return L.controls.map(() => 0)
}

function accept(L: Level, rng: Rng, extra: (wins: number[][]) => boolean): boolean {
  const wins = solve(L)
  if (!wins.length || wins.length / comboCount(L) > SHARE[L.difficulty - 1]) return false
  if (extremes(L).some(e => evaluate(L, e).win)) return false
  if (!extra(wins)) return false
  L.solution = wins[Math.floor(rng() * wins.length)]
  L.start = pickStart(L)
  return !evaluate(L, L.start).win
}

function genLever(d: Difficulty, rng: Rng): Level {
  for (let t = 0; t < 4000; t++) {
    const L = baseLevel('lever', d)
    L.beamL = d === 1 ? pick([5, 6], rng) : pick([5, 6, 7, 8], rng)
    const step = scale(d, [0.5, 0.25, 0.25, 0.1])
    L.controls.push(ctl('a', 'Fulcrum: distance from the stone', range(0.5, L.beamL - 0.5, step), ' m', step < 0.25 ? 1 : 2))
    if (d === 1) L.block = pick([0.4, 0.5, 0.6], rng)
    else L.controls.push(ctl('hf', 'Fulcrum block height', shuffle([0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2], rng).slice(0, 4).sort((x, y) => x - y), ' m', 1))
    L.W = randInt(rng, 8, 30) * 50
    L.men = randInt(rng, 2, 8)
    L.H = randInt(rng, 4, 12) / 10
    L.beamW = d >= 3 ? 30 * L.beamL : 0
    const tallest = L.controls.length > 1 ? L.controls[1].values.length - 1 : -1
    if (accept(L, rng, wins => !wins.some(w => w[1] === tallest))) return L
  }
  throw new Error('lever: no level')
}

function genShaduf(d: Difficulty, rng: Rng): Level {
  const kTier = scale<[number, number]>(d, [[0.6, 0.72], [0.56, 0.66], [0.55, 0.64], [0.52, 0.6]])
  for (let t = 0; t < 4000; t++) {
    const L = baseLevel('shaduf', d)
    L.poleL = pick([3.5, 4, 4.5, 5], rng)
    L.lump = pick([3, 4, 5], rng)
    L.We = 2
    L.water = randInt(rng, 10, 20)
    L.Fmax = Math.round(L.water * (kTier[0] + rng() * (kTier[1] - kTier[0])) * 2) / 2
    L.controls.push(ctl('lumps', 'Counterweight lumps', range(0, scale(d, [12, 16, 20, 24]), 1), '', 0))
    if (d === 1) L.xc = r1(L.poleL * (0.25 + rng() * 0.1))
    else {
      L.controls.push(ctl('xc', 'Pivot: distance from the counterweight end', range(0.6, r1(L.poleL / 2), scale(d, [0.2, 0.2, 0.1, 0.1])), ' m', 1))
      L.xreach = r1(L.poleL * (0.55 + rng() * 0.15))
    }
    L.poleW = d >= 3 ? 4 * L.poleL : 0
    const kx = L.controls.length > 1 ? L.controls[1].values.length : 1
    const N = L.controls[0].values.length - 1
    // Max counterweight and no counterweight lose at every pivot position.
    const ok = () => {
      for (let j = 0; j < kx; j++) {
        if (evaluate(L, kx > 1 ? [N, j] : [N]).win || evaluate(L, kx > 1 ? [0, j] : [0]).win) return false
      }
      return true
    }
    if (accept(L, rng, ok)) return L
  }
  throw new Error('shaduf: no level')
}

function genSusong(d: Difficulty, rng: Rng): Level {
  for (let t = 0; t < 4000; t++) {
    const L = baseLevel('susong', d)
    L.armA = 3
    L.lo = scale(d, [0.85, 0.9, 0.92, 0.95])
    const s0 = randInt(rng, 2, 4), cap = randInt(rng, 8, 14)
    L.scoops = [{ s0, cap }]
    if (d >= 3) L.scoops.push({ s0: s0 + (d === 3 ? randInt(rng, 2, 5) : randInt(rng, 1, 3)) / 10, cap })
    const full = s0 + cap
    const yStep = scale(d, [0.25, 0.25, 0.2, 0.1])
    L.controls.push(ctl('y', 'Weight P on lever A: arm y', range(0.5, 6, yStep), '', yStep < 0.2 ? 1 : 2))
    if (d === 1) {
      L.P = Math.round(full * (0.55 + rng() * 0.25) * 2) / 2
    } else {
      L.P = Math.round(full * (0.2 + rng() * 0.2) * 2) / 2
      L.linkB = 1.5
      L.linkC = pick([1, 1.5, 3], rng)
      const xmaxGain = 4 * L.linkB / L.linkC / L.armA
      L.C = Math.max(1, Math.round(full * (0.6 + rng() * 0.4) / xmaxGain * 2) / 2)
      L.controls.push(ctl('x', 'Weight C on lever B: arm x', range(0.5, 4, scale(d, [0.5, 0.5, 0.25, 0.25])), '', 2))
    }
    if (accept(L, rng, () => true)) return L
  }
  throw new Error('susong: no level')
}

export function generate(kind: Exclude<Kind, 'statera'>, difficulty: Difficulty, seed: number): Level {
  const rng = mulberry32(seed ^ hashString('lever:' + kind))
  switch (kind) {
    case 'lever': return genLever(difficulty, rng)
    case 'shaduf': return genShaduf(difficulty, rng)
    case 'susong': return genSusong(difficulty, rng)
  }
}

// ── Steelyard levels ──────────────────────────────────────────────────────────

export interface Good { name: string; m: number }

export interface StateraLevel {
  difficulty: Difficulty
  /** Poise weight, kg. */
  P: number
  /** Notch spacing (cm) and count; the poise sits at notch 0…K. */
  step: number
  K: number
  /** Load arm (cm) of each suspension hook: [light range, heavy range]. */
  hooks: number[]
  /** Notch at which the empty beam balances (D4), and its torque P·z·step. */
  zero: number
  T0: number
  goods: Good[]
  seconds: number
  maxMistakes: number
}

const GOODS = ['amphora of garum', 'wheel of cheese', 'sack of lentils', 'bale of wool', 'pig of lead', 'basket of figs', 'jar of honey', 'bundle of nails', 'sack of salt', 'jar of olives']

export function stateraImbalance(S: StateraLevel, good: number, hook: number, notch: number): number {
  return stateraTorque(S.goods[good].m, S.hooks[hook], S.T0, S.P, notch * S.step)
}

/** Level within half a notch's worth of torque — only the exact notch qualifies. */
export const isLevel = (S: StateraLevel, good: number, hook: number, notch: number) =>
  Math.abs(stateraImbalance(S, good, hook, notch)) < S.P * S.step / 2

/** For every good, a hook and notch that balance it (null if none). */
export function solveStatera(S: StateraLevel): ({ hook: number; notch: number } | null)[] {
  return S.goods.map((_, g) => {
    for (let h = 0; h < S.hooks.length; h++) for (let k = 0; k <= S.K; k++) if (isLevel(S, g, h, k)) return { hook: h, notch: k }
    return null
  })
}

export function generateStatera(difficulty: Difficulty, seed: number): StateraLevel {
  const d = difficulty
  const rng = mulberry32(seed ^ hashString('lever:statera'))
  const P = pick([1, 1.5, 2], rng)
  const K = scale(d, [10, 16, 24, 30])
  const step = scale(d, [4, 2.5, 2, 1.5])
  const hooks = d >= 3 ? [10, 4] : [10]
  const zero = d === 4 ? randInt(rng, 2, 4) : 0
  const T0 = P * zero * step
  const n = scale(d, [3, 4, 5, 6])
  const names = shuffle(GOODS, rng).slice(0, n)
  // Heaviest good the light hook can weigh; heavy goods need the heavy hook.
  const lightMax = (P * K * step - T0) / hooks[0]
  const heavyIdx = new Set<number>()
  if (hooks.length > 1) for (const i of shuffle(range(0, n - 1, 1), rng).slice(0, Math.ceil(n / 3))) heavyIdx.add(i)
  const goods: Good[] = []
  let prev = -1
  for (let i = 0; i < n; i++) {
    const h = heavyIdx.has(i) ? 1 : 0
    let kmin = zero + 1
    if (h === 1) while ((P * kmin * step - T0) / hooks[1] <= lightMax + 1e-9) kmin++
    let k = prev
    while (k === prev) k = randInt(rng, kmin, K - 1)
    prev = k
    goods.push({ name: names[i], m: (P * k * step - T0) / hooks[h] })
  }
  return { difficulty: d, P, step, K, hooks, zero, T0, goods, seconds: scale(d, [75, 100, 150, 180]), maxMistakes: scale(d, [3, 2, 2, 2]) }
}

// ── Components ────────────────────────────────────────────────────────────────

const ANIM_MS = 1500
const TICK_MS = 40
const ease = (t: number) => t * t * (3 - 2 * t)

export default function LeverGame(props: MinigameProps) {
  const config = resolveConfig(CONFIGS, props.configId, props.params, 'archimedes-lever')
  if (config.kind === 'statera') return <StateraPlay {...props} config={config} />
  return <StaticPlay {...props} config={config} kind={config.kind} />
}

function Header({ config, right }: { config: LeverConfig; right: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
        <p className="text-ink-2 text-[11px] font-bold">Rule: {config.rule}</p>
        <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
      </div>
      <div className="shrink-0 text-right text-[10px] text-muted">{right}</div>
    </div>
  )
}

function goalText(L: Level): string {
  switch (L.kind) {
    case 'lever':
      return `Raise the ${L.W} kgf stone ${fmt(L.H, 2)} m. ${L.men} men push ${L.f} kgf each and reach ${fmt(L.reach)} m.${L.beamW ? ` The beam weighs ${L.beamW} kgf.` : ''}`
    case 'shaduf':
      return `Bucket ${L.We} kg empty, ${L.We + L.water} kg full; counterweight lumps ${L.lump} kg each. Pull at most ${fmt(L.Fmax)} kgf either way.${L.xreach ? ` The river is ${fmt(L.xreach, 2)} m from the pivot.` : ''}${L.poleW ? ` The pole weighs ${fmt(L.poleW)} kg.` : ''}`
    case 'susong':
      return `Trip weight = ${L.C ? `(P·y + C·x·b/c) ÷ a with P = ${L.P}, C = ${L.C}, b = ${L.linkB}, c = ${L.linkC}` : `P·y ÷ a with P = ${L.P}`}, a = ${L.armA}. ${L.scoops.map((s, k) => `${k ? 'Patched scoop' : 'Scoop'} ${s.s0} kg + ${s.cap} kg water`).join('; ')}. Trip at ${Math.round(L.lo * 100)}–100% full.`
  }
}

function StaticPlay({ difficulty, seed, onWin, onLose, config, kind }: MinigameProps & { config: LeverConfig; kind: Level['kind'] }) {
  const L = useMemo(() => generate(kind, difficulty, seed), [kind, difficulty, seed])
  const [idx, setIdx] = useState<number[]>(L.start)
  const [used, setUsed] = useState(0)
  const [anim, setAnim] = useState<{ trial: Trial; frac: number } | null>(null)
  const [last, setLast] = useState<Trial | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const usedRef = useRef(0)

  useEffect(() => { setIdx(L.start); setUsed(0); usedRef.current = 0; setLast(null); setAnim(null) }, [L])

  const setCtl = (k: number, v: number) => {
    if (settled || anim) return
    const n = L.controls[k].values.length
    setIdx(prev => prev.map((x, j) => (j === k ? Math.max(0, Math.min(n - 1, v)) : x)))
  }

  const test = useCallback(() => {
    if (settled || anim) return
    usedRef.current += 1
    setUsed(usedRef.current)
    setAnim({ trial: evaluate(L, idx), frac: 0 })
  }, [settled, anim, L, idx])

  useEffect(() => {
    if (!anim) return
    const iv = setInterval(() => setAnim(a => (a ? { ...a, frac: Math.min(1, a.frac + TICK_MS / ANIM_MS) } : a)), TICK_MS)
    return () => clearInterval(iv)
  }, [anim !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!anim || anim.frac < 1) return
    const trial = anim.trial
    setAnim(null)
    setLast(trial)
    if (trial.win) win()
    else if (usedRef.current >= L.shots) lose(`${trial.reason} — no tests left`)
  }, [anim, L.shots, win, lose])

  const left = L.shots - used
  const verb = kind === 'lever' ? 'Heave!' : kind === 'shaduf' ? 'Draw water' : 'Run a scoop'
  const frame = anim ?? (last ? { trial: last, frac: 1 } : null)

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <Header config={config} right={
        <p data-testid="lev-left" className={`font-bold tabular-nums ${left <= 1 ? 'text-red-600' : 'text-accent'}`}>Tests {left}/{L.shots}</p>
      } />
      <p className="text-ink-2 text-xs font-bold" data-testid="lev-goal">{goalText(L)}</p>

      <div className="w-full max-w-[440px] mx-auto rounded-xl border border-line overflow-hidden bg-paper">
        {kind === 'lever' && <LeverScene L={L} idx={idx} frame={anim ? frame : null} />}
        {kind === 'shaduf' && <ShadufScene L={L} idx={idx} frame={anim ? frame : null} />}
        {kind === 'susong' && <SusongScene L={L} idx={idx} frame={frame} />}
      </div>

      {kind === 'shaduf' && last && !anim && (
        <div className="flex flex-col gap-1" data-testid="lev-bars">
          {[['Lower empty', last.down ?? 0], ['Lift full', last.up ?? 0]].map(([label, v]) => {
            const val = v as number, max = Math.max(L.Fmax * 2, 1)
            return (
              <div key={label as string} className="flex items-center gap-2 text-[10px]">
                <span className="w-16 text-muted">{label}</span>
                <div className="relative flex-1 h-2 bg-panel rounded-full overflow-hidden">
                  <div className={`h-full ${val > L.Fmax ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, Math.max(0, val) / max * 100)}%` }} />
                  <div className="absolute top-0 h-full w-0.5 bg-ink" style={{ left: '50%' }} />
                </div>
                <span className="w-14 text-right tabular-nums text-ink-2">{fmt(Math.max(0, val))} kgf</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {L.controls.map((c, k) => (
          <div key={c.key} className="bg-panel border border-line rounded-lg px-2.5 py-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-ink-2 font-bold">{c.label}</span>
              <span className="text-accent font-bold tabular-nums" data-testid={`lev-val-${c.key}`}>{formatValue(c, c.values[idx[k]])}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button type="button" aria-label={`decrease ${c.label}`} onClick={() => setCtl(k, idx[k] - 1)} disabled={settled || !!anim}
                className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">−</button>
              <input type="range" min={0} max={c.values.length - 1} step={1} value={idx[k]} data-testid={`lev-ctl-${c.key}`}
                aria-label={c.label} disabled={settled || !!anim}
                onChange={e => setCtl(k, Number(e.target.value))} className="flex-1 h-8 touch-pan-y" />
              <button type="button" aria-label={`increase ${c.label}`} onClick={() => setCtl(k, idx[k] + 1)} disabled={settled || !!anim}
                className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">+</button>
            </div>
          </div>
        ))}
      </div>

      {!settled && (
        <button type="button" data-testid="lev-test" onClick={test} disabled={!!anim}
          className={`h-11 rounded-xl font-bold text-sm ${anim ? 'bg-panel text-muted' : 'bg-accent text-accent-fg active:scale-[0.98]'}`}>
          {anim ? 'Testing…' : `${verb} (${left} left)`}
        </button>
      )}

      {last && !anim && (
        <p className="text-[11px] leading-relaxed text-ink-2" data-testid="lev-note">
          {!last.win && <span className="font-bold text-red-600">{last.reason}. </span>}{last.note}
        </p>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Balanced!" loseTitle={reason ?? 'The lever beat you'} />
    </div>
  )
}

type Frame = { trial: Trial; frac: number } | null

const INK = '#3f3a33', WOOD = '#9a6b3c', STONE = '#9ca3af', WATER = '#60a5fa', OK = '#10b981', BAD = '#ef4444'

function LeverScene({ L, idx, frame }: { L: Level; idx: number[]; frame: Frame }) {
  const a = get(L, idx, 'a', 0), hf = get(L, idx, 'hf', L.block)
  const b = L.beamL - a
  const TOP = 3.0
  const Y = (h: number) => TOP - h
  const th0 = Math.asin(Math.min(1, hf / a)), th1 = -Math.asin(Math.min(1, hf / b))
  let th = th0
  if (frame) th = frame.trial.moved ? th0 + (th1 - th0) * ease(frame.frac) : th0 - 0.02 * Math.sin(frame.frac * Math.PI * 6)
  const fx = 0.5 + a * Math.cos(th0)
  const lx = fx - a * Math.cos(th), lh = hf - a * Math.sin(th)
  const ex = fx + b * Math.cos(th), eh = hf + b * Math.sin(th)
  const W = L.beamL + 1.4
  return (
    <svg viewBox={`-0.2 0 ${W} 3.4`} className="w-full block" data-testid="lev-scene">
      <rect x={-0.2} y={Y(0)} width={W} height={0.4} fill="#d6c7a8" />
      <line x1={-0.2} x2={1.6} y1={Y(L.H)} y2={Y(L.H)} stroke={OK} strokeWidth={0.025} strokeDasharray="0.08 0.06" />
      <text x={-0.15} y={Y(L.H) - 0.05} fontSize={0.16} fill={OK}>lift {fmt(L.H, 2)} m</text>
      <line x1={fx} x2={W - 0.2} y1={Y(L.reach)} y2={Y(L.reach)} stroke="#6366f1" strokeWidth={0.02} strokeDasharray="0.06 0.06" />
      <text x={W - 0.25} y={Y(L.reach) - 0.05} fontSize={0.15} fill="#6366f1" textAnchor="end">reach {fmt(L.reach)} m</text>
      <rect x={fx - 0.18} y={Y(hf)} width={0.36} height={hf} fill={STONE} stroke={INK} strokeWidth={0.015} />
      <polygon points={`${fx - 0.1},${Y(hf)} ${fx + 0.1},${Y(hf)} ${fx},${Y(hf) - 0.02}`} fill={INK} />
      <line x1={lx} y1={Y(lh)} x2={ex} y2={Y(eh)} stroke={WOOD} strokeWidth={0.08} strokeLinecap="round" />
      <rect x={lx - 0.35} y={Y(lh + 0.5)} width={0.6} height={0.5} fill={STONE} stroke={INK} strokeWidth={0.02} rx={0.04} />
      <text x={lx - 0.05} y={Y(lh + 0.2)} fontSize={0.15} textAnchor="middle" fill={INK}>{L.W}</text>
      <circle cx={ex} cy={Y(eh) - 0.15} r={0.12} fill="#f59e0b" stroke={INK} strokeWidth={0.015} />
      <text x={ex} y={Y(eh) - 0.32} fontSize={0.15} textAnchor="middle" fill={INK}>{L.men}×{L.f}</text>
      <text x={(lx + fx) / 2} y={Y(0) + 0.25} fontSize={0.14} textAnchor="middle" fill={INK}>a {fmt(a, 2)}</text>
      <text x={(ex + fx) / 2} y={Y(0) + 0.25} fontSize={0.14} textAnchor="middle" fill={INK}>b {fmt(b, 2)}</text>
    </svg>
  )
}

function ShadufScene({ L, idx, frame }: { L: Level; idx: number[]; frame: Frame }) {
  const lumps = get(L, idx, 'lumps', 0), xc = get(L, idx, 'xc', L.xc)
  const xb = L.poleL - xc
  const TOP = 3.2, Y = (h: number) => TOP - h
  const hp = 2.2, px = 0.4 + xc
  const DOWN = 0.32, UP = -0.28
  let phi = 0
  if (frame) {
    const t = frame.trial, f = frame.frac
    if (!t.downOk) phi = UP + 0.02 * Math.sin(f * 20)
    else if (f < 0.5) phi = UP + (DOWN - UP) * ease(f * 2)
    else if (!t.upOk) phi = DOWN + 0.02 * Math.sin(f * 20)
    else phi = DOWN + (UP - DOWN) * ease((f - 0.5) * 2)
  }
  const cx = px - xc * Math.cos(phi), ch = hp + xc * Math.sin(phi)
  const bx = px + xb * Math.cos(phi), bh = hp - xb * Math.sin(phi)
  const rope = 1.3
  const W = L.poleL + 1.2
  const riverX = L.xreach ? px + L.xreach : px + xb * 0.85
  const full = frame && frame.frac >= 0.5 && frame.trial.downOk
  const cwR = 0.08 + 0.025 * Math.sqrt(lumps)
  return (
    <svg viewBox={`0 0 ${W} 3.8`} className="w-full block" data-testid="lev-scene">
      <rect x={0} y={Y(0)} width={W} height={0.6} fill="#d6c7a8" />
      <rect x={riverX - 0.15} y={Y(0) - 0.02} width={W} height={0.6} fill={WATER} opacity={0.7} />
      {L.xreach > 0 && <>
        <line x1={riverX} x2={riverX} y1={Y(2.6)} y2={Y(-0.3)} stroke={WATER} strokeWidth={0.02} strokeDasharray="0.06 0.05" />
        <text x={riverX} y={Y(2.7)} fontSize={0.14} textAnchor="middle" fill="#2563eb">river {fmt(L.xreach, 2)} m</text>
      </>}
      <line x1={px} x2={px} y1={Y(0)} y2={Y(hp)} stroke={WOOD} strokeWidth={0.1} />
      <line x1={cx} y1={Y(ch)} x2={bx} y2={Y(bh)} stroke={WOOD} strokeWidth={0.06} strokeLinecap="round" />
      <circle cx={px} cy={Y(hp)} r={0.05} fill={INK} />
      <circle cx={cx} cy={Y(ch) + cwR * 0.6} r={cwR} fill="#8b6b4a" stroke={INK} strokeWidth={0.015} />
      <text x={cx} y={Y(ch) + cwR * 0.6 + 0.05} fontSize={0.13} textAnchor="middle" fill="#fff">{lumps * L.lump}</text>
      <line x1={bx} y1={Y(bh)} x2={bx} y2={Y(bh - rope)} stroke={INK} strokeWidth={0.015} />
      <rect x={bx - 0.13} y={Y(bh - rope)} width={0.26} height={0.24} fill={full ? WATER : '#c08457'} stroke={INK} strokeWidth={0.015} />
      <text x={(cx + px) / 2} y={Y(hp) - 0.15} fontSize={0.13} textAnchor="middle" fill={INK}>{fmt(xc)} m</text>
      <text x={(bx + px) / 2} y={Y(hp) - 0.15} fontSize={0.13} textAnchor="middle" fill={INK}>{fmt(xb)} m</text>
    </svg>
  )
}

function SusongScene({ L, idx, frame }: { L: Level; idx: number[]; frame: Frame }) {
  const y = get(L, idx, 'y', 0), x = get(L, idx, 'x', 0)
  const x0 = L.armA + 0.6
  const hasB = L.C > 0
  const TOP = 3.4, Y = (h: number) => TOP - h
  const hA = 2.4, hB = 1.0
  const xB = x0 + L.linkB + L.linkC
  const W = Math.max(x0 + 6.6, xB + 0.6)
  // Which scoop is showing and how full.
  let fill = 0, tip = 0, spill = false, which = 0
  if (frame?.trial.fills) {
    const fills = frame.trial.fills, n = fills.length
    which = Math.min(n - 1, Math.floor(frame.frac * n))
    const local = Math.min(1, frame.frac * n - which)
    const f = fills[which]
    const target = Math.max(0, Math.min(1, f))
    fill = target * Math.min(1, local / 0.8)
    if (local >= 0.8) { if (f <= 1 + 1e-9) tip = (local - 0.8) / 0.2; else spill = true }
  }
  const ang = 0.18 * tip
  const scoopX = x0 - L.armA * Math.cos(ang), scoopH = hA - L.armA * Math.sin(ang)
  const pX = x0 + y * Math.cos(ang), pH = hA + y * Math.sin(ang)
  const lkX = x0 + L.linkB, lkH = hA + L.linkB * Math.sin(ang)
  const cap = 0.7
  const s = L.scoops[which]
  return (
    <svg viewBox={`0 0 ${W} 3.8`} className="w-full block" data-testid="lev-scene">
      <rect x={0} y={Y(0)} width={W} height={0.4} fill="#d6c7a8" />
      {/* lever A */}
      <polygon points={`${x0 - 0.12},${Y(hA - 0.25)} ${x0 + 0.12},${Y(hA - 0.25)} ${x0},${Y(hA)}`} fill={INK} />
      <line x1={x0 - L.armA * Math.cos(ang) - 0.1} y1={Y(scoopH)} x2={x0 + 6.1 * Math.cos(ang)} y2={Y(hA + 6.1 * Math.sin(ang))} stroke={WOOD} strokeWidth={0.07} strokeLinecap="round" />
      <line x1={scoopX} y1={Y(scoopH)} x2={scoopX} y2={Y(scoopH - 0.5)} stroke={INK} strokeWidth={0.02} />
      <rect x={scoopX - 0.35} y={Y(scoopH - 0.5)} width={0.7} height={cap} fill="none" stroke={INK} strokeWidth={0.03} />
      <rect x={scoopX - 0.33} y={Y(scoopH - 0.5 - cap + cap * fill)} width={0.66} height={cap * fill} fill={WATER} />
      <line x1={scoopX - 0.4} x2={scoopX + 0.4} y1={Y(scoopH - 0.5 - cap + cap * L.lo)} y2={Y(scoopH - 0.5 - cap + cap * L.lo)} stroke={OK} strokeWidth={0.02} strokeDasharray="0.05 0.04" />
      {spill && <path d={`M${scoopX + 0.35} ${Y(scoopH - 0.5)} q0.2 0.3 0.15 1`} stroke={WATER} strokeWidth={0.05} fill="none" />}
      <text x={scoopX} y={Y(scoopH - 1.45)} fontSize={0.16} textAnchor="middle" fill={INK}>{L.scoops.length > 1 && which ? 'patched ' : ''}{s.s0}+{s.cap}</text>
      <line x1={pX} y1={Y(pH)} x2={pX} y2={Y(pH - 0.3)} stroke={INK} strokeWidth={0.02} />
      <rect x={pX - 0.15} y={Y(pH - 0.3)} width={0.3} height={0.3} fill="#b45309" stroke={INK} strokeWidth={0.015} />
      <text x={pX} y={Y(pH - 0.2)} fontSize={0.13} textAnchor="middle" fill="#fff">P</text>
      <text x={(x0 + scoopX) / 2} y={Y(hA) - 0.12} fontSize={0.14} textAnchor="middle" fill={INK}>a {L.armA}</text>
      <text x={(x0 + pX) / 2} y={Y(hA) - 0.12} fontSize={0.14} textAnchor="middle" fill={INK}>y {fmt(y, 2)}</text>
      {hasB && <>
        <line x1={lkX} y1={Y(lkH)} x2={lkX} y2={Y(hB)} stroke={INK} strokeWidth={0.03} />
        <polygon points={`${xB - 0.12},${Y(hB - 0.25)} ${xB + 0.12},${Y(hB - 0.25)} ${xB},${Y(hB)}`} fill={INK} />
        <line x1={xB - 4.1} y1={Y(hB)} x2={xB + 0.15} y2={Y(hB)} stroke={WOOD} strokeWidth={0.06} strokeLinecap="round" />
        <line x1={xB - x} y1={Y(hB)} x2={xB - x} y2={Y(hB - 0.3)} stroke={INK} strokeWidth={0.02} />
        <rect x={xB - x - 0.15} y={Y(hB - 0.3)} width={0.3} height={0.3} fill="#7c3aed" stroke={INK} strokeWidth={0.015} />
        <text x={xB - x} y={Y(hB - 0.2)} fontSize={0.13} textAnchor="middle" fill="#fff">C</text>
        <text x={lkX + 0.08} y={Y((hA + hB) / 2)} fontSize={0.13} fill={INK}>link b {L.linkB} · c {L.linkC}</text>
        <text x={xB - x / 2} y={Y(hB) + 0.62} fontSize={0.14} textAnchor="middle" fill={INK}>x {fmt(x, 2)}</text>
      </>}
    </svg>
  )
}

// ── Steelyard (real time) ──

function StateraPlay({ difficulty, seed, onWin, onLose, config }: MinigameProps & { config: LeverConfig }) {
  const S = useMemo(() => generateStatera(difficulty, seed), [difficulty, seed])
  const [good, setGood] = useState(0)
  const [hook, setHook] = useState(0)
  const [notch, setNotch] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [theta, setTheta] = useState(0)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds: S.seconds, running: !settled, onExpire: () => lose('Out of time — the market closed') })
  const beam = useRef({ th: 0, w: 0 })
  const target = useRef(0)
  const mistakesRef = useRef(0)
  const goodRef = useRef(0)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragging = useRef(false)

  const done = good >= S.goods.length
  const imb = done ? 0 : stateraImbalance(S, good, hook, notch)
  // The beam settles toward a tilt that grows with the imbalance (capped at 14°).
  target.current = Math.max(-1, Math.min(1, imb / (S.P * S.step * 4))) * 14

  useEffect(() => {
    if (settled) return
    const iv = setInterval(() => {
      const b = beam.current, dt = TICK_MS / 1000, w0 = 5, z = 0.25
      b.w += (-w0 * w0 * (b.th - target.current) - 2 * z * w0 * b.w) * dt
      b.th += b.w * dt
      setTheta(b.th)
    }, TICK_MS)
    return () => clearInterval(iv)
  }, [settled])

  const setN = (k: number) => { if (!settled) setNotch(Math.max(0, Math.min(S.K, k))) }

  const record = () => {
    if (settled || done) return
    const g = goodRef.current
    if (isLevel(S, g, hook, notch)) {
      goodRef.current = g + 1
      setGood(g + 1)
      setMsg({ ok: true, text: `Recorded: ${S.goods[g].name}, ${fmt(S.goods[g].m, 2)} kg.` })
      if (g + 1 >= S.goods.length) win()
    } else {
      mistakesRef.current += 1
      setMistakes(mistakesRef.current)
      setMsg({ ok: false, text: `Not level — the ${imb > 0 ? 'load' : 'poise'} side is heavy by ${fmt(Math.abs(imb))} kg·cm.` })
      if (mistakesRef.current >= S.maxMistakes) lose('Too many false weighings')
    }
  }

  const a = S.hooks[hook]
  const x0 = -(S.hooks[0] + 10), xEnd = S.K * S.step + 6
  const vbW = xEnd - x0
  const onPointer = (e: RPointerEvent<SVGSVGElement>) => {
    if (!dragging.current || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    if (!r.width) return
    const wx = x0 + (e.clientX - r.left) / r.width * vbW
    setN(Math.round(wx / S.step))
  }
  const rad = -theta * Math.PI / 180
  const pt = (x: number) => [x * Math.cos(rad), x * Math.sin(rad)] as const
  const [lx, ly] = pt(-a), [px, py] = pt(notch * S.step)
  const [b0x, b0y] = pt(-a - 2), [b1x, b1y] = pt(S.K * S.step + 2)
  const g = S.goods[Math.min(good, S.goods.length - 1)]
  const level = !done && isLevel(S, good, hook, notch)

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <Header config={config} right={<>
        <p data-testid="lev-done" className="font-bold tabular-nums text-accent">Weighed {good} / {S.goods.length}</p>
        <p data-testid="lev-mistakes" className={`tabular-nums ${mistakes ? 'text-red-600 font-bold' : ''}`}>Mistakes {mistakes}/{S.maxMistakes}</p>
      </>} />
      <TimerBar remaining={timer.remaining} total={timer.total} />
      <p className="text-ink-2 text-xs font-bold" data-testid="lev-goal">
        Poise {S.P} kg; notches every {S.step} cm; {S.hooks.length > 1 ? `hooks hold the load ${S.hooks[0]} cm (light) or ${S.hooks[1]} cm (heavy) from the fulcrum` : `the load hangs ${S.hooks[0]} cm from the fulcrum`}.
        {S.zero ? ` Empty, this beam balances with the poise at notch ${S.zero}.` : ''}
      </p>
      {!done && <p className="text-xs text-ink-2" data-testid="lev-good">On the hook: <b>{g.name}</b> ({good + 1} of {S.goods.length})</p>}

      <div className="w-full max-w-[440px] mx-auto rounded-xl border border-line overflow-hidden bg-paper">
        <svg ref={svgRef} viewBox={`${x0} -14 ${vbW} 40`} className="w-full block touch-none select-none" data-testid="lev-scene"
          onPointerDown={e => { dragging.current = true; onPointer(e) }} onPointerMove={onPointer}
          onPointerUp={() => { dragging.current = false }} onPointerLeave={() => { dragging.current = false }}>
          <line x1={0} y1={-14} x2={0} y2={-1.5} stroke={INK} strokeWidth={0.5} />
          <line x1={b0x} y1={b0y} x2={b1x} y2={b1y} stroke="#a16207" strokeWidth={1.4} strokeLinecap="round" />
          {Array.from({ length: S.K + 1 }, (_, k) => {
            const [tx, ty] = pt(k * S.step)
            return <g key={k}>
              <line x1={tx} y1={ty - 0.9} x2={tx} y2={ty + 0.9} stroke={k === S.zero && S.zero ? BAD : INK} strokeWidth={k % 5 === 0 ? 0.35 : 0.18} />
              {k % 5 === 0 && <text x={tx} y={ty - 1.4} fontSize={2} textAnchor="middle" fill={INK}>{k}</text>}
            </g>
          })}
          <circle cx={0} cy={0} r={0.9} fill={INK} />
          <line x1={lx} y1={ly} x2={lx} y2={ly + 10} stroke={INK} strokeWidth={0.25} />
          {!done && <>
            <rect x={lx - 4} y={ly + 10} width={8} height={7} rx={1} fill={STONE} stroke={INK} strokeWidth={0.25} />
            <text x={lx} y={ly + 14.5} fontSize={2.2} textAnchor="middle" fill={INK}>?</text>
          </>}
          <line x1={px} y1={py} x2={px} y2={py + 5} stroke={INK} strokeWidth={0.25} />
          <path d={`M${px - 2} ${py + 5} h4 l-0.8 4 h-2.4 z`} fill="#b45309" stroke={INK} strokeWidth={0.25} data-testid="lev-poise" />
          <text x={x0 + 1} y={24} fontSize={2.2} fill={level ? OK : INK}>{level ? 'level' : `tilt ${fmt(Math.abs(theta))}°`}</text>
        </svg>
      </div>

      <div className="bg-panel border border-line rounded-lg px-2.5 py-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-2 font-bold">Poise notch (drag on the beam)</span>
          <span className="text-accent font-bold tabular-nums" data-testid="lev-val-notch">{notch} · {fmt(notch * S.step)} cm</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button type="button" aria-label="poise left" onClick={() => setN(notch - 1)} disabled={settled}
            className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">−</button>
          <input type="range" min={0} max={S.K} step={1} value={notch} data-testid="lev-notch" aria-label="Poise notch" disabled={settled}
            onChange={e => setN(Number(e.target.value))} className="flex-1 h-8 touch-pan-y" />
          <button type="button" aria-label="poise right" onClick={() => setN(notch + 1)} disabled={settled}
            className="w-8 h-8 rounded-md bg-paper border border-line text-ink font-bold active:scale-95">+</button>
        </div>
      </div>

      {!settled && (
        <div className="flex gap-2">
          {S.hooks.length > 1 && (
            <button type="button" data-testid="lev-hook" onClick={() => setHook(h => (h + 1) % S.hooks.length)}
              className="h-11 flex-1 rounded-xl font-bold text-xs bg-panel border border-line text-ink active:scale-[0.98]">
              Hook: {hook ? 'heavy' : 'light'} ({a} cm)
            </button>
          )}
          <button type="button" data-testid="lev-record" onClick={record}
            className="h-11 flex-1 rounded-xl font-bold text-sm bg-accent text-accent-fg active:scale-[0.98]">Record weight</button>
        </div>
      )}

      {msg && <p className={`text-[11px] leading-relaxed ${msg.ok ? 'text-ink-2' : 'text-red-600 font-bold'}`} data-testid="lev-note">{msg.text}</p>}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="All goods weighed!" loseTitle={reason ?? 'The market closed'} />
    </div>
  )
}
