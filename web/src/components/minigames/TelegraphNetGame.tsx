import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar, type Rng } from './_shared'

// Telegraph Network: string wire between cities.  Four rule sets:
//
//   morse      connect every city with the least wire — a minimum spanning
//              tree, computed exactly with Kruskal's algorithm.
//   atlantic   two coasts and an ocean: sea cable costs three times as much
//              per mile, and mid-ocean islands are optional relays you may use
//              or skip (Steiner tree, exact by trying every island subset).
//   indo       the Indo-European line: one single line, London to Calcutta,
//              through every relay office — no branches (cheapest Hamiltonian
//              path, exact by bitmask DP).
//   chappe     semaphore towers, no wire: towers see each other only within
//              range and not through mountains.  Build towers on hills until
//              all cities are linked, with as few towers as possible (exact by
//              trying every subset of hills); every tower built counts.
//
// The wire games win the moment the network is complete within budget; the
// semaphore game the moment the cities are linked within the tower allowance.
//
//   D   morse  atlantic  indo  chappe(cities/hills)  slack   timer  expected
//   1   6      5+1       6     3 / 6                 +20%/+3 90s    ~1 min
//   2   8      6+2       7     4 / 8                 +10%/+2 120s   ~1.5 min
//   3   10     7+2       8     5 / 9                 +5%/+1  150s   ~2 min
//   4   12     8+3       9     5 / 11                +3%/+1  180s   ~2.5 min

export type Mode = 'mst' | 'sea' | 'chain' | 'semaphore'

export interface TelegraphConfig {
  title: string
  intro: string
  fact: string
  mode: Mode
}

