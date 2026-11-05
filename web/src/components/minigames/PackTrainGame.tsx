import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Pack Train: a turn-based route puzzle that replaced the real-time Caravan
// Trail.  Tap a square next to the caravan to step onto it.  Every step eats
// a day of supplies; pick up every load, then reach the market before the
// supplies run out.  Each route adds its own rule:
//
//   orders    wrong loads lie on the road; crossing one costs 3 supplies
//   wells     wells refill the supplies, but each one only once
//   deadline  each load spoils (or is lost) if not picked up in time
//
//   D1  7×7, 3 loads, generous supplies
//   D2  8×8, 4 loads
//   D3  9×9, 4 loads, tight supplies
//   D4  9×9, 5 loads, no spare day
//
// Every map is solved when it is built: the supplies are the fewest that
// finish the route plus a slack per tier, and on deadline routes each load's
// time is set from a winning route, so every route is proven winnable.

export type TrailVariant = 'orders' | 'wells' | 'deadline'

interface PackTrainConfig {
  title: string
  intro: string
  fact: string
  caravan: string
  market: string
  goods: string[]
  obstacle: string
  ground: string
  variant: TrailVariant
  /** The route's rule in a few words. */
  rule: string
}

export const CONFIGS: Record<string, PackTrainConfig> = {
  'silk-road': {
    title: 'The Silk Road',
    intro: 'Collect the bales on the order slip and bring them to the market. Other bales lie on the road too — crossing one means haggling it off, and that costs 3 days.',
    fact: 'The name "Silk Road" (Seidenstraße) was coined only in 1877 by the German geographer Ferdinand von Richthofen. Bactrian camels, which can carry around 200 kg and drink over 100 litres at once, were the workhorses of its desert legs.',
    caravan: '🐫', market: '🏯', goods: ['🧵', '🍵', '🏺', '💎', '🧶'],
    obstacle: '⛰️', ground: 'bg-[#efe3c2]', variant: 'orders', rule: 'Fill the order',
  },
  'nineveh-tablets': {
    title: 'Tablets for Nineveh',
    intro: 'The king’s letter names the tablets he wants. Pick up every one on the list and carry them home; other tablets lie on the road, and arguing a wrong one off the wagon costs 3 days.',
    fact: 'A surviving letter of Ashurbanipal orders his officials in Borsippa to search the scholars’ houses and the temple of Ezida for tablets — prayers, rituals, omens and incantations — and to send to Nineveh any of which no copy exists in Assyria.',
    caravan: '🐴', market: '🏛️', goods: ['📜', '⭐', '🌿', '🌙', '🔥'],
    obstacle: '⛰️', ground: 'bg-[#ece0c4]', variant: 'orders', rule: 'Only the listed tablets',
  },
  pochteca: {
    title: 'The Pochteca Road',
    intro: 'The merchants of Tlatelolco bring home only what the market asked for. Collect every ordered load; crossing a wrong one costs 3 days. Keep clear of the volcanoes.',
    fact: 'The pochteca were the long-distance merchants of the Aztec world. With no pack animals or carts, they travelled with lines of porters (tlameme) carrying cacao, feathers, jade and cloth, and they also served the tlatoani as spies in foreign lands.',
    caravan: '🚶', market: '🛕', goods: ['🪶', '🫘', '💚', '🧶', '🌽'],
    obstacle: '🌋', ground: 'bg-[#e9dfc0]', variant: 'orders', rule: 'Fill the order',
  },
  sahara: {
    title: 'Trans-Saharan Salt Caravan',
    intro: 'Carry salt and gold across the Sahara. Your water lasts only so many days; each well fills the skins again, but drains dry once you have used it.',
    fact: 'Ibn Battuta crossed the Sahara to the Mali Empire in 1352 and described Taghaza, a town whose houses and mosque were built of salt blocks. Salt from Taghaza traded south for gold, sometimes reportedly weight for weight.',
    caravan: '🐫', market: '🕌', goods: ['🧂', '🪙', '🧂', '🪙', '🧂'],
    obstacle: '🪨', ground: 'bg-[#f5deb0]', variant: 'wells', rule: 'Each well once',
  },
  'quito-gold': {
    title: 'The Gold of Quito',
    intro: 'The Spanish are days away. Reach each load of gold and silver before its hour runs out, then lead the llamas on into the mountains.',
    fact: 'Legend says Rumiñahui’s men carried the treasure of Quito into the Llanganates mountains east of the city before he burned it. A written route to the hoard, the “Derrotero de Valverde”, surfaced in colonial times, and treasure hunters have searched the Llanganates ever since without finding it.',
    caravan: '🦙', market: '🏔️', goods: ['🪙', '🏺', '👑', '🪙', '🏺'],
    obstacle: '🪨', ground: 'bg-[#dfe3c8]', variant: 'deadline', rule: 'Before the Spanish come',
  },
  'incense-route': {
    title: 'The Incense Route',
    intro: 'Frankincense and myrrh lose their worth on the road. Reach each load before the number on it runs out, then bring the train to Petra.',
    fact: 'Frankincense from southern Arabia travelled the Incense Route to Gaza and the Mediterranean. Pliny the Elder (1st century CE) wrote that the trade made the South Arabians among the richest people on earth; the Nabataean city of Petra grew rich taxing it.',
    caravan: '🐫', market: '🏛️', goods: ['🌿', '🏺', '🪔', '🌿', '🏺'],
    obstacle: '🪨', ground: 'bg-[#ead7bb]', variant: 'deadline', rule: 'Goods spoil',
  },
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export const DECOY_COST = 3

export interface Tier { size: number; loads: number; rocks: number; decoys: number; wells: number; slack: number; spoilSlack: number }

export function tierFor(d: Difficulty): Tier {
  return {
    size: scale(d, [7, 8, 9, 9]),
    loads: scale(d, [3, 4, 4, 5]),
    rocks: scale(d, [7, 10, 14, 15]),
    decoys: scale(d, [3, 4, 6, 7]),
    wells: scale(d, [2, 2, 3, 3]),
    slack: scale(d, [6, 3, 1, 0]),
    spoilSlack: scale(d, [4, 2, 1, 0]),
  }
}

export interface Trail {
  size: number
  variant: TrailVariant
  blocked: boolean[]
  start: number
  goal: number
  loads: number[]
  decoys: number[]
  wells: number[]
  /** Days (and, with wells, the most water carried). */
  supply: number
  /** Deadline routes: the last day each load can still be picked up. */
  deadlines: number[]
}

export interface TrailState {
  pos: number
  /** Bit i set once loads[i] is picked up. */
  collected: number
  /** Bit i set once wells[i] has been drunk dry. */
  used: number
  supply: number
  day: number
  path: number[]
  status: 'playing' | 'won' | 'lost'
  reason?: string
}

export function neighbours(size: number, i: number): number[] {
  const x = i % size, y = Math.floor(i / size), out: number[] = []
  if (y > 0) out.push(i - size)
  if (x < size - 1) out.push(i + 1)
  if (y < size - 1) out.push(i + size)
  if (x > 0) out.push(i - 1)
  return out
}

export const stepCost = (t: Trail, cell: number) => (t.decoys.includes(cell) ? DECOY_COST : 1)

export function startState(t: Trail): TrailState {
  return { pos: t.start, collected: 0, used: 0, supply: t.supply, day: 0, path: [t.start], status: 'playing' }
}

const fullMask = (t: Trail) => (1 << t.loads.length) - 1

/** Loads not yet collected whose time has run out by `day`. */
function spoiled(t: Trail, collected: number, day: number): boolean {
  if (t.variant !== 'deadline') return false
  return t.loads.some((_, i) => !(collected >> i & 1) && day > t.deadlines[i])
}

/** Squares the caravan can step onto now. */
export function legalMoves(t: Trail, s: TrailState): number[] {
  if (s.status !== 'playing') return []
  return neighbours(t.size, s.pos).filter(n => !t.blocked[n] && stepCost(t, n) <= s.supply)
}

/** Step onto `cell`; illegal moves leave the state unchanged. */
export function move(t: Trail, s: TrailState, cell: number): TrailState {
  if (!legalMoves(t, s).includes(cell)) return s
  let supply = s.supply - stepCost(t, cell)
  let { collected, used } = s
  const day = s.day + 1
  const li = t.loads.indexOf(cell)
  if (li >= 0) collected |= 1 << li
  const wi = t.wells.indexOf(cell)
  if (wi >= 0 && !(used >> wi & 1)) { supply = t.supply; used |= 1 << wi }
  const next: TrailState = { ...s, pos: cell, collected, used, supply, day, path: [...s.path, cell] }
  if (cell === t.goal && collected === fullMask(t)) return { ...next, status: 'won' }
  if (spoiled(t, collected, day)) return { ...next, status: 'lost', reason: 'a load was lost before you reached it' }
  if (!legalMoves(t, next).length) return { ...next, status: 'lost', reason: 'the supplies ran out' }
  return next
}

/**
 * A winning route from the start with the given supplies (and deadlines),
 * as the squares stepped onto, or null.  Breadth-first over (square, loads,
 * wells used), keeping only the most supplies seen for each.
 */
export function solve(t: Trail, supply = t.supply, deadlines = t.deadlines): number[] | null {
  const tt: Trail = { ...t, supply, deadlines }
  const full = fullMask(tt)
  const W = 256
  const dom = (pos: number, c: number, u: number) => (pos * 64 + c) * 16 + u
  const best = new Map<number, number>()
  const parent = new Map<number, number>()
  const key = (pos: number, c: number, u: number, w: number) => dom(pos, c, u) * W + w
  const startKey = key(tt.start, 0, 0, supply)
  const queue = [startKey]
  // Day is part of the state only through supply on deadline routes, which have no wells.
  const dayOf = new Map<number, number>([[startKey, 0]])
  best.set(dom(tt.start, 0, 0), supply)
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h]
    const w = k % W, d = Math.floor(k / W)
    const u = d % 16, c = Math.floor(d / 16) % 64, pos = Math.floor(d / 1024)
    const day = dayOf.get(k)!
    for (const n of neighbours(tt.size, pos)) {
      if (tt.blocked[n]) continue
      let nw = w - stepCost(tt, n)
      if (nw < 0) continue
      let nc = c, nu = u
      const li = tt.loads.indexOf(n)
      if (li >= 0) nc |= 1 << li
      const wi = tt.wells.indexOf(n)
      if (wi >= 0 && !(nu >> wi & 1)) { nw = supply; nu |= 1 << wi }
      if (spoiled(tt, nc, day + 1)) continue
      const nk = key(n, nc, nu, nw)
      if (n === tt.goal && nc === full) {
        const route = [n]
        for (let p = k; p !== startKey; p = parent.get(p)!) route.push(Math.floor(p / W / 1024))
        return route.reverse()
      }
      const dk = dom(n, nc, nu)
      if ((best.get(dk) ?? -1) >= nw) continue
      best.set(dk, nw)
      parent.set(nk, k)
      dayOf.set(nk, day + 1)
      queue.push(nk)
    }
  }
  return null
}

