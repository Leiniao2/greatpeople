import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, pick, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Bank Run — keep a bank liquid AND solvent through a panic, one day at a
// time.  Every day a queue of depositors comes to the counter; when you open
// the doors you must pay all of them in cash, or the bank fails.
//
//   • The queue is a share of the deposits: the day's base rate plus
//     PANIC × panicStep %.  Panic rises by 2 when the vault looks thin after
//     paying (cash under 10 % of deposits), by 1 when the queue was longer
//     than yesterday's, and falls by 1 when the vault is full (≥ 25 %).
//     Announced events (a rival fails, war) add panic on their day.
//   • Assets pay their face value in cash on the day they mature.  Sold
//     early they fetch face × (100 − haircut × days-to-maturity − 2 × panic) %:
//     the longer the asset and the worse the panic, the deeper the fire sale.
//     Loans can instead be CALLED: the borrower pays face − fee tomorrow.
//   • Reassure (show the gold in the window) costs cash and takes 2 off panic.
//   • At the end the bank's capital — cash + assets at face + receivables −
//     deposits − debts — must reach the target.  Fire sales burn capital, so
//     "dump everything on day one" fails just like "never sell".
//
// Each config changes a rule:
//   medici          two branches, each pays its own queue from its own vault;
//                   a bill of exchange moves cash to the other branch, arriving
//                   tomorrow less the exchange fee.
//   amsterdam-1609  full reserve: no assets, only coin.  The city and the VOC
//                   ask for loans that pay interest (you need it to cover the
//                   costs), but any day the coin is short of the deposits the
//                   secret leaks: panic +2.
//   panic-1907      bankers' pool: a rival trust will face a run on a known
//                   day; if the pool has been paid up by then it survives (your
//                   share comes back with interest at the end), else panic +5.
//   bagehot         Lombard Street, 1866: the Bank of England lends freely at a
//                   penalty rate on GOOD collateral (bills, consols).  Pledge
//                   instead of selling; doubtful assets can only be fire-sold.
//   holiday-1933    from the proclamation day you may declare a bank holiday:
//                   no withdrawals for 2 days, then examiners reopen the bank
//                   only if its assets cover its deposits — and panic is gone.
//
//   D1  5 days, 3 assets (≈1 min)     D2  6 days, 4 assets
//   D3  7 days, 5 assets, 2 events    D4  8 days, 6 assets, 2 events (≈3 min)
//
// Every level is generated from the seed and run through the beam planner
// `solve`; the capital target is the planner's best result minus a slack that
// shrinks with difficulty.  The generator rejects levels that doing nothing,
// dumping everything, or a just-in-time seller (D3+) could pass.

export type Mode = 'branches' | 'reserve' | 'pool' | 'window' | 'holiday'
export type Kind = 'bill' | 'loan' | 'bond' | 'estate'

interface EventTpl { text: string; panic: number; pool?: boolean }

export interface BankConfig {
  title: string
  rule: string
  intro: string
  fact: string
  mode: Mode
  money: string
  branches: string[]
  names: Record<Kind, string[]>
  offerNames: string[]
  events: EventTpl[]
  baseLo: number
  baseHi: number
  panicStep: number
  reassureCost: number
  callFee: number
  windowRate: number
  transferFee: number
  poolRate: number
  costPerTurn: number
  holidayLen: number
}

const NO_NAMES: Record<Kind, string[]> = { bill: ['Bill'], loan: ['Loan'], bond: ['Bond'], estate: ['Mortgage'] }

const BASE = {
  offerNames: [] as string[],
  panicStep: 2, reassureCost: 2, callFee: 6, windowRate: 10, transferFee: 4,
  poolRate: 6, costPerTurn: 0, holidayLen: 2,
}

