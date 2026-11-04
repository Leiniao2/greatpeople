import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Truss Bridge — tap one joint, then another, to lay a beam between them.
// When the frame looks right, run a load test: a real pin-jointed truss
// analysis (direct stiffness method, every beam the same section) finds the
// force in every member.  The structure holds when it is rigid (the
// stiffness matrix is not singular), no beam carries more than its rated
// force, and — in the variants that demand it — every beam pushes (timber
// struts) or pulls (iron chains) only.
//
// Each variant changes what "holds" means:
//   roman-arch  compression only: struts propping the deck from the canyon walls
//   warren      equilateral lattice: equal beams only, no verticals; seeded point loads
//   pratt       a moving load: the locomotive stands on every deck joint in turn
//   eiffel      a tower, not a bridge: weight plus wind from either side
//   brunel      tension only: hang the deck from the tower tops
//
//   D1  span 2–3 / pylon 2,  6–9 beams,   4 tests, rating ×1.6,  budget ×1.5   ≈ 1 min
//   D2  span 3–4 / pylon 3,  10–17 beams, 4 tests, rating ×1.4,  budget ×1.35  ≈ 1.5 min
//   D3  span 4–5 / pylon 3–4, 10–20 beams, 3 tests, rating ×1.25, budget ×1.22 ≈ 2–2.5 min
//   D4  span 5 / pylon 4,    14–25 beams, 3 tests, rating ×1.15, budget ×1.12 ≈ 3 min
//
// Every instance is planned with a reference design found by the exported
// greedy solver (start from every allowed beam, strip wrong-sign then
// cheapest-to-lose members while the frame still holds).  The beam rating
// and the budget are then set from that design, so every level is winnable
// and the tests replay the reference through the same checker.

export type Kind = 'arch' | 'warren' | 'pratt' | 'eiffel' | 'brunel'
export type Sign = 'any' | 'compression' | 'tension'

interface TrussConfig {
  title: string
  intro: string
  fact: string
  kind: Kind
  rule: string
  unit: string
  beam: string
}

