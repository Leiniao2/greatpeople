// Real chemistry for the Chemistry lab: balancing equations and acid–base
// titration.  Nothing here is hand-tuned to "feel" right — coefficients come
// from solving the atom balance exactly, and the titration curve from the
// charge balance of the solution with textbook pKa values.

import type { Difficulty } from '@/games/types'
import { mulberry32, hashString, shuffle, scale, type Rng } from '../_shared'

// ── Formulas ──────────────────────────────────────────────────────────────────

export type Atoms = Record<string, number>

/** Count the atoms in a formula such as "Al2Si2O5(OH)4" or "CH3COOH". */
export function parseFormula(formula: string): Atoms {
  let i = 0
  const group = (): Atoms => {
    const out: Atoms = {}
    while (i < formula.length && formula[i] !== ')') {
      let part: Atoms
      if (formula[i] === '(') {
        i++
        part = group()
        if (formula[i] !== ')') throw new Error(`unclosed ( in ${formula}`)
        i++
      } else {
        const m = /^[A-Z][a-z]?/.exec(formula.slice(i))
        if (!m) throw new Error(`bad formula ${formula} at ${i}`)
        i += m[0].length
        part = { [m[0]]: 1 }
      }
      const n = /^\d+/.exec(formula.slice(i))
      const k = n ? Number(n[0]) : 1
      if (n) i += n[0].length
      for (const [el, c] of Object.entries(part)) out[el] = (out[el] ?? 0) + c * k
    }
    return out
  }
  const atoms = group()
  if (i !== formula.length) throw new Error(`unbalanced ) in ${formula}`)
  return atoms
}

/** "Ca(HCO3)2" → "Ca(HCO₃)₂" for display. */
export const pretty = (formula: string) => formula.replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)])

export const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, C: 12.011, N: 14.007, O: 15.999, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085,
  P: 30.974, S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078, Mn: 54.938, Fe: 55.845, Cu: 63.546,
  Zn: 65.38, Ag: 107.87, Sn: 118.71, Au: 196.97, Hg: 200.59, Pb: 207.2,
}

// ── Equations ─────────────────────────────────────────────────────────────────

export interface Reaction {
  id: string
  reactants: string[]
  products: string[]
  /** What it is, in a few words: "Charcoal burning in too little air". */
  name: string
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a))

/** Atom totals on each side for the given coefficients (reactants first). */
export function tally(r: Pick<Reaction, 'reactants' | 'products'>, coefs: number[]) {
  const left: Atoms = {}, right: Atoms = {}
  r.reactants.forEach((f, k) => { for (const [el, n] of Object.entries(parseFormula(f))) left[el] = (left[el] ?? 0) + n * coefs[k] })
  r.products.forEach((f, k) => { for (const [el, n] of Object.entries(parseFormula(f))) right[el] = (right[el] ?? 0) + n * coefs[r.reactants.length + k] })
  const elements = [...new Set([...Object.keys(left), ...Object.keys(right)])]
  return { left, right, elements }
}

export function sideMass(side: Atoms): number {
  return Object.entries(side).reduce((m, [el, n]) => m + (ATOMIC_MASS[el] ?? 0) * n, 0)
}

export function isBalanced(r: Pick<Reaction, 'reactants' | 'products'>, coefs: number[]): boolean {
  if (coefs.some(c => !Number.isInteger(c) || c < 1)) return false
  const { left, right, elements } = tally(r, coefs)
  return elements.every(el => (left[el] ?? 0) === (right[el] ?? 0))
}

export const isLowest = (coefs: number[]) => coefs.reduce(gcd) === 1

/**
 * The smallest whole-number coefficients, by exact Gaussian elimination over
 * the rationals.  Null unless the balance has exactly one solution up to
 * scale (so every reaction in the bank has a single right answer).
 */
