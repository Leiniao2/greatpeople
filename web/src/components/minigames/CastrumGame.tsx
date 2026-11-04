import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, shuffle, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar, type Rng } from './_shared'

// Castrum — lay out a Roman (or Han) camp inside its rampart so that every
// rule holds.  Place the gates on the wall (the roads run between them) and
// put the tents, the headquarters, the granary and the horse lines inside.
// The numbers outside the wall count the buildings in each row and column,
// as in a Tents or Battleships puzzle.
//
// Each config is a different rule book:
//   polybius    four gates, two roads crossing; nothing in the intervallum by
//               the wall; the praetorium at a corner of the crossroads, the
//               granary (quaestorium) beside it, horse lines along a road;
//               tents never touch and their doors face the enemy (north)
//   marching    four gates, crossing roads; no granary; tents pitched in pairs
//               side by side — and a short clock, as the turf goes up at dusk
//   milecastle  two gates, north and south, on one road; every barrack touches
//               the road; the granary sits by a gate
//   masada      no gates: the camps ring the rock; every tent must see the rock
//               along its row or column; the command post touches the rock
//   han         one gate, in the south; the road runs north to the commander’s
//               tent, which stands in the northern half; tents face south
//
//   D1  5×5 (7×7 with an intervallum), 3–4 tents     2 min on the clock
//   D2  6×6 (7×7),  4 tents                          3 min
//   D3  7×7 (8×8),  5–6 tents                        4 min
//   D4  8×8 (9×9),  6–8 tents                        5 min  (marching: × 0.6)
//
// A camp is built from the seed by laying out a valid camp first; the clues
// are read off it.  The exported solver then counts every camp that fits the
// clues; while it finds a second one, a cell (or gate) where the two differ is
// given, until the layout is unique.  The game is won the moment the board
// satisfies every rule — which, by uniqueness, is the camp the clues describe.

export type Item = 'T' | 'P' | 'G' | 'H'
export type Cell = Item | null
export type GateRule = 'cross' | 'ns' | 'south' | 'none'

export interface CampRules {
  gates: GateRule
  intervallum: boolean
  /** The cell in front of each tent (towards N or S) must be free of buildings. */
  front: 'N' | 'S' | null
  tents: 'apart' | 'pairs'
  hq: 'crossing' | 'road-end' | 'rock' | null
  granary: 'by-hq' | 'by-gate' | null
  horses: 'by-road' | null
  tentsTouchRoad: boolean
  rock: boolean
}

interface CastrumConfig extends CampRules {
  title: string
  intro: string
  rule: string
  fact: string
  /** Clock multiplier. */
  pace: number
  /** Names for the palette. */
  names: Record<Item, string>
}

const ROMAN = { T: 'Tent', P: 'Praetorium', G: 'Granary', H: 'Horse lines' }

