import { useState, useEffect, useCallback } from 'react'

// ── Maze data ──────────────────────────────────────────────────────────────────

type MazeKey = 'pyramid' | 'long-march' | 'knight' | 'mulan' | 'pyramid-deep'

interface MazeLevel {
  title?: string
  grid: string[]
}

interface MazeConfig {
  title: string
  subtitle: string
  grid?: string[]       // single-level
  levels?: MazeLevel[]  // multi-level (use 'N' for next-level cell, 'E' for final exit)
}

const MAZES: Record<MazeKey, MazeConfig> = {
  pyramid: {
    title: 'Inner Sanctum',
    subtitle: 'Navigate the sacred burial chambers of Djoser',
    grid: [
      '###########',
      '#S.#.....##',
      '#.#.#.###.#',
      '#.....#...#',
      '#.####..#.#',
      '#.#.....#.#',
      '#.#.###.#.#',
      '#...#...#.#',
      '#####.###E#',
    ],
  },
  'long-march': {
    title: 'Mountain Pass',
    subtitle: 'Cross the treacherous paths of the Long March',
    grid: [
      '###########',
      '#S#.#.#.###',
      '#.#.#.#.###',
      '#.#.#.#.###',
      '#.....#.###',
      '#####.#.###',
      '#####.#.###',
      '#####...E##',
      '###########',
    ],
  },
  knight: {
    title: 'Castle Labyrinth',
    subtitle: "Navigate Camelot's corridors by the chivalric code",
    grid: [
      '###########',
      '#S....#####',
      '#.#########',
      '#.#.#.###.#',
      '#.#.#...#.#',
      '#.#.#####.#',
      '#.........#',
      '#...#.###.#',
      '#.#...#..E#',
    ],
  },
  mulan: {
    title: 'Forest Trail',
    subtitle: "Find Mulan's hidden path through enemy lines",
    grid: [
      '###########',
      '#S..#....##',
      '#.###.##..#',
      '#.....#...#',
      '#.#####.#.#',
      '#.#.....#.#',
      '#.#.###.#.#',
      '#...#...#.#',
      '#####.###E#',
    ],
  },
  'pyramid-deep': {
    title: 'Three Sacred Chambers',
    subtitle: 'Navigate three levels deep into the pyramid to reach the burial room',
    levels: [
      {
        title: 'Chamber I — Castle Gate',
        grid: [
          '###########',
          '#S....#####',
          '#.#########',
          '#.#.#.###.#',
          '#.#.#...#.#',
          '#.#.#####.#',
          '#.........#',
          '#...#.###.#',
          '#.#...#..N#',
        ],
      },
      {
        title: 'Chamber II — Forest Path',
        grid: [
          '###########',
          '#S..#....##',
          '#.###.##..#',
          '#.....#...#',
          '#.#####.#.#',
          '#.#.....#.#',
          '#.#.###.#.#',
          '#...#...#.#',
          '#####.###N#',
        ],
      },
      {
        title: 'Chamber III — Burial Room',
        grid: [
          '###########',
          '#S.#.....##',
          '#.#.#.###.#',
          '#.....#...#',
          '#.####..#.#',
          '#.#.....#.#',
          '#.#.###.#.#',
          '#...#...#.#',
          '#####.###E#',
        ],
      },
    ],
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface Pos { row: number; col: number }

function findStart(grid: string[]): Pos {
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c] === 'S') return { row: r, col: c }
  return { row: 0, col: 0 }
}

// ── Component ──────────────────────────────────────────────────────────────────

interface MazeGameProps {
  configId: string
  onWin: () => void
}

