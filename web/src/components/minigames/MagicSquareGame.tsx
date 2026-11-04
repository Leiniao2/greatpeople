import { useMemo, useState, useCallback, useEffect } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Lo Shu: complete a normal magic square — the numbers 1…n² once each, every
// row, column and both long diagonals summing to n(n²+1)/2 — under one of four
// rule sets, one per config:
//
//   classic      rows, columns and the two long diagonals (Lo Shu).
//   durer        4×4; also the four quarters, the centre 2×2 and the four
//                corners must each make 34 (Dürer's Melencolia square).
//   pandiagonal  every diagonal counts, including the "broken" ones that wrap
//                round the edge (the Chautisa Yantra of Khajuraho).
//   bordered     5×5 with a magic 3×3 core: the inner rows, columns and
//                diagonals must each make 39 (a wafq with a border).
//
// The extra groups change which deductions work: Dürer and pandiagonal
// squares have many more one-blank lines to chain through, and the bordered
// square has two different sums to juggle.
//
// Time budget (engaged player): ~1 min at D1 to ~3 min at D4.  Blanks per
// puzzle are capped by `MAX_BLANKS` (≤ 6 at D1, ≤ 12 at D4) and squares are
// at most 5×5.  Givens are removed from a full square one at a time, keeping a
// removal only while the solver still finds exactly one completion, so every
// puzzle has a unique answer.  A mistake is counted when an entry completes a
// group whose sum is wrong.

export type Rule = 'classic' | 'durer' | 'pandiagonal' | 'bordered'

interface SquareConfig {
  title: string
  intro: string
  fact: string
  rule: Rule
}

export const CONFIGS: Record<string, SquareConfig> = {
  'lo-shu': {
    title: 'The Turtle of the Luo River',
    intro: 'The dots on the turtle’s shell are half washed away. Restore them: every row, column and both long diagonals must share one sum.',
    fact: 'Chinese legend tells of a turtle that rose from the Luo River in the days of Yu the Great with a pattern of dots on its shell, every line summing to 15. Up to rotation and reflection, the Lo Shu is the only 3×3 magic square there is.',
    rule: 'classic',
  },
  'durer': {
    title: 'Melencolia I',
    intro: 'Dürer’s square hides more than lines: each of the four quarters, the centre 2×2 and the four corners must also make 34.',
    fact: 'Albrecht Dürer engraved a 4×4 magic square into Melencolia I in 1514. Every line sums to 34 — and so do its quarters, its centre and its corners. The two middle cells of the bottom row read 15 14, the year of the engraving.',
    rule: 'durer',
  },
  'jaina-yantra': {
    title: 'The Chautisa Yantra',
    intro: 'A pandiagonal square: every diagonal counts, even the broken ones that run off one edge and wrap round to the other.',
    fact: 'A 10th-century inscription at the Parshvanath Jain temple in Khajuraho holds the Chautisa (“thirty-four”) Yantra, a 4×4 square so perfect that even its broken diagonals sum to 34 — one of the oldest known pandiagonal magic squares.',
    rule: 'pandiagonal',
  },
  'islamic-wafq': {
    title: 'The Bordered Wafq',
    intro: 'A square within a square: the whole 5×5 is magic, and its inner 3×3 core is magic too — each inner line makes 39.',
    fact: 'Medieval Arabic writers called magic squares wafq al-aʿdād, “the harmonious arrangement of numbers.” Scholars from the Brethren of Purity to al-Būnī built bordered squares: strip off the outer ring and a smaller magic square remains.',
    rule: 'bordered',
  },
}

// ── Squares and groups ─────────────────────────────────────────────────────────

export type Grid = number[][]
export type Cell = [number, number]

export const magicSum = (n: number) => (n * (n * n + 1)) / 2

/** A set of cells that must sum to `target`. */
export interface Group {
  cells: Cell[]
  target: number
  /** Main lines are drawn as chips beside the square; extras below it. */
  kind: 'row' | 'col' | 'diag' | 'extra'
  label: string
}

