import { useState, useEffect, useCallback } from 'react'

// Grid legend: '#'=wall '.'=ice 'S'=start 'E'=exit 'B'=blocker stone
interface Config {
  title: string
  question: string
  grid: string[]
  fact: string
}

const CONFIGS: Record<string, Config> = {
  'enkidu-ice': {
    title: 'Cedar Forest Path',
    question: 'Enkidu slides through the frozen cedar forest. Reach the exit.',
    grid: [
      '#########',
      '#S......#',
      '#.#.###.#',
      '#...B...#',
      '#.###.#.#',
      '#.....B.#',
      '#.#.#...#',
      '#......E#',
      '#########',
    ],
    fact: "Enkidu, raised by animals in the wild, became Gilgamesh's equal and closest companion — together they journeyed to the Cedar Forest to slay the monster Humbaba.",
  },
  'pyramid-ice': {
    title: 'Pyramid Corridors',
    question: 'Slide through the icy pyramid passages to find the exit.',
    grid: [
      '########',
      '#S.B...#',
      '#.#....#',
      '#...##.#',
      '#B.....#',
      '#..#.B.#',
      '#....#.#',
      '#.....E#',
      '########',
    ],
    fact: "The internal passages of the Great Pyramid were designed with deliberate complexity — angled shafts, false doors, and sealed chambers to protect the pharaoh's journey to the afterlife.",
  },
  'meiji-ice': {
    title: 'Meiji Labyrinth',
    question: 'Navigate the reformer\'s path through the maze of old and new Japan.',
    grid: [
      '##########',
      '#S.......#',
      '#.##.###.#',
      '#.B......#',
      '##.#.##.##',
      '#..B...B.#',
      '#.###.##.#',
      '#........#',
      '#.##.###.#',
      '#.......E#',
      '##########',
    ],
    fact: "Itō Hirobumi navigated impossible contradictions — preserving imperial tradition while importing Western law, industry, and constitutional government in the span of a single generation.",
  },
  'mulan-ice': {
    title: 'Battle on the Ice',
    question: 'Hua Mulan charges across the frozen battlefield. Reach the far end.',
    grid: [
      '#######',
      '#S....#',
      '#.##B.#',
      '#.....#',
      '#B.##.#',
      '#..B..#',
      '#.##..#',
      '#....E#',
      '#######',
    ],
    fact: "Hua Mulan disguised herself as a man to take her elderly father's place in military conscription — serving for twelve years before her identity was discovered.",
  },
  'turing-ice': {
    title: 'Logic Grid',
    question: 'Navigate the ice logic puzzle — each path is determined by rules.',
    grid: [
      '##########',
      '#S..B....#',
      '#.#..###.#',
      '#....B...#',
      '#.##..##.#',
      '#B.......#',
      '#..###.#.#',
      '#.B....B.#',
      '#..###...#',
      '#.......E#',
      '##########',
    ],
    fact: "Turing's mathematical logic treated computation as a mechanical process of following strict rules — just as ice physics forces the slider to follow deterministic paths.",
  },
  'long-march-ice': {
    title: 'The Long March',
    question: 'Lead the forces through treacherous mountain passes.',
    grid: [
      '#########',
      '#S......#',
      '#.###.#.#',
      '#.B...B.#',
      '#.#.###.#',
      '#.......#',
      '#B.#.##.#',
      '#..B....#',
      '#.###.#.#',
      '#......E#',
      '#########',
    ],
    fact: "The Long March covered 9,000 km through mountains, swamps, and enemy territory — a strategic retreat that became the founding myth of the Chinese Communist Party.",
  },
  'knights-ice': {
    title: 'Frozen Castle',
    question: "Lancelot slides across the castle's iced-over courtyard.",
    grid: [
      '#######',
      '#S..B.#',
      '#.##..#',
      '#.....#',
      '#.B.#.#',
      '#.#...#',
      '#..B..#',
      '#....E#',
      '#######',
    ],
    fact: "Medieval knights trained extensively in winter conditions — ice and mud were constant battlefield hazards that required both horse and rider to adapt their tactics.",
  },
  'cicero-ice': {
    title: 'Senate Corridors',
    question: 'Cicero must navigate the frozen senate halls to make his speech.',
    grid: [
      '########',
      '#S.B...#',
      '#.#.##.#',
      '#..B...#',
      '#.##.#.#',
      '#......#',
      '#B.##B.#',
      '#......#',
      '#..##..#',
      '#.....E#',
      '########',
    ],
    fact: "Cicero's Catilinarian Orations required navigating the treacherous politics of the late Roman Republic — where every step in the Senate was calculated.",
  },
  'batu-ice': {
    title: 'Steppe Crossing',
    question: 'Batu Khan rides across the frozen steppe to outflank the enemy.',
    grid: [
      '########',
      '#S.....#',
      '#.#.##.#',
      '#..B...#',
      '#B.#...#',
      '#..B.#.#',
      '#.##...#',
      '#.....E#',
      '########',
    ],
    fact: "Mongol cavalry could cover 100 miles per day on the frozen steppe — their speed in winter was a strategic advantage that repeatedly caught European armies off guard.",
  },
  'taira-ice': {
    title: 'Frozen Coast',
    question: 'Taira no Tadanori slides across the icy coast before battle.',
    grid: [
      '#######',
      '#S....#',
      '#..#B.#',
      '#B....#',
      '#.##..#',
      '#..B..#',
      '#....B#',
      '#...#E#',
      '#######',
    ],
    fact: "The Battle of Dan-no-Ura was fought on the sea — the Taira clan's final stand on the waters of the Shimonoseki Strait, where the tide itself turned against them.",
  },
}

