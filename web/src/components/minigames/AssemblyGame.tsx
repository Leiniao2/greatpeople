import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar, type Rng } from './_shared'

// Assembly Line: set up a line, then run it.  The simulation is deterministic
// and every level carries its exact optimum.  Four rule sets:
//
//   ford      line balancing: give each job to a station along the line; a job
//             can't come before the jobs it needs; the slowest station sets
//             the pace — keep it within the target (exact by search).
//   arsenal   the Venetian Arsenal: galleys are towed past a row of
//             warehouses and take what they need in their own order.  Lay out
//             the shortest row that fits out every galley in one pass
//             (shortest common supersequence, exact by BFS).
//   wedgwood  pottery stages: every pot goes through throwing, firing and
//             glazing in that order; choose the order of pots so the batch is
//             done soonest (flow-shop makespan, exact over all orders).
//   jacquard  punch the cards: each hook lifts the warp threads tied to it,
//             a thread rises if any of its hooks is punched.  Punch each card
//             so the woven rows match the pattern, with as few holes as you
//             can (exact minimum per row by trying every hook set).
//
//   D   ford (jobs/stations)  arsenal (galleys×parts)  wedgwood (pots×stages)  jacquard (rows×hooks)  slack  timer  expected
//   1   5 / 2                 2 × 3                    4 × 2                   3 × 4                 big    90s    ~1 min
//   2   6 / 3                 2 × 4                    5 × 3                   4 × 5                 some   120s   ~1.5 min
//   3   8 / 3                 3 × 4                    6 × 3                   4 × 6                 small  150s   ~2 min
//   4   9 / 4                 3 × 5                    7 × 3                   5 × 7                 exact  180s   ~3 min

export type Mode = 'ford' | 'arsenal' | 'wedgwood' | 'jacquard'

export interface AssemblyConfig {
  title: string
  intro: string
  fact: string
  mode: Mode
}

