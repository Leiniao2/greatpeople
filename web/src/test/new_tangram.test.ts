// Tangram: every silhouette is an exact tiling by the seven pieces, every
// config × difficulty × seed is winnable, and the component wins and loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import TangramGame, {
  CONFIGS, CONFIG_IDS, SILHOUETTE_KEYS, SET, W, H, makePuzzle, placementsFor, coverage, rotatePiece, flipPiece, movePiece,
  parseSolution, polygonOf, quartersOf, tierFor, boxOf, type Placement,
} from '@/components/minigames/TangramGame'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const DIFFS: Difficulty[] = [1, 2, 3, 4]

describe('tangram logic', () => {
  it('pieces have the classic areas (in quarter-cells): 8, 8, 4, 2, 2, 4, 4', () => {
    const areas = SET.map(kind => quartersOf(polygonOf({ kind, rot: 0, flip: false, x: 0, y: 0 })).length)
    expect(areas).toEqual([8, 8, 4, 2, 2, 4, 4])
    for (const kind of SET) for (let rot = 0; rot < 4; rot++) for (const flip of [false, true]) {
      expect(quartersOf(polygonOf({ kind, rot, flip, x: 3, y: 2 })).length).toBe(areas[SET.indexOf(kind)])
    }
  })

  it('has at least 20 silhouettes, each the seven pieces with no overlap', async () => {
    expect(SILHOUETTE_KEYS.length).toBeGreaterThanOrEqual(20)
    const mod = await import('@/components/minigames/TangramGame')
    for (const id of CONFIG_IDS) {
      expect(CONFIGS[id].shapes.length, id).toBeGreaterThanOrEqual(5)
      for (const k of CONFIGS[id].shapes) expect(SILHOUETTE_KEYS).toContain(k)
    }
    const outlines = new Set<string>()
    for (const key of SILHOUETTE_KEYS) {
      const p = makePuzzle({ shapes: [key] }, 1, 1)
      expect(p.kinds.slice().sort(), key).toEqual([...SET].sort())
      const all = p.solution.flatMap(quartersOf)
      expect(all.length, key).toBe(32)
      expect(new Set(all).size, `${key} overlaps`).toBe(32)
      outlines.add([...p.target].sort().join(' '))
    }
    expect(outlines.size).toBe(SILHOUETTE_KEYS.length)
    expect(typeof mod.default).toBe('function')
  })

  it('every config × difficulty × seed is winnable: the solution placements cover the target exactly', () => {
    let worst = 0
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const seen = new Set<string>()
      for (let seed = 1; seed <= 16; seed++) {
        const t0 = performance.now()
        const p = makePuzzle(CONFIGS[id], d, seed)
        const sol = placementsFor(p)
        worst = Math.max(worst, performance.now() - t0)
        expect(coverage(sol, p.target).solved, `${id} d${d} s${seed}`).toBe(true)
        for (const s of sol) { const b = boxOf(s); expect(s.x + b.w <= W && s.y + b.h <= H && s.x >= 0 && s.y >= 0).toBe(true) }
        // The start is in the tray and unsolved.
        expect(coverage(p.start, p.target).covered).toBe(0)
        expect(p.start.every(s => s.y >= 8 && s.y + boxOf(s).h <= H)).toBe(true)
        if (!tierFor(d).turned) expect(p.start.every(s => s.rot === 0)).toBe(true)
        seen.add([...p.target].sort().join(' '))
      }
      expect(seen.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(5)
    }
    expect(worst).toBeLessThan(100)
  })

  it('turning four times returns a piece home; moves clamp to the canvas', () => {
    for (const kind of SET) {
      const p0: Placement = { kind, rot: 0, flip: false, x: 4, y: 4 }
      let p = p0
      for (let k = 0; k < 4; k++) p = rotatePiece(p)
      expect(p).toEqual(p0)
    }
    expect(flipPiece({ kind: 'L', rot: 0, flip: false, x: 0, y: 0 }).flip).toBe(false)
    expect(flipPiece({ kind: 'P', rot: 0, flip: false, x: 0, y: 0 }).flip).toBe(true)
    expect(movePiece({ kind: 'L', rot: 0, flip: false, x: 0, y: 0 }, -3, 50)).toMatchObject({ x: 0, y: H - 2 })
    expect(() => parseSolution('X0@1,1')).toThrow()
  })
})

describe('tangram component', () => {
  const piece = (c: HTMLElement, i: number) => c.querySelector<SVGPolygonElement>(`[data-piece="${i}"]`)!
  const button = (name: string) => screen.getByRole('button', { name })

  it('renders every config at every difficulty, with outlines only where the tier allows', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(TangramGame, { configId: id, difficulty: d, seed: 4, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-piece]').length).toBe(7)
      const hints = container.querySelectorAll('[data-hint]').length
      expect(hints).toBe(d === 1 ? 7 : d === 2 ? 3 : 0)
      unmount()
    }
  })

  it('placing every piece by the controls wins once', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(TangramGame, { configId: id, difficulty: d, seed: 21, onWin, onLose }))
      const p = makePuzzle(CONFIGS[id], d, 21)
      const goal = placementsFor(p)
      p.start.forEach((s, i) => {
        fireEvent.focus(piece(container, i))
        let cur = s
        const t = goal[i]
        if (cur.flip !== t.flip) { fireEvent.click(button('Flip')); cur = flipPiece(cur) }
        while (cur.rot !== t.rot) { fireEvent.click(button('Turn')); cur = rotatePiece(cur) }
        while (cur.x < t.x) { fireEvent.click(button('Right')); cur = movePiece(cur, 1, 0) }
        while (cur.x > t.x) { fireEvent.click(button('Left')); cur = movePiece(cur, -1, 0) }
        while (cur.y > t.y) { fireEvent.click(button('Up')); cur = movePiece(cur, 0, -1) }
        while (cur.y < t.y) { fireEvent.click(button('Down')); cur = movePiece(cur, 0, 1) }
      })
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('tapping a piece turns it', () => {
    const { container } = render(createElement(TangramGame, { configId: 'pagoda', difficulty: 1, seed: 2, onWin: () => {}, onLose: () => {} }))
    const before = piece(container, 0).getAttribute('points')
    fireEvent.pointerDown(piece(container, 0))
    fireEvent.pointerUp(window)
    expect(piece(container, 0).getAttribute('points')).not.toBe(before)
  })

  it('running out of time loses once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { unmount } = render(createElement(TangramGame, { configId: 'menagerie', difficulty: d, seed: 1, onWin, onLose }))
      act(() => { vi.advanceTimersByTime((tierFor(d).seconds + 1) * 1000) })
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })
})
