import { useEffect, useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar, type Rng } from './_shared'

// Railway: lay track so every train reaches its station, then run the trains.
// Track is laid by tapping (or dragging across) squares from a station; the
// pieces — straights, curves and, where lines meet, crossings — shape
// themselves.  Tap a laid square to cut the line back to it.  Four rule sets:
//
//   stephenson  one line, Liverpool to Manchester; every square costs money
//               (plain 1, bog 2, hill 3, rock impassable) — stay within the
//               budget (exact optimum by Dijkstra, + slack at low levels).
//   transsib    a long line through the towns in order, with only a few
//               curve pieces (fewest turns by 0-1 BFS on (square, heading, town)).
//   underground several coloured lines; they may share a square only at an
//               interchange, and every interchange must serve two lines.
//   yard        a switching yard: set the points so wagons leave in order
//               1, 2, 3…, parking them on sidings (stacks) of limited length
//               (solvability by exhaustive search).
//
//   D   stephenson  transsib (towns, spare curves)  underground (lines)  yard (wagons/sidings)  timer  expected
//   1   5×6 +30%    5×6, 1, +2                      5×5, 2               5 / 2×3               90s    ~1 min
//   2   5×7 +15%    6×6, 2, +1                      5×6, 3               6 / 2×3               120s   ~1.5 min
//   3   6×7 +5%     6×7, 2, +1                      6×6, 3               7 / 3×2               150s   ~2 min
//   4   6×8 exact   6×8, 3, exact                   6×7, 4               8 / 3×2               180s   ~3 min

export type Mode = 'stephenson' | 'transsib' | 'underground' | 'yard'

export interface RailConfig {
  title: string
  intro: string
  fact: string
  mode: Mode
}

export const CONFIGS: Record<string, RailConfig> = {
  stephenson: {
    title: 'Liverpool & Manchester, 1830',
    intro: 'Lay the line from Liverpool (L) to Manchester (M) within budget. Bog costs 2, hills 3; rock cannot be crossed.',
    fact: 'George Stephenson’s Liverpool and Manchester Railway opened in 1830 as the first inter-city line run entirely by steam; to cross the Chat Moss bog he floated the track on a raft of heather and brushwood.',
    mode: 'stephenson',
  },
  transsib: {
    title: 'The Trans-Siberian',
    intro: 'Lay the line from Moscow (★) to Vladivostok (V) through the numbered towns in order. Curve pieces are scarce — use as few as you can.',
    fact: 'Built from 1891 to 1916, the Trans-Siberian Railway runs about 9,289 km from Moscow to Vladivostok — still the longest railway line in the world.',
    mode: 'transsib',
  },
  underground: {
    title: 'The London Underground',
    intro: 'Join each coloured line’s two stations. Lines may meet only at interchanges (◎) — and every interchange must serve at least two lines.',
    fact: 'The Metropolitan Railway opened the world’s first underground line on 10 January 1863, between Paddington and Farringdon, with steam locomotives in shallow cut-and-cover tunnels.',
    mode: 'underground',
  },
  yard: {
    title: 'The Switching Yard',
    intro: 'Wagons arrive in a jumble. Set the points to park them on sidings and send them out in order 1, 2, 3… The last wagon in a siding is the first out.',
    fact: 'Hump yards, which sort wagons by rolling them by gravity through a fan of points, appeared in the 1880s; at their peak big yards sorted thousands of wagons a day.',
    mode: 'yard',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)
export const secondsFor = (d: Difficulty) => scale(d, [90, 120, 150, 180])
export const mistakesFor = (d: Difficulty) => scale(d, [3, 2, 2, 2])

// ── Grid layouts ───────────────────────────────────────────────────────────────

export type Terrain = 'plain' | 'hill' | 'bog' | 'rock' | 'lake'
export const TERRAIN_COST: Record<Terrain, number> = { plain: 1, bog: 2, hill: 3, rock: Infinity, lake: Infinity }

export interface LineDef { from: number; to: number; color: string; label: [string, string] }
export interface Layout {
  mode: Exclude<Mode, 'yard'>
  rows: number
  cols: number
  terrain: Terrain[]
  lines: LineDef[]
  /** transsib: towns to pass, in order. */
  towns: number[]
  /** underground: shared squares. */
  interchanges: number[]
  /** stephenson: money; transsib: curve pieces. */
  limit: number
  optimum: number
  /** One verified solution: a path of squares per line. */
  solution: number[][]
}

const COLORS = ['#c0392b', '#1f5fa8', '#2e8b57', '#d68910']
const DIRS: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]]