export const CONFIGS: Record<string, AssemblyConfig> = {
  ford: {
    title: 'Highland Park, 1913',
    intro: 'Give every job to a station along the line. A job can’t be done before the jobs it needs. The slowest station sets the pace — keep it within the target.',
    fact: 'Ford’s moving assembly line at Highland Park, introduced in 1913, cut the time to build a Model T chassis from about 12½ hours to about 1½ hours.',
    mode: 'ford',
  },
  arsenal: {
    title: 'The Arsenal of Venice',
    intro: 'Galleys are towed past a row of warehouses and take their stores in their own order. Lay out the shortest row that fits out every galley in a single pass.',
    fact: 'The Venetian Arsenal fitted out galleys as they were towed past windows handing out ropes, oars and arms; in 1574 it is said to have built a whole galley while Henry III of France dined.',
    mode: 'arsenal',
  },
  wedgwood: {
    title: 'Wedgwood’s Etruria',
    intro: 'Each pot is thrown, fired and glazed, in that order, one pot per workshop at a time. Order the batch so it is finished as soon as possible.',
    fact: 'At his Etruria works, opened in 1769, Josiah Wedgwood split pottery-making into specialised stages done by different workers — an early factory division of labour.',
    mode: 'wedgwood',
  },
  jacquard: {
    title: 'Jacquard’s Loom',
    intro: 'Each hook lifts the threads tied to it; a thread rises if any of its hooks is punched. Punch each card so the rows weave the pattern — using as few holes as you can.',
    fact: 'Joseph Marie Jacquard’s loom of 1804 wove patterns from chains of punched cards; Charles Babbage borrowed the idea to program his Analytical Engine.',
    mode: 'jacquard',
  },
  'chanel-workrooms': {
    title: 'The Workrooms of Rue Cambon',
    intro: 'A run of little black dresses in jersey must be ready for the clients. Give every job — cutting, sewing, fitting, finishing — to a station along the line. A job can’t be done before the jobs it needs. The slowest station sets the pace.',
    fact: 'In October 1926 American Vogue printed a Chanel little black dress and called it “the Chanel ‘Ford’” — a simple design anyone could wear, like the Model T. Chanel had been cutting dresses from machine-knitted jersey, once used for men’s underwear, since 1916.',
    mode: 'ford',
  },
  'givenchy-atelier': {
    title: 'Givenchy’s Atelier, Paris 1953',
    intro: 'Audrey’s wardrobe for Sabrina must be ready before shooting. Give every job — cutting, sewing, fitting — to a station along the line. A job can’t be done before the jobs it needs. The slowest station sets the pace.',
    fact: 'In 1953 Audrey Hepburn walked into the Paris atelier of the young couturier Hubert de Givenchy looking for clothes for Sabrina. It began a forty-year partnership: Givenchy dressed her for Funny Face, Breakfast at Tiffany’s and much of her life off screen.',
    mode: 'ford',
  },
  'atelier-counter': {
    title: 'L’Atelier, Paris 2003',
    intro: 'At L’Atelier the cooks work in an open kitchen behind the counter, in full view of the guests. Give every job to a station along the counter. A job can’t be done before the jobs it needs. The slowest station sets the pace.',
    fact: 'Robuchon opened L’Atelier de Joël Robuchon in Paris in 2003, seating diners on stools around an open kitchen, an idea he drew from Japanese sushi counters and Spanish tapas bars.',
    mode: 'ford',
  },
  'pixar-pipeline': {
    title: 'Toy Story, Point Richmond 1995',
    intro: 'Every shot of Toy Story passes through the same pipeline: story, modelling, animation, lighting, rendering. Give every job to a station along the line. A job can’t be done before the jobs it needs. The slowest station sets the pace.',
    fact: 'Steve Jobs bought the computer graphics division of Lucasfilm in 1986 and named it Pixar. Its Toy Story (1995) was the first feature-length film made entirely with computer animation; each frame took hours to render on a farm of Sun workstations.',
    mode: 'ford',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)
export const secondsFor = (d: Difficulty) => scale(d, [90, 120, 150, 180])
export const mistakesFor = (d: Difficulty) => scale(d, [3, 2, 2, 2])

// ── Ford: line balancing ──────────────────────────────────────────────────────

export interface FordLevel { kind: 'ford'; times: number[]; needs: number[][]; stations: number; optimum: number; target: number; solution: number[] }

export function stationLoads(L: Pick<FordLevel, 'times' | 'stations'>, assign: readonly number[]): number[] {
  const loads = new Array(L.stations).fill(0)
  assign.forEach((s, j) => { if (s >= 0) loads[s] += L.times[j] })
  return loads
}
export function fordCheck(L: FordLevel, assign: readonly number[]): string | null {
  if (assign.some(s => s < 0)) return 'Some jobs have no station.'
  for (let j = 0; j < assign.length; j++) for (const p of L.needs[j]) if (assign[p] > assign[j]) return `Job ${j + 1} needs job ${p + 1} done first, further up the line.`
  const pace = Math.max(...stationLoads(L, assign))
  if (pace > L.target) return `The slowest station takes ${pace} min — the target is ${L.target}.`
  return null
}
export function bestBalance(times: number[], needs: number[][], stations: number): { pace: number; assign: number[] } {
  const n = times.length
  let best = { pace: Infinity, assign: [] as number[] }
  const assign = new Array(n).fill(-1), loads = new Array(stations).fill(0)
  const dfs = (j: number, pace: number) => {
    if (pace >= best.pace) return
    if (j === n) { best = { pace, assign: assign.slice() }; return }
    const lo = Math.max(0, ...needs[j].map(p => assign[p]))
    for (let s = lo; s < stations; s++) {
      loads[s] += times[j]; assign[j] = s
      dfs(j + 1, Math.max(pace, loads[s]))
      loads[s] -= times[j]; assign[j] = -1
    }
  }
  dfs(0, 0)
  return best
}
function makeFord(rng: Rng, d: Difficulty): FordLevel {
  const n = scale(d, [5, 6, 8, 9]), stations = scale(d, [2, 3, 3, 4])
  for (;;) {
    const times = Array.from({ length: n }, () => 1 + Math.floor(rng() * 6))
    const needs = times.map((_, j) => shuffle(Array.from({ length: j }, (_, k) => k), rng).slice(0, j ? Math.floor(rng() * 3) : 0).sort((a, b) => a - b))
    const best = bestBalance(times, needs, stations)
    // Precedence should bite: the best pace is worse than an even split.
    const even = Math.max(Math.ceil(times.reduce((a, b) => a + b, 0) / stations), ...times)
    if (best.pace === even && rng() < 0.7) continue
    return { kind: 'ford', times, needs, stations, optimum: best.pace, target: best.pace + scale(d, [2, 1, 1, 0]), solution: best.assign }
  }
}

// ── Arsenal: shortest common supersequence ──────────────────────────────────────

export const STORES = ['Rope', 'Oars', 'Sails', 'Guns', 'Bread', 'Pitch']
export const STORE_ICON = ['🪢', '🚣', '⛵', '💣', '🍞', '🛢']
export interface ArsenalLevel { kind: 'arsenal'; recipes: number[][]; stores: number; optimum: number; target: number; solution: number[] }

export const isSubseq = (sub: readonly number[], line: readonly number[]) => { let k = 0; for (const x of line) if (x === sub[k]) k++; return k === sub.length }
export function shortestLine(recipes: number[][], stores: number): number[] {
  const start = recipes.map(() => 0)
  const key = (s: number[]) => s.join(',')
  const prev = new Map<string, { from: string; c: number } | null>([[key(start), null]])
  const q = [start]
  let goal: number[] | null = null
  while (q.length) {
    const s = q.shift()!
    if (s.every((p, k) => p === recipes[k].length)) { goal = s; break }
    for (let c = 0; c < stores; c++) {
      const n = s.map((p, k) => (recipes[k][p] === c ? p + 1 : p))
      if (n.every((p, k) => p === s[k])) continue
      const kk = key(n)
      if (prev.has(kk)) continue
      prev.set(kk, { from: key(s), c }); q.push(n)
    }
  }
  const line: number[] = []
  for (let k = key(goal!); prev.get(k);) { const p = prev.get(k)!; line.unshift(p.c); k = p.from }
  return line
}
export function arsenalCheck(L: ArsenalLevel, line: readonly number[]): string | null {
  if (line.length > L.target) return `The row is ${line.length} warehouses — at most ${L.target}.`
  const bad = L.recipes.findIndex(r => !isSubseq(r, line))
  return bad >= 0 ? `Galley ${bad + 1} can’t take its stores in order from this row.` : null
}
function makeArsenal(rng: Rng, d: Difficulty): ArsenalLevel {
  const g = scale(d, [2, 2, 3, 3]), len = scale(d, [3, 4, 4, 5]), stores = scale(d, [4, 5, 5, 6])
  for (;;) {
    const recipes = Array.from({ length: g }, () => shuffle(Array.from({ length: stores }, (_, k) => k), rng).slice(0, len))
    const sol = shortestLine(recipes, stores)
    // Too easy if the galleys simply share one order.
    if (sol.length <= len + 1) continue
    return { kind: 'arsenal', recipes, stores, optimum: sol.length, target: sol.length + scale(d, [2, 1, 0, 0]), solution: sol }
  }
}

// ── Wedgwood: flow shop ─────────────────────────────────────────────────────────

export const STAGES = ['Throw', 'Fire', 'Glaze']
export interface WedgwoodLevel { kind: 'wedgwood'; times: number[][]; optimum: number; target: number; solution: number[] }

export function makespan(times: number[][], order: readonly number[]): number {
  const m = times[0].length
  const done = new Array(m).fill(0)
  for (const j of order) for (let s = 0; s < m; s++) done[s] = Math.max(done[s], s ? done[s - 1] : 0) + times[j][s]
  return done[m - 1]
}
/** Start/finish of every pot at every stage, for the chart. */
export function schedule(times: number[][], order: readonly number[]): { j: number; s: number; a: number; b: number }[] {
  const m = times[0].length
  const done = new Array(m).fill(0)
  const out: { j: number; s: number; a: number; b: number }[] = []
  for (const j of order) for (let s = 0; s < m; s++) {
    const a = Math.max(done[s], s ? done[s - 1] : 0)
    done[s] = a + times[j][s]
    out.push({ j, s, a, b: done[s] })
  }
  return out
}
export function bestOrder(times: number[][]): { span: number; order: number[] } {
  const n = times.length
  let best = { span: Infinity, order: [] as number[] }
  const perm: number[] = [], used = new Uint8Array(n)
  const rec = () => {
    if (perm.length === n) { const s = makespan(times, perm); if (s < best.span) best = { span: s, order: perm.slice() }; return }
    for (let j = 0; j < n; j++) if (!used[j]) { used[j] = 1; perm.push(j); rec(); perm.pop(); used[j] = 0 }
  }
  rec()
  return best
}
function makeWedgwood(rng: Rng, d: Difficulty): WedgwoodLevel {
  const n = scale(d, [4, 5, 6, 7]), m = scale(d, [2, 3, 3, 3])
  for (;;) {
    const times = Array.from({ length: n }, () => Array.from({ length: m }, () => 1 + Math.floor(rng() * 6)))
    const best = bestOrder(times)
    // The order the pots arrive in must be clearly worse than the best.
    if (makespan(times, times.map((_, j) => j)) - best.span < 2) continue
    return { kind: 'wedgwood', times, optimum: best.span, target: best.span + scale(d, [3, 2, 1, 0]), solution: best.order }
  }
}

// ── Jacquard: punch cards ───────────────────────────────────────────────────────

export interface JacquardLevel { kind: 'jacquard'; hooks: number; ties: number[][]; pattern: boolean[][]; optimum: number; target: number; solution: boolean[][] }

export const weave = (ties: number[][], card: readonly boolean[]) => ties.map(hs => hs.some(h => card[h]))
export function fewestHoles(ties: number[][], hooks: number, row: readonly boolean[]): boolean[] | null {
  let best: boolean[] | null = null, bestN = Infinity
  for (let mask = 0; mask < 1 << hooks; mask++) {
    let bits = 0; for (let x = mask; x; x &= x - 1) bits++
    if (bits >= bestN) continue
    const card = Array.from({ length: hooks }, (_, h) => !!(mask & (1 << h)))
    if (weave(ties, card).every((v, t) => v === row[t])) { best = card; bestN = bits }
  }
  return best
}
export const holes = (cards: readonly boolean[][]) => cards.reduce((s, c) => s + c.filter(Boolean).length, 0)
export function jacquardCheck(L: JacquardLevel, cards: readonly boolean[][]): string | null {
  const bad = cards.findIndex((c, r) => !weave(L.ties, c).every((v, t) => v === L.pattern[r][t]))
  if (bad >= 0) return `Row ${bad + 1} weaves the wrong pattern.`
  if (holes(cards) > L.target) return `${holes(cards)} holes — the card-cutter allows ${L.target}.`
  return null
}
function makeJacquard(rng: Rng, d: Difficulty): JacquardLevel {
  const rows = scale(d, [3, 4, 4, 5]), hooks = scale(d, [4, 5, 6, 7]), threads = scale(d, [6, 8, 9, 10])
  for (;;) {
    // Every hook ties at least one thread; some threads hang from two hooks.
    const ties: number[][] = Array.from({ length: threads }, (_, t) => [t < hooks ? t : Math.floor(rng() * hooks)])
    for (const t of shuffle(Array.from({ length: threads }, (_, k) => k), rng).slice(0, Math.ceil(threads / 2))) {
      const h = Math.floor(rng() * hooks)
      if (!ties[t].includes(h)) ties[t].push(h)
    }
    const order = shuffle(Array.from({ length: threads }, (_, k) => k), rng)
    const tiesShuffled = order.map(k => ties[k].sort((a, b) => a - b))
    const pattern: boolean[][] = [], solution: boolean[][] = []
    for (let r = 0; r < rows; r++) {
      const card = Array.from({ length: hooks }, () => rng() < 0.45)
      const row = weave(tiesShuffled, card)
      const best = fewestHoles(tiesShuffled, hooks, row)!
      pattern.push(row); solution.push(best)
    }
    const optimum = holes(solution)
    // Some row should allow a wasteful answer, so the minimum matters.
    const waste = pattern.some(row => {
      const forcedOff = new Set(tiesShuffled.flatMap((hs, t) => (row[t] ? [] : hs)))
      const avail = Array.from({ length: hooks }, (_, h) => h).filter(h => !forcedOff.has(h))
      return avail.length > fewestHoles(tiesShuffled, hooks, row)!.filter(Boolean).length
    })
    if (!waste || pattern.some(r => r.every(v => !v))) continue
    return { kind: 'jacquard', hooks, ties: tiesShuffled, pattern, optimum, target: optimum + scale(d, [3, 2, 1, 0]), solution }
  }
}

export type Level = FordLevel | ArsenalLevel | WedgwoodLevel | JacquardLevel

export function makeLevel(configId: string, mode: Mode, d: Difficulty, seed: number): Level {
  const rng = mulberry32(seed ^ hashString(`assembly:${configId}:${d}`))
  switch (mode) {
    case 'ford': return makeFord(rng, d)
    case 'arsenal': return makeArsenal(rng, d)
    case 'wedgwood': return makeWedgwood(rng, d)
    case 'jacquard': return makeJacquard(rng, d)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const POT_COLORS = ['#c0392b', '#1f5fa8', '#2e8b57', '#d68910', '#8e44ad', '#16a085', '#7f5539']

export default function AssemblyGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'ford')
  const level = useMemo(() => makeLevel(configId, config.mode, difficulty, seed), [configId, config, difficulty, seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds: secondsFor(difficulty), running: !settled, onExpire: () => lose('the shift ended') })
  const [mistakes, setMistakes] = useState(0)
  const [note, setNote] = useState(config.intro)
  const maxM = mistakesFor(difficulty)
  const live = difficulty <= 2

  // ford
  const [assign, setAssign] = useState<number[]>(() => (level.kind === 'ford' ? level.times.map(() => -1) : []))
  const [sel, setSel] = useState<number | null>(null)
  // arsenal
  const [line, setLine] = useState<number[]>([])
  // wedgwood
  const [order, setOrder] = useState<number[]>(() => (level.kind === 'wedgwood' ? level.times.map((_, j) => j) : []))
  // jacquard
  const [cards, setCards] = useState<boolean[][]>(() => (level.kind === 'jacquard' ? level.pattern.map(() => new Array(level.hooks).fill(false)) : []))

  const runLine = () => {
    if (settled) return
    const why =
      level.kind === 'ford' ? fordCheck(level, assign) :
      level.kind === 'arsenal' ? arsenalCheck(level, line) :
      level.kind === 'wedgwood' ? (makespan(level.times, order) > level.target ? `The batch takes ${makespan(level.times, order)} hours — the target is ${level.target}.` : null) :
      jacquardCheck(level, cards)
    if (!why) {
      const score = level.kind === 'ford' ? Math.max(...stationLoads(level, assign)) : level.kind === 'arsenal' ? line.length : level.kind === 'wedgwood' ? makespan(level.times, order) : holes(cards)
      setNote(`The line runs!${score === level.optimum ? ' A perfect set-up — nobody could do better.' : ''}`)
      win(); return
    }
    const m = mistakes + 1
    setMistakes(m)
    if (m >= maxM) { setNote(why); lose('the line broke down'); return }
    setNote(`${why} ${maxM - m} ${maxM - m === 1 ? 'run' : 'runs'} left.`)
  }

  let body: React.ReactNode = null
  let header = ''
  let score = ''

  if (level.kind === 'ford') {
    const loads = stationLoads(level, assign)
    header = `${level.times.length} jobs · ${level.stations} stations · pace ≤ ${level.target} min`
    score = `${Math.max(...loads)} / ${level.target}`
    const chip = (j: number) => (
      <button key={j} data-job={j} onClick={() => !settled && setSel(sel === j ? null : j)}
        className={`px-1.5 py-1 rounded-md text-[11px] font-bold border text-left leading-tight ${sel === j ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink'}`}>
        J{j + 1} · {level.times[j]}m{level.needs[j].length ? <span className="block text-[9px] font-normal opacity-80">after {level.needs[j].map(p => `J${p + 1}`).join(', ')}</span> : null}
      </button>
    )
    body = (
      <>
        <div className="flex flex-wrap gap-1 min-h-[2rem] rounded-lg border border-dashed border-line p-1.5" data-testid="pool">
          {assign.every(s => s >= 0) ? <span className="text-[11px] text-muted">All jobs placed.</span> : level.times.map((_, j) => (assign[j] < 0 ? chip(j) : null))}
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${level.stations}, 1fr)` }}>
          {Array.from({ length: level.stations }, (_, s) => (
            <div key={s} data-station={s} onClick={() => { if (settled || sel === null) return; setAssign(assign.map((x, j) => (j === sel ? s : x))); setSel(null) }}
              className={`rounded-lg border p-1.5 min-h-[7rem] flex flex-col gap-1 cursor-pointer ${sel !== null ? 'border-accent bg-accent/5' : 'border-line bg-paper'}`}>
              <p className="text-[10px] font-bold uppercase text-muted">Station {s + 1}</p>
              <div className="h-1.5 rounded-full bg-panel overflow-hidden"><div className={`h-full ${loads[s] > level.target ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${Math.min(100, (loads[s] / level.target) * 100)}%` }} /></div>
              <p className={`text-[11px] font-bold tabular-nums ${loads[s] > level.target ? 'text-red-700' : 'text-ink-2'}`}>{loads[s]} min</p>
              {level.times.map((_, j) => (assign[j] === s ? chip(j) : null))}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted">Tap a job, then a station. The line runs left to right.</p>
      </>
    )
  } else if (level.kind === 'arsenal') {
    header = `${level.recipes.length} galleys · row ≤ ${level.target} warehouses`
    score = `${line.length} / ${level.target}`
    body = (
      <>
        <div className="flex flex-col gap-1">
          {level.recipes.map((r, g) => {
            let k = 0
            const got = r.map(() => false)
            for (const x of line) if (x === r[k]) { got[k] = true; k++ }
            return (
              <div key={g} className="flex items-center gap-1.5 text-xs">
                <span className="w-16 font-bold text-ink-2 shrink-0">Galley {g + 1}</span>
                {r.map((c, j) => <span key={j} className={`px-1 py-0.5 rounded border ${got[j] ? 'bg-emerald-500/15 border-emerald-500/40' : 'bg-panel border-line'}`}>{STORE_ICON[c]}</span>)}
                {k === r.length && <span className="text-emerald-700 font-bold">✓</span>}
              </div>
            )
          })}
        </div>
        <div className="rounded-lg border-2 border-[#4f7f99] bg-[#b9d3df]/40 p-1.5 min-h-[2.75rem] flex flex-wrap gap-1 items-center" data-testid="row">
          {line.length ? line.map((c, j) => <span key={j} className="px-1.5 py-1 rounded bg-panel border border-line text-sm">{STORE_ICON[c]}</span>) : <span className="text-[11px] text-muted">The canal is empty — add warehouses in order.</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: level.stores }, (_, c) => (
            <button key={c} data-store={c} disabled={settled} onClick={() => { if (line.length >= level.target + 2) { setNote('No room for more warehouses.'); return } setLine([...line, c]) }}
              className="px-2 py-1.5 rounded-lg text-xs font-bold bg-panel border border-line text-ink disabled:opacity-40">{STORE_ICON[c]} {STORES[c]}</button>
          ))}
          <button disabled={settled || !line.length} onClick={() => setLine(line.slice(0, -1))} className="px-2 py-1.5 rounded-lg text-xs font-bold bg-panel border border-line text-ink disabled:opacity-40">⌫</button>
        </div>
      </>
    )
  } else if (level.kind === 'wedgwood') {
    const span = makespan(level.times, order)
    const m = level.times[0].length
    header = `${level.times.length} pots · ${m} stages · done within ${level.target} h`
    score = live ? `${span} / ${level.target}` : `? / ${level.target}`
    const sch = schedule(level.times, order)
    const W = Math.max(span, level.target)
    body = (
      <>
        <div className="flex flex-col gap-1">
          {order.map((j, k) => (
            <button key={j} data-pot={j} data-pos={k} disabled={settled}
              onClick={() => { if (sel === null) { setSel(k); return } const o = order.slice(); [o[sel], o[k]] = [o[k], o[sel]]; setOrder(o); setSel(null) }}
              className={`flex items-center gap-2 px-2 py-1 rounded-lg border text-xs ${sel === k ? 'border-accent bg-accent/10' : 'border-line bg-panel'}`}>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: POT_COLORS[j] }} />
              <span className="font-bold text-ink w-12 text-left">Pot {j + 1}</span>
              {level.times[j].map((t, s) => <span key={s} className="text-ink-2 tabular-nums w-14 text-left">{STAGES[s]} {t}</span>)}
            </button>
          ))}
        </div>
        {live && (
          <svg viewBox={`0 0 ${W + 1} ${m * 3}`} className="w-full h-auto rounded border border-line bg-paper" preserveAspectRatio="none" style={{ maxHeight: 90 }}>
            {sch.map((x, k) => <rect key={k} x={x.a} y={x.s * 3 + 0.4} width={x.b - x.a} height={2.2} fill={POT_COLORS[x.j]} stroke="#fff" strokeWidth={0.08} />)}
            <line x1={level.target} y1={0} x2={level.target} y2={m * 3} stroke="#111" strokeWidth={0.12} strokeDasharray="0.4 0.3" />
          </svg>
        )}
        <p className="text-[11px] text-muted">Tap two pots to swap them. {live ? 'The chart shows each workshop’s day.' : 'Work out the timing yourself.'}</p>
      </>
    )
  } else {
    const L = level
    header = `${L.pattern.length} rows · ${L.hooks} hooks · ≤ ${L.target} holes`
    score = `${holes(cards)} / ${L.target}`
    const cell = 'w-6 h-6 rounded-sm border'
    body = (
      <>
        <div className="flex flex-col gap-1 items-center">
          <div className="flex gap-0.5 items-end">
            <span className="w-12" />
            {L.ties.map((hs, t) => <span key={t} className="w-6 text-[9px] leading-tight text-center text-muted">{hs.map(h => h + 1).join('·')}</span>)}
          </div>
          {L.pattern.map((row, r) => {
            const woven = weave(L.ties, cards[r])
            return (
              <div key={r} className="flex gap-0.5 items-center">
                <span className="w-12 text-[10px] font-bold text-ink-2">Row {r + 1}</span>
                {row.map((v, t) => (
                  <span key={t} className={`${cell} relative ${v ? 'bg-[#7a1f2b] border-[#3b0f15]' : 'bg-[#f3e9d2] border-line'}`}>
                    {live && woven[t] !== v && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-amber-500">✕</span>}
                  </span>
                ))}
              </div>
            )
          })}
        </div>
        <div className="flex flex-col gap-1 items-center">
          <p className="text-[10px] font-bold uppercase text-muted">Cards — tap to punch hooks</p>
          {cards.map((c, r) => (
            <div key={r} className="flex gap-1 items-center">
              <span className="w-12 text-[10px] font-bold text-ink-2">Card {r + 1}</span>
              {c.map((on, h) => (
                <button key={h} data-hole={`${r}-${h}`} disabled={settled}
                  onClick={() => setCards(cards.map((cc, rr) => (rr === r ? cc.map((x, hh) => (hh === h ? !x : x)) : cc)))}
                  className={`w-7 h-7 rounded-full border-2 text-[10px] font-bold ${on ? 'bg-[#2a2015] border-[#2a2015] text-white' : 'bg-[#e9dfc4] border-[#a8977a] text-muted'}`}>{h + 1}</button>
              ))}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted">Numbers above each thread are the hooks that lift it.{live ? ' ✕ marks threads that come out wrong.' : ''}</p>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">{header}</p>
        </div>
        <p className="text-xs font-bold tabular-nums text-ink-2 shrink-0" data-testid="progress">{score}</p>
      </div>
      <TimerBar remaining={timer.remaining} total={timer.total} />
      {body}
      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <p className="text-xs leading-snug text-ink-2" role="status">{note}</p>
        <button onClick={runLine} disabled={settled} data-testid="run" className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent text-accent-fg disabled:opacity-40 shrink-0">Run the line</button>
      </div>
      <p className="text-[11px] text-muted -mt-2">Runs left: {maxM - mistakes}</p>
      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The line runs!" loseTitle="The line broke down" />
    </div>
  )
}