export const CONFIGS: Record<string, TelegraphConfig> = {
  morse: {
    title: 'Morse’s First Lines',
    intro: 'Connect every city to the network using the least wire. Tap a route to string wire along it.',
    fact: 'On 24 May 1844 Samuel Morse sent “What hath God wrought” over the first long-distance telegraph line, 40 miles from Washington to Baltimore, strung on poles after buried cable failed.',
    mode: 'mst',
  },
  atlantic: {
    title: 'The Transatlantic Cable',
    intro: 'Join both coasts. Sea cable costs three times as much per mile — islands may serve as relays, if they save cable.',
    fact: 'The first transatlantic cable, landed in 1858 between Ireland and Newfoundland, failed after three weeks; the Great Eastern laid the first lasting cable in 1866.',
    mode: 'sea',
  },
  indo: {
    title: 'The Indo-European Line',
    intro: 'Build one single line from London to Calcutta through every relay office — no branches — using the least wire.',
    fact: 'Siemens & Halske’s Indo-European Telegraph Line opened in 1870, running about 11,000 km from London to Calcutta; a message could cross it in around a minute.',
    mode: 'chain',
  },
  chappe: {
    title: 'Chappe’s Semaphore',
    intro: 'Build semaphore towers on the hills until every city can signal every other. Towers see only so far, and never through mountains. Use as few as you can.',
    fact: 'Claude Chappe’s optical telegraph sent its first message from Paris to Lille in 1794; by the 1840s some 530 towers spanned France, relaying signals at about 3 symbols a minute.',
    mode: 'semaphore',
  },
  'earhart-news': {
    title: 'News Across the Atlantic, 1932',
    intro: 'Earhart has landed in Ireland; New York is waiting. Join both coasts with cable. Sea cable costs three times as much per mile — islands may serve as relays, if they save cable.',
    fact: 'Earhart crossed by the same short gap between Newfoundland and Ireland that the first transatlantic telegraph cable spanned in 1858. Within hours of her landing at Culmore on 21 May 1932, the news was in New York, and President Hoover cabled his congratulations.',
    mode: 'sea',
  },
  'chappe-1793': {
    title: 'The Republic’s Towers, 1793',
    intro: 'The Convention wants news to outrun any courier. Build semaphore towers on the hills until every city can signal every other. Towers see only so far, and never through mountains. Use as few as you can.',
    fact: 'In the summer of 1793, as Marie Antoinette was moved to the Conciergerie to await trial, the Convention adopted Claude Chappe’s semaphore and ordered a line from Paris to Lille. It opened in 1794, and in August that year brought Paris news of the recapture of Le Quesnoy within an hour.',
    mode: 'semaphore',
  },
  'chappe-brulon': {
    title: 'The Chappe Brothers’ Towers',
    intro: 'Plan the signal towers that would carry news across the kingdom. Build towers on the hills until every city can signal every other. Towers see only so far, and never through mountains. Use as few as you can.',
    fact: 'On 2 March 1791 Claude Chappe and his brothers sent a message some 14 km between Brûlon and Parcé in the Sarthe; on 22 March 1792 his brother Ignace, a deputy, presented the invention to the Legislative Assembly. The first line, Paris to Lille, opened in 1794.',
    mode: 'semaphore',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

export const slackFor = (d: Difficulty) => scale(d, [0.2, 0.1, 0.05, 0.03])
export const towerSlackFor = (d: Difficulty) => scale(d, [3, 2, 1, 1])
export const secondsFor = (d: Difficulty) => scale(d, [90, 120, 150, 180])
export const SEA_FACTOR = 3

export function sizeFor(mode: Mode, d: Difficulty): { required: number; optional: number } {
  switch (mode) {
    case 'mst': return { required: scale(d, [6, 8, 10, 12]), optional: 0 }
    case 'sea': return { required: scale(d, [5, 6, 7, 8]), optional: scale(d, [1, 2, 2, 3]) }
    case 'chain': return { required: scale(d, [6, 7, 8, 9]), optional: 0 }
    case 'semaphore': return { required: scale(d, [3, 4, 5, 5]), optional: scale(d, [6, 8, 9, 11]) }
  }
}

export interface Pt { x: number; y: number }
export interface Link { id: string; u: number; v: number; cost: number; sea?: boolean }
export interface Net {
  mode: Mode
  nodes: Pt[]
  names: string[]
  /** Must be connected (cities); the rest are optional relays/hills. */
  required: boolean[]
  links: Link[]
  /** Chain: the two ends. */
  ends: [number, number]
  /** Semaphore: sight range and mountains. */
  range: number
  mountains: { x: number; y: number; r: number }[]
  /** Least wire (or least towers) possible. */
  optimum: number
  /** A best answer: link ids, or hill node ids for semaphore. */
  solution: (string | number)[]
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
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

function scatterIn(n: number, rng: Rng, box: [number, number, number, number], existing: Pt[], gap: number): Pt[] {
  const [x0, y0, x1, y1] = box
  const pts: Pt[] = []
  for (let g = gap; pts.length < n; g -= 1) {
    for (let tries = 0; tries < 500 && pts.length < n; tries++) {
      const p = { x: x0 + rng() * (x1 - x0), y: y0 + rng() * (y1 - y0) }
      if ([...existing, ...pts].every(q => dist(p, q) >= g)) pts.push(p)
    }
  }
  return pts
}

/** Shortest-first non-crossing candidate routes that don't graze another node. */
export function planarPairs(pts: Pt[], maxLen = 48): [number, number][] {
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

/** Kruskal over `links` restricted to nodes in `use`; Infinity if they can't all join. */
export function mst(n: number, links: readonly Link[], use: readonly boolean[]): { cost: number; ids: string[] } {
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  let cost = 0, joined = 0
  const ids: string[] = []
  for (const l of [...links].sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))) {
    if (!use[l.u] || !use[l.v]) continue
    const a = find(l.u), b = find(l.v)
    if (a === b) continue
    parent[a] = b; cost += l.cost; joined++; ids.push(l.id)
  }
  return joined === use.filter(Boolean).length - 1 ? { cost, ids } : { cost: Infinity, ids: [] }
}

/** Steiner-lite: best MST over required nodes plus any subset of optional ones. */
export function steiner(n: number, links: readonly Link[], required: readonly boolean[]): { cost: number; ids: string[] } {
  const opt = required.map((r, i) => (r ? -1 : i)).filter(i => i >= 0)
  let best = { cost: Infinity, ids: [] as string[] }
  for (let mask = 0; mask < 1 << opt.length; mask++) {
    const use = required.slice()
    opt.forEach((i, k) => { if (mask & (1 << k)) use[i] = true })
    const r = mst(n, links, use)
    if (r.cost < best.cost) best = r
  }
  return best
}

/** Cheapest Hamiltonian path from s to t over `links` (bitmask DP). */
export function bestChain(n: number, links: readonly Link[], s: number, t: number): { cost: number; ids: string[] } {
  const w = Array.from({ length: n }, () => new Array<Link | null>(n).fill(null))
  for (const l of links) { w[l.u][l.v] = l; w[l.v][l.u] = l }
  const FULL = 1 << n
  const dp = Array.from({ length: FULL }, () => new Array(n).fill(Infinity))
  const par = Array.from({ length: FULL }, () => new Array(n).fill(-1))
  dp[1 << s][s] = 0
  for (let m = 0; m < FULL; m++) for (let v = 0; v < n; v++) {
    const c = dp[m][v]
    if (c === Infinity || v === t && m !== FULL - 1) continue
    for (let u = 0; u < n; u++) {
      const l = w[v][u]
      if (!l || m & (1 << u)) continue
      const nm = m | (1 << u)
      if (c + l.cost < dp[nm][u]) { dp[nm][u] = c + l.cost; par[nm][u] = v }
    }
  }
  const cost = dp[FULL - 1][t]
  if (cost === Infinity) return { cost, ids: [] }
  const ids: string[] = []
  let m = FULL - 1, v = t
  while (v !== s) { const p = par[m][v]; ids.push(w[p][v]!.id); m ^= 1 << v; v = p }
  return { cost, ids: ids.reverse() }
}

/** Semaphore: which pairs of nodes can see each other. */
export function sightLinks(nodes: Pt[], range: number, mountains: Net['mountains']): Link[] {
  const out: Link[] = []
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const L = dist(nodes[i], nodes[j])
    if (L > range) continue
    if (mountains.some(m => segDist(m, nodes[i], nodes[j]) < m.r)) continue
    out.push({ id: `${i}-${j}`, u: i, v: j, cost: 0 })
  }
  return out
}

/** Are all required nodes joined, using links among `active` nodes? */
export function linked(n: number, links: readonly Link[], required: readonly boolean[], active: readonly boolean[]): boolean {
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const l of links) if (active[l.u] && active[l.v]) { adj[l.u].push(l.v); adj[l.v].push(l.u) }
  const first = required.indexOf(true)
  const seen = new Set([first]); const st = [first]
  while (st.length) { const x = st.pop()!; for (const y of adj[x]) if (!seen.has(y)) { seen.add(y); st.push(y) } }
  return required.every((r, i) => !r || seen.has(i))
}

