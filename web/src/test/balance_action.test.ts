// Difficulty balance for the "action" group: every tier is doable by a
// casual player and gets harder from D1 to D4.  The win rates below come
// from simple human-like players, not from the solvers that prove a board
// winnable — they are rough, so the bounds are wide; what they pin down is
// that no tier slides back to "one mistake loses" or "plays like D1".
import { createElement } from 'react'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Difficulty } from '@/games/types'
import { mulberry32 } from '@/components/minigames/_shared'
import { CONFIGS as SOCCER, readFor, goalsFor } from '@/components/minigames/SoccerGame'
import { CONFIGS as REPORTER, livesFor } from '@/components/minigames/ReporterFleeGame'
import { CONFIGS as CHIMP, timeFor as chimpTime, passMark as chimpPass } from '@/components/minigames/ChimpMathGame'
import { CONFIGS as CLOCKS, timeFor as clockTime, passMark as clockPass, showsDifference, utcLabel, differenceLabel } from '@/components/minigames/WorldClockGame'
import { musicRules } from '@/components/minigames/MusicGame'
import { tierFor as riverTier } from '@/components/minigames/RiverRunGame'
import { tierFor as snakeTier, CONFIGS as SNAKE } from '@/components/minigames/SnakeGame'
import { rhythmRules, buildChart, newRun, hitLane, sweepMisses, verdict, CONFIGS as RHYTHM } from '@/components/minigames/RhythmGame'
import * as RU from '@/components/minigames/RoundUpGame'
import * as FS from '@/components/minigames/FieldSurveyGame'
import * as CA from '@/components/minigames/CampaignGame'
import * as PA from '@/components/minigames/PairsGame'
import BigMazeGame, { CONFIGS as MAZE, CONFIG_IDS as MAZE_IDS, generateLabyrinth, labSettings, generateLevel, initialState, step, restartLevel, settings as mazeSettings, type Labyrinth, type Dir as MazeDir } from '@/components/minigames/BigMazeGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const rate = (wins: number, n: number) => wins / n
const nonIncreasing = (xs: number[], slack = 0) => xs.every((x, i) => i === 0 || x <= xs[i - 1] + slack)

// ── Soccer (pure luck: tune the keeper) ───────────────────────────────────────

/** P(at least k goals in n kicks) with per-kick chance p. */
function atLeast(n: number, k: number, p: number) {
  let s = 0
  const C = (a: number, b: number) => { let r = 1; for (let i = 0; i < b; i++) r = (r * (a - i)) / (i + 1); return r }
  for (let g = k; g <= n; g++) s += C(n, g) * p ** g * (1 - p) ** (n - g)
  return s
}

describe('Soccer: the keeper sharpens tier by tier', () => {
  it('a shootout is won ~90% at D1, ~75% at D2 and never below 40% at D4', () => {
    for (const [id, cfg] of Object.entries(SOCCER)) {
      const wins = DIFFS.map(d => atLeast(cfg.kicks, goalsFor(cfg, d), (1 - readFor(cfg, d)) * (2 / 3)))
      expect(wins[0], `${id} D1`).toBeGreaterThanOrEqual(0.85)
      expect(wins[1], `${id} D2`).toBeGreaterThanOrEqual(0.7)
      expect(wins[3], `${id} D4`).toBeGreaterThanOrEqual(0.4)
      expect(wins[3], `${id} D4`).toBeLessThanOrEqual(0.6)
      expect(nonIncreasing(wins), `${id} ${wins.map(w => w.toFixed(2))}`).toBe(true)
    }
  })
})

// ── Short quizzes and hunts ───────────────────────────────────────────────────

