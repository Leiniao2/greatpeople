import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Naval Battle — find and sink a hidden fleet before the salvos run out.
// Tap a square to fire; a hit burns, a miss splashes, and a ship whose every
// square is hit sinks and shows itself.  Each config changes what the
// gunners learn, so the deduction is different every time:
//
//   trafalgar  LINE    the enemy fleet lies in a single line of battle: every
//                      ship in one row, or every ship in one column
//   midway     SCOUTS  scout planes (free, but few) count the ship squares in a
//                      row or column, like a Bimaru clue; ships never touch
//   asdic      SONAR   every miss pings: it shows how far (in king steps) the
//                      nearest U-boat still afloat is
//   salamis    MOVING  the Persian ships row along the strait, one square a turn,
//                      turning about at the shore; a hit ship keeps burning
//
//   D1  6–7 squares a side, 2 ships       ≈ 1 min
//   D4  8–9 squares a side, 3–4 ships     ≈ 3 min
//
// Winnable by construction: a level is kept only when the exported solver,
// which sees nothing but what the player sees (shots, hits, sinkings, scout
// counts, pings, the burning ships), sinks the fleet within the salvo limit.
// The tests also measure its win rate on fresh fleets, and show that a gunner
// who ignores the config's clue loses most top-level battles.

export type Info = 'line' | 'scout' | 'sonar' | 'moving'

interface BattleshipConfig {
  title: string
  intro: string
  rule: string
  fact: string
  info: Info
  enemy: string
}