export function neighbours(rows: number, cols: number, i: number): number[] {
  const r = Math.floor(i / cols), c = i % cols
  const out: number[] = []
  for (const [dr, dc] of DIRS) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc) }
  return out
}
const adjacent = (cols: number, a: number, b: number) => {
  const dr = Math.abs(Math.floor(a / cols) - Math.floor(b / cols)), dc = Math.abs((a % cols) - (b % cols))
  return dr + dc === 1
}
const heading = (cols: number, a: number, b: number) => {
  const dr = Math.floor(b / cols) - Math.floor(a / cols), dc = (b % cols) - (a % cols)
  return DIRS.findIndex(([x, y]) => x === dr && y === dc)
}

/** Number of curve pieces along a path. */
export function curves(cols: number, path: readonly number[]): number {
  let k = 0
  for (let j = 2; j < path.length; j++) if (heading(cols, path[j - 2], path[j - 1]) !== heading(cols, path[j - 1], path[j])) k++
  return k
}
export const trackCost = (L: Pick<Layout, 'terrain'>, path: readonly number[]) => path.slice(1).reduce((s, i) => s + TERRAIN_COST[L.terrain[i]], 0)

/** Can line `k` (currently `path`) extend into square `i`? Returns a reason when not. */
export function canExtend(L: Layout, paths: readonly number[][], k: number, i: number): string | null {
  const path = paths[k]
  const end = path[path.length - 1]
  const line = L.lines[k]
  if (end === line.to) return 'This line is already finished.'
  if (!adjacent(L.cols, end, i)) return 'Track must continue from the end of the line.'
  if (TERRAIN_COST[L.terrain[i]] === Infinity) return 'No track can be laid there.'
  if (path.includes(i)) return 'The line can’t cross itself.'
  if (L.lines.some((l, j) => j !== k && (l.from === i || l.to === i))) return 'That is another line’s station.'
  const shared = L.interchanges.includes(i)
  if (!shared && paths.some((p, j) => j !== k && p.includes(i))) return 'Lines may only meet at an interchange.'
  if (L.mode === 'transsib') {
    const next = path.filter(x => L.towns.includes(x)).length
    const t = L.towns.indexOf(i)
    if (t >= 0 && t !== next) return `Pass the towns in order — town ${next + 1} comes first.`
    if (i === line.to && next < L.towns.length) return `Pass all ${L.towns.length} towns before Vladivostok.`
    if (curves(L.cols, [...path, i]) > L.limit) return `No curve pieces left (${L.limit} allowed).`
  }
  if (L.mode === 'stephenson' && trackCost(L, [...path, i]) > L.limit) return `Not enough money — the budget is £${L.limit}k.`
  return null
}

/** Are all lines finished and the layout's rules met? */
export function layoutDone(L: Layout, paths: readonly number[][]): string | null {
  for (let k = 0; k < L.lines.length; k++) if (paths[k][paths[k].length - 1] !== L.lines[k].to) return 'Not every line reaches its station.'
  for (const x of L.interchanges) {
    const n = paths.filter(p => p.includes(x)).length
    if (n < 2) return 'Every interchange must serve at least two lines.'
  }
  return null
}

/** Verify a full solution by replaying it square by square. */
export function replay(L: Layout, solution: readonly number[][]): boolean {
  const paths = L.lines.map(l => [l.from])
  for (let k = 0; k < solution.length; k++) {
    if (solution[k][0] !== L.lines[k].from) return false
    for (const i of solution[k].slice(1)) { if (canExtend(L, paths, k, i)) return false; paths[k].push(i) }
  }
  return layoutDone(L, paths) === null
}

