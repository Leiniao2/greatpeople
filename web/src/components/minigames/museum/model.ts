// Museum: hang every exhibit so each room of three tells one story.  A room
// works when its three exhibits share a label: the region they come from,
// the era they were made in, or what kind of thing they are.  Many exhibits
// fit two rooms at once, so the order you fill them in matters.
//
// D1–D2 name each room's theme.  D3–D4 leave the rooms blank: any shared
// label counts, but no two rooms may tell the same story.  From D3 cards show
// only the date, not the era, so the player reads the era bands themselves.
//
// Pure logic, so tests can solve and audit every level without a browser.

import type { Difficulty } from '@/games/types'
import { mulberry32, shuffle, scale, type Rng } from '../_shared'
import { EXHIBITS, EXHIBIT_BY_ID, eraOf, type Exhibit } from './catalogue'

export type Attr = 'region' | 'era' | 'kind'
export interface Theme { attr: Attr; value: string }

export interface Puzzle {
  /** Themes per room; a hidden room still records the planted theme. */
  themes: Theme[]
  hidden: boolean
  slots: number
  /** Exhibit ids in tray order. */
  exhibits: string[]
  /** One known hanging, room by room. */
  planted: string[][]
  seconds: number
  showEra: boolean
}

export const SECONDS = [150, 180, 210, 240] as const

export const themeKey = (t: Theme) => `${t.attr}:${t.value}`

export function labelsOf(e: Exhibit): Theme[] {
  return [
    { attr: 'region', value: e.region },
    { attr: 'era', value: eraOf(e.year) },
    { attr: 'kind', value: e.kind },
  ]
}

const fits = (e: Exhibit, t: Theme) => labelsOf(e).some(l => l.attr === t.attr && l.value === t.value)

/** Labels every exhibit in `ids` shares. */
export function sharedThemes(ids: string[]): Theme[] {
  if (!ids.length) return []
  const [first, ...rest] = ids.map(id => EXHIBIT_BY_ID[id])
  return labelsOf(first).filter(t => rest.every(e => fits(e, t)))
}

export function roomName(t: Theme): string {
  if (t.attr === 'region') return `${t.value} Gallery`
  if (t.attr === 'era') return `${t.value} Hall`
  return { Painting: 'Painting Gallery', Sculpture: 'Sculpture Court', Vessel: 'Vessel Room', Writing: 'Library of Words', Treasure: 'Treasury' }[t.value] ?? t.value
}

export function themeLabel(t: Theme): string {
  if (t.attr === 'era') return `${t.value} era`
  if (t.attr === 'region') return `from ${t.value}`
  return { Painting: 'paintings', Sculpture: 'sculpture', Vessel: 'vessels', Writing: 'writing', Treasure: 'treasures' }[t.value] ?? t.value
}

/**
 * Can each room take a different theme?  `options[i]` lists the themes room i
 * qualifies for; small enough for a plain backtracking match.
 */
function distinctThemes(options: Theme[][]): boolean {
  const used = new Set<string>()
  const go = (i: number): boolean => {
    if (i === options.length) return true
    for (const t of options[i]) {
      const k = themeKey(t)
      if (used.has(k)) continue
      used.add(k)
      if (go(i + 1)) return true
      used.delete(k)
    }
    return false
  }
  return go(0)
}

export type RoomState = 'empty' | 'filling' | 'good' | 'bad'

export function roomState(pz: Puzzle, room: number, ids: string[]): RoomState {
  if (!ids.length) return 'empty'
  if (ids.length < pz.slots) {
    // Labelled rooms flag a misfit at once; blank rooms only when nothing is shared.
    if (!pz.hidden) return ids.every(id => fits(EXHIBIT_BY_ID[id], pz.themes[room])) ? 'filling' : 'bad'
    return sharedThemes(ids).length ? 'filling' : 'bad'
  }
  if (!pz.hidden) return sharedThemes(ids).some(t => themeKey(t) === themeKey(pz.themes[room])) ? 'good' : 'bad'
  return sharedThemes(ids).length ? 'good' : 'bad'
}

export function isSolved(pz: Puzzle, rooms: string[][]): boolean {
  if (rooms.length !== pz.themes.length) return false
  if (!rooms.every((ids, i) => ids.length === pz.slots && roomState(pz, i, ids) === 'good')) return false
  return !pz.hidden || distinctThemes(rooms.map(sharedThemes))
}

/** The theme a finished room shows; for blank rooms the first one shared. */
export function shownTheme(pz: Puzzle, room: number, ids: string[]): Theme | null {
  if (!pz.hidden) return pz.themes[room]
  return ids.length === pz.slots ? sharedThemes(ids)[0] ?? null : null
}

/**
 * Count complete hangings, up to `cap`.  Labelled rooms are distinct places;
 * blank rooms are interchangeable, so groupings are counted, not orderings.
 */