const LO_SHU: Grid = [[4, 9, 2], [3, 5, 7], [8, 1, 6]]
export const DURER: Grid = [[16, 3, 2, 13], [5, 10, 11, 8], [9, 6, 7, 12], [4, 15, 14, 1]]
export const CHAUTISA: Grid = [[7, 12, 1, 14], [2, 13, 8, 11], [16, 3, 10, 5], [9, 6, 15, 4]]

/** Rows, columns and both diagonals of an n×n square as lists of [r, c]. */
export function linesOf(n: number): Cell[][] {
  const lines: Cell[][] = []
  for (let i = 0; i < n; i++) {
    lines.push(Array.from({ length: n }, (_, k) => [i, k] as Cell))
    lines.push(Array.from({ length: n }, (_, k) => [k, i] as Cell))
  }
  lines.push(Array.from({ length: n }, (_, k) => [k, k] as Cell))
  lines.push(Array.from({ length: n }, (_, k) => [k, n - 1 - k] as Cell))
  return lines
}

/** Every group a square of this rule must satisfy (main lines first, in `linesOf` order). */
export function groupsFor(rule: Rule, n: number): Group[] {
  const M = magicSum(n)
  const out: Group[] = linesOf(n).map((cells, i) => ({
    cells, target: M,
    kind: i < 2 * n ? (i % 2 ? 'col' : 'row') : 'diag',
    label: i < 2 * n ? `${i % 2 ? 'col' : 'row'} ${Math.floor(i / 2) + 1}` : i === 2 * n ? '↘' : '↙',
  }))
  if (rule === 'durer' && n === 4) {
    const box = (r: number, c: number): Cell[] => [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]]
    out.push({ cells: box(0, 0), target: M, kind: 'extra', label: '◰ quarter' })
    out.push({ cells: box(0, 2), target: M, kind: 'extra', label: '◳ quarter' })
    out.push({ cells: box(2, 0), target: M, kind: 'extra', label: '◱ quarter' })
    out.push({ cells: box(2, 2), target: M, kind: 'extra', label: '◲ quarter' })
    out.push({ cells: box(1, 1), target: M, kind: 'extra', label: 'centre' })
    out.push({ cells: [[0, 0], [0, 3], [3, 0], [3, 3]], target: M, kind: 'extra', label: 'corners' })
  }
  if (rule === 'pandiagonal') {
    for (let k = 1; k < n; k++) {
      out.push({ cells: Array.from({ length: n }, (_, i) => [i, (i + k) % n] as Cell), target: M, kind: 'extra', label: `↘${k + 1}` })
      out.push({ cells: Array.from({ length: n }, (_, i) => [i, (n - 1 - i - k + n) % n] as Cell), target: M, kind: 'extra', label: `↙${k + 1}` })
    }
  }
  if (rule === 'bordered' && n === 5) {
    const t = 39
    for (let i = 1; i <= 3; i++) {
      out.push({ cells: [1, 2, 3].map(c => [i, c] as Cell), target: t, kind: 'extra', label: `inner row ${i}` })
      out.push({ cells: [1, 2, 3].map(r => [r, i] as Cell), target: t, kind: 'extra', label: `inner col ${i}` })
    }
    out.push({ cells: [[1, 1], [2, 2], [3, 3]], target: t, kind: 'extra', label: 'inner ↘' })
    out.push({ cells: [[1, 3], [2, 2], [3, 1]], target: t, kind: 'extra', label: 'inner ↙' })
  }
  return out
}

/** Is `g` a full square using 1…n² once each with every group of `rule` on target? */
export function isMagic(g: Grid, rule: Rule = 'classic'): boolean {
  const n = g.length
  const seen = new Set(g.flat())
  if (seen.size !== n * n || [...seen].some(v => v < 1 || v > n * n)) return false
  return groupsFor(rule, n).every(gr => gr.cells.reduce((s, [r, c]) => s + g[r][c], 0) === gr.target)
}

