// Balance simulations for the wave-2 "machines" games: a heuristic stands in
// for a careful casual player, and the share of seeded levels it wins at each
// difficulty must fall in a sensible band (high at D1, still fair at D4).
import { describe, it, expect } from 'vitest'
import type { Difficulty } from '@/games/types'
import * as PR from '@/components/minigames/PostRouteGame'
import * as AS from '@/components/minigames/AssemblyGame'
import * as KB from '@/components/minigames/KonigsbergGame'
import * as TN from '@/components/minigames/TelegraphNetGame'
import * as OR from '@/components/minigames/OrbitGame'
import * as WB from '@/components/minigames/WallBuilderGame'
import { mulberry32 } from '@/components/minigames/_shared'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = Array.from({ length: 40 }, (_, k) => 1000 + k * 7)
const rate = (xs: boolean[]) => xs.filter(Boolean).length / xs.length

// ── Post Route: 2-opt / or-opt local search from a few random starts ────────────
function postHeuristic(r: PR.Route, restarts: number, seed: number): number {
  const rng = mulberry32(seed)
  const n = r.nodes.length
  let cost = r.cost
  if (r.mode === 'royal') {
    // One-way roads: the player plans on road distances between towns.
    cost = r.cost.map(row => row.slice())
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (cost[i][k] + cost[k][j] < cost[i][j]) cost[i][j] = cost[i][k] + cost[k][j]
  }
  const rr = { ...r, cost }
  const ok = (t: number[]) => r.mode === 'royal' ? true : PR.legal(rr, t)
  const len = (t: number[]) => (ok(t) ? PR.pathLength(cost, t) : Infinity)
  let best = Infinity
  for (let s = 0; s < restarts; s++) {
    // Nearest neighbour from home with a random first leg.
    const rest = Array.from({ length: n - 1 }, (_, k) => k + 1)
    const tour = [0]
    let first = true
    while (rest.length) {
      const last = tour[tour.length - 1]
      let k = first ? Math.floor(rng() * rest.length) : 0
      if (!first) for (let j = 1; j < rest.length; j++) if (cost[last][rest[j]] < cost[last][rest[k]]) k = j
      first = false
      tour.push(rest.splice(k, 1)[0])
    }
    tour.push(0)
    let cur = tour, cl = len(cur)
    for (let improved = true; improved;) {
      improved = false
      for (let i = 1; i < n - 1 && !improved; i++) for (let j = i + 1; j < n && !improved; j++) {
        const t2 = [...cur.slice(0, i), ...cur.slice(i, j + 1).reverse(), ...cur.slice(j + 1)]
        const l2 = len(t2); if (l2 < cl) { cur = t2; cl = l2; improved = true }
      }
      for (let i = 1; i < n && !improved; i++) for (let j = 1; j < n && !improved; j++) {
        if (i === j) continue
        const t = cur.slice(1, -1); const [x] = t.splice(i - 1, 1); t.splice(j - 1, 0, x)
        const t2 = [0, ...t, 0]; const l2 = len(t2); if (l2 < cl) { cur = t2; cl = l2; improved = true }
      }
    }
    best = Math.min(best, cl)
  }
  return best
}

