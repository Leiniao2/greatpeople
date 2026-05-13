import { useState, useCallback } from 'react'

interface SudokuConfig {
  title: string
  intro: string
  initial: number[][]   // 0 = empty
  solution: number[][]
  fact: string
}

// All grids are valid 4×4 sudoku (each row/col/2×2 box contains 1-4)
const CONFIGS: Record<string, SudokuConfig> = {
  'brahms-pattern': {
    title: "Brahms' Compositional Grid",
    intro: 'Brahms organised his motifs so no phrase repeated in the same voice within a section. Fill the grid so each row, column, and 2×2 box contains 1–4 exactly once.',
    initial: [
      [1, 0, 3, 0],
      [0, 4, 0, 2],
      [2, 0, 4, 0],
      [0, 3, 0, 1],
    ],
    solution: [
      [1, 2, 3, 4],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
      [4, 3, 2, 1],
    ],
    fact: "Brahms spent 14 years revising his First Symphony before releasing it in 1876. His obsession with structural rigor earned it the nickname 'Beethoven's Tenth' — yet the work pulses with Romantic warmth. Like sudoku, every element is constrained, yet the result feels inevitable, not mechanical.",
  },
  'euclid-grid': {
    title: "Euclid's Proof Grid",
    intro: "Euclid's Elements organises 465 propositions so no concept appears before it is proven. Fill the grid so each row, column, and 2×2 box contains 1–4 exactly once.",
    initial: [
      [2, 0, 0, 1],
      [0, 1, 2, 0],
      [3, 0, 0, 2],
      [0, 2, 3, 0],
    ],
    solution: [
      [2, 3, 4, 1],
      [4, 1, 2, 3],
      [3, 4, 1, 2],
      [1, 2, 3, 4],
    ],
    fact: "Euclid's Elements (c. 300 BCE) laid out all of classical geometry from five axioms alone. Its logical structure — each proposition built strictly on what came before — was so airtight that it served as the definitive mathematics textbook for over 2,000 years.",
  },
  'al-khwarizmi-grid': {
    title: "Al-Khwārizmī's Balance",
    intro: "Al-Khwārizmī's algebra reduces every problem to a balanced equation. Fill the grid so each row, column, and 2×2 box contains 1–4 exactly once.",
    initial: [
      [0, 4, 1, 0],
      [1, 0, 0, 4],
      [4, 0, 0, 1],
      [0, 1, 4, 0],
    ],
    solution: [
      [3, 4, 1, 2],
      [1, 2, 3, 4],
      [4, 3, 2, 1],
      [2, 1, 4, 3],
    ],
    fact: "Muhammad ibn Mūsā al-Khwārizmī wrote Kitāb al-mukhtaṣar fī ḥisāb al-jabr (c. 820 CE), the founding text of algebra. The word 'algebra' comes from al-jabr — 'the reunion of broken parts.' His name gave us 'algorithm.' He described balancing equations using exactly the logic a sudoku player uses.",
  },
  'anaxagoras-grid': {
    title: "The Mind That Orders",
    intro: "Anaxagoras held that Nous (Mind) imposes order on a chaotic universe — each element in its proper place. Fill the grid so each row, column, and 2×2 box contains 1–4 exactly once.",
    initial: [
      [2, 0, 0, 3],
      [0, 3, 2, 0],
      [4, 0, 0, 1],
      [0, 1, 4, 0],
    ],
    solution: [
      [2, 4, 1, 3],
      [1, 3, 2, 4],
      [4, 2, 3, 1],
      [3, 1, 4, 2],
    ],
    fact: "Anaxagoras (c. 500–428 BCE) was the first to introduce Nous — cosmic Mind — as the ordering principle of the universe. He also correctly deduced that the moon shines with reflected sunlight, that eclipses are caused by the moon, and that the sun is a fiery rock larger than the Peloponnese. He was tried for impiety in Athens and saved from execution only by Pericles' influence.",
  },
  'mendel-grid': {
    title: "Mendel's Inheritance Grid",
    intro: "Mendel's laws ensure that dominant and recessive traits distribute across generations in strict, predictable ratios — no pattern repeats the same way twice. Fill the grid so each row, column, and 2×2 box contains 1–4 exactly once.",
    initial: [
      [0, 3, 0, 4],
      [4, 0, 0, 1],
      [3, 0, 1, 0],
      [0, 1, 0, 3],
    ],
    solution: [
      [1, 3, 2, 4],
      [4, 2, 3, 1],
      [3, 4, 1, 2],
      [2, 1, 4, 3],
    ],
    fact: "Gregor Mendel crossed 29,000 pea plants over eight years in St Thomas's Abbey garden, Brno. His 3:1 ratio of dominant to recessive traits revealed the hidden mathematics of heredity. His paper sat unread for 35 years; rediscovered in 1900 by three scientists independently, it became the founding document of genetics.",
  },
  'lorentz-grid': {
    title: "The Transformation",
    intro: "Lorentz's equations describe a universe where time, space, and mass change with velocity — yet follow exact mathematical constraints. Fill the grid so each row, column, and 2×2 box contains 1–4 exactly once.",
    initial: [
      [3, 0, 0, 2],
      [0, 4, 1, 0],
      [1, 0, 0, 4],
      [0, 2, 3, 0],
    ],
    solution: [
      [3, 1, 4, 2],
      [2, 4, 1, 3],
      [1, 3, 2, 4],
      [4, 2, 3, 1],
    ],
    fact: "Hendrik Lorentz derived his transformation equations in 1895–1904, showing mathematically that length, time, and mass all change with velocity. Einstein took these same equations and provided the physical interpretation: they do not describe a distortion of measurement, but a genuine feature of spacetime. Lorentz was magnanimous about this — he considered Einstein's insight the greater achievement.",
  },
  'eisenstein-grid': {
    title: "The Montage Grid",
    intro: "Eisenstein's montage: juxtapose shots so that no image repeats the same idea in the same context — the meaning emerges between them. Fill the grid so each row, column, and 2×2 box contains 1–4 exactly once.",
    initial: [
      [0, 2, 0, 1],
      [1, 0, 0, 4],
      [2, 0, 1, 0],
      [0, 1, 4, 0],
    ],
    solution: [
      [4, 2, 3, 1],
      [1, 3, 2, 4],
      [2, 4, 1, 3],
      [3, 1, 4, 2],
    ],
    fact: "Eisenstein's montage theory — that meaning is created between shots, not within them — revolutionised cinema. The Kuleshov effect demonstrates this: the same neutral face, cut to food, reads as hunger; cut to a coffin, reads as grief. Eisenstein used this principle to build Battleship Potemkin's Odessa Steps sequence — still studied in every film school on Earth.",
  },
}