export const CONFIGS: Record<string, TrussConfig> = {
  'roman-arch': {
    title: "Trajan's Danube Bridge",
    intro: 'Prop the roadway from the canyon walls with timber struts. Pegged timber only pushes: every strut must be in compression.',
    fact: "Apollodorus of Damascus built Trajan's Bridge over the Danube in 105 CE: timber arches on twenty stone piers, over 1,100 m long. It was the longest arch bridge in the world for more than a thousand years.",
    kind: 'arch', rule: 'Compression only — no beam may pull', unit: 'denarii', beam: '#8b5a2b',
  },
  'kulibin-neva': {
    title: "Kulibin's Neva Arch",
    intro: 'Prop the roadway across the Neva from the two banks with timber struts — no piers in the river, where the spring ice would crush them. Pegged timber only pushes: every strut must be in compression.',
    fact: "Ivan Kulibin, the self-taught mechanic Catherine made head of the Academy of Sciences' workshops in 1769, designed a single wooden arch to span the Neva — about 298 m. In 1776 a one-tenth-scale model was load-tested at the Academy and held far more than its design load; the full bridge was never built.",
    kind: 'arch', rule: 'Compression only — no beam may pull', unit: 'roubles', beam: '#8b5a2b',
  },
  warren: {
    title: 'The Warren Girder',
    intro: 'Triangulate the girder from equal-length beams in equilateral triangles. No verticals exist on this lattice — only chords and diagonals.',
    fact: 'James Warren and Willoughby Monzani patented the Warren truss in Britain in 1848: equilateral triangles, so every member is the same length and alternates between tension and compression.',
    kind: 'warren', rule: 'Equal beams, triangles only', unit: 'beams', beam: '#6b7280',
  },
  pratt: {
    title: "The Pratts' Railroad Truss",
    intro: 'A locomotive will stand on every deck joint in turn. The truss must hold the load wherever it is.',
    fact: 'Thomas and Caleb Pratt patented their truss in 1844: wooden verticals in compression and iron diagonals in tension. It became the standard American railroad bridge of the 19th century.',
    kind: 'pratt', rule: 'Moving load — every joint in turn', unit: 'dollars', beam: '#475569',
  },
  eiffel: {
    title: "Eiffel's Lattice Pylon",
    intro: 'Raise a lattice pylon to the platform at the top. It must carry its weight and resist the wind, whichever way it blows.',
    fact: "The Eiffel Tower (1889) is a wrought-iron lattice of about 18,000 parts joined by 2.5 million rivets. Its curved legs were shaped by Eiffel's engineers Koechlin and Nouguier from wind-load calculations.",
    kind: 'eiffel', rule: 'Weight + wind from either side', unit: 'francs', beam: '#9a3412',
  },
  brunel: {
    title: "Brunel's Clifton Chains",
    intro: 'Hang the deck from the tower tops. Wrought-iron chains and rods only pull: every beam must be in tension.',
    fact: "Isambard Kingdom Brunel won the competition for the Clifton Suspension Bridge in 1831 at 24. It opened in 1864, five years after his death, using chains reused from his Hungerford Bridge in London.",
    kind: 'brunel', rule: 'Tension only — no beam may push', unit: 'pounds', beam: '#1f2937',
  },
  'mcclintic-marshall': {
    title: 'McClintic-Marshall, Pittsburgh',
    intro: 'Triangulate a steel girder from equal-length beams in equilateral triangles. No verticals exist on this lattice — only chords and diagonals.',
    fact: 'Andrew and Richard Mellon backed the McClintic-Marshall Construction Company, founded in Pittsburgh in 1900, which grew into one of the largest steel fabricators in America and built the lock gates of the Panama Canal.',
    kind: 'warren', rule: 'Equal beams, triangles only', unit: 'dollars', beam: '#6b7280',
  },
  'luding-chains': {
    title: 'The Luding Bridge, 1935',
    intro: 'The planks are gone; only the iron chains remain. Hang a new deck from the bridgeheads. Chains and rods only pull: every beam must be in tension.',
    fact: 'The Luding Bridge over the Dadu River, built in 1705, hangs from thirteen iron chains. In the official account, on 29 May 1935 twenty-two Red Army volunteers crawled across the bare chains under fire and seized the far end; historians have since questioned how much fighting took place.',
    kind: 'brunel', rule: 'Tension only — no beam may push', unit: 'planks', beam: '#3f3f46',
  },
  'kinner-canary': {
    title: 'The Canary’s Wings',
    intro: 'Brace the biplane’s wing bay. A gust may strike any rib, so the bracing must carry a load at every joint in turn.',
    fact: 'In 1921 Amelia Earhart bought her first aeroplane, a yellow Kinner Airster biplane she named The Canary. In October 1922 she flew it to 14,000 feet, a world altitude record for women.',
    kind: 'pratt', rule: 'Moving load — every rib in turn', unit: 'dollars', beam: '#ca8a04',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Structural model ───────────────────────────────────────────────────────────

export interface Joint { x: number; y: number }
/** pin fixes both directions, roller fixes vertical only. */
export type Support = 'pin' | 'roller'
export type Member = [number, number]
export interface Load { j: number; fx: number; fy: number }

export interface Frame {
  joints: Joint[]
  supports: Record<number, Support>
}

export interface CaseResult {
  stable: boolean
  /** Axial force per member, + tension / − compression. */
  forces: number[]
  /** Displacement per joint [dx, dy] (zero for supports and unused joints). */
  disp: [number, number][]
  /** Loaded joints that no beam reaches. */
  unconnected: number[]
}

export const mkey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
export const norm = (a: number, b: number): Member => (a < b ? [a, b] : [b, a])

export function lengthOf(f: Frame, m: Member): number {
  const A = f.joints[m[0]], B = f.joints[m[1]]
  return Math.hypot(B.x - A.x, B.y - A.y)
}

export function costOf(f: Frame, members: Member[]): number {
  return members.reduce((s, m) => s + lengthOf(f, m), 0)
}

/** Linear elastic analysis of a pin-jointed truss (EA = 1 for every beam). */
export function analyze(f: Frame, members: Member[], loads: Load[]): CaseResult {
  const disp: [number, number][] = f.joints.map(() => [0, 0])
  const used = new Set<number>()
  for (const [a, b] of members) { used.add(a); used.add(b) }
  const unconnected = loads.filter(l => !used.has(l.j) && !f.supports[l.j] && (l.fx || l.fy)).map(l => l.j)
  const dof = new Map<number, number>()
  let n = 0
  for (const j of [...used].sort((a, b) => a - b)) {
    const s = f.supports[j]
    if (s !== 'pin') dof.set(j * 2, n++)
    if (!s) dof.set(j * 2 + 1, n++)
  }
  const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const F = new Array(n).fill(0)
  const geo = members.map(m => {
    const A = f.joints[m[0]], B = f.joints[m[1]]
    const L = Math.hypot(B.x - A.x, B.y - A.y)
    return { L, c: (B.x - A.x) / L, s: (B.y - A.y) / L }
  })
  members.forEach(([a, b], i) => {
    const { L, c, s } = geo[i]
    const k = 1 / L
    const d = [dof.get(a * 2), dof.get(a * 2 + 1), dof.get(b * 2), dof.get(b * 2 + 1)]
    const v = [-c, -s, c, s]
    for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) {
      const dp = d[p], dq = d[q]
      if (dp === undefined || dq === undefined) continue
      K[dp][dq] += k * v[p] * v[q]
    }
  })
  for (const l of loads) {
    const ix = dof.get(l.j * 2), iy = dof.get(l.j * 2 + 1)
    if (ix !== undefined) F[ix] += l.fx
    if (iy !== undefined) F[iy] += l.fy
  }
  const u = solveLinear(K, F)
  if (!u || unconnected.length) {
    return { stable: !!u, forces: members.map(() => 0), disp, unconnected }
  }
  for (const [key, i] of dof) disp[key >> 1][key & 1] = u[i]
  const forces = members.map(([a, b], i) => {
    const { L, c, s } = geo[i]
    return ((disp[b][0] - disp[a][0]) * c + (disp[b][1] - disp[a][1]) * s) / L
  })
  return { stable: true, forces, disp, unconnected }
}

/** Gaussian elimination with partial pivoting; null when singular (a mechanism). */
export function solveLinear(K: number[][], F: number[]): number[] | null {
  const n = F.length
  const A = K.map((r, i) => [...r, F[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r
    if (Math.abs(A[piv][col]) < 1e-9) return null
    if (piv !== col) [A[piv], A[col]] = [A[col], A[piv]]
    const p = A[col][col]
    for (let r = col + 1; r < n; r++) {
      const fct = A[r][col] / p
      if (!fct) continue
      for (let c = col; c <= n; c++) A[r][c] -= fct * A[col][c]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = A[r][n]
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]
    x[r] = s / A[r][r]
  }
  if (x.some(v => !Number.isFinite(v) || Math.abs(v) > 1e7)) return null
  return x
}

const SIGN_TOL = 1e-6

/** How far a force breaks the variant's sign rule (0 = fine). */
export function wrongSign(sign: Sign, force: number): number {
  if (sign === 'compression') return force > SIGN_TOL ? force : 0
  if (sign === 'tension') return force < -SIGN_TOL ? -force : 0
  return 0
}

// ── Puzzle ─────────────────────────────────────────────────────────────────────

export interface Puzzle extends Frame {
  kind: Kind
  /** Pairs of joints a beam may join (within reach). */
  allowed: Member[]
  loadCases: Load[][]
  sign: Sign
  /** Rated force of every beam. */
  cap: number
  budget: number
  tests: number
  ref: Member[]
  refCost: number
  /** Beams already built (Brunel's roadway girder): free, any sign. */
  fixed: Member[]
  /** Joints that make up the roadway (drawn as the deck line). */
  deck: number[]
  /** Warren: budget counts beams (all the same length). */
  countBeams: boolean
  maxLen: number
}

export type Failure = 'unconnected' | 'unstable' | 'overload' | 'sign' | 'budget' | 'empty'

export interface Verdict {
  ok: boolean
  failure?: Failure
  /** Index of the first failing load case. */
  failCase: number
  cases: CaseResult[]
  /** Member indices that break the rating or the sign rule (in any case). */
  failing: number[]
  /** Highest |force| / cap over all cases, per member. */
  util: number[]
  cost: number
}

export function priceOf(p: Puzzle, members: Member[]): number {
  return p.countBeams ? members.length : Math.round(costOf(p, members) * 100) / 100
}

/** Run every load case over the given beams plus the puzzle's fixed ones. */
export function evaluate(p: Puzzle, members: Member[]): Verdict {
  const cost = priceOf(p, members)
  const all = [...p.fixed, ...members]
  const nf = p.fixed.length
  const base: Verdict = { ok: false, failCase: 0, cases: [], failing: [], util: all.map(() => 0), cost }
  if (!members.length) return { ...base, failure: 'empty' }
  if (cost > p.budget + 1e-9) return { ...base, failure: 'budget' }
  const failing = new Set<number>()
  let failure: Failure | undefined
  let failCase = -1
  const util = all.map(() => 0)
  const cases: CaseResult[] = []
  p.loadCases.forEach((loads, ci) => {
    const r = analyze(p, all, loads)
    cases.push(r)
    let bad: Failure | undefined
    if (r.unconnected.length) bad = 'unconnected'
    else if (!r.stable) bad = 'unstable'
    else {
      r.forces.forEach((fc, i) => {
        util[i] = Math.max(util[i], Math.abs(fc) / p.cap)
        if (i >= nf && wrongSign(p.sign, fc) > 0) { failing.add(i); bad = bad ?? 'sign' }
        if (Math.abs(fc) > p.cap + 1e-9) { failing.add(i); bad = 'overload' }
      })
    }
    if (bad && failCase < 0) { failCase = ci; failure = bad }
  })
  return { ok: !failure, failure, failCase: Math.max(0, failCase), cases, failing: [...failing].sort((a, b) => a - b), util, cost }
}

/**
 * Greedy reference designer: start with every allowed beam, strip members
 * that break the sign rule, then drop spare joints and the least-used beams
 * while the frame stays rigid and sign-valid.  Fixed beams always stay (and
 * are exempt from the sign rule).  Returns null if no valid design is found.
 */
export function findReference(f: Frame, allowed: Member[], loadCases: Load[][], sign: Sign, fixed: Member[] = []): Member[] | null {
  let cur = [...allowed]
  const nf = fixed.length
  const run = (ms: Member[]) => loadCases.map(l => analyze(f, [...fixed, ...ms], l))
  const rigid = (rs: CaseResult[]) => rs.every(r => r.stable && !r.unconnected.length)
  const violation = (rs: CaseResult[], i: number) => Math.max(...rs.map(r => wrongSign(sign, r.forces[nf + i])))
  const valid = (rs: CaseResult[], ms: Member[]) => rigid(rs) && ms.every((_, i) => violation(rs, i) === 0)
  let rs = run(cur)
  if (!rigid(rs)) return null
  // Phase 1: remove sign violators, worst first, keeping rigidity.
  for (let guard = 0; guard < 400; guard++) {
    const viol = cur.map((_, i) => violation(rs, i))
    if (viol.every(v => v === 0)) break
    const order = viol.map((v, i) => [v, i] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0])
    let moved = false
    for (const [, i] of order.slice(0, 12)) {
      const next = cur.filter((_, k) => k !== i)
      const nrs = run(next)
      if (rigid(nrs)) { cur = next; rs = nrs; moved = true; break }
    }
    if (!moved) return null
  }
  if (!valid(rs, cur)) return null
  // Phase 2: drop whole spare joints (unloaded, unsupported, not on a fixed
  // beam), then strip the least-used beams (longest first among ties).
  const keep = new Set([...loadCases.flat().map(l => l.j), ...fixed.flat()])
  for (let guard = 0; guard < 400; guard++) {
    const byJoint = new Map<number, number>()
    cur.forEach(m => { for (const j of m) if (!keep.has(j) && !f.supports[j]) byJoint.set(j, (byJoint.get(j) ?? 0) + lengthOf(f, m)) })
    let dropped = false
    for (const [j] of [...byJoint].sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))) {
      const next = cur.filter(m => m[0] !== j && m[1] !== j)
      const nrs = run(next)
      if (valid(nrs, next)) { cur = next; rs = nrs; dropped = true; break }
    }
    if (dropped) continue
    const use = cur.map((m, i) => ({ i, f: Math.max(...rs.map(r => Math.abs(r.forces[nf + i]))), L: lengthOf(f, m) }))
    use.sort((a, b) => (a.f - b.f) || (b.L - a.L) || (a.i - b.i))
    let moved = false
    for (const { i } of use) {
      const next = cur.filter((_, k) => k !== i)
      const nrs = run(next)
      if (valid(nrs, next)) { cur = next; rs = nrs; moved = true; break }
    }
    if (!moved) break
  }
  return cur
}