export const CONFIGS: Record<string, BattleshipConfig> = {
  trafalgar: {
    title: 'Trafalgar, 1805',
    intro: 'The Franco-Spanish fleet is formed in a single line of battle: all its ships lie in one row, or all in one column. Find the line, then rake it.',
    rule: 'The fleet lies in one line',
    fact: 'At Trafalgar on 21 October 1805 Nelson split his fleet into two columns and drove them straight at the long Franco-Spanish line, cutting it in two places. Twenty-two allied ships were lost and none of the British; Nelson was killed by a sharpshooter.',
    info: 'line', enemy: 'ship of the line',
  },
  midway: {
    title: 'Midway, June 1942',
    intro: 'Your scout planes can count the ship squares in any row or column — free, but there are only a few. Carriers never touch, not even at a corner.',
    rule: 'Scouts count a row or column',
    fact: 'At Midway on 4 June 1942 US code-breakers had warned Admiral Nimitz of the Japanese plan, and a scout plane spotted the carriers first. Dive bombers sank four Japanese fleet carriers — Akagi, Kaga, Sōryū and Hiryū — for the loss of USS Yorktown.',
    info: 'scout', enemy: 'carrier',
  },
  asdic: {
    title: 'The Western Approaches, 1941',
    intro: 'Every miss is also an ASDIC ping: the number shows how many squares away (counting diagonals, like a king) the nearest U-boat still afloat lies.',
    rule: 'Each miss pings the nearest U-boat',
    fact: 'ASDIC, the Royal Navy’s sonar, sent out a sound pulse and timed its echo to find a submerged U-boat’s range and bearing. Escort groups using it, with radar and broken Enigma signals, turned the Battle of the Atlantic in May 1943, when 41 U-boats were lost in a month.',
    info: 'sonar', enemy: 'U-boat',
  },
  salamis: {
    title: 'Salamis, 480 BCE',
    intro: 'In the narrow strait the Persian ships keep rowing: each turn every ship moves one square along its row, turning about at the shore. You cannot see them — until one is hit and burns.',
    rule: 'The fleet moves every turn',
    fact: 'In 480 BCE Themistocles lured the much larger Persian fleet into the narrow straits of Salamis, where its numbers could not tell. The Greek triremes rammed the crowded Persian ships, and Xerxes watched the defeat from a throne on the shore.',
    info: 'moving', enemy: 'trireme',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ─────────────────────────────────────────────────────────────────────

export interface Tier { w: number; h: number; fleet: number[]; salvos: number; scouts: number }

// Salvo limits were set from the solver's shot counts on fresh fleets (about
// its 80th–90th percentile); fleets it cannot sink in time are re-dealt.
const TIERS: Record<Info, Tier[]> = {
  line: [
    { w: 7, h: 7, fleet: [3, 2], salvos: 17, scouts: 0 },
    { w: 8, h: 8, fleet: [3, 2, 2], salvos: 16, scouts: 0 },
    { w: 9, h: 9, fleet: [3, 2, 2], salvos: 19, scouts: 0 },
    { w: 9, h: 9, fleet: [4, 2, 2], salvos: 17, scouts: 0 },
  ],
  scout: [
    { w: 6, h: 6, fleet: [3, 2], salvos: 14, scouts: 3 },
    { w: 7, h: 7, fleet: [3, 2, 2], salvos: 17, scouts: 4 },
    { w: 8, h: 8, fleet: [4, 3, 2], salvos: 18, scouts: 5 },
    { w: 8, h: 8, fleet: [4, 3, 2, 2], salvos: 18, scouts: 6 },
  ],
  sonar: [
    { w: 6, h: 6, fleet: [2, 2], salvos: 12, scouts: 0 },
    { w: 7, h: 7, fleet: [3, 2], salvos: 13, scouts: 0 },
    { w: 8, h: 8, fleet: [3, 2, 2], salvos: 16, scouts: 0 },
    { w: 8, h: 8, fleet: [3, 3, 2, 1], salvos: 20, scouts: 0 },
  ],
  moving: [
    { w: 7, h: 4, fleet: [3, 2], salvos: 15, scouts: 0 },
    { w: 7, h: 5, fleet: [3, 2, 2], salvos: 18, scouts: 0 },
    { w: 8, h: 5, fleet: [3, 3, 2], salvos: 19, scouts: 0 },
    { w: 8, h: 6, fleet: [4, 3, 2, 2], salvos: 24, scouts: 0 },
  ],
}

export function tierFor(info: Info, d: Difficulty): Tier {
  return scale(d, TIERS[info] as [Tier, Tier, Tier, Tier])
}

export interface Ship { id: number; len: number; r: number; c: number; horiz: boolean; dir: 1 | -1 }
export interface Level { info: Info; w: number; h: number; ships: Ship[]; salvos: number; scouts: number }

export interface Shot { cell: number; turn: number; hit: boolean; sunk: number | null; ping: number | null }
export interface Game {
  turn: number
  shots: Shot[]
  /** hit[shipId][segment] */
  hit: boolean[][]
  sunk: boolean[]
  /** Where each ship sank (its cells then). */
  wreck: (number[] | null)[]
  scouted: { line: string; count: number }[]
  /** Burning squares the player saw before each shot (moving fleets). */
  seen: number[][]
}

/** Column of a moving ship's bow-left end after `t` turns. */
export function xAt(ship: Ship, w: number, t: number): number {
  const span = w - ship.len
  if (span <= 0) return 0
  let x = ship.c, dir = ship.dir
  for (let k = 0; k < t; k++) {
    let nx = x + dir
    if (nx < 0 || nx > span) { dir = -dir as 1 | -1; nx = x + dir }
    x = nx
  }
  return x
}

export function shipCells(level: Pick<Level, 'info' | 'w'>, ship: Ship, t: number): number[] {
  const out: number[] = []
  const w = level.w
  if (level.info === 'moving') {
    const x = xAt(ship, w, t)
    for (let k = 0; k < ship.len; k++) out.push(ship.r * w + x + k)
    return out
  }
  for (let k = 0; k < ship.len; k++) out.push(ship.horiz ? ship.r * w + ship.c + k : (ship.r + k) * w + ship.c)
  return out
}

export function newGame(level: Level): Game {
  return { turn: 0, shots: [], hit: level.ships.map(s => Array(s.len).fill(false)), sunk: level.ships.map(() => false), wreck: level.ships.map(() => null), scouted: [], seen: [] }
}

const cheb = (w: number, a: number, b: number) => Math.max(Math.abs(Math.floor(a / w) - Math.floor(b / w)), Math.abs((a % w) - (b % w)))

/** Burning squares now: hit segments of ships still afloat. */
export function burningNow(level: Level, g: Game): number[] {
  const out: number[] = []
  level.ships.forEach((s, i) => {
    if (g.sunk[i]) return
    const cells = shipCells(level, s, g.turn)
    cells.forEach((c, k) => { if (g.hit[i][k]) out.push(c) })
  })
  return out
}

export function canFire(level: Level, g: Game, cell: number): boolean {
  if (cell < 0 || cell >= level.w * level.h || isOver(level, g)) return false
  if (level.info === 'moving') {
    if (burningNow(level, g).includes(cell)) return false
    return !g.wreck.some(w => w?.includes(cell))
  }
  return !g.shots.some(s => s.cell === cell)
}

export function fire(level: Level, g: Game, cell: number): Game {
  if (!canFire(level, g, cell)) return g
  const seen = level.info === 'moving' ? [...g.seen, burningNow(level, g)] : g.seen
  const hit = g.hit.map(h => [...h]), sunk = [...g.sunk], wreck = [...g.wreck]
  let shot: Shot = { cell, turn: g.turn, hit: false, sunk: null, ping: null }
  for (const s of level.ships) {
    if (sunk[s.id]) continue
    const cells = shipCells(level, s, g.turn)
    const k = cells.indexOf(cell)
    if (k < 0) continue
    hit[s.id][k] = true
    shot = { ...shot, hit: true }
    if (hit[s.id].every(Boolean)) { sunk[s.id] = true; wreck[s.id] = cells; shot.sunk = s.id }
  }
  if (!shot.hit && level.info === 'sonar') {
    let best = Infinity
    for (const s of level.ships) if (!sunk[s.id]) for (const c of shipCells(level, s, g.turn)) best = Math.min(best, cheb(level.w, cell, c))
    shot.ping = best
  }
  return { ...g, turn: g.turn + 1, shots: [...g.shots, shot], hit, sunk, wreck, seen }
}

export function lineCount(level: Level, line: string): number {
  const i = Number(line.slice(1))
  let n = 0
  for (const s of level.ships) for (const c of shipCells(level, s, 0)) if (line[0] === 'r' ? Math.floor(c / level.w) === i : c % level.w === i) n++
  return n
}

export function scout(level: Level, g: Game, line: string): Game {
  if (g.scouted.length >= level.scouts || g.scouted.some(s => s.line === line) || isOver(level, g)) return g
  return { ...g, scouted: [...g.scouted, { line, count: lineCount(level, line) }] }
}

export const isWon = (g: Game) => g.sunk.every(Boolean)
export const isOver = (level: Level, g: Game) => isWon(g) || g.shots.length >= level.salvos
export const outcomeOf = (level: Level, g: Game): 'won' | 'lost' | null => (isWon(g) ? 'won' : g.shots.length >= level.salvos ? 'lost' : null)

// ── What the player sees, and a solver that uses nothing else ──────────────────

export interface View {
  info: Info; w: number; h: number; fleet: number[]; salvos: number; scouts: number
  turn: number
  shots: Shot[]
  sunk: { len: number; cells: number[]; turn: number }[]
  scouted: { line: string; count: number }[]
  /** Moving fleets: burning squares seen before each shot, and now. */
  seen: number[][]
  burning: number[]
}

export function viewOf(level: Level, g: Game): View {
  return {
    info: level.info, w: level.w, h: level.h, fleet: level.ships.map(s => s.len), salvos: level.salvos, scouts: level.scouts,
    turn: g.turn, shots: g.shots,
    sunk: level.ships.filter(s => g.sunk[s.id]).map(s => ({ len: s.len, cells: g.wreck[s.id]!, turn: g.shots.findIndex(x => x.sunk === s.id) })),
    scouted: g.scouted, seen: g.seen, burning: level.info === 'moving' ? burningNow(level, g) : [],
  }
}

export type Move = { t: 'fire'; cell: number } | { t: 'scout'; line: string }

const nb8 = (w: number, h: number, i: number) => {
  const r = Math.floor(i / w), c = i % w, out: number[] = []
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue
    const rr = r + dr, cc = c + dc
    if (rr >= 0 && cc >= 0 && rr < h && cc < w) out.push(rr * w + cc)
  }
  return out
}

/** Every straight placement of a ship of length len. */
function placements(w: number, h: number, len: number): number[][] {
  const out: number[][] = []
  for (let r = 0; r < h; r++) for (let c = 0; c + len <= w; c++) out.push(Array.from({ length: len }, (_, k) => r * w + c + k))
  if (len > 1) for (let c = 0; c < w; c++) for (let r = 0; r + len <= h; r++) out.push(Array.from({ length: len }, (_, k) => (r + k) * w + c))
  return out
}

/** Lengths of the ships still afloat, as far as the player can tell. */
function afloat(v: View): number[] {
  const left = [...v.fleet]
  for (const s of v.sunk) left.splice(left.indexOf(s.len), 1)
  return left
}

/** All line-of-battle fleets: every ship in one row or one column. */
export function lineLayouts(w: number, h: number, fleet: readonly number[]): number[][][] {
  const out: number[][][] = []
  const perms = new Set<string>()
  const permute = (rest: number[], acc: number[]) => {
    if (!rest.length) { perms.add(acc.join(',')); return }
    rest.forEach((x, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, x]))
  }
  permute([...fleet], [])
  const lines: number[][] = []
  for (let r = 0; r < h; r++) lines.push(Array.from({ length: w }, (_, c) => r * w + c))
  for (let c = 0; c < w; c++) lines.push(Array.from({ length: h }, (_, r) => r * w + c))
  for (const line of lines) for (const p of perms) {
    const lens = p.split(',').map(Number)
    const place = (k: number, pos: number, acc: number[][]) => {
      if (k === lens.length) { out.push(acc); return }
      for (let s = pos; s + lens[k] <= line.length; s++) place(k + 1, s + lens[k], [...acc, line.slice(s, s + lens[k])])
    }
    place(0, 0, [])
  }
  return out
}