describe('Reporter Flee, Chimp Math, World Clock, Music, River Run: tiers tighten monotonically', () => {
  it('Reporter Flee: lives shrink with the tier, never below one', () => {
    for (const cfg of Object.values(REPORTER)) {
      const lives = DIFFS.map(d => livesFor(cfg, d))
      expect(lives[0]).toBe(cfg.lives)
      expect(lives[3]).toBe(1)
      expect(nonIncreasing(lives)).toBe(true)
    }
  })

  it('Chimp Math: a stricter pass mark, and a clock with room for ~3 s a sum plus feedback', () => {
    for (const cfg of Object.values(CHIMP)) {
      const n = cfg.questions.length
      const marks = DIFFS.map(d => chimpPass(n, d))
      expect(marks.every((m, i) => i === 0 || m >= marks[i - 1])).toBe(true)
      expect(marks[0]).toBeLessThan(n) // a slip is allowed at first
      for (const d of DIFFS) if (chimpTime(d)) expect(chimpTime(d)).toBeGreaterThanOrEqual(1.5 * (n * 3 + n * 0.9) * 0.95)
    }
  })

  it('World Clock: offsets are printed, D1 spells the difference out, clocks fit ~10 s a question', () => {
    expect(utcLabel(-5)).toBe('UTC−5')
    expect(utcLabel(0)).toBe('UTC')
    expect(differenceLabel(-5, 9)).toBe('14 hours ahead')
    expect(showsDifference(1)).toBe(true)
    expect(showsDifference(2)).toBe(false)
    for (const cfg of Object.values(CLOCKS)) {
      const n = cfg.questions.length
      const marks = DIFFS.map(d => clockPass(n, d))
      expect(marks.every((m, i) => i === 0 || m >= marks[i - 1])).toBe(true)
      expect(marks[3]).toBeLessThan(n) // one slip is always allowed
      for (const d of DIFFS) if (clockTime(d)) expect(clockTime(d)).toBeGreaterThanOrEqual(n * 15)
    }
  })

  it('Music: D1 lets you hear the tune first, D4 stops marking notes, tries 3/3/2/2', () => {
    expect(DIFFS.map(d => musicRules(d).attempts)).toEqual([3, 3, 2, 2])
    expect(DIFFS.map(d => musicRules(d).listenFirst)).toEqual([true, false, false, false])
    expect(DIFFS.map(d => musicRules(d).markNotes)).toEqual([true, true, true, false])
  })

  it('River Run: the current starts at D2 and quickens, never below a reaction-time floor', () => {
    const ms = DIFFS.map(d => riverTier(d).currentMs)
    expect(ms[0]).toBe(0)
    for (let i = 1; i < 4; i++) expect(ms[i]).toBeGreaterThanOrEqual(1000)
    expect(ms[1]).toBeGreaterThan(ms[2])
    expect(ms[2]).toBeGreaterThan(ms[3])
  })

  it('Caravan Trail: the pace floor stays humane on a phone (≥ 120 ms a step)', () => {
    for (const cfg of Object.values(SNAKE)) {
      const floors = DIFFS.map(d => snakeTier(cfg, d).minMs)
      expect(Math.min(...floors)).toBeGreaterThanOrEqual(120)
      expect(nonIncreasing(floors)).toBe(true)
    }
  })
})

// ── Rhythm: a jittery phone player ────────────────────────────────────────────