export const CONFIGS: Record<string, CastrumConfig> = {
  polybius: {
    title: 'The Consular Camp of Polybius',
    intro: 'Four gates, and the via principalis and via praetoria crossing between them. Keep the intervallum by the rampart clear; the praetorium stands at a corner of the crossroads with the granary beside it; horse lines stand along a road. Tents never touch, and each door faces the enemy to the north onto open ground.',
    rule: 'Crossed roads, intervallum, doors to the north',
    fact: 'Polybius (Histories, Book 6) describes the consular camp as a square, with the general’s tent, the praetorium, beside the via principalis that ran across the camp, and an open strip some 200 feet wide — the intervallum — between the tents and the rampart, out of range of missiles thrown over the wall.',
    gates: 'cross', intervallum: true, front: 'N', tents: 'apart', hq: 'crossing', granary: 'by-hq', horses: 'by-road', tentsTouchRoad: false, rock: false,
    pace: 1, names: ROMAN,
  },
  marching: {
    title: 'A Marching Camp at Dusk',
    intro: 'The legion must be dug in before dark. Four gates, two crossing roads, the praetorium at a corner of the crossroads, horse lines along a road. The men pitch their tents in pairs side by side; one pair never touches another.',
    rule: 'Tents in pairs, against the clock',
    fact: 'On campaign a Roman army built a fresh camp at the end of each day’s march: a ditch, a turf rampart and a palisade of stakes the soldiers carried with them. Josephus wrote that a camp went up “quicker than thought”.',
    gates: 'cross', intervallum: false, front: null, tents: 'pairs', hq: 'crossing', granary: null, horses: 'by-road', tentsTouchRoad: false, rock: false,
    pace: 0.6, names: ROMAN,
  },
  milecastle: {
    title: 'A Milecastle on Hadrian’s Wall',
    intro: 'Two gates: one through the Wall to the north, one to the south, joined by a single road. Every barrack touches the road; no two barracks touch. The granary stands by one of the gates.',
    rule: 'Two gates on one road, barracks on the road',
    fact: 'Hadrian’s Wall, begun in AD 122, had a small fortlet — a milecastle — every Roman mile, with a gate through the Wall to the north and another to the south, and two turrets between each pair of milecastles.',
    gates: 'ns', intervallum: false, front: null, tents: 'apart', hq: null, granary: 'by-gate', horses: null, tentsTouchRoad: true, rock: false,
    pace: 1, names: { T: 'Barrack', P: 'Praetorium', G: 'Granary', H: 'Horse lines' },
  },
  masada: {
    title: 'The Siege Camps of Masada',
    intro: 'No gates this time: the camps ring the rock. Every tent must see the rock straight along its row or column, with no building in between. The command post touches the rock and the granary stands beside it. Tents never touch.',
    rule: 'Every tent sees the rock',
    fact: 'In AD 73–74 the Tenth Legion besieged Masada, ringing the mountain with a siege wall and eight camps whose outlines can still be seen from the summit. The commander Flavius Silva’s camp lay on the west, near the great ramp.',
    gates: 'none', intervallum: false, front: null, tents: 'apart', hq: 'rock', granary: 'by-hq', horses: null, tentsTouchRoad: false, rock: true,
    pace: 1, names: { T: 'Tent', P: 'Command post', G: 'Granary', H: 'Horse lines' },
  },
  han: {
    title: 'A Han Frontier Camp',
    intro: 'One gate, in the south wall. The road runs north from it to the commander’s tent, which stands in the northern half of the camp — seated in the north, facing south. Every tent faces south onto open ground; horse lines stand along the road; tents never touch.',
    rule: 'Facing south: one gate, road to the commander',
    fact: 'In Chinese tradition the seat of honour was in the north, facing south — the ruler “faced south” to govern — and palaces, cities and commanders’ quarters were laid out that way. Thousands of Han-dynasty wooden slips from the frontier garrisons at Juyan, found from 1930 onwards, record their daily life.',
    gates: 'south', intervallum: false, front: 'S', tents: 'apart', hq: 'road-end', granary: null, horses: 'by-road', tentsTouchRoad: false, rock: false,
    pace: 1, names: { T: 'Tent', P: 'Commander', G: 'Granary', H: 'Horse lines' },
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ─────────────────────────────────────────────────────────────────────

export interface Tier { n: number; tents: number; horses: number; seconds: number }

export function tierFor(rules: CampRules, d: Difficulty, pace = 1): Tier {
  const n = rules.intervallum ? scale(d, [7, 7, 8, 9]) : scale(d, [5, 6, 7, 8])
  const tents = rules.tents === 'pairs' ? scale(d, [2, 4, 4, 6])
    : rules.tentsTouchRoad ? scale(d, [2, 3, 4, 5])
    : rules.rock ? scale(d, [3, 4, 5, 6])
    : scale(d, [3, 4, 6, 7])
  return {
    n, tents,
    horses: rules.horses ? scale(d, [1, 1, 2, 2]) : 0,
    seconds: Math.round(scale(d, [120, 180, 240, 300]) * pace),
  }
}

export interface Camp {
  n: number
  rules: CampRules
  rock: boolean[]
  rowClue: number[]
  colClue: number[]
  stock: Record<Item, number>
  /** Given cells: an item, 'X' for open ground, or undefined. */
  given: (Cell | 'X' | undefined)[]
  givenGates: string[]
  solution: { cells: Cell[]; gates: string[] }
  /** True when the solver proved the clues and givens allow only the solution. */
  unique: boolean
}

export const gateKey = (side: 'N' | 'S' | 'E' | 'W', i: number) => `${side}${i}`
const parseGate = (k: string) => ({ side: k[0] as 'N' | 'S' | 'E' | 'W', i: Number(k.slice(1)) })
export const isBuilding = (c: Cell | undefined) => c === 'T' || c === 'P' || c === 'G' || c === 'H'

/** Road cells implied by the gates (and, for the Han camp, where the commander stands). */
export function roadsFrom(n: number, rules: CampRules, gates: readonly string[], cells: readonly Cell[]): boolean[] {
  const road = Array(n * n).fill(false)
  const set = new Set(gates)
  if (rules.gates === 'cross' || rules.gates === 'ns') {
    for (let c = 0; c < n; c++) if (set.has(gateKey('N', c)) && set.has(gateKey('S', c))) for (let r = 0; r < n; r++) road[r * n + c] = true
    if (rules.gates === 'cross') for (let r = 0; r < n; r++) if (set.has(gateKey('W', r)) && set.has(gateKey('E', r))) for (let c = 0; c < n; c++) road[r * n + c] = true
  } else if (rules.gates === 'south') {
    for (let c = 0; c < n; c++) if (set.has(gateKey('S', c))) {
      for (let r = n - 1; r >= 0; r--) { if (cells[r * n + c] === 'P') break; road[r * n + c] = true }
    }
  }
  return road
}

export function gatesOk(_n: number, rules: CampRules, gates: readonly string[]): boolean {
  const gs = gates.map(parseGate)
  const of = (s: string) => gs.filter(g => g.side === s)
  if (rules.gates === 'none') return gs.length === 0
  if (rules.gates === 'south') return gs.length === 1 && of('S').length === 1
  if (rules.gates === 'ns') return gs.length === 2 && of('N').length === 1 && of('S').length === 1 && of('N')[0].i === of('S')[0].i
  return gs.length === 4 && of('N').length === 1 && of('S').length === 1 && of('E').length === 1 && of('W').length === 1
    && of('N')[0].i === of('S')[0].i && of('E')[0].i === of('W')[0].i
}

const nb4 = (n: number, i: number) => {
  const r = Math.floor(i / n), c = i % n, out: number[] = []
  if (r > 0) out.push(i - n)
  if (r < n - 1) out.push(i + n)
  if (c > 0) out.push(i - 1)
  if (c < n - 1) out.push(i + 1)
  return out
}
const nb8 = (n: number, i: number) => {
  const r = Math.floor(i / n), c = i % n, out: number[] = []
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue
    const rr = r + dr, cc = c + dc
    if (rr >= 0 && cc >= 0 && rr < n && cc < n) out.push(rr * n + cc)
  }
  return out
}
const inRing = (n: number, i: number) => { const r = Math.floor(i / n), c = i % n; return r === 0 || c === 0 || r === n - 1 || c === n - 1 }

/** Interior cells next to a gate (where the road leaves the camp). */
function gateMouths(n: number, gates: readonly string[]): number[] {
  return gates.map(parseGate).map(g => g.side === 'N' ? g.i : g.side === 'S' ? (n - 1) * n + g.i : g.side === 'W' ? g.i * n : g.i * n + n - 1)
}

/** A clear straight line from cell i to the rock, along its row or column. */
export function seesRock(n: number, rock: readonly boolean[], cells: readonly Cell[], i: number): boolean {
  const r = Math.floor(i / n), c = i % n
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
    for (let k = 1; ; k++) {
      const rr = r + dr * k, c2 = c + dc * k
      if (rr < 0 || c2 < 0 || rr >= n || c2 >= n) return false
      const j = rr * n + c2
      if (rock[j]) return true
      if (isBuilding(cells[j])) return false
    }
  })
}

