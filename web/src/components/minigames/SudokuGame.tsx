import { useMemo, useState, useCallback } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Sudoku with a seeded generator.  Difficulty sets the board:
//   1 → 4×4 (2×2 boxes)   2–3 → 6×6 (2×3 boxes)   4 → 9×9 (3×3 boxes)
// and how many wrong entries end the game (3 / 3 / 2 / 1).

interface SudokuConfig {
  title: string
  intro: string
  fact: string
}

const CONFIGS: Record<string, SudokuConfig> = {
  'brahms-pattern': {
    title: "Brahms' Compositional Grid",
    intro: 'Brahms organised his motifs so no phrase repeated in the same voice within a section. Fill the grid so each row, column and box holds every number exactly once.',
    fact: "Brahms spent 14 years revising his First Symphony before releasing it in 1876. His obsession with structural rigor earned it the nickname 'Beethoven's Tenth' — yet the work pulses with Romantic warmth. Like sudoku, every element is constrained, yet the result feels inevitable, not mechanical.",
  },
  'euclid-grid': {
    title: "Euclid's Proof Grid",
    intro: "Euclid's Elements organises 465 propositions so no concept appears before it is proven. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Euclid's Elements (c. 300 BCE) laid out all of classical geometry from five axioms alone. Its logical structure — each proposition built strictly on what came before — was so airtight that it served as the definitive mathematics textbook for over 2,000 years.",
  },
  'al-khwarizmi-grid': {
    title: "Al-Khwārizmī's Balance",
    intro: "Al-Khwārizmī's algebra reduces every problem to a balanced equation. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Muhammad ibn Mūsā al-Khwārizmī wrote Kitāb al-mukhtaṣar fī ḥisāb al-jabr (c. 820 CE), the founding text of algebra. The word 'algebra' comes from al-jabr — 'the reunion of broken parts.' His name gave us 'algorithm.' He described balancing equations using exactly the logic a sudoku player uses.",
  },
  'anaxagoras-grid': {
    title: 'The Mind That Orders',
    intro: 'Anaxagoras held that Nous (Mind) imposes order on a chaotic universe — each element in its proper place. Fill the grid so each row, column and box holds every number exactly once.',
    fact: "Anaxagoras (c. 500–428 BCE) was the first to introduce Nous — cosmic Mind — as the ordering principle of the universe. He also correctly deduced that the moon shines with reflected sunlight, that eclipses are caused by the moon, and that the sun is a fiery rock larger than the Peloponnese. He was tried for impiety in Athens and saved from execution only by Pericles' influence.",
  },
  'mendel-grid': {
    title: "Mendel's Inheritance Grid",
    intro: "Mendel's laws ensure that dominant and recessive traits distribute across generations in strict, predictable ratios. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Gregor Mendel crossed 29,000 pea plants over eight years in St Thomas's Abbey garden, Brno. His 3:1 ratio of dominant to recessive traits revealed the hidden mathematics of heredity. His paper sat unread for 35 years; rediscovered in 1900 by three scientists independently, it became the founding document of genetics.",
  },
  'lorentz-grid': {
    title: 'The Transformation',
    intro: "Lorentz's equations describe a universe where time, space and mass change with velocity — yet follow exact mathematical constraints. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Hendrik Lorentz derived his transformation equations in 1895–1904, showing mathematically that length, time, and mass all change with velocity. Einstein took these same equations and provided the physical interpretation: they do not describe a distortion of measurement, but a genuine feature of spacetime. Lorentz was magnanimous about this — he considered Einstein's insight the greater achievement.",
  },
  'eisenstein-grid': {
    title: 'The Montage Grid',
    intro: "Eisenstein's montage: juxtapose shots so that no image repeats the same idea in the same context — the meaning emerges between them. Fill the grid so each row, column and box holds every number exactly once.",
    fact: "Eisenstein's montage theory — that meaning is created between shots, not within them — revolutionised cinema. The Kuleshov effect demonstrates this: the same neutral face, cut to food, reads as hunger; cut to a coffin, reads as grief. Eisenstein used this principle to build Battleship Potemkin's Odessa Steps sequence — still studied in every film school on Earth.",
  },
}

