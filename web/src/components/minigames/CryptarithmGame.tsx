import { useMemo, useState, useCallback, useEffect } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, hashString, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Merchant Sums: letter-for-digit arithmetic (cryptarithms) on trade words.
//
// Each letter stands for one digit, different letters for different digits,
// and no number starts with 0. Every puzzle in the bank was found by search
// and has exactly one solution (re-verified by the tests with `countSolutions`).
// A few letters are given up front so the work fits a short challenge:
//
//   D1  short words, 3 letters to find   ~1 min   1 hint, 3 mistakes
//   D2  4 letters to find                ~1.5 min 1 hint, 3 mistakes
//   D3  5 letters to find                ~2 min           2 mistakes
//   D4  longest words, 6 letters to find ~3 min           2 mistakes
//
// Contradictions are shown live (a digit used twice, a leading zero) and a
// column turns green or red once it and every column to its right are filled.
// "Seal the ledger" checks the sum; a wrong seal is a mistake.

export type Kind = 'add' | 'sub' | 'mul' | 'add3'

interface CryptConfig {
  title: string
  intro: string
  fact: string
  kind: Kind
}

export const CONFIGS: Record<string, CryptConfig> = {
  addition: {
    title: 'The Pisan Ledger',
    intro: 'Each letter hides one digit; different letters, different digits; no number starts with 0. Make the merchant’s sum add up.',
    fact: 'Leonardo of Pisa (Fibonacci) learned Hindu-Arabic numerals in the markets of North Africa; his Liber Abaci of 1202 taught them to Europe’s merchants.',
    kind: 'add',
  },
  subtraction: {
    title: 'The Venetian Debt',
    intro: 'A subtraction this time: the top line less the second gives the bottom. Each letter is one digit, none leading with 0.',
    fact: 'Venetian merchants popularised double-entry bookkeeping; Luca Pacioli set out the method in print in his Summa de arithmetica of 1494.',
    kind: 'sub',
  },
  multiply: {
    title: 'Dudeney’s Puzzle Shop',
    intro: 'A word multiplied by a single letter gives the answer below. Each letter is one digit, none leading with 0. Watch the carries.',
    fact: 'Henry Dudeney published SEND + MORE = MONEY in the Strand Magazine in July 1924 — the most famous letter-for-digit puzzle ever set.',
    kind: 'mul',
  },
  'three-ledgers': {
    title: 'The Hanseatic Tally',
    intro: 'Three accounts are added into one total. Each letter is one digit, different letters different digits, none leading with 0.',
    fact: 'The Hanseatic League linked some 200 towns from London to Novgorod; its merchants at Lübeck kept accounts in Roman numerals well into the 1500s.',
    kind: 'add3',
  },
  'chanel-ledger': {
    title: 'The House Accounts',
    intro: 'Chanel checks the books herself. Each letter hides one digit; different letters, different digits; no number starts with 0. Make the sum add up.',
    fact: 'In 1924 Chanel let Pierre and Paul Wertheimer found Parfums Chanel to sell No. 5. They took 70% and the department-store owner Théophile Bader 20%; Chanel kept 10% — a share she fought over in the courts for twenty years.',
    kind: 'add',
  },
  'mendel-tally': {
    title: 'The Brno Tallies',
    intro: 'Three counts from the pea beds are added into one total. Each letter is one digit, different letters different digits, none leading with 0.',
    fact: 'In his seed-shape cross Mendel counted 5,474 round seeds and 1,850 wrinkled ones in the second generation — a ratio of 2.96 to 1. He reported such counts for all seven traits in his 1866 paper.',
    kind: 'add3',
  },
  'lorentz-algebra': {
    title: 'The Leiden Calculation',
    intro: 'A word multiplied by a single letter gives the answer below. Each letter is one digit, none leading with 0. Work the carries as carefully as an equation.',
    fact: 'Lorentz set out his transformation in full in 1904. In 1905 Henri Poincaré named it the Lorentz transformation — the same year Einstein derived it afresh from two simple postulates.',
    kind: 'mul',
  },
  'mellon-treasury': {
    title: 'The Treasury Books',
    intro: 'A subtraction: the top line less the second gives the bottom. Each letter is one digit, none leading with 0. Balance the books.',
    fact: 'Under Treasury Secretary Mellon the federal government ran a surplus every year of the 1920s, cutting the national debt from about $24 billion in 1921 to about $16 billion by 1930.',
    kind: 'sub',
  },
}

// ── Puzzle bank ───────────────────────────────────────────────────────────────
// "A+B=C", "A+B+C=D" and "A*M=C" (M a single letter). Subtraction reuses the
// addition bank read backwards: C − B = A.

