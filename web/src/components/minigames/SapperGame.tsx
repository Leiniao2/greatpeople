import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Sapper: Minesweeper in front of a Vauban fortress. Dig out every safe square
// of ground; numbers count the counter-mines in a square's "reach".
//
//   D1   8×8   ~14% mines   (~9 mines, about a minute)
//   D2   9×9   ~15%
//   D3  10×10  ~16.5%
//   D4  12×12  ~18%         (~26 mines, two to three minutes)
//
// Each config is a different rule for what a number counts:
//   king    the eight squares around (classic)
//   orth    only the four squares sharing a side — the sapper's straight galleries
//   knight  the squares a chess knight's move away
//   ring    the squares exactly two steps out (the ring around the 3×3 block)
//
// The field is laid only when the first square is opened: that square and its
// reach are always clear, and a board is accepted only when the exported
// logical solver can clear it from there without ever guessing. Some configs
// cut the field to the shape of the fortress (octagon, star-fort notches).
//
// Tap to dig; long-press, right-click or the flag toggle to flag. Tapping an
// open number shows its reach; with its flags all placed it digs the rest.

type Shape = 'square' | 'octagon' | 'bastion'
export type Reach = 'king' | 'orth' | 'knight' | 'ring'

interface SapperConfig {
  title: string
  intro: string
  fact: string
  shape: Shape
  reach: Reach
}

export const CONFIGS: Record<string, SapperConfig> = {
  'maastricht-1673': {
    title: 'The Siege of Maastricht, 1673',
    intro: 'Vauban’s sappers dig towards the walls, but the defenders have sown the glacis with counter-mines. Open every safe square; each number counts the mines in the eight squares around it.',
    fact: 'At Maastricht in 1673 Vauban first used his system of parallel trenches, letting attackers approach under cover; the city fell in 13 days. The musketeer d’Artagnan was killed in the assault.',
    shape: 'square',
    reach: 'king',
  },
  'lille-citadel': {
    title: 'The Queen of Citadels',
    intro: 'Before Lille’s star fort the listening galleries run dead straight: each number counts mines only in the four squares sharing a side — never the diagonals.',
    fact: 'Vauban built the pentagonal citadel of Lille in 1667–1670 for Louis XIV; it was so admired it became known as “the queen of citadels” and is still used by the French army.',
    shape: 'bastion',
    reach: 'orth',
  },
  'namur-1692': {
    title: 'Namur, 1692',
    intro: 'Coehoorn, the Dutch master, laid his mines on a crooked pattern: each number counts the mines a chess knight’s move away (two squares one way, one the other). Tap a number to see its reach.',
    fact: 'In 1692 Vauban besieged Namur, whose fort was defended by Menno van Coehoorn, the “Dutch Vauban.” Vauban took it; three years later Coehoorn helped retake Namur for the Grand Alliance.',
    shape: 'square',
    reach: 'knight',
  },
  'neuf-brisach': {
    title: 'Neuf-Brisach',
    intro: 'Vauban’s octagonal town is ringed by moats: each number counts the mines exactly two squares out — the ring around its 3×3 block, not the squares touching it. Tap a number to see its ring.',
    fact: 'Neuf-Brisach, begun in 1698, was Vauban’s last and most perfect design: an octagonal fortified town on the Rhine. In 2008 it joined eleven other Vauban sites on UNESCO’s World Heritage List.',
    shape: 'octagon',
    reach: 'ring',
  },
}

/** Offsets each rule counts. */
export const REACH: Record<Reach, [number, number][]> = {
  king: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
  orth: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  knight: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
  ring: (() => {
    const out: [number, number][] = []
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (Math.max(Math.abs(dr), Math.abs(dc)) === 2) out.push([dr, dc])
    return out
  })(),
}

// ── Board ──────────────────────────────────────────────────────────────────────

export interface Field {
  w: number
  h: number
  /** true for squares that are part of the field. */
  inside: boolean[]
  /** In-field neighbours of each square. */
  nbrs: number[][]
}

export function makeField(n: number, shape: Shape, reach: Reach = 'king'): Field {
  const inside = Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n), c = i % n
    if (shape === 'octagon') {
      const k = Math.floor(n / 4)
      const dr = Math.min(r, n - 1 - r), dc = Math.min(c, n - 1 - c)
      return dr + dc >= k
    }
    if (shape === 'bastion') {
      // A notch between bastions in the middle of each side.
      const d = Math.max(1, Math.floor(n / 6))
      const mid = (n - 1) / 2
      const edge = Math.min(r, n - 1 - r, c, n - 1 - c)
      const along = r === edge || n - 1 - r === edge ? Math.abs(c - mid) : Math.abs(r - mid)
      return !(edge < d && along < d - edge + 0.5)
    }
    return true
  })
  const nbrs = inside.map((ok, i) => {
    if (!ok) return []
    const r = Math.floor(i / n), c = i % n
    const out: number[] = []
    for (const [dr, dc] of REACH[reach]) {
      const rr = r + dr, cc = c + dc
      if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue
      if (inside[rr * n + cc]) out.push(rr * n + cc)
    }
    return out
  })
  return { w: n, h: n, inside, nbrs }
}