const transpose = (g: Grid) => g[0].map((_, c) => g.map(row => row[c]))
const mirror = (g: Grid) => g.map(row => [...row].reverse())

/** A random one of the transformations that keep a square valid under `rule`. */
function transform(g: Grid, rng: Rng, rule: Rule): Grid {
  const n = g.length
  let out = g.map(r => [...r])
  if (rng() < 0.5) out = transpose(out)
  const turns = Math.floor(rng() * 4)
  for (let t = 0; t < turns; t++) out = mirror(transpose(out))
  // Classic and Dürer: swapping the outer pair of rows/columns with the next
  // pair in keeps the diagonals (and maps Dürer's quarters to quarters and
  // centre to corners).
  if ((rule === 'classic' || rule === 'durer') && n >= 4 && rng() < 0.5) {
    const p = Array.from({ length: n }, (_, i) => i)
    ;[p[0], p[1]] = [p[1], p[0]]
    ;[p[n - 1], p[n - 2]] = [p[n - 2], p[n - 1]]
    out = p.map(r => p.map(c => out[r][c]))
  }
  // Pandiagonal squares live on a torus: any cyclic shift keeps them.
  if (rule === 'pandiagonal') {
    const dr = Math.floor(rng() * n), dc = Math.floor(rng() * n)
    out = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => out[(r + dr) % n][(c + dc) % n]))
  }
  if (rng() < 0.5) out = out.map(r => r.map(v => n * n + 1 - v))
  return out
}

/** De la Loubère's (Siamese) method for odd n, starting mid-top. */
function siamese(n: number): Grid {
  const g: Grid = Array.from({ length: n }, () => Array(n).fill(0))
  let r = 0, c = Math.floor(n / 2)
  for (let v = 1; v <= n * n; v++) {
    g[r][c] = v
    const nr = (r - 1 + n) % n, nc = (c + 1) % n
    if (g[nr][nc]) r = (r + 1) % n
    else { r = nr; c = nc }
  }
  return g
}

/** A 5×5 pandiagonal square from two orthogonal linear Latin squares mod 5. */
function linear5(rng: Rng): Grid {
  const n = 5, unit = [1, 2, 3, 4]
  const ok = (a: number, b: number) => a % n && b % n && (a + b) % n && (a - b + n) % n
  for (;;) {
    const [a, b, d, e] = [0, 0, 0, 0].map(() => unit[Math.floor(rng() * 4)])
    if (!ok(a, b) || !ok(d, e) || ((a * e - b * d) % n + n) % n === 0) continue
    const c0 = Math.floor(rng() * n), f0 = Math.floor(rng() * n)
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) =>
      n * ((a * i + b * j + c0) % n) + ((d * i + e * j + f0) % n) + 1))
  }
}

// ── Solver ─────────────────────────────────────────────────────────────────────

/**
 * Backtracking solver over arbitrary sum groups. Groups with one blank are
 * forced; every group's remaining sum must be reachable with its blank count
 * from unused numbers. Branches on a cell of the group with the fewest
 * blanks. Counts up to `limit` solutions; with `fill`, writes the first into
 * `grid`. `nodeCap` bounds the work (returns what it has counted so far).
 */