type Dir = 'up' | 'down' | 'left' | 'right'

function parseGrid(lines: string[]) {
  const grid = lines.map(l => l.split(''))
  let sr = 0, sc = 0
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[r].length; c++)
      if (grid[r][c] === 'S') { sr = r; sc = c }
  return { grid, sr, sc }
}

function slidePos(grid: string[][], r: number, c: number, dir: Dir): [number, number] {
  const dr = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
  const dc = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
  let nr = r + dr, nc = c + dc
  while (
    nr >= 0 && nr < grid.length &&
    nc >= 0 && nc < grid[0].length &&
    grid[nr][nc] !== '#' && grid[nr][nc] !== 'B'
  ) { r = nr; c = nc; nr = r + dr; nc = c + dc }
  return [r, c]
}

export default function IceSlideGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['enkidu-ice']
  const { grid, sr, sc } = parseGrid(cfg.grid)

  const [pos, setPos] = useState<[number, number]>([sr, sc])
  const [won, setWon] = useState(false)
  const [trail, setTrail] = useState<Set<string>>(new Set([`${sr},${sc}`]))

  const move = useCallback((dir: Dir) => {
    if (won) return
    setPos(([r, c]) => {
      const [nr, nc] = slidePos(grid, r, c, dir)
      if (nr === r && nc === c) return [r, c]
      setTrail(t => new Set([...t, `${nr},${nc}`]))
      if (grid[nr][nc] === 'E') { setWon(true); setTimeout(onWin, 700) }
      return [nr, nc]
    })
  }, [won, grid, onWin])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp'    || e.key === 'w') { e.preventDefault(); move('up') }
      if (e.key === 'ArrowDown'  || e.key === 's') { e.preventDefault(); move('down') }
      if (e.key === 'ArrowLeft'  || e.key === 'a') { e.preventDefault(); move('left') }
      if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); move('right') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [move])

  const [row, col] = pos
  const cols = grid[0].length
  const cellPx = Math.min(38, Math.floor(320 / cols))

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-3">
      <p className="text-cyan-400/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
      <p className="text-white text-sm font-medium leading-snug">{cfg.question}</p>

      <div className="flex justify-center">
        <div className="inline-grid border border-white/10 rounded-lg overflow-hidden"
          style={{ gridTemplateColumns: `repeat(${cols}, ${cellPx}px)` }}>
          {grid.map((rowArr, r) => rowArr.map((cell, c) => {
            const isPlayer = r === row && c === col
            const isWall = cell === '#'
            const isBlock = cell === 'B'
            const isExit = cell === 'E'
            const isTrail = trail.has(`${r},${c}`) && !isPlayer && !isWall

            let bg = 'bg-sky-950/60'
            if (isWall) bg = 'bg-slate-700'
            if (isBlock) bg = 'bg-slate-600'
            if (isExit) bg = won ? 'bg-emerald-500/50' : 'bg-emerald-900/30'
            if (isTrail) bg = 'bg-cyan-900/40'

            return (
              <div key={`${r},${c}`}
                style={{ width: cellPx, height: cellPx }}
                className={`${bg} flex items-center justify-center`}>
                {isBlock && <div className="w-2/3 h-2/3 rounded bg-slate-400/70" />}
                {isExit && <div className={`text-[9px] font-bold ${won ? 'text-emerald-300' : 'text-emerald-600'}`}>▣</div>}
                {isTrail && <div className="w-1 h-1 rounded-full bg-cyan-500/50" />}
                {isPlayer && (
                  <div className={`w-3/5 h-3/5 rounded-full shadow-[0_0_6px_rgba(251,191,36,0.9)] ${won ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                )}
              </div>
            )
          }))}
        </div>
      </div>

      {/* D-pad */}
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => move('up')} className="w-10 h-10 rounded-lg bg-white/10 active:bg-cyan-500/30 flex items-center justify-center text-white">▲</button>
        <div className="flex gap-1">
          <button onClick={() => move('left')} className="w-10 h-10 rounded-lg bg-white/10 active:bg-cyan-500/30 flex items-center justify-center text-white">◀</button>
          <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-slate-600 text-[9px]">❄</div>
          <button onClick={() => move('right')} className="w-10 h-10 rounded-lg bg-white/10 active:bg-cyan-500/30 flex items-center justify-center text-white">▶</button>
        </div>
        <button onClick={() => move('down')} className="w-10 h-10 rounded-lg bg-white/10 active:bg-cyan-500/30 flex items-center justify-center text-white">▼</button>
      </div>

      <p className="text-slate-500 text-[10px] text-center">
        {won
          ? <span className="text-emerald-400 font-bold">Exit reached!</span>
          : 'Slide — you move until hitting a wall ■ or stone ▪'}
      </p>

      {won && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs leading-relaxed">
          <span className="font-bold mr-1">✓</span>{cfg.fact}
        </div>
      )}
    </div>
  )
}