function dijkstra(L: Layout, from: number, to: number): { cost: number; path: number[] } {
  const N = L.rows * L.cols
  const d = new Array(N).fill(Infinity), prev = new Array(N).fill(-1)
  d[from] = 0
  const done = new Uint8Array(N)
  for (;;) {
    let u = -1
    for (let i = 0; i < N; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i
    if (u < 0 || u === to) break
    done[u] = 1
    for (const v of neighbours(L.rows, L.cols, u)) {
      const c = TERRAIN_COST[L.terrain[v]]
      if (c === Infinity || done[v]) continue
      if (d[u] + c < d[v]) { d[v] = d[u] + c; prev[v] = u }
    }
  }
  if (d[to] === Infinity) return { cost: Infinity, path: [] }
  const path = [to]
  while (path[0] !== from) path.unshift(prev[path[0]])
  return { cost: d[to], path }
}

/** Fewest curves from `from` through `towns` in order to `to` (0-1 BFS). */
export function fewestCurves(L: Layout, from: number, to: number): { turns: number; path: number[] } {
  const N = L.rows * L.cols, T = L.towns.length
  const id = (i: number, h: number, w: number) => (i * 4 + h) * (T + 1) + w
  const dist = new Array(N * 4 * (T + 1)).fill(Infinity)
  const prev = new Array(N * 4 * (T + 1)).fill(-1)
  const dq: number[] = []
  for (const v of neighbours(L.rows, L.cols, from)) {
    if (TERRAIN_COST[L.terrain[v]] === Infinity) continue
    const t = L.towns.indexOf(v)
    if (t > 0 || (v === to && T > 0)) continue
    const s = id(v, heading(L.cols, from, v), t === 0 ? 1 : 0)
    dist[s] = 0; prev[s] = -2; dq.push(s)
  }
  let goal = -1
  while (dq.length) {
    const s = dq.shift()!
    const w = s % (T + 1), h = Math.floor(s / (T + 1)) % 4, i = Math.floor(s / (T + 1) / 4)
    if (i === to && w === T) { goal = s; break }
    if (i === to) continue
    for (const v of neighbours(L.rows, L.cols, i)) {
      if (v === from || TERRAIN_COST[L.terrain[v]] === Infinity) continue
      const t = L.towns.indexOf(v)
      if (t >= 0 && t !== w) continue
      if (v === to && w !== T) continue
      const nh = heading(L.cols, i, v)
      const ns = id(v, nh, t >= 0 ? w + 1 : w)
      const c = dist[s] + (nh === h ? 0 : 1)
      if (c < dist[ns]) { dist[ns] = c; prev[ns] = s; if (nh === h) dq.unshift(ns); else dq.push(ns) }
    }
  }
  if (goal < 0) return { turns: Infinity, path: [] }
  const path: number[] = []
  for (let s = goal; s >= 0; s = prev[s]) path.unshift(Math.floor(s / (T + 1) / 4))
  return { turns: dist[goal], path: [from, ...path] }
}

function bfsPath(L: Layout, from: number, to: number, blocked: Set<number>, rng: Rng): number[] | null {
  const N = L.rows * L.cols
  const prev = new Array(N).fill(-2); prev[from] = -1
  const q = [from]
  while (q.length) {
    const u = q.shift()!
    if (u === to) break
    for (const v of shuffle(neighbours(L.rows, L.cols, u), rng)) {
      if (prev[v] !== -2 || (v !== to && blocked.has(v)) || TERRAIN_COST[L.terrain[v]] === Infinity) continue
      prev[v] = u; q.push(v)
    }
  }
  if (prev[to] === -2) return null
  const p = [to]
  while (p[0] !== from) p.unshift(prev[p[0]])
  return p
}

const GRID: Record<Exclude<Mode, 'yard'>, [number, number][]> = {
  stephenson: [[5, 6], [5, 7], [6, 7], [6, 8]],
  transsib: [[5, 6], [6, 6], [6, 7], [6, 8]],
  underground: [[5, 5], [5, 6], [6, 6], [6, 7]],
}

export function makeLayout(configId: string, mode: Exclude<Mode, 'yard'>, d: Difficulty, seed: number): Layout {
  const rng = mulberry32(seed ^ hashString(`railway:${configId}:${d}`))
  const [rows, cols] = GRID[mode][d - 1]
  const N = rows * cols
  const at = (r: number, c: number) => r * cols + c
  for (let attempt = 0; ; attempt++) {
    const terrain: Terrain[] = new Array(N).fill('plain')
    const base: Layout = { mode, rows, cols, terrain, lines: [], towns: [], interchanges: [], limit: 0, optimum: 0, solution: [] }
    if (mode === 'stephenson') {
      const from = at(Math.floor(rng() * rows), 0), to = at(Math.floor(rng() * rows), cols - 1)
      // A bog blob (Chat Moss), scattered hills and a few rocks.
      const bog = at(1 + Math.floor(rng() * (rows - 2)), 1 + Math.floor(rng() * (cols - 2)))
      for (const i of [bog, ...neighbours(rows, cols, bog)]) if (rng() < 0.8) terrain[i] = 'bog'
      for (let i = 0; i < N; i++) if (terrain[i] === 'plain') { const x = rng(); terrain[i] = x < 0.3 ? 'hill' : x < 0.3 + scale(d, [0.08, 0.1, 0.12, 0.13]) ? 'rock' : 'plain' }
      terrain[from] = terrain[to] = 'plain'
      base.lines = [{ from, to, color: COLORS[0], label: ['L', 'M'] }]
      const best = dijkstra(base, from, to)
      if (best.cost === Infinity) continue
      // Prefer a map where the cheapest line is not simply the shortest.
      const straight = Math.abs(Math.floor(from / cols) - Math.floor(to / cols)) + cols - 1
      if (best.path.length - 1 === straight && attempt < 25) continue
      base.optimum = best.cost
      base.limit = Math.ceil(best.cost * (1 + scale(d, [0.3, 0.15, 0.05, 0])))
      base.solution = [best.path]
      return base
    }
    if (mode === 'transsib') {
      const from = at(Math.floor(rng() * rows), 0), to = at(Math.floor(rng() * rows), cols - 1)
      const T = scale(d, [1, 2, 2, 3])
      const lake = at(1 + Math.floor(rng() * (rows - 2)), 2 + Math.floor(rng() * (cols - 4)))
      terrain[lake] = 'lake'
      if (rng() < 0.7) terrain[neighbours(rows, cols, lake)[Math.floor(rng() * 2)]] = 'lake'
      for (let i = 0; i < N; i++) if (terrain[i] === 'plain' && rng() < scale(d, [0.1, 0.12, 0.14, 0.15])) terrain[i] = 'rock'
      terrain[from] = terrain[to] = 'plain'
      // Towns spread west to east, so the line has to wander.
      const towns: number[] = []
      for (let t = 0; t < T; t++) {
        const c = Math.round(((t + 1) * (cols - 1)) / (T + 1))
        const cand = shuffle(Array.from({ length: rows }, (_, r) => at(r, c)), rng).filter(i => terrain[i] === 'plain' && i !== from && i !== to)
        if (cand.length) towns.push(cand[0])
      }
      if (towns.length !== T) continue
      base.towns = towns
      base.lines = [{ from, to, color: COLORS[0], label: ['★', 'V'] }]
      const best = fewestCurves(base, from, to)
      if (best.turns === Infinity || new Set(best.path).size !== best.path.length) continue
      if (best.turns < scale(d, [2, 3, 4, 5]) && attempt < 40) continue
      base.optimum = best.turns
      base.limit = best.turns + scale(d, [2, 1, 1, 0])
      base.solution = [best.path]
      return base
    }
    // underground
    const nl = scale(d, [2, 3, 3, 4]), ni = scale(d, [1, 1, 2, 2])
    for (let i = 0; i < N; i++) if (rng() < scale(d, [0, 0.05, 0.06, 0.08])) terrain[i] = 'rock'
    const free = shuffle(Array.from({ length: N }, (_, i) => i).filter(i => terrain[i] === 'plain'), rng)
    const inter: number[] = []
    for (const i of free) {
      const r = Math.floor(i / cols), c = i % cols
      if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) continue
      if (inter.every(j => Math.abs(Math.floor(j / cols) - r) + Math.abs((j % cols) - c) >= 3)) inter.push(i)
      if (inter.length === ni) break
    }
    if (inter.length !== ni) continue
    base.interchanges = inter
    const used = new Set<number>()
    const stations = new Set<number>()
    const lines: LineDef[] = [], sol: number[][] = []
    let ok = true
    // An interchange has four sides, so at most two lines can pass through
    // it; each must serve two.  The rest of the lines run free.
    const VIAS: Record<string, number[][]> = { '2,1': [[0], [0]], '3,1': [[0], [0], []], '3,2': [[0], [1], [0, 1]], '4,2': [[0], [0], [1], [1]] }
    const plan = VIAS[`${nl},${ni}`]
    for (let k = 0; k < nl && ok; k++) {
      const vias = plan[k].map(v => inter[v])
      const pool = free.filter(i => !used.has(i) && !inter.includes(i) && !stations.has(i))
      const ends = shuffle(pool, rng)
      let placed = false
      for (let a = 0; a < Math.min(ends.length, 12) && !placed; a++) for (let b = a + 1; b < Math.min(ends.length, 12) && !placed; b++) {
        const A = ends[a], B = ends[b]
        const man = Math.abs(Math.floor(A / cols) - Math.floor(B / cols)) + Math.abs((A % cols) - (B % cols))
        if (man < 4) continue
        const block = new Set([...used, ...stations].filter(x => !inter.includes(x)))
        const stops = [A, ...vias, B]
        let path: number[] = [A]
        for (let q = 1; q < stops.length && path.length; q++) {
          const blocked = new Set([...block, ...path.slice(0, -1), ...stops.filter((_, j) => j !== q && j !== q - 1)])
          const seg = bfsPath(base, stops[q - 1], stops[q], blocked, rng)
          path = seg ? [...path, ...seg.slice(1)] : []
        }
        if (!path.length || new Set(path).size !== path.length) continue
        lines.push({ from: A, to: B, color: COLORS[k], label: [String.fromCharCode(65 + k), String.fromCharCode(65 + k)] })
        sol.push(path)
        for (const x of path) if (!inter.includes(x)) used.add(x)
        stations.add(A); stations.add(B)
        placed = true
      }
      ok = placed
    }
    if (!ok) continue
    base.lines = lines
    base.solution = sol
    if (!replay(base, sol)) continue
    return base
  }
}

