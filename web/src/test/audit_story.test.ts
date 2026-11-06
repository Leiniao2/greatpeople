// Audit: every config of the story-flavoured and board minigames must be
// winnable at every difficulty the story data (and the Arcade) can ask for.
// Pure checks run against the exported configs and engines; a few mount the
// component and play it through to make sure onWin/onLose fire exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, Difficulty, MinigameComponent } from '@/games/types'

import FictionGame, { CONFIGS as FICTION } from '@/components/minigames/FictionGame'
import MuseumGame, { CONFIGS as MUSEUM } from '@/components/minigames/MuseumGame'
import StorySortGame, { CONFIGS as STORYSORT, scrambled } from '@/components/minigames/StorySortGame'
import DebateGame, { CONFIGS as DEBATE, debateTargets } from '@/components/minigames/DebateGame'
import StarChartGame, { CONFIGS as STARCHART, latitudeFrom } from '@/components/minigames/StarChartGame'
import RoundUpGame, { CONFIGS as ROUNDUP, makeBoard, greedySolve, ridersFor, isEdge } from '@/components/minigames/RoundUpGame'
import FieldSurveyGame, { CONFIGS as SURVEY, makeFinds, solve, tierFor as surveyTier, SLACK } from '@/components/minigames/FieldSurveyGame'
import RiverRunGame, { CONFIGS as RIVER, makeRiver, tierFor as riverTier, LANES } from '@/components/minigames/RiverRunGame'
import SoccerGame, { CONFIGS as SOCCER } from '@/components/minigames/SoccerGame'
import ReporterFleeGame, { CONFIGS as REPORTER, initState, reducer, EX, EY, SOLDIER_EVERY, type GameState } from '@/components/minigames/ReporterFleeGame'
import MatchThreeGame, {
  CONFIGS as MATCH3, simulate as simulateMatchThree, levelFor as matchLevel, startRound, findRuns, hasValidMove, bestSwap, validSwaps, boardSeed, playMove, goalsMet,
  type Board as MatchBoard,
} from '@/components/minigames/MatchThreeGame'
import { mulberry32 } from '@/components/minigames/_shared/rng'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const noop = () => {}

// jsdom has no canvas; keep any game that draws on one quiet.
const inertContext = new Proxy({}, { get: () => () => undefined })
HTMLCanvasElement.prototype.getContext = (() => inertContext) as unknown as HTMLCanvasElement['getContext']

/** Story challenges for one game: configId → difficulties (and params) actually used. */
function storyUses(game: string) {
  const uses = new Map<string, { difficulties: Set<Difficulty>; params: Record<string, unknown>[] }>()
  for (const entry of storyChallenges as { challenges: Challenge[] }[]) {
    for (const ch of entry.challenges) {
      if (ch.type !== 'minigame' || ch.game !== game) continue
      const u = uses.get(ch.configId ?? '') ?? { difficulties: new Set(), params: [] }
      u.difficulties.add(ch.difficulty ?? 1)
      if (ch.params) u.params.push(ch.params)
      uses.set(ch.configId ?? '', u)
    }
  }
  return uses
}

const GAMES: [string, MinigameComponent, Record<string, unknown>][] = [
  ['fiction', FictionGame, FICTION],
  ['museum', MuseumGame, MUSEUM],
  ['storysort', StorySortGame, STORYSORT],
  ['debate', DebateGame, DEBATE],
  ['starchart', StarChartGame, STARCHART],
  ['roundup', RoundUpGame, ROUNDUP],
  ['fieldsurvey', FieldSurveyGame, SURVEY],
  ['riverrun', RiverRunGame, RIVER],
  ['soccer', SoccerGame, SOCCER],
  ['reporterflee', ReporterFleeGame, REPORTER],
  ['matchthree', MatchThreeGame, MATCH3],
]