describe('Rhythm: timing windows fit a phone', () => {
  const gauss = (rng: () => number) => Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(2 * Math.PI * rng())
  /** Taps land `bias` ms late with `sd` ms of jitter; a few notes are simply dropped. */
  function play(d: Difficulty, sd: number, bias: number, lapse: number, N = 60) {
    let wins = 0
    const ids = Object.keys(RHYTHM)
    for (let s = 1; s <= N; s++) {
      const chart = buildChart(RHYTHM[ids[s % ids.length]], d, s)
      const rng = mulberry32(s * 11)
      let st = newRun(chart), v: ReturnType<typeof verdict> = null
      for (let i = 0; i < chart.notes.length && !v; i++) {
        const at = chart.notes[i].t + bias + sd * gauss(rng)
        st = sweepMisses(st, chart, at, d)
        if (rng() >= lapse) st = hitLane(st, chart, chart.notes[i].lane, at, d).state
        v = verdict(st, chart, d)
      }
      if (!v) { st = sweepMisses(st, chart, chart.endMs + 10_000, d); v = verdict(st, chart, d) }
      if (v === 'won') wins++
    }
    return rate(wins, N)
  }
  it('a phone player (55 ms jitter, 25 ms lag, 4% dropped) wins D1–D2 and has a real shot at D4', () => {
    const wins = DIFFS.map(d => play(d, 55, 25, 0.04))
    expect(wins[0]).toBeGreaterThanOrEqual(0.95)
    expect(wins[1]).toBeGreaterThanOrEqual(0.85)
    expect(wins[2]).toBeGreaterThanOrEqual(0.5)
    expect(wins[3]).toBeGreaterThanOrEqual(0.15)
    expect(wins[3]).toBeLessThanOrEqual(0.7)
    expect(nonIncreasing(wins, 0.02)).toBe(true)
    // The windows still leave room between neighbouring notes.
    for (const d of DIFFS) expect(rhythmRules(d).minGapMs).toBeGreaterThan(2 * rhythmRules(d).perfectMs)
  })
})

// ── Round-Up: a casual rider ──────────────────────────────────────────────────

/** Posts on the herd's shortest way out (`routeAware`) or right next to it, and the greedy square `skill` of the time. */
function roundUp(d: Difficulty, seed: number, skill: number, routeAware: boolean) {
  const { blocked, animal: a0 } = RU.makeBoard(seed, d)
  const rng = mulberry32(seed * 17)
  const b = [...blocked]
  let animal = a0
  for (let t = 0; t < 81; t++) {
    for (let r = 0; r < RU.ridersFor(d); r++) {
      let c: number
      const pool = routeAware ? [...RU.escapeRoutes(b, animal)] : RU.neighbours(animal)
      const open = pool.filter(i => !b[i] && i !== animal)
      if (rng() < skill || !open.length) c = RU.greedyPlacement(b, animal)
      else c = open[Math.floor(rng() * open.length)]
      if (c < 0) return false
      b[c] = true
      if (RU.isTrapped(b, animal)) return true
    }
    const next = RU.herdStep(b, animal)
    if (next === null) return true
    animal = next
    if (RU.isEdge(animal)) return false
  }
  return false
}

describe('Round-Up: one rider on open ground at the top tiers', () => {
  it('a casual rider wins nearly always at D1 and about half the time at D4', () => {
    const N = 30
    const wins = DIFFS.map(d => {
      let w = 0
      for (let s = 1; s <= N; s++) {
        // Routes are shaded at D1–D2, so a player mostly posts on them there.
        if (roundUp(d, s, 0.3, d <= 2 || s % 2 === 0)) w++
      }
      return rate(w, N)
    })
    expect(wins[0], `${wins}`).toBeGreaterThanOrEqual(0.85)
    expect(wins[3], `${wins}`).toBeGreaterThanOrEqual(0.3)
    expect(wins[3], `${wins}`).toBeLessThanOrEqual(0.7)
    expect(nonIncreasing(wins, 0.05), `${wins}`).toBe(true)
  })
})

// ── Field Survey: a sloppy-but-logical searcher ───────────────────────────────

