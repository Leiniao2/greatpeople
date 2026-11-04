import { useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, mulberry32, randInt, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner, type Rng } from './_shared'

// Grand Bazaar — haggle your way to a full set of goods (a dowry, a
// caravan's cargo) before the purse or the market day runs out.
//
// Every stall keeper has a hidden lowest price, drawn from the seed.  You
// name a price; the keeper reacts by a fixed rule the player can read:
//
//   • an offer at or above his lowest price is accepted and paid;
//   • otherwise he counters half-way between his ask and your offer, but
//     never below his lowest price — a counter that stops short of the
//     half-way mark ("not a coin less") gives that price away;
//   • he has only so much patience: once it is spent, one more low offer
//     and he walks away (you can still pay his current ask);
//   • an offer far below his price is an insult.
//
// Every action (an offer, paying, or waiting) takes one turn of the market.
// The five markets each change a rule:
//
//   istanbul-bedesten  guild band: each good's guild posts a floor and a
//                      ceiling; an offer below the floor and the whole guild
//                      row refuses you.  No other insults.
//   tlatelolco         judges: merchants open at the judges' fair price and
//                      must take it, but an offer that insults brings the
//                      judges, who fine you cacao beans.
//   changan-west       price board: the market office posts lower / middle /
//                      upper prices, and the closing gong ends each trading
//                      day — every unfinished haggle starts over tomorrow.
//   timbuktu-silent    silent trade: no counters.  You leave a pile of salt;
//                      they take it (and you pay the whole pile) or leave it.
//                      Climb from the rumoured floor without overshooting.
//   kaifeng-night      night market: prices fall every watch, but crowds
//                      gather at a stall just before it sells out.
//
//   D1 2 goods × 2 stalls (≈1 min)   D2 3 × 2   D3 4 × 3   D4 5 × 3 (≈3 min)
//
// `solve` plays from what the player sees only (asks, counters, boards,
// crowds) and the purse and turn limit are set from its result, so every
// level is winnable.  At D3–D4 paying the asking price and lowballing both
// lose (checked when the level is generated, and in the tests).

export type Market = 'guild' | 'judges' | 'board' | 'silent' | 'night'

export interface BazaarConfig {
  title: string
  rule: string
  intro: string
  fact: string
  market: Market
  currency: string
  setName: string
  goods: { name: string; icon: string }[]
  names: string[]
  /** An offer below insult × lowest price insults (not used by the guild). */
  insult: number
  /** The safe line on the slider is safeShare × the list price. */
  safeShare: number
  /** Opening ask ÷ lowest price. */
  markup: [number, number]
  awning: string
}