// ── Switching yard ─────────────────────────────────────────────────────────────

export type YardMove = { t: 'direct' } | { t: 'in'; s: number } | { t: 'out'; s: number }
export interface Yard { cars: number[]; sidings: number; cap: number; solution: YardMove[] }
export interface YardState { next: number; sent: number; stacks: number[][] }

export function yardSpec(d: Difficulty) { return { cars: scale(d, [5, 6, 7, 8]), sidings: scale(d, [2, 2, 3, 3]), cap: scale(d, [3, 3, 2, 2]) } }

export function applyMove(y: Pick<Yard, 'cars' | 'cap'>, st: YardState, m: YardMove): YardState | null {
  const want = st.sent + 1
  if (m.t === 'direct') {
    if (st.next >= y.cars.length || y.cars[st.next] !== want) return null
    return { next: st.next + 1, sent: want, stacks: st.stacks }
  }
  if (m.t === 'in') {
    if (st.next >= y.cars.length || st.stacks[m.s].length >= y.cap) return null
    return { next: st.next + 1, sent: st.sent, stacks: st.stacks.map((s, k) => (k === m.s ? [...s, y.cars[st.next]] : s)) }
  }
  const s = st.stacks[m.s]
  if (!s.length || s[s.length - 1] !== want) return null
  return { next: st.next, sent: want, stacks: st.stacks.map((x, k) => (k === m.s ? x.slice(0, -1) : x)) }
}
export const yardMoves = (sidings: number): YardMove[] => [{ t: 'direct' }, ...Array.from({ length: sidings }, (_, s) => [{ t: 'out' as const, s }, { t: 'in' as const, s }]).flat()]
export const yardStuck = (y: Pick<Yard, 'cars' | 'cap' | 'sidings'>, st: YardState) => yardMoves(y.sidings).every(m => !applyMove(y, st, m))