export function countSolutions(pz: Puzzle, cap = 1e6): number {
  const ids = pz.exhibits
  const R = pz.themes.length, S = pz.slots
  let count = 0
  if (!pz.hidden) {
    const rooms: string[][] = Array.from({ length: R }, () => [])
    const go = (i: number) => {
      if (count >= cap) return
      if (i === ids.length) { count++; return }
      const e = EXHIBIT_BY_ID[ids[i]]
      for (let r = 0; r < R; r++) {
        if (rooms[r].length < S && fits(e, pz.themes[r])) {
          rooms[r].push(ids[i]); go(i + 1); rooms[r].pop()
        }
      }
    }
    go(0)
    return count
  }
  // Blank rooms: always put the first unplaced exhibit in a new group.
  const left = new Set(ids)
  const groups: string[][] = []
  const go = () => {
    if (count >= cap) return
    if (!left.size) { if (distinctThemes(groups.map(sharedThemes))) count++; return }
    const first = [...left][0]
    left.delete(first)
    const rest = [...left]
    for (let a = 0; a < rest.length; a++) for (let b = a + 1; b < rest.length; b++) {
      const g = [first, rest[a], rest[b]]
      if (!sharedThemes(g).length) continue
      left.delete(rest[a]); left.delete(rest[b]); groups.push(g)
      go()
      groups.pop(); left.add(rest[a]); left.add(rest[b])
    }
    left.add(first)
  }
  if (S === 3) go()
  return count
}

/** Exhibits that fit more than one of the rooms' themes. */
export function crossovers(pz: Puzzle): number {
  return pz.exhibits.filter(id => pz.themes.filter(t => fits(EXHIBIT_BY_ID[id], t)).length >= 2).length
}

function allThemes(pool: Exhibit[]): Theme[] {
  const seen = new Map<string, Theme>()
  for (const e of pool) for (const t of labelsOf(e)) seen.set(themeKey(t), t)
  return [...seen.values()]
}

function tryBuild(rng: Rng, pool: Exhibit[], featured: string[], R: number, S: number): { themes: Theme[]; planted: string[][] } | null {
  const candidates = shuffle(allThemes(pool), rng).filter(t => pool.filter(e => fits(e, t)).length >= S)
  // A featured exhibit leads: its region, era or kind is the first room.
  const lead = featured.length ? EXHIBIT_BY_ID[featured[Math.floor(rng() * featured.length)]] : null
  const themes: Theme[] = []
  if (lead) themes.push(labelsOf(lead)[Math.floor(rng() * 3)])
  for (const t of candidates) {
    if (themes.length >= R) break
    if (themes.some(x => themeKey(x) === themeKey(t))) continue
    themes.push(t)
  }
  if (themes.length < R) return null
  // Rooms of one attribute only are a sorting chore; mix at least two.
  if (new Set(themes.map(t => t.attr)).size < 2) return null
  const used = new Set<string>()
  const planted: string[][] = []
  for (const t of themes) {
    // Prefer exhibits that also fit another room: those are the decisions.
    const fitting = shuffle(pool.filter(e => !used.has(e.id) && fits(e, t)), rng)
      .sort((a, b) => themes.filter(x => fits(b, x)).length - themes.filter(x => fits(a, x)).length
        || (featured.includes(b.id) ? 1 : 0) - (featured.includes(a.id) ? 1 : 0))
    if (fitting.length < S) return null
    const pickN = Math.min(fitting.length, S + 2)
    const room = shuffle(fitting.slice(0, pickN), rng).slice(0, S).map(e => e.id)
    room.forEach(id => used.add(id))
    planted.push(room)
  }
  return { themes, planted }
}

export interface GenOptions { pool?: string[]; featured?: string[] }

export function generate(difficulty: Difficulty, seed: number, opts: GenOptions = {}): Puzzle {
  const R = scale(difficulty, [3, 4, 4, 5])
  const S = 3
  const hidden = difficulty >= 3
  const minCross = scale(difficulty, [2, 4, 0, 0])
  const pool = (opts.pool?.length ? opts.pool.map(id => EXHIBIT_BY_ID[id]) : EXHIBITS).filter(Boolean)
  const featured = (opts.featured ?? []).filter(id => EXHIBIT_BY_ID[id])
  const rng = mulberry32(seed)
  let fallback: Puzzle | null = null
  for (let attempt = 0; attempt < 400; attempt++) {
    const built = tryBuild(rng, pool, featured, R, S)
    if (!built) continue
    const pz: Puzzle = {
      themes: built.themes, hidden, slots: S,
      exhibits: shuffle(built.planted.flat(), rng),
      planted: built.planted,
      seconds: SECONDS[difficulty - 1],
      showEra: difficulty <= 2,
    }
    fallback ??= pz
    if (!hidden) {
      // Enough crossovers to need thought, but not so many that anything goes.
      if (crossovers(pz) < minCross) continue
      if (countSolutions(pz, 40) > 24) continue
    } else {
      // A random grouping must almost never work.
      if (countSolutions(pz, 60) > scale(difficulty, [0, 0, 12, 30])) continue
    }
    return pz
  }
  return fallback!
}
