import { useMemo, useRef, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { hashString, mulberry32, shuffle, storyText, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Punnett Square: a breeding puzzle on real genetics.  You keep a few
// animals (or plants); pick two parents and the Punnett square of their
// gametes is drawn, every cell an equally likely offspring.  Tap a cell to
// keep that offspring for the next season.  Breed the asked-for animal, or
// set up a cross with the asked-for odds, before the seasons run out.
//
// Each config is a real case with three genes, introduced one per tier:
//   mendel-peas    Mendel's peas: seed shape, seed colour, stem length.
//                  Plants self-pollinate; true-breeding goals.
//   punnett-combs  Bateson & Punnett's hens: rose × pea comb gives walnut
//                  (two genes, one trait), then Creeper legs: CpCp dies.
//   yellow-mice    Cuénot's mice: black/brown, albino hides every colour,
//                  then yellow Aʸ: AʸAʸ dies, so yellow × yellow gives 2:1.
//   manx-cats      Dilute, orange on the X (tortoiseshell queens only),
//                  then Manx: MM kittens die before birth.
//   morgan-flies   Morgan's fruit flies: vestigial wings, white eyes on the
//                  X, then Curly wings: CyCy dies.
//   chimp-blood    Chimpanzees: ABO (only A and O in chimps) and tasting
//                  PTC, two genes we share with them.
//
//   D   genes  stock  crosses needed  slack  goals
//   1   1      2      1–2             +1     breed a look
//   2   2      2      2               +1     + a sex, or true-breeding
//   3   3      3      2–3             +1     + odds of a cross (lethals in play)
//   4   3      3      3               +0     sex, true-breeding or odds only
//
// The square is free to look at: only keeping an offspring uses a season.
// Every level is searched from its stock (breadth-first over the herds you
// can build) so the goal needs exactly the stated number of crosses, and
// the game ends early once the goal is out of reach.

export type Sex = 'F' | 'M' | 'H'

export interface Gene {
  trait: string
  /** Allele symbols, the dominant one first. */
  sym: string[]
  /** Carried on the X chromosome: a male has one copy, written with Y. */
  x?: boolean
  /** This allele kills when an embryo has two copies. */
  lethal?: number
  /** The genotype every individual has while the gene is not yet in play. */
  fixed: [number, number]
}

/** What an individual looks like, from the genes in play. */
export interface Look {
  /** Is gene i in play at this tier? */
  on: (i: number) => boolean
  /** Does the individual carry allele a of gene i (fixed genes included)? */
  has: (i: number, a: number) => boolean
}

export interface PunnettCase {
  title: string
  rule: string
  intro: string
  fact: string
  species: string
  icon: string
  /** Female and male words ('queen', 'tom'); a plant has neither. */
  female?: string
  male?: string
  genes: Gene[]
  look: (l: Look) => string
}

const dom = (l: Look, i: number) => l.has(i, 0)
const join = (...parts: (string | false)[]) => parts.filter(Boolean).join(' ')

export const CONFIGS: Record<string, PunnettCase> = {
  'mendel-peas': {
    title: 'Mendel’s Peas, Brno',
    rule: 'Peas pollinate themselves',
    intro: 'Cross two pea plants, or let one pollinate itself. A dominant allele (capital) hides a recessive one: only two recessive copies show. Breed the plant the garden needs.',
    fact: 'In 1865 Gregor Mendel reported a cross of round yellow and wrinkled green peas: the second generation came out 315 round yellow, 108 round green, 101 wrinkled yellow and 32 wrinkled green, close to 9:3:3:1.',
    species: 'plant', icon: '🌱',
    genes: [
      { trait: 'seed', sym: ['R', 'r'], fixed: [0, 0] },
      { trait: 'colour', sym: ['Y', 'y'], fixed: [0, 0] },
      { trait: 'stem', sym: ['T', 't'], fixed: [0, 0] },
    ],
    look: l => join(dom(l, 0) ? 'round' : 'wrinkled', l.on(1) && (dom(l, 1) ? 'yellow' : 'green'), l.on(2) && (dom(l, 2) ? 'tall' : 'dwarf')),
  },
  'punnett-combs': {
    title: 'Bateson and Punnett’s Hens',
    rule: 'Two genes, one comb · CpCp dies',
    intro: 'Rose comb needs R, pea comb needs P; with both the comb is walnut, with neither it is single. Creeper hens (Cp) have short legs, but a chick with two Cp never hatches.',
    fact: 'In 1905 William Bateson and Reginald Punnett crossed rose-comb and pea-comb fowl and got walnut combs, then 9 walnut : 3 rose : 3 pea : 1 single: two genes acting on one trait. Punnett drew the square named after him to explain such crosses. In the 1930s Walter Landauer showed that chicks with two copies of the Creeper gene die in the egg.',
    species: 'chicken', icon: '🐓', female: 'hen', male: 'cock',
    genes: [
      { trait: 'rose', sym: ['R', 'r'], fixed: [1, 1] },
      { trait: 'pea', sym: ['P', 'p'], fixed: [1, 1] },
      { trait: 'creeper', sym: ['Cp', 'cp'], lethal: 0, fixed: [1, 1] },
    ],
    look: l => {
      const r = dom(l, 0), p = l.on(1) && dom(l, 1)
      return join(`${r && p ? 'walnut' : r ? 'rose' : p ? 'pea' : 'single'}-comb`, l.on(2) && dom(l, 2) && 'creeper')
    },
  },
  'yellow-mice': {
    title: 'Cuénot’s Yellow Mice',
    rule: 'Albino hides colour · AʸAʸ dies',
    intro: 'B gives black fur, bb brown. Two albino alleles (cc) hide any colour. Yellow (Aʸ) shows over black and brown, but a mouse with two Aʸ dies in the womb.',
    fact: 'In 1905 Lucien Cuénot found that yellow mice never bred true: yellow × yellow gave about two yellow to one non-yellow, not 3:1. In 1910 William Castle and Clarence Little showed why: the AʸAʸ embryos die, the first lethal gene ever described.',
    species: 'mouse', icon: '🐁', female: 'doe', male: 'buck',
    genes: [
      { trait: 'black', sym: ['B', 'b'], fixed: [0, 0] },
      { trait: 'albino', sym: ['C', 'c'], fixed: [0, 0] },
      { trait: 'yellow', sym: ['Aʸ', 'a'], lethal: 0, fixed: [1, 1] },
    ],
    look: l => (l.on(1) && !dom(l, 1) ? 'albino' : l.on(2) && dom(l, 2) ? 'yellow' : dom(l, 0) ? 'black' : 'brown'),
  },
  'manx-cats': {
    title: 'Tortoiseshells and Manx Cats',
    rule: 'Orange rides the X · MM dies',
    intro: 'Two d alleles dilute black to blue and orange to cream. Orange (O) sits on the X: a tom has one X, so only a queen can carry both and be tortoiseshell. Manx (M) cats have no tail, but MM kittens die before birth.',
    fact: 'Tortoiseshell cats are almost always female because the orange gene is on the X chromosome, and in each cell of a female one X is switched off at random (Mary Lyon, 1961). Every tailless Manx cat carries one M allele; kittens with two die early in the womb, so Manx × Manx litters are small.',
    species: 'cat', icon: '🐈', female: 'queen', male: 'tom',
    genes: [
      { trait: 'dilute', sym: ['D', 'd'], fixed: [0, 0] },
      { trait: 'orange', sym: ['O', 'o'], x: true, fixed: [1, 1] },
      { trait: 'Manx', sym: ['M', 'm'], lethal: 0, fixed: [1, 1] },
    ],
    look: l => {
      const dil = !dom(l, 0), o = l.has(1, 0), b = l.has(1, 1)
      const coat = o && b ? (dil ? 'blue-cream' : 'tortoiseshell') : o ? (dil ? 'cream' : 'orange') : dil ? 'blue' : 'black'
      return join(coat, l.on(2) && dom(l, 2) && 'Manx')
    },
  },
  'morgan-flies': {
    title: 'The Fly Room, Columbia',
    rule: 'White eyes ride the X · CyCy dies',
    intro: 'Two vg alleles shrink the wings to stubs. White eyes (w) sit on the X, so a male needs only one. Curly wings (Cy) are dominant, but a fly with two Cy never hatches.',
    fact: 'In 1910 Thomas Hunt Morgan found a white-eyed male fly. Crossing him showed white eyes turning up mostly in males, the first gene tied to a chromosome, the X. Curly is still used in fly labs because CyCy flies die: a Curly stock can never lose it by accident.',
    species: 'fly', icon: '🪰', female: 'female', male: 'male',
    genes: [
      { trait: 'wings', sym: ['Vg', 'vg'], fixed: [0, 0] },
      { trait: 'eyes', sym: ['W', 'w'], x: true, fixed: [0, 0] },
      { trait: 'curly', sym: ['Cy', 'cy'], lethal: 0, fixed: [1, 1] },
    ],
    look: l => join(l.on(1) && (dom(l, 1) ? 'red-eyed,' : 'white-eyed,'), !dom(l, 0) ? 'vestigial-winged' : l.on(2) && dom(l, 2) ? 'curly-winged' : 'normal-winged'),
  },
  'chimp-blood': {
    title: 'Our Closest Kin',
    rule: 'Blood groups and taste',
    intro: 'Chimpanzees have the ABO blood groups too, though almost all are A or O: A is dominant, OO is group O. Many can taste the bitter chemical PTC, as many people can: T, the taster allele, is dominant.',
    fact: 'Chimpanzees share the ABO blood-group system with humans, though almost all are type A or O. In 1939 R. A. Fisher, E. B. Ford and Julian Huxley offered PTC to the chimpanzees at London Zoo and found tasters and non-tasters, much as in people.',
    species: 'chimp', icon: '🐒', female: 'female', male: 'male',
    genes: [
      { trait: 'blood', sym: ['A', 'O'], fixed: [0, 0] },
      { trait: 'taste', sym: ['T', 't'], fixed: [0, 0] },
    ],
    look: l => join(dom(l, 0) ? 'group A' : 'group O', l.on(1) && (dom(l, 1) ? 'taster' : 'non-taster')),
  },
}

// ── Genetics ──────────────────────────────────────────────────────────────────

/** One allele index per gene in play; -1 is the Y chromosome in a male's sperm. */
export type Gamete = number[]

export interface Individual {
  sex: Sex
  /** One allele pair per gene in play, [x, -1] for an X gene in a male. */
  g: [number, number][]
}

export interface Cell { kid: Individual; dead: boolean; look: string; mother: number; father: number }

export interface Cross {
  /** Gametes of the first parent (columns) and the second (rows). */
  cols: Gamete[]
  rows: Gamete[]
  /** rows.length × cols.length cells, row by row. */
  cells: Cell[]
  /** The sex of a cell's offspring is not in the square: the keeper picks it. */
  eitherSex: boolean
}

export const keyOf = (ind: Individual) => ind.sex + ind.g.map(p => p.join(',')).join(';')

export interface Model {
  cs: PunnettCase
  k: number
  sexed: boolean
  /** Every individual that can live, by index. */
  U: Individual[]
  index: Map<string, number>
  looks: string[]
}

const models = new Map<string, Model>()

export function modelFor(configId: string, k: number): Model {
  const id = CONFIGS[configId] ? configId : 'mendel-peas'
  const key = `${id}:${k}`
  const hit = models.get(key)
  if (hit) return hit
  const cs = CONFIGS[id]
  const sexed = !!cs.female
  const genes = cs.genes.slice(0, k)
  const U: Individual[] = []
  for (const sex of (sexed ? ['F', 'M'] : ['H']) as Sex[]) {
    let combos: [number, number][][] = [[]]
    for (const gene of genes) {
      const n = gene.sym.length
      const pairs: [number, number][] = []
      if (gene.x && sex === 'M') for (let a = 0; a < n; a++) pairs.push([a, -1])
      else for (let a = 0; a < n; a++) for (let b = a; b < n; b++) pairs.push([a, b])
      combos = combos.flatMap(c => pairs.map(p => [...c, p]))
    }
    for (const g of combos) {
      const ind = { sex, g }
      if (!isDead(cs, ind)) U.push(ind)
    }
  }
  const index = new Map(U.map((ind, i) => [keyOf(ind), i]))
  const m: Model = { cs, k, sexed, U, index, looks: [] }
  m.looks = [...new Set(U.map(ind => lookOf(m, ind)))]
  models.set(key, m)
  return m
}

export function isDead(cs: PunnettCase, ind: Individual): boolean {
  return ind.g.some((p, i) => cs.genes[i].lethal !== undefined && p[0] === cs.genes[i].lethal && p[1] === cs.genes[i].lethal)
}

export function lookOf(m: Model, ind: Individual): string {
  const pairOf = (i: number): number[] => {
    if (i < m.k) return ind.g[i]
    const gene = m.cs.genes[i]
    return gene.x && ind.sex === 'M' ? [gene.fixed[0], -1] : gene.fixed
  }
  return m.cs.look({ on: i => i < m.k, has: (i, a) => pairOf(i).includes(a) })
}

export function gametes(m: Model, ind: Individual): Gamete[] {
  let out: Gamete[] = [[]]
  ind.g.forEach(p => {
    const alleles = [...new Set(p)]
    out = out.flatMap(gm => alleles.map(a => [...gm, a]))
  })
  void m
  return out
}

/** The Punnett square of two parents: a mother and a father, or two plants. */
export function cross(m: Model, a: Individual, b: Individual): Cross {
  const cols = gametes(m, a), rows = gametes(m, b)
  const xIn = m.cs.genes.slice(0, m.k).some(g => g.x)
  const cells: Cell[] = []
  rows.forEach((f, r) => cols.forEach((e, c) => {
    const male = xIn && f.some((al, i) => m.cs.genes[i].x && al === -1)
    const sex: Sex = !m.sexed ? 'H' : xIn ? (male ? 'M' : 'F') : 'F'
    const g = e.map((al, i): [number, number] => {
      if (m.cs.genes[i].x && f[i] === -1) return [al, -1]
      return al <= f[i] ? [al, f[i]] : [f[i], al]
    })
    const kid = { sex, g }
    const dead = isDead(m.cs, kid)
    cells.push({ kid, dead, look: lookOf(m, kid), mother: c, father: r })
  }))
  return { cols, rows, cells, eitherSex: m.sexed && !xIn }
}

/** The living offspring a cross can give, as universe indices (both sexes if the square leaves it open). */
export function kidsOf(m: Model, x: Cross): number[] {
  const out = new Set<number>()
  for (const cell of x.cells) {
    if (cell.dead) continue
    const sexes: Sex[] = x.eitherSex ? ['F', 'M'] : [cell.kid.sex]
    for (const sex of sexes) out.add(m.index.get(keyOf({ ...cell.kid, sex }))!)
  }
  return [...out]
}

/** Living cells of each look, out of all living cells. */
export function tally(x: Cross): { looks: Map<string, number>; alive: number; dead: number } {
  const looks = new Map<string, number>()
  let alive = 0, dead = 0
  for (const c of x.cells) {
    if (c.dead) { dead++; continue }
    alive++
    looks.set(c.look, (looks.get(c.look) ?? 0) + 1)
  }
  return { looks, alive, dead }
}

export const isPure = (ind: Individual) => ind.g.every(p => p[1] === -1 || p[0] === p[1])

// ── Goals ─────────────────────────────────────────────────────────────────────

/** "At least" odds a cross may be asked for. */
export const ODDS: [number, number][] = [[1, 2], [2, 3], [3, 4], [1, 1]]

export type Goal =
  | { kind: 'have'; look: string; sex?: 'F' | 'M'; pure?: boolean }
  | { kind: 'odds'; look: string; num: number; den: number }

export const goalKey = (g: Goal) => g.kind === 'have' ? `have|${g.look}|${g.sex ?? ''}|${g.pure ? 'pure' : ''}` : `odds|${g.look}|${g.num}/${g.den}`

export function meetsHave(m: Model, g: Goal, ind: Individual): boolean {
  return g.kind === 'have' && lookOf(m, ind) === g.look && (!g.sex || ind.sex === g.sex) && (!g.pure || isPure(ind))
}

export function meetsOdds(g: Goal, x: Cross): boolean {
  if (g.kind !== 'odds') return false
  const t = tally(x)
  return t.alive > 0 && (t.looks.get(g.look) ?? 0) * g.den >= g.num * t.alive
}

/** Every goal a single cross satisfies (keeping one of its offspring, or by its odds). */
function goalsOfCross(m: Model, x: Cross): Goal[] {
  const out: Goal[] = []
  for (const kid of kidsOf(m, x)) {
    const ind = m.U[kid], look = lookOf(m, ind)
    out.push({ kind: 'have', look })
    if (m.sexed) out.push({ kind: 'have', look, sex: ind.sex as 'F' | 'M' })
    else if (isPure(ind)) out.push({ kind: 'have', look, pure: true })
  }
  const t = tally(x)
  for (const [look, n] of t.looks) for (const [num, den] of ODDS) if (n * den >= num * t.alive) out.push({ kind: 'odds', look, num, den })
  return out
}

// ── Search ────────────────────────────────────────────────────────────────────

/** Parent pairs a herd allows: mother × father, or any two plants (one plant twice is selfing). */
export function pairsOf(m: Model, herd: readonly number[]): [number, number][] {
  const out: [number, number][] = []
  if (m.sexed) {
    for (const a of herd) if (m.U[a].sex === 'F') for (const b of herd) if (m.U[b].sex === 'M') out.push([a, b])
  } else {
    for (let i = 0; i < herd.length; i++) for (let j = i; j < herd.length; j++) out.push([herd[i], herd[j]])
  }
  return out
}

interface Cache { cross: Map<number, Cross>; kids: Map<number, number[]>; goals: Map<number, string[]> }
const caches = new WeakMap<Model, Cache>()
function cacheOf(m: Model): Cache {
  let c = caches.get(m)
  if (!c) { c = { cross: new Map(), kids: new Map(), goals: new Map() }; caches.set(m, c) }
  return c
}
export function crossOf(m: Model, a: number, b: number): Cross {
  const c = cacheOf(m), key = a * m.U.length + b
  let x = c.cross.get(key)
  if (!x) { x = cross(m, m.U[a], m.U[b]); c.cross.set(key, x) }
  return x
}
function kidsCached(m: Model, a: number, b: number): number[] {
  const c = cacheOf(m), key = a * m.U.length + b
  let k = c.kids.get(key)
  if (!k) { k = kidsOf(m, crossOf(m, a, b)); c.kids.set(key, k) }
  return k
}
function goalsCached(m: Model, a: number, b: number): string[] {
  const c = cacheOf(m), key = a * m.U.length + b
  let g = c.goals.get(key)
  if (!g) { g = [...new Set(goalsOfCross(m, crossOf(m, a, b)).map(goalKey))]; c.goals.set(key, g) }
  return g
}

/**
 * Fewest crosses to reach each goal from a herd, up to `maxD`: a breadth-first
 * search over the herds that keeping offspring can build.  With `target` it
 * stops at that goal and returns only it.
 */
export function distances(m: Model, herd: readonly number[], maxD: number, target?: string): Map<string, number> {
  const dist = new Map<string, number>()
  const start = [...new Set(herd)].sort((a, b) => a - b)
  let layer: number[][] = [start]
  const seen = new Set([start.join(',')])
  for (let d = 1; d <= maxD && layer.length; d++) {
    const next: number[][] = []
    for (const h of layer) {
      for (const [a, b] of pairsOf(m, h)) {
        for (const g of goalsCached(m, a, b)) if (!dist.has(g)) {
          dist.set(g, d)
          if (g === target) return new Map([[g, d]])
        }
        if (d === maxD) continue
        for (const kid of kidsCached(m, a, b)) {
          if (h.includes(kid)) continue
          const nh = [...h, kid].sort((x, y) => x - y), key = nh.join(',')
          if (seen.has(key)) continue
          seen.add(key); next.push(nh)
        }
      }
    }
    layer = next
  }
  return target ? new Map(dist.has(target) ? [[target, dist.get(target)!]] : []) : dist
}

// ── Levels ────────────────────────────────────────────────────────────────────

export const TIERS: Record<Difficulty, { genes: number; stock: number; dist: [number, number]; slack: number; kinds: string[] }> = {
  1: { genes: 1, stock: 2, dist: [1, 2], slack: 1, kinds: ['look'] },
  2: { genes: 2, stock: 2, dist: [2, 2], slack: 1, kinds: ['look', 'sex', 'pure'] },
  3: { genes: 3, stock: 3, dist: [2, 3], slack: 1, kinds: ['look', 'sex', 'pure', 'odds'] },
  4: { genes: 3, stock: 3, dist: [3, 3], slack: 0, kinds: ['sex', 'pure', 'odds'] },
}

export interface Level {
  configId: string
  k: number
  herd: number[]
  goal: Goal
  /** Fewest crosses that reach the goal. */
  dist: number
  /** Breeding seasons: one cross each. */
  budget: number
}

export function parseGoal(key: string): Goal {
  const [kind, look, a, b] = key.split('|')
  if (kind === 'odds') { const [num, den] = a.split('/').map(Number); return { kind: 'odds', look, num, den } }
  return { kind: 'have', look, ...(a ? { sex: a as 'F' | 'M' } : {}), ...(b ? { pure: true } : {}) }
}

const kindOf = (g: Goal) => g.kind === 'odds' ? 'odds' : g.pure ? 'pure' : g.sex ? 'sex' : 'look'

/** Does the goal's look depend on the newest gene in play (at D3+ the lethal one)? */
function usesNewest(m: Model, look: string): boolean {
  if (m.k < 2) return true
  const older = modelFor(Object.keys(CONFIGS).find(id => CONFIGS[id] === m.cs)!, m.k - 1)
  return !older.looks.includes(look)
}

function randomHerd(m: Model, n: number, rng: Rng): number[] {
  const ids = shuffle(m.U.map((_, i) => i), rng)
  if (!m.sexed) return ids.slice(0, n).sort((a, b) => a - b)
  const f = ids.filter(i => m.U[i].sex === 'F'), mm = ids.filter(i => m.U[i].sex === 'M')
  const herd = [f[0], mm[0]]
  for (const i of ids) if (herd.length < n && !herd.includes(i)) herd.push(i)
  return herd.sort((a, b) => a - b)
}

export function makeLevel(configId: string, difficulty: Difficulty, seed: number): Level {
  const id = CONFIGS[configId] ? configId : 'mendel-peas'
  const tier = TIERS[difficulty]
  const k = Math.min(tier.genes, CONFIGS[id].genes.length)
  const m = modelFor(id, k)
  let best: { level: Level; score: number } | null = null
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = mulberry32(hashString(`punnett:${id}:${difficulty}:${seed}:${attempt}`))
    const herd = randomHerd(m, tier.stock, rng)
    const dist = distances(m, herd, tier.dist[1])
    const options: { goal: Goal; d: number; score: number }[] = []
    for (const [key, d] of dist) {
      const goal = parseGoal(key)
      if (!tier.kinds.includes(kindOf(goal))) continue
      if (goal.kind === 'have' && herd.some(i => meetsHave(m, goal, m.U[i]))) continue
      // Odds of 1 are just "breed only X": fine for plain looks, dull for 1/2.
      const fits = d >= tier.dist[0] && d <= tier.dist[1]
      const score = (fits ? 100 : 0) + d * 10 + (difficulty >= 3 && usesNewest(m, goal.look) ? 5 : 0) + rng()
      options.push({ goal, d, score })
    }
    if (!options.length) continue
    const top = options.reduce((a, b) => (b.score > a.score ? b : a))
    const level: Level = { configId: id, k, herd, goal: top.goal, dist: top.d, budget: top.d + tier.slack }
    if (!best || top.score > best.score) best = { level, score: top.score }
    if (top.score >= 100 + tier.dist[1] * 10 + (difficulty >= 3 ? 5 : 0)) break
  }
  return best!.level
}

// ── Text ──────────────────────────────────────────────────────────────────────

const SUP: Record<string, string> = { W: 'ᵂ', w: 'ʷ', O: 'ᴼ', o: 'ᵒ' }
const xAllele = (s: string) => `X${SUP[s] ?? s}`

export function genotypeText(m: Model, ind: Individual): string {
  return ind.g.map((p, i) => {
    const gene = m.cs.genes[i]
    if (gene.x) return p[1] === -1 ? `${xAllele(gene.sym[p[0]])}Y` : `${xAllele(gene.sym[p[0]])}${xAllele(gene.sym[p[1]])}`
    return gene.sym[p[0]] + gene.sym[p[1]]
  }).join(' ')
}

export function gameteText(m: Model, gm: Gamete): string {
  return gm.map((a, i) => (m.cs.genes[i].x ? (a === -1 ? 'Y' : xAllele(m.cs.genes[i].sym[a])) : m.cs.genes[i].sym[a])).join('')
}

const sexWord = (cs: PunnettCase, sex: Sex) => (sex === 'F' ? cs.female : sex === 'M' ? cs.male : undefined) ?? cs.species
const sexMark = (sex: Sex) => (sex === 'F' ? '♀' : sex === 'M' ? '♂' : '')

export function goalText(cs: PunnettCase, g: Goal, k = cs.genes.length): string {
  if (g.kind === 'odds') {
    const odds = g.num === g.den ? 'all' : `at least ${g.num}/${g.den}`
    const lethal = cs.genes.slice(0, k).some(gene => gene.lethal !== undefined)
    return `Set up a cross where ${odds} of the ${lethal ? 'young that survive' : 'offspring'} are ${g.look}.`
  }
  return `Breed a ${g.pure ? 'true-breeding ' : ''}${g.look} ${g.sex ? sexWord(cs, g.sex) : cs.species}.`
}

// ── Component ─────────────────────────────────────────────────────────────────

const PALETTE = ['#16a34a', '#2563eb', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#b45309', '#be185d']

export default function PunnettGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const id = CONFIGS[configId] ? configId : 'mendel-peas'
  const cs = { ...CONFIGS[id], ...storyText(params) }
  const level = useMemo(() => makeLevel(id, difficulty, seed), [id, difficulty, seed])
  const m = modelFor(level.configId, level.k)
  const goalId = goalKey(level.goal)
  const [herd, setHerd] = useState<number[]>(level.herd)
  const [used, setUsed] = useState(0)
  const [pa, setPa] = useState<number | null>(null)
  const [pb, setPb] = useState<number | null>(null)
  const [cell, setCell] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const dist = useRef(level.dist)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const left = level.budget - used
  const ready = pa !== null && pb !== null
  const x = ready ? crossOf(m, pa, pb) : null
  const colourOf = (look: string) => PALETTE[m.looks.indexOf(look) % PALETTE.length]

  const tapAnimal = (u: number) => {
    if (settled) return
    setCell(null); setNote('')
    const sex = m.U[u].sex
    if (sex === 'F') setPa(pa === u ? null : u)
    else if (sex === 'M') setPb(pb === u ? null : u)
    // Plants: the first tap is one parent, the second the other (the same plant again is selfing).
    else if (pa === null) setPa(u)
    else if (pb === null) setPb(u)
    else { setPa(u); setPb(null) }
  }

  const keep = (sex?: Sex) => {
    if (settled || !x || cell === null) return
    const c = x.cells[cell]
    if (c.dead) return
    const kid = { ...c.kid, sex: sex ?? c.kid.sex }
    const u = m.index.get(keyOf(kid))!
    const nextHerd = herd.includes(u) ? herd : [...herd, u]
    const nUsed = used + 1
    setHerd(nextHerd); setUsed(nUsed); setPa(null); setPb(null); setCell(null)
    if (meetsHave(m, level.goal, kid) || meetsOdds(level.goal, x)) { win(); return }
    const rem = level.budget - nUsed
    // Keeping an offspring never makes the goal farther, and at most one cross nearer.
    const sooner = dist.current > 1 ? distances(m, nextHerd, dist.current - 1, goalId).get(goalId) : undefined
    if (sooner !== undefined) dist.current = sooner
    if (dist.current > rem) lose(rem === 0 ? 'The breeding seasons are over' : 'Not enough seasons left to breed it')
    else setNote(sooner !== undefined ? `Kept a ${lookOf(m, kid)} ${sexWord(cs, kid.sex)}. That brings the goal a season nearer.` : `Kept a ${lookOf(m, kid)} ${sexWord(cs, kid.sex)}.`)
  }

  const n = x ? Math.max(x.cols.length, x.rows.length) : 1
  const size = Math.min(56, Math.floor(272 / n))
  const t = x ? tally(x) : null
  const picked = x && cell !== null ? x.cells[cell] : null

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cs.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cs.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p data-testid="pn-seasons" className={`font-bold ${left <= 1 ? 'text-red-600' : 'text-ink-2'}`}>Seasons {left}</p>
          <p>{cs.rule}</p>
        </div>
      </div>

      <p data-testid="pn-goal" className="text-xs font-bold text-ink-2 bg-panel border border-line rounded-lg px-3 py-2">🎯 {goalText(cs, level.goal, level.k)}</p>

      <div className="flex flex-wrap gap-1.5 justify-center" aria-label="your stock">
        {herd.map(u => {
          const ind = m.U[u], on = u === pa || u === pb
          return (
            <button key={u} type="button" data-testid={`pn-animal-${u}`} onClick={() => tapAnimal(u)} disabled={settled}
              className={`px-2 py-1.5 rounded-lg border text-left min-w-[92px] ${on ? 'border-accent bg-accent/10' : 'border-line bg-panel'}`}>
              <span className="text-[11px] font-bold text-ink">{cs.icon} {sexMark(ind.sex)} {lookOf(m, ind)}</span>
              <span className="block text-[10px] text-muted font-mono">{genotypeText(m, ind)}</span>
              {u === pa && u === pb && <span className="block text-[9px] text-accent">⊗ selfing</span>}
            </button>
          )
        })}
      </div>

      {!x && !settled && (
        <p className="text-muted/80 text-xs text-center">
          {m.sexed ? `Pick a ${cs.female} and a ${cs.male} to see their Punnett square.` : 'Pick two plants, or one plant twice to let it pollinate itself.'}
          {note && <span className="block text-ink-2 mt-1">{note}</span>}
        </p>
      )}

      {x && t && (
        <div className="flex flex-col items-center gap-2">
          <div className="grid" style={{ gridTemplateColumns: `36px repeat(${x.cols.length}, ${size}px)` }}>
            <span />
            {x.cols.map((gm, c) => <span key={c} className="text-center text-[10px] font-bold font-mono text-accent pb-0.5">{gameteText(m, gm)}</span>)}
            {x.rows.map((gr, r) => [
              <span key={`h${r}`} className="flex items-center justify-end pr-1 text-[10px] font-bold font-mono text-indigo-500">{gameteText(m, gr)}</span>,
              ...x.cols.map((_, c) => {
                const i = r * x.cols.length + c, cl = x.cells[i]
                return (
                  <button key={i} type="button" data-testid={`pn-cell-${i}`} disabled={cl.dead || settled} onClick={() => setCell(i)}
                    aria-label={cl.dead ? 'dies' : `${genotypeText(m, cl.kid)} ${cl.look}`}
                    className={`flex items-center justify-center border text-[9px] leading-tight font-mono ${cell === i ? 'ring-2 ring-accent z-10' : ''}`}
                    style={{ height: size, background: cl.dead ? '#1f2937' : `${colourOf(cl.look)}33`, borderColor: cl.dead ? '#111827' : `${colourOf(cl.look)}88`, color: cl.dead ? '#9ca3af' : '#1f2937' }}>
                    {cl.dead ? '✝' : size >= 48 ? genotypeText(m, cl.kid) : x.eitherSex ? '' : sexMark(cl.kid.sex)}
                  </button>
                )
              }),
            ])}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center text-[10px]" data-testid="pn-tally">
            {[...t.looks].map(([look, cnt]) => (
              <span key={look} className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: colourOf(look) }} />
                {look} {cnt}/{t.alive}
              </span>
            ))}
            {t.dead > 0 && <span className="text-red-700 font-bold">✝ {t.dead} of {x.cells.length} die</span>}
          </div>
          {picked && !picked.dead && !settled && (
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              <span className="font-mono text-ink-2">{genotypeText(m, picked.kid)} · {picked.look}</span>
              {x.eitherSex
                ? (['F', 'M'] as Sex[]).map(s => (
                  <button key={s} type="button" data-testid={`pn-keep-${s}`} onClick={() => keep(s)}
                    className="px-3 py-1.5 rounded-lg bg-accent text-accent-fg font-bold">Keep {sexMark(s)} {sexWord(cs, s)}</button>
                ))
                : <button type="button" data-testid="pn-keep" onClick={() => keep()}
                  className="px-3 py-1.5 rounded-lg bg-accent text-accent-fg font-bold">Keep this {sexWord(cs, picked.kid.sex)}</button>}
            </div>
          )}
          {!picked && !settled && <p className="text-muted/80 text-[10px] text-center">Tap a square to keep that offspring. Keeping one uses a season.</p>}
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={cs.fact} winTitle="Bred true!" loseTitle={reason ?? 'The line died out'} />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