export interface RuleStatus { id: string; label: string; ok: boolean; bad: number[] }
export interface Evaluation { rules: RuleStatus[]; rowOk: boolean[]; colOk: boolean[]; road: boolean[]; solved: boolean }

export function ruleLabels(rules: CampRules, names: Record<Item, string> = ROMAN): Record<string, string> {
  return {
    clues: 'Buildings in each row and column match the numbers',
    stock: 'Every building is placed',
    gates: rules.gates === 'cross' ? 'Four gates: N–S on one road, E–W on another'
      : rules.gates === 'ns' ? 'Two gates, north and south, on one road'
      : rules.gates === 'south' ? 'One gate, in the south wall' : 'No gates',
    ground: rules.rock ? 'Nothing built on the rock' : rules.intervallum ? 'Nothing on the roads or in the intervallum by the wall' : 'Nothing built on the roads',
    tents: rules.tents === 'pairs' ? 'Tents stand in pairs side by side; pairs never touch' : `No two ${names.T.toLowerCase()}s touch, not even at a corner`,
    front: rules.front === 'N' ? 'Every tent’s door faces north onto open ground' : 'Every tent’s door faces south onto open ground',
    hq: rules.hq === 'crossing' ? `${names.P} at a corner of the crossroads`
      : rules.hq === 'road-end' ? `${names.P} at the north end of the road, in the northern half`
      : `${names.P} touches the rock`,
    granary: rules.granary === 'by-hq' ? `Granary beside the ${names.P.toLowerCase()}` : 'Granary beside a gate',
    horses: 'Horse lines beside a road',
    'road-tents': `Every ${names.T.toLowerCase()} touches the road`,
    sight: 'Every tent sees the rock along its row or column',
  }
}

