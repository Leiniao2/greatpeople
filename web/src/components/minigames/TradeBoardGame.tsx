import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Merchant Board — a short Monopoly-style trading game.  Roll dice round a
// 20-square board of ports, buy the ones you land on, complete a set to
// double its tolls, build warehouses to raise them further, and survive
// storms, plague and pirates.  Rivals play simple, consistent heuristics.
//
// A season is short — 8 to 10 rounds — so a game takes one to two minutes.
// Every config is a different rule twist (TradeVariant):
//
//   pilot    (Venice)    roll three dice and sail by the two you choose
//   buyout   (Hansa)     buy out a rival's kontor for 1.25× when you land on it;
//                        win by charter points (1 a port, +2 a set), not wealth
//   boom     (Silk Road) prices and tolls inflate every round, so what you
//                        own appreciates — buy early
//   rivalry  (Spice)     no target: be the richest merchant, by a margin,
//                        when the season ends
//
// Dice and event cards come from hash(seed, round, player), so where the
// rivals move never depends on your decisions (and, except when piloting,
// neither does where you move).  That lets the game prove a seed winnable
// before play: a strong scripted merchant plays it out, and if it cannot
// win, the next seed is tried (playableSeed).

export type TradeVariant = 'pilot' | 'buyout' | 'boom' | 'rivalry'

interface TradeConfig {
  title: string
  intro: string
  fact: string
  currency: string
  start: string
  rest: string
  tax: string
  festival: string
  /** 12 ports in board order, grouped [2, 3, 3, 2, 2]. */
  ports: string[]
  groupNames: string[]
  rivals: { name: string; icon: string }[]
  storm: string
  plague: string
  fair: string
  pirates: string
  /** The rule twist this config plays. */
  variant: TradeVariant
  /** One line explaining the twist, shown above the board. */
  twist: string
}