describe('Field Survey: the search budget is tight but fair', () => {
  function sloppySearch(tier: FS.SurveyTier, finds: number[], seed: number) {
    const cells = tier.size * tier.size
    let layouts: number[][] = []
    const rec = (start: number, cur: number[]) => {
      if (cur.length === finds.length) { layouts.push([...cur]); return }
      for (let i = start; i < cells; i++) { cur.push(i); rec(i + 1, cur); cur.pop() }
    }
    rec(0, [])
    const rng = mulberry32(seed * 7 + 3)
    const searched = new Set<number>()
    let found = 0
    while (found < finds.length && searched.size < cells) {
      let pick: number
      // 70% of the time a square the readings still allow; otherwise any square.
      const pool = rng() < 0.7
        ? [...new Set(layouts.flat())].filter(c => !searched.has(c))
        : [...Array(cells).keys()].filter(c => !searched.has(c))
      pick = pool[Math.floor(rng() * pool.length)]
      searched.add(pick)
      const r = FS.reading(tier.size, finds, pick, tier.rough)
      layouts = layouts.filter(l => FS.reading(tier.size, l, pick, tier.rough) === r)
      if (r === 0) found++
    }
    return searched.size
  }
  it('every dealt board keeps the reference searcher inside the slack, with no fallback boards', () => {
    for (const d of DIFFS) {
      const tier = FS.tierFor(d)
      for (let seed = 1; seed <= 40; seed++) {
        expect(FS.solve(tier, FS.makeFinds(seed, d)).length, `seed ${seed}@${d}`).toBeLessThanOrEqual(tier.searches - FS.SLACK)
      }
    }
  })
  it('a sloppy searcher wins ~90% at D1 and roughly half the time at D4', () => {
    const N = 24
    const wins = DIFFS.map(d => {
      const tier = FS.tierFor(d)
      let w = 0
      for (let s = 1; s <= N; s++) if (sloppySearch(tier, FS.makeFinds(s, d), s) <= tier.searches) w++
      return rate(w, N)
    })
    expect(wins[0], `${wins}`).toBeGreaterThanOrEqual(0.85)
    expect(wins[3], `${wins}`).toBeGreaterThanOrEqual(0.3)
    expect(wins[3], `${wins}`).toBeLessThanOrEqual(0.75)
    expect(nonIncreasing(wins, 0.1), `${wins}`).toBe(true)
  }, 60_000)
})

// ── Campaign: a candidate who looks two turns ahead ───────────────────────────

describe('Campaign: two turns of planning carries the top tier often enough', () => {
  it('a depth-2 campaigner wins at least a third of D4 campaigns on every map', () => {
    for (const [id, cfg] of Object.entries(CA.CONFIGS)) {
      const adj = CA.adjacency(cfg), w = cfg.districts.map(x => x.weight)
      const N = 30
      let wins = 0
      for (let seed = 1; seed <= N; seed++) {
        const board = CA.makeBoard(cfg, seed * 101, 4)
        if (CA.playOut(cfg, board, (s, left) => CA.scriptedMove(adj, w, s, left, board.reach, 2)) >= board.need) wins++
      }
      expect(rate(wins, N), id).toBeGreaterThanOrEqual(0.33)
    }
  })
})

// ── Archive Pairs: an ordinary memory ─────────────────────────────────────────

