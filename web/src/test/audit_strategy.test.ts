// Strategy audit: can a competent player actually win each hand-authored
// config of the strategy minigames at every difficulty?  Each block drives the
// game's own exported logic (or an exact re-implementation of the inline
// rules) with a solver or a scripted player and asserts the win is reachable.
import { describe, it, expect } from 'vitest'
import type { Difficulty } from '@/games/types'
import { mulberry32 } from '@/components/minigames/_shared/rng'
import storyChallenges from '@/data/story_challenges.json'

import { CONFIGS as CARAVAN, caravanPlan } from '@/components/minigames/CaravanGame'
import { CONFIGS as EXPEDITION, expeditionBudgets } from '@/components/minigames/ExpeditionGame'
import { CONFIGS as SIEGE, siegeTiers, siegeTick, spawnWave, bfsPath, WALL_COST, TOWER_COST, type Cell, type Attacker } from '@/components/minigames/SiegeGame'
import { CONFIGS as TACTICS, isLegalMove, type Piece } from '@/components/minigames/TacticsGame'
import { makeInitialBoard, getValidMoves, applyMove, countPieces, cpuPickMove, type Board, type Move } from '@/components/minigames/WargameGame'
import { CONFIGS as ARENA, EFF, DMG_TABLE } from '@/components/minigames/BattleArenaGame'
import { CONFIGS as DEPLOY, SPECS, spawnEnemies, battleStep } from '@/components/minigames/WeaponDeployGame'
import { CONFIGS as AUCTION, BID_STEP, AI_MAX_MULT } from '@/components/minigames/AuctionGame'
import { CONFIGS as TRADE } from '@/components/minigames/TradeGame'
import {
  STAGE_TARGETS, ERA_POLICIES, CONFIG_ERA, resolveEra, initVoters, drawPolicies, pickAiPolicy, applyPolicies, tally, stageOutcome,
  type Policy,
} from '@/components/minigames/VotingGame'

const DIFFS: Difficulty[] = [1, 2, 3, 4]

/** Which (configId, difficulty) pairs the story data actually plays, per game. */
function storyUses(game: string): { configId: string; difficulty: Difficulty }[] {
  const out: { configId: string; difficulty: Difficulty }[] = []
  for (const entry of storyChallenges as { challenges: { type: string; game?: string; configId?: string; difficulty?: Difficulty }[] }[]) {
    for (const ch of entry.challenges) {
      if (ch.type === 'minigame' && ch.game === game && ch.configId) out.push({ configId: ch.configId, difficulty: ch.difficulty ?? 1 })
    }
  }
  return out
}

// ── Caravan ───────────────────────────────────────────────────────────────────
// Exact replay of CaravanGame's travel/event rules with a scripted merchant.

type CaravanStrategy = 'allin' | 'hedge' | 'oracle'
type Ledger = { gold: number; cargo: Record<string, number> }
type Mods = Record<string, number>

