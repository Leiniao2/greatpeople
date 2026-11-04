// Mancala (Oware abapa race, Kalah, Bao relay, Anan-anan fours): rules
// engine, the time budget, win rates against a deeper search at every
// config × difficulty, and the component's single-outcome contract.
import { describe, it, expect, vi } from 'vitest'
import {
  CONFIGS, CONFIG_IDS, initialState, legalMoves, applyMove, winner, humanWins, aiMove, bestMove,
  sideSum, type MancalaConfig, type MState, type Player,
} from '@/components/minigames/MancalaGame'
import { mulberry32 } from '@/components/minigames/_shared'
import type { Difficulty } from '@/games/types'
import { scale } from '@/components/minigames/_shared'

const DIFFS: Difficulty[] = [1, 2, 3, 4]
// Win rates go to stderr so they show in the vitest output.
const log = (m: string) => (globalThis as { process?: { stderr: { write(s: string): void } } }).process?.stderr.write(m + '\n')

/** A fixed position under a config's rules; by default the target is a plain majority. */
function pos(configId: string, pits: number[], store: [number, number] = [0, 0], turn: Player = 0, race = false, d: Difficulty = 4): MState {
  const config: MancalaConfig = { ...CONFIGS[configId], ...(race ? {} : { target: undefined }), start: { pits, store, turn } }
  return initialState(config, Math.random, d)
}

describe('oware (abapa)', () => {
  it('starts with 4 seeds in each of 12 pits and six moves', () => {
    const s = initialState(CONFIGS.oware, mulberry32(1), 2)
    expect(s.pits).toEqual(Array(12).fill(4))
    expect(legalMoves(s)).toEqual([0, 1, 2, 3, 4, 5])
  })
  it('sows counter-clockwise and a lap of 12+ seeds skips the starting pit', () => {
    const s = pos('oware', [12, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1])
    const { state, info } = applyMove(s, 0)
    expect(info.sown).not.toContain(0)
    expect(state.pits[0]).toBe(0)
    expect(state.pits.slice(1, 6)).toEqual([2, 1, 1, 1, 1])
    expect(state.turn).toBe(1)
  })
  it('captures 2s and 3s on the opponent row, chaining backwards until a break', () => {
    const s = pos('oware', [0, 0, 0, 0, 0, 3, 1, 2, 1, 0, 0, 4])
    const r = applyMove(s, 5)
    expect(r.info.captured).toEqual([8, 7, 6])
    expect(r.state.store[0]).toBe(7)
    const broken = applyMove(pos('oware', [0, 0, 0, 0, 0, 3, 0, 2, 1, 0, 0, 4]), 5)
    expect(broken.info.captured).toEqual([8, 7])
    expect(broken.state.pits[6]).toBe(1)
  })
  it('never captures on its own row, and a last seed making 4 captures nothing', () => {
    const r = applyMove(pos('oware', [0, 1, 1, 0, 0, 0, 3, 3, 0, 0, 0, 2]), 1)
    expect(r.info.take).toBe(0)
    const r2 = applyMove(pos('oware', [0, 0, 0, 0, 0, 1, 3, 0, 0, 0, 0, 2]), 5)
    expect(r2.info.take).toBe(0)
  })
  it('grand slam: a capture that would empty the opponent row captures nothing', () => {
    const r = applyMove(pos('oware', [0, 0, 0, 0, 1, 2, 1, 1, 0, 0, 0, 0]), 5)
    expect(r.info.grandSlam).toBe(true)
    expect(r.info.take).toBe(0)
    expect(r.state.pits.slice(6, 8)).toEqual([2, 2])
  })
  it('must feed an empty opponent; with no feeding move the game ends and rows go to owners', () => {
    const s = pos('oware', [1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0], [20, 20])
    expect(legalMoves(s)).toEqual([4])
    const stuck = pos('oware', [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [22, 24])
    expect(stuck.over).toBe(true)
    expect(stuck.store).toEqual([24, 24])
  })
  it('ends as soon as someone holds more than half the seeds', () => {
    const r = applyMove(pos('oware', [0, 0, 0, 0, 0, 2, 2, 1, 0, 0, 0, 5], [20, 16]), 5)
    expect(r.info.take).toBe(5)
    expect(r.state.over).toBe(true)
    expect(winner(r.state)).toBe(0)
  })
})

describe('kalah', () => {
  it('last seed in your store earns another turn', () => {
    const { state, info } = applyMove(initialState(CONFIGS.kalah), 2)
    expect(info.extraTurn).toBe(true)
    expect(state.turn).toBe(0)
    expect(state.store[0]).toBe(1)
  })
  it('skips the opponent store when sowing', () => {
    const s = pos('kalah', [0, 0, 0, 0, 0, 8, 1, 1, 1, 1, 1, 1])
    const { info } = applyMove(s, 5)
    // own store (12), the six opposing pits, then past their store (13) to pit 0.
    expect(info.sown).toEqual([12, 6, 7, 8, 9, 10, 11, 0])
  })
  it('landing in an empty pit of yours takes it and the pit opposite', () => {
    const s = pos('kalah', [1, 0, 3, 0, 0, 0, 2, 2, 2, 2, 5, 2])
    const { state, info } = applyMove(s, 0)
    expect(info.captured).toEqual([10, 1])
    expect(info.take).toBe(6)
    expect(state.store[0]).toBe(6)
  })
  it('when a row empties, each side keeps the seeds on its own row', () => {
    const { state } = applyMove(pos('kalah', [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], [18, 23]), 5)
    expect(state.over).toBe(true)
    expect(state.store).toEqual([19, 29])
    expect(winner(state)).toBe(1)
  })
})

describe('bao relay', () => {
  it('relays from occupied pits and captures opposite when ending in an empty own pit', () => {
    // From pit 0 (2 seeds): 1, 2 → pit 2 had 1, now 2 → lift & sow 3, 4 → pit 4 was empty: stop, capture 11.
    const pits = [2, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 6, 1, 1, 1, 1]
    const { state, info } = applyMove(pos('bao-lite', pits), 0)
    expect(info.relays).toBe(1)
    expect(info.captured).toEqual([11])
    expect(state.store[0]).toBe(6)
    expect(state.pits.slice(0, 5)).toEqual([0, 1, 0, 1, 1])
  })
  it('must start from a pit of two or more when there is one', () => {
    expect(legalMoves(pos('bao-lite', [1, 2, 0, 1, 0, 0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1]))).toEqual([1, 7])
    expect(legalMoves(pos('bao-lite', [1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]))).toEqual([0, 3])
  })
  it('seeded layouts hold 48 seeds and are point-symmetric', () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = initialState(CONFIGS['bao-lite'], mulberry32(seed), ((seed % 4) + 1) as Difficulty)
      expect(s.total).toBe(48)
      expect(s.pits.slice(0, 8)).toEqual(s.pits.slice(8))
    }
  })
})

