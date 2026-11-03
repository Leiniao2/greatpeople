import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Stone Haulers — classic Sokoban.  Walk the overseer round the yard and
// push limestone blocks onto the marked plinths: push only, one block at a
// time, never pull.
//
//   D1  tier-1 yards (2 blocks, ~10 pushes)     labour cap: par × 3 + 20
//   D2  tier-2 yards (3 blocks, ~17 pushes)     labour cap: par × 2.5 + 15
//   D3  tier-3 yards (3 blocks, 20–25 pushes)     labour cap: par × 2 + 10
//   D4  tier-4 yards (3–4 blocks, 27–36 pushes)     labour cap: par + max(10, par / 3)
//
// "Labour" counts every step taken, including steps later undone and steps
// before a restart — the day's daylight is spent either way.  Undo and
// restart are always free to use; only the clock is unforgiving.
//
// Every yard in the pool was curated from a reverse-search generator (the
// start is the state farthest from solved), and is checked by the BFS solver
// exported below (the tests replay the solver's answer through the rules).
// The seed chooses a yard from the tier and one of its eight rotations or
// mirror images, so 24 Arcade levels rarely look the same twice.

interface SokobanConfig {
  title: string
  intro: string
  fact: string
  block: string
  blockOnGoal: string
  floor: string
  wall: string
  goal: string
  worker: string
  /** Pool offset so each site starts its tier on a different yard. */
  offset: number
}