interface Tier { span: number; height: number; margin: number; slack: number; tests: number }

export function tierFor(kind: Kind, d: Difficulty, rng: Rng): Tier {
  const margin = scale(d, [1.6, 1.4, 1.25, 1.15])
  const slack = scale(d, [1.5, 1.35, 1.22, 1.12])
  const tests = scale(d, [4, 4, 3, 3])
  const pickOf = (a: number, b: number) => (rng() < 0.5 ? a : b)
  let span = 3, height = 2
  switch (kind) {
    case 'warren': span = scale(d, [2, 3, 4, 5]); height = 2; break
    case 'pratt': span = scale(d, [3, 4, 5, 5]); height = scale(d, [1, pickOf(1, 2), 1, 2]); break
    case 'arch': span = scale(d, [3, 4, pickOf(4, 5), 5]); height = 3; break
    case 'brunel': span = scale(d, [3, 4, pickOf(4, 5), 5]); height = 2; break
    case 'eiffel': span = 2; height = scale(d, [2, 3, pickOf(3, 4), 4]); break
  }
  return { span, height, margin, slack, tests }
}

function buildGeometry(kind: Kind, t: Tier): { frame: Frame; deck: number[]; maxLen: number; countBeams: boolean; sign: Sign; fixed: Member[] } {
  const joints: Joint[] = []
  const supports: Record<number, Support> = {}
  const deck: number[] = []
  const add = (x: number, y: number, s?: Support) => { joints.push({ x, y }); if (s) supports[joints.length - 1] = s; return joints.length - 1 }
  const { span: n, height: H } = t
  let maxLen = Math.SQRT2, countBeams = false, sign: Sign = 'any'
  const fixed: Member[] = []
  if (kind === 'warren') {
    const h = Math.sqrt(3) / 2
    for (let r = 0; r <= H; r++) for (let c = r; c <= 2 * n - r; c++) {
      if ((c + r) % 2) continue
      const j = add(c / 2, r * h, r === 0 && c === 0 ? 'pin' : r === 0 && c === 2 * n ? 'roller' : undefined)
      if (r === 0) deck.push(j)
    }
    maxLen = 1; countBeams = true
  } else if (kind === 'pratt') {
    for (let y = 0; y <= H; y++) for (let x = 0; x <= n; x++) {
      const j = add(x, y, y === 0 && x === 0 ? 'pin' : y === 0 && x === n ? 'roller' : undefined)
      if (y === 0) deck.push(j)
    }
  } else if (kind === 'arch') {
    for (let y = -H; y <= 0; y++) for (let x = 0; x <= n; x++) {
      const wall = x === 0 || x === n
      if (wall && y !== 0 && y !== -H) continue
      const j = add(x, y, wall ? 'pin' : undefined)
      if (y === 0) deck.push(j)
    }
    // Knight's-move struts let the timber follow a curve.
    maxLen = Math.sqrt(5); sign = 'compression'
  } else if (kind === 'brunel') {
    for (let y = 0; y <= H; y++) for (let x = 0; x <= n; x++) {
      const tower = x === 0 || x === n
      if (tower && y !== 0 && y !== H) continue
      const j = add(x, y, tower ? 'pin' : undefined)
      if (y === 0) deck.push(j)
    }
    // The wrought-iron roadway girder is already in place.
    for (let i = 0; i + 1 < deck.length; i++) fixed.push([deck[i], deck[i + 1]])
    sign = 'tension'
  } else {
    // Eiffel: a pylon of width 2, legs pinned, a single platform joint on top.
    for (let y = 0; y <= H; y++) for (let x = 0; x <= n; x++) {
      if (y === H && x !== n / 2) continue
      add(x, y, y === 0 && (x === 0 || x === n) ? 'pin' : undefined)
    }
  }
  return { frame: { joints, supports }, deck, maxLen, countBeams, sign, fixed }
}

