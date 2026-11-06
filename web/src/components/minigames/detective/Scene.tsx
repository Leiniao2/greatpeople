// The drawn scene of a Detective case: a room with things to tap.  Every
// object is a small vector drawing placed by the case data; a tapped object
// is ringed, and one that turned out to be a clue is ringed in gold.

import type { ReactNode } from 'react'
import type { Glyph } from './cases'
import type { SceneObject } from './model'

export const SCENE_W = 320
export const SCENE_H = 200

const WOOD = '#8b5a2b', DARK = '#3b2a1a', IRON = '#64748b', CLOTH = '#b91c1c', PALE = '#fde68a', WHITE = '#f5f5f4', GLASS = '#93c5fd'

/** Each glyph fills a 40 × 40 box centred on the origin. */
const GLYPHS: Record<Glyph, ReactNode> = {
  body: (
    <g>
      <ellipse cx={0} cy={6} rx={22} ry={9} fill="#1c1917" opacity={0.35} />
      <rect x={-16} y={-2} width={26} height={10} rx={4} fill="#44403c" />
      <rect x={-18} y={-1} width={10} height={8} rx={3} fill="#57534e" />
      <circle cx={14} cy={2} r={5} fill="#e7d3b3" />
      <rect x={-10} y={-8} width={4} height={8} rx={2} fill="#57534e" transform="rotate(-30 -8 -4)" />
    </g>
  ),
  candle: (
    <g>
      <rect x={-7} y={10} width={14} height={4} rx={1} fill="#a16207" />
      <rect x={-3} y={-8} width={6} height={18} fill={WHITE} />
      <ellipse cx={0} cy={-12} rx={3} ry={5} fill="#f59e0b" />
      <ellipse cx={0} cy={-13} rx={1.5} ry={3} fill={PALE} />
    </g>
  ),
  book: (
    <g>
      <rect x={-12} y={-6} width={24} height={14} rx={1} fill="#7f1d1d" />
      <rect x={-10} y={-8} width={24} height={14} rx={1} fill="#fef3c7" />
      <path d="M-6 -4 h16 M-6 -1 h16 M-6 2 h12" stroke="#a8a29e" strokeWidth={1} />
    </g>
  ),
  sword: (
    <g transform="rotate(-40)">
      <rect x={-1.5} y={-18} width={3} height={26} fill="#cbd5e1" />
      <rect x={-7} y={8} width={14} height={2.5} fill="#854d0e" />
      <rect x={-2} y={10} width={4} height={8} fill={DARK} />
    </g>
  ),
  rope: (
    <g fill="none" stroke="#b45309" strokeWidth={3}>
      <circle cx={0} cy={0} r={10} />
      <circle cx={0} cy={0} r={5} />
      <path d="M8 6 q6 6 2 12" />
    </g>
  ),
  coat: (
    <g>
      <rect x={-14} y={-16} width={28} height={2} fill={DARK} />
      <path d="M-8 -14 l-5 26 h26 l-5 -26 z" fill="#1e3a8a" />
      <path d="M-2 -14 h4 v22 h-4 z" fill="#172554" />
    </g>
  ),
  trapdoor: (
    <g>
      <rect x={-16} y={-10} width={32} height={20} fill={DARK} />
      <rect x={-14} y={-8} width={28} height={16} fill={WOOD} />
      <path d="M-14 -3 h28 M-14 3 h28" stroke={DARK} strokeWidth={1} />
      <circle cx={10} cy={0} r={2} fill={IRON} />
    </g>
  ),
  cup: (
    <g>
      <path d="M-8 -6 h16 l-2 14 h-12 z" fill="#d6d3d1" />
      <path d="M8 -3 q7 0 6 6 q-1 4 -7 4" fill="none" stroke="#d6d3d1" strokeWidth={2.5} />
      <ellipse cx={0} cy={-6} rx={8} ry={2.5} fill="#78350f" />
    </g>
  ),
  chest: (
    <g>
      <rect x={-15} y={-6} width={30} height={16} rx={2} fill={WOOD} />
      <path d="M-15 -6 q15 -14 30 0 z" fill="#a16207" />
      <rect x={-15} y={-4} width={30} height={2} fill={IRON} />
      <rect x={-3} y={-4} width={6} height={6} fill={IRON} />
    </g>
  ),
  window: (
    <g>
      <rect x={-16} y={-14} width={32} height={28} fill={DARK} />
      <rect x={-13} y={-11} width={12} height={10} fill={GLASS} />
      <rect x={1} y={-11} width={12} height={10} fill={GLASS} />
      <rect x={-13} y={1} width={12} height={10} fill={GLASS} />
      <rect x={1} y={1} width={12} height={10} fill={GLASS} />
    </g>
  ),
  barrel: (
    <g>
      <path d="M-11 -14 q-4 14 0 28 h22 q4 -14 0 -28 z" fill={WOOD} />
      <path d="M-13 -6 h26 M-13 6 h26" stroke={IRON} strokeWidth={2} />
      <ellipse cx={0} cy={-14} rx={11} ry={3} fill="#1d4ed8" />
    </g>
  ),
  mask: (
    <g>
      <path d="M-11 -10 q11 -8 22 0 v10 q-4 12 -11 12 q-7 0 -11 -12 z" fill={WHITE} />
      <ellipse cx={-4} cy={-3} rx={3} ry={2} fill={DARK} />
      <ellipse cx={4} cy={-3} rx={3} ry={2} fill={DARK} />
    </g>
  ),
  boat: (
    <g>
      <path d="M-18 0 q18 10 36 0 l-4 8 h-28 z" fill={DARK} />
      <path d="M-18 0 q18 6 36 0" stroke={WOOD} strokeWidth={2} fill="none" />
      <path d="M8 -14 l6 18" stroke="#a16207" strokeWidth={2} />
    </g>
  ),
  cards: (
    <g>
      <rect x={-12} y={-8} width={12} height={16} rx={1.5} fill={WHITE} stroke="#a8a29e" strokeWidth={0.8} transform="rotate(-12)" />
      <rect x={-4} y={-8} width={12} height={16} rx={1.5} fill={WHITE} stroke="#a8a29e" strokeWidth={0.8} />
      <path d="M2 -3 l2 -3 l2 3 l-2 3 z" fill={CLOTH} />
    </g>
  ),
  lantern: (
    <g>
      <rect x={-7} y={-12} width={14} height={2} fill={IRON} />
      <rect x={-6} y={-10} width={12} height={16} fill="#fbbf24" opacity={0.9} />
      <rect x={-6} y={-10} width={12} height={16} fill="none" stroke={IRON} strokeWidth={1.5} />
      <rect x={-7} y={6} width={14} height={2} fill={IRON} />
      <path d="M0 -16 v4" stroke={IRON} strokeWidth={2} />
    </g>
  ),
  post: (
    <g>
      <rect x={-4} y={-18} width={8} height={36} fill={WHITE} />
      <path d="M-4 -14 h8 M-4 -6 h8 M-4 2 h8 M-4 10 h8" stroke="#1d4ed8" strokeWidth={4} />
      <path d="M-4 -18 l4 -4 l4 4 z" fill="#1d4ed8" />
    </g>
  ),
  bottle: (
    <g>
      <rect x={-3} y={-16} width={6} height={6} fill="#064e3b" />
      <path d="M-3 -10 l-4 4 v18 h14 v-18 l-4 -4 z" fill="#065f46" />
      <rect x={-5} y={-2} width={10} height={6} fill={WHITE} />
    </g>
  ),
  sack: (
    <g>
      <path d="M-10 -8 q-6 14 0 20 h20 q6 -6 0 -20 z" fill="#d6c6a2" />
      <path d="M-8 -8 q8 -8 16 0" fill="none" stroke="#a16207" strokeWidth={2} />
      <path d="M-11 -7 h22" stroke="#92400e" strokeWidth={2} />
    </g>
  ),
  pillow: (
    <g>
      <path d="M-16 -8 q16 -4 32 0 q-4 8 0 16 q-16 4 -32 0 q4 -8 0 -16 z" fill="#e7e5e4" />
      <path d="M-12 -2 q12 -2 24 0" stroke="#d6d3d1" strokeWidth={1} fill="none" />
    </g>
  ),
  altar: (
    <g>
      <rect x={-14} y={2} width={28} height={10} fill="#7f1d1d" />
      <rect x={-6} y={-8} width={12} height={10} fill="#b45309" />
      <path d="M-4 -8 v-8 M0 -8 v-10 M4 -8 v-8" stroke="#1c1917" strokeWidth={1} />
      <circle cx={-4} cy={-16} r={1} fill="#f59e0b" /><circle cx={0} cy={-18} r={1} fill="#f59e0b" /><circle cx={4} cy={-16} r={1} fill="#f59e0b" />
    </g>
  ),
  boots: (
    <g>
      <path d="M-14 -8 h8 v10 h8 v6 h-16 z" fill={DARK} />
      <path d="M2 -8 h8 v10 h8 v6 h-16 z" fill={DARK} />
      <path d="M-14 6 h16 M2 6 h16" stroke="#78350f" strokeWidth={1.5} />
    </g>
  ),
  pole: (
    <g>
      <rect x={-2} y={-19} width={4} height={38} rx={1} fill="#a16207" transform="rotate(15)" />
      <path d="M-6 -12 h8 M-5 2 h8" stroke="#713f12" strokeWidth={1.5} transform="rotate(15)" />
    </g>
  ),
  stove: (
    <g>
      <rect x={-12} y={-8} width={24} height={22} rx={2} fill="#1f2937" />
      <rect x={-4} y={-18} width={8} height={10} fill="#111827" />
      <rect x={-7} y={-2} width={14} height={8} fill="#ea580c" opacity={0.9} />
      <path d="M-10 14 v4 M10 14 v4" stroke="#111827" strokeWidth={3} />
    </g>
  ),
  letter: (
    <g>
      <rect x={-13} y={-9} width={26} height={18} fill={WHITE} stroke="#a8a29e" strokeWidth={0.8} />
      <path d="M-13 -9 l13 10 l13 -10" fill="none" stroke="#a8a29e" strokeWidth={1} />
      <circle cx={0} cy={3} r={2.5} fill={CLOTH} />
    </g>
  ),
  pin: (
    <g>
      <rect x={-3} y={-14} width={6} height={30} rx={1} fill={IRON} />
      <rect x={-6} y={-18} width={12} height={5} rx={1} fill="#475569" />
    </g>
  ),
  scarf: (
    <g fill="none" stroke="#be185d" strokeWidth={5} strokeLinecap="round">
      <path d="M-14 -8 q10 -6 20 2 q-16 4 -4 14" />
    </g>
  ),
  decanter: (
    <g>
      <rect x={-3} y={-18} width={6} height={5} fill={GLASS} />
      <path d="M-3 -13 l-7 10 v16 h20 v-16 l-7 -10 z" fill="#7f1d1d" opacity={0.85} />
      <path d="M-3 -13 l-7 10 v16 h20 v-16 l-7 -10 z" fill="none" stroke={GLASS} strokeWidth={1.5} />
    </g>
  ),
  cushion: (
    <g>
      <rect x={-14} y={-10} width={28} height={20} rx={5} fill="#4c1d95" />
      <circle cx={-14} cy={-10} r={2} fill="#f59e0b" /><circle cx={14} cy={-10} r={2} fill="#f59e0b" />
      <circle cx={-14} cy={10} r={2} fill="#f59e0b" /><circle cx={14} cy={10} r={2} fill="#f59e0b" />
    </g>
  ),
  fireplace: (
    <g>
      <rect x={-18} y={-16} width={36} height={32} fill="#57534e" />
      <rect x={-12} y={-8} width={24} height={24} fill="#1c1917" />
      <path d="M-6 16 q-2 -12 6 -16 q8 4 6 16 z" fill="#f97316" />
      <path d="M-2 16 q-1 -6 2 -9 q3 3 2 9 z" fill={PALE} />
      <rect x={14} y={-4} width={2} height={22} fill={IRON} />
    </g>
  ),
  bellcord: (
    <g>
      <rect x={-2} y={-19} width={4} height={28} fill="#991b1b" />
      <path d="M-5 9 l5 10 l5 -10 z" fill="#f59e0b" />
      <rect x={-5} y={-19} width={10} height={3} fill={IRON} />
    </g>
  ),
  knife: (
    <g transform="rotate(30)">
      <path d="M-2 -16 h4 l1 18 h-6 z" fill="#e7e5e4" />
      <rect x={-3} y={2} width={6} height={12} rx={1} fill="#fef3c7" />
    </g>
  ),
  clock: (
    <g>
      <path d="M-13 12 v-14 q0 -13 13 -13 q13 0 13 13 v14 z" fill="#fef3c7" opacity={0.5} stroke="#a8a29e" strokeWidth={1} />
      <rect x={-15} y={12} width={30} height={3} fill="#78350f" />
      <circle cx={0} cy={0} r={8} fill={WHITE} stroke="#78350f" strokeWidth={1.5} />
      <path d="M0 0 v-5 M0 0 l4 2" stroke="#1c1917" strokeWidth={1.5} />
    </g>
  ),
  dog: (
    <g>
      <ellipse cx={0} cy={8} rx={18} ry={7} fill="#a16207" />
      <ellipse cx={-2} cy={4} rx={11} ry={6} fill="#b45309" />
      <circle cx={10} cy={2} r={5} fill="#b45309" />
      <ellipse cx={13} cy={0} rx={3} ry={5} fill="#7c2d12" />
    </g>
  ),
  plate: (
    <g>
      <ellipse cx={0} cy={0} rx={15} ry={6} fill={WHITE} stroke="#a8a29e" strokeWidth={1} />
      <ellipse cx={0} cy={-1} rx={10} ry={3.5} fill={GLASS} opacity={0.6} />
      <rect x={-6} y={-4} width={12} height={5} fill="#fde68a" opacity={0.8} />
    </g>
  ),
  tray: (
    <g>
      <ellipse cx={0} cy={2} rx={16} ry={7} fill="#cbd5e1" stroke="#64748b" strokeWidth={1} />
      <path d="M-5 -4 h10 l-1 6 h-8 z" fill="#e2e8f0" />
    </g>
  ),
  door: (
    <g>
      <rect x={-12} y={-18} width={24} height={36} fill={DARK} />
      <rect x={-10} y={-16} width={20} height={32} fill={WOOD} />
      <path d="M-10 -8 h20 M-10 4 h20" stroke={DARK} strokeWidth={1} />
      <circle cx={6} cy={0} r={1.8} fill="#f59e0b" />
    </g>
  ),
  wig: (
    <g>
      <rect x={-5} y={6} width={10} height={12} fill={WOOD} />
      <path d="M-13 4 q-2 -20 13 -20 q15 0 13 20 q-5 5 -13 2 q-8 3 -13 -2 z" fill="#d97706" />
      <path d="M-9 -4 q2 8 0 12 M9 -4 q-2 8 0 12" stroke="#b45309" strokeWidth={1.5} fill="none" />
    </g>
  ),
  bag: (
    <g>
      <path d="M-14 -4 q0 -8 6 -8 h16 q6 0 6 8 v16 h-28 z" fill="#7f1d1d" />
      <path d="M-5 -12 q5 -8 10 0" fill="none" stroke={DARK} strokeWidth={2.5} />
      <rect x={-14} y={2} width={28} height={2} fill="#fbbf24" />
    </g>
  ),
  basket: (
    <g>
      <path d="M-14 -4 h28 l-3 16 h-22 z" fill="#ca8a04" />
      <path d="M-13 2 h26 M-12 8 h24" stroke="#a16207" strokeWidth={1.5} />
      <path d="M-8 -4 q8 -14 16 0" fill="none" stroke="#a16207" strokeWidth={2} />
    </g>
  ),
}

