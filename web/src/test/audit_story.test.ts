// Audit: every config of the story-flavoured and board minigames must be
// winnable at every difficulty the story data (and the Arcade) can ask for.
// Pure checks run against the exported configs and engines; a few mount the
// component and play it through to make sure onWin/onLose fire exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, Difficulty, MinigameComponent } from '@/games/types'
import { hashString } from '@/components/minigames/_shared/rng'

import FictionGame, { CONFIGS as FICTION } from '@/components/minigames/FictionGame'
import MuseumGame, { CONFIGS as MUSEUM } from '@/components/minigames/MuseumGame'
import StorySortGame, { CONFIGS as STORYSORT, scrambled } from '@/components/minigames/StorySortGame'
import DebateGame, { CONFIGS as DEBATE, debateTargets } from '@/components/minigames/DebateGame'
import StarChartGame, { CONFIGS as STARCHART, latitudeFrom } from '@/components/minigames/StarChartGame'
import HuntingGame, { CONFIGS as HUNTING } from '@/components/minigames/HuntingGame'
import SoccerGame, { CONFIGS as SOCCER } from '@/components/minigames/SoccerGame'
import ReporterFleeGame, { CONFIGS as REPORTER, initState, reducer, EX, EY, SOLDIER_EVERY, type GameState } from '@/components/minigames/ReporterFleeGame'
import MatchThreeGame, {
  CONFIGS as MATCH3, seededRandom, makePlayableGrid, findMatches, applyGravity, validSwaps, hasValidMove, moveLimitFor,
  type MatchThreeConfig,
} from '@/components/minigames/MatchThreeGame'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const noop = () => {}

// jsdom has no canvas; Hunting draws on one.
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
  ['hunting', HuntingGame, HUNTING],
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

  it('picking the answer wins once; picking a distractor loses once', () => {
    vi.useFakeTimers()
    for (const [id, cfg] of Object.entries(FICTION)) {
      for (const difficulty of DIFFS) {
        const onWin = vi.fn(), onLose = vi.fn()
        render(createElement(FictionGame, { configId: id, difficulty, seed: 1, onWin, onLose }))
        const buttons = screen.getAllByRole('button')
        fireEvent.click(buttons[cfg.answer])
        fireEvent.click(buttons[cfg.answer])
        fireEvent.click(buttons[(cfg.answer + 1) % cfg.options.length])
        act(() => { vi.advanceTimersByTime(2000) })
        expect(onWin, `${id}@${difficulty}`).toHaveBeenCalledTimes(1)
        expect(onLose, `${id}@${difficulty}`).not.toHaveBeenCalled()
        cleanup()

        const onWin2 = vi.fn(), onLose2 = vi.fn()
        render(createElement(FictionGame, { configId: id, difficulty, seed: 1, onWin: onWin2, onLose: onLose2 }))
        fireEvent.click(screen.getAllByRole('button')[(cfg.answer + 1) % cfg.options.length])
        act(() => { vi.advanceTimersByTime(2000) })
        expect(onLose2, `${id}@${difficulty} lose`).toHaveBeenCalledTimes(1)
        expect(onWin2).not.toHaveBeenCalled()
        cleanup()
      }
    }
  })
})

// ── Museum ─────────────────────────────────────────────────────────────────────

/** Best score over every injective room→artwork assignment. */
function bestMuseum(cfg: (typeof MUSEUM)[string]): { score: number; plan: Record<string, string> } {
  let best = { score: -1, plan: {} as Record<string, string> }
  const used = new Set<string>()
  const plan: Record<string, string> = {}
  const go = (ri: number, score: number) => {
    if (ri === cfg.rooms.length) { if (score > best.score) best = { score, plan: { ...plan } }; return }
    const room = cfg.rooms[ri]
    for (const art of cfg.artworks) {
      if (used.has(art.id)) continue
      used.add(art.id); plan[room.id] = art.id
      go(ri + 1, score + Math.round(art.baseValue * (room.bonusTypes.includes(art.type) ? room.mult : 1)))
      used.delete(art.id); delete plan[room.id]
    }
  }
  go(0, 0)
  return best
}

