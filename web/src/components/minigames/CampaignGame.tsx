import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Campaign Trail: a map of districts, each worth some votes and leaning
// toward you or your rival.  Each turn you travel one road (or stay) and
// rally: the district you stand in swings two steps your way, its
// neighbours one.  Your rival then rallies too (its own district only,
// until the top tier) — and you are told where it is heading before you
// move.  Meet it in the same district and the two
// speeches cancel out.  When the last turn is done each district goes to
// whoever it leans toward; carry enough votes to win.

// ── Types ──────────────────────────────────────────────────────────────────────

export interface District { name: string; x: number; y: number; weight: number; note: string }

interface CampaignConfig {
  title: string
  intro: string
  /** Token emoji for you and the rival. */
  you: string
  rival: string
  rivalName: string
  districts: District[]
  roads: [number, number][]
  start: number
  rivalStart: number
  fact: string
}

export interface CampaignState { support: number[]; you: number; rival: number }
export interface CampaignBoard { state: CampaignState; turns: number; need: number; total: number; reach: Reach }

export const MAX_SUPPORT = 3

// ── Configs ────────────────────────────────────────────────────────────────────

export const CONFIGS: Record<string, CampaignConfig> = {
  'athenian-demes': {
    title: 'Canvassing Attica',
    intro: 'Thucydides son of Melesias is rallying the countryside against your building programme. Tour the demes of Attica and carry the Assembly.',
    you: '🏛️', rival: '🗣️', rivalName: 'Thucydides',
    districts: [
      { name: 'Athens',   x: 50, y: 55, weight: 5, note: 'The city itself — the Assembly meets on the Pnyx.' },
      { name: 'Piraeus',  x: 40, y: 70, weight: 4, note: 'The port; its rowers depend on the fleet.' },
      { name: 'Eleusis',  x: 16, y: 50, weight: 3, note: 'Home of the Mysteries of Demeter.' },
      { name: 'Phyle',    x: 28, y: 26, weight: 2, note: 'A hill fort on the Boeotian border.' },
      { name: 'Acharnae', x: 48, y: 32, weight: 3, note: 'The largest deme — charcoal burners and hoplites.' },
      { name: 'Marathon', x: 82, y: 32, weight: 3, note: 'Proud of the victory of 490 BCE.' },
      { name: 'Rhamnous', x: 84, y: 10, weight: 2, note: 'Sanctuary of Nemesis, watching Euboea.' },
      { name: 'Brauron',  x: 86, y: 60, weight: 2, note: 'Sanctuary of Artemis on the east coast.' },
      { name: 'Sounion',  x: 66, y: 92, weight: 2, note: 'The cape, near the silver mines of Laurion.' },
    ],
    roads: [[0, 1], [0, 2], [0, 4], [0, 5], [0, 7], [2, 3], [3, 4], [4, 5], [5, 6], [5, 7], [7, 8], [1, 8]],
    start: 0, rivalStart: 4,
    fact: 'Thucydides son of Melesias led the opposition to Pericles, attacking the use of Delian League tribute to build the Parthenon. In 443 BCE the rivalry was settled by an ostracism: Thucydides was exiled for ten years, and Pericles was elected general every year from then until his death in 429 BCE.',
  },
  'akkadian-cities': {
    title: 'The Road to the Sea',
    intro: 'Lugalzagesi of Uruk holds the Sumerian cities. March from Akkad down the Euphrates and win them over, city by city.',
    you: '👑', rival: '🛡️', rivalName: 'Lugalzagesi',
    districts: [
      { name: 'Mari',    x: 10, y: 10, weight: 2, note: 'A trading city far up the Euphrates.' },
      { name: 'Akkad',   x: 40, y: 22, weight: 3, note: 'Your new capital.' },
      { name: 'Kish',    x: 46, y: 38, weight: 3, note: 'Where you served as cupbearer to the king.' },
      { name: 'Nippur',  x: 58, y: 50, weight: 4, note: "Enlil's holy city — its blessing makes kings." },
      { name: 'Umma',    x: 70, y: 60, weight: 2, note: "Lugalzagesi's first city." },
      { name: 'Lagash',  x: 88, y: 66, weight: 3, note: 'Old rival of Umma, sacked by Lugalzagesi.' },
      { name: 'Uruk',    x: 62, y: 76, weight: 4, note: "Lugalzagesi's capital, city of Gilgamesh." },
      { name: 'Ur',      x: 76, y: 88, weight: 3, note: 'Port city of the moon god Nanna.' },
      { name: 'Eridu',   x: 64, y: 96, weight: 2, note: 'The oldest city, by the marshes and the sea.' },
    ],
    roads: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [3, 4], [3, 6], [4, 5], [4, 6], [5, 7], [6, 7], [6, 8], [7, 8]],
    start: 1, rivalStart: 6,
    fact: "Sargon's inscriptions, copied by later scribes at Nippur, say he defeated Lugalzagesi of Uruk and led him in a neck-stock to the gate of Enlil, then took Ur, Lagash and Umma and \"washed his weapons in the sea.\" He boasted that 5,400 men ate before him every day.",
  },
  'maurya-provinces': {
    title: 'From Taxila to Pataliputra',
    intro: 'With Chanakya beside you, win the provinces of the north away from the Nanda loyalists before the empire is yours to claim.',
    you: '🐘', rival: '⚔️', rivalName: 'The Nandas',
    districts: [
      { name: 'Gandhara',    x: 8,  y: 12, weight: 2, note: 'Frontier land under Greek satraps.' },
      { name: 'Taxila',      x: 20, y: 24, weight: 3, note: "Chanakya's city of learning — your starting point." },
      { name: 'Mathura',     x: 40, y: 44, weight: 3, note: 'Crossroads on the Yamuna.' },
      { name: 'Kaushambi',   x: 60, y: 50, weight: 3, note: 'A great walled city on the trade road.' },
      { name: 'Pataliputra', x: 84, y: 46, weight: 5, note: 'The Nanda capital on the Ganges.' },
      { name: 'Vidisha',     x: 50, y: 68, weight: 2, note: 'Market town at the edge of the forests.' },
      { name: 'Ujjain',      x: 32, y: 76, weight: 3, note: 'Gateway to the western ports.' },
      { name: 'Kalinga',     x: 86, y: 82, weight: 3, note: 'A proud coastal kingdom.' },
    ],
    roads: [[0, 1], [1, 2], [2, 3], [2, 6], [3, 4], [3, 5], [5, 6], [4, 7], [5, 7]],
    start: 1, rivalStart: 4,
    fact: 'Greek and Indian sources agree that Chandragupta rose from the northwest with the Brahmin Chanakya, whom tradition ties to Taxila, and overthrew the Nanda dynasty at Pataliputra around 321 BCE. In 303 BCE Seleucus I ceded the lands toward Gandhara and Arachosia in exchange for 500 war elephants.',
  },
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export const turnsFor = (d: Difficulty) => scale(d, [7, 7, 6, 6])
/** Share of all votes you must carry. */
export const needShare = (d: Difficulty) => scale(d, [0.5, 0.55, 0.6, 0.55])