// ── Assembly: hand heuristics a player can work through ─────────────────────────
function johnson(a: number[], b: number[]): number[] {
  const idx = a.map((_, j) => j)
  const first = idx.filter(j => a[j] <= b[j]).sort((x, y) => a[x] - a[y])
  const last = idx.filter(j => a[j] > b[j]).sort((x, y) => b[y] - b[x])
  return [...first, ...last]
}
function wedgwoodTries(L: AS.WedgwoodLevel): number[] {
  const t = L.times, m = t[0].length
  const orders = m === 2 ? [johnson(t.map(x => x[0]), t.map(x => x[1]))] : [
    johnson(t.map(x => x[0]), t.map(x => x[2])),
    johnson(t.map(x => x[0] + x[1]), t.map(x => x[1] + x[2])),
  ]
  // A player who sees the live chart (D1–D2) also polishes by swapping neighbours.
  const live = (o: number[]) => {
    let cur = o, c = AS.makespan(t, o)
    for (let improved = true; improved;) {
      improved = false
      for (let i = 0; i + 1 < cur.length; i++) {
        const o2 = cur.slice(); [o2[i], o2[i + 1]] = [o2[i + 1], o2[i]]
        const c2 = AS.makespan(t, o2); if (c2 < c) { cur = o2; c = c2; improved = true }
      }
    }
    return c
  }
  return orders.map(o => (t.length <= 5 ? live(o) : AS.makespan(t, o)))
}
function greedyHoles(L: AS.JacquardLevel): number {
  let total = 0
  for (const row of L.pattern) {
    const off = new Set(L.ties.flatMap((hs, t) => (row[t] ? [] : hs)))
    const need = new Set(row.map((v, t) => (v ? t : -1)).filter(t => t >= 0))
    while (need.size) {
      let bh = -1, bc = 0
      for (let h = 0; h < L.hooks; h++) {
        if (off.has(h)) continue
        const c = [...need].filter(t => L.ties[t].includes(h)).length
        if (c > bc) { bc = c; bh = h }
      }
      if (bh < 0) return Infinity
      off.add(bh); total++
      for (const t of [...need]) if (L.ties[t].includes(bh)) need.delete(t)
    }
  }
  return total
}
function greedyLine(L: AS.ArsenalLevel, rng: () => number): number {
  const pos = L.recipes.map(() => 0); let n = 0
  while (pos.some((p, k) => p < L.recipes[k].length)) {
    const votes = new Map<number, number>()
    L.recipes.forEach((r, k) => { if (pos[k] < r.length) votes.set(r[pos[k]], (votes.get(r[pos[k]]) ?? 0) + 1) })
    const top = Math.max(...votes.values())
    const cands = [...votes].filter(([, v]) => v === top).map(([c]) => c)
    const c = cands[Math.floor(rng() * cands.length)]
    L.recipes.forEach((r, k) => { if (r[pos[k]] === c) pos[k]++ })
    n++
  }
  return n
}
function fordLocal(L: AS.FordLevel): number {
  const n = L.times.length, S = L.stations
  const total = L.times.reduce((a, b) => a + b, 0)
  // Fill stations in job order up to an even share, then move single jobs.
  const assign: number[] = []; let s = 0, load = 0
  for (let j = 0; j < n; j++) {
    if (load + L.times[j] > Math.ceil(total / S) && s < S - 1 && load > 0) { s++; load = 0 }
    s = Math.max(s, ...L.needs[j].map(p => assign[p])); assign.push(s); load += L.times[j]
  }
  const valid = (a: number[]) => a.every((x, j) => L.needs[j].every(p => a[p] <= x))
  const score = (a: number[]) => { const l = AS.stationLoads(L, a); return Math.max(...l) * 1000 + l.reduce((q, x) => q + x * x, 0) }
  let cur = assign, sc = score(cur)
  for (let improved = true; improved;) {
    improved = false
    for (let j = 0; j < n && !improved; j++) for (let t = 0; t < S && !improved; t++) {
      if (t === cur[j]) continue
      const a = cur.slice(); a[j] = t
      if (valid(a) && score(a) < sc) { cur = a; sc = score(a); improved = true }
    }
  }
  return Math.max(...AS.stationLoads(L, cur))
}

// ── Königsberg postman: pair odd corners greedily by distance ───────────────────
function postmanGreedy(c: KB.City): number {
  const n = c.nodes.length
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)))
  for (const e of c.edges) if (e.w < d[e.u][e.v]) d[e.u][e.v] = d[e.v][e.u] = e.w
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (d[i][k] + d[k][j] < d[i][j]) d[i][j] = d[i][k] + d[k][j]
  const odd = KB.oddNodes(n, c.edges)
  let extra = 0
  const left = odd.slice()
  while (left.length) {
    let bi = 0, bj = 1
    for (let i = 0; i < left.length; i++) for (let j = i + 1; j < left.length; j++) if (d[left[i]][left[j]] < d[left[bi]][left[bj]]) { bi = i; bj = j }
    extra += d[left[bi]][left[bj]]
    left.splice(bj, 1); left.splice(bi, 1)
  }
  return c.edges.reduce((s, e) => s + e.w, 0) + extra
}

