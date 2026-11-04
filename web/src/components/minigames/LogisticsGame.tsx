import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Supply Lines — march an army along a route graph and arrive with enough
// men.  You plan before you march: the route (tap towns in order), how many
// carts to bring (slider) and where to stock depots (tap towns in depot
// mode).  Then the march plays out day by day and a Minard-style band chart
// shows the army shrinking.
//
// The rule, the same for every campaign:
//   • every 1,000 men eat 1 ration a day; each soldier also carries a few
//     days of rations in his pack;
//   • a cart carries `cartCap` rations but its draught animals eat `fodder`
//     a day whether it is full or empty — the logistics "rocket equation":
//     a cart alone can travel only cartCap / fodder days, and every extra
//     cart also feeds the other carts;
//   • a long baggage train is slow: a leg of d days takes
//     ceil(d · (1 + carts / laneCap)) days;
//   • foraging on a leg adds its forage per day, but a road you have already
//     stripped gives nothing the second time;
//   • at a stocked depot the carts and packs are refilled from its stock;
//   • rations short: the men eat first, then the animals; every ration short
//     costs 150 men, every fodder ration short kills a cart team;
//   • every day some men fall sick (more in cold and heat).
// Carts and depots come out of one supply budget.
//
// Campaigns (each a different rule twist, not just a bigger map):
//   napoleon-1812   march to Moscow AND back; the Russians burn the roads
//                   (no forage), the outbound road is stripped on the way
//                   home, and winter after day W makes everything costlier.
//   hannibal-alps   elephants eat 2 rations each and must arrive; the Alpine
//                   passes close with snow on day P — a slow train is caught.
//   alexander-gedrosia  depots are fleet rendezvous on the coast only, free
//                   but timed: the fleet reaches each bay on its own day and
//                   waits 3 days; the inland desert is short but scorching.
//   redball-1944    trucks burn fuel and nothing can be foraged; a fuel dump
//                   costs more the farther it is (the trucks drive there and
//                   back), and after the deadline the front stalls.
//   zhuge-liang     wooden ox carts need no fodder, but the plank roads of
//                   Shu carry only a few carts — the rest are left behind
//                   with their loads.
//
//   D1  3–4 legs (≈1 min)        D2  4–5 legs (≈1.5 min)
//   D3  5–6 legs (≈2–2.5 min)    D4  6–7 legs (≈3 min); target share rises.
//
// Every instance is generated from the seed and checked by `solve`, an
// exhaustive planner over routes × carts × depot sets; the target is a share
// of the best plan, and generation rejects maps where doing nothing, a
// forage-only march or "all carts, no depots" would reach it at D3–D4.

export type Mode = 'napoleon' | 'hannibal' | 'alexander' | 'redball' | 'zhuge'

interface LogisticsConfig {
  title: string
  rule: string
  intro: string
  fact: string
  mode: Mode
  menLabel: string
  foodLabel: string
  cartLabel: string
  depotLabel: string
  cartCap: number
  fodder: number
  laneCap: number
  cartCost: number
  depotCost: number
  depotStock: number
  pack: number
  /** [start, goal, ...waypoints]. */
  names: string[]
  /** Names for the special towns: Alpine passes, inland desert wells. */
  alt?: string[]
  land: string
  road: string
}