export function allowedPairs(f: Frame, maxLen: number, fixed: Member[] = []): Member[] {
  const out: Member[] = []
  const taken = new Set(fixed.map(([a, b]) => mkey(a, b)))
  for (let a = 0; a < f.joints.length; a++) for (let b = a + 1; b < f.joints.length; b++) {
    if (f.supports[a] && f.supports[b]) continue
    if (taken.has(mkey(a, b))) continue
    const A = f.joints[a], B = f.joints[b]
    if (Math.hypot(A.x - B.x, A.y - B.y) <= maxLen + 1e-6) out.push([a, b])
  }
  return out
}

const r1 = (v: number) => Math.round(v * 10) / 10

function makeLoads(kind: Kind, d: Difficulty, f: Frame, deck: number[], rng: Rng, fallback: boolean): Load[][] {
  const interior = deck.filter(j => !f.supports[j])
  const down = (j: number, w: number): Load => ({ j, fx: 0, fy: -w })
  if (kind === 'pratt') {
    const P = fallback ? 3 : randInt(rng, 2, 4)
    const dead = d >= 3 ? 1 : 0
    return interior.map(j => interior.map(k => down(k, dead + (k === j ? P : 0))).filter(l => l.fy))
  }
  if (kind === 'warren') {
    const count = fallback ? interior.length : Math.min(interior.length, randInt(rng, 1, d >= 3 ? 3 : 2))
    const picks: number[] = []
    const pool = [...interior]
    while (picks.length < count && pool.length) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
    return [picks.sort((a, b) => a - b).map(j => down(j, fallback ? 2 : randInt(rng, 1, 3)))]
  }
  if (kind === 'arch' || kind === 'brunel') {
    // The deck's own weight on every joint, plus heavy wagons at D2+.
    const base = fallback ? 1 : randInt(rng, 1, 2)
    const loads = interior.map(j => down(j, base))
    const wagons = fallback ? 0 : scale(d, [0, 1, 1, 2])
    for (let k = 0; k < wagons; k++) loads[Math.floor(rng() * loads.length)].fy -= randInt(rng, 1, 3)
    return [loads]
  }
  // eiffel
  const top = f.joints.length - 1
  const W = fallback ? 2 : randInt(rng, 2, 4)
  const wind = fallback ? 1 : randInt(rng, 1, 2)
  const side = rng() < 0.5 ? 1 : -1
  const H = f.joints[top].y
  const caseFor = (dir: number): Load[] => {
    const loads: Load[] = [{ j: top, fx: dir * wind, fy: -W }]
    if (d >= 3) {
      // Wind on the windward leg at every level as well.
      const xw = dir > 0 ? 0 : 2
      f.joints.forEach((jt, j) => { if (jt.x === xw && jt.y > 0 && jt.y < H) loads.push({ j, fx: dir * 0.5, fy: 0 }) })
    }
    return loads
  }
  return d === 1 ? [caseFor(side)] : [caseFor(1), caseFor(-1)]
}