function search(grid: Grid, groups: Group[], limit: number, rng: Rng | null, fill: boolean, nodeCap = Infinity): number {
  const n = grid.length, N = n * n
  const g = grid.map(r => [...r])
  let used = 0
  for (const v of g.flat()) {
    if (!v) continue
    if (used & (1 << v)) return 0
    used |= 1 << v
  }
  let count = 0, nodes = 0
  const rec = (): boolean => {
    if (++nodes > nodeCap) return true
    let best = -1, bestK = 99
    const free: number[] = []
    for (let v = 1; v <= N; v++) if (!(used & (1 << v))) free.push(v)
    for (let gi = 0; gi < groups.length; gi++) {
      let s = 0, k = 0
      for (const [r, c] of groups[gi].cells) { const v = g[r][c]; if (v) s += v; else k++ }
      const rem = groups[gi].target - s
      if (k === 0) { if (rem !== 0) return false; continue }
      if (k > free.length) return false
      let lo = 0, hi = 0
      for (let t = 0; t < k; t++) { lo += free[t]; hi += free[free.length - 1 - t] }
      if (rem < lo || rem > hi) return false
      if (k < bestK) { bestK = k; best = gi }
    }
    if (best < 0) {
      // Every group is full; any cell outside all groups is still free.
      const blank = g.flat().indexOf(0)
      if (blank >= 0) return false
      count++
      if (fill) grid.forEach((row, r) => row.forEach((_, c) => { row[c] = g[r][c] }))
      return count >= limit
    }
    const cells = groups[best].cells
    let s = 0
    for (const [r, c] of cells) s += g[r][c]
    const [cr, cc] = cells.find(([r, c]) => !g[r][c])!
    const vals = bestK === 1 ? [groups[best].target - s] : [...free]
    if (rng && vals.length > 1) for (let k = vals.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [vals[k], vals[j]] = [vals[j], vals[k]] }
    for (const v of vals) {
      if (v < 1 || v > N || used & (1 << v)) continue
      g[cr][cc] = v; used |= 1 << v
      const stop = rec()
      g[cr][cc] = 0; used &= ~(1 << v)
      if (stop) return true
    }
    return false
  }
  rec()
  return count
}

/** Number of completions of `grid` (0 = empty cell) under `rule`, stopping at `limit`. */
export function countSolutions(grid: Grid, limit = 2, rule: Rule = 'classic'): number {
  return search(grid, groupsFor(rule, grid.length), limit, null, false)
}

/** The unique completion of `grid` under `rule`, or null when there is none or several. */
export function solve(grid: Grid, rule: Rule = 'classic'): Grid | null {
  const groups = groupsFor(rule, grid.length)
  const out = grid.map(r => [...r])
  if (search(out, groups, 2, null, false) !== 1) return null
  search(out, groups, 1, null, true)
  return out
}

function randomSquare(start: Grid, rule: Rule, rng: Rng): Grid | null {
  const g = start.map(r => [...r])
  return search(g, groupsFor(rule, g.length), 1, rng, true, 200_000) === 1 ? g : null
}

// ── Generator ──────────────────────────────────────────────────────────────────

export interface Tier { n: number; givens: number; maxMistakes: number }

/** Most blanks a puzzle may leave at each difficulty: the time budget. */
export const MAX_BLANKS: readonly [number, number, number, number] = [9, 10, 12, 14]

const TIERS: Record<Rule, { n: [number, number, number, number]; givens: [number, number, number, number] }> = {
  //                 D1  D2  D3  D4
  classic:     { n: [3, 4, 4, 5], givens: [2, 7, 5, 12] },
  durer:       { n: [4, 4, 4, 4], givens: [8, 7, 6, 4] },
  pandiagonal: { n: [4, 4, 5, 5], givens: [9, 6, 14, 11] },
  bordered:    { n: [5, 5, 5, 5], givens: [17, 16, 13, 11] },
}

export function tierFor(rule: Rule, difficulty: Difficulty): Tier {
  const t = TIERS[rule]
  return { n: scale(difficulty, t.n), givens: scale(difficulty, t.givens), maxMistakes: scale(difficulty, [3, 3, 3, 2]) }
}

