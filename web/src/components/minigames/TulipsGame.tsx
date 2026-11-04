import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Tulip Mania — ride a speculative bubble and get out before it bursts.
//
// The price is driven by a seeded model of momentum buyers ("greater
// fools"): a pool of would-be buyers turns up each week at a rate that
// grows with last week's return and with easy credit, while holders take
// profits.  As the pool runs dry, fewer buyers turn up, the credit share
// of the market climbs, and the week buyers fall below sellers the price
// turns and the panic starts — no buyers come at all and the price falls
// every week from then on.  The signals (buyers vs sellers, credit share)
// are on the chart; the future is not.
//
//   • You trade at this week's price.  Buying is limited by the sellers in
//     the market (a fixed cap per week) and your cash; SELLING IS LIMITED
//     BY THE BUYERS WHO TURN UP — in a crash you can dump one lot a week.
//   • Win: be out of the market (nothing held or pending) with the target
//     in hand.  Lose: the market closes first, or you go bankrupt.
//
// Variants (each a different market rule, not just a bigger bubble):
//   haarlem-1637   futures: deals settle L weeks later; if the price has
//                  fallen under ¾ of the deal by then, the buyer walks away
//                  paying 3.5% (your buyers — and you).  Bankrupt if a
//                  settlement leaves you short.
//   south-sea-1720 insider subscriptions at a discount, locked for a few
//                  weeks; a one-week shakeout tempts you out early.
//   mississippi-1720 paper notes: you are paid in notes that inflate; only
//                  silver counts, and the bank converts a capped amount a
//                  week.  Law pegs the share price (unlimited buyers, in
//                  paper), then an edict devalues the notes.
//   railway-1840s  partly paid scrip: cheap shares with calls due on
//                  announced weeks; a call you cannot pay forfeits shares.
//   margin-1929    buy on margin (25% down); interest on the loan; below
//                  the maintenance margin the broker sells you out at a
//                  discount; brokers raise margins before the crash.
//
//   D1  bubble bursts ≈ week 6, 9 weeks    (≈1 min)
//   D2  ≈ week 8, 11 weeks                 D3 ≈ week 10, 14 weeks
//   D4  ≈ week 12, 16 weeks (≈3 min)
//
// Every level is generated from the seed; `solve` (a beam search over the
// real `apply` step that knows the future price path) finds the best exit
// and the goal is a share of it (GOAL_SHARE), so every level is winnable.

export type Mode = 'futures' | 'subscription' | 'paper' | 'calls' | 'margin'

export interface TulipConfig {
  title: string
  rule: string
  intro: string
  fact: string
  mode: Mode
  unit: string
  money: string
  buyersLabel: string
  creditLabel: string
  color: string
}

