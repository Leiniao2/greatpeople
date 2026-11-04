import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, shuffle, randInt, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Quipu: Inca knotted-cord records.
//
// Every pendant cord holds one number in base ten. Reading down the cord the
// knot clusters stand for thousands, hundreds and tens (n single knots = digit
// n); the units position uses a long knot of 2–9 turns, a figure-eight knot
// for one, and nothing for zero — the system Leland Locke decoded in 1912.
//
// Each config is a different job for the khipukamayuq (cord keeper):
//   read      read the highlighted cords one by one and enter each value
//   tie       tie cords that record given numbers, position by position
//   top-cord  tie each group's top cord so it equals the sum of its pendants
//   mis-tied  a quipu of groups with group totals and colour totals; exactly
//             one cord is wrong — the crossing of the broken sums finds it
//   census    total only the cords of one colour (Garcilaso's colour code)
//
// Size per difficulty (a mistake cap makes every board losable):
//                 D1 (~1 min)        D2 (~1.5 min)      D3 (~2 min)          D4 (~3 min)
//   read          3 cords ≤ 99       4 cords ≤ 999      5 cords 100–4999     6 cords 1000–9999
//   tie           3 cords ≤ 99       3 cords ≤ 999      4 cords 100–2999     5 cords 1000–9999
//   top-cord      1 group × 3 ≤ 30   2 groups × 3 ≤ 99  2 groups × 4 ≤ 499   3 groups × 3, 100–999
//   mis-tied      1 round 2×2 ≤ 30   1 round 2×3 ≤ 99   2 rounds 2×3 ≤ 199   2 rounds 3×3 ≤ 499
//   census        4 cords/2 col/1 Q  6 cords/2 col/2 Q  8 cords/3 col/2 Q    9 cords/3 col/3 Q
//   mistakes      3                  3                  3                    2

export type Kind = 'read' | 'tie' | 'top' | 'mis' | 'census'

interface QuipuConfig {
  title: string
  intro: string
  fact: string
  kind: Kind
}

