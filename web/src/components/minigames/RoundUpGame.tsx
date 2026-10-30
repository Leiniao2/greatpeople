import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Round-Up: a wild herd stands in the middle of open country and bolts for
// the nearest edge of the board.  Each turn you post riders (or beaters) on
// empty squares, then the herd takes one step along its shortest way out.
// Close every route before it reaches the edge.  Nothing is harmed — the
// herd is counted, or driven into the stockade, and that is the win.

export const N = 9
const CENTER = (N * N - 1) / 2

interface RoundUpConfig {
  title: string
  intro: string
  animal: string
  rider: string
  obstacle: string
  fact: string
}

export const CONFIGS: Record<string, RoundUpConfig> = {
  'mongol-nerge': {
    title: 'The Great Ring',
    intro: 'The nerge closes on the steppe. Post your riders so the wild horses have no gap left to run through.',
    animal: '🐎',
    rider: '🏇',
    obstacle: '🪨',
    fact: 'The Persian historian Juvaini describes the nerge as a months-long drill: the ring of horsemen stretched for miles and any commander whose section let animals slip through was punished. At the end, elders would plead for the survivors, and the khan released them to breed for another year.',
  },
  'elephant-keddah': {
    title: 'The Elephant Forest',
    intro: 'Wild elephants are wanted for the royal army. Place beaters with drums and torches to guide the herd into the stockade — leave it no way out.',
    animal: '🐘',
    rider: '🥁',
    obstacle: '🌳',
    fact: 'The Arthashastra set aside protected elephant forests on the frontiers under a Superintendent of Elephants. Elephants were captured alive and trained, never hunted: the text prescribes death for anyone who kills one, because a war elephant was worth more than a company of soldiers.',
  },
  'wild-mustangs': {
    title: 'Mustangs of the High Plains',
    intro: 'A band of mustangs is loose on open range. Post riders to steer them into the canyon corral before they scatter.',
    animal: '🐴',
    rider: '🤠',
    obstacle: '🌵',
    fact: "Spanish horses that escaped or were traded north in the 1600s became the mustang herds of the American West. The Comanche built an empire on them, and by 1800 there may have been two million wild horses on the plains.",
  },
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export const isEdge = (i: number) => {
  const x = i % N, y = Math.floor(i / N)
  return x === 0 || y === 0 || x === N - 1 || y === N - 1
}

export function neighbours(i: number): number[] {
  const x = i % N, y = Math.floor(i / N), out: number[] = []
  if (y > 0) out.push(i - N)
  if (x < N - 1) out.push(i + 1)
  if (y < N - 1) out.push(i + N)
  if (x > 0) out.push(i - 1)
  return out
}

/** Steps from every square to the nearest open edge square; Infinity when walled off. */
export function distanceField(blocked: readonly boolean[]): number[] {
  const d = new Array<number>(N * N).fill(Infinity)
  const queue: number[] = []
  for (let i = 0; i < N * N; i++) if (isEdge(i) && !blocked[i]) { d[i] = 0; queue.push(i) }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h]
    for (const n of neighbours(c)) if (!blocked[n] && d[n] === Infinity) { d[n] = d[c] + 1; queue.push(n) }
  }
  return d
}

export const isTrapped = (blocked: readonly boolean[], animal: number) => distanceField(blocked)[animal] === Infinity

/** The herd's next square along a shortest way out, or null if it is enclosed. */
export function herdStep(blocked: readonly boolean[], animal: number): number | null {
  const d = distanceField(blocked)
  if (d[animal] === Infinity) return null
  let best: number | null = null
  for (const n of neighbours(animal)) if (!blocked[n] && (best === null || d[n] < d[best])) best = n
  return best
}

/** Squares on some shortest way out, for the path hint. */
export function escapeRoutes(blocked: readonly boolean[], animal: number): Set<number> {
  const d = distanceField(blocked)
  const out = new Set<number>()
  if (d[animal] === Infinity) return out
  const stack = [animal]
  while (stack.length) {
    const c = stack.pop()!
    for (const n of neighbours(c)) {
      if (!blocked[n] && d[n] === d[c] - 1 && !out.has(n)) { out.add(n); stack.push(n) }
    }
  }
  return out
}

/** Higher is better for the riders: distance out first, then fewer shortest routes. */
function pressure(blocked: readonly boolean[], animal: number): number {
  const d = distanceField(blocked)
  if (d[animal] === Infinity) return Number.MAX_SAFE_INTEGER
  const memo = new Map<number, number>()
  const routes = (i: number): number => {
    if (d[i] === 0) return 1
    const m = memo.get(i)
    if (m !== undefined) return m
    let s = 0
    for (const n of neighbours(i)) if (!blocked[n] && d[n] === d[i] - 1) s += routes(n)
    s = Math.min(s, 1e6)
    memo.set(i, s)
    return s
  }
  return d[animal] * 1e7 - routes(animal)
}

