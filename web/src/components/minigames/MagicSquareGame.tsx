import { useMemo, useState, useCallback, useEffect } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Lo Shu: complete a normal magic square — the numbers 1…n² once each, every
// row, column and both long diagonals summing to n(n²+1)/2.
//
//   D1  3×3   3 givens    3 mistakes
//   D2  4×4   6 givens    3 mistakes   (Dürer / Chautisa / random 4×4)
//   D3  5×5   11 givens   3 mistakes   (Siamese or pandiagonal 5×5)
//   D4  5×5   8 givens    2 mistakes
//
// Givens are removed from a full square one at a time, keeping a removal only
// while the exported solver still finds exactly one completion, so every
// puzzle has a unique answer. A mistake is counted when an entry completes a
// line whose sum is wrong.

interface SquareConfig {
  title: string
  intro: string
  fact: string
  /** Which family of full squares to draw from at each size. */
  family: 'lo-shu' | 'durer' | 'jaina' | 'wafq'
}

export const CONFIGS: Record<string, SquareConfig> = {
  'lo-shu': {
    title: 'The Turtle of the Luo River',
    intro: 'The dots on the turtle’s shell are half washed away. Restore them: every row, column and both diagonals must share one sum.',
    fact: 'Chinese legend tells of a turtle that rose from the Luo River in the days of Yu the Great with a pattern of dots on its shell, every line summing to 15. Up to rotation and reflection, the Lo Shu is the only 3×3 magic square there is.',
    family: 'lo-shu',
  },
  'durer': {
    title: 'Melencolia I',
    intro: 'Dürer hid a magic square behind his brooding angel. Fill the empty cells so that every row, column and both diagonals share one sum.',
    fact: 'Albrecht Dürer engraved a 4×4 magic square into Melencolia I in 1514. Every line sums to 34, and the two middle cells of the bottom row read 15 14 — the year of the engraving.',
    family: 'durer',
  },
  'jaina-yantra': {
    title: 'The Chautisa Yantra',
    intro: 'A temple inscription has crumbled. Complete the square so every row, column and both diagonals share one sum.',
    fact: 'A 10th-century inscription at the Parshvanath Jain temple in Khajuraho holds the Chautisa (“thirty-four”) Yantra, a 4×4 square so perfect that even its broken diagonals sum to 34 — one of the oldest known pandiagonal magic squares.',
    family: 'jaina',
  },
  'islamic-wafq': {
    title: 'The Harmonious Arrangement',
    intro: 'A scholar’s talisman needs its missing numbers. Fill the square so every row, column and both diagonals share one sum.',
    fact: 'Medieval Arabic writers called magic squares wafq al-aʿdād, “the harmonious arrangement of numbers.” The 10th-century Brethren of Purity in Basra recorded squares well beyond 3×3, and later authors such as al-Būnī inscribed them on talismans.',
    family: 'wafq',
  },
}

// ── Squares ────────────────────────────────────────────────────────────────────

export type Grid = number[][]

export const magicSum = (n: number) => (n * (n * n + 1)) / 2

const LO_SHU: Grid = [[4, 9, 2], [3, 5, 7], [8, 1, 6]]
export const DURER: Grid = [[16, 3, 2, 13], [5, 10, 11, 8], [9, 6, 7, 12], [4, 15, 14, 1]]
const CHAUTISA: Grid = [[7, 12, 1, 14], [2, 13, 8, 11], [16, 3, 10, 5], [9, 6, 15, 4]]

/** Every line of an n×n square as lists of [r, c]: rows, columns, both diagonals. */
export function linesOf(n: number): [number, number][][] {
  const lines: [number, number][][] = []
  for (let i = 0; i < n; i++) {
    lines.push(Array.from({ length: n }, (_, k) => [i, k] as [number, number]))
    lines.push(Array.from({ length: n }, (_, k) => [k, i] as [number, number]))
  }
  lines.push(Array.from({ length: n }, (_, k) => [k, k] as [number, number]))
  lines.push(Array.from({ length: n }, (_, k) => [k, n - 1 - k] as [number, number]))
  return lines
}

export function isMagic(g: Grid): boolean {
  const n = g.length, m = magicSum(n)
  const seen = new Set(g.flat())
  if (seen.size !== n * n || [...seen].some(v => v < 1 || v > n * n)) return false
  return linesOf(n).every(line => line.reduce((s, [r, c]) => s + g[r][c], 0) === m)
}

const transpose = (g: Grid) => g[0].map((_, c) => g.map(row => row[c]))
const mirror = (g: Grid) => g.map(row => [...row].reverse())

