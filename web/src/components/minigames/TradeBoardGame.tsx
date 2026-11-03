import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { hashString, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Merchant Board — a short Monopoly-style trading game.  Roll two dice
// round a 20-square board of ports, buy the ones you land on, complete a
// set to double its tolls, build warehouses to raise them further, and
// survive storms, plague and pirates.  Rivals play simple, consistent
// heuristics.
//
//   D1  1 rival,  14 rounds, start 500, reach   900 ducats of wealth
//   D2  2 rivals, 15 rounds, start 500, reach 1,000
//   D3  2 rivals, 16 rounds, start 450, reach 1,050 — rivals build
//   D4  3 rivals, 16 rounds, start 450, reach 1,100 — sharper rivals
//
// Targets sit at roughly the 25th / 40th / 50th / 60th percentile of the
// peak wealth a strong scripted merchant reaches, so a careless one loses.
//
// Wealth = cash + what your ports and warehouses cost.  You win by reaching
// the target (or bankrupting every rival) before the rounds run out; you lose
// if you go bankrupt or time runs out.
//
// Dice and event cards come from hash(seed, round, player), so where every
// merchant moves never depends on anyone's decisions.  That lets the game
// prove a seed winnable before play: a strong scripted merchant plays it
// out, and if it cannot win, the next seed is tried (playableSeed).

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

// ── State ──────────────────────────────────────────────────────────────────────

export interface Merchant { name: string; icon: string; cash: number; pos: number; alive: boolean; skip: boolean; ai: boolean }

export interface Rules { rounds: number; target: number; startCash: number; rivals: number; aiReserve: number; aiBuilds: boolean }

export function rulesFor(difficulty: Difficulty): Rules {
  return {
    rounds: scale(difficulty, [14, 15, 16, 16]),
    target: scale(difficulty, [900, 1000, 1050, 1100]),
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
  phase: 'roll' | 'buy' | 'end' | 'over'
  players: Merchant[]
  owner: number[]
  level: number[]
  dice: [number, number] | null
  log: string[]
  result: 'won' | 'lost' | null
  reason?: string
}

export interface TradeGame { configId: string; seed: number; board: Square[]; rules: Rules; cfg: TradeConfig }

function clone(s: TradeState): TradeState {
  return { ...s, players: s.players.map(p => ({ ...p })), owner: [...s.owner], level: [...s.level], log: [...s.log] }
}

export function rollFor(seed: number, round: number, player: number): [number, number] {
  const h = hashString(`dice:${seed}:${round}:${player}`)
  return [1 + (h % 6), 1 + ((h >>> 8) % 6)]
}

type Card = 'storm' | 'plague' | 'festival' | 'pirates' | 'windfall' | 'fair' | 'dues'
const CARDS: Card[] = ['storm', 'festival', 'pirates', 'windfall', 'plague', 'fair', 'dues', 'festival', 'storm', 'windfall']

export function cardFor(seed: number, round: number, player: number): Card {
  return CARDS[hashString(`card:${seed}:${round}:${player}`) % CARDS.length]
}

export function initialState(game: TradeGame): TradeState {
  const { cfg, rules, board } = game
  const players: Merchant[] = [{ name: 'You', icon: '🧑‍💼', cash: rules.startCash, pos: 0, alive: true, skip: false, ai: false }]
  for (let i = 0; i < rules.rivals; i++) players.push({ ...cfg.rivals[i], cash: rules.startCash, pos: 0, alive: true, skip: false, ai: true })
  return {
    round: 1, current: 0, phase: 'roll', players,
    owner: board.map(() => -1), level: board.map(() => 0),
    dice: null, log: [`Round 1 of ${rules.rounds}. Reach ${rules.target} ${cfg.currency} of wealth.`], result: null,
  }
}

// ── Rules helpers ──────────────────────────────────────────────────────────────

export function ownsSet(game: TradeGame, s: TradeState, player: number, group: number): boolean {
  return game.board.every((sq, i) => sq.kind !== 'port' || sq.group !== group || s.owner[i] === player)
}

export function tollAt(game: TradeGame, s: TradeState, sq: number): number {
  const square = game.board[sq]
  if (square.kind !== 'port' || s.owner[sq] < 0) return 0
  const base = square.price! / 4
  if (!ownsSet(game, s, s.owner[sq], square.group!)) return base
  return base * TOLL_MULT[s.level[sq]]
}

export function wealth(game: TradeGame, s: TradeState, player: number): number {
  let w = s.players[player].cash
  game.board.forEach((sq, i) => {
    if (s.owner[i] === player) w += sq.price! + s.level[i] * upgradeCost(sq.price!)
  })
  return w
}

/** Ports where `player` may build a warehouse right now. */
export function buildable(game: TradeGame, s: TradeState, player: number): number[] {
  return game.board.map((_, i) => i).filter(i => {
    const sq = game.board[i]
    return sq.kind === 'port' && s.owner[i] === player && s.level[i] < MAX_LEVEL
      && ownsSet(game, s, player, sq.group!) && s.players[player].cash >= upgradeCost(sq.price!)
  })
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

/** Raise cash by selling warehouses, then ports, back to the bank at half cost. */
function liquidate(game: TradeGame, s: TradeState, p: number) {
  const m = s.players[p]
  const mine = game.board.map((_, i) => i).filter(i => s.owner[i] === p).sort((a, b) => game.board[a].price! - game.board[b].price!)
  for (const i of mine) while (m.cash < 0 && s.level[i] > 0) {
    s.level[i]--; m.cash += upgradeCost(game.board[i].price!) / 2
    s.log.push(`${m.name} sold a warehouse in ${game.board[i].name}.`)
  }
  for (const i of mine) if (m.cash < 0) {
    m.cash += game.board[i].price! / 2 + s.level[i] * upgradeCost(game.board[i].price!) / 2
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

function checkEnd(game: TradeGame, s: TradeState) {
  if (s.result) return
  if (!s.players[0].alive) { s.result = 'lost'; s.reason = 'You went bankrupt'; s.phase = 'over'; return }
  if (wealth(game, s, 0) >= game.rules.target) { s.result = 'won'; s.reason = 'You reached the wealth target'; s.phase = 'over'; return }
  if (s.players.slice(1).every(p => !p.alive)) { s.result = 'won'; s.reason = 'Every rival is bankrupt'; s.phase = 'over' }
}

/** Move and resolve the square. Returns true when a buy decision is pending. */
function moveAndLand(game: TradeGame, s: TradeState, p: number): boolean {
  const m = s.players[p]
  const { cfg, board } = game
  const dice = rollFor(hashString(game.configId) ^ game.seed, s.round, p)
  if (p === 0) s.dice = dice
  const steps = dice[0] + dice[1]
  const to = (m.pos + steps) % board.length
  if (m.pos + steps >= board.length) { m.cash += SALARY; s.log.push(`${m.name} passed ${cfg.start}: +${SALARY}.`) }
  m.pos = to
  const sq = board[to]
  const who = m.name
  if (sq.kind === 'port') {
    const o = s.owner[to]
    if (o < 0) return true
    if (o !== p) {
      const toll = tollAt(game, s, to)
      s.log.push(`${who} paid ${fmt(toll)} toll at ${sq.name} to ${s.players[o].name}.`)
      pay(game, s, p, o, toll)
    }
    return false
  }
  if (sq.kind === 'tax') { s.log.push(`${who} paid the ${sq.name}: ${TAX}.`); pay(game, s, p, -1, TAX) }
  if (sq.kind === 'festival') { m.cash += FESTIVAL; s.log.push(`${who} traded at the ${sq.name}: +${FESTIVAL}.`) }
  if (sq.kind === 'event') {
    const card = cardFor(hashString(game.configId) ^ game.seed, s.round, p)
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
  return false
}

// ── Rival AI ───────────────────────────────────────────────────────────────────

function aiWantsBuy(game: TradeGame, s: TradeState, p: number, sq: number, reserve: number): boolean {
  const price = game.board[sq].price!
  const cash = s.players[p].cash
  const group = game.board[sq].group!
  // Buying the last port of a set is worth dipping into the reserve.
  const completes = game.board.every((b, i) => i === sq || b.kind !== 'port' || b.group !== group || s.owner[i] === p)
  return cash - price >= (completes ? reserve / 2 : reserve)
}

function aiBuild(game: TradeGame, s: TradeState, p: number, reserve: number) {
  for (let guard = 0; guard < 6; guard++) {
    const options = buildable(game, s, p).filter(i => s.players[p].cash - upgradeCost(game.board[i].price!) >= reserve)
    if (!options.length) return
    const i = options.sort((a, b) => s.level[a] - s.level[b] || game.board[b].price! - game.board[a].price!)[0]
    s.players[p].cash -= upgradeCost(game.board[i].price!)
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
  const decide = moveAndLand(game, s, p)
  if (decide && m.alive) {
    const sq = m.pos
    if (aiWantsBuy(game, s, p, sq, aiReserve)) {
      m.cash -= game.board[sq].price!
      s.owner[sq] = p
      s.log.push(`${m.name} bought ${game.board[sq].name}.`)
    }
  }
}

// ── Your turn ──────────────────────────────────────────────────────────────────

export function roll(game: TradeGame, s0: TradeState): TradeState {
  if (s0.phase !== 'roll' || s0.result) return s0
  const s = clone(s0)
  s.log = []
  const decide = moveAndLand(game, s, 0)
  checkEnd(game, s)
  if (s.result) return s
  s.phase = decide ? 'buy' : 'end'
  return s
}

export function decideBuy(game: TradeGame, s0: TradeState, buy: boolean): TradeState {
  if (s0.phase !== 'buy') return s0
  const s = clone(s0)
  const sq = s.players[0].pos
  const price = game.board[sq].price!
  if (buy && s.players[0].cash >= price) {
    s.players[0].cash -= price
    s.owner[sq] = 0
    s.log.push(`You bought ${game.board[sq].name}.`)
  } else s.log.push(`You passed on ${game.board[sq].name}.`)
  s.phase = 'end'
  checkEnd(game, s)
  return s
}

export function build(game: TradeGame, s0: TradeState, sq: number): TradeState {
  if (s0.result || s0.phase === 'buy' || !buildable(game, s0, 0).includes(sq)) return s0
  const s = clone(s0)
  s.players[0].cash -= upgradeCost(game.board[sq].price!)
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
    if (s.round >= game.rules.rounds) {
      s.result = 'lost'; s.phase = 'over'
      s.reason = `The season ended at ${fmt(wealth(game, s, 0))} of ${fmt(game.rules.target)} ${game.cfg.currency}`
      return s
    }
    s.round++
    s.log.push(`— Round ${s.round} of ${game.rules.rounds} —`)
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

/** Plays your whole turn: build first, roll, buy almost anything, end. */
export function strongTurn(game: TradeGame, s0: TradeState): TradeState {
  let s = s0
  const buildAll = () => {
    for (let k = 0; k < 6; k++) {
      const opts = buildable(game, s, 0).filter(i => s.players[0].cash - upgradeCost(game.board[i].price!) >= 60)
      if (!opts.length) break
      s = build(game, s, opts.sort((a, b) => s.level[a] - s.level[b] || game.board[b].price! - game.board[a].price!)[0])
    }
  }
  buildAll()
  if (s.result) return s
  s = roll(game, s)
  if (s.phase === 'buy') {
    const price = game.board[s.players[0].pos].price!
    s = decideBuy(game, s, s.players[0].cash - price >= 20)
  }
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

function makeGame(configId: string, difficulty: Difficulty, seed: number): TradeGame {
  const cfg = resolveConfig(CONFIGS, configId, undefined, 'venice')
  return { configId, seed, cfg, board: buildBoard(cfg), rules: rulesFor(difficulty) }
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
  const canBuild = state.phase !== 'buy' && !state.result ? buildable(game, state, 0) : []
  const sel = focus !== null ? board[focus] : null

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px] text-muted tabular-nums">
          <p className="font-bold text-ink-2 text-sm" data-testid="trade-round">Round {Math.min(state.round, rules.rounds)}/{rules.rounds}</p>
          <p>goal {fmt(rules.target)}</p>
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
        <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, (myWealth / rules.target) * 100)}%` }} />
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
              {sq.kind === 'port' && <span className="px-0.5 text-muted tabular-nums">{o >= 0 ? `toll ${fmt(tollAt(game, state, i))}` : fmt(sq.price!)}</span>}
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
            <span className="text-2xl leading-none" aria-label="dice">{state.dice ? `${DIE[state.dice[0]]}${DIE[state.dice[1]]}` : '🎲'}</span>
            <span className="text-[10px] text-muted text-right">{state.dice ? `${state.dice[0] + state.dice[1]} → ${here.name}` : 'Your turn'}</span>
          </div>

          {sel ? (
            <div className="text-[10px] text-ink-2 leading-snug" data-testid="trade-focus">
              <p className="font-bold text-ink">{sel.name}</p>
              {sel.kind === 'port' ? (
                <>
                  <p>{cfg.groupNames[sel.group!]} · {GROUP_SIZE[sel.group!]} ports · price {sel.price}</p>
                  <p>Toll {fmt(sel.price! / 4)} · set ×{TOLL_MULT[0]} · warehouses ×{TOLL_MULT[1]} / ×{TOLL_MULT[2]}</p>
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
              {state.phase === 'buy' && (
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={() => apply(decideBuy(game, state, true))} disabled={me.cash < here.price!}
                    className="h-9 rounded-lg bg-accent text-accent-fg text-[11px] font-bold disabled:opacity-40">Buy {here.name} ({here.price})</button>
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
              🏚️ Warehouse in {board[i].name} ({upgradeCost(board[i].price!)})
            </button>
          ))}
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle={state.reason ?? 'Fortune made!'} loseTitle={state.reason ?? 'Ruined'} />
    </div>
  )
}
