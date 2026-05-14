import { useState, useCallback } from 'react'

interface TileType { label: string; bg: string; border: string; text?: string }

interface MatchRules {
  minMatch?: number               // minimum consecutive tiles (default 3)
  axis?: 'both' | 'row' | 'col'  // which directions produce matches (default 'both')
  diagonal?: boolean              // also match diagonally (default false)
}

interface MatchThreeConfig {
  title: string
  tiles: TileType[]
  gridSize: number
  target: number
  fact: string
  rules?: MatchRules
  ruleDesc: string
}

const CONFIGS: Record<string, MatchThreeConfig> = {
  // ── Existing (easy-medium) ──────────────────────────────────────────────────
  'lisbon-spices': {
    title: "Spice Market, Lisbon 1502",
    tiles: [
      { label: 'C', bg: 'bg-amber-600',  border: 'border-amber-400' },
      { label: 'P', bg: 'bg-red-700',    border: 'border-red-500' },
      { label: 'S', bg: 'bg-yellow-500', border: 'border-yellow-300' },
      { label: 'G', bg: 'bg-orange-700', border: 'border-orange-500' },
    ],
    gridSize: 5, target: 15,
    ruleDesc: "Swap adjacent · match 3+",
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
    ruleDesc: "Swap adjacent · match 3+",
    fact: "Tang Dynasty Chang'an (modern Xi'an) was the eastern terminus of the Silk Road and the world's largest city, with one million inhabitants. The Western Market alone had 3,000 registered shops trading silk, porcelain, and spices from as far as Persia and Byzantium.",
  },

  // ── Hard challenges ─────────────────────────────────────────────────────────

  // Rule: match-4 minimum · 6 tile types · 7×7
  'cairo-alchemy': {
    title: "House of Wisdom, Baghdad 830 CE",
    tiles: [
      { label: '☿', bg: 'bg-slate-600',   border: 'border-slate-400',  text: 'text-slate-100' },
      { label: '♀', bg: 'bg-teal-700',    border: 'border-teal-400',   text: 'text-teal-100'  },
      { label: '♂', bg: 'bg-red-800',     border: 'border-red-500',    text: 'text-red-100'   },
      { label: '♃', bg: 'bg-amber-700',   border: 'border-amber-400',  text: 'text-amber-100' },
      { label: '♄', bg: 'bg-indigo-800',  border: 'border-indigo-500', text: 'text-indigo-100'},
      { label: '♅', bg: 'bg-cyan-800',    border: 'border-cyan-500',   text: 'text-cyan-100'  },
    ],
    gridSize: 7, target: 44,
    rules: { minMatch: 4 },
    ruleDesc: "Match 4 or more only · 6 elements · 7×7",
    fact: "The House of Wisdom in Abbasid Baghdad synthesised Greek, Indian, and Persian knowledge. Al-Kindi, al-Farabi and al-Razi worked there — translating Aristotle, developing algebra, and mapping the stars with planetary symbols inherited from Hellenistic alchemy.",
  },

  // Rule: diagonal matches also score · 5 tile types · 7×7
  'venice-glass': {
    title: "Murano Glassworks, Venice 1291",
    tiles: [
      { label: '△', bg: 'bg-cyan-700',   border: 'border-cyan-400',   text: 'text-cyan-100'   },
      { label: '▽', bg: 'bg-blue-700',   border: 'border-blue-400',   text: 'text-blue-100'   },
      { label: '◇', bg: 'bg-violet-700', border: 'border-violet-400', text: 'text-violet-100' },
      { label: '□', bg: 'bg-rose-800',   border: 'border-rose-500',   text: 'text-rose-100'   },
      { label: '○', bg: 'bg-amber-700',  border: 'border-amber-400',  text: 'text-amber-100'  },
    ],
    gridSize: 7, target: 40,
    rules: { diagonal: true },
    ruleDesc: "Match 3+ in any direction including diagonals · 7×7",
    fact: "Venice ordered all glassmakers to the island of Murano in 1291 — ostensibly to prevent fires, really to contain the secrets of cristallo glass. Murano craftsmen held rare freedom: they could marry nobility and carry swords, but leaving the island was punishable by death.",
  },

  // Rule: column matches only · 5 tile types · 8×8
  'babylon-tablets': {
    title: "Babylonian Grain Market, 600 BCE",
    tiles: [
      { label: '⊕', bg: 'bg-amber-700',  border: 'border-amber-500',  text: 'text-amber-100'  },
      { label: '⊗', bg: 'bg-red-800',    border: 'border-red-500',    text: 'text-red-100'    },
      { label: '⊘', bg: 'bg-teal-700',   border: 'border-teal-400',   text: 'text-teal-100'   },
      { label: '⊙', bg: 'bg-purple-800', border: 'border-purple-500', text: 'text-purple-100' },
      { label: '⊚', bg: 'bg-orange-700', border: 'border-orange-400', text: 'text-orange-100' },
    ],
    gridSize: 8, target: 52,
    rules: { axis: 'col' },
    ruleDesc: "Vertical matches only · 5 symbols · 8×8",
    fact: "Babylonian clay tablets recorded grain prices, interest rates and commodity contracts with astonishing precision — the world's first commodity futures market. Cuneiform records from 600 BCE show silver-denominated wheat prices responding to floods and harvests across Mesopotamia.",
  },

  // Rule: row matches only · 5 tile types · 7×7
  'aztec-market': {
    title: "Tlatelolco Market, Aztec Empire 1500",
    tiles: [
      { label: '✦', bg: 'bg-green-700',  border: 'border-green-400',  text: 'text-green-100'  },
      { label: '✧', bg: 'bg-orange-700', border: 'border-orange-400', text: 'text-orange-100' },
      { label: '★', bg: 'bg-yellow-600', border: 'border-yellow-300', text: 'text-yellow-100' },
      { label: '✶', bg: 'bg-red-800',    border: 'border-red-500',    text: 'text-red-100'    },
      { label: '✸', bg: 'bg-indigo-700', border: 'border-indigo-400', text: 'text-indigo-100' },
    ],
    gridSize: 7, target: 46,
    rules: { axis: 'row' },
    ruleDesc: "Horizontal matches only · 5 glyphs · 7×7",
    fact: "Hernán Cortés wrote to Charles V that Tlatelolco was larger than any market in Spain. It drew 60,000 traders daily — cacao, jade, feathers, obsidian blades, and human beings. Dedicated judges walked the aisles enforcing weights and punishing fraud on the spot.",
  },

  // Rule: standard, but 6 tile types makes cascades rare — brutal
  'hanseatic-runes': {
    title: "Hanseatic League, Lübeck 1358",
    tiles: [
      { label: 'ᚠ', bg: 'bg-stone-700',  border: 'border-stone-500',  text: 'text-stone-100'  },
      { label: 'ᚢ', bg: 'bg-zinc-700',   border: 'border-zinc-400',   text: 'text-zinc-100'   },
      { label: 'ᚦ', bg: 'bg-slate-600',  border: 'border-slate-400',  text: 'text-slate-200'  },
      { label: 'ᚨ', bg: 'bg-neutral-700',border: 'border-neutral-500',text: 'text-neutral-100'},
      { label: 'ᚱ', bg: 'bg-gray-700',   border: 'border-gray-500',   text: 'text-gray-100'   },
      { label: 'ᚲ', bg: 'bg-stone-800',  border: 'border-stone-500',  text: 'text-stone-200'  },
    ],
    gridSize: 7, target: 56,
    ruleDesc: "Swap adjacent · match 3+ · 6 runes · 7×7",
    fact: "The Hanseatic League at its peak united over 200 Northern European cities in a merchant alliance that bypassed feudal lords entirely. Its *Kontors* in London, Bergen, Bruges and Novgorod operated as sovereign trading colonies, complete with their own courts, weights, and private armies.",
  },

  // Rule: match-4+ AND diagonal · hardest
  'mughal-gems': {
    title: "Agra Gem Market, Mughal Empire 1600",
    tiles: [
      { label: '♦', bg: 'bg-rose-700',    border: 'border-rose-400',    text: 'text-rose-100'    },
      { label: '◆', bg: 'bg-violet-700',  border: 'border-violet-400',  text: 'text-violet-100'  },
      { label: '⬧', bg: 'bg-amber-700',   border: 'border-amber-400',   text: 'text-amber-100'   },
      { label: '◉', bg: 'bg-cyan-700',    border: 'border-cyan-400',    text: 'text-cyan-100'    },
      { label: '⬡', bg: 'bg-emerald-700', border: 'border-emerald-400', text: 'text-emerald-100' },
    ],
    gridSize: 7, target: 36,
    rules: { minMatch: 4, diagonal: true },
    ruleDesc: "Match 4+ only · diagonals count · 5 gems · 7×7",
    fact: "Akbar's Mughal Empire controlled the world's richest gem pipeline: rubies from Burma, emeralds from Colombia via Portuguese Goa, sapphires from Ceylon, and diamonds from Golconda — the mine that produced the Koh-i-Noor. European merchants called Agra's Jauhari Bazaar the most magnificent market on Earth.",
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}

function makeGrid(size: number, numTypes: number, seed: number): number[][] {
  const rand = seededRandom(seed)
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => Math.floor(rand() * numTypes))
  )
}