const ADD_BANK: string[] = [
  'HIDES+LINEN=CAMELS', 'STALL+WAGON=ATHENS', 'COPPER+SPARTA=ATHENS', 'NILE+SHIELD=CREDIT',
  'GHANA+KHAN=LUBECK', 'ASIA+COAST=THRONE', 'MONKS+SPARTA=MARKET', 'COPPER+SPICES=BRONZE',
  'FRANK+NUN=IVORY', 'COPPER+CORN=ATHENS', 'PLATO+RENT=CAESAR', 'CROWN+TALLY=ANCHOR',
  'JAPAN+PEARL=VENICE', 'FISH+GHANA=SCALES', 'BABEL+LEDGER=CAMELS', 'DOCK+TRADE=SCALES',
  'JAPAN+PEARL=THRONE', 'GREEK+WINE=BAZAAR', 'GATE+NORSE=BRUGES', 'CLERK+RENT=SPARTA',
  'CARGO+GHANA=LEDGER', 'PEARL+TRADES=SHIELD', 'PETRA+STALL=ABACUS', 'AGRA+PLATO=THRONE',
  'STALL+WAGON=TIGRIS', 'PETRA+TIGRIS=MARKET', 'BOATS+LOOM=CAESAR', 'AMBER+DELTA=LONDON',
  'KNIGHT+SALTS=VIKING', 'DECK+RIVER=LONDON', 'REEFS+THRONE=LONDON', 'FIGS+REEFS=LONDON',
  'FISH+GHANA=SPICES', 'CANAL+WAVE=SILVER', 'COPPER+CORN=LUBECK', 'HIDES+WALL=PERSIA',
  'FRANK+NUN=STORM', 'BRONZE+HORSE=ATHENS', 'FORTS+SUMS=THRONE', 'GRAIN+SPEAR=VIKING', 'NINE+WINE=HIDE',
  'GEM+TEN=TANG', 'NINE+WINE=TIDE', 'SAIL+SEAL=WELLS', 'LOOM+POPE=KEEL', 'NINE+WINE=RICE',
  'NINE+WINE=FIVE', 'SAIL+SEAL=LINEN', 'FEES+STEEL=DELTA', 'LOOM+POPE=WELLS', 'EARL+ORES=SPEAR',
  'LOOM+POPE=MILLS', 'NINE+WINE=HIDES', 'NINE+WINE=DEBIT', 'CORN+REEF=FORGE', 'CORN+REEF=NORSE',
  'PETRA+RAJA=JAPAN', 'ORES+ROADS=CEDAR', 'FEES+ONE=SAXON', 'OAR+SHAH=REEFS', 'ARMOR+IRON=CAIRO',
  'NINE+WINE=MILLS', 'GATE+STEEL=WELLS', 'GHANA+KHAN=KINGS', 'ASIA+COAST=STALL', 'LOOM+SUMS=STEEL',
  'ROPE+SCOT=PORTS', 'CART+CELT=LANCE', 'RENT+WINE=RIVER', 'LOOM+POPE=CAMEL', 'CART+CELT=DELTA',
  'LOOM+POPE=STEEL', 'SAIL+SEAL=TALLY', 'FEES+ONE=SIDON', 'PISA+SILK=CANAL', 'ASS+GATE=BREAD',
  'SAILS+SHIPS=PERSIA', 'LINEN+STEEL=CRETE', 'CRETE+DELTA=LEDGER', 'BREAD+ORE=INDIA', 'FORT+PERU=PORTS',
  'CANAL+SEAL=NORSE', 'GATE+STEEL=CAMELS', 'SCALES+SPICE=PERSIA', 'FEES+TEA=AKSUM', 'NUN+VASE=STEEL',
  'DUES+DYE=TALLY', 'FORT+PERU=FORTS', 'GAZA+INDIA=LINEN', 'PETRA+STALL=TRADES', 'DYE+ORES=SPEAR',
  'HULL+KING=KINGS', 'OAR+SHAH=PLATO', 'FEES+TEN=LANCE', 'GHANA+KHAN=MONKS', 'ASS+GATE=LINEN',
  'SALT+SCROLL=CAESAR', 'ASS+GATE=QUEEN', 'LOOM+SUMS=LINEN', 'GHANA+KHAN=SAILS', 'KINGS+WINE=GREEK',
  'TAX+WOOL=DELTA', 'SHAH+TOWER=ARROW', 'FEES+STEEL=PLATO', 'NINE+WINE=MASTS', 'COPPER+SPICES=PERSIA',
  'DUNE+MILL=DUNES', 'SWORD+WOOL=MILLS', 'GEM+LOOM=SCALE', 'LOOM+SUMS=SWORD', 'CANAL+SEAL=LONDON',
  'RAJA+SIX=MILLS', 'GHANA+KHAN=SALTS', 'ARAB+FAIR=GREEK', 'PETRA+STALL=CAMELS', 'CHINA+GREECE=ANCHOR',
  'CAIRO+NERO=THRONE', 'BREAD+CAESAR=SPARTA', 'BOAT+NUN=DATES', 'CAMEL+MAST=PETRA',
  'HORSE+MYRRH=CICERO', 'SALTS+SCALES=VENICE', 'ANCHOR+CHINA=GREECE', 'BOAT+NUN=CARGO',
  'MONEY+POPE=CICERO', 'GEM+LOOM=PETRA', 'ANCHOR+CHINA=THRONE', 'CHINA+GREECE=CICERO',
  'CAMEL+MAST=SULTAN', 'SALT+SCROLL=COPPER', 'CRETE+DELTA=COPPER', 'SALTS+SCALES=PERSIA',
  'CRETE+DELTA=CICERO', 'CEDAR+FUR=DUNES', 'SPEAR+STALL=COASTS', 'GEM+LOOM=DEBIT', 'FISH+SHIELD=LONDON',
  'CAESAR+TRADES=SCRIBE', 'RIVER+WELLS=VENICE', 'REEFS+WELL=COPPER', 'SILK+VENICE=SPICES',
  'CICERO+HOLD=LEDGER', 'COAST+FORT=GREECE', 'CEDAR+FUR=DATES', 'FEES+ONE=MYRRH', 'PETRA+STALL=ATHENS',
  'LINEN+STEEL=SCRIBE', 'BOAT+NERO=GHANA', 'CAESAR+STALL=SPICES', 'CAMELS+MAST=GREECE',
  'CANAL+SEAL=PERSIA', 'AGRA+PLATO=GRAIN', 'LOOMS+SCOT=CICERO', 'ANCHOR+GREEK=GREECE',
]
const MUL_BANK: string[] = [
  'LEDGER*N=ANCHOR', 'CEDAR*C=PROFIT', 'PLATO*L=VIKING', 'CADIZ*V=SILVER', 'MONEY*N=SPARTA',
  'SHIELD*E=KNIGHT', 'FORGE*E=ATHENS', 'DATES*U=LUBECK', 'CAESAR*E=PROFIT', 'TRADE*C=LUBECK',
  'BOATS*O=KNIGHT', 'DELTA*I=VIKING', 'COASTS*I=KNIGHT', 'CHINA*I=MARKET', 'VENICE*A=SULTAN',
  'CROWN*O=KNIGHT', 'TOWER*N=VIKING', 'SIDON*O=BRUGES', 'PROFIT*C=CAESAR', 'WAGON*N=CAMELS',
  'PROFIT*V=SILVER', 'STAMP*D=CREDIT', 'CAIRO*O=BRUGES', 'MONEY*E=ABACUS', 'STAMP*E=CICERO',
  'CREDIT*A=ABACUS', 'BRUGES*T=MARKET', 'WHEAT*B=LUBECK', 'SILVER*K=LUBECK', 'CAMELS*C=PHARAOH',
  'TIN*N=FEE', 'OARS*S=ASIA', 'NILE*N=WINE', 'OAR*R=SUSA', 'TIN*I=NILE', 'MORE*O=ARMOR', 'RAJA*R=SUSA',
  'DAM*D=ASIA', 'WALL*A=LOAN', 'NILE*L=ISLES', 'GEM*M=ASS', 'SEND*E=DUNE', 'NUN*A=LAW', 'FEE*S=FIGS',
  'FEE*E=NERO', 'FEE*O=TWO', 'ISLE*A=SEAL', 'DAM*D=MALI', 'FEE*E=SEAL', 'NUN*N=REEF', 'FISH*I=SHIPS',
  'NINE*E=FEES', 'TEN*D=SEND', 'TOLL*A=LOAN', 'NUN*U=OIL', 'NINE*N=KILN', 'SALT*L=STEEL', 'FUR*F=AGRA',
  'AGRA*G=TANG', 'TOLL*T=FORT', 'NILE*I=HULL', 'GULF*U=FURS', 'KING*N=INCA', 'LOAN*A=OARS',
  'GEMS*S=WELL', 'GATE*G=FEES', 'WELL*V=FIVE', 'ISLE*S=DUES', 'TIN*I=EMIR', 'NINE*D=DOME',
  'ARCH*L=CANAL', 'FISH*S=NINE', 'CELT*D=DEBT', 'SHIP*A=OASIS', 'CORN*I=NINE', 'PORTS*T=STORM',
  'SUSA*A=CAPE', 'ROAD*R=CART', 'OASIS*I=SAXON', 'ORES*N=SEND', 'JADE*E=AGRA', 'CODE*S=DUES',
  'GAZA*L=MILL', 'GRAIN*A=INDIA', 'NILE*A=INDIA', 'PORT*R=ORES', 'FIVE*E=ASIA', 'CELT*T=CAMEL',
  'MOOR*R=RICE', 'MEAT*T=SALTS', 'BREAD*K=GREEK', 'KING*G=HULL', 'LORD*G=FORGE', 'HIDES*I=SPICE',
  'SALTS*R=PETRA', 'LAMP*A=BANK', 'DATES*E=CEDAR', 'EARL*R=CARGO', 'MILL*P=JAPAN', 'CAIRO*I=ROADS',
  'WOOL*D=HIDE', 'CAMEL*L=TALLY', 'PARIS*C=SPICES', 'KEEL*N=TANG', 'TIDE*I=MING', 'AMBER*M=REEFS',
  'COIN*O=ARROW', 'NORSE*E=THRONE', 'TOMB*A=COAST', 'MASTS*S=ABACUS', 'TRADE*R=AMBER', 'CROWN*E=CICERO',
  'CAPE*E=SHIPS', 'SOUK*S=NORSE', 'LORD*R=ISLES', 'PORT*O=GOLD', 'KEEL*O=CLOTH', 'SALTS*T=PEARL',
  'LINEN*O=OASIS', 'PISA*O=ROADS', 'FIVE*T=SALTS', 'PORTS*R=GREECE', 'LINEN*L=FORGE', 'TOWER*O=COASTS',
  'CEDAR*B=DEBIT', 'REEFS*T=WHEAT', 'LORDS*B=BOATS', 'CARGO*R=HOMER', 'SCALE*B=LUBECK', 'MONKS*T=STAMP',
  'WHEAT*W=SPEAR', 'GREEK*A=PARIS', 'WHEAT*T=SPEAR', 'CAPES*A=NORSE', 'PARIS*R=STEEL', 'CAIRO*C=SPARTA',
  'ROADS*M=MONKS', 'GRAIN*E=BREAD', 'BREAD*L=CLERK', 'CANAL*S=SPEAR', 'VIKING*K=TIGRIS',
  'CHINA*C=STALL', 'JAPAN*Y=MONEY', 'MILLS*C=SCRIBE', 'REEFS*R=SHIELD', 'THRONE*T=BRONZE',
  'AMBER*B=SCALES', 'BABEL*E=MONEY', 'MYRRH*M=DELHI', 'MILLS*R=CAESAR', 'FRANK*A=SHIPS',
  'LANCE*I=PERSIA', 'LOOMS*B=SCRIBE', 'PORTS*E=SCALES', 'TIGRIS*V=VENICE', 'FORTS*S=LINEN',
  'ROMAN*E=CAPES', 'ARMOR*E=DELHI', 'TALLY*T=NORSE', 'CREDIT*C=SHIELD', 'EGYPT*G=CLOTH',
  'CROWN*N=SCRIBE', 'CLOTH*H=JAPAN', 'FRANK*K=TRADES', 'DELTA*O=SWORD', 'CADIZ*D=WELLS',
  'CARGO*P=SHIPS', 'DUNES*E=EGYPT', 'COAST*I=LINEN', 'FORTS*A=CANAL', 'PLATO*I=TIGRIS', 'HOMER*C=COAST',
  'ARROW*A=DELHI', 'CARGO*H=THRONE', 'LOOMS*M=VIKING', 'PORTS*C=SCALES', 'IVORY*T=PLATO',
  'WAGON*G=VENICE', 'WHEAT*T=PORTS', 'TRADE*V=SILVER',
]
const ADD3_BANK: string[] = [
  'BAY+CORN+SHAH=SAXON', 'MUSK+SEA+TEA=PLATO', 'DAM+DYE+MOOR=SCALE', 'OX+SCOT+TAX=FRANK',
  'SEA+SEND+URN=BOATS', 'FUR+MING+UR=OASIS', 'KILN+OIL+TEA=ARROW', 'DUES+FUR+SHAH=STEEL',
  'OAR+ONE+SUMS=LANCE', 'CELT+HUE+LAW=ARROW', 'COIN+JADE+TIN=CAIRO', 'DAM+FOUR+TROY=TALLY',
  'GAUL+MUSK+OIL=MASTS', 'DANE+RED+SEAL=COINS', 'OX+SCOT+TAX=PEARL', 'HAN+TEA+TROY=CROWN',
  'DAM+DYE+MOOR=EGYPT', 'SEA+SUM+TSAR=FORGE', 'GEM+LOOM+TEA=GRAIN', 'OX+SCOT+TAX=BREAD',
  'KILN+OIL+TEA=TRADE', 'OX+SCOT+TAX=GRAIN', 'FAIR+OAR+UR=SPICE', 'ARAB+GATE+TEA=AKSUM',
  'BAY+EMIR+MALI=MONEY', 'MOOR+ROME+TWO=TOWER', 'DYE+NILE+NINE=LINEN', 'INK+MING+MONK=KINGS',
  'DYE+NILE+NINE=DELHI', 'FEES+NERO+UR=NORSE', 'NERO+ORES+REEF=FORT', 'KILN+ONE+ORE=LINEN',
  'CODE+RED+ROAD=CAIRO', 'BOAT+OAR+TSAR=FORTS', 'LORD+RED+WOOL=WELLS', 'ASIA+WAVE+WELL=SAILS',
  'ASS+WAVE+WELL=ISLES', 'BOAT+OAR+TSAR=PORTS', 'LOAN+PEN+POPE=BABEL', 'ORE+REEF+WALL=ARROW',
  'ARAB+GATE+TEA=BREAD', 'ASS+MALI+MUSK=AKSUM', 'BOAT+OAR+TSAR=ARROW', 'CODE+RED+ROAD=ROADS',
  'LOOM+OIL+WINE=LINEN', 'DANE+LOAN+TEN=DELTA', 'MOOR+ROME+TWO=STORM', 'ASS+WAVE+WELL=SALTS',
  'OAR+OARS+SOUK=ARROW', 'LOAN+PEN+POPE=GENOA', 'OAR+POPE+ROAN=PETRA', 'AGRA+TOLL+TSAR=LOOMS',
  'ORE+PORT+SEA=STALL', 'HAN+HUN+POPE=QUEEN', 'KEEL+LORD+RED=WELLS', 'SEA+SEND+URN=CEDAR',
  'NERO+ORE+UR=WAGON', 'NERO+ORES+REEF=SWORD', 'NERO+ORES+REEF=STORM', 'SEA+SEND+URN=TRADE',
  'MOOR+ROME+TWO=MYRRH', 'ACRE+DYE+ROAD=ROADS', 'MORE+NILE+WINE=LOOM', 'CAPE+CORN+DANE=CEDAR',
  'PISA+SHAH+TEA=SALTS', 'ORE+PORT+SEA=DATES', 'AGRA+ASIA+GEMS=ARMOR', 'NERO+ORE+UR=SAXON',
  'DANE+RED+SEAL=DUNES', 'HAN+SEA+XIAN=OASIS', 'OAR+SEA+WOOL=REEFS', 'NUN+SALT+VASE=SALTS',
  'KILN+ONE+ORE=RIVER', 'KILN+ONE+ORE=GREEK', 'HULL+MUSK+OIL=MILLS', 'NERO+ORE+UR=CARGO',
  'NERO+ORE+UR=SIDON', 'KEEL+LORD+ROME=HELM', 'CAPE+PEN+PERU=CANAL', 'ARAB+GATE+TEA=STEEL',
  'ARAB+GATE+TEA=GENOA', 'COIN+ORE+TYRE=CRETE', 'NINE+ONE+TWO=OASIS', 'HUE+SAIL+SUMS=MILLS',
  'FEE+REEF+WIND=RIVER', 'NERO+ORES+REEF=SHAH', 'OAR+ROME+SEAL=REEFS', 'MAST+MILL+NILE=MASTS',
  'LORD+ONE+POPE=LINEN', 'DANE+RED+SEAL=SALTS', 'PISA+SHAH+TEA=PARIS', 'OIL+SEA+XIAN=SALTS',
  'CORN+ONE+SEA=STEEL', 'AGRA+DAM+TALC=CEDAR', 'GEM+LOOM+TEA=GHANA', 'OX+SCOT+TAX=JAPAN',
  'FEE+MOOR+TOMB=TRADE', 'AGRA+GEM+NUN=BREAD', 'OX+SCOT+TAX=INDIA', 'LOOM+ORE+SUM=DUNES',
  'ORES+OX+TAX=CAIRO', 'OX+SCOT+TAX=DELTA', 'SEA+SUM+TSAR=PEARL', 'DAM+GEM+SEAL=GUILD',
  'NINE+ONE+TWO=HIDES', 'KEEL+LORD+ROME=CELT', 'DAM+TEN+XIAN=TRADE', 'IRON+NUN+TYRE=TOWER',
  'CODE+HAN+SEND=SAXON', 'OIL+SEA+XIAN=SCALE', 'DAM+DYE+MOOR=CAMEL', 'KEEL+OX+TAX=MASTS',
  'KEEL+OX+TAX=OASIS', 'FURS+OX+REEF=OASIS', 'HAN+ROAN+SEA=COINS', 'OX+TAX+WIND=OASIS',
  'OIL+SEA+XIAN=STALL', 'DAM+GEM+SEAL=TRADE', 'DANE+LOAN+TEN=LORDS', 'GEM+LOOM+TEA=FORGE',
  'MUSK+SEA+TEA=TRADE', 'KILN+ONE+ORE=STEEL', 'MAST+OAR+PEN=PETRA',
]

