// The falling-note Rhythm game: charts are deterministic and playable, and
// judgement rules make a perfect performance win at every difficulty.
import { createElement } from 'react'
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import storyChallenges from '@/data/story_challenges.json'
import type { Challenge, Difficulty, MinigameChallenge } from '@/games/types'
import RhythmGame, {
  CONFIGS, buildChart, rhythmRules, newRun, hitLane, sweepMisses, verdict, judgeOffset, accuracy,
  LANE_KEYS, LEAD_IN_MS, type Chart, type RunState,
} from '@/components/minigames/RhythmGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = Array.from({ length: 25 }, (_, i) => i * 7919 + 1)

/** Tap every note at its time plus `offset(i)`, skipping some; return the final state and verdict. */
function perform(chart: Chart, d: Difficulty, offset: (i: number) => number = () => 0, skip: (i: number) => boolean = () => false) {
  let s: RunState = newRun(chart)
  let v: ReturnType<typeof verdict> = null
  chart.notes.forEach((n, i) => {
    if (v) return
    const at = n.t + offset(i)
    s = sweepMisses(s, chart, at, d)
    if (!skip(i)) s = hitLane(s, chart, n.lane, at, d).state
    v = verdict(s, chart, d)
  })
  if (!v) { s = sweepMisses(s, chart, chart.endMs + 10_000, d); v = verdict(s, chart, d) }
  return { s, v }
}

describe('Rhythm charts', () => {
  for (const [id, cfg] of Object.entries(CONFIGS)) for (const d of DIFFS) {
    it(`${id}@${d}: deterministic, in lane, reachable and never impossibly crowded`, () => {
      const r = rhythmRules(d)
      expect(buildChart(cfg, d, 42)).toEqual(buildChart(cfg, d, 42))
      for (const seed of SEEDS) {
        const c = buildChart(cfg, d, seed)
        expect(c.lanes).toBe(r.lanes)
        expect(c.notes.length).toBeGreaterThanOrEqual(20)
        expect(c.notes[0].t, 'first note must fall the whole lane').toBeGreaterThanOrEqual(c.travelMs)
        for (let i = 0; i < c.notes.length; i++) {
          const n = c.notes[i]
          expect(n.lane).toBeGreaterThanOrEqual(0)
          expect(n.lane).toBeLessThan(c.lanes)
          expect(n.freq).toBeGreaterThan(0)
          if (i) expect(n.t - c.notes[i - 1].t, `${id}@${d} seed ${seed} gap at ${i}`).toBeGreaterThanOrEqual(r.minGapMs)
        }
        // Windows of neighbouring notes may meet but a perfect tap always lands on its own note.
        expect(r.minGapMs).toBeGreaterThan(2 * r.perfectMs)
        // Tempo rises phrase by phrase.
        for (let p = 1; p < c.phrases.length; p++) expect(c.phrases[p].bpm).toBeGreaterThan(c.phrases[p - 1].bpm)
        expect(c.phrases.length).toBe(r.phrases)
      }
    })
    it(`${id}@${d}: a perfect performance wins; silence loses`, () => {
      for (const seed of SEEDS.slice(0, 8)) {
        const c = buildChart(cfg, d, seed)
        const best = perform(c, d)
        expect(best.v, `${id}@${d} seed ${seed}`).toBe('won')
        expect(best.s.perfect).toBe(c.notes.length)
        expect(best.s.maxCombo).toBe(c.notes.length)
        // Taps at the edge of the perfect window are still perfect.
        expect(perform(c, d, i => (i % 2 ? 1 : -1) * rhythmRules(d).perfectMs).v).toBe('won')
        expect(perform(c, d, () => 0, () => true).v).toBe('lost')
      }
    })
  }

  it('different seeds vary the chart above the easiest tier', () => {
    const cfg = CONFIGS['bach-fugue']
    const sig = (d: Difficulty, seed: number) => buildChart(cfg, d, seed).notes.map(n => n.lane).join('')
    for (const d of [2, 3, 4] as Difficulty[]) expect(new Set(SEEDS.map(s => sig(d, s))).size).toBeGreaterThan(1)
  })

  it('judgement windows: perfect, good, then out of reach', () => {
    for (const d of DIFFS) {
      const r = rhythmRules(d)
      expect(judgeOffset(0, d)).toBe('perfect')
      expect(judgeOffset(-r.perfectMs, d)).toBe('perfect')
      expect(judgeOffset(r.perfectMs + 1, d)).toBe('good')
      expect(judgeOffset(-r.goodMs, d)).toBe('good')
      expect(judgeOffset(r.goodMs + 1, d)).toBeNull()
    }
  })

  it('sloppy-but-complete play passes at Origins and fails at Legacy', () => {
    const goodOnly = (d: Difficulty) => (i: number) => (i % 2 ? 1 : -1) * (rhythmRules(d).perfectMs + 5)
    const c1 = buildChart(CONFIGS['beethoven-motif'], 1, 3)
    expect(accuracy(perform(c1, 1, goodOnly(1)).s, c1)).toBeCloseTo(0.6)
    expect(perform(c1, 1, goodOnly(1)).v).toBe('won')
    const c4 = buildChart(CONFIGS['beethoven-motif'], 4, 3)
    expect(perform(c4, 4, goodOnly(4)).v).toBe('lost')
  })

  it('the miss cap ends the song early', () => {
    for (const d of DIFFS) {
      const c = buildChart(CONFIGS['court-drums'], d, 9)
      const r = rhythmRules(d)
      const { s, v } = perform(c, d, () => 0, i => i < r.maxMisses)
      expect(v).toBe('lost')
      expect(s.miss).toBe(r.maxMisses)
      // One fewer miss than the cap, everything else perfect, still wins.
      expect(perform(c, d, () => 0, i => i < r.maxMisses - 1 && i < c.notes.length * (1 - r.target) - 1).v).toBe('won')
    }
  })

  it('a tap in the wrong lane is a stray and breaks the combo', () => {
    const c = buildChart(CONFIGS['hildegard-chant'], 2, 1)
    let s = hitLane(newRun(c), c, c.notes[0].lane, c.notes[0].t, 2).state
    expect(s.combo).toBe(1)
    const other = (c.notes[1].lane + 1) % c.lanes
    const res = hitLane(s, c, other, c.notes[1].t, 2)
    s = res.state
    expect(res.judgement).toBeNull()
    expect(s.combo).toBe(0)
    expect(s.stray).toBe(1)
    expect(s.judged[1]).toBeNull()
  })

  it('every story rhythm challenge is winnable at its own difficulty', () => {
    const uses = (storyChallenges as { challenges: Challenge[] }[]).flatMap(e => e.challenges)
      .filter((c): c is MinigameChallenge => c.type === 'minigame' && c.game === 'rhythm')
    expect(uses.length).toBeGreaterThan(0)
    for (const ch of uses) {
      const d = (ch.difficulty ?? 1) as Difficulty
      const c = buildChart(CONFIGS[ch.configId!], d, ch.seed ?? 1)
      expect(perform(c, d).v, ch.id).toBe('won')
    }
  })
})

