import { useMemo, useState, useCallback } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, shuffle, pick, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Elements: combine two things on a bench to make a third, toward a target.
// Every reaction on every bench is real chemistry.
//
// Four benches, four rule systems (not just four name lists):
//   jabir       The medieval laboratory. Combine two substances, or put one
//               in the furnace or the alembic. What you make stays on the
//               bench. A scroll lists the steps, shuffled and partly smudged
//               at higher tiers, with decoy recipes mixed in.
//   reactivity  No recipes at all, only the reactivity series. A metal pushes
//               a less reactive one out of its salt; metals above hydrogen
//               dissolve in dilute oil of vitriol giving hydrogen; hydrogen
//               takes the oxygen from hot copper or lead oxide; heat drives
//               carbon dioxide out of a carbonate. Every reaction uses up its
//               reagents.
//   lavoisier   Conservation of mass. The bench is a limited stock: every
//               reaction consumes its reagents, and some compounds must be
//               heated apart to free what is locked inside them.
//   mendeleev   The periodic table with gaps. Two elements that flank a gap
//               (above and below, or left and right) predict it; some gaps can
//               only be reached through other gaps.
//
// Every action uses one attempt. The budget is the solver's shortest chain
// plus slack; the game is lost the moment the target can no longer be
// reached in the attempts left (checked exactly by BFS).
//
//   tier  chain   slack  hints  scroll                         ≈ time
//   D1    2       +4     2      in order, all shown            ~1 min
//   D2    3       +3     1      shuffled, 1 decoy              ~1.5 min
//   D3    4       +3     0      shuffled, 1 decoy, ⅓ smudged   ~2 min
//   D4    5–6     +2     0      shuffled, 2 decoys, ½ smudged  ~3 min
//
// Reactivity chains stop at four real steps, so that bench runs 2 / 3 / 3–4 / 4
// with slack 4 / 3 / 2 / 1.

export type Kind = 'jabir' | 'reactivity' | 'lavoisier' | 'mendeleev'

interface AlchemyConfig {
  title: string
  intro: string
  fact: string
  kind: Kind
}