// ── Pure logic ────────────────────────────────────────────────────────────────

export interface Equation {
  /** Addends (or the multiplicand for multiplication). */
  terms: string[]
  result: string
  /** The single-letter multiplier, for multiplication. */
  mult?: string
}

export type Assignment = Record<string, number>

export function parseEquation(s: string): Equation {
  const [lhs, result] = s.split('=')
  if (lhs.includes('*')) {
    const [a, m] = lhs.split('*')
    return { terms: [a], result, mult: m }
  }
  return { terms: lhs.split('+'), result }
}

const allWords = (eq: Equation) => [...eq.terms, eq.result]
const maxLen = (eq: Equation) => Math.max(...allWords(eq).map(w => w.length))

/** Letters in solving order: the multiplier, then column by column from the right. */
export function lettersOf(eq: Equation): string[] {
  const out: string[] = []
  const add = (c: string) => { if (!out.includes(c)) out.push(c) }
  if (eq.mult) add(eq.mult)
  const words = allWords(eq)
  for (let k = 1; k <= maxLen(eq); k++) for (const w of words) if (w.length >= k) add(w[w.length - k])
  return out
}

/** Letters that may not be 0: the first letter of every multi-digit number, and the multiplier. */
export function leadingLetters(eq: Equation): Set<string> {
  const s = new Set(allWords(eq).filter(w => w.length > 1).map(w => w[0]))
  if (eq.mult) s.add(eq.mult)
  return s
}

