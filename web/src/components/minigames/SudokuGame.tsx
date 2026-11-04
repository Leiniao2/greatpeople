import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'
import { artTexture, type GameArtKey } from '@/games/art'

// Sudoku with a seeded generator; every puzzle has exactly one solution.
//
//   D1  6×6 (2×3 boxes)            3 mistakes
//   D2  9×9                        3 mistakes
//   D3  9×9, fewer givens          3 mistakes
//   D4  9×9 diagonal sudoku: both long diagonals also hold 1–9   2 mistakes
//
// Notes (pencil marks), same-number highlighting and a flash on every
// finished row, column, box or diagonal. A hint fills one cell and costs a
// mistake, so it is never offered when it would end the game.

interface SudokuConfig {
  title: string
  intro: string
  fact: string
  /** Board surface art. */
  surface?: GameArtKey
}

export const CONFIGS: Record<string, SudokuConfig> = {
  'brahms-pattern': {
    surface: 'sudoku_parchment',
    title: "Brahms' Compositional Grid",
    intro: 'Brahms organised his motifs so no phrase repeated in the same voice within a section. Fill the grid so each row, column and box holds every number exactly once.',
    fact: "Brahms spent 14 years revising his First Symphony before releasing it in 1876. His obsession with structural rigor earned it the nickname 'Beethoven's Tenth' — yet the work pulses with Romantic warmth. Like sudoku, every element is constrained, yet the result feels inevitable, not mechanical.",
  },
  'euclid-grid': {
    surface: 'sudoku_clay',
    title: "Euclid's Proof Grid",
    intro: "Euclid's Elements organises 465 propositions so no concept appears before it is proven. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Euclid's Elements (c. 300 BCE) laid out all of classical geometry from five axioms alone. Its logical structure — each proposition built strictly on what came before — was so airtight that it served as the definitive mathematics textbook for over 2,000 years.",
  },
  'tt33-walls': {
    surface: 'sudoku_parchment',
    title: 'Every Text in Its Place',
    intro: 'The wall is ruled into panels before the carvers begin, and no spell may appear twice in one row, column or panel. Fill the grid so each row, column and box holds every number exactly once.',
    fact: 'Late Period priests at Thebes searched out texts up to two thousand years old — Pyramid Texts first carved for Old Kingdom kings among them — and had them copied again, deliberately reviving Egypt’s sacred past. Pediamenopet’s tomb gathers more of them than any other.',
  },
  'al-khwarizmi-grid': {
    surface: 'sudoku_clay',
    title: "Al-Khwārizmī's Balance",
    intro: "Al-Khwārizmī's algebra reduces every problem to a balanced equation. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Muhammad ibn Mūsā al-Khwārizmī wrote Kitāb al-mukhtaṣar fī ḥisāb al-jabr (c. 820 CE), the founding text of algebra. The word 'algebra' comes from al-jabr — 'the reunion of broken parts.' His name gave us 'algorithm.' He described balancing equations using exactly the logic a sudoku player uses.",
  },
  'anaxagoras-grid': {
    surface: 'sudoku_clay',
    title: 'The Mind That Orders',
    intro: 'Anaxagoras held that Nous (Mind) imposes order on a chaotic universe — each element in its proper place. Fill the grid so each row, column and box holds every number exactly once.',
    fact: "Anaxagoras (c. 500–428 BCE) was the first to introduce Nous — cosmic Mind — as the ordering principle of the universe. He also correctly deduced that the moon shines with reflected sunlight, that eclipses are caused by the moon, and that the sun is a fiery rock larger than the Peloponnese. He was tried for impiety in Athens and saved from execution only by Pericles' influence.",
  },
  'mendel-grid': {
    surface: 'sudoku_parchment',
    title: "Mendel's Inheritance Grid",
    intro: "Mendel's laws ensure that dominant and recessive traits distribute across generations in strict, predictable ratios. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Gregor Mendel crossed 29,000 pea plants over eight years in St Thomas's Abbey garden, Brno. His 3:1 ratio of dominant to recessive traits revealed the hidden mathematics of heredity. His paper sat unread for 35 years; rediscovered in 1900 by three scientists independently, it became the founding document of genetics.",
  },
  'lorentz-grid': {
    surface: 'sudoku_parchment',
    title: 'The Transformation',
    intro: "Lorentz's equations describe a universe where time, space and mass change with velocity — yet follow exact mathematical constraints. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Hendrik Lorentz derived his transformation equations in 1895–1904, showing mathematically that length, time, and mass all change with velocity. Einstein took these same equations and provided the physical interpretation: they do not describe a distortion of measurement, but a genuine feature of spacetime. Lorentz was magnanimous about this — he considered Einstein's insight the greater achievement.",
  },
  'nirmal-hriday-rota': {
    surface: 'sudoku_parchment',
    title: 'The Kalighat Rota',
    intro: 'At Nirmal Hriday the sisters share out the day — washing, feeding, nursing, sitting with the dying — so every duty is covered and no one carries the same one twice. Fill the rota so each row, column and box holds every number exactly once.',
    fact: "Mother Teresa opened Nirmal Hriday ('Pure Heart'), her home for the dying destitute, in 1952 in a former pilgrims' hostel beside the Kali temple at Kalighat, Calcutta. The sisters and volunteers from around the world still care for the dying there.",
  },
  'eisenstein-grid': {
    surface: 'sudoku_parchment',
    title: 'The Montage Grid',
    intro: "Eisenstein's montage: juxtapose shots so that no image repeats the same idea in the same context — the meaning emerges between them. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Eisenstein's montage theory — that meaning is created between shots, not within them — revolutionised cinema. The Kuleshov effect demonstrates this: the same neutral face, cut to food, reads as hunger; cut to a coffin, reads as grief. Eisenstein used this principle to build Battleship Potemkin's Odessa Steps sequence — still studied in every film school on Earth.",
  },
}