/** Check a board against the camp's rules. */
export function evaluate(camp: Pick<Camp, 'n' | 'rules' | 'rock' | 'rowClue' | 'colClue' | 'stock'>, cells: readonly Cell[], gates: readonly string[]): Evaluation {
  const { n, rules, rock } = camp
  const N = n * n
  const road = roadsFrom(n, rules, gates, cells)
  const labels = ruleLabels(rules)
  const out: RuleStatus[] = []
  const add = (id: string, bad: number[], ok = bad.length === 0) => out.push({ id, label: labels[id], ok, bad })
  const rc = Array(n).fill(0), cc = Array(n).fill(0)
  cells.forEach((v, i) => { if (isBuilding(v)) { rc[Math.floor(i / n)]++; cc[i % n]++ } })
  const rowOk = rc.map((v, r) => v === camp.rowClue[r]), colOk = cc.map((v, c) => v === camp.colClue[c])
  add('clues', [], rowOk.every(Boolean) && colOk.every(Boolean))
  const count = (t: Item) => cells.filter(v => v === t).length
  add('stock', [], (['T', 'P', 'G', 'H'] as Item[]).every(t => count(t) === camp.stock[t]))
  if (rules.gates !== 'none') add('gates', [], gatesOk(n, rules, gates))
  const groundBad: number[] = []
  for (let i = 0; i < N; i++) if (isBuilding(cells[i]) && (road[i] || rock[i] || (rules.intervallum && inRing(n, i)))) groundBad.push(i)
  add('ground', groundBad)
  const tents = cells.map((v, i) => (v === 'T' ? i : -1)).filter(i => i >= 0)
  const tentBad: number[] = []
  for (const i of tents) {
    const touching = nb8(n, i).filter(j => cells[j] === 'T')
    if (rules.tents === 'apart') { if (touching.length) tentBad.push(i) }
    else {
      const side = touching.filter(j => Math.floor(j / n) === Math.floor(i / n) && Math.abs(j - i) === 1)
      if (touching.length !== 1 || side.length !== 1) tentBad.push(i)
    }
  }
  add('tents', tentBad)
  if (rules.front) {
    const bad = tents.filter(i => {
      const r = Math.floor(i / n), f = rules.front === 'N' ? r - 1 : r + 1
      return f < 0 || f >= n || isBuilding(cells[f * n + (i % n)])
    })
    add('front', bad)
  }
  const ps = cells.map((v, i) => (v === 'P' ? i : -1)).filter(i => i >= 0)
  if (rules.hq) {
    let ok = ps.length === 1
    if (ok) {
      const p = ps[0], pr = Math.floor(p / n), pc = p % n
      if (rules.hq === 'crossing') {
        const set = new Set(gates)
        const roadCols = Array.from({ length: n }, (_, c) => c).filter(c => set.has(gateKey('N', c)) && set.has(gateKey('S', c)))
        const roadRows = Array.from({ length: n }, (_, r) => r).filter(r => set.has(gateKey('W', r)) && set.has(gateKey('E', r)))
        ok = roadRows.some(r => Math.abs(r - pr) === 1) && roadCols.some(c => Math.abs(c - pc) === 1)
      } else if (rules.hq === 'road-end') {
        ok = gates.length === 1 && parseGate(gates[0]).side === 'S' && parseGate(gates[0]).i === pc && pr < n / 2 && road[(pr + 1) * n + pc]
      } else ok = nb4(n, p).some(j => rock[j])
    }
    add('hq', ok ? [] : ps, ok)
  }
  if (rules.granary) {
    const gsCells = cells.map((v, i) => (v === 'G' ? i : -1)).filter(i => i >= 0)
    const mouths = new Set(gateMouths(n, gates))
    const bad = gsCells.filter(i => rules.granary === 'by-hq' ? !nb4(n, i).some(j => cells[j] === 'P') : !nb4(n, i).some(j => mouths.has(j) && road[j]))
    add('granary', bad, bad.length === 0 && gsCells.length === camp.stock.G)
  }
  if (rules.horses) {
    const bad = cells.map((v, i) => (v === 'H' ? i : -1)).filter(i => i >= 0 && !nb4(n, i).some(j => road[j]))
    add('horses', bad)
  }
  if (rules.tentsTouchRoad) add('road-tents', tents.filter(i => !nb4(n, i).some(j => road[j])))
  if (rules.rock) {
    add('sight', tents.filter(i => !seesRock(n, rock, cells, i)))
  }
  return { rules: out, rowOk, colOk, road, solved: out.every(r => r.ok) }
}

// ── Solver ────────────────────────────────────────────────────────────────────

interface Layout { gates: string[]; road: boolean[]; hqAt: number | null }

function layoutsFor(camp: Camp): Layout[] {
  const { n, rules } = camp
  const out: Layout[] = []
  const none: Cell[] = Array(n * n).fill(null)
  const okGiven = (gates: string[]) => camp.givenGates.every(g => gates.includes(g))
  if (rules.gates === 'none') out.push({ gates: [], road: Array(n * n).fill(false), hqAt: null })
  else if (rules.gates === 'cross') {
    for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) {
      if (camp.rowClue[r] || camp.colClue[c]) continue
      const gates = [gateKey('N', c), gateKey('S', c), gateKey('W', r), gateKey('E', r)]
      if (okGiven(gates)) out.push({ gates, road: roadsFrom(n, rules, gates, none), hqAt: null })
    }
  } else if (rules.gates === 'ns') {
    for (let c = 0; c < n; c++) {
      if (camp.colClue[c]) continue
      const gates = [gateKey('N', c), gateKey('S', c)]
      if (okGiven(gates)) out.push({ gates, road: roadsFrom(n, rules, gates, none), hqAt: null })
    }
  } else {
    for (let c = 0; c < n; c++) for (let pr = 0; pr < n / 2; pr++) {
      if (!camp.colClue[c]) continue
      const gates = [gateKey('S', c)]
      if (!okGiven(gates)) continue
      const cells = [...none]; cells[pr * n + c] = 'P'
      out.push({ gates, road: roadsFrom(n, rules, gates, cells), hqAt: pr * n + c })
    }
  }
  return out
}

export interface Solved { cells: Cell[]; gates: string[] }

/**
 * Every camp (up to `cap`) that fits the clues, givens and rules.  A
 * backtracking search over road layouts, then over the cells in reading
 * order, with only sound pruning; each leaf is accepted by `evaluate`, the
 * same check the game uses.
 */