export const CONFIGS: Record<string, LogisticsConfig> = {
  'napoleon-1812': {
    title: 'The Road to Moscow, 1812',
    rule: 'There and back · scorched earth · winter',
    intro: 'Take the Grande Armée to Moscow and bring it home. The Russians burn the roads ahead, the road you came by is stripped bare, and winter sets in on the day shown.',
    fact: 'About 450,000 men crossed the Niemen in June 1812; fewer than 20,000 of the main army crossed back in December. Charles Minard’s 1869 chart draws the army as a band whose width is its strength, shrinking towards Moscow and to a thread on the winter retreat.',
    mode: 'napoleon', menLabel: 'men', foodLabel: 'rations', cartLabel: 'wagons', depotLabel: 'magazine',
    cartCap: 30, fodder: 1, laneCap: 30, cartCost: 1, depotCost: 5, depotStock: 70, pack: 4,
    names: ['Kovno', 'Moscow', 'Vilna', 'Vitebsk', 'Smolensk', 'Minsk', 'Polotsk', 'Mogilev', 'Orsha', 'Vyazma', 'Borodino', 'Kaluga', 'Krasnoi', 'Dorogobuzh'],
    land: '#e8e1cf', road: '#8a6a3a',
  },
  'hannibal-alps': {
    title: 'Hannibal Crosses the Alps',
    rule: 'Elephants must arrive · passes close with snow',
    intro: 'Bring the army and its elephants over the Alps into Italy. Each elephant eats like 2,000 men. The passes close with snow on the day shown — a slow baggage train is caught on the ice.',
    fact: 'In autumn 218 BC Hannibal crossed the Alps with about 38,000 infantry, 8,000 cavalry and 37 elephants. Snow had already fallen on the pass; Polybius says he reached Italy with about 26,000 men, and nearly all the elephants died soon after.',
    mode: 'hannibal', menLabel: 'men', foodLabel: 'rations', cartLabel: 'mules', depotLabel: 'Gallic ally',
    cartCap: 24, fodder: 1, laneCap: 24, cartCost: 1, depotCost: 5, depotStock: 90, pack: 3,
    names: ['Rhône ford', 'Taurini', 'Allobroges', 'Isère', 'Durance', 'Drac', 'Cularo', 'Vienna', 'Arausio', 'Ocelum', 'Susa'],
    alt: ['Col de Clapier', 'Mont Cenis', 'Little St Bernard', 'Traversette', 'Montgenèvre'],
    land: '#e6e4d6', road: '#7b6a4a',
  },
  'alexander-gedrosia': {
    title: 'The Gedrosian Desert',
    rule: 'Fleet depots on the coast only, on the fleet’s day',
    intro: 'March from the Indus to Pura. Nearchus’ fleet carries the grain along the coast: pick bays to meet it. It reaches each bay on its own day and waits 3 days. The inland desert is short but scorching.',
    fact: 'In 325 BC Alexander led his army west through the Gedrosian desert while Nearchus sailed the fleet along the coast. The two lost contact; Arrian says the sixty-day march killed more men than all his battles in Asia.',
    mode: 'alexander', menLabel: 'men', foodLabel: 'rations', cartLabel: 'pack camels', depotLabel: 'fleet bay',
    cartCap: 18, fodder: 1, laneCap: 24, cartCost: 1, depotCost: 0, depotStock: 70, pack: 3,
    names: ['Patala', 'Pura', 'Arabis', 'Oreitae', 'Ormara', 'Pasni', 'Gwadar', 'Jask'],
    alt: ['Awaran', 'Kolwa', 'Kech', 'Turbat', 'Bampur'],
    land: '#efe2c2', road: '#9a6b36',
  },
  'redball-1944': {
    title: 'The Red Ball Express',
    rule: 'Trucks burn fuel · dumps cost more far away · deadline',
    intro: 'Get Patton’s tanks to the Moselle before the front stalls. Trucks burn fuel there and back; a fuel dump costs more the farther up the road it is. Fuel cannot be foraged.',
    fact: 'From 25 August to 16 November 1944 the Red Ball Express ran up to 5,958 trucks a day on one-way roads from Normandy, carrying about 412,000 tons. The trucks burned some 300,000 gallons a day themselves, and Patton’s Third Army still ran dry near the Moselle.',
    mode: 'redball', menLabel: 'tanks', foodLabel: 'fuel', cartLabel: 'trucks', depotLabel: 'fuel dump',
    cartCap: 20, fodder: 1, laneCap: 40, cartCost: 1, depotCost: 2, depotStock: 70, pack: 2,
    names: ['Cherbourg', 'Metz', 'St-Lô', 'Alençon', 'Le Mans', 'Chartres', 'Dreux', 'Paris', 'Sommesous', 'Reims', 'Verdun', 'Nancy'],
    land: '#e3e3d6', road: '#6b6b5a',
  },
  'zhuge-liang': {
    title: 'Wooden Oxen on the Shu Roads',
    rule: 'No fodder · plank roads carry only a few carts',
    intro: 'Bring Zhuge Liang’s army from Hanzhong to the Wei. His wooden ox carts eat nothing, but the plank roads hung on the cliffs carry only a few carts: the rest are left behind with their grain. Stock depots past the gorges.',
    fact: 'Zhuge Liang’s northern campaigns from Shu (228–234) kept failing for want of grain carried over the mountains. The Records of the Three Kingdoms say he invented the “wooden ox and gliding horse” carts in 231–234 to haul supplies along the plank roads.',
    mode: 'zhuge', menLabel: 'men', foodLabel: 'grain', cartLabel: 'wooden oxen', depotLabel: 'granary',
    cartCap: 10, fodder: 0, laneCap: 30, cartCost: 1, depotCost: 6, depotStock: 70, pack: 3,
    names: ['Hanzhong', 'Wuzhang Plains', 'Yangping', 'Baoye', 'Xie Valley', 'Qishan', 'Jieting', 'Chencang', 'Mei', 'Ziwu', 'Tianshui', 'Wudu'],
    land: '#e0e6d2', road: '#6a5a3a',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ─────────────────────────────────────────────────────────────────────

export type EdgeKind = 'road' | 'burnt' | 'pass' | 'desert' | 'coast' | 'plank'

export interface MapNode {
  name: string
  layer: number
  /** 0 = top row … 1 = bottom row, for the map. */
  row: number
  depot: boolean
  /** Alexander: the day the fleet reaches this bay. */
  fleetDay: number | null
  /** Red Ball: base days from the start (sets the dump's cost). */
  dist: number
}

export interface MapEdge { a: number; b: number; days: number; forage: number; kind: EdgeKind }

export interface Plan { route: number[]; carts: number; depots: number[] }

export interface Instance {
  configId: string
  mode: Mode
  difficulty: Difficulty
  nodes: MapNode[]
  edges: MapEdge[]
  start: number
  goal: number
  roundTrip: boolean
  men0: number
  ele0: number
  eleEat: number
  cartCap: number
  fodder: number
  laneCap: number
  cartCost: number
  depotCost: number
  depotStock: number
  pack: number
  budget: number
  maxCarts: number
  maxDepots: number
  winterDay: number | null
  passClose: number | null
  deadline: number | null
  plankWidth: number
  fleetWait: number
  target: number
  eleTarget: number
  best: Plan
  bestMen: number
}

export interface DayLog { day: number; men: number; ele: number; food: number; carts: number; leg: number; returning: boolean; event?: string }

export interface SimResult {
  valid: boolean
  reason: string
  men: number
  ele: number
  day: number
  log: DayLog[]
  won: boolean
}

export const STARVE = 0.15
/** Share of the elephants short of fodder that die that day. */
export const ELE_STARVE = 0.3
const BASE_SICK = 0.003

export function edgeBetween(inst: Pick<Instance, 'edges'>, a: number, b: number): MapEdge | undefined {
  return inst.edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a))
}

export function legDays(inst: Pick<Instance, 'laneCap'>, e: MapEdge, carts: number): number {
  return Math.ceil(e.days * (1 + carts / inst.laneCap) - 1e-6)
}