export const CONFIGS: Record<string, AlchemyConfig> = {
  jabir: {
    title: 'Jabir’s Laboratory, Kufa',
    intro: 'Combine two substances, or put one in the furnace or the alembic, to make a new one. Everything you make stays on your bench. The scroll lists the steps — but at higher tiers it is shuffled, smudged and padded with false leads.',
    fact: 'The Jabirian writings (8th–10th century) describe distillation, crystallisation and sublimation in detail. Later Latin works signed “Geber” give the first clear recipes for aqua fortis (nitric acid) and aqua regia, the mixture with sal ammoniac that dissolves gold.',
    kind: 'jabir',
  },
  'wet-copper': {
    title: 'Wet Copper, Song China',
    intro: 'No recipe book here — only the reactivity series. A metal pushes a less reactive metal out of its salt. Metals above hydrogen dissolve in oil of vitriol and give off hydrogen. Hydrogen takes the oxygen from hot copper or lead oxide. Heat drives CO₂ out of a carbonate. Every reaction uses up what goes in.',
    fact: 'Shen Kuo’s Dream Pool Essays (1088) tell of a bitter spring whose water, boiled down, gives blue vitriol (copper sulfate), and of an iron pan that turned to copper when the water was boiled in it. Iron is more reactive than copper and takes its place in the salt. Song officials made copper this way on a large scale from the 11th century.',
    kind: 'reactivity',
  },
  lavoisier: {
    title: 'Lavoisier’s Balance, Paris 1789',
    intro: 'Nothing is lost, nothing is created. Every reaction uses up its reagents, so count your stock. Heat a compound alone to split it into what it is made of.',
    fact: 'In his Traité élémentaire de chimie (1789) Antoine Lavoisier stated the conservation of mass and listed 33 elements, including oxygen and hydrogen, which he had named.',
    kind: 'lavoisier',
  },
  mendeleev: {
    title: 'Mendeleev’s Gaps, St Petersburg 1871',
    intro: 'Tap two known elements that flank a gap — above and below it, or left and right — to predict the missing one. Some gaps hide behind other gaps. Reach the marked one.',
    fact: 'In 1871 Dmitri Mendeleev predicted eka-aluminium, eka-boron and eka-silicon from their neighbours; gallium (1875), scandium (1879) and germanium (1886) matched his forecasts.',
    kind: 'mendeleev',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Books ─────────────────────────────────────────────────────────────────────

export interface Item { id: string; name: string; icon: string; weight?: number; row?: number; col?: number }
/** A combination (a + b) or, with no `b`, heating `a` apart. */
export interface Recipe { a: string; b?: string; out: string[] }
export interface Book { kind: Kind; mode: 'set' | 'stock'; items: Record<string, Item>; recipes: Recipe[]; harmful: Set<string> }

export const pairKey = (a: string, b: string) => (a < b ? `${a}+${b}` : `${b}+${a}`)
const splitKey = (a: string) => `${a}>`

function itemsOf(list: [string, string, string][]): Record<string, Item> {
  const out: Record<string, Item> = {}
  for (const [id, name, icon] of list) out[id] = { id, name, icon }
  return out
}
const rx = (list: [string, string, string | string[]][]): Recipe[] =>
  list.map(([a, b, o]) => ({ a, b: b || undefined, out: Array.isArray(o) ? o : [o] }))

// Real substances of the medieval laboratory, with their old names. Two
// tools take part like reagents: the furnace (roasting, calcining) and the
// alembic (distilling); water leaches green vitriol out of weathered
// pyrite. There is no transmutation of metals here.
const JABIR: Book = {
  kind: 'jabir', mode: 'set', harmful: new Set(),
  items: itemsOf([
    ['furnace', 'Furnace', '🔥'], ['alembic', 'Alembic', '⚗️'], ['water', 'Water', '💧'], ['pyrite', 'Pyrite', '🪨'],
    ['wine', 'Wine', '🍷'], ['vinegar', 'Vinegar', '🫗'], ['salt', 'Common Salt', '🧂'], ['saltpetre', 'Saltpetre', '❄️'],
    ['greenvit', 'Green Vitriol', '💚'], ['salammoniac', 'Sal Ammoniac', '🤍'], ['sulfur', 'Sulfur', '🟡'], ['mercury', 'Mercury', '☿'],
    ['lead', 'Lead', '⚫'], ['copper', 'Copper', '🟤'], ['silver', 'Silver', '🥈'], ['gold', 'Gold', '🥇'], ['tin', 'Tin', '🥫'],
    ['spirit', 'Spirit of Wine', '🍶'], ['strongvinegar', 'Distilled Vinegar', '🧴'], ['vitriol', 'Oil of Vitriol', '🧪'], ['colcothar', 'Colcothar', '🟥'],
    ['aquafortis', 'Aqua Fortis', '🟠'], ['spiritsalt', 'Spirit of Salt', '💨'], ['glauber', 'Glauber’s Salt', '🧊'], ['aquaregia', 'Aqua Regia', '🟨'],
    ['goldsol', 'Gold Dissolved', '✨'], ['purple', 'Purple of Cassius', '🟣'], ['lunar', 'Lunar Caustic', '⚪'], ['hornsilver', 'Horn Silver', '🦴'],
    ['coppernitrate', 'Copper Nitrate', '🔷'], ['nitrous', 'Nitrous Fumes', '🟫'], ['bluevit', 'Blue Vitriol', '🔵'], ['sulfurfumes', 'Sulfur Fumes', '🌫️'],
    ['cinnabar', 'Cinnabar', '🔴'], ['mercurycalx', 'Red Calx of Mercury', '🔺'], ['litharge', 'Litharge', '🟧'], ['sugarlead', 'Sugar of Lead', '🍬'],
    ['verdigris', 'Verdigris', '🟩'], ['whitelead', 'White Lead', '⬜'],
  ]),
  recipes: rx([
    ['wine', 'alembic', 'spirit'], ['vinegar', 'alembic', 'strongvinegar'],
    ['pyrite', 'water', 'greenvit'], ['greenvit', 'furnace', ['vitriol', 'colcothar']],
    ['saltpetre', 'vitriol', 'aquafortis'], ['salt', 'vitriol', ['spiritsalt', 'glauber']],
    ['aquafortis', 'salammoniac', 'aquaregia'], ['aquafortis', 'spiritsalt', 'aquaregia'],
    ['aquaregia', 'gold', 'goldsol'], ['goldsol', 'tin', 'purple'],
    ['aquafortis', 'silver', 'lunar'], ['lunar', 'salt', 'hornsilver'],
    ['aquafortis', 'copper', ['coppernitrate', 'nitrous']], ['vitriol', 'copper', ['bluevit', 'sulfurfumes']],
    ['mercury', 'sulfur', 'cinnabar'], ['cinnabar', 'furnace', ['mercury', 'sulfurfumes']], ['sulfur', 'furnace', 'sulfurfumes'],
    ['mercury', 'furnace', 'mercurycalx'], ['lead', 'furnace', 'litharge'],
    ['litharge', 'vinegar', 'sugarlead'], ['litharge', 'strongvinegar', 'sugarlead'],
    ['copper', 'vinegar', 'verdigris'], ['lead', 'vinegar', 'whitelead'],
  ]),
}
const JABIR_TOOLS = ['furnace', 'alembic', 'water']
const JABIR_RAW = ['wine', 'vinegar', 'salt', 'saltpetre', 'pyrite', 'salammoniac', 'sulfur', 'mercury', 'lead', 'copper', 'silver', 'gold', 'tin']

// The reactivity series, most reactive first. Salts that cannot form in water
// are left out (lead sulfate is insoluble and coats the metal; tin nitrate
// does not keep), so those displacements simply do not happen.
export const SERIES = ['Mg', 'Zn', 'Fe', 'Sn', 'Pb', 'Cu', 'Hg']
const METAL_NAME: Record<string, string> = { Mg: 'Magnesium', Zn: 'Zinc', Fe: 'Iron', Sn: 'Tin', Pb: 'Lead', Cu: 'Copper', Hg: 'Mercury' }
const SULFATES = ['Mg', 'Zn', 'Fe', 'Sn', 'Cu', 'Hg']
const NITRATES = ['Mg', 'Zn', 'Fe', 'Pb', 'Cu', 'Hg']
/** Metals that dissolve in dilute acid (above hydrogen; lead stops at a skin of sulfate). */
const ABOVE_H = ['Mg', 'Zn', 'Fe', 'Sn']
const sub = (f: string) => f.replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)])