export function solveCamp(camp: Camp, cap = 2, budget = 400_000): { solutions: Solved[]; exhausted: boolean } {
  const { n, rules, rock } = camp
  const N = n * n
  const solutions: Solved[] = []
  let nodes = 0
  for (const L of layoutsFor(camp)) {
    const blocked = Array.from({ length: N }, (_, i) => L.road[i] || rock[i] || (rules.intervallum && inRing(n, i)))
    if (camp.given.some((g, i) => isBuilding(g as Cell) && blocked[i] && i !== L.hqAt)) continue
    if (L.hqAt !== null && camp.given[L.hqAt] !== undefined && camp.given[L.hqAt] !== 'P') continue
    const mouths = new Set(gateMouths(n, L.gates))
    const nearRoad = Array.from({ length: N }, (_, i) => nb4(n, i).some(j => L.road[j]))
    const nearMouth = Array.from({ length: N }, (_, i) => nb4(n, i).some(j => mouths.has(j) && L.road[j]))
    const crossing = (() => {
      if (rules.hq !== 'crossing') return -1
      const c = Number(L.gates[0].slice(1)), r = Number(L.gates[2].slice(1))
      return r * n + c
    })()
    const pCand = Array.from({ length: N }, (_, i) => {
      if (blocked[i] && i !== L.hqAt) return false
      if (rules.hq === 'crossing') { const r = Math.floor(i / n), c = i % n, r0 = Math.floor(crossing / n), c0 = crossing % n; return Math.abs(r - r0) === 1 && Math.abs(c - c0) === 1 }
      if (rules.hq === 'road-end') return i === L.hqAt
      if (rules.hq === 'rock') return nb4(n, i).some(j => rock[j])
      return false
    })
    const grid: Cell[] = Array(N).fill(null)
    const rowLeft = [...camp.rowClue], colLeft = [...camp.colClue]
    const left = { ...camp.stock }
    let pAt = -1
    const dfs = (i: number): boolean => {
      if (++nodes > budget) return true
      if (i === N) {
        if (left.T || left.P || left.G || left.H) return false
        if (evaluate(camp, grid, L.gates).solved) {
          solutions.push({ cells: [...grid], gates: [...L.gates] })
          if (solutions.length >= cap) return true
        }
        return false
      }
      const r = Math.floor(i / n), c = i % n
      const opts: Cell[] = []
      const g = camp.given[i]
      const forcedP = i === L.hqAt
      if (g !== undefined) opts.push(g === 'X' ? null : g)
      else if (forcedP) opts.push('P')
      else {
        opts.push(null)
        if (!blocked[i]) {
          if (left.T) opts.push('T')
          if (left.P && pCand[i]) opts.push('P')
          if (left.G && (rules.granary === 'by-gate' ? nearMouth[i] : true)) opts.push('G')
          if (left.H && nearRoad[i]) opts.push('H')
        }
      }
      for (const v of opts) {
        if (forcedP && v !== 'P') continue
        if (v !== null) {
          if (left[v] <= 0 || rowLeft[r] <= 0 || colLeft[c] <= 0) continue
          if (blocked[i] && !forcedP) continue
          if (v === 'P' && !pCand[i]) continue
          if (rules.front === 'S' && r > 0 && grid[i - n] === 'T') continue
          if (v === 'G' && rules.granary === 'by-hq' && pAt >= 0 && !nb4(n, i).includes(pAt)) continue
          if (v === 'T') {
            const up = [r > 0 && c > 0 ? i - n - 1 : -1, r > 0 ? i - n : -1, r > 0 && c < n - 1 ? i - n + 1 : -1]
            if (up.some(j => j >= 0 && grid[j] === 'T')) continue
            if (rules.tents === 'apart' && c > 0 && grid[i - 1] === 'T') continue
            if (rules.tents === 'pairs' && c > 1 && grid[i - 1] === 'T' && grid[i - 2] === 'T') continue
            if (rules.front === 'N' && (r === 0 || isBuilding(grid[i - n]))) continue
            if (rules.front === 'S' && r === n - 1) continue
            if (rules.tentsTouchRoad && !nearRoad[i]) continue
          }
        }
        grid[i] = v
        if (v !== null) { left[v]--; rowLeft[r]--; colLeft[c]--; if (v === 'P') pAt = i }
        let ok = rowLeft[r] <= n - 1 - c && colLeft[c] <= n - 1 - r
        if (ok && c === n - 1 && rules.tents === 'pairs') {
          // Every tent in a finished row has its partner beside it.
          for (let k = 0; k < n && ok; k++) {
            const j = r * n + k
            if (grid[j] !== 'T') continue
            const side = (k > 0 && grid[j - 1] === 'T' ? 1 : 0) + (k < n - 1 && grid[j + 1] === 'T' ? 1 : 0)
            if (side !== 1) ok = false
          }
        }
        if (ok && dfs(i + 1)) { grid[i] = null; return true }
        if (v !== null) { left[v]++; rowLeft[r]++; colLeft[c]++; if (v === 'P') pAt = -1 }
        grid[i] = null
      }
      return false
    }
    if (dfs(0)) {
      if (nodes > budget) return { solutions, exhausted: true }
      if (solutions.length >= cap) break
    }
  }
  return { solutions, exhausted: nodes > budget }
}

// ── Generator ─────────────────────────────────────────────────────────────────

const ROCKS: [number, number][][] = [
  [[0, 0], [0, 1], [1, 0], [1, 1]],
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1]],
]