export function depotCostAt(inst: Pick<Instance, 'mode' | 'depotCost' | 'nodes'>, n: number): number {
  return inst.mode === 'redball' ? inst.depotCost + inst.nodes[n].dist : inst.depotCost
}

export function planCost(inst: Instance, plan: Plan): number {
  return plan.carts * inst.cartCost + plan.depots.reduce((s, n) => s + depotCostAt(inst, n), 0)
}

export function routeComplete(inst: Pick<Instance, 'start' | 'goal' | 'roundTrip'>, route: number[]): boolean {
  if (inst.roundTrip) return route.length > 2 && route.includes(inst.goal) && route[route.length - 1] === inst.start
  return route[route.length - 1] === inst.goal
}

/** Towns the route may go to next: forward one layer, or back one after Moscow. */
export function nextOptions(inst: Instance, route: number[]): number[] {
  if (!route.length || routeComplete(inst, route)) return []
  const cur = route[route.length - 1]
  const back = inst.roundTrip && route.includes(inst.goal)
  const want = inst.nodes[cur].layer + (back ? -1 : 1)
  return inst.edges
    .filter(e => e.a === cur || e.b === cur)
    .map(e => (e.a === cur ? e.b : e.a))
    .filter(n => inst.nodes[n].layer === want)
    .sort((x, y) => x - y)
}

export function emptyPlan(inst: Instance): Plan {
  return { route: [inst.start], carts: 0, depots: [] }
}

export function validate(inst: Instance, plan: Plan): string {
  const { route } = plan
  if (route[0] !== inst.start) return 'The march must begin at the start'
  for (let i = 1; i < route.length; i++) {
    if (!nextOptions(inst, route.slice(0, i)).includes(route[i])) return 'The route is broken'
  }
  if (!routeComplete(inst, route)) return inst.roundTrip ? 'Plan the road to Moscow and back' : 'The route does not reach the goal'
  if (plan.carts < 0 || plan.carts > inst.maxCarts || !Number.isInteger(plan.carts)) return 'Too many carts'
  if (plan.depots.length > inst.maxDepots) return 'Too many depots'
  if (new Set(plan.depots).size !== plan.depots.length) return 'Duplicate depot'
  for (const d of plan.depots) if (!inst.nodes[d].depot || !route.includes(d) || d === inst.start) return 'A depot is off the route'
  if (planCost(inst, plan) > inst.budget) return 'Over the supply budget'
  return ''
}

export function simulate(inst: Instance, plan: Plan): SimResult {
  const why = validate(inst, plan)
  if (why) return { valid: false, reason: why, men: 0, ele: 0, day: 0, log: [], won: false }
  const { route } = plan
  let men = inst.men0, ele = inst.ele0, carts = plan.carts, day = 0
  const capOf = () => carts * inst.cartCap + men * inst.pack
  let food = capOf()
  const stock = new Map<number, number>(plan.depots.map(d => [d, inst.depotStock]))
  const used = new Set<MapEdge>()
  const goalIdx = route.indexOf(inst.goal)
  const log: DayLog[] = [{ day: 0, men, ele, food, carts, leg: 0, returning: false }]

  const live = (leg: number, returning: boolean, e: MapEdge | null, forage: number, event?: string) => {
    day++
    let mult = 1, sick = BASE_SICK
    if (e?.kind === 'pass') { mult *= 1.3; sick += 0.008 }
    if (e?.kind === 'desert') { mult *= 1.4; sick += 0.012 }
    if (inst.winterDay !== null && day > inst.winterDay) { mult *= 1.5; sick += 0.015 }
    if (inst.deadline !== null && day > inst.deadline) sick += 0.04
    let avail = food + forage
    const menNeed = men * mult
    if (avail >= menNeed) avail -= menNeed
    else { men -= (menNeed - avail) / mult * STARVE; avail = 0 }
    const eleNeed = ele * inst.eleEat * mult
    if (avail >= eleNeed) avail -= eleNeed
    else { ele -= (eleNeed - avail) / (inst.eleEat * mult) * ELE_STARVE; avail = 0 }
    const cartNeed = carts * inst.fodder * mult
    if (avail >= cartNeed) avail -= cartNeed
    else { carts -= Math.ceil((cartNeed - avail) / (inst.fodder * mult) - 1e-9); avail = 0 }
    men = Math.max(0, men * (1 - sick))
    ele = Math.max(0, ele); carts = Math.max(0, carts)
    food = Math.min(avail, capOf())
    log.push({ day, men, ele, food, carts, leg, returning, event })
  }

  for (let i = 0; i + 1 < route.length; i++) {
    const e = edgeBetween(inst, route[i], route[i + 1])!
    const returning = goalIdx >= 0 && inst.roundTrip && i >= goalIdx
    let event: string | undefined
    if (e.kind === 'plank' && carts > inst.plankWidth) {
      food = Math.max(0, food - (carts - inst.plankWidth) * inst.cartCap)
      event = `${carts - inst.plankWidth} carts left at the gorge`
      carts = inst.plankWidth
      food = Math.min(food, capOf())
    }
    if (e.kind === 'pass' && inst.passClose !== null && day >= inst.passClose) {
      men *= 0.7
      ele *= 0.4
      event = 'Snow on the pass'
    }
    const len = legDays(inst, e, carts)
    const forage = used.has(e) || e.kind === 'burnt' ? 0 : e.forage
    for (let k = 0; k < len; k++) live(i, returning, e, forage, k === 0 ? event : undefined)
    used.add(e)
    const at = route[i + 1]
    if (stock.has(at) && (stock.get(at) ?? 0) > 0) {
      const fd = inst.nodes[at].fleetDay
      if (fd !== null) while (day < fd) live(i, returning, null, 0, 'Waiting for the fleet')
      if (fd === null || day <= fd + inst.fleetWait) {
        const take = Math.min(stock.get(at)!, Math.max(0, capOf() - food))
        food += take
        stock.set(at, stock.get(at)! - take)
        log[log.length - 1] = { ...log[log.length - 1], food, event: `Resupplied at ${inst.nodes[at].name}` }
      } else {
        log[log.length - 1] = { ...log[log.length - 1], event: 'The fleet has sailed' }
      }
    }
  }
  const won = men >= inst.target - 1e-9 && Math.floor(ele + 1e-9) >= inst.eleTarget
  return { valid: true, reason: won ? '' : 'Too few arrived', men, ele, day, log, won }
}

