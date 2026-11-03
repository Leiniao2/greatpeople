import { useCallback, useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// River Crossing — Alcuin of York's river puzzles (Propositiones ad acuendos
// juvenes, c. 800 CE) and their descendants.  Load the boat, row across,
// and get everyone to the far bank without ever leaving a bad group alone.
//
//   config            rule                                    D1 → D4
//   wolf-goat         nothing may be left with what eats it    3 → 6 animals and goods; from D2 a
//                     unless you are there                    boy who rows but cannot keep order
//   brothers-sisters  no sister with another man unless        2 pairs/2 seats → 5 pairs/3 seats
//                     her brother is there                    (some travellers cannot row)
//   heavy-family      the boat carries one cart-load           4 travellers → 6 with cargo
//   pilgrims-bandits  bandits may never outnumber pilgrims     2+2/2 seats → 5+5/3 seats
//
//   D1  illegal crossings are blocked and explained; undo; cap 3 × optimal
//   D2  as D1; cap 2.5 × optimal
//   D3  an illegal crossing costs one of 3 lives; no undo; cap 2 × optimal
//   D4  2 lives; no undo; cap optimal + slack
//
// Every puzzle is generated from the seed and kept only if the exported BFS
// solver finds a solution with enough crossings for its tier.

type Kind = 'predator' | 'jealous' | 'weight' | 'escort'

interface FerryConfig { title: string; intro: string; fact: string; kind: Kind }

export const CONFIGS: Record<string, FerryConfig> = {
  'wolf-goat': {
    title: 'The Wolf, the Goat and the Cabbages',
    kind: 'predator',
    intro: 'The boat holds two. Never leave anything on a bank with something that eats it unless you are there. A boy, when one comes along, can row — but the animals ignore him.',
    fact: "Alcuin of York's Propositiones ad acuendos juvenes (\"Problems to Sharpen the Young\", c. 800 CE) contains the oldest known version of the wolf, goat and cabbage puzzle, as Propositio 18. Alcuin was the leading scholar at Charlemagne's court.",
  },
  'brothers-sisters': {
    title: 'Three Brothers and Their Sisters',
    kind: 'jealous',
    intro: 'No sister may be on a bank — or in the boat — with another man unless her own brother is there too.',
    fact: "Alcuin's Propositio 17 sets three men, each with an unmarried sister, at a river with a two-person boat: no woman may be left with another man unless her brother is present. Later writers turned it into the \"jealous husbands\" puzzle.",
  },
  'heavy-family': {
    title: 'The Cart-Load Boat',
    kind: 'weight',
    intro: 'The boat carries one cart-load and no more. Shuttle the family — and their goods — across in as few trips as you can.',
    fact: "Alcuin's Propositio 19 has a man and a woman, each as heavy as a loaded cart, and two children who together weigh one cart-load; their boat carries only one cart-load. The answer takes nine crossings — the children do most of the rowing.",
  },
  'pilgrims-bandits': {
    title: 'Pilgrims and Bandits',
    kind: 'escort',
    intro: 'On either bank, the bandits must never outnumber the pilgrims there — or the pilgrims will be robbed.',
    fact: 'The "missionaries and cannibals" form of this puzzle is a 19th-century rewording of Alcuin\'s jealous-husbands problem. Saul Amarel\'s 1968 paper on representing it as a state space made it a classic first example of search in artificial intelligence.',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ──────────────────────────────────────────────────────────────────────

export interface Person {
  label: string
  icon: string
  rower: boolean
  weight: number
  /** predator: the species key; jealous: 'man' | 'woman'; escort: 'pilgrim' | 'bandit'. */
  role: string
  /** jealous: pair index (brother and sister share it). */
  pair?: number
  /** predator: role keys this one eats. */
  eats?: string[]
}

export interface Puzzle {
  kind: Kind
  people: Person[]
  seats: number
  maxWeight: number
  optimal: number
}

/** Bit i set = person i is on the far bank; boat 0 = near bank, 1 = far. */
export interface FerryState { far: number; boat: 0 | 1 }

const bitsOf = (mask: number, n: number) => {
  const out: number[] = []
  for (let i = 0; i < n; i++) if (mask & (1 << i)) out.push(i)
  return out
}

/** Why a group of people may not be left together, or null if it is fine. */
export function groupProblem(p: Puzzle, group: number[]): string | null {
  const ppl = group.map(i => p.people[i])
  if (p.kind === 'predator') {
    if (ppl.some(x => x.role === 'farmer')) return null
    for (const a of ppl) for (const b of ppl) if (a.eats?.includes(b.role)) return `The ${a.label.toLowerCase()} would eat the ${b.label.toLowerCase()}`
    return null
  }
  if (p.kind === 'jealous') {
    for (const w of ppl) {
      if (w.role !== 'woman') continue
      const brother = ppl.some(m => m.role === 'man' && m.pair === w.pair)
      const other = ppl.find(m => m.role === 'man' && m.pair !== w.pair)
      if (other && !brother) return `${w.label} would be with ${other.label} without her brother`
    }
    return null
  }
  if (p.kind === 'escort') {
    const pil = ppl.filter(x => x.role === 'pilgrim').length
    const ban = ppl.filter(x => x.role === 'bandit').length
    if (pil > 0 && ban > pil) return `${ban} bandits would outnumber ${pil} pilgrim${pil === 1 ? '' : 's'}`
    return null
  }
  return null
}

/** Why the chosen boat-load cannot sail, or null. */
export function loadProblem(p: Puzzle, load: number[]): string | null {
  if (!load.length) return 'The boat is empty — someone has to row'
  if (load.length > p.seats) return `The boat holds only ${p.seats}`
  const w = load.reduce((a, i) => a + p.people[i].weight, 0)
  if (w > p.maxWeight) return `That is ${w} loads — the boat carries ${p.maxWeight}`
  if (!load.some(i => p.people[i].rower)) return 'Nobody aboard can row'
  return null
}

/** Try a crossing. Returns the new state, or the reason it is not allowed. */
export function cross(p: Puzzle, s: FerryState, load: number[]): { state: FerryState } | { error: string } {
  const n = p.people.length
  const sideMask = s.boat ? s.far : ~s.far & ((1 << n) - 1)
  if (load.some(i => !(sideMask & (1 << i)))) return { error: 'Only people on the boat’s bank can board' }
  const lp = loadProblem(p, load)
  if (lp) return { error: lp }
  const loadMask = load.reduce((m, i) => m | (1 << i), 0)
  const far = s.boat ? s.far & ~loadMask : s.far | loadMask
  const boat = (1 - s.boat) as 0 | 1
  const departMask = s.boat ? far : ~far & ((1 << n) - 1)
  const arriveMask = boat ? far : ~far & ((1 << n) - 1)
  const left = groupProblem(p, bitsOf(departMask, n))
  if (left) return { error: `${left} on the bank you left` }
  const inBoat = groupProblem(p, load)
  if (inBoat) return { error: `${inBoat} in the boat` }
  const arrived = groupProblem(p, bitsOf(arriveMask, n))
  if (arrived) return { error: `${arrived} on the far side` }
  return { state: { far, boat } }
}

export const isDone = (p: Puzzle, s: FerryState) => s.far === (1 << p.people.length) - 1

function subsets(items: number[], max: number): number[][] {
  const out: number[][] = []
  const rec = (start: number, cur: number[]) => {
    if (cur.length) out.push([...cur])
    if (cur.length === max) return
    for (let k = start; k < items.length; k++) { cur.push(items[k]); rec(k + 1, cur); cur.pop() }
  }
  rec(0, [])
  return out
}

/** BFS over (far-bank mask, boat side): the fewest crossings, as boat-loads. */
export function solve(p: Puzzle, start: FerryState = { far: 0, boat: 0 }): number[][] | null {
  const n = p.people.length
  const key = (s: FerryState) => s.far * 2 + s.boat
  const prev = new Map<number, [number, number[]] | null>([[key(start), null]])
  let frontier: FerryState[] = [start]
  if (isDone(p, start)) return []
  while (frontier.length) {
    const next: FerryState[] = []
    for (const s of frontier) {
      const side = bitsOf(s.boat ? s.far : ~s.far & ((1 << n) - 1), n)
      for (const load of subsets(side, p.seats)) {
        const r = cross(p, s, load)
        if ('error' in r) continue
        const k = key(r.state)
        if (prev.has(k)) continue
        prev.set(k, [key(s), load])
        if (isDone(p, r.state)) {
          const path: number[][] = []
          for (let c: number = k, link = prev.get(c); link; c = link[0], link = prev.get(c)) path.push(link[1])
          return path.reverse()
        }
        next.push(r.state)
      }
    }
    frontier = next
  }
  return null
}

// ── Generators ─────────────────────────────────────────────────────────────────

const SPECIES: Record<string, { label: string; icon: string; eats: string[] }> = {
  wolf:    { label: 'Wolf',     icon: '🐺', eats: ['goat', 'sheep', 'hen'] },
  fox:     { label: 'Fox',      icon: '🦊', eats: ['goose', 'hen'] },
  goat:    { label: 'Goat',     icon: '🐐', eats: ['cabbage', 'hay'] },
  sheep:   { label: 'Sheep',    icon: '🐑', eats: ['hay', 'cabbage'] },
  goose:   { label: 'Goose',    icon: '🪿', eats: ['grain'] },
  hen:     { label: 'Hen',      icon: '🐔', eats: ['grain'] },
  cat:     { label: 'Cat',      icon: '🐈', eats: ['mouse'] },
  mouse:   { label: 'Mouse',    icon: '🐁', eats: ['grain', 'cheese'] },
  dog:     { label: 'Dog',      icon: '🐕', eats: ['cat', 'cheese'] },
  cabbage: { label: 'Cabbages', icon: '🥬', eats: [] },
  hay:     { label: 'Hay',      icon: '🌾', eats: [] },
  grain:   { label: 'Grain',    icon: '🌽', eats: [] },
  cheese:  { label: 'Cheese',   icon: '🧀', eats: [] },
}

const BROTHERS = ['Odo', 'Aldo', 'Bero', 'Egil', 'Hugo', 'Lothar']
const SISTERS = ['Ada', 'Bertha', 'Gisela', 'Hilda', 'Irma', 'Liutgard']
const PAIR_COLORS = ['#c0392b', '#2471a3', '#1e8449', '#a04000', '#7d3c98', '#117a65']

function predatorPuzzle(species: string[], extraSeats: number, boy = false): Puzzle {
  const people: Person[] = [{ label: 'You', icon: '🧑‍🌾', rower: true, weight: 1, role: 'farmer' }]
  for (const k of species) people.push({ label: SPECIES[k].label, icon: SPECIES[k].icon, rower: false, weight: 1, role: k, eats: SPECIES[k].eats })
  // The ferryman's boy can row, but the animals pay him no heed.
  if (boy) people.push({ label: 'Boy', icon: '👦', rower: true, weight: 1, role: 'boy' })
  return { kind: 'predator', people, seats: 1 + extraSeats, maxWeight: 99, optimal: 0 }
}

/** Minimum crossings demanded per tier, and the most we allow. */
export const CROSSING_RANGE: Record<Difficulty, [number, number]> = { 1: [5, 9], 2: [9, 13], 3: [9, 17], 4: [11, 25] }

function finish(p: Puzzle): Puzzle | null {
  const sol = solve(p)
  return sol ? { ...p, optimal: sol.length } : null
}

function inRange(p: Puzzle | null, d: Difficulty): p is Puzzle {
  return !!p && p.optimal >= CROSSING_RANGE[d][0] && p.optimal <= CROSSING_RANGE[d][1]
}

function genPredator(d: Difficulty, rng: Rng): Puzzle | null {
  if (d === 1) {
    const chains = [['wolf', 'goat', 'cabbage'], ['fox', 'goose', 'grain'], ['cat', 'mouse', 'cheese'], ['wolf', 'sheep', 'hay']]
    return finish(predatorPuzzle(chains[Math.floor(rng() * chains.length)], 1))
  }
  const n = scale(d, [3, 4, 5, 6])
  const keys = Object.keys(SPECIES)
  for (let t = 0; t < 400; t++) {
    const pick = shuffle(keys, rng).slice(0, n)
    // Every item must be in at least one conflict, or it is just luggage.
    const conflict = (k: string) => pick.some(o => SPECIES[k].eats.includes(o) || SPECIES[o].eats.includes(k))
    if (!pick.every(conflict)) continue
    // A second free seat makes these collapse to a few crossings, so the
    // boat stays two seats and the menagerie grows instead — with a boy who
    // can row but cannot keep the peace, so both banks need planning.
    const p = finish(predatorPuzzle(pick, 1, true))
    if (inRange(p, d) && p.optimal >= scale(d, [7, 9, 11, 13])) return p
  }
  return null
}

function genJealous(d: Difficulty, rng: Rng): Puzzle | null {
  const pairs = scale(d, [2, 3, 4, 5])
  const seats = scale(d, [2, 2, 3, 3])
  const names = shuffle(BROTHERS.map((b, i) => [b, SISTERS[i]] as const), rng).slice(0, pairs)
  for (let t = 0; t < 60; t++) {
    const people: Person[] = []
    names.forEach(([b, s], i) => {
      people.push({ label: b, icon: '🧔', rower: true, weight: 1, role: 'man', pair: i })
      people.push({ label: s, icon: '👩', rower: true, weight: 1, role: 'woman', pair: i })
    })
    // From D2 some travellers cannot row, when the puzzle stays solvable.
    const nonRowers = t < 40 ? scale(d, [0, 1, 2, 2]) - Math.floor(t / 20) : 0
    for (const i of shuffle(people.map((_, k) => k), rng).slice(0, Math.max(0, nonRowers))) people[i].rower = false
    const p = finish({ kind: 'jealous', people, seats, maxWeight: 99, optimal: 0 })
    if (inRange(p, d)) return p
  }
  return null
}

function genWeight(d: Difficulty, rng: Rng): Puzzle | null {
  if (d === 1 && rng() < 0.5) {
    // Alcuin's own Propositio 19.
    return finish({ kind: 'weight', seats: 4, maxWeight: 2, optimal: 0, people: [
      { label: 'Father', icon: '🧔', rower: true, weight: 2, role: 'adult' },
      { label: 'Mother', icon: '👩', rower: true, weight: 2, role: 'adult' },
      { label: 'Son', icon: '👦', rower: true, weight: 1, role: 'child' },
      { label: 'Daughter', icon: '👧', rower: true, weight: 1, role: 'child' },
    ] })
  }
  const cast: Person[] = [
    { label: 'Father', icon: '🧔', rower: true, weight: 4, role: 'adult' },
    { label: 'Mother', icon: '👩', rower: true, weight: 4, role: 'adult' },
    { label: 'Grandfather', icon: '👴', rower: true, weight: 3, role: 'adult' },
    { label: 'Son', icon: '👦', rower: true, weight: 2, role: 'child' },
    { label: 'Daughter', icon: '👧', rower: true, weight: 2, role: 'child' },
    { label: 'Baby', icon: '👶', rower: false, weight: 1, role: 'child' },
    { label: 'Donkey', icon: '🫏', rower: false, weight: 4, role: 'cargo' },
    { label: 'Wine cask', icon: '🛢️', rower: false, weight: 3, role: 'cargo' },
    { label: 'Grain sack', icon: '🌾', rower: false, weight: 1, role: 'cargo' },
  ]
  const n = scale(d, [4, 5, 6, 7])
  for (let t = 0; t < 400; t++) {
    const pick = shuffle(cast, rng).slice(0, n).map(x => ({ ...x }))
    if (pick.filter(x => x.rower).length < 2) continue
    if (d <= 2 && pick.some(x => x.role === 'cargo')) continue
    // Jitter weights a little so seeds differ.
    for (const x of pick) x.weight = Math.max(1, x.weight + (rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0))
    const heaviest = Math.max(...pick.map(x => x.weight))
    const maxWeight = heaviest + (rng() < 0.5 ? 0 : 1)
    const p = finish({ kind: 'weight', people: pick, seats: d >= 3 ? 3 : 4, maxWeight, optimal: 0 })
    if (inRange(p, d)) return p
  }
  return null
}

/** [pilgrims, bandits, seats] per tier. */
const ESCORT_OPTIONS: Record<Difficulty, [number, number, number][]> = {
  1: [[2, 2, 2], [3, 2, 2]],
  2: [[3, 3, 2], [4, 3, 2]],
  3: [[4, 4, 3], [4, 3, 2], [5, 4, 3]],
  4: [[5, 5, 3], [5, 4, 2], [6, 5, 3]],
}

function genEscort(d: Difficulty, rng: Rng): Puzzle | null {
  const options = ESCORT_OPTIONS[d]
  for (const [pil, ban, seats] of shuffle(options, rng)) {
    const people: Person[] = []
    for (let i = 0; i < pil; i++) people.push({ label: 'Pilgrim', icon: '🧕', rower: true, weight: 1, role: 'pilgrim' })
    for (let i = 0; i < ban; i++) people.push({ label: 'Bandit', icon: '🥷', rower: true, weight: 1, role: 'bandit' })
    const p = finish({ kind: 'escort', people, seats, maxWeight: 99, optimal: 0 })
    if (p && p.optimal >= CROSSING_RANGE[d][0] - 2) return p
  }
  return null
}

export function generatePuzzle(configId: string, difficulty: Difficulty, seed: number): Puzzle {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'wolf-goat')
  for (let attempt = 0; attempt < 8; attempt++) {
    const rng = mulberry32(hashString(`ferry:${configId}:${seed}:${attempt}`))
    const gen = { predator: genPredator, jealous: genJealous, weight: genWeight, escort: genEscort }[cfg.kind]
    const p = gen(difficulty, rng)
    if (p) return p
  }
  return finish(predatorPuzzle(['wolf', 'goat', 'cabbage'], 1))!
}

export interface FerryRules { lives: number; undo: boolean; cap: number }

export function rulesFor(difficulty: Difficulty, optimal: number): FerryRules {
  return {
    lives: scale(difficulty, [Infinity, Infinity, 3, 2]),
    undo: difficulty <= 2,
    cap: scale(difficulty, [optimal * 3, Math.ceil(optimal * 2.5), optimal * 2, optimal + Math.max(2, Math.ceil(optimal / 4))]),
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function FerryGame({ configId, difficulty, seed, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'wolf-goat')
  const puzzle = useMemo(() => generatePuzzle(configId, difficulty, seed), [configId, difficulty, seed])
  const rules = rulesFor(difficulty, puzzle.optimal)
  const n = puzzle.people.length

  const [state, setState] = useState<FerryState>({ far: 0, boat: 0 })
  const [history, setHistory] = useState<FerryState[]>([])
  const [load, setLoad] = useState<number[]>([])
  const [trips, setTrips] = useState(0)
  const [lives, setLives] = useState(rules.lives)
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const onSide = (i: number) => ((state.far >> i) & 1) === state.boat
  const toggle = (i: number) => {
    if (settled || !onSide(i)) return
    setMessage(null)
    setLoad(l => (l.includes(i) ? l.filter(x => x !== i) : l.length >= puzzle.seats ? l : [...l, i]))
  }

  const row = useCallback(() => {
    if (settled) return
    const r = cross(puzzle, state, load)
    if ('error' in r) {
      const isRule = !loadProblem(puzzle, load) && !r.error.startsWith('Only')
      if (isRule && Number.isFinite(rules.lives)) {
        const left = lives - 1
        setLives(left)
        setMessage({ text: `${r.error}! ${left > 0 ? `${left} ${left === 1 ? 'life' : 'lives'} left.` : ''}`, bad: true })
        if (left <= 0) lose(r.error)
      } else {
        setMessage({ text: `${r.error}.`, bad: true })
      }
      return
    }
    const t = trips + 1
    setHistory(h => [...h, state])
    setState(r.state)
    setTrips(t)
    setLoad([])
    setMessage(null)
    if (isDone(puzzle, r.state)) win()
    else if (t >= rules.cap) lose('Night fell before everyone was across')
  }, [settled, puzzle, state, load, rules, lives, trips, win, lose])

  const undo = () => {
    if (settled || !rules.undo || !history.length) return
    setState(history[history.length - 1])
    setHistory(h => h.slice(0, -1))
    setTrips(t => t - 1)
    setLoad([])
    setMessage(null)
  }

  const chip = (i: number, where: 'bank' | 'boat') => {
    const p = puzzle.people[i]
    const color = p.pair !== undefined ? PAIR_COLORS[p.pair % PAIR_COLORS.length] : undefined
    return (
      <button key={i} type="button" onClick={() => toggle(i)} data-person={i}
        aria-label={`${p.label}${where === 'boat' ? ' (in boat)' : ''}`}
        className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] font-bold leading-tight text-left
          ${where === 'boat' ? 'bg-accent/15 border-accent' : onSide(i) ? 'bg-panel border-line hover:border-accent/60' : 'bg-panel/60 border-line text-muted'}`}
        style={color ? { borderLeft: `4px solid ${color}` } : undefined}>
        <span className="text-base leading-none">{p.icon}</span>
        <span className="min-w-0">
          <span className="block truncate">{p.label}</span>
          {(puzzle.kind === 'weight' || !p.rower) && (
            <span className="block text-[9px] text-muted font-normal">{puzzle.kind === 'weight' ? `${p.weight} load${p.weight === 1 ? '' : 's'}` : ''}{!p.rower ? `${puzzle.kind === 'weight' ? ' · ' : ''}can't row` : ''}</span>
          )}
        </span>
      </button>
    )
  }

  const bank = (side: 0 | 1) => (
    <div className="flex flex-col gap-1 min-h-[160px] p-1.5 rounded-lg bg-[#cfe3b4]/50 border border-line" data-testid={side ? 'far-bank' : 'near-bank'}>
      <p className="text-[9px] uppercase tracking-widest text-muted font-bold text-center">{side ? 'Far bank' : 'Near bank'}</p>
      {Array.from({ length: n }, (_, i) => i).filter(i => ((state.far >> i) & 1) === side && !load.includes(i)).map(i => chip(i, 'bank'))}
    </div>
  )

  const capacity = puzzle.kind === 'weight' ? `carries ${puzzle.maxWeight} load${puzzle.maxWeight === 1 ? '' : 's'}` : `${puzzle.seats} seat${puzzle.seats === 1 ? '' : 's'}`

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2 text-sm" data-testid="ferry-trips">{trips} / {rules.cap}</p>
          <p>crossings</p>
          <p>best: {puzzle.optimal}</p>
          {Number.isFinite(rules.lives) && <p className="text-red-600 font-bold" data-testid="ferry-lives">{'♥'.repeat(Math.max(0, lives))}</p>}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_92px_1fr] gap-1.5 w-full max-w-[430px] mx-auto">
        {bank(0)}
        <div className="relative rounded-lg bg-[#9cc5d8]/60 border border-line flex flex-col">
          <div className={`absolute top-2 ${state.boat ? 'right-1' : 'left-1'} w-[calc(100%-8px)] max-w-[84px] transition-all duration-500`}>
            <div className="rounded-b-[40%] rounded-t-md bg-[#8b5a2b] border-2 border-[#5c3a17] p-1 flex flex-col gap-1 min-h-[54px]" data-testid="boat">
              <p className="text-[8px] text-[#f5e6c8] text-center font-bold">⛵ {capacity}</p>
              {load.map(i => chip(i, 'boat'))}
            </div>
          </div>
        </div>
        {bank(1)}
      </div>

      {message && (
        <p className={`text-[11px] text-center font-bold ${message.bad ? 'text-red-600' : 'text-ink-2'}`} role="status">{message.text}</p>
      )}

      {!settled && (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[430px] mx-auto">
          <button type="button" onClick={row}
            className="h-11 rounded-lg bg-accent text-accent-fg text-sm font-bold disabled:opacity-40" disabled={!load.length}>
            Row {state.boat ? '◀ back' : 'across ▶'}
          </button>
          <button type="button" onClick={undo} disabled={!rules.undo || !history.length}
            className="h-11 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold disabled:opacity-40">
            {rules.undo ? '↶ Undo crossing' : 'No undo at this level'}
          </button>
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">{settled ? '' : 'Tap travellers on the boat’s bank to board them, then row.'}</p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Everyone is across!" loseTitle="The crossing failed" />
    </div>
  )
}
