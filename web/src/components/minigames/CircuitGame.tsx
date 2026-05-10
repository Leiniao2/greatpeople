import { useState, useEffect } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type CircuitKey = 'enigma' | 'digital-logic'

interface SwitchDef {
  id: string
  label: string
  x1: number
  y1: number
  x2: number
  y2: number
}

interface WirePath {
  id: string
  d: string
  activeWhen: (sw: Record<string, boolean>) => boolean
}

interface CircuitConfig {
  title: string
  viewBox: string
  switches: SwitchDef[]
  wires: WirePath[]
  bulbX: number
  bulbY: number
  bulbActiveWhen: (sw: Record<string, boolean>) => boolean
  winCondition: (sw: Record<string, boolean>) => boolean
}

const CONFIGS: Record<CircuitKey, CircuitConfig> = {
  enigma: {
    title: 'Complete the Bombe Circuit',
    viewBox: '0 0 340 200',
    switches: [
      { id: 'A', label: 'A', x1: 80, y1: 60, x2: 130, y2: 60 },
      { id: 'B', label: 'B', x1: 170, y1: 35, x2: 220, y2: 35 },
      { id: 'C', label: 'C', x1: 170, y1: 85, x2: 220, y2: 85 },
    ],
    wires: [
      // Battery to SW_A
      { id: 'bat-a', d: 'M 30 60 L 80 60', activeWhen: () => true },
      // SW_A to junction
      { id: 'a-junc', d: 'M 130 60 L 160 60', activeWhen: sw => sw['A'] },
      // Junction top
      { id: 'junc-top', d: 'M 160 60 L 160 35 L 170 35', activeWhen: sw => sw['A'] },
      // Junction bottom
      { id: 'junc-bot', d: 'M 160 60 L 160 85 L 170 85', activeWhen: sw => sw['A'] },
      // SW_B to merge
      { id: 'b-merge', d: 'M 220 35 L 250 35 L 250 60', activeWhen: sw => sw['A'] && sw['B'] },
      // SW_C to merge
      { id: 'c-merge', d: 'M 220 85 L 250 85 L 250 60', activeWhen: sw => sw['A'] && sw['C'] },
      // Merge to bulb
      { id: 'merge-bulb', d: 'M 250 60 L 290 60', activeWhen: sw => sw['A'] && (sw['B'] || sw['C']) },
      // Bulb to battery return
      { id: 'bulb-bat', d: 'M 310 60 L 320 60 L 320 140 L 20 140 L 20 60 L 30 60', activeWhen: sw => sw['A'] && (sw['B'] || sw['C']) },
    ],
    bulbX: 300,
    bulbY: 60,
    bulbActiveWhen: sw => sw['A'] && (sw['B'] || sw['C']),
    winCondition: sw => sw['A'] && (sw['B'] || sw['C']),
  },
  'digital-logic': {
    title: 'Wire the Logic Gate',
    viewBox: '0 0 340 200',
    switches: [
      { id: '1', label: '1', x1: 60, y1: 50, x2: 120, y2: 50 },
      { id: '2', label: '2', x1: 160, y1: 50, x2: 220, y2: 50 },
      { id: '3', label: '3', x1: 60, y1: 130, x2: 120, y2: 130 },
      { id: '4', label: '4', x1: 160, y1: 130, x2: 220, y2: 130 },
    ],
    wires: [
      // Battery
      { id: 'bat-top', d: 'M 20 50 L 60 50', activeWhen: () => true },
      { id: 'bat-bot', d: 'M 20 130 L 60 130', activeWhen: () => true },
      // Branch 1: SW1 + SW2
      { id: 'sw1-sw2', d: 'M 120 50 L 160 50', activeWhen: sw => sw['1'] },
      { id: 'sw2-merge', d: 'M 220 50 L 260 50', activeWhen: sw => sw['1'] && sw['2'] },
      // Branch 2: SW3 + SW4
      { id: 'sw3-sw4', d: 'M 120 130 L 160 130', activeWhen: sw => sw['3'] },
      { id: 'sw4-merge', d: 'M 220 130 L 260 130', activeWhen: sw => sw['3'] && sw['4'] },
      // OR merge
      { id: 'merge-top', d: 'M 260 50 L 260 90', activeWhen: sw => sw['1'] && sw['2'] },
      { id: 'merge-bot', d: 'M 260 130 L 260 90', activeWhen: sw => sw['3'] && sw['4'] },
      // To bulb
      { id: 'to-bulb', d: 'M 260 90 L 295 90', activeWhen: sw => (sw['1'] && sw['2']) || (sw['3'] && sw['4']) },
      // Return
      { id: 'return', d: 'M 315 90 L 320 90 L 320 160 L 20 160 L 20 90', activeWhen: sw => (sw['1'] && sw['2']) || (sw['3'] && sw['4']) },
    ],
    bulbX: 305,
    bulbY: 90,
    bulbActiveWhen: sw => (sw['1'] && sw['2']) || (sw['3'] && sw['4']),
    winCondition: sw => (sw['1'] && sw['2']) || (sw['3'] && sw['4']),
  },
}

