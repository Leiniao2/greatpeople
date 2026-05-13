import { useState, useEffect, useCallback, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Theme = 'dungeon' | 'forest' | 'sky'
type MazeKey = 'pyramid' | 'long-march' | 'knight' | 'mulan' | 'pyramid-deep' | 'gilgamesh' | 'musashi'
  | 'cedar-forest' | 'pacific-strait' | 'atlantic-sky' | 'everest-peak'

interface MazeLevel { title?: string; grid: string[] }
interface MazeConfig {
  title: string
  subtitle: string
  theme: Theme
  monsterCount?: number
  grid?: string[]
  levels?: MazeLevel[]
}

// ── Theme definitions ──────────────────────────────────────────────────────────

interface ThemeDef {
  bg: string
  wallCls: string; wallExtra: string; floorCls: string
  playerCls: string; exitCls: string; exitFlash: string; nextCls: string
  monsters: string[]
  wallContent: string | null
}

const THEME: Record<Theme, ThemeDef> = {
  dungeon: {
    bg: '#0a0a14',
    wallCls: 'bg-slate-800', wallExtra: 'border border-slate-700/30', floorCls: 'bg-slate-900/40',
    playerCls: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
    exitCls: 'bg-emerald-900/20', exitFlash: 'bg-emerald-400/30', nextCls: 'bg-blue-900/20',
    monsters: ['💀', '🦇', '🐍'], wallContent: null,
  },
  forest: {
    bg: '#0d1a08',
    wallCls: 'bg-green-900', wallExtra: '', floorCls: 'bg-amber-950/60',
    playerCls: 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.7)]',
    exitCls: 'bg-yellow-600/25', exitFlash: 'bg-yellow-400/40', nextCls: 'bg-teal-900/30',
    monsters: ['🐺', '🐗', '🦊'], wallContent: '🌲',
  },
  sky: {
    bg: '#87ceeb',
    wallCls: 'bg-white/90', wallExtra: 'rounded-xl', floorCls: 'bg-sky-300/20',
    playerCls: 'bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.7)]',
    exitCls: 'bg-yellow-300/50', exitFlash: 'bg-yellow-300/80', nextCls: 'bg-cyan-200/40',
    monsters: ['🦅', '⚡', '🦆'], wallContent: null,
  },
}

// ── Maze data ──────────────────────────────────────────────────────────────────

