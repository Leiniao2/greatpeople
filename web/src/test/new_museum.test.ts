// Museum: every config × difficulty × seed plants a working hanging, rooms
// need thought (crossover pieces when labelled, few valid groupings when
// blank), the Arcade ladder is varied, and the component wins as soon as the
// last room is right and loses only when the clock runs out.
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import MuseumGame, { CONFIGS, CONFIG_IDS } from '@/components/minigames/MuseumGame'
import { EXHIBITS, EXHIBIT_BY_ID, eraOf } from '@/components/minigames/museum/catalogue'
import { generate, isSolved, countSolutions, crossovers, sharedThemes, roomState, SECONDS } from '@/components/minigames/museum/model'
import { buildTrack } from '@/games/arcade'
import type { Difficulty } from '@/games/types'

afterEach(() => { cleanup(); vi.useRealTimers() })
const ART = new Set(Object.keys(import.meta.glob('../../public/exhibits/*.webp')).map(p => p.split('/').pop()!.replace('.webp', '')))
const DIFFS: Difficulty[] = [1, 2, 3, 4]
const SEEDS = [1, 2, 3, 5, 8, 13, 42, 99, 1234, 777777]

describe('museum catalogue', () => {
  it('has unique ids, real dates and painted art for every exhibit', () => {
    expect(new Set(EXHIBITS.map(e => e.id)).size).toBe(EXHIBITS.length)
    for (const e of EXHIBITS) {
      const shown = Number((e.date.match(/\d+/) ?? ['0'])[0]) * (e.date.includes('BCE') ? -1 : 1)
      expect(shown, e.id).toBe(e.year)
      expect(ART.has(e.id), `${e.id} art`).toBe(true)
    }
  })

  it('every label is shared by at least three exhibits', () => {
    const count = new Map<string, number>()
    for (const e of EXHIBITS) for (const k of [e.region, eraOf(e.year), e.kind]) count.set(k, (count.get(k) ?? 0) + 1)
    for (const [k, n] of count) expect(n, k).toBeGreaterThanOrEqual(5)
  })

  it('config featured pieces exist', () => {
    for (const id of CONFIG_IDS) for (const f of CONFIGS[id].featured) expect(EXHIBIT_BY_ID[f], `${id}/${f}`).toBeDefined()
  })
})

describe('museum puzzles', () => {
  it('every config × difficulty × seed is solved by its planted hanging, and not by chance', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const sigs = new Set<string>()
      for (const seed of SEEDS) {
        const pz = generate(d, seed, { featured: CONFIGS[id].featured })
        const tag = `${id} d${d} s${seed}`
        expect(pz.themes.length, tag).toBe([3, 4, 4, 5][d - 1])
        expect(pz.exhibits.length, tag).toBe(pz.themes.length * 3)
        expect(new Set(pz.exhibits).size, tag).toBe(pz.exhibits.length)
        expect(isSolved(pz, pz.planted), tag).toBe(true)
        expect(pz.seconds).toBe(SECONDS[d - 1])
        expect(pz.hidden).toBe(d >= 3)
        // Rooms always mix at least two kinds of theme.
        expect(new Set(pz.themes.map(t => t.attr)).size, tag).toBeGreaterThanOrEqual(2)
        const n = countSolutions(pz, 200)
        expect(n, tag).toBeGreaterThanOrEqual(1)
        if (!pz.hidden) {
          expect(crossovers(pz), tag).toBeGreaterThanOrEqual(d === 1 ? 2 : 4)
          expect(n, tag).toBeLessThanOrEqual(24)
        } else {
          expect(n, tag).toBeLessThanOrEqual(d === 3 ? 12 : 30)
        }
        sigs.add(JSON.stringify([pz.themes, [...pz.exhibits].sort()]))
      }
      expect(sigs.size, `${id} d${d} variety`).toBeGreaterThanOrEqual(8)
    }
  })

  it('blank rooms reject two rooms with the same story, labelled rooms reject misfits', () => {
    const pz = generate(3, 5)
    // Swap two exhibits across rooms until a room shares nothing.
    const [a, b] = pz.planted
    const broken = [[a[0], a[1], b[0]], [b[1], b[2], a[2]], ...pz.planted.slice(2)]
    if (!sharedThemes(broken[0]).length) expect(isSolved(pz, broken)).toBe(false)
    const lab = generate(1, 5)
    const misfit = lab.exhibits.find(x => !sharedThemes([x]).some(t => t.attr === lab.themes[0].attr && t.value === lab.themes[0].value))!
    expect(roomState(lab, 0, [misfit])).toBe('bad')
  })

  it('the Arcade ladder never repeats a level', () => {
    const track = buildTrack('museum', CONFIG_IDS)
    const sigs = new Set(track.map(l => JSON.stringify(generate(l.difficulty, l.seed, { featured: CONFIGS[l.configId].featured }).exhibits)))
    expect(sigs.size).toBe(track.length)
  })
})