/** Fewest hills to light so all cities can signal (brute force over subsets). */
export function fewestTowers(net: Pick<Net, 'nodes' | 'required' | 'range' | 'mountains'>): { count: number; hills: number[] } {
  const n = net.nodes.length
  const links = sightLinks(net.nodes, net.range, net.mountains)
  const hills = net.required.map((r, i) => (r ? -1 : i)).filter(i => i >= 0)
  let best = { count: Infinity, hills: [] as number[] }
  for (let mask = 0; mask < 1 << hills.length; mask++) {
    let bits = 0; for (let m = mask; m; m &= m - 1) bits++
    if (bits >= best.count) continue
    const active = net.required.slice()
    hills.forEach((h, k) => { if (mask & (1 << k)) active[h] = true })
    if (linked(n, links, net.required, active)) best = { count: bits, hills: hills.filter((_, k) => mask & (1 << k)) }
  }
  return best
}

const NAMES: Record<Mode, string[]> = {
  mst: ['Wash', 'Balt', 'Phil', 'NYC', 'Bost', 'Alb', 'Rich', 'Pitt', 'Buff', 'Clev', 'Hart', 'Tren'],
  sea: ['NYC', 'Bost', 'Hal', 'StJ', 'Mont', 'Phil', 'Balt', 'Wash'],
  chain: ['Lon', 'Berl', 'Wars', 'Odes', 'Tifl', 'Tehr', 'Bush', 'Kar', 'Calc'],
  semaphore: ['Paris', 'Lille', 'Stras', 'Lyon', 'Brest'],
}
const EAST = ['Lon', 'Dub', 'Val', 'Brst', 'Lpl', 'Glas', 'Corn', 'Lis']
const ISLES = ['Azor', 'Berm', 'Icel']

const cost = (a: Pt, b: Pt, sea = false) => Math.max(1, Math.round(dist(a, b) / 4)) * (sea ? SEA_FACTOR : 1)

