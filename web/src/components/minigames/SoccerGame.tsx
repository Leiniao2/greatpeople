import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SoccerConfig {
  title: string
  homeTeam: string
  awayTeam: string
  homeEmoji: string
  awayEmoji: string
  kicks: number
  targetGoals: number
  readProb: number   // 0–1: probability keeper correctly reads player's column
  fact: string
}

// ── Configs ────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, SoccerConfig> = {
  'pele-final': {
    title: 'World Cup Final 1970',
    homeTeam: 'Brazil', awayTeam: 'Italy',
    homeEmoji: '🇧🇷', awayEmoji: '🇮🇹',
    kicks: 5, targetGoals: 3, readProb: 0.15,
    fact: "Pelé's Brazil beat Italy 4–1 in the 1970 World Cup final — widely considered the greatest team in football history. Pelé scored the opening header and orchestrated a style of play so fluid and artistic it changed football forever.",
  },
  'euro-penalty': {
    title: 'Euro Penalty Shootout',
    homeTeam: 'England', awayTeam: 'Germany',
    homeEmoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', awayEmoji: '🇩🇪',
    kicks: 5, targetGoals: 3, readProb: 0.25,
    fact: "England and Germany have met in some of football's most dramatic penalty shootouts. Germany historically dominates — a reputation earned through meticulous mental preparation. English players call penalty anxiety 'the curse' — a psychological rather than technical problem.",
  },
  'copa-final': {
    title: 'Copa América Final',
    homeTeam: 'Argentina', awayTeam: 'Brazil',
    homeEmoji: '🇦🇷', awayEmoji: '🇧🇷',
    kicks: 5, targetGoals: 3, readProb: 0.20,
    fact: "The Argentina–Brazil rivalry — El Superclásico de las Américas — is one of football's oldest and most passionate. Both nations have produced legends: Pelé and Ronaldo on one side, Maradona and Messi on the other.",
  },
  'hand-of-god': {
    title: "The Hand of God Match",
    homeTeam: 'Argentina', awayTeam: 'England',
    homeEmoji: '🇦🇷', awayEmoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    kicks: 5, targetGoals: 3, readProb: 0.20,
    fact: "In the 1986 World Cup quarter-final, Maradona scored two iconic goals against England — the infamous 'Hand of God' header with his fist, and then the 'Goal of the Century', dribbling past five defenders in 11 seconds. Both in the same match.",
  },
}

// Goal uses 3 columns × 2 rows = 6 cells.
// Keeper picks a column (0=left, 1=center, 2=right). Player picks a cell.
// Save if player's column matches keeper's column.

const COLS = 3
const ROWS = 2
const TOTAL_CELLS = COLS * ROWS  // 6

function cellToCol(cell: number): number { return cell % COLS }

const CELL_ARROW = ['↖','↑','↗','↙','↓','↘']

// ── Component ──────────────────────────────────────────────────────────────────

interface KickRecord { shotCell: number; keeperCol: number; scored: boolean }