const lowDigits = (w: string, k: number, a: Assignment) => {
  let v = 0
  for (let i = Math.max(0, w.length - k); i < w.length; i++) v = v * 10 + a[w[i]]
  return v
}

const columnKnown = (eq: Equation, k: number, a: Assignment) =>
  (!eq.mult || a[eq.mult] !== undefined) &&
  allWords(eq).every(w => { for (let i = Math.max(0, w.length - k); i < w.length; i++) if (a[w[i]] === undefined) return false; return true })

/** Does the lowest-k-columns identity hold (k = maxLen means the whole equation)? */
function columnHolds(eq: Equation, k: number, a: Assignment): boolean {
  const m = 10 ** k
  const lhs = eq.mult ? lowDigits(eq.terms[0], k, a) * a[eq.mult] : eq.terms.reduce((t, w) => t + lowDigits(w, k, a), 0)
  if (k >= maxLen(eq)) return lhs === lowDigits(eq.result, k, a)
  return lhs % m === lowDigits(eq.result, k, a) % m
}

/**
 * Per column (index 0 = units): 'ok' / 'bad' once it and all columns to its
 * right are filled, otherwise 'open'. Everything left of a bad column is open.
 */
export function columnStatus(eq: Equation, a: Assignment): ('ok' | 'bad' | 'open')[] {
  const L = maxLen(eq)
  const out: ('ok' | 'bad' | 'open')[] = Array(L).fill('open')
  for (let k = 1; k <= L; k++) {
    if (!columnKnown(eq, k, a)) break
    if (!columnHolds(eq, k, a)) { out[k - 1] = 'bad'; break }
    out[k - 1] = 'ok'
  }
  return out
}