// ── Generator ──────────────────────────────────────────────────────────────────

export interface Board { n: number; boxR: number; boxC: number; diagonal?: boolean }

export const BOARDS = {
  six:      { n: 6, boxR: 2, boxC: 3 },
  nine:     { n: 9, boxR: 3, boxC: 3 },
  diagonal: { n: 9, boxR: 3, boxC: 3, diagonal: true },
} satisfies Record<string, Board>

export function boxOf(b: Board, r: number, c: number) {
  return Math.floor(r / b.boxR) * (b.n / b.boxC) + Math.floor(c / b.boxC)
}

/** Every unit (row, column, box, and the diagonals when they count) as lists of [r, c]. */
export function unitsOf(b: Board): [number, number][][] {
  const { n } = b
  const units: [number, number][][] = []
  for (let i = 0; i < n; i++) {
    units.push(Array.from({ length: n }, (_, k) => [i, k] as [number, number]))
    units.push(Array.from({ length: n }, (_, k) => [k, i] as [number, number]))
  }
  for (let br = 0; br < n; br += b.boxR) for (let bc = 0; bc < n; bc += b.boxC) {
    const box: [number, number][] = []
    for (let r = br; r < br + b.boxR; r++) for (let c = bc; c < bc + b.boxC; c++) box.push([r, c])
    units.push(box)
  }
  if (b.diagonal) {
    units.push(Array.from({ length: n }, (_, k) => [k, k] as [number, number]))
    units.push(Array.from({ length: n }, (_, k) => [k, n - 1 - k] as [number, number]))
  }
  return units
}

const onMain = (r: number, c: number) => r === c
const onAnti = (n: number, r: number, c: number) => r + c === n - 1

/**
 * Bitmask backtracking solver: always branches on the empty cell with the
 * fewest candidates. Fills `grid` with the first solution it finds when
 * `keep` is set; otherwise leaves it untouched. Stops after `limit` solutions.
 */