export default function MazeGame({ configId, onWin }: MazeGameProps) {
  const config = MAZES[configId as MazeKey] ?? MAZES['pyramid']
  const isMultiLevel = !!(config.levels?.length)
  const totalLevels = isMultiLevel ? config.levels!.length : 1

  const [currentLevel, setCurrentLevel] = useState(0)
  const [grid, setGrid] = useState<string[]>(() =>
    isMultiLevel ? config.levels![0].grid : config.grid!
  )
  const [pos, setPos] = useState<Pos>(() =>
    findStart(isMultiLevel ? config.levels![0].grid : config.grid!)
  )
  const [steps, setSteps] = useState(0)
  const [won, setWon] = useState(false)
  const [winFlash, setWinFlash] = useState(false)
  const [levelFlash, setLevelFlash] = useState(false)
  const [pendingNextLevel, setPendingNextLevel] = useState(false)

  // Handle level advance triggered from move
  useEffect(() => {
    if (!pendingNextLevel) return
    setPendingNextLevel(false)
    setCurrentLevel(prev => {
      const next = prev + 1
      const nextGrid = config.levels![next].grid
      const nextStart = findStart(nextGrid)
      setGrid(nextGrid)
      setPos(nextStart)
      setLevelFlash(true)
      setTimeout(() => setLevelFlash(false), 800)
      return next
    })
  }, [pendingNextLevel, config.levels])

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
      } else if (cell === 'N') {
        // Trigger level advance after a short delay for visual feedback
        setTimeout(() => setPendingNextLevel(true), 300)
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

  const CELL = 36

  const levelTitle = isMultiLevel
    ? config.levels![currentLevel].title ?? `Level ${currentLevel + 1}`
    : config.title

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Header */}
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm tracking-wide">{levelTitle}</p>
        <p className="text-slate-400 text-xs">{config.subtitle}</p>
      </div>

      {/* Level / step counter */}
      <div className="flex items-center gap-4 text-slate-400 text-xs">
        {isMultiLevel && (
          <span className={`font-bold transition-all duration-300 ${levelFlash ? 'text-blue-300 scale-110' : 'text-blue-400/80'}`}>
            Level {currentLevel + 1} / {totalLevels}
          </span>
        )}
        <span className="text-slate-500">Steps: <span className="text-amber-300 font-bold">{steps}</span></span>
      </div>

      {/* Level transition flash */}
      <div className="relative">
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
              const isNext = cell === 'N'
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
                      : isNext
                      ? 'bg-blue-900/20'
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

                  {/* Next-level staircase indicator */}
                  {isNext && !isPlayer && (
                    <div className="flex items-center justify-center w-full h-full">
                      <div className="w-5 h-5 rounded-full border-2 border-blue-400 flex items-center justify-center bg-blue-900/50 shadow-[0_0_6px_rgba(96,165,250,0.5)]">
                        <span className="text-[8px] text-blue-300 font-bold">▲</span>
                      </div>
                    </div>
                  )}

                  {/* Start marker */}
                  {isStart && !isPlayer && (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  )}

                  {/* Player */}
                  {isPlayer && (
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-100 z-10
                      ${winFlash
                        ? 'bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.9)] scale-125'
                        : levelFlash
                        ? 'bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.8)]'
                        : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                      }`}>
                      {isExit && <span className="text-[8px]">🎯</span>}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Level transition overlay */}
        {levelFlash && (
          <div className="absolute inset-0 rounded-xl bg-blue-500/10 border border-blue-400/30 flex items-center justify-center pointer-events-none z-10">
            <div className="bg-slate-950/90 border border-blue-400/40 rounded-xl px-4 py-2 text-center">
              <p className="text-blue-300 font-bold text-sm">Level {currentLevel + 1} / {totalLevels}</p>
              <p className="text-slate-400 text-[10px]">{config.levels![currentLevel].title}</p>
            </div>
          </div>
        )}
      </div>

      {/* Legend for multi-level */}
      {isMultiLevel && (
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full border border-blue-400 bg-blue-900/40 inline-flex items-center justify-center text-[7px] text-blue-300">▲</span>
            Next level
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full border border-emerald-400 bg-emerald-900/40 inline-flex items-center justify-center text-[7px]">🎯</span>
            Exit
          </span>
        </div>
      )}

      {/* D-pad controls */}
      <div className="flex flex-col items-center gap-1 mt-1">
        <button
          onPointerDown={() => move(-1, 0)}
          className="w-10 h-10 rounded-lg bg-slate-700/60 border border-slate-600/50 text-slate-300
                     hover:bg-slate-600/60 active:bg-amber-500/30 active:border-amber-500/50
                     flex items-center justify-center text-lg font-bold transition-all duration-100
                     select-none touch-none">
          ↑
        </button>
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