/** Letters in conflict: sharing a digit with another letter, or a leading zero. */
export function conflicts(eq: Equation, a: Assignment): Set<string> {
  const bad = new Set<string>()
  const lead = leadingLetters(eq)
  const letters = Object.keys(a)
  for (const c of letters) {
    if (a[c] === 0 && lead.has(c)) bad.add(c)
    for (const o of letters) if (o !== c && a[o] === a[c]) bad.add(c)
  }
  return bad
}

/** A complete, contradiction-free assignment that makes the sum true. */
export function isSolution(eq: Equation, a: Assignment): boolean {
  const letters = lettersOf(eq)
  if (!letters.every(c => a[c] !== undefined && a[c] >= 0 && a[c] <= 9)) return false
  if (conflicts(eq, a).size) return false
  const L = maxLen(eq)
  for (let k = 1; k <= L; k++) if (!columnHolds(eq, k, a)) return false
  return true
}

/**
 * Count solutions (up to `limit`) by column-wise backtracking, honouring any
 * letters already fixed in `given`. Returns the count and the first solution.
 */
export function countSolutions(eq: Equation, limit = 2, given: Assignment = {}): { count: number; first: Assignment | null } {
  const letters = lettersOf(eq)
  if (letters.length > 10) return { count: 0, first: null }
  const lead = leadingLetters(eq)
  const L = maxLen(eq)
  const a: Assignment = {}
  const used = Array(10).fill(false)
  let count = 0
  let first: Assignment | null = null
  const consistent = () => {
    for (let k = 1; k <= L; k++) {
      if (!columnKnown(eq, k, a)) break
      if (!columnHolds(eq, k, a)) return false
    }
    return true
  }
  const rec = (i: number) => {
    if (count >= limit) return
    if (i === letters.length) { count++; if (!first) first = { ...a }; return }
    const c = letters[i]
    const choices = given[c] !== undefined ? [given[c]] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    for (const d of choices) {
      if (used[d] || (d === 0 && lead.has(c))) continue
      a[c] = d; used[d] = true
      if (consistent()) rec(i + 1)
      used[d] = false; delete a[c]
    }
  }
  rec(0)
  return { count, first }
}