// ── Switch SVG component ───────────────────────────────────────────────────────

function Switch({
  def,
  on,
  active,
  onClick,
}: {
  def: SwitchDef
  on: boolean
  active: boolean
  onClick: () => void
}) {
  const midX = (def.x1 + def.x2) / 2
  const midY = (def.y1 + def.y2) / 2 - 12
  const wireColor = active ? '#fbbf24' : '#334155'
  const pivotX = def.x1 + 4
  const hingeY = def.y1

  // Open: pivot up slightly; Closed: flat line
  const openEndX = def.x1 + (def.x2 - def.x1) * 0.7
  const openEndY = def.y1 - 14

  return (
    <g
      onClick={onClick}
      className="cursor-pointer"
      style={{ filter: active ? 'drop-shadow(0 0 4px #fbbf24)' : 'none' }}>
      {/* Clickable hit area */}
      <rect
        x={def.x1 - 6}
        y={def.y1 - 20}
        width={def.x2 - def.x1 + 12}
        height={36}
        fill="transparent"
        className="cursor-pointer"
      />
      {/* Left wire stub */}
      <line x1={def.x1} y1={def.y1} x2={pivotX} y2={def.y1} stroke={wireColor} strokeWidth={2} strokeLinecap="round" />
      {/* Pivot dot */}
      <circle cx={pivotX} cy={hingeY} r={2.5} fill={on ? '#fbbf24' : '#64748b'} />
      {/* Switch arm */}
      {on ? (
        <line
          x1={pivotX}
          y1={hingeY}
          x2={def.x2 - 4}
          y2={hingeY}
          stroke={wireColor}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      ) : (
        <line
          x1={pivotX}
          y1={hingeY}
          x2={openEndX}
          y2={openEndY}
          stroke="#64748b"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      )}
      {/* Right wire stub */}
      <circle cx={def.x2 - 4} cy={def.y2} r={2.5} fill={on ? '#fbbf24' : '#64748b'} />
      <line x1={def.x2 - 4} y1={def.y2} x2={def.x2} y2={def.y2} stroke={on ? wireColor : '#334155'} strokeWidth={2} strokeLinecap="round" />
      {/* Label */}
      <text
        x={midX}
        y={midY + 2}
        textAnchor="middle"
        fontSize={9}
        fill={on ? '#fbbf24' : '#64748b'}
        fontFamily="monospace"
        fontWeight="bold">
        {def.label}
      </text>
      {/* ON/OFF indicator */}
      <text
        x={midX}
        y={def.y1 + 16}
        textAnchor="middle"
        fontSize={7}
        fill={on ? '#34d399' : '#475569'}
        fontFamily="monospace">
        {on ? 'ON' : 'OFF'}
      </text>
    </g>
  )
}

// ── Bulb SVG component ─────────────────────────────────────────────────────────

function Bulb({ cx, cy, on }: { cx: number; cy: number; on: boolean }) {
  return (
    <g style={{ filter: on ? 'drop-shadow(0 0 8px #fbbf24)' : 'none' }}>
      {/* Glow behind */}
      {on && (
        <circle cx={cx} cy={cy} r={18} fill="#fbbf24" opacity={0.15} />
      )}
      {/* Bulb body */}
      <circle
        cx={cx}
        cy={cy}
        r={12}
        fill={on ? '#fbbf24' : '#1e293b'}
        stroke={on ? '#fbbf24' : '#475569'}
        strokeWidth={1.5}
      />
      {/* Filament */}
      <path
        d={`M ${cx - 4} ${cy + 4} Q ${cx} ${cy - 4} ${cx + 4} ${cy + 4}`}
        fill="none"
        stroke={on ? '#1e293b' : '#475569'}
        strokeWidth={1.5}
      />
      {/* Base */}
      <rect
        x={cx - 5}
        y={cy + 11}
        width={10}
        height={4}
        rx={1}
        fill={on ? '#d97706' : '#334155'}
      />
    </g>
  )
}

// ── Battery SVG component ─────────────────────────────────────────────────────