describe('audit — Museum', () => {
  it('the best arrangement clears winScore with some slack', () => {
    for (const [id, cfg] of Object.entries(MUSEUM)) {
      const { score } = bestMuseum(cfg)
      expect(score, `${id} best ${score} vs ${cfg.winScore}`).toBeGreaterThanOrEqual(cfg.winScore)
    }
  })

  it('placing the best arrangement and opening the doors wins exactly once at every difficulty', () => {
    vi.useFakeTimers()
    for (const [id, cfg] of Object.entries(MUSEUM)) {
      const { plan } = bestMuseum(cfg)
      for (const difficulty of DIFFS) {
        const onWin = vi.fn(), onLose = vi.fn()
        render(createElement(MuseumGame, { configId: id, difficulty, seed: 1, onWin, onLose }))
        for (const room of cfg.rooms) {
          const art = cfg.artworks.find(a => a.id === plan[room.id])!
          fireEvent.click(screen.getByText(art.title, { selector: 'p.font-bold.leading-tight' }))
          fireEvent.click(screen.getByText(room.name).closest('button')!)
        }
        fireEvent.click(screen.getByText('Open Museum Doors!'))
        act(() => { vi.advanceTimersByTime(2000) })
        expect(onWin, `${id}@${difficulty}`).toHaveBeenCalledTimes(1)
        expect(onLose).not.toHaveBeenCalled()
        cleanup()
      }
    }
  })

  it('a poor arrangement at difficulty 4 loses on the first attempt', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(MuseumGame, { configId: 'louvre-arrangement', difficulty: 4, seed: 1, onWin, onLose }))
    // Deliberately mismatched: shepherd→denon, mona→sully, winged→richelieu, lacemaker→modern = 60+100+80+70 = 310 < 400
    const bad: [string, string][] = [['Arcadian Shepherds', 'Denon Wing'], ['Mona Lisa', 'Sully Wing'], ['Winged Victory', 'Richelieu Wing'], ['The Lacemaker', 'Modern Gallery']]
    for (const [art, room] of bad) {
      fireEvent.click(screen.getByText(art, { selector: 'p.font-bold.leading-tight' }))
      fireEvent.click(screen.getByText(room).closest('button')!)
    }
    fireEvent.click(screen.getByText('Open Museum Doors!'))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onLose).toHaveBeenCalledTimes(1)
    expect(onWin).not.toHaveBeenCalled()
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

  it('a wrong order at difficulty 4 loses after the single attempt', () => {
    vi.useFakeTimers()
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(StorySortGame, { configId: 'odyssey-return', difficulty: 4, seed: 3, onWin, onLose }))
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

// ── Hunting ────────────────────────────────────────────────────────────────────

describe('audit — Hunting', () => {
  it('the arrows can score the target even with only one hit per shot', () => {
    for (const [id, cfg] of Object.entries(HUNTING)) {
      const pool = cfg.animals.flatMap(a => Array.from({ length: a.count }, () => a.points)).sort((a, b) => b - a)
      const best = pool.slice(0, cfg.bullets).reduce((s, p) => s + p, 0)
      expect(best, `${id} best ${best} vs target ${cfg.targetScore}`).toBeGreaterThanOrEqual(cfg.targetScore)
      // and it should not demand near-perfect aim: three misses must still leave a win
      const slack = pool.slice(0, cfg.bullets - 3).reduce((s, p) => s + p, 0)
      expect(slack, `${id} with three misses`).toBeGreaterThanOrEqual(cfg.targetScore)
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

/**
 * Greedy player mirroring the component's engine: each move takes the legal
 * swap that clears the most tiles right away, then lets cascades run with
 * the same refill RNG the component uses.
 */
function playMatchThree(configId: string, cfg: MatchThreeConfig, difficulty: Difficulty, attemptSeed: number) {
  const N = cfg.gridSize, types = cfg.tiles.length, rules = cfg.rules ?? {}
  const seed = (hashString(configId) ^ attemptSeed) >>> 0
  const rand = seededRandom(seed)
  let grid = makePlayableGrid(N, types, seededRandom(seed), rules)
  const moveLimit = moveLimitFor(cfg.target, difficulty)
  let cleared = 0, moves = 0, reshuffles = 0
  const resolve = (g: number[][]) => {
    let cur = g
    for (;;) {
      const m = findMatches(cur, N, rules)
      if (!m.size) return cur
      const copy = cur.map(r => [...r])
      m.forEach(k => { const [r, c] = k.split(',').map(Number); copy[r][c] = -1 })
      cur = applyGravity(copy, N, types, rand)
      cleared += m.size
    }
  }
  while (cleared < cfg.target) {
    if (moveLimit && moves >= moveLimit) return { won: false, moves, cleared, reshuffles }
    const swaps = validSwaps(grid, N, rules)
    if (!swaps.length) { grid = makePlayableGrid(N, types, rand, rules); reshuffles++; continue }
    let best: number[][] | null = null, bestCount = -1
    for (const [r, c, r2, c2] of swaps) {
      const g = grid.map(row => [...row])
      ;[g[r][c], g[r2][c2]] = [g[r2][c2], g[r][c]]
      const n = findMatches(g, N, rules).size
      if (n > bestCount) { bestCount = n; best = g }
    }
    moves++
    grid = resolve(best!)
    if (!hasValidMove(grid, N, rules)) { grid = makePlayableGrid(N, types, rand, rules); reshuffles++ }
  }
  return { won: true, moves, cleared, reshuffles }
}

describe('audit — Match Three', () => {
  const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1)

  it('a dealt board has no ready-made matches and always has a legal swap, for every config', () => {
    for (const [id, cfg] of Object.entries(MATCH3)) {
      for (const s of SEEDS) {
        const grid = makePlayableGrid(cfg.gridSize, cfg.tiles.length, seededRandom((hashString(id) ^ s) >>> 0), cfg.rules)
        expect(findMatches(grid, cfg.gridSize, cfg.rules).size, `${id} seed ${s} dealt with matches`).toBe(0)
        expect(hasValidMove(grid, cfg.gridSize, cfg.rules), `${id} seed ${s}`).toBe(true)
      }
    }
  })

  it('a greedy player reaches the target within the move limit at every difficulty', () => {
    for (const [id, cfg] of Object.entries(MATCH3)) {
      for (const difficulty of DIFFS) {
        const results = SEEDS.map(s => playMatchThree(id, cfg, difficulty, s))
        const wins = results.filter(r => r.won).length
        const avgMoves = results.reduce((s, r) => s + r.moves, 0) / results.length
        const summary = `${id}@${difficulty}: ${wins}/${SEEDS.length} wins, limit ${moveLimitFor(cfg.target, difficulty)}, avg ${avgMoves.toFixed(1)} moves`
        // Tier 1 is unlimited and must always finish; tighter tiers must be winnable by plain greedy play most of the time.
        const need = difficulty === 1 ? SEEDS.length : Math.ceil(SEEDS.length * 0.75)
        expect(wins, summary).toBeGreaterThanOrEqual(need)
      }
    }
  })

  it('every story challenge (config × difficulty) is winnable by the greedy player', () => {
    for (const [configId, use] of storyUses('matchthree')) {
      const cfg = MATCH3[configId]
      for (const difficulty of use.difficulties) {
        const wins = SEEDS.filter(s => playMatchThree(configId, cfg, difficulty, s).won).length
        expect(wins, `${configId}@${difficulty}`).toBeGreaterThanOrEqual(Math.ceil(SEEDS.length * 0.75))
      }
    }
  })

  it('clearing the target in the component wins exactly once; running out of moves loses once', () => {
    vi.useFakeTimers()
    const id = 'lisbon-spices', cfg = MATCH3[id]
    const onWin = vi.fn(), onLose = vi.fn()
    const { container } = render(createElement(MatchThreeGame, { configId: id, difficulty: 4, seed: 2, onWin, onLose }))
    const N = cfg.gridSize
    // Replay the greedy player's swaps against the live grid read from the DOM labels.
    const readGrid = () => {
      const cells = [...container.querySelectorAll('div.grid > button')]
      return Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => cfg.tiles.findIndex(t => t.label === cells[r * N + c].textContent)))
    }
    const click = (r: number, c: number) => fireEvent.click(container.querySelectorAll('div.grid > button')[r * N + c])
    for (let guard = 0; guard < 40 && !onWin.mock.calls.length && !onLose.mock.calls.length; guard++) {
      const grid = readGrid()
      const swaps = validSwaps(grid, N, cfg.rules)
      expect(swaps.length, `move ${guard}: board has a legal swap`).toBeGreaterThan(0)
      const [r, c, r2, c2] = swaps[0]
      click(r, c); click(r2, c2)
      act(() => { vi.advanceTimersByTime(5000) })
    }
    expect(onWin.mock.calls.length + onLose.mock.calls.length).toBe(1)
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