const MAZES: Record<MazeKey, MazeConfig> = {
  pyramid: {
    title: 'Inner Sanctum',
    subtitle: 'Navigate the sacred burial chambers of Djoser',
    theme: 'dungeon',
    monsterCount: 2,
    grid: [
      '#.###############',
      '.S..#...#.......#',
      '#.#.#.#.#.#.#####',
      '#...#.#...#.....#',
      '#...###########.#',
      '#...............#',
      '#########.#.#####',
      '#...#.....#.....#',
      '#.#.#.#####.###.#',
      '#.#...#.....#...#',
      '#.#.#.#.#####.#.#',
      '#.....#.#.....#.#',
      '#####.#.#.#####.#',
      '#.........#....E.',
      '#################',
    ],
  },
  'long-march': {
    title: 'Mountain Pass',
    subtitle: 'Cross the treacherous mountain paths of the Long March',
    theme: 'forest',
    monsterCount: 3,
    grid: [
      '###############',
      '.S........#...#',
      '#.#.#####.#.#.#',
      '#.#.....#...#.#',
      '#...###.#.#####',
      '#.#.#.#.#.#...#',
      '#...#.#.#.#.#.#',
      '#.#.#.#.#.#.#.#',
      '#...#.#.###.#.#',
      '#.#...#.....#.#',
      '#.###########.#',
      '#.#.........#.#',
      '#.#.#######.#.#',
      '#.#...#.......#',
      '#.###...#.###.#',
      '#.....#.#....E.',
      '###############',
    ],
  },
  knight: {
    title: 'Castle Labyrinth',
    subtitle: "Navigate Camelot's corridors by the chivalric code",
    theme: 'dungeon',
    monsterCount: 2,
    grid: [
      '#.###############',
      '.S........#.....#',
      '#.###.#.###...###',
      '#...#.#.....#...#',
      '#.#.#.#########.#',
      '#.#.#...........#',
      '#.#.#####.#####.#',
      '#...#...#.....#.#',
      '#.#.#.#.###...###',
      '#.#...#.....#...#',
      '#.#########.###.#',
      '#.........#.#...#',
      '#.#########.#.#.#',
      '#.........#...#.#',
      '#.#######.#####.#',
      '#.......#......E#',
      '###############.#',
    ],
  },
  mulan: {
    title: 'Forest Trail',
    subtitle: "Find Mulan's hidden path through enemy lines",
    theme: 'forest',
    monsterCount: 3,
    grid: [
      '#.#############',
      '.S............#',
      '#.#.###.###.#.#',
      '#.#...#.....#.#',
      '#.#.#.#.#####.#',
      '#...#.#.#.....#',
      '#.#.#.###.###.#',
      '#.#.#.........#',
      '#.#########.###',
      '#.#.......#...#',
      '#.#.#####.#.#.#',
      '#.#.#...#.....#',
      '#.#.#.#.#####.#',
      '#.....#......E#',
      '###############',
    ],
  },
  gilgamesh: {
    title: 'City of Uruk',
    subtitle: 'Navigate the labyrinthine streets of ancient Uruk to find the Cedar Forest gate',
    theme: 'dungeon',
    monsterCount: 2,
    grid: [
      '#.###########',
      '.S.......#..#',
      '#.#.#####.#.#',
      '#.#.#.....#.#',
      '#...#.###.#.#',
      '#####.#.#...#',
      '#.....#.###.#',
      '#.#####.....#',
      '#.#.....#.###',
      '#.#.###.#...#',
      '#...#.#.###.#',
      '#.###.#....E.',
      '#############',
    ],
  },
  musashi: {
    title: 'Mountain Proving Ground',
    subtitle: "Navigate Musashi's mountain training ground to reach the summit duel",
    theme: 'forest',
    monsterCount: 2,
    grid: [
      '#############',
      '.S.#.......##',
      '#.##.#####.##',
      '#....#...#.##',
      '###.##.#.####',
      '#...#..#....#',
      '#.####.###.##',
      '#......#..E.#',
      '#############',
    ],
  },
  'pyramid-deep': {
    title: 'Three Sacred Chambers',
    subtitle: 'Navigate three levels deep into the pyramid to reach the burial room',
    theme: 'dungeon',
    monsterCount: 3,
    levels: [
      {
        title: 'Chamber I — Outer Hall',
        grid: [
          '#.###############',
          '#S............#.#',
          '#.#.#########.#.#',
          '#...#.....#...#.#',
          '#####.###.#.###.#',
          '#.....#.#.#.....#',
          '#...#.#.#.####..#',
          '#...#.#...#.#...#',
          '#####.#.###.#.###',
          '#.....#.....#...#',
          '#..######.#####.#',
          '#...#.........#.#',
          '#.#.#.#####N###.#',
          '#.#............N.',
          '#################',
        ],
      },
      {
        title: 'Chamber II — Inner Passage',
        grid: [
          '#.###############',
          '#S....#.........#',
          '#####.#.###.#.###',
          '#.#...#.........#',
          '#.#.###.#######.#',
          '#.....#.#.......#',
          '#.###...#.###.#.#',
          '#...#.#...#.....#',
          '#.#.#.#######.#.#',
          '#.#.#.......#.#.#',
          '###.#######.###.#',
          '#.........#..N..#',
          '#.#############.#',
          '#..............N.',
          '#################',
        ],
      },
      {
        title: 'Chamber III — Burial Room',
        grid: [
          '#.###############',
          '.S........#...#.#',
          '#####.#.#.#.#.#.#',
          '#.......#.#.#...#',
          '#.##.##...#.###.#',
          '#.......#...#...#',
          '#.###.#######.###',
          '#...#.#.....#.#.#',
          '###.#.#.#.###.#.#',
          '#...#.#.#...#.#.#',
          '#.###.#.###.#.#.#',
          '#...#.#...#...#.#',
          '#.#.#.###.#####.#',
          '#.#............E#',
          '###############.#',
        ],
      },
    ],
  },

  // ── New outdoor mazes ─────────────────────────────────────────────────────

  'cedar-forest': {
    title: 'Cedar Forest',
    subtitle: 'Guide Gilgamesh through the sacred Cedar Forest to confront Humbaba',
    theme: 'forest',
    monsterCount: 4,
    grid: [
      '#.#############',
      '#S..#.........#',
      '###.#####.#####',
      '#.#.....#.....#',
      '#.#####.#.###.#',
      '#.#...#.#...#.#',
      '#.#.#.#.###.#.#',
      '#.#.#...#...#.#',
      '#.#.#########.#',
      '#.#...#.......#',
      '#.###.###.###.#',
      '#...#...#.#...#',
      '#.#.###.#.#####',
      '#.#...#.#.....#',
      '#.#.#.#.#####.#',
      '#.#.#.#...#...#',
      '###.#.###.#.#.#',
      '#...#...#.#.#.#',
      '#.#######.#.#.#',
      '#...........#E#',
      '#############.#',
    ],
  },
  'pacific-strait': {
    title: 'The Pacific Straits',
    subtitle: "Navigate the treacherous fog-shrouded straits of Magellan's passage",
    theme: 'sky',
    monsterCount: 3,
    grid: [
      '#.#############',
      '#S..#.........#',
      '###.#.###.###.#',
      '#.#.#.#.#.#...#',
      '#.#.#.#.#.#.###',
      '#.#.#...#.#...#',
      '#.#.#####.###.#',
      '#...#...#.#.#.#',
      '#.###.#.#.#.#.#',
      '#.....#...#.#.#',
      '###########.#.#',
      '#...........#.#',
      '#.#######.#.#.#',
      '#.#.#.....#.#.#',
      '#.#.#.#####.#.#',
      '#...#.#.....#.#',
      '###.#.#######.#',
      '#...#........E#',
      '#############.#',
    ],
  },
  'atlantic-sky': {
    title: 'Atlantic Crossing',
    subtitle: "Chart Earhart's course through storm corridors over the Atlantic",
    theme: 'sky',
    monsterCount: 4,
    grid: [
      '#.#################',
      '#S#.........#...#.#',
      '#.#.#.#####.#.#.#.#',
      '#.#.#...#.#...#.#.#',
      '#.#.###.#.#####.#.#',
      '#.#.#...#.....#.#.#',
      '#.###.#######.#.#.#',
      '#.....#.......#.#.#',
      '#######.#######.#.#',
      '#.#.....#.......#.#',
      '#.#.#.#.#.#######.#',
      '#...#.#.#.#.......#',
      '#.###.###.###.###.#',
      '#.#.#...#...#.#...#',
      '#.#.###.###.#.#.###',
      '#.....#.......#..E#',
      '#################.#',
    ],
  },
  'everest-peak': {
    title: 'Summit Push',
    subtitle: 'Find the route Hillary and Tenzing blazed through the Khumbu Icefall',
    theme: 'sky',
    monsterCount: 3,
    grid: [
      '#.###########',
      '#S#.....#...#',
      '#.#.#.#.###.#',
      '#.#.#.#.....#',
      '#.###.#####.#',
      '#...#.....#.#',
      '###.#####.###',
      '#...#...#...#',
      '#.###.#.###.#',
      '#.#...#.....#',
      '#.#.#######.#',
      '#...#.#...#.#',
      '#####.#.#.#.#',
      '#.......#...#',
      '#.###########',
      '#.#.....#...#',
      '#.#.###.#.###',
      '#.#.#.#.#...#',
      '#.#.#.#.###.#',
      '#...#.#...#.#',
      '#####.###.#.#',
      '#..........E#',
      '###########.#',
    ],
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface Pos { row: number; col: number }
interface Monster { row: number; col: number; emoji: string; id: number }

function findStart(grid: string[]): Pos {
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c] === 'S') return { row: r, col: c }
  return { row: 1, col: 1 }
}

