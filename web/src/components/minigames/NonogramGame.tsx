import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Picture Logic: a nonogram. Row and column clues give the runs of filled
// cells in order; fill the grid to reveal an artefact.
//
//   D1  5×5     4 mistakes
//   D2  10×10   3 mistakes
//   D3  12×12   3 mistakes
//   D4  15×15   3 mistakes
//
// Every picture is checked by the exported line solver: repeated row/column
// deduction alone fills the whole grid, which proves the clues have exactly
// one solution and that no guessing is ever needed. Each seed picks a picture
// of the tier's size and may mirror it.
//
// Tap or drag along a row/column to paint. Fill mode: a cell that is not part
// of the picture costs a mistake and is crossed out for you. Cross mode marks
// cells you know are empty. A finished line crosses its remaining cells.

interface NonoConfig {
  title: string
  intro: string
  fact: string
}

export const CONFIGS: Record<string, NonoConfig> = {
  'ashmolean': {
    title: 'The Ashmolean Register',
    intro: 'A keeper’s catalogue records each artefact only as numbers on a grid. Use the row and column clues to fill in the picture.',
    fact: 'The Ashmolean in Oxford opened in 1683 to house Elias Ashmole’s collection — much of it gathered by the gardener-naturalists John Tradescant father and son — and is often called Britain’s first public museum.',
  },
  'british-museum': {
    title: 'Montagu House Inventory',
    intro: 'Sir Hans Sloane’s cabinets are being catalogued. Read the number clues to reconstruct each object’s outline.',
    fact: 'The British Museum was founded by Act of Parliament in 1753 around the 71,000 objects of physician Sir Hans Sloane, and opened free to “all studious and curious persons” at Montagu House in 1759.',
  },
  'louvre': {
    title: 'Muséum Central des Arts',
    intro: 'The revolutionary museum is drawing its new treasures in a squared ledger. Use the clues to fill in the picture.',
    fact: 'The Louvre palace opened as a public museum on 10 August 1793, the first anniversary of the fall of the monarchy, with 537 paintings largely drawn from the royal collection.',
  },
  'wunderkammer': {
    title: 'The Cabinet of Curiosities',
    intro: 'A Renaissance collector’s drawers are full of wonders. Each clue counts runs of filled squares — reveal what lies inside.',
    fact: 'Renaissance Wunderkammern mixed art, coral, fossils and automata. Ole Worm’s cabinet in Copenhagen, engraved for his 1655 Museum Wormianum, is one of the best-documented ancestors of the modern museum.',
  },
}

// ── Pictures ───────────────────────────────────────────────────────────────────

export interface Picture { name: string; rows: string[] }