const layoutCache = new Map<string, number[][][]>()

/**
 * The solver: chooses a shot (or a scout flight) from the View alone.
 * - line: exact — keeps every line-of-battle fleet consistent with what was
 *   seen and fires where the most of them have a ship.
 * - otherwise: hunt and target over single-ship placements that fit every
 *   miss, sinking, scout count (and no-touch), ping and, for a moving fleet,
 *   every burning ship seen; with unexplained hits it fires only next to them.
 * `useRule: false` makes it ignore the config's own clue (for the tests).
 */
export function chooseMove(v: View, useRule = true): Move {
  const { w, h } = v
  const N = w * h
  const misses = new Set<number>(), hits = new Set<number>()
  const shotAt = new Set<number>()
  const sunkCells = new Set<number>()
  for (const s of v.sunk) for (const c of s.cells) sunkCells.add(c)
  for (const s of v.shots) { shotAt.add(s.cell); if (s.hit) hits.add(s.cell); else misses.add(s.cell) }
  const openHits = [...hits].filter(c => !sunkCells.has(c))
  const pick = (score: Float64Array, allowed: (i: number) => boolean): Move => {
    let best = -1, bi = -1
    for (let i = 0; i < N; i++) if (allowed(i) && score[i] > best + 1e-9) { best = score[i]; bi = i }
    if (bi < 0) for (let i = 0; i < N; i++) if (allowed(i)) { bi = i; break }
    return { t: 'fire', cell: bi }
  }

  if (v.info === 'line' && useRule) {
    const key = `${w}x${h}:${v.fleet.join(',')}`
    let all = layoutCache.get(key)
    if (!all) { all = lineLayouts(w, h, v.fleet); layoutCache.set(key, all) }
    const fits = all.filter(L => {
      const cells = new Set(L.flat())
      for (const m of misses) if (cells.has(m)) return false
      for (const x of hits) if (!cells.has(x)) return false
      for (const s of v.sunk) if (!L.some(seg => seg.length === s.cells.length && seg.every(c => s.cells.includes(c)))) return false
      // A ship not reported sunk still has a square nobody has hit.
      for (const seg of L) if (seg.every(c => hits.has(c)) && !v.sunk.some(s => s.cells.length === seg.length && seg.every(c => s.cells.includes(c)))) return false
      return true
    })
    const score = new Float64Array(N)
    for (const L of fits) for (const seg of L) for (const c of seg) score[c]++
    return pick(score, i => !shotAt.has(i))
  }

  if (v.info === 'scout' && useRule && v.scouted.length < v.scouts && !openHits.length) {
    // Fly the scouts first, over the lines the fleet is likeliest to cross.
    const score = new Float64Array(N)
    for (const len of v.fleet) for (const p of placements(w, h, len)) for (const c of p) score[c]++
    let best = -1, line = ''
    const done = new Set(v.scouted.map(s => s.line))
    const order = [...Array.from({ length: h }, (_, r) => `r${r}`), ...Array.from({ length: w }, (_, c) => `c${c}`)]
    // Alternate rows and columns, middle first.
    const wantRow = v.scouted.length % 2 === 0
    for (const ln of order) {
      if (done.has(ln) || (ln[0] === 'r') !== wantRow) continue
      const i = Number(ln.slice(1))
      let s = 0
      for (let k = 0; k < (ln[0] === 'r' ? w : h); k++) s += score[ln[0] === 'r' ? i * w + k : k * w + i]
      // Prefer lines away from those already flown.
      const near = v.scouted.some(x => x.line[0] === ln[0] && Math.abs(Number(x.line.slice(1)) - i) <= 1) ? 0.5 : 1
      if (s * near > best) { best = s * near; line = ln }
    }
    return { t: 'scout', line }
  }

  if (v.info === 'moving') {
    if (!useRule) {
      // A gunner who forgets the ships move: static hunt and target.
      return chooseMove({ ...v, info: 'line', shots: v.shots }, false)
    }
    return chooseMoving(v)
  }

  // Static hunt and target over single-ship placements.
  const noTouch = v.info === 'scout'
  const nearSunk = new Set<number>()
  if (noTouch) for (const c of sunkCells) for (const k of nb8(w, h, c)) nearSunk.add(k)
  const scoutLines = useRule ? v.scouted : []
  const known = new Set<number>([...hits, ...sunkCells])
  const pings = useRule && v.info === 'sonar' ? v.shots.filter(s => s.ping !== null) : []
  const score = new Float64Array(N)
  const target = openHits.length > 0
  for (const len of afloat(v)) {
    for (const p of placements(w, h, len)) {
      if (p.some(c => misses.has(c) || sunkCells.has(c) || nearSunk.has(c))) continue
      if (noTouch) {
        const inP = new Set(p)
        if (p.some(c => nb8(w, h, c).some(k => hits.has(k) && !inP.has(k) && !sunkCells.has(k)))) continue
      }
      if (scoutLines.length) {
        let bad = false
        for (const s of scoutLines) {
          const i = Number(s.line.slice(1))
          const inLine = (c: number) => (s.line[0] === 'r' ? Math.floor(c / w) === i : c % w === i)
          const mine = p.filter(inLine).length
          const other = [...known].filter(c => inLine(c) && !p.includes(c)).length
          if (mine + other > s.count) { bad = true; break }
        }
        if (bad) continue
      }
      if (pings.some(s => p.some(c => cheb(w, s.cell, c) < s.ping!))) continue
      const covered = p.filter(c => hits.has(c) && !sunkCells.has(c)).length
      if (target && !covered) continue
      let wgt = target ? Math.pow(30, covered) : 1
      // A ping with nothing at its exact range yet is likelier explained by this ship.
      for (const s of pings) {
        if ([...known].some(c => cheb(w, s.cell, c) === s.ping)) continue
        if (p.some(c => cheb(w, s.cell, c) === s.ping)) wgt *= 3
      }
      for (const c of p) if (!shotAt.has(c)) score[c] += wgt
    }
  }
  // Scout counts also say how crowded a line is: weigh each square by the
  // share of its lines' unknown squares that must still hold a ship.
  if (scoutLines.length && !target) {
    const base = afloat(v).reduce((a, b) => a + b, 0) / Math.max(1, N - shotAt.size)
    for (const s of scoutLines) {
      const i = Number(s.line.slice(1))
      const cells = Array.from({ length: s.line[0] === 'r' ? w : h }, (_, k) => (s.line[0] === 'r' ? i * w + k : k * w + i))
      const unknown = cells.filter(c => !shotAt.has(c) && !sunkCells.has(c))
      const need = s.count - cells.filter(c => known.has(c)).length
      if (!unknown.length) continue
      const f = Math.max(0, need / unknown.length) / Math.max(1e-6, base)
      for (const c of unknown) score[c] *= f
    }
  }
  return pick(score, i => !shotAt.has(i))
}

