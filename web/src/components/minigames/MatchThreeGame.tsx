import { useState, useCallback } from 'react'

interface TileType { label: string; bg: string; border: string }
interface MatchThreeConfig {
  title: string
  tiles: TileType[]
  gridSize: number
  target: number
  fact: string
}

const CONFIGS: Record<string, MatchThreeConfig> = {
  'lisbon-spices': {
    title: "Spice Market, Lisbon 1502",
    tiles: [
      { label: 'C', bg: 'bg-amber-600',  border: 'border-amber-400' },
      { label: 'P', bg: 'bg-red-700',    border: 'border-red-500' },
      { label: 'S', bg: 'bg-yellow-500', border: 'border-yellow-300' },
      { label: 'G', bg: 'bg-orange-700', border: 'border-orange-500' },
    ],
    gridSize: 5, target: 15,
    fact: "Manuel I's Portugal controlled the spice trade from 1498 to the 1580s. A cargo of cloves from Maluku could return 100× its cost in Lisbon. The monopoly funded the Manueline architecture still standing in Belém — cathedrals literally built on pepper.",
  },
  'changan-silks': {
    title: "Chang'an Silk Market",
    tiles: [
      { label: '赤', bg: 'bg-red-700',    border: 'border-red-400' },
      { label: '碧', bg: 'bg-teal-600',   border: 'border-teal-400' },
      { label: '金', bg: 'bg-yellow-600', border: 'border-yellow-400' },
      { label: '紫', bg: 'bg-purple-700', border: 'border-purple-400' },
    ],
    gridSize: 5, target: 15,
    fact: "Tang Dynasty Chang'an (modern Xi'an) was the eastern terminus of the Silk Road and the world's largest city, with one million inhabitants. The Western Market alone had 3,000 registered shops trading silk, porcelain, and spices from as far as Persia and Byzantium.",
  },
}

function seededRandom(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}

function makeGrid(size: number, numTypes: number, seed: number): number[][] {
  const rand = seededRandom(seed)
  const grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Math.floor(rand() * numTypes))
  )
  return grid
}

function findMatches(grid: number[][], size: number): Set<string> {
  const matched = new Set<string>()
  for (let r = 0; r < size; r++) {
    for (let c = 0; c <= size - 3; c++) {
      if (grid[r][c] !== -1 && grid[r][c] === grid[r][c + 1] && grid[r][c] === grid[r][c + 2]) {
        let end = c + 2
        while (end + 1 < size && grid[r][end + 1] === grid[r][c]) end++
        for (let i = c; i <= end; i++) matched.add(`${r},${i}`)
        c = end
      }
    }
  }
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - 3; r++) {
      if (grid[r][c] !== -1 && grid[r][c] === grid[r + 1][c] && grid[r][c] === grid[r + 2][c]) {
        let end = r + 2
        while (end + 1 < size && grid[end + 1][c] === grid[r][c]) end++
        for (let i = r; i <= end; i++) matched.add(`${i},${c}`)
        r = end
      }
    }
  }
  return matched
}

function applyGravity(grid: number[][], size: number, numTypes: number, rand: () => number): number[][] {
  const next = grid.map(r => [...r])
  for (let c = 0; c < size; c++) {
    const col = next.map(r => r[c]).filter(v => v !== -1)
    while (col.length < size) col.unshift(Math.floor(rand() * numTypes))
    for (let r = 0; r < size; r++) next[r][c] = col[r]
  }
  return next
}

function isAdjacent(a: [number, number], b: [number, number]) {
  return (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])) === 1
}