export const CONFIGS: Record<string, TulipConfig> = {
  'haarlem-1637': {
    title: 'The Tulip Colleges of Haarlem',
    rule: 'Deals settle later',
    intro: 'Bulbs are in the ground: you trade promises to deliver them in a few weeks. A deal is paid only when it settles — and if the price has fallen under ¾ of the deal by then, the buyer walks away paying 3.5%.',
    fact: 'In the winter of 1636–37 tulip bulbs were traded as contracts for summer delivery in the tavern "colleges" of Dutch towns, some for thousands of guilders a bulb. Buyers stopped turning up at a Haarlem auction on 3 February 1637, and in 1638 the Haarlem magistrates let buyers cancel their contracts by paying 3.5% of the price.',
    mode: 'futures', unit: 'contract', money: 'fl', buyersLabel: 'buyers', creditLabel: 'on credit',
    color: '#c0392b',
  },
  'south-sea-1720': {
    title: 'The South Sea Bubble',
    rule: 'Insider subscriptions',
    intro: 'The Company sells new stock to friends at a discount — but subscription shares are locked until they are issued. Take the cheap stock and get out before the bubble bursts.',
    fact: 'South Sea stock rose from about £128 in January 1720 to over £1,000 by late June, fed by money subscriptions and by loans the Company made against its own shares; by the end of September it was under £200. Isaac Newton sold early at a profit, bought back near the top and is said to have lost about £20,000.',
    mode: 'subscription', unit: 'share', money: '£', buyersLabel: 'buyers', creditLabel: 'on Company loans',
    color: '#2c6e9b',
  },
  'mississippi-1720': {
    title: 'John Law’s Mississippi Company',
    rule: 'Paper notes inflate',
    intro: 'You are paid in Banque Royale notes, and the bank prints more every week. Only silver counts — and the bank pays out only so much silver a week. Realise your gains in time.',
    fact: 'In February 1720 holding more than 500 livres in coin was banned, and from March the Banque Royale printed notes to buy Mississippi shares at a fixed 9,000 livres. Prices in Paris soared; an edict of 21 May 1720 cut the value of notes and shares in stages, and the system collapsed by the end of the year.',
    mode: 'paper', unit: 'share', money: 'lv', buyersLabel: 'buyers', creditLabel: 'paid in new notes',
    color: '#8e6b23',
  },
  'railway-1840s': {
    title: 'Railway Mania',
    rule: 'Calls on partly paid shares',
    intro: 'Railway scrip costs only the deposit paid so far; the company calls up the rest on announced weeks. Pay each call for every share you hold — a call you cannot pay forfeits shares.',
    fact: 'In the Railway Mania of 1845–47 investors bought shares with only a small deposit paid, and companies then made "calls" for the rest as the lines were built. When calls fell due in the crisis of 1847 many holders had to sell at any price; George Hudson, the "Railway King", was ruined in 1849.',
    mode: 'calls', unit: 'share', money: '£', buyersLabel: 'buyers', creditLabel: 'scrip on calls',
    color: '#4b5d3a',
  },
  'margin-1929': {
    title: 'Margin Buying, 1929',
    rule: 'Margin calls force sales',
    intro: 'Your broker lends you three dollars for every one you put down, at interest. If your equity falls below the maintenance margin he sells you out at a discount — and brokers raise margins before the end.',
    fact: 'By October 1929 brokers’ loans to investors buying on margin had reached about $8.5 billion, and many put down only 10–25% of the price. As prices fell, margin calls forced sales that drove them lower still; the Dow lost about 23% on 28 and 29 October.',
    mode: 'margin', unit: 'share', money: '$', buyersLabel: 'buyers', creditLabel: 'bought on margin',
    color: '#5b4b8a',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Market generation ────────────────────────────────────────────────────────

/** The week (0-based) the bubble should burst, per difficulty. */
export const CRASH_AT: Record<Difficulty, number> = { 1: 6, 2: 8, 3: 10, 4: 12 }
const TAIL: Record<Difficulty, number> = { 1: 3, 2: 3, 3: 4, 4: 4 }
/** The goal asks for this share of the best profit the planner finds. */
export const GOAL_SHARE: Record<Difficulty, number> = { 1: 0.4, 2: 0.52, 3: 0.65, 4: 0.75 }
export const START_CASH = 1000

export interface Sub { turn: number; price: number; max: number; unlock: number }
export interface Call { turn: number; amount: number }

export interface Level {
  configId: string
  mode: Mode
  difficulty: Difficulty
  /** Last trading week (0-based). */
  T: number
  /** First week the price falls; it never rises again. */
  crash: number
  price: number[]
  buyers: number[]
  sellers: number[]
  credit: number[]
  buyCap: number
  sellCap: number[]
  startCash: number
  goal: number
  /** Best flat wealth the planner reached. */
  best: number
  // mode extras
  lag: number
  defaultRatio: number
  recovery: number
  subs: Sub[]
  cpi: number[]
  silverCap: number
  peg: [number, number] | null
  calls: Call[]
  initMargin: number[]
  maintMargin: number[]
  loanRate: number
  fireSale: number
  marginHike: number
}

interface Series { price: number[]; buyers: number[]; sellers: number[]; credit: number[]; crash: number }

/** The momentum-buyer model: arrivals from a finite pool chase last weeks' returns. */
function runModel(rng: Rng, weeks: number, noise: number): Series & { capped: number } {
  const sc = 0.45 + rng() * 1.3
  const r0 = (0.02 + rng() * 0.01) * sc
  const r1 = 2 + rng() * 1.2
  const h = (0.03 + rng() * 0.02) * sc
  const depth = (600 + rng() * 180) / sc
  let pool = 1000, holders = 60, P = 100, m = 0.03, credit = 0.08
  const price: number[] = [], buyers: number[] = [], sellers: number[] = [], cr: number[] = []
  let crash = -1, capped = 0
  for (let t = 0; t < weeks; t++) {
    // Arrivals: a share of the remaining pool, more after a good week and when credit is easy.
    let a = crash >= 0 ? 0 : Math.max(0, pool * r0 * (1 + 10 * r1 * Math.max(0, m)) * (1 + 2 * credit) * (1 - noise + rng() * 2 * noise))
    a = Math.min(a, pool)
    // Holders take profits; once it turns, credit buyers are forced out too.
    const s = holders * h + (crash >= 0 ? holders * credit * 0.4 : 0)
    price.push(Math.round(P)); buyers.push(Math.round(a)); sellers.push(Math.round(s)); cr.push(Math.round(credit * 100) / 100)
    pool -= a
    holders = Math.max(0, holders + a - s)
    let ret = (a - s) / depth
    if (crash < 0 && ret < 0) crash = t + 1
    if (crash >= 0) ret = Math.min(ret, t === crash ? -0.1 : -0.22)
    if (ret > 0.3) capped++
    ret = Math.max(-0.4, Math.min(0.3, ret))
    m = 0.5 * m + 0.5 * ret
    P *= 1 + ret
    credit = Math.min(0.88, credit + (0.02 + 0.3 * Math.max(0, ret)) * sc)
  }
  return { price, buyers, sellers, credit: cr, crash, capped }
}

function series(rng: Rng, d: Difficulty, weeks: number): Series {
  const target = CRASH_AT[d]
  let best: Series | null = null, gap = Infinity
  for (let i = 0; i < 300; i++) {
    const s = runModel(rng, weeks, scale(d, [0.04, 0.08, 0.13, 0.18]))
    if (s.crash < 0) continue
    const peak = Math.max(...s.price)
    const g = Math.abs(s.crash - target) * 2 + (peak < 220 ? 3 : 0) + (peak > 1500 ? 3 : 0) + Math.max(0, s.capped - 1)
    if (g === 0) return s
    if (g < gap) { gap = g; best = s }
  }
  return best!
}

export function makeMarket(configId: string, difficulty: Difficulty, seed: number): Level {
  const id = CONFIGS[configId] ? configId : 'haarlem-1637'
  const mode = CONFIGS[id].mode
  const rng = mulberry32(hashString(`tulips:${id}:${difficulty}:${seed}`))
  const lag = mode === 'futures' ? scale(difficulty, [1, 2, 2, 3]) : 0
  const s = series(rng, difficulty, CRASH_AT[difficulty] + 14)
  const crash = s.crash
  const T = crash + TAIL[difficulty]
  const n = T + 1 + lag
  let price = s.price.slice(0, n)
  const buyers = s.buyers.slice(0, n), sellers = s.sellers.slice(0, n), credit = s.credit.slice(0, n)
  const capScale = mode === 'calls' || mode === 'margin' ? 2 : 1
  const peakBuyers = Math.max(...buyers.slice(0, crash))
  const unitB = peakBuyers / 5
  let sellCap = buyers.map(b => Math.max(1, Math.min(5, Math.round(b / unitB))) * capScale)
  const subs: Sub[] = []
  let cpi: number[] = []
  let peg: [number, number] | null = null
  const calls: Call[] = []
  const initMargin: number[] = [], maintMargin: number[] = []
  let marginHike = -1

  if (mode === 'subscription') {
    // A one-week shakeout well before the top (Newton sold in April 1720).
    const dip = Math.max(2, crash - (difficulty <= 2 ? 4 : 6) - Math.floor(rng() * 2))
    if (dip < crash - 1) {
      price = price.map((p, t) => (t === dip ? Math.round(p * 0.86) : p))
      buyers[dip] = Math.round(buyers[dip] * 0.4)
      sellCap[dip] = Math.max(1, Math.round(sellCap[dip] / 2))
    }
    const turns = difficulty <= 2 ? [1, crash - 3] : [1, Math.max(2, crash - 5), crash - 2]
    turns.forEach((turn, i) => {
      const lock = 3
      subs.push({ turn, price: Math.round(price[turn] * (0.62 + 0.06 * i)), max: 3, unlock: turn + lock })
    })
  }

  if (mode === 'paper') {
    // Inflation rises with the note issue; Law pegs the share in paper, then
    // the edict cuts the notes and the peg goes.
    const pegEnd = Math.min(T, crash + 2)
    peg = [crash, pegEnd]
    const pegPrice = price[crash - 1]
    const out: number[] = []
    let last = pegPrice
    for (let t = 0; t < n; t++) {
      if (t < crash) out.push(price[t])
      else if (t <= pegEnd) out.push(pegPrice)
      else { last = Math.round(last * (t === pegEnd + 1 ? 0.5 : 0.75)); out.push(last) }
    }
    price = out
    let c = 1
    for (let t = 0; t < n; t++) {
      cpi.push(Math.round(c * 1000) / 1000)
      const infl = t < crash ? 0.015 + 0.04 * (t / crash) : t <= pegEnd ? 0.12 : 0.03
      c *= 1 + infl
      if (t === pegEnd) c *= 2
    }
    sellCap = sellCap.map((cap, t) => (t >= crash && t <= pegEnd ? 99 : cap))
  } else {
    cpi = price.map(() => 1)
  }

  if (mode === 'calls') {
    // V is the value of a fully paid share; scrip trades at V minus the uncalled part.
    const k = difficulty <= 2 ? 2 : 3
    const callTurns = k === 2 ? [Math.round(crash * 0.45), crash - 1] : [Math.round(crash * 0.35), Math.round(crash * 0.65), crash]
    callTurns.forEach(turn => calls.push({ turn, amount: 20 }))
    let uncalled = 70
    price = price.map((v, t) => {
      for (const c of calls) if (c.turn === t) uncalled -= c.amount
      return Math.max(2, v - uncalled)
    })
    // After the crash the scrip must not rise again even when a call adds paid-up value.
    for (let t = crash + 1; t < n; t++) price[t] = Math.min(price[t], price[t - 1])
  }

  if (mode === 'margin') {
    marginHike = Math.max(2, crash - 2)
    for (let t = 0; t < n; t++) {
      initMargin.push(t >= marginHike ? 0.5 : 0.25)
      maintMargin.push(t >= marginHike ? 0.3 : 0.15)
    }
  }

  const level: Level = {
    configId: id, mode, difficulty, T, crash, price, buyers, sellers, credit,
    buyCap: 3 * capScale, sellCap, startCash: START_CASH, goal: Infinity, best: 0,
    lag, defaultRatio: 0.75, recovery: 0.035, subs, cpi,
    silverCap: mode === 'paper' ? 260 : 0, peg, calls, initMargin, maintMargin,
    loanRate: 0.01, fireSale: 0.1, marginHike,
  }
  return level
}

// ── State and rules ─────────────────────────────────────────────────────────

export interface Pending { due: number; deal: number; n: number; buy: boolean }

export interface TState {
  t: number
  /** Cash (notes in the paper variant; negative = broker's loan on margin). */
  cash: number
  pos: number
  /** Subscription shares per round, locked until issued. */
  locked: number[]
  silver: number
  pending: Pending[]
  bought: number
  sold: number
  subbed: number[]
  converted: number
  log: string
  over: null | 'won' | 'lost'
  reason?: string
}

export type Action =
  | { t: 'buy'; n: number }
  | { t: 'sell'; n: number }
  | { t: 'subscribe'; n: number }
  | { t: 'convert'; notes: number }
  | { t: 'next' }

export type ApplyResult = { ok: true; state: TState } | { ok: false; reason: string }

export function startState(L: Level): TState {
  return {
    t: 0, cash: L.startCash, pos: 0, locked: L.subs.map(() => 0), silver: 0, pending: [],
    bought: 0, sold: 0, subbed: L.subs.map(() => 0), converted: 0, log: '', over: null,
  }
}

const clone = (s: TState): TState => ({ ...s, locked: [...s.locked], pending: s.pending.map(p => ({ ...p })), subbed: [...s.subbed] })

/** Signed face value of open deals: + owed to you, − owed by you. */
export const pendingFace = (s: TState) => s.pending.reduce((a, p) => a + (p.buy ? -1 : 1) * p.deal * p.n, 0)

/** What a deal pays when it settles at week `at`: the buyer walks away for 3.5% if the price fell under ¾ of the deal. */
export function settleValue(L: Level, p: Pending): number {
  const px = L.price[Math.min(p.due, L.price.length - 1)]
  const face = p.deal * p.n
  return px < L.defaultRatio * p.deal ? face * L.recovery : face
}

export const isFlat = (s: TState) => s.pos === 0 && s.pending.length === 0 && s.locked.every(x => x === 0)

/** The wealth the goal is measured in. */
export const wealthOf = (L: Level, s: TState) => (L.mode === 'paper' ? s.silver : s.cash)

export function isWon(L: Level, s: TState): boolean {
  if (L.mode === 'paper') return s.silver >= L.goal
  return isFlat(s) && s.cash >= L.goal
}

/** How many can be bought right now. */
export function maxBuy(L: Level, s: TState): number {
  if (s.over || s.t > L.T) return 0
  const P = L.price[s.t]
  const left = L.buyCap - s.bought
  let byMoney: number
  if (L.mode === 'margin') {
    const equity = s.cash + s.pos * P
    byMoney = Math.floor(equity / (L.initMargin[s.t] * P) - s.pos + 1e-9)
  } else if (L.mode === 'futures') {
    byMoney = Math.floor((s.cash + pendingFace(s)) / P + 1e-9)
  } else byMoney = Math.floor(s.cash / P + 1e-9)
  return Math.max(0, Math.min(left, byMoney))
}

export function maxSell(L: Level, s: TState): number {
  if (s.over || s.t > L.T) return 0
  return Math.max(0, Math.min(s.pos, L.sellCap[s.t] - s.sold))
}

export function subOffer(L: Level, s: TState): { i: number; sub: Sub; left: number } | null {
  const i = L.subs.findIndex(x => x.turn === s.t)
  if (i < 0) return null
  const sub = L.subs[i]
  return { i, sub, left: Math.max(0, Math.min(sub.max - s.subbed[i], Math.floor(s.cash / sub.price + 1e-9))) }
}

/** Notes that can still go to the bank for silver this week. */
export function maxConvert(L: Level, s: TState): number {
  if (L.mode !== 'paper' || s.over) return 0
  const realLeft = L.silverCap - s.converted
  return Math.max(0, Math.min(s.cash, realLeft * L.cpi[s.t]))
}

/** An upper bound on the wealth still reachable: prices never rise after the crash. */
export function reachable(L: Level, s: TState): number {
  const P = L.price[Math.min(s.t, L.price.length - 1)]
  const held = (s.pos + s.locked.reduce((a, b) => a + b, 0)) * P
  if (L.mode === 'paper') {
    const capLeft = L.silverCap * (L.T - s.t + 1) - s.converted
    return s.silver + Math.min(capLeft, (s.cash + held) / L.cpi[s.t])
  }
  if (L.mode === 'futures') {
    const recv = s.pending.filter(p => !p.buy).reduce((a, p) => a + p.deal * p.n, 0)
    const pay = s.pending.filter(p => p.buy).reduce((a, p) => a + p.deal * p.n, 0)
    return s.cash + held + recv - pay * L.recovery
  }
  return s.cash + held
}

function settle(L: Level, s: TState, upTo: number): string[] {
  const notes: string[] = []
  const due = s.pending.filter(p => p.due <= upTo).sort((a, b) => a.due - b.due)
  s.pending = s.pending.filter(p => p.due > upTo)
  for (const p of due) {
    const v = settleValue(L, p)
    const walked = v < p.deal * p.n
    s.cash += p.buy ? -v : v
    if (walked) notes.push(p.buy ? `you walked away from a deal for 3.5%` : `a buyer walked away paying 3.5%`)
  }
  return notes
}

function finish(L: Level, s: TState): void {
  if (s.over) return
  if (isWon(L, s)) { s.over = 'won'; return }
  if (L.mode === 'futures' && s.cash < 0) { s.over = 'lost'; s.reason = 'A settlement left you unable to pay: bankrupt'; return }
  if (s.t > L.T) { s.over = 'lost'; s.reason = 'The market closed before you made your target'; return }
  if (isFinite(L.goal) && s.t >= L.crash && reachable(L, s) < L.goal) {
    s.over = 'lost'; s.reason = 'The bubble burst with you still in it'
  }
}

export function apply(L: Level, s0: TState, a: Action): ApplyResult {
  if (s0.over) return { ok: false, reason: 'The game is over' }
  const P = L.price[s0.t]
  const s = clone(s0)
  s.log = ''
  switch (a.t) {
    case 'buy': {
      if (a.n < 1 || a.n > maxBuy(L, s0)) return { ok: false, reason: s0.bought >= L.buyCap ? 'No more sellers this week' : 'Not enough money for that' }
      if (L.mode === 'futures') s.pending.push({ due: s.t + L.lag, deal: P, n: a.n, buy: true })
      else s.cash -= a.n * P
      s.pos += a.n; s.bought += a.n
      break
    }
    case 'sell': {
      if (a.n < 1 || a.n > maxSell(L, s0)) return { ok: false, reason: s0.pos < a.n ? 'You do not hold that many' : 'No more buyers this week' }
      if (L.mode === 'futures') s.pending.push({ due: s.t + L.lag, deal: P, n: a.n, buy: false })
      else s.cash += a.n * P
      s.pos -= a.n; s.sold += a.n
      break
    }
    case 'subscribe': {
      const o = subOffer(L, s0)
      if (!o || a.n < 1 || a.n > o.left) return { ok: false, reason: 'No subscription open for that' }
      s.cash -= a.n * o.sub.price
      s.locked[o.i] += a.n; s.subbed[o.i] += a.n
      break
    }
    case 'convert': {
      const max = maxConvert(L, s0)
      if (a.notes <= 0 || a.notes > max + 1e-6) return { ok: false, reason: 'The bank will not pay out more silver this week' }
      s.cash -= a.notes
      s.silver += a.notes / L.cpi[s.t]
      s.converted += a.notes / L.cpi[s.t]
      if (s.cash < 1e-6) s.cash = 0
      break
    }
    case 'next': {
      const t = s.t + 1
      s.t = t; s.bought = 0; s.sold = 0; s.converted = 0
      const notes: string[] = []
      if (t > L.T) {
        if (L.mode === 'futures') notes.push(...settle(L, s, Infinity))
        s.log = notes.join('; ')
        finish(L, s)
        return { ok: true, state: s }
      }
      const Pt = L.price[t]
      if (L.mode === 'futures') notes.push(...settle(L, s, t))
      if (L.mode === 'subscription') {
        L.subs.forEach((sub, i) => {
          if (sub.unlock === t && s.locked[i] > 0) { notes.push(`${s.locked[i]} subscription shares issued`); s.pos += s.locked[i]; s.locked[i] = 0 }
        })
      }
      if (L.mode === 'calls') {
        const c = L.calls.find(x => x.turn === t)
        if (c && s.pos > 0) {
          const can = Math.min(s.pos, Math.floor(s.cash / c.amount + 1e-9))
          s.cash -= can * c.amount
          if (can < s.pos) notes.push(`call of ${c.amount}: ${s.pos - can} shares forfeited`)
          else notes.push(`paid a call of ${c.amount} on ${can} shares`)
          s.pos = can
        }
      }
      if (L.mode === 'margin') {
        if (s.cash < 0) s.cash *= 1 + L.loanRate
        if (s.pos > 0 && s.cash + s.pos * Pt < 0) {
          s.cash += s.pos * Pt * (1 - L.fireSale); s.pos = 0
          s.log = 'wiped out'
          s.over = 'lost'; s.reason = 'Your equity went below zero: the broker sold you out and you owe him'
          return { ok: true, state: s }
        }
        let forced = 0
        while (s.pos > 0 && s.cash + s.pos * Pt < L.maintMargin[t] * s.pos * Pt) {
          s.cash += Pt * (1 - L.fireSale); s.pos--; forced++
        }
        if (forced) notes.push(`margin call: the broker sold ${forced} shares at ${Math.round(Pt * (1 - L.fireSale))}`)
      }
      s.log = notes.join('; ')
      break
    }
  }
  finish(L, s)
  return { ok: true, state: s }
}

// ── Planner ──────────────────────────────────────────────────────────────────

interface Node { s: TState; path: Action[] }

function score(L: Level, s: TState): number {
  if (L.mode === 'futures') return s.cash + s.pending.reduce((a, p) => a + (p.buy ? -1 : 1) * settleValue(L, p), 0)
  if (L.mode === 'paper') return s.silver + s.cash / L.cpi[Math.min(s.t, L.cpi.length - 1)]
  return s.cash
}

/**
 * Beam search over whole weeks (one net trade, a subscription, a silver
 * conversion, then the next week) through the real `apply`, knowing the
 * price path.  Returns the best flat wealth reached and the moves to it.
 */
export function solve(L: Level): { best: number; path: Action[] } {
  let beam: Node[] = [{ s: startState(L), path: [] }]
  let best = -Infinity, bestPath: Action[] = []
  const consider = (n: Node) => {
    if (n.s.over === 'won') { const w = wealthOf(L, n.s); if (w > best) { best = w; bestPath = n.path } return }
    const flat = L.mode === 'paper' || isFlat(n.s)
    if (flat && n.s.over !== 'lost') { const w = wealthOf(L, n.s); if (w > best) { best = w; bestPath = n.path } }
  }
  const step = (n: Node, a: Action): Node | null => {
    const r = apply(L, n.s, a)
    return r.ok ? { s: r.state, path: [...n.path, a] } : null
  }
  for (let week = 0; week <= L.T; week++) {
    const next: Node[] = []
    for (const n0 of beam) {
      const subs: Node[] = [n0]
      const o = subOffer(L, n0.s)
      if (o && o.left > 0) for (let k = 1; k <= o.left; k++) { const x = step(n0, { t: 'subscribe', n: k }); if (x) subs.push(x) }
      // Selling first can pay for a subscription.
      const pre: Node[] = []
      for (const n1 of subs) {
        pre.push(n1)
        for (let k = 1; k <= maxSell(L, n1.s); k++) {
          const x = step(n1, { t: 'sell', n: k }); if (!x) continue
          pre.push(x)
          const o2 = subOffer(L, x.s)
          if (o2 && n1 === n0 && o2.left > 0) for (let j = 1; j <= o2.left; j++) { const y = step(x, { t: 'subscribe', n: j }); if (y) pre.push(y) }
        }
        for (let k = 1; k <= maxBuy(L, n1.s); k++) { const x = step(n1, { t: 'buy', n: k }); if (x) pre.push(x) }
      }
      for (const n2 of pre) {
        const opts = [n2]
        const c = maxConvert(L, n2.s)
        if (c > 0) { const x = step(n2, { t: 'convert', notes: c }); if (x) opts.push(x) }
        for (const n3 of opts) {
          consider(n3)
          if (n3.s.over) continue
          const x = step(n3, { t: 'next' })
          if (!x) continue
          consider(x)
          if (!x.s.over) next.push(x)
        }
      }
    }
    // Keep the best few states per holding.
    const groups = new Map<string, Node[]>()
    for (const n of next) {
      const k = `${n.s.pos}|${n.s.locked.join(',')}`
      const g = groups.get(k)
      if (g) g.push(n); else groups.set(k, [n])
    }
    beam = []
    for (const g of groups.values()) {
      g.sort((a, b) => score(L, b.s) - score(L, a.s))
      beam.push(...g.slice(0, 3))
    }
    if (beam.length > 240) {
      const P = L.price[Math.min(week + 1, L.price.length - 1)]
      beam.sort((a, b) => score(L, b.s) + b.s.pos * P - score(L, a.s) - a.s.pos * P)
      beam = beam.slice(0, 240)
    }
  }
  return { best, path: bestPath }
}

/** Replays a list of actions; stops when the game is over. */
export function play(L: Level, path: Action[]): TState {
  let s = startState(L)
  for (const a of path) {
    if (s.over) break
    const r = apply(L, s, a)
    if (r.ok) s = r.state
  }
  return s
}

/** One move at a time, `null` to end the week. */
export type Policy = (L: Level, s: TState, history: number[]) => Action | null

/** Runs a policy week by week to the end of the game. */
export function runPolicy(L: Level, policy: Policy): TState {
  let s = startState(L)
  const hist: number[] = []
  while (!s.over) {
    hist.push(L.price[s.t])
    for (let i = 0; i < 12 && !s.over; i++) {
      const a = policy(L, s, hist)
      if (!a) break
      const r = apply(L, s, a)
      if (!r.ok) break
      s = r.state
    }
    if (s.over) break
    const r = apply(L, s, { t: 'next' })
    if (r.ok) s = r.state
  }
  return s
}

/** Naive: take every subscription and buy whatever you can, never sell. */
export const buyAndHold: Policy = (L, s) => {
  const o = subOffer(L, s)
  if (o && o.left > 0) return { t: 'subscribe', n: o.left }
  const b = maxBuy(L, s)
  return b > 0 ? { t: 'buy', n: b } : null
}

/** Naive: ride it fully loaded, then sell (and realise) as fast as possible once the price first falls. */
export const sellOnFirstDrop: Policy = (L, s, h) => {
  if (!h.some((p, i) => i > 0 && p < h[i - 1])) return buyAndHold(L, s, h)
  const k = maxSell(L, s)
  if (k > 0) return { t: 'sell', n: k }
  const c = maxConvert(L, s)
  return c > 0 ? { t: 'convert', notes: c } : null
}

export const NAIVE: Record<string, Policy> = { buyAndHold, sellOnFirstDrop }

/** Best wealth a policy ends with when the goal is out of reach. */
export function policyWealth(L: Level, p: Policy): number {
  return wealthOf(L, runPolicy({ ...L, goal: Infinity }, p))
}

/**
 * A seeded, planner-checked level with its goal set: a share of the best
 * profit the planner finds — and at D3+, above anything the naive
 * strategies end with.
 */
export function makeLevel(configId: string, difficulty: Difficulty, seed: number): Level {
  const L = makeMarket(configId, difficulty, seed)
  const { best } = solve(L)
  const share = GOAL_SHARE[difficulty]
  let goal = Math.max(Math.round(L.startCash + share * (best - L.startCash)), L.startCash + 50)
  if (difficulty >= 3) {
    const naive = Math.max(...Object.values(NAIVE).map(p => policyWealth(L, p)))
    if (naive >= goal) goal = Math.min(Math.floor(best), Math.floor(naive) + 1)
  }
  return { ...L, best, goal }
}

// ── Component ────────────────────────────────────────────────────────────────

const W = 340, H = 168, PAD_L = 30, PAD_R = 30, TOP = 10, MID = 108, BOT = 160

function fmt(x: number): string {
  return Math.round(x).toLocaleString('en-US')
}

export default function TulipsGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'haarlem-1637')
  const L = useMemo(() => makeLevel(configId, difficulty, seed), [configId, difficulty, seed])
  const [s, setS] = useState<TState>(() => startState(L))
  const [qty, setQty] = useState(1)
  const [msg, setMsg] = useState('')
  const { outcome, reason, win, lose } = useGameOutcome({ onWin, onLose })
  const live = useRef(s)
  live.current = s
  const reported = useRef(false)
  useEffect(() => { const st = startState(L); live.current = st; setS(st); setMsg(''); reported.current = false }, [L])

  const act = (a: Action) => {
    const cur = live.current
    if (cur.over) return
    const r = apply(L, cur, a)
    if (!r.ok) { setMsg(r.reason); return }
    live.current = r.state
    setS(r.state)
    setMsg(r.state.log)
    if (r.state.over && !reported.current) {
      reported.current = true
      if (r.state.over === 'won') win(); else lose(r.state.reason)
    }
  }

  const t = Math.min(s.t, L.T)
  const P = L.price[t]
  const capScale = L.buyCap / 3
  const sliderMax = 6 * capScale
  const q = Math.min(qty, sliderMax)
  const buyMax = maxBuy(L, s), sellMax = maxSell(L, s)
  const offer = L.mode === 'subscription' ? subOffer(L, s) : null
  const convMax = maxConvert(L, s)
  const lockedTotal = s.locked.reduce((a, b) => a + b, 0)
  const m = cfg.money

  // Chart scales: history only, the future is blank.
  const shown = L.price.slice(0, t + 1)
  const pMax = Math.max(...shown) * 1.15
  const bMax = Math.max(4, ...L.buyers.slice(0, t + 1), ...L.sellers.slice(0, t + 1))
  const weeks = L.T + 1
  const xOf = (i: number) => PAD_L + (i + 0.5) * ((W - PAD_L - PAD_R) / weeks)
  const bw = Math.max(3, ((W - PAD_L - PAD_R) / weeks) * 0.36)
  const yP = (p: number) => MID - (p / pMax) * (MID - TOP)
  const yB = (b: number) => BOT - (b / bMax) * (BOT - MID - 10)
  const yC = (c: number) => MID - c * (MID - TOP)

  const events: { week: number; label: string }[] = []
  L.subs.forEach(x => { events.push({ week: x.turn, label: 'S' }); events.push({ week: x.unlock, label: 'I' }) })
  L.calls.forEach(c => events.push({ week: c.turn, label: 'C' }))
  if (L.mode === 'margin') events.push({ week: L.marginHike, label: 'M' })
  s.pending.forEach(p => { if (p.due <= L.T) events.push({ week: p.due, label: '$' }) })

  const wealthNow = L.mode === 'paper' ? s.silver : s.cash
  const btn = 'h-11 rounded-lg border font-bold text-xs disabled:opacity-40'

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-[10px] font-bold text-ink-2 mb-0.5">Rule: {cfg.rule}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2" data-testid="tulip-week">Week {Math.min(s.t, L.T) + 1} / {L.T + 1}</p>
          <p data-testid="tulip-price">Price {m}{fmt(P)}</p>
          <p data-testid="tulip-goal" className="font-bold text-ink-2">Goal {L.mode === 'paper' ? 'silver ' : ''}{m}{fmt(L.goal)}</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[430px] mx-auto select-none rounded-lg border-2 border-ink-2 bg-paper"
        data-testid="tulip-chart">
        <line x1={PAD_L} y1={MID} x2={W - PAD_R} y2={MID} stroke="#b89f6e" strokeWidth={0.6} />
        <line x1={PAD_L} y1={BOT} x2={W - PAD_R} y2={BOT} stroke="#b89f6e" strokeWidth={0.6} />
        <text x={4} y={TOP + 6} fontSize={7} fill="#5a4b36">{m}{fmt(pMax)}</text>
        <text x={4} y={MID - 2} fontSize={7} fill="#5a4b36">0</text>
        <text x={W - PAD_R + 3} y={TOP + 6} fontSize={7} fill="#8a7a5e">100%</text>
        <text x={W - PAD_R + 3} y={MID - 2} fontSize={7} fill="#8a7a5e">0%</text>
        <text x={4} y={MID + 12} fontSize={6.5} fill="#5a4b36">flow</text>
        {L.peg && L.peg[0] <= t && (
          <rect x={xOf(L.peg[0]) - bw} y={TOP} width={xOf(Math.min(t, L.peg[1])) - xOf(L.peg[0]) + 2 * bw} height={MID - TOP} fill="#8e6b23" opacity={0.12} />
        )}
        {shown.map((p, i) => (
          <g key={i}>
            <rect x={xOf(i) - bw} y={yB(L.buyers[i])} width={bw} height={BOT - yB(L.buyers[i])} fill="#4f8a4a" />
            <rect x={xOf(i)} y={yB(L.sellers[i])} width={bw} height={BOT - yB(L.sellers[i])} fill="#b2564a" />
            {i > 0 && <line x1={xOf(i - 1)} y1={yP(shown[i - 1])} x2={xOf(i)} y2={yP(p)} stroke={cfg.color} strokeWidth={2} />}
            {i > 0 && <line x1={xOf(i - 1)} y1={yC(L.credit[i - 1])} x2={xOf(i)} y2={yC(L.credit[i])} stroke="#8a7a5e" strokeWidth={1} strokeDasharray="3 2" />}
            {L.mode === 'paper' && i > 0 && <line x1={xOf(i - 1)} y1={yP(shown[i - 1] / L.cpi[i - 1])} x2={xOf(i)} y2={yP(p / L.cpi[i])} stroke="#9aa0a6" strokeWidth={1.4} />}
          </g>
        ))}
        <circle cx={xOf(t)} cy={yP(P)} r={3} fill={cfg.color} />
        {events.map((e, i) => (
          <text key={i} x={xOf(e.week)} y={MID + 8} fontSize={7} textAnchor="middle" fontWeight="bold"
            fill={e.week === t ? '#9b2c23' : '#5a4b36'}>{e.label}</text>
        ))}
        <line x1={xOf(t) + bw + 1} y1={TOP} x2={xOf(t) + bw + 1} y2={BOT} stroke="#9b2c23" strokeWidth={0.6} strokeDasharray="2 2" />
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[9px] text-muted -mt-2">
        <span><span style={{ color: cfg.color }}>━</span> price</span>
        {L.mode === 'paper' && <span><span style={{ color: '#9aa0a6' }}>━</span> price in silver</span>}
        <span>┄ {cfg.creditLabel} (%)</span>
        <span><span className="text-emerald-700">■</span> {cfg.buyersLabel}</span>
        <span><span className="text-red-700">■</span> sellers</span>
        {L.mode === 'subscription' && <span>S subscription · I issued</span>}
        {L.mode === 'calls' && <span>C call due</span>}
        {L.mode === 'margin' && <span>M margins raised</span>}
        {L.mode === 'futures' && <span>$ a deal settles</span>}
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] tabular-nums">
        <div className="rounded-lg bg-panel border border-line p-1.5">
          <p className="text-muted">{L.mode === 'paper' ? 'Notes' : L.mode === 'margin' && s.cash < 0 ? 'Loan' : 'Cash'}</p>
          <p className="font-bold text-ink text-xs" data-testid="tulip-cash">{m}{fmt(Math.abs(s.cash))}</p>
        </div>
        <div className="rounded-lg bg-panel border border-line p-1.5">
          <p className="text-muted">Held</p>
          <p className="font-bold text-ink text-xs" data-testid="tulip-pos">{s.pos}{lockedTotal ? ` +${lockedTotal} locked` : ''}</p>
        </div>
        <div className="rounded-lg bg-panel border border-line p-1.5">
          <p className="text-muted">{L.mode === 'paper' ? 'Silver' : L.mode === 'futures' ? 'Deals open' : L.mode === 'margin' ? 'Equity' : 'Worth'}</p>
          <p className="font-bold text-ink text-xs" data-testid="tulip-wealth">
            {L.mode === 'paper' ? `${fmt(s.silver)}`
              : L.mode === 'futures' ? `${pendingFace(s) >= 0 ? '+' : '−'}${m}${fmt(Math.abs(pendingFace(s)))}`
              : `${m}${fmt(s.cash + s.pos * P)}`}
          </p>
        </div>
      </div>

      <div className="text-[10px] text-muted text-center tabular-nums -mt-1">
        This week: buyers take {Math.max(0, L.sellCap[t] - s.sold)} more · sellers offer {Math.max(0, L.buyCap - s.bought)} more
        {L.mode === 'margin' && ` · margin ${Math.round(L.initMargin[t] * 100)}% down, call below ${Math.round(L.maintMargin[t] * 100)}%`}
        {L.mode === 'paper' && ` · bank pays ${fmt(Math.max(0, L.silverCap - s.converted))} more silver · 1 silver = ${L.cpi[t].toFixed(2)} lv in notes`}
        {L.mode === 'calls' && L.calls.filter(c => c.turn > t).length > 0 && ` · next call ${m}${L.calls.find(c => c.turn > t)!.amount}/share in week ${L.calls.find(c => c.turn > t)!.turn + 1}`}
        {L.mode === 'futures' && ` · deals settle ${L.lag} weeks later`}
      </div>

      <p className="text-[11px] text-center min-h-[16px] text-red-600 font-bold" data-testid="tulip-msg">{msg}</p>

      {!s.over && (
        <div className="flex flex-col gap-2 w-full max-w-[430px] mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted w-10">Lots</span>
            <input type="range" min={1} max={sliderMax} value={q} data-testid="tulip-qty"
              onChange={e => setQty(Number(e.target.value))} className="flex-1 accent-[#9b2c23]" style={{ touchAction: 'manipulation' }} />
            <span className="text-xs font-bold text-ink w-6 text-right tabular-nums">{q}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" data-testid="tulip-buy" disabled={buyMax < 1} onClick={() => act({ t: 'buy', n: q })}
              className={`${btn} bg-emerald-600/10 border-emerald-600/40 text-emerald-800`}>Buy {q} @ {m}{fmt(P)}</button>
            <button type="button" data-testid="tulip-sell" disabled={sellMax < 1} onClick={() => act({ t: 'sell', n: q })}
              className={`${btn} bg-red-600/10 border-red-600/40 text-red-800`}>Sell {q} @ {m}{fmt(P)}</button>
          </div>
          {offer && (
            <button type="button" data-testid="tulip-subscribe" disabled={offer.left < 1} onClick={() => act({ t: 'subscribe', n: q })}
              className={`${btn} bg-panel border-line text-ink`}>
              Subscribe {q} @ {m}{fmt(offer.sub.price)} · issued week {offer.sub.unlock + 1} ({offer.left} left)
            </button>
          )}
          {L.mode === 'paper' && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" data-testid="tulip-convert" disabled={convMax <= 0} onClick={() => act({ t: 'convert', notes: Math.min(convMax, q * 100) })}
                className={`${btn} bg-panel border-line text-ink`}>Notes → silver ({q * 100} lv)</button>
              <button type="button" data-testid="tulip-convert-max" disabled={convMax <= 0} onClick={() => act({ t: 'convert', notes: convMax })}
                className={`${btn} bg-panel border-line text-ink`}>Convert all allowed</button>
            </div>
          )}
          <button type="button" data-testid="tulip-next" onClick={() => act({ t: 'next' })}
            className={`${btn} bg-accent border-accent text-accent-fg`}>{s.t >= L.T ? 'Close the market' : 'Next week ▶'}</button>
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {s.over ? (s.over === 'lost' ? reason : `Out with ${m}${fmt(wealthNow)}.`) : 'Win by being out of the market with the goal in hand. You can only sell to the buyers who turn up: when fewer come each week, sell into them while they last. The price turns when buyers fall below sellers — then you can sell one lot a week.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Out before the crash!" loseTitle="Caught in the crash" />
    </div>
  )
}