// ── Telegraph: greedy Steiner / nearest-neighbour chain ─────────────────────────
function seaGreedy(net: TN.Net): number {
  // Start from the cities alone and from every island; flip one island at a time while it helps.
  const n = net.nodes.length
  const islands = net.required.map((r, i) => (r ? -1 : i)).filter(i => i >= 0)
  const cost = (use: boolean[]) => TN.mst(n, net.links, use).cost
  let best = Infinity
  for (const startAll of [false, true]) {
    let use = net.required.map(r => r || startAll), c = cost(use)
    for (let improved = true; improved;) {
      improved = false
      for (const i of islands) {
        const u2 = use.slice(); u2[i] = !u2[i]
        const c2 = cost(u2); if (c2 < c) { use = u2; c = c2; improved = true }
      }
    }
    best = Math.min(best, c)
  }
  return best
}
function chainLocal(net: TN.Net): number {
  const n = net.nodes.length
  const w = Array.from({ length: n }, () => new Array(n).fill(Infinity))
  for (const l of net.links) { w[l.u][l.v] = l.cost; w[l.v][l.u] = l.cost }
  // Left to right by x is the obvious first line; then 2-opt.
  let cur = net.nodes.map((_, i) => i).sort((p, q) => net.nodes[p].x - net.nodes[q].x)
  const len = (t: number[]) => t.slice(1).reduce((s, v, k) => s + w[t[k]][v], 0)
  let cl = len(cur)
  for (let improved = true; improved;) {
    improved = false
    for (let i = 1; i < n - 1 && !improved; i++) for (let j = i + 1; j < n - 1 && !improved; j++) {
      const t2 = [...cur.slice(0, i), ...cur.slice(i, j + 1).reverse(), ...cur.slice(j + 1)]
      const l2 = len(t2); if (l2 < cl) { cur = t2; cl = l2; improved = true }
    }
    // Move one relay office to another place in the line.
    for (let i = 1; i < n - 1 && !improved; i++) for (let j = 1; j < n - 1 && !improved; j++) {
      if (i === j) continue
      const t = cur.slice(1, -1); const [x] = t.splice(i - 1, 1); t.splice(j - 1, 0, x)
      const t2 = [cur[0], ...t, cur[n - 1]]; const l2 = len(t2); if (l2 < cl) { cur = t2; cl = l2; improved = true }
    }
  }
  return cl
}