describe('fours (anan-anan)', () => {
  it('a pit reaching four mid-sowing goes to its row owner; the last pit of four to the sower', () => {
    // Pit 4 (4 seeds) sows 5, 6, 7, 8. Pit 5 (mine) and pit 7 (theirs) reach four
    // on the way; pit 8 reaches four with the last seed and is mine.
    const s = pos('fours', [0, 0, 0, 0, 4, 3, 1, 3, 3, 0, 0, 1])
    const { state, info } = applyMove(s, 4)
    expect(info.captured).toEqual([5, 7, 8])
    expect(info.take).toBe(8)
    expect(info.given).toBe(4)
    expect(state.store).toEqual([8, 4])
    expect(state.pits[6]).toBe(2)
  })
  it('feeding a rival pit up to four mid-sowing hands it over', () => {
    const { state, info } = applyMove(pos('fours', [0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 1]), 5)
    // 6 → 4 (theirs, not the last seed), 7 → 1, 8 → 1.
    expect(info.given).toBe(4)
    expect(info.take).toBe(0)
    expect(state.store).toEqual([0, 4])
  })
  it('starts with four everywhere and nothing is taken until a pit is refilled to four', () => {
    const s = initialState(CONFIGS.fours, mulberry32(1), 1)
    expect(s.pits).toEqual(Array(12).fill(4))
    expect(applyMove(s, 0).info.captured).toEqual([])
  })
})

