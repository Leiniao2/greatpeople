import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar, type Rng } from './_shared'

// Seven Bridges: walk a city crossing every bridge exactly once (an Euler
// path), in four different rule sets:
//
//   konigsberg  Euler's proof — the city as drawn has too many land masses
//               with an odd number of bridges, so no walk exists.  First add
//               or demolish the fewest bridges (the exact minimum), then walk.
//   venice      a closed circuit: start and finish at St Mark's.
//   paris       an open walk with no start marked: only the two odd banks work.
//   postman     Chinese postman: streets have lengths, you may repeat a
//               street, cover every one and return within the shortest
//               possible total (+ slack at low difficulty).
//
// Every level is generated from the seed on a non-crossing map and verified:
// degree parity + connectivity, Hierholzer's algorithm builds a solution walk,
// and the postman optimum is street total + a minimum matching of odd corners.
//
//   D   land/bridges   fix edits   postman slack   timer   expected
//   1   5 / ~8          1           +20%            90s     ~1 min
//   2   6 / ~11         1           +12%            120s    ~1.5 min
//   3   7 / ~14         2           +6%             150s    ~2 min
//   4   8 / ~17         2           exact           180s    ~3 min

export type Mode = 'fix' | 'circuit' | 'path' | 'postman'

export interface BridgesConfig {
  title: string
  intro: string
  fact: string
  mode: Mode
}

