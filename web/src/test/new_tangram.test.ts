// Tangram: every silhouette is an exact tiling by the seven pieces, every
// config × difficulty × seed is winnable, and the component wins and loses once.
import { createElement } from 'react'
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import TangramGame, {
  CONFIGS, CONFIG_IDS, SILHOUETTE_KEYS, SET, W, H, makePuzzle, placementsFor, coverage, rotatePiece, flipPiece, movePiece,
  parseSolution, polygonOf, quartersOf, tierFor, boxOf, rotatePieceBack, turnCost, minTurns, fitsInside, TWISTS, TRAY_Y, type Placement,
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
        if (!tierFor(d).turned && CONFIGS[id].twist !== 'turns') expect(p.start.every(s => s.rot === 0)).toBe(true)
        // The decoy config deals an eighth board; the others the seven.
        expect(p.start.length).toBe(CONFIGS[id].twist === 'decoy' ? 8 : 7)
        if (CONFIGS[id].twist === 'turns') {
          expect(minTurns(p)).toBeGreaterThanOrEqual(4)
          expect(p.turnBudget).toBe(minTurns(p) + TWISTS.turns(d).spare)
        }
        seen.add([...p.target].sort().join(' '))
      }
      expect(seen.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(5)
    }
    expect(worst).toBeLessThan(100)
  })

  it('fits the time budget: at most 3:00 on the clock, about a minute of work at D1', () => {
    const secs = DIFFS.map(d => tierFor(d).seconds)
    expect(Math.max(...secs)).toBeLessThanOrEqual(180)
    expect(secs[0]).toBeLessThanOrEqual(120)
    for (let k = 1; k < 4; k++) expect(secs[k]).toBeGreaterThanOrEqual(secs[k - 1])
    // Never more than eight boards, and the twists tighten with difficulty.
    for (const id of CONFIG_IDS) expect(makePuzzle(CONFIGS[id], 4, 1).start.length).toBeLessThanOrEqual(8)
    expect(TWISTS.memory(4).showSeconds).toBeLessThan(TWISTS.memory(1).showSeconds)
    expect(TWISTS.lacquer(4).pries).toBeLessThan(TWISTS.lacquer(1).pries)
    expect(TWISTS.turns(4).spare).toBeLessThan(TWISTS.turns(1).spare)
  })

  it('every config is a distinct twist', () => {
    // The base configs are each their own twist; story-themed configs reuse one of them.
    const BASE = ['song-scholar', 'junk-ship', 'pagoda', 'menagerie']
    expect(new Set(BASE.map(id => CONFIGS[id].twist)).size).toBe(BASE.length)
    for (const id of CONFIG_IDS) expect(BASE.map(b => CONFIGS[b].twist), id).toContain(CONFIGS[id].twist)
    expect(CONFIG_IDS.every(id => CONFIGS[id].twist)).toBe(true)
  })

  it('turn cost counts quarter-turns either way plus a flip', () => {
    expect(turnCost({ rot: 0, flip: false }, { rot: 3, flip: false })).toBe(1)
    expect(turnCost({ rot: 1, flip: false }, { rot: 3, flip: true })).toBe(3)
    // A square never needs turning.
    const p = makePuzzle(CONFIGS.pagoda, 3, 5)
    const goal = placementsFor(p)
    expect(turnCost(p.start[5], goal[5])).toBe(0)
    let q = p.start[0]
    q = rotatePieceBack(q)
    expect(q.rot).toBe((p.start[0].rot + 3) % 4)
  })

  it('a board left in the tray does not count; a board inside the outline can set fast', () => {
    const p = makePuzzle(CONFIGS['junk-ship'], 1, 3)
    const goal = placementsFor(p)
    const placed = p.start.map((s, i) => (i === 0 ? goal[0] : s))
    expect(fitsInside(placed, 0, p.target)).toBe(true)
    expect(fitsInside(placed, 1, p.target)).toBe(false) // still in the tray
    // Overlapping another board: not fitting.
    const clash = placed.map((s, i) => (i === 1 ? { ...goal[0], kind: s.kind } : s))
    expect(fitsInside(clash, 0, p.target)).toBe(false)
    expect(p.start.every(s => s.y >= TRAY_Y)).toBe(true)
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
      const hints = container.querySelectorAll('[data-hint]').length
      expect(hints).toBe(d === 1 ? 7 : d === 2 ? 3 : 0)
      expect(container.querySelectorAll('[data-piece]').length).toBe(CONFIGS[id].twist === 'decoy' ? 8 : 7)
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
      // The goal is the cheapest in turns; the decoy (8th) stays in the tray.
      goal.forEach((t, i) => {
        fireEvent.focus(piece(container, i))
        let cur = p.start[i]
        if (cur.flip !== t.flip) { fireEvent.click(button('Flip')); cur = flipPiece(cur) }
        const back = (cur.rot - t.rot + 4) % 4 < (t.rot - cur.rot + 4) % 4
        while (cur.rot !== t.rot) {
          if (back) { fireEvent.click(button('Turn back')); cur = rotatePieceBack(cur) }
          else { fireEvent.click(button('Turn')); cur = rotatePiece(cur) }
        }
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

  const place = (c: HTMLElement, i: number, from: Placement, t: Placement) => {
    fireEvent.focus(piece(c, i))
    let cur = from
    if (cur.flip !== t.flip) { fireEvent.click(button('Flip')); cur = flipPiece(cur) }
    while (cur.rot !== t.rot) { fireEvent.click(button('Turn')); cur = rotatePiece(cur) }
    while (cur.x < t.x) { fireEvent.click(button('Right')); cur = movePiece(cur, 1, 0) }
    while (cur.x > t.x) { fireEvent.click(button('Left')); cur = movePiece(cur, -1, 0) }
    while (cur.y > t.y) { fireEvent.click(button('Up')); cur = movePiece(cur, 0, -1) }
    while (cur.y < t.y) { fireEvent.click(button('Down')); cur = movePiece(cur, 0, 1) }
    return cur
  }

  it('memory: the silhouette fades after its showing, and a peek brings it back briefly', () => {
    vi.useFakeTimers()
    const d: Difficulty = 2
    const { container } = render(createElement(TangramGame, { configId: 'song-scholar', difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
    expect(screen.queryByTestId('tg-target')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(TWISTS.memory(d).showSeconds * 1000 + 50) })
    expect(screen.queryByTestId('tg-target')).toBeNull()
    expect(screen.getByTestId('tg-cover').textContent).toMatch(/\?/)
    fireEvent.click(screen.getByRole('button', { name: /Peek/ }))
    expect(screen.queryByTestId('tg-target')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(TWISTS.memory(d).peekSeconds * 1000 + 50) })
    expect(screen.queryByTestId('tg-target')).toBeNull()
    for (let k = 1; k < TWISTS.memory(d).peeks; k++) {
      fireEvent.click(screen.getByRole('button', { name: /Peek/ }))
      act(() => { vi.advanceTimersByTime(TWISTS.memory(d).peekSeconds * 1000 + 50) })
    }
    expect(screen.getByRole('button', { name: /Peek/ })).toHaveProperty('disabled', true)
    expect(container.querySelectorAll('[data-piece]').length).toBe(7)
  })

  it('lacquer: a board inside the outline sets fast when another is picked up; prying frees it', () => {
    const d: Difficulty = 3
    const { container } = render(createElement(TangramGame, { configId: 'junk-ship', difficulty: d, seed: 6, onWin: () => {}, onLose: () => {} }))
    const p = makePuzzle(CONFIGS['junk-ship'], d, 6)
    const goal = placementsFor(p)
    place(container, 0, p.start[0], goal[0])
    expect(piece(container, 0).getAttribute('data-locked')).toBeNull()
    fireEvent.focus(piece(container, 1))
    expect(piece(container, 0).getAttribute('data-locked')).toBe('1')
    // A set board ignores the controls.
    fireEvent.focus(piece(container, 0))
    const pts = piece(container, 0).getAttribute('points')
    expect(button('Left')).toHaveProperty('disabled', true)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(piece(container, 0).getAttribute('points')).toBe(pts)
    fireEvent.click(screen.getByRole('button', { name: /Pry loose/ }))
    expect(piece(container, 0).getAttribute('data-locked')).toBeNull()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(piece(container, 0).getAttribute('points')).not.toBe(pts)
    // A board left in the tray never sets.
    fireEvent.focus(piece(container, 2))
    fireEvent.focus(piece(container, 3))
    expect(piece(container, 2).getAttribute('data-locked')).toBeNull()
  })

  it('turns: the budget runs out and further turns are refused', () => {
    const d: Difficulty = 4
    const { container } = render(createElement(TangramGame, { configId: 'pagoda', difficulty: d, seed: 2, onWin: () => {}, onLose: () => {} }))
    const p = makePuzzle(CONFIGS.pagoda, d, 2)
    fireEvent.focus(piece(container, 0))
    for (let k = 0; k < p.turnBudget!; k++) fireEvent.click(button('Turn'))
    expect(screen.getByTestId('tg-twist').textContent).toMatch(/^↻ 0 turns/)
    expect(button('Turn')).toHaveProperty('disabled', true)
    const pts = piece(container, 0).getAttribute('points')
    fireEvent.keyDown(window, { key: 'r' })
    fireEvent.pointerDown(piece(container, 0))
    fireEvent.pointerUp(window)
    expect(piece(container, 0).getAttribute('points')).toBe(pts)
  })

  it('decoy: an eighth board in the tray, and the silhouette is solved without it', () => {
    for (const d of DIFFS) for (let seed = 1; seed <= 8; seed++) {
      const p = makePuzzle(CONFIGS.menagerie, d, seed)
      expect(p.start.length).toBe(8)
      const goal = placementsFor(p)
      expect(goal.length).toBe(7)
      expect(coverage([...goal, p.start[7]], p.target).solved).toBe(true)
      // Dragging the decoy onto the board spoils the exact cover.
      expect(coverage([...goal, { ...p.start[7], y: 0 }], p.target).solved).toBe(false)
    }
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