function playCaravan(configId: string, difficulty: Difficulty, seed: number, strategy: CaravanStrategy): { worth: number; target: number; win: boolean } {
  const cfg = CARAVAN[configId]
  const { target, stops, eventChance } = caravanPlan(cfg, difficulty)
  const rng = mulberry32(seed)
  // Events are drawn from the rng regardless of the player's choices, so an
  // oracle can pre-roll them; honest strategies only see them on arrival.
  const rolls: { goldDelta?: number; good?: string; priceMul?: number }[] = []
  for (let s = 0; s < stops.length - 1; s++) {
    if (rng() < eventChance) rolls.push(cfg.events[Math.floor(rng() * cfg.events.length)].effect)
    else rolls.push({})
  }
  const modsOf = (ev: { good?: string; priceMul?: number }): Mods => (ev.good && ev.priceMul ? { [ev.good]: ev.priceMul } : {})
  const priceAt = (stop: number, g: string, m: Mods) => Math.max(1, Math.round(stops[stop].prices[g] * (m[g] ?? 1)))
  const worthAt = (stop: number, m: Mods, l: Ledger) => l.gold + cfg.goods.reduce((a, g) => a + l.cargo[g] * priceAt(stop, g, m), 0)

  /** Sell everything here, then put all gold into the goods that gain most by the next stop. */
  const reinvest = (stop: number, here: Mods, next: Mods, l: Ledger, split: number): Ledger => {
    let gold = l.gold
    const cargo: Record<string, number> = Object.fromEntries(cfg.goods.map(g => [g, 0]))
    for (const g of cfg.goods) gold += l.cargo[g] * priceAt(stop, g, here)
    const ranked = cfg.goods.map(g => ({ g, ratio: priceAt(stop + 1, g, next) / priceAt(stop, g, here) })).filter(x => x.ratio > 1).sort((a, b) => b.ratio - a.ratio)
    const picks = ranked.slice(0, split)
    if (picks.length) {
      const share = Math.floor(gold / picks.length)
      for (const { g } of picks) { const n = Math.floor(share / priceAt(stop, g, here)); cargo[g] += n; gold -= n * priceAt(stop, g, here) }
      const best = picks[0].g
      const n = Math.floor(gold / priceAt(stop, best, here)); cargo[best] += n; gold -= n * priceAt(stop, best, here)
    }
    return { gold, cargo }
  }
  /** Projected final worth from `stop` under base prices, trading greedily from the next stop on. */
  const project = (stop: number, here: Mods, l: Ledger): number => {
    let cur = l
    for (let s = stop; s < stops.length - 1; s++) cur = reinvest(s, s === stop ? here : {}, {}, cur, 1)
    return worthAt(stops.length - 1, stop === stops.length - 1 ? here : {}, cur)
  }

  let ledger: Ledger = { gold: cfg.startGold, cargo: Object.fromEntries(cfg.goods.map(g => [g, 0])) }
  let mods: Mods = {}
  for (let stop = 0; stop < stops.length; stop++) {
    if (stop === stops.length - 1) {
      const worth = worthAt(stop, mods, ledger)
      return { worth, target, win: worth >= target }
    }
    const nextMods = strategy === 'oracle' ? modsOf(rolls[stop]) : {}
    const isLastLeg = stop === stops.length - 2
    // Either trade now, or hold through an adverse price here — whichever projects better.
    const traded = reinvest(stop, mods, nextMods, ledger, strategy === 'hedge' && isLastLeg ? 2 : 1)
    const options = [traded, ledger]
    ledger = options.reduce((best, o) => (project(stop + 1, nextMods, o) > project(stop + 1, nextMods, best) ? o : best))
    // Travel: the event lands on arrival.
    const ev = rolls[stop]
    if (ev.goldDelta) ledger = { ...ledger, gold: Math.round(ledger.gold * (1 + ev.goldDelta)) }
    mods = modsOf(ev)
  }
  throw new Error('unreachable')
}

describe('Caravan: profit targets are reachable', () => {
  const SEEDS = 600
  for (const configId of Object.keys(CARAVAN)) {
    for (const d of DIFFS) {
      it(`${configId} d${d}`, () => {
        const rate = (s: CaravanStrategy) => {
          let wins = 0
          for (let seed = 1; seed <= SEEDS; seed++) if (playCaravan(configId, d, seed, s).win) wins++
          return wins / SEEDS
        }
        const oracle = rate('oracle'), allin = rate('allin'), hedge = rate('hedge')
        const best = Math.max(allin, hedge)
        console.log(`caravan ${configId} d${d}: oracle ${oracle.toFixed(2)} all-in ${allin.toFixed(2)} hedge ${hedge.toFixed(2)}`)
        // A few seeds stack two price shocks on a short route and are lost for anyone;
        // a retry reshuffles the seed, so what matters is that most runs are winnable.
        expect(oracle, 'even an oracle cannot reach the target').toBeGreaterThanOrEqual(0.9)
        expect(best, 'an honest merchant loses too often').toBeGreaterThanOrEqual(0.85)
      })
    }
  }
})

// ── Expedition ────────────────────────────────────────────────────────────────
// Cheapest route that visits the required ports in order within the day budget.