function buildReactivity(): Book {
  const items: Record<string, Item> = {}
  const add = (id: string, name: string) => { items[id] = { id, name, icon: sub(id) } }
  for (const m of SERIES) add(m, METAL_NAME[m])
  for (const m of SULFATES) add(`${m}SO4`, `${METAL_NAME[m]} sulfate`)
  for (const m of NITRATES) add(`${m}(NO3)2`, `${METAL_NAME[m]} nitrate`)
  add('H2SO4', 'Oil of vitriol (dilute)'); add('H2', 'Hydrogen'); add('H2O', 'Water'); add('CO2', 'Carbon dioxide')
  for (const m of ['Cu', 'Pb', 'Zn']) { add(`${m}O`, `${METAL_NAME[m]} oxide`); add(`${m}CO3`, `${METAL_NAME[m]} carbonate`) }
  items.CuSO4.name = 'Blue vitriol (copper sulfate)'
  const recipes: Recipe[] = []
  for (const [anion, metals] of [['SO4', SULFATES], ['(NO3)2', NITRATES]] as const) {
    for (const m of metals) for (const n of metals) {
      if (SERIES.indexOf(m) < SERIES.indexOf(n)) recipes.push({ a: m, b: `${n}${anion}`, out: [`${m}${anion}`, n] })
    }
  }
  for (const m of ABOVE_H) recipes.push({ a: m, b: 'H2SO4', out: [`${m}SO4`, 'H2'] })
  for (const m of ['Cu', 'Pb']) recipes.push({ a: 'H2', b: `${m}O`, out: [m, 'H2O'] })
  for (const m of ['Cu', 'Pb', 'Zn']) recipes.push({ a: `${m}CO3`, out: [`${m}O`, 'CO2'] })
  return { kind: 'reactivity', mode: 'stock', items, recipes, harmful: new Set() }
}
const REACTIVITY = buildReactivity()

const LAVOISIER: Book = {
  kind: 'lavoisier', mode: 'stock', harmful: new Set(),
  items: itemsOf([
    ['h', 'Hydrogen', '🎈'], ['o', 'Oxygen', '🫧'], ['c', 'Charcoal', '⬛'], ['s', 'Sulfur', '🟡'],
    ['hg', 'Mercury', '☿'], ['fe', 'Iron', '🔩'], ['az', 'Azote', '🌀'], ['lime', 'Lime', '⚪'],
    ['potash', 'Potash', '🧂'], ['air', 'Air', '🌬️'],
    ['water', 'Water', '💧'], ['fixed', 'Fixed Air', '☁️'], ['sfume', 'Sulfur Fumes', '💨'], ['vitriol', 'Oil of Vitriol', '🧪'],
    ['hgcalx', 'Mercury Calx', '🔴'], ['fecalx', 'Iron Calx', '🟥'], ['chalk', 'Chalk', '🪨'], ['soda', 'Soda Water', '🥤'],
    ['green', 'Green Vitriol', '💚'], ['gypsum', 'Gypsum', '🤍'], ['nitrous', 'Nitrous Air', '🟠'], ['fortis', 'Aqua Fortis', '⚗️'],
    ['saltpetre', 'Saltpetre', '❄️'], ['spirit', 'Spirit of Wine', '🍷'], ['alkali', 'Volatile Alkali', '👃'], ['salvol', 'Sal Volatile', '🫙'],
  ]),
  recipes: rx([
    ['h', 'o', 'water'], ['c', 'o', 'fixed'], ['s', 'o', 'sfume'], ['sfume', 'water', 'vitriol'],
    ['hg', 'o', 'hgcalx'], ['hg', 'air', ['hgcalx', 'az']], ['hgcalx', '', ['hg', 'o']], ['fe', 'o', 'fecalx'], ['fe', 'water', ['fecalx', 'h']],
    ['fecalx', 'c', ['fe', 'fixed']], ['fixed', 'lime', 'chalk'], ['chalk', '', ['lime', 'fixed']], ['fixed', 'water', 'soda'],
    ['vitriol', 'fe', ['green', 'h']], ['vitriol', 'chalk', ['gypsum', 'fixed']], ['az', 'o', 'nitrous'],
    ['nitrous', 'water', 'fortis'], ['fortis', 'potash', 'saltpetre'], ['spirit', 'o', ['water', 'fixed']],
    ['alkali', 'fixed', 'salvol'],
  ]),
}

// Mendeleev's short-form table, groups I–VII, series 2–7 (modern weights).
const TABLE: [string, number][][] = [
  [['Li', 6.9], ['Be', 9.0], ['B', 10.8], ['C', 12.0], ['N', 14.0], ['O', 16.0], ['F', 19.0]],
  [['Na', 23.0], ['Mg', 24.3], ['Al', 27.0], ['Si', 28.1], ['P', 31.0], ['S', 32.1], ['Cl', 35.5]],
  [['K', 39.1], ['Ca', 40.1], ['Sc', 45.0], ['Ti', 47.9], ['V', 50.9], ['Cr', 52.0], ['Mn', 54.9]],
  [['Cu', 63.5], ['Zn', 65.4], ['Ga', 69.7], ['Ge', 72.6], ['As', 74.9], ['Se', 79.0], ['Br', 79.9]],
  [['Rb', 85.5], ['Sr', 87.6], ['Y', 88.9], ['Zr', 91.2], ['Nb', 92.9], ['Mo', 96.0], ['Tc', 98]],
  [['Ag', 107.9], ['Cd', 112.4], ['In', 114.8], ['Sn', 118.7], ['Sb', 121.8], ['Te', 127.6], ['I', 126.9]],
]
export const ROWS = TABLE.length, COLS = 7