function findMatches(
  grid: number[][], size: number,
  { minMatch = 3, axis = 'both', diagonal = false }: MatchRules = {}
): Set<string> {
  const matched = new Set<string>()

  // Horizontal
  if (axis !== 'col') {
    for (let r = 0; r < size; r++) {
      let c = 0
      while (c < size) {
        if (grid[r][c] === -1) { c++; continue }
        let end = c
        while (end + 1 < size && grid[r][end + 1] === grid[r][c]) end++
        if (end - c + 1 >= minMatch) {
          for (let i = c; i <= end; i++) matched.add(`${r},${i}`)
        }
        c = end + 1
      }
    }
  }

  // Vertical
  if (axis !== 'row') {
    for (let c = 0; c < size; c++) {
      let r = 0
      while (r < size) {
        if (grid[r][c] === -1) { r++; continue }
        let end = r
        while (end + 1 < size && grid[end + 1][c] === grid[r][c]) end++
        if (end - r + 1 >= minMatch) {
          for (let i = r; i <= end; i++) matched.add(`${i},${c}`)
        }
        r = end + 1
      }
    }
  }

  // Diagonal top-left → bottom-right
  if (diagonal) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === -1) continue
        let len = 1
        while (r + len < size && c + len < size && grid[r + len][c + len] === grid[r][c]) len++
        if (len >= minMatch) {
          for (let i = 0; i < len; i++) matched.add(`${r + i},${c + i}`)
        }
      }
    }
    // Diagonal top-right → bottom-left
    for (let r = 0; r < size; r++) {
      for (let c = size - 1; c >= 0; c--) {
        if (grid[r][c] === -1) continue
        let len = 1
        while (r + len < size && c - len >= 0 && grid[r + len][c - len] === grid[r][c]) len++
        if (len >= minMatch) {
          for (let i = 0; i < len; i++) matched.add(`${r + i},${c - i}`)
        }
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function MatchThreeGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['lisbon-spices']
  const { gridSize: N, tiles, rules = {} } = config

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
    const matched = findMatches(g, N, rules)
    if (matched.size === 0) return { next: g, count: 0 }
    const copy = g.map(r => [...r])
    matched.forEach(k => { const [r, c] = k.split(',').map(Number); copy[r][c] = -1 })
    const next = applyGravity(copy, N, tiles.length, rand)
    return { next, count: matched.size }
  }, [N, tiles.length, rules, rand])

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
          if (newTotal >= config.target && !won) { setWon(true); setTimeout(onWin, 600) }
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

    const next = grid.map(row => [...row])
    ;[next[sr][sc], next[r][c]] = [next[r][c], next[sr][sc]]
    setSelected(null)

    const { next: afterMatch, count } = processMatches(next)
    if (count === 0) return // invalid swap — do nothing

    setGrid(afterMatch)
    setCleared(prev => {
      const newTotal = prev + count
      if (newTotal >= config.target && !won) { setWon(true); setTimeout(onWin, 600) }
      return newTotal
    })
    cascade(afterMatch, cleared + count)
  }

  const progress = Math.min(cleared / config.target, 1)

  // Tile size adapts to grid
  const cellSize = N >= 8 ? 'w-8 h-8 text-base' : N >= 7 ? 'w-9 h-9 text-base' : 'w-10 h-10 text-sm'

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
        <p className="text-slate-500 text-[10px]">{cleared} / {config.target}</p>
      </div>

      {/* Progress */}
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${progress * 100}%` }} />
      </div>

      {/* Legend */}
      <div className="flex gap-2 flex-wrap items-center">
        {tiles.map((t, i) => (
          <span key={i} className={`text-xs font-bold px-2 py-0.5 rounded ${t.bg} ${t.text ?? 'text-white'} opacity-80`}>
            {t.label}
          </span>
        ))}
        <span className="text-[10px] text-slate-600 ml-1">— {config.ruleDesc}</span>
      </div>

      {/* Grid */}
      <div className="flex justify-center">
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}>
          {grid.map((row, r) =>
            row.map((type, c) => {
              const tile = tiles[type]
              const isSel = selected?.[0] === r && selected?.[1] === c
              return (
                <button
                  key={`${r},${c}`}
                  onClick={() => handleCell(r, c)}
                  className={`${cellSize} rounded-lg font-bold text-white transition-all border-2
                    ${tile.bg} ${tile.border} ${tile.text ?? ''}
                    ${isSel ? 'scale-110 brightness-125 shadow-lg shadow-white/20' : 'opacity-80 hover:opacity-100 hover:scale-105'}
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
          ? <span className="text-emerald-400 font-bold">✓ Challenge complete!</span>
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