export const CONFIGS: Record<string, BridgesConfig> = {
  konigsberg: {
    title: 'Königsberg, 1736',
    intro: 'No walk crosses these bridges once each — too many shores have an odd number of bridges. Build or demolish the fewest bridges, then make the walk.',
    fact: 'In 1736 Leonhard Euler proved no walk could cross Königsberg’s seven bridges exactly once: such a walk needs at most two land masses with an odd number of bridges, and Königsberg had four. The paper founded graph theory.',
    mode: 'fix',
  },
  venice: {
    title: 'The Canals of Venice',
    intro: 'Leave St Mark’s, cross every bridge exactly once, and come home to St Mark’s.',
    fact: 'Venice is built on 118 small islands linked by more than 400 bridges; the Rialto, rebuilt in stone in 1591, was for centuries the only bridge across the Grand Canal.',
    mode: 'circuit',
  },
  paris: {
    title: 'The Bridges of the Seine',
    intro: 'Cross every bridge of Paris exactly once. No start is marked — choose the bank where such a walk can begin.',
    fact: 'The Pont Neuf, finished in 1607 under Henri IV, is despite its name the oldest standing bridge across the Seine in Paris — the first built without houses on it.',
    mode: 'path',
  },
  'andes-bridges': {
    title: 'The Rope Bridges of the Andes',
    intro: 'Your scattered bands fall back through the gorges, and each rope bridge is cut once they are over. Cross every bridge exactly once — no start is marked, so choose the bank where such a retreat can begin.',
    fact: 'Inca roads crossed the Andean gorges on suspension bridges of woven grass rope, rebuilt by the villages around them. Inca commanders cut or burned them to slow the Spanish; one, the Q’eswachaka bridge over the Apurímac, is still rewoven by hand every year.',
    mode: 'path',
  },
  'tenochtitlan-canals': {
    title: 'The Canals of Tenochtitlan, 1520',
    intro: 'The city rises against the Spaniards, and the warriors lift the canal bridges to trap them. Too many shores have an odd number of bridges for one runner to cross them all once — lift or lay the fewest bridges, then make the walk.',
    fact: 'Tenochtitlan was laced with canals crossed by removable wooden bridges, and its causeways to the shore had gaps bridged the same way. When the Mexica rose in 1520 they took the bridges up; on the Noche Triste of 30 June the Spaniards fleeing the city lost hundreds of men in the gaps.',
    mode: 'fix',
  },
  postman: {
    title: 'The Postman’s Round',
    intro: 'Walk every street at least once and return to the post office. Repeat streets if you must — but keep the round short.',
    fact: 'The “Chinese postman problem” is named after Meigu Guan (Kwan Mei-Ko), who posed it in 1960; Jack Edmonds and Ellis Johnson solved it efficiently in 1973 using minimum matchings.',
    mode: 'postman',
  },
  'ponte-sant-angelo': {
    title: 'The Bridge of Angels, 1667–1671',
    intro: 'Pilgrims reach St Peter’s across the Tiber. Leave St Peter’s (★), cross every bridge exactly once, and come home to St Peter’s.',
    fact: 'Clement IX had Bernini line the Ponte Sant’Angelo with ten marble angels bearing the instruments of the Passion. Bernini carved two himself; they were judged too fine for the weather and went to Sant’Andrea delle Fratte, with copies put on the bridge.',
    mode: 'circuit',
  },
  'borromini-walk': {
    title: 'A Walk Through Borromini’s Rome',
    intro: 'From San Carlo on the Quirinal to Sant’Ivo at the Sapienza and the Oratory by the Chiesa Nuova — cross every bridge exactly once. No start is marked: choose the shore where such a walk can begin.',
    fact: 'Borromini was buried in San Giovanni dei Fiorentini, beside the Tiber, in the tomb of his kinsman and first master Carlo Maderno.',
    mode: 'path',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

export const nodesFor = (d: Difficulty) => scale(d, [5, 6, 7, 8])
export const bridgesFor = (d: Difficulty) => scale(d, [8, 11, 14, 17])
export const streetsFor = (d: Difficulty) => scale(d, [7, 9, 11, 13])
export const fixesFor = (d: Difficulty) => scale(d, [1, 1, 2, 2])
export const slackFor = (d: Difficulty) => scale(d, [0.2, 0.12, 0.06, 0])
export const mistakesFor = (d: Difficulty) => scale(d, [3, 3, 2, 2])
export const secondsFor = (d: Difficulty) => scale(d, [90, 120, 150, 180])
export const showDegrees = (d: Difficulty) => d <= 2

// ── Graph ──────────────────────────────────────────────────────────────────────

export interface Pt { x: number; y: number }
export interface Edge { id: string; u: number; v: number; w: number }
export interface City {
  mode: Mode
  nodes: Pt[]
  names: string[]
  edges: Edge[]
  /** Neighbouring pairs a bridge may join (non-crossing on the map). */
  pairs: [number, number][]
  /** Fixed start (venice, postman); -1 = player chooses. */
  start: number
  /** Fix mode: the minimum number of edits needed. */
  fixes: number
  /** Postman: shortest covering round. */
  optimum: number
}

const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

function segCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Scatter `n` points in the 100×90 map with a minimum spacing. */
export function scatter(n: number, rng: Rng, minGap = 22): Pt[] {
  for (let gap = minGap; ; gap -= 1) {
    const pts: Pt[] = []
    for (let tries = 0; tries < 600 && pts.length < n; tries++) {
      const p = { x: 10 + rng() * 80, y: 10 + rng() * 70 }
      if (pts.every(q => dist(p, q) >= gap)) pts.push(p)
    }
    if (pts.length === n) return pts
  }
}

/** Shortest-first non-crossing neighbour pairs that don't graze another point. */
export function planarPairs(pts: Pt[], maxLen = 60): [number, number][] {
  const all: [number, number, number][] = []
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) all.push([i, j, dist(pts[i], pts[j])])
  all.sort((a, b) => a[2] - b[2])
  const out: [number, number][] = []
  for (const [i, j, l] of all) {
    if (l > maxLen && out.length >= pts.length - 1) continue
    if (pts.some((p, k) => k !== i && k !== j && segDist(p, pts[i], pts[j]) < 7)) continue
    if (out.some(([a, b]) => a !== i && a !== j && b !== i && b !== j && segCross(pts[i], pts[j], pts[a], pts[b]))) continue
    out.push([i, j])
  }
  return out
}

export function degrees(n: number, edges: readonly Edge[]): number[] {
  const d = new Array(n).fill(0)
  for (const e of edges) { d[e.u]++; d[e.v]++ }
  return d
}
export const oddNodes = (n: number, edges: readonly Edge[]) => degrees(n, edges).map((d, i) => (d % 2 ? i : -1)).filter(i => i >= 0)

/** Are all nodes that touch an edge in one component (and every node touched)? */
export function connected(n: number, edges: readonly Edge[]): boolean {
  if (!edges.length) return false
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const e of edges) { adj[e.u].push(e.v); adj[e.v].push(e.u) }
  if (adj.some(a => !a.length)) return false
  const seen = new Set([0]); const st = [0]
  while (st.length) { const x = st.pop()!; for (const y of adj[x]) if (!seen.has(y)) { seen.add(y); st.push(y) } }
  return seen.size === n
}