describe('museum component', () => {
  function hang(container: HTMLElement, rooms: string[][]) {
    rooms.forEach((ids, r) => ids.forEach((id, s) => {
      fireEvent.click(container.querySelector(`[data-exhibit="${id}"]`)!)
      fireEvent.click(container.querySelector(`[data-slot="${r}:${s}"]`)!)
    }))
  }

  it('renders every config at every difficulty with all exhibits in the tray', () => {
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const { container, unmount } = render(createElement(MuseumGame, { configId: id, difficulty: d, seed: 3, onWin: () => {}, onLose: () => {} }))
      expect(container.querySelectorAll('[data-exhibit]').length).toBe([3, 4, 4, 5][d - 1] * 3)
      expect(container.querySelectorAll('[data-room]').length).toBe([3, 4, 4, 5][d - 1])
      unmount()
    }
  })

  it('hanging the planted solution wins once, with no button to press', () => {
    vi.useFakeTimers()
    for (const id of CONFIG_IDS) for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { container, unmount } = render(createElement(MuseumGame, { configId: id, difficulty: d, seed: 11, onWin, onLose }))
      hang(container, generate(d, 11, { featured: CONFIGS[id].featured }).planted)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onWin, `${id} d${d}`).toHaveBeenCalledTimes(1)
      expect(onLose).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('tapping a hung piece takes it down again', () => {
    const { container } = render(createElement(MuseumGame, { configId: 'british-museum', difficulty: 1, seed: 2, onWin: () => {}, onLose: () => {} }))
    const first = container.querySelector('[data-exhibit]')!.getAttribute('data-exhibit')!
    fireEvent.click(container.querySelector(`[data-exhibit="${first}"]`)!)
    fireEvent.click(container.querySelector('[data-slot="0:0"]')!)
    expect(container.querySelector(`[data-exhibit="${first}"]`)).toBeNull()
    fireEvent.click(container.querySelector('[data-slot="0:0"]')!)
    expect(container.querySelector(`[data-exhibit="${first}"]`)).not.toBeNull()
  })

  it('running out of time loses once', () => {
    vi.useFakeTimers()
    for (const d of DIFFS) {
      const onWin = vi.fn(), onLose = vi.fn()
      const { unmount } = render(createElement(MuseumGame, { configId: 'louvre-arrangement', difficulty: d, seed: 4, onWin, onLose }))
      act(() => { vi.advanceTimersByTime((SECONDS[d - 1] - 1) * 1000) })
      expect(onLose).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(2000) })
      act(() => { vi.advanceTimersByTime(1000) })
      expect(onLose, `d${d}`).toHaveBeenCalledTimes(1)
      expect(onWin).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('story params override the title', () => {
    const { getByText } = render(createElement(MuseumGame, { configId: 'louvre-arrangement', difficulty: 1, seed: 1, params: { title: 'Funny Face at the Louvre' }, onWin: () => {}, onLose: () => {} }))
    expect(getByText('Funny Face at the Louvre')).toBeTruthy()
  })
})