export function balance(r: Pick<Reaction, 'reactants' | 'products'>): number[] | null {
  const species = [...r.reactants, ...r.products]
  const parsed = species.map(parseFormula)
  const elements = [...new Set(parsed.flatMap(a => Object.keys(a)))]
  const n = species.length
  // Rows: elements; columns: species (products negated).  Fractions as [num, den].
  type Q = [number, number]
  const norm = ([p, q]: Q): Q => { const g = gcd(p, q) || 1; const s = q < 0 ? -1 : 1; return [s * p / g, s * q / g] }
  const sub = (a: Q, b: Q): Q => norm([a[0] * b[1] - b[0] * a[1], a[1] * b[1]])
  const mul = (a: Q, b: Q): Q => norm([a[0] * b[0], a[1] * b[1]])
  const div = (a: Q, b: Q): Q => norm([a[0] * b[1], a[1] * b[0]])
  const m: Q[][] = elements.map(el => species.map((_, k) => [(parsed[k][el] ?? 0) * (k < r.reactants.length ? 1 : -1), 1] as Q))
  const pivots: number[] = []
  let row = 0
  for (let col = 0; col < n && row < m.length; col++) {
    const p = m.findIndex((rw, i) => i >= row && rw[col][0] !== 0)
    if (p < 0) continue
    ;[m[row], m[p]] = [m[p], m[row]]
    const pv = m[row][col]
    m[row] = m[row].map(x => div(x, pv))
    for (let i = 0; i < m.length; i++) {
      if (i === row || m[i][col][0] === 0) continue
      const f = m[i][col]
      m[i] = m[i].map((x, k) => sub(x, mul(f, m[row][k])))
    }
    pivots.push(col)
    row++
  }
  if (n - pivots.length !== 1) return null
  const free = [...Array(n).keys()].find(k => !pivots.includes(k))!
  // Free variable = 1; each pivot variable = −(its row's free-column entry).
  const sol: Q[] = Array.from({ length: n }, () => [0, 1] as Q)
  sol[free] = [1, 1]
  pivots.forEach((col, i) => { sol[col] = norm([-m[i][free][0], m[i][free][1]]) })
  const lcm = sol.reduce((l, [, q]) => (l * q) / gcd(l, q), 1)
  let ints = sol.map(([p, q]) => (p * lcm) / q)
  if (ints.every(x => x <= 0)) ints = ints.map(x => -x)
  if (ints.some(x => x <= 0)) return null
  const g = ints.reduce(gcd)
  return ints.map(x => x / g)
}

const rx = (id: string, eq: string, name: string): Reaction => {
  const [l, r] = eq.split('->').map(s => s.split('+').map(x => x.trim()))
  return { id, reactants: l, products: r, name }
}