/** Every route the rules allow (outbound, and back for a round trip). */
export function allRoutes(inst: Instance): number[][] {
  const out: number[][] = []
  const walk = (r: number[]) => {
    if (routeComplete(inst, r)) { out.push(r); return }
    for (const n of nextOptions(inst, r)) walk([...r, n])
  }
  walk([inst.start])
  return out
}

function subsets(items: number[], k: number): number[][] {
  const res: number[][] = [[]]
  const rec = (from: number, cur: number[]) => {
    for (let i = from; i < items.length; i++) {
      const next = [...cur, items[i]]
      res.push(next)
      if (next.length < k) rec(i + 1, next)
    }
  }
  if (k > 0) rec(0, [])
  return res
}

const score = (r: SimResult) => r.men + 3 * r.ele

/** Exhaustive planner: the plan that brings the most men (and elephants) home. */
export function solve(inst: Instance, opts: { carts?: number[]; depots?: boolean; routes?: number[][] } = {}): { plan: Plan; res: SimResult } {
  let best: { plan: Plan; res: SimResult } | null = null
  const routes = opts.routes ?? allRoutes(inst)
  const cartList = opts.carts ?? Array.from({ length: inst.maxCarts + 1 }, (_, i) => i)
  for (const route of routes) {
    const cands = [...new Set(route)].filter(n => n !== inst.start && inst.nodes[n].depot)
    const sets = opts.depots === false ? [[]] : subsets(cands, inst.maxDepots)
    for (const depots of sets) {
      const dc = depots.reduce((s, n) => s + depotCostAt(inst, n), 0)
      for (const carts of cartList) {
        if (carts * inst.cartCost + dc > inst.budget) continue
        const plan = { route, carts, depots }
        const res = simulate(inst, plan)
        if (!best || score(res) > score(best.res) + 1e-9) best = { plan, res }
      }
    }
  }
  return best!
}

export function routeDays(inst: Pick<Instance, 'edges'>, r: number[]): number {
  return r.slice(1).reduce((s, n, i) => s + edgeBetween(inst, r[i], n)!.days, 0)
}

/** Shortest route by base days. */
export function shortestRoute(inst: Instance): number[] {
  return allRoutes(inst).reduce((a, b) => (routeDays(inst, b) < routeDays(inst, a) ? b : a))
}

/** The naive plans that must fail at D3–D4. */
export function naivePlans(inst: Instance): Record<string, Plan> {
  const sr = shortestRoute(inst)
  const allIn = Math.min(inst.maxCarts, Math.floor(inst.budget / inst.cartCost))
  return {
    nothing: { route: sr, carts: 0, depots: [] },
    allCartsShortest: { route: sr, carts: allIn, depots: [] },
    forageOnly: solve(inst, { carts: [0], depots: false }).plan,
    allCartsNoDepots: solve(inst, { carts: [allIn], depots: false }).plan,
  }
}

// ── Generation ────────────────────────────────────────────────────────────────

const TARGET_SHARE: Record<Difficulty, number> = { 1: 0.72, 2: 0.8, 3: 0.86, 4: 0.9 }

function buildMap(mode: Mode, d: Difficulty, rng: Rng) {
  const mids = mode === 'napoleon' ? scale(d, [2, 2, 3, 3]) : scale(d, [2, 3, 4, 5])
  const layers: number[][] = []
  const nodes: MapNode[] = []
  const add = (layer: number, row: number) => {
    nodes.push({ name: '', layer, row, depot: true, fleetDay: null, dist: 0 })
    return nodes.length - 1
  }
  layers.push([add(0, 0.5)])
  for (let l = 1; l <= mids; l++) {
    const width = mode === 'alexander' ? 2 : rng() < (d >= 3 ? 0.35 : 0.2) ? 3 : 2
    const row: number[] = []
    for (let k = 0; k < width; k++) row.push(add(l, width === 2 ? (k === 0 ? 0.15 : 0.85) : k * 0.42 + 0.08))
    layers.push(row)
  }
  layers.push([add(mids + 1, 0.5)])
  const edges: MapEdge[] = []
  for (let l = 0; l + 1 < layers.length; l++) {
    const A = layers[l], B = layers[l + 1]
    const pairs: [number, number][] = []
    for (const a of A) for (const b of B) pairs.push([a, b])
    for (const [a, b] of pairs) {
      const near = Math.abs(nodes[a].row - nodes[b].row) < 0.5
      if (A.length === 1 || B.length === 1 || near || rng() < 0.3) edges.push({ a, b, days: 0, forage: 0, kind: 'road' })
    }
    // Every node needs a way on and a way in.
    for (const a of A) if (!edges.some(e => e.a === a)) edges.push({ a, b: B[0], days: 0, forage: 0, kind: 'road' })
    for (const b of B) if (!edges.some(e => e.b === b)) edges.push({ a: A[0], b, days: 0, forage: 0, kind: 'road' })
  }
  const start = layers[0][0], goal = layers[layers.length - 1][0]
  return { nodes, edges, layers, start, goal, mids }
}

