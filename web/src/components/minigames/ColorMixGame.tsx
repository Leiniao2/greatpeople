import { useState, useMemo } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Pigment {
  id: string
  name: string
  hex: string
  rgb: [number, number, number]
  // Historical pigment detail
  source: string
}

interface ColorTarget {
  name: string
  hex: string
  rgb: [number, number, number]
  hint: string
}

interface ColorMixConfig {
  title: string
  subtitle: string
  pigments: Pigment[]
  // The target colour to match
  target: ColorTarget
  // Tolerance 0–255 per channel
  tolerance: number
  fact: string
}

// ── Color math ─────────────────────────────────────────────────────────────────

function mixRGB(pigments: Pigment[], amounts: Record<string, number>): [number, number, number] {
  let totalW = 0
  let r = 0, g = 0, b = 0
  for (const p of pigments) {
    const w = amounts[p.id] ?? 0
    if (w > 0) {
      r += p.rgb[0] * w
      g += p.rgb[1] * w
      b += p.rgb[2] * w
      totalW += w
    }
  }
  if (totalW === 0) return [220, 220, 220]
  return [Math.round(r / totalW), Math.round(g / totalW), Math.round(b / totalW)]
}

function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('')
}

function colourDist(a: [number, number, number], b: [number, number, number]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

// ── Configs ────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, ColorMixConfig> = {
  'titian-red': {
    title: "Titian's Crimson — Mix the Venetian Red",
    subtitle: 'Venice, c. 1510',
    pigments: [
      { id: 'vermilion', name: 'Vermilion',    hex: '#e34234', rgb: [227, 66,  52 ], source: 'Cinnabar ore, Spain'  },
      { id: 'lake',      name: 'Crimson Lake', hex: '#9b1d1d', rgb: [155, 29,  29 ], source: 'Kermes insect dye'    },
      { id: 'lead',      name: 'Lead White',   hex: '#e8e4d8', rgb: [232, 228, 216], source: 'Corroded lead plates' },
      { id: 'umber',     name: 'Raw Umber',    hex: '#7a5c44', rgb: [122, 92,  68 ], source: 'Umbrian earth, Italy' },
    ],
    target: {
      name: "Titian Red",
      hex: '#c43428',
      rgb: [196, 52, 40],
      hint: 'Titian blended vermilion with a touch of crimson lake and the tiniest wash of lead white.',
    },
    tolerance: 22,
    fact: "Titian's reds were so celebrated that 'rosso Tizianesco' became a synonym for luminous crimson. He applied multiple thin glazes of kermes lake over a vermilion ground, building up depth impossible to achieve in a single coat — a method only perfected through decades of practice.",
  },
  'egyptian-blue': {
    title: "Nefertiti's Blue — Mix the Royal Pigment",
    subtitle: 'Egypt, c. 1340 BCE',
    pigments: [
      { id: 'azure',   name: 'Azurite',      hex: '#3d6ea6', rgb: [61,  110, 166], source: 'Copper carbonate ore'  },
      { id: 'mala',    name: 'Malachite',    hex: '#1f7a4d', rgb: [31,  122, 77 ], source: 'Copper ore, Sinai'     },
      { id: 'chalk',   name: 'Chalk White',  hex: '#f0ede6', rgb: [240, 237, 230], source: 'Limestone, Nile Delta' },
      { id: 'charcoal',name: 'Bone Black',   hex: '#2c2c2c', rgb: [44,  44,  44 ], source: 'Charred animal bones'  },
    ],
    target: {
      name: "Egyptian Royal Blue",
      hex: '#2a5f9e',
      rgb: [42, 95, 158],
      hint: 'Mix mostly azurite with a hint of malachite and just a little chalk white.',
    },
    tolerance: 25,
    fact: "Egyptian blue (cuprorivaite) was the world's first synthetic pigment, manufactured in Egypt from around 3200 BCE. Made by heating quartz sand, copper minerals, and limestone to 850–1000°C, it was traded across the ancient world. When illuminated with infrared light, Egyptian blue glows so brightly it can be detected from space.",
  },
  'ultramarine-lapis': {
    title: "Fra Angelico's Sky — Mix Ultramarine",
    subtitle: 'Florence, c. 1440',
    pigments: [
      { id: 'lapis',   name: 'Lapis Lazuli',  hex: '#2641a3', rgb: [38,  65,  163], source: 'Sar-e Sang mines, Afghanistan' },
      { id: 'azurite', name: 'Azurite',        hex: '#3d6ea6', rgb: [61,  110, 166], source: 'Copper carbonate, Austria'     },
      { id: 'white',   name: 'Lead White',     hex: '#e8e4d8', rgb: [232, 228, 216], source: 'Corroded lead plates'          },
      { id: 'indigo',  name: 'Indigo',         hex: '#25285e', rgb: [37,  40,  94 ], source: 'Indigofera plant, India'       },
    ],
    target: {
      name: "Ultramarine Blue",
      hex: '#2d4cb2',
      rgb: [45, 76, 178],
      hint: 'True ultramarine is mostly pure lapis — a touch of indigo deepens it, white brightens.',
    },
    tolerance: 22,
    fact: "Ultramarine — 'from beyond the sea' — was mined exclusively in Afghanistan and cost more than gold. Medieval contracts specified exactly how many grams an artist was permitted to use. Jan van Eyck and Fra Angelico reserved it solely for the Virgin Mary's robe. Michelangelo reportedly left the Entombment unfinished because his patron refused to supply enough lapis.",
  },
  'woad-blue': {
    title: "Charlemagne's Blue — Mix the Woad Dye",
    subtitle: 'Frankish Empire, c. 800 CE',
    pigments: [
      { id: 'woad',    name: 'Woad Blue',     hex: '#3a6b9c', rgb: [58,  107, 156], source: 'Isatis tinctoria plant, Gaul'  },
      { id: 'black',   name: 'Iron Black',    hex: '#1a1a2e', rgb: [26,  26,  46 ], source: 'Iron tannate, oak galls'       },
      { id: 'ochre',   name: 'Yellow Ochre',  hex: '#c69c2e', rgb: [198, 156, 46 ], source: 'Limonite clay, Rhine valley'   },
      { id: 'chalk',   name: 'Chalk White',   hex: '#f0ede6', rgb: [240, 237, 230], source: 'Ground limestone'              },
    ],
    target: {
      name: "Royal Frankish Blue",
      hex: '#3458a8',
      rgb: [52, 88, 168],
      hint: 'Woad blue deepened with iron black gives the cool steel-blue of Carolingian robes.',
    },
    tolerance: 28,
    fact: "Woad was the only blue pigment available in northern Europe before indigo arrived from Asia in the 13th century. The woad trade was so lucrative it built the Gothic cathedrals of Toulouse — merchants' woad profits funded the Capitole de Toulouse and much of the city's medieval wealth. When cheaper Indian indigo arrived, the woad industry collapsed in a generation.",
  },
}