const clamp = (v: number) => Math.max(-MAX_SUPPORT, Math.min(MAX_SUPPORT, v))

export function adjacency(cfg: CampaignConfig): number[][] {
  const adj = cfg.districts.map(() => [] as number[])
  for (const [a, b] of cfg.roads) { adj[a].push(b); adj[b].push(a) }
  adj.forEach(list => list.sort((a, b) => a - b))
  return adj
}

/** Where a token at `at` may go this turn: stay, or along one road. */
export const legalMoves = (adj: number[][], at: number) => [at, ...adj[at]]

export interface Reach { stop: number; near: number }
/** Your rally: two steps where you stand, one in each neighbour. */
export const YOUR_REACH: Reach = { stop: 2, near: 1 }
/** The rival's rally: only its own district at first, its neighbours too at the top tier. */
export const rivalReach = (d: Difficulty): Reach => scale(d, [{ stop: 1, near: 0 }, { stop: 2, near: 0 }, { stop: 2, near: 0 }, { stop: 1, near: 1 }])

/** Swing a district `reach.stop` steps and its neighbours `reach.near` toward `dir` (+1 you, -1 rival). */
export function rally(adj: number[][], support: readonly number[], at: number, dir: 1 | -1, reach: Reach): number[] {
  const next = [...support]
  next[at] = clamp(next[at] + reach.stop * dir)
  for (const n of adj[at]) next[n] = clamp(next[n] + reach.near * dir)
  return next
}