function layOut(rules: CampRules, t: Tier, rng: Rng): { cells: Cell[]; gates: string[]; rock: boolean[] } | null {
  const { n } = t
  const N = n * n
  const rand = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))
  const rock = Array(N).fill(false)
  if (rules.rock) {
    const shape = ROCKS[Math.floor(rng() * ROCKS.length)]
    const h = Math.max(...shape.map(s => s[0])) + 1, w = Math.max(...shape.map(s => s[1])) + 1
    const r0 = rand(Math.max(1, Math.floor((n - h) / 2) - 1), Math.min(n - h - 1, Math.ceil((n - h) / 2)))
    const c0 = rand(Math.max(1, Math.floor((n - w) / 2) - 1), Math.min(n - w - 1, Math.ceil((n - w) / 2)))
    for (const [dr, dc] of shape) rock[(r0 + dr) * n + c0 + dc] = true
  }
  const cells: Cell[] = Array(N).fill(null)
  let gates: string[] = []
  const lo = rules.intervallum ? 2 : 1
  if (rules.gates === 'cross') { const c = rand(lo, n - 1 - lo), r = rand(lo, n - 1 - lo); gates = [gateKey('N', c), gateKey('S', c), gateKey('W', r), gateKey('E', r)] }
  else if (rules.gates === 'ns') gates = (c => [gateKey('N', c), gateKey('S', c)])(rand(1, n - 2))
  else if (rules.gates === 'south') {
    const c = rand(1, n - 2), pr = rand(0, Math.ceil(n / 2) - 1)
    gates = [gateKey('S', c)]
    cells[pr * n + c] = 'P'
  }
  const road = () => roadsFrom(n, rules, gates, cells)
  const rd = road()
  const blocked = (i: number) => rd[i] || rock[i] || (rules.intervallum && inRing(n, i)) || cells[i] !== null
  const pickFrom = (cands: number[]) => (cands.length ? cands[Math.floor(rng() * cands.length)] : -1)
  const all = Array.from({ length: N }, (_, i) => i)
  // Headquarters.
  if (rules.hq === 'crossing') {
    const c0 = Number(gates[0].slice(1)), r0 = Number(gates[2].slice(1))
    const p = pickFrom([[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dr, dc]) => (r0 + dr) * n + c0 + dc).filter(i => !blocked(i)))
    if (p < 0) return null
    cells[p] = 'P'
  } else if (rules.hq === 'rock') {
    const p = pickFrom(all.filter(i => !blocked(i) && nb4(n, i).some(j => rock[j])))
    if (p < 0) return null
    cells[p] = 'P'
  }
  if (rules.granary) {
    const mouths = new Set(gateMouths(n, gates))
    const g = pickFrom(all.filter(i => !blocked(i) && (rules.granary === 'by-hq' ? nb4(n, i).some(j => cells[j] === 'P') : nb4(n, i).some(j => mouths.has(j) && rd[j]))))
    if (g < 0) return null
    cells[g] = 'G'
  }
  for (let k = 0; k < t.horses; k++) {
    const h = pickFrom(all.filter(i => !blocked(i) && nb4(n, i).some(j => rd[j])))
    if (h < 0) return null
    cells[h] = 'H'
  }
  // Tents, by random greedy placement under the local rules.
  const tentOk = (i: number) => {
    if (blocked(i)) return false
    const r = Math.floor(i / n), c = i % n
    if (rules.front) {
      const f = rules.front === 'N' ? r - 1 : r + 1
      if (f < 0 || f >= n || isBuilding(cells[f * n + c])) return false
      // Nothing may stand in front of a tent already pitched behind this one.
      const b = rules.front === 'N' ? r + 1 : r - 1
      if (b >= 0 && b < n && cells[b * n + c] === 'T') return false
    }
    if (rules.tentsTouchRoad && !nb4(n, i).some(j => rd[j])) return false
    if (rules.rock && !seesRock(n, rock, cells, i)) return false
    return true
  }
  const order = shuffle(all, rng)
  let placed = 0
  for (const i of order) {
    if (placed >= t.tents) break
    if (rules.tents === 'pairs') {
      const j = i + 1
      if (i % n === n - 1 || !tentOk(i) || !tentOk(j)) continue
      if ([...nb8(n, i), ...nb8(n, j)].some(k => k !== i && k !== j && cells[k] === 'T')) continue
      cells[i] = 'T'; cells[j] = 'T'; placed += 2
    } else {
      if (!tentOk(i) || nb8(n, i).some(k => cells[k] === 'T')) continue
      cells[i] = 'T'; placed++
    }
  }
  if (placed < t.tents) return null
  return { cells, gates, rock }
}