function expeditionCheapest(configId: string, difficulty: Difficulty) {
  const cfg = EXPEDITION[configId]
  const { supplyBudget, dayBudget } = expeditionBudgets(cfg, difficulty)
  const adj = new Map<string, { to: string; cost: number; days: number }[]>()
  for (const e of cfg.edges) {
    const cost = e.cost + (e.hazard?.cost ?? 0)
    adj.set(e.a, [...(adj.get(e.a) ?? []), { to: e.b, cost, days: e.days }])
    adj.set(e.b, [...(adj.get(e.b) ?? []), { to: e.a, cost, days: e.days }])
  }
  // Dijkstra on (node, requiredIdx, days) minimising supplies; days bounded.
  let best = Infinity
  const seen = new Map<string, number>()
  const pq: { node: string; idx: number; cost: number; days: number }[] = [{ node: cfg.start, idx: 0, cost: 0, days: 0 }]
  while (pq.length) {
    pq.sort((a, b) => a.cost - b.cost)
    const cur = pq.shift()!
    if (cur.days > dayBudget) continue
    const k = `${cur.node}|${cur.idx}|${cur.days}`
    if ((seen.get(k) ?? Infinity) <= cur.cost) continue
    seen.set(k, cur.cost)
    if (cur.node === cfg.goal) {
      if (cur.idx >= cfg.mustVisit.length) best = Math.min(best, cur.cost)
      continue // arriving at the goal ends the game either way
    }
    for (const e of adj.get(cur.node) ?? []) {
      const idx = cfg.mustVisit[cur.idx] === e.to ? cur.idx + 1 : cur.idx
      pq.push({ node: e.to, idx, cost: cur.cost + e.cost, days: cur.days + e.days })
    }
  }
  return { cheapest: best, supplyBudget, dayBudget }
}

describe('Expedition: a route within both budgets exists', () => {
  for (const configId of Object.keys(EXPEDITION)) {
    for (const d of DIFFS) {
      it(`${configId} d${d}`, () => {
        const { cheapest, supplyBudget, dayBudget } = expeditionCheapest(configId, d)
        console.log(`expedition ${configId} d${d}: cheapest ${cheapest} supplies vs budget ${supplyBudget} (days ≤ ${dayBudget})`)
        expect(cheapest, 'no route fits the day budget').toBeLessThan(Infinity)
        expect(cheapest).toBeLessThanOrEqual(supplyBudget)
      })
    }
  }
})

// ── Siege ─────────────────────────────────────────────────────────────────────
// Greedy builder: each spend is the placement that leaks least against the
// coming wave, then the wave is replayed with the game's own tick.

function simulateWave(grid: Cell[][], attackers: Attacker[], keep: [number, number]) {
  let cur = attackers
  let damage = 0, ticks = 0
  while (cur.length && ticks < 400) {
    const r = siegeTick(grid, cur, keep)
    cur = r.remaining; damage += r.damage; ticks++
  }
  return { leaks: damage, stuck: cur.length }
}

function greedyBuild(cfg: typeof SIEGE[string], grid: Cell[][], budget: number, wave: Attacker[]): { grid: Cell[][]; budget: number } {
  let g = grid, b = budget
  let bestScore = simulateWave(g, wave, cfg.keep).leaks
  for (;;) {
    let bestG: Cell[][] | null = null, bestCost = 0, improved = false
    for (let r = 0; r < cfg.rows; r++) for (let c = 0; c < cfg.cols; c++) {
      if (g[r][c] !== 'floor') continue
      for (const tool of ['tower', 'wall'] as const) {
        const cost = tool === 'wall' ? WALL_COST : TOWER_COST
        if (b < cost) continue
        const next = g.map(row => [...row]); next[r][c] = tool
        if (cfg.spawns.some(s => !bfsPath(next, s, cfg.keep))) continue
        const score = simulateWave(next, wave, cfg.keep).leaks
        if (score < bestScore || (score === bestScore && !improved && tool === 'tower' && bestG === null && cost <= b)) {
          if (score < bestScore) improved = true
          bestScore = score; bestG = next; bestCost = cost
        }
      }
    }
    if (!bestG) break
    g = bestG; b -= bestCost
    if (bestScore === 0 && b < TOWER_COST) break
  }
  return { grid: g, budget: b }
}