function fullSquare(rule: Rule, n: number, rng: Rng): Grid {
  const empty = (): Grid => Array.from({ length: n }, () => Array(n).fill(0))
  if (rule === 'classic') {
    if (n === 3) return LO_SHU
    if (n === 4) return rng() < 0.25 ? DURER : randomSquare(empty(), 'classic', rng)!
    return rng() < 0.5 ? siamese(n) : linear5(rng)
  }
  if (rule === 'durer') return rng() < 0.2 ? DURER : randomSquare(empty(), 'durer', rng)!
  if (rule === 'pandiagonal') {
    if (n === 4) return rng() < 0.2 ? CHAUTISA : randomSquare(empty(), 'pandiagonal', rng)!
    return linear5(rng)
  }
  // Bordered: a Lo Shu of 9…17 at the core, then search for a border.
  for (;;) {
    const core = transform(LO_SHU, rng, 'classic')
    const g = empty()
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g[r + 1][c + 1] = core[r][c] + 8
    const full = randomSquare(g, 'bordered', rng)
    if (full) return full
  }
}

export interface Puzzle { n: number; rule: Rule; solution: Grid; puzzle: Grid; tier: Tier }

/**
 * How many times a player who only fills groups with a single blank gets
 * stuck and must reason further (0 = pure arithmetic from start to finish).
 */
export function propagationStalls(puzzle: Grid, solution: Grid, rule: Rule): number {
  const n = puzzle.length, groups = groupsFor(rule, n)
  const g = puzzle.map(r => [...r])
  let stalls = 0
  for (;;) {
    let progress = false
    for (const gr of groups) {
      const blank = gr.cells.filter(([r, c]) => !g[r][c])
      if (blank.length === 1) { const [r, c] = blank[0]; g[r][c] = solution[r][c]; progress = true }
    }
    const i = g.flat().indexOf(0)
    if (i < 0) return stalls
    if (!progress) { stalls++; g[Math.floor(i / n)][i % n] = solution[Math.floor(i / n)][i % n] }
  }
}

export function generate(rule: Rule, difficulty: Difficulty, seed: number): Puzzle {
  const tier = tierFor(rule, difficulty)
  const rng = mulberry32(seed ^ hashString(`ms:${rule}`))
  const n = tier.n
  const groups = groupsFor(rule, n)
  const solution = transform(fullSquare(rule, n, rng), rng, rule)
  // Dig a few times; keep the first puzzle that is not pure arithmetic (it
  // needs at least one real deduction), else the one with the fewest givens.
  let best: Grid | null = null, bestGivens = 99
  for (let attempt = 0; attempt < 16; attempt++) {
    const puzzle = solution.map(r => [...r])
    const cells = Array.from({ length: n * n }, (_, i) => i)
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]] }
    let givens = n * n
    for (const idx of cells) {
      if (givens <= tier.givens) break
      const r = Math.floor(idx / n), c = idx % n
      const keep = puzzle[r][c]
      puzzle[r][c] = 0
      if (search(puzzle, groups, 2, null, false) === 1) givens--
      else puzzle[r][c] = keep
    }
    // Still pure arithmetic? One more blank (within the time budget) may fix that.
    if (givens <= tier.givens && n * n - givens < MAX_BLANKS[difficulty - 1] && propagationStalls(puzzle, solution, rule) === 0) {
      for (const idx of cells) {
        const r = Math.floor(idx / n), c = idx % n
        if (!puzzle[r][c]) continue
        const keep = puzzle[r][c]
        puzzle[r][c] = 0
        if (search(puzzle, groups, 2, null, false) === 1 && propagationStalls(puzzle, solution, rule) > 0) { givens--; break }
        puzzle[r][c] = keep
      }
    }
    if (givens < bestGivens) { best = puzzle; bestGivens = givens }
    if (givens <= tier.givens && propagationStalls(puzzle, solution, rule) > 0) { best = puzzle; break }
  }
  return { n, rule, solution, puzzle: best!, tier }
}

// ── Component ──────────────────────────────────────────────────────────────────

const MS_CSS = `
@keyframes ms-shake { 0%,100% { transform: none } 25% { transform: translateX(-3px) } 75% { transform: translateX(3px) } }
.ms-shake { animation: ms-shake 220ms ease-in-out }
`