/** Fewest supplies that finish the route (no deadlines), or null if none up to the cap. */
export function minSupply(t: Trail, cap = 200): number | null {
  const none = t.loads.map(() => Infinity)
  let hi = 8
  while (!solve(t, hi, none)) { hi *= 2; if (hi > cap) return null }
  let lo = 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (solve(t, mid, none)) hi = mid; else lo = mid + 1
  }
  return hi
}

function connected(size: number, blocked: boolean[], from: number): boolean {
  const seen = new Set([from])
  const queue = [from]
  for (let h = 0; h < queue.length; h++) for (const n of neighbours(size, queue[h])) if (!blocked[n] && !seen.has(n)) { seen.add(n); queue.push(n) }
  return seen.size === blocked.filter(b => !b).length
}

/** A seeded, solved route; reseeds until one is built. */
export function makeTrail(variant: TrailVariant, difficulty: Difficulty, seed: number): Trail {
  const tier = tierFor(difficulty)
  const { size } = tier
  for (let attempt = 0; ; attempt++) {
    const rng = mulberry32(seed * 31 + attempt * 7919 + difficulty)
    const pick = (n: number) => Math.floor(rng() * n)
    const start = pick(size) * size
    const goal = pick(size) * size + size - 1
    const blocked = new Array<boolean>(size * size).fill(false)
    const taken = new Set([start, goal])
    const free = () => { for (;;) { const i = pick(size * size); if (!taken.has(i) && !blocked[i]) { taken.add(i); return i } } }
    for (let r = 0; r < tier.rocks; r++) { const i = free(); taken.delete(i); blocked[i] = true }
    if (!connected(size, blocked, start)) continue
    const loads = Array.from({ length: tier.loads }, free)
    const decoys = variant === 'orders' ? Array.from({ length: tier.decoys }, free) : []
    const wells = variant === 'wells' ? Array.from({ length: tier.wells }, free) : []
    const base: Trail = { size, variant, blocked, start, goal, loads, decoys, wells, supply: 0, deadlines: loads.map(() => Infinity) }
    // Wells: carry less than the whole journey, so they matter.
    const need = minSupply(base)
    if (need === null) continue
    const supply = need + tier.slack
    if (variant !== 'deadline') return { ...base, supply }
    const route = solve(base, need, base.deadlines)!
    const deadlines = loads.map(l => route.indexOf(l) + 1 + tier.spoilSlack)
    const trail = { ...base, supply, deadlines }
    if (solve(trail)) return trail
    if (attempt > 50) return { ...trail, deadlines: base.deadlines }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function PackTrainGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'silk-road')
  const trail = useMemo(() => makeTrail(cfg.variant, difficulty, seed), [cfg.variant, difficulty, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const [state, setState] = useState(() => startState(trail))

  const moves = useMemo(() => new Set(legalMoves(trail, state)), [trail, state])
  const visited = useMemo(() => new Set(state.path), [state.path])
  const allLoaded = state.collected === fullMask(trail)

  const tap = (cell: number) => {
    if (settled || !moves.has(cell)) return
    const next = move(trail, state, cell)
    setState(next)
    if (next.status === 'won') win()
    else if (next.status === 'lost') lose(next.reason)
  }

  const label = cfg.variant === 'deadline' ? 'Days' : cfg.variant === 'wells' ? 'Water' : 'Supplies'
  const loadsLeft = trail.loads.length - trail.loads.filter((_, i) => state.collected >> i & 1).length

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title} · {cfg.rule}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-[10px] text-muted text-right leading-relaxed">
          {label} <b className={`text-sm ${state.supply <= 2 ? 'text-red-700' : 'text-ink'}`}>{state.supply}</b>
          {cfg.variant === 'wells' && <span className="text-muted/70">/{trail.supply}</span>}<br />
          Loads <b className="text-ink">{loadsLeft}</b> left
        </div>
      </div>

      <div className="self-center grid gap-[2px] p-1 rounded-lg bg-ink/10 border border-line"
        style={{ gridTemplateColumns: `repeat(${trail.size}, minmax(0, 1fr))` }}>
        {trail.blocked.map((rock, i) => {
          const li = trail.loads.indexOf(i)
          const wi = trail.wells.indexOf(i)
          const loaded = li >= 0 && (state.collected >> li & 1)
          const dry = wi >= 0 && (state.used >> wi & 1)
          const isDecoy = trail.decoys.includes(i)
          const here = i === state.pos
          const canGo = moves.has(i) && !settled
          let content: React.ReactNode = ''
          if (here) content = cfg.caravan
          else if (rock) content = cfg.obstacle
          else if (i === trail.goal) content = <span className={allLoaded ? '' : 'opacity-60'}>{cfg.market}</span>
          else if (li >= 0 && !loaded) {
            const left = trail.deadlines[li] - state.day
            content = (
              <span className="relative">
                {cfg.goods[li % cfg.goods.length]}
                {cfg.variant === 'deadline' && (
                  <span className={`absolute -top-1.5 -right-2 min-w-[14px] px-0.5 rounded-full text-[9px] font-bold leading-[14px] text-white
                    ${left <= 2 ? 'bg-red-600' : 'bg-ink/70'}`}>{Math.max(0, left)}</span>
                )}
              </span>
            )
          } else if (isDecoy) content = <span className="opacity-45 grayscale">{cfg.goods[(trail.decoys.indexOf(i) + 1) % cfg.goods.length]}</span>
          else if (wi >= 0) content = <span className={dry ? 'opacity-30 grayscale' : ''}>💧</span>
          return (
            <button key={i} onClick={() => tap(i)} disabled={!canGo}
              aria-label={`square ${i % trail.size + 1},${Math.floor(i / trail.size) + 1}`}
              className={`relative w-8 h-8 sm:w-9 sm:h-9 rounded flex items-center justify-center text-lg leading-none transition-colors
                ${rock ? 'bg-panel-2' : here ? 'bg-amber-300/80' : canGo ? 'bg-amber-100 ring-2 ring-accent/60 active:scale-90' : visited.has(i) ? 'bg-amber-100/60' : cfg.ground}
                ${isDecoy && !here ? 'outline outline-1 outline-dashed outline-red-700/50 -outline-offset-2' : ''}
                ${canGo ? 'cursor-pointer' : 'cursor-default'}`}>
              {content}
            </button>
          )
        })}
      </div>

      <p className="text-[10px] text-muted/80 text-center">
        Tap a highlighted square to step there; each step costs 1 {cfg.variant === 'deadline' ? 'day' : 'supply'}.
        {cfg.variant === 'orders' && ` Crossing a faded, wrong load costs ${DECOY_COST}.`}
        {cfg.variant === 'wells' && ' 💧 refills your water once.'}
        {cfg.variant === 'deadline' && ' The number on a load is the days it has left.'}
        {' '}Collect every load, then reach {cfg.market}.
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The goods are home!" loseTitle="The journey failed" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