// ── Generator ──────────────────────────────────────────────────────────────────

interface Board { n: number; boxR: number; boxC: number }

const BOARDS: Record<4 | 6 | 9, Board> = {
  4: { n: 4, boxR: 2, boxC: 2 },
  6: { n: 6, boxR: 2, boxC: 3 },
  9: { n: 9, boxR: 3, boxC: 3 },
}

function boxOf(b: Board, r: number, c: number) {
  return Math.floor(r / b.boxR) * b.boxR + Math.floor(c / b.boxC)
}

function canPlace(b: Board, grid: number[][], r: number, c: number, v: number): boolean {
  for (let i = 0; i < b.n; i++) {
    if (grid[r][i] === v || grid[i][c] === v) return false
  }
  const br = Math.floor(r / b.boxR) * b.boxR, bc = Math.floor(c / b.boxC) * b.boxC
  for (let dr = 0; dr < b.boxR; dr++)
    for (let dc = 0; dc < b.boxC; dc++)
      if (grid[br + dr][bc + dc] === v) return false
  return true
}

/** Fill an empty grid completely, in a random order driven by `rng`. */
function fillSolution(b: Board, rng: Rng): number[][] {
  const grid: number[][] = Array.from({ length: b.n }, () => Array(b.n).fill(0))
  const order = (): number[] => {
    const vals = Array.from({ length: b.n }, (_, i) => i + 1)
    for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]] }
    return vals
  }
  function solve(idx: number): boolean {
    if (idx === b.n * b.n) return true
    const r = Math.floor(idx / b.n), c = idx % b.n
    for (const v of order()) {
      if (canPlace(b, grid, r, c, v)) {
        grid[r][c] = v
        if (solve(idx + 1)) return true
        grid[r][c] = 0
      }
    }
    return false
  }
  solve(0)
  return grid
}

/** Count solutions, stopping at 2. */
export function countSolutions(b: Board, grid: number[][]): number {
  let count = 0
  function solve(idx: number): void {
    if (count >= 2) return
    if (idx === b.n * b.n) { count++; return }
    const r = Math.floor(idx / b.n), c = idx % b.n
    if (grid[r][c] !== 0) { solve(idx + 1); return }
    for (let v = 1; v <= b.n; v++) {
      if (canPlace(b, grid, r, c, v)) {
        grid[r][c] = v
        solve(idx + 1)
        grid[r][c] = 0
        if (count >= 2) return
      }
    }
  }
  solve(0)
  return count
}

/** Remove cells from a full solution while the puzzle keeps a unique answer. */
function makePuzzle(b: Board, solution: number[][], blanks: number, rng: Rng): number[][] {
  const puzzle = solution.map(r => [...r])
  const cells = Array.from({ length: b.n * b.n }, (_, i) => i)
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]] }
  let removed = 0
  for (const idx of cells) {
    if (removed >= blanks) break
    const r = Math.floor(idx / b.n), c = idx % b.n
    const keep = puzzle[r][c]
    puzzle[r][c] = 0
    if (countSolutions(b, puzzle) === 1) removed++
    else puzzle[r][c] = keep
  }
  return puzzle
}