/** Every reaction the lab knows.  All real; each balances one way only. */
export const REACTIONS: Reaction[] = [
  rx('water', 'H2 + O2 -> H2O', 'Hydrogen burning: Cavendish’s and Lavoisier’s water'),
  rx('ammonia', 'N2 + H2 -> NH3', 'The Haber–Bosch ammonia synthesis'),
  rx('carbon-monoxide', 'C + O2 -> CO', 'Charcoal burning in too little air'),
  rx('co-burn', 'CO + O2 -> CO2', 'The blue flame of carbon monoxide'),
  rx('magnesium', 'Mg + O2 -> MgO', 'Magnesium ribbon burning white'),
  rx('mercury-calx', 'HgO -> Hg + O2', 'Heating mercury calx frees oxygen'),
  rx('peroxide', 'H2O2 -> H2O + O2', 'Hydrogen peroxide decomposing'),
  rx('salt', 'Na + Cl2 -> NaCl', 'Sodium burning in chlorine'),
  rx('kaolinite', 'Al2Si2O5(OH)4 -> Al2Si2O7 + H2O', 'Firing clay: kaolinite loses its water'),
  rx('fermentation', 'C6H12O6 -> C2H5OH + CO2', 'Yeast turns sugar into alcohol'),
  rx('rust', 'Fe + O2 -> Fe2O3', 'Iron rusting'),
  rx('alumina', 'Al + O2 -> Al2O3', 'Aluminium oxidising'),
  rx('methane', 'CH4 + O2 -> CO2 + H2O', 'Natural gas burning'),
  rx('copper-smelt', 'CuO + C -> Cu + CO2', 'Smelting copper with charcoal'),
  rx('spirit-of-salt', 'NaCl + H2SO4 -> Na2SO4 + HCl', 'Glauber’s spirit of salt (hydrochloric acid)'),
  rx('zinc-acid', 'Zn + HCl -> ZnCl2 + H2', 'Zinc dissolving in acid, giving hydrogen'),
  rx('silver-tree', 'Cu + AgNO3 -> Cu(NO3)2 + Ag', 'Copper wire growing a silver tree'),
  rx('sodium-water', 'Na + H2O -> NaOH + H2', 'Davy’s sodium skating on water'),
  rx('baking-soda', 'NaHCO3 -> Na2CO3 + H2O + CO2', 'Baking soda giving off its gas'),
  rx('iron-ore', 'Fe2O3 + CO -> Fe + CO2', 'The blast furnace reducing iron ore'),
  rx('thermite', 'Al + Fe2O3 -> Al2O3 + Fe', 'Thermite: aluminium steals iron’s oxygen'),
  rx('malachite', 'Cu2(OH)2CO3 -> CuO + H2O + CO2', 'Roasting malachite, the green copper ore'),
  rx('iron-chloride', 'Fe + Cl2 -> FeCl3', 'Iron wool burning in chlorine'),
  rx('chlorate', 'KClO3 -> KCl + O2', 'Heating potassium chlorate for oxygen'),
  rx('propane', 'C3H8 + O2 -> CO2 + H2O', 'Propane burning'),
  rx('ethanol', 'C2H5OH + O2 -> CO2 + H2O', 'Spirit of wine burning'),
  rx('glucose', 'C6H12O6 + O2 -> CO2 + H2O', 'Respiration: sugar burned in the body'),
  rx('iron-carbon', 'Fe2O3 + C -> Fe + CO2', 'Bloomery: iron ore reduced by charcoal'),
  rx('galena', 'PbS + O2 -> PbO + SO2', 'Roasting galena, the lead ore'),
  rx('ostwald', 'NH3 + O2 -> NO + H2O', 'Ostwald: ammonia burned to nitric oxide'),
  rx('scheele', 'MnO2 + HCl -> MnCl2 + Cl2 + H2O', 'Scheele’s chlorine (1774)'),
  rx('copper-nitric', 'Cu + HNO3 -> Cu(NO3)2 + NO2 + H2O', 'Copper in strong aqua fortis: brown fumes'),
  rx('copper-vitriol', 'Cu + H2SO4 -> CuSO4 + SO2 + H2O', 'Copper in hot oil of vitriol makes blue vitriol'),
  rx('ethane', 'C2H6 + O2 -> CO2 + H2O', 'Ethane burning'),
  rx('acetylene', 'C2H2 + O2 -> CO2 + H2O', 'The acetylene welding flame'),
  rx('superphosphate', 'Ca3(PO4)2 + H2SO4 -> CaSO4 + H3PO4', 'Making phosphoric acid from bone ash'),
  rx('lead-nitrate', 'Pb(NO3)2 -> PbO + NO2 + O2', 'Heating lead nitrate'),
  rx('wood', 'C6H10O5 + O2 -> CO2 + H2O', 'Wood (cellulose) burning'),
  rx('gun-barrel', 'Fe + H2O -> Fe3O4 + H2', 'Lavoisier’s red-hot gun barrel splits steam'),
  rx('phosphorus', 'P4 + O2 -> P4O10', 'White phosphorus burning'),
  rx('tin-smelt', 'SnO2 + C -> Sn + CO', 'Smelting tin from cassiterite'),
  rx('permanganate', 'KMnO4 + HCl -> KCl + MnCl2 + Cl2 + H2O', 'Chlorine from permanganate'),
  rx('octane', 'C8H18 + O2 -> CO2 + H2O', 'Petrol burning'),
  rx('pyrite', 'FeS2 + O2 -> Fe2O3 + SO2', 'Roasting fool’s gold'),
  rx('copper-dilute-nitric', 'Cu + HNO3 -> Cu(NO3)2 + NO + H2O', 'Copper in dilute aqua fortis'),
  rx('sucrose', 'C12H22O11 + O2 -> CO2 + H2O', 'Cane sugar burning'),
  rx('gunpowder', 'KNO3 + C + S -> K2S + N2 + CO2', 'Black powder: saltpetre, charcoal and sulfur'),
  rx('aqua-regia', 'Au + HNO3 + HCl -> HAuCl4 + NO + H2O', 'Aqua regia dissolving gold'),
  rx('wax', 'C25H52 + O2 -> CO2 + H2O', 'Beeswax (pentacosane) burning'),
  rx('resin', 'C20H30O2 + O2 -> CO2 + H2O', 'Pine resin (abietic acid) burning'),
]
export const REACTION_BY_ID: Record<string, Reaction> = Object.fromEntries(REACTIONS.map(r => [r.id, r]))