function playSiege(configId: string, difficulty: Difficulty, seed: number) {
  const cfg = SIEGE[configId]
  const { waves, attackerHp, perWave, budgetPerWave } = siegeTiers(cfg, difficulty)
  const rng = mulberry32(seed)
  let grid: Cell[][] = Array.from({ length: cfg.rows }, () => Array<Cell>(cfg.cols).fill('floor'))
  grid[cfg.keep[0]][cfg.keep[1]] = 'keep'
  for (const [r, c] of cfg.spawns) grid[r][c] = 'spawn'
  let budget = budgetPerWave, keepHp = cfg.keepHp
  const leaksPerWave: number[] = []
  for (let w = 0; w < waves; w++) {
    const wave = spawnWave(cfg, w, perWave, attackerHp, rng)
    const built = greedyBuild(cfg, grid, budget, wave)
    grid = built.grid; budget = built.budget
    const { leaks, stuck } = simulateWave(grid, wave, cfg.keep)
    expect(stuck, 'attackers must never get stuck').toBe(0)
    leaksPerWave.push(leaks)
    keepHp -= leaks
    if (keepHp <= 0) return { won: false, leaksPerWave, keepHp }
    budget += budgetPerWave
  }
  return { won: true, leaksPerWave, keepHp }
}

describe('Siege: every wave is survivable with the per-wave budget', () => {
  for (const configId of Object.keys(SIEGE)) {
    for (const d of DIFFS) {
      it(`${configId} d${d}`, () => {
        const r = playSiege(configId, d, 7)
        console.log(`siege ${configId} d${d}: ${r.won ? 'WON' : 'LOST'} leaks/wave ${r.leaksPerWave.join(',')} keep left ${r.keepHp}`)
        expect(r.won).toBe(true)
      }, 120_000)
    }
  }
})

// ── Tactics ───────────────────────────────────────────────────────────────────
// A tiny engine: the designated move must be mate (or capture the king), and
// no other legal move may be, otherwise a correct player is punished.

type Grid = Piece[][]
function tacticsGrid(configId: string): Grid {
  const cfg = TACTICS[configId]
  const g: Grid = Array.from({ length: cfg.rows }, () => Array<Piece>(cfg.cols).fill(null))
  for (const { piece, row, col } of cfg.board) g[row][col] = piece
  return g
}
function inB(g: Grid, r: number, c: number) { return r >= 0 && r < g.length && c >= 0 && c < g[0].length }
function whiteAttacks(g: Grid, tr: number, tc: number): boolean {
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) {
    const p = g[r][c]
    if (!p || !p.startsWith('W')) continue
    if (p === 'WK') { if (Math.abs(r - tr) <= 1 && Math.abs(c - tc) <= 1 && (r !== tr || c !== tc)) return true; continue }
    const dirs: [number, number][] = []
    if (p === 'WR' || p === 'WQ') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1])
    if (p === 'WB' || p === 'WQ') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1])
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc
      while (inB(g, rr, cc)) {
        if (rr === tr && cc === tc) return true
        if (g[rr][cc]) break
        rr += dr; cc += dc
      }
    }
  }
  return false
}
function findBK(g: Grid): [number, number] {
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c] === 'BK') return [r, c]
  throw new Error('no black king')
}
/** Black replies: king steps, pawn pushes (down the board) and pawn captures. */
function blackHasEscape(g: Grid): boolean {
  const tryMove = (fr: number, fc: number, tr: number, tc: number) => {
    const n = g.map(row => [...row]); n[tr][tc] = n[fr][fc]; n[fr][fc] = null
    const [kr, kc] = findBK(n)
    return !whiteAttacks(n, kr, kc)
  }
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) {
    const p = g[r][c]
    if (p === 'BK') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue
        const tr = r + dr, tc = c + dc
        if (!inB(g, tr, tc)) continue
        const t = g[tr][tc]
        if (t && t.startsWith('B')) continue
        if (tryMove(r, c, tr, tc)) return true
      }
    } else if (p === 'BP') {
      if (inB(g, r + 1, c) && !g[r + 1][c] && tryMove(r, c, r + 1, c)) return true
      for (const dc of [-1, 1]) {
        const tr = r + 1, tc = c + dc
        if (inB(g, tr, tc) && g[tr][tc]?.startsWith('W') && g[tr][tc] !== 'WK' && tryMove(r, c, tr, tc)) return true
      }
    }
  }
  return false
}
function blackGuards(g: Grid, tr: number, tc: number): boolean {
  const [kr, kc] = findBK(g)
  if (Math.abs(kr - tr) <= 1 && Math.abs(kc - tc) <= 1) return true
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) {
    if (g[r][c] === 'BP' && r + 1 === tr && Math.abs(c - tc) === 1) return true
  }
  return false
}
function classifyWhiteMoves(g: Grid) {
  const mates: string[] = [], kingCaptures: string[] = []
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) {
    if (!g[r][c]?.startsWith('W')) continue
    for (let tr = 0; tr < g.length; tr++) for (let tc = 0; tc < g[0].length; tc++) {
      if (!isLegalMove(g, [r, c], [tr, tc])) continue
      // The game lets the white king wander anywhere; real chess (and a real player) won't walk it into check.
      if (g[r][c] === 'WK' && blackGuards(g, tr, tc)) continue
      const label = `${g[r][c]} ${r},${c}->${tr},${tc}`
      if (g[tr][tc] === 'BK') { kingCaptures.push(label); continue }
      const n = g.map(row => [...row]); n[tr][tc] = n[r][c]; n[r][c] = null
      const [kr, kc] = findBK(n)
      if (whiteAttacks(n, kr, kc) && !blackHasEscape(n)) mates.push(label)
    }
  }
  return { mates, kingCaptures }
}