export function solveYard(y: Pick<Yard, 'cars' | 'cap' | 'sidings'>, st?: YardState): YardMove[] | null {
  const start: YardState = st ?? { next: 0, sent: 0, stacks: Array.from({ length: y.sidings }, () => []) }
  const seen = new Set<string>()
  const moves = yardMoves(y.sidings)
  const dfs = (s: YardState): YardMove[] | null => {
    if (s.sent === y.cars.length) return []
    const key = `${s.next}|${s.stacks.map(x => x.join(',')).join('/')}`
    if (seen.has(key)) return null
    seen.add(key)
    for (const m of moves) {
      const n = applyMove(y, s, m)
      if (!n) continue
      const r = dfs(n)
      if (r) return [m, ...r]
    }
    return null
  }
  return dfs(start)
}

export function makeYard(configId: string, d: Difficulty, seed: number): Yard {
  const rng = mulberry32(seed ^ hashString(`railway-yard:${configId}:${d}`))
  const { cars: n, sidings, cap } = yardSpec(d)
  for (let attempt = 0; ; attempt++) {
    const cars = shuffle(Array.from({ length: n }, (_, i) => i + 1), rng)
    const sol = solveYard({ cars, cap, sidings })
    if (!sol) continue
    // It must need the sidings: one fewer siding (or one shorter) can't do it.
    const harder = sidings > 1 ? solveYard({ cars, cap, sidings: sidings - 1 }) : null
    const shorter = cap > 1 ? solveYard({ cars, cap: cap - 1, sidings }) : null
    if ((harder || (d >= 3 && shorter)) && attempt < 200) continue
    return { cars, sidings, cap, solution: sol }
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const TERRAIN_BG: Record<Terrain, string> = { plain: '#e9dfc4', hill: '#c9b07e', bog: '#a3ae7c', rock: '#6b5d50', lake: '#7fa8c0' }
const TERRAIN_MARK: Partial<Record<Terrain, string>> = { hill: '⌒', bog: '≈', rock: '▲', lake: '~' }
const EDGE: [number, number][] = [[5, 0], [10, 5], [5, 10], [0, 5]]

function GridGame({ config, L, difficulty, outcome, settled, win, lose }: {
  config: RailConfig; L: Layout; difficulty: Difficulty
  outcome: 'won' | 'lost' | null; settled: boolean; win: () => void; lose: (r?: string) => void
}) {
  const [paths, setPaths] = useState<number[][]>(L.lines.map(l => [l.from]))
  const [active, setActive] = useState(0)
  const [note, setNote] = useState(config.intro)
  const [mistakes, setMistakes] = useState(0)
  const [run, setRun] = useState(-1)
  const drag = useRef(false)
  const maxM = mistakesFor(difficulty)
  const { rows, cols } = L
  const maxLen = Math.max(...paths.map(p => p.length))

  useEffect(() => {
    if (run < 0) return
    if (run >= maxLen) { win(); return }
    const t = setTimeout(() => setRun(run + 1), 110)
    return () => clearTimeout(t)
  }, [run, maxLen, win])

  const extend = (k: number, i: number, quiet = false) => {
    const why = canExtend(L, paths, k, i)
    if (why) { if (!quiet) setNote(why); return false }
    const next = paths.map((p, j) => (j === k ? [...p, i] : p))
    setPaths(next)
    if (i === L.lines[k].to) {
      const left = L.lines.filter((l, j) => next[j][next[j].length - 1] !== l.to).length
      setNote(left ? `Line ${L.lines[k].label[0]} reaches its station. ${left} to go.` : 'All stations reached — run the trains!')
    } else setNote(status(next))
    return true
  }
  const status = (ps: number[][]) =>
    L.mode === 'stephenson' ? `Spent £${trackCost(L, ps[0])}k of £${L.limit}k.` :
    L.mode === 'transsib' ? `Curves ${curves(cols, ps[0])} / ${L.limit} · towns ${ps[0].filter(x => L.towns.includes(x)).length} / ${L.towns.length}.` :
    `${ps.filter((p, j) => p[p.length - 1] === L.lines[j].to).length} / ${L.lines.length} lines joined.`

  const tap = (i: number) => {
    if (settled || run >= 0) return
    const inActive = paths[active].includes(i)
    const other = paths.findIndex((p, j) => j !== active && p.includes(i) && !L.interchanges.includes(i))
    const own = inActive ? active : other
    if (own >= 0) {
      const at = paths[own].indexOf(i)
      setActive(own)
      if (at < paths[own].length - 1) { const next = paths.map((p, j) => (j === own ? p.slice(0, at + 1) : p)); setPaths(next); setNote(`Track cut back. ${status(next)}`) }
      return
    }
    const st = L.lines.findIndex(l => l.from === i)
    if (st >= 0) { setActive(st); return }
    extend(active, i)
  }
  const cellAt = (x: number, y: number): number | null => {
    if (typeof document.elementFromPoint !== 'function') return null
    const el = document.elementFromPoint(x, y)?.closest('[data-cell]') as HTMLElement | null
    return el ? Number(el.dataset.cell) : null
  }
  const onDown = (e: React.PointerEvent) => {
    const i = Number((e.target as HTMLElement).closest('[data-cell]')?.getAttribute('data-cell'))
    if (Number.isNaN(i)) return
    const owner = paths.findIndex(p => p[p.length - 1] === i)
    const st = L.lines.findIndex(l => l.from === i)
    if (owner >= 0) setActive(owner); else if (st >= 0) setActive(st)
    drag.current = true
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || settled || run >= 0) return
    const i = cellAt(e.clientX, e.clientY)
    if (i === null) return
    const p = paths[active]
    if (p[p.length - 1] === i) return
    if (p.length >= 2 && p[p.length - 2] === i) { setPaths(paths.map((q, j) => (j === active ? q.slice(0, -1) : q))); return }
    extend(active, i, true)
  }

  const runTrains = () => {
    if (settled || run >= 0) return
    const why = layoutDone(L, paths)
    if (why) {
      const m = mistakes + 1; setMistakes(m)
      if (m >= maxM) { setNote(why); lose('the trains could not run'); return }
      setNote(`${why} ${maxM - m} ${maxM - m === 1 ? 'try' : 'tries'} left.`)
      return
    }
    setNote('All aboard!')
    setRun(0)
  }

  const reset = () => { if (!settled && run < 0) { setPaths(L.lines.map(l => [l.from])); setNote(config.intro) } }
  const ready = L.lines.every((l, j) => paths[j][paths[j].length - 1] === l.to)

  return (
    <>
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">
            {L.mode === 'stephenson' ? `Budget £${L.limit}k` : L.mode === 'transsib' ? `${L.limit} curve pieces · ${L.towns.length} town${L.towns.length === 1 ? '' : 's'}` : `${L.lines.length} lines · ${L.interchanges.length} interchange${L.interchanges.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <p className="text-xs font-bold tabular-nums text-ink-2 shrink-0" data-testid="progress">
          {L.mode === 'stephenson' ? `£${trackCost(L, paths[0])}k` : L.mode === 'transsib' ? `${curves(cols, paths[0])} / ${L.limit}` : `${paths.filter((p, j) => p[p.length - 1] === L.lines[j].to).length} / ${L.lines.length}`}
        </p>
      </div>

      <div className="flex justify-center">
        <div
          className="grid w-full max-w-[400px] rounded-lg overflow-hidden border-2 border-[#5b3a1e] touch-none"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, aspectRatio: `${cols} / ${rows}` }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = false }} onPointerCancel={() => { drag.current = false }} onPointerLeave={() => { drag.current = false }}
          data-testid="rail-grid"
        >
          {Array.from({ length: rows * cols }, (_, i) => {
            const t = L.terrain[i]
            const segs: { d: number[]; color: string; k: number }[] = []
            paths.forEach((p, k) => {
              const j = p.indexOf(i)
              if (j < 0) return
              const dirs: number[] = []
              if (j > 0) dirs.push(heading(cols, i, p[j - 1]))
              if (j < p.length - 1) dirs.push(heading(cols, i, p[j + 1]))
              segs.push({ d: dirs, color: L.lines[k].color, k })
            })
            const stFrom = L.lines.findIndex(l => l.from === i), stTo = L.lines.findIndex(l => l.to === i)
            const town = L.towns.indexOf(i)
            const inter = L.interchanges.includes(i)
            const train = run >= 0 && paths.some(p => p[Math.min(run, p.length - 1)] === i)
            return (
              <div key={i} data-cell={i} onClick={() => tap(i)} className="relative aspect-square border-[0.5px] border-black/10 cursor-pointer" style={{ background: TERRAIN_BG[t] }}>
                {TERRAIN_MARK[t] && !segs.length && <span className="absolute inset-0 flex items-center justify-center text-black/30 text-sm pointer-events-none">{TERRAIN_MARK[t]}</span>}
                {L.mode === 'stephenson' && t !== 'rock' && !segs.length && stFrom < 0 && stTo < 0 && (
                  <span className="absolute right-0.5 bottom-0 text-[9px] font-bold text-black/40 pointer-events-none">{TERRAIN_COST[t]}</span>
                )}
                <svg viewBox="0 0 10 10" className="absolute inset-0 w-full h-full pointer-events-none">
                  {segs.map(s => s.d.map(h => (
                    <g key={`${s.k}-${h}`}>
                      <line x1={5} y1={5} x2={EDGE[h][0]} y2={EDGE[h][1]} stroke="#3b2a1d" strokeWidth={3} />
                      <line x1={5} y1={5} x2={EDGE[h][0]} y2={EDGE[h][1]} stroke={s.color} strokeWidth={1.6} strokeLinecap="round" />
                    </g>
                  )))}
                  {segs.length > 0 && <circle cx={5} cy={5} r={0.9} fill={segs[0].color} />}
                  {inter && <circle cx={5} cy={5} r={2.6} fill="#fff" stroke="#111" strokeWidth={0.9} />}
                  {town >= 0 && <><circle cx={5} cy={5} r={2.6} fill="#fffaf0" stroke="#3b2a1d" strokeWidth={0.6} /><text x={5} y={6.2} textAnchor="middle" fontSize={3.2} fontWeight={700} fill="#3b2a1d">{town + 1}</text></>}
                  {(stFrom >= 0 || stTo >= 0) && (() => {
                    const k = stFrom >= 0 ? stFrom : stTo
                    return <><rect x={1.8} y={1.8} width={6.4} height={6.4} rx={1.2} fill={L.lines[k].color} stroke={k === active && stFrom >= 0 ? '#f4c542' : '#fff'} strokeWidth={0.7} />
                      <text x={5} y={6.3} textAnchor="middle" fontSize={3.6} fontWeight={800} fill="#fff">{L.lines[k].label[stFrom >= 0 ? 0 : 1]}</text></>
                  })()}
                  {train && <rect x={3} y={3} width={4} height={4} rx={0.8} fill="#111" stroke="#f4c542" strokeWidth={0.5} />}
                </svg>
              </div>
            )
          })}
        </div>
      </div>

      {L.lines.length > 1 && (
        <div className="flex gap-1.5 justify-center">
          {L.lines.map((l, k) => (
            <button key={k} onClick={() => setActive(k)} data-line={k}
              className={`px-2 py-1 rounded-lg text-xs font-bold text-white ${k === active ? 'ring-2 ring-accent' : 'opacity-70'}`} style={{ background: l.color }}>
              {l.label[0]}{paths[k][paths[k].length - 1] === l.to ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <p className="text-xs leading-snug text-ink-2" role="status">{note}</p>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={reset} disabled={settled || run >= 0} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-panel border border-line text-ink disabled:opacity-40">Clear</button>
          <button onClick={runTrains} disabled={settled || run >= 0 || !ready} data-testid="run" className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40">Run trains</button>
        </div>
      </div>
      {L.mode === 'underground' && <p className="text-[11px] text-muted -mt-2">Tries left: {maxM - mistakes}</p>}
      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The trains are running!" loseTitle="The line never opened" />
    </>
  )
}

function YardGame({ config, Y, difficulty, outcome, settled, win, lose }: {
  config: RailConfig; Y: Yard; difficulty: Difficulty
  outcome: 'won' | 'lost' | null; settled: boolean; win: () => void; lose: (r?: string) => void
}) {
  const start: YardState = { next: 0, sent: 0, stacks: Array.from({ length: Y.sidings }, () => []) }
  const [hist, setHist] = useState<YardState[]>([start])
  const [undos, setUndos] = useState(scale(difficulty, [3, 2, 1, 1]))
  const [note, setNote] = useState(config.intro)
  const st = hist[hist.length - 1]
  const want = st.sent + 1
  const incoming = Y.cars.slice(st.next)

  const move = (m: YardMove) => {
    if (settled) return
    const n = applyMove(Y, st, m)
    if (!n) {
      setNote(m.t === 'direct' ? `Only wagon ${want} may leave now.` : m.t === 'in' ? (st.next >= Y.cars.length ? 'No wagons left to park.' : 'That siding is full.') : `The wagon at the end of that siding isn’t number ${want}.`)
      return
    }
    setHist([...hist, n])
    if (n.sent === Y.cars.length) { setNote('Every wagon left in order!'); win(); return }
    if (yardStuck(Y, n)) {
      if (undos <= 0) { setNote('The yard is jammed — no wagon can move.'); lose('the yard is jammed'); return }
      setNote(`The yard is jammed! Undo (${undos} left).`)
      return
    }
    setNote(`Next out: wagon ${n.sent + 1}.`)
  }
  const undo = () => {
    if (settled || undos <= 0 || hist.length <= 1) return
    setHist(hist.slice(0, -1)); setUndos(undos - 1); setNote('Points reset — one move taken back.')
  }

  const Car = ({ n, hot }: { n: number; hot?: boolean }) => (
    <span className={`inline-flex items-center justify-center w-7 h-6 rounded-md text-xs font-bold border ${hot ? 'bg-accent text-accent-fg border-accent' : 'bg-[#7a4a22] text-white border-[#3b2a1d]'}`}>{n}</span>
  )

  return (
    <>
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">{Y.cars.length} wagons · {Y.sidings} sidings of {Y.cap}</p>
        </div>
        <p className="text-xs font-bold tabular-nums text-ink-2 shrink-0" data-testid="progress">{st.sent} / {Y.cars.length}</p>
      </div>

      <div className="rounded-lg border border-line bg-[#e9dfc4] p-2 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase text-muted w-14 shrink-0">Arriving</span>
          <div className="flex gap-1 flex-row-reverse justify-end flex-1 min-h-6 border-b-2 border-[#3b2a1d] pb-0.5" data-testid="incoming">
            {[...incoming].reverse().map((c, k) => <Car key={k} n={c} hot={k === incoming.length - 1 && c === want} />)}
          </div>
          <button onClick={() => move({ t: 'direct' })} disabled={settled} data-testid="direct" className="px-2 py-1 rounded-lg text-[11px] font-bold bg-accent text-accent-fg disabled:opacity-40 shrink-0">Out ▶</button>
        </div>
        {st.stacks.map((s, k) => (
          <div key={k} className="flex items-center gap-2">
            <button onClick={() => move({ t: 'in', s: k })} disabled={settled} data-testid={`push-${k}`} className="w-14 shrink-0 px-1 py-1 rounded-lg text-[11px] font-bold bg-panel border border-line text-ink disabled:opacity-40">Park ↓{k + 1}</button>
            <div className="flex gap-1 flex-1 min-h-6 border-b-2 border-dashed border-[#3b2a1d] pb-0.5">
              {s.map((c, j) => <Car key={j} n={c} hot={j === s.length - 1 && c === want} />)}
              {Array.from({ length: Y.cap - s.length }, (_, j) => <span key={`e${j}`} className="w-7 h-6 rounded-md border border-dashed border-black/20" />)}
            </div>
            <button onClick={() => move({ t: 'out', s: k })} disabled={settled} data-testid={`pop-${k}`} className="px-2 py-1 rounded-lg text-[11px] font-bold bg-panel border border-line text-ink disabled:opacity-40 shrink-0">Out ▶</button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase text-muted w-14 shrink-0">Departed</span>
          <div className="flex gap-1 flex-1 min-h-6">{Array.from({ length: st.sent }, (_, k) => <Car key={k} n={k + 1} />)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <p className="text-xs leading-snug text-ink-2" role="status">{note}</p>
        <button onClick={undo} disabled={settled || undos <= 0 || hist.length <= 1} data-testid="undo" className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40 shrink-0">Undo ({undos})</button>
      </div>
      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The train is made up!" loseTitle="The yard is jammed" />
    </>
  )
}

export default function RailwayGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'stephenson')
  const level = useMemo(
    () => (config.mode === 'yard' ? { Y: makeYard(configId, difficulty, seed) } : { L: makeLayout(configId, config.mode, difficulty, seed) }),
    [configId, config, difficulty, seed],
  )
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds: secondsFor(difficulty), running: !settled, onExpire: () => lose('the line was not ready in time') })
  const shared = { config, difficulty, outcome, settled, win, lose }
  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <TimerBar remaining={timer.remaining} total={timer.total} />
      {'Y' in level && level.Y ? <YardGame Y={level.Y} {...shared} /> : <GridGame L={level.L!} {...shared} />}
    </div>
  )
}
