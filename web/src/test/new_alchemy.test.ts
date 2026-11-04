// Elements (alchemy): every config × difficulty × seed generates a puzzle
// whose solver chain sits in its tier's band and really reaches the target,
// the four rule systems behave as described, and the component wins and
// loses exactly once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act as rtlAct, screen } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import AlchemyGame, {
  CONFIGS, CONFIG_IDS, BOOKS, generate, solve, act, isWon, tierFor, wxId, pairKey, relevantFor,
  type Puzzle, type State,
} from '@/components/minigames/AlchemyGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = Array.from({ length: 16 }, (_, i) => i * 7919 + 3)

function replay(p: Puzzle): State {
  let s = p.start
  for (const m of p.solution) {
    const r = act(p, s, m.a, m.b)
    expect(r.kind).toBe('new')
    s = r.state
  }
  return s
}

describe('alchemy books and rules', () => {
  it('has four configs, each with its own rule system', () => {
    expect(CONFIG_IDS.length).toBe(4)
    expect(new Set(CONFIG_IDS.map(id => CONFIGS[id].kind)).size).toBe(4)
    for (const id of CONFIG_IDS) expect(CONFIGS[id].fact.length).toBeGreaterThan(40)
  })

  it('recipes only use items the book knows', () => {
    for (const b of Object.values(BOOKS)) for (const r of b.recipes) {
      for (const x of [r.a, r.b, ...r.out]) if (x) expect(b.items[x], `${b.kind} ${x}`).toBeTruthy()
    }
  })

  it('wuxing: same phase kindles the next, mother feeds child, overcoming clashes', () => {
    const p = { book: BOOKS.wuxing, index: generate('wuxing', 1, 1).index }
    const s: State = { [wxId(0, 1)]: 1, [wxId(1, 0)]: 1, [wxId(2, 2)]: 1 }
    expect(act(p, s, wxId(0, 1), wxId(0, 1)).out).toEqual([wxId(1, 1)])
    expect(act(p, s, wxId(0, 1), wxId(1, 0)).out).toEqual([wxId(1, 2)])
    const clash = act(p, s, wxId(0, 1), wxId(2, 2))
    expect(clash.kind).toBe('harmful')
    expect(clash.cost).toBe(2)
    expect(BOOKS.wuxing.harmful.has(pairKey(wxId(3, 0), wxId(0, 3)))).toBe(true)
  })

  it('lavoisier: reactions consume stock and heating splits a calx', () => {
    const p = { book: BOOKS.lavoisier, index: generate('lavoisier', 1, 1).index }
    const s: State = { hgcalx: 1, h: 1 }
    const heat = act(p, s, 'hgcalx')
    expect(heat.kind).toBe('new')
    expect(heat.state).toMatchObject({ hgcalx: 0, hg: 1, o: 1 })
    const w = act(p, heat.state, 'h', 'o')
    expect(w.state).toMatchObject({ h: 0, o: 0, water: 1 })
    expect(act(p, w.state, 'h', 'o').kind).toBe('missing')
    expect(act(p, { h: 1 }, 'h', 'h').kind).toBe('missing')
  })

  it('mendeleev: flanking pairs fill the gap between them, others fail', () => {
    const p = { book: BOOKS.mendeleev, index: generate('mendeleev', 1, 1).index }
    const s: State = { Si: 1, Sn: 1, Zn: 1, As: 1 }
    expect(act(p, { ...s, Ti: 1, Zr: 1 }, 'Ti', 'Zr').kind).toBe('new')
    expect(act(p, { Ga: 1, As: 1 }, 'Ga', 'As').out).toEqual(['Ge'])
    expect(act(p, s, 'Si', 'Sn').kind).toBe('fail') // two rows apart: not flanking
    expect(act(p, s, 'Zn', 'As').kind).toBe('fail')
  })

  it('every config × difficulty × seed is winnable within its band and budget', () => {
    let worst = 0
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const t = tierFor(d)
      const targets = new Set<string>()
      let inBand = 0
      for (const seed of SEEDS) {
        const t0 = performance.now()
        const p = generate(CONFIGS[id].kind, d, seed)
        worst = Math.max(worst, performance.now() - t0)
        expect(isWon(p, p.start), `${id} d${d} s${seed} pre-won`).toBe(false)
        expect(isWon(p, replay(p)), `${id} d${d} s${seed}`).toBe(true)
        expect(p.solution.length).toBe(p.optimal)
        expect(p.optimal).toBeGreaterThanOrEqual(2)
        expect(p.optimal).toBeLessThanOrEqual(6)
        expect(p.budget).toBe(p.optimal + t.slack)
        // The solver is optimal: nothing shorter exists.
        expect(solve(p, p.start, p.optimal - 1)).toBeNull()
        if (p.optimal >= t.lo && p.optimal <= t.hi) inBand++
        targets.add(`${p.target}|${Object.keys(p.start).sort().join(',')}`)
      }
      expect(inBand, `${id} d${d} in band`).toBeGreaterThanOrEqual(SEEDS.length - 2)
      expect(targets.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(5)
    }
    expect(worst).toBeLessThan(1500)
  })

  it('difficulty grows: longer chains, less slack, fewer hints', () => {
    for (const id of CONFIG_IDS) {
      const avg = (d: Difficulty) => SEEDS.reduce((a, s) => a + generate(CONFIGS[id].kind, d, s).optimal, 0) / SEEDS.length
      expect(avg(1)).toBeLessThan(avg(2))
      expect(avg(2)).toBeLessThan(avg(3))
      expect(avg(3)).toBeLessThan(avg(4))
    }
    expect(tierFor(1).hints).toBeGreaterThan(tierFor(3).hints)
  })

  it('scrolls list every needed recipe, plus decoys and smudges at higher tiers', () => {
    for (const kind of ['jabir', 'lavoisier'] as const) for (const d of DIFFS) for (const seed of SEEDS.slice(0, 6)) {
      const p = generate(kind, d, seed)
      const needed = p.scroll.filter(e => !e.decoy)
      expect(needed.length).toBe(new Set(p.solution.map(m => `${m.a}|${m.b}`)).size)
      if (d === 1) expect(p.scroll.every(e => !e.mask && !e.decoy)).toBe(true)
    }
    expect(relevantFor(BOOKS.jabir, 'gold').has('sulfur')).toBe(true)
  })
})