export const CONFIGS: Record<string, BankConfig> = {
  medici: {
    ...BASE,
    title: 'The Medici Branches',
    rule: 'Bills of exchange between branches',
    intro: 'Florence and Bruges each pay their own depositors from their own strongbox. Draw a bill of exchange to move florins to the other branch: it is paid there tomorrow, less the exchange.',
    fact: 'The Medici Bank (1397–1494) ran branches from London and Bruges to Rome, linked by bills of exchange that moved money between cities without shipping coin. Big loans to Edward IV and to Charles the Bold ruined its London and Bruges branches in the 1470s.',
    mode: 'branches', money: 'fl', branches: ['Florence', 'Bruges'],
    names: {
      bill: ['Bill on Venice', 'Bill on Geneva', 'Bill on Avignon'],
      loan: ['Loan to wool merchants', 'Loan to Charles the Bold', 'Loan to Edward IV'],
      bond: ['Shares in the Monte', 'Alum contract'],
      estate: ['Mortgage on a palazzo', 'Lien on a galley'],
    },
    events: [
      { text: 'News from Nancy: Charles the Bold is dead', panic: 3 },
      { text: 'Edward IV will not repay his loans', panic: 3 },
      { text: 'The Pazzi conspiracy strikes in the cathedral', panic: 2 },
    ],
    baseLo: 5, baseHi: 9,
  },
  'amsterdam-1609': {
    ...BASE,
    title: 'The Wisselbank of Amsterdam',
    rule: 'Full reserve: coin for every guilder',
    intro: 'Every guilder on the books is meant to be coin in the vault. The VOC and the city offer interest for loans, and you need it to pay the guards — but any day the coin falls short of the deposits, the secret leaks.',
    fact: 'The Amsterdam Exchange Bank, founded in 1609, was meant to hold coin for every guilder on its books, and its bank money traded at a premium over coin for over a century. Secret loans to the Dutch East India Company and the city in the 1780s left it short of coin, and it was wound up in 1820.',
    mode: 'reserve', money: 'ƒ', branches: ['Amsterdam'],
    names: NO_NAMES,
    offerNames: ['VOC', 'City of Amsterdam', 'States of Holland', 'Lombard house', 'WIC'],
    events: [
      { text: 'War with England: ships seized in the Channel', panic: 4 },
      { text: 'A VOC return fleet is lost', panic: 3 },
      { text: 'Rumours on the Dam that the vault is empty', panic: 3 },
    ],
    baseLo: 3, baseHi: 6, panicStep: 3, reassureCost: 1, costPerTurn: 1,
  },
  'panic-1907': {
    ...BASE,
    title: "Morgan's Bankers' Pool",
    rule: 'Pay into the pool before the rival falls',
    intro: 'Your New York trust company faces a run. Morgan is raising a pool to save the next trust under attack: if it is paid up before that day the rival survives and your share returns with interest; if not, its failure spreads the panic.',
    fact: 'When the Knickerbocker Trust failed in October 1907, J. P. Morgan gathered New York’s bankers in his library and organised pools of money to save the Trust Company of America and the stock exchange. The panic led to the Federal Reserve Act of 1913.',
    mode: 'pool', money: '$', branches: ['New York'],
    names: {
      bill: ['Commercial paper', 'Bankers’ acceptance'],
      loan: ['Call loan to brokers', 'Loan on copper shares', 'Loan to a speculator'],
      bond: ['Union Pacific bonds', 'New York City bonds'],
      estate: ['Manhattan real estate', 'Mortgage on a hotel'],
    },
    events: [
      { text: 'The Trust Company of America is under siege', panic: 5, pool: true },
      { text: 'United Copper shares collapse', panic: 2 },
      { text: 'Knickerbocker Trust closes its doors', panic: 3 },
    ],
    baseLo: 5, baseHi: 10,
  },
  bagehot: {
    ...BASE,
    title: 'Lombard Street, 1866',
    rule: 'Lend freely, at a high rate, on good security',
    intro: 'The Bank of England follows Bagehot’s rule: it will lend you its full value against good collateral — bills and consols — at a 10 % penalty rate. Pledge them instead of fire-selling; doubtful loans and mortgages it will not take.',
    fact: 'After Overend, Gurney & Co. collapsed on "Black Friday", 11 May 1866, the Bank of England lent heavily at a 10 % Bank Rate. In Lombard Street (1873) Walter Bagehot drew the lesson: in a panic, lend freely, at a high rate, against good collateral.',
    mode: 'window', money: '£', branches: ['London'],
    names: {
      bill: ['Bill of exchange', 'Treasury bill', 'Bill on Calcutta'],
      loan: ['Advance to a contractor', 'Loan to a shipping line', 'Advance on cotton'],
      bond: ['Consols', 'Indian railway stock'],
      estate: ['Mortgage on a mill', 'Dock company lien'],
    },
    events: [
      { text: 'Overend, Gurney & Co. suspends payment', panic: 4 },
      { text: 'Agra and Masterman’s Bank stops', panic: 3 },
      { text: 'A railway contractor goes bankrupt', panic: 2 },
    ],
    baseLo: 5, baseHi: 10,
  },
  'holiday-1933': {
    ...BASE,
    title: 'The 1933 Bank Holiday',
    rule: 'Declare a holiday, reopen only if sound',
    intro: 'The run is ruinous until the proclamation. From that day you may close for a 2-day bank holiday: nobody withdraws, and examiners reopen you only if your assets still cover your deposits. Reopened banks start with the panic gone.',
    fact: 'Two days after taking office, Franklin Roosevelt declared a national bank holiday on 6 March 1933. Only banks the examiners found sound reopened from 13 March, and after his first fireside chat deposits flowed back in.',
    mode: 'holiday', money: '$', branches: ['Detroit'],
    names: {
      bill: ['Treasury bill', 'Commercial paper'],
      loan: ['Farm loan', 'Call loan', 'Loan to a car dealer'],
      bond: ['Liberty bonds', 'Utility bonds'],
      estate: ['Farm mortgage', 'Detroit real estate'],
    },
    events: [
      { text: 'Michigan declares a state bank holiday', panic: 3 },
      { text: 'Gold is drained abroad', panic: 2 },
      { text: 'Newspapers print the RFC loan list', panic: 3 },
    ],
    baseLo: 8, baseHi: 13,
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ─────────────────────────────────────────────────────────────────────

export const LOW_RATIO = 0.10
export const HIGH_RATIO = 0.25
export const FIRE_PANIC = 2
export const MIN_PRICE = 40
export const REASSURE_DROP = 2

export const KIND: Record<Kind, { hc: number; max: number; callable: boolean; good: boolean }> = {
  bill:   { hc: 4, max: 20, callable: false, good: true },
  loan:   { hc: 6, max: 35, callable: true,  good: false },
  bond:   { hc: 3, max: 30, callable: false, good: true },
  estate: { hc: 6, max: 45, callable: false, good: false },
}

export interface Asset { name: string; kind: Kind; branch: number; face: number; mat: number }
export interface Offer { name: string; turn: number; amt: number; mat: number; ret: number }
export interface BankEvent { turn: number; panic: number; text: string; pool: number }

export interface Instance {
  configId: string
  mode: Mode
  difficulty: Difficulty
  turns: number
  branches: string[]
  cash0: number[]
  dep0: number[]
  panic0: number
  assets: Asset[]
  offers: Offer[]
  /** base[t][b]: base withdrawal % on day t at branch b. */
  base: number[][]
  events: BankEvent[]
  holidayFrom: number
  target: number
  /** Planner's best final capital. */
  best: number
  panicStep: number
  reassureCost: number
  callFee: number
  windowRate: number
  transferFee: number
  poolRate: number
  costPerTurn: number
  holidayLen: number
}

export interface Pending { turn: number; b: number; amt: number }

export interface BankState {
  t: number
  cash: number[]
  dep: number[]
  held: boolean[]
  pledged: boolean[]
  taken: boolean[]
  pending: Pending[]
  debt: number
  panic: number
  reassured: boolean
  poolPaid: number
  holidayLeft: number
  holidayUsed: boolean
  prevW: number
  log: { w: number; cash: number; panic: number }[]
  status: 'play' | 'won' | 'lost'
  reason: string
}

export type Action =
  | { t: 'sell'; a: number }
  | { t: 'call'; a: number }
  | { t: 'pledge'; a: number }
  | { t: 'reassure' }
  | { t: 'transfer'; from: number; amt: number }
  | { t: 'pool'; amt: number }
  | { t: 'lend'; o: number }
  | { t: 'holiday' }
  | { t: 'open' }

export type ApplyResult = { ok: true; state: BankState } | { ok: false; reason: string }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function startState(inst: Instance): BankState {
  return {
    t: 0, cash: [...inst.cash0], dep: [...inst.dep0],
    held: inst.assets.map(() => true), pledged: inst.assets.map(() => false),
    taken: inst.offers.map(() => false), pending: [], debt: 0, panic: inst.panic0,
    reassured: false, poolPaid: 0, holidayLeft: 0, holidayUsed: false, prevW: 0, log: [],
    status: 'play', reason: '',
  }
}

function clone(s: BankState): BankState {
  return {
    ...s, cash: [...s.cash], dep: [...s.dep], held: [...s.held], pledged: [...s.pledged],
    taken: [...s.taken], pending: s.pending.map(p => ({ ...p })), log: s.log,
  }
}

/** Percent of face a fire sale fetches today. */
export function pricePct(inst: Instance, s: BankState, a: number): number {
  const as = inst.assets[a], k = KIND[as.kind]
  const rem = Math.max(0, as.mat - s.t)
  return Math.max(MIN_PRICE, 100 - Math.min(k.max, k.hc * rem) - FIRE_PANIC * s.panic)
}
export const salePrice = (inst: Instance, s: BankState, a: number) => Math.floor(inst.assets[a].face * pricePct(inst, s, a) / 100)
export const callValue = (inst: Instance, a: number) => Math.floor(inst.assets[a].face * (100 - inst.callFee) / 100)
export const pledgeDebt = (inst: Instance, a: number) => Math.ceil(inst.assets[a].face * (100 + inst.windowRate) / 100)
export const poolNeed = (inst: Instance) => inst.events.find(e => e.pool > 0)?.pool ?? 0

export function canPledge(inst: Instance, s: BankState, a: number): boolean {
  return inst.mode === 'window' && KIND[inst.assets[a].kind].good && s.held[a] && !s.pledged[a]
}

/** Today's queue at branch b, at today's panic. */
export function withdrawal(inst: Instance, s: BankState, b: number): number {
  if (s.holidayLeft > 0 || s.t >= inst.turns) return 0
  const pct = inst.base[s.t][b] + s.panic * inst.panicStep
  return Math.min(s.dep[b], Math.round(s.dep[b] * pct / 100))
}

export function equity(inst: Instance, s: BankState): number {
  let v = sum(s.cash) - sum(s.dep) - s.debt
  for (const p of s.pending) v += p.amt
  inst.assets.forEach((a, i) => { if (s.held[i]) v += a.face })
  inst.offers.forEach((o, i) => { if (s.taken[i] && o.mat > s.t) v += o.amt + o.ret })
  v += Math.floor(s.poolPaid * (100 + inst.poolRate) / 100)
  return v
}

/** Start of day s.t: maturities, arrivals, events. */
function startDay(inst: Instance, s: BankState) {
  const t = s.t
  s.pending = s.pending.filter(p => {
    if (p.turn > t) return true
    s.cash[p.b] += p.amt
    return false
  })
  inst.assets.forEach((a, i) => {
    if (s.held[i] && a.mat <= t) { s.cash[a.branch] += a.face; s.held[i] = false }
  })
  inst.offers.forEach((o, i) => { if (s.taken[i] && o.mat === t) s.cash[0] += o.amt + o.ret })
  if (t < inst.turns) {
    for (const e of inst.events) {
      if (e.turn !== t) continue
      if (e.pool > 0 && s.poolPaid >= e.pool) continue
      s.panic += e.panic
    }
  }
  s.reassured = false
}

export function apply(inst: Instance, s0: BankState, a: Action): ApplyResult {
  if (s0.status !== 'play') return { ok: false, reason: 'The game is over' }
  const s = clone(s0)
  switch (a.t) {
    case 'sell': {
      if (!s.held[a.a]) return { ok: false, reason: 'Already gone' }
      if (s.pledged[a.a]) return { ok: false, reason: 'Pledged to the Bank — it stays until it matures' }
      s.cash[inst.assets[a.a].branch] += salePrice(inst, s, a.a)
      s.held[a.a] = false
      return { ok: true, state: s }
    }
    case 'call': {
      const as = inst.assets[a.a]
      if (!s.held[a.a] || !KIND[as.kind].callable) return { ok: false, reason: 'Only loans can be called' }
      if (s.pledged[a.a]) return { ok: false, reason: 'Pledged' }
      s.held[a.a] = false
      s.pending.push({ turn: s.t + 1, b: as.branch, amt: callValue(inst, a.a) })
      return { ok: true, state: s }
    }
    case 'pledge': {
      if (!canPledge(inst, s, a.a)) return { ok: false, reason: 'The Bank lends only on good security' }
      s.pledged[a.a] = true
      s.cash[inst.assets[a.a].branch] += inst.assets[a.a].face
      s.debt += pledgeDebt(inst, a.a)
      return { ok: true, state: s }
    }
    case 'reassure': {
      if (s.reassured) return { ok: false, reason: 'Already reassured today' }
      if (s.panic <= 0) return { ok: false, reason: 'Nobody is panicking' }
      if (s.cash[0] < inst.reassureCost) return { ok: false, reason: 'Not enough cash' }
      s.cash[0] -= inst.reassureCost
      s.panic = Math.max(0, s.panic - REASSURE_DROP)
      s.reassured = true
      return { ok: true, state: s }
    }
    case 'transfer': {
      if (inst.mode !== 'branches') return { ok: false, reason: 'No branches' }
      const amt = Math.floor(a.amt)
      if (amt <= 0 || amt > s.cash[a.from]) return { ok: false, reason: 'Not enough cash' }
      s.cash[a.from] -= amt
      s.pending.push({ turn: s.t + 1, b: 1 - a.from, amt: Math.floor(amt * (100 - inst.transferFee) / 100) })
      return { ok: true, state: s }
    }
    case 'pool': {
      const ev = inst.events.find(e => e.pool > 0)
      if (inst.mode !== 'pool' || !ev || s.t >= ev.turn) return { ok: false, reason: 'The pool is closed' }
      const amt = Math.min(Math.floor(a.amt), ev.pool - s.poolPaid)
      if (amt <= 0 || amt > s.cash[0]) return { ok: false, reason: 'Not enough cash' }
      s.cash[0] -= amt
      s.poolPaid += amt
      return { ok: true, state: s }
    }
    case 'lend': {
      const o = inst.offers[a.o]
      if (!o || o.turn !== s.t || s.taken[a.o]) return { ok: false, reason: 'No such offer today' }
      if (s.cash[0] < o.amt) return { ok: false, reason: 'Not enough coin' }
      s.cash[0] -= o.amt
      s.taken[a.o] = true
      return { ok: true, state: s }
    }
    case 'holiday': {
      if (inst.mode !== 'holiday' || s.holidayUsed || s.t < inst.holidayFrom) return { ok: false, reason: 'No proclamation yet' }
      s.holidayUsed = true
      s.holidayLeft = inst.holidayLen
      return { ok: true, state: s }
    }
    case 'open': {
      const ws = inst.branches.map((_, b) => withdrawal(inst, s, b))
      for (let b = 0; b < ws.length; b++) {
        if (s.cash[b] < ws[b]) {
          s.status = 'lost'
          s.reason = `${inst.branches[b]} could not pay its queue (${ws[b]} due, ${s.cash[b]} in the vault)`
          return { ok: true, state: s }
        }
        s.cash[b] -= ws[b]
        s.dep[b] -= ws[b]
      }
      if (inst.costPerTurn) {
        if (s.cash[0] < inst.costPerTurn) { s.status = 'lost'; s.reason = 'No coin left to pay the staff'; return { ok: true, state: s } }
        s.cash[0] -= inst.costPerTurn
      }
      const W = sum(ws)
      if (s.holidayLeft > 0) {
        s.holidayLeft--
        if (s.holidayLeft === 0) {
          if (equity(inst, s) < 0) { s.status = 'lost'; s.reason = 'The examiners found the bank insolvent'; return { ok: true, state: s } }
          s.panic = 0
        }
      } else {
        const ratio = Math.min(...s.cash.map((c, b) => (s.dep[b] > 0 ? c / s.dep[b] : 1)))
        if (inst.mode === 'reserve' && sum(s.cash) < sum(s.dep)) s.panic += 2
        else if (ratio < LOW_RATIO) s.panic += 2
        else if (W > s.prevW && s.t > 0) s.panic += 1
        else if (ratio >= HIGH_RATIO) s.panic = Math.max(0, s.panic - 1)
      }
      s.prevW = W
      s.log = [...s.log, { w: W, cash: sum(s.cash), panic: s.panic }]
      s.t++
      startDay(inst, s)
      if (s.t >= inst.turns) {
        const eq = equity(inst, s)
        if (eq >= inst.target) s.status = 'won'
        else { s.status = 'lost'; s.reason = `Capital ${eq} is short of the ${inst.target} target` }
      }
      return { ok: true, state: s }
    }
  }
}

export function run(inst: Instance, path: Action[], s: BankState = startState(inst)): BankState {
  for (const a of path) {
    const r = apply(inst, s, a)
    if (r.ok) s = r.state
    if (s.status !== 'play') break
  }
  return s
}

// ── Planner ──────────────────────────────────────────────────────────────────

/** Cheapest way to raise `need` cash today at branch b from its assets. */
export function fill(inst: Instance, s: BankState, b: number, need: number): Action[] | null {
  if (need <= 0) return []
  const items: { opts: { a: Action; cash: number; loss: number }[] }[] = []
  inst.assets.forEach((as, i) => {
    if (as.branch !== b || !s.held[i] || s.pledged[i]) return
    const opts: { a: Action; cash: number; loss: number }[] = []
    const p = salePrice(inst, s, i)
    opts.push({ a: { t: 'sell', a: i }, cash: p, loss: as.face - p })
    if (canPledge(inst, s, i)) opts.push({ a: { t: 'pledge', a: i }, cash: as.face, loss: pledgeDebt(inst, i) - as.face })
    items.push({ opts })
  })
  let best: { loss: number; acts: Action[] } | null = null
  const cur: Action[] = []
  const rec = (k: number, cash: number, loss: number) => {
    if (best && loss >= best.loss) return
    if (cash >= need) { best = { loss, acts: [...cur] }; return }
    if (k >= items.length) return
    for (const o of items[k].opts) { cur.push(o.a); rec(k + 1, cash + o.cash, loss + o.loss); cur.pop() }
    rec(k + 1, cash, loss)
  }
  rec(0, 0, 0)
  return best ? (best as { acts: Action[] }).acts : null
}

function applyAll(inst: Instance, s: BankState, acts: Action[]): BankState | null {
  for (const a of acts) {
    const r = apply(inst, s, a)
    if (!r.ok) return null
    s = r.state
  }
  return s
}

function keyOf(s: BankState) {
  return `${s.cash}|${s.dep}|${s.held.map(Number).join('')}|${s.pledged.map(Number).join('')}|${s.taken.map(Number).join('')}|${s.pending.map(p => p.turn + ':' + p.b + ':' + p.amt)}|${s.panic}|${s.debt}|${s.poolPaid}|${s.holidayLeft}${s.holidayUsed}`
}

/** Candidate day plans (everything before and including 'open'). */
export function dayPlans(inst: Instance, s: BankState): Action[][] {
  const specials: Action[][] = [[]]
  if (inst.mode === 'pool') {
    const ev = inst.events.find(e => e.pool > 0)
    if (ev && s.t < ev.turn && s.poolPaid < ev.pool) specials.push([{ t: 'pool', amt: ev.pool - s.poolPaid }])
  }
  if (inst.mode === 'reserve') {
    const today = inst.offers.map((o, i) => (o.turn === s.t ? i : -1)).filter(i => i >= 0)
    for (let m = 1; m < 1 << today.length; m++) specials.push(today.filter((_, j) => m & (1 << j)).map(o => ({ t: 'lend', o }) as Action))
  }
  if (inst.mode === 'holiday' && !s.holidayUsed && s.t >= inst.holidayFrom) specials.push([{ t: 'holiday' }])
  if (inst.mode === 'branches') {
    for (let b = 0; b < 2; b++) {
      const sur = s.cash[b] - withdrawal(inst, s, b)
      if (sur >= 4) { specials.push([{ t: 'transfer', from: b, amt: Math.floor(sur / 2) }]); specials.push([{ t: 'transfer', from: b, amt: sur }]) }
    }
  }
  const callable = inst.assets.map((a, i) => (s.held[i] && !s.pledged[i] && KIND[a.kind].callable ? i : -1)).filter(i => i >= 0)
  const calls: Action[][] = [[]]
  if (callable.length && s.t + 1 < inst.turns) {
    const sorted = [...callable].sort((x, y) => inst.assets[x].face - inst.assets[y].face)
    calls.push([{ t: 'call', a: sorted[0] }])
    if (sorted.length > 1) calls.push(sorted.map(a => ({ t: 'call', a }) as Action))
  }
  const plans: Action[][] = []
  for (const sp of specials) for (const re of [false, true]) for (const cl of calls) {
    const st = applyAll(inst, s, [...sp, ...(re ? [{ t: 'reassure' } as Action] : []), ...cl])
    if (!st) continue
    const pre: Action[] = [...sp, ...(re ? [{ t: 'reassure' } as Action] : []), ...cl]
    for (let level = 0; level < 4; level++) {
      const acts: Action[] = [...pre]
      let ok = true
      let cur = st
      for (let b = 0; b < inst.branches.length; b++) {
        const w = withdrawal(inst, cur, b)
        const after = cur.dep[b] - w
        const want = level === 0 ? w
          : level === 1 ? w + Math.ceil(LOW_RATIO * after)
          : level === 2 ? w + Math.ceil(HIGH_RATIO * after)
          : 2 * w + Math.ceil(LOW_RATIO * after)
        const f = fill(inst, cur, b, want - cur.cash[b])
        if (!f) { ok = false; break }
        const nx = applyAll(inst, cur, f)
        if (!nx) { ok = false; break }
        cur = nx
        acts.push(...f)
      }
      if (!ok) continue
      acts.push({ t: 'open' })
      plans.push(acts)
    }
  }
  return plans
}

export interface Solution { path: Action[]; equity: number }

/** Beam search over day plans; returns the best surviving path (target ignored). */
export function solve(inst: Instance, width = 14): Solution | null {
  const free = { ...inst, target: -1e9 }
  let beam: { s: BankState; path: Action[] }[] = [{ s: startState(free), path: [] }]
  let best: Solution | null = null
  for (let day = 0; day < inst.turns && beam.length; day++) {
    const next = new Map<string, { s: BankState; path: Action[]; score: number }>()
    for (const node of beam) {
      for (const plan of dayPlans(free, node.s)) {
        const st = applyAll(free, node.s, plan)
        if (!st || st.status === 'lost') continue
        if (st.status === 'won') {
          const eq = equity(free, st)
          if (!best || eq > best.equity) best = { path: [...node.path, ...plan], equity: eq }
          continue
        }
        const k = keyOf(st)
        if (next.has(k)) continue
        const score = equity(free, st) - 2.5 * st.panic + 0.12 * sum(st.cash)
        next.set(k, { s: st, path: [...node.path, ...plan], score })
      }
    }
    const all = [...next.values()]
    const byScore = [...all].sort((a, b) => b.score - a.score).slice(0, width)
    const byCash = [...all].sort((a, b) => sum(b.s.cash) - 2 * b.s.panic - (sum(a.s.cash) - 2 * a.s.panic)).slice(0, Math.ceil(width / 3))
    const seen = new Set<BankState>()
    beam = []
    for (const n of [...byScore, ...byCash]) if (!seen.has(n.s)) { seen.add(n.s); beam.push(n) }
  }
  return best
}

// ── Naive strategies (used by the generator and the tests) ───────────────────

export function doNothing(inst: Instance): BankState {
  return run(inst, Array.from({ length: inst.turns }, () => ({ t: 'open' }) as Action))
}

/** Dump every asset (and lend every offer) on day one, then just open. */
export function dumpAll(inst: Instance): BankState {
  let s = startState(inst)
  if (inst.mode === 'reserve') {
    for (let d = 0; d < inst.turns && s.status === 'play'; d++) {
      inst.offers.forEach((o, i) => { if (o.turn === s.t) { const r = apply(inst, s, { t: 'lend', o: i }); if (r.ok) s = r.state } })
      const r = apply(inst, s, { t: 'open' }); if (r.ok) s = r.state
    }
    return s
  }
  s = run(inst, inst.assets.map((_, a) => ({ t: 'sell', a }) as Action), s)
  return run(inst, Array.from({ length: inst.turns }, () => ({ t: 'open' }) as Action), s)
}

/** Each day raise exactly today's queue at the lowest loss; nothing else. */
export function justInTime(inst: Instance): BankState {
  let s = startState(inst)
  while (s.status === 'play') {
    for (let b = 0; b < inst.branches.length; b++) {
      const f = fill(inst, s, b, withdrawal(inst, s, b) - s.cash[b])
      if (f) s = run(inst, f, s)
    }
    const r = apply(inst, s, { t: 'open' })
    if (!r.ok) break
    s = r.state
  }
  return s
}

// ── Generator ────────────────────────────────────────────────────────────────

const SLACK: readonly [number, number, number, number] = [5, 4, 3, 2]

function generate(id: string, difficulty: Difficulty, rng: Rng): Instance {
  const cfg = CONFIGS[id]
  const N = scale(difficulty, [5, 6, 7, 8])
  const nAssets = scale(difficulty, [3, 4, 5, 6])
  const nb = cfg.branches.length
  const dep0 = nb === 2 ? [60, 50] : [100]
  const capital = cfg.mode === 'reserve' ? randInt(rng, 8, 11) : randInt(rng, 9, 14)
  const cash0 = dep0.map(d => (cfg.mode === 'reserve' ? 0 : Math.round(d * randInt(rng, 12, 18) / 100)))
  if (cfg.mode === 'reserve') cash0[0] = dep0[0] + capital
  const assets: Asset[] = []
  if (cfg.mode !== 'reserve') {
    const kinds: Kind[] = ['bill', 'loan', 'bond', 'estate']
    const list: Kind[] = []
    for (let i = 0; i < nAssets; i++) list.push(i < 4 ? kinds[(i + randInt(rng, 0, 3)) % 4] : pick(kinds, rng))
    if (!list.includes('bill')) list[0] = 'bill'
    if (!list.includes('loan')) list[1] = 'loan'
    const total = sum(dep0) + capital - sum(cash0)
    const w = list.map(() => 1 + rng() * 2)
    const ws = sum(w)
    let left = total
    const used = new Map<string, number>()
    list.forEach((k, i) => {
      const face = i === list.length - 1 ? left : Math.max(5, Math.round(total * w[i] / ws))
      left -= face
      const mat = k === 'bill' ? randInt(rng, 1, 3) : k === 'loan' ? randInt(rng, 2, N + 1) : k === 'bond' ? N + randInt(rng, 2, 6) : N + randInt(rng, 4, 8)
      const names = cfg.names[k]
      const n = used.get(k) ?? randInt(rng, 0, names.length - 1)
      used.set(k, n + 1)
      assets.push({ name: names[n % names.length], kind: k, branch: nb === 2 ? i % 2 : 0, face, mat })
    })
    if (left !== 0) assets[assets.length - 1].face += left
  }
  const offers: Offer[] = []
  if (cfg.mode === 'reserve') {
    for (let t = 0; t < N - 1; t++) {
      const n = rng() < 0.75 ? 1 : 2
      for (let j = 0; j < n; j++) {
        const len = randInt(rng, 1, 4)
        const amt = 5 * randInt(rng, 2, 6)
        offers.push({ name: pick(cfg.offerNames, rng), turn: t, amt, mat: t + len, ret: Math.max(1, Math.round(amt * len * randInt(rng, 4, 7) / 100)) })
      }
    }
  }
  const holidayFrom = cfg.mode === 'holiday' ? N - scale(difficulty, [2, 3, 3, 4]) : 0
  const base: number[][] = []
  for (let t = 0; t < N; t++) {
    base.push(Array.from({ length: nb }, () => {
      if (cfg.mode === 'holiday' && t >= holidayFrom + 2) return randInt(rng, 2, 4)
      return randInt(rng, cfg.baseLo, cfg.baseHi)
    }))
  }
  const nEv = difficulty >= 3 ? 2 : 1
  const tpl = cfg.events
  const events: BankEvent[] = []
  const t1 = cfg.mode === 'pool' ? randInt(rng, 2, Math.max(2, Math.floor(N / 2) + 1)) : randInt(rng, 1, Math.max(1, Math.floor(N / 2)))
  events.push({ turn: t1, panic: tpl[0].panic, text: tpl[0].text, pool: tpl[0].pool ? Math.round(sum(dep0) * randInt(rng, 6, 11) / 100) : 0 })
  if (nEv > 1) {
    const e2 = tpl[1 + randInt(rng, 0, tpl.length - 2)]
    let t2 = randInt(rng, 1, N - 2)
    if (t2 === t1) t2 = Math.min(N - 2, t1 + 1)
    events.push({ turn: t2, panic: e2.panic, text: e2.text, pool: 0 })
  }
  events.sort((a, b) => a.turn - b.turn)
  return {
    configId: id, mode: cfg.mode, difficulty, turns: N, branches: [...cfg.branches], cash0, dep0, panic0: 1,
    assets, offers, base, events, holidayFrom, target: -1e9, best: 0,
    panicStep: cfg.panicStep, reassureCost: cfg.reassureCost, callFee: cfg.callFee, windowRate: cfg.windowRate,
    transferFee: cfg.transferFee, poolRate: cfg.poolRate, costPerTurn: cfg.costPerTurn, holidayLen: cfg.holidayLen,
  }
}

export interface Checked { inst: Instance; solution: Solution }

const cache = new Map<string, Checked>()

export function makeLevel(configId: string, difficulty: Difficulty, seed: number): Checked {
  const id = CONFIGS[configId] ? configId : 'panic-1907'
  const key = `${id}:${difficulty}:${seed}`
  const hit = cache.get(key)
  if (hit) return hit
  const rng = mulberry32(hashString(`bankrun:${key}`))
  let fallback: Checked | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const raw = generate(id, difficulty, rng)
    const sol = solve(raw)
    if (!sol) continue
    const target = sol.equity - SLACK[difficulty - 1]
    if (target < 1) continue
    const inst = { ...raw, target, best: sol.equity }
    if (run(inst, sol.path).status !== 'won') continue
    if (doNothing(inst).status === 'won') continue
    const res = { inst, solution: sol }
    if (!fallback) fallback = res
    if (difficulty >= 3 && (dumpAll(inst).status === 'won' || justInTime(inst).status === 'won')) continue
    cache.set(key, res)
    return res
  }
  if (!fallback) throw new Error(`bankrun: no level for ${key}`)
  cache.set(key, fallback)
  return fallback
}

export const makeInstance = (configId: string, difficulty: Difficulty, seed: number) => makeLevel(configId, difficulty, seed).inst

// ── Component ─────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<Kind, string> = { bill: 'bill', loan: 'loan', bond: 'bond', estate: 'property' }

function QueueChart({ inst, s, forecast }: { inst: Instance; s: BankState; forecast: number }) {
  const W = 320, H = 116, top = 14, bot = 22
  const n = inst.turns
  const bw = W / n
  const vals = [...s.log.map(l => Math.max(l.w, l.cash)), forecast, sum(s.cash), 10]
  const max = Math.max(...vals)
  const y = (v: number) => H - bot - (v / max) * (H - top - bot)
  const pts = s.log.map((l, i) => `${i * bw + bw / 2},${y(l.cash)}`)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none rounded-lg border border-line bg-panel" data-testid="bank-chart">
      <line x1={0} y1={H - bot} x2={W} y2={H - bot} stroke="#b89f6e" strokeWidth={1} />
      {Array.from({ length: n }, (_, d) => {
        const x = d * bw
        const ev = inst.events.filter(e => e.turn === d)
        const past = s.log[d]
        const today = d === s.t && s.status === 'play'
        return (
          <g key={d}>
            {past && <rect x={x + bw * 0.2} y={y(past.w)} width={bw * 0.6} height={H - bot - y(past.w)} fill="#9b2c23" opacity={0.75} />}
            {today && <rect x={x + bw * 0.2} y={y(forecast)} width={bw * 0.6} height={H - bot - y(forecast)} fill="#9b2c23" opacity={0.25}
              stroke="#9b2c23" strokeDasharray="3 2" />}
            {today && <text x={x + bw / 2} y={y(forecast) - 3} fontSize={8} textAnchor="middle" fill="#9b2c23" fontWeight="bold">{forecast}</text>}
            {past && <text x={x + bw / 2} y={y(past.w) - 3} fontSize={7} textAnchor="middle" fill="#5a4b36">{past.w}</text>}
            {ev.length > 0 && <text x={x + bw / 2} y={10} fontSize={9} textAnchor="middle" fill={d >= s.t ? '#9b2c23' : '#8a7a5e'}>⚑</text>}
            {inst.mode === 'holiday' && d === inst.holidayFrom && <text x={x + bw / 2} y={10} fontSize={8} textAnchor="middle" fill="#2f6b3a">✦</text>}
            <text x={x + bw / 2} y={H - 9} fontSize={8} textAnchor="middle" fill={today ? '#9b2c23' : '#8a7a5e'} fontWeight={today ? 'bold' : 'normal'}>D{d + 1}</text>
          </g>
        )
      })}
      {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke="#2f6b3a" strokeWidth={1.5} />}
      {s.log.map((l, i) => <circle key={i} cx={i * bw + bw / 2} cy={y(l.cash)} r={2} fill="#2f6b3a" />)}
      <text x={W - 4} y={H - 1} fontSize={7} textAnchor="end" fill="#5a4b36">▮ queue paid · ● cash left after paying</text>
    </svg>
  )
}