function buildTable(): Book {
  const items: Record<string, Item> = {}
  TABLE.forEach((row, r) => row.forEach(([sym, w], c) => { items[sym] = { id: sym, name: sym, icon: sym, weight: w, row: r, col: c } }))
  const at = (r: number, c: number) => TABLE[r]?.[c]?.[0]
  const recipes: Recipe[] = []
  TABLE.forEach((row, r) => row.forEach(([sym], c) => {
    if (at(r - 1, c) && at(r + 1, c)) recipes.push({ a: at(r - 1, c)!, b: at(r + 1, c)!, out: [sym] })
    if (at(r, c - 1) && at(r, c + 1)) recipes.push({ a: at(r, c - 1)!, b: at(r, c + 1)!, out: [sym] })
  }))
  return { kind: 'mendeleev', mode: 'set', items, recipes, harmful: new Set() }
}
const MENDELEEV = buildTable()

export const BOOKS: Record<Kind, Book> = { jabir: JABIR, reactivity: REACTIVITY, lavoisier: LAVOISIER, mendeleev: MENDELEEV }

// ── Rules ─────────────────────────────────────────────────────────────────────

export type State = Record<string, number>
export interface Move { a: string; b?: string }
export interface ScrollEntry { recipe: Recipe; mask?: 'a' | 'b'; decoy?: boolean }

export interface Puzzle {
  kind: Kind
  book: Book
  index: Map<string, Recipe>
  start: State
  target: string
  /** Items worth making on the way to the target. */
  relevant: Set<string>
  relRecipes: Recipe[]
  optimal: number
  budget: number
  solution: Move[]
  scroll: ScrollEntry[]
  hints: number
  /** Mendeleev: the cells that start empty. */
  gaps: string[]
}

export type ActKind = 'new' | 'known' | 'fail' | 'harmful' | 'missing'
export interface ActResult { state: State; cost: number; kind: ActKind; out: string[] }

const indexCache = new Map<Kind, Map<string, Recipe>>()
function indexOf(book: Book): Map<string, Recipe> {
  let m = indexCache.get(book.kind)
  if (!m) {
    m = new Map()
    for (const r of book.recipes) m.set(r.b === undefined ? splitKey(r.a) : pairKey(r.a, r.b), r)
    indexCache.set(book.kind, m)
  }
  return m
}

export function relevantFor(book: Book, target: string): Set<string> {
  const rel = new Set([target])
  for (let changed = true; changed;) {
    changed = false
    for (const r of book.recipes) {
      if (!r.out.some(o => rel.has(o))) continue
      for (const x of [r.a, r.b]) if (x && !rel.has(x)) { rel.add(x); changed = true }
    }
  }
  return rel
}

/** Apply one action (a + b, or heating `a` alone when b is undefined). */
export function act(p: Pick<Puzzle, 'book' | 'index'>, state: State, a: string, b?: string): ActResult {
  const { book, index } = p
  const stock = book.mode === 'stock'
  const has = (id: string, n = 1) => (state[id] ?? 0) >= n
  if (b === undefined ? !has(a) : a === b ? !has(a, stock ? 2 : 1) : !has(a) || !has(b)) {
    return { state, cost: 0, kind: 'missing', out: [] }
  }
  if (b !== undefined && book.harmful.has(pairKey(a, b))) return { state, cost: 2, kind: 'harmful', out: [] }
  const r = index.get(b === undefined ? splitKey(a) : pairKey(a, b))
  if (!r || (b === undefined && !stock)) return { state, cost: 1, kind: 'fail', out: [] }
  const next = { ...state }
  if (stock) {
    next[a]--
    if (b !== undefined) next[b]--
    for (const o of r.out) next[o] = (next[o] ?? 0) + 1
    return { state: next, cost: 1, kind: 'new', out: r.out }
  }
  const fresh = r.out.filter(o => !has(o))
  if (!fresh.length) return { state, cost: 1, kind: 'known', out: r.out }
  for (const o of fresh) next[o] = 1
  return { state: next, cost: 1, kind: 'new', out: fresh }
}

export const isWon = (p: Pick<Puzzle, 'target'>, s: State) => (s[p.target] ?? 0) >= 1

/**
 * Shortest list of actions from `state` to the target, by BFS over bench
 * states (sets of known things, or stock counts). Null if it cannot be done
 * within `maxDepth` actions.
 */