function search(b: Board, grid: number[][], limit: number, rng: Rng | null, keep: boolean): number {
  const { n } = b
  const full = (1 << (n + 1)) - 2 // bits 1..n
  const rows = Array(n).fill(0), cols = Array(n).fill(0), boxes = Array(n).fill(0)
  let d1 = 0, d2 = 0
  const empties: number[] = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const v = grid[r][c]
    if (!v) { empties.push(r * n + c); continue }
    const bit = 1 << v
    if ((rows[r] | cols[c] | boxes[boxOf(b, r, c)]) & bit) return 0
    if (b.diagonal && ((onMain(r, c) && d1 & bit) || (onAnti(n, r, c) && d2 & bit))) return 0
    rows[r] |= bit; cols[c] |= bit; boxes[boxOf(b, r, c)] |= bit
    if (b.diagonal) { if (onMain(r, c)) d1 |= bit; if (onAnti(n, r, c)) d2 |= bit }
  }
  const boxIdx = empties.map(i => boxOf(b, Math.floor(i / n), i % n))
  const used = (k: number) => {
    const i = empties[k], r = Math.floor(i / n), c = i % n
    let m = rows[r] | cols[c] | boxes[boxIdx[k]]
    if (b.diagonal) { if (onMain(r, c)) m |= d1; if (onAnti(n, r, c)) m |= d2 }
    return m
  }
  let count = 0
  const done = new Uint8Array(empties.length)
  const solve = (left: number): boolean => {
    if (left === 0) { count++; return count >= limit }
    // Pick the most constrained empty cell.
    let best = -1, bestFree = 0, bestCount = 99
    for (let k = 0; k < empties.length; k++) {
      if (done[k]) continue
      const free = full & ~used(k)
      let bits = 0
      for (let x = free; x; x &= x - 1) bits++
      if (bits < bestCount) { best = k; bestFree = free; bestCount = bits; if (bits <= 1) break }
    }
    if (bestCount === 0) return false
    const i = empties[best], r = Math.floor(i / n), c = i % n
    const vals: number[] = []
    for (let v = 1; v <= n; v++) if (bestFree & (1 << v)) vals.push(v)
    if (rng) for (let k = vals.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [vals[k], vals[j]] = [vals[j], vals[k]] }
    done[best] = 1
    for (const v of vals) {
      const bit = 1 << v
      rows[r] |= bit; cols[c] |= bit; boxes[boxIdx[best]] |= bit
      const m1 = b.diagonal && onMain(r, c), m2 = b.diagonal && onAnti(n, r, c)
      if (m1) d1 |= bit
      if (m2) d2 |= bit
      grid[r][c] = v
      const stop = solve(left - 1)
      if (stop && keep) return true
      grid[r][c] = 0
      rows[r] &= ~bit; cols[c] &= ~bit; boxes[boxIdx[best]] &= ~bit
      if (m1) d1 &= ~bit
      if (m2) d2 &= ~bit
      if (stop) { done[best] = 0; return true }
    }
    done[best] = 0
    return false
  }
  solve(empties.length)
  return count
}

/** Count solutions, stopping at 2. Leaves `grid` as it was. */
export function countSolutions(b: Board, grid: number[][]): number {
  return search(b, grid.map(r => [...r]), 2, null, false)
}

/** Fill an empty grid completely, in a random order driven by `rng`. */
function fillSolution(b: Board, rng: Rng): number[][] {
  const grid: number[][] = Array.from({ length: b.n }, () => Array(b.n).fill(0))
  search(b, grid, 1, rng, true)
  return grid
}

/** Remove cells from a full solution while the puzzle keeps a unique answer. */
function makePuzzle(b: Board, solution: number[][], blanks: number, rng: Rng): number[][] {
  const puzzle = solution.map(r => [...r])
  const cells = Array.from({ length: b.n * b.n }, (_, i) => i)
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]] }
  // Diagonal boards blank the diagonals first, so the extra rule is needed.
  if (b.diagonal) {
    const onDiag = (i: number) => onMain(Math.floor(i / b.n), i % b.n) || onAnti(b.n, Math.floor(i / b.n), i % b.n)
    cells.sort((x, y) => Number(onDiag(y)) - Number(onDiag(x)))
  }
  let removed = 0
  // A diagonal board may blank a few more cells until the diagonals are
  // really needed (as a plain sudoku it would be ambiguous).
  const needsDiagonals = () => !b.diagonal || countSolutions(BOARDS.nine, puzzle) > 1
  for (const idx of cells) {
    if (removed >= blanks && (removed >= blanks + 6 || needsDiagonals())) break
    const r = Math.floor(idx / b.n), c = idx % b.n
    const keep = puzzle[r][c]
    if (!keep) continue
    puzzle[r][c] = 0
    if (countSolutions(b, puzzle) === 1) removed++
    else puzzle[r][c] = keep
  }
  return puzzle
}

