import { useRef, useState, type ReactNode } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Geometry: a construction game.  Each config is an SVG figure with one or
// two draggable handles.  Dragging reshapes the figure and the GIVEN
// quantities update live; the quantity the player must achieve is stated as
// the goal but never displayed, so they have to reason it out, then press
// "Set in stone" to check.  Handles snap to integer/grid values so every
// target is exactly reachable.  Difficulty tightens the tolerance, cuts the
// misses allowed, adds a countdown from tier 3 and hides the readout labels
// at tier 4 (the colour dot still ties each value to its handle).

export type Params = Record<string, number>
export interface ParamDef { key: string; min: number; max: number; step: number }
export interface Handle {
  pos: (p: Params) => [number, number]
  /** Raw (unsnapped) values for the params this handle drives. */
  drag: (x: number, y: number, p: Params) => Partial<Params>
}
export interface Readout { label: string; value: (p: Params) => number; unit?: string; param?: string; handle?: number }
export interface GeometryConfig {
  title: string
  goal: string
  explanation: string
  params: ParamDef[]
  valid?: (p: Params) => boolean
  handles: Handle[]
  given: Readout[]
  hidden: (p: Params) => number
  hiddenLabel: string
  target: number
  unit?: string
  /** Allowed |hidden − target| per difficulty tier. */
  tol: readonly [number, number, number, number]
  draw: (p: Params) => ReactNode
}

export const VW = 240
export const VH = 200
const INK = '#2a2117', ACCENT = '#9b2c23', MUTED = '#8a7a5e', LINE = '#cdbd9a', PANEL = '#fbf6ea'
export const HANDLE_COLOURS = [ACCENT, INK]
const D = Math.PI / 180
const deg = (rad: number) => rad / D
const sin = (a: number) => Math.sin(a * D), cos = (a: number) => Math.cos(a * D), tan = (a: number) => Math.tan(a * D)
const PI = 3.14

// ── SVG helpers ────────────────────────────────────────────────────────────────

/** Arc path from angle a0 to a1 (degrees, counter-clockwise from +x on screen). */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const pt = (a: number) => `${cx + r * cos(a)} ${cy - r * sin(a)}`
  return `M ${pt(a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 0 ${pt(a1)}`
}
const Arc = ({ cx, cy, r, a0, a1, color = MUTED }: { cx: number; cy: number; r: number; a0: number; a1: number; color?: string }) =>
  <path d={arcPath(cx, cy, r, a0, a1)} fill="none" stroke={color} strokeWidth={1.5} />
const Txt = ({ x, y, children, color = INK, size = 11, anchor = 'middle', bold }: { x: number; y: number; children: ReactNode; color?: string; size?: number; anchor?: 'start' | 'middle' | 'end'; bold?: boolean }) =>
  <text x={x} y={y} fill={color} fontSize={size} textAnchor={anchor} fontWeight={bold ? 700 : 400}>{children}</text>
const Dash = ({ x1, y1, x2, y2, color = MUTED }: { x1: number; y1: number; x2: number; y2: number; color?: string }) =>
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.2} strokeDasharray="4 3" />
const poly = (pts: [number, number][]) => pts.map(q => q.join(',')).join(' ')
const Shape = ({ pts, color = INK }: { pts: [number, number][]; color?: string }) =>
  <polygon points={poly(pts)} fill={`${ACCENT}10`} stroke={color} strokeWidth={2} strokeLinejoin="round" />
const Mark = ({ x, y, children }: { x: number; y: number; children: ReactNode }) =>
  <Txt x={x} y={y} color={ACCENT} bold size={13}>{children}</Txt>

// ── Figures ────────────────────────────────────────────────────────────────────

const TB: [number, number] = [65, 175], TC: [number, number] = [175, 175]
function triApex(p: Params): [number, number] {
  const len = 110 * sin(p.C) / sin(180 - p.B - p.C)
  return [TB[0] + len * cos(p.B), TB[1] - len * sin(p.B)]
}

function regularPolygon(n: number): [number, number][] {
  return Array.from({ length: n }, (_, k) => [120 + 70 * cos(90 + 360 * k / n), 95 - 70 * sin(90 + 360 * k / n)])
}
const railX = (n: number) => 40 + (n - 3) * 160 / 9
const polygonConfig = (title: string, goal: string, explanation: string, target: number): GeometryConfig => ({
  title, goal, explanation,
  params: [{ key: 'n', min: 3, max: 12, step: 1 }],
  handles: [{ pos: p => [railX(p.n), 185], drag: x => ({ n: 3 + (x - 40) * 9 / 160 }) }],
  given: [{ label: 'sides n', value: p => p.n, param: 'n', handle: 0 }],
  hidden: p => (p.n - 2) * 180 / p.n, hiddenLabel: 'interior angle', target, unit: '°',
  tol: [3, 2, 1, 0.5],
  draw: p => {
    const v = regularPolygon(p.n)
    const a1 = deg(Math.atan2(v[0][1] - v[1][1], v[1][0] - v[0][0]))
    const a2 = deg(Math.atan2(v[0][1] - v[p.n - 1][1], v[p.n - 1][0] - v[0][0]))
    return <>
      <Shape pts={v} />
      <Arc cx={v[0][0]} cy={v[0][1]} r={16} a0={a1} a1={a2 + 360} color={ACCENT} />
      <Mark x={120} y={52}>?°</Mark>
      <line x1={40} y1={185} x2={200} y2={185} stroke={LINE} strokeWidth={3} strokeLinecap="round" />
      {Array.from({ length: 10 }, (_, i) => <line key={i} x1={railX(i + 3)} y1={181} x2={railX(i + 3)} y2={189} stroke={MUTED} strokeWidth={1} />)}
    </>
  },
})