export function solve(p: Pick<Puzzle, 'book' | 'index' | 'target' | 'relevant' | 'relRecipes'>, state: State, maxDepth = 9): Move[] | null {
  if (isWon(p, state)) return []
  const stock = p.book.mode === 'stock'
  const key = (s: State) => stock
    ? Object.keys(s).filter(k => s[k] > 0).sort().map(k => `${k}${s[k]}`).join(',')
    : Object.keys(s).filter(k => s[k] > 0 && p.relevant.has(k)).sort().join(',')
  const seen = new Set([key(state)])
  let frontier: { s: State; path: Move[] }[] = [{ s: state, path: [] }]
  let nodes = 0
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: typeof frontier = []
    for (const { s, path } of frontier) {
      for (const r of p.relRecipes) {
        const a = r.a, b = r.b
        if (b === undefined) { if (!stock || !(s[a] > 0)) continue }
        else if (a === b ? !((s[a] ?? 0) >= (stock ? 2 : 1)) : !(s[a] > 0 && s[b] > 0)) continue
        if (!stock && !r.out.some(o => p.relevant.has(o) && !(s[o] > 0))) continue
        const res = act(p, s, a, b)
        if (res.kind !== 'new') continue
        const k = key(res.state)
        if (seen.has(k)) continue
        seen.add(k)
        const np = [...path, { a, b }]
        if (isWon(p, res.state)) return np
        next.push({ s: res.state, path: np })
        if (++nodes > 120000) return null
      }
    }
    frontier = next
  }
  return null
}

// ── Generation ────────────────────────────────────────────────────────────────

export interface Tier { lo: number; hi: number; slack: number; hints: number; decoys: number; mask: number; shuffled: boolean; gaps: number }

export function tierFor(d: Difficulty, kind?: Kind): Tier {
  // A displacement is transitive (zinc frees copper as well as iron does), so
  // reactivity chains top out at four real steps; its D4 is tighter instead.
  const capped = kind === 'reactivity'
  return {
    lo: capped ? scale(d, [2, 3, 3, 4]) : scale(d, [2, 3, 4, 5]),
    hi: capped ? scale(d, [2, 3, 4, 4]) : scale(d, [2, 3, 4, 6]),
    slack: capped ? scale(d, [4, 3, 2, 1]) : scale(d, [4, 3, 3, 2]),
    hints: scale(d, [2, 1, 0, 0]),
    decoys: scale(d, [0, 1, 1, 2]),
    mask: scale(d, [0, 0, 0.34, 0.5]),
    shuffled: d >= 2,
    gaps: scale(d, [4, 6, 8, 10]),
  }
}

function frame(book: Book, start: State, target: string) {
  const relevant = relevantFor(book, target)
  const relRecipes = book.recipes.filter(r => r.out.some(o => relevant.has(o)))
  return { book, index: indexOf(book), start, target, relevant, relRecipes }
}
type Frame = ReturnType<typeof frame>

const toState = (ids: string[]): State => {
  const s: State = {}
  for (const id of ids) s[id] = (s[id] ?? 0) + 1
  return s
}