export default function MatchThreeGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['lisbon-spices']
  const { gridSize: N, tiles } = config

  const seed = configId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const [randState] = useState(() => ({ val: seed }))
  const rand = useCallback(() => {
    randState.val = (randState.val * 1664525 + 1013904223) & 0xffffffff
    return (randState.val >>> 0) / 0xffffffff
  }, [randState])

  const [grid, setGrid] = useState<number[][]>(() => makeGrid(N, tiles.length, seed))
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [cleared, setCleared] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [won, setWon] = useState(false)

  const processMatches = useCallback((g: number[][]): { next: number[][]; count: number } => {
    const matched = findMatches(g, N)
    if (matched.size === 0) return { next: g, count: 0 }
    const cleared = g.map(r => [...r])
    matched.forEach(k => { const [r, c] = k.split(',').map(Number); cleared[r][c] = -1 })
    const next = applyGravity(cleared, N, tiles.length, rand)
    return { next, count: matched.size }
  }, [N, tiles.length, rand])

  // Cascade after a swap
  const cascade = useCallback((g: number[][], totalCleared: number) => {
    setAnimating(true)
    let cur = g
    let total = totalCleared

    const step = () => {
      const { next, count } = processMatches(cur)
      if (count > 0) {
        cur = next
        total += count
        setGrid([...cur])
        setCleared(prev => {
          const newTotal = prev + count
          if (newTotal >= config.target && !won) {
            setWon(true)
            setTimeout(onWin, 600)
          }
          return newTotal
        })
        setTimeout(step, 350)
      } else {
        setAnimating(false)
      }
    }
    setTimeout(step, 100)
  }, [processMatches, config.target, won, onWin])

  const handleCell = (r: number, c: number) => {
    if (animating || won) return
    if (!selected) { setSelected([r, c]); return }
    const [sr, sc] = selected
    if (sr === r && sc === c) { setSelected(null); return }

    if (!isAdjacent(selected, [r, c])) { setSelected([r, c]); return }

    // Swap
    const next = grid.map(row => [...row])
    ;[next[sr][sc], next[r][c]] = [next[r][c], next[sr][sc]]
    setSelected(null)

    const { next: afterMatch, count } = processMatches(next)
    if (count === 0) {
      // Invalid swap — swap back
      ;[next[sr][sc], next[r][c]] = [next[r][c], next[sr][sc]]
      setSelected(null)
      return
    }
    setGrid(afterMatch)
    setCleared(prev => {
      const newTotal = prev + count
      if (newTotal >= config.target && !won) { setWon(true); setTimeout(onWin, 600) }
      return newTotal
    })
    cascade(afterMatch, cleared + count)
  }

  const progress = Math.min(cleared / config.target, 1)

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
        <p className="text-slate-500 text-[10px]">{cleared} / {config.target} cleared</p>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Legend */}
      <div className="flex gap-2 flex-wrap">
        {tiles.map((t, i) => (
          <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded ${t.bg} text-white opacity-70`}>
            {t.label}
          </span>
        ))}
        <span className="text-[10px] text-slate-600">— swap adjacent to match 3+</span>
      </div>

      {/* Grid */}
      <div className="flex justify-center">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}
        >
          {grid.map((row, r) =>
            row.map((type, c) => {
              const tile = tiles[type]
              const isSel = selected?.[0] === r && selected?.[1] === c
              return (
                <button
                  key={`${r},${c}`}
                  onClick={() => handleCell(r, c)}
                  className={`w-10 h-10 rounded-lg font-bold text-sm text-white transition-all border-2
                    ${tile.bg} ${tile.border}
                    ${isSel ? 'scale-110 brightness-125 shadow-lg' : 'opacity-80 hover:opacity-100 hover:scale-105'}
                    ${animating ? 'pointer-events-none' : ''}
                  `}
                >
                  {tile.label}
                </button>
              )
            })
          )}
        </div>
      </div>

      <p className="text-slate-600 text-[10px] text-center">
        {won
          ? <span className="text-emerald-400 font-bold">✓ Market cleared!</span>
          : selected
          ? 'Tap an adjacent tile to swap'
          : 'Tap a tile to select'}
      </p>

      {won && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-xs leading-relaxed">
          <span className="font-bold text-emerald-300">✓ Trade complete! </span>
          <span className="text-slate-400">{config.fact}</span>
        </div>
      )}
    </div>
  )
}