function sameBox(r1: number, c1: number, r2: number, c2: number) {
  return Math.floor(r1 / 2) === Math.floor(r2 / 2) && Math.floor(c1 / 2) === Math.floor(c2 / 2)
}

function hasConflict(grid: number[][], r: number, c: number, val: number): boolean {
  for (let i = 0; i < 4; i++) {
    if (i !== c && grid[r][i] === val) return true
    if (i !== r && grid[i][c] === val) return true
  }
  for (let dr = 0; dr < 4; dr++) {
    for (let dc = 0; dc < 4; dc++) {
      if ((dr !== r || dc !== c) && sameBox(r, c, dr, dc) && grid[dr][dc] === val) return true
    }
  }
  return false
}

export default function SudokuGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['brahms-pattern']

  const [grid, setGrid] = useState<number[][]>(() => config.initial.map(r => [...r]))
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [won, setWon] = useState(false)

  const isPrefilled = (r: number, c: number) => config.initial[r][c] !== 0
  const isConflicted = (r: number, c: number) => {
    const v = grid[r][c]
    return v !== 0 && hasConflict(grid, r, c, v)
  }

  const fill = useCallback((val: number) => {
    if (!selected || won) return
    const [r, c] = selected
    if (isPrefilled(r, c)) return
    const next = grid.map(row => [...row])
    next[r][c] = val
    setGrid(next)

    // Check win
    const solved = next.every((row, ri) =>
      row.every((cell, ci) => cell === config.solution[ri][ci])
    )
    if (solved) { setWon(true); setTimeout(onWin, 700) }
  }, [selected, grid, won, config])

  const clear = useCallback(() => {
    if (!selected || won) return
    const [r, c] = selected
    if (isPrefilled(r, c)) return
    const next = grid.map(row => [...row])
    next[r][c] = 0
    setGrid(next)
  }, [selected, grid, won])

  return (
    <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-4">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
      <p className="text-slate-400 text-xs leading-relaxed">{config.intro}</p>

      {/* Grid */}
      <div className="flex justify-center">
        <div className="grid grid-cols-4 gap-0 border-2 border-white/20 rounded-lg overflow-hidden">
          {grid.map((row, r) =>
            row.map((cell, c) => {
              const pre = isPrefilled(r, c)
              const sel = selected?.[0] === r && selected?.[1] === c
              const conflict = !pre && isConflicted(r, c)
              const correct = !pre && cell !== 0 && cell === config.solution[r][c]
              const borderR = c === 1 ? 'border-r-2 border-r-white/30' : c < 3 ? 'border-r border-r-white/10' : ''
              const borderB = r === 1 ? 'border-b-2 border-b-white/30' : r < 3 ? 'border-b border-b-white/10' : ''

              let bg = sel ? 'bg-amber-500/20' : 'bg-slate-900'
              if (conflict) bg = 'bg-red-500/20'
              if (correct && !sel) bg = 'bg-emerald-500/10'

              return (
                <button
                  key={`${r},${c}`}
                  onClick={() => !pre && setSelected([r, c])}
                  className={`w-14 h-14 flex items-center justify-center text-lg font-bold transition-colors ${bg} ${borderR} ${borderB} ${pre ? 'cursor-default' : 'cursor-pointer hover:bg-amber-500/10'}`}
                >
                  <span className={pre ? 'text-white' : conflict ? 'text-red-400' : correct ? 'text-emerald-400' : cell !== 0 ? 'text-amber-300' : 'text-transparent'}>
                    {cell !== 0 ? cell : '.'}
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Number buttons */}
      {!won && (
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4].map(n => (
            <button
              key={n}
              onClick={() => fill(n)}
              className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/10 text-white font-bold text-lg hover:bg-amber-500/20 hover:border-amber-500/40 transition-all"
            >
              {n}
            </button>
          ))}
          <button
            onClick={clear}
            className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/10 text-slate-500 text-lg hover:border-red-500/30 hover:text-red-400 transition-all"
          >
            ✕
          </button>
        </div>
      )}

      <p className="text-slate-600 text-[10px] text-center">
        {won
          ? <span className="text-emerald-400 font-bold">✓ Grid solved!</span>
          : selected
          ? `Filling row ${selected[0] + 1}, column ${selected[1] + 1}`
          : 'Tap an empty cell to select it'}
      </p>

      {won && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-xs leading-relaxed">
          <span className="font-bold text-emerald-300">✓ Complete! </span>
          <span className="text-slate-400">{config.fact}</span>
        </div>
      )}
    </div>
  )
}