describe('balance: a careful casual player wins often at D1 and fairly often at D4', () => {
  it('post route — local search with three restarts', () => {
    for (const id of PR.CONFIG_IDS) {
      const rates = DIFFS.map(d => rate(SEEDS.map(s => {
        const r = PR.makeRoute(id, PR.CONFIGS[id], d, s)
        return postHeuristic(r, 3, s) <= PR.budgetFor(r, d)
      })))
      expect(rates[0], id).toBeGreaterThanOrEqual(0.8)
      expect(rates[3], id).toBeGreaterThanOrEqual(0.35)
    }
  }, 120_000)

  it('assembly — hand heuristics within the runs allowed', () => {
    for (const id of AS.CONFIG_IDS) {
      const rates = DIFFS.map(d => rate(SEEDS.map(s => {
        const L = AS.makeLevel(id, AS.CONFIGS[id].mode, d, s)
        const rng = mulberry32(s)
        if (L.kind === 'wedgwood') return wedgwoodTries(L).slice(0, AS.mistakesFor(d)).some(x => x <= L.target)
        if (L.kind === 'jacquard') return greedyHoles(L) <= L.target
        if (L.kind === 'arsenal') return Math.min(...[0, 1, 2].map(() => greedyLine(L, rng))) <= L.target
        return fordLocal(L) <= L.target
      })))
      expect(rates[0], id).toBeGreaterThanOrEqual(0.8)
      expect(rates[3], id).toBeGreaterThanOrEqual(0.35)
    }
  }, 120_000)

  it('königsberg postman — greedy pairing of odd corners', () => {
    for (const id of KB.CONFIG_IDS.filter(i => KB.CONFIGS[i].mode === 'postman')) {
      const rates = DIFFS.map(d => rate(SEEDS.map(s => {
        const c = KB.makeCity(id, KB.CONFIGS[id], d, s)
        return postmanGreedy(c) <= Math.ceil(c.optimum * (1 + KB.slackFor(d)))
      })))
      expect(rates[0], id).toBeGreaterThanOrEqual(0.8)
      expect(rates[3], id).toBeGreaterThanOrEqual(0.35)
    }
  }, 120_000)

  it('telegraph — MST tries and a left-to-right chain polished by 2-opt', () => {
    for (const id of TN.CONFIG_IDS) {
      const mode = TN.CONFIGS[id].mode
      if (mode === 'mst' || mode === 'semaphore') continue
      const rates = DIFFS.map(d => rate(SEEDS.map(s => {
        const net = TN.makeNet(id, TN.CONFIGS[id], d, s)
        return (mode === 'sea' ? seaGreedy(net) : chainLocal(net)) <= TN.budgetFor(net, d)
      })))
      expect(rates[0], id).toBeGreaterThanOrEqual(0.8)
      expect(rates[3], id).toBeGreaterThanOrEqual(0.35)
    }
  }, 120_000)

  it('orbits — the hard tiers leave a findable patch of winning settings, not a needle', () => {
    for (const kind of ['kepler', 'slingshot'] as const) for (const d of [3, 4] as Difficulty[]) for (const seed of [1, 2, 3, 7, 42]) {
      const L = OR.generate(kind, d, seed)
      expect(OR.solve(L).length, `${kind} d${d} s${seed}`).toBeGreaterThanOrEqual(3)
    }
  }, 120_000)

  it('wall builder — a lookahead builder that sees the preview finishes most D4 walls', () => {
    const evalState = (plan: WB.Plan, s: WB.WallState) => {
      const h = WB.columnHeights(plan.site, s.grid)
      let bump = 0
      for (let i = 1; i < h.length; i++) bump += Math.abs(h[i] - h[i - 1])
      return WB.flawsOf(s) * 100 + bump
    }
    const score = (plan: WB.Plan, x: WB.WallState, depth: number): number => {
      const k = WB.statusOf(plan, x)
      if (k.kind === 'won') return -1000
      if (k.kind === 'lost') return 1e6
      if (depth === 0) return evalState(plan, x)
      let best = Infinity
      for (const m of WB.legalMoves(plan, x)) best = Math.min(best, score(plan, WB.applyMove(plan, x, m.rot, m.col)!, depth - 1))
      return best === Infinity ? evalState(plan, x) + 50 : best
    }
    const play = (plan: WB.Plan) => {
      let s = plan.start
      const depth = Math.min(2, plan.preview)
      for (let guard = 0; guard < 60; guard++) {
        const st = WB.statusOf(plan, s)
        if (st.kind !== 'playing') return st.kind === 'won'
        let best: WB.WallState | null = null, bs = Infinity
        for (const m of WB.legalMoves(plan, s)) { const y = WB.applyMove(plan, s, m.rot, m.col)!; const v = score(plan, y, depth); if (v < bs) { bs = v; best = y } }
        const rej = WB.rejectStone(plan, s)
        if (rej && (best === null || WB.flawsOf(best) > WB.flawsOf(s)) && (best === null || score(plan, rej, depth) <= bs)) best = rej
        if (!best) return false
        s = best
      }
      return false
    }
    const rates = WB.CONFIG_IDS.map(id => rate(Array.from({ length: 10 }, (_, k) => play(WB.planWall(id, 4, 13 * (k + 1))))))
    rates.forEach((r, k) => expect(r, WB.CONFIG_IDS[k]).toBeGreaterThanOrEqual(0.2))
    expect(rates.reduce((a, b) => a + b, 0) / rates.length).toBeGreaterThanOrEqual(0.45)
  }, 120_000)
})