/** A player who remembers the last `K` slips seen (each recalled with chance `q`) and knows who made what. */
function casualPairs(deck: PA.Tile[], variant: PA.PairsVariant, d: Difficulty, rng: () => number, K: number, q: number) {
  const n = deck.length
  const matched = new Set<number>()
  const flips = new Array<number>(n).fill(0)
  let mem: number[] = []
  const remember = (i: number) => { mem = mem.filter(x => x !== i); mem.push(i); if (mem.length > K) mem.shift() }
  const recall = (i: number) => mem.includes(i) && rng() < q
  const partner = (i: number) => deck.findIndex((t, j) => j !== i && t.pair === deck[i].pair)
  let mistakes = 0, streak = 0, turns = 0, peeks = PA.peeksFor(d, variant), next = 0
  const budget = PA.mistakeBudget(d, variant)
  if (variant === 'flash') {
    const k = Math.min(K, Math.round(PA.flashMsFor(d) / 1000))
    for (const i of [...Array(n).keys()].sort(() => rng() - 0.5).slice(0, k)) remember(i)
  }
  const unknown = () => [...Array(n).keys()].filter(i => !matched.has(i) && !mem.includes(i) && (variant !== 'fragile' || flips[i] < PA.FRAGILE_FLIPS))
  const any = (skip = -1) => [...Array(n).keys()].find(i => !matched.has(i) && i !== skip)!
  for (let guard = 0; matched.size < n && guard < 400; guard++) {
    turns++
    const known = mem.find(i => !matched.has(i) && mem.includes(partner(i)) && (variant !== 'ordered' || deck[i].pair === next))
    let a: number, b: number
    if (known !== undefined && recall(known) && recall(partner(known))) { a = known; b = partner(known) }
    else {
      if (peeks > 0 && turns > 2 && unknown().length > 4) { peeks--; unknown().sort(() => rng() - 0.5).slice(0, 3).forEach(remember); continue }
      const u = unknown()
      a = u.length ? u[Math.floor(rng() * u.length)] : any()
      const p = partner(a)
      if (mem.includes(p) && recall(p)) b = p
      else { const u2 = unknown().filter(i => i !== a); b = u2.length ? u2[Math.floor(rng() * u2.length)] : any(a) }
    }
    flips[a]++; flips[b]++
    if (variant === 'fragile' && (flips[a] > PA.FRAGILE_FLIPS || flips[b] > PA.FRAGILE_FLIPS)) return false
    if (deck[a].pair === deck[b].pair) {
      if (variant === 'ordered' && deck[a].pair !== next) { remember(a); remember(b); streak = 0; continue }
      matched.add(a); matched.add(b); mem = mem.filter(x => x !== a && x !== b)
      streak++
      if (streak % PA.COMBO_REFUND === 0 && mistakes > 0) mistakes--
      if (variant === 'ordered') while (next < n / 2 && deck.some((t, i) => t.pair === next && matched.has(i))) next++
    } else {
      mistakes++; streak = 0
      if (mistakes > budget) return false
      remember(a); remember(b)
    }
  }
  return matched.size === n
}

describe('Archive Pairs: every twist is beatable by an ordinary memory', () => {
  it('an ordinary memory wins most D1 desks and a fair share of D4 desks, for every twist', () => {
    const N = 120
    for (const id of ['ancient', 'renaissance', 'modern', 'inventors']) {
      const cfg = PA.CONFIGS[id]
      const wins = DIFFS.map(d => {
        let w = 0
        for (let s = 1; s <= N; s++) {
          const deck = PA.makeDeck(id, cfg, d, s)
          // Half the players hold 7 slips in mind, half only 5.
          const [K, q] = s % 2 ? [7, 0.9] : [5, 0.8]
          if (casualPairs(deck, cfg.variant, d, mulberry32(s * 3), K, q)) w++
        }
        return rate(w, N)
      })
      expect(wins[0], `${id} ${wins}`).toBeGreaterThanOrEqual(0.85)
      expect(wins[3], `${id} ${wins}`).toBeGreaterThanOrEqual(0.3)
      expect(wins[3], `${id} ${wins}`).toBeLessThanOrEqual(0.75)
      expect(nonIncreasing(wins, 0.08), `${id} ${wins}`).toBe(true)
    }
  })
})

// ── Maze: the labyrinth finale stays inside a few minutes ─────────────────────

/** Steps a depth-first explorer (doors treated as open) takes to stumble on the exit. */
function exploreSteps(lab: Labyrinth, seed: number) {
  const { n, walls } = lab
  const seen = new Uint8Array(n * n)
  const stack = [lab.start[0] * n + lab.start[1]]
  seen[stack[0]] = 1
  const exit = lab.exit[0] * n + lab.exit[1]
  const rng = mulberry32(seed)
  let steps = 0
  while (stack.length && stack[stack.length - 1] !== exit) {
    const cur = stack[stack.length - 1], r = Math.floor(cur / n), c = cur % n
    const open = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
      .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !walls[a * n + b] && !seen[a * n + b]).map(([a, b]) => a * n + b)
    if (open.length) { const j = open[Math.floor(rng() * open.length)]; seen[j] = 1; stack.push(j) } else stack.pop()
    steps++
  }
  return steps
}

