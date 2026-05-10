import { useState, useEffect, useCallback } from 'react'

// ── Maze data ──────────────────────────────────────────────────────────────────

type MazeKey = 'pyramid' | 'long-march' | 'knight' | 'mulan'

interface MazeConfig {
  title: string
  subtitle: string
  grid: string[]
}

const MAZES: Record<MazeKey, MazeConfig> = {
  pyramid: {
    title: 'Inner Sanctum',
    subtitle: 'Navigate the sacred burial chambers',
    grid: [
      '#########',
      '#S.#...##',
      '#.#...#.#',
      '#.#.###.#',
      '#.......#',
      '###.#.#.#',
      '#...#..E#',
    ],
  },
  'long-march': {
    title: 'Mountain Pass',
    subtitle: 'Cross the treacherous mountain paths',
    grid: [
      '#########',
      '##...####',
      '#.......#',
      '#.#####.#',
      '#.#...#.#',
      '#S#.#.#.E',
      '#########',
    ],
  },
  knight: {
    title: 'Castle Labyrinth',
    subtitle: 'Solve the chivalric maze of honor',
    grid: [
      '#########',
      '#S.#...##',
      '#.#...#.#',
      '#.#.#.#.#',
      '#...#...#',
      '#.###.###',
      '#.......E',
    ],
  },
  mulan: {
    title: 'Forest Trail',
    subtitle: 'Find the hidden path through the forest',
    grid: [
      '#########',
      '#S...####',
      '#.###...#',
      '#.#...#.#',
      '#.#.#.#.#',
      '#...#...#',
      '####.E###',
    ],
  },
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface Pos {
  row: number
  col: number
}

// ── Component ──────────────────────────────────────────────────────────────────

interface MazeGameProps {
  configId: string
  onWin: () => void
}

export default function MazeGame({ configId, onWin }: MazeGameProps) {
  const config = MAZES[configId as MazeKey] ?? MAZES['pyramid']
  const grid = config.grid

  // Find start position
  const findCell = (ch: string): Pos => {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === ch) return { row: r, col: c }
      }
    }
    return { row: 0, col: 0 }
  }

  const startPos = findCell('S')

  const [pos, setPos] = useState<Pos>(startPos)
  const [steps, setSteps] = useState(0)
  const [won, setWon] = useState(false)
  const [winFlash, setWinFlash] = useState(false)

  const move = useCallback((dr: number, dc: number) => {
    if (won) return
    setPos(prev => {
      const nr = prev.row + dr
      const nc = prev.col + dc
      if (nr < 0 || nr >= grid.length || nc < 0 || nc >= grid[0].length) return prev
      const cell = grid[nr][nc]
      if (cell === '#') return prev
      setSteps(s => s + 1)
      if (cell === 'E') {
        setWon(true)
        setWinFlash(true)
        setTimeout(() => onWin(), 900)
      }
      return { row: nr, col: nc }
    })
  }, [won, grid, onWin])

  // Keyboard controls
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); move(-1, 0); break
        case 'ArrowDown':  e.preventDefault(); move(1, 0);  break
        case 'ArrowLeft':  e.preventDefault(); move(0, -1); break
        case 'ArrowRight': e.preventDefault(); move(0, 1);  break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [move])

  const CELL = 36 // px, slightly larger for readability

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Header */}
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm tracking-wide">{config.title}</p>
        <p className="text-slate-400 text-xs">{config.subtitle}</p>
      </div>

      {/* Step counter */}
      <div className="flex items-center gap-2 text-slate-400 text-xs">
        <span className="text-slate-500">Steps:</span>
        <span className="text-amber-300 font-bold">{steps}</span>
      </div>

      {/* Maze grid */}
      <div
        className="relative rounded-xl overflow-hidden border border-slate-700/60"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${grid[0].length}, ${CELL}px)`,
          gridTemplateRows: `repeat(${grid.length}, ${CELL}px)`,
          background: '#0f0f1e',
        }}>
        {grid.map((row, r) =>
          row.split('').map((cell, c) => {
            const isPlayer = pos.row === r && pos.col === c
            const isExit = cell === 'E'
            const isWall = cell === '#'
            const isStart = cell === 'S'

            return (
              <div
                key={`${r}-${c}`}
                style={{ width: CELL, height: CELL }}
                className={`relative flex items-center justify-center transition-all duration-150
                  ${isWall
                    ? 'bg-slate-800 shadow-inner'
                    : isExit
                    ? winFlash ? 'bg-emerald-400/30' : 'bg-emerald-900/20'
                    : isStart
                    ? 'bg-slate-900/60'
                    : 'bg-slate-900/40'
                  }`}>
                {/* Wall texture */}
                {isWall && (
                  <div className="absolute inset-0 bg-slate-700/10 border border-slate-700/30 rounded-sm" />
                )}

                {/* Exit indicator */}
                {isExit && !isPlayer && (
                  <div className={`flex items-center justify-center w-full h-full transition-all duration-300
                    ${winFlash ? 'scale-125' : 'scale-100'}`}>
                    <div className={`w-5 h-5 rounded-full border-2 border-emerald-400 flex items-center justify-center
                      ${winFlash ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]' : 'bg-emerald-900/40'}`}>
                      <span className="text-[9px]">🎯</span>
                    </div>
                  </div>
                )}

                {/* Start marker (only when player isn't there) */}
                {isStart && !isPlayer && (
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                )}

                {/* Player */}
                {isPlayer && (
                  <div className={`w-6 h-6 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]
                    flex items-center justify-center transition-all duration-100 z-10
                    ${winFlash ? 'scale-125 shadow-[0_0_16px_rgba(52,211,153,0.9)] bg-emerald-400' : ''}`}>
                    {isExit && <span className="text-[8px]">🎯</span>}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* D-pad controls */}
      <div className="flex flex-col items-center gap-1 mt-1">
        {/* Up */}
        <button
          onPointerDown={() => move(-1, 0)}
          className="w-10 h-10 rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300
                     hover:bg-slate-600/60 active:bg-amber-500/30 active:border-amber-500/50
                     flex items-center justify-center text-lg font-bold transition-all duration-100
                     select-none touch-none">
          ↑
        </button>
        {/* Left / Down / Right */}
        <div className="flex gap-1">
          <button
            onPointerDown={() => move(0, -1)}
            className="w-10 h-10 rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300
                       hover:bg-slate-600/60 active:bg-amber-500/30 active:border-amber-500/50
                       flex items-center justify-center text-lg font-bold transition-all duration-100
                       select-none touch-none">
            ←
          </button>
          <div className="w-10 h-10 rounded-lg bg-slate-800/40 border border-slate-700/30 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-amber-400/50" />
          </div>
          <button
            onPointerDown={() => move(0, 1)}
            className="w-10 h-10 rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300
                       hover:bg-slate-600/60 active:bg-amber-500/30 active:border-amber-500/50
                       flex items-center justify-center text-lg font-bold transition-all duration-100
                       select-none touch-none">
            →
          </button>
        </div>
        {/* Down */}
        <button
          onPointerDown={() => move(1, 0)}
          className="w-10 h-10 rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300
                     hover:bg-slate-600/60 active:bg-amber-500/30 active:border-amber-500/50
                     flex items-center justify-center text-lg font-bold transition-all duration-100
                     select-none touch-none">
          ↓
        </button>
      </div>

      {won && (
        <div className="text-emerald-400 font-bold text-sm animate-pulse">
          Exit reached in {steps} steps!
        </div>
      )}
    </div>
  )
}