function decorate(mode: Mode, cfg: LogisticsConfig, rng: Rng, m: ReturnType<typeof buildMap>) {
  const { nodes, edges, layers, mids } = m
  const passLayer = Math.max(1, Math.ceil(mids / 2))
  for (const e of edges) {
    e.days = randInt(rng, 2, 4)
    e.forage = randInt(rng, 2, 9)
    const la = nodes[e.a].layer
    if (mode === 'napoleon' && la >= 1 && rng() < 0.55) e.kind = 'burnt'
    if (mode === 'hannibal' && la === passLayer) { e.kind = 'pass'; e.days = randInt(rng, 2, 5); e.forage = 0 }
    if (mode === 'hannibal' && la > passLayer) e.forage = randInt(rng, 6, 12)
    if (mode === 'alexander') {
      const coastal = nodes[e.a].row < 0.5 && nodes[e.b].row < 0.5
      const inland = nodes[e.a].row > 0.5 && nodes[e.b].row > 0.5
      if (coastal) { e.kind = 'coast'; e.days = randInt(rng, 3, 5); e.forage = randInt(rng, 2, 5) }
      else if (inland) { e.kind = 'desert'; e.days = randInt(rng, 2, 3); e.forage = 0 }
      else { e.kind = 'desert'; e.days = randInt(rng, 2, 4); e.forage = randInt(rng, 0, 2) }
    }
    if (mode === 'redball') { e.forage = 0; e.days = randInt(rng, 1, 3) }
    if (mode === 'zhuge') {
      e.forage = randInt(rng, 0, 5)
      if (la >= 1 && la < mids && rng() < 0.6) { e.kind = 'plank'; e.days = randInt(rng, 2, 4); e.forage = 0 }
    }
  }
  if (mode === 'zhuge' && !edges.some(e => e.kind === 'plank')) {
    for (const e of edges) if (nodes[e.a].layer === Math.max(1, mids - 1)) { e.kind = 'plank'; e.forage = 0 }
  }
  // Base distance from the start (for Red Ball dump costs and fleet days).
  for (const layer of layers) for (const n of layer) {
    const ins = edges.filter(e => e.b === n)
    nodes[n].dist = ins.length ? Math.min(...ins.map(e => nodes[e.a].dist + e.days)) : 0
  }
  nodes.forEach((n, i) => {
    if (i === m.start) n.depot = false
    if (i === m.goal) n.depot = false
    if (mode === 'hannibal') n.depot = n.layer >= 1 && n.layer <= passLayer
    if (mode === 'alexander') {
      n.depot = n.row < 0.5 && i !== m.start && i !== m.goal
      if (n.depot) n.fleetDay = Math.round(n.dist * (1.1 + rng() * 0.6)) + randInt(rng, 0, 3)
    }
  })
  // Names: the special towns (Alpine passes, desert wells) from `alt`.
  const special = (n: MapNode) => (mode === 'hannibal' && n.layer === passLayer + 1) || (mode === 'alexander' && n.row > 0.5)
  let k = 0, j = 0
  nodes.forEach((n, i) => {
    if (i === m.start) n.name = cfg.names[0]
    else if (i === m.goal) n.name = cfg.names[1]
    else if (cfg.alt && special(n)) n.name = cfg.alt[j++ % cfg.alt.length]
    else n.name = cfg.names[2 + (k++ % (cfg.names.length - 2))]
  })
  return passLayer
}

export function makeInstance(configId: string, difficulty: Difficulty, seed: number): Instance {
  const id = CONFIGS[configId] ? configId : 'napoleon-1812'
  const cfg = CONFIGS[id]
  const mode = cfg.mode
  const rng = mulberry32(hashString(`logistics:${id}:${difficulty}:${seed}`))
  let fallback: Instance | null = null
  for (let attempt = 0; attempt < 40; attempt++) {
    const m = buildMap(mode, difficulty, rng)
    const passLayer = decorate(mode, cfg, rng, m)
    const men0 = scale(difficulty, [10, 12, 14, 16]) + randInt(rng, 0, 4)
    const base: Instance = {
      configId: id, mode, difficulty,
      nodes: m.nodes, edges: m.edges, start: m.start, goal: m.goal,
      roundTrip: mode === 'napoleon',
      men0,
      ele0: mode === 'hannibal' ? scale(difficulty, [4, 5, 6, 7]) : 0,
      eleEat: 2,
      cartCap: cfg.cartCap, fodder: cfg.fodder, laneCap: cfg.laneCap,
      cartCost: cfg.cartCost, depotCost: cfg.depotCost, depotStock: cfg.depotStock, pack: cfg.pack,
      budget: 0, maxCarts: 0,
      maxDepots: mode === 'alexander' ? scale(difficulty, [2, 2, 3, 3]) : scale(difficulty, [1, 2, 2, 2]),
      winterDay: null, passClose: null, deadline: null,
      plankWidth: mode === 'zhuge' ? Math.max(2, Math.round(men0 / 5)) : 99,
      fleetWait: 3,
      target: 0, eleTarget: 0,
      best: { route: [], carts: 0, depots: [] }, bestMen: 0,
    }
    if (allRoutes(base).length > (mode === 'napoleon' ? 30 : 18)) { continue }
    base.budget = Math.round(men0 * (mode === 'zhuge' ? 2.2 : 1.6)) + randInt(rng, 0, 3)
    base.maxCarts = Math.min(36, base.budget)
    const baseDays = routeDays(base, shortestRoute(base))
    if (mode === 'napoleon') base.winterDay = Math.round(baseDays * scale(difficulty, [0.8, 0.75, 0.7, 0.65]))
    if (mode === 'hannibal') {
      const passStart = Math.min(...m.nodes.filter(n => n.layer === passLayer).map(n => n.dist))
      base.passClose = Math.round(passStart * 1.25) + scale(difficulty, [3, 2, 2, 1])
    }
    if (mode === 'redball') base.deadline = Math.round(baseDays * 1.25) + scale(difficulty, [3, 2, 1, 1])
    const sol = solve(base)
    if (sol.res.men < men0 * (mode === 'napoleon' ? 0.4 : mode === 'alexander' ? 0.45 : 0.55)) { continue }
    const share = TARGET_SHARE[difficulty]
    const inst: Instance = {
      ...base,
      target: Math.floor(sol.res.men * share * 10) / 10,
      eleTarget: mode === 'hannibal' ? Math.max(1, Math.floor(sol.res.ele * share + 1e-9)) : 0,
      best: sol.plan, bestMen: sol.res.men,
    }
    if (!simulate(inst, sol.plan).won) { continue }
    const naive = naivePlans(inst)
    const strict = difficulty >= 3
    const beats = Object.entries(naive).filter(([k, p]) => (strict || k === 'nothing') && simulate(inst, p).won)
    if (beats.length) { if (!fallback && !strict) fallback = inst; continue }
    return inst
  }
  if (fallback) return fallback
  throw new Error(`logistics: no instance for ${id} d${difficulty} s${seed}`)
}

