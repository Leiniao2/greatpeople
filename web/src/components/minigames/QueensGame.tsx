import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, useGameTimer, OutcomeBanner, TimerBar, type Rng } from './_shared'

// Eight Queens: place N queens so that none can take another.  Every config
// is its own rule twist:
//
//   gauss       classic queens (row, column, diagonal) around pre-placed queens.
//   bezzel      classic queens on a board with ruined squares no queen may use.
//   alhambra    'regions': one queen per row, column and coloured region, and no
//               two queens touching, even corner to corner (Star Battle style).
//   versailles  'parterre': one queen per row, column and flower bed, and the
//               queens' diagonals reach the whole board.
//   polya       'torus': classic queens on a board whose edges wrap round, so
//               diagonals run off one side and come back on the other.
//
// Region boards always have exactly one solution; classic and torus boards
// are squeezed towards one with ruins and pre-placed queens.  A queen is only
// accepted if the board can still be finished with it; a queen that clashes,
// or that leads nowhere, is turned away and costs a mistake.  Marks (✕) are
// free notes.
//
// Time budget (engaged player): boards are at most 8×8 (7×7 at D1, with covered squares shaded), D1–D2
// shade covered squares and have no clock, and the D3/D4 clocks are 2½ and 3
// minutes, so no level runs past ~3 minutes.

export type Mode = 'classic' | 'regions' | 'parterre' | 'torus'
export const hasRegions = (m: Mode) => m === 'regions' || m === 'parterre'

export interface QueensConfig {
  title: string
  intro: string
  fact: string
  mode: Mode
  sizes: [number, number, number, number]
  /** Classic: ruined squares per tier; 'tight' blocks squares until the answer is (nearly) unique. */
  blocked?: [number | 'tight', number | 'tight', number | 'tight', number | 'tight']
  givens?: [number, number, number, number]
  /** Region boards: palette of region colours. */
  palette?: string[]
}

const GLAZES = ['#9cc5e8', '#f2c48d', '#b9dca0', '#e8a7a7', '#d3b8e6', '#f3e08f', '#9fd8cf', '#e7b9d4', '#c9c0a8', '#a9b4e8']
const PARTERRE = ['#a8d5a2', '#f4b6c2', '#f7dc8b', '#b9c6f0', '#d7b98f', '#c8e6c9', '#f2a97e', '#d9c2f0', '#9ed0e6', '#e6e19a']

