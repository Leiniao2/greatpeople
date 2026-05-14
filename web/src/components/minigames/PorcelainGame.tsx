import { useState } from 'react'

// Metal oxides → fired colors in porcelain/glaze
const ELEMENT_COLORS: Record<string, { fired: string; firedLabel: string; element: string; symbol: string }> = {
  Cu: { element: 'Copper',    symbol: 'Cu', fired: '#4ade80', firedLabel: 'Copper Green'  },
  Co: { element: 'Cobalt',    symbol: 'Co', fired: '#60a5fa', firedLabel: 'Cobalt Blue'   },
  Fe: { element: 'Iron',      symbol: 'Fe', fired: '#f59e0b', firedLabel: 'Iron Amber'    },
  Mn: { element: 'Manganese', symbol: 'Mn', fired: '#a78bfa', firedLabel: 'Manganese Purple' },
  Ti: { element: 'Titanium',  symbol: 'Ti', fired: '#f1f5f9', firedLabel: 'Titanium White' },
  Cr: { element: 'Chromium',  symbol: 'Cr', fired: '#86efac', firedLabel: 'Chrome Jade'   },
}

interface Section {
  id: string
  label: string         // decorative name
  path: string          // SVG path
  targetElement: string // which element must go here
}

interface PorcelainConfig {
  title: string
  vessel: 'vase' | 'bowl' | 'teapot'
  sections: Section[]
  palette: string[]     // available element symbols
  fact: string
}

const CONFIGS: Record<string, PorcelainConfig> = {
  'copper-vase': {
    title: 'Copper Green Vase',
    vessel: 'vase',
    palette: ['Cu', 'Co', 'Fe', 'Mn'],
    sections: [
      { id: 'neck',  label: 'Neck Band',    path: 'M 90,30 Q 100,25 110,30 L 115,60 Q 100,55 85,60 Z',          targetElement: 'Co' },
      { id: 'upper', label: 'Upper Body',   path: 'M 85,60 Q 100,55 115,60 L 125,100 Q 100,95 75,100 Z',        targetElement: 'Cu' },
      { id: 'belly', label: 'Belly',        path: 'M 75,100 Q 100,95 125,100 L 130,145 Q 100,140 70,145 Z',     targetElement: 'Cu' },
      { id: 'lower', label: 'Lower Body',   path: 'M 70,145 Q 100,140 130,145 L 120,175 Q 100,170 80,175 Z',   targetElement: 'Fe' },
      { id: 'foot',  label: 'Foot Ring',    path: 'M 80,175 Q 100,170 120,175 L 115,190 Q 100,187 85,190 Z',   targetElement: 'Mn' },
    ],
    fact: 'Copper-red and copper-green glazes were among the most prized in Song Dynasty ceramics. Achieving the correct oxidation atmosphere in the kiln was a closely guarded secret.',
  },
  'cobalt-bowl': {
    title: 'Blue-and-White Bowl',
    vessel: 'bowl',
    palette: ['Co', 'Cu', 'Ti', 'Mn'],
    sections: [
      { id: 'rim',    label: 'Rim',         path: 'M 55,70 Q 100,60 145,70 L 140,90 Q 100,80 60,90 Z',         targetElement: 'Co' },
      { id: 'inner',  label: 'Inner Wall',  path: 'M 60,90 Q 100,80 140,90 L 135,130 Q 100,120 65,130 Z',      targetElement: 'Ti' },
      { id: 'base',   label: 'Base',        path: 'M 65,130 Q 100,120 135,130 L 130,155 Q 100,148 70,155 Z',   targetElement: 'Co' },
      { id: 'foot',   label: 'Foot',        path: 'M 70,155 Q 100,148 130,155 L 115,170 Q 100,167 85,170 Z',   targetElement: 'Mn' },
    ],
    fact: 'Blue-and-white porcelain uses cobalt oxide as its colorant. Persian cobalt ("smalt") was imported along the Silk Road and became synonymous with Ming Dynasty porcelain.',
  },
  'iron-teapot': {
    title: 'Iron Amber Teapot',
    vessel: 'teapot',
    palette: ['Fe', 'Co', 'Cu', 'Cr', 'Mn'],
    sections: [
      { id: 'lid',    label: 'Lid',         path: 'M 80,30 Q 100,24 120,30 L 118,50 Q 100,45 82,50 Z',         targetElement: 'Fe' },
      { id: 'body',   label: 'Body',        path: 'M 70,50 Q 100,45 130,50 L 135,130 Q 100,125 65,130 Z',      targetElement: 'Fe' },
      { id: 'spout',  label: 'Spout',       path: 'M 135,70 L 165,55 L 168,75 L 138,90 Z',                      targetElement: 'Co' },
      { id: 'handle', label: 'Handle',      path: 'M 65,75 Q 40,90 42,115 Q 45,130 65,125 L 65,115 Q 50,115 50,100 Q 50,85 65,90 Z', targetElement: 'Cr' },
      { id: 'base',   label: 'Base Ring',   path: 'M 65,130 Q 100,125 135,130 L 130,150 Q 100,145 70,150 Z',   targetElement: 'Mn' },
    ],
    fact: 'Iron-rich glazes produce tenmoku (天目) — the distinctive amber-to-black "oil spot" or "hare\'s fur" patterns prized in Song Dynasty tea ceremony ware.',
  },
}