describe('Tactics: the designated move is the unique win', () => {
  for (const configId of Object.keys(TACTICS)) {
    it(configId, () => {
      const cfg = TACTICS[configId]
      const g = tacticsGrid(configId)
      const want = `${g[cfg.winFrom[0]][cfg.winFrom[1]]} ${cfg.winFrom[0]},${cfg.winFrom[1]}->${cfg.winTo[0]},${cfg.winTo[1]}`
      const { mates, kingCaptures } = classifyWhiteMoves(g)
      console.log(`tactics ${configId}: want ${want}; mates [${mates}] king-captures [${kingCaptures}]`)
      expect(isLegalMove(g, cfg.winFrom, cfg.winTo), 'designated move must be legal').toBe(true)
      const winning = [...mates, ...kingCaptures]
      expect(winning, 'designated move must win').toContain(want)
      expect(winning, 'no other move may also win').toEqual([want])
      // A position where the king is already en prise is only fair if taking it IS the puzzle.
      if (kingCaptures.length) expect(kingCaptures).toEqual([want])
    })
  }
})

// ── Wargame ───────────────────────────────────────────────────────────────────
// A shallow minimax player against the game's greedy CPU: it must win a clear
// majority and games must end (no shuffling kings forever).

function evalBoard(b: Board): number {
  let s = 0
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = b[r][c]
    if (!p) continue
    const v = (p.type === 'king' ? 1.6 : 1) + (p.type === 'man' ? (p.color === 'light' ? (7 - r) : r) * 0.03 : 0)
    s += p.color === 'light' ? v : -v
  }
  return s
}
function minimax(b: Board, depth: number, light: boolean, alpha: number, beta: number): number {
  const moves = getValidMoves(b, light ? 'light' : 'dark')
  if (moves.length === 0) return light ? -100 : 100
  if (depth === 0) return evalBoard(b)
  if (light) {
    let best = -Infinity
    for (const m of moves) { best = Math.max(best, minimax(applyMove(b, m), depth - 1, false, alpha, beta)); alpha = Math.max(alpha, best); if (beta <= alpha) break }
    return best
  }
  let best = Infinity
  for (const m of moves) { best = Math.min(best, minimax(applyMove(b, m), depth - 1, true, alpha, beta)); beta = Math.min(beta, best); if (beta <= alpha) break }
  return best
}
function pickPlayerMove(b: Board, rnd: () => number): Move | null {
  const moves = getValidMoves(b, 'light')
  if (!moves.length) return null
  let best: Move[] = [], bestV = -Infinity
  for (const m of moves) {
    const v = minimax(applyMove(b, m), 3, false, -Infinity, Infinity)
    if (v > bestV + 1e-9) { bestV = v; best = [m] } else if (Math.abs(v - bestV) < 1e-9) best.push(m)
  }
  return best[Math.floor(rnd() * best.length)]
}
function playWargame(rnd: () => number): 'win' | 'loss' | 'unsettled' {
  let b = makeInitialBoard()
  for (let ply = 0; ply < 300; ply++) {
    const m = pickPlayerMove(b, rnd)
    if (!m) return 'loss'
    b = applyMove(b, m)
    if (countPieces(b, 'dark') === 0) return 'win'
    const cm = cpuPickMove(b)
    if (!cm) return 'win'
    b = applyMove(b, cm)
    if (countPieces(b, 'light') === 0) return 'loss'
  }
  return 'unsettled'
}