interface Props {
  palette: { wall: string; floor: string; trim: string }
  objects: SceneObject[]
  examined: ReadonlySet<string>
  selected?: string
  onExamine: (id: string) => void
  disabled?: boolean
}

export default function Scene({ palette, objects, examined, selected, onExamine, disabled }: Props) {
  return (
    <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="w-full h-auto rounded-xl border border-line select-none"
      role="group" aria-label="The scene">
      <rect x={0} y={0} width={SCENE_W} height={SCENE_H * 0.55} fill={palette.wall} />
      <rect x={0} y={SCENE_H * 0.55} width={SCENE_W} height={SCENE_H * 0.45} fill={palette.floor} />
      <rect x={0} y={SCENE_H * 0.55 - 3} width={SCENE_W} height={6} fill={palette.trim} />
      {objects.map(o => {
        const seen = examined.has(o.id)
        const ring = o.id === selected ? '#f59e0b' : seen && o.clue ? '#fbbf24' : seen ? '#94a3b8' : 'transparent'
        return (
          <g key={o.id} transform={`translate(${o.x} ${o.y})`} role="button" tabIndex={disabled ? -1 : 0}
            aria-label={`Examine ${o.name}`} aria-pressed={seen}
            style={{ cursor: disabled ? 'default' : 'pointer', outline: 'none' }}
            onClick={() => !disabled && onExamine(o.id)}
            onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onExamine(o.id) } }}>
            <circle r={22 * o.size} fill={ring === 'transparent' ? 'transparent' : ring} opacity={0.18} />
            <circle r={22 * o.size} fill="none" stroke={ring} strokeWidth={2} strokeDasharray={seen && !o.clue ? '4 3' : undefined} />
            <g transform={`scale(${o.size})`}>{GLYPHS[o.glyph]}</g>
          </g>
        )
      })}
    </svg>
  )
}