// ── Colour swatch component ────────────────────────────────────────────────────

function Swatch({ hex, label, size = 'md' }: { hex: string; label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-16 h-16' : size === 'md' ? 'w-10 h-10' : 'w-7 h-7'
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${dim} rounded-xl border-2 border-white/10 shadow-md`}
        style={{ backgroundColor: hex }}
      />
      {label && <span className="text-[9px] text-slate-400 text-center leading-tight">{label}</span>}
    </div>
  )
}

// ── Progress arc indicator ─────────────────────────────────────────────────────

function MatchMeter({ pct }: { pct: number }) {
  const color = pct >= 85 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg viewBox="0 0 56 56" width="56" height="56">
          {/* Track */}
          <circle cx="28" cy="28" r="22" fill="none" stroke="#1e293b" strokeWidth="5" />
          {/* Progress */}
          <circle
            cx="28" cy="28" r="22"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 22 * pct / 100} ${2 * Math.PI * 22}`}
            transform="rotate(-90 28 28)"
            style={{ transition: 'stroke-dasharray 0.35s, stroke 0.35s' }}
          />
          <text x="28" y="33" textAnchor="middle" fontSize="11" fontWeight="bold" fill={color} fontFamily="monospace">
            {Math.round(pct)}%
          </text>
        </svg>
      </div>
      <span className="text-[9px] text-slate-500 uppercase tracking-wider">Match</span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ColorMixGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['titian-red']
  const [amounts, setAmounts] = useState<Record<string, number>>(
    () => Object.fromEntries(cfg.pigments.map(p => [p.id, 0]))
  )
  const [mixed, setMixed] = useState(false)
  const [won, setWon] = useState(false)
  const [showHint, setShowHint] = useState(false)

  const totalAdded = Object.values(amounts).reduce((a, b) => a + b, 0)
  const mixedRGB = useMemo(() => mixRGB(cfg.pigments, amounts), [cfg.pigments, amounts])
  const mixedHex = useMemo(() => rgbToHex(mixedRGB), [mixedRGB])

  const dist = useMemo(() => colourDist(mixedRGB, cfg.target.rgb), [mixedRGB, cfg.target.rgb])
  // Map dist 0..tolerance to 100..0, clamped
  const matchPct = useMemo(() => Math.max(0, Math.round(100 - (dist / cfg.tolerance) * 100)), [dist, cfg.tolerance])
  const isMatch = dist <= cfg.tolerance

  const adjust = (id: string, delta: number) => {
    if (mixed) return
    setAmounts(a => {
      const next = Math.max(0, Math.min(6, (a[id] ?? 0) + delta))
      return { ...a, [id]: next }
    })
  }

  const handleMix = () => {
    if (totalAdded === 0) return
    setMixed(true)
    if (isMatch) {
      setWon(true)
      setTimeout(onWin, 800)
    }
  }

  const reset = () => {
    setAmounts(Object.fromEntries(cfg.pigments.map(p => [p.id, 0])))
    setMixed(false)
    setWon(false)
    setShowHint(false)
  }

  return (
    <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-4">
      {/* Title */}
      <div>
        <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
        <p className="text-slate-500 text-[10px]">{cfg.subtitle}</p>
      </div>

      {/* Target + current mix comparison */}
      <div className="flex items-center gap-4 bg-white/[0.03] border border-white/10 rounded-xl p-3">
        <Swatch hex={cfg.target.hex} label="Target" size="lg" />
        <div className="flex-1 flex flex-col gap-1">
          <p className="text-white font-bold text-xs">{cfg.target.name}</p>
          <p className="text-slate-500 text-[10px] font-mono">{cfg.target.hex}</p>
        </div>
        {totalAdded > 0 && (
          <>
            <MatchMeter pct={matchPct} />
            <Swatch hex={mixedHex} label="Your mix" size="lg" />
          </>
        )}
        {totalAdded === 0 && (
          <div className="flex flex-col items-center gap-1">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-white/10 flex items-center justify-center">
              <span className="text-slate-600 text-[10px]">mix</span>
            </div>
            <span className="text-[9px] text-slate-500">Your mix</span>
          </div>
        )}
      </div>

      {/* Pigment controls */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Pigments</p>
        {cfg.pigments.map(p => (
          <div key={p.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2">
            {/* Colour chip */}
            <div
              className="w-7 h-7 rounded-lg flex-shrink-0 border border-white/10"
              style={{ backgroundColor: p.hex }}
            />
            {/* Name + source */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-semibold truncate">{p.name}</p>
              <p className="text-slate-600 text-[9px] truncate">{p.source}</p>
            </div>
            {/* Amount stepper */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => adjust(p.id, -1)}
                disabled={mixed || amounts[p.id] === 0}
                className="w-6 h-6 rounded bg-white/10 text-slate-300 text-sm hover:bg-white/20 transition-colors disabled:opacity-30"
              >−</button>
              <span className="text-white font-bold text-sm font-mono w-4 text-center">{amounts[p.id]}</span>
              <button
                onClick={() => adjust(p.id, +1)}
                disabled={mixed || amounts[p.id] >= 6}
                className="w-6 h-6 rounded bg-white/10 text-slate-300 text-sm hover:bg-white/20 transition-colors disabled:opacity-30"
              >+</button>
            </div>
          </div>
        ))}
      </div>

      {/* Hint */}
      {mixed && !won && (
        <div className="flex flex-col gap-2">
          <p className="text-red-400 text-xs text-center">
            {matchPct >= 70 ? 'Very close! Adjust the proportions slightly.' : 'Not quite — rethink the mix.'}
          </p>
          <button
            onClick={() => setShowHint(true)}
            className="text-slate-500 text-[10px] underline text-center hover:text-slate-400 transition-colors"
          >
            {showHint ? cfg.target.hint : 'Show hint'}
          </button>
          {showHint && (
            <p className="text-amber-400/70 text-[10px] leading-relaxed italic text-center px-2">{cfg.target.hint}</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!mixed ? (
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:border-white/20 transition-all"
          >
            Clear
          </button>
          <button
            onClick={handleMix}
            disabled={totalAdded === 0}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-all disabled:opacity-40"
          >
            Mix Pigments 🎨
          </button>
        </div>
      ) : !won ? (
        <button
          onClick={reset}
          className="w-full py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:border-white/20 transition-all"
        >
          Try Again
        </button>
      ) : null}

      {/* Win state */}
      {won && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-xs leading-relaxed">
          <span className="font-bold text-emerald-300">Perfect match! </span>
          <span className="text-slate-400">{cfg.fact}</span>
        </div>
      )}
    </div>
  )
}