describe('Wargame: the greedy CPU is beatable and games end', () => {
  it('a 4-ply player wins most games', () => {
    const rnd = mulberry32(42)
    const tally: Record<string, number> = { win: 0, loss: 0, unsettled: 0 }
    const GAMES = 12
    for (let i = 0; i < GAMES; i++) tally[playWargame(rnd)]++
    console.log(`wargame: ${JSON.stringify(tally)} of ${GAMES}`)
    expect(tally.unsettled).toBe(0)
    expect(tally.win / GAMES).toBeGreaterThanOrEqual(0.75)
  }, 120_000)
})

// ── Battle Arena ──────────────────────────────────────────────────────────────
// Every attack costs the enemy's full strike, so even perfect weapon choice has
// a fixed damage bill; it must come in under the player's hit points.

describe('Battle Arena: perfect play survives', () => {
  for (const configId of Object.keys(ARENA)) {
    it(configId, () => {
      const cfg = ARENA[configId]
      let taken = 0
      for (const e of cfg.enemies) {
        const bestDmg = Math.max(...Object.values(EFF).map(row => DMG_TABLE[row[e.type]]))
        taken += Math.ceil(e.hp / bestDmg) * e.attack
      }
      console.log(`arena ${configId}: perfect play takes ${taken} of ${cfg.playerHp} hp`)
      expect(taken).toBeLessThan(cfg.playerHp)
    })
  }
})

// ── Weapon Deploy ─────────────────────────────────────────────────────────────
// Hill-climb over placements with the game's own battle step; some layout
// within budget must stop every enemy.

type Deploy = typeof DEPLOY[string]
type WT = Deploy['weapons'][number]
function runBattle(cfg: Deploy, board: (WT | null)[]) {
  let enemies = spawnEnemies(cfg)
  let step = 0, dealt = 0
  while (enemies.some(e => e.alive) && step < 1000) {
    step++
    const before = enemies.reduce((a, e) => a + e.hp, 0)
    enemies = battleStep(cfg, board, enemies, step).next
    dealt += before - enemies.reduce((a, e) => a + e.hp, 0)
  }
  return { leaked: enemies.filter(e => e.reached).length, dealt, steps: step }
}
function bestDeploy(configId: string, seed: number, budgetFraction = 1) {
  const cfg = DEPLOY[configId]
  const budget = Math.floor(cfg.budget * budgetFraction)
  const rnd = mulberry32(seed)
  const cells = Array.from({ length: cfg.cols * cfg.rows }, (_, i) => i).filter(i => Math.floor(i / cfg.cols) !== cfg.pathRow)
  const cost = (b: (WT | null)[]) => b.reduce((a, w) => a + (w ? SPECS[w].cost : 0), 0)
  const score = (b: (WT | null)[]) => { const r = runBattle(cfg, b); return -r.leaked * 10_000 + r.dealt }
  let best: (WT | null)[] = Array(cfg.cols * cfg.rows).fill(null), bestS = -Infinity, bestLeak = Infinity
  for (let restart = 0; restart < 6; restart++) {
    let b: (WT | null)[] = Array(cfg.cols * cfg.rows).fill(null)
    // Random fill within budget.
    for (const i of [...cells].sort(() => rnd() - 0.5)) {
      const w = cfg.weapons[Math.floor(rnd() * cfg.weapons.length)]
      if (cost(b) + SPECS[w].cost <= budget) b[i] = w
    }
    let s = score(b)
    for (let iter = 0; iter < 400; iter++) {
      const n = [...b]
      const i = cells[Math.floor(rnd() * cells.length)]
      const opts: (WT | null)[] = [null, ...cfg.weapons]
      n[i] = opts[Math.floor(rnd() * opts.length)]
      if (cost(n) > budget) {
        // Free up a random occupied cell.
        const occ = cells.filter(c => n[c] && c !== i)
        if (!occ.length) continue
        n[occ[Math.floor(rnd() * occ.length)]] = null
        if (cost(n) > budget) continue
      }
      const ns = score(n)
      if (ns >= s) { b = n; s = ns }
    }
    const leak = runBattle(cfg, b).leaked
    if (s > bestS) { bestS = s; best = b; bestLeak = leak }
  }
  return { board: best, leaked: bestLeak }
}