/**
 * The rival's next stop, decided before you move: of its district and those
 * one road away, the one with the most contested votes in reach (the stop
 * itself counting double), ties to the lower index.  A district already
 * firmly the rival's (-2 or less) is not contested.
 */
export function rivalMove(adj: number[][], weights: readonly number[], state: CampaignState): number {
  let best = state.rival, bestScore = -1
  for (const c of [...legalMoves(adj, state.rival)].sort((a, b) => a - b)) {
    let s = 0
    for (const d of [c, ...adj[c]]) if (state.support[d] > -2) s += weights[d] * (d === c ? 2 : 1)
    if (s > bestScore) { bestScore = s; best = c }
  }
  return best
}

/** One full turn: you move and rally, then the rival does.  Sharing a district cancels both rallies. */
export function applyTurn(adj: number[][], state: CampaignState, move: number, rivalTo: number, reach: Reach): { state: CampaignState; debate: boolean } {
  if (move === rivalTo) return { state: { support: [...state.support], you: move, rival: rivalTo }, debate: true }
  const support = rally(adj, rally(adj, state.support, move, 1, YOUR_REACH), rivalTo, -1, reach)
  return { state: { support, you: move, rival: rivalTo }, debate: false }
}

export function tallyOf(weights: readonly number[], support: readonly number[]) {
  let you = 0, rival = 0
  support.forEach((s, i) => { if (s > 0) you += weights[i]; else if (s < 0) rival += weights[i] })
  return { you, rival }
}

const evaluate = (weights: readonly number[], support: readonly number[]) => {
  const t = tallyOf(weights, support)
  return (t.you - t.rival) * 10 + support.reduce((a, s, i) => a + s * weights[i], 0)
}

/** A scripted campaigner: exhaustive look-ahead `depth` turns, scoring the projected map. */
export function scriptedMove(adj: number[][], weights: readonly number[], state: CampaignState, turnsLeft: number, reach: Reach, depth = 3): number {
  const search = (s: CampaignState, left: number): number => {
    if (left === 0) return evaluate(weights, s.support)
    const r = rivalMove(adj, weights, s)
    let best = -Infinity
    for (const m of legalMoves(adj, s.you)) best = Math.max(best, search(applyTurn(adj, s, m, r, reach).state, left - 1))
    return best
  }
  const r = rivalMove(adj, weights, state)
  let bestMove = state.you, bestScore = -Infinity
  for (const m of legalMoves(adj, state.you)) {
    const v = search(applyTurn(adj, state, m, r, reach).state, Math.min(depth, turnsLeft) - 1)
    if (v > bestScore) { bestScore = v; bestMove = m }
  }
  return bestMove
}

/** Play a whole campaign with a policy; returns your final vote count. */
export function playOut(cfg: CampaignConfig, board: CampaignBoard, policy: (s: CampaignState, turnsLeft: number) => number): number {
  const adj = adjacency(cfg), weights = cfg.districts.map(d => d.weight)
  let s = board.state
  for (let t = 0; t < board.turns; t++) s = applyTurn(adj, s, policy(s, board.turns - t), rivalMove(adj, weights, s), board.reach).state
  return tallyOf(weights, s.support).you
}

/** Seeded starting map: the countryside leans to the rival, more so at higher difficulty. */
export function rollState(cfg: CampaignConfig, seed: number, difficulty: Difficulty): CampaignState {
  const rng = mulberry32(seed)
  const pool = scale<number[]>(difficulty, [[-1, -1, 0, 0, 1], [-2, -1, -1, 0, 1], [-2, -1, -1, 0, 0, 1], [-2, -1, -1, 0, 0]])
  const support = cfg.districts.map(() => pool[Math.floor(rng() * pool.length)])
  support[cfg.start] = 2
  support[cfg.rivalStart] = -3
  return { support, you: cfg.start, rival: cfg.rivalStart }
}