export default function SoccerGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['pele-final']

  const [kick, setKick] = useState(0)
  const [goals, setGoals] = useState(0)
  const [history, setHistory] = useState<KickRecord[]>([])
  const [phase, setPhase] = useState<'shoot' | 'result' | 'won' | 'lost'>('shoot')
  const [lastShot, setLastShot] = useState<KickRecord | null>(null)

  function shoot(cell: number) {
    if (phase !== 'shoot') return

    const playerCol = cellToCol(cell)
    let keeperCol: number

    // Keeper read: with readProb, block the player's column; otherwise random
    if (Math.random() < cfg.readProb) {
      keeperCol = playerCol
    } else {
      keeperCol = Math.floor(Math.random() * COLS)
    }

    const scored = keeperCol !== playerCol
    const record: KickRecord = { shotCell: cell, keeperCol, scored }

    const newGoals  = goals + (scored ? 1 : 0)
    const newKick   = kick + 1
    const remaining = cfg.kicks - newKick

    setGoals(newGoals)
    setKick(newKick)
    setHistory(prev => [...prev, record])
    setLastShot(record)
    setPhase('result')

    setTimeout(() => {
      if (newGoals >= cfg.targetGoals) { setPhase('won'); return }
      if (newGoals + remaining < cfg.targetGoals) { setPhase('lost'); return }
      if (newKick >= cfg.kicks) { setPhase(newGoals >= cfg.targetGoals ? 'won' : 'lost'); return }
      setPhase('shoot')
    }, 1400)
  }

  function restart() {
    setKick(0); setGoals(0); setHistory([])
    setLastShot(null); setPhase('shoot')
  }

  if (phase === 'won') return (
    <div className="flex flex-col items-center gap-4 p-6 text-center">
      <div className="text-5xl">⚽🏆</div>
      <div className="text-xl font-bold text-amber-400">You Win!</div>
      <div className="text-sm text-slate-300">{goals}/{cfg.kicks} goals scored</div>
      <p className="text-sm text-slate-400 max-w-xs leading-relaxed">{cfg.fact}</p>
      <button onClick={onWin} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-semibold text-slate-900">Complete</button>
    </div>
  )

  if (phase === 'lost') return (
    <div className="flex flex-col items-center gap-4 p-6 text-center">
      <div className="text-5xl">🥅😞</div>
      <div className="text-xl font-bold text-red-400">Saved! You Lose.</div>
      <div className="text-sm text-slate-400">{goals}/{cfg.kicks} goals — need {cfg.targetGoals}</div>
      <button onClick={restart} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-semibold text-white">Try Again</button>
    </div>
  )

  const showResult = phase === 'result' && lastShot !== null

  return (
    <div className="flex flex-col items-center gap-4 p-4 max-w-xs mx-auto select-none">
      <div className="font-semibold text-amber-400 text-sm">{cfg.title}</div>

      {/* Scoreboard */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-xl">{cfg.homeEmoji}</span>
          <span className="font-bold text-2xl text-green-400">{goals}</span>
        </div>
        <div className="text-slate-400 text-xs">Kick {kick + 1} / {cfg.kicks}</div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-2xl text-red-400">{kick - goals}</span>
          <span className="text-xl">{cfg.awayEmoji}</span>
        </div>
      </div>

      {/* Goal frame */}
      <div className="bg-emerald-900/20 border-2 border-white/30 rounded p-1.5 w-full">
        {/* Goal posts top bar */}
        <div className="flex justify-between px-1 mb-0.5">
          <div className="w-2 h-3 bg-white/30 rounded-sm" />
          <div className="w-2 h-3 bg-white/30 rounded-sm" />
        </div>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: TOTAL_CELLS }).map((_, cell) => {
            const col = cellToCol(cell)
            const keeperHere   = showResult && lastShot!.keeperCol === col
            const shotHere     = showResult && lastShot!.shotCell === cell
            const isGoal       = showResult && lastShot!.scored && shotHere
            const isSaved      = showResult && !lastShot!.scored && shotHere

            return (
              <button
                key={cell}
                onClick={() => shoot(cell)}
                disabled={phase !== 'shoot'}
                className={`relative h-16 rounded border transition-all ${
                  phase === 'shoot'
                    ? 'border-white/20 hover:border-amber-400 hover:bg-amber-400/10 active:scale-95 cursor-pointer'
                    : 'border-white/10 cursor-default'
                } ${isGoal ? 'bg-green-900/50' : isSaved ? 'bg-red-900/40' : keeperHere && !shotHere ? 'bg-red-900/20' : ''}`}
              >
                {phase === 'shoot' && (
                  <span className="text-white/25 text-lg absolute inset-0 flex items-center justify-center">{CELL_ARROW[cell]}</span>
                )}
                {keeperHere && !isSaved && !isGoal && (
                  <span className="text-2xl absolute inset-0 flex items-center justify-center">🧤</span>
                )}
                {isSaved && (
                  <span className="text-2xl absolute inset-0 flex items-center justify-center">🧤⚽</span>
                )}
                {isGoal && (
                  <span className="text-2xl absolute inset-0 flex items-center justify-center">⚽</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Shot result */}
      {showResult && (
        <div className={`text-base font-bold ${lastShot!.scored ? 'text-green-400' : 'text-red-400'}`}>
          {lastShot!.scored ? '⚽ GOAL!' : '🧤 SAVED!'}
        </div>
      )}

      {phase === 'shoot' && (
        <div className="text-xs text-slate-400">Tap a zone to shoot</div>
      )}

      {/* History dots */}
      <div className="flex gap-1.5">
        {Array.from({ length: cfg.kicks }).map((_, i) => {
          const h = history[i]
          return (
            <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
              !h ? 'border-slate-600 text-slate-600' :
              h.scored ? 'border-green-500 bg-green-900/40 text-green-300' :
              'border-red-700 bg-red-900/40 text-red-400'
            }`}>
              {!h ? '○' : h.scored ? '✓' : '✗'}
            </div>
          )
        })}
      </div>

      <div className="text-xs text-slate-500">Score {cfg.targetGoals} to win</div>
    </div>
  )
}