export const CONFIGS: Record<string, QueensConfig> = {
  gauss: {
    title: 'Gauss’s Letters, 1850',
    intro: 'Gauss and Schumacher argued by letter over the eight queens. Some of their queens are already on the board and stay put — place the rest so no two share a row, column or diagonal.',
    fact: 'Gauss took up the eight queens puzzle in letters to Schumacher in 1850; Franz Nauck published all 92 solutions that same year.',
    mode: 'classic',
    sizes: [6, 7, 7, 8],
    blocked: [0, 0, 0, 'tight'],
    givens: [1, 2, 1, 2],
  },
  bezzel: {
    title: 'Bezzel’s Puzzle, 1848',
    intro: 'Max Bezzel posed the puzzle in the Berlin chess newspaper. Dark ruined squares can hold no queen — place one per row with no two sharing a row, column or diagonal.',
    fact: 'The chess composer Max Bezzel first published the eight queens puzzle in the Berliner Schachzeitung in 1848.',
    mode: 'classic',
    sizes: [5, 6, 7, 8],
    blocked: [2, 3, 'tight', 'tight'],
    givens: [0, 0, 0, 0],
  },
  alhambra: {
    title: 'Tiles of the Alhambra',
    intro: 'Each coloured glaze needs exactly one queen — one per row, column and colour. Diagonals don’t matter here, but no two queens may touch, not even corner to corner.',
    fact: 'The Alhambra’s tilework, built by the Nasrid sultans of Granada in the 13th–14th centuries, inspired M. C. Escher after his visit in 1922.',
    mode: 'regions',
    sizes: [5, 6, 7, 8],
    palette: GLAZES,
  },
  'vassal-kings': {
    title: 'The Sworn Kings of Pegu',
    intro: 'Each conquered realm keeps exactly one sworn king — one throne per row, column and realm. Diagonals don’t matter, but no two thrones may touch, not even corner to corner, or the neighbours will plot together.',
    fact: 'Bayinnaung usually left defeated rulers on their thrones as sworn vassals and kept their sons at his court in Pegu as hostages — the future king Naresuan of Siam grew up there. The system held only as long as Bayinnaung lived.',
    mode: 'regions',
    sizes: [5, 6, 7, 8],
    palette: GLAZES,
  },
  versailles: {
    title: 'The Parterres of Versailles',
    intro: 'Le Nôtre’s flower beds each want one queen — one per row, column and bed — and these are true queens: no two may share a diagonal, however far apart.',
    fact: 'André Le Nôtre laid out the gardens of Versailles for Louis XIV from 1661; the work took some forty years.',
    mode: 'parterre',
    sizes: [5, 6, 7, 8],
    palette: PARTERRE,
  },
  'uppsala-garden': {
    title: 'The Uppsala Botanic Garden',
    intro: 'Linnaeus plants one tall tree per row of beds. Some trees already stand and stay put; plant the rest so that no two share a row, a column or a diagonal and none shades another.',
    fact: 'From 1741 Linnaeus rebuilt Uppsala University’s neglected botanic garden, ordering its beds by his sexual system of plants; by his time it grew about 3,000 species. Restored, it is now the Linnaean Garden.',
    mode: 'classic',
    sizes: [6, 7, 7, 8],
    blocked: [0, 0, 0, 'tight'],
    givens: [1, 2, 1, 2],
  },
  polya: {
    title: 'Pólya’s Doughnut, 1918',
    intro: 'This board wraps round like a doughnut: a diagonal that runs off one edge comes back on the opposite side. Place the queens so none shares a row, column or wrapped diagonal.',
    fact: 'In 1918 George Pólya showed that n queens can sit in peace on a board whose edges wrap round (a torus) exactly when n shares no factor with 6 — so 5 and 7 work, but 8 never does.',
    mode: 'torus',
    sizes: [7, 7, 7, 7],
    blocked: [0, 2, 'tight', 'tight'],
    givens: [2, 1, 0, 0],
  },
}

/** Lives: the game is lost when this many queens have been turned away. */
export const livesFor = (d: Difficulty) => scale(d, [5, 4, 3, 2])
export const timerFor = (d: Difficulty) => scale(d, [0, 0, 150, 180])
/** The time budget: the largest board at each difficulty. */
export const MAX_SIZE: readonly [number, number, number, number] = [7, 7, 7, 8]
export const shadingFor = (d: Difficulty) => d <= 2

export interface Puzzle {
  n: number
  mode: Mode
  blocked: number[]
  /** Region id per cell (regions mode). */
  regions: number[] | null
  givens: number[]
  /** One verified answer. */
  solution: number[]
}

// ── Solver ──────────────────────────────────────────────────────────────────

/**
 * Count completions of `placed` (cells) up to `cap`, row by row with bit
 * masks.  Returns the count and the first completion (cells by row).
 */
