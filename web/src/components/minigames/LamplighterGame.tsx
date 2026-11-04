import { useMemo, useState, useCallback } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Lamplighter: Lights Out on a gaslit London street.
//
// Tapping a lamp toggles it and its neighbours. Each config is a different
// rule twist:
//   pall-mall           ✚ the lamp and its four sides (classic)
//   westminster-bridge  ✚ but broken lamps leave holes in the street
//   seven-dials         ✖ the lamp and its four diagonals
//   embankment          ▣ the lamp and all eight around (a few broken)
//   peter-street        ✚ three-notch burners: dark → dim → bright → dark
// Light every lamp (fully) within the press budget. Boards are made by
// pressing random lamps on a fully lit street, so every board is solvable; the
// fewest presses that solve it is computed exactly over GF(2) (GF(3) for the
// three-notch burners) and the budget is that plus a little slack. Broken
// lamps are dark holes that cannot be pressed, are not toggled and do not
// need lighting.
//
//   D1  4×4   optimal ≥ 3   budget optimal + 4   1 hint    ~1 min
//   D2  4×4   optimal ≥ 4   budget optimal + 4   1 hint
//   D3  5×5   optimal ≥ 5   budget optimal + 4   1 hint
//   D4  5×5   optimal ≥ 6   budget optimal + 2             ~2–3 min
//
// A wrong press costs two from the budget (it has to be pressed again), so
// D1–D3 forgive two wrong lamps and D4 one.
//
// The game is lost as soon as the lamps still dark cannot be lit in the
// presses left (checked exactly after every press), or the budget runs out.

export type Pattern = 'plus' | 'cross' | 'king'

interface LampConfig {
  title: string
  intro: string
  fact: string
  pattern: Pattern
  /** Share of lamps that are broken (holes), 0 for none. */
  broken?: number
  /** Brightness steps per lamp: 2 = on/off, 3 = dark/dim/bright. */
  phases?: 2 | 3
}

export const CONFIGS: Record<string, LampConfig> = {
  'pall-mall': {
    title: 'Pall Mall, 1807',
    intro: 'Each lamp you light shares its gas main with the lamps beside it, above and below: tapping one toggles it and its four neighbours. Light the whole street.',
    fact: 'In 1807 Frederick Winsor lit part of Pall Mall with gas lamps to celebrate the King’s birthday — the first public street in the world lit by gas.',
    pattern: 'plus',
  },
  'westminster-bridge': {
    title: 'Westminster Bridge, 1813',
    intro: 'Some lamps on the old bridge are broken: they stay dark, cannot be tapped and are never toggled, so the street has gaps. Tapping a working lamp toggles it and its four neighbours. Light every working lamp.',
    fact: 'The Gas Light and Coke Company, chartered in 1812 as the world’s first gas company, lit Westminster Bridge with gas on 31 December 1813.',
    pattern: 'plus',
    broken: 0.14,
  },
  'seven-dials': {
    title: 'Seven Dials',
    intro: 'Where seven streets meet, the mains run on the slant: tapping a lamp toggles it and its four diagonal neighbours — never the lamps beside it. Light every lamp.',
    fact: 'Thomas Neale laid out Seven Dials in the early 1690s around a pillar bearing six sundials — the pillar itself is the seventh. By the gaslit 19th century it was one of London’s most notorious slums.',
    pattern: 'cross',
  },
  'embankment': {
    title: 'Victoria Embankment',
    intro: 'Bazalgette’s riverside lamps share one great main: tapping a lamp toggles it and all eight lamps around it. A few are broken. Light the whole embankment.',
    fact: 'Joseph Bazalgette’s Victoria Embankment (opened 1870) hid a main sewer, an underground railway and gas mains beneath its road; its dolphin lamp-posts by George Vulliamy still line the Thames.',
    pattern: 'king',
    broken: 0.08,
  },
  'lantern-festival': {
    title: 'The Lantern Festival',
    intro: 'On the fifteenth night of the New Year the palace hangs its lanterns in a lattice, each wick linked to the eight around it: tapping a lantern toggles it and all eight neighbours. Light every lantern.',
    fact: 'The Lantern Festival closes the Chinese New Year on the fifteenth night of the first month. At the Qing court the emperor watched lanterns and fireworks at the Yuanmingyuan, where Jesuit artists such as Castiglione also worked.',
    pattern: 'king',
  },
  'peter-street': {
    title: 'Great Peter Street Works',
    intro: 'The new burners have three notches — dark, dim, bright. Each tap turns a lamp and its four neighbours up one notch, and bright wraps round to dark. Turn every lamp to bright.',
    fact: 'The Gas Light and Coke Company built its first gasworks in Great Peter Street, Westminster. Its engineer Samuel Clegg devised the gas meter in 1815, so customers could be charged for what they burned.',
    pattern: 'plus',
    phases: 3,
  },
}

