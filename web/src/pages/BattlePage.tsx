import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { battleApi, createBattleSocket } from '@/api/battle'
import { useAuth } from '@/hooks/useAuth'
import type { Match } from '@/types'
import type { Socket } from 'socket.io-client'

export default function BattlePage() {
  const [match, setMatch] = useState<Match | null>(null)
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState('')
  const socketRef = useRef<Socket | null>(null)
  const navigate = useNavigate()
  const { isGuest, exitGuestMode } = useAuth()

  const findMatch = async () => {
    setFinding(true)
    setError('')
    try {
      const m = await battleApi.findMatch()
      setMatch(m)
      if (m.status === 'active') {
        socketRef.current = createBattleSocket(m.id, () => {
          battleApi.getMatch(m.id).then(setMatch)
        })
      }
    } catch {
      setError('Could not find a match. Please try again.')
    } finally {
      setFinding(false)
    }
  }

  const forfeit = async () => {
    if (!match) return
    await battleApi.forfeit(match.id)
    socketRef.current?.disconnect()
    setMatch(null)
  }

  useEffect(() => () => { socketRef.current?.disconnect() }, [])

  const isWaiting = match?.status === 'waiting'
  const isActive  = match?.status === 'active'
  const isOver    = match?.status === 'finished' || match?.status === 'forfeited'

  return (
    <div className="relative min-h-screen bg-[#080812] overflow-hidden flex flex-col">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-indigo-700/10 blur-[140px]" />
        <div className="absolute bottom-1/3 right-1/3 w-[500px] h-[500px] rounded-full bg-amber-600/8 blur-[140px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 px-6 py-6 flex items-center gap-4 border-b border-white/[0.06]">
        <button onClick={() => navigate('/collection')}
          className="text-slate-500 hover:text-slate-300 transition-colors text-sm">
          ← Collection
        </button>
        <h1 className="font-display text-xl font-bold tracking-[0.1em] text-white uppercase">
          Battle Arena
        </h1>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-6">

        {/* Guest wall */}
        {isGuest && (
          <div className="text-center max-w-sm">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <span className="text-5xl select-none">⚔</span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase mb-3">
              Sign In to Battle
            </h2>
            <p className="text-slate-500 text-sm mb-8">
              Create a free account to challenge other players, earn cards, and build your collection.
            </p>
            <button onClick={() => { exitGuestMode(); navigate('/login') }}
              className="px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide text-slate-950
                         bg-amber-500 hover:bg-amber-400 active:bg-amber-600
                         shadow-lg shadow-amber-500/25 transition-all duration-200">
              Sign In / Register
            </button>
          </div>
        )}

        {/* No match yet */}
        {!isGuest && !match && (
          <div className="text-center max-w-sm">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <span className="text-5xl select-none">⚔</span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase mb-3">
              Ready to Fight?
            </h2>
            <p className="text-slate-500 text-sm mb-8">
              Challenge another player. Play your best card each round — highest stat wins.
              First to 5 wins takes the match.
            </p>
            {error && (
              <p className="text-red-400 text-sm mb-4">{error}</p>
            )}
            <button onClick={findMatch} disabled={finding}
              className="px-8 py-3.5 rounded-xl font-bold text-sm tracking-wide text-slate-950
                         bg-amber-500 hover:bg-amber-400 active:bg-amber-600
                         disabled:opacity-50 disabled:cursor-not-allowed
                         shadow-lg shadow-amber-500/25 transition-all duration-200">
              {finding
                ? <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    Finding match…
                  </span>
                : 'Find Match'}
            </button>
          </div>
        )}

        {/* Waiting for opponent */}
        {isWaiting && (
          <div className="text-center">
            <div className="w-16 h-16 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin mx-auto mb-6" />
            <h2 className="font-display text-xl font-bold tracking-wide text-white uppercase mb-2">
              Waiting for Opponent
            </h2>
            <p className="text-slate-500 text-sm mb-8">Match #{match.id.slice(0, 8)}</p>
            <button onClick={forfeit}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm text-red-400
                         border border-red-900/50 hover:border-red-700/60 hover:bg-red-950/30
                         transition-all duration-200">
              Cancel
            </button>
          </div>
        )}

        {/* Active match */}
        {isActive && match && (
          <div className="w-full max-w-lg">
            {/* Score board */}
            <div className="glass rounded-2xl p-6 mb-6">
              <p className="text-slate-500 text-xs uppercase tracking-widest text-center mb-4">
                Round {match.currentRound}
              </p>
              <div className="grid grid-cols-3 items-center gap-4">
                <div className="text-center">
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">You</p>
                  <p className="text-4xl font-bold text-amber-400">{match.scoreA}</p>
                </div>
                <div className="text-center">
                  <span className="text-slate-600 text-2xl font-light">vs</span>
                </div>
                <div className="text-center">
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Opponent</p>
                  <p className="text-4xl font-bold text-indigo-400">{match.scoreB}</p>
                </div>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                  style={{ width: `${(match.scoreA / 5) * 100}%` }} />
              </div>
              <p className="text-slate-600 text-[10px] text-center mt-1 uppercase tracking-wider">
                First to 5 wins
              </p>
            </div>

            <button onClick={forfeit}
              className="w-full py-3 rounded-xl font-semibold text-sm text-red-400
                         border border-red-900/50 hover:border-red-700/60 hover:bg-red-950/30
                         transition-all duration-200">
              Forfeit Match
            </button>
          </div>
        )}

        {/* Match over */}
        {isOver && match && (
          <div className="text-center max-w-sm">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <span className="text-5xl select-none">
                {match.status === 'finished' ? '🏆' : '🏳'}
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-wide text-white uppercase mb-2">
              {match.status === 'finished' ? 'Match Over' : 'Forfeited'}
            </h2>
            <p className="text-slate-400 text-sm mb-2">
              Final Score: <span className="text-amber-400 font-bold">{match.scoreA}</span>
              {' — '}
              <span className="text-indigo-400 font-bold">{match.scoreB}</span>
            </p>
            <div className="flex gap-3 justify-center mt-8">
              <button onClick={() => setMatch(null)}
                className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-950
                           bg-amber-500 hover:bg-amber-400 transition-all duration-200 shadow-lg shadow-amber-500/25">
                Play Again
              </button>
              <button onClick={() => navigate('/collection')}
                className="px-6 py-2.5 rounded-xl font-semibold text-sm text-slate-300
                           border border-white/10 hover:border-white/20 transition-all duration-200">
                Collection
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