/** Build the level from config and seed, with its exact optimum. */
export function makeNet(configId: string, config: TelegraphConfig, d: Difficulty, seed: number): Net {
  const rng = mulberry32(seed ^ hashString(`telegraphnet:${configId}:${d}`))
  const mode = config.mode
  const { required: R, optional: O } = sizeFor(mode, d)
  for (let attempt = 0; ; attempt++) {
    let nodes: Pt[] = [], names: string[] = [], required: boolean[] = []
    let ends: [number, number] = [0, 0]
    let range = 0
    const mountains: Net['mountains'] = []
    if (mode === 'mst') {
      nodes = scatterIn(R, rng, [8, 8, 92, 82], [], 20)
      names = NAMES.mst.slice(0, R); required = nodes.map(() => true)
    } else if (mode === 'sea') {
      const west = Math.ceil(R / 2), east = R - west
      const wp = scatterIn(west, rng, [6, 8, 30, 82], [], 17)
      const ep = scatterIn(east, rng, [70, 8, 94, 82], wp, 17)
      const ip = scatterIn(O, rng, [40, 14, 60, 76], [...wp, ...ep], 16)
      nodes = [...wp, ...ep, ...ip]
      names = [...NAMES.sea.slice(0, west), ...EAST.slice(0, east), ...ISLES.slice(0, O)]
      required = nodes.map((_, i) => i < R)
    } else if (mode === 'chain') {
      const mid = scatterIn(R - 2, rng, [18, 8, 82, 82], [], 19)
      nodes = [{ x: 7, y: 15 + rng() * 60 }, ...mid.sort((a, b) => a.x - b.x), { x: 93, y: 15 + rng() * 60 }]
      names = NAMES.chain.slice(0, R - 1).concat('Calc'); names[0] = 'Lon'
      required = nodes.map(() => true)
      ends = [0, R - 1]
    } else {
      // Cities on the rim, hills in between, a mountain or two.
      const cities = scatterIn(R, rng, [6, 6, 94, 84], [], 36)
      const hills = scatterIn(O, rng, [10, 10, 90, 80], cities, 15)
      nodes = [...cities, ...hills]
      names = [...NAMES.semaphore.slice(0, R), ...hills.map(() => '')]
      required = nodes.map((_, i) => i < R)
      const mcount = d >= 3 ? 2 : 1
      for (const m of scatterIn(mcount, rng, [25, 20, 75, 70], nodes, 10)) mountains.push({ ...m, r: 6 + rng() * 3 })
      range = 30
      const net = { nodes, required, range, mountains }
      const best = fewestTowers(net)
      if (best.count === Infinity || best.count < (d === 1 ? 1 : 2)) continue
      return { mode, nodes, names, required, links: sightLinks(nodes, range, mountains), ends, range, mountains, optimum: best.count, solution: best.hills }
    }
    const pairs = planarPairs(nodes, mode === 'sea' ? 60 : 48)
    const links: Link[] = pairs.map(([u, v], k) => {
      const sea = mode === 'sea' && (!required[u] || !required[v] || (nodes[u].x < 50) !== (nodes[v].x < 50))
      return { id: `l${k}`, u, v, cost: cost(nodes[u], nodes[v], sea), sea }
    })
    let best: { cost: number; ids: string[] }
    if (mode === 'chain') best = bestChain(nodes.length, links, ends[0], ends[1])
    else if (mode === 'sea') {
      best = steiner(nodes.length, links, required)
      // Prefer levels where an island actually matters or a choice is close.
      if (best.cost !== Infinity && attempt < 20 && !best.ids.some(id => { const l = links.find(x => x.id === id)!; return !required[l.u] || !required[l.v] })) continue
    } else best = mst(nodes.length, links, required)
    if (best.cost === Infinity) continue
    return { mode, nodes, names, required, links, ends, range, mountains, optimum: best.cost, solution: best.ids }
  }
}

export const budgetFor = (net: Net, d: Difficulty) =>
  net.mode === 'semaphore' ? net.optimum + towerSlackFor(d) : Math.ceil(net.optimum * (1 + slackFor(d)))