describe('Weapon Deploy: a layout within budget stops every enemy', () => {
  for (const configId of Object.keys(DEPLOY)) {
    it(configId, () => {
      const { board, leaked } = bestDeploy(configId, 3)
      const cfg = DEPLOY[configId]
      const spent = board.reduce((a, w) => a + (w ? SPECS[w].cost : 0), 0)
      // A good-but-imperfect human layout should also do: three quarters of the budget must still win.
      const spare = bestDeploy(configId, 5, 0.75)
      console.log(`deploy ${configId}: best layout leaks ${leaked} (spent ${spent}/${cfg.budget}, ${board.filter(Boolean).length} weapons); at 75% budget leaks ${spare.leaked}`)
      expect(leaked).toBe(0)
      expect(spare.leaked).toBe(0)
    }, 60_000)
  }
})

// ── Auction ───────────────────────────────────────────────────────────────────
// The rival folds once the player's bid tops floor(0.9 × value); the player
// bids S+10, S+30, S+50… so each target has a fixed winning price.

describe('Auction: enough budget to win the required targets', () => {
  for (const configId of Object.keys(AUCTION)) {
    it(configId, () => {
      const cfg = AUCTION[configId]
      const prices = cfg.items.filter(i => i.isTarget).map(i => {
        const aiMax = Math.floor(AI_MAX_MULT * i.trueValue)
        let bid = i.startBid + BID_STEP
        while (bid <= aiMax) bid += 2 * BID_STEP
        return bid
      }).sort((a, b) => a - b)
      const cheapest = prices.slice(0, cfg.targetWins).reduce((a, b) => a + b, 0)
      const dearest = prices.slice(-cfg.targetWins).reduce((a, b) => a + b, 0)
      console.log(`auction ${configId}: target prices ${prices.join('/')} → need ${cheapest}..${dearest} of ${cfg.budget}`)
      expect(prices.length).toBeGreaterThanOrEqual(cfg.targetWins)
      expect(cheapest).toBeLessThanOrEqual(cfg.budget)
      // Any pair of targets should be affordable, so order of play never traps the player.
      expect(dearest).toBeLessThanOrEqual(cfg.budget)
    })
  }
})

// ── Trade ─────────────────────────────────────────────────────────────────────
// The event for the round is shown before the decision, so the honest optimum
// is "all in before good news, all out before bad".  Random draw + noise.

function playTrade(configId: string, rnd: () => number) {
  const cfg = TRADE[configId]
  const e = [...cfg.events]
  for (let i = e.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [e[i], e[j]] = [e[j], e[i]] }
  const events = e.slice(0, cfg.rounds)
  let cash = cfg.startCash, holdings = 0, price = cfg.startPrice
  for (const ev of events) {
    if (ev.change > 0) { const n = Math.floor(cash / price); cash -= n * price; holdings += n }
    else { cash += holdings * price; holdings = 0 }
    const noise = (rnd() - 0.5) * 0.10
    price = Math.max(Math.round(cfg.startPrice * 0.2), Math.round(price * (1 + ev.change + noise)))
  }
  return cash + holdings * price >= cfg.targetCash
}

