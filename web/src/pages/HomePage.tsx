import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

const MODES = [
  {
    icon: '⚡',
    name: 'EPIC',
    subtitle: 'Unlock stories, earn cards',
    path: '/epic',
  },
  {
    icon: '♛',
    name: 'COLLECTION',
    subtitle: 'Your card gallery',
    path: '/collection',
  },
  {
    icon: '⚔',
    name: 'FIGHT',
    subtitle: 'Compete with others',
    path: '/battle',
  },
  {
    icon: '🎮',
    name: 'ARCADE',
    subtitle: '120 mini challenges, play freely',
    path: '/arcade',
  },
  {
    icon: '◉',
    name: 'PROFILE',
    subtitle: 'Your account & stats',
    path: '/profile',
  },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { isGuest, exitGuestMode } = useAuth()

  return (
    <div className="relative min-h-screen bg-[#080812] flex flex-col overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-amber-600/8 blur-[160px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[500px] h-[500px] rounded-full bg-indigo-700/6 blur-[140px]" />
      </div>

      {/* Guest banner */}
      {isGuest && (
        <div className="relative z-20 flex items-center justify-between px-6 py-2.5
                        bg-amber-500/10 border-b border-amber-500/20">
          <p className="text-amber-400/80 text-xs">
            Exploring as guest — sign in to save progress
          </p>
          <button
            onClick={() => { exitGuestMode(); navigate('/login') }}
            className="text-amber-400 text-xs font-semibold hover:text-amber-300 transition-colors ml-4 shrink-0">
            Sign In →
          </button>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-12">

        {/* Logo area */}
        <div className="flex flex-col items-center mb-12">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <span className="text-3xl select-none">⚡</span>
          </div>
          <h1 className="font-serif text-3xl font-bold tracking-[0.15em] text-white uppercase mb-1">
            GREAT PEOPLE
          </h1>
          <p className="text-slate-400 text-xs tracking-[0.2em] uppercase">
            Collectible Card Game
          </p>
        </div>

        {/* Mode buttons */}
        <div className="w-full max-w-sm flex flex-col gap-3">
          {MODES.map((mode) => (
            <button
              key={mode.name}
              onClick={() => navigate(mode.path)}
              className="group relative w-full flex items-center gap-4 px-4 py-4 rounded-2xl
                         bg-white/[0.03] backdrop-blur-sm
                         border border-amber-500/25
                         hover:bg-amber-500/10 hover:border-amber-500/50
                         active:bg-amber-500/15
                         transition-all duration-200 text-left">

              {/* Icon box */}
              <div
                className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl text-xl"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
                {mode.icon}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm tracking-wider">
                  {mode.name}
                </p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {mode.subtitle}
                </p>
              </div>

              {/* Arrow */}
              <span className="text-amber-500/60 group-hover:text-amber-400 transition-colors text-lg font-light">
                →
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