export interface Tier { board: Board; blankShare: number; maxMistakes: number }

export function tierFor(difficulty: Difficulty): Tier {
  return {
    board: scale(difficulty, [BOARDS.six, BOARDS.six, BOARDS.nine, BOARDS.diagonal]),
    // Share of cells left blank: 15, 21, 32 and 37 cells to fill.
    blankShare: scale(difficulty, [0.42, 0.6, 0.4, 0.46]),
    maxMistakes: scale(difficulty, [3, 3, 3, 3]),
  }
}

export function generate(difficulty: Difficulty, seed: number) {
  const { board: b, blankShare } = tierFor(difficulty)
  const rng = mulberry32(seed)
  const solution = fillSolution(b, rng)
  const puzzle = makePuzzle(b, solution, Math.floor(b.n * b.n * blankShare), rng)
  return { board: b, solution, puzzle }
}

/** Cells of every unit through (r, c) that is now filled correctly. */
export function completedUnits(b: Board, grid: number[][], solution: number[][], r: number, c: number): [number, number][] {
  const out: [number, number][] = []
  for (const unit of unitsOf(b)) {
    if (!unit.some(([ur, uc]) => ur === r && uc === c)) continue
    if (unit.every(([ur, uc]) => grid[ur][uc] === solution[ur][uc])) out.push(...unit)
  }
  return out
}

// ── Component ──────────────────────────────────────────────────────────────────

const SDK_CSS = `
@keyframes sdk-flash { 0% { background-color: rgba(16,185,129,.55) } 100% { background-color: transparent } }
@keyframes sdk-shake { 0%,100% { transform: none } 25% { transform: translateX(-3px) } 75% { transform: translateX(3px) } }
.sdk-flash { animation: sdk-flash 800ms ease-out }
.sdk-shake { animation: sdk-shake 220ms ease-in-out }
`

