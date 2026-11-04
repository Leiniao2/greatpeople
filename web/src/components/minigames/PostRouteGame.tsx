import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar, type Rng } from './_shared'

// Post Route: plan a round trip from the post house through every town and
// back, within a distance budget.  Four rule sets:
//
//   thurn   Thurn und Taxis relays: horses tire.  Between two relay stations
//           (and the post house) the rider may cover at most R leagues.
//   pony    Pony Express: some stations must be reached by a deadline.
//   royal   Persian Royal Road: roads are one-way (some both ways); you may
//           pass through a town again, but must follow the roads.
//   inca    Inca chasquis in the Andes: an uphill leg takes 30% longer per
//           level climbed, downhill none — so a loop costs differently in
//           each direction (steep climbs belong on short legs).
//
// The exact optimum is computed by exhaustive search with pruning (≤ 9 stops:
// 8! orders) or, for one-way roads, Floyd–Warshall plus Held–Karp DP.
//
//   D   stops   budget slack   timer   expected
//   1   6       +20%           90s     ~1 min
//   2   7       +10%           120s    ~1.5 min
//   3   8       +5%            150s    ~2 min
//   4   9       exact          180s    ~3 min

export type Mode = 'thurn' | 'pony' | 'royal' | 'inca'

export interface PostConfig {
  title: string
  intro: string
  fact: string
  mode: Mode
}