const btn = 'h-9 px-2 rounded-lg border text-[11px] font-bold disabled:opacity-40'

export default function BankRunGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'panic-1907')
  const inst = useMemo(() => makeInstance(configId, difficulty, seed), [configId, difficulty, seed])
  const [state, setState] = useState<BankState>(() => startState(inst))
  const [msg, setMsg] = useState('')
  const [amt, setAmt] = useState(0)
  const [from, setFrom] = useState(0)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const live = useRef({ state, settled })
  live.current = { state, settled }
  useEffect(() => { setState(startState(inst)); setMsg(''); setAmt(0) }, [inst])

  const act = (a: Action) => {
    const cur = live.current
    if (cur.settled || cur.state.status !== 'play') return
    const r = apply(inst, cur.state, a)
    if (!r.ok) { setMsg(r.reason); return }
    live.current = { ...cur, state: r.state }
    setState(r.state); setMsg('')
    if (r.state.status === 'won') { live.current.settled = true; win() }
    else if (r.state.status === 'lost') { live.current.settled = true; lose(r.state.reason) }
  }

  const s = state
  const m = cfg.money
  const ws = inst.branches.map((_, b) => withdrawal(inst, s, b))
  const forecast = sum(ws)
  const eq = equity(inst, s)
  const poolEv = inst.events.find(e => e.pool > 0)
  const poolOpen = inst.mode === 'pool' && !!poolEv && s.t < poolEv.turn && s.poolPaid < poolEv.pool
  const sliderMax = inst.mode === 'branches' ? s.cash[from] : poolOpen ? Math.min(s.cash[0], poolEv!.pool - s.poolPaid) : 0
  const amount = Math.min(amt, sliderMax)
  const upcoming = inst.events.filter(e => e.turn >= s.t)
  const holidayOk = inst.mode === 'holiday' && !s.holidayUsed && s.t >= inst.holidayFrom
  const day = Math.min(s.t, inst.turns - 1)

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-panel border border-line text-[10px] font-bold text-ink-2">{cfg.rule}</p>
          <p className="text-muted text-xs leading-relaxed mt-1">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2" data-testid="bank-day">Day {day + 1} / {inst.turns}</p>
          <p data-testid="bank-panic" className={s.panic >= 4 ? 'text-red-600 font-bold' : ''}>Panic {s.panic}</p>
          <p data-testid="bank-capital" className={eq < inst.target ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'}>Capital {eq}</p>
          <p>Target ≥ {inst.target}</p>
          {s.debt > 0 && <p>Owed to Bank {s.debt}</p>}
          {s.holidayLeft > 0 && <p className="text-emerald-700 font-bold">Holiday: {s.holidayLeft} day{s.holidayLeft > 1 ? 's' : ''}</p>}
        </div>
      </div>

      <QueueChart inst={inst} s={s} forecast={forecast} />

      {upcoming.length > 0 && (
        <div className="text-[10px] text-ink-2 leading-snug">
          {upcoming.map((e, i) => (
            <p key={i}>⚑ Day {e.turn + 1}: {e.text} — panic +{e.panic}
              {e.pool > 0 && <span className="font-bold"> unless the pool holds {e.pool} ({s.poolPaid} paid)</span>}
            </p>
          ))}
        </div>
      )}
      {inst.mode === 'holiday' && !s.holidayUsed && (
        <p className="text-[10px] text-emerald-800">✦ The proclamation comes on day {inst.holidayFrom + 1}.</p>
      )}

      <div className={`grid gap-2 ${inst.branches.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {inst.branches.map((name, b) => (
          <div key={b} className="rounded-lg border border-line bg-panel p-2 text-[11px]" data-testid={`branch-${b}`}>
            <p className="font-bold text-ink">{name}</p>
            <p className="tabular-nums">Vault <b data-testid={`cash-${b}`}>{s.cash[b]}</b> {m} · deposits {s.dep[b]}</p>
            <p className={`tabular-nums ${s.cash[b] < ws[b] ? 'text-red-600 font-bold' : 'text-ink-2'}`}>
              Queue today {ws[b]}{s.cash[b] < ws[b] ? ` — short ${ws[b] - s.cash[b]}` : ''}
            </p>
            {s.pending.filter(p => p.b === b).map((p, i) => (
              <p key={i} className="text-muted">+{p.amt} arriving day {p.turn + 1}</p>
            ))}
          </div>
        ))}
      </div>

      {inst.assets.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {inst.assets.map((a, i) => {
            const gone = !s.held[i]
            if (gone) return null
            const pct = pricePct(inst, s, i)
            return (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5" data-testid={`asset-${i}`}>
                <div className="flex-1 min-w-0 text-[11px] leading-tight">
                  <p className="font-bold text-ink truncate">{a.name}</p>
                  <p className="text-muted tabular-nums">
                    {a.face} {m} {KIND_LABEL[a.kind]}{inst.branches.length > 1 ? ` · ${inst.branches[a.branch]}` : ''} · {a.mat < inst.turns ? `pays day ${a.mat + 1}` : 'matures after the crisis'}
                    {inst.mode === 'window' && (KIND[a.kind].good ? ' · good security' : ' · doubtful')}
                    {s.pledged[i] && <b className="text-ink-2"> · pledged</b>}
                  </p>
                </div>
                {!s.pledged[i] && (
                  <button type="button" data-testid={`sell-${i}`} disabled={settled} onClick={() => act({ t: 'sell', a: i })}
                    className={`${btn} bg-panel-2 border-line-2 text-ink`}>Sell {salePrice(inst, s, i)}<span className="font-normal text-muted"> ({pct}%)</span></button>
                )}
                {!s.pledged[i] && KIND[a.kind].callable && (
                  <button type="button" data-testid={`call-${i}`} disabled={settled} onClick={() => act({ t: 'call', a: i })}
                    className={`${btn} bg-panel-2 border-line-2 text-ink`}>Call {callValue(inst, i)}<span className="font-normal text-muted"> tmrw</span></button>
                )}
                {canPledge(inst, s, i) && (
                  <button type="button" data-testid={`pledge-${i}`} disabled={settled} onClick={() => act({ t: 'pledge', a: i })}
                    className={`${btn} bg-emerald-600/10 border-emerald-700/40 text-emerald-800`}>Pledge +{a.face}<span className="font-normal"> owe {pledgeDebt(inst, i)}</span></button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {inst.mode === 'reserve' && (
        <div className="flex flex-col gap-1.5">
          {inst.offers.map((o, i) => {
            if (o.turn !== s.t && !s.taken[i]) return null
            if (s.taken[i] && o.mat <= s.t) return null
            return (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-line bg-panel px-2 py-1.5 text-[11px]">
                <p className="flex-1 min-w-0 leading-tight">
                  <b className="text-ink">{o.name}</b> borrows {o.amt} {m} · repays {o.amt + o.ret} on {o.mat < inst.turns ? `day ${o.mat + 1}` : 'after the crisis'}
                </p>
                {s.taken[i] ? <span className="text-muted font-bold">lent</span> : (
                  <button type="button" data-testid={`lend-${i}`} disabled={settled} onClick={() => act({ t: 'lend', o: i })}
                    className={`${btn} bg-panel-2 border-line-2 text-ink`}>Lend {o.amt}</button>
                )}
              </div>
            )
          })}
          <p className="text-[10px] text-muted">Coin {sum(s.cash)} vs deposits {sum(s.dep)} {sum(s.cash) < sum(s.dep) ? '— SHORT: the secret will leak when you open' : '— fully backed'}</p>
        </div>
      )}

      {(inst.mode === 'branches' || poolOpen) && !settled && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-panel p-2 text-[11px]">
          {inst.mode === 'branches' ? (
            <div className="flex items-center gap-1.5">
              <span className="text-ink-2 font-bold">Bill of exchange</span>
              {inst.branches.map((n, b) => (
                <button key={b} type="button" data-testid={`transfer-from-${b}`} onClick={() => setFrom(b)}
                  className={`${btn} ${from === b ? 'bg-accent text-accent-fg border-accent' : 'bg-panel-2 border-line text-ink'}`}>{n} → {inst.branches[1 - b]}</button>
              ))}
            </div>
          ) : (
            <span className="text-ink-2 font-bold">Morgan’s pool: {s.poolPaid} / {poolEv!.pool} paid in, returns +{inst.poolRate}% at the end</span>
          )}
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={Math.max(0, sliderMax)} value={amount} data-testid="amount"
              onChange={e => setAmt(Number(e.target.value))} className="flex-1 accent-[#9b2c23] h-8" />
            <span className="w-8 text-right tabular-nums font-bold">{amount}</span>
            <button type="button" data-testid={inst.mode === 'branches' ? 'transfer' : 'pool'} disabled={amount <= 0}
              onClick={() => act(inst.mode === 'branches' ? { t: 'transfer', from, amt: amount } : { t: 'pool', amt: amount })}
              className={`${btn} bg-panel-2 border-line-2 text-ink`}>
              {inst.mode === 'branches' ? `Draw (arrives ${Math.floor(amount * (100 - inst.transferFee) / 100)})` : 'Pay in'}
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-center min-h-[16px] text-red-600 font-bold" data-testid="bank-msg">{msg}</p>

      {!settled && (
        <div className="flex items-center gap-2">
          <button type="button" data-testid="reassure" disabled={s.reassured || s.panic <= 0} onClick={() => act({ t: 'reassure' })}
            className={`${btn} h-11 bg-panel border-line text-ink`}>Reassure −{inst.reassureCost}<br /><span className="font-normal">panic −{REASSURE_DROP}</span></button>
          {inst.mode === 'holiday' && (
            <button type="button" data-testid="holiday" disabled={!holidayOk} onClick={() => act({ t: 'holiday' })}
              className={`${btn} h-11 bg-emerald-600/10 border-emerald-700/40 text-emerald-800`}>Bank holiday<br /><span className="font-normal">{inst.holidayLen} days</span></button>
          )}
          <button type="button" data-testid="open" onClick={() => act({ t: 'open' })}
            className="flex-1 h-11 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg font-bold text-xs">
            {s.holidayLeft > 0 ? 'Next holiday day' : `Open the doors — pay ${forecast}`}
          </button>
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? '' : `Queue = deposits × (day rate + ${inst.panicStep}% × panic). Panic +2 if the vault is under 10% after paying, +1 if the queue grew, −1 if the vault is over 25%. Fire sales fetch less the longer the asset and the higher the panic.`}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The bank stands!" loseTitle="The bank has failed" />
    </div>
  )
}