/** Difficulty band of a reaction, from how many species it has and how big its numbers get. */
export function band(r: Reaction): Difficulty {
  const c = balance(r)!
  const species = c.length, top = Math.max(...c)
  if (species <= 3 && top <= 3) return 1
  if (species <= 4 && top <= 4) return 2
  if (species <= 5 && top <= 8) return 3
  return 4
}

// ── Titration ─────────────────────────────────────────────────────────────────

export interface Indicator { id: string; name: string; pKin: number; range: [number, number]; acid: string; base: string }
export const INDICATORS: Record<string, Indicator> = {
  methylOrange: { id: 'methylOrange', name: 'Methyl orange', pKin: 3.7, range: [3.1, 4.4], acid: '#d0382b', base: '#f2c230' },
  bromocresol: { id: 'bromocresol', name: 'Bromocresol green', pKin: 4.7, range: [3.8, 5.4], acid: '#e3c93a', base: '#2a7fa8' },
  bromothymol: { id: 'bromothymol', name: 'Bromothymol blue', pKin: 7.1, range: [6.0, 7.6], acid: '#e6cf3c', base: '#2f68c8' },
  phenolphthalein: { id: 'phenolphthalein', name: 'Phenolphthalein', pKin: 9.3, range: [8.2, 10.0], acid: '#f4efe4', base: '#df2a8c' },
}

export interface TitrationSystem {
  /** The sample in the flask. */
  analyte: string
  /** pKa values of the sample's acid system, strongest first (a strong acid uses −3). */
  pKa: number[]
  /** Counter-ions already in the sample, per mole of the acid system (1 for NaHCO₃). */
  baseEq: number
  /** What is in the burette. */
  titrant: 'NaOH' | 'HCl'
  /** Protons taken up or given per mole of sample at the endpoint. */
  eq: number
  /** Sample volume (mL), water added (mL), titrant molarity. */
  sampleMl: number
  waterMl: number
  titrantM: number
  /** Range the sample's molarity is drawn from. */
  molarity: [number, number]
  indicator: string
}

export const KW = 1e-14

/** pH of the flask after `v` mL of titrant, from the exact charge balance. */
export function pHAt(sys: TitrationSystem, molarity: number, v: number): number {
  const vt = sys.sampleMl + sys.waterMl + v
  const ca = (molarity * sys.sampleMl) / vt
  const added = (sys.titrantM * v) / vt
  const cation = ca * sys.baseEq + (sys.titrant === 'NaOH' ? added : 0)
  const anion = sys.titrant === 'HCl' ? added : 0
  const ka = sys.pKa.map(p => 10 ** -p)
  // g(pH) falls as pH rises; bisect for its root.
  const g = (pH: number) => {
    const h = 10 ** -pH
    const terms = [1]
    for (let i = 0; i < ka.length; i++) terms.push((terms[i] * ka[i]) / h)
    const sum = terms.reduce((a, b) => a + b, 0)
    const charge = terms.reduce((a, t, i) => a + i * t, 0) / sum
    return h + cation - KW / h - anion - ca * charge
  }
  let lo = -1, hi = 15
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    if (g(mid) > 0) lo = mid; else hi = mid
  }
  return (lo + hi) / 2
}

export const equivalenceMl = (sys: TitrationSystem, molarity: number) => (molarity * sys.sampleMl * sys.eq) / sys.titrantM

/** Fraction of the indicator in its base colour. */
export const baseFraction = (ind: Indicator, pH: number) => 1 / (1 + 10 ** (ind.pKin - pH))

/**
 * The burette reading at which the indicator is half turned — where a careful
 * chemist calls the endpoint.  Null if it never turns before `maxMl`.
 */
export function colourChangeMl(sys: TitrationSystem, molarity: number, ind: Indicator, maxMl = 50, step = 0.01): number | null {
  const start = baseFraction(ind, pHAt(sys, molarity, 0))
  const rising = sys.titrant === 'NaOH'
  if (rising ? start >= 0.5 : start <= 0.5) return null
  for (let v = step; v <= maxMl; v += step) {
    const f = baseFraction(ind, pHAt(sys, molarity, v))
    if (rising ? f >= 0.5 : f <= 0.5) return Math.round(v * 100) / 100
  }
  return null
}