const cot = (a: number) => 1 / tan(a)

export const CONFIGS: Record<string, GeometryConfig> = {
  'triangle-sum': {
    title: 'Angles in a Triangle',
    goal: 'Drag the apex until the top angle A is exactly 50°. Only the two base angles are shown.',
    explanation: '70° + 60° + x = 180° → x = 50°. Angles in any triangle always add to 180°.',
    params: [{ key: 'B', min: 10, max: 130, step: 1 }, { key: 'C', min: 10, max: 130, step: 1 }],
    valid: p => p.B + p.C <= 140,
    handles: [{ pos: triApex, drag: (x, y) => ({ B: deg(Math.atan2(TB[1] - y, x - TB[0])), C: deg(Math.atan2(TC[1] - y, TC[0] - x)) }) }],
    given: [{ label: '∠B', value: p => p.B, unit: '°', param: 'B', handle: 0 }, { label: '∠C', value: p => p.C, unit: '°', param: 'C', handle: 0 }],
    hidden: p => 180 - p.B - p.C, hiddenLabel: '∠A', target: 50, unit: '°',
    tol: [2, 1, 1, 0],
    draw: p => {
      const A = triApex(p)
      return <>
        <Shape pts={[TB, TC, A]} />
        <Arc cx={TB[0]} cy={TB[1]} r={16} a0={0} a1={p.B} />
        <Arc cx={TC[0]} cy={TC[1]} r={16} a0={180 - p.C} a1={180} />
        <Txt x={TB[0] - 8} y={TB[1] + 14}>B</Txt><Txt x={TC[0] + 8} y={TC[1] + 14}>C</Txt>
        <Mark x={A[0]} y={A[1] - 12}>A = ?</Mark>
      </>
    },
  },
  'pythagorean': {
    title: 'The Pythagorean Theorem',
    goal: 'Drag the corner across the grid to build a right triangle whose hypotenuse is exactly 5. Only the two legs are shown.',
    explanation: 'a² + b² = c² → 3² + 4² = 9 + 16 = 25 → c = 5. This 3-4-5 triple is the oldest known right triangle.',
    params: [{ key: 'a', min: 1, max: 12, step: 1 }, { key: 'b', min: 1, max: 12, step: 1 }],
    handles: [{ pos: p => [40 + 11 * p.a, 170 - 11 * p.b], drag: (x, y) => ({ a: (x - 40) / 11, b: (170 - y) / 11 }) }],
    given: [{ label: 'leg a', value: p => p.a, param: 'a', handle: 0 }, { label: 'leg b', value: p => p.b, param: 'b', handle: 0 }],
    hidden: p => Math.hypot(p.a, p.b), hiddenLabel: 'hypotenuse c', target: 5,
    tol: [0.01, 0.01, 0.01, 0.001],
    draw: p => {
      const X: [number, number] = [40 + 11 * p.a, 170], V: [number, number] = [X[0], 170 - 11 * p.b]
      return <>
        {Array.from({ length: 13 }, (_, i) => <g key={i}>
          <line x1={40 + 11 * i} y1={38} x2={40 + 11 * i} y2={170} stroke={LINE} strokeWidth={0.6} />
          <line x1={40} y1={170 - 11 * i} x2={172} y2={170 - 11 * i} stroke={LINE} strokeWidth={0.6} />
        </g>)}
        <Shape pts={[[40, 170], X, V]} />
        <polyline points={`${X[0] - 7},170 ${X[0] - 7},163 ${X[0]},163`} fill="none" stroke={INK} strokeWidth={1.2} />
        <Txt x={(40 + X[0]) / 2} y={184}>a</Txt>
        <Txt x={X[0] + 9} y={(X[1] + V[1]) / 2 + 4} anchor="start">b</Txt>
        <Mark x={(40 + V[0]) / 2 - 10} y={(170 + V[1]) / 2 - 6}>c = ?</Mark>
      </>
    },
  },
  'parallel-lines': {
    title: 'Alternate Interior Angles',
    goal: 'Drag the transversal until the alternate interior angle x is 65°. Only the angle at the top crossing is shown.',
    explanation: 'Alternate interior angles are equal when lines are parallel. x = 65°.',
    params: [{ key: 't', min: 25, max: 155, step: 1 }],
    handles: [{ pos: p => [120 + 40 * cot(p.t), 60], drag: x => ({ t: deg(Math.atan2(40, x - 120)) }) }],
    given: [{ label: 'top angle', value: p => 180 - p.t, unit: '°', param: 't', handle: 0 }],
    hidden: p => p.t, hiddenLabel: 'x', target: 65, unit: '°',
    tol: [2, 1, 1, 0],
    draw: p => {
      const tx = 120 + 40 * cot(p.t), bx = 120 - 40 * cot(p.t), dx = 28 * cos(p.t), dy = 28 * sin(p.t)
      return <>
        <line x1={20} y1={60} x2={220} y2={60} stroke={INK} strokeWidth={2} />
        <line x1={20} y1={140} x2={220} y2={140} stroke={INK} strokeWidth={2} />
        <Txt x={24} y={56} color={MUTED} size={9}>∥</Txt><Txt x={24} y={136} color={MUTED} size={9}>∥</Txt>
        <line x1={bx - dx} y1={140 + dy} x2={tx + dx} y2={60 - dy} stroke={ACCENT} strokeWidth={2} />
        <Arc cx={tx} cy={60} r={18} a0={p.t} a1={180} />
        <Arc cx={bx} cy={140} r={18} a0={0} a1={p.t} color={ACCENT} />
        <Mark x={bx + 26} y={136 - 8 * sin(p.t / 2)}>x</Mark>
      </>
    },
  },
  'pentagon-interior': polygonConfig(
    'Interior Angles of a Pentagon',
    'Slide the rail to change the number of sides until each interior angle of the regular polygon is 108°.',
    'Sum of interior angles = (5-2) × 180° = 540°. Each angle = 540° ÷ 5 = 108°.',
    108,
  ),
  'hexagon-interior': polygonConfig(
    'Interior Angles of a Hexagon',
    'Slide the rail to change the number of sides until each interior angle of the regular polygon is 120° — the honeycomb angle.',
    'Sum of interior angles = (6-2) × 180° = 720°. Each angle = 720° ÷ 6 = 120°. That\'s why hexagons tile perfectly!',
    120,
  ),
  'circle-circumference': {
    title: 'Circumference of a Circle',
    goal: 'Drag the rim to set the radius so the track\'s circumference is 44 m (use π ≈ 22/7). Only r is shown.',
    explanation: 'C = 2πr = 2 × (22/7) × 7 = 44 metres. Circumference is the distance around a circle.',
    params: [{ key: 'r', min: 1, max: 20, step: 1 }],
    handles: [{ pos: p => [120 + 4 * p.r * cos(30), 100 - 4 * p.r * sin(30)], drag: (x, y) => ({ r: Math.hypot(x - 120, y - 100) / 4 }) }],
    given: [{ label: 'r', value: p => p.r, unit: ' m', param: 'r', handle: 0 }],
    hidden: p => 2 * (22 / 7) * p.r, hiddenLabel: 'C', target: 44, unit: ' m',
    tol: [0.5, 0.5, 0.1, 0.01],
    draw: p => <>
      <circle cx={120} cy={100} r={4 * p.r} fill={`${ACCENT}10`} stroke={INK} strokeWidth={2} />
      <Dash x1={120} y1={100} x2={120 + 4 * p.r * cos(30)} y2={100 - 4 * p.r * sin(30)} />
      <circle cx={120} cy={100} r={2} fill={INK} />
      <Txt x={120} y={100 + 4 * p.r + 16} color={MUTED}>C = ?</Txt>
    </>,
  },
  'sphere-surface': {
    title: 'Surface Area of a Sphere',
    goal: 'Drag the equator to set the radius so the globe\'s surface area is 314 (use π ≈ 3.14). Only r is shown.',
    explanation: 'Surface area of a sphere = 4πr². Volume = (4/3)πr³. Magellan\'s route covered roughly half the globe\'s surface.',
    params: [{ key: 'r', min: 1, max: 15, step: 1 }],
    handles: [{ pos: p => [120 + 5 * p.r, 100], drag: x => ({ r: (x - 120) / 5 }) }],
    given: [{ label: 'r', value: p => p.r, param: 'r', handle: 0 }],
    hidden: p => 4 * PI * p.r * p.r, hiddenLabel: 'surface area', target: 314,
    tol: [5, 3, 1, 0.01],
    draw: p => <>
      <circle cx={120} cy={100} r={5 * p.r} fill={`${ACCENT}10`} stroke={INK} strokeWidth={2} />
      <ellipse cx={120} cy={100} rx={5 * p.r} ry={1.5 * p.r} fill="none" stroke={MUTED} strokeWidth={1.2} strokeDasharray="4 3" />
      <ellipse cx={120} cy={100} rx={1.5 * p.r} ry={5 * p.r} fill="none" stroke={MUTED} strokeWidth={1.2} strokeDasharray="4 3" />
      <Dash x1={120} y1={100} x2={120 + 5 * p.r} y2={100} color={ACCENT} />
      <circle cx={120} cy={100} r={2} fill={INK} />
    </>,
  },
  'golden-ratio': {
    title: 'The Golden Ratio',
    goal: 'Slide the cut along the 34-unit segment so that whole : long equals long : short — the golden section. Both parts are shown.',
    explanation: 'φ = (1+√5)/2 ≈ 1.618. Renaissance artists used the golden ratio in composition. It appears in spirals, pentagons, and plant growth.',
    params: [{ key: 'L', min: 1, max: 33, step: 1 }],
    handles: [{ pos: p => [20 + p.L * 200 / 34, 100], drag: x => ({ L: (x - 20) * 34 / 200 }) }],
    given: [{ label: 'long (left)', value: p => p.L, param: 'L', handle: 0 }, { label: 'short (right)', value: p => 34 - p.L, param: 'L', handle: 0 }],
    hidden: p => 34 / p.L - p.L / (34 - p.L), hiddenLabel: 'whole:long − long:short', target: 0,
    tol: [0.05, 0.04, 0.03, 0.02],
    draw: p => {
      const cx = 20 + p.L * 200 / 34
      return <>
        <line x1={20} y1={100} x2={220} y2={100} stroke={INK} strokeWidth={3} strokeLinecap="round" />
        {Array.from({ length: 35 }, (_, i) => <line key={i} x1={20 + i * 200 / 34} y1={97} x2={20 + i * 200 / 34} y2={103} stroke={PANEL} strokeWidth={1} />)}
        <path d={`M 20 70 V 64 H 220 V 70`} fill="none" stroke={MUTED} strokeWidth={1} />
        <Txt x={120} y={58} color={MUTED} size={10}>whole = 34</Txt>
        <path d={`M 20 130 V 136 H ${cx - 4} V 130 M ${cx + 4} 130 V 136 H 220 V 130`} fill="none" stroke={MUTED} strokeWidth={1} />
        <Txt x={(20 + cx) / 2} y={150} size={10}>long</Txt><Txt x={(cx + 220) / 2} y={150} size={10}>short</Txt>
      </>
    },
  },
  'right-triangle-angle': {
    title: 'Missing Angle in a Right Triangle',
    goal: 'Drag the far corner along the ground until the angle at that corner is 53°. Only the angle at the top is shown.',
    explanation: '37° + 90° + x = 180° → x = 53°. The right angle accounts for 90° of the triangle\'s 180°.',
    params: [{ key: 't', min: 10, max: 80, step: 1 }],
    handles: [{ pos: p => [50 + 140 * sin(p.t), 170], drag: x => ({ t: deg(Math.asin(Math.min(1, Math.max(0, (x - 50) / 140)))) }) }],
    given: [{ label: 'top angle', value: p => p.t, unit: '°', param: 't', handle: 0 }],
    hidden: p => 90 - p.t, hiddenLabel: 'x', target: 53, unit: '°',
    tol: [2, 1, 1, 0],
    draw: p => {
      const X: [number, number] = [50 + 140 * sin(p.t), 170], Y: [number, number] = [50, 170 - 140 * cos(p.t)]
      return <>
        <Shape pts={[[50, 170], X, Y]} />
        <polyline points="50,162 58,162 58,170" fill="none" stroke={INK} strokeWidth={1.2} />
        <Arc cx={Y[0]} cy={Y[1]} r={16} a0={270} a1={270 + p.t} />
        <Arc cx={X[0]} cy={X[1]} r={16} a0={90 + p.t} a1={180} color={ACCENT} />
        <Mark x={X[0] - 30} y={X[1] - 8}>x</Mark>
      </>
    },
  },
  'volume-pyramid': {
    title: 'Volume of a Pyramid',
    goal: 'Raise or lower the apex until the pyramid holds 2,592,100 m³ of stone (V = ⅓ × base² × h, base 230 m). Only h is shown.',
    explanation: 'V = (1/3) × 230² × 147 ≈ 2.59 million m³. That\'s enough stone to build a wall 1m thick around France.',
    params: [{ key: 'h', min: 50, max: 250, step: 1 }],
    handles: [{ pos: p => [130, 160 - 0.46 * p.h], drag: (_x, y) => ({ h: (160 - y) / 0.46 }) }],
    given: [{ label: 'h', value: p => p.h, unit: ' m', param: 'h', handle: 0 }],
    hidden: p => 230 * 230 * p.h / 3, hiddenLabel: 'V', target: 230 * 230 * 147 / 3, unit: ' m³',
    tol: [60000, 30000, 18000, 1],
    draw: p => {
      const ap: [number, number] = [130, 160 - 0.46 * p.h]
      return <>
        <Dash x1={60} y1={150} x2={220} y2={150} /><Dash x1={60} y1={150} x2={40} y2={170} />
        <Shape pts={[[40, 170], [200, 170], ap]} />
        <line x1={200} y1={170} x2={220} y2={150} stroke={INK} strokeWidth={2} />
        <line x1={220} y1={150} x2={ap[0]} y2={ap[1]} stroke={INK} strokeWidth={2} />
        <Dash x1={60} y1={150} x2={ap[0]} y2={ap[1]} />
        <Dash x1={130} y1={160} x2={ap[0]} y2={ap[1]} color={ACCENT} />
        <Txt x={120} y={186} color={MUTED} size={10}>base 230 m</Txt>
        <Txt x={140} y={(160 + ap[1]) / 2} anchor="start" color={ACCENT}>h</Txt>
      </>
    },
  },
  'anaxagoras-shadow': {
    title: 'Measuring the Sun',
    goal: 'Drag the sun until the 2 m post casts a shadow exactly 10 m long. Only the sun\'s angle above the horizon is shown.',
    explanation: 'tan θ = 2/10 → θ ≈ 11.3°. Anaxagoras was the first to claim the sun was a fiery rock larger than the Peloponnese — a revolutionary idea that got him exiled from Athens.',
    params: [{ key: 'e', min: 5, max: 45, step: 0.1 }],
    handles: [{ pos: p => [150 + 80 * cos(p.e), 120 - 80 * sin(p.e)], drag: (x, y) => ({ e: deg(Math.atan2(120 - y, x - 150)) }) }],
    given: [{ label: 'sun angle θ', value: p => p.e, unit: '°', param: 'e', handle: 0 }],
    hidden: p => 2 / tan(p.e), hiddenLabel: 'shadow', target: 10, unit: ' m',
    tol: [0.3, 0.2, 0.1, 0.05],
    draw: p => {
      const len = 20 * 2 / tan(p.e), clipped = len > 138, tip = clipped ? 12 : 150 - len
      const sun: [number, number] = [150 + 80 * cos(p.e), 120 - 80 * sin(p.e)]
      return <>
        <line x1={10} y1={160} x2={230} y2={160} stroke={INK} strokeWidth={2} />
        <line x1={tip} y1={160} x2={150} y2={160} stroke={MUTED} strokeWidth={5} strokeLinecap={clipped ? 'butt' : 'round'} />
        <Dash x1={sun[0]} y1={sun[1]} x2={tip} y2={160} color={ACCENT} />
        <line x1={150} y1={160} x2={150} y2={120} stroke={INK} strokeWidth={4} strokeLinecap="round" />
        <Txt x={156} y={142} anchor="start" size={10}>2 m</Txt>
        <circle cx={sun[0]} cy={sun[1]} r={13} fill={`${ACCENT}22`} stroke={ACCENT} strokeWidth={1} />
        {!clipped && <Arc cx={tip} cy={160} r={22} a0={0} a1={p.e} color={ACCENT} />}
        <Txt x={clipped ? 20 : tip + 4} y={178} anchor="start" color={MUTED} size={10}>{clipped ? 'shadow runs off the page…' : 'shadow = ?'}</Txt>
      </>
    },
  },
  'discus-angle': {
    title: 'The Olympic Discus',
    goal: 'Drag the release arm and watch the range. Lock in the angle that throws the discus the furthest — the angle itself is not shown.',
    explanation: '45° gives maximum range on flat ground (ignoring air resistance). The ancient Greeks discovered this empirically — Olympian discus throwers trained at this exact angle.',
    params: [{ key: 'a', min: 5, max: 85, step: 1 }],
    handles: [{ pos: p => [40 + 55 * cos(p.a), 160 - 55 * sin(p.a)], drag: (x, y) => ({ a: deg(Math.atan2(160 - y, x - 40)) }) }],
    given: [{ label: 'range', value: p => Math.round(100 * 625 * sin(2 * p.a) / 9.8) / 100, unit: ' m', param: 'a' }],
    hidden: p => p.a, hiddenLabel: 'release angle', target: 45, unit: '°',
    tol: [3, 2, 1, 0],
    draw: p => {
      const R = 625 * sin(2 * p.a) / 9.8, hmax = 625 * sin(p.a) * sin(p.a) / 19.6
      return <>
        <line x1={20} y1={160} x2={225} y2={160} stroke={INK} strokeWidth={2} />
        <path d={`M 40 160 Q ${40 + 1.25 * R} ${160 - 5 * hmax} ${40 + 2.5 * R} 160`} fill="none" stroke={MUTED} strokeWidth={1.2} strokeDasharray="4 3" />
        <line x1={40} y1={160} x2={40 + 55 * cos(p.a)} y2={160 - 55 * sin(p.a)} stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" />
        <Arc cx={40} cy={160} r={22} a0={0} a1={p.a} />
        <polygon points={`${40 + 2.5 * R - 4},160 ${40 + 2.5 * R + 4},160 ${40 + 2.5 * R},153`} fill={ACCENT} />
        <Txt x={40 + 2.5 * R} y={176} size={10} color={MUTED}>landing</Txt>
      </>
    },
  },
  'cylinder-volume': {
    title: 'Volume of a Cylinder',
    goal: 'Drag the rim and the lid to shape a cylinder holding exactly 282.6 cm³ (use π ≈ 3.14). Only r and h are shown.',
    explanation: 'V = πr²h = 3.14 × 9 × 10 = 282.6 cm³. Lorentz used similar calculations for the volume swept by a moving particle in space-time.',
    params: [{ key: 'r', min: 1, max: 10, step: 1 }, { key: 'h', min: 1, max: 20, step: 1 }],
    handles: [
      { pos: p => [120 + 8 * p.r, 165], drag: x => ({ r: (x - 120) / 8 }) },
      { pos: p => [120, 165 - 6 * p.h], drag: (_x, y) => ({ h: (165 - y) / 6 }) },
    ],
    given: [{ label: 'r', value: p => p.r, unit: ' cm', param: 'r', handle: 0 }, { label: 'h', value: p => p.h, unit: ' cm', param: 'h', handle: 1 }],
    hidden: p => PI * p.r * p.r * p.h, hiddenLabel: 'V', target: 282.6, unit: ' cm³',
    tol: [10, 5, 2, 0.01],
    draw: p => {
      const rx = 8 * p.r, ry = 2.4 * p.r, top = 165 - 6 * p.h
      return <>
        <path d={`M ${120 - rx} ${top} V 165 A ${rx} ${ry} 0 0 0 ${120 + rx} 165 V ${top}`} fill={`${ACCENT}10`} stroke={INK} strokeWidth={2} />
        <ellipse cx={120} cy={top} rx={rx} ry={ry} fill={PANEL} stroke={INK} strokeWidth={2} />
        <Dash x1={120} y1={165} x2={120 + rx} y2={165} color={ACCENT} />
        <Dash x1={120 - rx - 10} y1={165} x2={120 - rx - 10} y2={top} />
        <Txt x={120 - rx - 14} y={(165 + top) / 2 + 4} anchor="end">h</Txt>
        <Txt x={120 + rx / 2} y={178} size={10} color={ACCENT}>r</Txt>
      </>
    },
  },
  'ellipse-area': {
    title: 'Area of an Ellipse',
    goal: 'Drag the two axis ends until the ellipse encloses an area of exactly 125.6 (use π ≈ 3.14). Only a and b are shown.',
    explanation: 'A = πab = 3.14 × 8 × 5 = 125.6. Earth\'s orbit is an ellipse with the Sun at one focus — Earhart\'s transatlantic route curved with the planet\'s own elliptical path.',
    params: [{ key: 'a', min: 1, max: 12, step: 1 }, { key: 'b', min: 1, max: 12, step: 1 }],
    handles: [
      { pos: p => [120 + 8 * p.a, 100], drag: x => ({ a: (x - 120) / 8 }) },
      { pos: p => [120, 100 - 7 * p.b], drag: (_x, y) => ({ b: (100 - y) / 7 }) },
    ],
    given: [{ label: 'a', value: p => p.a, param: 'a', handle: 0 }, { label: 'b', value: p => p.b, param: 'b', handle: 1 }],
    hidden: p => PI * p.a * p.b, hiddenLabel: 'A', target: 125.6,
    tol: [5, 3, 1, 0.01],
    draw: p => <>
      <ellipse cx={120} cy={100} rx={8 * p.a} ry={7 * p.b} fill={`${ACCENT}10`} stroke={INK} strokeWidth={2} />
      <Dash x1={120} y1={100} x2={120 + 8 * p.a} y2={100} color={ACCENT} />
      <Dash x1={120} y1={100} x2={120} y2={100 - 7 * p.b} />
      <circle cx={120} cy={100} r={2} fill={INK} />
      <Txt x={120 + 4 * p.a} y={112} size={10} color={ACCENT}>a</Txt>
      <Txt x={112} y={100 - 3.5 * p.b} size={10} anchor="end">b</Txt>
    </>,
  },
  'cone-surface': {
    title: 'Surface Area of a Cone',
    goal: 'Drag the rim and the peak to pitch a conical tent with total surface area 31.4 m² (πrl + πr², π ≈ 3.14). Only r and the slant l are shown.',
    explanation: 'SA = πrl + πr² = (3.14 × 2 × 3) + (3.14 × 4) = 18.84 + 12.56 = 31.40 m². Hillary and Tenzing\'s summit camp was a conical tent clinging to the South Col — every square metre of shelter calculated precisely against the wind.',
    params: [{ key: 'r', min: 1, max: 8, step: 1 }, { key: 'l', min: 2, max: 12, step: 1 }],
    valid: p => p.l > p.r,
    handles: [
      { pos: p => [120 + 10 * p.r, 165], drag: x => ({ r: (x - 120) / 10 }) },
      { pos: p => [120, 165 - 10 * Math.sqrt(p.l * p.l - p.r * p.r)], drag: (_x, y, p) => ({ l: Math.hypot(p.r, (165 - y) / 10) }) },
    ],
    given: [{ label: 'r', value: p => p.r, unit: ' m', param: 'r', handle: 0 }, { label: 'slant l', value: p => p.l, unit: ' m', param: 'l', handle: 1 }],
    hidden: p => PI * p.r * (p.r + p.l), hiddenLabel: 'surface area', target: 31.4, unit: ' m²',
    tol: [1.5, 1, 0.5, 0.01],
    draw: p => {
      const rx = 10 * p.r, top = 165 - 10 * Math.sqrt(p.l * p.l - p.r * p.r)
      return <>
        <path d={`M ${120 - rx} 165 L 120 ${top} L ${120 + rx} 165 A ${rx} ${0.3 * rx} 0 0 0 ${120 - rx} 165`} fill={`${ACCENT}10`} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
        <path d={`M ${120 - rx} 165 A ${rx} ${0.3 * rx} 0 0 1 ${120 + rx} 165`} fill="none" stroke={MUTED} strokeWidth={1.2} strokeDasharray="4 3" />
        <Dash x1={120} y1={165} x2={120 + rx} y2={165} color={ACCENT} />
        <Dash x1={120} y1={165} x2={120} y2={top} />
        <Txt x={120 + rx / 2 + 4} y={(165 + top) / 2} anchor="start">l</Txt>
        <Txt x={120 + rx / 2} y={178} size={10} color={ACCENT}>r</Txt>
      </>
    },
  },
  'cube-diagonal': {
    title: 'Diagonal of a Cube',
    goal: 'Drag the far corner to grow or shrink the cube until its space diagonal — corner to opposite corner — is 4√3 ≈ 6.93. Only the side is shown.',
    explanation: 'd = s√3 = 4√3 ≈ 6.93. The Gilded Age\'s great buildings — Carnegie\'s steel structures, Vanderbilt\'s palaces — used precise spatial geometry in every beam and diagonal.',
    params: [{ key: 's', min: 1, max: 12, step: 1 }],
    handles: [{ pos: p => [50 + 12.6 * p.s, 170 - 12.6 * p.s], drag: (x, y) => ({ s: ((x - 50) + (170 - y)) / 25.2 }) }],
    given: [{ label: 'side s', value: p => p.s, param: 's', handle: 0 }],
    hidden: p => p.s * Math.sqrt(3), hiddenLabel: 'd', target: 4 * Math.sqrt(3),
    tol: [0.5, 0.3, 0.1, 0.01],
    draw: p => {
      const e = 9 * p.s, d = 3.6 * p.s, x0 = 50, y0 = 170
      const F: [number, number][] = [[x0, y0], [x0 + e, y0], [x0 + e, y0 - e], [x0, y0 - e]]
      const B: [number, number][] = F.map(([x, y]) => [x + d, y - d])
      return <>
        <polygon points={poly(B)} fill="none" stroke={MUTED} strokeWidth={1.2} strokeDasharray="4 3" />
        <Dash x1={F[0][0]} y1={F[0][1]} x2={B[0][0]} y2={B[0][1]} />
        <Shape pts={F} />
        {[1, 2, 3].map(i => <line key={i} x1={F[i][0]} y1={F[i][1]} x2={B[i][0]} y2={B[i][1]} stroke={INK} strokeWidth={2} />)}
        <line x1={F[0][0]} y1={F[0][1]} x2={B[2][0]} y2={B[2][1]} stroke={ACCENT} strokeWidth={2} />
        <Txt x={x0 + e / 2} y={y0 + 14} size={10}>s</Txt>
        <Mark x={(F[0][0] + B[2][0]) / 2 - 12} y={(F[0][1] + B[2][1]) / 2 - 6}>d = ?</Mark>
      </>
    },
  },
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Pure helpers (exported for the solvability audit) ──────────────────────────

const decimals = (step: number) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
export function snap(raw: number, def: ParamDef): number {
  const v = def.min + Math.round((raw - def.min) / def.step) * def.step
  return Number(Math.min(def.max, Math.max(def.min, v)).toFixed(decimals(def.step)))
}
export const tolerance = (cfg: GeometryConfig, difficulty: Difficulty) => scale(difficulty, cfg.tol)
export const isValid = (cfg: GeometryConfig, p: Params) => !cfg.valid || cfg.valid(p)
export const isWin = (cfg: GeometryConfig, p: Params, difficulty: Difficulty) =>
  Math.abs(cfg.hidden(p) - cfg.target) <= tolerance(cfg, difficulty) + 1e-9

/** Move handle `idx` to (x, y): snaps the params it drives and rejects invalid shapes. */
export function applyDrag(cfg: GeometryConfig, p: Params, idx: number, x: number, y: number): Params {
  const raw = cfg.handles[idx].drag(x, y, p)
  const next = { ...p }
  for (const def of cfg.params) if (raw[def.key] !== undefined && Number.isFinite(raw[def.key])) next[def.key] = snap(raw[def.key]!, def)
  return isValid(cfg, next) ? next : p
}

export function nudge(cfg: GeometryConfig, p: Params, key: string, dir: 1 | -1): Params {
  const def = cfg.params.find(d => d.key === key)
  if (!def) return p
  const next = { ...p, [key]: snap(p[key] + dir * def.step, def) }
  return isValid(cfg, next) ? next : p
}

/** Seeded start: a valid shape that is clearly not a win, so the player must act. */
export function startParams(cfg: GeometryConfig, seed: number): Params {
  const rng = mulberry32(seed)
  const margin = cfg.tol[0] * 1.5 + 1e-9
  for (let i = 0; i < 200; i++) {
    const p: Params = {}
    for (const d of cfg.params) p[d.key] = snap(d.min + rng() * (d.max - d.min), d)
    if (isValid(cfg, p) && Math.abs(cfg.hidden(p) - cfg.target) > margin) return p
  }
  return Object.fromEntries(cfg.params.map(d => [d.key, d.min]))
}

export const fmt = (v: number) => String(Number(v.toFixed(2)))

// ── Component ──────────────────────────────────────────────────────────────────

export default function GeometryGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'triangle-sum')
  const missLimit = scale(difficulty, [3, 2, 2, 1])
  const timeLimit = scale(difficulty, [0, 0, 90, 60])
  const hideLabels = difficulty === 4
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1000 })
  const timer = useGameTimer({ seconds: timeLimit, running: !settled, onExpire: () => lose('out of time') })
  const [p, setP] = useState(() => startParams(cfg, seed))
  const [misses, setMisses] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const active = useRef<number | null>(null)

  const toSvg = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect()
    const sc = Math.min(rect.width / VW, rect.height / VH) || 1
    return [(e.clientX - rect.left - (rect.width - VW * sc) / 2) / sc, (e.clientY - rect.top - (rect.height - VH * sc) / 2) / sc]
  }
  const onDown = (e: React.PointerEvent) => {
    if (settled) return
    const [x, y] = toSvg(e)
    let best = -1, bestD = 30 * 30
    cfg.handles.forEach((h, i) => {
      const [hx, hy] = h.pos(p), d = (hx - x) ** 2 + (hy - y) ** 2
      if (d < bestD) { bestD = d; best = i }
    })
    if (best < 0) return
    active.current = best
    svgRef.current?.setPointerCapture?.(e.pointerId)
    setNote(null)
    e.preventDefault()
  }
  const onMove = (e: React.PointerEvent) => {
    if (active.current === null) return
    const [x, y] = toSvg(e), idx = active.current
    setP(prev => applyDrag(cfg, prev, idx, x, y))
  }
  const onUp = () => { active.current = null }

  const check = () => {
    if (settled) return
    const diff = cfg.hidden(p) - cfg.target
    if (Math.abs(diff) <= tolerance(cfg, difficulty) + 1e-9) { setNote(null); win(); return }
    const n = misses + 1
    setMisses(n)
    if (n >= missLimit) { lose('the construction did not hold'); return }
    setNote(difficulty <= 2 ? `Not yet — ${cfg.hiddenLabel} is too ${diff > 0 ? 'large' : 'small'}.` : 'Not yet — adjust and try again.')
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-ink text-xs leading-relaxed">{cfg.goal}</p>
        </div>
        <p className={`shrink-0 text-[10px] ${misses ? 'text-red-600 font-bold' : 'text-muted'}`}>✗ {misses} / {missLimit}</p>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} className="w-full h-52 rounded-xl bg-panel border border-line"
        style={{ touchAction: 'none' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {cfg.draw(p)}
        {cfg.handles.map((h, i) => {
          const [x, y] = h.pos(p)
          return <g key={i} style={{ cursor: settled ? 'default' : 'grab' }}>
            <circle cx={x} cy={y} r={16} fill="transparent" />
            <circle cx={x} cy={y} r={7} fill={PANEL} stroke={HANDLE_COLOURS[i]} strokeWidth={3} />
          </g>
        })}
      </svg>

      <div className="flex flex-wrap gap-2">
        {cfg.given.map((g, i) => (
          <div key={i} className="flex items-center gap-1 bg-panel border border-line rounded-xl px-2 py-1 text-sm text-ink">
            {g.param && <button disabled={settled} onClick={() => setP(prev => nudge(cfg, prev, g.param!, -1))}
              className="w-7 h-7 rounded-lg text-ink-2 font-bold hover:text-accent disabled:opacity-40">−</button>}
            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: g.handle === undefined ? LINE : HANDLE_COLOURS[g.handle] }} />
            <span className="tabular-nums px-1">
              {!(hideLabels && g.handle !== undefined) && <span className="text-muted">{g.label} = </span>}
              <span className="font-bold">{fmt(g.value(p))}{g.unit ?? ''}</span>
            </span>
            {g.param && <button disabled={settled} onClick={() => setP(prev => nudge(cfg, prev, g.param!, 1))}
              className="w-7 h-7 rounded-lg text-ink-2 font-bold hover:text-accent disabled:opacity-40">+</button>}
          </div>
        ))}
      </div>

      {note && !settled && <p className="text-xs text-red-700">{note}</p>}

      <button disabled={settled} onClick={check}
        className="py-2.5 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover transition-all disabled:opacity-50">
        Set in stone
      </button>

      <OutcomeBanner outcome={outcome}
        detail={`${cfg.hiddenLabel} = ${fmt(cfg.hidden(p))}${cfg.unit ?? ''}. ${cfg.explanation}`}
        winTitle="Construction holds!" loseTitle="The construction crumbles" />
    </div>
  )
}