/** Hierholzer: an Euler walk (list of edge ids) from `start`, or null. */
export function eulerWalk(n: number, edges: readonly Edge[], start?: number): { nodes: number[]; edges: string[] } | null {
  const odd = oddNodes(n, edges)
  if (!connected(n, edges) || (odd.length !== 0 && odd.length !== 2)) return null
  const s = start ?? (odd.length ? odd[0] : 0)
  if (odd.length === 2 && !odd.includes(s)) return null
  const adj: { e: number; to: number }[][] = Array.from({ length: n }, () => [])
  edges.forEach((e, k) => { adj[e.u].push({ e: k, to: e.v }); adj[e.v].push({ e: k, to: e.u }) })
  const used = new Uint8Array(edges.length)
  const ptr = new Array(n).fill(0)
  const stack: { v: number; e: number }[] = [{ v: s, e: -1 }]
  const out: { v: number; e: number }[] = []
  while (stack.length) {
    const top = stack[stack.length - 1]
    const a = adj[top.v]
    while (ptr[top.v] < a.length && used[a[ptr[top.v]].e]) ptr[top.v]++
    if (ptr[top.v] === a.length) out.push(stack.pop()!)
    else { const { e, to } = a[ptr[top.v]]; used[e] = 1; stack.push({ v: to, e }) }
  }
  out.reverse()
  return { nodes: out.map(o => o.v), edges: out.slice(1).map(o => edges[o.e].id) }
}

function shortestPaths(n: number, edges: readonly Edge[]): { d: number[][]; next: number[][] } {
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)))
  const next = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? j : -1)))
  for (const e of edges) {
    if (e.w < d[e.u][e.v]) { d[e.u][e.v] = d[e.v][e.u] = e.w; next[e.u][e.v] = e.v; next[e.v][e.u] = e.u }
  }
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (d[i][k] + d[k][j] < d[i][j]) { d[i][j] = d[i][k] + d[k][j]; next[i][j] = next[i][k] }
  }
  return { d, next }
}

/** Minimum perfect matching of `odd` under metric `d` (brute force, ≤ 10 nodes). */
export function minMatching(odd: readonly number[], d: number[][]): { cost: number; pairs: [number, number][] } {
  if (!odd.length) return { cost: 0, pairs: [] }
  const [a, ...rest] = odd
  let best = { cost: Infinity, pairs: [] as [number, number][] }
  rest.forEach((b, k) => {
    const sub = minMatching(rest.filter((_, j) => j !== k), d)
    const c = d[a][b] + sub.cost
    if (c < best.cost) best = { cost: c, pairs: [[a, b], ...sub.pairs] }
  })
  return best
}

/** Chinese postman: optimum length and a node-by-node round from `start`. */
export function postmanRound(n: number, edges: readonly Edge[], start: number): { length: number; nodes: number[] } {
  const { d, next } = shortestPaths(n, edges)
  const m = minMatching(oddNodes(n, edges), d)
  const multi: Edge[] = edges.slice()
  for (const [a, b] of m.pairs) {
    let x = a
    while (x !== b) {
      const y = next[x][b]
      const e = edges.filter(e => (e.u === x && e.v === y) || (e.v === x && e.u === y)).sort((p, q) => p.w - q.w)[0]
      multi.push({ ...e, id: `${e.id}+${multi.length}` })
      x = y
    }
  }
  const walk = eulerWalk(n, multi, start)!
  return { length: edges.reduce((s, e) => s + e.w, 0) + m.cost, nodes: walk.nodes }
}