/** A seeded board the scripted campaigner wins and a stay-at-home candidate loses. */
export function makeBoard(cfg: CampaignConfig, seed: number, difficulty: Difficulty): CampaignBoard {
  const weights = cfg.districts.map(d => d.weight)
  const total = weights.reduce((a, b) => a + b, 0)
  const need = Math.floor(total * needShare(difficulty)) + 1
  const turns = turnsFor(difficulty)
  const adj = adjacency(cfg)
  let fallback: CampaignBoard | null = null
  for (let attempt = 0; attempt < 200; attempt++) {
    const board = { state: rollState(cfg, seed + attempt * 7919, difficulty), turns, need, total, reach: rivalReach(difficulty) }
    fallback ??= board
    if (tallyOf(weights, board.state.support).you >= need) continue
    if (playOut(cfg, board, s => s.you) >= need) continue
    if (playOut(cfg, board, (s, left) => scriptedMove(adj, weights, s, left, board.reach)) >= need) return board
  }
  return fallback!
}

// ── Component ──────────────────────────────────────────────────────────────────

const YOU = '#f59e0b', RIVAL = '#818cf8'

function supportFill(s: number) {
  if (s > 0) return { fill: YOU, opacity: 0.25 + s * 0.25 }
  if (s < 0) return { fill: RIVAL, opacity: 0.25 - s * 0.25 }
  return { fill: '#94a3b8', opacity: 0.35 }
}