function pathCells(grid: string[]): Pos[] {
  const cells: Pos[] = []
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c] !== '#') cells.push({ row: r, col: c })
  return cells
}

function spawnMonsters(grid: string[], count: number, emojis: readonly string[], playerPos: Pos): Monster[] {
  const cells = pathCells(grid).filter(
    p => !(p.row === playerPos.row && p.col === playerPos.col) &&
         grid[p.row][p.col] !== 'E' && grid[p.row][p.col] !== 'N'
  )
  const shuffled = [...cells].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((p, i) => ({
    row: p.row, col: p.col, id: i,
    emoji: emojis[i % emojis.length],
  }))
}

// ── Component ──────────────────────────────────────────────────────────────────

interface MazeGameProps { configId: string; onWin: () => void }

export default function MazeGame({ configId, onWin }: MazeGameProps) {
  const config = MAZES[configId as MazeKey] ?? MAZES['pyramid']
  const isMultiLevel = !!(config.levels?.length)
  const totalLevels = isMultiLevel ? config.levels!.length : 1
  const th = THEME[config.theme]

  const [currentLevel, setCurrentLevel] = useState(0)
  const [grid, setGrid] = useState<string[]>(() =>
    isMultiLevel ? config.levels![0].grid : config.grid!
  )
  const [pos, setPos] = useState<Pos>(() =>
    findStart(isMultiLevel ? config.levels![0].grid : config.grid!)
  )
  const [monsters, setMonsters] = useState<Monster[]>([])
  const [steps, setSteps] = useState(0)
  const [won, setWon] = useState(false)
  const [winFlash, setWinFlash] = useState(false)
  const [levelFlash, setLevelFlash] = useState(false)
  const [pendingNextLevel, setPendingNextLevel] = useState(false)
  const monsterRef = useRef<Monster[]>([])
  const gridRef = useRef<string[]>([])
  const posRef = useRef<Pos>({ row: 0, col: 0 })

  // Spawn monsters when grid changes
  useEffect(() => {
    const startPos = findStart(grid)
    const m = spawnMonsters(grid, config.monsterCount ?? 2, th.monsters, startPos)
    setMonsters(m)
    monsterRef.current = m
    gridRef.current = grid
  }, [grid, config.monsterCount, config.theme])

  useEffect(() => { posRef.current = pos }, [pos])

  // Monster wandering AI
  useEffect(() => {
    if (won) return
    const DIRS = [[-1,0],[1,0],[0,-1],[0,1]] as const
    const interval = setInterval(() => {
      setMonsters(prev => {
        const g = gridRef.current
        const p = posRef.current
        return prev.map(m => {
          const options = DIRS
            .map(([dr, dc]) => ({ row: m.row + dr, col: m.col + dc }))
            .filter(({ row, col }) =>
              row >= 0 && col >= 0 && row < g.length && col < g[0].length &&
              g[row][col] !== '#' && g[row][col] !== 'N' &&
              !(row === p.row && col === p.col)
            )
          if (options.length === 0) return m
          // Bias: 70% chance to move, 30% to stay
          if (Math.random() < 0.3) return m
          return { ...m, ...options[Math.floor(Math.random() * options.length)] }
        })
      })
    }, 1400)
    return () => clearInterval(interval)
  }, [won])

  // Level advance
  useEffect(() => {
    if (!pendingNextLevel) return
    setPendingNextLevel(false)
    setCurrentLevel(prev => {
      const next = prev + 1
      const nextGrid = config.levels![next].grid
      setGrid(nextGrid)
      setPos(findStart(nextGrid))
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
      const g = gridRef.current
      if (nr < 0 || nr >= g.length || nc < 0 || nc >= g[0].length) return prev
      const cell = g[nr][nc]
      if (cell === '#') return prev
      setSteps(s => s + 1)
      if (cell === 'E') {
        setWon(true)
        setWinFlash(true)
        setTimeout(() => onWin(), 900)
      } else if (cell === 'N') {
        setTimeout(() => setPendingNextLevel(true), 300)
      }
      // Push monster away if player lands on it
      setMonsters(prev => prev.map(m => {
        if (m.row !== nr || m.col !== nc) return m
        const dirs = [[-1,0],[1,0],[0,-1],[0,1]] as const
        const escape = dirs
          .map(([dr2, dc2]) => ({ row: m.row + dr2, col: m.col + dc2 }))
          .filter(({ row, col }) =>
            row >= 0 && col >= 0 && row < g.length && col < g[0].length &&
            g[row][col] !== '#' && !(row === nr && col === nc)
          )
        if (escape.length === 0) return m
        return { ...m, ...escape[Math.floor(Math.random() * escape.length)] }
      }))
      return { row: nr, col: nc }
    })
  }, [won, onWin])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); move(-1, 0); break
        case 'ArrowDown':  e.preventDefault(); move(1,  0); break
        case 'ArrowLeft':  e.preventDefault(); move(0, -1); break
        case 'ArrowRight': e.preventDefault(); move(0,  1); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [move])

  const COLS = grid[0]?.length ?? 15
  const CELL = Math.min(28, Math.max(18, Math.floor(330 / COLS)))

  const levelTitle = isMultiLevel
    ? config.levels![currentLevel].title ?? `Level ${currentLevel + 1}`
    : config.title

  const isDungeon = config.theme === 'dungeon'
  const isSky = config.theme === 'sky'

  return (
    <div className={`flex flex-col items-center gap-3 ${isSky ? 'text-slate-800' : 'text-white'}`}>

      {/* Header */}
      <div className="text-center">
        <p className={`font-bold text-sm tracking-wide ${isSky ? 'text-blue-800' : 'text-amber-400'}`}>{levelTitle}</p>
        <p className={`text-xs ${isSky ? 'text-blue-700/70' : 'text-slate-400'}`}>{config.subtitle}</p>
      </div>

      <div className="flex items-center gap-4 text-xs">
        {isMultiLevel && (
          <span className={`font-bold transition-all duration-300 ${levelFlash ? 'text-blue-300 scale-110' : 'text-blue-400/80'}`}>
            Level {currentLevel + 1}/{totalLevels}
          </span>
        )}
        <span className={isSky ? 'text-blue-700/60' : 'text-slate-500'}>
          Steps: <span className={`font-bold ${isSky ? 'text-blue-900' : 'text-amber-300'}`}>{steps}</span>
        </span>
      </div>

      {/* Maze grid */}
      <div className="relative">
        <div
          className="relative rounded-xl overflow-hidden border border-slate-500/30"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
            gridTemplateRows: `repeat(${grid.length}, ${CELL}px)`,
            background: th.bg,
          }}
        >
          {grid.map((row, r) =>
            row.split('').map((cell, c) => {
              const isPlayer = pos.row === r && pos.col === c
              const isExit = cell === 'E'
              const isNext = cell === 'N'
              const isWall = cell === '#'
              const monster = monsters.find(m => m.row === r && m.col === c)

              let cellBg = th.floorCls
              if (isWall)      cellBg = `${th.wallCls} ${th.wallExtra}`
              else if (isExit) cellBg = winFlash ? th.exitFlash : th.exitCls
              else if (isNext) cellBg = th.nextCls

              return (
                <div
                  key={`${r}-${c}`}
                  style={{ width: CELL, height: CELL }}
                  className={`relative flex items-center justify-center ${cellBg} transition-colors duration-150`}
                >
                  {/* Dungeon wall texture */}
                  {isWall && isDungeon && (
                    <div className="absolute inset-0 bg-slate-700/10 border border-slate-700/20 rounded-sm" />
                  )}

                  {/* Forest wall — tree icon */}
                  {isWall && config.theme === 'forest' && (
                    <span style={{ fontSize: Math.max(10, CELL - 10) }} className="select-none leading-none opacity-90">🌲</span>
                  )}

                  {/* Exit marker */}
                  {isExit && !isPlayer && (
                    <div className={`flex items-center justify-center w-full h-full transition-all duration-300 ${winFlash ? 'scale-125' : 'scale-100'}`}>
                      <span style={{ fontSize: CELL - 8 }} className="select-none leading-none">
                        {config.theme === 'sky' ? '☀️' : '🎯'}
                      </span>
                    </div>
                  )}

                  {/* Next-level indicator */}
                  {isNext && !isPlayer && (
                    <div className="flex items-center justify-center w-full h-full">
                      <div style={{ width: CELL - 8, height: CELL - 8 }}
                        className="rounded-full border-2 border-blue-400 flex items-center justify-center bg-blue-900/50 shadow-[0_0_6px_rgba(96,165,250,0.5)]">
                        <span className="text-[8px] text-blue-300 font-bold">▲</span>
                      </div>
                    </div>
                  )}

                  {/* Monster */}
                  {!isPlayer && monster && (
                    <span
                      style={{ fontSize: Math.max(10, CELL - 12) }}
                      className="select-none leading-none z-10 animate-pulse"
                    >
                      {monster.emoji}
                    </span>
                  )}

                  {/* Player */}
                  {isPlayer && (
                    <div
                      style={{ width: CELL - 8, height: CELL - 8 }}
                      className={`rounded-full flex items-center justify-center z-20 transition-all duration-100 ${th.playerCls}
                        ${winFlash ? 'scale-125' : levelFlash ? 'bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.8)]' : ''}`}
                    >
                      {isExit && <span style={{ fontSize: 10 }}>🎯</span>}
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
              <p className="text-blue-300 font-bold text-sm">Level {currentLevel + 1}/{totalLevels}</p>
              <p className="text-slate-400 text-[10px]">{config.levels?.[currentLevel].title}</p>
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {isMultiLevel && (
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full border border-blue-400 bg-blue-900/40 inline-flex items-center justify-center text-[7px] text-blue-300">▲</span>
            Next level
          </span>
          <span className="flex items-center gap-1">
            <span className="text-[11px]">{config.theme === 'sky' ? '☀️' : '🎯'}</span>
            Exit
          </span>
        </div>
      )}

      {/* Monster legend */}
      <div className={`flex items-center gap-1 text-[10px] ${isSky ? 'text-blue-800/60' : 'text-slate-500'}`}>
        <span>Watch out for</span>
        {th.monsters.map((m, i) => <span key={i} className="text-xs">{m}</span>)}
        <span>roaming the wilderness</span>
      </div>

      {/* D-pad */}
      <div className="flex flex-col items-center gap-1">
        {(['up', 'mid', 'down'] as const).map(row => (
          <div key={row} className="flex gap-1">
            {row === 'mid' ? (
              <>
                <DPadBtn label="←" onClick={() => move(0, -1)} sky={isSky} />
                <div className={`w-10 h-10 rounded-lg border flex items-center justify-center
                  ${isSky ? 'bg-blue-100/40 border-blue-300/30' : 'bg-slate-800/40 border-slate-700/30'}`}>
                  <div className={`w-2 h-2 rounded-full ${isSky ? 'bg-blue-600/50' : 'bg-amber-400/50'}`} />
                </div>
                <DPadBtn label="→" onClick={() => move(0, 1)} sky={isSky} />
              </>
            ) : row === 'up' ? (
              <DPadBtn label="↑" onClick={() => move(-1, 0)} sky={isSky} />
            ) : (
              <DPadBtn label="↓" onClick={() => move(1, 0)} sky={isSky} />
            )}
          </div>
        ))}
      </div>

      {won && (
        <div className={`font-bold text-sm animate-pulse ${isSky ? 'text-blue-800' : 'text-emerald-400'}`}>
          Exit reached in {steps} steps!
        </div>
      )}
    </div>
  )
}

function DPadBtn({ label, onClick, sky }: { label: string; onClick: () => void; sky: boolean }) {
  return (
    <button
      onPointerDown={onClick}
      className={`w-10 h-10 rounded-lg border flex items-center justify-center text-lg font-bold
        transition-all duration-100 select-none touch-none
        ${sky
          ? 'bg-blue-100/60 border-blue-300/50 text-blue-900 hover:bg-blue-200/60 active:bg-blue-400/30'
          : 'bg-slate-700/60 border-slate-600/50 text-slate-300 hover:bg-slate-600/60 active:bg-amber-500/30 active:border-amber-500/50'
        }`}
    >
      {label}
    </button>
  )
}
