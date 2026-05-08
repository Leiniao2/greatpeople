import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const GAMES = [
  { name: 'Speed Quiz',    desc: 'Answer fast, earn rare cards' },
  { name: 'Memory Match',  desc: 'Find pairs to unlock legends' },
  { name: 'Trivia Duel',   desc: 'Test your history knowledge' },
]

export default function EpicPage() {
  const navigate = useNavigate()
  const { isGuest, exitGuestMode } = useAuth()

  return (
    <div className="relative min-h-screen bg-[#080812] overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-amber-600/8 blur-[160px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full bg-violet-700/8 blur-[160px]" />
      </div>

      {/* Guest banner */}
      {isGuest && (
        <div className="relative z-20 flex items-center justify-between px-6 py-2.5
                        bg-amber-500/10 border-b border-amber-500/20">
          <p className="text-amber-400/80 text-xs">
            Exploring as guest — sign in to earn real cards
          </p>
          <button
            onClick={() => { exitGuestMode(); navigate('/login') }}
            className="text-amber-400 text-xs font-semibold hover:text-amber-300 transition-colors ml-4 shrink-0">
            Sign In →
          </button>
        </div>
      )}

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-8 pb-24">

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <span className="text-5xl select-none">⚡</span>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-[0.1em] text-white uppercase mb-2">
            EPIC
          </h1>
          <p className="text-slate-500 text-xs tracking-widest uppercase">
            Mini-Games · Earn Cards
          </p>
        </div>

        {/* Game cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {GAMES.map((game) => (
            <div
              key={game.name}
              className="relative rounded-2xl p-5 flex flex-col gap-3
                         bg-white/[0.03] backdrop-blur-sm"
              style={{ border: '1px solid rgba(245,158,11,0.20)' }}>

              {/* Coming soon badge */}
              <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-widest
                               text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                Coming Soon
              </span>

              {/* Icon */}
              <div
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl self-start"
                style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.18)' }}>
                <span className="text-xl select-none">⚡</span>
              </div>

              {/* Text */}
              <div>
                <p className="text-white text-sm font-semibold mb-1">{game.name}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{game.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