export const PICTURES: Picture[] = [
  // 5×5
  { name: 'an amphora', rows: ['.###.', '#.#.#', '.###.', '.###.', '..#..'] },
  { name: 'an ankh', rows: ['.###.', '.#.#.', '#####', '..#..', '..#..'] },
  { name: 'a pyramid', rows: ['..#..', '.###.', '.###.', '#####', '#####'] },
  { name: 'a sword', rows: ['..#..', '..#..', '#####', '..#..', '.###.'] },
  { name: 'a crown', rows: ['#.#.#', '#####', '#####', '#...#', '#####'] },
  { name: 'a shield', rows: ['#####', '#.#.#', '#####', '.###.', '..#..'] },
  { name: 'a sailing boat', rows: ['..#..', '..##.', '..#..', '#####', '.###.'] },
  // 10×10
  { name: 'an anchor', rows: [
    '....##....',
    '...#..#...',
    '....##....',
    '....##....',
    '.########.',
    '....##....',
    '#...##...#',
    '##..##..##',
    '.##.##.##.',
    '..######..',
  ] },
  { name: 'a quill and inkpot', rows: [
    '.......###',
    '......####',
    '.....#####',
    '....#####.',
    '....####..',
    '...####...',
    '...###....',
    '..##...##.',
    '.##...####',
    '#....#####',
  ] },
  { name: 'a pharaoh’s mask', rows: [
    '...####...',
    '..######..',
    '.##....##.',
    '.#.#..#.#.',
    '##......##',
    '##.####.##',
    '##..##..##',
    '.#......#.',
    '..#.##.#..',
    '...####...',
  ] },
  { name: 'a compass rose', rows: [
    '....##....',
    '....##....',
    '...####...',
    '..######..',
    '##########',
    '##########',
    '..######..',
    '...####...',
    '....##....',
    '....##....',
  ] },
  { name: 'a Roman oil lamp', rows: [
    '.......#..',
    '......###.',
    '.......#..',
    '..........',
    '..######..',
    '.########.',
    '##########',
    '.###..###.',
    '...####...',
    '..######..',
  ] },
  { name: 'a Corinthian helmet', rows: [
    '...####...',
    '..######..',
    '.########.',
    '.###..###.',
    '.##....##.',
    '.##.##.##.',
    '.##.##.##.',
    '.###..###.',
    '..##..##..',
    '..##..##..',
  ] },
  // 12×12
  { name: 'a samurai kabuto', rows: [
    '#..........#',
    '##........##',
    '.##......##.',
    '..##.##.##..',
    '...######...',
    '..########..',
    '.##########.',
    '############',
    '##.######.##',
    '##.##..##.##',
    '...##..##...',
    '..###..###..',
  ] },
  { name: 'a trireme', rows: [
    '.....#......',
    '.....##.....',
    '.....###....',
    '.....####...',
    '.....#####..',
    '.....#......',
    '############',
    '.##########.',
    '..########..',
    '.#.#.#.#.#..',
    '#.#.#.#.#...',
    '............',
  ] },
  { name: 'a scarab', rows: [
    '....####....',
    '...#.##.#...',
    '..########..',
    '#.########.#',
    '.#.######.#.',
    '..##.##.##..',
    '##.######.##',
    '#..######..#',
    '#..######..#',
    '..#.####.#..',
    '.#...##...#.',
    '##........##',
  ] },
  { name: 'a torii gate', rows: [
    '############',
    '.##########.',
    '...##..##...',
    '############',
    '...##..##...',
    '...##..##...',
    '...##..##...',
    '...##..##...',
    '...##..##...',
    '...##..##...',
    '..####.####.',
    '..####.####.',
  ] },
  { name: 'the Pharos lighthouse', rows: [
    '.....##.....',
    '....####....',
    '.....##.....',
    '....####....',
    '....####....',
    '...######...',
    '...##..##...',
    '...######...',
    '..########..',
    '..##.##.##..',
    '.##########.',
    '############',
  ] },
  // 15×15
  { name: 'the Parthenon', rows: [
    '.......#.......',
    '.....#####.....',
    '...#########...',
    '.#############.',
    '###############',
    '...............',
    '.##..##.##..##.',
    '.##..##.##..##.',
    '.##..##.##..##.',
    '.##..##.##..##.',
    '.##..##.##..##.',
    '.##..##.##..##.',
    '...............',
    '###############',
    '###############',
  ] },
  { name: 'a caravel', rows: [
    '.......#.......',
    '......##.......',
    '.....###...#...',
    '....####..##...',
    '...#####.###...',
    '..######.###...',
    '.#######.####..',
    '.......#.......',
    '###############',
    '.#############.',
    '..###########..',
    '...#########...',
    '...............',
    '..##.##.##.##..',
    '###############',
  ] },
  { name: 'an astrolabe', rows: [
    '......###......',
    '....#######....',
    '...#########...',
    '..###.....###..',
    '.###..###..###.',
    '.##..#####..##.',
    '###.##.#.##.###',
    '###.#.###.#.###',
    '###.##.#.##.###',
    '.##..#####..##.',
    '.###..###..###.',
    '..###.....###..',
    '...#########...',
    '....#######....',
    '......###......',
  ] },
  { name: 'Mount Fuji', rows: [
    '##...........##',
    '#.............#',
    '......###......',
    '.....#####.....',
    '....##.#.##....',
    '...##.....##...',
    '..###.....###..',
    '..####...####..',
    '.#############.',
    '.#############.',
    '###############',
    '...............',
    '..###########..',
    '....#######....',
    '...............',
  ] },
  { name: 'a chess knight', rows: [
    '......#.#......',
    '.....######....',
    '....########...',
    '...###.######..',
    '..###########..',
    '.############..',
    '.####..######..',
    '..##..#######..',
    '.....#######...',
    '....#######....',
    '....######.....',
    '.....####......',
    '....######.....',
    '...########....',
    '..##########...',
  ] },
]

// ── Line solver ────────────────────────────────────────────────────────────────

/** Cell knowledge: -1 unknown, 0 empty, 1 filled. */
export type Cell = -1 | 0 | 1

export function cluesOf(line: readonly (number | boolean)[]): number[] {
  const out: number[] = []
  let run = 0
  for (const v of line) {
    if (v) run++
    else if (run) { out.push(run); run = 0 }
  }
  if (run) out.push(run)
  return out
}

/**
 * Everything that can be deduced about one line from its clues and what is
 * known: returns the refined line, or null on a contradiction.
 */