// ── Pure logic ─────────────────────────────────────────────────────────────────

export interface Board {
  n: number
  /** true where a lamp is broken (not part of the puzzle). */
  holes: boolean[]
  /** Brightness of each lamp, 0 … phases − 1; fully lit at phases − 1. Holes are 0. */
  lit: number[]
  /** Brightness steps per lamp (2 = plain on/off). */
  phases: number
}

const NEIGHBOURS: Record<Pattern, [number, number][]> = {
  plus: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
  cross: [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
  king: [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
}

/** Cells toggled by pressing cell `i` (holes excluded). */
export function affected(n: number, holes: boolean[], pattern: Pattern, i: number): number[] {
  const r = Math.floor(i / n), c = i % n
  const out: number[] = []
  for (const [dr, dc] of NEIGHBOURS[pattern]) {
    const rr = r + dr, cc = c + dc
    if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue
    const j = rr * n + cc
    if (!holes[j]) out.push(j)
  }
  return out
}

export function press(board: Board, pattern: Pattern, i: number): Board {
  if (board.holes[i]) return board
  const lit = [...board.lit]
  for (const j of affected(board.n, board.holes, pattern, i)) lit[j] = (lit[j] + 1) % board.phases
  return { ...board, lit }
}

export const isLit = (board: Board, i: number) => board.lit[i] === board.phases - 1

export function isSolved(board: Board): boolean {
  return board.lit.every((_, i) => board.holes[i] || isLit(board, i))
}

/** A fully lit street of the given size. */
export function litStreet(n: number, holes: boolean[], phases: number): Board {
  return { n, holes, lit: holes.map(h => (h ? 0 : phases - 1)), phases }
}

/**
 * Fewest presses that light every lamp, by Gaussian elimination over GF(p)
 * (p = phases: 2 or 3) and a search of the null space. Returns the presses
 * (cell indices, a lamp listed twice when it is pressed twice) of one optimal
 * solution, or null when the board cannot be solved.
 */
export function solveOptimal(board: Board, pattern: Pattern): number[] | null {
  const { n, holes, lit } = board
  const P = board.phases
  const inv = (v: number) => (P === 3 ? v : 1) // 1⁻¹ = 1, 2⁻¹ = 2 (mod 3)
  const cells: number[] = []
  for (let i = 0; i < n * n; i++) if (!holes[i]) cells.push(i)
  const m = cells.length
  const idx = new Map(cells.map((c, k) => [c, k]))
  // Row per lamp: which presses raise it, and how many notches it still needs.
  const rows: Uint8Array[] = cells.map(() => new Uint8Array(m + 1))
  cells.forEach((c, k) => {
    for (const j of affected(n, holes, pattern, c)) { const row = rows[idx.get(j)!]; row[k] = (row[k] + 1) % P }
  })
  cells.forEach((c, k) => { rows[k][m] = (P - 1 - lit[c] + P) % P })
  const pivotCol: number[] = []
  let r = 0
  for (let col = 0; col < m && r < m; col++) {
    let p = r
    while (p < m && !rows[p][col]) p++
    if (p === m) continue
    ;[rows[r], rows[p]] = [rows[p], rows[r]]
    const f = inv(rows[r][col])
    if (f !== 1) for (let k = col; k <= m; k++) rows[r][k] = (rows[r][k] * f) % P
    for (let q = 0; q < m; q++) {
      const a = rows[q][col]
      if (q !== r && a) for (let k = col; k <= m; k++) rows[q][k] = (rows[q][k] + (P - a) * rows[r][k]) % P
    }
    pivotCol.push(col)
    r++
  }
  for (let q = r; q < m; q++) if (rows[q][m]) return null
  const isPivot = new Uint8Array(m)
  pivotCol.forEach(c => { isPivot[c] = 1 })
  const free: number[] = []
  for (let c = 0; c < m; c++) if (!isPivot[c]) free.push(c)
  // Each assignment of the free variables gives one solution; take the lightest.
  const fk = Math.min(free.length, P === 2 ? 18 : 11)
  const combos = P ** fk
  let best: Uint8Array | null = null, bestW = Infinity
  const x = new Uint8Array(m)
  for (let mask = 0; mask < combos; mask++) {
    x.fill(0)
    let rest = mask
    for (let k = 0; k < fk; k++) { x[free[k]] = rest % P; rest = Math.floor(rest / P) }
    for (let k = 0; k < r; k++) {
      const row = rows[k]
      let v = row[m]
      for (const c of free) if (row[c] && x[c]) v = (v + P * P - row[c] * x[c]) % P
      x[pivotCol[k]] = v
    }
    let w = 0
    for (let k = 0; k < m; k++) w += x[k]
    if (w < bestW) { bestW = w; best = Uint8Array.from(x) }
  }
  if (!best) return null
  const out: number[] = []
  best.forEach((v, k) => { for (let t = 0; t < v; t++) out.push(cells[k]) })
  return out
}

export interface Tier { n: number; presses: number; minOptimal: number; slack: number; hints: number }

export function tierFor(difficulty: Difficulty): Tier {
  return {
    n: scale(difficulty, [4, 4, 5, 5]),
    presses: scale(difficulty, [3, 4, 5, 6]),
    minOptimal: scale(difficulty, [3, 4, 5, 6]),
    // A wrong press costs two (it must be pressed again), so slack 4 forgives
    // two wrong lamps and slack 2 one.
    slack: scale(difficulty, [4, 4, 4, 2]),
    hints: scale(difficulty, [1, 1, 1, 0]),
  }
}

function makeHoles(n: number, share: number, rng: Rng): boolean[] {
  const holes = Array(n * n).fill(false)
  if (!share || n < 4) return holes
  const count = Math.max(1, Math.round(n * n * share))
  let placed = 0
  for (let guard = 0; placed < count && guard < 200; guard++) {
    const i = Math.floor(rng() * n * n)
    if (holes[i]) continue
    holes[i] = true
    placed++
  }
  return holes
}

export interface Puzzle { board: Board; pattern: Pattern; optimal: number; budget: number; tier: Tier }

export function generate(config: Pick<LampConfig, 'pattern' | 'broken' | 'phases'>, difficulty: Difficulty, seed: number): Puzzle {
  const tier = tierFor(difficulty)
  const { n } = tier
  const phases = config.phases ?? 2
  const rng = mulberry32(seed ^ hashString(config.pattern + (config.broken ?? 0) + (phases === 2 ? '' : `/${phases}`)))
  let best: { board: Board; optimal: number } | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const holes = makeHoles(n, config.broken ?? 0, rng)
    let board = litStreet(n, holes, phases)
    const open = holes.map((h, i) => (h ? -1 : i)).filter(i => i >= 0)
    for (let k = open.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [open[k], open[j]] = [open[j], open[k]] }
    // Three-notch burners: fewer lamps, each turned one or two notches, so the
    // number of presses to undo stays close to the two-state tiers.
    const lamps = phases === 2 ? tier.presses : Math.max(2, Math.round(tier.presses * 0.75))
    for (const i of open.slice(0, lamps)) {
      const times = phases === 2 ? 1 : 1 + Math.floor(rng() * (phases - 1))
      for (let t = 0; t < times; t++) board = press(board, config.pattern, i)
    }
    const sol = solveOptimal(board, config.pattern)
    if (!sol || sol.length === 0) continue
    if (!best || sol.length > best.optimal) best = { board, optimal: sol.length }
    if (sol.length >= tier.minOptimal) break
  }
  // Pressing any single lamp of a lit street always leaves a solvable board.
  if (!best) {
    const holes = Array(n * n).fill(false)
    const board = press(litStreet(n, holes, phases), config.pattern, Math.floor(n * n / 2))
    best = { board, optimal: solveOptimal(board, config.pattern)!.length }
  }
  return { board: best.board, pattern: config.pattern, optimal: best.optimal, budget: best.optimal + tier.slack, tier }
}

// ── Component ──────────────────────────────────────────────────────────────────

const LAMP_CSS = `
@keyframes lmp-glow { 0%,100% { box-shadow: 0 0 10px 2px rgba(251,191,36,.55) } 50% { box-shadow: 0 0 16px 5px rgba(251,191,36,.75) } }
@keyframes lmp-hint { 0%,100% { outline-color: rgba(56,189,248,.9) } 50% { outline-color: rgba(56,189,248,.2) } }
.lmp-lit { animation: lmp-glow 2.4s ease-in-out infinite }
.lmp-hint { outline: 3px solid; outline-offset: 2px; animation: lmp-hint 900ms ease-in-out infinite }
`

export default function LamplighterGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'pall-mall')
  const puzzle = useMemo(() => generate(config, difficulty, seed), [config.pattern, config.broken, config.phases, difficulty, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const { n, hints: maxHints } = puzzle.tier
  const [board, setBoard] = useState<Board>(puzzle.board)
  const [used, setUsed] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hintCell, setHintCell] = useState<number | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const left = puzzle.budget - used
  const litCount = board.lit.filter((_, i) => !board.holes[i] && isLit(board, i)).length
  const lampCount = board.holes.filter(h => !h).length

  const tap = useCallback((i: number) => {
    if (settled || board.holes[i]) return
    const next = press(board, puzzle.pattern, i)
    const u = used + 1
    setBoard(next)
    setUsed(u)
    setHintCell(null)
    if (isSolved(next)) { win(); return }
    const need = solveOptimal(next, puzzle.pattern)?.length ?? Infinity
    if (need > puzzle.budget - u) lose(puzzle.budget - u === 0 ? 'Out of presses' : 'Not enough presses left to light every lamp')
  }, [settled, board, puzzle, used, win, lose])

  const hint = useCallback(() => {
    if (settled || hintsUsed >= maxHints) return
    const sol = solveOptimal(board, puzzle.pattern)
    if (!sol?.length) return
    setHintCell(sol[0])
    setHintsUsed(h => h + 1)
  }, [settled, hintsUsed, maxHints, board, puzzle.pattern])

  const patternLabel = (puzzle.pattern === 'plus' ? '✚ lamp + 4 sides' : puzzle.pattern === 'cross' ? '✖ lamp + 4 diagonals' : '▣ lamp + all 8 around')
    + (board.phases === 3 ? ' · dark → dim → bright' : '')
  const gap = n <= 4 ? 'gap-2.5' : 'gap-1.5'

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <style>{LAMP_CSS}</style>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">{n}×{n}</p>
          <p data-testid="lmp-lit">💡 {litCount}/{lampCount}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-2 font-bold">{patternLabel}</span>
        <span data-testid="lmp-left" className={`font-bold tabular-nums ${left <= 2 ? 'text-red-600' : 'text-accent'}`}>
          Presses left: {left}
        </span>
      </div>
      <p className="text-muted text-[10px] -mt-2">Can be done in {puzzle.optimal}. You have {puzzle.budget}.</p>

      <div className="w-full max-w-[400px] mx-auto rounded-xl p-3 border border-line shadow-inner"
        style={{ background: 'radial-gradient(circle at 50% 30%, #2b2f45 0%, #14161f 75%)' }}>
        <div className={`grid aspect-square ${gap}`} style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
          {board.lit.map((level, i) => {
            const on = level === board.phases - 1
            const dim = !on && level > 0
            if (board.holes[i]) {
              return <div key={i} data-lamp={i} data-broken="true" className="rounded-full border border-dashed border-slate-600/60 flex items-center justify-center text-slate-500 text-[10px]">✕</div>
            }
            return (
              <button key={i} type="button" data-lamp={i} data-lit={on ? 'true' : 'false'} data-level={level}
                aria-label={`lamp ${Math.floor(i / n) + 1},${(i % n) + 1} ${on ? 'lit' : dim ? 'dim' : 'dark'}`}
                onClick={() => tap(i)} disabled={settled}
                className={`relative rounded-full border-2 transition-all duration-200 active:scale-95
                  ${on ? 'lmp-lit border-amber-200' : dim ? 'border-amber-700/70' : 'border-slate-500 bg-slate-800'}
                  ${hintCell === i ? 'lmp-hint' : ''}`}
                style={on ? { background: 'radial-gradient(circle at 50% 40%, #fff7d1 0%, #fbbf24 45%, #b45309 100%)' }
                  : dim ? { background: 'radial-gradient(circle at 50% 40%, #a16207 0%, #713f12 55%, #3b2a14 100%)' } : undefined}>
                <span className={`absolute left-1/2 -translate-x-1/2 bottom-[12%] w-[18%] h-[10%] rounded-sm ${on || dim ? 'bg-amber-900/50' : 'bg-slate-600'}`} />
              </button>
            )
          })}
        </div>
      </div>

      {!settled && maxHints > 0 && (
        <button type="button" onClick={hint} disabled={hintsUsed >= maxHints}
          className={`h-9 rounded-lg border text-xs font-bold ${hintsUsed < maxHints ? 'bg-panel border-line text-ink-2 hover:border-accent/50' : 'bg-paper border-line text-muted/50'}`}>
          ✦ Ask the old lamplighter ({maxHints - hintsUsed} left)
        </button>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The street is lit!" loseTitle={reason ?? 'The street stays dark'} />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
