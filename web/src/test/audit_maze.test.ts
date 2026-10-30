// Solvability audit for the physics mazes.  Every config, at every difficulty
// and for several seeds, must generate levels that the mode-aware solver can
// win in a sane number of inputs — and the solution must replay through the
// game's own step function without losing a life or being caught by a hazard.
import { describe, it, expect } from 'vitest'
import type { Difficulty } from '@/games/types'
import storyChallenges from '@/data/story_challenges.json'
import {
  CONFIGS, CONFIG_IDS, MODES, generateLevel, settings, solve, solutionRange,
  initialState, step, resolveMode, resolveMazeConfig, type Mode,
} from '@/components/minigames/BigMazeGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 4, 5, 6]

describe('physics mazes: generation and solvability', () => {
  for (const id of CONFIG_IDS) {
    for (const d of DIFFS) {
      it(`${id} at difficulty ${d} is solvable for ${SEEDS.length} seeds`, () => {
        const cfg = CONFIGS[id]
        const s = settings(cfg, d)
        const [lo, hi] = solutionRange(s.mode, d)
        expect(lo).toBeGreaterThanOrEqual(3)
        expect(hi).toBeLessThanOrEqual(20)
        for (const seed of SEEDS) {
          for (let li = 0; li < s.levels; li++) {
            const level = generateLevel(cfg, d, seed, li)
            const tag = `${id} d${d} seed ${seed} level ${li} (${level.mode})`
            expect(level.mode, tag).toBe(s.mode)
            expect(level.size, tag).toBeLessThanOrEqual(11)
            expect(level.start, tag).not.toEqual(level.exit)
            expect(level.grid[level.start[0]][level.start[1]], tag).not.toBe('#')

            const sol = solve(level)
            expect(sol, tag).not.toBeNull()
            expect(sol!.length, tag).toBeGreaterThanOrEqual(lo)
            expect(sol!.length, tag).toBeLessThanOrEqual(hi)
            expect(level.solution.length, tag).toBe(sol!.length)

            // Replay the stored solution through the engine: every input must
            // act, no life may be lost, and the run must end on the exit.
            let gs = initialState(level, s.lives)
            for (const mv of level.solution) {
              const next = step(level, gs, mv)
              expect(next, `${tag}: input did nothing`).not.toBe(gs)
              gs = next
              if (gs.status !== 'playing') break
            }
            expect(gs.status, tag).toBe('won')
            expect(gs.lives, tag).toBe(s.lives)
            expect(gs.turn, tag).toBe(level.solution.length)
            if (s.hasKey) expect(gs.hasKey, tag).toBe(true)

            if (level.mode === 'spread') {
              // The hazard must genuinely threaten the exit: it gets there
              // shortly after a perfect run, never before it.
              const reach = level.burnTime![level.exit[0]][level.exit[1]]
              expect(reach, tag).toBeGreaterThanOrEqual(level.solution.length)
              expect(reach, tag).toBeLessThanOrEqual(level.solution.length + 12)
              // And a dawdling player is caught: standing still is impossible,
              // but every cell the solution rests on is safe at that turn.
              let t = 0, cur = initialState(level, 1)
              for (const mv of level.solution) {
                cur = step(level, cur, mv); t++
                if (cur.status === 'won') break
                expect(level.burnTime![cur.r][cur.c], `${tag} turn ${t}`).toBeGreaterThan(t)
              }
            }
          }
        }
      })
    }
  }

  it('uses every mode across the configs', () => {
    const used = new Set<Mode>()
    for (const id of CONFIG_IDS) for (const d of DIFFS) used.add(resolveMode(CONFIGS[id], d))
    for (const m of MODES) expect(used.has(m), m).toBe(true)
  })

  it('every maze configId in the story data exists', () => {
    const missing: string[] = []
    for (const entry of storyChallenges as { story: string; challenges: { type: string; game?: string; configId?: string }[] }[])
      for (const ch of entry.challenges)
        if (ch.type === 'minigame' && ch.game === 'maze' && ch.configId && !CONFIGS[ch.configId]) missing.push(`${entry.story}: ${ch.configId}`)
    expect(missing).toEqual([])
  })

  it('ignores leftover quiz text in params but honours mode/size/levels', () => {
    const base = CONFIGS['cedar-forest']
    const cfg = resolveMazeConfig('cedar-forest', { title: 'Arrange the key events', subtitle: 'nope', mode: 'slide', size: 9, levels: 1, bogus: 3 })
    expect(cfg.title).toBe(base.title)
    expect(cfg.subtitle).toBe(base.subtitle)
    expect(cfg.mode).toBe('slide')
    expect(cfg.size).toBe(9)
    expect(cfg.levels).toBe(1)
    expect(resolveMazeConfig('cedar-forest', { mode: 'flying', size: 99 })).toEqual(base)
    expect(resolveMazeConfig('no-such-config')).toBe(CONFIGS['pyramid-deep'])
  })
})