/** Is the chosen set of links a finished network for this mode? */
export function complete(net: Net, chosen: readonly string[]): boolean {
  const n = net.nodes.length
  const ls = net.links.filter(l => chosen.includes(l.id))
  if (net.mode === 'chain') {
    const deg = new Array(n).fill(0)
    for (const l of ls) { deg[l.u]++; deg[l.v]++ }
    if (ls.length !== n - 1) return false
    if (deg.some((x, i) => (net.ends.includes(i) ? x !== 1 : x !== 2))) return false
  }
  return linked(n, ls, net.required, net.nodes.map(() => true))
}

export const wireCost = (net: Net, chosen: readonly string[]) => net.links.filter(l => chosen.includes(l.id)).reduce((s, l) => s + l.cost, 0)

export default function TelegraphNetGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'morse')
  const net = useMemo(() => makeNet(configId, config, difficulty, seed), [configId, config, difficulty, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const [chosen, setChosen] = useState<string[]>([])
  const [towers, setTowers] = useState<number[]>([])
  const [built, setBuilt] = useState(0)
  const [note, setNote] = useState(config.intro)
  const budget = budgetFor(net, difficulty)
  const sema = net.mode === 'semaphore'
  const timer = useGameTimer({ seconds: secondsFor(difficulty), running: !settled, onExpire: () => lose('the line was not finished in time') })

  const spent = sema ? built : wireCost(net, chosen)
  const active = useMemo(() => net.nodes.map((_, i) => net.required[i] || towers.includes(i)), [net, towers])

  const toggleLink = (l: Link) => {
    if (settled || sema) return
    const next = chosen.includes(l.id) ? chosen.filter(x => x !== l.id) : [...chosen, l.id]
    setChosen(next)
    const c = wireCost(net, next)
    if (complete(net, next)) {
      if (c <= budget) { setNote(`Line open with ${c} miles of wire${c === net.optimum ? ' — the least possible!' : '.'}`); win(); return }
      setNote(`Everything is connected, but ${c} miles is over the ${budget} budget. Find cheaper routes.`)
      return
    }
    if (net.mode === 'chain') {
      const deg = new Map<number, number>()
      for (const l2 of net.links.filter(x => next.includes(x.id))) { deg.set(l2.u, (deg.get(l2.u) ?? 0) + 1); deg.set(l2.v, (deg.get(l2.v) ?? 0) + 1) }
      const over = [...deg].find(([i, k]) => k > (net.ends.includes(i) ? 1 : 2))
      if (over) { setNote(`${net.names[over[0]]} has too many wires — the line may not branch.`); return }
    }
    setNote(c > budget ? `Over budget: ${c} / ${budget}.` : `${c} / ${budget} miles of wire.`)
  }

  const toggleTower = (i: number) => {
    if (settled || !sema || net.required[i]) return
    if (towers.includes(i)) { setTowers(towers.filter(x => x !== i)); setNote('Tower abandoned — the stone is spent.'); return }
    if (built >= budget) { setNote('No stone left to build another tower.'); return }
    const next = [...towers, i]
    const b = built + 1
    setTowers(next); setBuilt(b)
    const lit = net.nodes.map((_, k) => net.required[k] || next.includes(k))
    if (linked(net.nodes.length, net.links, net.required, lit)) {
      setNote(`All cities can signal, with ${next.length} tower${next.length === 1 ? '' : 's'}${next.length === net.optimum ? ' — the fewest possible!' : '.'}`)
      win(); return
    }
    if (b >= budget) { setNote('The last tower is built, and still some cities cannot see the network.'); lose('the cities are not linked'); return }
    setNote(`${b} / ${budget} towers built.`)
  }

  const mid = (l: Link) => ({ x: (net.nodes[l.u].x + net.nodes[l.v].x) / 2, y: (net.nodes[l.u].y + net.nodes[l.v].y) / 2 })
  const seen = sema ? net.links.filter(l => active[l.u] && active[l.v]) : []

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">
            {sema ? `Towers built ${built} / ${budget}` : `Wire ${spent} / ${budget} miles`}
          </p>
        </div>
        <p className={`text-xs font-bold tabular-nums shrink-0 ${spent > budget ? 'text-red-700' : 'text-ink-2'}`} data-testid="progress">{spent} / {budget}</p>
      </div>
      <TimerBar remaining={timer.remaining} total={timer.total} />

      <svg viewBox="0 0 100 90" className="w-full max-w-[420px] mx-auto rounded-lg border border-line touch-manipulation" style={{ background: '#efe6d2' }} data-testid="map">
        {net.mode === 'sea' && <rect x={34} y={0} width={32} height={90} fill="#b9d3df" />}
        {net.mountains.map((m, k) => (
          <g key={k}>
            <circle cx={m.x} cy={m.y} r={m.r} fill="#c9b79a" opacity={0.6} />
            <path d={`M${m.x - m.r * 0.8},${m.y + m.r * 0.5} L${m.x},${m.y - m.r * 0.7} L${m.x + m.r * 0.8},${m.y + m.r * 0.5} Z`} fill="#8a7458" />
          </g>
        ))}
        {sema && difficulty <= 2 && towers.map(i => (
          <circle key={`r${i}`} cx={net.nodes[i].x} cy={net.nodes[i].y} r={net.range} fill="none" stroke="#5a7d4f" strokeWidth={0.4} strokeDasharray="1.5 1.5" />
        ))}
        {sema && seen.map(l => (
          <line key={l.id} x1={net.nodes[l.u].x} y1={net.nodes[l.u].y} x2={net.nodes[l.v].x} y2={net.nodes[l.v].y} stroke="#b0442a" strokeWidth={1} strokeDasharray="2 1.2" />
        ))}
        {!sema && net.links.map(l => {
          const on = chosen.includes(l.id)
          const a = net.nodes[l.u], b = net.nodes[l.v], m = mid(l)
          return (
            <g key={l.id} data-link={l.id} data-on={on ? '1' : undefined} onClick={() => toggleLink(l)} className="cursor-pointer">
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={7} />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? '#2a2015' : l.sea ? '#4f7f99' : '#a8977a'} strokeWidth={on ? 1.8 : 0.6} strokeDasharray={on ? undefined : '1.6 1.4'} />
              <text x={m.x} y={m.y - 0.8} textAnchor="middle" fontSize={3} fontWeight={700} fill={on ? '#2a2015' : l.sea ? '#2f5f79' : '#7a6a50'} style={{ paintOrder: 'stroke' }} stroke="#efe6d2" strokeWidth={0.8}>{l.cost}</text>
            </g>
          )
        })}
        {net.nodes.map((p, i) => {
          const req = net.required[i]
          if (sema && !req) {
            const on = towers.includes(i)
            return (
              <g key={i} data-node={i} data-tower={on ? '1' : undefined} onClick={() => toggleTower(i)} className="cursor-pointer">
                <circle cx={p.x} cy={p.y} r={5} fill="transparent" />
                <path d={`M${p.x - 3.4},${p.y + 2.4} L${p.x},${p.y - 3} L${p.x + 3.4},${p.y + 2.4} Z`} fill={on ? '#b0442a' : '#9db08a'} stroke="#4a3b28" strokeWidth={0.4} />
                {on && <line x1={p.x} y1={p.y - 3} x2={p.x} y2={p.y - 6.5} stroke="#2a2015" strokeWidth={0.7} />}
                {on && <line x1={p.x - 2.2} y1={p.y - 6.2} x2={p.x + 2.2} y2={p.y - 5.4} stroke="#2a2015" strokeWidth={0.7} />}
              </g>
            )
          }
          const end = net.mode === 'chain' && net.ends.includes(i)
          return (
            <g key={i} data-node={i}>
              <circle cx={p.x} cy={p.y} r={req ? 2.6 : 2.2} fill={req ? (end ? '#b0442a' : '#2a2015') : '#fffaf0'} stroke="#2a2015" strokeWidth={0.5} />
              <text x={p.x} y={p.y - 3.6} textAnchor="middle" fontSize={3.2} fontWeight={700} fill="#2a2015">{net.names[i]}</text>
            </g>
          )
        })}
      </svg>

      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <p className={`text-xs leading-snug ${spent > budget ? 'text-red-700 font-bold' : 'text-ink-2'}`} role="status">{note}</p>
        {!sema && (
          <button onClick={() => { if (!settled) { setChosen([]); setNote('All wire taken down.') } }} disabled={settled || !chosen.length}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-panel border border-line text-ink disabled:opacity-40 shrink-0">Clear</button>
        )}
      </div>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The line is open!" loseTitle="The line is dead" />
    </div>
  )
}