describe('Trade: the honest optimum reaches the target', () => {
  for (const configId of Object.keys(TRADE)) {
    it(configId, () => {
      const rnd = mulberry32(11)
      const N = 3000
      let wins = 0
      for (let i = 0; i < N; i++) if (playTrade(configId, rnd)) wins++
      const rate = wins / N
      console.log(`trade ${configId}: optimal-play win rate ${rate.toFixed(3)}`)
      expect(rate).toBeGreaterThanOrEqual(0.9)
    })
  }
})

// ── Voting ────────────────────────────────────────────────────────────────────
// Scripted candidate: predicts the (deterministic) rival pick and takes the
// policy with the best net swing.  Must reach 52 before the rival does.

function playVoting(era: string, politics: number): { result: 'win' | 'loss' | 'unsettled'; rounds: number } {
  let voters = initVoters(politics)
  let stage = 0, inStage = 0
  for (let round = 1; round <= 150; round++) {
    const policies = drawPolicies(era)
    const ai = pickAiPolicy(voters, policies)
    const target = STAGE_TARGETS[stage]
    let pick: Policy = policies[0], best = -Infinity
    for (const p of policies) {
      const next = tally(applyPolicies(voters, p, ai, politics))
      const v = (next.player >= target ? 1000 : 0) - (next.ai >= target ? 2000 : 0) + next.player - next.ai
      if (v > best) { best = v; pick = p }
    }
    voters = applyPolicies(voters, pick, ai, politics)
    inStage++
    const outcome = stageOutcome(tally(voters), target, inStage)
    if (outcome === 'won') { if (stage === 2) return { result: 'win', rounds: round }; stage++; inStage = 0 }
    else if (outcome === 'lost') return { result: 'loss', rounds: round }
  }
  return { result: 'unsettled', rounds: 150 }
}

describe('Voting: a shrewd candidate wins the election', () => {
  const POLITICS: Record<Difficulty, number> = { 1: 12, 2: 10, 3: 8, 4: 7 }
  const eras = new Set([...Object.keys(CONFIG_ERA).map(resolveEra), ...Object.keys(ERA_POLICIES)])
  for (const era of eras) {
    for (const d of DIFFS) {
      it(`${era} d${d}`, () => {
        const N = 150
        const t: Record<string, number> = { win: 0, loss: 0, unsettled: 0 }
        let longest = 0
        for (let i = 0; i < N; i++) { const r = playVoting(era, POLITICS[d]); t[r.result]++; longest = Math.max(longest, r.rounds) }
        console.log(`voting ${era} d${d}: ${JSON.stringify(t)} of ${N}, longest ${longest} rounds`)
        expect(t.unsettled).toBe(0)
        expect(longest, 'every election must end in a reasonable number of rounds').toBeLessThanOrEqual(3 * 8 + 6)
        expect(t.win / N).toBeGreaterThanOrEqual(0.8)
      })
    }
  }
})

// ── Story data coverage ───────────────────────────────────────────────────────

describe('story data only references configs this audit covers', () => {
  const games: Record<string, string[]> = {
    caravan: Object.keys(CARAVAN), expedition: Object.keys(EXPEDITION), siege: Object.keys(SIEGE),
    tactics: Object.keys(TACTICS), battlearena: Object.keys(ARENA), weapondeploy: Object.keys(DEPLOY),
    auction: Object.keys(AUCTION), trade: Object.keys(TRADE),
    voting: [...Object.keys(CONFIG_ERA), ...Object.keys(ERA_POLICIES)],
  }
  for (const [game, ids] of Object.entries(games)) {
    it(game, () => {
      for (const use of storyUses(game)) expect(ids, `${game}/${use.configId}`).toContain(use.configId)
    })
  }
})