export const CONFIGS: Record<string, PostConfig> = {
  thurn: {
    title: 'The Thurn und Taxis Post',
    intro: 'Ride from the post house through every town and back. Horses tire: change them at relay stations (◆) before you ride too far.',
    fact: 'From 1490 the Taxis family ran the imperial post for the Habsburgs, with relay stations about a day’s ride apart where riders took fresh horses; their postal business lasted until 1867.',
    mode: 'thurn',
  },
  pony: {
    title: 'The Pony Express',
    intro: 'Carry the mail through every station and home again. Some stations must have it by a deadline.',
    fact: 'The Pony Express ran from April 1860 to October 1861 between Missouri and California, about 1,900 miles in roughly ten days; the transcontinental telegraph put it out of business.',
    mode: 'pony',
  },
  royal: {
    title: 'The Persian Royal Road',
    intro: 'Visit every town and return. Many roads run one way only — follow the arrows. You may pass through a town again.',
    fact: 'Herodotus describes Darius’s Royal Road, about 2,500 km from Sardis to Susa with 111 relay stations; royal couriers covered it in about nine days, a journey of three months on foot.',
    mode: 'royal',
  },
  inca: {
    title: 'The Inca Chasquis',
    intro: 'Run the message through every post and back. Climbing is slow, running downhill is quick — choose your direction well.',
    fact: 'Inca chasqui runners relayed messages and quipus along some 40,000 km of mountain roads, handing over at posts every few kilometres; they could carry a message about 240 km in a day.',
    mode: 'inca',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

export const stopsFor = (d: Difficulty) => scale(d, [6, 7, 8, 9])
export const slackFor = (d: Difficulty) => scale(d, [0.2, 0.1, 0.05, 0])
export const secondsFor = (d: Difficulty) => scale(d, [90, 120, 150, 180])
/** Uphill legs take this much longer per level climbed (downhill: no extra). */
export const CLIMB = 0.3

export interface Pt { x: number; y: number }
export interface Road { u: number; v: number; w: number; both: boolean }
export interface Route {
  mode: Mode
  nodes: Pt[]
  names: string[]
  /** Leg cost matrix (direct legs; for royal only along roads, else Infinity). */
  cost: number[][]
  /** thurn */
  relays: boolean[]
  range: number
  /** pony: latest arrival, Infinity if none */
  deadline: number[]
  /** inca */
  alt: number[]
  /** royal */
  roads: Road[]
  optimum: number
  /** A best round as town indices, starting and ending at 0. */
  solution: number[]
}

const NAMES: Record<Mode, string[]> = {
  thurn: ['Brux', 'Mech', 'Liège', 'Aach', 'Köln', 'Mainz', 'Trier', 'Namur', 'Gent'],
  pony: ['StJo', 'Kear', 'Juls', 'Lara', 'SLC', 'Ruby', 'Carsn', 'Sacr', 'Sprgs'],
  royal: ['Susa', 'Sard', 'Ancy', 'Nin', 'Arb', 'Bab', 'Ecb', 'Perse', 'Tars'],
  inca: ['Cusco', 'Quito', 'Cajam', 'Jauja', 'Vilca', 'Huán', 'Tumbs', 'Pucar', 'Chile'],
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const leagues = (a: Pt, b: Pt) => Math.max(1, Math.round(dist(a, b) / 5))

function scatter(n: number, rng: Rng, minGap = 20): Pt[] {
  for (let gap = minGap; ; gap -= 1) {
    const pts: Pt[] = []
    for (let tries = 0; tries < 600 && pts.length < n; tries++) {
      const p = { x: 8 + rng() * 84, y: 8 + rng() * 74 }
      if (pts.every(q => dist(p, q) >= gap)) pts.push(p)
    }
    if (pts.length === n) return pts
  }
}

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
function planarPairs(pts: Pt[], maxLen = 46): [number, number][] {
  const all: [number, number, number][] = []
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) all.push([i, j, dist(pts[i], pts[j])])
  all.sort((a, b) => a[2] - b[2])
  const out: [number, number][] = []
  for (const [i, j, l] of all) {
    if (l > maxLen) continue
    if (pts.some((p, k) => k !== i && k !== j && segDist(p, pts[i], pts[j]) < 6)) continue
    if (out.some(([a, b]) => a !== i && a !== j && b !== i && b !== j && segCross(pts[i], pts[j], pts[a], pts[b]))) continue
    out.push([i, j])
  }
  return out
}

/** Check a partial or full order of towns (starting at 0) against the rules. */
export function legal(r: Pick<Route, 'mode' | 'cost' | 'relays' | 'range' | 'deadline'>, path: readonly number[]): boolean {
  let t = 0, since = 0
  for (let k = 1; k < path.length; k++) {
    const c = r.cost[path[k - 1]][path[k]]
    if (c === Infinity) return false
    t += c; since += c
    if (r.mode === 'thurn') { if (since > r.range) return false; if (r.relays[path[k]]) since = 0 }
    if (r.mode === 'pony' && t > r.deadline[path[k]]) return false
  }
  return true
}

export const pathLength = (cost: number[][], path: readonly number[]) => path.slice(1).reduce((s, v, k) => s + cost[path[k]][v], 0)

/** Exhaustive search for the best legal round 0 → all → 0 (complete-graph modes). */
export function bestRound(r: Pick<Route, 'mode' | 'cost' | 'relays' | 'range' | 'deadline'>): { cost: number; path: number[] } {
  const n = r.cost.length
  let best = { cost: Infinity, path: [] as number[] }
  const path = [0]
  const used = new Uint8Array(n); used[0] = 1
  const dfs = (t: number, since: number) => {
    if (t >= best.cost) return
    const last = path[path.length - 1]
    if (path.length === n) {
      const c = r.cost[last][0]
      if (r.mode === 'thurn' && since + c > r.range) return
      if (t + c < best.cost) best = { cost: t + c, path: [...path, 0] }
      return
    }
    for (let v = 1; v < n; v++) {
      if (used[v]) continue
      const c = r.cost[last][v]
      let s2 = since + c
      if (r.mode === 'thurn') { if (s2 > r.range) continue; if (r.relays[v]) s2 = 0 }
      if (r.mode === 'pony' && t + c > r.deadline[v]) continue
      used[v] = 1; path.push(v)
      dfs(t + c, s2)
      used[v] = 0; path.pop()
    }
  }
  dfs(0, 0)
  return best
}

function floyd(cost: number[][]): { d: number[][]; next: number[][] } {
  const n = cost.length
  const d = cost.map(row => row.slice())
  const next = cost.map((row, i) => row.map((c, j) => (c < Infinity ? j : i === j ? j : -1)))
  for (let i = 0; i < n; i++) d[i][i] = 0
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (d[i][k] + d[k][j] < d[i][j]) { d[i][j] = d[i][k] + d[k][j]; next[i][j] = next[i][k] }
  }
  return { d, next }
}

/** One-way roads: Held–Karp on shortest-path distances, expanded to road steps. */
export function bestRoadRound(cost: number[][]): { cost: number; path: number[] } {
  const n = cost.length
  const { d, next } = floyd(cost)
  const FULL = 1 << n
  const dp = Array.from({ length: FULL }, () => new Array(n).fill(Infinity))
  const par = Array.from({ length: FULL }, () => new Array(n).fill(-1))
  dp[1][0] = 0
  for (let m = 1; m < FULL; m += 2) for (let v = 0; v < n; v++) {
    const c = dp[m][v]
    if (c === Infinity) continue
    for (let u = 1; u < n; u++) {
      if (m & (1 << u) || d[v][u] === Infinity) continue
      const nm = m | (1 << u)
      if (c + d[v][u] < dp[nm][u]) { dp[nm][u] = c + d[v][u]; par[nm][u] = v }
    }
  }
  let best = Infinity, last = -1
  for (let v = 1; v < n; v++) if (dp[FULL - 1][v] + d[v][0] < best) { best = dp[FULL - 1][v] + d[v][0]; last = v }
  if (last < 0) return { cost: Infinity, path: [] }
  const order: number[] = []
  for (let m = FULL - 1, v = last; v !== 0;) { order.push(v); const p = par[m][v]; m ^= 1 << v; v = p }
  order.push(0); order.reverse(); order.push(0)
  const path = [0]
  for (let k = 1; k < order.length; k++) {
    let x = order[k - 1]
    while (x !== order[k]) { x = next[x][order[k]]; path.push(x) }
  }
  return { cost: best, path }
}

function stronglyConnected(cost: number[][]): boolean {
  const { d } = floyd(cost)
  return d.every(row => row.every(x => x < Infinity))
}

/** Build the level, verified solvable, with its exact optimum. */
export function makeRoute(configId: string, config: PostConfig, d: Difficulty, seed: number): Route {
  const rng = mulberry32(seed ^ hashString(`postroute:${configId}:${d}`))
  const n = stopsFor(d)
  const mode = config.mode
  for (let attempt = 0; ; attempt++) {
    const nodes = scatter(n, rng)
    const names = NAMES[mode].slice(0, n)
    const alt = nodes.map(() => Math.floor(rng() * 6))
    let cost = nodes.map((a, i) => nodes.map((b, j) => (i === j ? 0 : leagues(a, b))))
    if (mode === 'inca') cost = cost.map((row, i) => row.map((c, j) => (i === j ? 0 : Math.round(c * (1 + CLIMB * Math.max(0, alt[j] - alt[i]))))))
    const relays = nodes.map((_, i) => i === 0)
    const deadline = nodes.map(() => Infinity)
    let range = 0
    let roads: Road[] = []
    const base = { mode, cost, relays, range, deadline }

    if (mode === 'royal') {
      const pairs = planarPairs(nodes)
      const pOne = scale(d, [0.45, 0.55, 0.65, 0.75])
      roads = pairs.map(([u, v]) => {
        const flip = rng() < 0.5
        return { u: flip ? v : u, v: flip ? u : v, w: leagues(nodes[u], nodes[v]), both: rng() >= pOne }
      })
      const build = () => {
        const c = nodes.map((_, i) => nodes.map((_, j) => (i === j ? 0 : Infinity)))
        for (const r of roads) { c[r.u][r.v] = r.w; if (r.both) c[r.v][r.u] = r.w }
        return c
      }
      let c = build()
      for (const r of shuffle(roads, rng)) { if (stronglyConnected(c)) break; r.both = true; c = build() }
      if (!stronglyConnected(c)) continue
      const best = bestRoadRound(c)
      return { mode, nodes, names, cost: c, relays, range, deadline, alt, roads, optimum: best.cost, solution: best.path }
    }

    const plain = bestRound({ ...base, mode: 'inca' })
    if (mode === 'thurn') {
      const k = scale(d, [2, 2, 3, 3])
      for (const i of shuffle(Array.from({ length: n - 1 }, (_, j) => j + 1), rng).slice(0, k)) relays[i] = true
      // The longest stretch between relays on the free optimum; shrink the
      // horses' range until the rule bites but a round still exists.
      const stretch = (p: number[]) => { let s = 0, m = 0; for (let j = 1; j < p.length; j++) { s += cost[p[j - 1]][p[j]]; m = Math.max(m, s); if (relays[p[j]]) s = 0 } return m }
      const top = stretch(plain.path)
      let chosen: { r: number; best: { cost: number; path: number[] } } | null = null
      for (let r = top - 1; r >= top - 12 && r > 0; r--) {
        const best = bestRound({ ...base, relays, range: r })
        if (best.cost === Infinity) break
        if (best.cost > plain.cost) { chosen = { r, best }; break }
      }
      if (!chosen) { if (attempt < 30) continue; chosen = { r: top, best: plain } }
      range = chosen.r
      return { mode, nodes, names, cost, relays, range, deadline, alt, roads, optimum: chosen.best.cost, solution: chosen.best.path }
    }
    if (mode === 'pony') {
      // Deadlines taken from a random round, so it is always possible.
      const order = [0, ...shuffle(Array.from({ length: n - 1 }, (_, j) => j + 1), rng)]
      let t = 0
      const arrive = new Array(n).fill(0)
      for (let j = 1; j < n; j++) { t += cost[order[j - 1]][order[j]]; arrive[order[j]] = t }
      const k = scale(d, [2, 2, 3, 3])
      for (const i of shuffle(order.slice(1), rng).slice(0, k)) deadline[i] = arrive[i] + Math.floor(rng() * 3)
      if (legal({ ...base, deadline }, plain.path) && attempt < 30) continue
      const best = bestRound({ ...base, deadline })
      return { mode, nodes, names, cost, relays, range, deadline, alt, roads, optimum: best.cost, solution: best.path }
    }
    // inca: prefer levels where the two directions of the best loop differ.
    const rev = [...plain.path].reverse()
    if (pathLength(cost, rev) === plain.cost && attempt < 30) continue
    return { mode, nodes, names, cost, relays, range, deadline, alt, roads, optimum: plain.cost, solution: plain.path }
  }
}

export const budgetFor = (r: Route, d: Difficulty) => Math.ceil(r.optimum * (1 + slackFor(d)))

/** Is `path` a finished, legal round within budget? */
export function finished(r: Route, path: readonly number[], budget: number): boolean {
  if (path.length < 2 || path[0] !== 0 || path[path.length - 1] !== 0) return false
  if (!r.nodes.every((_, i) => path.includes(i))) return false
  if (r.mode !== 'royal' && path.length !== r.nodes.length + 1) return false
  return legal(r, path) && pathLength(r.cost, path) <= budget
}

export default function PostRouteGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'thurn')
  const route = useMemo(() => makeRoute(configId, config, difficulty, seed), [configId, config, difficulty, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const [path, setPath] = useState<number[]>([0])
  const [note, setNote] = useState(config.intro)
  const budget = budgetFor(route, difficulty)
  const timer = useGameTimer({ seconds: secondsFor(difficulty), running: !settled, onExpire: () => lose('the mail was late') })
  const n = route.nodes.length
  const mode = route.mode
  const cur = path[path.length - 1]
  const length = pathLength(route.cost, path)
  const visited = new Set(path)
  const allSeen = visited.size === n

  let since = 0
  if (mode === 'thurn') for (let k = 1; k < path.length; k++) { since += route.cost[path[k - 1]][path[k]]; if (route.relays[path[k]]) since = 0 }

  const candidates = route.nodes.map((_, i) => {
    if (i === cur) return false
    if (mode === 'royal') return route.cost[cur][i] < Infinity
    if (i === 0) return allSeen
    return !visited.has(i)
  })

  const go = (i: number) => {
    if (settled) return
    if (!candidates[i]) { setNote(mode === 'royal' && i !== cur ? 'No road runs that way from here.' : i === 0 ? 'Visit every town before heading home.' : 'Already visited.'); return }
    const next = [...path, i]
    const c = route.cost[cur][i]
    if (mode === 'thurn' && !legal(route, next)) { setNote(`The horses can’t ride ${since + c} leagues — at most ${route.range} between relays.`); return }
    if (mode === 'pony' && !legal(route, next)) { setNote(`${route.names[i]} needed the mail by day ${route.deadline[i]}; you’d arrive on day ${length + c}.`); return }
    setPath(next)
    const len = length + c
    if (finished(route, next, budget)) { setNote(`Home in ${len} leagues${len === route.optimum ? ' — the shortest round possible!' : '.'}`); win(); return }
    if (next[next.length - 1] === 0 && route.nodes.every((_, k) => next.includes(k))) { setNote(`Home, but ${len} leagues is over the ${budget} allowed. Undo and try another order.`); return }
    setNote(len > budget ? `Already ${len} leagues — over the ${budget} budget.` : `${len} / ${budget} leagues.`)
  }

  const undo = () => { if (!settled && path.length > 1) { setPath(path.slice(0, -1)); setNote('Took back a leg.') } }
  const reset = () => { if (!settled && path.length > 1) { setPath([0]); setNote('Back at the post house.') } }

  const P = route.nodes
  const unit = mode === 'pony' ? 'days' : 'leagues'

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">
            {visited.size} / {n} towns{mode === 'thurn' ? ` · horses ${route.range - since} left` : ''}{mode === 'pony' ? ` · day ${length}` : ''}
          </p>
        </div>
        <p className={`text-xs font-bold tabular-nums shrink-0 ${length > budget ? 'text-red-700' : 'text-ink-2'}`} data-testid="progress">{length} / {budget}</p>
      </div>
      <TimerBar remaining={timer.remaining} total={timer.total} />

      <svg viewBox="0 0 100 90" className="w-full max-w-[420px] mx-auto rounded-lg border border-line touch-manipulation" style={{ background: mode === 'inca' ? '#e7e0cf' : '#efe6d2' }} data-testid="map">
        <defs>
          <marker id="pr-arrow" viewBox="0 0 6 6" refX={5} refY={3} markerWidth={4} markerHeight={4} orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#7a6a50" />
          </marker>
        </defs>
        {mode === 'royal' && route.roads.map((r, k) => {
          const a = P[r.u], b = P[r.v]
          const L = dist(a, b), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
          return (
            <g key={k}>
              <line x1={a.x + ux * 4} y1={a.y + uy * 4} x2={b.x - ux * 4.5} y2={b.y - uy * 4.5} stroke="#a8977a" strokeWidth={0.9}
                markerEnd="url(#pr-arrow)" strokeDasharray={r.both ? undefined : '2 1'} />
              {r.both && <line x1={b.x - ux * 4} y1={b.y - uy * 4} x2={a.x + ux * 4.5} y2={a.y + uy * 4.5} stroke="transparent" markerEnd="url(#pr-arrow)" />}
              <text x={mx - uy * 2.5} y={my + ux * 2.5 + 1} textAnchor="middle" fontSize={3} fontWeight={700} fill="#7a6a50">{r.w}</text>
            </g>
          )
        })}
        {path.slice(1).map((v, k) => {
          const a = P[path[k]], b = P[v]
          return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#b0442a" strokeWidth={1.4} strokeLinecap="round" opacity={0.85} />
        })}
        {!settled && mode !== 'royal' && candidates.map((ok, i) => {
          if (!ok) return null
          const a = P[cur], b = P[i]
          return <line key={`c${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7a6a50" strokeWidth={0.4} strokeDasharray="1 1.5" />
        })}
        {P.map((p, i) => {
          const here = i === cur
          const ok = candidates[i] && !settled
          const leg = route.cost[cur][i]
          return (
            <g key={i} data-node={i} data-cand={ok ? '1' : undefined} onClick={() => go(i)} className="cursor-pointer">
              <circle cx={p.x} cy={p.y} r={6} fill="transparent" />
              {route.relays[i] && i !== 0
                ? <rect x={p.x - 3} y={p.y - 3} width={6} height={6} transform={`rotate(45 ${p.x} ${p.y})`} fill={visited.has(i) ? '#d9b46a' : '#fffaf0'} stroke="#2a2015" strokeWidth={0.6} />
                : <circle cx={p.x} cy={p.y} r={i === 0 ? 3.6 : 2.8} fill={here ? '#f4c542' : i === 0 ? '#b0442a' : visited.has(i) ? '#d9b46a' : '#fffaf0'} stroke="#2a2015" strokeWidth={0.6} />}
              {here && <circle cx={p.x} cy={p.y} r={5} fill="none" stroke="#f4c542" strokeWidth={1} />}
              <text x={p.x} y={p.y - 4.6} textAnchor="middle" fontSize={3} fontWeight={700} fill="#2a2015">{route.names[i]}</text>
              {mode === 'inca' && <text x={p.x} y={p.y + 7} textAnchor="middle" fontSize={2.8} fill="#5a4a30">▲{route.alt[i]}</text>}
              {mode === 'pony' && route.deadline[i] < Infinity && (
                <text x={p.x} y={p.y + 7} textAnchor="middle" fontSize={2.8} fontWeight={700} fill={visited.has(i) ? '#5a7d4f' : '#b32020'}>by {route.deadline[i]}</text>
              )}
              {ok && mode !== 'royal' && (
                <g>
                  <rect x={p.x + 3} y={p.y - 1.5} width={6.4} height={4} rx={1} fill="#2a2015" />
                  <text x={p.x + 6.2} y={p.y + 1.5} textAnchor="middle" fontSize={2.8} fontWeight={700} fill="#fffaf0">{leg}</text>
                </g>
              )}
            </g>
          )
        })}
      </svg>

      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <p className={`text-xs leading-snug ${length > budget ? 'text-red-700 font-bold' : 'text-ink-2'}`} role="status">{note}</p>
        <div className="flex gap-1.5 shrink-0">
          <button onClick={reset} disabled={settled || path.length <= 1} className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-panel border border-line text-ink disabled:opacity-40">Reset</button>
          <button onClick={undo} disabled={settled || path.length <= 1} data-testid="undo" className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40">Undo</button>
        </div>
      </div>
      <p className="text-[11px] text-muted -mt-2">Budget {budget} {unit}{mode === 'thurn' ? ` · horses ride ${route.range} between relays (◆)` : ''}</p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The post is through!" loseTitle="The mail was late" />
    </div>
  )
}