export function mixColour(ind: Indicator, pH: number): string {
  const f = baseFraction(ind, pH)
  const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  const a = hex(ind.acid), b = hex(ind.base)
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * f)).join(',')})`
}

// ── Configs ───────────────────────────────────────────────────────────────────

export interface BalanceConfig { mode: 'balance'; title: string; intro: string; fact: string; pool: string[] }
export interface TitrationConfig { mode: 'titration'; title: string; intro: string; fact: string; system: TitrationSystem }
export type ChemistryConfig = BalanceConfig | TitrationConfig

export const CONFIGS: Record<string, ChemistryConfig> = {
  'clay-type': {
    mode: 'balance',
    title: 'Bi Sheng’s Type Kiln',
    intro: 'Atoms are never made or destroyed in a reaction. Set the numbers in front of each formula so every element counts the same on both sides.',
    fact: 'Clay turns to ceramic because heat drives the water out of kaolinite, Al₂Si₂O₅(OH)₄, at about 550 °C; the type Bi Sheng fired could not soften again. His iron plate was coated with pine resin and wax, which melt rather than burn when warmed gently.',
    pool: ['kaolinite', 'carbon-monoxide', 'rust', 'iron-carbon', 'wax', 'resin', 'gunpowder', 'wood'],
  },
  brazier: {
    mode: 'balance',
    title: 'Lu Yu’s Brazier',
    intro: 'Charcoal burns to carbon dioxide with plenty of air and to carbon monoxide with too little. Balance each reaction: the same atoms must leave as went in.',
    fact: 'Lu Yu insisted on charcoal, never greasy or resinous wood, and gave his brazier three vents to draw the wind. A good draught matters: starved of air, charcoal burns to poisonous carbon monoxide instead of carbon dioxide.',
    pool: ['carbon-monoxide', 'co-burn', 'rust', 'wood', 'methane', 'malachite', 'glucose', 'sucrose'],
  },
  'lavoisier-balance': {
    mode: 'balance',
    title: 'Lavoisier’s Balance Sheet',
    intro: '“Nothing is lost, nothing is created.” Make every element count the same on both sides; the balance shows whether the masses agree.',
    fact: 'Lavoisier weighed everything that went into and came out of his reactions and found the totals equal: the conservation of mass. He showed water is hydrogen and oxygen by burning one in the other and by splitting steam on a red-hot gun barrel.',
    pool: ['water', 'mercury-calx', 'fermentation', 'gun-barrel', 'ethanol', 'phosphorus', 'glucose', 'copper-dilute-nitric'],
  },
  'spring-water': {
    mode: 'titration',
    title: 'Lu Yu’s Spring Water',
    intro: 'Hard water carries dissolved bicarbonate. Titrate the spring with dilute hydrochloric acid and stop at the endpoint, where the indicator turns.',
    fact: 'Lu Yu ranked mountain spring water first, river water second and well water last. Water chemists still measure a spring’s “alkalinity” this way: titrating its bicarbonate with acid to an endpoint near pH 4.5, with bromocresol green rather than methyl orange, which turns too late in such dilute water.',
    system: { analyte: 'Spring water (HCO₃⁻)', pKa: [6.35, 10.33], baseEq: 1, titrant: 'HCl', eq: 1, sampleMl: 100, waterMl: 0, titrantM: 0.02, molarity: [0.0015, 0.0035], indicator: 'bromocresol' },
  },
  'lime-juice': {
    mode: 'titration',
    title: 'Limes at Tidore',
    intro: 'Measure how much citric acid a lime holds: titrate the juice with sodium hydroxide and stop when the indicator turns. Citric acid gives up three protons.',
    fact: 'Scurvy, from lack of vitamin C, killed many of Magellan’s men. Citrus cures it, as James Lind showed in 1747 — the cure is the vitamin, not the sourness. A lime’s sourness is mostly citric acid, about 0.3 mol per litre, which food chemists measure exactly like this.',
    system: { analyte: 'Lime juice (citric acid)', pKa: [3.13, 4.76, 6.40], baseEq: 0, titrant: 'NaOH', eq: 3, sampleMl: 5, waterMl: 45, titrantM: 0.25, molarity: [0.22, 0.4], indicator: 'phenolphthalein' },
  },
  vinegar: {
    mode: 'titration',
    title: 'Strength of Vinegar',
    intro: 'Vinegar is acetic acid, a weak acid. Titrate the diluted sample with sodium hydroxide and stop at the endpoint, where the indicator turns.',
    fact: 'Acetic acid gives up its proton reluctantly (pKa 4.76), so at the endpoint the flask holds sodium acetate and is slightly alkaline, near pH 8.7. That is why phenolphthalein suits this titration and methyl orange does not.',
    system: { analyte: 'Vinegar (acetic acid)', pKa: [4.76], baseEq: 0, titrant: 'NaOH', eq: 1, sampleMl: 2, waterMl: 48, titrantM: 0.1, molarity: [0.6, 1.1], indicator: 'phenolphthalein' },
  },
  'spirit-of-salt': {
    mode: 'titration',
    title: 'Glauber’s Spirit of Salt',
    intro: 'Hydrochloric acid is a strong acid. Titrate it with sodium hydroxide and stop at the endpoint, where the indicator turns.',
    fact: 'Johann Glauber made hydrochloric acid in the 1620s by heating salt with oil of vitriol. A strong acid against a strong base jumps from about pH 4 to pH 10 within a drop, so any of the three common indicators will do.',
    system: { analyte: 'Spirit of salt (HCl)', pKa: [-3], baseEq: 0, titrant: 'NaOH', eq: 1, sampleMl: 10, waterMl: 40, titrantM: 0.1, molarity: [0.15, 0.32], indicator: 'bromothymol' },
  },
}
export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Levels ────────────────────────────────────────────────────────────────────

export interface BalanceTier { rounds: number; liveAtoms: boolean; liveScale: boolean; weighs: number; fails: number; seconds: number }
export const balanceTier = (d: Difficulty): BalanceTier => ({
  rounds: scale(d, [1, 2, 2, 3]),
  liveAtoms: d <= 2,
  liveScale: d <= 3,
  weighs: scale(d, [Infinity, Infinity, 3, 2]),
  fails: scale(d, [Infinity, 4, 3, 2]),
  seconds: scale(d, [0, 0, 240, 300]),
})

export interface TitrationTier { meter: boolean; chooseIndicator: boolean; toleranceMl: number; runs: number }
export const titrationTier = (d: Difficulty): TitrationTier => ({
  meter: d <= 2,
  chooseIndicator: d >= 3,
  toleranceMl: scale(d, [0.5, 0.3, 0.2, 0.15]),
  runs: scale(d, [Infinity, 4, 3, 2]),
})

const rngFor = (configId: string, d: Difficulty, seed: number): Rng => mulberry32(seed ^ hashString(`chemistry:${configId}:${d}`))

/** The reactions to balance: from the config's pool at this tier, topped up from the whole bank. */
export function pickReactions(cfg: BalanceConfig, configId: string, d: Difficulty, seed: number): Reaction[] {
  const rng = rngFor(configId, d, seed)
  const { rounds } = balanceTier(d)
  const pool = cfg.pool.map(id => REACTION_BY_ID[id])
  // The config's own reactions come up twice as often as the rest of the bank.
  const atTier = [...pool, ...REACTIONS].filter(r => band(r) === d)
  const out: Reaction[] = []
  for (const r of shuffle(atTier, rng)) if (out.length < rounds && !out.includes(r)) out.push(r)
  for (const r of shuffle(pool.filter(x => band(x) < d), rng)) if (out.length < rounds && !out.includes(r)) out.push(r)
  return out
}

/** Where the right indicator turns for this sample: the reading a careful chemist stops at. */
export function targetMl(cfg: TitrationConfig, molarity: number): number {
  return colourChangeMl(cfg.system, molarity, INDICATORS[cfg.system.indicator]) ?? equivalenceMl(cfg.system, molarity)
}

/** The sample's molarity for this level. */
export function pickMolarity(cfg: TitrationConfig, configId: string, d: Difficulty, seed: number): number {
  const [lo, hi] = cfg.system.molarity
  if (d === 1) return Math.round(((lo + hi) / 2) * 1000) / 1000
  const rng = rngFor(configId, d, seed)
  return Number((lo + rng() * (hi - lo)).toPrecision(3))
}