export function generate(configId: string, d: Difficulty, seed: number): Camp {
  const cfg = CONFIGS[configId] ?? CONFIGS.polybius
  const rules: CampRules = cfg
  const t = tierFor(rules, d, cfg.pace)
  const rng = mulberry32(seed ^ hashString(`castrum:${configId}:${d}`))
  for (let attempt = 0; ; attempt++) {
    const lay = layOut(rules, t, rng)
    if (!lay) continue
    const { n } = t
    const stock: Record<Item, number> = { T: 0, P: 0, G: 0, H: 0 }
    lay.cells.forEach(v => { if (v) stock[v]++ })
    const rowClue = Array(n).fill(0), colClue = Array(n).fill(0)
    lay.cells.forEach((v, i) => { if (v) { rowClue[Math.floor(i / n)]++; colClue[i % n]++ } })
    const camp: Camp = {
      n, rules, rock: lay.rock, rowClue, colClue, stock,
      given: Array(n * n).fill(undefined), givenGates: [],
      solution: { cells: lay.cells, gates: lay.gates }, unique: false,
    }
    if (!evaluate(camp, lay.cells, lay.gates).solved) continue
    // Give cells until the clues pin down this camp alone.
    for (let k = 0; k < 40; k++) {
      const { solutions, exhausted } = solveCamp(camp, 2, 150_000)
      const other = solutions.find(s => s.cells.some((v, i) => v !== lay.cells[i]) || s.gates.join() !== lay.gates.join())
      if (!other && !exhausted) { camp.unique = true; break }
      const diffGate = other ? lay.gates.find(g => !other.gates.includes(g)) : undefined
      if (diffGate && rng() < 0.5) { camp.givenGates.push(diffGate); continue }
      const diffs = other
        ? lay.cells.map((v, i) => (v !== other.cells[i] && camp.given[i] === undefined ? i : -1)).filter(i => i >= 0)
        : lay.cells.map((v, i) => (v && camp.given[i] === undefined ? i : -1)).filter(i => i >= 0)
      if (!diffs.length) { if (diffGate) { camp.givenGates.push(diffGate); continue } break }
      // Prefer giving a building over open ground.
      const builds = diffs.filter(i => lay.cells[i])
      const pool = builds.length && rng() < 0.7 ? builds : diffs
      const i = pool[Math.floor(rng() * pool.length)]
      camp.given[i] = lay.cells[i] ?? 'X'
    }
    if (camp.unique || attempt > 30) return camp
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

const ICON: Record<Item, string> = { T: '⛺', P: '🏛', G: '🌾', H: '🐎' }
const HAN_ICON: Record<Item, string> = { T: '⛺', P: '帥', G: '🌾', H: '🐎' }

type Tool = Item | 'X'

export default function CastrumGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'polybius')
  const id = CONFIGS[configId] ? configId : 'polybius'
  const camp = useMemo(() => generate(id, difficulty, seed), [id, difficulty, seed])
  const { n } = camp
  const tier = tierFor(camp.rules, difficulty, CONFIGS[id].pace)
  const icons = id === 'han' ? HAN_ICON : ICON
  const [cells, setCells] = useState<(Cell | 'X')[]>(() => camp.given.map(g => g ?? null))
  const [gates, setGates] = useState<string[]>(() => [...camp.givenGates])
  const items = (['T', 'P', 'G', 'H'] as Item[]).filter(t => camp.stock[t] > 0)
  const [tool, setTool] = useState<Tool>('T')
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds: tier.seconds, running: !settled, onExpire: () => lose('The camp was not laid out before nightfall') })

  const board = cells.map(v => (v === 'X' ? null : v)) as Cell[]
  const ev = evaluate(camp, board, gates)
  const used = (t: Item) => board.filter(v => v === t).length
  const gateSlots = camp.rules.gates !== 'none'

  const check = (nextCells: (Cell | 'X')[], nextGates: string[]) => {
    const e = evaluate(camp, nextCells.map(v => (v === 'X' ? null : v)) as Cell[], nextGates)
    if (e.solved) win()
  }

  const tapCell = (i: number) => {
    if (settled || camp.given[i] !== undefined) return
    const next = [...cells]
    if (next[i] !== null) next[i] = null
    else {
      if (tool !== 'X' && used(tool) >= camp.stock[tool]) return
      next[i] = tool
    }
    setCells(next)
    check(next, gates)
  }

  const tapGate = (k: string) => {
    if (settled || !gateSlots || camp.givenGates.includes(k)) return
    const next = gates.includes(k) ? gates.filter(g => g !== k) : [...gates, k]
    setGates(next)
    check(cells, next)
  }

  const badCells = new Set(ev.rules.filter(r => !r.ok).flatMap(r => r.bad))
  const cols = n + 3 // wall, n cells, wall, clue
  const sideOk = (s: 'N' | 'S' | 'E' | 'W') => camp.rules.gates === 'cross' || (camp.rules.gates === 'ns' && (s === 'N' || s === 'S')) || (camp.rules.gates === 'south' && s === 'S')

  const wallCell = (key: string, k: string | null) => {
    if (!k) return <div key={key} className="aspect-square bg-[#7a6040]" />
    const on = gates.includes(k)
    const allowed = sideOk(k[0] as 'N')
    return (
      <button key={key} type="button" data-gate={k} onClick={() => tapGate(k)} disabled={settled || !allowed}
        aria-label={`wall ${k}${on ? ' gate' : ''}`}
        className={`aspect-square flex items-center justify-center text-[10px] leading-none
          ${on ? 'bg-[#e9dcb8] border-2 border-[#7a6040]' : 'bg-[#8a6d48]'} ${camp.givenGates.includes(k) ? 'ring-1 ring-inset ring-ink' : ''}`}
        style={{ touchAction: 'manipulation' }}>
        {on ? '🚪' : ''}
      </button>
    )
  }

  const grid: React.ReactNode[] = []
  for (let gr = 0; gr < n + 3; gr++) for (let gc = 0; gc < cols; gc++) {
    const key = `${gr},${gc}`
    const r = gr - 1, c = gc - 1
    if (gr === n + 2) {
      // Column clues under the south wall.
      grid.push(c >= 0 && c < n
        ? <div key={key} data-colclue={c} className={`flex items-center justify-center text-[11px] font-bold ${ev.colOk[c] ? 'text-emerald-700' : 'text-ink-2'}`}>{camp.colClue[c]}</div>
        : <div key={key} />)
      continue
    }
    if (gc === n + 2) {
      grid.push(r >= 0 && r < n
        ? <div key={key} data-rowclue={r} className={`flex items-center justify-center text-[11px] font-bold ${ev.rowOk[r] ? 'text-emerald-700' : 'text-ink-2'}`}>{camp.rowClue[r]}</div>
        : <div key={key} />)
      continue
    }
    const wallR = gr === 0 || gr === n + 1, wallC = gc === 0 || gc === n + 1
    if (wallR && wallC) { grid.push(wallCell(key, null)); continue }
    if (wallR) { grid.push(wallCell(key, gateKey(gr === 0 ? 'N' : 'S', c))); continue }
    if (wallC) { grid.push(wallCell(key, gateKey(gc === 0 ? 'W' : 'E', r))); continue }
    const i = r * n + c
    const v = cells[i]
    const given = camp.given[i] !== undefined
    const ring = camp.rules.intervallum && inRing(n, i)
    const bg = camp.rock[i] ? 'bg-[#8c7b6b]' : ev.road[i] ? 'bg-[#d8c7a0]' : ring ? 'bg-[#a9b77a]' : 'bg-[#b9c78a]'
    grid.push(
      <button key={key} type="button" data-cell={i} data-item={v ?? undefined} onClick={() => tapCell(i)} disabled={settled || camp.rock[i]}
        aria-label={`plot ${r + 1},${c + 1}${v ? ` ${v}` : ''}`}
        className={`aspect-square flex items-center justify-center leading-none border-[0.5px] border-black/10 ${bg}
          ${badCells.has(i) ? 'ring-2 ring-inset ring-red-500' : ''} ${given ? 'font-black' : ''}`}
        style={{ fontSize: n <= 6 ? 20 : n <= 8 ? 16 : 14, touchAction: 'manipulation' }}>
        {camp.rock[i] ? '⛰' : v === 'X' ? <span className={`text-[10px] ${given ? 'text-ink' : 'text-ink-2/60'}`}>•</span> : v ? <span className={given ? 'opacity-100' : 'opacity-95'}>{icons[v]}</span> : ''}
        {given && v && v !== 'X' && <span className="sr-only">given</span>}
      </button>,
    )
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-ink-2 text-[11px] font-bold">{cfg.rule}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">{n}×{n}</p>
          <p>{camp.rules.gates === 'none' ? 'no gates' : `${camp.rules.gates === 'cross' ? 4 : camp.rules.gates === 'ns' ? 2 : 1} gate${camp.rules.gates === 'south' ? '' : 's'}`}</p>
        </div>
      </div>

      <TimerBar remaining={timer.remaining} total={timer.total} />

      <div className="w-full max-w-[400px] mx-auto rounded-lg overflow-hidden" data-testid="castrum-board">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{grid}</div>
      </div>

      {!settled && (
        <div className="flex flex-wrap gap-1.5 justify-center w-full max-w-[400px] mx-auto">
          {items.map(t => (
            <button key={t} type="button" data-tool={t} onClick={() => setTool(t)} aria-pressed={tool === t}
              className={`h-10 px-2 rounded-lg border text-xs font-bold flex items-center gap-1 ${tool === t ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
              <span className="text-base leading-none">{icons[t]}</span>{cfg.names[t]} <span className="tabular-nums opacity-80">{camp.stock[t] - used(t)}</span>
            </button>
          ))}
          <button type="button" data-tool="X" onClick={() => setTool('X')} aria-pressed={tool === 'X'}
            className={`h-10 px-2 rounded-lg border text-xs font-bold ${tool === 'X' ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
            • Open ground
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-0.5 w-full max-w-[400px] mx-auto text-[11px] leading-snug" data-testid="castrum-rules">
        {ev.rules.map(r => (
          <li key={r.id} data-rule={r.id} data-ok={r.ok ? 'true' : 'false'} className={r.ok ? 'text-emerald-700' : 'text-ink-2'}>
            {r.ok ? '✓' : '○'} {ruleLabels(camp.rules, cfg.names)[r.id]}
          </li>
        ))}
      </ul>
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : gateSlots ? 'Tap the wall to place a gate; pick a building and tap a plot to place it, tap again to clear. Bold pieces are given.' : 'Pick a building and tap a plot to place it, tap again to clear. Bold pieces are given.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The camp is laid out!" loseTitle="Night fell on an open camp" />
    </div>
  )
}