describe('Rhythm component', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { cleanup(); vi.useRealTimers() })
  const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

  for (const d of [2, 3] as Difficulty[]) {
    it(`beethoven-motif@${d} is won by tapping the lane pads on time`, () => {
      const onWin = vi.fn(), onLose = vi.fn()
      render(createElement(RhythmGame, { configId: 'beethoven-motif', difficulty: d, seed: 4, onWin, onLose }))
      const chart = buildChart(CONFIGS['beethoven-motif'], d, 4)
      fireEvent.click(screen.getByRole('button', { name: /Strike up/ }))
      let elapsed = 0
      for (const n of chart.notes) {
        tick(LEAD_IN_MS + n.t - elapsed); elapsed = LEAD_IN_MS + n.t
        fireEvent.pointerDown(screen.getByLabelText(`lane ${n.lane + 1}`))
      }
      tick(1500)
      expect(onWin).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      expect(screen.getByLabelText('accuracy').textContent).toBe('100%')
    })
  }

  it('keys map to lanes and ignore keys beyond the lane count', () => {
    expect(LANE_KEYS.slice(0, rhythmRules(1).lanes).join('')).toBe('dfj')
    const onWin = vi.fn(), onLose = vi.fn()
    render(createElement(RhythmGame, { configId: 'court-drums', difficulty: 1, seed: 1, onWin, onLose }))
    expect(screen.getAllByLabelText(/^lane \d$/)).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /Strike up/ }))
    fireEvent.keyDown(window, { key: 'l' })     // lane 5 does not exist at D1
    tick(100)
    expect(onLose).not.toHaveBeenCalled()
  })

  it('renders silently without WebAudio', () => {
    const onWin = vi.fn(), onLose = vi.fn()
    expect(() => {
      render(createElement(RhythmGame, { configId: 'bach-fugue', difficulty: 4, seed: 1, onWin, onLose }))
      fireEvent.click(screen.getByRole('button', { name: /Strike up/ }))
      tick(3000)
      fireEvent.keyDown(window, { key: 'd' })
    }).not.toThrow()
    expect(screen.getAllByTestId('note').length).toBeGreaterThan(0)
  })
})
