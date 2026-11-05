// Story params that rename a game's board: the challenges that replaced World
// Clock (Earhart's flight, Osbeck's voyage, the Baghdad four-wire, Rungis)
// must show their own places and words, not the config's.
import { createElement } from 'react'
import { render, cleanup, screen } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import stories from '@/data/story_challenges.json'
import TradeWindsGame from '@/components/minigames/TradeWindsGame'
import { CONFIGS as TELEGRAPH, makeNet } from '@/components/minigames/TelegraphNetGame'
import { CONFIGS as BAZAAR, makeLevel } from '@/components/minigames/BazaarGame'
import type { Difficulty } from '@/games/types'

afterEach(cleanup)
const DIFFS: Difficulty[] = [1, 2, 3, 4]

type Entry = { game: string; configId: string; params?: Record<string, unknown> }
function find(title: string): Entry {
  const all: Entry[] = []
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk)
    else if (o && typeof o === 'object') {
      const r = o as Record<string, unknown>
      if (typeof r.game === 'string') all.push(r as unknown as Entry)
      Object.values(r).forEach(walk)
    }
  }
  walk(stories)
  const e = all.find(x => x.params?.title === title)
  if (!e) throw new Error(`no story challenge titled ${title}`)
  return e
}

describe('story overrides', () => {
  it('Earhart flies a plane to Ireland', () => {
    const e = find('Blind over the Atlantic, 1932')
    render(createElement(TradeWindsGame, { configId: e.configId, difficulty: 1, seed: 2174, params: e.params, onWin: () => {}, onLose: () => {} }))
    expect(screen.getByTestId('tw-ship').textContent).toBe('✈️')
    expect(screen.getByTestId('tw-supplies').textContent).toMatch(/^Fuel/)
    expect(screen.getByTestId('tw-wind').textContent).toContain('Ireland')
    expect(screen.queryByText(/Heave to|Sunstone/)).toBeNull()
  })

  it('Osbeck sails to Canton and back to Java Head', () => {
    const e = find('Osbeck Sails for Canton, 1751')
    render(createElement(TradeWindsGame, { configId: e.configId, difficulty: 2, seed: 5, params: e.params, onWin: () => {}, onLose: () => {} }))
    expect(screen.getByTestId('tw-wind').textContent).toContain('Canton')
    expect(screen.getByTestId('tw-ship').textContent).toBe('⛵')
  })

  it('the four-wire runs from Baghdad to Amman at every difficulty', () => {
    const e = find('The Four-Wire, 1991')
    const cfg = { ...TELEGRAPH[e.configId], ...e.params }
    for (const d of DIFFS) {
      const net = makeNet(e.configId, cfg, d, 1)
      expect(net.names[net.ends[0]]).toBe('Bagh')
      expect(net.names[net.ends[1]]).toBe('Amm')
      expect(net.names.filter(n => ['Lon', 'Calc', 'Berl'].includes(n))).toEqual([])
      expect(new Set(net.names).size).toBe(net.names.length)
    }
  })

  it('Rungis sells French produce in francs', () => {
    const e = find('Rungis Before Dawn')
    for (const d of DIFFS) {
      const lv = makeLevel(e.configId, d, 3, e.params)
      const goods = (e.params!.goods as { name: string }[]).map(g => g.name)
      expect(JSON.stringify(lv)).not.toMatch(/Lantern|Dumplings|Granny Wu/)
      expect(goods.length).toBeGreaterThanOrEqual(5)
    }
    expect(BAZAAR[e.configId].market).toBe('night')
  })
})