export function solveQueens(p: Pick<Puzzle, 'n' | 'mode' | 'blocked' | 'regions'>, placed: readonly number[] = [], cap = 1): { count: number; first: number[] | null } {
  const { n, mode, regions } = p
  const fixed = new Array<number>(n).fill(-1)
  for (const cell of placed) {
    const r = Math.floor(cell / n)
    if (fixed[r] !== -1 && fixed[r] !== cell % n) return { count: 0, first: null }
    fixed[r] = cell % n
  }
  const blockedRow = new Array<number>(n).fill(0)
  for (const b of p.blocked) blockedRow[Math.floor(b / n)] |= 1 << (b % n)
  const cols = new Array<number>(n).fill(0)
  const diag = mode === 'classic' || mode === 'parterre'
  const torus = mode === 'torus'
  const regs = hasRegions(mode)
  let count = 0
  let first: number[] | null = null
  const rec = (r: number, colMask: number, d1: number, d2: number, regMask: number, prev: number) => {
    if (count >= cap) return
    if (r === n) {
      count++
      if (!first) first = cols.map((c, i) => i * n + c)
      return
    }
    const lo = fixed[r] >= 0 ? fixed[r] : 0
    const hi = fixed[r] >= 0 ? fixed[r] : n - 1
    for (let c = lo; c <= hi; c++) {
      const bit = 1 << c
      if (colMask & bit || blockedRow[r] & bit) continue
      let a = 0, b = 0
      if (diag) { a = 1 << (r + c); b = 1 << (r - c + n - 1) }
      else if (torus) { a = 1 << ((r + c) % n); b = 1 << ((r - c + n) % n) }
      if (d1 & a || d2 & b) continue
      let g = 0
      if (regs) {
        g = 1 << regions![r * n + c]
        if (regMask & g) continue
        if (mode === 'regions' && r > 0 && Math.abs(c - prev) <= 1) continue
      }
      cols[r] = c
      rec(r + 1, colMask | bit, d1 | a, d2 | b, regMask | g, c)
      if (count >= cap) return
    }
  }
  rec(0, 0, 0, 0, 0, -9)
  return { count, first }
}

/** All completions (up to `cap`), as cell lists. */
export function allSolutions(p: Pick<Puzzle, 'n' | 'mode' | 'blocked' | 'regions'>, placed: readonly number[] = [], cap = 5000): number[][] {
  // Simple enumeration through the same masks.
  const out: number[][] = []
  const { n } = p
  const walk = (prefix: number[]) => {
    if (out.length >= cap) return
    if (prefix.length === n) { out.push(prefix.slice()); return }
    const r = prefix.length
    const fixed = placed.find(c => Math.floor(c / n) === r)
    for (let c = 0; c < n; c++) {
      if (fixed !== undefined && fixed !== r * n + c) continue
      const cell = r * n + c
      if (!canJoin(p, prefix, cell)) continue
      prefix.push(cell)
      walk(prefix)
      prefix.pop()
    }
  }
  walk([])
  return out
}

/** Does `cell` clash with any queen already in `queens` (or stand on a ruin)? */
export function canJoin(p: Pick<Puzzle, 'n' | 'mode' | 'blocked' | 'regions'>, queens: readonly number[], cell: number): boolean {
  return clashWith(p, queens, cell) === null && !p.blocked.includes(cell)
}

/** The first queen that `cell` would clash with, if any. */
export function clashWith(p: Pick<Puzzle, 'n' | 'mode' | 'regions'>, queens: readonly number[], cell: number): number | null {
  const { n } = p
  const r = Math.floor(cell / n), c = cell % n
  for (const q of queens) {
    if (q === cell) continue
    const qr = Math.floor(q / n), qc = q % n
    if (qr === r || qc === c) return q
    if (p.mode === 'classic' || p.mode === 'parterre') { if (Math.abs(qr - r) === Math.abs(qc - c)) return q }
    if (p.mode === 'torus') { if ((qr + qc) % n === (r + c) % n || (qr - qc + n) % n === (r - c + n) % n) return q }
    if (hasRegions(p.mode) && p.regions![q] === p.regions![cell]) return q
    if (p.mode === 'regions' && Math.abs(qr - r) <= 1 && Math.abs(qc - c) <= 1) return q
  }
  return null
}