/** Hypotheses for one moving ship: its row, starting column and heading. */
function chooseMoving(v: View): Move {
  const { w, h } = v
  const N = w * h
  const lens = afloat(v)
  const sunkRows = new Set(v.sunk.map(s => Math.floor(s.cells[0] / w)))
  const wreckCells = new Set(v.sunk.flatMap(s => s.cells))
  const now = new Set(v.burning)
  const score = new Float64Array(N)
  // Rows known to hold a ship still afloat: some burning square was seen there.
  const hotRows = new Set<number>([...v.burning, ...v.seen.flat()].map(c => Math.floor(c / w)))
  for (const s of v.shots) if (s.hit && s.sunk === null) hotRows.add(Math.floor(s.cell / w))
  for (const s of v.sunk) hotRows.delete(Math.floor(s.cells[0] / w))
  const target = [...hotRows].length > 0
  for (const len of new Set(lens)) {
    const mult = lens.filter(l => l === len).length
    for (let r = 0; r < h; r++) {
      if (sunkRows.has(r)) continue
      if (target && !hotRows.has(r)) continue
      for (let c = 0; c + len <= w; c++) for (const dir of [1, -1] as const) {
        if (w - len <= 0 && dir === -1) continue
        const ship: Ship = { id: 0, len, r, c, horiz: true, dir }
        const cellsAt = (t: number) => { const x = xAt(ship, w, t); return Array.from({ length: len }, (_, k) => r * w + x + k) }
        let ok = true
        // Every shot so far: a miss in this row must not have touched it; a hit in this row must have.
        for (const s of v.shots) {
          if (Math.floor(s.cell / w) !== r) continue
          if (v.sunk.some(x => x.turn === v.shots.indexOf(s))) continue
          const cs = cellsAt(s.turn)
          if (s.hit !== cs.includes(s.cell)) { ok = false; break }
        }
        // Every burning square seen in this row lies on it then.
        if (ok) for (let t = 0; t < v.seen.length && ok; t++) for (const b of v.seen[t]) if (Math.floor(b / w) === r && !cellsAt(v.shots[t].turn).includes(b)) ok = false
        if (ok) for (const b of now) if (Math.floor(b / w) === r && !cellsAt(v.turn).includes(b)) ok = false
        if (!ok) continue
        for (const c2 of cellsAt(v.turn)) if (!now.has(c2) && !wreckCells.has(c2)) score[c2] += mult
      }
    }
  }
  let best = -1, bi = -1
  for (let i = 0; i < N; i++) if (!now.has(i) && !wreckCells.has(i) && score[i] > best + 1e-9) { best = score[i]; bi = i }
  if (bi < 0) bi = [...Array(N).keys()].find(i => !now.has(i) && !wreckCells.has(i)) ?? 0
  return { t: 'fire', cell: bi }
}