export interface Tier { unknowns: number; mistakes: number; hints: number }

export function tierFor(difficulty: Difficulty): Tier {
  return {
    unknowns: scale(difficulty, [3, 4, 5, 6]),
    mistakes: scale(difficulty, [3, 3, 2, 2]),
    hints: scale(difficulty, [1, 1, 0, 0]),
  }
}

/** Bank entries by difficulty: shorter words and fewer letters at the low end. */
export function bankFor(kind: Kind, difficulty: Difficulty): string[] {
  const bank = kind === 'mul' ? MUL_BANK : kind === 'add3' ? ADD3_BANK : ADD_BANK
  // Short words on the easy tiers so a sum reads at a glance.
  const cap = difficulty <= 2 ? 5 : 7
  const fits = bank.filter(s => maxLen(parseEquation(s)) <= cap)
  const scored = fits.map(s => {
    const eq = parseEquation(s)
    return { s, score: lettersOf(eq).length * 10 + maxLen(eq) }
  }).sort((x, y) => x.score - y.score || (x.s < y.s ? -1 : 1))
  // Four overlapping bands over the bank sorted by size.
  const n = scored.length
  const band = Math.max(1, Math.ceil(n / 3))
  const start = Math.round(((difficulty - 1) / 3) * (n - band))
  return scored.slice(start, start + band).map(x => x.s)
}