describe('alchemy component', () => {
  const tapItem = (c: HTMLElement, id: string) => fireEvent.click(c.querySelector<HTMLButtonElement>(`button[data-item="${id}"]`)!)

  function play(c: HTMLElement, p: Puzzle) {
    for (const m of p.solution) {
      tapItem(c, m.a)
      if (m.b === undefined) fireEvent.click(screen.getByTestId('alc-heat'))
      else tapItem(c, m.b)
    }
  }

  it('renders every config at every difficulty', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(AlchemyGame, { configId: id, difficulty: d, seed: 5, onWin: () => {}, onLose: () => {} }))
      expect(screen.getByTestId('alc-target').textContent).toBeTruthy()
      expect(container.querySelectorAll('button[data-item]').length).toBeGreaterThan(1)
      unmount()
    }
  })

  it('accepts title and intro overrides', () => {
    render(createElement(AlchemyGame, { configId: 'jabir', difficulty: 1, seed: 1, params: { title: 'Custom bench' }, onWin: () => {}, onLose: () => {} }))
    expect(screen.getByText('Custom bench')).toBeTruthy()
  })

  it('playing the solver chain wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(AlchemyGame, { configId: id, difficulty: d, seed: 13, onWin, onLose }))
      const p = generate(CONFIGS[id].kind, d, 13)
      play(container, p)
      rtlAct(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('wasting attempts loses once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(AlchemyGame, { configId: id, difficulty: d, seed: 21, onWin, onLose }))
      const p = generate(CONFIGS[id].kind, d, 21)
      // Find a pair of start items that does nothing useful and repeat it.
      const ids = Object.keys(p.start).filter(k => p.start[k] > 0)
      let pair: [string, string] | null = null
      for (const a of ids) for (const b of ids) {
        if (pair || (a === b && (p.start[a] ?? 0) < 2)) continue
        const r = act(p, p.start, a, b)
        if (r.kind === 'fail' || r.kind === 'harmful' || r.kind === 'known') pair = [a, b]
      }
      // Jabir's four elements all combine; repeating one pair is "nothing new" after the first.
      if (!pair && p.book.mode === 'set') {
        const [a, b] = ids
        if (!isWon(p, act(p, p.start, a, b).state)) pair = [a, b]
      }
      expect(pair, `${id} d${d} has a useless pair`).not.toBeNull()
      for (let k = 0; k < p.budget + 2; k++) { tapItem(container, pair![0]); tapItem(container, pair![1]) }
      rtlAct(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