export function solveLine(clues: readonly number[], line: readonly Cell[]): Cell[] | null {
  const L = line.length, k = clues.length
  const memo = new Int8Array((L + 2) * (k + 1)).fill(-1)
  const fits = (p: number, b: number): boolean => {
    if (p > L) p = L
    const key = p * (k + 1) + b
    if (memo[key] >= 0) return memo[key] === 1
    let ok = false
    if (b === k) {
      ok = true
      for (let i = p; i < L; i++) if (line[i] === 1) { ok = false; break }
    } else {
      if (p < L && line[p] !== 1 && fits(p + 1, b)) ok = true
      if (!ok && canPlace(p, b)) ok = fits(p + clues[b] + 1, b + 1)
    }
    memo[key] = ok ? 1 : 0
    return ok
  }
  const canPlace = (p: number, b: number) => {
    const len = clues[b]
    if (p + len > L) return false
    for (let i = p; i < p + len; i++) if (line[i] === 0) return false
    return p + len === L || line[p + len] !== 1
  }
  if (!fits(0, 0)) return null
  const can1 = new Uint8Array(L), can0 = new Uint8Array(L)
  const seen = new Uint8Array((L + 2) * (k + 1))
  const mark = (p: number, b: number) => {
    if (p > L) p = L
    const key = p * (k + 1) + b
    if (seen[key]) return
    seen[key] = 1
    if (b === k) { for (let i = p; i < L; i++) can0[i] = 1; return }
    if (p < L && line[p] !== 1 && fits(p + 1, b)) { can0[p] = 1; mark(p + 1, b) }
    if (canPlace(p, b) && fits(p + clues[b] + 1, b + 1)) {
      for (let i = p; i < p + clues[b]; i++) can1[i] = 1
      if (p + clues[b] < L) can0[p + clues[b]] = 1
      mark(p + clues[b] + 1, b + 1)
    }
  }
  mark(0, 0)
  return Array.from({ length: L }, (_, i) => (can1[i] && can0[i] ? -1 : can1[i] ? 1 : 0) as Cell)
}

/**
 * Line-solve a whole puzzle: sweep rows and columns until nothing changes.
 * Returns the grid of what was deduced, or null on a contradiction.
 */
export function lineSolve(rowClues: number[][], colClues: number[][]): Cell[][] | null {
  const h = rowClues.length, w = colClues.length
  const g: Cell[][] = Array.from({ length: h }, () => Array(w).fill(-1) as Cell[])
  let changed = true
  while (changed) {
    changed = false
    for (let r = 0; r < h; r++) {
      const out = solveLine(rowClues[r], g[r])
      if (!out) return null
      for (let c = 0; c < w; c++) if (out[c] !== g[r][c]) { g[r][c] = out[c]; changed = true }
    }
    for (let c = 0; c < w; c++) {
      const out = solveLine(colClues[c], g.map(row => row[c]))
      if (!out) return null
      for (let r = 0; r < h; r++) if (out[r] !== g[r][c]) { g[r][c] = out[r]; changed = true }
    }
  }
  return g
}

/** True when line solving alone determines every cell (so the solution is unique). */
export function isUniquelyLineSolvable(bitmap: boolean[][]): boolean {
  const { rowClues, colClues } = cluesFor(bitmap)
  const g = lineSolve(rowClues, colClues)
  return !!g && g.every((row, r) => row.every((v, c) => v === (bitmap[r][c] ? 1 : 0)))
}

export function cluesFor(bitmap: boolean[][]) {
  const rowClues = bitmap.map(row => cluesOf(row))
  const colClues = bitmap[0].map((_, c) => cluesOf(bitmap.map(row => row[c])))
  return { rowClues, colClues }
}

export const toBitmap = (p: Picture): boolean[][] => p.rows.map(r => [...r].map(ch => ch === '#'))

// ── Puzzle selection ───────────────────────────────────────────────────────────

export interface Tier { size: number; maxMistakes: number }

export function tierFor(difficulty: Difficulty): Tier {
  return {
    size: scale(difficulty, [5, 10, 12, 15]),
    maxMistakes: scale(difficulty, [4, 3, 3, 3]),
  }
}

export interface Puzzle { name: string; bitmap: boolean[][]; rowClues: number[][]; colClues: number[][]; tier: Tier }