/** How `cell` clashes with the queen on `by`, in words. */
export function clashKind(p: Pick<Puzzle, 'n' | 'mode' | 'regions'>, by: number, cell: number): string {
  const { n } = p
  const dr = Math.abs(Math.floor(by / n) - Math.floor(cell / n)), dc = Math.abs((by % n) - (cell % n))
  if (dr === 0) return 'in the same row as'
  if (dc === 0) return 'in the same column as'
  if (hasRegions(p.mode) && p.regions![by] === p.regions![cell]) return 'in the same colour as'
  if (p.mode === 'regions') return 'touching'
  if (p.mode === 'torus' && dr !== dc) return 'on a wrapped diagonal with'
  return 'on a diagonal with'
}

export const extendable = (p: Puzzle, queens: readonly number[]) => solveQueens(p, queens, 1).count > 0

// ── Generators ──────────────────────────────────────────────────────────────

function randomSolution(n: number, mode: Mode, rng: Rng): number[] {
  // Regions placeholder: each row its own region so only the no-touch (or diagonal) rule bites.
  const p = { n, mode, blocked: [] as number[], regions: hasRegions(mode) ? new Array<number>(n * n).fill(0).map((_, i) => Math.floor(i / n)) : null }
  const out: number[] = []
  const walk = (): boolean => {
    if (out.length === n) return true
    const r = out.length
    for (const c of shuffle(Array.from({ length: n }, (_, i) => i), rng)) {
      const cell = r * n + c
      if (clashWith(p, out, cell) !== null) continue
      out.push(cell)
      if (walk()) return true
      out.pop()
    }
    return false
  }
  walk()
  return out
}

/** Grow one region from each queen of the answer, picking frontier cells at random. */
export function growRegions(n: number, solution: number[], rng: Rng): number[] {
  const reg = new Array<number>(n * n).fill(-1)
  solution.forEach((cell, k) => { reg[cell] = k })
  const nb = (i: number) => {
    const r = Math.floor(i / n), c = i % n, o: number[] = []
    if (r > 0) o.push(i - n); if (r < n - 1) o.push(i + n); if (c > 0) o.push(i - 1); if (c < n - 1) o.push(i + 1)
    return o
  }
  let left = n * n - n
  while (left > 0) {
    const frontier: number[] = []
    for (let i = 0; i < n * n; i++) if (reg[i] === -1 && nb(i).some(j => reg[j] >= 0)) frontier.push(i)
    const cell = frontier[Math.floor(rng() * frontier.length)]
    const owners = nb(cell).filter(j => reg[j] >= 0).map(j => reg[j])
    reg[cell] = owners[Math.floor(rng() * owners.length)]
    left--
  }
  return reg
}

/**
 * Nudge region borders until the answer is unique: take another answer, move
 * one of its squares (not one of the true queens) into a neighbouring region
 * so long as every region stays in one piece, and keep the change if it does
 * not add answers.
 */
export function refineRegions(n: number, solution: number[], regions: number[], rng: Rng, steps = 400, mode: Mode = 'regions'): number[] {
  let reg = regions.slice()
  const count = (r: number[]) => solveQueens({ n, mode, blocked: [], regions: r }, [], 40).count
  let cur = count(reg)
  const sol = new Set(solution)
  const nb = (i: number) => {
    const r = Math.floor(i / n), c = i % n, o: number[] = []
    if (r > 0) o.push(i - n); if (r < n - 1) o.push(i + n); if (c > 0) o.push(i - 1); if (c < n - 1) o.push(i + 1)
    return o
  }
  const connected = (r: number[], g: number) => {
    const cells = r.map((v, i) => (v === g ? i : -1)).filter(i => i >= 0)
    if (!cells.length) return false
    const seen = new Set([cells[0]]), stack = [cells[0]]
    while (stack.length) { const x = stack.pop()!; for (const y of nb(x)) if (r[y] === g && !seen.has(y)) { seen.add(y); stack.push(y) } }
    return seen.size === cells.length
  }
  for (let step = 0; step < steps && cur > 1; step++) {
    const others = allSolutions({ n, mode, blocked: [], regions: reg }, [], 2).filter(a => a.join() !== solution.join())
    if (!others.length) break
    const alt = others[0].filter(x => !sol.has(x))
    const x = alt[Math.floor(rng() * alt.length)]
    const targets = [...new Set(nb(x).map(y => reg[y]).filter(g => g !== reg[x]))]
    if (!targets.length) continue
    const next = reg.slice()
    const from = next[x]
    next[x] = targets[Math.floor(rng() * targets.length)]
    if (!connected(next, from)) continue
    const c = count(next)
    if (c <= cur) { reg = next; cur = c }
  }
  return reg
}