/** A random one of the transformations that keep a square magic. */
function transform(g: Grid, rng: Rng): Grid {
  const n = g.length
  let out = g.map(r => [...r])
  if (rng() < 0.5) out = transpose(out)
  const turns = Math.floor(rng() * 4)
  for (let t = 0; t < turns; t++) out = mirror(transpose(out))
  // A permutation p with p(n-1-i) = n-1-p(i), applied to rows and columns
  // together, keeps both diagonals: swap the outer pair with the next pair in.
  if (n >= 4 && rng() < 0.5) {
    const p = Array.from({ length: n }, (_, i) => i)
    ;[p[0], p[1]] = [p[1], p[0]]
    ;[p[n - 1], p[n - 2]] = [p[n - 2], p[n - 1]]
    out = p.map(r => p.map(c => out[r][c]))
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
 * Backtracking solver. Lines with one blank are forced; every line's
 * remaining sum must be reachable with its blank count from unused numbers.
 * Branches on a cell of the line with the fewest blanks. Counts up to
 * `limit` solutions; with `fill`, writes the first into `grid`.
 */
function search(grid: Grid, limit: number, rng: Rng | null, fill: boolean): number {
  const n = grid.length, N = n * n, m = magicSum(n)
  const lines = linesOf(n)
  const g = grid.map(r => [...r])
  let used = 0
  for (const v of g.flat()) {
    if (!v) continue
    if (used & (1 << v)) return 0
    used |= 1 << v
  }
  let count = 0
  const rec = (): boolean => {
    // Forced moves and bounds.
    let bestLine = -1, bestK = 99
    const free: number[] = []
    for (let v = 1; v <= N; v++) if (!(used & (1 << v))) free.push(v)
    for (let li = 0; li < lines.length; li++) {
      let s = 0, k = 0
      for (const [r, c] of lines[li]) { const v = g[r][c]; if (v) s += v; else k++ }
      const rem = m - s
      if (k === 0) { if (rem !== 0) return false; continue }
      let lo = 0, hi = 0
      for (let t = 0; t < k; t++) { lo += free[t]; hi += free[free.length - 1 - t] }
      if (rem < lo || rem > hi) return false
      if (k < bestK) { bestK = k; bestLine = li }
    }
    if (bestLine < 0) { count++; if (fill) grid.forEach((row, r) => row.forEach((_, c) => { row[c] = g[r][c] })); return count >= limit }
    const line = lines[bestLine]
    let s = 0
    for (const [r, c] of line) s += g[r][c]
    const [cr, cc] = line.find(([r, c]) => !g[r][c])!
    let vals: number[]
    if (bestK === 1) vals = [m - s]
    else vals = [...free]
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

/** Number of magic completions of `grid` (0 = empty cell), stopping at `limit`. */
export function countSolutions(grid: Grid, limit = 2): number {
  return search(grid, limit, null, false)
}

/** The unique completion of `grid`, or null when there is none or several. */
export function solve(grid: Grid): Grid | null {
  const out = grid.map(r => [...r])
  if (search(out, 2, null, false) !== 1) return null
  search(out, 1, null, true)
  return out
}

function randomSquare(n: number, rng: Rng): Grid {
  const g: Grid = Array.from({ length: n }, () => Array(n).fill(0))
  search(g, 1, rng, true)
  return g
}

// ── Generator ──────────────────────────────────────────────────────────────────

export interface Tier { n: number; givens: number; maxMistakes: number }

export function tierFor(difficulty: Difficulty): Tier {
  return {
    n: scale(difficulty, [3, 4, 5, 5]),
    givens: scale(difficulty, [3, 6, 11, 8]),
    maxMistakes: scale(difficulty, [3, 3, 3, 2]),
  }
}

function fullSquare(family: SquareConfig['family'], n: number, rng: Rng): Grid {
  if (n === 3) return LO_SHU
  if (n === 4) {
    if (family === 'durer') return DURER
    if (family === 'jaina') return CHAUTISA
    return randomSquare(4, rng)
  }
  if (family === 'lo-shu') return siamese(n)
  return linear5(rng)
}

export interface Puzzle { n: number; solution: Grid; puzzle: Grid; tier: Tier }

export function generate(family: SquareConfig['family'], difficulty: Difficulty, seed: number): Puzzle {
  const tier = tierFor(difficulty)
  const rng = mulberry32(seed ^ hashString(family))
  const solution = transform(fullSquare(family, tier.n, rng), rng)
  const n = tier.n
  const puzzle = solution.map(r => [...r])
  const cells = Array.from({ length: n * n }, (_, i) => i)
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]] }
  let givens = n * n
  for (const idx of cells) {
    if (givens <= tier.givens) break
    const r = Math.floor(idx / n), c = idx % n
    const keep = puzzle[r][c]
    puzzle[r][c] = 0
    if (countSolutions(puzzle) === 1) givens--
    else puzzle[r][c] = keep
  }
  return { n, solution, puzzle, tier }
}

// ── Component ──────────────────────────────────────────────────────────────────

const MS_CSS = `
@keyframes ms-shake { 0%,100% { transform: none } 25% { transform: translateX(-3px) } 75% { transform: translateX(3px) } }
.ms-shake { animation: ms-shake 220ms ease-in-out }
`

type LineState = 'open' | 'good' | 'bad'

export default function MagicSquareGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'lo-shu')
  const { n, puzzle, tier } = useMemo(() => generate(config.family, difficulty, seed), [config.family, difficulty, seed])
  const N = n * n, M = magicSum(n)
  const lines = useMemo(() => linesOf(n), [n])
  const [grid, setGrid] = useState<Grid>(() => puzzle.map(r => [...r]))
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [shake, setShake] = useState<number | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const given = (r: number, c: number) => puzzle[r][c] !== 0
  const lineSum = (g: Grid, li: number) => lines[li].reduce((s, [r, c]) => s + g[r][c], 0)
  const lineState = (g: Grid, li: number): LineState =>
    lines[li].some(([r, c]) => !g[r][c]) ? 'open' : lineSum(g, li) === M ? 'good' : 'bad'
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
    // Lines through this cell that it just completed with the wrong sum.
    const bad = lines.some((line, li) => line.some(([lr, lc]) => lr === r && lc === c) && lineState(next, li) === 'bad')
    if (bad) {
      const k = mistakes + 1
      setMistakes(k)
      setShake(r * n + c)
      if (k >= tier.maxMistakes) lose('Too many lines with the wrong sum')
      return
    }
    if (next.every(row => row.every(Boolean)) && isMagic(next)) { win(); return }
    // Move on to the next empty cell.
    for (let k = 1; k <= N; k++) {
      const i = (r * n + c + k) % N
      if (!next[Math.floor(i / n)][i % n]) { setSelected([Math.floor(i / n), i % n]); break }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, settled, grid, lines, mistakes, tier.maxMistakes, n, N, win, lose])

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

  const sumChip = (li: number, key: string, extra = '') => {
    const st = lineState(grid, li)
    const s = lineSum(grid, li)
    const cls = st === 'good' ? 'text-emerald-700 bg-emerald-500/15' : st === 'bad' ? 'text-red-600 bg-red-500/15' : s > M ? 'text-red-600' : 'text-muted'
    return <div key={key} data-line={li} className={`flex items-center justify-center rounded text-[10px] font-bold tabular-nums ${cls} ${extra}`}>{s}</div>
  }

  const fontPx = n === 3 ? 30 : n === 4 ? 24 : 19
  const cols = n === 3 ? 9 : n === 4 ? 8 : 9

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <style>{MS_CSS}</style>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">{n}×{n} · 1–{N}</p>
          <p className={mistakes ? 'text-red-600 font-bold' : ''} data-testid="ms-mistakes">✗ {mistakes} / {tier.maxMistakes}</p>
        </div>
      </div>
      <p className="text-center text-sm text-ink-2">Every line sums to <span className="font-bold text-accent text-base">{M}</span></p>

      {/* Square with running sums: rows on the right, columns below, diagonals at the corners. */}
      <div className="w-full max-w-[380px] mx-auto grid gap-1"
        style={{ gridTemplateColumns: `repeat(${n}, 1fr) 2rem`, gridTemplateRows: `repeat(${n}, auto) 1.5rem` }}>
        {grid.map((row, r) => [
          ...row.map((v, c) => {
            const i = r * n + c
            const g = given(r, c)
            const sel = selected?.[0] === r && selected?.[1] === c
            const onDiag = r === c || r + c === n - 1
            return (
              <button key={i} type="button" data-cell={i} onClick={() => !settled && !g && setSelected([r, c])}
                className={`aspect-square rounded-md border font-bold flex items-center justify-center transition-colors
                  ${g ? 'bg-panel border-line text-ink' : sel ? 'bg-accent/30 border-accent text-ink' : onDiag ? 'bg-accent/[0.07] border-line text-emerald-800' : 'bg-paper border-line text-emerald-800'}
                  ${shake === i ? 'ms-shake' : ''}`}
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