// ── Component ─────────────────────────────────────────────────────────────────

const MAP_W = 340, MAP_H = 200
const EDGE_STYLE: Record<EdgeKind, { stroke: string; dash?: string; label: string }> = {
  road: { stroke: '#8a6a3a', label: 'road' },
  burnt: { stroke: '#b23a2a', dash: '4 3', label: 'burnt — no forage' },
  pass: { stroke: '#5b7fa8', dash: '2 2', label: 'Alpine pass ×1.3' },
  desert: { stroke: '#d08a2a', label: 'desert heat ×1.4' },
  coast: { stroke: '#3f8f9a', label: 'coast' },
  plank: { stroke: '#5a3b22', dash: '1 2', label: 'plank road' },
}

const fmt = (x: number) => x.toFixed(1)

export default function LogisticsGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'napoleon-1812')
  const inst = useMemo(() => makeInstance(configId, difficulty, seed), [configId, difficulty, seed])
  const [plan, setPlan] = useState<Plan>(() => emptyPlan(inst))
  const [mode, setMode] = useState<'route' | 'depot'>('route')
  const [result, setResult] = useState<SimResult | null>(null)
  const [shown, setShown] = useState(0)
  const [msg, setMsg] = useState('')
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const reported = useRef(false)

  useEffect(() => { setPlan(emptyPlan(inst)); setResult(null); setShown(0); setMsg(''); reported.current = false }, [inst])

  // Play the march one day at a time, then report.
  useEffect(() => {
    if (!result) return
    if (shown < result.log.length - 1) {
      const t = setTimeout(() => setShown(s => s + 1), 140)
      return () => clearTimeout(t)
    }
    if (reported.current) return
    reported.current = true
    if (result.won) win()
    else lose(inst.ele0 && Math.floor(result.ele + 1e-9) < inst.eleTarget ? 'Too few elephants survived' : `Only ${fmt(result.men)}k of the ${fmt(inst.target)}k needed arrived`)
  }, [result, shown, inst, win, lose])

  const marching = result !== null
  const options = marching ? [] : nextOptions(inst, plan.route)
  const cost = planCost(inst, plan)
  const left = inst.budget - cost
  const complete = routeComplete(inst, plan.route)
  const invalid = validate(inst, plan)

  const tapNode = (n: number) => {
    if (marching || settled) return
    setMsg('')
    if (mode === 'route') {
      if (options.includes(n)) setPlan(p => ({ ...p, route: [...p.route, n], depots: p.depots }))
      else setMsg(complete ? 'The route is complete — undo to change it' : 'Pick a highlighted town next on the road')
      return
    }
    if (plan.depots.includes(n)) { setPlan(p => ({ ...p, depots: p.depots.filter(d => d !== n) })); return }
    if (!inst.nodes[n].depot || n === inst.start) { setMsg(`No ${cfg.depotLabel} can be set up there`); return }
    if (!plan.route.includes(n)) { setMsg('Put the town on your route first'); return }
    if (plan.depots.length >= inst.maxDepots) { setMsg(`At most ${inst.maxDepots} ${cfg.depotLabel}s`); return }
    if (depotCostAt(inst, n) > left) { setMsg('Not enough supply budget'); return }
    setPlan(p => ({ ...p, depots: [...p.depots, n] }))
  }

  const undo = () => {
    if (marching || plan.route.length <= 1) return
    const route = plan.route.slice(0, -1)
    setPlan(p => ({ ...p, route, depots: p.depots.filter(d => route.includes(d)) }))
  }

  const setCarts = (c: number) => {
    if (marching) return
    const max = Math.min(inst.maxCarts, Math.floor((inst.budget - (cost - plan.carts * inst.cartCost)) / inst.cartCost))
    setPlan(p => ({ ...p, carts: Math.max(0, Math.min(max, Math.round(c))) }))
  }

  const march = () => {
    if (marching || settled) return
    if (invalid) { setMsg(invalid); return }
    setResult(simulate(inst, plan))
    setShown(0)
  }

  // Forecast (no forage, no weather): the rocket equation in numbers.
  const baseDays = plan.route.slice(1).reduce((s, n, i) => s + edgeBetween(inst, plan.route[i], n)!.days, 0)
  const slowDays = plan.route.slice(1).reduce((s, n, i) => s + legDays(inst, edgeBetween(inst, plan.route[i], n)!, plan.carts), 0)
  const daily = inst.men0 + inst.ele0 * inst.eleEat + plan.carts * inst.fodder
  const carried = plan.carts * inst.cartCap + inst.men0 * inst.pack
  const lasts = carried / daily

  // Map geometry.
  const maxLayer = Math.max(...inst.nodes.map(n => n.layer))
  const px = (n: number) => 22 + (inst.nodes[n].layer / maxLayer) * (MAP_W - 44)
  const py = (n: number) => 26 + inst.nodes[n].row * (MAP_H - 62)
  const routeEdges = new Set(plan.route.slice(1).map((n, i) => edgeBetween(inst, plan.route[i], n)))

  // Where the army is during the march.
  const cur = result ? result.log[Math.min(shown, result.log.length - 1)] : null
  let armyAt: [number, number] = [px(inst.start), py(inst.start)]
  if (result && cur) {
    const legStartDay = result.log.findIndex(l => l.leg === cur.leg && l.day > 0)
    const legLen = result.log.filter(l => l.leg === cur.leg && l.day > 0).length
    const a = plan.route[cur.leg], b = plan.route[cur.leg + 1]
    const t = cur.day === 0 ? 0 : Math.min(1, (cur.day - legStartDay + 1) / Math.max(1, legLen))
    armyAt = [px(a) + (px(b) - px(a)) * t, py(a) + (py(b) - py(a)) * t]
  }

  // Minard band chart.
  const chartLog = result ? result.log.slice(0, shown + 1) : []
  const totalDays = result ? result.log[result.log.length - 1].day : Math.max(1, slowDays)
  const CW = 320, CH = 74
  const cx = (d: number) => 6 + (d / Math.max(1, totalDays)) * (CW - 12)
  const band = (m: number) => (m / inst.men0) * (CH - 22)
  const targetH = band(inst.target)

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-ink-2 text-[10px] font-bold">{cfg.rule}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2" data-testid="lg-men">{fmt(cur ? cur.men : inst.men0)}k {cfg.menLabel}</p>
          <p data-testid="lg-target">Need {fmt(inst.target)}k</p>
          {inst.ele0 > 0 && <p data-testid="lg-ele">🐘 {Math.floor((cur ? cur.ele : inst.ele0) + 1e-9)} / need {inst.eleTarget}</p>}
          <p>Day {cur ? cur.day : 0}</p>
          {inst.winterDay !== null && <p className="text-sky-700">Winter day {inst.winterDay}</p>}
          {inst.passClose !== null && <p className="text-sky-700">Snow day {inst.passClose}</p>}
          {inst.deadline !== null && <p className="text-red-700">Stall day {inst.deadline}</p>}
        </div>
      </div>

      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full max-w-[430px] mx-auto select-none rounded-lg border-2 border-ink-2"
        style={{ touchAction: 'manipulation', background: cfg.land }} data-testid="lg-map">
        {inst.mode === 'alexander' && <rect x={0} y={0} width={MAP_W} height={14} fill="#7fb3c8" opacity={0.6} />}
        {inst.edges.map((e, i) => {
          const st = EDGE_STYLE[e.kind]
          const on = routeEdges.has(e)
          const mx = (px(e.a) + px(e.b)) / 2, my = (py(e.a) + py(e.b)) / 2
          return (
            <g key={i}>
              {on && <line x1={px(e.a)} y1={py(e.a)} x2={px(e.b)} y2={py(e.b)} stroke="#e0b44a" strokeWidth={7} strokeLinecap="round" opacity={0.7} />}
              <line x1={px(e.a)} y1={py(e.a)} x2={px(e.b)} y2={py(e.b)} stroke={st.stroke} strokeWidth={e.kind === 'plank' ? 3 : 2} strokeDasharray={st.dash} />
              <rect x={mx - 15} y={my - 6} width={30} height={11} rx={3} fill="#fbf6ea" opacity={0.9} />
              <text x={mx} y={my + 2} fontSize={7} textAnchor="middle" fill="#2a2117">
                {e.days}d{e.kind === 'burnt' ? ' 🔥' : e.forage ? ` +${e.forage}` : ''}
              </text>
            </g>
          )
        })}
        {inst.nodes.map((n, i) => {
          const isOpt = options.includes(i) && mode === 'route'
          const onRoute = plan.route.includes(i)
          const isDepot = plan.depots.includes(i)
          const canDepot = !marching && mode === 'depot' && n.depot && onRoute
          return (
            <g key={i} data-testid={`node-${i}`} onClick={() => tapNode(i)} style={{ cursor: 'pointer' }}>
              <circle cx={px(i)} cy={py(i)} r={15} fill="transparent" />
              {(isOpt || canDepot) && <circle cx={px(i)} cy={py(i)} r={12} fill="none" stroke={isOpt ? '#9b2c23' : '#2f6f3a'} strokeWidth={1.5} strokeDasharray="3 2" />}
              <circle cx={px(i)} cy={py(i)} r={8} fill={i === inst.goal ? '#9b2c23' : i === inst.start ? '#2a2117' : onRoute ? '#e0b44a' : '#fbf6ea'}
                stroke="#2a2117" strokeWidth={1.2} />
              {isDepot && <rect x={px(i) - 4} y={py(i) - 4} width={8} height={8} fill="#2f6f3a" stroke="#fff" strokeWidth={0.8} />}
              <text x={px(i)} y={py(i) + 17} fontSize={6.5} textAnchor="middle" fill="#2a2117" fontWeight={onRoute ? 'bold' : 'normal'}>{n.name}</text>
              {n.fleetDay !== null && <text x={px(i)} y={py(i) - 11} fontSize={6.5} textAnchor="middle" fill="#1f5f7a">⛵ day {n.fleetDay}</text>}
              {inst.mode === 'redball' && n.depot && <text x={px(i)} y={py(i) - 11} fontSize={6.5} textAnchor="middle" fill="#2f6f3a">dump {depotCostAt(inst, i)}</text>}
            </g>
          )
        })}
        {marching && <circle cx={armyAt[0]} cy={armyAt[1]} r={5} fill="#9b2c23" stroke="#fff" strokeWidth={1.5} data-testid="lg-army" />}
        <text x={MAP_W - 4} y={MAP_H - 4} fontSize={6.5} textAnchor="end" fill="#5a4b36">
          {inst.plankWidth < 99 ? `plank road: ${inst.plankWidth} carts` : '+n = forage a day'}
        </text>
      </svg>

      <p className="text-[11px] text-center min-h-[16px] text-red-600 font-bold" data-testid="lg-msg">{msg}</p>

      {!marching && (
        <div className="flex flex-col gap-2 w-full max-w-[430px] mx-auto">
          <div className="flex gap-2">
            <button type="button" data-testid="mode-route" onClick={() => setMode('route')}
              className={`flex-1 h-10 rounded-lg border text-xs font-bold ${mode === 'route' ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink'}`}>Route</button>
            <button type="button" data-testid="mode-depot" onClick={() => setMode('depot')}
              className={`flex-1 h-10 rounded-lg border text-xs font-bold capitalize ${mode === 'depot' ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink'}`}>
              {cfg.depotLabel}s {plan.depots.length}/{inst.maxDepots}
            </button>
            <button type="button" data-testid="route-undo" onClick={undo} disabled={plan.route.length <= 1}
              className="w-16 h-10 rounded-lg border bg-panel border-line text-ink text-xs font-bold disabled:opacity-40">Undo</button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" data-testid="carts-minus" onClick={() => setCarts(plan.carts - 1)}
              className="w-10 h-10 rounded-lg border bg-panel border-line text-ink font-bold">−</button>
            <input type="range" min={0} max={inst.maxCarts} value={plan.carts} data-testid="carts"
              onChange={e => setCarts(Number(e.target.value))} className="flex-1 accent-[#9b2c23]" aria-label={cfg.cartLabel} />
            <button type="button" data-testid="carts-plus" onClick={() => setCarts(plan.carts + 1)}
              className="w-10 h-10 rounded-lg border bg-panel border-line text-ink font-bold">+</button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-ink-2 tabular-nums bg-panel rounded-lg border border-line p-2" data-testid="lg-forecast">
            <span><b>{plan.carts}</b> {cfg.cartLabel} × {inst.cartCap} {cfg.foodLabel}</span>
            <span>Budget <b className={left < 0 ? 'text-red-600' : ''}>{left}</b> / {inst.budget} left</span>
            <span>Daily need {fmt(daily)}{inst.fodder ? ` (${plan.carts} ${cfg.mode === 'redball' ? 'fuel for trucks' : 'fodder'})` : ''}</span>
            <span>Carried {carried} → ~{fmt(lasts)} days</span>
            <span>March {complete ? `${slowDays} days` : '—'}{complete && slowDays > baseDays ? ` (+${slowDays - baseDays} slow train)` : ''}</span>
            <span>Cart {inst.cartCost} · {cfg.depotLabel} {inst.mode === 'redball' ? '2 + distance' : inst.depotCost}</span>
          </div>
          <button type="button" data-testid="march" onClick={march}
            className={`h-11 rounded-lg font-bold text-sm ${invalid ? 'bg-panel-2 text-muted border border-line' : 'bg-accent text-accent-fg'}`}>
            {invalid && !complete ? (inst.roundTrip && plan.route.includes(inst.goal) ? 'Plan the way home' : 'Plan the route') : 'March!'}
          </button>
        </div>
      )}

      {marching && (
        <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full max-w-[430px] mx-auto rounded-lg border border-line bg-panel" data-testid="lg-chart">
          {chartLog.slice(1).map((l, i) => {
            const prev = chartLog[i]
            const h = band(l.men)
            return <rect key={i} x={cx(prev.day)} width={Math.max(1, cx(l.day) - cx(prev.day))} y={(CH - 12 - h) / 2 + 2} height={h}
              fill={l.returning ? '#2a2117' : '#d9b77a'} />
          })}
          <rect x={CW - 46} y={(CH - 12 - targetH) / 2 + 2} width={40} height={targetH} fill="none" stroke="#9b2c23" strokeDasharray="2 2" />
          <text x={CW - 26} y={CH - 2} fontSize={7} textAnchor="middle" fill="#9b2c23">needed</text>
          <text x={6} y={CH - 2} fontSize={7} fill="#5a4b36">day 0</text>
          <text x={CW / 2} y={CH - 2} fontSize={7} textAnchor="middle" fill="#5a4b36">
            {cur ? `day ${cur.day} · ${fmt(cur.men)}k ${cfg.menLabel} · ${Math.round(cur.food)} ${cfg.foodLabel} · ${cur.carts} ${cfg.cartLabel}` : ''}
          </text>
        </svg>
      )}
      {marching && cur?.event && <p className="text-[11px] text-center text-ink-2 font-bold" data-testid="lg-event">{cur.event}</p>}

      <p className="text-muted/80 text-[10px] text-center">
        {marching ? '' : `Tap towns to plan the road. Each ${cfg.cartLabel.replace(/s$/, '')} carries ${inst.cartCap} ${cfg.foodLabel}${inst.fodder ? ` but eats ${inst.fodder} a day` : ''}; every ${inst.laneCap} ${cfg.cartLabel} add a leg's length again. 1k ${cfg.menLabel} eat 1 a day and carry ${inst.pack} days in their packs.`}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The army got through!" loseTitle="The army melted away" />
    </div>
  )
}