/** The level's puzzle; every one is checked to have at least one answer. */
export function makePuzzle(configId: string, config: QueensConfig, d: Difficulty, seed: number): Puzzle {
  const rng = mulberry32(seed ^ hashString(`queens:${configId}:${d}`))
  const n = config.sizes[d - 1]
  const mode = config.mode
  if (hasRegions(mode)) {
    let best: { regions: number[]; solution: number[]; count: number } | null = null
    for (let attempt = 0; attempt < 20; attempt++) {
      const solution = randomSolution(n, mode, rng)
      const regions = refineRegions(n, solution, growRegions(n, solution, rng), rng, 400, mode)
      const count = solveQueens({ n, mode, blocked: [], regions }, [], 2).count
      if (!best || count < best.count) best = { regions, solution, count }
      if (count === 1) break
    }
    const { regions, solution } = best!
    const givens: number[] = []
    // Seldom needed: pin the true queen that rules out the most other answers.
    let others = allSolutions({ n, mode, blocked: [], regions }, [], 500).filter(a => a.join() !== solution.join())
    while (others.length) {
      const pin = solution.filter(c => !givens.includes(c))
        .map(c => ({ c, kill: others.filter(a => !a.includes(c)).length }))
        .sort((a, b) => b.kill - a.kill)[0]
      givens.push(pin.c)
      others = others.filter(a => a.includes(pin.c))
    }
    return { n, mode, blocked: [], regions, givens: givens.sort((a, b) => a - b), solution }
  }

  const solution = randomSolution(n, mode, rng)
  const want = config.givens?.[d - 1] ?? 0
  const givens = shuffle(solution, rng).slice(0, want).sort((a, b) => a - b)
  const spec = config.blocked?.[d - 1] ?? 0
  const free = Array.from({ length: n * n }, (_, i) => i).filter(i => !solution.includes(i))
  let blocked: number[]
  if (spec === 'tight') {
    // Greedy: ruin the square that kills the most other answers, until one is left (or 10 ruins).
    blocked = []
    let sols = allSolutions({ n, mode, blocked: [], regions: null }, givens).filter(s => s.join() !== solution.join())
    const order = shuffle(free, rng)
    while (sols.length && blocked.length < 10) {
      let bestCell = -1, bestHits = 0
      for (const cell of order) {
        if (blocked.includes(cell)) continue
        let hits = 0
        for (const s of sols) if (s.includes(cell)) hits++
        if (hits > bestHits) { bestHits = hits; bestCell = cell }
      }
      if (bestCell < 0) break
      blocked.push(bestCell)
      sols = sols.filter(s => !s.includes(bestCell))
    }
  } else {
    blocked = shuffle(free, rng).slice(0, spec)
  }
  return { n, mode, blocked: blocked.sort((a, b) => a - b), regions: null, givens, solution }
}

/** Squares a placed queen already covers (for shading and the "cover" check). */
export function covered(p: Puzzle, queens: readonly number[]): Set<number> {
  const out = new Set<number>()
  for (let cell = 0; cell < p.n * p.n; cell++) {
    if (queens.includes(cell)) continue
    if (clashWith(p, queens, cell) !== null) out.add(cell)
  }
  return out
}