const pairKey = (u: number, v: number) => (u < v ? `${u}-${v}` : `${v}-${u}`)

function addCycleEdges(pairs: [number, number][], n: number, edges: Edge[], rng: Rng, cap: number): boolean {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const [a, b] of pairs) { adj[a].push(b); adj[b].push(a) }
  const touched = degrees(n, edges).map(x => x > 0)
  const anyTouched = touched.some(Boolean)
  // Prefer a pair with one untouched end, so the city fills out.
  const cand = shuffle(pairs, rng).sort((p, q) => {
    const sc = (pr: [number, number]) => anyTouched ? (Number(touched[pr[0]]) + Number(touched[pr[1]]) === 1 ? 0 : 1) : 0
    return sc(p) - sc(q)
  })
  const mult = (u: number, v: number) => edges.filter(e => pairKey(e.u, e.v) === pairKey(u, v)).length
  for (const [u, v] of cand.slice(0, 6)) {
    // BFS from v to u without the direct pair, random order.
    const prev = new Array(n).fill(-2); prev[v] = -1
    const q = [v]
    while (q.length && prev[u] === -2) {
      const x = q.shift()!
      for (const y of shuffle(adj[x], rng)) {
        if (prev[y] !== -2 || (x === v && y === u)) continue
        prev[y] = x; q.push(y)
      }
    }
    if (prev[u] === -2) continue
    const cyc: [number, number][] = [[u, v]]
    for (let x = u; prev[x] !== -1; x = prev[x]) cyc.push([prev[x], x])
    if (cyc.some(([a, b]) => mult(a, b) >= cap)) continue
    for (const [a, b] of cyc) edges.push({ id: '', u: a, v: b, w: 1 })
    return true
  }
  return false
}

const label = (edges: Edge[]) => edges.map((e, k) => ({ ...e, id: `b${k}` }))