export const CONFIGS: Record<string, QuipuConfig> = {
  read: {
    title: 'The Khipukamayuq’s Count',
    intro: 'Read the glowing cord and enter its number. Clusters of single knots are thousands, hundreds and tens; at the bottom a long knot of n turns is n units, a figure-eight is one.',
    fact: 'Inca cord keepers, the khipukamayuq, recorded and read the empire’s accounts on knotted cords; in 1912 Leland Locke showed that the knots record numbers in base ten by their position on the cord.',
    kind: 'read',
  },
  tie: {
    title: 'Record the Tribute',
    intro: 'Tie each cord so it records the number asked: add single knots for thousands, hundreds and tens, and turns of the long knot for units. Check each cord when it is tied.',
    fact: 'Units were tied as long knots or figure-eight knots, unlike the single knots higher up, so a reader could tell where a cord’s number ended — part of the knot code Marcia and Robert Ascher set out in “Code of the Quipu” (1981).',
    kind: 'tie',
  },
  'top-cord': {
    title: 'The Sum Cord',
    intro: 'Each group of pendants needs a top cord that records their total. Read the pendants, add them up, and tie the top cord for every group.',
    fact: 'In 1923 Leland Locke described khipus whose top cords record the sum of the pendant cords they gather — evidence that the cords were accounts, not just tallies.',
    kind: 'top',
  },
  'mis-tied': {
    title: 'The Mis-tied Cord',
    intro: 'Each group’s dark Σ cord totals its pendants, and the Σ cords at the end total each colour across the groups. One cord was tied wrong. Find it and accuse it.',
    fact: 'Many khipus hold cords that total other cords, and totals of those totals — built-in cross-checks that the Aschers catalogued in their databook of surviving khipus.',
    kind: 'mis',
  },
  census: {
    title: 'The Census by Colour',
    intro: 'A cord’s colour tells what it counts. Tap cords to look closer, then total only the cords of the colour asked.',
    fact: 'The chronicler Garcilaso de la Vega, son of an Inca princess, wrote in 1609 that khipu colours named what was counted — yellow for gold, white for silver, red for warriors.',
    kind: 'census',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Knots ──────────────────────────────────────────────────────────────────────

export const POSITIONS = 4
export const POSITION_NAMES = ['thousands', 'hundreds', 'tens', 'units'] as const

export type KnotKind = 'none' | 'single' | 'long' | 'eight'
export interface Knot { pos: number; kind: KnotKind; count: number }

/** [thousands, hundreds, tens, units] of a value in 0..9999. */
export function digitsOf(v: number): number[] {
  const n = Math.max(0, Math.min(9999, Math.floor(v)))
  return [Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10]
}

export function fromDigits(ds: readonly number[]): number {
  return ds.reduce((a, d) => a * 10 + d, 0)
}

/** The knots on a cord, one entry per decimal position, top to bottom. */
export function encode(v: number): Knot[] {
  return digitsOf(v).map((d, pos): Knot => {
    if (d === 0) return { pos, kind: 'none', count: 0 }
    if (pos < POSITIONS - 1) return { pos, kind: 'single', count: d }
    return d === 1 ? { pos, kind: 'eight', count: 1 } : { pos, kind: 'long', count: d }
  })
}

export function decode(knots: readonly Knot[]): number {
  const ds = [0, 0, 0, 0]
  for (const k of knots) ds[k.pos] = k.kind === 'none' ? 0 : k.count
  return fromDigits(ds)
}

export function describeKnot(k: Knot): string {
  if (k.kind === 'none') return 'no knot'
  if (k.kind === 'eight') return 'figure-eight'
  if (k.kind === 'long') return `long knot, ${k.count} turns`
  return `${k.count} single knot${k.count > 1 ? 's' : ''}`
}

// ── Colours ────────────────────────────────────────────────────────────────────

export type ColorKey = 'gold' | 'silver' | 'red' | 'brown' | 'green'
export const COLORS: Record<ColorKey, { hex: string; label: string; counts: string }> = {
  gold: { hex: '#c9971f', label: 'yellow', counts: 'gold' },
  silver: { hex: '#9aa0a8', label: 'white', counts: 'silver' },
  red: { hex: '#b8382a', label: 'red', counts: 'warriors' },
  brown: { hex: '#7a4a22', label: 'brown', counts: 'llamas' },
  green: { hex: '#4f7f3a', label: 'green', counts: 'maize fields' },
}
const COLOR_KEYS = Object.keys(COLORS) as ColorKey[]
const TOP_HEX = '#2b2320'

export interface Cord { value: number; color: ColorKey }

// ── Puzzles ────────────────────────────────────────────────────────────────────

export interface Tier {
  lives: number
  /** Cords (read / tie / census). */
  cords: number
  minV: number
  maxV: number
  /** top-cord: groups × pendants; mis-tied: rounds of groups × colours. */
  groups: number
  pendants: number
  rounds: number
  colors: number
  questions: number
}

export function tierFor(kind: Kind, d: Difficulty): Tier {
  const base: Tier = { lives: scale(d, [3, 3, 3, 2]), cords: 0, minV: 1, maxV: 99, groups: 0, pendants: 0, rounds: 0, colors: 0, questions: 0 }
  switch (kind) {
    case 'read': {
      const [minV, maxV] = scale(d, [[2, 99], [10, 999], [100, 4999], [1000, 9999]] as const)
      return { ...base, cords: scale(d, [3, 4, 5, 6]), minV, maxV }
    }
    case 'tie': {
      const [minV, maxV] = scale(d, [[2, 99], [10, 999], [100, 2999], [1000, 9999]] as const)
      return { ...base, cords: scale(d, [3, 3, 4, 5]), minV, maxV }
    }
    case 'top': {
      const [minV, maxV] = scale(d, [[2, 30], [10, 99], [10, 499], [100, 999]] as const)
      return { ...base, groups: scale(d, [1, 2, 2, 3]), pendants: scale(d, [3, 3, 4, 3]), minV, maxV }
    }
    case 'mis': {
      const [minV, maxV] = scale(d, [[1, 30], [5, 99], [10, 199], [10, 499]] as const)
      return { ...base, rounds: scale(d, [1, 1, 2, 2]), groups: scale(d, [2, 2, 2, 3]), colors: scale(d, [2, 3, 3, 3]), minV, maxV }
    }
    case 'census': {
      const [minV, maxV] = scale(d, [[1, 40], [5, 99], [10, 299], [10, 999]] as const)
      return { ...base, cords: scale(d, [4, 6, 8, 9]), colors: scale(d, [2, 2, 3, 3]), questions: scale(d, [1, 2, 2, 3]), minV, maxV }
    }
  }
}

/** A cross-summed quipu: groups × colours of pendants, a top per group, a total per colour. */
export interface Grid {
  colors: ColorKey[]
  /** pendants[g][c] as tied (one cord may be wrong). */
  pendants: number[][]
  tops: number[]
  totals: number[]
  /** Id of the mis-tied cord: `g{g}-top`, `g{g}-c{c}` or `t{c}`. */
  wrong: string
}

export interface Question { color: ColorKey; answer: number }

export type Puzzle =
  | { kind: 'read'; cords: Cord[] }
  | { kind: 'tie'; targets: Cord[] }
  | { kind: 'top'; groups: Cord[][] }
  | { kind: 'mis'; rounds: Grid[] }
  | { kind: 'census'; cords: Cord[]; questions: Question[] }

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/** Changes one written digit of `v` by ±1 or ±2, keeping the value ≥ 1. */
export function mistie(v: number, rng: Rng): number {
  const ds = digitsOf(v)
  const first = ds.findIndex(d => d > 0)
  for (let guard = 0; guard < 50; guard++) {
    const pos = randInt(rng, Math.max(0, first), POSITIONS - 1)
    const delta = [-2, -1, 1, 2][Math.floor(rng() * 4)]
    const nd = ds[pos] + delta
    if (nd < 0 || nd > 9) continue
    const out = [...ds]; out[pos] = nd
    const nv = fromDigits(out)
    if (nv >= 1 && nv !== v) return nv
  }
  return v + 1
}

/** Cords that, if they alone were wrong, explain every broken sum. */
export function suspects(grid: Grid): string[] {
  const badRows = grid.tops.map((t, g) => (t !== sum(grid.pendants[g]) ? g : -1)).filter(g => g >= 0)
  const badCols = grid.totals.map((t, c) => (t !== sum(grid.pendants.map(r => r[c])) ? c : -1)).filter(c => c >= 0)
  if (badRows.length === 1 && badCols.length === 1) return [`g${badRows[0]}-c${badCols[0]}`]
  if (badRows.length === 1 && badCols.length === 0) return [`g${badRows[0]}-top`]
  if (badRows.length === 0 && badCols.length === 1) return [`t${badCols[0]}`]
  return []
}

export function gridIds(grid: Grid): string[] {
  const ids: string[] = []
  grid.pendants.forEach((row, g) => { ids.push(`g${g}-top`); row.forEach((_, c) => ids.push(`g${g}-c${c}`)) })
  grid.colors.forEach((_, c) => ids.push(`t${c}`))
  return ids
}

function makeGrid(t: Tier, rng: Rng): Grid {
  const colors = shuffle(COLOR_KEYS, rng).slice(0, t.colors)
  const pendants = Array.from({ length: t.groups }, () => colors.map(() => randInt(rng, t.minV, t.maxV)))
  const tops = pendants.map(sum)
  const totals = colors.map((_, c) => sum(pendants.map(r => r[c])))
  const ids: string[] = []
  pendants.forEach((row, g) => { ids.push(`g${g}-top`); row.forEach((_, c) => ids.push(`g${g}-c${c}`)) })
  colors.forEach((_, c) => ids.push(`t${c}`))
  const wrong = ids[Math.floor(rng() * ids.length)]
  let m: RegExpMatchArray | null
  if ((m = wrong.match(/^g(\d+)-top$/))) tops[+m[1]] = mistie(tops[+m[1]], rng)
  else if ((m = wrong.match(/^g(\d+)-c(\d+)$/))) pendants[+m[1]][+m[2]] = mistie(pendants[+m[1]][+m[2]], rng)
  else if ((m = wrong.match(/^t(\d+)$/))) totals[+m[1]] = mistie(totals[+m[1]], rng)
  return { colors, pendants, tops, totals, wrong }
}

export function generate(kind: Kind, difficulty: Difficulty, seed: number): Puzzle {
  const t = tierFor(kind, difficulty)
  const rng = mulberry32((seed ^ hashString('quipu:' + kind)) >>> 0)
  const cordOf = (palette: readonly ColorKey[]): Cord => ({ value: randInt(rng, t.minV, t.maxV), color: palette[Math.floor(rng() * palette.length)] })
  switch (kind) {
    case 'read':
      return { kind, cords: Array.from({ length: t.cords }, () => cordOf(COLOR_KEYS)) }
    case 'tie':
      return { kind, targets: Array.from({ length: t.cords }, () => cordOf(COLOR_KEYS)) }
    case 'top': {
      const palette = shuffle(COLOR_KEYS, rng).slice(0, 3)
      return { kind, groups: Array.from({ length: t.groups }, () => Array.from({ length: t.pendants }, () => cordOf(palette))) }
    }
    case 'mis':
      return { kind, rounds: Array.from({ length: t.rounds }, () => makeGrid(t, rng)) }
    case 'census': {
      const palette = shuffle(COLOR_KEYS, rng).slice(0, t.colors)
      // Every colour gets at least two cords, the rest are random.
      const colors: ColorKey[] = [...palette, ...palette]
      while (colors.length < t.cords) colors.push(palette[Math.floor(rng() * palette.length)])
      const cords = shuffle(colors, rng).map(color => ({ value: randInt(rng, t.minV, t.maxV), color }))
      const asked = shuffle(palette, rng).slice(0, t.questions)
      return { kind, cords, questions: asked.map(color => ({ color, answer: sum(cords.filter(c => c.color === color).map(c => c.value)) })) }
    }
  }
}

/** The values a perfect player enters, in order (read / census / tie / top). */
export function answers(p: Puzzle): number[] {
  switch (p.kind) {
    case 'read': return p.cords.map(c => c.value)
    case 'tie': return p.targets.map(c => c.value)
    case 'top': return p.groups.map(g => sum(g.map(c => c.value)))
    case 'census': return p.questions.map(q => q.answer)
    case 'mis': return []
  }
}

// ── Drawing ────────────────────────────────────────────────────────────────────

interface DrawCord {
  id: string
  /** null = a blank cord still to be tied. */
  value: number | null
  hex: string
  role?: 'pendant' | 'top' | 'total'
  /** Leave a gap before this cord (a new group). */
  gap?: boolean
}

const KNOT_INK = '#2a1a10'

function CordGlyph({ value, x, top, sp, hex, width }: { value: number | null; x: number; top: number; sp: number; hex: string; width: number }) {
  const H = 10 * sp
  const len = POSITIONS * H + sp
  const parts: ReactElement[] = [
    <line key="c" x1={x} y1={top} x2={x} y2={top + len} stroke={hex} strokeWidth={width} strokeLinecap="round" strokeDasharray={value === null ? `${sp} ${sp}` : undefined} />,
  ]
  if (value !== null) {
    encode(value).forEach(k => {
      const cy = top + sp / 2 + k.pos * H + H / 2
      if (k.kind === 'single') {
        for (let i = 0; i < k.count; i++) {
          parts.push(<circle key={`${k.pos}-${i}`} cx={x} cy={cy - ((k.count - 1) * sp) / 2 + i * sp} r={sp * 0.42} fill={KNOT_INK} />)
        }
      } else if (k.kind === 'eight') {
        parts.push(
          <g key={`${k.pos}-8`} fill="none" stroke={KNOT_INK} strokeWidth={sp * 0.3}>
            <circle cx={x} cy={cy - sp * 0.42} r={sp * 0.42} />
            <circle cx={x} cy={cy + sp * 0.42} r={sp * 0.42} />
          </g>,
        )
      } else if (k.kind === 'long') {
        const h = k.count * sp * 0.8
        const y0 = cy - h / 2
        parts.push(<rect key={`${k.pos}-L`} x={x - sp * 0.55} y={y0} width={sp * 1.1} height={h} rx={sp * 0.5} fill={KNOT_INK} />)
        for (let i = 1; i < k.count; i++) {
          parts.push(<line key={`${k.pos}-t${i}`} x1={x - sp * 0.5} x2={x + sp * 0.5} y1={y0 + i * sp * 0.8} y2={y0 + i * sp * 0.8} stroke={hex} strokeWidth={sp * 0.18} />)
        }
      }
    })
  }
  return <>{parts}</>
}

function QuipuSvg({ cords, selected, highlight, onTap, sp = 4.4, labels = true }: {
  cords: DrawCord[]
  selected?: string | null
  highlight?: string | null
  onTap?: (id: string) => void
  sp?: number
  labels?: boolean
}) {
  const pitch = Math.max(20, sp * 4.6)
  const groupGap = pitch * 0.6
  const left = labels ? 30 : 8
  const top = 18
  const H = 10 * sp
  const len = POSITIONS * H + sp
  let x = left + pitch / 2
  const xs = cords.map((c, i) => {
    if (i > 0) x += pitch + (c.gap ? groupGap : 0)
    return x
  })
  const width = (xs.length ? xs[xs.length - 1] : left) + pitch / 2 + 6
  const height = top + len + 8
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none" style={{ maxHeight: 340 }} role="img" aria-label="quipu">
      {Array.from({ length: POSITIONS }, (_, p) => (
        <g key={p}>
          <rect x={0} y={top + sp / 2 + p * H} width={width} height={H} fill={p % 2 ? 'rgba(120,90,50,0.07)' : 'rgba(120,90,50,0.02)'} />
          {labels && <text x={3} y={top + sp / 2 + p * H + H / 2 + 3} fontSize={8} fill="currentColor" opacity={0.55}>{[1000, 100, 10, 1][p]}</text>}
        </g>
      ))}
      <line x1={left - 4} x2={width - 2} y1={top - 6} y2={top - 6} stroke="#5b4630" strokeWidth={3.2} strokeLinecap="round" />
      {cords.map((c, i) => {
        const cx = xs[i]
        const isSel = selected === c.id
        const isHi = highlight === c.id
        return (
          <g key={c.id} data-cord={c.id} data-value={c.value ?? ''} onClick={onTap ? () => onTap(c.id) : undefined}
            style={onTap ? { cursor: 'pointer' } : undefined}>
            <rect x={cx - pitch / 2 + 1} y={top - 10} width={pitch - 2} height={len + 16} rx={4}
              fill={isSel ? 'rgba(234,88,12,0.18)' : isHi ? 'rgba(250,204,21,0.28)' : 'transparent'}
              stroke={isSel ? 'rgba(234,88,12,0.8)' : isHi ? 'rgba(202,138,4,0.9)' : 'none'} strokeWidth={1.2} />
            <line x1={cx} y1={top - 6} x2={cx} y2={top} stroke={c.hex} strokeWidth={c.role === 'top' ? 2.6 : 1.8} />
            <CordGlyph value={c.value} x={cx} top={top} sp={sp} hex={c.hex} width={c.role === 'pendant' || !c.role ? 1.8 : 2.8} />
            {c.role && c.role !== 'pendant' && (
              <text x={cx} y={top - 9} fontSize={8} textAnchor="middle" fill="currentColor" fontWeight="bold">Σ</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Input panels ───────────────────────────────────────────────────────────────

function Pad({ entry, setEntry, onEnter, disabled }: { entry: string; setEntry: (s: string) => void; onEnter: () => void; disabled: boolean }) {
  useEffect(() => {
    if (disabled) return
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) { if (entry.length < 4) setEntry(entry + e.key) }
      else if (e.key === 'Backspace') setEntry(entry.slice(0, -1))
      else if (e.key === 'Enter') onEnter()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [entry, setEntry, onEnter, disabled])
  const key = 'h-11 rounded-lg border border-line bg-panel text-ink font-bold text-lg active:scale-95 disabled:opacity-40'
  return (
    <div className="flex flex-col gap-2">
      <div data-testid="qp-entry" className="h-11 rounded-lg border border-line bg-paper text-ink text-2xl font-bold tabular-nums flex items-center justify-center tracking-widest">
        {entry || <span className="text-muted text-base font-normal">—</span>}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(d => (
          <button key={d} type="button" data-testid={`qp-key-${d}`} disabled={disabled} className={key}
            onClick={() => { if (entry.length < 4) setEntry(entry + d) }}>{d}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" data-testid="qp-back" disabled={disabled} className={key} onClick={() => setEntry(entry.slice(0, -1))}>⌫</button>
        <button type="button" data-testid="qp-enter" disabled={disabled || !entry}
          className="h-11 rounded-lg bg-accent text-accent-fg font-bold disabled:opacity-40" onClick={onEnter}>Enter</button>
      </div>
    </div>
  )
}

function TiePanel({ digits, setDigits, hex, onCheck, disabled }: { digits: number[]; setDigits: (d: number[]) => void; hex: string; onCheck: () => void; disabled: boolean }) {
  const knots = encode(fromDigits(digits))
  const bump = (p: number, by: number) => {
    const next = [...digits]
    next[p] = Math.max(0, Math.min(9, next[p] + by))
    setDigits(next)
  }
  const btn = 'w-10 h-10 rounded-lg border border-line bg-panel text-ink font-bold text-lg active:scale-95 disabled:opacity-40'
  return (
    <div className="flex gap-2 items-stretch">
      <div className="w-16 shrink-0 rounded-lg border border-line bg-paper text-ink">
        <QuipuSvg cords={[{ id: 'tying', value: fromDigits(digits), hex }]} sp={6.4} labels={false} />
      </div>
      <div className="flex-1 flex flex-col justify-between gap-1.5">
        {POSITION_NAMES.map((name, p) => (
          <div key={name} className="flex items-center gap-2">
            <button type="button" data-testid={`qp-dec-${p}`} aria-label={`untie ${name}`} disabled={disabled || digits[p] === 0} className={btn} onClick={() => bump(p, -1)}>−</button>
            <div className="flex-1 min-w-0 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted">{name}</p>
              <p className="text-xs text-ink-2 font-bold truncate">{describeKnot(knots[p])}</p>
            </div>
            <button type="button" data-testid={`qp-inc-${p}`} aria-label={`tie ${name}`} disabled={disabled || digits[p] === 9} className={btn} onClick={() => bump(p, 1)}>+</button>
          </div>
        ))}
        <button type="button" data-testid="qp-check" disabled={disabled}
          className="h-10 rounded-lg bg-accent text-accent-fg font-bold disabled:opacity-40" onClick={onCheck}>Check the cord</button>
      </div>
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function QuipuGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'read')
  const kind = config.kind
  const puzzle = useMemo(() => generate(kind, difficulty, seed), [kind, difficulty, seed])
  const tier = tierFor(kind, difficulty)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const [step, setStep] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [entry, setEntry] = useState('')
  const [digits, setDigits] = useState([0, 0, 0, 0])
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const sol = useMemo(() => answers(puzzle), [puzzle])
  const total = puzzle.kind === 'mis' ? puzzle.rounds.length : sol.length

  const miss = useCallback((why: string) => {
    const m = mistakes + 1
    setMistakes(m)
    setNote(why)
    if (m >= tier.lives) lose(why)
  }, [mistakes, tier.lives, lose])

  const advance = useCallback(() => {
    const n = step + 1
    setStep(n)
    setEntry('')
    setDigits([0, 0, 0, 0])
    setSelected(null)
    if (n >= total) win()
  }, [step, total, win])

  const submit = useCallback((value: number) => {
    if (settled || step >= total) return
    if (value === sol[step]) { setNote('✓ Correct'); advance() }
    else { setEntry(''); miss(`${value} is not right`) }
  }, [settled, step, total, sol, advance, miss])

  const accuse = useCallback(() => {
    if (settled || puzzle.kind !== 'mis' || !selected) return
    if (selected === puzzle.rounds[step].wrong) { setNote('✓ That cord was mis-tied'); advance() }
    else miss('That cord agrees with its sums')
  }, [settled, puzzle, selected, step, advance, miss])

  // Cords on show.
  let cords: DrawCord[] = []
  let highlight: string | null = null
  let prompt = ''
  let inspectable = false
  if (puzzle.kind === 'read') {
    cords = puzzle.cords.map((c, i) => ({ id: `c${i}`, value: c.value, hex: COLORS[c.color].hex }))
    highlight = step < total ? `c${step}` : null
    prompt = `Read cord ${Math.min(step + 1, total)} of ${total}`
  } else if (puzzle.kind === 'tie') {
    cords = puzzle.targets.map((c, i) => ({ id: `c${i}`, value: i < step ? c.value : i === step ? fromDigits(digits) : null, hex: COLORS[c.color].hex }))
    highlight = step < total ? `c${step}` : null
    prompt = step < total ? `Tie ${puzzle.targets[step].value} on cord ${step + 1} of ${total}` : 'All cords tied'
  } else if (puzzle.kind === 'top') {
    puzzle.groups.forEach((g, gi) => {
      cords.push({ id: `g${gi}-top`, value: gi < step ? sol[gi] : gi === step ? fromDigits(digits) : null, hex: TOP_HEX, role: 'top', gap: gi > 0 })
      g.forEach((c, ci) => cords.push({ id: `g${gi}-c${ci}`, value: c.value, hex: COLORS[c.color].hex, role: 'pendant' }))
    })
    highlight = step < total ? `g${step}-top` : null
    prompt = step < total ? `Tie the top cord of group ${step + 1} of ${total}` : 'Every group is totalled'
  } else if (puzzle.kind === 'mis') {
    const grid = puzzle.rounds[Math.min(step, total - 1)]
    grid.pendants.forEach((row, g) => {
      cords.push({ id: `g${g}-top`, value: grid.tops[g], hex: TOP_HEX, role: 'top', gap: g > 0 })
      row.forEach((v, c) => cords.push({ id: `g${g}-c${c}`, value: v, hex: COLORS[grid.colors[c]].hex, role: 'pendant' }))
    })
    grid.colors.forEach((col, c) => cords.push({ id: `t${c}`, value: grid.totals[c], hex: COLORS[col].hex, role: 'total', gap: c === 0 }))
    prompt = `Quipu ${Math.min(step + 1, total)} of ${total}: find the mis-tied cord`
    inspectable = true
  } else {
    cords = puzzle.cords.map((c, i) => ({ id: `c${i}`, value: c.value, hex: COLORS[c.color].hex }))
    const q = puzzle.questions[Math.min(step, total - 1)]
    prompt = `Total of the ${COLORS[q.color].label} cords (${COLORS[q.color].counts}) — ${Math.min(step + 1, total)} of ${total}`
    inspectable = true
  }

  const zoom = inspectable && selected ? cords.find(c => c.id === selected) : puzzle.kind === 'read' && step < total ? cords[step] : null
  const tieHex = puzzle.kind === 'tie' && step < total ? COLORS[puzzle.targets[step].color].hex : TOP_HEX
  const livesLeft = tier.lives - mistakes

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p data-testid="qp-progress" className="font-bold text-ink-2">{Math.min(step, total)}/{total}</p>
          <p data-testid="qp-lives" className={livesLeft <= 1 ? 'text-red-600 font-bold' : ''}>{'●'.repeat(Math.max(0, livesLeft))}{'○'.repeat(Math.min(tier.lives, mistakes))}</p>
        </div>
      </div>

      <p data-testid="qp-prompt" className="text-sm font-bold text-ink">{prompt}</p>

      <div className="w-full overflow-x-auto rounded-xl border border-line bg-paper text-ink px-1 py-2">
        <QuipuSvg cords={cords} highlight={highlight} selected={inspectable ? selected : null}
          onTap={inspectable && !settled ? (id => setSelected(id === selected ? null : id)) : undefined} />
      </div>

      {puzzle.kind === 'census' && (
        <div className="flex flex-wrap gap-2 text-[10px] text-muted">
          {[...new Set(puzzle.cords.map(c => c.color))].map(c => (
            <span key={c} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full" style={{ background: COLORS[c].hex }} />{COLORS[c].label} = {COLORS[c].counts}</span>
          ))}
        </div>
      )}

      {zoom && zoom.value !== null && (
        <div className="flex items-center gap-3">
          <div className="w-16 shrink-0 rounded-lg border border-line bg-paper text-ink">
            <QuipuSvg cords={[{ ...zoom, id: 'zoom' }]} sp={6.4} labels={false} />
          </div>
          <ul className="text-xs text-ink-2 space-y-1">
            {encode(zoom.value).map(k => (
              <li key={k.pos}><span className="text-muted">{POSITION_NAMES[k.pos]}:</span> {describeKnot(k)}</li>
            ))}
          </ul>
        </div>
      )}

      {!settled && (puzzle.kind === 'read' || puzzle.kind === 'census') && (
        <Pad entry={entry} setEntry={setEntry} onEnter={() => { if (entry) submit(Number(entry)) }} disabled={settled} />
      )}
      {!settled && (puzzle.kind === 'tie' || puzzle.kind === 'top') && (
        <TiePanel digits={digits} setDigits={setDigits} hex={tieHex} onCheck={() => submit(fromDigits(digits))} disabled={settled} />
      )}
      {!settled && puzzle.kind === 'mis' && (
        <button type="button" data-testid="qp-accuse" disabled={!selected} onClick={accuse}
          className="h-11 rounded-lg bg-accent text-accent-fg font-bold disabled:opacity-40">
          {selected ? 'Accuse this cord' : 'Tap a cord to inspect it'}
        </button>
      )}

      {note && !settled && <p data-testid="qp-note" className="text-xs text-muted">{note}</p>}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The record is true!" loseTitle={reason ?? 'The record is muddled'} />
    </div>
  )
}