/** One rider placement by a simple greedy player; used to prove a board winnable. */
export function greedyPlacement(blocked: readonly boolean[], animal: number): number {
  const b = [...blocked]
  let best = -1, bestScore = -Infinity
  for (let i = 0; i < N * N; i++) {
    if (b[i] || i === animal) continue
    b[i] = true
    const s = pressure(b, animal)
    b[i] = false
    if (s > bestScore) { bestScore = s; best = i }
  }
  return best
}

/** Play the board out with the greedy player; returns the riders it placed if it wins. */
export function greedySolve(blocked: readonly boolean[], animal: number, riders: number): number[] | null {
  const b = [...blocked]
  const placed: number[] = []
  for (let turn = 0; turn < N * N; turn++) {
    for (let r = 0; r < riders; r++) {
      const c = greedyPlacement(b, animal)
      if (c < 0) break
      b[c] = true
      placed.push(c)
      if (isTrapped(b, animal)) return placed
    }
    const next = herdStep(b, animal)
    if (next === null) return placed
    animal = next
    if (isEdge(animal)) return null
  }
  return null
}

export const ridersFor = (d: Difficulty) => scale(d, [2, 2, 1, 1])
export const obstaclesFor = (d: Difficulty) => scale(d, [10, 4, 20, 15])

export interface RoundUpBoard { blocked: boolean[]; animal: number }

/** A seeded board the greedy player can win; reseeds until one is found. */
export function makeBoard(seed: number, difficulty: Difficulty): RoundUpBoard {
  const riders = ridersFor(difficulty), rocks = obstaclesFor(difficulty)
  let fallback: RoundUpBoard | null = null
  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = mulberry32(seed + attempt * 7919)
    const blocked = new Array<boolean>(N * N).fill(false)
    const near = new Set([CENTER, ...neighbours(CENTER)])
    for (let placed = 0; placed < rocks;) {
      const i = Math.floor(rng() * N * N)
      if (blocked[i] || near.has(i)) continue
      blocked[i] = true
      placed++
    }
    const board = { blocked, animal: CENTER }
    fallback ??= board
    if (greedySolve(blocked, CENTER, riders)) return board
  }
  return fallback!
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function RoundUpGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'mongol-nerge')
  const riders = ridersFor(difficulty)
  const showRoutes = difficulty <= 2
  const board = useMemo(() => makeBoard(seed, difficulty), [seed, difficulty])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const [rocks] = useState(() => board.blocked)
  const [posts, setPosts] = useState<Set<number>>(() => new Set())
  const [animal, setAnimal] = useState(board.animal)
  const [left, setLeft] = useState(riders)
  const [turn, setTurn] = useState(1)

  const blocked = useMemo(() => rocks.map((r, i) => r || posts.has(i)), [rocks, posts])
  const routes = useMemo(() => (showRoutes ? escapeRoutes(blocked, animal) : new Set<number>()), [showRoutes, blocked, animal])

  const place = (i: number) => {
    if (settled || blocked[i] || i === animal) return
    const nextPosts = new Set(posts).add(i)
    const nextBlocked = rocks.map((r, j) => r || nextPosts.has(j))
    setPosts(nextPosts)
    if (isTrapped(nextBlocked, animal)) { win(); return }
    if (left > 1) { setLeft(left - 1); return }
    // The herd runs once the turn's riders are posted.
    const step = herdStep(nextBlocked, animal)
    if (step === null) { win(); return }
    setAnimal(step)
    if (isEdge(step)) { lose('the herd broke through'); return }
    setLeft(riders)
    setTurn(t => t + 1)
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className="shrink-0 text-[10px] text-muted text-right">
          Turn <b className="text-ink">{turn}</b><br />
          {cfg.rider} × <b className="text-ink">{settled ? 0 : left}</b>
        </p>
      </div>

      <div className="self-center grid gap-[2px] p-1 rounded-lg bg-emerald-900/20 border border-line"
        style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}>
        {blocked.map((b, i) => {
          const isAnimal = i === animal
          const content = isAnimal ? cfg.animal : posts.has(i) ? cfg.rider : rocks[i] ? cfg.obstacle : ''
          return (
            <button key={i} onClick={() => place(i)} disabled={settled || b || isAnimal}
              aria-label={`square ${i % N + 1},${Math.floor(i / N) + 1}`}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded flex items-center justify-center text-lg leading-none transition-colors
                ${isAnimal ? 'bg-amber-200/70' : b ? 'bg-panel-2' : routes.has(i) ? 'bg-amber-100 hover:bg-amber-200' : isEdge(i) ? 'bg-lime-100/70 hover:bg-lime-200' : 'bg-lime-50 hover:bg-lime-100'}
                ${!b && !isAnimal && !settled ? 'cursor-pointer active:scale-90' : 'cursor-default'}`}>
              {content}
            </button>
          )
        })}
      </div>

      <p className="text-[10px] text-muted/80 text-center">
        Post {riders === 1 ? 'one' : riders} {cfg.rider} per turn, then {cfg.animal} runs one square toward the edge.
        {showRoutes ? ' Shaded squares are its shortest ways out.' : ''}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The ring holds!" loseTitle="The herd broke through" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