/** One candidate start + target for a kind, or null. */
function candidate(kind: Kind, tier: Tier, rng: Rng): { start: State; target: string; gaps?: string[] } | null {
  const book = BOOKS[kind]
  if (kind === 'jabir') {
    // The tools and a handful of raw materials; aim for something they can make.
    const raws = shuffle(JABIR_RAW, rng).slice(0, 4 + Math.floor(rng() * 4))
    const start = toState([...JABIR_TOOLS, ...raws])
    const target = pick(Object.keys(book.items).filter(i => !start[i] && !JABIR_RAW.includes(i)), rng)
    return { start, target }
  }
  if (book.mode === 'stock') {
    // Work backwards from the target: undo random reactions that could have
    // made what is held, so the stock is exactly enough (plus a decoy).
    const madeByPair = (i: string) => book.recipes.some(r => r.b !== undefined && r.out.includes(i))
    const atoms = Object.keys(book.items).filter(i => !madeByPair(i))
    // Reactivity aims at a particular salt: any more reactive metal could
    // free a metal in one step, but only the right metal makes its own salt.
    const targets = kind === 'reactivity'
      ? Object.keys(book.items).filter(i => /^[A-Z][a-z]?(SO4|\(NO3\)2)$/.test(i))
      : Object.keys(book.items).filter(i => madeByPair(i))
    const decoyPool = kind === 'reactivity' ? Object.keys(book.items).filter(i => SERIES.includes(i) || /SO4$|NO3|CO3/.test(i)) : atoms
    const target = pick(targets, rng)
    const s: State = { [target]: 1 }
    const steps = tier.lo + Math.floor(rng() * 3)
    for (let k = 0; k < steps; k++) {
      const held = Object.keys(s).filter(i => s[i] > 0)
      const options: (() => void)[] = []
      for (const id of held) for (const r of book.recipes) {
        if (!r.out.includes(id)) continue
        if (r.b !== undefined) options.push(() => { s[id]--; s[r.a] = (s[r.a] ?? 0) + 1; s[r.b!] = (s[r.b!] ?? 0) + 1 })
        else options.push(() => { for (const o of r.out) if (s[o] > 0) s[o]--; s[r.a] = (s[r.a] ?? 0) + 1 })
      }
      if (!options.length) break
      pick(options, rng)()
    }
    if (s[target] > 0) return null
    if (tier.decoys) { const d = pick(decoyPool.filter(i => i !== target), rng); s[d] = (s[d] ?? 0) + 1 }
    for (const k of Object.keys(s)) if (!s[k]) delete s[k]
    return { start: s, target }
  }
  // mendeleev
  const cells = Object.keys(book.items).filter(id => book.recipes.some(r => r.out[0] === id))
  const target = pick(cells, rng)
  // Lay a chain: each gap on it is reachable only through the next one, its
  // other routes blocked by further gaps (which may themselves be blocked).
  const routesOf = (x: string) => book.recipes.filter(r => r.out[0] === x)
  const gaps = new Set([target])
  /** Cells the chain relies on staying known. */
  const keep = new Set<string>()
  const blockers: string[] = []
  const block = (x: string, except?: Recipe) => {
    for (const r of routesOf(x)) {
      if (r === except || gaps.has(r.a) || gaps.has(r.b!)) continue
      const free = [r.a, r.b!].filter(c => !keep.has(c))
      if (!free.length) continue
      // Prefer blockers with fewer routes of their own: they are harder to fill.
      free.sort((p, q) => routesOf(p).length - routesOf(q).length || (rng() < 0.5 ? -1 : 1))
      gaps.add(free[0])
      blockers.push(free[0])
    }
  }
  const length = tier.lo + Math.floor(rng() * (tier.hi - tier.lo + 3))
  let cur = target
  for (let i = 0; i < length - 1; i++) {
    const options = shuffle(routesOf(cur), rng).flatMap(r => {
      const ins = [r.a, r.b!]
      return ins.filter(x => cells.includes(x) && !gaps.has(x) && !keep.has(x))
        .map(next => ({ r, next, other: ins.find(y => y !== next) ?? next }))
        .filter(o => !gaps.has(o.other))
    })
    if (!options.length) break
    const { r, next, other } = options[0]
    keep.add(other)
    block(cur, r)
    cur = next
    gaps.add(cur)
  }
  // The far end of the chain must be fillable from known elements.
  const open = routesOf(cur).find(r => !gaps.has(r.a) && !gaps.has(r.b!))
  if (!open) return null
  keep.add(open.a); keep.add(open.b!)
  block(cur, open)
  for (let round = 0, done = 0; round < 2; round++) {
    const fresh = blockers.slice(done)
    done = blockers.length
    for (const x of fresh) if (rng() < (tier.lo >= 4 ? 0.9 : 0.5)) block(x)
  }
  for (let guard = 0; gaps.size < tier.gaps && guard < 20; guard++) {
    const x = pick(cells, rng)
    if (!keep.has(x)) gaps.add(x)
  }
  const start: State = {}
  for (const id of Object.keys(book.items)) if (!gaps.has(id)) start[id] = 1
  return { start, target, gaps: [...gaps] }
}

function makeScroll(f: Frame, solution: Move[], tier: Tier, rng: Rng): ScrollEntry[] {
  if (f.book.kind === 'reactivity' || f.book.kind === 'mendeleev') return []
  const used = new Set<Recipe>()
  const entries: ScrollEntry[] = []
  for (const m of solution) {
    const r = f.index.get(m.b === undefined ? splitKey(m.a) : pairKey(m.a, m.b))!
    if (used.has(r)) continue
    used.add(r)
    entries.push({ recipe: r })
  }
  // Decoys: real recipes from things already around, that lead nowhere useful.
  const around = new Set([...Object.keys(f.start), ...entries.flatMap(e => e.recipe.out)])
  const pool = shuffle(f.book.recipes.filter(r => !used.has(r) && around.has(r.a) && (!r.b || around.has(r.b)) && !r.out.includes(f.target)), rng)
  for (const r of pool.slice(0, tier.decoys)) entries.push({ recipe: r, decoy: true })
  for (const e of entries) {
    if (!e.recipe.b || e.recipe.out.includes(f.target)) continue
    if (rng() < tier.mask) e.mask = rng() < 0.5 ? 'a' : 'b'
  }
  return tier.shuffled ? shuffle(entries, rng) : entries
}

const KIND_SALT: Record<Kind, number> = { jabir: 11, reactivity: 23, lavoisier: 37, mendeleev: 51 }