export const CONFIGS: Record<string, SokobanConfig> = {
  'giza-ramp': {
    title: 'The Giza Ramp',
    intro: 'Haul the limestone blocks onto the marked sledge stations. Blocks can only be pushed — never pulled — and only one at a time.',
    fact: 'The Great Pyramid of Khufu (c. 2560 BCE) holds about 2.3 million stone blocks. A painting in the tomb of Djehutihotep shows a colossus dragged on a sledge while a worker pours water on the sand in front of it — wet sand roughly halves the pulling force.',
    block: 'bg-[#e8d9a8] border-[#a88f52]', blockOnGoal: 'bg-[#f3c96b] border-[#b07d1c]',
    floor: 'bg-[#f2e6c4]', wall: 'bg-[#b08a52]', goal: 'border-[#b07d1c]', worker: '𓀀', offset: 0,
  },
  karnak: {
    title: 'Karnak Hypostyle',
    intro: 'Set the sandstone drums onto their column bases in the great hall. Push, never pull — a drum jammed in a corner stays there.',
    fact: 'The Great Hypostyle Hall at Karnak, finished under Seti I and Ramesses II (13th century BCE), has 134 sandstone columns; the twelve central ones stand about 21 metres tall and were built up from stacked stone drums.',
    block: 'bg-[#d9b48a] border-[#9a6a3a]', blockOnGoal: 'bg-[#e8a35c] border-[#9a5a1a]',
    floor: 'bg-[#efdcc0]', wall: 'bg-[#8e6a48]', goal: 'border-[#9a5a1a]', worker: '𓀀', offset: 2,
  },
  stonehenge: {
    title: 'Raising Stonehenge',
    intro: 'Roll the sarsens onto the marked sockets of the circle. Each stone can only be pushed, and only one at a time.',
    fact: 'The sarsen stones of Stonehenge were set up around 2500 BCE. A 2020 geochemical study traced most of them to West Woods, about 25 km north; the smaller bluestones came over 200 km from the Preseli Hills in Wales.',
    block: 'bg-[#c9c6bb] border-[#7d796c]', blockOnGoal: 'bg-[#9fb58a] border-[#55703e]',
    floor: 'bg-[#dfe6c8]', wall: 'bg-[#6f7b5a]', goal: 'border-[#55703e]', worker: '🧍', offset: 4,
  },
  'baalbek-quarry': {
    title: 'The Baalbek Quarry',
    intro: 'Lever the dressed blocks onto the temple podium marks. A block pushed against the quarry face cannot be pulled back.',
    fact: 'The Roman quarry at Baalbek in Lebanon still holds the "Stone of the Pregnant Woman" and two even larger cut blocks; the largest, measured in 2014, weighs an estimated 1,650 tonnes — among the biggest stones ever quarried.',
    block: 'bg-[#e6d3c0] border-[#9b7d64]', blockOnGoal: 'bg-[#d9a98a] border-[#8b4f2a]',
    floor: 'bg-[#f1e4d6]', wall: 'bg-[#9b7d64]', goal: 'border-[#8b4f2a]', worker: '🧍', offset: 6,
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Levels ─────────────────────────────────────────────────────────────────────
// XSB notation: # wall, space floor, . goal, $ block, * block on goal,
// @ worker, + worker on goal.  `par` is the optimal number of moves (steps),
// found by solve() and pinned by the tests.

export interface LevelDef { map: string[]; par: number; tier: 1 | 2 | 3 | 4 }

export const LEVELS: LevelDef[] = [
  // ── tier 1 ──
  { tier: 1, par: 29, map: [ // 10 pushes
    '#######',
    '#  #  #',
    '#  $  #',
    '#  $  #',
    '# #@..#',
    '#######',
  ] },
  { tier: 1, par: 31, map: [ // 10 pushes
    '#######',
    '# ##  #',
    '# $ $ #',
    '#     #',
    '#+ .  #',
    '#######',
  ] },
  { tier: 1, par: 32, map: [ // 10 pushes
    '#######',
    '#     #',
    '# $   #',
    '##$  ##',
    '#@  ..#',
    '#######',
  ] },
  { tier: 1, par: 34, map: [ // 10 pushes
    '#######',
    '#   . #',
    '# $   #',
    '##$ ###',
    '#@  . #',
    '#######',
  ] },
  { tier: 1, par: 25, map: [ // 9 pushes
    '#######',
    '#   . #',
    '#.    #',
    '# $$  #',
    '#@#   #',
    '#######',
  ] },
  { tier: 1, par: 25, map: [ // 9 pushes
    '#######',
    '#@#   #',
    '# $ $##',
    '#    .#',
    '#.    #',
    '#######',
  ] },
  // ── tier 2 ──
  { tier: 2, par: 36, map: [ // 17 pushes
    '########',
    '#.  #@.#',
    '#   $$ #',
    '#   $  #',
    '#   ####',
    '#  .   #',
    '########',
  ] },
  { tier: 2, par: 44, map: [ // 17 pushes
    '########',
    '#+#    #',
    '#  #$ ##',
    '#  $ $ #',
    '#     .#',
    '#  #  .#',
    '########',
  ] },
  { tier: 2, par: 47, map: [ // 17 pushes
    '########',
    '##  ##.#',
    '##$. #.#',
    '# $$   #',
    '#      #',
    '#@     #',
    '########',
  ] },
  { tier: 2, par: 51, map: [ // 17 pushes
    '########',
    '#    #@#',
    '#  $ $ #',
    '# #    #',
    '# #$  ##',
    '#.# . .#',
    '########',
  ] },
  { tier: 2, par: 53, map: [ // 17 pushes
    '########',
    '# .#. @#',
    '#  # # #',
    '#     .#',
    '# $$ $ #',
    '#  # # #',
    '########',
  ] },
  { tier: 2, par: 40, map: [ // 16 pushes
    '########',
    '#   .. #',
    '# $    #',
    '##$    #',
    '##@*## #',
    '##  ## #',
    '########',
  ] },
  // ── tier 3 ──
  { tier: 3, par: 76, map: [ // 25 pushes
    '#########',
    '#   #+. #',
    '# $  #  #',
    '#  $$   #',
    '#  #    #',
    '#    #. #',
    '#########',
  ] },
  { tier: 3, par: 61, map: [ // 23 pushes
    '#########',
    '#  # ##.#',
    '# $  #  #',
    '# $  .$ #',
    '#    # .#',
    '## ##@ ##',
    '#########',
  ] },
  { tier: 3, par: 65, map: [ // 23 pushes
    '#########',
    '#   ##  #',
    '# $  $ ##',
    '##$     #',
    '#     ..#',
    '# ##   +#',
    '#########',
  ] },
  { tier: 3, par: 80, map: [ // 22 pushes
    '#########',
    '#  .    #',
    '# . .$#@#',
    '#      ##',
    '#  ##$$ #',
    '#       #',
    '#########',
  ] },
  { tier: 3, par: 46, map: [ // 20 pushes
    '#########',
    '#  .   ##',
    '##$  .  #',
    '#   .   #',
    '#   $ $ #',
    '##@ ### #',
    '#########',
  ] },
  { tier: 3, par: 48, map: [ // 20 pushes
    '#########',
    '#  #   ##',
    '#   $ . #',
    '# $ $   #',
    '#  #   .#',
    '# #@  . #',
    '#########',
  ] },
  // ── tier 4 ──
  { tier: 4, par: 104, map: [ // 36 pushes
    '#########',
    '#    @# #',
    '#  #$*$ #',
    '#     . #',
    '#   # .##',
    '#   #$  #',
    '# # #.  #',
    '#########',
  ] },
  { tier: 4, par: 86, map: [ // 32 pushes
    '#########',
    '#. .    #',
    '#       #',
    '# #  #  #',
    '# .  #  #',
    '# $$$ $ #',
    '#@#. #  #',
    '#########',
  ] },
  { tier: 4, par: 80, map: [ // 29 pushes
    '#########',
    '# #     #',
    '#.   .$##',
    '#    #@ #',
    '#  #  $ #',
    '# $ $ ###',
    '###..  ##',
    '#########',
  ] },
  { tier: 4, par: 87, map: [ // 33 pushes
    '##########',
    '#   #    #',
    '#      $##',
    '#  #     #',
    '##  .# $##',
    '# .  # $ #',
    '#@. #    #',
    '##########',
  ] },
  { tier: 4, par: 75, map: [ // 27 pushes
    '##########',
    '##       #',
    '#        #',
    '#@$$##   #',
    '##$     .#',
    '#   ##  ##',
    '# # ##. .#',
    '##########',
  ] },
  { tier: 4, par: 82, map: [ // 27 pushes
    '##########',
    '##@  #   #',
    '####   . #',
    '## .$  # #',
    '# #  $.  #',
    '#  $ ##  #',
    '#     ####',
    '##########',
  ] },
]

// ── Rules ──────────────────────────────────────────────────────────────────────

export interface Level {
  w: number
  h: number
  /** true = wall (or outside the yard). */
  walls: boolean[]
  goals: number[]
  boxes: number[]
  player: number
}

export interface SokoState { player: number; boxes: number[] }

export type Dir = 'U' | 'D' | 'L' | 'R'
export const DIRS: Dir[] = ['U', 'D', 'L', 'R']

export function parseLevel(map: string[]): Level {
  const h = map.length, w = Math.max(...map.map(r => r.length))
  const walls: boolean[] = [], goals: number[] = [], boxes: number[] = []
  let player = -1
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = map[r][c] ?? ' '
    const i = r * w + c
    walls.push(ch === '#')
    if (ch === '.' || ch === '*' || ch === '+') goals.push(i)
    if (ch === '$' || ch === '*') boxes.push(i)
    if (ch === '@' || ch === '+') player = i
  }
  // Floor the worker cannot reach is outside the yard: treat it as wall.
  const seen = new Set<number>([player])
  const stack = [player]
  while (stack.length) {
    const p = stack.pop()!
    for (const d of DIRS) {
      const q = stepIndex(w, h, p, d)
      if (q < 0 || walls[q] || seen.has(q)) continue
      seen.add(q); stack.push(q)
    }
  }
  for (let i = 0; i < w * h; i++) if (!seen.has(i)) walls[i] = true
  return { w, h, walls, goals, boxes: [...boxes].sort((a, b) => a - b), player }
}

function stepIndex(w: number, h: number, i: number, d: Dir): number {
  const r = Math.floor(i / w), c = i % w
  const [nr, nc] = d === 'U' ? [r - 1, c] : d === 'D' ? [r + 1, c] : d === 'L' ? [r, c - 1] : [r, c + 1]
  if (nr < 0 || nc < 0 || nr >= h || nc >= w) return -1
  return nr * w + nc
}

/** Apply one step. Returns null when the step is blocked. */
export function move(level: Level, s: SokoState, d: Dir): { state: SokoState; pushed: boolean } | null {
  const { w, h, walls } = level
  const to = stepIndex(w, h, s.player, d)
  if (to < 0 || walls[to]) return null
  const bi = s.boxes.indexOf(to)
  if (bi < 0) return { state: { player: to, boxes: s.boxes }, pushed: false }
  const beyond = stepIndex(w, h, to, d)
  if (beyond < 0 || walls[beyond] || s.boxes.includes(beyond)) return null
  const boxes = [...s.boxes]
  boxes[bi] = beyond
  boxes.sort((a, b) => a - b)
  return { state: { player: to, boxes }, pushed: true }
}

export function isSolved(level: Level, s: SokoState): boolean {
  return s.boxes.every(b => level.goals.includes(b))
}

/** Cells from which a block can still be pushed onto some goal. */
export function liveCells(level: Level): boolean[] {
  const { w, h, walls } = level
  const live = Array(w * h).fill(false)
  const stack = [...level.goals]
  for (const g of stack) live[g] = true
  // Reverse pulls: a block at q can reach p if it can be pushed q→p,
  // which needs the worker standing on the far side of q.
  while (stack.length) {
    const p = stack.pop()!
    for (const d of DIRS) {
      const q = stepIndex(w, h, p, d)
      if (q < 0 || walls[q] || live[q]) continue
      const back = stepIndex(w, h, q, d)
      if (back < 0 || walls[back]) continue
      live[q] = true
      stack.push(q)
    }
  }
  return live
}

/**
 * Breadth-first search over (worker, blocks): returns a move-optimal list of
 * steps, or null when the yard cannot be solved.  Blocks pushed onto dead
 * cells are pruned.  `limit` caps the states explored.
 */
export function solve(level: Level, start?: SokoState, limit = 3_000_000): Dir[] | null {
  const live = liveCells(level)
  const s0 = start ?? { player: level.player, boxes: level.boxes }
  const key = (s: SokoState) => s.player + ':' + s.boxes.join(',')
  const prev = new Map<string, [string, Dir] | null>()
  const k0 = key(s0)
  prev.set(k0, null)
  if (isSolved(level, s0)) return []
  let frontier: SokoState[] = [s0]
  while (frontier.length && prev.size < limit) {
    const next: SokoState[] = []
    for (const s of frontier) {
      const ks = key(s)
      for (const d of DIRS) {
        const m = move(level, s, d)
        if (!m) continue
        if (m.pushed && m.state.boxes.some(b => !live[b])) continue
        const kn = key(m.state)
        if (prev.has(kn)) continue
        prev.set(kn, [ks, d])
        if (isSolved(level, m.state)) {
          const path: Dir[] = []
          let cur: string = kn
          for (let link = prev.get(cur); link; link = prev.get(cur)) { path.push(link[1]); cur = link[0] }
          return path.reverse()
        }
        next.push(m.state)
      }
    }
    frontier = next
  }
  return null
}

/** Rotate/mirror a map: t in 0..7 (bit 0 mirror, bits 1–2 quarter turns). */
export function transformMap(map: string[], t: number): string[] {
  const w = Math.max(...map.map(r => r.length))
  let g = map.map(r => r.padEnd(w, ' ').split(''))
  if (t & 1) g = g.map(r => [...r].reverse())
  for (let k = 0; k < (t >> 1) % 4; k++) {
    const h = g.length, ww = g[0].length
    const n: string[][] = Array.from({ length: ww }, () => Array(h).fill(' '))
    for (let r = 0; r < h; r++) for (let c = 0; c < ww; c++) n[c][h - 1 - r] = g[r][c]
    g = n
  }
  return g.map(r => r.join(''))
}

export interface Plan { levelIndex: number; transform: number; level: Level; par: number; cap: number }

export function capFor(difficulty: Difficulty, par: number): number {
  return scale(difficulty, [
    par * 3 + 20,
    Math.ceil(par * 2.5) + 15,
    par * 2 + 10,
    par + Math.max(10, Math.ceil(par / 3)),
  ])
}

export function levelsForTier(tier: Difficulty): number[] {
  return LEVELS.map((l, i) => (l.tier === tier ? i : -1)).filter(i => i >= 0)
}

export function planLevel(configId: string, difficulty: Difficulty, seed: number, params?: Record<string, unknown>): Plan {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'giza-ramp')
  const pool = levelsForTier(difficulty)
  const h = hashString(`${configId}:${seed}`)
  const forced = typeof params?.level === 'number' ? (params.level as number) : null
  const levelIndex = forced ?? pool[(h + cfg.offset) % pool.length]
  const transform = forced !== null ? 0 : (h >>> 8) % 8
  const def = LEVELS[levelIndex]
  const level = parseLevel(transformMap(def.map, transform))
  return { levelIndex, transform, level, par: def.par, cap: capFor(difficulty, def.par) }
}