export function planPuzzle(configId: string, difficulty: Difficulty, seed: number, params?: Record<string, unknown>): Puzzle {
  const cfg = resolveConfig(CONFIGS, configId, params, 'roman-arch')
  const kind = cfg.kind
  const rng = mulberry32(hashString(`truss:${configId}:${difficulty}:${seed}`))
  const tier = tierFor(kind, difficulty, rng)
  const geo = buildGeometry(kind, tier)
  const allowed = allowedPairs(geo.frame, geo.maxLen, geo.fixed)
  let loadCases: Load[][] = []
  let ref: Member[] | null = null
  for (let attempt = 0; attempt < 6 && !ref; attempt++) {
    loadCases = makeLoads(kind, difficulty, geo.frame, geo.deck, rng, attempt === 5)
    ref = findReference(geo.frame, allowed, loadCases, geo.sign, geo.fixed)
  }
  if (!ref) throw new Error(`truss: no reference design for ${configId} d${difficulty} s${seed}`)
  const maxF = Math.max(...loadCases.map(l => Math.max(...analyze(geo.frame, [...geo.fixed, ...ref!], l).forces.map(Math.abs))))
  const cap = Math.ceil(maxF * tier.margin * 10) / 10
  const refCost = geo.countBeams ? ref.length : costOf(geo.frame, ref)
  const budget = geo.countBeams ? Math.floor(ref.length * tier.slack) : Math.ceil(refCost * tier.slack * 2) / 2
  return {
    kind, ...geo.frame, allowed, loadCases, sign: geo.sign, cap, budget, tests: tier.tests,
    ref, refCost: r1(refCost), fixed: geo.fixed, deck: geo.deck, countBeams: geo.countBeams, maxLen: geo.maxLen,
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

const FAIL_TEXT: Record<Failure, string> = {
  empty: 'There is nothing to test yet.',
  budget: 'Over budget.',
  unconnected: 'A load point is not connected to the frame — it fell through.',
  unstable: 'The frame is a mechanism: it folds up. Add triangles.',
  overload: 'A beam failed: it carried more than its rating (red).',
  sign: '',
}

const STEP_MS = 40
const STEPS = 15

export default function TrussGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'roman-arch')
  const puzzle = useMemo(() => planPuzzle(configId, difficulty, seed, params), [configId, difficulty, seed, params])
  const [members, setMembers] = useState<Member[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [testsUsed, setTestsUsed] = useState(0)
  const [note, setNote] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  // Animation: which case is shown and how far through (0..1).
  const [anim, setAnim] = useState<{ ci: number; t: number } | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const testsLeft = puzzle.tests - testsUsed

  useEffect(() => { setMembers([]); setSelected(null); setTestsUsed(0); setVerdict(null); setAnim(null); setNote('') }, [puzzle])

  const allowedSet = useMemo(() => new Set(puzzle.allowed.map(([a, b]) => mkey(a, b))), [puzzle])
  const cost = priceOf(puzzle, members)
  const testing = anim !== null

  const toggle = useCallback((a: number, b: number) => {
    const k = mkey(a, b)
    if (members.some(m => mkey(m[0], m[1]) === k)) {
      setMembers(ms => ms.filter(m => mkey(m[0], m[1]) !== k)); setVerdict(null); setNote('')
      return
    }
    if (!allowedSet.has(k)) {
      setNote(puzzle.supports[a] && puzzle.supports[b] ? 'Both ends are already anchored.' : 'Too long — a beam can only reach a nearby joint.')
      return
    }
    const next = [...members, norm(a, b)]
    if (priceOf(puzzle, next) > puzzle.budget + 1e-9) { setNote('That beam would break the budget.'); return }
    setMembers(next); setVerdict(null); setNote('')
  }, [members, allowedSet, puzzle])

  const tapJoint = (j: number) => {
    if (settled || testing) return
    if (selected === null) { setSelected(j); return }
    if (selected === j) { setSelected(null); return }
    toggle(selected, j)
    setSelected(null)
  }

  const runTest = () => {
    if (settled || testing || testsLeft <= 0) return
    const v = evaluate(puzzle, members)
    if (v.failure === 'empty' || v.failure === 'budget') { setNote(FAIL_TEXT[v.failure]); return }
    setTestsUsed(n => n + 1)
    setVerdict(v)
    setSelected(null)
    setNote('')
    setAnim({ ci: 0, t: 0 })
  }

  // Load-test animation: ramp each case's load up; stop at the failing case.
  const pending = useRef<{ v: Verdict | null; left: number }>({ v: null, left: 0 })
  pending.current = { v: verdict, left: testsLeft }
  useEffect(() => {
    if (!anim) return
    const id = setTimeout(() => {
      const v = pending.current.v
      if (!v) { setAnim(null); return }
      const lastCase = v.ok ? puzzle.loadCases.length - 1 : v.failCase
      if (anim.t < 1) { setAnim({ ci: anim.ci, t: Math.min(1, anim.t + 1 / STEPS) }); return }
      if (anim.ci < lastCase) { setAnim({ ci: anim.ci + 1, t: 0 }); return }
      setAnim(null)
      if (v.ok) win()
      else {
        setNote(v.failure === 'sign'
          ? (puzzle.sign === 'compression' ? 'A strut was pulled apart: pegged timber cannot take tension (red).' : 'A chain went slack and buckled: iron rods cannot push (red).')
          : FAIL_TEXT[v.failure!])
        if (pending.current.left <= 0) lose('The bridge failed its last load test')
      }
    }, STEP_MS)
    return () => clearTimeout(id)
  }, [anim, puzzle, win, lose])

  // ── Drawing ──
  const xs = puzzle.joints.map(j => j.x), ys = puzzle.joints.map(j => j.y)
  const pad = 0.7
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad
  const showCase = anim ? anim.ci : verdict ? verdict.failCase : 0
  const res = verdict?.cases[showCase]
  const t = anim ? anim.t : verdict ? 1 : 0
  const maxDisp = res && res.stable ? Math.max(1e-9, ...res.disp.map(([a, b]) => Math.hypot(a, b))) : 1
  const dScale = 0.18 / maxDisp
  const pos = (j: number): [number, number] => {
    const p = puzzle.joints[j]
    let dx = 0, dy = 0
    if (res && verdict) {
      if (res.stable && !res.unconnected.length) { dx = res.disp[j][0] * dScale * t; dy = res.disp[j][1] * dScale * t }
      else if (!puzzle.supports[j]) dy = -0.35 * t
    }
    return [p.x + dx, -(p.y + dy)]
  }
  const failingSet = new Set(verdict?.failing ?? [])
  const colourOf = (i: number) => {
    if (!verdict || !res) return cfg.beam
    if (!res.stable || res.unconnected.length) return '#dc2626'
    if (failingSet.has(i) && t > 0.6) return '#dc2626'
    const fc = res.forces[i] ?? 0
    if (Math.abs(fc) < 1e-6) return '#9ca3af'
    return fc > 0 ? '#2563eb' : '#ea580c'
  }
  const loadsShown = puzzle.loadCases[showCase] ?? []
  const signWord = puzzle.sign === 'compression' ? 'struts push only' : puzzle.sign === 'tension' ? 'chains pull only' : ''

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className={`font-bold ${cost > puzzle.budget ? 'text-red-600' : 'text-ink-2'}`} data-testid="truss-cost">
            {puzzle.countBeams ? `${cost} / ${puzzle.budget} beams` : `${cost.toFixed(1)} / ${puzzle.budget} ${cfg.unit}`}
          </p>
          <p data-testid="truss-cap">Beam rating {puzzle.cap} t</p>
          <p className={testsLeft <= 1 ? 'text-red-600 font-bold' : ''} data-testid="truss-tests">Tests left {testsLeft}</p>
        </div>
      </div>

      <p className="text-[11px] text-ink-2 font-bold text-center" data-testid="truss-rule">
        {cfg.rule}{puzzle.loadCases.length > 1 ? ` · ${puzzle.loadCases.length} load cases` : ''}
      </p>

      <div className="w-full max-w-[420px] mx-auto rounded-lg border border-line bg-paper select-none" style={{ touchAction: 'manipulation' }}>
        <svg viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`} className="w-full block" style={{ maxHeight: '58vh' }}
          data-testid="truss-board" role="img" aria-label="truss board">
          <Scenery puzzle={puzzle} minX={minX} maxX={maxX} minY={minY} />
          {/* roadway */}
          {puzzle.deck.length > 1 && (
            <line x1={puzzle.joints[puzzle.deck[0]].x} y1={-puzzle.joints[puzzle.deck[0]].y}
              x2={puzzle.joints[puzzle.deck[puzzle.deck.length - 1]].x} y2={-puzzle.joints[puzzle.deck[0]].y}
              stroke="currentColor" className="text-line" strokeWidth={0.05} strokeDasharray="0.12 0.08" />
          )}
          {[...puzzle.fixed, ...members].map((m, i) => {
            const [x1, y1] = pos(m[0]), [x2, y2] = pos(m[1])
            const u = verdict?.util[i] ?? 0
            const isFixed = i < puzzle.fixed.length
            return (
              <g key={(isFixed ? 'f' : '') + mkey(m[0], m[1])}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colourOf(i)} strokeLinecap={isFixed ? 'butt' : 'round'}
                  strokeWidth={(isFixed ? 0.12 : 0.07) + (verdict ? Math.min(1, u) * 0.06 : 0)}
                  data-testid={isFixed ? undefined : `truss-member-${mkey(m[0], m[1])}`}
                  strokeDasharray={failingSet.has(i) && t > 0.6 ? '0.1 0.06' : undefined} />
                {!isFixed && (
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={0.22}
                    onClick={() => { if (!settled && !testing) toggle(m[0], m[1]) }} />
                )}
              </g>
            )
          })}
          {/* loads */}
          {loadsShown.map((l, i) => {
            const [x, y] = pos(l.j)
            const mag = Math.hypot(l.fx, l.fy)
            const len = 0.25 + 0.08 * mag
            const ux = l.fx / mag, uy = -l.fy / mag
            const sx = x - ux * len, sy = y - uy * len
            return (
              <g key={`l${i}`} className="text-accent" pointerEvents="none">
                <line x1={sx} y1={sy} x2={x - ux * 0.12} y2={y - uy * 0.12} stroke="currentColor" strokeWidth={0.05} />
                <circle cx={x - ux * 0.12} cy={y - uy * 0.12} r={0.05} fill="currentColor" />
                <text x={sx + (ux ? 0 : 0.08)} y={sy - (ux ? 0.08 : 0)} fontSize={0.22} fill="currentColor" textAnchor="middle">{r1(mag)}t</text>
              </g>
            )
          })}
          {/* joints */}
          {puzzle.joints.map((_, j) => {
            const [x, y] = pos(j)
            const sup = puzzle.supports[j]
            const sel = selected === j
            return (
              <g key={j} data-testid={`truss-joint-${j}`} onClick={() => tapJoint(j)} style={{ cursor: 'pointer' }}>
                <circle cx={x} cy={y} r={0.28} fill="transparent" />
                {sup && <path d={`M${x} ${y} l-0.17 0.26 h0.34 z`} className="text-ink-2" fill="currentColor" opacity={0.75} />}
                {sup === 'roller' && <circle cx={x} cy={y + 0.33} r={0.05} className="text-ink-2" fill="currentColor" />}
                <circle cx={x} cy={y} r={sel ? 0.13 : 0.08}
                  className={sel ? 'text-accent' : 'text-ink-2 fill-paper'} fill={sel ? 'currentColor' : undefined}
                  stroke="currentColor" strokeWidth={0.035} />
              </g>
            )
          })}
        </svg>
      </div>

      <p className="text-[11px] text-center min-h-[1.2em] font-bold text-red-600" data-testid="truss-note">{note}</p>

      {!settled && (
        <div className="flex gap-2 w-full max-w-[420px] mx-auto">
          <button type="button" onClick={runTest} disabled={testing || !members.length} data-testid="truss-test"
            className="flex-1 h-11 rounded-lg bg-accent text-accent-fg text-sm font-bold disabled:opacity-40">
            Load test ({testsLeft})
          </button>
          <button type="button" onClick={() => { if (!testing) { setMembers([]); setVerdict(null); setSelected(null); setNote('') } }}
            disabled={testing || !members.length}
            className="h-11 px-4 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold disabled:opacity-40">Clear</button>
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : `Tap two joints to lay or remove a beam${signWord ? ` · ${signWord}` : ''} · blue = pull, orange = push`}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="It holds!" loseTitle="The structure collapsed" />
    </div>
  )
}

function Scenery({ puzzle, minX, maxX, minY }: { puzzle: Puzzle; minX: number; maxX: number; minY: number }) {
  const { joints, kind } = puzzle
  const xs = joints.map(j => j.x)
  const left = Math.min(...xs), right = Math.max(...xs)
  const ground = 'text-muted'
  if (kind === 'eiffel') {
    return <rect x={minX} y={0.3} width={maxX - minX} height={0.5} className={ground} fill="currentColor" opacity={0.25} />
  }
  const deckY = 0
  const bottom = -minY
  const towers = kind === 'brunel'
    ? [left, right].map((x, i) => (
      <rect key={i} x={x - 0.12} y={-Math.max(...joints.map(j => j.y))} width={0.24}
        height={Math.max(...joints.map(j => j.y)) + 0.1} className={ground} fill="currentColor" opacity={0.35} />
    ))
    : null
  return (
    <g pointerEvents="none">
      <rect x={minX} y={deckY + 0.05} width={left - minX + 0.02} height={bottom} className={ground} fill="currentColor" opacity={0.25} />
      <rect x={right - 0.02} y={deckY + 0.05} width={maxX - right} height={bottom} className={ground} fill="currentColor" opacity={0.25} />
      {kind === 'arch' && (
        <>
          <rect x={left - 0.02} y={-Math.min(...joints.map(j => j.y)) + 0.05} width={0.3} height={1} className={ground} fill="currentColor" opacity={0.25} />
          <rect x={right - 0.28} y={-Math.min(...joints.map(j => j.y)) + 0.05} width={0.3} height={1} className={ground} fill="currentColor" opacity={0.25} />
        </>
      )}
      {towers}
    </g>
  )
}