describe('Maze: the labyrinth finale stays inside a few minutes', () => {
  it('an explorer finds the exit in a bounded number of steps at every tier, and tiers grow', () => {
    const finale = MAZE_IDS.filter(id => MAZE[id].finale)
    const avg = DIFFS.map(d => {
      let total = 0, k = 0
      for (const id of finale) for (const seed of [1, 2, 3]) { total += exploreSteps(generateLabyrinth(MAZE[id], d, seed), seed); k++ }
      return total / k
    })
    // ~0.07 s a step on the swipe-run plus a swipe per junction: 550 steps is about two minutes.
    expect(Math.max(...avg), `${avg.map(Math.round)}`).toBeLessThanOrEqual(550)
    expect(avg.every((x, i) => i === 0 || x > avg[i - 1]), `${avg.map(Math.round)}`).toBe(true)
    expect(DIFFS.map(d => labSettings(MAZE['pyramid-deep'], d).size)).toEqual([21, 23, 27, 31])
  })
})

// ── Maze: "Restart level" un-sticks a physics level without beating the clock ─

describe('Maze: Restart level', () => {
  afterEach(() => { cleanup(); vi.useRealTimers() })
  const KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft']
  /** A first move that changes the board but does not win. */
  const detour = (id: string, d: Difficulty, seed: number) => {
    const level = generateLevel(MAZE[id], d, seed, 0)
    const st = initialState(level, mazeSettings(MAZE[id], d).lives)
    const dir = ([0, 1, 2, 3] as MazeDir[]).find(x => { const n = step(level, st, x); return n !== st && n.status === 'playing' && x !== level.solution[0] })!
    return { level, dir }
  }

  it('restartLevel returns to the start but keeps lost lives and moves already spent', () => {
    const level = generateLevel(MAZE.mulan, 3, 1, 0)
    const st = { ...initialState(level, 2), r: 3, c: 3, turn: 5, lives: 1, path: [] }
    const r = restartLevel(level, st, 4)
    expect([r.state.r, r.state.c]).toEqual(level.start)
    expect(r.state.turn).toBe(0)
    expect(r.state.lives).toBe(1)
    expect(r.spent).toBe(9)
  })

  it('at D1 (no clock) a player who wandered off restarts the level and still wins', () => {
    vi.useFakeTimers()
    const id = 'enkidu-steppe', d = 1 as Difficulty, seed = 3
    const { level, dir } = detour(id, d, seed)
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(BigMazeGame, { configId: id, difficulty: d, seed, onWin, onLose }))
    const btn = screen.getByRole('button', { name: /Restart level/ }) as HTMLButtonElement
    act(() => { vi.advanceTimersByTime(1000) })
    expect(btn.disabled).toBe(true) // nothing to undo yet
    fireEvent.keyDown(window, { key: KEYS[dir] })
    expect(btn.disabled).toBe(false)
    fireEvent.click(btn)
    for (const mv of level.solution) fireEvent.keyDown(window, { key: KEYS[mv] })
    act(() => { vi.advanceTimersByTime(3000) })
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('at D4 a restart keeps the clock running and the moves counted', () => {
    vi.useFakeTimers()
    const id = 'enkidu-steppe', d = 4 as Difficulty, seed = 3
    const { dir } = detour(id, d, seed)
    const limit = mazeSettings(MAZE[id], d).timeLimit
    expect(limit).toBeGreaterThan(0)
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(BigMazeGame, { configId: id, difficulty: d, seed, onWin, onLose }))
    act(() => { vi.advanceTimersByTime(1000) })
    fireEvent.keyDown(window, { key: KEYS[dir] })
    // One second at a time, as in the browser.
    for (let t = 1; t < limit - 10; t++) act(() => { vi.advanceTimersByTime(1000) })
    fireEvent.click(screen.getByRole('button', { name: /Restart level/ }))
    expect(screen.getByText(/^Moves/).textContent).toMatch(/Moves\s*1\b/)
    for (let t = 0; t < 15; t++) act(() => { vi.advanceTimersByTime(1000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})