export function generate(configId: string, difficulty: Difficulty, seed: number): Puzzle {
  const tier = tierFor(difficulty)
  const pool = PICTURES.filter(p => p.rows.length === tier.size)
  const rng = mulberry32(seed ^ hashString(configId))
  const pic = pool[Math.floor(rng() * pool.length)]
  let bitmap = toBitmap(pic)
  // Mirroring keeps clues valid (rows reverse, columns swap) and the picture recognisable.
  if (rng() < 0.5) bitmap = bitmap.map(row => [...row].reverse())
  return { name: pic.name, bitmap, ...cluesFor(bitmap), tier }
}

// ── Component ──────────────────────────────────────────────────────────────────

type Mark = 0 | 1 | 2 // empty, filled, crossed

const NG_CSS = `
@keyframes ng-shake { 0%,100% { transform: none } 25% { transform: translateX(-2px) } 75% { transform: translateX(2px) } }
.ng-shake { animation: ng-shake 220ms ease-in-out }
`

export default function NonogramGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'ashmolean')
  const puzzle = useMemo(() => generate(configId, difficulty, seed), [configId, difficulty, seed])
  const { bitmap, rowClues, colClues, tier } = puzzle
  const n = bitmap.length
  const [marks, setMarks] = useState<Mark[][]>(() => bitmap.map(row => row.map(() => 0 as Mark)))
  const [mode, setMode] = useState<'fill' | 'cross'>('fill')
  const [mistakes, setMistakes] = useState(0)
  const [shake, setShake] = useState<number | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  // Drag: the action decided on the first cell, and the axis once it moves.
  const drag = useRef<{ action: Mark | 'clear'; r: number; c: number; axis: 'r' | 'c' | null } | null>(null)
  const marksRef = useRef(marks)
  marksRef.current = marks
  const mistakesRef = useRef(mistakes)
  mistakesRef.current = mistakes

  const lineDone = (m: Mark[][], r: number | null, c: number | null) => {
    const cells = r !== null ? m[r].map((v, k) => [v, bitmap[r][k]] as const) : m.map((row, k) => [row[c!], bitmap[k][c!]] as const)
    return cells.every(([v, want]) => !want || v === 1)
  }

  const apply = useCallback((r: number, c: number, action: Mark | 'clear') => {
    if (settled) return
    const m = marksRef.current
    const cur = m[r][c]
    if (cur === 1) return // filled cells are final
    let next: Mark
    if (action === 'clear') { if (cur !== 2) return; next = 0 }
    else if (action === 2) { if (cur !== 0) return; next = 2 }
    else {
      if (cur !== 0) return
      if (!bitmap[r][c]) {
        const k = mistakesRef.current + 1
        mistakesRef.current = k
        setMistakes(k)
        setShake(r * n + c)
        const g = m.map(row => [...row]); g[r][c] = 2
        marksRef.current = g
        setMarks(g)
        drag.current = null
        if (k >= tier.maxMistakes) lose('Too many wrong squares')
        return
      }
      next = 1
    }
    const g = m.map(row => [...row])
    g[r][c] = next
    if (next === 1) {
      // A finished line crosses the rest of its cells.
      if (lineDone(g, r, null)) for (let k = 0; k < n; k++) if (g[r][k] === 0) g[r][k] = 2
      if (lineDone(g, null, c)) for (let k = 0; k < n; k++) if (g[k][c] === 0) g[k][c] = 2
    }
    marksRef.current = g
    setMarks(g)
    if (next === 1 && g.every((row, rr) => row.every((v, cc) => !bitmap[rr][cc] || v === 1))) win()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, bitmap, n, tier.maxMistakes, win, lose])

  const cellFrom = (e: { clientX: number; clientY: number; target: EventTarget | null }) => {
    const el = (typeof document.elementFromPoint === 'function' ? document.elementFromPoint(e.clientX, e.clientY) : null) ?? (e.target as Element | null)
    const v = (el as HTMLElement | null)?.closest?.('[data-cell]')?.getAttribute('data-cell')
    if (v == null) return null
    const i = Number(v)
    return [Math.floor(i / n), i % n] as const
  }

  const onDown = (r: number, c: number) => (e: React.PointerEvent) => {
    if (settled) return
    e.preventDefault()
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    const cur = marksRef.current[r][c]
    const action: Mark | 'clear' = mode === 'fill' ? 1 : cur === 2 ? 'clear' : 2
    drag.current = { action, r, c, axis: null }
    apply(r, c, action)
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || settled) return
    const hit = cellFrom(e)
    if (!hit) return
    let [r, c] = hit
    if (r === d.r && c === d.c) return
    if (!d.axis) d.axis = r === d.r ? 'r' : c === d.c ? 'c' : Math.abs(r - d.r) < Math.abs(c - d.c) ? 'r' : 'c'
    if (d.axis === 'r') r = d.r
    else c = d.c
    // Paint every cell between the start and here, so fast drags leave no gaps.
    const [a, b] = d.axis === 'r' ? [Math.min(c, d.c), Math.max(c, d.c)] : [Math.min(r, d.r), Math.max(r, d.r)]
    for (let k = a; k <= b && drag.current; k++) apply(d.axis === 'r' ? d.r : k, d.axis === 'r' ? k : d.c, d.action)
  }

  useEffect(() => {
    const up = () => { drag.current = null }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
  }, [])
  useEffect(() => {
    if (shake === null) return
    const t = setTimeout(() => setShake(null), 250)
    return () => clearTimeout(t)
  }, [shake])

  const filled = marks.flat().filter(v => v === 1).length
  const total = bitmap.flat().filter(Boolean).length
  const clueFont = n <= 5 ? 'text-xs' : n <= 10 ? 'text-[10px]' : 'text-[8px]'
  const cellBorder = (r: number, c: number) =>
    `${c % 5 === 4 && c < n - 1 ? 'border-r-2 border-r-ink-2/60' : 'border-r border-r-line'} ${r % 5 === 4 && r < n - 1 ? 'border-b-2 border-b-ink-2/60' : 'border-b border-b-line'}`

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <style>{NG_CSS}</style>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">{n}×{n}</p>
          <p>■ {filled}/{total}</p>
          <p className={mistakes ? 'text-red-600 font-bold' : ''} data-testid="ng-mistakes">✗ {mistakes} / {tier.maxMistakes}</p>
        </div>
      </div>

      <div className="w-full max-w-[430px] mx-auto select-none" style={{ touchAction: 'none' }} onPointerMove={onMove}>
        <div className="grid" style={{ gridTemplateColumns: `auto repeat(${n}, minmax(0, 1fr))` }}>
          <div />
          {colClues.map((cl, c) => (
            <div key={`c${c}`} data-colclue={c}
              className={`flex flex-col items-center justify-end pb-0.5 leading-[1.05] font-bold tabular-nums ${clueFont}
                ${lineDone(marks, null, c) ? 'text-muted/40' : 'text-ink-2'} ${c % 2 ? 'bg-panel/40' : ''}`}>
              {(cl.length ? cl : [0]).map((v, k) => <span key={k}>{v}</span>)}
            </div>
          ))}
          {marks.map((row, r) => [
            <div key={`r${r}`} data-rowclue={r}
              className={`flex items-center justify-end gap-[3px] pr-1 font-bold tabular-nums ${clueFont}
                ${lineDone(marks, r, null) ? 'text-muted/40' : 'text-ink-2'} ${r % 2 ? 'bg-panel/40' : ''}`}>
              {(rowClues[r].length ? rowClues[r] : [0]).map((v, k) => <span key={k}>{v}</span>)}
            </div>,
            ...row.map((v, c) => {
              const i = r * n + c
              const wrongCross = v === 2 && bitmap[r][c] === false && outcome === 'won'
              return (
                <div key={i} data-cell={i} data-mark={v} role="button" aria-label={`cell ${r + 1},${c + 1}`}
                  onPointerDown={onDown(r, c)}
                  className={`aspect-square flex items-center justify-center ${cellBorder(r, c)} ${r === 0 ? 'border-t border-t-ink-2/60' : ''} ${c === 0 ? 'border-l border-l-ink-2/60' : ''}
                    ${v === 1 ? 'bg-ink' : 'bg-paper'} ${shake === i ? 'ng-shake' : ''} cursor-pointer`}>
                  {v === 2 && !wrongCross && <span className="text-muted/70 leading-none" style={{ fontSize: n > 10 ? 9 : 13 }}>✕</span>}
                </div>
              )
            }),
          ])}
        </div>
      </div>

      {!settled && (
        <div className="grid grid-cols-2 gap-1.5 w-full max-w-[430px] mx-auto">
          <button type="button" onClick={() => setMode('fill')} aria-pressed={mode === 'fill'}
            className={`h-10 rounded-lg border text-xs font-bold ${mode === 'fill' ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
            ■ Fill
          </button>
          <button type="button" onClick={() => setMode('cross')} aria-pressed={mode === 'cross'}
            className={`h-10 rounded-lg border text-xs font-bold ${mode === 'cross' ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
            ✕ Cross
          </button>
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {outcome === 'won' ? `It is ${puzzle.name}!` : 'Tap or drag along a line. Numbers are runs of filled squares, in order.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle={`Revealed: ${puzzle.name}`} loseTitle="Too many wrong squares" />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