export function generate(difficulty: Difficulty, seed: number) {
  const b = BOARDS[scale(difficulty, [4, 6, 6, 9] as const)]
  const rng = mulberry32(seed)
  const solution = fillSolution(b, rng)
  // Fraction of cells left blank per tier.
  const blankShare = scale(difficulty, [0.5, 0.5, 0.6, 0.55])
  const puzzle = makePuzzle(b, solution, Math.floor(b.n * b.n * blankShare), rng)
  return { board: b, solution, puzzle }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SudokuGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'brahms-pattern')
  const { board: b, solution, puzzle } = useMemo(() => generate(difficulty, seed), [difficulty, seed])
  const maxMistakes = scale(difficulty, [3, 3, 2, 1])

  const [grid, setGrid] = useState<number[][]>(() => puzzle.map(r => [...r]))
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 800 })

  const isPrefilled = (r: number, c: number) => puzzle[r][c] !== 0

  const fill = useCallback((val: number) => {
    if (!selected || settled) return
    const [r, c] = selected
    if (isPrefilled(r, c)) return
    const next = grid.map(row => [...row])
    next[r][c] = val
    setGrid(next)

    if (val !== solution[r][c]) {
      const m = mistakes + 1
      setMistakes(m)
      if (m >= maxMistakes) lose('too many mistakes')
      return
    }
    if (next.every((row, ri) => row.every((cell, ci) => cell === solution[ri][ci]))) win()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, grid, settled, solution, mistakes, maxMistakes, win, lose])

  const clear = useCallback(() => {
    if (!selected || settled) return
    const [r, c] = selected
    if (isPrefilled(r, c)) return
    const next = grid.map(row => [...row])
    next[r][c] = 0
    setGrid(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, grid, settled])

  const cellPx = b.n === 9 ? 32 : b.n === 6 ? 42 : 56

  return (
    <div className="flex flex-col gap-4 bg-paper-2 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p>{b.n}×{b.n}</p>
          <p className={mistakes > 0 ? 'text-red-600 font-bold' : ''}>✗ {mistakes} / {maxMistakes}</p>
        </div>
      </div>

      {/* Grid */}
      <div className="flex justify-center">
        <div className="grid gap-0 border-2 border-line-2 rounded-lg overflow-hidden"
          style={{ gridTemplateColumns: `repeat(${b.n}, ${cellPx}px)` }}>
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const pre = isPrefilled(r, c)
              const sel = selected?.[0] === r && selected?.[1] === c
              const wrong = !pre && cell !== 0 && cell !== solution[r][c]
              const right = !pre && cell !== 0 && cell === solution[r][c]
              const boxEdgeR = (c + 1) % b.boxC === 0 && c < b.n - 1
              const boxEdgeB = (r + 1) % b.boxR === 0 && r < b.n - 1
              const border = `${boxEdgeR ? 'border-r-2 border-r-line-2' : c < b.n - 1 ? 'border-r border-r-line' : ''} ${boxEdgeB ? 'border-b-2 border-b-line-2' : r < b.n - 1 ? 'border-b border-b-line' : ''}`
              const sameBox = selected && boxOf(b, r, c) === boxOf(b, selected[0], selected[1])
              const related = selected && !sel && (selected[0] === r || selected[1] === c || sameBox)

              let bg = sel ? 'bg-accent/20' : related ? 'bg-accent/5' : 'bg-paper-2'
              if (wrong) bg = 'bg-red-500/20'
              else if (right && !sel) bg = 'bg-emerald-500/10'

              return (
                <button
                  key={`${r},${c}`}
                  onClick={() => !pre && !settled && setSelected([r, c])}
                  className={`flex items-center justify-center font-bold transition-colors ${bg} ${border} ${pre ? 'cursor-default' : 'cursor-pointer hover:bg-accent/10'}`}
                  style={{ width: cellPx, height: cellPx, fontSize: b.n === 9 ? 14 : 18 }}
                >
                  <span className={pre ? 'text-ink' : wrong ? 'text-red-600' : right ? 'text-emerald-700' : 'text-transparent'}>
                    {cell !== 0 ? cell : '.'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Number buttons */}
      {!settled && (
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: b.n }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => fill(n)}
              className="w-11 h-11 rounded-xl bg-panel border border-line text-ink font-bold text-lg hover:bg-accent/20 hover:border-accent/40 transition-all">
              {n}
            </button>
          ))}
          <button onClick={clear}
            className="w-11 h-11 rounded-xl bg-panel border border-line text-muted text-lg hover:border-red-500/30 hover:text-red-600 transition-all">
            ✕
          </button>
        </div>
      )}

      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : selected ? `Filling row ${selected[0] + 1}, column ${selected[1] + 1}` : 'Tap an empty cell to select it'}
      </p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="Grid solved!" loseTitle="Too many mistakes" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