function Battery({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 8} y={y - 12} width={16} height={24} rx={2} fill="#1e293b" stroke="#475569" strokeWidth={1} />
      <line x1={x - 5} y1={y - 7} x2={x + 5} y2={y - 7} stroke="#ef4444" strokeWidth={1.5} />
      <line x1={x} y1={y - 10} x2={x} y2={y - 4} stroke="#ef4444" strokeWidth={1.5} />
      <line x1={x - 5} y1={y + 5} x2={x + 5} y2={y + 5} stroke="#64748b" strokeWidth={1.5} />
      <text x={x - 12} y={y - 5} fontSize={7} fill="#ef4444" fontFamily="monospace">+</text>
      <text x={x - 12} y={y + 10} fontSize={7} fill="#64748b" fontFamily="monospace">-</text>
    </g>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface CircuitGameProps {
  configId: string
  onWin: () => void
}

export default function CircuitGame({ configId, onWin }: CircuitGameProps) {
  const config = CONFIGS[configId as CircuitKey] ?? CONFIGS['enigma']

  const initState: Record<string, boolean> = {}
  config.switches.forEach(sw => { initState[sw.id] = false })

  const [switches, setSwitches] = useState<Record<string, boolean>>(initState)
  const [won, setWon] = useState(false)

  const toggleSwitch = (id: string) => {
    if (won) return
    setSwitches(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const circuitOn = config.bulbActiveWhen(switches)

  useEffect(() => {
    if (config.winCondition(switches) && !won) {
      setWon(true)
      setTimeout(() => onWin(), 900)
    }
  }, [switches, won, config, onWin])

  // Parse viewBox to get dimensions
  const [, , vbW, vbH] = config.viewBox.split(' ').map(Number)

  // Determine battery position
  const isBothBranches = configId === 'digital-logic'

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Title */}
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm">{config.title}</p>
        <p className="text-slate-400 text-xs">Toggle switches to complete the circuit</p>
      </div>

      {/* SVG Circuit */}
      <div className="rounded-xl border border-slate-700/60 bg-[#0f0f1e] p-2 overflow-hidden">
        <svg
          viewBox={config.viewBox}
          width={Math.min(vbW, 320)}
          height={Math.min(vbH, 190)}
          className="overflow-visible">

          {/* Background grid dots */}
          <defs>
            <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.8" fill="#1e293b" />
            </pattern>
          </defs>
          <rect width={vbW} height={vbH} fill="url(#dots)" />

          {/* Wires */}
          {config.wires.map(wire => {
            const isActive = wire.activeWhen(switches)
            return (
              <path
                key={wire.id}
                d={wire.d}
                fill="none"
                stroke={isActive ? '#fbbf24' : '#334155'}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  filter: isActive ? 'drop-shadow(0 0 3px #fbbf24)' : 'none',
                  transition: 'stroke 0.2s, filter 0.2s',
                }}
              />
            )
          })}

          {/* Battery */}
          <Battery
            x={20}
            y={isBothBranches ? 90 : 100}
          />

          {/* Switches */}
          {config.switches.map(sw => {
            const swActive = config.wires.find(w => w.id.startsWith('bat-'))?.activeWhen(switches) ?? false
            // Check if current flows through this switch
            const throughSwitch = (() => {
              if (configId === 'enigma') {
                if (sw.id === 'A') return switches['A']
                if (sw.id === 'B') return switches['A'] && switches['B']
                if (sw.id === 'C') return switches['A'] && switches['C']
              } else {
                if (sw.id === '1') return switches['1']
                if (sw.id === '2') return switches['1'] && switches['2']
                if (sw.id === '3') return switches['3']
                if (sw.id === '4') return switches['3'] && switches['4']
              }
              return false
            })()
            void swActive
            return (
              <Switch
                key={sw.id}
                def={sw}
                on={switches[sw.id]}
                active={throughSwitch}
                onClick={() => toggleSwitch(sw.id)}
              />
            )
          })}

          {/* Bulb */}
          <Bulb cx={config.bulbX} cy={config.bulbY} on={circuitOn} />

          {/* Animated current dot when circuit is on */}
          {circuitOn && (
            <circle r={4} fill="#fbbf24" opacity={0.9}>
              <animateMotion dur="1.5s" repeatCount="indefinite">
                <mpath href="#main-path" />
              </animateMotion>
            </circle>
          )}
        </svg>
      </div>

      {/* Switch buttons (mobile-friendly) */}
      <div className="flex gap-2 flex-wrap justify-center">
        {config.switches.map(sw => (
          <button
            key={sw.id}
            onClick={() => toggleSwitch(sw.id)}
            className={`w-14 h-10 rounded-lg border font-bold text-sm transition-all duration-200
              ${switches[sw.id]
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.3)]'
                : 'bg-slate-800/60 border-slate-700/50 text-slate-400 hover:border-slate-500/60'
              }`}>
            {sw.label}
          </button>
        ))}
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <div className={`w-2 h-2 rounded-full transition-all duration-300
          ${circuitOn ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]' : 'bg-slate-700'}`} />
        <span>{circuitOn ? 'Circuit complete!' : 'Circuit open'}</span>
      </div>

      {won && (
        <div className="text-emerald-400 font-bold text-sm animate-pulse">
          Circuit powered! The bulb lights up!
        </div>
      )}
    </div>
  )
}