/** Play a whole battle with the solver; returns the shots it needed (Infinity if it ran out). */
export function solverShots(level: Level, useRule = true, cap = 200): number {
  let g = newGame(level)
  for (let k = 0; k < cap + 20 && !isWon(g); k++) {
    const m = chooseMove(viewOf(level, g), useRule)
    if (m.t === 'scout') { g = scout(level, g, m.line); continue }
    if (g.shots.length >= cap) return Infinity
    const next = fire(level, g, m.cell)
    if (next === g) return Infinity
    g = next
  }
  return isWon(g) ? g.shots.length : Infinity
}

/** Play with a salvo limit, as the game does; returns the final game. */
export function playOut(level: Level, useRule = true): Game {
  let g = newGame(level)
  for (let k = 0; k < 400 && !isOver(level, g); k++) {
    const m = chooseMove(viewOf(level, g), useRule)
    const next = m.t === 'scout' ? scout(level, g, m.line) : fire(level, g, m.cell)
    if (next === g) break
    g = next
  }
  return g
}

// ── Fleets ────────────────────────────────────────────────────────────────────

export function randomFleet(info: Info, t: Tier, rng: Rng): Ship[] | null {
  const { w, h, fleet } = t
  const ships: Ship[] = []
  const occ = new Set<number>()
  if (info === 'line') {
    const horiz = rng() < 0.5
    const len = horiz ? w : h
    const idx = Math.floor(rng() * (horiz ? h : w))
    const order = shuffle(fleet.map((_, i) => i), rng)
    let slack = len - fleet.reduce((a, b) => a + b, 0)
    if (slack < 0) return null
    let pos = 0
    const out: Ship[] = []
    order.forEach((fi, k) => {
      const gap = k === order.length - 1 ? Math.floor(rng() * (slack + 1)) : Math.floor(rng() * (slack + 1))
      pos += gap; slack -= gap
      out.push({ id: fi, len: fleet[fi], r: horiz ? idx : pos, c: horiz ? pos : idx, horiz, dir: 1 })
      pos += fleet[fi]
    })
    return out.sort((a, b) => a.id - b.id)
  }
  if (info === 'moving') {
    const rows = shuffle(Array.from({ length: h }, (_, r) => r), rng)
    return fleet.map((len, id) => ({ id, len, r: rows[id], c: Math.floor(rng() * (w - len + 1)), horiz: true, dir: rng() < 0.5 ? 1 : -1 }))
  }
  for (const [id, len] of fleet.map((l, i) => [i, l] as const)) {
    let placed = false
    for (let tries = 0; tries < 200 && !placed; tries++) {
      const horiz = rng() < 0.5
      const r = Math.floor(rng() * (horiz ? h : h - len + 1)), c = Math.floor(rng() * (horiz ? w - len + 1 : w))
      const s: Ship = { id, len, r, c, horiz, dir: 1 }
      const cells = shipCells({ info, w }, s, 0)
      if (cells.some(x => occ.has(x))) continue
      if (info === 'scout' && cells.some(x => nb8(w, h, x).some(k => occ.has(k)))) continue
      cells.forEach(x => occ.add(x))
      ships.push(s); placed = true
    }
    if (!placed) return null
  }
  return ships
}