export const CONFIGS: Record<string, BazaarConfig> = {
  'istanbul-bedesten': {
    title: 'The Cevahir Bedesten',
    rule: 'Guild price bands',
    intro: 'Gather a bride’s dowry in the covered bazaar. Each guild posts its floor and ceiling price. Haggle down from the ask, but never offer below the guild floor: the whole row will close against you.',
    fact: 'Mehmed II built the Cevahir Bedesten around 1461, and Istanbul’s Grand Bazaar grew up around it. Its trades were organised in guilds (esnaf), and the kadı set official prices, the narh, which guild wardens enforced.',
    market: 'guild', currency: 'akçe', setName: 'dowry',
    goods: [
      { name: 'Carpet', icon: '🧶' }, { name: 'Silk', icon: '🧵' }, { name: 'Copper pot', icon: '🫖' },
      { name: 'Gold bangle', icon: '📿' }, { name: 'Kaftan', icon: '🥻' }, { name: 'Mirror', icon: '🪞' },
    ],
    names: ['Hasan', 'Mehmed', 'Yusuf', 'Ali', 'Osman', 'Murad', 'Selim', 'Ahmed', 'İbrahim', 'Mustafa', 'Kemal', 'Davud', 'Halil', 'Rüstem', 'Süleyman'],
    insult: 0, safeShare: 0, markup: [1.4, 1.8], awning: '#9b2c23',
  },
  tlatelolco: {
    title: 'The Market of Tlatelolco',
    rule: 'Fair price and judges',
    intro: 'Buy the goods for a feast with cacao beans. Every seller must accept the judges’ fair price, so you can always pay that. Haggle lower if you dare: insult a seller and the judges fine you.',
    fact: 'Cortés wrote in 1520 that the Tlatelolco market drew some 60,000 people a day, and that ten or twelve judges sat in a hall there to settle disputes and punish anyone using false measures. Small purchases were paid in cacao beans.',
    market: 'judges', currency: 'beans', setName: 'feast',
    goods: [
      { name: 'Turkey', icon: '🦃' }, { name: 'Obsidian blade', icon: '🔪' }, { name: 'Feathers', icon: '🪶' },
      { name: 'Maize', icon: '🌽' }, { name: 'Chili', icon: '🌶️' }, { name: 'Cotton cloak', icon: '🧣' },
    ],
    names: ['Tochtli', 'Cuauhtli', 'Ocelotl', 'Mazatl', 'Itzcoatl', 'Xochitl', 'Citlali', 'Tecpatl', 'Coatl', 'Ehecatl', 'Atl', 'Miquiztli', 'Quiahuitl', 'Malinalli', 'Cipactli'],
    insult: 0.8, safeShare: 0.7, markup: [1.18, 1.66], awning: '#2f7a5b',
  },
  'changan-west': {
    title: 'The West Market of Chang’an',
    rule: 'Price board, closing gong',
    intro: 'Load a caravan for the western road. The market office posts each good’s lower, middle and upper price, and no seller goes below the lower one. When the gong sounds the day is over: every haggle not finished starts again tomorrow.',
    fact: 'In Tang Chang’an the West Market opened at noon to 300 drumbeats and closed before sunset to 300 strokes of a gong. The market office set three grades of price, upper, middle and lower, for each kind of goods every ten days.',
    market: 'board', currency: 'wen', setName: 'caravan load',
    goods: [
      { name: 'Silk bolt', icon: '🧵' }, { name: 'Tea brick', icon: '🍵' }, { name: 'Porcelain', icon: '🏺' },
      { name: 'Lacquer box', icon: '🎁' }, { name: 'Paper', icon: '📜' }, { name: 'Bronze mirror', icon: '🪞' },
    ],
    names: ['Li', 'Wang', 'Zhang', 'Liu', 'Chen', 'An', 'Kang', 'Shi', 'Cao', 'He', 'Mi', 'Zhao', 'Yang', 'Sun', 'Zhou'],
    insult: 0.8, safeShare: 0, markup: [1.3, 1.9], awning: '#b5651d',
  },
  'timbuktu-silent': {
    title: 'The Silent Trade',
    rule: 'Silent trade: piles only',
    intro: 'Trade your salt slabs for the goods of the south without a word. Leave a pile at a clearing: they take it and leave their goods, or leave it untouched. They pay no change, so climb up from the rumoured floor. Offer below it and they vanish.',
    fact: 'The Venetian Alvise Cadamosto reported in 1455 that Saharan salt was traded for gold in silence: the salt traders left piles and withdrew, the other side set gold beside each pile, and neither party spoke. Timbuktu grew rich where Taghaza salt met the gold of the south.',
    market: 'silent', currency: 'salt', setName: 'cargo',
    goods: [
      { name: 'Gold dust', icon: '✨' }, { name: 'Kola nuts', icon: '🌰' }, { name: 'Ivory', icon: '🦷' },
      { name: 'Shea butter', icon: '🧈' }, { name: 'Cotton cloth', icon: '🧣' }, { name: 'Copper', icon: '🪙' },
    ],
    names: ['Ford clearing', 'Baobab clearing', 'River bend', 'Red rock', 'Termite hill', 'Palm grove', 'Old well', 'Reed bank', 'Fig tree', 'Stone ring', 'Dry wash', 'Island bank', 'Acacia', 'Cliff foot', 'Sand bar'],
    insult: 0.72, safeShare: 0, markup: [1, 1], awning: '#c9a227',
  },
  'kaifeng-night': {
    title: 'The Night Market of Kaifeng',
    rule: 'Prices fall, stalls sell out',
    intro: 'Buy the goods for a festival at the night market. Every watch, prices fall. But when a crowd gathers at a stall it is about to sell out to someone else. Wait for bargains, but buy before the crowd does, or before dawn.',
    fact: 'Meng Yuanlao’s memoir of Kaifeng, the Dongjing Meng Hua Lu (1147), recalls that its night markets ran until the third watch and opened again by the fifth, once the Song had let the old market curfew lapse.',
    market: 'night', currency: 'wen', setName: 'festival basket',
    goods: [
      { name: 'Lantern', icon: '🏮' }, { name: 'Dumplings', icon: '🥟' }, { name: 'Fan', icon: '🪭' },
      { name: 'Candied fruit', icon: '🍡' }, { name: 'Fireworks', icon: '🎆' }, { name: 'Ink stick', icon: '🖋️' },
    ],
    names: ['Old Ma', 'Granny Wu', 'Fat Zhu', 'Third Song', 'Little Hu', 'Widow Lu', 'Big Tian', 'Han the Eel', 'Jia', 'Bai', 'Xu', 'Deng', 'Gao', 'Luo', 'Feng'],
    insult: 0.72, safeShare: 0.56, markup: [1.4, 1.8], awning: '#5b3f8c',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Model ─────────────────────────────────────────────────────────────────────

export interface Merchant {
  name: string
  good: number
  ask0: number
  /** Hidden lowest price (night: at nightfall, falls with the watches). */
  r0: number
  patience: number
  /** Night market: the turn after which another buyer takes the stall. */
  soldAt: number | null
}

/** What the market shows about a good: guild band, fair price, price board or rumour. */
export interface Guide { lo: number; mid: number; hi: number }

export interface Level {
  configId: string
  difficulty: Difficulty
  market: Market
  insult: number
  safeShare: number
  goods: { name: string; icon: string }[]
  guide: Guide[]
  merchants: Merchant[]
  purse: number
  rounds: number
  /** Turns per trading day (board), else 0. */
  dayLength: number
  /** Night: price fall per turn. */
  decay: number
  /** Judges' fine for an insulting offer. */
  fine: number
  /** What the solver spent; the purse is set from it. */
  par: number
}

export type React = 'accept' | 'paid' | 'counter' | 'firm' | 'walk' | 'banned' | 'fined' | 'refuse' | 'close'
export interface Bid { x: number; c: number | null; react: React }
export interface Stall { ask: number; left: number; status: 'open' | 'walked' | 'sold' | 'bought'; hist: Bid[] }
export interface BazaarState { round: number; purse: number; ms: Stall[]; have: boolean[]; fines: number }

export type Action = { t: 'offer'; m: number; x: number } | { t: 'accept'; m: number } | { t: 'wait' }

export type ApplyResult =
  | { ok: true; state: BazaarState; react: React | null; price?: number }
  | { ok: false; reason: string }

export const NIGHT_FLOOR = 0.6

const fall = (lv: Level, t: number) => (lv.market === 'night' ? Math.max(NIGHT_FLOOR, Math.pow(1 - lv.decay, t)) : 1)

/** The list price at turn t (the opening ask, falling at night). */
export function listNow(lv: Level, i: number, t: number): number {
  return Math.round(lv.merchants[i].ask0 * fall(lv, t))
}

/** The hidden lowest price at turn t. */
export function lowestNow(lv: Level, i: number, t: number): number {
  return Math.round(lv.merchants[i].r0 * fall(lv, t))
}

/** The line the player is told is safe to offer at. */
export function safeLine(lv: Level, i: number, t: number): number {
  const g = lv.guide[lv.merchants[i].good]
  if (lv.market === 'guild' || lv.market === 'board' || lv.market === 'silent') return g.lo
  return Math.ceil(lv.safeShare * listNow(lv, i, t))
}

/** Night: turns until a crowd buys this stall out (1 = this is the last turn), 0 = no crowd. */
export function crowdOf(lv: Level, st: BazaarState, i: number): number {
  const s = lv.merchants[i].soldAt
  if (s === null || st.ms[i].status !== 'open') return 0
  const d = s - st.round
  return d >= 1 && d <= 2 ? d : 0
}

export function startState(lv: Level): BazaarState {
  return {
    round: 0, purse: lv.purse, fines: 0,
    ms: lv.merchants.map(m => ({ ask: m.ask0, left: m.patience, status: 'open', hist: [] })),
    have: lv.goods.map(() => false),
  }
}

const clone = (st: BazaarState): BazaarState => ({ ...st, have: [...st.have], ms: st.ms.map(s => ({ ...s, hist: [...s.hist] })) })

function tick(lv: Level, st: BazaarState) {
  st.round++
  st.ms.forEach((s, i) => {
    if (s.status !== 'open') return
    const m = lv.merchants[i]
    if (lv.market === 'night') s.ask = Math.max(lowestNow(lv, i, st.round), Math.min(s.ask, listNow(lv, i, st.round)))
    if (m.soldAt !== null && st.round >= m.soldAt) s.status = 'sold'
  })
  if (lv.dayLength && st.round % lv.dayLength === 0 && st.round < lv.rounds) {
    st.ms.forEach((s, i) => { if (s.status === 'open') { s.ask = lv.merchants[i].ask0; s.left = lv.merchants[i].patience; s.hist = [] } })
  }
}

function buy(lv: Level, st: BazaarState, i: number, price: number) {
  st.purse -= price
  st.ms[i].status = 'bought'
  st.have[lv.merchants[i].good] = true
}

export function apply(lv: Level, cur: BazaarState, a: Action): ApplyResult {
  if (a.t === 'wait') { const st = clone(cur); tick(lv, st); return { ok: true, state: st, react: null } }
  const m = lv.merchants[a.m]
  if (!m) return { ok: false, reason: 'No such stall' }
  const s0 = cur.ms[a.m]
  if (s0.status !== 'open') return { ok: false, reason: 'That stall is closed to you' }
  if (cur.have[m.good]) return { ok: false, reason: `You already have the ${lv.goods[m.good].name.toLowerCase()}` }
  const st = clone(cur)
  const s = st.ms[a.m]
  const r = lowestNow(lv, a.m, st.round)
  if (a.t === 'accept') {
    if (lv.market === 'silent') return { ok: false, reason: 'In the silent trade you can only leave a pile' }
    if (s.ask > st.purse) return { ok: false, reason: 'Your purse is too light' }
    const price = s.ask
    s.hist.push({ x: price, c: null, react: 'paid' })
    buy(lv, st, a.m, price)
    tick(lv, st)
    return { ok: true, state: st, react: 'paid', price }
  }
  const x = Math.round(a.x)
  if (!(x >= 1)) return { ok: false, reason: 'Name a price' }
  if (x > st.purse) return { ok: false, reason: 'Your purse is too light' }
  let react: React
  const fair = lv.market === 'judges' && x >= lv.guide[m.good].hi
  if (fair || x >= r) {
    react = 'accept'
    s.hist.push({ x, c: null, react })
    buy(lv, st, a.m, x)
    tick(lv, st)
    return { ok: true, state: st, react, price: x }
  }
  if (lv.market === 'guild' && x < lv.guide[m.good].lo) {
    react = 'banned'
    st.ms.forEach((o, j) => { if (lv.merchants[j].good === m.good && o.status === 'open') o.status = 'walked' })
  } else if (lv.market !== 'guild' && x < lv.insult * r) {
    if (lv.market === 'judges') {
      react = 'fined'
      const f = Math.min(lv.fine, st.purse)
      st.purse -= f; st.fines += f
      if (s.left <= 0) s.status = 'walked'
      else s.left--
    } else {
      react = 'walk'
      s.status = 'walked'
    }
  } else if (s.left <= 0) {
    react = 'walk'
    s.status = 'walked'
  } else {
    s.left--
    if (lv.market === 'silent') react = x >= 0.92 * r ? 'close' : 'refuse'
    else {
      const half = Math.ceil((s.ask + x) / 2)
      const c = Math.max(r, half)
      react = c > half ? 'firm' : 'counter'
      s.ask = Math.min(s.ask, c)
    }
  }
  s.hist.push({ x, c: lv.market === 'silent' || react === 'walk' || react === 'banned' ? null : s.ask, react })
  tick(lv, st)
  return { ok: true, state: st, react }
}

export type Status = { state: 'play' } | { state: 'won' } | { state: 'lost'; reason: string }

export function status(lv: Level, st: BazaarState): Status {
  if (st.have.every(Boolean)) return { state: 'won' }
  if (st.round >= lv.rounds) {
    const why: Record<Market, string> = {
      guild: 'The bazaar gates closed for the night',
      judges: 'The market emptied at dusk',
      board: 'The last gong sounded',
      silent: 'The caravan had to leave',
      night: 'Dawn broke and the stalls packed up',
    }
    return { state: 'lost', reason: why[lv.market] }
  }
  for (let g = 0; g < lv.goods.length; g++) {
    if (st.have[g]) continue
    if (!st.ms.some((s, i) => s.status === 'open' && lv.merchants[i].good === g)) {
      return { state: 'lost', reason: `No one will sell you ${lv.goods[g].name.toLowerCase()}` }
    }
  }
  return { state: 'play' }
}

// ── Strategies ────────────────────────────────────────────────────────────────

export type Policy = (lv: Level, st: BazaarState) => Action

export interface RunResult { won: boolean; actions: Action[]; state: BazaarState; spent: number; reason?: string }

export function run(lv: Level, policy: Policy, start = startState(lv)): RunResult {
  let st = start
  const actions: Action[] = []
  for (let guard = 0; guard < 500; guard++) {
    const s = status(lv, st)
    if (s.state !== 'play') return { won: s.state === 'won', actions, state: st, spent: start.purse - st.purse, reason: s.state === 'lost' ? s.reason : undefined }
    let a = policy(lv, st)
    let r = apply(lv, st, a)
    if (!r.ok) { a = { t: 'wait' }; r = apply(lv, st, a) }
    if (!r.ok) break
    st = r.state
    actions.push(a)
  }
  return { won: false, actions, state: st, spent: start.purse - st.purse, reason: 'stuck' }
}

const openOf = (lv: Level, st: BazaarState, g: number) =>
  lv.merchants.map((_, i) => i).filter(i => lv.merchants[i].good === g && st.ms[i].status === 'open')
const needed = (lv: Level, st: BazaarState) => lv.goods.map((_, g) => g).filter(g => !st.have[g])
const cheapest = (_lv: Level, st: BazaarState, ids: number[]) =>
  ids.reduce((b, i) => (b < 0 || st.ms[i].ask < st.ms[b].ask ? i : b), -1)

/** A careful player: haggles at the safe line, pays when the keeper turns firm or patience runs out. */
export function solverPolicy(): Policy {
  let active = -1
  return (lv, st) => {
    const need = needed(lv, st)
    const left = lv.rounds - st.round
    if (active >= 0 && st.ms[active].status !== 'open') active = -1
    if (active < 0) {
      if (lv.market === 'night') {
        const crowded = need.flatMap(g => openOf(lv, st, g)).filter(i => crowdOf(lv, st, i) > 0)
        if (crowded.length) active = cheapest(lv, st, crowded)
        else if (left <= 3 * need.length) active = cheapest(lv, st, openOf(lv, st, need[0]))
        else return { t: 'wait' }
      } else {
        if (lv.dayLength && lv.dayLength - (st.round % lv.dayLength) < 2) return { t: 'wait' }
        active = lv.market === 'silent' ? openOf(lv, st, need[0])[0] : cheapest(lv, st, openOf(lv, st, need[0]))
      }
      if (active === undefined || active < 0) { active = -1; return { t: 'wait' } }
    }
    const i = active
    const s = st.ms[i]
    const last = s.hist[s.hist.length - 1]
    if (lv.market === 'silent') {
      const g = lv.guide[lv.merchants[i].good]
      const step = Math.ceil((g.hi - g.lo) / lv.merchants[i].patience)
      return { t: 'offer', m: i, x: Math.min(g.hi, last ? last.x + step : g.lo) }
    }
    const safe = safeLine(lv, i, st.round)
    const dayLeft = lv.dayLength ? lv.dayLength - (st.round % lv.dayLength) : Infinity
    const mustClose = s.left <= 0 || last?.react === 'firm' || s.ask <= safe || dayLeft <= 1 ||
      (lv.market === 'night' && (crowdOf(lv, st, i) === 1 || left <= need.length || s.hist.length >= 2))
    return mustClose ? { t: 'accept', m: i } : { t: 'offer', m: i, x: safe }
  }
}

export const solve = (lv: Level) => run(lv, solverPolicy())

/** Naive: pay the asking price (silent trade: leave the rumoured top) at the cheapest stall. */
export const payAskPolicy: Policy = (lv, st) => {
  const g = needed(lv, st)[0]
  const ids = openOf(lv, st, g)
  if (lv.market === 'silent') return { t: 'offer', m: ids[0], x: lv.guide[g].hi }
  return { t: 'accept', m: cheapest(lv, st, ids) }
}

/** Naive: offer 40% of the asking price everywhere. */
export const lowballPolicy: Policy = (lv, st) => {
  const g = needed(lv, st)[0]
  const i = openOf(lv, st, g)[0]
  const base = lv.market === 'silent' ? lv.guide[g].lo : st.ms[i].ask
  return { t: 'offer', m: i, x: Math.max(1, Math.floor(base * 0.4)) }
}

export const idlePolicy: Policy = () => ({ t: 'wait' })

// ── Generation ────────────────────────────────────────────────────────────────

const PURSE_SLACK: readonly [number, number, number, number] = [0.3, 0.18, 0.08, 0.04]
const ROUND_SLACK: readonly [number, number, number, number] = [6, 4, 3, 2]
const between = (rng: Rng, a: number, b: number) => a + rng() * (b - a)

function draft(cfg: BazaarConfig, configId: string, difficulty: Difficulty, rng: Rng): Level {
  const K = scale(difficulty, [2, 3, 4, 5])
  const M = scale(difficulty, [2, 2, 3, 3])
  const goods = shuffle(cfg.goods, rng).slice(0, K)
  const names = shuffle(cfg.names, rng)
  const patience = scale(difficulty, [4, 3, 3, 3]) + (cfg.market === 'guild' || cfg.market === 'silent' ? 1 : 0)
  const rounds = cfg.market === 'night' ? K * 3 + 4 : 999
  const guide: Guide[] = []
  const merchants: Merchant[] = []
  let ni = 0
  goods.forEach((_, g) => {
    const b = randInt(rng, 20, 90)
    let G: Guide
    switch (cfg.market) {
      case 'guild': G = { lo: Math.round(b * 0.9), mid: 0, hi: 0 }; G.hi = Math.round(G.lo * 1.85); G.mid = Math.round((G.lo + G.hi) / 2); break
      case 'judges': G = { lo: 0, mid: 0, hi: Math.round(b * 1.5) }; break
      case 'board': G = { lo: Math.round(b * 0.86), mid: b, hi: Math.round(b * 1.5) }; break
      case 'silent': G = { lo: b, mid: 0, hi: Math.round(b * 1.36) }; G.mid = Math.round((G.lo + G.hi) / 2); break
      default: G = { lo: 0, mid: b, hi: 0 }
    }
    guide.push(G)
    const row: Merchant[] = []
    for (let k = 0; k < M; k++) {
      const name = names[ni++ % names.length]
      let r0: number, ask0: number
      let soldAt: number | null = null
      const mk = between(rng, cfg.markup[0], cfg.markup[1])
      switch (cfg.market) {
        case 'guild': r0 = randInt(rng, G.lo, Math.round(G.lo * 1.3)); ask0 = Math.min(G.hi, Math.round(r0 * mk)); break
        case 'judges': r0 = randInt(rng, Math.round(G.hi * 0.6), Math.round(G.hi * 0.85)); ask0 = G.hi; break
        case 'board': r0 = randInt(rng, G.lo, G.mid); ask0 = Math.round(G.hi * between(rng, 0.92, 1.08)); break
        case 'silent': r0 = randInt(rng, G.lo, G.hi); ask0 = G.hi; break
        default: {
          const sells = k < M - 1
          r0 = Math.round(b * (sells ? between(rng, 0.72, 0.92) : between(rng, 0.95, 1.15)))
          ask0 = Math.round(r0 * mk)
          if (sells) soldAt = randInt(rng, 2, rounds - 3)
        }
      }
      row.push({ name, good: g, ask0, r0, patience, soldAt })
    }
    merchants.push(...shuffle(row, rng))
  })
  const avgPrice = guide.reduce((t, G) => t + G.hi, 0) / Math.max(1, guide.length)
  return {
    configId, difficulty, market: cfg.market, insult: cfg.insult, safeShare: cfg.safeShare,
    goods, guide, merchants, purse: 1e9, rounds, dayLength: 0, decay: 0.05,
    fine: Math.max(5, Math.round(avgPrice * 0.3)), par: 0,
  }
}

export function makeLevel(configId: string, difficulty: Difficulty, seed: number, params?: Record<string, unknown>): Level {
  const id = CONFIGS[configId] ? configId : 'istanbul-bedesten'
  const cfg = resolveConfig(CONFIGS, id, params, 'istanbul-bedesten')
  const rng = mulberry32(hashString(`bazaar:${id}:${difficulty}:${seed}`))
  let fallback: Level | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const lv = draft(cfg, id, difficulty, rng)
    let sol: RunResult | null = null
    if (lv.market === 'board') {
      const days = scale(difficulty, [1, 2, 2, 3])
      for (let dl = 4; dl <= 14 && !sol; dl++) {
        lv.dayLength = dl; lv.rounds = days * dl
        const s = solve(lv)
        if (s.won) sol = s
      }
      if (!sol) continue
      if (difficulty <= 2) { lv.dayLength++; lv.rounds = days * lv.dayLength; sol = solve(lv) }
    } else {
      sol = solve(lv)
      if (!sol.won) continue
      if (lv.market !== 'night') lv.rounds = sol.actions.length + ROUND_SLACK[difficulty - 1]
      sol = solve(lv)
    }
    if (!sol.won) continue
    lv.par = sol.spent
    lv.purse = Math.ceil(sol.spent * (1 + PURSE_SLACK[difficulty - 1]))
    if (!solve(lv).won) continue
    fallback ??= lv
    if (difficulty >= 3 && (run(lv, payAskPolicy).won || run(lv, lowballPolicy).won)) continue
    return lv
  }
  return fallback!
}

// ── Component ─────────────────────────────────────────────────────────────────

function reactText(lv: Level, cur: string, i: number, b: Bid): string {
  const n = lv.merchants[i].name
  switch (b.react) {
    case 'accept': return lv.market === 'silent' ? `They take your ${b.x} ${cur} and leave the goods.` : `${n} shakes on ${b.x} ${cur}.`
    case 'paid': return `You pay ${n} ${b.x} ${cur}.`
    case 'counter': return `${n} counters: ${b.c} ${cur}.`
    case 'firm': return `${n} swears: ${b.c} ${cur}, not a coin less.`
    case 'walk': return lv.market === 'silent' ? 'They take offence and vanish into the trees.' : `${n} turns away and will not deal with you.`
    case 'banned': return `The ${lv.goods[lv.merchants[i].good].name.toLowerCase()} guild closes its row to you.`
    case 'fined': return `The judges fine you ${lv.fine} ${cur} for haggling unfairly. ${n} still asks ${b.c}.`
    case 'refuse': return 'They leave your pile untouched.'
    case 'close': return 'They leave your pile, but push their goods a little closer.'
  }
}

function PriceChart({ lv, st, i, offer }: { lv: Level; st: BazaarState; i: number; offer: number }) {
  const m = lv.merchants[i]
  const s = st.ms[i]
  const G = lv.guide[m.good]
  const safe = safeLine(lv, i, st.round)
  const pts = s.hist
  const W = 300, H = 92, padL = 30, padR = 8, padT = 8, padB = 14
  const top = Math.max(m.ask0, G.hi, offer) * 1.04
  const bot = Math.min(safe, offer, ...pts.map(p => p.x), G.lo || Infinity) * 0.9
  const y = (v: number) => padT + (H - padT - padB) * (1 - (v - bot) / Math.max(1, top - bot))
  const n = Math.max(4, pts.length + 1)
  const x = (k: number) => padL + ((W - padL - padR) * k) / n
  const askLine = [lv.market === 'silent' ? null : m.ask0, ...pts.map(p => p.c)]
  const path = askLine.map((v, k) => (v === null ? null : `${x(k)},${y(v)}`)).filter(Boolean).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-md bg-paper border border-line" data-testid="bazaar-chart">
      {(lv.market === 'guild' || lv.market === 'silent' || lv.market === 'board') && (
        <rect x={padL} y={y(lv.market === 'board' ? G.mid : G.hi)} width={W - padL - padR}
          height={Math.max(1, y(G.lo) - y(lv.market === 'board' ? G.mid : G.hi))} fill="#7a8f5a" opacity={0.16} />
      )}
      <line x1={padL} x2={W - padR} y1={y(safe)} y2={y(safe)} stroke="#9b2c23" strokeDasharray="3 3" strokeWidth={1} />
      <text x={padL - 3} y={y(safe) + 3} fontSize={8} textAnchor="end" fill="#9b2c23">{safe}</text>
      <text x={padL - 3} y={y(m.ask0) + 3} fontSize={8} textAnchor="end" fill="#5a4b36">{m.ask0}</text>
      {path && <polyline points={path} fill="none" stroke="#5a4b36" strokeWidth={1.6} />}
      {askLine.map((v, k) => v !== null && <circle key={`a${k}`} cx={x(k)} cy={y(v)} r={2.4} fill="#5a4b36" />)}
      {pts.map((p, k) => (
        <circle key={`o${k}`} cx={x(k + 1)} cy={y(p.x)} r={3.2}
          fill={p.react === 'accept' || p.react === 'paid' ? '#2f7a5b' : p.react === 'walk' || p.react === 'banned' || p.react === 'fined' ? '#c0392b' : p.react === 'close' ? '#c9a227' : '#b5651d'} />
      ))}
      <line x1={x(pts.length + 1) - 6} x2={x(pts.length + 1) + 6} y1={y(offer)} y2={y(offer)} stroke="#b5651d" strokeWidth={2} />
      <text x={W - padR} y={H - 3} fontSize={7.5} textAnchor="end" fill="#8a7a5e">● your offers · ━ their ask · ┅ safe line</text>
    </svg>
  )
}