// ── Component ──────────────────────────────────────────────────────────────────

const KEYS: Record<string, Dir> = {
  ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
  w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R',
}

export default function SokobanGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'giza-ramp')
  const plan = useMemo(() => planLevel(configId, difficulty, seed, params), [configId, difficulty, seed, params])
  const { level, par, cap } = plan
  const initial: SokoState = useMemo(() => ({ player: level.player, boxes: level.boxes }), [level])

  const [state, setState] = useState<SokoState>(initial)
  const [history, setHistory] = useState<SokoState[]>([])
  const [labour, setLabour] = useState(0)
  const [pushes, setPushes] = useState(0)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  // Refs let rapid key presses chain without waiting for a re-render.
  const live = useRef({ state, history, labour, pushes, settled })
  live.current = { state, history, labour, pushes, settled }

  useEffect(() => {
    setState(initial); setHistory([]); setLabour(0); setPushes(0)
  }, [initial])

  const step = useCallback((d: Dir) => {
    const cur = live.current
    if (cur.settled) return
    const m = move(level, cur.state, d)
    if (!m) return
    const labourNext = cur.labour + 1
    const history = [...cur.history, cur.state]
    live.current = { ...cur, state: m.state, history, labour: labourNext, pushes: cur.pushes + (m.pushed ? 1 : 0) }
    setState(m.state)
    setHistory(history)
    setLabour(labourNext)
    if (m.pushed) setPushes(p => p + 1)
    if (isSolved(level, m.state)) { live.current.settled = true; win() }
    else if (labourNext >= cap) { live.current.settled = true; lose('The sun set before the blocks were in place') }
  }, [level, cap, win, lose])

  const undo = useCallback(() => {
    const cur = live.current
    if (cur.settled || !cur.history.length) return
    const prev = cur.history[cur.history.length - 1]
    const history = cur.history.slice(0, -1)
    live.current = { ...cur, state: prev, history }
    setState(prev); setHistory(history)
  }, [])

  const restart = useCallback(() => {
    const cur = live.current
    if (cur.settled) return
    live.current = { ...cur, state: initial, history: [] }
    setState(initial); setHistory([])
  }, [initial])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const d = KEYS[e.key]
      if (d) { e.preventDefault(); step(d); return }
      if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace' || e.key === 'u') { e.preventDefault(); undo() }
      if (e.key === 'r' || e.key === 'R') restart()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, undo, restart])

  // Swipe on the board.
  const touch = useRef<[number, number] | null>(null)
  const onPointerDown = (e: React.PointerEvent) => { touch.current = [e.clientX, e.clientY] }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!touch.current) return
    const dx = e.clientX - touch.current[0], dy = e.clientY - touch.current[1]
    touch.current = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'))
  }
  // Tap a neighbouring cell to step there.
  const tapCell = (i: number) => {
    const { w } = level
    const pr = Math.floor(state.player / w), pc = state.player % w
    const r = Math.floor(i / w), c = i % w
    if (pr === r && Math.abs(pc - c) === 1) step(c > pc ? 'R' : 'L')
    else if (pc === c && Math.abs(pr - r) === 1) step(r > pr ? 'D' : 'U')
  }

  const placed = state.boxes.filter(b => level.goals.includes(b)).length
  const liveSet = useMemo(() => liveCells(level), [level])
  const stuck = state.boxes.some(b => !liveSet[b])
  const left = cap - labour

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2" data-testid="soko-placed">{placed} / {level.goals.length} set</p>
          <p data-testid="soko-moves">Moves {history.length}</p>
          <p>Pushes {pushes} · Par {par}</p>
          <p className={left <= 10 ? 'text-red-600 font-bold' : ''} data-testid="soko-labour">Daylight {Math.max(0, left)}</p>
        </div>
      </div>

      <div className="w-full max-w-[420px] mx-auto select-none rounded-lg overflow-hidden border-2 border-ink-2 shadow-md"
        style={{ touchAction: 'none' }} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${level.w}, 1fr)` }}>
          {level.walls.map((wall, i) => {
            const goal = level.goals.includes(i)
            const box = state.boxes.includes(i)
            const me = state.player === i
            return (
              <button key={i} type="button" tabIndex={-1} aria-label={wall ? 'wall' : box ? 'block' : goal ? 'mark' : 'floor'}
                data-cell={i} onClick={() => tapCell(i)}
                className={`relative aspect-square ${wall ? cfg.wall : cfg.floor}`}>
                {!wall && goal && <span className={`absolute inset-[22%] rounded-full border-2 border-dashed ${cfg.goal}`} />}
                {box && (
                  <span className={`absolute inset-[8%] rounded-[3px] border-2 shadow-sm ${goal ? cfg.blockOnGoal : cfg.block}
                    ${!goal && !liveSet[i] ? 'ring-2 ring-red-500/70' : ''}`} />
                )}
                {me && <span className="absolute inset-0 flex items-center justify-center text-[min(5.5vw,22px)] leading-none">{cfg.worker}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {stuck && !settled && (
        <p className="text-red-600 text-[11px] text-center font-bold">A block is wedged where it can never reach a mark — undo or restart.</p>
      )}

      {!settled && (
        <div className="flex items-center justify-between gap-3 w-full max-w-[420px] mx-auto">
          <div className="grid grid-cols-3 gap-1 w-[132px]">
            <span />
            <PadButton label="up" onClick={() => step('U')}>▲</PadButton>
            <span />
            <PadButton label="left" onClick={() => step('L')}>◀</PadButton>
            <PadButton label="down" onClick={() => step('D')}>▼</PadButton>
            <PadButton label="right" onClick={() => step('R')}>▶</PadButton>
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <button type="button" onClick={undo} disabled={!history.length}
              className="h-10 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold disabled:opacity-40">↶ Undo</button>
            <button type="button" onClick={restart}
              className="h-10 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold">⟲ Restart</button>
          </div>
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : 'Arrows / WASD, swipe, or tap next to the worker · Z undo · R restart'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Every block in place!" loseTitle="The sun has set" />
    </div>
  )
}

function PadButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick}
      className="h-10 rounded-lg border bg-panel border-line text-ink font-bold active:bg-accent/20">{children}</button>
  )
}