export function countsFor(field: Field, mines: boolean[]): number[] {
  return field.nbrs.map(ns => ns.reduce((s, j) => s + (mines[j] ? 1 : 0), 0))
}

/**
 * Logical solver: from the first opened square, repeatedly applies the
 * single-number rules, the subset rule between pairs of numbers, and the
 * global mine count. Returns true when every safe square gets opened without
 * a guess.
 */
export function solveLogically(field: Field, mines: boolean[], start: number): boolean {
  const N = field.w * field.h
  const counts = countsFor(field, mines)
  const state = new Uint8Array(N) // 0 unknown, 1 open, 2 flagged
  const total = mines.filter(Boolean).length
  let safeLeft = field.inside.filter(Boolean).length - total
  let flagged = 0
  // The solver only reads `mines` through the counts; these flags catch a
  // deduction that would ever open a mine or flag a safe square.
  let unsound = false
  const stack: number[] = []
  const open = (i: number) => {
    if (state[i] || !field.inside[i]) return true
    if (mines[i]) { unsound = true; return false }
    stack.push(i)
    while (stack.length) {
      const j = stack.pop()!
      if (state[j]) continue
      state[j] = 1; safeLeft--
      if (counts[j] === 0) for (const k of field.nbrs[j]) if (!state[k]) stack.push(k)
    }
    return true
  }
  const flag = (i: number) => { if (!state[i]) { if (!mines[i]) unsound = true; state[i] = 2; flagged++ } }
  if (!open(start)) return false
  while (safeLeft > 0) {
    if (unsound) throw new Error('sapper solver made an unsound deduction')
    let progress = false
    // Constraints from open numbers that still touch unknown squares.
    const cons: { cells: number[]; m: number }[] = []
    for (let i = 0; i < N; i++) {
      if (state[i] !== 1 || counts[i] === 0) continue
      const unk: number[] = []
      let f = 0
      for (const k of field.nbrs[i]) { if (state[k] === 0) unk.push(k); else if (state[k] === 2) f++ }
      if (!unk.length) continue
      const m = counts[i] - f
      if (m === 0) { for (const k of unk) open(k); progress = true }
      else if (m === unk.length) { for (const k of unk) flag(k); progress = true }
      else cons.push({ cells: unk, m })
    }
    if (progress) continue
    // Subset / overlap rule between pairs of constraints that share squares.
    const byCell = new Map<number, number[]>()
    cons.forEach((c, ci) => c.cells.forEach(k => { const l = byCell.get(k); if (l) l.push(ci); else byCell.set(k, [ci]) }))
    outer: for (let a = 0; a < cons.length; a++) {
      const A = cons[a]
      const partners = new Set<number>()
      for (const k of A.cells) for (const b of byCell.get(k)!) if (b !== a) partners.add(b)
      for (const b of partners) {
        const B = cons[b]
        const inB = new Set(B.cells)
        const onlyA = A.cells.filter(k => !inB.has(k))
        const inA = new Set(A.cells)
        const onlyB = B.cells.filter(k => !inA.has(k))
        // Mines in B outside A are at least B.m - A.m; if that equals the
        // squares there, they are all mines and A's squares outside B are safe.
        if (B.m - A.m === onlyB.length && onlyB.length) {
          for (const k of onlyB) flag(k)
          for (const k of onlyA) open(k)
          progress = true
          break outer
        }
        if (!onlyA.length && B.m === A.m && onlyB.length) {
          for (const k of onlyB) open(k)
          progress = true
          break outer
        }
      }
    }
    if (progress) continue
    // Global count.
    const unknown: number[] = []
    for (let i = 0; i < N; i++) if (field.inside[i] && !state[i]) unknown.push(i)
    if (total - flagged === 0) { for (const k of unknown) open(k); continue }
    if (total - flagged === unknown.length) { for (const k of unknown) flag(k); continue }
    return false
  }
  return true
}

export interface Tier { n: number; density: number }

export function tierFor(difficulty: Difficulty): Tier {
  return {
    n: scale(difficulty, [8, 9, 10, 12]),
    density: scale(difficulty, [0.14, 0.15, 0.165, 0.18]),
  }
}

export interface Layout { field: Field; mines: boolean[]; counts: number[]; mineCount: number }

export type Rules = Pick<SapperConfig, 'shape' | 'reach'>