describe('race targets and the cap', () => {
  it('oware, bao and fours are races to a target that grows with difficulty; kalah needs a majority', () => {
    expect(DIFFS.map(d => initialState(CONFIGS.oware, mulberry32(1), d).target)).toEqual([10, 12, 14, 16])
    expect(DIFFS.map(d => initialState(CONFIGS.kalah, mulberry32(1), d).target)).toEqual([19, 19, 25, 25])
    expect(DIFFS.map(d => initialState(CONFIGS.kalah, mulberry32(1), d).total)).toEqual([36, 36, 48, 48])
    for (const id of ['bao-lite', 'fours']) {
      const t = DIFFS.map(d => initialState(CONFIGS[id], mulberry32(1), d).target)
      expect(t.every((x, i) => i === 0 || x >= t[i - 1]), id).toBe(true)
      expect(t[3]).toBeLessThan(25)
    }
  })
  it('reaching the race target ends the game on the spot', () => {
    // Oware at D1 (target 10): capturing 3 from 8 wins although most seeds are still out.
    const r = applyMove(pos('oware', [0, 0, 0, 0, 0, 1, 2, 4, 4, 4, 4, 4], [8, 0], 0, true, 1), 5)
    expect(r.info.take).toBe(3)
    expect(r.state.over).toBe(true)
    expect(humanWins(r.state, 1)).toBe(true)
  })
  it('the cap ends a game: each side keeps its row, most seeds wins', () => {
    let s = initialState(CONFIGS.oware, mulberry32(4), 1)
    while (!s.over) s = applyMove(s, legalMoves(s)[0]).state
    expect(s.ply).toBeLessThanOrEqual(s.plyLimit)
    expect(s.store[0] + s.store[1]).toBe(48)
  })
  it('time budget: at most 33 of your turns at D4 and 18 at D1', () => {
    for (const id of CONFIG_IDS) {
      const caps = DIFFS.map(d => scale(d, CONFIGS[id].plyCap))
      expect(caps.every((c, i) => i === 0 || c >= caps[i - 1]), id).toBe(true)
      expect(caps[0] / 2, id).toBeLessThanOrEqual(22)
      expect(caps[3] / 2, id).toBeLessThanOrEqual(33)
    }
  })
  it('every config is a different rule set', () => {
    expect(new Set(CONFIG_IDS.map(id => CONFIGS[id].variant)).size).toBe(CONFIG_IDS.length)
    expect(CONFIG_IDS.length).toBeGreaterThanOrEqual(4)
  })
})

describe('outcome rule', () => {
  it('a tie is a win at D1–2 and a loss at D3–4', () => {
    const tie = pos('oware', Array(12).fill(0), [24, 24])
    expect(tie.over).toBe(true)
    expect(winner(tie)).toBeNull()
    expect([1, 2, 3, 4].map(d => humanWins(tie, d as Difficulty))).toEqual([true, true, false, false])
  })
})

/** Play one game: the human side uses `human`, the computer uses aiMove at `d`. */
function playGame(configId: string, d: Difficulty, seed: number, human: (s: MState, rng: () => number) => number) {
  const rng = mulberry32(seed)
  let s = initialState(CONFIGS[configId], rng, d)
  let maxMs = 0, mine = 0
  while (!s.over) {
    let m: number
    if (s.turn === 0) { m = human(s, rng); mine++ }
    else {
      const t = performance.now()
      m = aiMove(s, d, rng)
      maxMs = Math.max(maxMs, performance.now() - t)
      expect(legalMoves(s)).toContain(m)
    }
    s = applyMove(s, m).state
  }
  return { s, maxMs, mine }
}

const strong = (configId: string) => (s: MState, rng: () => number) => bestMove(s, configId === 'bao-lite' ? 8 : 10, rng, 400_000)

describe('AI', () => {
  it('returns legal moves well inside the time budget at every difficulty', () => {
    for (const id of CONFIG_IDS) {
      for (const d of DIFFS) {
        const { maxMs } = playGame(id, d, 100 + d, (s, rng) => legalMoves(s)[Math.floor(rng() * legalMoves(s).length)])
        expect(maxMs, `${id} D${d}`).toBeLessThan(300)
      }
    }
  })

  it('winnable at every config × difficulty, and short: a deeper search wins most games in few moves', () => {
    const GAMES = 6
    // Median of the strong player's own moves per difficulty must stay inside the budget.
    const MEDIAN_MAX = [14, 18, 24, 30]
    for (const id of CONFIG_IDS) {
      for (const d of DIFFS) {
        let wins = 0
        const lens: number[] = []
        for (let g = 0; g < GAMES; g++) {
          const { s, mine } = playGame(id, d, 1000 + g * 31, strong(id))
          lens.push(mine)
          if (humanWins(s, d)) wins++
        }
        lens.sort((a, b) => a - b)
        const median = lens[GAMES >> 1]
        log(`[mancala] ${id} strong vs D${d}: ${wins}/${GAMES}, median ${median} moves, max ${lens[GAMES - 1]}`)
        expect(wins, `${id} D${d}`).toBeGreaterThanOrEqual(d === 1 ? GAMES - 1 : GAMES / 2)
        expect(median, `${id} D${d} median moves`).toBeLessThanOrEqual(MEDIAN_MAX[d - 1])
        expect(lens[GAMES - 1], `${id} D${d} longest`).toBeLessThanOrEqual(scale(d, CONFIGS[id].plyCap))
      }
    }
  }, 300_000)

  it('D1 still needs real decisions: a random player loses some games', () => {
    for (const id of CONFIG_IDS) {
      let lost = 0
      for (let g = 0; g < 10; g++) {
        const { s } = playGame(id, 1, 700 + g, (st, rng) => legalMoves(st)[Math.floor(rng() * legalMoves(st).length)])
        if (!humanWins(s, 1)) lost++
      }
      expect(lost, id).toBeGreaterThan(0)
    }
  }, 60_000)

  it('D4 beats a random player and usually a greedy 1-ply player', () => {
    for (const id of CONFIG_IDS) {
      let aiWins = 0
      for (let g = 0; g < 6; g++) {
        const { s } = playGame(id, 4, 500 + g, (st, rng) => bestMove(st, 1, rng))
        if (!humanWins(s, 4)) aiWins++
      }
      log(`[mancala] ${id} D4 vs greedy: AI won ${aiWins}/6`)
      expect(aiWins).toBeGreaterThanOrEqual(5)
    }
  }, 60_000)

  it('is deterministic per seed', () => {
    const a = playGame('oware', 2, 77, strong('oware')).s
    const b = playGame('oware', 2, 77, strong('oware')).s
    expect(a.store).toEqual(b.store)
    expect(a.pits).toEqual(b.pits)
    expect(a.store[0] + a.store[1] + sideSum(a, 0) + sideSum(a, 1)).toBe(48)
    expect(a.ply).toBeLessThanOrEqual(a.plyLimit)
  })
})