export const CONFIGS: Record<string, TradeConfig> = {
  venice: {
    title: 'The Venetian Stato da Mar',
    intro: 'Trade round the Mediterranean as a Venetian merchant. Buy trading posts, complete a set to double its tolls, and outgrow your rivals before the fleet sails home.',
    fact: 'Venice ran state-organised convoys of great galleys, the mude, auctioning their cargo space to merchants each year. At its height in the 15th century the Arsenale employed thousands of workers and could fit out a galley in a single day.',
    currency: 'ducats', start: 'Rialto', rest: 'Lazaretto', tax: "Doge's Tithe", festival: 'Carnival',
    ports: ['Murano', 'Chioggia', 'Zara', 'Ragusa', 'Corfu', 'Modon', 'Candia', 'Negroponte', 'Alexandria', 'Acre', 'Constantinople', 'Tana'],
    groupNames: ['Lagoon', 'Dalmatia', 'Ionian', 'Levant', 'Black Sea'],
    rivals: [{ name: 'Contarini', icon: '🦁' }, { name: 'Dandolo', icon: '⚓' }, { name: 'Morosini', icon: '🏛️' }],
    storm: 'A storm off Cape Malea sinks a cargo', plague: 'Plague aboard! Forty days in the Lazaretto', fair: 'A fair wind carries you home to the Rialto', pirates: 'Uskok pirates raid your posts',
    variant: 'pilot',
    twist: 'Galley pilots: you roll three dice and sail by any two of them — steer for open ports and away from rival tolls.',
  },
  hansa: {
    title: 'The Hanseatic League',
    intro: 'Run a Hanse trading house round the Baltic and North Sea. Buy kontors, complete a set to double its dues, and build warehouses before winter closes the sea.',
    fact: 'The Hanseatic League linked some 200 towns at its peak. Its four great foreign kontors stood at London (the Steelyard), Bruges, Bergen and Novgorod; Lübeck, its "Queen", hosted the general assembly, the Hansetag, first held in 1356.',
    currency: 'marks', start: 'Lübeck', rest: 'Quarantine', tax: 'Sound Toll', festival: 'Hansetag',
    ports: ['Wismar', 'Rostock', 'Hamburg', 'Bremen', 'Cologne', 'Danzig', 'Riga', 'Reval', 'Visby', 'Bergen', 'Bruges', 'London'],
    groupNames: ['Wendish', 'Westphalian', 'Livonian', 'Gotland', 'Kontors'],
    rivals: [{ name: 'Veckinchusen', icon: '🐟' }, { name: 'Castorp', icon: '🛶' }, { name: 'Warendorp', icon: '🏰' }],
    storm: 'A North Sea gale wrecks a cog', plague: 'Plague in port! You are held in quarantine', fair: 'A fair wind brings you home to Lübeck', pirates: 'The Victual Brothers raid your kontors',
    variant: 'buyout',
    twist: 'League charter: the goal is kontors, not money. Each kontor you hold scores 1 point and each complete set 2 more — and landing on a rival\'s kontor lets you buy it out for 1.25× its price.',
  },
  'silk-road': {
    title: 'Caravanserais of the Silk Road',
    intro: 'Send caravans between the oasis cities. Buy caravanserais, complete a region to double its fees, and build up before the season ends.',
    fact: 'Caravanserais — fortified inns about a day\'s travel apart — lined the Silk Road and Persian routes. Sogdian merchants from Samarkand and Bukhara dominated the trade between the 4th and 8th centuries, and Sogdian became a lingua franca of the route.',
    currency: 'dinars', start: "Chang'an", rest: 'Oasis well', tax: 'Customs post', festival: 'Nowruz market',
    ports: ['Lanzhou', 'Dunhuang', 'Turfan', 'Kucha', 'Kashgar', 'Samarkand', 'Bukhara', 'Merv', 'Nishapur', 'Rayy', 'Baghdad', 'Antioch'],
    groupNames: ['Gansu', 'Tarim', 'Sogdia', 'Khorasan', 'Mesopotamia'],
    rivals: [{ name: 'Nanaivande', icon: '🐫' }, { name: 'Wang Ji', icon: '🏮' }, { name: 'Yazdbozid', icon: '🔥' }],
    storm: 'A sandstorm buries part of your caravan', plague: 'Fever in the caravan! You rest at the oasis well', fair: "Good roads speed you home to Chang'an", pirates: 'Bandits raid your caravanserais',
    variant: 'boom',
    twist: 'Silk boom: every round prices and tolls rise 10%, and what you own rises with them. Buy early, before the market runs away from you.',
  },
  pegu: {
    title: 'The Ports of Pegu',
    intro: 'Junks from China, Gujarati dhows and Portuguese carracks crowd the Gulf of Martaban. Trade for the King of Kings: buy posts along the coast and up the Irrawaddy, complete a region to double its tolls, and build before the monsoon turns.',
    fact: 'Under Bayinnaung, Pegu was one of the great ports of the Bay of Bengal. The Venetian merchant Cesare Federici, who saw it in the late 1560s, described its walls, its gilded palace and a trade in rubies, lac, rice and Indian cloth that drew merchants from Malacca to the Coromandel coast.',
    currency: 'ticals', start: 'Pegu', rest: 'Monsoon harbour', tax: 'Royal toll', festival: 'Pagoda festival',
    ports: ['Syriam', 'Dagon', 'Bassein', 'Martaban', 'Ye', 'Prome', 'Pagan', 'Ava', 'Chiang Mai', 'Lamphun', 'Ayutthaya', 'Tenasserim'],
    groupNames: ['Delta', 'Martaban Coast', 'Irrawaddy', 'Lan Na', 'Siam'],
    rivals: [{ name: 'Portuguese factors', icon: '⛵' }, { name: 'Fujian junk masters', icon: '🏮' }, { name: 'Gujarati brokers', icon: '🧵' }],
    storm: 'A cyclone in the Gulf of Martaban sinks a cargo', plague: 'Fever aboard! You wait out the rains in harbour', fair: 'The monsoon carries you home to Pegu', pirates: 'Arakanese raiders strike your posts',
    variant: 'boom',
    twist: 'Boom years: every round prices and tolls rise 10%, and what you own rises with them. Buy early, before the market runs away from you.',
  },
  spice: {
    title: 'The Spice Race',
    intro: 'Sail for the Indies as a Dutch company captain. Buy factories along the route and out-trade the rival companies before the monsoon turns.',
    fact: 'The Dutch East India Company (VOC), founded in 1602, was the first company to issue tradeable shares to the public. By seizing the Banda Islands in 1621 it won a near-monopoly on nutmeg and mace.',
    currency: 'guilders', start: 'Amsterdam', rest: 'Cape quarantine', tax: 'Company levy', festival: 'Spice auction',
    ports: ['Texel', 'Elmina', 'Cape Town', 'Mozambique', 'Zanzibar', 'Hormuz', 'Goa', 'Calicut', 'Colombo', 'Malacca', 'Banda', 'Ambon'],
    groupNames: ['Atlantic', 'Swahili Coast', 'Malabar', 'Straits', 'Spice Islands'],
    rivals: [{ name: 'Estado da Índia', icon: '⛪' }, { name: 'East India Co.', icon: '🦁' }, { name: 'Compagnie des Indes', icon: '⚜️' }],
    storm: 'A monsoon gale dismasts a ship', plague: 'Scurvy aboard! You rest at the Cape', fair: 'The trade winds carry you home to Amsterdam', pirates: 'Privateers raid your factories',
    variant: 'rivalry',
    twist: 'Company race: there is no fixed goal — when the season ends you must be the richest merchant on the board, ahead of every rival by the margin shown.',
  },
  'robuchon-ateliers': {
    title: 'L’Atelier Goes Round the World',
    intro: 'Robuchon is back, with guests on stools round an open kitchen. Open L’Ateliers city by city, complete a region to double its takings, and build up before the season ends.',
    fact: 'Robuchon opened the first two L’Ateliers in 2003, in Saint-Germain in Paris and at Roppongi Hills in Tokyo. Las Vegas followed in 2005 and London, New York and Hong Kong in 2006; later came Taipei, Singapore and Shanghai, alongside his grand restaurants in Monte-Carlo, Macau and Bordeaux.',
    currency: 'euros', start: 'Saint-Germain', rest: 'Retirement', tax: 'Landlord’s rent', festival: 'Rungis market',
    ports: ['Étoile', 'Bordeaux', 'Tokyo', 'Taipei', 'Shanghai', 'Hong Kong', 'Macau', 'Singapore', 'Monte-Carlo', 'London', 'Las Vegas', 'New York'],
    groupNames: ['France', 'East Asia', 'South China Sea', 'Europe', 'America'],
    rivals: [{ name: 'Rival house', icon: '👨‍🍳' }, { name: 'Grand hotel', icon: '🏨' }, { name: 'Brasserie group', icon: '🍷' }],
    storm: 'The cold room fails overnight and the stock is lost', plague: 'Exhausted, you step back from the stoves', fair: 'A rave review brings you home to Saint-Germain', pirates: 'Copycat counters poach your guests',
    variant: 'rivalry',
    twist: 'Star race: there is no fixed goal — when the season ends you must be the richest house on the board, ahead of every rival by the margin shown.',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

// ── Board ──────────────────────────────────────────────────────────────────────

export type SquareKind = 'start' | 'port' | 'event' | 'tax' | 'rest' | 'festival'
export interface Square { kind: SquareKind; name: string; group?: number; price?: number }

const GROUP_PRICE = [60, 100, 140, 180, 220]
const GROUP_SIZE = [2, 3, 3, 2, 2]
export const GROUP_COLORS = ['#8e5b3a', '#2e86c1', '#d35400', '#c0392b', '#7d3c98']
// Board order: S A A E B T B B E C R C C E D F D E ... (20 squares)
const LAYOUT: (SquareKind | number)[] = ['start', 0, 0, 'event', 1, 'tax', 1, 1, 'event', 2, 'rest', 2, 2, 'event', 3, 'festival', 3, 4, 'event', 4]

export function buildBoard(cfg: TradeConfig): Square[] {
  let port = 0
  return LAYOUT.map(k => {
    if (typeof k === 'number') return { kind: 'port', name: cfg.ports[port++], group: k, price: GROUP_PRICE[k] }
    const name = k === 'start' ? cfg.start : k === 'rest' ? cfg.rest : k === 'tax' ? cfg.tax : k === 'festival' ? cfg.festival : 'Fortune'
    return { kind: k, name }
  })
}

export const SALARY = 100
export const TAX = 60
export const FESTIVAL = 60
export const upgradeCost = (price: number) => price / 2
export const MAX_LEVEL = 2
/** Toll multiplier on a complete set with 0, 1 and 2 warehouses. */
export const TOLL_MULT = [2, 5, 9]
/** Buyout variant: a rival's port costs this many times its price. */
export const BUYOUT_MULT = 1.25
/** Boom variant: prices (and so tolls and wealth) rise this much each round. */
export const INFLATION = 0.1

// ── State ──────────────────────────────────────────────────────────────────────

export interface Merchant { name: string; icon: string; cash: number; pos: number; alive: boolean; skip: boolean; ai: boolean }

export interface Rules {
  variant: TradeVariant
  rounds: number
  /** Wealth goal (pilot, boom). */
  target: number
  /** Charter points to hold (buyout): 1 per port, +SET_BONUS per complete set. */
  charterGoal: number
  /** Lead over the richest rival at the season's end (rivalry). */
  margin: number
  startCash: number
  rivals: number
  aiReserve: number
  aiBuilds: boolean
}

/** Rounds in a season: the time budget (≈ 8 s a round). */
export const roundsFor = (d: Difficulty) => scale(d, [8, 9, 10, 10])

export function rulesFor(difficulty: Difficulty, variant: TradeVariant = 'pilot'): Rules {
  const target = variant === 'boom' ? scale(difficulty, [900, 980, 1040, 1100]) : scale(difficulty, [850, 920, 980, 1030])
  return {
    variant,
    rounds: roundsFor(difficulty),
    target,
    charterGoal: scale(difficulty, [4, 5, 6, 6]),
    margin: scale(difficulty, [80, 90, 100, 120]),
    startCash: scale(difficulty, [500, 500, 450, 450]),
    rivals: scale(difficulty, [1, 2, 2, 3]),
    aiReserve: scale(difficulty, [220, 150, 100, 70]),
    aiBuilds: difficulty >= 3,
  }
}

export interface TradeState {
  round: number
  /** Whose turn: 0 = you. */
  current: number
  phase: 'roll' | 'steer' | 'buy' | 'end' | 'over'
  /** What the buy phase offers: an unowned port, or a rival's (buyout). */
  offer?: 'buy' | 'buyout'
  players: Merchant[]
  owner: number[]
  level: number[]
  /** Your last roll: two dice, or three while piloting. */
  dice: number[] | null
  log: string[]
  result: 'won' | 'lost' | null
  reason?: string
}

export interface TradeGame { configId: string; seed: number; board: Square[]; rules: Rules; cfg: TradeConfig }

function clone(s: TradeState): TradeState {
  return { ...s, players: s.players.map(p => ({ ...p })), owner: [...s.owner], level: [...s.level], log: [...s.log], dice: s.dice && [...s.dice] }
}

export function rollFor(seed: number, round: number, player: number): [number, number] {
  const h = hashString(`dice:${seed}:${round}:${player}`)
  return [1 + (h % 6), 1 + ((h >>> 8) % 6)]
}

/** Piloting: the same two dice plus a third. */
export function roll3For(seed: number, round: number, player: number): [number, number, number] {
  const h = hashString(`dice:${seed}:${round}:${player}`)
  return [1 + (h % 6), 1 + ((h >>> 8) % 6), 1 + ((h >>> 16) % 6)]
}

type Card = 'storm' | 'plague' | 'festival' | 'pirates' | 'windfall' | 'fair' | 'dues'
const CARDS: Card[] = ['storm', 'festival', 'pirates', 'windfall', 'plague', 'fair', 'dues', 'festival', 'storm', 'windfall']

export function cardFor(seed: number, round: number, player: number): Card {
  return CARDS[hashString(`card:${seed}:${round}:${player}`) % CARDS.length]
}

const diceSeed = (game: TradeGame) => hashString(game.configId) ^ game.seed

export function goalText(game: TradeGame): string {
  const { rules, cfg } = game
  if (rules.variant === 'buyout') return `Hold ${rules.charterGoal} charter points`
  if (rules.variant === 'rivalry') return rules.margin ? `Finish richest, ${rules.margin} ${cfg.currency} clear` : 'Finish richest'
  return `Reach ${fmt(rules.target)} ${cfg.currency} of wealth`
}

export function initialState(game: TradeGame): TradeState {
  const { cfg, rules } = game
  const players: Merchant[] = [{ name: 'You', icon: '🧑‍💼', cash: rules.startCash, pos: 0, alive: true, skip: false, ai: false }]
  for (let i = 0; i < rules.rivals; i++) players.push({ ...cfg.rivals[i], cash: rules.startCash, pos: 0, alive: true, skip: false, ai: true })
  return {
    round: 1, current: 0, phase: 'roll', players,
    owner: game.board.map(() => -1), level: game.board.map(() => 0),
    dice: null, log: [`Round 1 of ${rules.rounds}. ${goalText(game)}.`], result: null,
  }
}

// ── Rules helpers ──────────────────────────────────────────────────────────────

/** A port's current price: its list price, inflated each round in a boom. */
export function priceOf(game: TradeGame, s: TradeState, sq: number): number {
  const base = game.board[sq].price!
  if (game.rules.variant !== 'boom') return base
  return Math.round((base * (1 + INFLATION * (s.round - 1))) / 5) * 5
}

/** What buying `sq` costs you now (a buyout costs more). */
export function costOf(game: TradeGame, s: TradeState, sq: number): number {
  const p = priceOf(game, s, sq)
  return s.owner[sq] >= 0 ? Math.round(p * BUYOUT_MULT) : p
}

export function ownsSet(game: TradeGame, s: TradeState, player: number, group: number): boolean {
  return game.board.every((sq, i) => sq.kind !== 'port' || sq.group !== group || s.owner[i] === player)
}

export function setsOwned(game: TradeGame, s: TradeState, player: number): number {
  let n = 0
  for (let g = 0; g < GROUP_SIZE.length; g++) if (ownsSet(game, s, player, g)) n++
  return n
}

/** Buyout variant: each port you hold scores 1, each complete set SET_BONUS more. */
export const SET_BONUS = 2
export function charterPoints(game: TradeGame, s: TradeState, player: number): number {
  return s.owner.filter(o => o === player).length + SET_BONUS * setsOwned(game, s, player)
}

export function tollAt(game: TradeGame, s: TradeState, sq: number): number {
  const square = game.board[sq]
  if (square.kind !== 'port' || s.owner[sq] < 0) return 0
  const base = priceOf(game, s, sq) / 4
  if (!ownsSet(game, s, s.owner[sq], square.group!)) return base
  return base * TOLL_MULT[s.level[sq]]
}

export function wealth(game: TradeGame, s: TradeState, player: number): number {
  let w = s.players[player].cash
  game.board.forEach((_, i) => {
    if (s.owner[i] === player) { const p = priceOf(game, s, i); w += p + s.level[i] * upgradeCost(p) }
  })
  return w
}

/** Ports where `player` may build a warehouse right now. */
export function buildable(game: TradeGame, s: TradeState, player: number): number[] {
  return game.board.map((_, i) => i).filter(i => {
    const sq = game.board[i]
    return sq.kind === 'port' && s.owner[i] === player && s.level[i] < MAX_LEVEL
      && ownsSet(game, s, player, sq.group!) && s.players[player].cash >= upgradeCost(priceOf(game, s, i))
  })
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** Raise cash by selling warehouses, then ports, back to the bank at half cost. */
function liquidate(game: TradeGame, s: TradeState, p: number) {
  const m = s.players[p]
  const mine = game.board.map((_, i) => i).filter(i => s.owner[i] === p).sort((a, b) => game.board[a].price! - game.board[b].price!)
  for (const i of mine) while (m.cash < 0 && s.level[i] > 0) {
    s.level[i]--; m.cash += upgradeCost(priceOf(game, s, i)) / 2
    s.log.push(`${m.name} sold a warehouse in ${game.board[i].name}.`)
  }
  for (const i of mine) if (m.cash < 0) {
    m.cash += priceOf(game, s, i) / 2
    s.owner[i] = -1; s.level[i] = 0
    s.log.push(`${m.name} sold ${game.board[i].name} to the bank.`)
  }
}

/** Pay `amount` from p to `to` (-1 = the bank), bankrupting p if it cannot. */
function pay(game: TradeGame, s: TradeState, p: number, to: number, amount: number) {
  const m = s.players[p]
  m.cash -= amount
  let paid = amount
  if (m.cash < 0) liquidate(game, s, p)
  if (m.cash < 0) {
    paid = amount + m.cash
    m.alive = false
    m.cash = 0
    s.owner = s.owner.map(o => (o === p ? -1 : o))
    s.level = s.level.map((l, i) => (s.owner[i] === -1 ? 0 : l))
    s.log.push(`${m.name} ${p === 0 ? 'are' : 'is'} bankrupt!`)
  }
  if (to >= 0 && paid > 0) s.players[to].cash += paid
}

/** The richest rival's wealth (0 if every rival is gone). */
export function bestRival(game: TradeGame, s: TradeState): number {
  let best = 0
  for (let k = 1; k < s.players.length; k++) if (s.players[k].alive) best = Math.max(best, wealth(game, s, k))
  return best
}

function checkEnd(game: TradeGame, s: TradeState) {
  if (s.result) return
  const { rules } = game
  const over = (result: 'won' | 'lost', reason: string) => { s.result = result; s.reason = reason; s.phase = 'over' }
  if (!s.players[0].alive) return over('lost', 'You went bankrupt')
  if (s.players.slice(1).every(p => !p.alive)) return over('won', 'Every rival is bankrupt')
  if ((rules.variant === 'pilot' || rules.variant === 'boom') && wealth(game, s, 0) >= rules.target) return over('won', 'You reached the wealth target')
  if (rules.variant === 'buyout' && charterPoints(game, s, 0) >= rules.charterGoal) return over('won', `The League grants your charter: ${charterPoints(game, s, 0)} points`)
}

/** The season is over: judge it. */
function seasonEnd(game: TradeGame, s: TradeState) {
  const mine = wealth(game, s, 0), rival = bestRival(game, s)
  s.phase = 'over'
  if (game.rules.variant === 'rivalry' && mine >= rival + game.rules.margin) {
    s.result = 'won'; s.reason = `You finished richest: ${fmt(mine)} to ${fmt(rival)} ${game.cfg.currency}`
    return
  }
  s.result = 'lost'
  s.reason = game.rules.variant === 'rivalry' ? `The season ended at ${fmt(mine)} to the leader's ${fmt(rival)} ${game.cfg.currency}`
    : game.rules.variant === 'buyout' ? `The season ended with ${charterPoints(game, s, 0)} of ${game.rules.charterGoal} charter points`
      : `The season ended at ${fmt(mine)} of ${fmt(game.rules.target)} ${game.cfg.currency}`
}

/** Move `steps` and resolve the square. Returns the buy decision pending, if any. */
function moveAndLand(game: TradeGame, s: TradeState, p: number, steps: number): 'buy' | 'buyout' | null {
  const m = s.players[p]
  const { cfg, board } = game
  const to = (m.pos + steps) % board.length
  if (m.pos + steps >= board.length) { m.cash += SALARY; s.log.push(`${m.name} passed ${cfg.start}: +${SALARY}.`) }
  m.pos = to
  const sq = board[to]
  const who = m.name
  if (sq.kind === 'port') {
    const o = s.owner[to]
    if (o < 0) return 'buy'
    if (o !== p) {
      const toll = tollAt(game, s, to)
      s.log.push(`${who} paid ${fmt(toll)} toll at ${sq.name} to ${s.players[o].name}.`)
      pay(game, s, p, o, toll)
      if (p === 0 && m.alive && game.rules.variant === 'buyout' && s.owner[to] === o && s.players[o].alive) return 'buyout'
    }
    return null
  }
  if (sq.kind === 'tax') { s.log.push(`${who} paid the ${sq.name}: ${TAX}.`); pay(game, s, p, -1, TAX) }
  if (sq.kind === 'festival') { m.cash += FESTIVAL; s.log.push(`${who} traded at the ${sq.name}: +${FESTIVAL}.`) }
  if (sq.kind === 'event') {
    const card = cardFor(diceSeed(game), s.round, p)
    const owned = s.owner.filter(o => o === p).length
    if (card === 'storm') { s.log.push(`${cfg.storm} — ${who} lose${p ? 's' : ''} 70.`); pay(game, s, p, -1, 70) }
    if (card === 'festival') { m.cash += 90; s.log.push(`A rich buyer pays ${who === 'You' ? 'you' : who} 90.`) }
    if (card === 'pirates') { const loss = 20 * owned; s.log.push(`${cfg.pirates}: ${who} lose${p ? 's' : ''} ${loss}.`); if (loss) pay(game, s, p, -1, loss) }
    if (card === 'dues') { const loss = Math.round(m.cash * 0.1); s.log.push(`Guild dues: ${who} pay${p ? 's' : ''} ${loss}.`); pay(game, s, p, -1, loss) }
    if (card === 'windfall') {
      s.log.push(`Windfall! Each rival pays ${who === 'You' ? 'you' : who} 30.`)
      s.players.forEach((o, k) => { if (k !== p && o.alive) pay(game, s, k, p, 30) })
    }
    if (card === 'plague') {
      s.log.push(`${cfg.plague} — ${who} miss${p ? 'es' : ''} a turn.`)
      m.pos = board.findIndex(b => b.kind === 'rest'); m.skip = true
    }
    if (card === 'fair') { m.pos = 0; m.cash += SALARY; s.log.push(`${cfg.fair}: +${SALARY}.`) }
  }
  return null
}

// ── Rival AI ───────────────────────────────────────────────────────────────────

function aiWantsBuy(game: TradeGame, s: TradeState, p: number, sq: number, reserve: number): boolean {
  const price = priceOf(game, s, sq)
  const cash = s.players[p].cash
  const group = game.board[sq].group!
  // Buying the last port of a set is worth dipping into the reserve.
  const completes = game.board.every((b, i) => i === sq || b.kind !== 'port' || b.group !== group || s.owner[i] === p)
  return cash - price >= (completes ? reserve / 2 : reserve)
}

function aiBuild(game: TradeGame, s: TradeState, p: number, reserve: number) {
  for (let guard = 0; guard < 6; guard++) {
    const options = buildable(game, s, p).filter(i => s.players[p].cash - upgradeCost(priceOf(game, s, i)) >= reserve)
    if (!options.length) return
    const i = options.sort((a, b) => s.level[a] - s.level[b] || game.board[b].price! - game.board[a].price!)[0]
    s.players[p].cash -= upgradeCost(priceOf(game, s, i))
    s.level[i]++
    s.log.push(`${s.players[p].name} built a warehouse in ${game.board[i].name}.`)
  }
}

function aiTurn(game: TradeGame, s: TradeState, p: number) {
  const m = s.players[p]
  if (!m.alive) return
  if (m.skip) { m.skip = false; s.log.push(`${m.name} sits out this turn.`); return }
  const { aiReserve, aiBuilds } = game.rules
  if (aiBuilds) aiBuild(game, s, p, aiReserve + 60)
  const dice = rollFor(diceSeed(game), s.round, p)
  const decide = moveAndLand(game, s, p, dice[0] + dice[1])
  if (decide === 'buy' && m.alive) {
    const sq = m.pos
    if (aiWantsBuy(game, s, p, sq, aiReserve)) {
      m.cash -= priceOf(game, s, sq)
      s.owner[sq] = p
      s.log.push(`${m.name} bought ${game.board[sq].name}.`)
    }
  }
}

// ── Your turn ──────────────────────────────────────────────────────────────────

function land(game: TradeGame, s: TradeState, steps: number): TradeState {
  const decide = moveAndLand(game, s, 0, steps)
  checkEnd(game, s)
  if (s.result) return s
  s.offer = decide ?? undefined
  s.phase = decide ? 'buy' : 'end'
  return s
}

/** Roll: two dice move you at once; piloting rolls three and waits for `steer`. */
export function roll(game: TradeGame, s0: TradeState): TradeState {
  if (s0.phase !== 'roll' || s0.result) return s0
  const s = clone(s0)
  s.log = []
  if (game.rules.variant === 'pilot') {
    s.dice = roll3For(diceSeed(game), s.round, 0)
    s.phase = 'steer'
    s.log.push(`You rolled ${s.dice.join(', ')} — choose two dice to sail by.`)
    return s
  }
  const dice = rollFor(diceSeed(game), s.round, 0)
  s.dice = dice
  return land(game, s, dice[0] + dice[1])
}

/** Piloting: sail by every die but die `drop`. */
export function steer(game: TradeGame, s0: TradeState, drop: number): TradeState {
  if (s0.phase !== 'steer' || !s0.dice || drop < 0 || drop > 2) return s0
  const s = clone(s0)
  const steps = s.dice!.reduce((a, b, k) => (k === drop ? a : a + b), 0)
  s.log.push(`You sail ${steps}.`)
  return land(game, s, steps)
}

export function decideBuy(game: TradeGame, s0: TradeState, buy: boolean): TradeState {
  if (s0.phase !== 'buy') return s0
  const s = clone(s0)
  const sq = s.players[0].pos
  const cost = costOf(game, s, sq)
  const from = s.owner[sq]
  if (buy && s.players[0].cash >= cost) {
    s.players[0].cash -= cost
    if (from >= 0) {
      s.players[from].cash += cost
      s.level[sq] = 0
      s.log.push(`You bought out ${s.players[from].name}'s ${game.board[sq].name} for ${fmt(cost)}.`)
    } else s.log.push(`You bought ${game.board[sq].name}.`)
    s.owner[sq] = 0
  } else s.log.push(`You passed on ${game.board[sq].name}.`)
  s.phase = 'end'
  s.offer = undefined
  checkEnd(game, s)
  return s
}

export function build(game: TradeGame, s0: TradeState, sq: number): TradeState {
  if (s0.result || s0.phase === 'buy' || s0.phase === 'steer' || !buildable(game, s0, 0).includes(sq)) return s0
  const s = clone(s0)
  s.players[0].cash -= upgradeCost(priceOf(game, s, sq))
  s.level[sq]++
  s.log.push(`You built a warehouse in ${game.board[sq].name}.`)
  checkEnd(game, s)
  return s
}

/** Finish your turn: every rival plays, then the next round begins. */
export function endTurn(game: TradeGame, s0: TradeState): TradeState {
  if (s0.phase !== 'end' || s0.result) return s0
  const s = clone(s0)
  for (let round = 0; round < 3; round++) {
    for (let p = 1; p < s.players.length; p++) { aiTurn(game, s, p); checkEnd(game, s); if (s.result) return s }
    if (s.round >= game.rules.rounds) { seasonEnd(game, s); return s }
    s.round++
    s.log.push(`— Round ${s.round} of ${game.rules.rounds} —`)
    // Inflation can carry you over the line between turns.
    checkEnd(game, s)
    if (s.result) return s
    const me = s.players[0]
    if (!me.skip) break
    me.skip = false
    s.log.push('You sit out this turn.')
  }
  s.phase = 'roll'
  s.dice = null
  return s
}

// ── Strong scripted merchant (tests and seed checks) ───────────────────────────

export function strongBuy(game: TradeGame, s: TradeState): boolean {
  const sq = s.players[0].pos
  const cost = costOf(game, s, sq)
  const cash = s.players[0].cash
  // Charter points: every kontor counts, so buy (and buy out) whatever you can afford.
  if (game.rules.variant === 'buyout') return cash >= cost
  return cash - cost >= 20
}

/** Piloting: try each pair of dice and keep the landing that leaves you best placed. */
export function strongSteer(game: TradeGame, s: TradeState): number {
  const score = (t: TradeState) => (t.result === 'won' ? 1e9 : t.result === 'lost' ? -1e9 : 0)
    + wealth(game, t, 0) + 40 * t.owner.filter(o => o === 0).length + 200 * setsOwned(game, t, 0)
  let best = -Infinity, pick = 0
  for (let k = 0; k < 3; k++) {
    let t = steer(game, s, k)
    if (t.phase === 'buy') t = decideBuy(game, t, strongBuy(game, t))
    const v = score(t)
    if (v > best) { best = v; pick = k }
  }
  return pick
}

/** Plays your whole turn: build first, roll (steering greedily), buy almost anything, end. */
export function strongTurn(game: TradeGame, s0: TradeState): TradeState {
  let s = s0
  const buildAll = () => {
    for (let k = 0; k < 6; k++) {
      const opts = buildable(game, s, 0).filter(i => s.players[0].cash - upgradeCost(priceOf(game, s, i)) >= 60)
      if (!opts.length) break
      s = build(game, s, opts.sort((a, b) => s.level[a] - s.level[b] || game.board[b].price! - game.board[a].price!)[0])
    }
  }
  buildAll()
  if (s.result) return s
  s = roll(game, s)
  if (s.phase === 'steer') s = steer(game, s, strongSteer(game, s))
  if (s.phase === 'buy') s = decideBuy(game, s, strongBuy(game, s))
  if (s.result) return s
  buildAll()
  if (s.result) return s
  return endTurn(game, s)
}

export function simulate(game: TradeGame, turn: (g: TradeGame, s: TradeState) => TradeState = strongTurn): TradeState {
  let s = initialState(game)
  for (let k = 0; k < 200 && !s.result; k++) s = turn(game, s)
  return s
}

export function makeGame(configId: string, difficulty: Difficulty, seed: number): TradeGame {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'venice')
  return { configId, seed, cfg, board: buildBoard(cfg), rules: rulesFor(difficulty, cfg.variant) }
}

/** The first seed from `seed` on that the strong merchant can win. */
export function playableSeed(configId: string, difficulty: Difficulty, seed: number): { seed: number; tries: number } {
  for (let k = 0; k < 200; k++) {
    const s = (seed + k * 7919) >>> 0
    if (simulate(makeGame(configId, difficulty, s)).result === 'won') return { seed: s, tries: k + 1 }
  }
  return { seed, tries: 0 }
}

export function newTrade(configId: string, difficulty: Difficulty, seed: number): TradeGame {
  return makeGame(configId, difficulty, playableSeed(configId, difficulty, seed).seed)
}

// ── Component ──────────────────────────────────────────────────────────────────

/** Perimeter of a 6×6 grid, clockwise from the bottom-right corner. */
function ringCell(i: number): [number, number] {
  if (i <= 5) return [6, 6 - i]          // bottom row, right → left
  if (i <= 10) return [6 - (i - 5), 1]   // left column, bottom → top
  if (i <= 15) return [1, 1 + (i - 10)]  // top row, left → right
  return [1 + (i - 15), 6]               // right column, top → bottom
}

const PLAYER_COLORS = ['#1f6feb', '#c0392b', '#1e8449', '#8e44ad']
const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

export default function TradeBoardGame({ configId, difficulty, seed, onWin, onLose }: MinigameProps) {
  const game = useMemo(() => newTrade(configId, difficulty, seed), [configId, difficulty, seed])
  const { cfg, board, rules } = game
  const [state, setState] = useState<TradeState>(() => initialState(game))
  const [focus, setFocus] = useState<number | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const [history, setHistory] = useState<string[]>(() => initialState(game).log)

  const apply = (next: TradeState) => {
    if (next === state) return
    // A roll starts a fresh turn log; otherwise the log only grows.
    const fresh = next.log.length >= state.log.length && state.log.every((l, k) => next.log[k] === l)
      ? next.log.slice(state.log.length) : next.log
    setState(next)
    setHistory(h => [...h, ...fresh].slice(-40))
    if (next.result === 'won') win()
    else if (next.result === 'lost') lose(next.reason)
  }

  const me = state.players[0]
  const myWealth = wealth(game, state, 0)
  const here = board[me.pos]
  const canBuild = state.phase !== 'buy' && state.phase !== 'steer' && !state.result ? buildable(game, state, 0) : []
  const progress = rules.variant === 'buyout' ? charterPoints(game, state, 0) / rules.charterGoal
    : rules.variant === 'rivalry' ? myWealth / Math.max(1, bestRival(game, state) + rules.margin) : myWealth / rules.target
  const sel = focus !== null ? board[focus] : null

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
          <p className="text-ink-2 text-xs leading-relaxed mt-0.5" data-testid="trade-twist"><span className="font-bold text-accent">Twist · </span>{cfg.twist}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2 text-sm" data-testid="trade-round">Round {Math.min(state.round, rules.rounds)}/{rules.rounds}</p>
          <p data-testid="trade-goal">{goalText(game)}</p>
          {rules.variant === 'buyout' && <p>charter {charterPoints(game, state, 0)}/{rules.charterGoal}</p>}
          {rules.variant === 'rivalry' && <p>leader {fmt(bestRival(game, state))}</p>}
        </div>
      </div>

      {/* Merchants */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${state.players.length}, 1fr)` }}>
        {state.players.map((p, k) => (
          <div key={k} className={`rounded-lg border px-1.5 py-1 text-[10px] leading-tight ${p.alive ? 'bg-panel border-line' : 'bg-paper border-line opacity-50 line-through'}`}
            style={{ borderTop: `3px solid ${PLAYER_COLORS[k]}` }}>
            <p className="font-bold text-ink truncate">{p.icon} {p.name}</p>
            <p className="tabular-nums text-ink-2" data-testid={k === 0 ? 'trade-cash' : undefined}>💰 {fmt(p.cash)}</p>
            <p className="tabular-nums text-muted">worth {fmt(wealth(game, state, k))}</p>
          </div>
        ))}
      </div>
      <div className="w-full h-1.5 bg-panel rounded-full overflow-hidden" title="Your wealth toward the goal">
        <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>

      {/* Board */}
      <div className="grid gap-[3px] w-full max-w-[430px] mx-auto aspect-square" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: 'repeat(6, 1fr)' }}>
        {board.map((sq, i) => {
          const [r, c] = ringCell(i)
          const o = state.owner[i]
          const tokens = state.players.map((p, k) => (p.alive && p.pos === i ? k : -1)).filter(k => k >= 0)
          const icon = sq.kind === 'start' ? '⚓' : sq.kind === 'event' ? '❓' : sq.kind === 'tax' ? '⚖️' : sq.kind === 'rest' ? '⛑️' : sq.kind === 'festival' ? '🎉' : ''
          return (
            <button key={i} type="button" onClick={() => setFocus(f => (f === i ? null : i))} data-square={i}
              className={`relative flex flex-col items-stretch rounded-md border overflow-hidden text-[8px] leading-tight bg-panel
                ${focus === i ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
              style={{ gridRow: r, gridColumn: c, ...(o >= 0 ? { boxShadow: `inset 0 0 0 2px ${PLAYER_COLORS[o]}` } : {}) }}>
              {sq.kind === 'port' && <span className="h-1.5 shrink-0" style={{ background: GROUP_COLORS[sq.group!] }} />}
              <span className="px-0.5 pt-0.5 font-bold text-ink truncate">{icon}{sq.kind === 'event' ? '' : sq.name}</span>
              {sq.kind === 'port' && <span className="px-0.5 text-muted tabular-nums">{o >= 0 ? `toll ${fmt(tollAt(game, state, i))}` : fmt(priceOf(game, state, i))}</span>}
              {state.level[i] > 0 && <span className="px-0.5 text-[8px]">{'🏚️'.repeat(state.level[i])}</span>}
              <span className="absolute bottom-0.5 right-0.5 flex gap-px">
                {tokens.map(k => <span key={k} className="w-2.5 h-2.5 rounded-full border border-white" style={{ background: PLAYER_COLORS[k] }} />)}
              </span>
            </button>
          )
        })}

        {/* Centre panel */}
        <div className="flex flex-col gap-1 p-1.5 rounded-lg bg-paper border border-line overflow-hidden" style={{ gridRow: '2 / 6', gridColumn: '2 / 6' }}>
          <div className="flex items-center justify-between">
            <span className="text-2xl leading-none" aria-label="dice">{state.dice ? state.dice.map(x => DIE[x]).join('') : '🎲'}</span>
            <span className="text-[10px] text-muted text-right">{state.phase === 'steer' ? 'Choose two dice' : state.dice ? `→ ${here.name}` : 'Your turn'}</span>
          </div>

          {sel ? (
            <div className="text-[10px] text-ink-2 leading-snug" data-testid="trade-focus">
              <p className="font-bold text-ink">{sel.name}</p>
              {sel.kind === 'port' ? (
                <>
                  <p>{cfg.groupNames[sel.group!]} · {GROUP_SIZE[sel.group!]} ports · price {fmt(priceOf(game, state, focus!))}</p>
                  <p>Toll {fmt(priceOf(game, state, focus!) / 4)} · set ×{TOLL_MULT[0]} · warehouses ×{TOLL_MULT[1]} / ×{TOLL_MULT[2]}</p>
                  <p>{state.owner[focus!] >= 0 ? `Owner: ${state.players[state.owner[focus!]].name}` : 'Unowned'}</p>
                </>
              ) : (
                <p>{sel.kind === 'start' ? `Collect ${SALARY} each time you pass.` : sel.kind === 'tax' ? `Pay ${TAX}.` : sel.kind === 'festival' ? `Collect ${FESTIVAL}.` : sel.kind === 'rest' ? 'Plague victims wait here a turn.' : 'Draw a fortune: storms, plague, pirates — or a windfall.'}</p>
              )}
            </div>
          ) : (
            <ul className="flex-1 min-h-0 overflow-y-auto text-[9.5px] text-ink-2 leading-snug" data-testid="trade-log">
              {history.slice(-7).map((l, k) => <li key={k}>{l}</li>)}
            </ul>
          )}

          {!settled && (
            <div className="mt-auto flex flex-col gap-1">
              {state.phase === 'roll' && (
                <button type="button" onClick={() => { setFocus(null); apply(roll(game, state)) }} className="h-9 rounded-lg bg-accent text-accent-fg text-xs font-bold">🎲 Roll</button>
              )}
              {state.phase === 'steer' && state.dice && (
                <div className="grid grid-cols-3 gap-1">
                  {[0, 1, 2].map(drop => {
                    const keep = state.dice!.filter((_, k) => k !== drop)
                    const steps = keep[0] + keep[1]
                    const dest = board[(me.pos + steps) % board.length]
                    return (
                      <button key={drop} type="button" data-steer={drop} onClick={() => apply(steer(game, state, drop))}
                        className="h-9 rounded-lg bg-accent text-accent-fg text-[10px] font-bold leading-tight px-0.5 truncate">
                        {DIE[keep[0]]}{DIE[keep[1]]} {steps}<br />{dest.kind === 'event' ? '❓' : dest.name}
                      </button>
                    )
                  })}
                </div>
              )}
              {state.phase === 'buy' && (
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => apply(decideBuy(game, state, true))} disabled={me.cash < costOf(game, state, me.pos)}
                    className="h-9 rounded-lg bg-accent text-accent-fg text-[11px] font-bold disabled:opacity-40">
                    {state.offer === 'buyout' ? 'Buy out' : 'Buy'} {here.name} ({fmt(costOf(game, state, me.pos))})
                  </button>
                  <button type="button" onClick={() => apply(decideBuy(game, state, false))}
                    className="h-9 rounded-lg border bg-panel border-line text-ink-2 text-[11px] font-bold">Pass</button>
                </div>
              )}
              {state.phase === 'end' && (
                <button type="button" onClick={() => { setFocus(null); apply(endTurn(game, state)) }} className="h-9 rounded-lg bg-accent text-accent-fg text-xs font-bold">End turn ▶</button>
              )}
            </div>
          )}
        </div>
      </div>

      {canBuild.length > 0 && !settled && (
        <div className="flex flex-wrap gap-1 justify-center">
          {canBuild.map(i => (
            <button key={i} type="button" onClick={() => apply(build(game, state, i))}
              className="h-8 px-2 rounded-lg border bg-panel border-accent/50 text-ink-2 text-[10px] font-bold">
              🏚️ Warehouse in {board[i].name} ({fmt(upgradeCost(priceOf(game, state, i)))})
            </button>
          ))}
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle={state.reason ?? 'Fortune made!'} loseTitle={state.reason ?? 'Ruined'} />
    </div>
  )
}