/** Build the level, verified solvable. */
export function makeCity(configId: string, config: BridgesConfig, d: Difficulty, seed: number): City {
  const rng = mulberry32(seed ^ hashString(`konigsberg:${configId}:${d}`))
  const n = nodesFor(d)
  const mode = config.mode
  for (let attempt = 0; ; attempt++) {
    const nodes = scatter(n, rng)
    const pairs = planarPairs(nodes)
    const names = NAMES.slice(0, n)
    if (mode === 'postman') {
      const target = streetsFor(d)
      if (pairs.length < target) continue
      // Random spanning tree, then extra streets.
      const order = shuffle(pairs, rng)
      const parent = Array.from({ length: n }, (_, i) => i)
      const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
      const chosen: [number, number][] = []
      for (const pr of order) if (find(pr[0]) !== find(pr[1])) { parent[find(pr[0])] = find(pr[1]); chosen.push(pr) }
      for (const pr of order) if (chosen.length < target && !chosen.includes(pr)) chosen.push(pr)
      const edges = chosen.map(([u, v], k) => ({ id: `s${k}`, u, v, w: Math.max(1, Math.round(dist(nodes[u], nodes[v]) / 7)) }))
      const odd = oddNodes(n, edges)
      if (odd.length < (d >= 3 ? 4 : 2) && attempt < 40) continue
      const start = Math.floor(rng() * n)
      const { length } = postmanRound(n, edges, start)
      return { mode, nodes, names, edges, pairs, start, fixes: 0, optimum: length }
    }
    const target = bridgesFor(d) - (mode === 'circuit' ? 0 : 1)
    const raw: Edge[] = []
    let guard = 0
    while (raw.length < target && guard++ < 40) if (!addCycleEdges(pairs, n, raw, rng, 2)) break
    if (!connected(n, raw)) continue
    let edges = raw
    if (mode !== 'circuit') {
      // One extra bridge makes exactly two odd shores.
      const free = shuffle(pairs, rng).find(([a, b]) => edges.filter(e => pairKey(e.u, e.v) === pairKey(a, b)).length < 2)
      if (!free) continue
      edges = [...edges, { id: '', u: free[0], v: free[1], w: 1 }]
    }
    let fixes = 0
    if (mode === 'fix') {
      const k = fixesFor(d)
      let ok = true
      for (let t = 0; t < k && ok; t++) {
        const deg = degrees(n, edges)
        const evenPairs = shuffle(pairs, rng).filter(([a, b]) => deg[a] % 2 === 0 && deg[b] % 2 === 0)
        ok = false
        for (const [a, b] of evenPairs) {
          const existing = edges.findIndex(e => pairKey(e.u, e.v) === pairKey(a, b))
          if (existing >= 0 && rng() < 0.5) {
            const rest = edges.filter((_, j) => j !== existing)
            if (connected(n, rest)) { edges = rest; ok = true; break }
          }
          if (edges.filter(e => pairKey(e.u, e.v) === pairKey(a, b)).length < 2) {
            edges = [...edges, { id: '', u: a, v: b, w: 1 }]; ok = true; break
          }
        }
      }
      if (!ok || oddNodes(n, edges).length !== 2 + 2 * k) continue
      fixes = k
    }
    edges = label(edges)
    const start = mode === 'circuit' ? Math.floor(rng() * n) : -1
    if (mode !== 'fix' && !eulerWalk(n, edges, start >= 0 ? start : undefined)) continue
    if (mode === 'circuit') names[start] = '★'
    return { mode, nodes, names, edges, pairs, start, fixes, optimum: 0 }
  }
}

/** A minimal set of edits for fix mode: add/remove bridges between odd neighbours. */
export function solveFix(city: City): { add: [number, number][]; remove: string[] } | null {
  const n = city.nodes.length
  const search = (edges: Edge[], left: number, add: [number, number][], remove: string[]): { add: [number, number][]; remove: string[] } | null => {
    const odd = oddNodes(n, edges)
    if (odd.length <= 2 && connected(n, edges)) return { add, remove }
    if (!left) return null
    const oddSet = new Set(odd)
    for (const [a, b] of city.pairs) {
      if (!oddSet.has(a) || !oddSet.has(b)) continue
      const ex = edges.find(e => pairKey(e.u, e.v) === pairKey(a, b) && !e.id.startsWith('new'))
      if (ex) {
        const r = search(edges.filter(e => e !== ex), left - 1, add, [...remove, ex.id])
        if (r) return r
      }
      const r = search([...edges, { id: `new${add.length}`, u: a, v: b, w: 1 }], left - 1, [...add, [a, b]], remove)
      if (r) return r
    }
    return null
  }
  return search(city.edges, city.fixes, [], [])
}

// ── Component ─────────────────────────────────────────────────────────────────