export default function CampaignGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'athenian-demes')
  const board = useMemo(() => makeBoard(cfg, seed, difficulty), [cfg, seed, difficulty])
  const adj = useMemo(() => adjacency(cfg), [cfg])
  const weights = useMemo(() => cfg.districts.map(d => d.weight), [cfg])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const [state, setState] = useState<CampaignState>(board.state)
  const [turn, setTurn] = useState(1)
  const [hover, setHover] = useState<number | null>(null)
  const [news, setNews] = useState('')

  const showPreview = difficulty <= 2
  const rivalTo = useMemo(() => rivalMove(adj, weights, state), [adj, weights, state])
  const moves = useMemo(() => new Set(settled ? [] : legalMoves(adj, state.you)), [adj, state.you, settled])
  const tally = tallyOf(weights, state.support)
  const preview = hover !== null && moves.has(hover) && showPreview
    ? tallyOf(weights, applyTurn(adj, state, hover, rivalTo, board.reach).state.support)
    : null

  const go = (i: number) => {
    if (!moves.has(i)) return
    const { state: next, debate } = applyTurn(adj, state, i, rivalTo, board.reach)
    setState(next)
    const here = cfg.districts[i].name
    setNews(debate
      ? `You and ${cfg.rivalName} met in ${here} — the speeches cancelled out.`
      : `You rallied ${here}; ${cfg.rivalName} rallied ${cfg.districts[rivalTo].name}.`)
    if (turn >= board.turns) {
      const t = tallyOf(weights, next.support)
      if (t.you >= board.need) win()
      else lose(`carried ${t.you} of ${board.need} votes needed`)
      return
    }
    setTurn(turn + 1)
  }

  const shown = preview ?? tally
  const pct = (n: number) => `${(n / board.total) * 100}%`
  const info = hover !== null ? cfg.districts[hover] : null
  const R = cfg.districts[state.rival], T = cfg.districts[rivalTo]

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className="shrink-0 text-[10px] text-muted text-right">
          Turn <b className="text-ink">{Math.min(turn, board.turns)}</b>/{board.turns}<br />
          Need <b className="text-ink">{board.need}</b> of {board.total}
        </p>
      </div>

      {/* Projected tally */}
      <div className="flex flex-col gap-1">
        <div className="relative h-3 bg-panel rounded-full overflow-hidden">
          <div className="absolute left-0 top-0 h-full transition-all duration-500" style={{ width: pct(shown.you), background: YOU }} />
          <div className="absolute right-0 top-0 h-full transition-all duration-500" style={{ width: pct(shown.rival), background: RIVAL }} />
          <div className="absolute top-0 bottom-0 w-0.5 bg-ink/60" style={{ left: pct(board.need) }} />
        </div>
        <div className="flex justify-between text-[10px]">
          <span style={{ color: YOU }} className="font-bold">You {shown.you}{preview ? ' (if you go there)' : ''}</span>
          <span style={{ color: RIVAL }} className="font-bold">{cfg.rivalName} {shown.rival}</span>
        </div>
      </div>

      {/* Map */}
      <svg viewBox="-8 -8 116 116" className="w-full max-w-md self-center rounded-xl border border-line bg-panel" style={{ aspectRatio: '1' }}>
        <defs>
          <marker id="campaign-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={RIVAL} />
          </marker>
        </defs>
        {cfg.roads.map(([a, b]) => {
          const A = cfg.districts[a], B = cfg.districts[b]
          const open = !settled && ((a === state.you && moves.has(b)) || (b === state.you && moves.has(a)))
          return <line key={`${a}-${b}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y}
            stroke={open ? YOU : 'currentColor'} strokeOpacity={open ? 0.8 : 0.2} strokeWidth={open ? 1.2 : 0.8} className="text-ink" />
        })}
        {!settled && rivalTo !== state.rival && (
          <line x1={R.x} y1={R.y} x2={R.x + (T.x - R.x) * 0.78} y2={R.y + (T.y - R.y) * 0.78}
            stroke={RIVAL} strokeWidth={1.4} strokeDasharray="2 1.5" markerEnd="url(#campaign-arrow)" />
        )}
        {cfg.districts.map((d, i) => {
          const s = state.support[i], f = supportFill(s)
          const canGo = moves.has(i)
          const r = 4 + d.weight
          return (
            <g key={d.name} onClick={() => go(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              className={canGo ? 'cursor-pointer' : 'cursor-default'}>
              {canGo && <circle cx={d.x} cy={d.y} r={r + 2.2} fill="none" stroke={YOU} strokeWidth={0.8} strokeDasharray={i === state.you ? '1 1' : undefined} />}
              {!settled && i === rivalTo && <circle cx={d.x} cy={d.y} r={r + 1.2} fill="none" stroke={RIVAL} strokeWidth={0.6} strokeDasharray="1.5 1" />}
              <circle cx={d.x} cy={d.y} r={r} fill={f.fill} fillOpacity={f.opacity} stroke={hover === i ? 'currentColor' : 'none'} strokeWidth={0.6} className="text-ink" />
              <text x={d.x} y={d.y + 1.4} textAnchor="middle" fontSize={4} fontWeight={700} className="fill-ink pointer-events-none">{d.weight}</text>
              <text x={d.x} y={d.y + r + 4.5} textAnchor="middle" fontSize={3.4} className="fill-muted pointer-events-none">{d.name}</text>
              {i === state.you && <text x={d.x - r + 1} y={d.y - r + 1} fontSize={6} className="pointer-events-none">{cfg.you}</text>}
              {i === state.rival && <text x={d.x + r - 5} y={d.y - r + 1} fontSize={6} className="pointer-events-none">{cfg.rival}</text>}
            </g>
          )
        })}
      </svg>

      <div className="min-h-[2.5rem] text-[11px] leading-snug text-center">
        {info ? (
          <p className="text-ink">
            <b>{info.name}</b> · {info.weight} votes · leans{' '}
            <b style={{ color: state.support[hover!] > 0 ? YOU : state.support[hover!] < 0 ? RIVAL : undefined }}>
              {state.support[hover!] > 0 ? `you +${state.support[hover!]}` : state.support[hover!] < 0 ? `${cfg.rivalName} ${-state.support[hover!]}` : 'neither'}
            </b>
            <span className="block text-muted">{info.note}</span>
          </p>
        ) : (
          <p className="text-muted">{news || `${cfg.rivalName} is heading for ${T.name}.`}</p>
        )}
      </div>

      <p className="text-[10px] text-muted/80 text-center">
        Click a ringed district to travel there and rally it (+2, neighbours +1). {cfg.rival} rallies too (−{board.reach.stop}{board.reach.near ? `, neighbours −${board.reach.near}` : ''}) — the dashed arrow shows where it goes next; meet it there and both speeches cancel.
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The vote is carried!" loseTitle="The vote went against you" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
