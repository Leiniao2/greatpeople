import { useCallback, useState, useRef } from 'react'
import { isEmbedded, postToNative } from '@/bridge/native'
import UiIcon, { type UiIconName } from '@/components/UiIcon'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import type { GameState, GameSetup, EraMode, PlayerMode, MatchType } from '@/types'
import { cardBackUrl, followerUrl } from '@/data/images'
import PageLoader from '@/components/PageLoader'
import EraIcon from '@/components/EraIcon'
import { ERAS, FOLLOWER_TEMPLATES, initGame, gameReducer, type GameAction } from '@/battle/engine'
import { BattleGame } from '@/battle/BattleGame'

// The Battle tab: mode picker, lobby and the full-screen board.  The rules
// live in @/battle/engine, the board in @/battle/BattleGame.
interface LobbyProps {
  matchType: MatchType
  onStart: (setup: GameSetup) => void
  onBack: () => void
}

const MATCH_TYPE_LABELS: Record<MatchType, { title: string; sub: string }> = {
  casual:  { title: 'Casual',     sub: 'vs Human · Friendly' },
  ranked:  { title: 'Ranked',     sub: 'vs Human · Competitive' },
  pvc:     { title: 'vs Computer', sub: 'Fight the AI' },
}

function BattleLobby({ matchType, onStart, onBack }: LobbyProps) {
  const isPvC = matchType === 'pvc'
  const playerMode: PlayerMode = isPvC ? 'pvc' : 'pvp'

  const [eraMode, setEraMode] = useState<EraMode>('all')
  const [singleEra, setSingleEra] = useState('Ancient')
  // PvP needs at least 2 humans; PvC is always 1 human vs N CPUs
  const [numHumans, setNumHumans] = useState(isPvC ? 1 : 2)
  const [numComputers, setNumComputers] = useState(1)
  const [playerNames, setPlayerNames] = useState<string[]>(
    isPvC ? ['You'] : ['Player 1', 'Player 2']
  )

  const updatePlayerName = (i: number, name: string) => {
    const names = [...playerNames]
    names[i] = name
    setPlayerNames(names)
  }

  const adjustHumans = (n: number) => {
    const clamped = Math.max(2, Math.min(5, n))
    setNumHumans(clamped)
    setPlayerNames(prev => Array.from({ length: clamped }, (_, i) => prev[i] ?? `Player ${i + 1}`))
  }

  const adjustComputers = (n: number) => {
    setNumComputers(Math.max(1, Math.min(4, n)))
  }

  const totalPlayers = isPvC ? 1 + numComputers : numHumans
  const canStart = totalPlayers >= 2 && totalPlayers <= 5
  const label = MATCH_TYPE_LABELS[matchType]

  return (
    <div className="relative min-h-screen bg-paper overflow-auto flex flex-col">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] rounded-full bg-line/40 blur-[140px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/8 blur-[140px]" />
      </div>

      <div className="relative z-10 px-5 py-5 flex items-center gap-3 border-b border-line">
        <button onClick={onBack} className="text-muted hover:text-ink-2 text-sm transition-colors">← Back</button>
        <div>
          <h1 className="font-display text-xl font-bold tracking-[0.1em] text-ink uppercase">{label.title}</h1>
          <p className="text-[11px] text-muted">{label.sub}</p>
        </div>
      </div>

      <div className="relative z-10 flex-1 px-5 py-6 space-y-6 max-w-lg mx-auto w-full">

        {isPvC ? (
          /* PvC: fixed 1 human, variable CPUs */
          <>
            <div>
              <p className="text-xs text-muted uppercase tracking-widest mb-2">Your Name</p>
              <input
                value={playerNames[0] ?? ''}
                onChange={e => updatePlayerName(0, e.target.value)}
                placeholder="Your name"
                className="w-full bg-paper-2 border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder-muted focus:outline-none focus:border-accent/50"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-muted uppercase tracking-widest">Computer Opponents</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => adjustComputers(numComputers - 1)}
                    className="w-7 h-7 rounded-lg bg-panel-2 border border-line text-ink text-sm hover:bg-line transition-colors">−</button>
                  <span className="text-ink text-sm w-5 text-center font-semibold">{numComputers}</span>
                  <button onClick={() => adjustComputers(numComputers + 1)}
                    className="w-7 h-7 rounded-lg bg-panel-2 border border-line text-ink text-sm hover:bg-line transition-colors">+</button>
                </div>
              </div>
              <p className="text-[11px] text-muted/80">
                {numComputers === 1 ? '1 CPU opponent' : `${numComputers} CPU opponents`} · {totalPlayers} players total
              </p>
            </div>
          </>
        ) : (
          /* PvP: 2–5 human players */
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted uppercase tracking-widest">Players</p>
              <div className="flex items-center gap-2">
                <button onClick={() => adjustHumans(numHumans - 1)}
                  disabled={numHumans <= 2}
                  className="w-7 h-7 rounded-lg bg-panel-2 border border-line text-ink text-sm hover:bg-line transition-colors disabled:opacity-30">−</button>
                <span className="text-ink text-sm w-5 text-center font-semibold">{numHumans}</span>
                <button onClick={() => adjustHumans(numHumans + 1)}
                  disabled={numHumans >= 5}
                  className="w-7 h-7 rounded-lg bg-panel-2 border border-line text-ink text-sm hover:bg-line transition-colors disabled:opacity-30">+</button>
              </div>
            </div>
            <div className="space-y-2">
              {Array.from({ length: numHumans }, (_, i) => (
                <input key={i} value={playerNames[i] ?? ''} onChange={e => updatePlayerName(i, e.target.value)}
                  placeholder={`Player ${i + 1}`}
                  className="w-full bg-paper-2 border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder-muted focus:outline-none focus:border-accent/50" />
              ))}
            </div>
          </div>
        )}

        {/* Era Mode */}
        <div>
          <p className="text-xs text-muted uppercase tracking-widest mb-3">Era</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {(['all', 'single'] as const).map(m => (
              <button key={m} onClick={() => setEraMode(m)}
                className={`py-3 rounded-xl text-sm font-semibold transition-all border
                  ${eraMode === m
                    ? 'bg-accent/15 border-accent/50 text-accent'
                    : 'border-line text-muted hover:border-line-2'}`}>
                {m === 'all' ? 'All Eras' : 'Single Era'}
              </button>
            ))}
          </div>
          {eraMode === 'single' && (
            <div className="grid grid-cols-7 gap-1.5">
              {ERAS.map(era => (
                <button key={era} onClick={() => setSingleEra(era)} title={era}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-all border flex items-center justify-center
                    ${singleEra === era
                      ? 'bg-accent/15 border-accent/50 text-accent'
                      : 'border-line text-muted hover:border-line-2'}`}>
                  <EraIcon era={era} className="w-5 h-5" />
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => {
            if (!canStart) return
            onStart({
              mode: 'generic',
              matchType,
              playerMode,
              eraMode,
              singleEra: eraMode === 'single' ? singleEra : undefined,
              playerNames: playerNames.slice(0, isPvC ? 1 : numHumans),
              numComputers: isPvC ? numComputers : 0,
            })
          }}
          disabled={!canStart}
          className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide text-ink
            bg-accent hover:bg-accent-hover active:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed
            shadow-lg shadow-accent/25 transition-all duration-200">
          Start Game
        </button>
      </div>
    </div>
  )
}

// ─── Player Colors ────────────────────────────────────────────────────────────

type PagePhase = 'home' | 'lobby' | 'game'

const MATCH_MODES: { type: MatchType; icon: UiIconName; title: string; desc: string; accent: string; border: string }[] = [
  {
    type:   'casual',
    icon:   'casual',
    title:  'Casual',
    desc:   'Play vs Human — friendly match, no stakes',
    accent: 'text-emerald-400',
    border: 'border-emerald-700/40 hover:border-emerald-500/60',
  },
  {
    type:   'ranked',
    icon:   'ranked',
    title:  'Ranked',
    desc:   'Play vs Human — competitive, climb the ladder',
    accent: 'text-accent',
    border: 'border-accent/40 hover:border-accent/60',
  },
  {
    type:   'pvc',
    icon:   'computer',
    title:  'vs Computer',
    desc:   'Fight AI opponents — sharpen your strategy',
    accent: 'text-indigo-400',
    border: 'border-indigo-700/40 hover:border-indigo-500/60',
  },
]

// Card backs and follower art appear as soon as a match starts; portraits
// are drawn one card at a time and are usually cached from Collection.
const BATTLE_ASSETS = [
  cardBackUrl('gp'), cardBackUrl('follower'), cardBackUrl('location'), cardBackUrl('event'),
  ...FOLLOWER_TEMPLATES.map(f => followerUrl(f.imageKey)),
]

export default function BattlePage() {
  return (
    <PageLoader assets={BATTLE_ASSETS} label="Preparing the arena">
      <BattleContent />
    </PageLoader>
  )
}

function BattleContent() {
  const navigate = useNavigate()
  const { isGuest, exitGuestMode } = useAuth()
  const [pagePhase, setPagePhase] = useState<PagePhase>('home')
  const [selectedMatchType, setSelectedMatchType] = useState<MatchType>('casual')
  const [showGuestPrompt, setShowGuestPrompt] = useState(false)

  // Maintain game state in a ref to allow flexible initialization
  const gameStateRef = useRef<GameState | null>(null)
  const [, setTick] = useState(0)
  const forceUpdate = useCallback(() => setTick(t => t + 1), [])

  const dispatchWithInit = useCallback((action: GameAction) => {
    if (!gameStateRef.current) return
    gameStateRef.current = gameReducer(gameStateRef.current, action)
    forceUpdate()
  }, [forceUpdate])

  const handleStartGameFinal = useCallback((setup: GameSetup) => {
    gameStateRef.current = initGame(setup)
    setPagePhase('game')
    forceUpdate()
  }, [forceUpdate])

  if (pagePhase === 'home') {
    return (
      <div className="relative min-h-screen bg-paper overflow-hidden flex flex-col">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-line/40 blur-[140px]" />
          <div className="absolute bottom-1/3 right-1/3 w-[500px] h-[500px] rounded-full bg-accent/8 blur-[140px]" />
        </div>

        <div className="relative z-10 px-6 py-6 flex items-center gap-4 border-b border-line">
          <button onClick={() => (isEmbedded() ? postToNative({ type: 'close' }) : navigate('/home'))}
            className="text-muted hover:text-ink-2 transition-colors text-sm">
            ← Home
          </button>
          <h1 className="font-display text-xl font-bold tracking-[0.1em] text-ink uppercase">Fight Arena</h1>
        </div>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 gap-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <UiIcon name="fight" className="w-14 h-14" />
            </div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-ink uppercase mb-1">Choose your Battle</h2>
            <p className="text-muted/80 text-sm">Deploy Great People across history's greatest cities</p>
          </div>

          <div className="w-full max-w-sm space-y-3">
            {MATCH_MODES.map(m => {
              const locked = isGuest && m.type !== 'pvc'
              return (
                <button
                  key={m.type}
                  onClick={() => {
                    if (locked) { setShowGuestPrompt(true); return }
                    setSelectedMatchType(m.type); setPagePhase('lobby')
                  }}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border bg-panel transition-all duration-200 text-left
                    ${locked ? 'border-line opacity-50' : m.border}`}>
                  <UiIcon name={m.icon} className="w-11 h-11" />
                  <div className="flex-1">
                    <p className={`text-base font-bold tracking-wide ${locked ? 'text-muted' : m.accent}`}>{m.title}</p>
                    <p className="text-xs text-muted mt-0.5">{m.desc}</p>
                  </div>
                  {locked
                    ? <span className="text-muted/80 text-sm">🔒</span>
                    : <span className="ml-auto text-muted/80 text-sm">›</span>
                  }
                </button>
              )
            })}
          </div>

          {isGuest && (
            <p className="text-xs text-muted/80 text-center max-w-xs">
              Sign in to unlock Casual & Ranked matches
            </p>
          )}

          {/* Guest sign-in prompt overlay */}
          {showGuestPrompt && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6"
              onClick={() => setShowGuestPrompt(false)}
            >
              <div
                className="bg-panel border border-line rounded-2xl p-6 max-w-xs w-full space-y-4 text-center"
                onClick={e => e.stopPropagation()}
              >
                <div className="text-4xl">🔒</div>
                <h3 className="text-ink font-bold text-lg">Sign In Required</h3>
                <p className="text-muted text-sm">Create a free account to play Casual and Ranked matches against other players.</p>
                <button
                  onClick={() => { setShowGuestPrompt(false); exitGuestMode() }}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
                >
                  Sign In / Register
                </button>
                <button
                  onClick={() => setShowGuestPrompt(false)}
                  className="w-full py-2 text-muted text-sm hover:text-muted transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (pagePhase === 'lobby') {
    return <BattleLobby matchType={selectedMatchType} onStart={handleStartGameFinal} onBack={() => setPagePhase('home')} />
  }

  if (pagePhase === 'game' && gameStateRef.current) {
    return (
      <BattleGame
        gameState={gameStateRef.current}
        dispatch={dispatchWithInit}
        onExit={() => { gameStateRef.current = null; setPagePhase('home') }}
      />
    )
  }

  return null
}