function edgePath(nodes: Pt[], e: Edge, k: number, m: number): { d: string; mx: number; my: number } {
  const a = nodes[e.u], b = nodes[e.v]
  const off = (k - (m - 1) / 2) * 9
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1
  const cx = (a.x + b.x) / 2 - (dy / L) * off, cy = (a.y + b.y) / 2 + (dx / L) * off
  return { d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`, mx: (a.x + 2 * cx + b.x) / 4, my: (a.y + 2 * cy + b.y) / 4 }
}

export default function KonigsbergGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'konigsberg')
  const city = useMemo(() => makeCity(configId, config, difficulty, seed), [configId, config, difficulty, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const n = city.nodes.length
  const mode = city.mode
  const [phase, setPhase] = useState<'edit' | 'walk'>(mode === 'fix' ? 'edit' : 'walk')
  const [removed, setRemoved] = useState<string[]>([])
  const [added, setAdded] = useState<[number, number][]>([])
  const [pick, setPick] = useState<number | null>(null)
  const [walk, setWalk] = useState<number[]>(city.start >= 0 ? [city.start] : [])
  const [used, setUsed] = useState<string[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [note, setNote] = useState(config.intro)
  const maxMistakes = mistakesFor(difficulty)
  const budget = mode === 'postman' ? Math.ceil(city.optimum * (1 + slackFor(difficulty))) : 0
  const timer = useGameTimer({ seconds: secondsFor(difficulty), running: !settled, onExpire: () => lose('night fell before the walk was done') })

  const edges: Edge[] = useMemo(() => [
    ...city.edges.filter(e => !removed.includes(e.id)),
    ...added.map(([u, v], k) => ({ id: `new${k}`, u, v, w: 1 })),
  ], [city, removed, added])
  const deg = useMemo(() => degrees(n, edges), [n, edges])
  const cur = walk.length ? walk[walk.length - 1] : -1
  const length = mode === 'postman' ? used.reduce((s, id) => s + (city.edges.find(e => e.id === id)?.w ?? 0), 0) : 0
  const covered = new Set(used)

  const mistake = (why: string) => {
    const m = mistakes + 1
    setMistakes(m)
    if (m >= maxMistakes) { setNote(why); lose(why); return true }
    setNote(`${why} ${maxMistakes - m} ${maxMistakes - m === 1 ? 'try' : 'tries'} left.`)
    return false
  }
  const resetWalk = () => { setWalk(city.start >= 0 ? [city.start] : []); setUsed([]) }

  const step = (e: Edge) => {
    if (settled || phase !== 'walk' || cur < 0) return
    if (e.u !== cur && e.v !== cur) { setNote('That bridge doesn’t touch where you stand.'); return }
    if (mode !== 'postman' && used.includes(e.id)) { setNote('You have already crossed that bridge.'); return }
    const to = e.u === cur ? e.v : e.u
    const nextWalk = [...walk, to], nextUsed = [...used, e.id]
    setWalk(nextWalk); setUsed(nextUsed)
    if (mode === 'postman') {
      const len = length + e.w
      const all = city.edges.every(s => nextUsed.includes(s.id))
      if (len > budget) { if (!mistake(`The round has grown to ${len} — over the ${budget} allowed.`)) resetWalk(); return }
      if (all && to === city.start) { setNote(`Every street walked in ${len}${len === city.optimum ? ' — the shortest round possible!' : '.'}`); win(); return }
      setNote(`${new Set(nextUsed).size} / ${city.edges.length} streets · ${len} / ${budget}${all ? ' — now head back to the post office.' : ''}`)
      return
    }
    if (nextUsed.length === edges.length) {
      if (mode === 'circuit' && to !== city.start) { if (!mistake('Every bridge crossed, but you are not back at St Mark’s.')) resetWalk(); return }
      setNote('Every bridge crossed exactly once!'); win(); return
    }
    const exits = edges.filter(x => (x.u === to || x.v === to) && !nextUsed.includes(x.id))
    if (!exits.length) {
      if (!mistake(`Stranded on ${city.names[to]} with ${edges.length - nextUsed.length} bridge${edges.length - nextUsed.length === 1 ? '' : 's'} uncrossed.`)) resetWalk()
      return
    }
    setNote(`${nextUsed.length} / ${edges.length} bridges crossed.`)
  }

  const tapNode = (i: number) => {
    if (settled) return
    if (phase === 'edit') {
      if (pick === null) { setPick(i); setNote(`Build from ${city.names[i]}: tap a neighbouring shore.`); return }
      if (pick === i) { setPick(null); setNote(config.intro); return }
      const a = pick; setPick(null)
      if (!city.pairs.some(([p, q]) => pairKey(p, q) === pairKey(a, i))) { setNote('Those shores are not neighbours — a bridge there would cross others.'); return }
      if (removed.length + added.length >= city.fixes) { setNote(`You may make only ${city.fixes} change${city.fixes === 1 ? '' : 's'}. Undo one first.`); return }
      setAdded([...added, [a, i]]); setNote(`New bridge ${city.names[a]}–${city.names[i]}.`)
      return
    }
    if (cur < 0) {
      setWalk([i]); setNote(`Starting on ${city.names[i]}. Tap a bridge to cross it.`); return
    }
    // Tapping a neighbouring shore crosses the first free bridge to it.
    const cand = edges.filter(e => ((e.u === cur && e.v === i) || (e.v === cur && e.u === i)) && (mode === 'postman' || !used.includes(e.id)))
    if (cand.length) step(cand.sort((a, b) => a.w - b.w)[0])
  }

  const tapEdge = (e: Edge) => {
    if (settled) return
    if (phase === 'edit') {
      if (e.id.startsWith('new')) { const k = Number(e.id.slice(3)); setAdded(added.filter((_, j) => j !== k)); setNote('New bridge withdrawn.'); return }
      if (removed.includes(e.id)) { setRemoved(removed.filter(x => x !== e.id)); setNote('Bridge restored.'); return }
      if (removed.length + added.length >= city.fixes) { setNote(`You may make only ${city.fixes} change${city.fixes === 1 ? '' : 's'}. Undo one first.`); return }
      const rest = edges.filter(x => x.id !== e.id)
      if (!connected(n, rest)) { setNote('Demolishing that would cut off part of the city.'); return }
      setRemoved([...removed, e.id]); setNote('Bridge marked for demolition.')
      return
    }
    step(e)
  }

  const startWalk = () => {
    if (settled || phase !== 'edit') return
    const odd = oddNodes(n, edges)
    if (odd.length > 2) { mistake(`Euler’s rule: ${odd.length} shores still have an odd number of bridges — at most two may.`); return }
    setPhase('walk'); setPick(null); setNote('Now walk it: tap a shore to start, then cross bridges.')
  }

  const restart = () => {
    if (settled || phase !== 'walk' || !used.length) return
    if (!mistake('Walk abandoned.')) resetWalk()
  }

  const mult = new Map<string, number>()
  const idx = new Map<string, number>()
  for (const e of edges) { const k = pairKey(e.u, e.v); idx.set(e.id, mult.get(k) ?? 0); mult.set(k, (mult.get(k) ?? 0) + 1) }
  const ghost = phase === 'edit' ? city.edges.filter(e => removed.includes(e.id)) : []
  const order = new Map<string, number>(); used.forEach((id, k) => { if (!order.has(id)) order.set(id, k + 1) })
  const pickable = phase === 'edit' && pick !== null ? city.pairs.filter(([a, b]) => a === pick || b === pick).map(([a, b]) => (a === pick ? b : a)) : []

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">
            {mode === 'postman' ? `${city.edges.length} streets · round ≤ ${budget}` : phase === 'edit' ? `Changes ${removed.length + added.length} / ${city.fixes}` : `${edges.length} bridges${mode === 'circuit' ? ' · return to ★' : ''}`}
          </p>
        </div>
        <p className="text-xs font-bold tabular-nums text-ink-2 shrink-0" data-testid="progress">
          {mode === 'postman' ? `${length} / ${budget}` : `${used.length} / ${edges.length}`}
        </p>
      </div>
      <TimerBar remaining={timer.remaining} total={timer.total} />

      <svg viewBox="0 0 100 90" className="w-full max-w-[420px] mx-auto rounded-lg border border-line touch-manipulation" style={{ background: mode === 'postman' ? '#efe6d2' : '#b9d3df' }} data-testid="map">
        {pickable.map(j => (
          <line key={`p${j}`} x1={city.nodes[pick!].x} y1={city.nodes[pick!].y} x2={city.nodes[j].x} y2={city.nodes[j].y} stroke="#2f7d4f" strokeWidth={0.8} strokeDasharray="2 2" />
        ))}
        {ghost.map(e => {
          const a = city.nodes[e.u], b = city.nodes[e.v]
          return <g key={e.id} data-edge={e.id} onClick={() => tapEdge(e)} className="cursor-pointer">
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b33" strokeWidth={1.2} strokeDasharray="1.5 2" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={7} />
          </g>
        })}
        {edges.map(e => {
          const { d, mx, my } = edgePath(city.nodes, e, idx.get(e.id)!, mult.get(pairKey(e.u, e.v))!)
          const crossed = order.get(e.id)
          const isNew = e.id.startsWith('new')
          const live = phase === 'walk' && cur >= 0 && (e.u === cur || e.v === cur) && (mode === 'postman' || !covered.has(e.id))
          const color = mode === 'postman' ? (covered.has(e.id) ? '#8a7a5c' : '#4a3b28') : crossed ? '#9aa3a8' : isNew ? '#2f7d4f' : '#7a4a22'
          return (
            <g key={e.id} data-edge={e.id} data-live={live ? '1' : undefined} onClick={() => tapEdge(e)} className="cursor-pointer">
              <path d={d} fill="none" stroke="transparent" strokeWidth={8} />
              {live && <path d={d} fill="none" stroke="#f4c542" strokeWidth={5.5} strokeLinecap="round" opacity={0.7} />}
              <path d={d} fill="none" stroke={color} strokeWidth={mode === 'postman' ? 2.6 : 3.2} strokeLinecap="round" strokeDasharray={isNew ? '3 1.5' : undefined} />
              {mode === 'postman' && (
                <g>
                  <circle cx={mx} cy={my} r={3.4} fill="#fffaf0" stroke="#4a3b28" strokeWidth={0.4} />
                  <text x={mx} y={my + 1.3} textAnchor="middle" fontSize={3.6} fontWeight={700} fill="#4a3b28">{e.w}</text>
                </g>
              )}
              {mode !== 'postman' && crossed && <text x={mx} y={my + 1.2} textAnchor="middle" fontSize={3.4} fontWeight={700} fill="#1f2a30">{crossed}</text>}
            </g>
          )
        })}
        {city.nodes.map((p, i) => {
          const here = i === cur
          const sel = pick === i
          return (
            <g key={i} data-node={i} onClick={() => tapNode(i)} className="cursor-pointer">
              <circle cx={p.x} cy={p.y} r={mode === 'postman' ? 4.2 : 6} fill={here ? '#f4c542' : sel ? '#9fd3a9' : mode === 'postman' ? '#fffaf0' : '#d9c79a'} stroke="#4a3b28" strokeWidth={0.8} />
              <text x={p.x} y={p.y + 1.4} textAnchor="middle" fontSize={4} fontWeight={700} fill="#2a2015">
                {mode === 'postman' && i === city.start ? '✉' : city.names[i]}
              </text>
              {mode !== 'postman' && (showDegrees(difficulty) || phase === 'edit' && difficulty <= 2) && (
                <text x={p.x + 5.5} y={p.y - 4.5} fontSize={3.2} fontWeight={700} fill={deg[i] % 2 ? '#b32020' : '#2f5d3a'}>{deg[i]}</text>
              )}
            </g>
          )
        })}
      </svg>

      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <p className="text-xs leading-snug text-ink-2" role="status">{note}</p>
        <div className="flex gap-1.5 shrink-0">
          {phase === 'edit' ? (
            <button onClick={startWalk} disabled={settled} data-testid="walk" className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40">Walk</button>
          ) : (
            <button onClick={restart} disabled={settled || !used.length} data-testid="restart" className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-panel border border-line text-ink disabled:opacity-40">Restart</button>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted -mt-2">Tries left: {maxMistakes - mistakes}</p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle={mode === 'postman' ? 'The post is delivered!' : 'Every bridge crossed!'} loseTitle="The walk failed" />
    </div>
  )
}
