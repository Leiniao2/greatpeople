import { useCallback, useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, pick, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Gear Train — build or repair a train of gears so the output axle turns at
// the target speed ratio (and direction).  The input gear on the left always
// turns clockwise.  Each axle carries one gear, or on compound configs two
// gears fixed together: the first meshes the axle before, the second drives
// the axle after.  Output speed / input speed = Π driver teeth / Π driven
// teeth, every mesh reverses the direction, and two meshing gears sit
// (Ta + Tb) / 2 units apart.  "Engage" tests the train; a wrong train is a
// mistake (3 / 3 / 2 / 2 allowed).
//
//   config        rule twist
//   water-mill    simple gears only; the millstone axle is at a FIXED distance —
//                 span it exactly with idlers of the right count and sizes
//   clock-train   compound axles; a box where each gear exists once; ratio and
//                 (from D2) direction, an idler may be needed to flip it
//   motion-work   a clock's motion work: the hour wheel must come back onto the
//                 minute arbor, so both meshes need the same tooth sum
//   antikythera   restoration: a broken train with missing gears; deduce their
//                 tooth counts from the ratio and the fixed axle distances
//
//   tier  water-mill        clock-train          motion-work     antikythera        ≈ time
//   D1    2 meshes, open box 2 meshes, 4 decoys  1:3–1:4, 3 dec  3 axles, 1 gap     ~1 min
//   D2    3 meshes, open box 2 meshes + dir, 5   1:4–1:6, 4 dec  4 axles, 1 gap     ~1.5 min
//   D3    4 meshes, limited 3 meshes + dir, 6   1:6–1:9, 5 dec  4 axles, 2 gaps    ~2–2.5 min
//   D4    5 meshes, limited 4 meshes + dir, 6   1:12–1:16, 6    5 axles, 3 gaps    ~3 min

type Mode = 'build' | 'slots'
type Kind = 'water-mill' | 'clock-train' | 'motion-work' | 'antikythera'

interface GearConfig {
  title: string
  intro: string
  fact: string
  kind: Kind
  /** Highest difficulty at which the live ratio is shown. */
  liveRatioUpTo: number
}

export const CONFIGS: Record<string, GearConfig> = {
  'water-mill': {
    title: 'The Water Mill',
    intro: 'The millstone’s axle is fixed in the mill floor. Chain gears from the water-wheel gear to reach it exactly, so the stone turns at the right speed and the right way.',
    fact: 'Vitruvius described a geared water mill around 25 BC: a vertical water-wheel turning a millstone through right-angle gearing — the earliest known account of a geared mill.',
    kind: 'water-mill', liveRatioUpTo: 2,
  },
  'clock-train': {
    title: 'The Clockmaker’s Train',
    intro: 'Each wheel in the box exists only once. Put two wheels on one axle to compound the reduction, and add an idler if the hand turns the wrong way.',
    fact: 'Su Song’s astronomical clock tower at Kaifeng (1088) drove an armillary sphere through a train of gears regulated by a water-wheel escapement, two centuries before Europe’s first mechanical clocks.',
    kind: 'clock-train', liveRatioUpTo: 2,
  },
  'motion-work': {
    title: 'The Motion Work',
    intro: 'The hour hand sits on a pipe around the minute arbor, so the train must come back to where it started: both meshes need the same tooth sum, and the hour wheel must turn at the target fraction.',
    fact: 'In a clock’s “motion work” the minute pinion drives a minute wheel, whose own pinion drives the hour wheel on the same centre as the minute hand — the reduction is 12 : 1 so the hour hand goes round twice a day.',
    kind: 'motion-work', liveRatioUpTo: 1,
  },
  antikythera: {
    title: 'The Antikythera Mechanism',
    intro: 'A corroded train from the sea: some wheels are lost. Work out their tooth counts from the ratio the dial must show and the fixed axle distances, then fit them from the box of fragments.',
    fact: 'Found in a shipwreck off Antikythera in 1901, the mechanism (c. 100 BC) has about 30 surviving bronze gears; its largest wheel has 223 teeth — the number of lunar months in the Saros eclipse cycle.',
    kind: 'antikythera', liveRatioUpTo: 0,
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Pure logic ─────────────────────────────────────────────────────────────────

/** An axle: [gear] or [driven, driver]; null marks a missing gear. */
export type Axle = (number | null)[]
export type Train = Axle[]

export interface BoxItem { size: number; count: number | null }

export interface Puzzle {
  kind: Kind
  mode: Mode
  compound: boolean
  input: number
  /** Initial train (input axle first); for slots mode it includes the gaps. */
  start: Train
  box: BoxItem[]
  /** Output turns : input turns, reduced. */
  ratio: [number, number]
  /** Required output direction (1 clockwise, −1 anticlockwise), or null for any. */
  dir: 1 | -1 | null
  /** Exact input-to-output distance (water-mill). */
  reach?: number
  /** Fixed tooth sums for some meshes (antikythera). */
  meshSums: Record<number, number>
  /** Meshes that must have equal tooth sums (motion-work). */
  equalMeshes?: [number, number]
  maxAxles: number
  solution: Train
  mistakes: number
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
export function reduce(p: number, q: number): [number, number] { const g = gcd(p, q) || 1; return [p / g, q / g] }

const first = (a: Axle) => a[0]
const last = (a: Axle) => a[a.length - 1]

/** Output : input as a reduced fraction, or null if the train is incomplete. */
export function trainRatio(train: Train): [number, number] | null {
  let p = 1, q = 1
  for (let k = 0; k + 1 < train.length; k++) {
    const a = last(train[k]), b = first(train[k + 1])
    if (a == null || b == null) return null
    p *= a; q *= b
    const g = gcd(p, q); p /= g; q /= g
  }
  return [p, q]
}

export const meshCount = (train: Train) => train.length - 1
export const outputDir = (train: Train): 1 | -1 => (meshCount(train) % 2 === 0 ? 1 : -1)

/** Twice the centre distance of mesh k (the tooth sum), or null with a gap. */
export function meshSum(train: Train, k: number): number | null {
  const a = last(train[k]), b = first(train[k + 1])
  return a == null || b == null ? null : a + b
}

/** Distance from input axle to output axle, in tooth units (sum / 2). */
export function trainReach(train: Train): number | null {
  let s = 0
  for (let k = 0; k + 1 < train.length; k++) { const m = meshSum(train, k); if (m == null) return null; s += m }
  return s / 2
}

/** Signed speed of every axle relative to the input (0 past a gap). */
export function axleSpeeds(train: Train): number[] {
  const out = [1]
  for (let k = 0; k + 1 < train.length; k++) {
    const a = last(train[k]), b = first(train[k + 1])
    out.push(a == null || b == null || out[k] === 0 ? 0 : -out[k] * (a / b))
  }
  return out
}

export function checkTrain(p: Puzzle, train: Train): string[] {
  const problems: string[] = []
  if (train.length < 2) return ['Add gears to reach the output']
  if (train.some(a => a.some(g => g == null))) return ['Some wheels are still missing']
  if (train.length > p.maxAxles) problems.push(`Only ${p.maxAxles - 1} axles fit in the frame`)
  if (!p.compound && train.some(a => a.length > 1)) problems.push('Compound axles are not allowed here')
  if (p.reach != null && trainReach(train) !== p.reach) problems.push(`The train must end exactly at the output axle (${p.reach})`)
  for (const [k, s] of Object.entries(p.meshSums)) if (meshSum(train, Number(k)) !== s) problems.push('A wheel does not fit its axle spacing')
  if (p.equalMeshes) {
    const [i, j] = p.equalMeshes
    if (meshSum(train, i) !== meshSum(train, j)) problems.push('The hour wheel does not come back onto the minute arbor')
  }
  const r = trainRatio(train)
  if (!r || r[0] !== p.ratio[0] || r[1] !== p.ratio[1]) problems.push('The output turns at the wrong speed')
  if (p.dir != null && outputDir(train) !== p.dir) problems.push('The output turns the wrong way')
  return problems
}

/** Gears a train uses beyond the fixed input (and beyond the pre-fitted ones in slots mode). */
export function usedGears(start: Train, train: Train, mode: Mode): number[] {
  if (mode === 'build') return train.slice(1).flat().filter((g): g is number => g != null)
  const out: number[] = []
  train.forEach((a, k) => a.forEach((g, j) => { if (start[k]?.[j] == null && g != null) out.push(g) }))
  return out
}

/** True when the box holds enough of each size for these gears. */
export function boxAllows(box: BoxItem[], gears: number[]): boolean {
  const need = new Map<number, number>()
  for (const g of gears) need.set(g, (need.get(g) ?? 0) + 1)
  for (const [size, n] of need) {
    const item = box.find(b => b.size === size)
    if (!item || (item.count != null && item.count < n)) return false
  }
  return true
}

function makeBox(gears: number[], decoys: number[], limited: boolean): BoxItem[] {
  const counts = new Map<number, number>()
  for (const g of [...gears, ...decoys]) counts.set(g, (counts.get(g) ?? 0) + 1)
  return [...counts.keys()].sort((a, b) => a - b).map(size => ({ size, count: limited ? counts.get(size)! : null }))
}

function decoysFrom(pool: number[], n: number, rng: Rng, avoid: number[] = []): number[] {
  return shuffle(pool.filter(x => !avoid.includes(x)), rng).slice(0, n)
}

const WATER_POOL = [8, 10, 12, 14, 16, 18, 20, 24, 28, 30, 32, 36, 40]
const CLOCK_POOL = [8, 10, 12, 15, 16, 18, 20, 24, 30, 32, 36, 40, 45, 48, 60, 64]
const MOTION_POOL = [6, 7, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 24, 27, 28, 30, 32, 36, 40, 42, 45, 48, 54, 56, 60, 64, 72]
const ANTIK_POOL = [15, 20, 24, 27, 30, 32, 38, 48, 50, 54, 57, 60, 64, 96]

function genWaterMill(d: Difficulty, rng: Rng): Omit<Puzzle, 'mistakes'> {
  const meshes = scale(d, [2, 3, 4, 5])
  const input = pick([16, 20, 24, 30, 36, 40], rng)
  let out = pick(WATER_POOL, rng)
  while (out === input) out = pick(WATER_POOL, rng)
  const idlers = Array.from({ length: meshes - 1 }, () => pick(WATER_POOL, rng))
  const solution: Train = [[input], ...idlers.map(t => [t]), [out]]
  const limited = d >= 3
  const box = limited ? makeBox([...idlers, out], decoysFrom(WATER_POOL, scale(d, [0, 0, 5, 6]), rng), true) : makeBox(WATER_POOL, [], false)
  return {
    kind: 'water-mill', mode: 'build', compound: false, input, start: [[input]], box,
    ratio: trainRatio(solution)!, dir: outputDir(solution), reach: trainReach(solution)!, meshSums: {},
    maxAxles: meshes + 1, solution,
  }
}

function genClock(d: Difficulty, rng: Rng): Omit<Puzzle, 'mistakes'> | null {
  const compoundAxles = scale(d, [1, 1, 2, 3])
  const input = pick([8, 10, 12, 16], rng)
  const solution: Train = [[input]]
  for (let k = 0; k < compoundAxles; k++) {
    const a = pick(CLOCK_POOL, rng)
    let b = pick(CLOCK_POOL, rng)
    while (b === a) b = pick(CLOCK_POOL, rng)
    solution.push([a, b])
  }
  solution.push([pick(CLOCK_POOL, rng)])
  const r = trainRatio(solution)!
  if (r[0] === r[1] || r[0] > 64 || r[1] > 64) return null
  // Reductions read like a clock (the hand turns slower than the drive).
  if (r[0] > r[1]) return null
  let dir: 1 | -1 | null = null
  if (d >= 2) {
    dir = outputDir(solution)
    if (rng() < 0.5) {
      // Demand the other direction: the solution needs an idler somewhere.
      const idler = pick(CLOCK_POOL, rng)
      const at = 1 + Math.floor(rng() * (solution.length - 1))
      solution.splice(at, 0, [idler])
      dir = outputDir(solution)
      if (trainRatio(solution)![0] !== r[0] || trainRatio(solution)![1] !== r[1]) return null
    }
  }
  const gears = solution.slice(1).flat() as number[]
  const box = makeBox(gears, decoysFrom(CLOCK_POOL, scale(d, [4, 5, 6, 6]), rng), true)
  return {
    kind: 'clock-train', mode: 'build', compound: true, input, start: [[input]], box,
    ratio: r, dir, meshSums: {}, maxAxles: solution.length + (dir == null ? 1 : 0), solution,
  }
}

/** All (A, B, C) with input + A = B + C and (input / A)(B / C) = 1 / R. */
export function motionSolutions(input: number, R: number, pool: number[] = MOTION_POOL): [number, number, number][] {
  const out: [number, number, number][] = []
  for (const A of pool) for (const B of pool) for (const C of pool) {
    if (input + A !== B + C) continue
    if (A * C !== R * input * B) continue
    if (A === input) continue
    out.push([A, B, C])
  }
  return out
}

function genMotion(d: Difficulty, rng: Rng): Omit<Puzzle, 'mistakes'> | null {
  const input = pick([6, 8, 10, 12], rng)
  const tiers: readonly [number[], number[], number[], number[]] = [[3, 4], [4, 5, 6], [6, 8, 9], [12, 16]]
  const R = pick(scale(d, tiers), rng)
  const sols = motionSolutions(input, R)
  if (!sols.length) return null
  const [A, B, C] = pick(sols, rng)
  const solution: Train = [[input], [A, B], [C]]
  const box = makeBox([A, B, C], decoysFrom(MOTION_POOL, scale(d, [3, 4, 5, 6]), rng, [A, B, C]), true)
  return {
    kind: 'motion-work', mode: 'slots', compound: true, input, start: [[input], [null, null], [null]], box,
    ratio: [1, R], dir: null, meshSums: {}, equalMeshes: [0, 1], maxAxles: 3, solution,
  }
}

function genAntikythera(d: Difficulty, rng: Rng): Omit<Puzzle, 'mistakes'> | null {
  const axles = scale(d, [3, 4, 4, 5])
  const input = pick(ANTIK_POOL, rng)
  const solution: Train = [[input]]
  for (let k = 1; k < axles - 1; k++) {
    const a = pick(ANTIK_POOL, rng)
    let b = pick(ANTIK_POOL, rng)
    while (b === a) b = pick(ANTIK_POOL, rng)
    solution.push([a, b])
  }
  solution.push([pick(ANTIK_POOL, rng)])
  const ratio = trainRatio(solution)!
  if (ratio[0] === ratio[1] || ratio[0] > 999 || ratio[1] > 999) return null
  const start: Train = solution.map(a => [...a])
  const meshSums: Record<number, number> = {}
  const gaps: [number, number][] = []
  const positions: [number, number][] = []
  solution.forEach((a, k) => { if (k > 0) a.forEach((_, j) => positions.push([k, j])) })
  if (d <= 2) {
    gaps.push(pick(positions, rng))
  } else {
    // A meshing pair goes missing: its axle distance is known.
    const mesh = 1 + Math.floor(rng() * (axles - 2))
    gaps.push([mesh, solution[mesh].length - 1], [mesh + 1, 0])
    meshSums[mesh] = meshSum(solution, mesh)!
    if (d === 4) {
      const rest = positions.filter(([k, j]) => !gaps.some(([gk, gj]) => gk === k && gj === j))
      // A lone gap whose mesh distance is known and whose partner is still in place.
      const lone = shuffle(rest, rng).find(([k, j]) => {
        const m = j === 0 ? k - 1 : k
        if (m < 0 || m + 1 >= axles || meshSums[m] != null) return false
        const partner: [number, number] = j === 0 ? [k - 1, solution[k - 1].length - 1] : [k + 1, 0]
        return !gaps.some(([gk, gj]) => gk === partner[0] && gj === partner[1])
      })
      if (!lone) return null
      gaps.push(lone)
      const m = lone[1] === 0 ? lone[0] - 1 : lone[0]
      meshSums[m] = meshSum(solution, m)!
    }
  }
  const missing = gaps.map(([k, j]) => solution[k][j] as number)
  for (const [k, j] of gaps) start[k][j] = null
  const box = makeBox(missing, decoysFrom(ANTIK_POOL, scale(d, [3, 4, 5, 6]), rng, missing), true)
  return { kind: 'antikythera', mode: 'slots', compound: true, input, start, box, ratio, dir: null, meshSums, maxAxles: axles, solution }
}

export function generate(config: Pick<GearConfig, 'kind'>, difficulty: Difficulty, seed: number): Puzzle {
  const rng = mulberry32(seed ^ hashString('gears:' + config.kind))
  const mistakes = scale(difficulty, [3, 3, 2, 2])
  for (let attempt = 0; attempt < 400; attempt++) {
    const p = config.kind === 'water-mill' ? genWaterMill(difficulty, rng)
      : config.kind === 'clock-train' ? genClock(difficulty, rng)
        : config.kind === 'motion-work' ? genMotion(difficulty, rng)
          : genAntikythera(difficulty, rng)
    if (p) return { ...p, mistakes }
  }
  // Fallback (never reached in tests): one plain mesh.
  const solution: Train = [[20], [10]]
  return {
    kind: config.kind, mode: 'build', compound: false, input: 20, start: [[20]], box: makeBox([10, 20, 40], [], false),
    ratio: [2, 1], dir: -1, meshSums: {}, maxAxles: 2, solution, mistakes,
  }
}

/** Every way to fill the gaps of a slots puzzle from its box that passes the check. */
export function solveSlots(p: Puzzle): Train[] {
  const gaps: [number, number][] = []
  p.start.forEach((a, k) => a.forEach((g, j) => { if (g == null) gaps.push([k, j]) }))
  const pool = p.box.flatMap(b => Array(b.count ?? 1).fill(b.size) as number[])
  const out: Train[] = []
  const used = Array(pool.length).fill(false)
  const train = p.start.map(a => [...a])
  const rec = (i: number) => {
    if (i === gaps.length) { if (!checkTrain(p, train).length) out.push(train.map(a => [...a])); return }
    const seen = new Set<number>()
    for (let k = 0; k < pool.length; k++) {
      if (used[k] || seen.has(pool[k])) continue
      seen.add(pool[k]); used[k] = true
      train[gaps[i][0]][gaps[i][1]] = pool[k]
      rec(i + 1)
      used[k] = false
    }
    train[gaps[i][0]][gaps[i][1]] = null
  }
  rec(0)
  return out
}

// ── Component ──────────────────────────────────────────────────────────────────

const GEAR_CSS = `
@keyframes gr-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
`

function gearPoints(teeth: number, r: number): string {
  const n = Math.max(6, Math.min(teeth, 72))
  const depth = Math.max(1.5, Math.min(4, r * 0.14))
  const pts: string[] = []
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const step = (Math.PI * 2) / n
    for (const [f, rr] of [[0, r - depth], [0.2, r], [0.5, r], [0.7, r - depth]] as [number, number][]) {
      const a = a0 + f * step
      pts.push(`${(r + Math.cos(a) * rr).toFixed(1)},${(r + Math.sin(a) * rr).toFixed(1)}`)
    }
  }
  return pts.join(' ')
}

function GearSvg({ teeth, r, speed, color, dashed, label }: { teeth: number; r: number; speed: number; color: string; dashed?: boolean; label?: string }) {
  const period = speed ? Math.min(60, Math.max(0.6, 6 / Math.abs(speed))) : 0
  return (
    <svg width={r * 2} height={r * 2} viewBox={`0 0 ${r * 2} ${r * 2}`} className="overflow-visible"
      style={period ? { animation: `gr-spin ${period}s linear infinite${speed < 0 ? ' reverse' : ''}` } : undefined}>
      {dashed
        ? <circle cx={r} cy={r} r={r - 1} fill="none" stroke="currentColor" strokeDasharray="4 3" className="text-muted" />
        : <polygon points={gearPoints(teeth, r)} fill={color} stroke="rgba(0,0,0,.35)" strokeWidth={0.8} />}
      {!dashed && <circle cx={r} cy={r} r={Math.max(2, r * 0.18)} fill="rgba(0,0,0,.35)" />}
      {!dashed && <line x1={r} y1={r} x2={r} y2={r * 0.35} stroke="rgba(0,0,0,.35)" strokeWidth={1.5} />}
      {label && <text x={r} y={r} dy={-r * 0.3 - 2} textAnchor="middle" fontSize={9} fill="currentColor" className="text-ink">{label}</text>}
    </svg>
  )
}

const fmtRatio = ([p, q]: [number, number]) => (q === 1 ? `${p} : 1` : `${p} : ${q}`)

export default function GearsGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'water-mill')
  const kind = (CONFIGS[configId] ?? CONFIGS['water-mill']).kind
  const puzzle = useMemo(() => generate({ kind }, difficulty, seed), [kind, difficulty, seed])
  const [train, setTrain] = useState<Train>(() => puzzle.start.map(a => [...a]))
  const [stack, setStack] = useState(false)
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const used = usedGears(puzzle.start, train, puzzle.mode)
  const left = (b: BoxItem) => (b.count == null ? Infinity : b.count - used.filter(g => g === b.size).length)
  const gaps: [number, number][] = []
  train.forEach((a, k) => a.forEach((_, j) => { if (puzzle.start[k]?.[j] == null && puzzle.mode === 'slots') gaps.push([k, j]) }))

  const placeFromBox = useCallback((size: number) => {
    if (settled) return
    setProblem(null)
    if (puzzle.mode === 'build') {
      setTrain(t => {
        const lastAxle = t[t.length - 1]
        if (stack && puzzle.compound && t.length > 1 && lastAxle.length === 1) return [...t.slice(0, -1), [lastAxle[0], size]]
        if (t.length >= puzzle.maxAxles) return t
        return [...t, [size]]
      })
      setStack(false)
      return
    }
    // Slots: fill the selected gap, else the first empty one.
    setTrain(t => {
      let target = sel
      if (!target) {
        for (const [k, j] of gaps) if (t[k][j] == null) { target = [k, j]; break }
      }
      if (!target) return t
      const next = t.map(a => [...a])
      next[target[0]][target[1]] = size
      return next
    })
    setSel(null)
  }, [settled, puzzle, stack, sel, gaps])

  const undo = useCallback(() => {
    if (settled) return
    setProblem(null)
    setTrain(t => {
      if (t.length <= 1) return t
      const lastAxle = t[t.length - 1]
      return lastAxle.length > 1 ? [...t.slice(0, -1), [lastAxle[0]]] : t.slice(0, -1)
    })
  }, [settled])

  const tapSlot = useCallback((k: number, j: number) => {
    if (settled || puzzle.mode !== 'slots' || puzzle.start[k]?.[j] != null) return
    setProblem(null)
    if (train[k][j] != null) {
      setTrain(t => { const n = t.map(a => [...a]); n[k][j] = null; return n })
      setSel([k, j])
    } else setSel([k, j])
  }, [settled, puzzle, train])

  const engage = useCallback(() => {
    if (settled) return
    const problems = checkTrain(puzzle, train)
    if (!problems.length) { win(); return }
    const m = mistakes + 1
    setMistakes(m)
    setProblem(problems[0])
    if (m >= puzzle.mistakes) lose(problems[0])
  }, [settled, puzzle, train, mistakes, win, lose])

  // Layout: axles along a line, spaced by mesh distance; gaps drawn at 24 teeth.
  const W = 340
  const sizeOf = (g: number | null) => g ?? 24
  const centres: number[] = [0]
  for (let k = 0; k + 1 < train.length; k++) centres.push(centres[k] + (sizeOf(last(train[k])) + sizeOf(first(train[k + 1]))) / 2)
  const radii = train.map(a => Math.max(...a.map(sizeOf)) / 2)
  const leftEdge = Math.min(...centres.map((c, k) => c - radii[k]))
  let rightEdge = Math.max(...centres.map((c, k) => c + radii[k]))
  if (puzzle.reach != null) rightEdge = Math.max(rightEdge, puzzle.reach + 14)
  const sc = Math.min(3, (W - 8) / (rightEdge - leftEdge))
  const maxR = Math.max(...radii, 14) * sc
  const H = Math.max(90, maxR * 2 + 24)
  const x = (u: number) => (u - leftEdge) * sc + 4
  const speeds = axleSpeeds(train)
  const ratio = trainRatio(train)
  const reach = trainReach(train)
  const showRatio = difficulty <= config.liveRatioUpTo

  const goal: string[] = [`Output ${fmtRatio(puzzle.ratio)}`]
  if (puzzle.dir != null) goal.push(puzzle.dir === 1 ? '↻ clockwise' : '↺ anticlockwise')
  if (puzzle.reach != null) goal.push(`reach ${puzzle.reach}`)
  for (const [k, s] of Object.entries(puzzle.meshSums)) goal.push(`mesh ${Number(k) + 1} sum ${s}`)
  if (puzzle.equalMeshes) goal.push('both mesh sums equal')

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <style>{GEAR_CSS}</style>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <p className="shrink-0 text-[10px] text-muted" data-testid="gears-mistakes">✗ {mistakes}/{puzzle.mistakes}</p>
      </div>

      <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs" data-testid="gears-goal">
        <p className="font-bold text-ink">{goal.join(' · ')}</p>
        <p className="text-muted text-[10px]">Output turns : input turns. The input turns clockwise. Ratio = driver teeth ÷ driven teeth, stage by stage.</p>
      </div>

      <div className="relative w-full max-w-[360px] mx-auto rounded-xl border border-line bg-paper overflow-hidden" style={{ height: H }}>
        {puzzle.reach != null && (
          <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-accent" style={{ left: x(puzzle.reach) }} data-testid="gears-target">
            <span className="absolute top-0.5 left-1 text-[9px] text-accent font-bold whitespace-nowrap">output</span>
          </div>
        )}
        {train.map((axle, k) => axle.map((g, j) => {
          const t = sizeOf(g)
          const r = (t / 2) * sc
          const isGap = g == null
          const tappable = puzzle.mode === 'slots' && puzzle.start[k]?.[j] == null
          const selected = sel && sel[0] === k && sel[1] === j
          const color = k === 0 ? '#b45309' : j === 0 ? '#a16207' : '#ca8a04'
          return (
            <button key={`${k}-${j}`} type="button" data-gear={`${k}-${j}`} data-teeth={g ?? ''}
              disabled={!tappable || settled} onClick={() => tapSlot(k, j)}
              aria-label={isGap ? `missing wheel on axle ${k + 1}` : `${g}-tooth wheel on axle ${k + 1}`}
              className={`absolute rounded-full ${selected ? 'ring-2 ring-accent' : ''} ${tappable && !settled ? 'cursor-pointer' : 'cursor-default'}`}
              style={{ left: x(centres[k]) - r, top: H / 2 - r, width: r * 2, height: r * 2, zIndex: j + 1, opacity: axle.length > 1 && j === 0 ? 0.75 : 1 }}>
              <GearSvg teeth={t} r={r} speed={isGap ? 0 : speeds[k]} color={color} dashed={isGap} label={isGap ? '?' : String(g)} />
            </button>
          )
        }))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span data-testid="gears-live">
          {showRatio && ratio ? <>Now <b className="text-ink-2">{fmtRatio(ratio)}</b> · </> : null}
          {train.length > 1 ? (outputDir(train) === 1 ? '↻ cw' : '↺ acw') : '—'}
          {puzzle.reach != null && reach != null ? <> · reach <b className="text-ink-2">{reach}</b>/{puzzle.reach}</> : null}
          {puzzle.equalMeshes && <> · sums {meshSum(train, 0) ?? '?'} / {meshSum(train, 1) ?? '?'}</>}
        </span>
        <span>{puzzle.mode === 'build' ? `axles ${train.length - 1}/${puzzle.maxAxles - 1}` : `${gaps.filter(([k, j]) => train[k][j] == null).length} missing`}</span>
      </div>
      {problem && !settled && <p className="text-[11px] text-red-600 -mt-1" data-testid="gears-problem">{problem}</p>}

      {!settled && (
        <>
          <div className="flex flex-wrap gap-1.5 justify-center" data-testid="gears-box">
            {puzzle.box.map(b => {
              const n = left(b)
              return (
                <button key={b.size} type="button" data-box={b.size} disabled={n <= 0} onClick={() => placeFromBox(b.size)}
                  className={`min-w-11 h-10 px-2 rounded-lg border text-xs font-bold tabular-nums
                    ${n > 0 ? 'bg-panel border-line text-ink hover:border-accent/60' : 'bg-paper border-line text-muted/40'}`}>
                  {b.size}{b.count != null && <span className="text-[9px] text-muted font-normal ml-0.5">×{Math.max(0, n)}</span>}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {puzzle.mode === 'build' ? (
              <>
                <button type="button" onClick={undo} className="h-10 rounded-lg border border-line bg-panel text-xs font-bold text-ink-2">↶ Remove</button>
                {puzzle.compound ? (
                  <button type="button" data-testid="gears-stack" onClick={() => setStack(s => !s)}
                    className={`h-10 rounded-lg border text-[11px] font-bold ${stack ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
                    ⊕ Same axle
                  </button>
                ) : <span />}
              </>
            ) : (
              <p className="col-span-2 text-[10px] text-muted self-center">Tap a missing wheel, then a fragment. Tap a fitted wheel to take it out.</p>
            )}
            <button type="button" data-testid="gears-engage" onClick={engage} className="h-10 rounded-lg bg-accent text-accent-fg text-sm font-bold">Engage</button>
          </div>
        </>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The train runs true!" loseTitle={reason ?? 'The train jams'} />
    </div>
  )
}