describe('audit — story data references', () => {
  it('every story configId exists and story params only override the title', () => {
    for (const [game, , configs] of GAMES) {
      for (const [configId, use] of storyUses(game)) {
        expect(configs[configId], `${game}/${configId}`).toBeDefined()
        for (const p of use.params) {
          expect(Object.keys(p), `${game}/${configId} params`).toEqual(['title'])
        }
      }
    }
  })

  it('every config of every game mounts at every difficulty without throwing', () => {
    const failures: string[] = []
    for (const [game, Comp, configs] of GAMES) {
      for (const configId of Object.keys(configs)) {
        for (const difficulty of DIFFS) {
          try {
            render(createElement(Comp, { configId, difficulty, seed: 7, onWin: noop, onLose: noop }))
          } catch (err) {
            failures.push(`${game}/${configId}@${difficulty}: ${(err as Error).message.split('\n')[0]}`)
          } finally {
            cleanup()
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('unknown configIds fall back instead of crashing', () => {
    for (const [, Comp] of GAMES) {
      render(createElement(Comp, { configId: 'no-such-config', difficulty: 4, seed: 1, onWin: noop, onLose: noop }))
      cleanup()
    }
  })
})

// ── Fiction ────────────────────────────────────────────────────────────────────

describe('audit — Fiction', () => {
  it('each config has a single in-range answer among distinct options', () => {
    for (const [id, cfg] of Object.entries(FICTION)) {
      expect(cfg.options.length, id).toBeGreaterThanOrEqual(2)
      expect(cfg.answer, id).toBeGreaterThanOrEqual(0)
      expect(cfg.answer, id).toBeLessThan(cfg.options.length)
      expect(new Set(cfg.options).size, id).toBe(cfg.options.length)
    }
  })

  it('picking the answer wins once; running out of guesses loses once', () => {
    vi.useFakeTimers()
    const optionButton = (text: string) => screen.getByText(text).closest('button')!
    for (const [id, cfg] of Object.entries(FICTION)) {
      const distractors = cfg.options.filter((_, i) => i !== cfg.answer)
      for (const difficulty of DIFFS) {
        const onWin = vi.fn(), onLose = vi.fn()
        render(createElement(FictionGame, { configId: id, difficulty, seed: 1, onWin, onLose }))
        fireEvent.click(optionButton(cfg.options[cfg.answer]))
        fireEvent.click(optionButton(cfg.options[cfg.answer]))
        fireEvent.click(optionButton(distractors[0]))
        act(() => { vi.advanceTimersByTime(2000) })
        expect(onWin, `${id}@${difficulty}`).toHaveBeenCalledTimes(1)
        expect(onLose, `${id}@${difficulty}`).not.toHaveBeenCalled()
        cleanup()

        // D1 forgives two wrong guesses, D2–D3 one, D4 none.
        const allowed = [2, 1, 1, 0][difficulty - 1]
        const onWin2 = vi.fn(), onLose2 = vi.fn()
        render(createElement(FictionGame, { configId: id, difficulty, seed: 1, onWin: onWin2, onLose: onLose2 }))
        for (let k = 0; k < allowed; k++) {
          fireEvent.click(optionButton(distractors[k]))
          fireEvent.click(optionButton(distractors[k]))   // a struck-out guess does not count twice
          act(() => { vi.advanceTimersByTime(2000) })
          expect(onLose2, `${id}@${difficulty} miss ${k + 1} is forgiven`).not.toHaveBeenCalled()
        }
        fireEvent.click(optionButton(distractors[allowed]))
        act(() => { vi.advanceTimersByTime(2000) })
        expect(onLose2, `${id}@${difficulty} lose`).toHaveBeenCalledTimes(1)
        expect(onWin2).not.toHaveBeenCalled()
        cleanup()
      }
    }
  })

  it('the answer is not always dealt in the same place', () => {
    for (const [id, cfg] of Object.entries(FICTION)) {
      const positions = new Set<number>()
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        render(createElement(FictionGame, { configId: id, difficulty: 2, seed, onWin: () => {}, onLose: () => {} }))
        positions.add(screen.getAllByRole('button').findIndex(b => b.textContent!.includes(cfg.options[cfg.answer])))
        cleanup()
      }
      expect(positions.size, id).toBeGreaterThan(1)
    }
  })
})

// ── Story Sort ─────────────────────────────────────────────────────────────────

describe('audit — Story Sort', () => {
  it('paragraphs are distinct and the deal is never already solved', () => {
    for (const [id, cfg] of Object.entries(STORYSORT)) {
      expect(new Set(cfg.paragraphs).size, id).toBe(cfg.paragraphs.length)
      for (let seed = 0; seed < 60; seed++) {
        const order = scrambled(cfg.paragraphs, seed)
        expect([...order].sort(), id).toEqual([...cfg.paragraphs].sort())
        expect(order.every((p, i) => p === cfg.paragraphs[i]), `${id} seed ${seed} dealt solved`).toBe(false)
      }
    }
  })

  it('sorting with the arrows and checking wins exactly once at every difficulty', () => {
    vi.useFakeTimers()
    for (const [id, cfg] of Object.entries(STORYSORT)) {
      for (const difficulty of DIFFS) {
        const onWin = vi.fn(), onLose = vi.fn()
        render(createElement(StorySortGame, { configId: id, difficulty, seed: 3, onWin, onLose }))
        const current = () => screen.getAllByText('▲').map(b => b.closest('div.flex.items-start')!.querySelector('span.flex-1')!.textContent)
        for (let i = 0; i < cfg.paragraphs.length; i++) {
          let j = current().indexOf(cfg.paragraphs[i])
          while (j > i) { fireEvent.click(screen.getAllByText('▲')[j]); j-- }
        }
        expect(current()).toEqual(cfg.paragraphs)
        fireEvent.click(screen.getByText('Check Order →'))
        act(() => { vi.advanceTimersByTime(1500) })
        expect(onWin, `${id}@${difficulty}`).toHaveBeenCalledTimes(1)
        expect(onLose).not.toHaveBeenCalled()
        cleanup()
      }
    }
  })

  it('a wrong order at difficulty 4 loses after the second attempt', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(StorySortGame, { configId: 'odyssey-return', difficulty: 4, seed: 3, onWin, onLose }))
    fireEvent.click(screen.getByText('Check Order →'))
    act(() => { vi.advanceTimersByTime(1500) })
    expect(onLose).not.toHaveBeenCalled()
    expect(screen.getByText(/of 4 in place · 1 try left/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Check Order →'))
    act(() => { vi.advanceTimersByTime(1500) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})

// ── Debate ─────────────────────────────────────────────────────────────────────

describe('audit — Debate', () => {
  it('the best replies reach the win mark at every difficulty (and never trip the −4 floor)', () => {
    for (const [id, cfg] of Object.entries(DEBATE)) {
      for (const r of cfg.rounds) expect(Math.max(...r.cards.map(c => c.effect)), `${id} round "${r.claim}"`).toBeGreaterThan(0)
      for (const difficulty of DIFFS) {
        const { winAt, best, roundsToPlay } = debateTargets(cfg, difficulty)
        expect(roundsToPlay, id).toBeGreaterThan(0)
        expect(best, `${id}@${difficulty} best ${best} < winAt ${winAt}`).toBeGreaterThanOrEqual(winAt)
        expect(winAt, id).toBeGreaterThan(0)
      }
    }
  })

  it('playing the strongest card each round wins exactly once at every difficulty', () => {
    vi.useFakeTimers()
    for (const [id, cfg] of Object.entries(DEBATE)) {
      for (const difficulty of DIFFS) {
        const onWin = vi.fn(), onLose = vi.fn()
        render(createElement(DebateGame, { configId: id, difficulty, seed: 11, onWin, onLose }))
        const { roundsToPlay } = debateTargets(cfg, difficulty)
        for (let round = 0; round < roundsToPlay; round++) {
          const bestCard = [...cfg.rounds[round].cards].sort((a, b) => b.effect - a.effect)[0]
          fireEvent.click(screen.getByText(bestCard.text, { exact: false }).closest('button')!)
          act(() => { vi.advanceTimersByTime(1200) })
        }
        act(() => { vi.advanceTimersByTime(1500) })
        expect(onWin, `${id}@${difficulty}`).toHaveBeenCalledTimes(1)
        expect(onLose, `${id}@${difficulty}`).not.toHaveBeenCalled()
        cleanup()
      }
    }
  })

  it('weak replies lose once', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(DebateGame, { configId: 'socrates-apology', difficulty: 2, seed: 11, onWin, onLose }))
    const cfg = DEBATE['socrates-apology']
    for (let round = 0; round < 3; round++) {
      const worst = [...cfg.rounds[round].cards].sort((a, b) => a.effect - b.effect)[0]
      const btn = screen.queryByText(worst.text, { exact: false })?.closest('button')
      if (!btn) break
      fireEvent.click(btn)
      act(() => { vi.advanceTimersByTime(1200) })
    }
    act(() => { vi.advanceTimersByTime(1500) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})

// ── Star Chart ─────────────────────────────────────────────────────────────────

describe('audit — Star Chart', () => {
  it('identify: constellations sit inside the sky and their tap zones do not overlap', () => {
    for (const [id, cfg] of Object.entries(STARCHART)) {
      if (cfg.mode !== 'identify') continue
      const cs = cfg.constellations!
      expect(cs.length, id).toBeGreaterThanOrEqual(5 > cs.length ? cs.length : 5) // tier 4 asks for 5 (capped by count)
      const centroids = cs.map(c => {
        for (const [x, y] of c.stars) { expect(x, `${id}/${c.name}`).toBeWithin(0, 100); expect(y, `${id}/${c.name}`).toBeWithin(0, 80) }
        for (const [a, b] of c.lines ?? []) { expect(c.stars[a], `${id}/${c.name} line`).toBeDefined(); expect(c.stars[b], `${id}/${c.name} line`).toBeDefined() }
        return [c.stars.reduce((s, p) => s + p[0], 0) / c.stars.length, c.stars.reduce((s, p) => s + p[1], 0) / c.stars.length]
      })
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        const d = Math.hypot(centroids[i][0] - centroids[j][0], centroids[i][1] - centroids[j][1])
        expect(d, `${id}: ${cs[i].name} vs ${cs[j].name} tap zones overlap`).toBeGreaterThan(18)
      }
      expect(new Set(cs.map(c => c.name)).size, id).toBe(cs.length)
    }
  })

  it('altitude: every sighting is dial-able and its latitude lies on the slider', () => {
    for (const [id, cfg] of Object.entries(STARCHART)) {
      if (cfg.mode !== 'altitude') continue
      expect(cfg.sightings!.length, id).toBeGreaterThanOrEqual(4) // tier 4 asks for 4
      for (const s of cfg.sightings!) {
        expect(Number.isInteger(s.altitude), `${id}/${s.star} altitude`).toBe(true)
        expect(s.altitude).toBeWithin(0, 90)
        const lat = Math.round(latitudeFrom(s))
        expect(lat, `${id}/${s.star} latitude ${lat}`).toBeWithin(-60, 80)
      }
    }
  })

  it('identify: tapping each target in turn wins exactly once at every difficulty', () => {
    vi.useFakeTimers()
    for (const [id, cfg] of Object.entries(STARCHART)) {
      if (cfg.mode !== 'identify') continue
      for (const difficulty of DIFFS) {
        const onWin = vi.fn(), onLose = vi.fn()
        const { container } = render(createElement(StarChartGame, { configId: id, difficulty, seed: 5, onWin, onLose }))
        const groups = [...container.querySelectorAll('svg > g')]
        const findLabel = () => container.querySelector('p.text-ink > span.font-bold')!.textContent
        for (let guard = 0; guard < 6 && findLabel() !== '—'; guard++) {
          const name = findLabel()
          const idx = cfg.constellations!.findIndex(c => c.name === name)
          fireEvent.click(groups[idx])
        }
        act(() => { vi.advanceTimersByTime(1500) })
        expect(onWin, `${id}@${difficulty}`).toHaveBeenCalledTimes(1)
        expect(onLose).not.toHaveBeenCalled()
        cleanup()
      }
    }
  })

  it('altitude: sighting each star and fixing the latitude wins exactly once at every difficulty', () => {
    vi.useFakeTimers()
    for (const [id, cfg] of Object.entries(STARCHART)) {
      if (cfg.mode !== 'altitude') continue
      for (const difficulty of DIFFS) {
        const onWin = vi.fn(), onLose = vi.fn()
        const { container } = render(createElement(StarChartGame, { configId: id, difficulty, seed: 5, onWin, onLose }))
        for (let i = 0; i < cfg.sightings!.length && !onWin.mock.calls.length; i++) {
          const s = cfg.sightings![i]
          const dial = container.querySelector('input[type=range]') as HTMLInputElement
          fireEvent.change(dial, { target: { value: String(s.altitude) } })
          fireEvent.click(screen.getByText('Sight the star'))
          const lat = container.querySelector('input[type=range]') as HTMLInputElement
          fireEvent.change(lat, { target: { value: String(Math.round(latitudeFrom(s))) } })
          fireEvent.click(screen.getByText('Fix our position'))
          act(() => { vi.advanceTimersByTime(1500) })
        }
        expect(onWin, `${id}@${difficulty}`).toHaveBeenCalledTimes(1)
        expect(onLose).not.toHaveBeenCalled()
        cleanup()
      }
    }
  })
})

// ── Round-Up ───────────────────────────────────────────────────────────────────

describe('audit — Round-Up', () => {
  it('the greedy rider wins every generated board', () => {
    for (const difficulty of DIFFS) {
      for (let seed = 1; seed <= 15; seed++) {
        const { blocked, animal } = makeBoard(seed, difficulty)
        expect(greedySolve(blocked, animal, ridersFor(difficulty)), `seed ${seed}@${difficulty}`).not.toBeNull()
      }
    }
  })

  it('playing the greedy line wins once through the component', () => {
    for (const difficulty of DIFFS) {
      const { blocked, animal } = makeBoard(3, difficulty)
      const placed = greedySolve(blocked, animal, ridersFor(difficulty))!
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(RoundUpGame, { configId: 'mongol-nerge', difficulty, seed: 3, onWin, onLose }))
      for (const i of placed) fireEvent.click(screen.getByLabelText(`square ${i % 9 + 1},${Math.floor(i / 9) + 1}`))
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onWin, `@${difficulty}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup(); vi.useRealTimers()
    }
  })

  it('the herd starts away from the edge', () => {
    expect(isEdge(makeBoard(1, 1).animal)).toBe(false)
  })
})

// ── Field Survey ───────────────────────────────────────────────────────────────

describe('audit — Field Survey', () => {
  it('the reference searcher finds everything with searches to spare', () => {
    for (const difficulty of DIFFS) {
      const tier = surveyTier(difficulty)
      for (let seed = 1; seed <= 10; seed++) {
        const used = solve(tier, makeFinds(seed, difficulty)).length
        expect(used, `seed ${seed}@${difficulty}`).toBeLessThanOrEqual(tier.searches - SLACK)
      }
    }
  })

  it('searching every find wins once', () => {
    for (const difficulty of DIFFS) {
      const tier = surveyTier(difficulty)
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(FieldSurveyGame, { configId: 'gombe-chimps', difficulty, seed: 5, onWin, onLose }))
      for (const i of makeFinds(5, difficulty)) {
        fireEvent.click(screen.getByLabelText(`search ${i % tier.size + 1},${Math.floor(i / tier.size) + 1}`))
      }
      act(() => { vi.advanceTimersByTime(1500) })
      expect(onWin, `@${difficulty}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup(); vi.useRealTimers()
    }
  })
})

// ── River Run ──────────────────────────────────────────────────────────────────

describe('audit — River Run', () => {
  it('a clear channel runs the whole river, one lane change per stretch at most', () => {
    for (const difficulty of DIFFS) {
      const tier = riverTier(difficulty)
      for (let seed = 1; seed <= 20; seed++) {
        const { rows, channel } = makeRiver(seed, tier, 3)
        expect(rows.length).toBe(tier.length)
        channel.forEach((lane, r) => {
          expect(lane >= 0 && lane < LANES).toBe(true)
          expect(rows[r][lane], `seed ${seed}@${difficulty} row ${r}`).toBe(-1)
          if (r) expect(Math.abs(lane - channel[r - 1])).toBeLessThanOrEqual(1)
        })
      }
    }
  })

  it('following the channel wins once, and the current does not fire after the landing', () => {
    for (const difficulty of DIFFS) {
      vi.useFakeTimers()
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(RiverRunGame, { configId: 'kwanza-river', difficulty, seed: 9, onWin, onLose }))
      const { channel } = makeRiver(9, riverTier(difficulty), RIVER['kwanza-river'].hazards.length)
      const label = { [-1]: '↖ Left', 0: '↑ Straight', 1: 'Right ↗' } as Record<number, string>
      for (let r = 1; r < channel.length; r++) fireEvent.click(screen.getByText(label[channel[r] - channel[r - 1]]))
      act(() => { vi.advanceTimersByTime(5000) })
      expect(onWin, `@${difficulty}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      cleanup(); vi.useRealTimers()
    }
  })
})

// ── Soccer ─────────────────────────────────────────────────────────────────────

describe('audit — Soccer', () => {
  it('each shootout can be won and favours the kicker', () => {
    for (const [id, cfg] of Object.entries(SOCCER)) {
      expect(cfg.kicks, id).toBeGreaterThanOrEqual(cfg.targetGoals)
      const pScore = (1 - cfg.readProb) * (2 / 3)
      expect(pScore, id).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('scoring three wins once, and the tier-4 clock does not expire on the victory screen', () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // keeper never reads; dives right (col 2)
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(SoccerGame, { configId: 'euro-penalty', difficulty: 4, seed: 1, onWin, onLose }))
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('↖').closest('button')!) // col 0
      act(() => { vi.advanceTimersByTime(1500) })
    }
    expect(screen.getByText('You Win!')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(120_000) })
    expect(onLose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Complete'))
    expect(onWin).toHaveBeenCalledTimes(1)
  })

  it('the tier-4 clock does lose a game still in progress', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(SoccerGame, { configId: 'euro-penalty', difficulty: 4, seed: 1, onWin, onLose }))
    // One second at a time, as in the browser: a React batch of many ticks would re-run the expiry.
    for (let s = 0; s < 95; s++) act(() => { vi.advanceTimersByTime(1000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})

// ── Reporter Flee ──────────────────────────────────────────────────────────────

/** BFS over the deterministic engine: shortest hit-free route to the exit. */
function reporterPath(cfg: (typeof REPORTER)[string]): [number, number][] | null {
  const start = initState(cfg)
  const key = (s: GameState) => `${s.px},${s.py}|${s.dangers.map(d => `${d.x},${d.y}`).join(';')}`
  const seen = new Set([key(start)])
  const queue: { s: GameState; path: [number, number][] }[] = [{ s: start, path: [] }]
  const dirs: [number, number][] = [[1, 0], [0, -1], [-1, 0], [0, 1]]
  while (queue.length) {
    const { s, path } = queue.shift()!
    for (const [dx, dy] of dirs) {
      const n = reducer(s, { type: 'MOVE', dx, dy })
      if (n.phase === 'won') return [...path, [dx, dy]]
      if (n.phase !== 'playing') continue
      const k = key(n)
      if (seen.has(k)) continue
      seen.add(k)
      queue.push({ s: n, path: [...path, [dx, dy]] })
    }
  }
  return null
}

describe('audit — Reporter Flee', () => {
  it('every board has a hit-free route to the door, short enough for the tier-4 clock', () => {
    expect(SOLDIER_EVERY).toBe(2) // at full speed a greedy chaser can never be passed; no board had a hit-free route
    for (const [id, cfg] of Object.entries(REPORTER)) {
      for (const c of [...cfg.soldiers, ...cfg.mines]) {
        expect(c.x === 0 && c.y === 5, `${id} danger on the start`).toBe(false)
        expect(c.x === EX && c.y === EY, `${id} danger on the exit`).toBe(false)
      }
      const path = reporterPath(cfg)
      expect(path, `${id} has no safe route`).not.toBeNull()
      expect(path!.length, `${id} route length`).toBeLessThanOrEqual(40)
    }
  })

  it('walking the route wins exactly once at every difficulty, and the clock stops on the door', () => {
    vi.useFakeTimers()
    for (const [id, cfg] of Object.entries(REPORTER)) {
      const path = reporterPath(cfg)!
      for (const difficulty of DIFFS) {
        const onWin = vi.fn(), onLose = vi.fn()
        render(createElement(ReporterFleeGame, { configId: id, difficulty, seed: 1, onWin, onLose }))
        const arrow: Record<string, string> = { '1,0': '→', '-1,0': '←', '0,-1': '↑', '0,1': '↓' }
        for (const [dx, dy] of path) fireEvent.click(screen.getByText(arrow[`${dx},${dy}`]))
        expect(screen.getByText('You made it out!'), `${id}@${difficulty}`).toBeTruthy()
        act(() => { vi.advanceTimersByTime(130_000) })
        expect(onLose, `${id}@${difficulty} clock ran on the victory screen`).not.toHaveBeenCalled()
        fireEvent.click(screen.getByText('Complete'))
        expect(onWin).toHaveBeenCalledTimes(1)
        cleanup()
      }
    }
  })
})

// ── Match Three ────────────────────────────────────────────────────────────────

// simulate() is a greedy player driving the component's own engine: each move
// takes the best-rated legal swap, then cascades, reshuffles and later rounds
// run on the same seeded rng the component uses.

describe('audit — Match Three', () => {
  const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1)

  it('a dealt board has no ready-made matches and always has a legal swap, for every config and tier', () => {
    for (const [id, cfg] of Object.entries(MATCH3)) {
      for (const difficulty of DIFFS) {
        const level = matchLevel(cfg, difficulty)
        for (const s of SEEDS) {
          const { board } = startRound(cfg, level, mulberry32(boardSeed(id, s)))
          expect(board.n, `${id}@${difficulty}`).toBe(level.n)
          expect(findRuns(board, cfg.rules).length, `${id}@${difficulty} seed ${s} dealt with matches`).toBe(0)
          expect(hasValidMove(board, cfg.rules), `${id}@${difficulty} seed ${s}`).toBe(true)
        }
      }
    }
  })

  it('a greedy player meets every goal within the move budget at every difficulty', () => {
    for (const id of Object.keys(MATCH3)) {
      for (const difficulty of DIFFS) {
        const results = SEEDS.map(s => simulateMatchThree(id, difficulty, s))
        const wins = results.filter(r => r.won).length
        const L = results[0].level
        const summary = `${id}@${difficulty}: ${wins}/${SEEDS.length} wins, ${L.rounds}×${L.moves} moves, goal ${L.score} pts / ${L.collect} goods / ${L.crates} crates`
        // Tier 1 must always finish; harder tiers must be winnable by plain greedy play most of the time.
        const need = difficulty === 1 ? SEEDS.length : Math.ceil(SEEDS.length * 0.75)
        expect(wins, summary).toBeGreaterThanOrEqual(need)
      }
    }
  })

  it('every story challenge (config × difficulty) is winnable by the greedy player', () => {
    for (const [configId, use] of storyUses('matchthree')) {
      for (const difficulty of use.difficulties) {
        const wins = SEEDS.filter(s => simulateMatchThree(configId, difficulty, s).won).length
        expect(wins, `${configId}@${difficulty}`).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.75))
      }
    }
  })

  it('playing the greedy swaps in the component wins exactly once, on the move the engine predicts', () => {
    vi.useFakeTimers()
    const id = 'lisbon-spices', difficulty = 3 as Difficulty
    const seed = SEEDS.find(s => simulateMatchThree(id, difficulty, s).won)!
    const predicted = simulateMatchThree(id, difficulty, seed)
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(MatchThreeGame, { configId: id, difficulty, seed, onWin, onLose }))
    const cells = () => [...container.querySelectorAll<HTMLButtonElement>('[data-cell]')]
    const readBoard = (): MatchBoard => {
      const els = cells()
      const n = Math.round(Math.sqrt(els.length))
      return { n, nextId: 0, cells: els.map(e => ({ id: 0, t: Number(e.dataset.t), sp: (e.dataset.sp || undefined) as never })) }
    }
    const collectLabel = () => container.querySelector('[data-testid="m3-board"]')?.getAttribute('data-collect')
    let moves = 0
    for (let guard = 0; guard < 200 && !onWin.mock.calls.length && !onLose.mock.calls.length; guard++) {
      const board = readBoard()
      const pick = bestSwap(board, MATCH3[id].rules ?? {}, Number(collectLabel()))
      expect(pick, `move ${guard}: board has a legal swap`).not.toBeNull()
      const byCell = (i: number) => cells().find(e => Number(e.dataset.cell) === i)!
      fireEvent.click(byCell(pick![0])); fireEvent.click(byCell(pick![1]))
      moves++
      act(() => { vi.advanceTimersByTime(30000) })
      act(() => { vi.advanceTimersByTime(1000) }) // the outcome hook arms its report timer on the render after win()/lose()
    }
    expect(onWin).toHaveBeenCalledTimes(1)
    expect(onLose).not.toHaveBeenCalled()
    expect(moves).toBe(predicted.moves)
  })

  it('running out of moves in the component loses exactly once', () => {
    vi.useFakeTimers()
    const id = 'lisbon-spices', difficulty = 4 as Difficulty, rules = MATCH3[id].rules ?? {}
    // A careless player: always the first legal swap in reading order.
    const careless = (seed: number) => {
      const cfg = MATCH3[id], level = matchLevel(cfg, difficulty)
      const rand = mulberry32(boardSeed(id, seed))
      let nextId = 1
      for (let round = 0; round < level.rounds; round++) {
        const st = startRound(cfg, level, rand, nextId)
        let b = st.board
        const p = { score: 0, collected: 0, crates: b.cells.filter(c => c?.t === -2).length }
        for (let moves = 0; !goalsMet(level, p); moves++) {
          if (moves >= level.moves) return false
          const [i, j] = validSwaps(b, rules)[0]
          const r = playMove(b, i, j, rules, cfg.tiles.length, rand)
          p.score += r.points; p.collected += r.collected[st.collectT]; p.crates -= r.cratesBroken; b = r.board
        }
        nextId = b.nextId
      }
      return true
    }
    const seed = SEEDS.find(s => !careless(s))
    expect(seed, 'careless play loses on some seed').toBeDefined()
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(MatchThreeGame, { configId: id, difficulty, seed: seed!, onWin, onLose }))
    for (let guard = 0; guard < 200 && !onWin.mock.calls.length && !onLose.mock.calls.length; guard++) {
      const els = [...container.querySelectorAll<HTMLButtonElement>('[data-cell]')]
      const n = Math.round(Math.sqrt(els.length))
      const board: MatchBoard = { n, nextId: 0, cells: els.map(e => ({ id: 0, t: Number(e.dataset.t), sp: (e.dataset.sp || undefined) as never })) }
      const [i, j] = validSwaps(board, rules)[0]
      const byCell = (k: number) => els.find(e => Number(e.dataset.cell) === k)!
      fireEvent.click(byCell(i)); fireEvent.click(byCell(j))
      act(() => { vi.advanceTimersByTime(30000) })
      act(() => { vi.advanceTimersByTime(1000) }) // the outcome hook arms its report timer on the render after win()/lose()
    }
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
  })
})

// Vitest has no toBeWithin; a tiny helper keeps the range checks readable.
expect.extend({
  toBeWithin(received: number, lo: number, hi: number) {
    const pass = received >= lo && received <= hi
    return { pass, message: () => `expected ${received} ${pass ? 'not ' : ''}to be within [${lo}, ${hi}]` }
  },
})
declare module 'vitest' {
  interface Assertion<T> { toBeWithin(lo: number, hi: number): T }
}