// ── SVG Vessel ────────────────────────────────────────────────────────────────

function VesselSVG({
  config,
  painted,
  fired,
}: {
  config: PorcelainConfig
  painted: Record<string, string>   // sectionId → element symbol (unfired)
  fired: boolean
}) {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full" style={{ maxWidth: 200, maxHeight: 200 }}>
      {/* Base vessel silhouette */}
      <ellipse cx="100" cy="185" rx="35" ry="5" fill="rgba(0,0,0,0.3)" />

      {config.sections.map(section => {
        const elem = painted[section.id]
        const info = elem ? ELEMENT_COLORS[elem] : null
        const fillColor = info
          ? (fired ? info.fired : '#8b8b6b')
          : 'rgba(255,255,255,0.06)'
        const stroke = info ? (fired ? info.fired + 'aa' : '#6b6b4b') : 'rgba(255,255,255,0.12)'

        return (
          <path
            key={section.id}
            d={section.path}
            fill={fillColor}
            stroke={stroke}
            strokeWidth="1.5"
            style={{ transition: 'fill 0.6s ease' }}
          />
        )
      })}

      {/* Outline */}
      {config.vessel === 'vase' && (
        <path
          d="M 90,30 Q 100,25 110,30 L 115,60 Q 130,70 130,100 Q 135,130 130,145 L 120,175 Q 100,182 80,175 L 70,145 Q 65,130 70,100 Q 70,70 85,60 Z"
          fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"
        />
      )}
      {config.vessel === 'bowl' && (
        <path
          d="M 55,70 Q 100,60 145,70 L 130,155 Q 100,165 70,155 Z"
          fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"
        />
      )}
      {config.vessel === 'teapot' && (
        <g fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
          <path d="M 70,50 Q 100,44 130,50 L 135,130 Q 100,138 65,130 Z" />
          <path d="M 80,30 Q 100,24 120,30 L 118,50 Q 100,46 82,50 Z" />
        </g>
      )}
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PorcelainGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['copper-vase']
  const [painted, setPainted] = useState<Record<string, string>>({})
  const [activeElem, setActiveElem] = useState<string | null>(null)
  const [fired, setFired] = useState(false)
  const [won, setWon] = useState(false)
  const [showResult, setShowResult] = useState(false)

  const handleSectionClick = (sectionId: string) => {
    if (fired) return
    if (!activeElem) return
    setPainted(prev => ({ ...prev, [sectionId]: activeElem }))
  }

  const handleFire = () => {
    if (fired) return
    setFired(true)
    setShowResult(true)
    // Check win: all sections painted with correct element
    const allCorrect = cfg.sections.every(s => painted[s.id] === s.targetElement)
    if (allCorrect) {
      setWon(true)
      setTimeout(onWin, 1000)
    }
  }

  const reset = () => {
    setPainted({})
    setActiveElem(null)
    setFired(false)
    setWon(false)
    setShowResult(false)
  }

  const allPainted = cfg.sections.every(s => painted[s.id])

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-950 rounded-xl select-none">
      <div className="flex items-center justify-between">
        <span className="text-amber-400 font-bold text-sm tracking-wide">{cfg.title}</span>
        {won && <span className="text-emerald-400 text-xs font-bold">Perfect firing!</span>}
      </div>

      <p className="text-slate-400 text-xs leading-relaxed">
        Select an element, then tap vessel sections to apply the glaze. <span className="text-amber-400/80">Hint: each section expects a specific metal oxide.</span>
      </p>

      {/* Element palette */}
      <div className="flex gap-2 flex-wrap">
        {cfg.palette.map(sym => {
          const info = ELEMENT_COLORS[sym]
          const isActive = activeElem === sym
          return (
            <button
              key={sym}
              onClick={() => setActiveElem(isActive ? null : sym)}
              disabled={fired}
              className="flex flex-col items-center px-3 py-2 rounded-xl border transition-all text-xs font-bold"
              style={{
                background: isActive ? `${info.fired}22` : 'rgba(255,255,255,0.04)',
                borderColor: isActive ? info.fired : 'rgba(255,255,255,0.10)',
                color: isActive ? info.fired : '#94a3b8',
                boxShadow: isActive ? `0 0 10px ${info.fired}44` : 'none',
              }}
            >
              <span className="text-base">{sym}</span>
              <span className="font-normal opacity-70">{info.element}</span>
            </button>
          )
        })}
      </div>

      {/* Vessel + section buttons */}
      <div className="flex gap-4 items-start">
        {/* SVG vessel */}
        <div className="shrink-0 w-[120px] h-[120px]">
          <VesselSVG config={cfg} painted={painted} fired={fired} />
        </div>

        {/* Section list */}
        <div className="flex-1 flex flex-col gap-1.5">
          {cfg.sections.map(section => {
            const elem = painted[section.id]
            const info = elem ? ELEMENT_COLORS[elem] : null
            const isCorrect = fired && elem === section.targetElement
            const isWrong = fired && elem && elem !== section.targetElement

            return (
              <button
                key={section.id}
                onClick={() => handleSectionClick(section.id)}
                disabled={fired}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all text-xs"
                style={{
                  background: isCorrect
                    ? 'rgba(52,211,153,0.12)'
                    : isWrong
                    ? 'rgba(239,68,68,0.10)'
                    : elem
                    ? `${ELEMENT_COLORS[elem].fired}14`
                    : 'rgba(255,255,255,0.04)',
                  borderColor: isCorrect
                    ? 'rgba(52,211,153,0.4)'
                    : isWrong
                    ? 'rgba(239,68,68,0.35)'
                    : elem
                    ? `${ELEMENT_COLORS[elem].fired}55`
                    : 'rgba(255,255,255,0.08)',
                }}
              >
                {/* Color dot */}
                <div className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: info ? (fired ? info.fired : '#8b8b6b') : 'rgba(255,255,255,0.15)' }} />
                <span className="text-slate-300 flex-1">{section.label}</span>
                {elem && (
                  <span className="font-bold" style={{ color: fired ? (info?.fired ?? '#fff') : '#94a3b8' }}>
                    {elem}
                    {fired && <span className="font-normal ml-1">
                      {isCorrect ? `→ ${info?.firedLabel}` : '✕ wrong oxide'}
                    </span>}
                  </span>
                )}
                {!elem && activeElem && (
                  <span className="text-slate-600">tap to paint</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Fire button */}
      {!fired && (
        <button
          onClick={handleFire}
          disabled={!allPainted}
          className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-all"
          style={{
            background: allPainted ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.05)',
            color: allPainted ? '#0f172a' : '#475569',
            cursor: allPainted ? 'pointer' : 'not-allowed',
          }}
        >
          🔥 Fire the Kiln!
        </button>
      )}

      {/* Result */}
      {showResult && (
        <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
          won
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          {won
            ? <>Perfect glaze — all metal oxides in the right sections! {cfg.fact}</>
            : <>Some sections used the wrong oxide. Check the colors — copper makes green, cobalt makes blue, iron makes amber. <button onClick={reset} className="underline ml-1">Try again</button></>
          }
        </div>
      )}

      {won && (
        <p className="text-slate-500 text-xs text-center leading-relaxed">{cfg.fact}</p>
      )}

      {!fired && (
        <button onClick={reset}
          className="text-slate-600 text-xs hover:text-slate-400 transition-all underline underline-offset-2 self-center">
          Reset
        </button>
      )}
    </div>
  )
}