describe('MancalaGame UI', () => {
  it('renders every config at every difficulty', async () => {
    const { render, screen, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: MancalaGame } = await import('@/components/minigames/MancalaGame')
    for (const configId of CONFIG_IDS) {
      for (const difficulty of DIFFS) {
        render(createElement(MancalaGame, { configId, difficulty, seed: 9, onWin: () => {}, onLose: () => {} }))
        expect(screen.getByText(CONFIGS[configId].title)).toBeTruthy()
        expect(screen.getAllByLabelText(/^your pit \d+/).length).toBe(CONFIGS[configId].pits)
        expect(screen.getAllByLabelText(/playable/).length).toBeGreaterThan(0)
        cleanup()
      }
    }
  })

  it('a scripted win calls onWin once', async () => {
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: MancalaGame } = await import('@/components/minigames/MancalaGame')
    vi.useFakeTimers()
    let won = 0, lost = 0
    const params = { start: { pits: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], store: [24, 17] } }
    render(createElement(MancalaGame, { configId: 'kalah', difficulty: 3, seed: 1, params, onWin: () => { won++ }, onLose: () => { lost++ } }))
    fireEvent.click(screen.getByLabelText(/^your pit 6/))
    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.click(screen.getByLabelText(/^your pit 6/))
    act(() => { vi.advanceTimersByTime(3000) })
    expect([won, lost]).toEqual([1, 0])
    cleanup()
    vi.useRealTimers()
  })

  it('a scripted loss calls onLose once', async () => {
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: MancalaGame } = await import('@/components/minigames/MancalaGame')
    vi.useFakeTimers()
    let won = 0, lost = 0
    const params = { start: { pits: [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1], store: [18, 23] } }
    render(createElement(MancalaGame, { configId: 'kalah', difficulty: 1, seed: 1, params, onWin: () => { won++ }, onLose: () => { lost++ } }))
    fireEvent.click(screen.getByLabelText(/^your pit 6/))
    act(() => { vi.advanceTimersByTime(3000) })
    expect([won, lost]).toEqual([0, 1])
    cleanup()
    vi.useRealTimers()
  })

  it('the computer replies after a human move', async () => {
    const { render, screen, fireEvent, act, cleanup } = await import('@testing-library/react')
    const { createElement } = await import('react')
    const { default: MancalaGame } = await import('@/components/minigames/MancalaGame')
    vi.useFakeTimers()
    render(createElement(MancalaGame, { configId: 'oware', difficulty: 2, seed: 3, onWin: () => {}, onLose: () => {} }))
    fireEvent.click(screen.getByLabelText(/^your pit 1,/))
    expect(screen.getByRole('status').textContent).toMatch(/You sowed/)
    act(() => { vi.advanceTimersByTime(600) })
    expect(screen.getByRole('status').textContent).toMatch(/Opponent sowed/)
    expect(screen.getAllByLabelText(/playable/).length).toBeGreaterThan(0)
    cleanup()
    vi.useRealTimers()
  })
})