export function generate(kind: Kind, difficulty: Difficulty, seed: number): Puzzle {
  const tier = tierFor(difficulty, kind)
  const rng = mulberry32((seed ^ hashString(`alchemy:${kind}:${difficulty}`)) + KIND_SALT[kind])
  let best: { f: Frame; sol: Move[]; gaps: string[]; dist: number } | null = null
  for (let attempt = 0; attempt < 400; attempt++) {
    const c = candidate(kind, tier, rng)
    if (!c) continue
    const f = frame(BOOKS[kind], c.start, c.target)
    const sol = solve(f, c.start, tier.hi)
    if (!sol || !sol.length) continue
    const dist = sol.length < tier.lo ? tier.lo - sol.length : sol.length > tier.hi ? sol.length - tier.hi : 0
    if (!best || dist < best.dist) best = { f, sol, gaps: c.gaps ?? [], dist }
    if (dist === 0) break
  }
  // Pyrite and saltpetre always reach aqua fortis in three.
  if (!best) {
    const f = frame(JABIR, toState([...JABIR_TOOLS, 'pyrite', 'saltpetre']), 'aquafortis')
    best = { f, sol: solve(f, f.start)!, gaps: [], dist: 0 }
  }
  const { f, sol } = best
  return {
    ...f, kind,
    optimal: sol.length,
    budget: sol.length + tier.slack,
    solution: sol,
    scroll: makeScroll(f, sol, tier, rng),
    hints: tier.hints,
    gaps: best.gaps,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

function SeriesStrip() {
  return (
    <div className="p-2 rounded-xl border border-line bg-panel text-[11px] text-ink-2 leading-snug" data-testid="alc-series">
      <p className="text-[10px] uppercase tracking-wider text-muted mb-1">Reactivity series · most reactive first</p>
      <p className="font-bold text-ink tracking-wide">Mg › Zn › Fe › Sn › Pb › <span className="text-muted">(H)</span> › Cu › Hg</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        <li>A metal + the salt of a metal to its <b>right</b> → its own salt + that metal.</li>
        <li>A metal left of (H) + oil of vitriol → its sulfate + hydrogen.</li>
        <li>Hydrogen + copper or lead oxide → the metal + water. Heat a carbonate → oxide + CO₂.</li>
      </ul>
    </div>
  )
}

function Chip({ item, count, stock, selected, onClick, disabled }: { item: Item; count: number; stock: boolean; selected: number; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" data-item={item.id} data-count={count} onClick={onClick} disabled={disabled}
      className={`relative min-h-11 px-2.5 py-1.5 rounded-lg border-2 text-xs font-bold text-ink flex items-center gap-1.5 active:scale-95 transition
        border-line bg-panel ${selected ? 'ring-2 ring-accent ring-offset-1' : ''} ${disabled ? 'opacity-40' : ''}`}>
      <span className="text-base leading-none">{item.icon}</span>
      <span>{item.name}</span>
      {stock && <span className="ml-0.5 px-1 rounded bg-paper text-[10px] tabular-nums text-ink-2">×{count}</span>}
    </button>
  )
}

export default function AlchemyGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'jabir')
  const puzzle = useMemo(() => generate(config.kind, difficulty, seed), [config.kind, difficulty, seed])
  const { book } = puzzle
  const stock = book.mode === 'stock'
  const [state, setState] = useState<State>(puzzle.start)
  const [used, setUsed] = useState(0)
  const [slots, setSlots] = useState<string[]>([])
  const [msg, setMsg] = useState<string>('')
  const [hintsUsed, setHintsUsed] = useState(0)
  const [hint, setHint] = useState<Move | null>(null)
  const [predicted, setPredicted] = useState<Record<string, number>>({})
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const left = puzzle.budget - used
  const name = (id: string) => book.items[id]?.name ?? id

  const perform = useCallback((a: string, b?: string) => {
    if (settled) return
    const res = act(puzzle, state, a, b)
    setSlots([])
    setHint(null)
    if (res.kind === 'missing') { setMsg(stock ? 'Not enough in stock for that.' : ''); return }
    const u = used + res.cost
    setUsed(u)
    setState(res.state)
    const label = b === undefined ? `Heat ${name(a)}` : `${name(a)} + ${name(b)}`
    if (res.kind === 'new') {
      setMsg(`${label} → ${res.out.map(name).join(' + ')}`)
      if (book.kind === 'mendeleev' && b !== undefined) {
        const wa = predicted[a] ?? book.items[a].weight!, wb = predicted[b] ?? book.items[b].weight!
        setPredicted(p => ({ ...p, [res.out[0]]: Math.round(((wa + wb) / 2) * 10) / 10 }))
      }
    } else if (res.kind === 'known') setMsg(`${label} → nothing new.`)
    else if (res.kind === 'harmful') setMsg(`${label}: they clash! (−2)`)
    else setMsg(`${label} → nothing happens.`)
    if (isWon(puzzle, res.state)) { win(); return }
    const remaining = puzzle.budget - u
    const need = remaining > 0 ? solve(puzzle, res.state, remaining) : null
    if (!need) lose(remaining <= 0 ? 'Out of attempts' : stock ? 'The stock can no longer make it' : 'Not enough attempts left')
  }, [settled, puzzle, state, used, stock, book, predicted, win, lose]) // eslint-disable-line react-hooks/exhaustive-deps

  const tap = useCallback((id: string) => {
    if (settled) return
    if (!slots.length) { setSlots([id]); setMsg(''); return }
    perform(slots[0], id)
  }, [settled, slots, perform])

  const askHint = useCallback(() => {
    if (settled || hintsUsed >= puzzle.hints) return
    const sol = solve(puzzle, state, Math.max(1, left))
    if (!sol?.length) return
    setHint(sol[0])
    setHintsUsed(h => h + 1)
  }, [settled, hintsUsed, puzzle, state, left])

  const target = book.items[puzzle.target]
  const have = (id: string) => (state[id] ?? 0) > 0
  const benchIds = stock
    ? Object.keys(book.items).filter(id => (state[id] ?? 0) > 0 || (puzzle.start[id] ?? 0) > 0)
    : Object.keys(book.items).filter(have)

  const scrollText = (e: ScrollEntry) => {
    const r = e.recipe
    if (r.b === undefined) return `heat ${name(r.a)} → ${r.out.map(name).join(' + ')}`
    const a = e.mask === 'a' ? '?' : name(r.a), b = e.mask === 'b' ? '?' : name(r.b)
    return `${a} + ${b} → ${r.out.map(name).join(' + ')}`
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 w-full max-w-[430px] mx-auto">
      <div>
        <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
        <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
      </div>

      <div className="flex items-center justify-between gap-2 p-2 rounded-xl border border-line bg-panel">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{book.kind === 'mendeleev' ? '❓' : target.icon}</span>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted">Make</p>
            <p data-testid="alc-target" className="text-sm font-bold text-ink">
              {book.kind === 'mendeleev' ? `the gap at group ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][target.col!]}, series ${target.row! + 2}` : target.name}
            </p>
          </div>
        </div>
        <div className="text-right text-[10px] text-muted">
          <p data-testid="alc-left" className={`text-xs font-bold tabular-nums ${left <= 2 ? 'text-red-600' : 'text-accent'}`}>Attempts: {left}</p>
          <p>Can be done in {puzzle.optimal}</p>
        </div>
      </div>

      {book.kind === 'mendeleev' ? (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {TABLE.flatMap((row, r) => row.map(([sym], c) => {
            const known = have(sym)
            const isTarget = sym === puzzle.target
            const sel = slots.includes(sym) || (hint && (hint.a === sym || hint.b === sym))
            if (!known) {
              return (
                <div key={sym} data-cell={sym} data-gap="true"
                  className={`aspect-square rounded-md border-2 border-dashed flex items-center justify-center text-sm font-bold
                    ${isTarget ? 'border-accent text-accent bg-accent/10' : 'border-line text-muted'}`}>
                  {isTarget ? '★' : '?'}
                </div>
              )
            }
            const wasGap = puzzle.gaps.includes(sym)
            return (
              <button key={sym} type="button" data-item={sym} data-cell={sym} onClick={() => tap(sym)} disabled={settled}
                aria-label={`${sym} series ${r + 2} group ${c + 1}`}
                className={`aspect-square rounded-md border flex flex-col items-center justify-center leading-none active:scale-95
                  ${wasGap ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-line bg-panel'} ${sel ? 'ring-2 ring-accent' : ''}`}>
                <span className="text-xs font-bold text-ink">{sym}</span>
                <span className="text-[8px] text-muted tabular-nums">{wasGap ? `≈${predicted[sym] ?? ''}` : book.items[sym].weight}</span>
              </button>
            )
          }))}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {[0, 1].map(k => (
              <button key={k} type="button" onClick={() => setSlots(s => s.slice(0, k))} disabled={settled}
                className="flex-1 h-12 rounded-xl border-2 border-dashed border-line bg-paper flex items-center justify-center gap-1 text-xs font-bold text-ink">
                {slots[k] ? <><span className="text-lg">{book.items[slots[k]].icon}</span>{name(slots[k])}</> : <span className="text-muted">{k === 0 ? 'first' : 'second'}</span>}
              </button>
            ))}
            {stock && (
              <button type="button" data-testid="alc-heat" onClick={() => slots[0] && perform(slots[0])} disabled={settled || slots.length !== 1}
                className={`h-12 px-3 rounded-xl border text-xs font-bold ${slots.length === 1 ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-muted'}`}>
                🔥 Heat
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {benchIds.map(id => (
              <Chip key={id} item={book.items[id]} count={state[id] ?? 0} stock={stock}
                selected={slots.filter(s => s === id).length + (hint && (hint.a === id || hint.b === id) ? 1 : 0)}
                disabled={settled || (stock && !((state[id] ?? 0) > (slots[0] === id ? 1 : 0)))}
                onClick={() => tap(id)} />
            ))}
          </div>
        </>
      )}

      <p data-testid="alc-msg" className="min-h-4 text-xs text-ink-2">{hint ? `✦ Try ${hint.b === undefined ? `heating ${name(hint.a)}` : `${name(hint.a)} + ${name(hint.b)}`}` : msg}</p>

      {book.kind === 'reactivity' && <SeriesStrip />}

      {puzzle.scroll.length > 0 && (
        <div className="p-2 rounded-xl border border-line bg-paper">
          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">📜 Scroll{puzzle.scroll.some(e => e.decoy) ? ' (not every line is needed)' : ''}</p>
          <ul className="flex flex-col gap-0.5">
            {puzzle.scroll.map((e, i) => {
              const done = e.recipe.out.every(o => have(o)) && !stock
              return <li key={i} className={`text-xs ${done ? 'text-muted line-through' : 'text-ink'}`}>{scrollText(e)}</li>
            })}
          </ul>
        </div>
      )}

      {!settled && puzzle.hints > 0 && (
        <button type="button" onClick={askHint} disabled={hintsUsed >= puzzle.hints}
          className={`h-9 rounded-lg border text-xs font-bold ${hintsUsed < puzzle.hints ? 'bg-panel border-line text-ink-2' : 'bg-paper border-line text-muted/50'}`}>
          ✦ Consult the master ({puzzle.hints - hintsUsed} left)
        </button>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle={book.kind === "mendeleev" ? `${target.name} predicted!` : `${target.name} made!`} loseTitle={reason ?? 'The work fails'} />
    </div>
  )
}
