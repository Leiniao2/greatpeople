import { useState, useEffect } from 'react'
import type { MinigameProps } from '@/games/types'
import { scale, useGameTimer, TimerBar } from './_shared'

// ── Types & config ─────────────────────────────────────────────────────────────

type PuzzleKey = 'renaissance' | 'pyramid-stones'

// 0 = blank tile
type TileBoard = number[]

interface PuzzleConfig {
  title: string
  subtitle: string
  initial: TileBoard  // 9 items, 0 = blank
  tileColors: Record<number, string>  // color classes per tile number
  tileTextColors: Record<number, string>
}

// Solvable scrambles (odd number of inversions relative to blank position achieves solvability)
export const CONFIGS: Record<PuzzleKey, PuzzleConfig> = {
  renaissance: {
    title: 'Renaissance Masterpiece',
    subtitle: 'Restore the painting to its original glory',
    // Scramble: blank at index 7 — solvable (14 inversions, even)
    initial: [5, 2, 8, 4, 1, 7, 3, 0, 6],
    tileColors: {
      1: 'from-blue-900 to-blue-800',
      2: 'from-sky-800 to-sky-700',
      3: 'from-slate-200 to-slate-100',
      4: 'from-green-800 to-green-700',
      5: 'from-amber-700 to-amber-600',
      6: 'from-red-800 to-red-700',
      7: 'from-orange-900 to-orange-800',
      8: 'from-stone-800 to-stone-700',
    },
    tileTextColors: {
      1: 'text-blue-200',
      2: 'text-sky-200',
      3: 'text-muted/60',
      4: 'text-green-200',
      5: 'text-ink-2',
      6: 'text-red-200',
      7: 'text-orange-200',
      8: 'text-stone-200',
    },
  },
  'pyramid-stones': {
    title: 'Pyramid Cornerstone',
    subtitle: 'Assemble the ancient stone pattern',
    // Scramble: blank at index 4 — solvable
    initial: [3, 6, 4, 1, 0, 2, 7, 8, 5],
    tileColors: {
      1: 'from-yellow-600 to-yellow-500',
      2: 'from-yellow-700 to-yellow-600',
      3: 'from-amber-700 to-amber-600',
      4: 'from-amber-800 to-amber-700',
      5: 'from-stone-700 to-stone-600',
      6: 'from-stone-800 to-stone-700',
      7: 'from-stone-900 to-stone-800',
      8: 'from-zinc-900 to-zinc-800',
    },
    tileTextColors: {
      1: 'text-yellow-900',
      2: 'text-yellow-100',
      3: 'text-ink-2',
      4: 'text-ink-2',
      5: 'text-stone-100',
      6: 'text-stone-100',
      7: 'text-stone-200',
      8: 'text-zinc-200',
    },
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SOLVED: TileBoard = [1, 2, 3, 4, 5, 6, 7, 8, 0]

function isSolved(board: TileBoard): boolean {
  return board.every((v, i) => v === SOLVED[i])
}

function getNeighbors(idx: number): number[] {
  const row = Math.floor(idx / 3)
  const col = idx % 3
  const neighbors: number[] = []
  if (row > 0) neighbors.push(idx - 3)
  if (row < 2) neighbors.push(idx + 3)
  if (col > 0) neighbors.push(idx - 1)
  if (col < 2) neighbors.push(idx + 1)
  return neighbors
}

function slideTile(board: TileBoard, tileIdx: number): TileBoard | null {
  const blankIdx = board.indexOf(0)
  if (!getNeighbors(blankIdx).includes(tileIdx)) return null
  const next = [...board]
  next[blankIdx] = next[tileIdx]
  next[tileIdx] = 0
  return next
}

// ── Component ──────────────────────────────────────────────────────────────────


export default function SlidingPuzzle({ configId, difficulty, onWin, onLose }: MinigameProps) {
  // Higher difficulties put the puzzle on a clock.
  const timeLimit = scale(difficulty, [0, 0, 120, 90])
  const timer = useGameTimer({ seconds: timeLimit, running: true, onExpire: () => onLose('out of time') })

  const config = CONFIGS[configId as PuzzleKey] ?? CONFIGS['renaissance']
  const [board, setBoard] = useState<TileBoard>([...config.initial])
  const [moves, setMoves] = useState(0)
  const [won, setWon] = useState(false)
  const [lastMoved, setLastMoved] = useState<number | null>(null)

  const handleTileClick = (tileIdx: number) => {
    if (won) return
    const next = slideTile(board, tileIdx)
    if (!next) return
    setBoard(next)
    setMoves(m => m + 1)
    setLastMoved(tileIdx)
    setTimeout(() => setLastMoved(null), 200)
  }

  useEffect(() => {
    if (isSolved(board) && !won) {
      setWon(true)
      setTimeout(() => onWin(), 800)
    }
  }, [board, won, onWin])

  const TILE = 80 // px desktop

  return (
    <div className="flex flex-col items-center gap-4">
      {timer.active && <div className="w-full"><TimerBar remaining={timer.remaining} total={timer.total} /></div>}
      {/* Header */}
      <div className="text-center">
        <p className="text-accent font-bold text-sm">{config.title}</p>
        <p className="text-muted text-xs">{config.subtitle}</p>
      </div>

      {/* Move counter */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>Moves:</span>
        <span className="text-accent font-bold">{moves}</span>
        <span className="text-muted/80 mx-1">|</span>
        <span className="text-muted">Tap tiles adjacent to the blank space</span>
      </div>

      {/* Goal reminder */}
      <div className="flex gap-1 items-center text-xs text-muted">
        <span>Goal:</span>
        {[1,2,3,4,5,6,7,8].map(n => (
          <span key={n} className="w-5 h-5 flex items-center justify-center rounded text-[10px]
                                   bg-panel-2 border border-line text-ink-2 font-bold">
            {n}
          </span>
        ))}
        <span className="w-5 h-5 rounded bg-paper-2 border border-line" />
      </div>

      {/* Puzzle grid */}
      <div
        className={`grid grid-cols-3 gap-1.5 p-2 rounded-2xl border transition-all duration-500
          ${won
            ? 'border-emerald-500/50 bg-emerald-900/10 shadow-[0_0_20px_rgba(52,211,153,0.15)]'
            : 'border-line bg-paper-2'
          }`}
        style={{ width: TILE * 3 + 20, height: TILE * 3 + 20 }}>
        {board.map((tileNum, idx) => {
          const blankIdx = board.indexOf(0)
          const isAdjacent = getNeighbors(blankIdx).includes(idx)
          const isBlank = tileNum === 0
          const isJustMoved = lastMoved === idx
          const colorFrom = config.tileColors[tileNum] ?? 'from-slate-700 to-slate-600'
          const textColor = config.tileTextColors[tileNum] ?? 'text-ink-2'

          if (isBlank) {
            return (
              <div
                key={`blank-${idx}`}
                style={{ width: TILE, height: TILE }}
                className="rounded-xl bg-paper-2 border border-dashed border-line"
              />
            )
          }

          return (
            <button
              key={`tile-${tileNum}`}
              onClick={() => handleTileClick(idx)}
              style={{ width: TILE, height: TILE }}
              className={`rounded-xl font-bold text-xl transition-all duration-150 select-none
                bg-gradient-to-br ${colorFrom} ${textColor}
                border shadow-md
                ${isAdjacent && !won
                  ? 'border-accent/40 hover:border-accent/60 hover:scale-105 cursor-pointer shadow-amber-900/30'
                  : 'border-line cursor-default'
                }
                ${isJustMoved ? 'scale-95 shadow-inner' : ''}
                ${won ? 'border-emerald-500/30 shadow-emerald-900/20' : ''}
              `}>
              {tileNum}
            </button>
          )
        })}
      </div>

      {won && (
        <div className="text-emerald-400 font-bold text-sm animate-pulse text-center">
          Solved in {moves} moves!
        </div>
      )}
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