// ── Component ───────────────────────────────────────────────────────────────

const RULE_TAG: Record<Mode, string> = {
  classic: 'rows, columns, diagonals',
  regions: 'one per colour · no touching',
  parterre: 'one per bed · full diagonals',
  torus: 'diagonals wrap round',
}

const START_NOTE: Record<Mode, string> = {
  classic: 'Tap a square to place a queen.',
  regions: 'One queen per colour — and none touching.',
  parterre: 'One queen per bed — and watch the long diagonals.',
  torus: 'Remember: diagonals leaving one edge re-enter on the other.',
}

export default function QueensGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'gauss')
  const puzzle = useMemo(() => makePuzzle(configId, config, difficulty, seed), [configId, config, difficulty, seed])
  const { n } = puzzle
  const lives = livesFor(difficulty)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds: timerFor(difficulty), running: !settled, onExpire: () => lose('time ran out') })

  const [queens, setQueens] = useState<number[]>(puzzle.givens)
  const [marks, setMarks] = useState<Set<number>>(() => new Set())
  const [mode, setMode] = useState<'queen' | 'mark'>('queen')
  const [mistakes, setMistakes] = useState(0)
  const [flash, setFlash] = useState<{ cell: number; by: number | null } | null>(null)
  const [note, setNote] = useState(START_NOTE[config.mode])

  const givens = useMemo(() => new Set(puzzle.givens), [puzzle])
  const blocked = useMemo(() => new Set(puzzle.blocked), [puzzle])
  const cover = useMemo(() => (shadingFor(difficulty) ? covered(puzzle, queens) : new Set<number>()), [puzzle, queens, difficulty])
  const name = (cell: number) => `${'abcdefghij'[cell % n]}${n - Math.floor(cell / n)}`

  const tap = (cell: number) => {
    if (settled || blocked.has(cell)) return
    if (mode === 'mark') {
      if (queens.includes(cell)) return
      const m = new Set(marks)
      if (m.has(cell)) m.delete(cell); else m.add(cell)
      setMarks(m)
      return
    }
    if (queens.includes(cell)) {
      if (givens.has(cell)) { setNote('That queen was set by the puzzle and stays.'); return }
      setQueens(queens.filter(q => q !== cell))
      setFlash(null)
      return
    }
    const by = clashWith(puzzle, queens, cell)
    const next = [...queens, cell]
    if (by !== null || !extendable(puzzle, next)) {
      const k = mistakes + 1
      setMistakes(k)
      setFlash({ cell, by })
      const why = by === null
        ? `A queen on ${name(cell)} leaves no way to finish the board.`
        : `${name(cell)} is ${clashKind(puzzle, by, cell)} the queen on ${name(by)}.`
      setNote(`✗ ${why}`)
      if (k >= lives) lose('too many queens turned away')
      return
    }
    const m = new Set(marks); m.delete(cell)
    setMarks(m)
    setQueens(next)
    setFlash(null)
    if (next.length === n) { setNote(`All ${n} queens stand in peace!`); win(); return }
    setNote(`${next.length} / ${n} queens placed.`)
  }

  const palette = config.palette ?? GLAZES

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 select-none">
      <div className="rounded-xl border border-line bg-panel px-3 py-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-accent truncate">{config.title}</p>
          <p className="text-ink text-sm font-semibold leading-tight">
            {queens.length} / {n} queens · {RULE_TAG[puzzle.mode]}
          </p>
        </div>
        <p className={`text-sm font-bold shrink-0 ${lives - mistakes <= 1 ? 'text-red-600' : 'text-accent'}`} data-testid="lives" aria-label={`${Math.max(0, lives - mistakes)} lives left`}>
          {'♥'.repeat(Math.max(0, lives - mistakes))}<span className="text-muted">{'♡'.repeat(Math.min(lives, mistakes))}</span>
        </p>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}
      <p className="text-[11px] leading-snug text-muted -mt-1" data-testid="queens-rule">{config.intro}</p>

      <div className="flex justify-center">
        <div
          className={`grid w-full max-w-[400px] aspect-square rounded-lg overflow-hidden border-2 shadow-md ${puzzle.mode === 'torus' ? 'border-dashed border-accent' : 'border-[#3b2a1d]'}`}
          style={{ gridTemplateColumns: `repeat(${n}, 1fr)`, containerType: 'inline-size' }}
          data-testid="queens-board"
        >
          {Array.from({ length: n * n }, (_, cell) => {
            const r = Math.floor(cell / n), c = cell % n
            const light = (r + c) % 2 === 0
            const q = queens.includes(cell)
            const isFlash = flash?.cell === cell
            const isBy = flash?.by === cell
            const reg = puzzle.regions?.[cell]
            const style: React.CSSProperties = {}
            if (hasRegions(puzzle.mode)) {
              style.background = palette[reg! % palette.length]
              const edge = (other: number | undefined) => (other !== undefined && other !== reg ? '2px solid #3b2a1d' : '1px solid rgba(59,42,29,.18)')
              style.borderTop = edge(r > 0 ? puzzle.regions![cell - n] : undefined)
              style.borderLeft = edge(c > 0 ? puzzle.regions![cell - 1] : undefined)
            }
            const bg = hasRegions(puzzle.mode) ? '' : (light ? 'bg-[#f0d9b5]' : 'bg-[#b58863]')
            return (
              <button
                key={cell}
                data-cell={cell}
                data-queen={q ? '1' : undefined}
                aria-label={`${name(cell)}${blocked.has(cell) ? ' ruined' : q ? ' queen' : ''}`}
                onClick={() => tap(cell)}
                className={`relative aspect-square ${bg} ${isFlash ? 'ring-4 ring-inset ring-red-500' : ''} ${isBy ? 'ring-4 ring-inset ring-amber-400' : ''}`}
                style={style}
              >
                {blocked.has(cell) && <span className="absolute inset-0 bg-[#3b2a1d] flex items-center justify-center text-[#7a5a3c]" style={{ fontSize: `calc(100cqw / ${n} * 0.4)` }}>✕</span>}
                {cover.has(cell) && !blocked.has(cell) && <span className="absolute inset-0 bg-black/20" />}
                {marks.has(cell) && !q && <span className="absolute inset-0 flex items-center justify-center text-ink/60 font-bold" style={{ fontSize: `calc(100cqw / ${n} * 0.34)` }}>✕</span>}
                {(q || isFlash) && (
                  <span
                    className={`absolute inset-0 flex items-center justify-center leading-none ${isFlash ? 'opacity-60' : ''}`}
                    style={{ fontSize: `calc(100cqw / ${n} * 0.7)`, color: isFlash ? '#b91c1c' : givens.has(cell) ? '#3b2a1d' : '#1c1612', textShadow: '0 0 2px #fff' }}
                  >
                    ♛{'︎'}
                  </span>
                )}
                {givens.has(cell) && <span className="absolute right-0.5 bottom-0 text-[8px] text-[#3b2a1d]">●</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 min-h-[2.5rem]">
        <p className={`text-xs leading-snug ${flash ? 'text-red-700' : 'text-ink-2'}`} role="status">{note}</p>
        <div className="flex rounded-lg border border-line overflow-hidden shrink-0" role="group" aria-label="tool">
          {(['queen', 'mark'] as const).map(m => (
            <button key={m} data-tool={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-bold ${mode === m ? 'bg-accent text-accent-fg' : 'bg-panel text-ink'}`}>
              {m === 'queen' ? '♛ Queen' : '✕ Mark'}
            </button>
          ))}
        </div>
      </div>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The queens are at peace!" loseTitle="The court is in uproar" />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