export interface Puzzle {
  kind: Kind
  eq: Equation
  /** Rows as displayed: top lines, then the answer line. */
  rows: string[]
  /** The operator shown before the last top line. */
  op: '+' | '−' | '×'
  solution: Assignment
  letters: string[]
  revealed: string[]
  tier: Tier
}

export function generate(config: Pick<CryptConfig, 'kind'>, difficulty: Difficulty, seed: number): Puzzle {
  const tier = tierFor(difficulty)
  const rng = mulberry32(seed ^ hashString('crypt:' + config.kind))
  const bank = bankFor(config.kind, difficulty)
  const src = bank[Math.floor(rng() * bank.length)]
  const eq = parseEquation(src)
  const solution = countSolutions(eq, 1).first!
  const letters = lettersOf(eq)
  const reveal = Math.max(0, letters.length - tier.unknowns)
  const revealed = shuffle(letters, rng).slice(0, reveal)
  let rows: string[]
  let op: Puzzle['op']
  if (config.kind === 'sub') {
    // C − B = A, choosing which addend is subtracted by seed.
    const swap = rng() < 0.5
    const [a, b] = swap ? [eq.terms[1], eq.terms[0]] : eq.terms
    rows = [eq.result, b, a]
    op = '−'
  } else if (config.kind === 'mul') {
    rows = [eq.terms[0], eq.mult!, eq.result]
    op = '×'
  } else {
    rows = [...eq.terms, eq.result]
    op = '+'
  }
  return { kind: config.kind, eq, rows, op, solution, letters: [...letters].sort(), revealed, tier }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CryptarithmGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = resolveConfig(CONFIGS, configId, params, 'addition')
  const puzzle = useMemo(() => generate(config, difficulty, seed), [config.kind, difficulty, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const initial = useMemo(() => {
    const a: Assignment = {}
    for (const c of puzzle.revealed) a[c] = puzzle.solution[c]
    return a
  }, [puzzle])
  const [assign, setAssign] = useState<Assignment>(initial)
  const [given, setGiven] = useState<Set<string>>(() => new Set(puzzle.revealed))
  const [sel, setSel] = useState<string | null>(() => puzzle.letters.find(c => !puzzle.revealed.includes(c)) ?? null)
  const [mistakes, setMistakes] = useState(0)
  const [hintsUsed, setHintsUsed] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const bad = conflicts(puzzle.eq, assign)
  const cols = columnStatus(puzzle.eq, assign)
  const L = Math.max(...puzzle.rows.map(r => r.length))
  const allSet = puzzle.letters.every(c => assign[c] !== undefined)
  const lead = leadingLetters(puzzle.eq)

  const nextOpen = useCallback((a: Assignment, from: string | null) => {
    const open = puzzle.letters.filter(c => !given.has(c) && a[c] === undefined)
    if (!open.length) return from
    const after = open.find(c => from !== null && c > from)
    return after ?? open[0]
  }, [puzzle.letters, given])

  const setDigit = useCallback((d: number | null) => {
    if (settled || !sel || given.has(sel)) return
    const a = { ...assign }
    if (d === null) delete a[sel]; else a[sel] = d
    setAssign(a)
    setFlash(null)
    if (d !== null) setSel(nextOpen(a, sel))
  }, [settled, sel, given, assign, nextOpen])

  const seal = useCallback(() => {
    if (settled || !allSet) return
    if (isSolution(puzzle.eq, assign)) { win(); return }
    const m = mistakes + 1
    setMistakes(m)
    if (m >= puzzle.tier.mistakes) lose('The books would not balance')
    else setFlash('The books don’t balance — check the red marks.')
  }, [settled, allSet, puzzle, assign, mistakes, win, lose])

  const hint = useCallback(() => {
    if (settled || hintsUsed >= puzzle.tier.hints) return
    const c = puzzle.letters.find(x => !given.has(x) && assign[x] !== puzzle.solution[x])
    if (!c) return
    const a = { ...assign }
    // Free the digit if another letter holds it.
    for (const o of Object.keys(a)) if (o !== c && a[o] === puzzle.solution[c] && !given.has(o)) delete a[o]
    a[c] = puzzle.solution[c]
    setAssign(a)
    setGiven(g => new Set(g).add(c))
    setHintsUsed(h => h + 1)
    setSel(nextOpen(a, c))
  }, [settled, hintsUsed, puzzle, given, assign, nextOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settled) return
      const k = e.key.toUpperCase()
      if (/^[0-9]$/.test(k)) setDigit(Number(k))
      else if (k === 'BACKSPACE' || k === 'DELETE') setDigit(null)
      else if (k === 'ENTER') seal()
      else if (puzzle.letters.includes(k) && !given.has(k)) setSel(k)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settled, setDigit, seal, puzzle.letters, given])

  const usedBy = (d: number) => puzzle.letters.filter(c => assign[c] === d)
  const colClass = (k: number) => cols[k] === 'ok' ? 'bg-emerald-500/15' : cols[k] === 'bad' ? 'bg-red-500/20' : ''
  const cell = 'w-8 h-10 sm:w-9 sm:h-11 flex flex-col items-center justify-center rounded'

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted">
          <p className="font-bold text-ink-2">{puzzle.letters.length - puzzle.revealed.length} to find</p>
          <p data-testid="crypt-mistakes" className={mistakes ? 'text-red-600 font-bold' : ''}>✗ {mistakes}/{puzzle.tier.mistakes}</p>
        </div>
      </div>

      {/* The sum, right-aligned by column. */}
      <div className="mx-auto bg-panel border border-line rounded-xl px-3 py-2 font-mono">
        {puzzle.rows.map((w, r) => {
          const isAnswer = r === puzzle.rows.length - 1
          const isOpRow = r === puzzle.rows.length - 2
          return (
            <div key={r} className={`flex items-center ${isAnswer ? 'border-t-2 border-ink-2 mt-1 pt-1' : ''}`}>
              <span className="w-5 text-ink-2 font-bold text-lg">{isOpRow ? puzzle.op : ''}</span>
              {Array.from({ length: L }, (_, i) => {
                const k = L - 1 - i
                const c = w[w.length - 1 - k]
                const d = c ? assign[c] : undefined
                const wrong = c && (bad.has(c) || (d === 0 && lead.has(c) && w.length > 1 && w[0] === c))
                return (
                  <button key={i} type="button" disabled={!c || settled}
                    onClick={() => c && !given.has(c) && setSel(c)}
                    data-cell={c ? `${r}:${k}` : undefined}
                    className={`${cell} ${colClass(k)} ${c && sel === c ? 'ring-2 ring-accent' : ''}`}>
                    {c && <>
                      <span className={`text-lg font-bold leading-none ${wrong ? 'text-red-600' : d !== undefined ? 'text-ink' : 'text-muted/40'}`}>{d ?? '·'}</span>
                      <span className={`text-[9px] leading-none ${given.has(c) ? 'text-accent' : 'text-muted'}`}>{c}</span>
                    </>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Letter tiles */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {puzzle.letters.map(c => {
          const locked = given.has(c)
          const d = assign[c]
          return (
            <button key={c} type="button" data-letter={c} disabled={settled || locked}
              onClick={() => setSel(c)}
              aria-label={`letter ${c}${d !== undefined ? ` is ${d}` : ''}`}
              className={`w-11 h-12 rounded-lg border-2 flex flex-col items-center justify-center font-mono
                ${locked ? 'bg-paper border-line text-muted' : sel === c ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink'}
                ${bad.has(c) ? 'border-red-500' : ''}`}>
              <span className="text-sm font-bold leading-none">{c}</span>
              <span className={`text-base leading-none ${bad.has(c) ? 'text-red-600 font-bold' : ''}`}>{d ?? '?'}</span>
            </button>
          )
        })}
      </div>

      {/* Digit pad */}
      <div className="grid grid-cols-6 gap-1.5 max-w-[360px] mx-auto w-full">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(d => {
          const holders = usedBy(d)
          return (
            <button key={d} type="button" data-digit={d} disabled={settled || !sel}
              onClick={() => setDigit(d)}
              className={`h-11 rounded-lg border text-lg font-bold font-mono
                ${holders.length ? 'bg-paper border-line text-muted' : 'bg-panel border-line text-ink hover:border-accent/50'}`}>
              {d}
              {holders.length > 0 && <span className="block text-[8px] leading-none -mt-0.5">{holders.join('')}</span>}
            </button>
          )
        })}
        <button type="button" data-digit="clear" disabled={settled || !sel} onClick={() => setDigit(null)}
          className="h-11 rounded-lg border bg-panel border-line text-ink-2 text-xs font-bold col-span-2">⌫ Clear</button>
      </div>

      {flash && !settled && <p data-testid="crypt-flash" className="text-center text-xs text-red-600 font-bold">{flash}</p>}

      {!settled && (
        <div className="flex gap-2">
          {puzzle.tier.hints > 0 && (
            <button type="button" onClick={hint} disabled={hintsUsed >= puzzle.tier.hints}
              className={`flex-1 h-10 rounded-lg border text-xs font-bold ${hintsUsed < puzzle.tier.hints ? 'bg-panel border-line text-ink-2' : 'bg-paper border-line text-muted/50'}`}>
              ✦ Ask the clerk ({puzzle.tier.hints - hintsUsed})
            </button>
          )}
          <button type="button" data-testid="seal" onClick={seal} disabled={!allSet}
            className={`flex-[2] h-10 rounded-lg text-sm font-bold ${allSet ? 'bg-accent text-accent-fg' : 'bg-paper border border-line text-muted/50'}`}>
            Seal the ledger
          </button>
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The books balance!" loseTitle={reason ?? 'The books would not balance'} />
    </div>
  )
}

export const CONFIG_IDS = Object.keys(CONFIGS)