/** A battle the solver wins within the salvo limit. */
export function generate(configId: string, d: Difficulty, seed: number): Level {
  const cfg = CONFIGS[configId] ?? CONFIGS.trafalgar
  const t = tierFor(cfg.info, d)
  const rng = mulberry32(seed ^ hashString(`battleship:${cfg.info}:${d}`))
  let best: { level: Level; shots: number } | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const ships = randomFleet(cfg.info, t, rng)
    if (!ships) continue
    const level: Level = { info: cfg.info, w: t.w, h: t.h, ships, salvos: t.salvos, scouts: t.scouts }
    const shots = solverShots(level, true, t.salvos)
    if (shots <= t.salvos) return level
    if (!best || shots < best.shots) best = { level, shots }
  }
  // Practically unreachable; keep the battle winnable all the same.
  const lv = best!.level
  return { ...lv, salvos: Math.max(lv.salvos, solverShots(lv, true, 400)) }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BattleshipGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'trafalgar')
  const id = CONFIGS[configId] ? configId : 'trafalgar'
  const level = useMemo(() => generate(id, difficulty, seed), [id, difficulty, seed])
  const [game, setGame] = useState<Game>(() => newGame(level))
  const [scoutMode, setScoutMode] = useState(false)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const { w, h, info } = level
  const left = level.salvos - game.shots.length
  const burning = new Set(info === 'moving' ? burningNow(level, game) : [])
  const wrecks = new Map<number, number>()
  game.wreck.forEach((cells, sid) => cells?.forEach(c => wrecks.set(c, sid)))

  const tap = (cell: number) => {
    if (settled) return
    if (!canFire(level, game, cell)) return
    const next = fire(level, game, cell)
    setGame(next)
    const o = outcomeOf(level, next)
    if (o === 'won') win()
    else if (o === 'lost') lose('Out of salvos')
  }
  const flyScout = (line: string) => {
    if (settled || !scoutMode) return
    const next = scout(level, game, line)
    if (next !== game) { setGame(next); if (next.scouted.length >= level.scouts) setScoutMode(false) }
  }

  // Latest shot per cell (moving fleets: misses fade with age).
  const lastShot = new Map<number, Shot>()
  for (const s of game.shots) lastShot.set(s.cell, s)
  const scoutOf = (line: string) => game.scouted.find(s => s.line === line)
  const showLabels = info === 'scout'
  const cols = w + (showLabels ? 1 : 0)
  const fontPx = w <= 6 ? 18 : w <= 8 ? 15 : 13

  const cellsUI: React.ReactNode[] = []
  if (showLabels) {
    cellsUI.push(<div key="corner" />)
    for (let c = 0; c < w; c++) {
      const s = scoutOf(`c${c}`)
      cellsUI.push(
        <button key={`c${c}`} type="button" data-scout={`c${c}`} onClick={() => flyScout(`c${c}`)} disabled={settled || !scoutMode || !!s}
          className={`aspect-square rounded-sm text-[10px] font-bold flex items-center justify-center ${s ? 'bg-sky-700 text-white' : scoutMode ? 'bg-sky-200 text-sky-900' : 'bg-transparent text-muted'}`}>
          {s ? s.count : scoutMode ? '🛩' : ''}
        </button>,
      )
    }
  }
  for (let r = 0; r < h; r++) {
    if (showLabels) {
      const s = scoutOf(`r${r}`)
      cellsUI.push(
        <button key={`r${r}`} type="button" data-scout={`r${r}`} onClick={() => flyScout(`r${r}`)} disabled={settled || !scoutMode || !!s}
          className={`aspect-square rounded-sm text-[10px] font-bold flex items-center justify-center ${s ? 'bg-sky-700 text-white' : scoutMode ? 'bg-sky-200 text-sky-900' : 'bg-transparent text-muted'}`}>
          {s ? s.count : scoutMode ? '🛩' : ''}
        </button>,
      )
    }
    for (let c = 0; c < w; c++) {
      const i = r * w + c
      const shot = lastShot.get(i)
      let body: React.ReactNode = null
      let cls = 'bg-[#2f6f8f] hover:bg-[#3a7f9f]'
      let state = 'sea'
      if (wrecks.has(i)) { cls = 'bg-[#3b3b3b]'; body = <span className="text-[0.8em]">⚓</span>; state = 'sunk' }
      else if (info === 'moving' ? burning.has(i) : shot?.hit) { cls = 'bg-[#c2410c]'; body = '🔥'; state = 'hit' }
      else if (shot && !shot.hit && info !== 'moving') {
        cls = 'bg-[#a9cfe0]'; state = 'miss'
        body = info === 'sonar' ? <span className="font-black text-sky-900">{shot.ping}</span> : <span className="text-sky-900/70">•</span>
      } else if (info === 'moving' && shot && !shot.hit) {
        const age = game.turn - 1 - shot.turn
        body = <span className="text-white/90" style={{ opacity: Math.max(0.3, 1 - age * 0.2) }}>{age === 0 ? '💦' : '•'}</span>
        state = 'splash'
      } else if (settled && outcome === 'lost') {
        // Show the fleet after a defeat.
        const sh = level.ships.find(s => !game.sunk[s.id] && shipCells(level, s, game.turn).includes(i))
        if (sh) { cls = 'bg-[#6b7280]'; state = 'reveal' }
      }
      const disabled = settled || !canFire(level, game, i)
      cellsUI.push(
        <button key={i} type="button" data-cell={i} data-state={state} onClick={() => tap(i)} disabled={disabled && state !== 'splash'}
          aria-label={`square ${String.fromCharCode(65 + c)}${r + 1}`}
          className={`aspect-square rounded-[3px] flex items-center justify-center leading-none ${cls}`}
          style={{ fontSize: fontPx, touchAction: 'manipulation' }}>
          {body}
        </button>,
      )
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-ink-2 text-[11px] font-bold">{cfg.rule}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className={`font-bold ${left <= 3 ? 'text-red-600' : 'text-ink-2'}`} data-testid="salvos-left">💥 {left} salvo{left === 1 ? '' : 's'}</p>
          {info === 'moving' && <p>turn {game.turn + 1}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 justify-center" data-testid="fleet">
        {level.ships.map(s => (
          <span key={s.id} className={`flex gap-px items-center px-1 py-0.5 rounded border ${game.sunk[s.id] ? 'border-line opacity-40 line-through' : 'border-line bg-panel'}`}
            aria-label={`${cfg.enemy} of ${s.len}${game.sunk[s.id] ? ', sunk' : ''}`}>
            {Array.from({ length: s.len }, (_, k) => <span key={k} className={`w-2.5 h-2.5 rounded-sm ${game.sunk[s.id] ? 'bg-ink-2' : 'bg-[#2f6f8f]'}`} />)}
          </span>
        ))}
      </div>

      <div className="w-full max-w-[400px] mx-auto rounded-lg p-1 border border-line shadow-inner"
        style={{ background: info === 'moving' ? 'linear-gradient(180deg,#c8b27a 0 4px,#1f5a75 4px calc(100% - 4px),#c8b27a calc(100% - 4px))' : '#1f5a75' }}>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{cellsUI}</div>
      </div>

      {info === 'scout' && !settled && (
        <button type="button" onClick={() => setScoutMode(m => !m)} aria-pressed={scoutMode} disabled={game.scouted.length >= level.scouts}
          className={`h-10 w-full max-w-[400px] mx-auto rounded-lg border text-xs font-bold disabled:opacity-40 ${scoutMode ? 'bg-sky-700 text-white border-sky-700' : 'bg-panel border-line text-ink-2'}`}>
          🛩 {scoutMode ? 'Tap a row or column to scout it' : `Send a scout (${level.scouts - game.scouted.length} left)`}
        </button>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : info === 'sonar' ? 'Tap to fire. A miss shows the range to the nearest U-boat afloat.'
          : info === 'moving' ? 'Tap to fire. After each shot every ship rows one square on, turning about at the shore.'
          : info === 'line' ? 'Tap to fire. Every enemy ship lies in the same row — or the same column.'
          : 'Tap to fire. Scouts are free; ships never touch, even at a corner.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The enemy fleet is sunk!" loseTitle="Out of salvos — the fleet escapes" />
    </div>
  )
}