type GroupState = 'open' | 'good' | 'bad'

const RULE_LINE: Record<Rule, string> = {
  classic: 'Rows, columns and both long diagonals',
  durer: 'Lines, quarters, centre and corners',
  pandiagonal: 'Rows, columns and every diagonal, wrapping round',
  bordered: 'Lines make 65 · the inner 3×3 lines make 39',
}

export default function MagicSquareGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'lo-shu')
  const rule = config.rule
  const { n, puzzle, tier } = useMemo(() => generate(rule, difficulty, seed), [rule, difficulty, seed])
  const N = n * n, M = magicSum(n)
  const groups = useMemo(() => groupsFor(rule, n), [rule, n])
  const extras = useMemo(() => groups.map((g, i) => ({ g, i })).filter(x => x.g.kind === 'extra'), [groups])
  const [grid, setGrid] = useState<Grid>(() => puzzle.map(r => [...r]))
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [shake, setShake] = useState<number | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const given = (r: number, c: number) => puzzle[r][c] !== 0
  const groupSum = (g: Grid, gi: number) => groups[gi].cells.reduce((s, [r, c]) => s + g[r][c], 0)
  const groupState = (g: Grid, gi: number): GroupState =>
    groups[gi].cells.some(([r, c]) => !g[r][c]) ? 'open' : groupSum(g, gi) === groups[gi].target ? 'good' : 'bad'
  const placed = new Set(grid.flat().filter(Boolean))

  const put = useCallback((val: number) => {
    if (!selected || settled) return
    const [r, c] = selected
    if (given(r, c)) return
    if (val && grid.some(row => row.includes(val))) return
    const next = grid.map(row => [...row])
    next[r][c] = val
    setGrid(next)
    if (!val) return
    // Groups through this cell that it just completed with the wrong sum.
    const bad = groups.some((gr, gi) => gr.cells.some(([gr2, gc]) => gr2 === r && gc === c) && groupState(next, gi) === 'bad')
    if (bad) {
      const k = mistakes + 1
      setMistakes(k)
      setShake(r * n + c)
      if (k >= tier.maxMistakes) lose('Too many groups with the wrong sum')
      return
    }
    if (next.every(row => row.every(Boolean)) && isMagic(next, rule)) { win(); return }
    for (let k = 1; k <= N; k++) {
      const i = (r * n + c + k) % N
      if (!next[Math.floor(i / n)][i % n]) { setSelected([Math.floor(i / n), i % n]); break }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, settled, grid, groups, mistakes, tier.maxMistakes, n, N, rule, win, lose])

  useEffect(() => {
    if (shake === null) return
    const t = setTimeout(() => setShake(null), 250)
    return () => clearTimeout(t)
  }, [shake])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settled || !selected) return
      if (e.key === 'Backspace' || e.key === 'Delete') put(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [put, settled, selected])

  const chipCls = (gi: number) => {
    const st = groupState(grid, gi)
    const s = groupSum(grid, gi)
    return st === 'good' ? 'text-emerald-700 bg-emerald-500/15' : st === 'bad' ? 'text-red-600 bg-red-500/15' : s > groups[gi].target ? 'text-red-600' : 'text-muted'
  }
  const sumChip = (gi: number, key: string, extra = '') => (
    <div key={key} data-line={gi} className={`flex items-center justify-center rounded text-[10px] font-bold tabular-nums ${chipCls(gi)} ${extra}`}>{groupSum(grid, gi)}</div>
  )

  // Extra groups through the selected cell are tinted so the twist is visible.
  const selExtra = new Set<number>()
  if (selected) for (const { g } of extras) if (g.cells.some(([r, c]) => r === selected[0] && c === selected[1])) for (const [r, c] of g.cells) selExtra.add(r * n + c)
  const inCore = (r: number, c: number) => rule === 'bordered' && r >= 1 && r <= 3 && c >= 1 && c <= 3

  const fontPx = n === 3 ? 30 : n === 4 ? 24 : 19
  const cols = n === 3 ? 9 : n === 4 ? 8 : 9

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <style>{MS_CSS}</style>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed" data-testid="ms-intro">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">{n}×{n} · 1–{N}</p>
          <p className={mistakes ? 'text-red-600 font-bold' : ''} data-testid="ms-mistakes">✗ {mistakes} / {tier.maxMistakes}</p>
        </div>
      </div>
      <p className="text-center text-sm text-ink-2">
        Every group sums to <span className="font-bold text-accent text-base">{M}</span>
        <span className="block text-[10px] text-muted">{RULE_LINE[rule]}</span>
      </p>

      <div className="w-full max-w-[380px] mx-auto grid gap-1"
        style={{ gridTemplateColumns: `repeat(${n}, 1fr) 2rem`, gridTemplateRows: `repeat(${n}, auto) 1.5rem` }}>
        {grid.map((row, r) => [
          ...row.map((v, c) => {
            const i = r * n + c
            const g = given(r, c)
            const sel = selected?.[0] === r && selected?.[1] === c
            const onDiag = r === c || r + c === n - 1
            const tint = selExtra.has(i) ? 'ring-2 ring-inset ring-accent/50' : ''
            const durerEdge = rule === 'durer' ? `${c === 2 ? 'ml-0.5' : ''} ${r === 2 ? 'mt-0.5' : ''}` : ''
            const core = inCore(r, c) ? 'outline outline-1 outline-accent/60' : ''
            return (
              <button key={i} type="button" data-cell={i} onClick={() => !settled && !g && setSelected([r, c])}
                className={`aspect-square rounded-md border font-bold flex items-center justify-center transition-colors
                  ${g ? 'bg-panel border-line text-ink' : sel ? 'bg-accent/30 border-accent text-ink' : onDiag && rule !== 'pandiagonal' ? 'bg-accent/[0.07] border-line text-emerald-800' : 'bg-paper border-line text-emerald-800'}
                  ${tint} ${durerEdge} ${core} ${shake === i ? 'ms-shake' : ''}`}
                style={{ fontSize: fontPx }}>
                {v || ''}
              </button>
            )
          }),
          sumChip(2 * r, `rs${r}`),
        ])}
        {Array.from({ length: n }, (_, c) => sumChip(2 * c + 1, `cs${c}`))}
        <div className="grid grid-rows-2 gap-0.5">
          {sumChip(2 * n, 'd1', 'text-[9px]')}
          {sumChip(2 * n + 1, 'd2', 'text-[9px]')}
        </div>
      </div>
      <p className="text-muted/80 text-[10px] text-center -mt-1">Corner chips: ↘ diagonal, then ↙ diagonal</p>

      {extras.length > 0 && (
        <div className="w-full max-w-[380px] mx-auto flex flex-wrap justify-center gap-1" data-testid="ms-extras">
          {extras.map(({ g, i }) => (
            <div key={i} data-line={i} className={`rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums border border-line ${chipCls(i)}`}>
              {g.label} <span className="opacity-70">{groupSum(grid, i)}/{g.target}</span>
            </div>
          ))}
        </div>
      )}

      {!settled && (
        <div className="flex flex-col gap-1.5 w-full max-w-[380px] mx-auto">
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: N }, (_, k) => k + 1).map(v => (
              <button key={v} type="button" aria-label={`enter ${v}`} onClick={() => put(v)} disabled={placed.has(v)}
                className={`h-10 rounded-lg border text-sm font-bold ${placed.has(v) ? 'bg-paper border-line text-muted/40' : 'bg-panel border-line text-ink hover:bg-accent/15'}`}>
                {v}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => put(0)} className="h-9 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold hover:text-red-600">
            ⌫ Erase
          </button>
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The square is magic!" loseTitle="The sums would not balance" />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