/** Mines for a field opened first at `start`, always solvable by logic from there. */
export function generate(rules: Rules, difficulty: Difficulty, seed: number, start: number): Layout {
  const { n, density } = tierFor(difficulty)
  const field = makeField(n, rules.shape, rules.reach)
  if (!field.inside[start]) start = field.inside.indexOf(true)
  const rng = mulberry32(seed ^ Math.imul(start + 1, 0x9e3779b1) ^ hashString(rules.shape + rules.reach))
  const clear = new Set([start, ...field.nbrs[start]])
  const pool: number[] = []
  field.inside.forEach((ok, i) => { if (ok && !clear.has(i)) pool.push(i) })
  let mineCount = Math.round(field.inside.filter(Boolean).length * density)
  for (let attempt = 0; ; attempt++) {
    // After many rejections, ease off one mine so generation always ends.
    if (attempt && attempt % 150 === 0) mineCount--
    const p = [...pool]
    for (let k = 0; k < mineCount; k++) { const j = k + Math.floor(rng() * (p.length - k)); [p[k], p[j]] = [p[j], p[k]] }
    const mines = Array(n * n).fill(false)
    for (const i of p.slice(0, mineCount)) mines[i] = true
    if (solveLogically(field, mines, start)) return { field, mines, counts: countsFor(field, mines), mineCount }
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export const REACH_LABEL: Record<Reach, string> = {
  king: 'the 8 squares around',
  orth: 'only the 4 squares sharing a side',
  knight: 'the squares a knight’s move away',
  ring: 'the ring two squares out',
}

/** A 5×5 key showing which squares a number counts. */
function ReachDiagram({ reach }: { reach: Reach }) {
  const on = new Set(REACH[reach].map(([dr, dc]) => (dr + 2) * 5 + dc + 2))
  return (
    <div className="mt-1 ml-auto grid grid-cols-5 gap-px w-[34px]" aria-label={`numbers count ${REACH_LABEL[reach]}`} data-testid="sap-reach">
      {Array.from({ length: 25 }, (_, k) => (
        <span key={k} className={`aspect-square rounded-[1px] ${k === 12 ? 'bg-ink' : on.has(k) ? 'bg-sky-500' : 'bg-line'}`} />
      ))}
    </div>
  )
}

const NUM_COLOURS = ['', 'text-blue-700', 'text-emerald-700', 'text-red-600', 'text-indigo-800', 'text-amber-800', 'text-teal-700', 'text-ink', 'text-muted']

export default function SapperGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'maastricht-1673')
  const { n, density } = tierFor(difficulty)
  const field = useMemo(() => makeField(n, config.shape, config.reach), [n, config.shape, config.reach])
  const insideCount = field.inside.filter(Boolean).length
  const [layout, setLayout] = useState<Layout | null>(null)
  const [state, setState] = useState<Uint8Array>(() => new Uint8Array(n * n)) // 0 hidden, 1 open, 2 flag
  const [flagMode, setFlagMode] = useState(false)
  const [boom, setBoom] = useState<number | null>(null)
  // An open number the player tapped: its reach is outlined.
  const [peek, setPeek] = useState<number | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const press = useRef<{ i: number; timer: ReturnType<typeof setTimeout> | null; long: boolean } | null>(null)

  const mineCount = layout?.mineCount ?? Math.round(insideCount * density)
  const flags = state.reduce((s, v) => s + (v === 2 ? 1 : 0), 0)

  const openCells = useCallback((lay: Layout, st: Uint8Array, cells: number[]) => {
    const next = new Uint8Array(st)
    const stack = [...cells]
    let hit: number | null = null
    while (stack.length) {
      const j = stack.pop()!
      if (next[j] || !lay.field.inside[j]) continue
      if (lay.mines[j]) { hit = j; continue }
      next[j] = 1
      if (lay.counts[j] === 0) for (const k of lay.field.nbrs[j]) if (!next[k]) stack.push(k)
    }
    return { next, hit }
  }, [])

  const finish = useCallback((lay: Layout, next: Uint8Array, hit: number | null) => {
    if (hit !== null) {
      setBoom(hit)
      setState(next)
      lose('A counter-mine went off')
      return
    }
    let opened = 0
    for (let i = 0; i < next.length; i++) if (next[i] === 1) opened++
    if (opened === insideCount - lay.mineCount) {
      for (let i = 0; i < next.length; i++) if (lay.mines[i]) next[i] = 2
      setState(next)
      win()
      return
    }
    setState(next)
  }, [insideCount, win, lose])

  const toggleFlag = useCallback((i: number) => {
    if (settled || !field.inside[i] || state[i] === 1) return
    const next = new Uint8Array(state)
    next[i] = state[i] === 2 ? 0 : 2
    setState(next)
  }, [settled, field, state])

  const dig = useCallback((i: number) => {
    if (settled || !field.inside[i]) return
    if (state[i] === 2) return
    let lay = layout
    if (!lay) { lay = generate(config, difficulty, seed, i); setLayout(lay) }
    if (state[i] === 1) {
      // Chord: dig every unflagged neighbour once the flags match the number.
      const ns = lay.field.nbrs[i]
      const f = ns.filter(k => state[k] === 2).length
      setPeek(p => (p === i ? null : i))
      if (lay.counts[i] === 0 || f !== lay.counts[i] || !ns.some(k => state[k] === 0)) return
      const { next, hit } = openCells(lay, state, ns.filter(k => state[k] === 0))
      finish(lay, next, hit)
      return
    }
    setPeek(null)
    const { next, hit } = openCells(lay, state, [i])
    finish(lay, next, hit)
  }, [settled, field, state, layout, config, difficulty, seed, openCells, finish])

  const tap = (i: number) => (flagMode && state[i] !== 1 ? toggleFlag(i) : dig(i))

  const onPointerDown = (i: number) => () => {
    if (settled) return
    const p = { i, timer: null as ReturnType<typeof setTimeout> | null, long: false }
    p.timer = setTimeout(() => { p.long = true; toggleFlag(i); if (navigator.vibrate) navigator.vibrate(20) }, 450)
    press.current = p
  }
  const cancelPress = () => { if (press.current?.timer) clearTimeout(press.current.timer) }
  const onClick = (i: number) => () => {
    const p = press.current
    cancelPress()
    press.current = null
    if (p && p.i === i && p.long) return
    tap(i)
  }
  useEffect(() => () => cancelPress(), [])

  const fontPx = n <= 8 ? 18 : n <= 10 ? 15 : n <= 12 ? 13 : 11
  const peekSet = useMemo(() => new Set(peek === null ? [] : field.nbrs[peek]), [peek, field])

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">{n}×{n}</p>
          <p data-testid="sap-mines">💣 {mineCount - flags}</p>
          <ReachDiagram reach={config.reach} />
        </div>
      </div>

      <div className="w-full max-w-[430px] mx-auto rounded-lg p-1 border border-line shadow-inner select-none"
        style={{ background: 'linear-gradient(160deg, #6b7b45 0%, #4f5d31 100%)' }}
        onContextMenu={e => e.preventDefault()}>
        <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {field.inside.map((ok, i) => {
            if (!ok) return <div key={i} data-cell={i} data-out="true" className="aspect-square" />
            const s = state[i]
            const isMine = layout?.mines[i]
            const showMine = settled && isMine && outcome === 'lost'
            const count = layout?.counts[i] ?? 0
            let body: React.ReactNode = null
            let cls = 'bg-[#8fa25c] hover:bg-[#9db06a] shadow-[inset_0_-2px_0_rgba(0,0,0,.25)]'
            if (s === 1) {
              cls = 'bg-[#e9dcb8]'
              if (count) body = <span className={`font-black ${NUM_COLOURS[Math.min(count, 8)]}`}>{count}</span>
            } else if (showMine) {
              cls = boom === i ? 'bg-red-500' : 'bg-[#cbbd96]'
              body = <span>💣</span>
            } else if (s === 2) {
              body = <span>🚩</span>
            }
            return (
              <button key={i} type="button" data-cell={i} data-state={s}
                aria-label={`square ${Math.floor(i / n) + 1},${(i % n) + 1}`}
                onPointerDown={onPointerDown(i)} onPointerLeave={cancelPress} onClick={onClick(i)}
                onContextMenu={e => { e.preventDefault(); if (press.current?.long) return; cancelPress(); press.current = null; toggleFlag(i) }}
                disabled={settled}
                data-peek={peekSet.has(i) ? 'true' : undefined}
                className={`aspect-square rounded-[3px] flex items-center justify-center leading-none ${cls} ${peekSet.has(i) ? 'ring-2 ring-inset ring-sky-400' : ''} ${peek === i ? 'ring-2 ring-inset ring-sky-700' : ''}`}
                style={{ fontSize: fontPx, touchAction: 'manipulation' }}>
                {body}
              </button>
            )
          })}
        </div>
      </div>

      {!settled && (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[430px] mx-auto">
          <button type="button" onClick={() => setFlagMode(false)} aria-pressed={!flagMode}
            className={`h-10 rounded-lg border text-xs font-bold ${!flagMode ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
            ⛏ Dig
          </button>
          <button type="button" onClick={() => setFlagMode(true)} aria-pressed={flagMode}
            className={`h-10 rounded-lg border text-xs font-bold ${flagMode ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
            🚩 Flag
          </button>
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : layout ? `Numbers count ${REACH_LABEL[config.reach]}. Long-press or right-click to flag. Tap a number to see its reach; with its flags placed it digs the rest.` : 'Your first square is always safe — and the field never needs a guess.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The approach is clear!" loseTitle="A counter-mine went off" />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