export default function SudokuGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'brahms-pattern')
  const { board: b, solution, puzzle } = useMemo(() => generate(difficulty, seed), [difficulty, seed])
  const { maxMistakes } = tierFor(difficulty)
  const n = b.n
  const surface: GameArtKey = config.surface ?? 'sudoku_parchment'

  const [grid, setGrid] = useState<number[][]>(() => puzzle.map(r => [...r]))
  const [notes, setNotes] = useState<number[][]>(() => puzzle.map(r => r.map(() => 0)))
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [notesMode, setNotesMode] = useState(false)
  const [flash, setFlash] = useState<{ cells: Set<number>; key: number } | null>(null)
  const [shake, setShake] = useState<number | null>(null)
  const [hints, setHints] = useState(0)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const flashKey = useRef(0)

  const isPrefilled = (r: number, c: number) => puzzle[r][c] !== 0
  const isDone = (g: number[][]) => g.every((row, ri) => row.every((cell, ci) => cell === solution[ri][ci]))

  /** Write a correct value: clear its pencil marks from peers and flash finished units. */
  const placeCorrect = useCallback((r: number, c: number, val: number, g: number[][]) => {
    const peers = new Set<number>()
    for (const unit of unitsOf(b)) if (unit.some(([ur, uc]) => ur === r && uc === c)) unit.forEach(([ur, uc]) => peers.add(ur * n + uc))
    setNotes(prev => prev.map((row, ri) => row.map((m, ci) => (ri === r && ci === c ? 0 : peers.has(ri * n + ci) ? m & ~(1 << val) : m))))
    const done = completedUnits(b, g, solution, r, c)
    if (done.length) setFlash({ cells: new Set(done.map(([ur, uc]) => ur * n + uc)), key: ++flashKey.current })
    if (isDone(g)) win()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, n, solution, win])

  const fill = useCallback((val: number) => {
    if (!selected || settled) return
    const [r, c] = selected
    if (isPrefilled(r, c) || grid[r][c] === solution[r][c]) return
    if (notesMode) {
      if (grid[r][c] !== 0) return
      setNotes(prev => prev.map((row, ri) => row.map((m, ci) => (ri === r && ci === c ? m ^ (1 << val) : m))))
      return
    }
    const next = grid.map(row => [...row])
    next[r][c] = val
    setGrid(next)
    if (val !== solution[r][c]) {
      const m = mistakes + 1
      setMistakes(m)
      setShake(r * n + c)
      if (m >= maxMistakes) lose('too many mistakes')
      return
    }
    placeCorrect(r, c, val, next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, grid, settled, solution, mistakes, maxMistakes, notesMode, lose, placeCorrect, n])

  const clear = useCallback(() => {
    if (!selected || settled) return
    const [r, c] = selected
    if (isPrefilled(r, c) || grid[r][c] === solution[r][c]) return
    if (grid[r][c] === 0) { setNotes(prev => prev.map((row, ri) => row.map((m, ci) => (ri === r && ci === c ? 0 : m)))); return }
    const next = grid.map(row => [...row])
    next[r][c] = 0
    setGrid(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, grid, settled, solution])

  const canHint = !settled && mistakes + 1 < maxMistakes && !isDone(grid)
  const hint = useCallback(() => {
    if (!canHint) return
    // The selected cell if it still needs an answer, else the first open cell.
    let target = selected && grid[selected[0]][selected[1]] !== solution[selected[0]][selected[1]] ? selected : null
    for (let i = 0; !target && i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n
      if (grid[r][c] !== solution[r][c]) target = [r, c]
    }
    if (!target) return
    const [r, c] = target
    const next = grid.map(row => [...row])
    next[r][c] = solution[r][c]
    setGrid(next)
    setSelected(target)
    setMistakes(m => m + 1)
    setHints(h => h + 1)
    placeCorrect(r, c, solution[r][c], next)
  }, [canHint, selected, grid, solution, n, placeCorrect])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 850)
    return () => clearTimeout(t)
  }, [flash])
  useEffect(() => {
    if (shake === null) return
    const t = setTimeout(() => setShake(null), 250)
    return () => clearTimeout(t)
  }, [shake])

  // Keyboard: digits fill, Backspace clears, N toggles notes, arrows move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settled) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const d = Number(e.key)
      if (d >= 1 && d <= n) { fill(d); return }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { clear(); return }
      if (e.key === 'n' || e.key === 'N') { setNotesMode(v => !v); return }
      const mv: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
      if (mv[e.key]) {
        e.preventDefault()
        setSelected(s => {
          const [r, c] = s ?? [0, 0]
          return [Math.min(n - 1, Math.max(0, r + mv[e.key][0])), Math.min(n - 1, Math.max(0, c + mv[e.key][1]))]
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fill, clear, settled, n])

  const selVal = selected ? grid[selected[0]][selected[1]] : 0
  const selShowsSame = selected && selVal !== 0 && selVal === solution[selected[0]][selected[1]]
  const remaining = (v: number) => n - grid.flat().filter((x, i) => x === v && x === solution[Math.floor(i / n)][i % n]).length
  const noteCols = b.boxC, noteRows = Math.ceil(n / noteCols)

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <style>{SDK_CSS}</style>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
          {b.diagonal && (
            <p className="text-ink-2 text-xs font-bold mt-1">Diagonal sudoku: both long diagonals must also hold 1–{n}.</p>
          )}
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">{n}×{n}{b.diagonal ? ' ✕' : ''}</p>
          <p className={mistakes > 0 ? 'text-red-600 font-bold' : ''} data-testid="sdk-mistakes">✗ {mistakes} / {maxMistakes}</p>
          {hints > 0 && <p>{hints} hint{hints === 1 ? '' : 's'}</p>}
        </div>
      </div>

      {/* Grid */}
      <div className="w-full max-w-[420px] mx-auto rounded-lg overflow-hidden border-2 border-ink-2 shadow-md bg-panel"
        style={{ ...artTexture(surface, 320), containerType: 'inline-size' }}>
        <div className="grid aspect-square" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const i = r * n + c
              const pre = isPrefilled(r, c)
              const sel = selected?.[0] === r && selected?.[1] === c
              const wrong = !pre && cell !== 0 && cell !== solution[r][c]
              const right = !pre && cell !== 0 && cell === solution[r][c]
              const boxEdgeR = (c + 1) % b.boxC === 0 && c < n - 1
              const boxEdgeB = (r + 1) % b.boxR === 0 && r < n - 1
              const border = `${boxEdgeR ? 'border-r-2 border-r-ink-2' : c < n - 1 ? 'border-r border-r-line' : ''} ${boxEdgeB ? 'border-b-2 border-b-ink-2' : r < n - 1 ? 'border-b border-b-line' : ''}`
              const sameBox = selected && boxOf(b, r, c) === boxOf(b, selected[0], selected[1])
              const related = selected && !sel && (selected[0] === r || selected[1] === c || sameBox)
              const same = selShowsSame && !sel && cell === selVal && !wrong
              const diag = b.diagonal && (onMain(r, c) || onAnti(n, r, c))

              let bg = 'bg-paper/70'
              if (diag) bg = 'bg-accent/[0.08]'
              if (related) bg = 'bg-accent/10'
              if (same) bg = 'bg-accent/30'
              if (sel) bg = 'bg-accent/35'
              if (wrong) bg = 'bg-red-500/25'

              const m = notes[r][c]
              return (
                <button
                  key={i}
                  type="button"
                  data-cell={i}
                  onClick={() => !settled && setSelected([r, c])}
                  className={`relative flex items-center justify-center font-bold transition-colors ${bg} ${border}
                    ${flash?.cells.has(i) ? 'sdk-flash' : ''} ${shake === i ? 'sdk-shake' : ''}`}
                  style={{ fontSize: `${(n === 9 ? 52 : 60) / n}cqw` }}
                >
                  {cell !== 0 ? (
                    <span className={pre ? 'text-ink' : wrong ? 'text-red-600' : right ? 'text-emerald-800' : ''}>{cell}</span>
                  ) : m ? (
                    <span className="absolute inset-[6%] grid text-ink-2 font-normal leading-none"
                      style={{ gridTemplateColumns: `repeat(${noteCols}, 1fr)`, gridTemplateRows: `repeat(${noteRows}, 1fr)`, fontSize: '0.36em' }}>
                      {Array.from({ length: n }, (_, k) => (
                        <span key={k} className="flex items-center justify-center">{m & (1 << (k + 1)) ? k + 1 : ''}</span>
                      ))}
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Number pad and tools */}
      {!settled && (
        <div className="flex flex-col gap-2 w-full max-w-[420px] mx-auto">
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {Array.from({ length: n }, (_, k) => k + 1).map(v => {
              const left = remaining(v)
              return (
                <button key={v} type="button" onClick={() => fill(v)} disabled={left === 0}
                  aria-label={`${notesMode ? 'note' : 'enter'} ${v}`}
                  className={`relative h-11 rounded-lg border font-bold text-lg transition-all
                    ${left === 0 ? 'bg-paper border-line text-muted/50' : notesMode ? 'bg-panel border-accent/50 text-accent' : 'bg-panel border-line text-ink hover:bg-accent/15'}`}>
                  {v}
                  {left > 0 && <span className="absolute bottom-0.5 right-1 text-[9px] font-normal text-muted">{left}</span>}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" onClick={() => setNotesMode(v => !v)} aria-pressed={notesMode}
              className={`h-10 rounded-lg border text-xs font-bold transition-all ${notesMode ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
              ✎ Notes {notesMode ? 'on' : 'off'}
            </button>
            <button type="button" onClick={clear}
              className="h-10 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold hover:text-red-600">
              ⌫ Erase
            </button>
            <button type="button" onClick={hint} disabled={!canHint}
              className={`h-10 rounded-lg border text-xs font-bold ${canHint ? 'bg-panel border-line text-ink-2 hover:border-accent/50' : 'bg-paper border-line text-muted/50'}`}>
              ✦ Hint (+1 ✗)
            </button>
          </div>
        </div>
      )}

      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : notesMode ? 'Notes mode: tap numbers to pencil them in' : selected ? `Row ${selected[0] + 1}, column ${selected[1] + 1}` : 'Tap a cell, then a number'}
      </p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Grid solved!" loseTitle="Too many mistakes" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