export default function BazaarGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'istanbul-bedesten')
  const lv = useMemo(() => makeLevel(configId, difficulty, seed, params), [configId, difficulty, seed, params])
  const [state, setState] = useState<BazaarState>(() => startState(lv))
  const [sel, setSel] = useState<number | null>(null)
  const [offer, setOffer] = useState(0)
  const [msg, setMsg] = useState('')
  const { outcome, reason, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const live = useRef({ state, settled })
  live.current = { state, settled: live.current.settled || settled }
  useEffect(() => { const s = startState(lv); live.current = { state: s, settled: false }; setState(s); setSel(null); setMsg('') }, [lv])

  const cur = cfg.currency
  const silent = lv.market === 'silent'

  const choose = (i: number, st = live.current.state) => {
    setSel(i)
    const s = st.ms[i]
    setOffer(Math.min(st.purse, silent ? lv.guide[lv.merchants[i].good].lo : Math.min(s.ask, safeLine(lv, i, st.round))))
  }

  const act = (a: Action) => {
    const c = live.current
    if (c.settled) return
    const r = apply(lv, c.state, a)
    if (!r.ok) { setMsg(r.reason); return }
    live.current = { ...c, state: r.state }
    setState(r.state)
    if (a.t !== 'wait') {
      const s = r.state.ms[a.m]
      setMsg(reactText(lv, cur, a.m, s.hist[s.hist.length - 1]))
      if (s.status === 'open') setOffer(o => Math.min(o, s.ask, r.state.purse))
    } else setMsg(lv.market === 'night' ? 'The watchman beats the next watch. Prices fall.' : 'You wait and watch the market.')
    const out = status(lv, r.state)
    if (out.state === 'won') { live.current.settled = true; win() }
    else if (out.state === 'lost') { live.current.settled = true; lose(out.reason) }
  }

  const left = lv.rounds - state.round
  const dayLeft = lv.dayLength ? lv.dayLength - (state.round % lv.dayLength) : 0
  const selM = sel !== null ? lv.merchants[sel] : null
  const selS = sel !== null ? state.ms[sel] : null
  const canDeal = sel !== null && selS!.status === 'open' && !state.have[selM!.good]
  const sliderMax = Math.max(1, Math.min(state.purse, silent && selM ? lv.guide[selM.good].hi : selS ? selS.ask : 1))

  const guideText = (g: number) => {
    const G = lv.guide[g]
    switch (lv.market) {
      case 'guild': return `guild band ${G.lo}–${G.hi}`
      case 'judges': return `fair price ${G.hi}`
      case 'board': return `board ↓${G.lo} · ${G.mid} · ↑${G.hi}`
      case 'silent': return `rumour ${G.lo}–${G.hi}`
      default: return ''
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title} · {cfg.rule}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2" data-testid="bazaar-purse">Purse {state.purse} {cur}</p>
          <p className={left <= 3 ? 'text-red-600 font-bold' : ''} data-testid="bazaar-turns">Turns {left} left</p>
          {lv.dayLength > 0 && <p data-testid="bazaar-gong" className={dayLeft <= 1 ? 'text-red-600 font-bold' : ''}>Gong in {dayLeft}</p>}
          {lv.market === 'judges' && <p>Fine {lv.fine}{state.fines ? ` · paid ${state.fines}` : ''}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" data-testid="bazaar-set">
        <span className="text-[10px] text-muted self-center">The {cfg.setName}:</span>
        {lv.goods.map((g, k) => (
          <span key={k} className={`text-[11px] px-2 py-0.5 rounded-full border ${state.have[k] ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 font-bold' : 'bg-panel border-line text-ink-2'}`}>
            {g.icon} {g.name}{state.have[k] ? ' ✓' : ''}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {lv.goods.map((g, k) => (
          <div key={k} className={`rounded-lg border border-line bg-panel p-1.5 ${state.have[k] ? 'opacity-50' : ''}`}>
            <div className="flex justify-between text-[10px] text-muted px-0.5 mb-1">
              <span className="font-bold text-ink-2">{g.icon} {g.name}</span><span>{guideText(k)}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {lv.merchants.map((m, i) => {
                if (m.good !== k) return null
                const s = state.ms[i]
                const crowd = crowdOf(lv, state, i)
                const shut = s.status !== 'open'
                return (
                  <button key={i} type="button" data-testid={`stall-${i}`} onClick={() => !settled && choose(i)}
                    className={`relative rounded-md border text-left px-1.5 pt-2 pb-1 min-h-[58px] text-[10px] leading-tight
                      ${sel === i ? 'border-accent ring-2 ring-accent/40' : 'border-line'} ${shut ? 'bg-paper opacity-60' : 'bg-paper-2'}`}>
                    <span className="absolute inset-x-0 top-0 h-1.5 rounded-t-md" style={{ background: cfg.awning }} />
                    <span className="block font-bold text-ink truncate">{m.name}</span>
                    <span className="block tabular-nums text-ink-2">
                      {silent ? (s.status === 'bought' ? 'traded' : `${s.hist.length} pile${s.hist.length === 1 ? '' : 's'}`) : <>
                        {s.ask}{s.ask < listNow(lv, i, state.round) && <span className="line-through text-muted ml-1">{listNow(lv, i, state.round)}</span>}
                      </>}
                    </span>
                    <span className="block text-muted">
                      {s.status === 'bought' ? '✓ bought' : s.status === 'sold' ? 'sold out' : s.status === 'walked' ? 'turned away' :
                        crowd ? <span className="text-red-600 font-bold">{'👥'.repeat(3 - crowd)} crowd</span> :
                        '●'.repeat(s.left) + '○'.repeat(Math.max(0, m.patience - s.left))}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {sel !== null && selS && (
        <PriceChart lv={lv} st={state} i={sel} offer={offer} />
      )}

      <p className="text-[11px] text-center min-h-[16px] text-ink-2 font-bold" data-testid="bazaar-msg">{msg}</p>

      {!settled && (
        <div className="flex flex-col gap-2 w-full max-w-[430px] mx-auto">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="lower" disabled={!canDeal} onClick={() => setOffer(o => Math.max(1, o - 1))}
              className="w-10 h-10 rounded-lg border bg-panel border-line font-bold disabled:opacity-40">−</button>
            <input type="range" data-testid="offer-input" min={1} max={sliderMax} value={Math.min(offer, sliderMax)} disabled={!canDeal}
              onChange={e => setOffer(Number(e.target.value))} className="flex-1 accent-[#9b2c23]" />
            <button type="button" aria-label="raise" disabled={!canDeal} onClick={() => setOffer(o => Math.min(sliderMax, o + 1))}
              className="w-10 h-10 rounded-lg border bg-panel border-line font-bold disabled:opacity-40">+</button>
          </div>
          <div className="flex gap-2">
            <button type="button" data-testid="offer" disabled={!canDeal} onClick={() => sel !== null && act({ t: 'offer', m: sel, x: offer })}
              className="flex-1 h-11 rounded-lg bg-accent text-accent-fg font-bold text-xs disabled:opacity-40">
              {silent ? `Leave ${offer} ${cur}` : `Offer ${offer}`}
            </button>
            {!silent && (
              <button type="button" data-testid="accept" disabled={!canDeal} onClick={() => sel !== null && act({ t: 'accept', m: sel })}
                className="flex-1 h-11 rounded-lg border bg-panel border-line text-ink font-bold text-xs disabled:opacity-40">
                Pay {selS && canDeal ? selS.ask : ''}
              </button>
            )}
            <button type="button" data-testid="wait" onClick={() => act({ t: 'wait' })}
              className="w-20 h-11 rounded-lg border bg-panel border-line text-ink-2 font-bold text-xs">Wait</button>
          </div>
        </div>
      )}
      <p className="text-muted/80 text-[10px] text-center">
        {settled ? (reason ?? '') : sel === null ? 'Tap a stall to bargain. Every offer, payment or wait takes one turn.'
          : silent ? 'They never answer, they only take a pile or leave it. A pile they take is paid in full.'
          : 'A keeper meets you half-way, but not below his lowest price. ●: patience left. Below the dashed line he may walk away.'}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle={`The ${cfg.setName} is complete!`} loseTitle="Empty-handed" />
    </div>
  )
}
