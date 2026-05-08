import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export default function ProfilePage() {
  const navigate = useNavigate()
  const { isLoggedIn, isGuest, logout, exitGuestMode } = useAuth()

  const handleSignOut = async () => {
    await logout()
    navigate('/login')
  }

  const handleSignIn = () => {
    exitGuestMode()
    navigate('/login')
  }

  return (
    <div className="relative min-h-screen bg-[#080812] overflow-hidden flex flex-col">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-amber-600/8 blur-[160px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-indigo-700/8 blur-[160px]" />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center p-6 pb-24">

        {/* Guest state */}
        {isGuest && (
          <div className="w-full max-w-sm">
            <div
              className="rounded-3xl p-8 flex flex-col items-center text-center gap-6
                         bg-white/[0.03] backdrop-blur-sm"
              style={{ border: '1px solid rgba(255,255,255,0.07)' }}>

              <div
                className="inline-flex items-center justify-center w-20 h-20 rounded-2xl"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <span className="text-5xl select-none">◉</span>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold tracking-wide text-white uppercase mb-2">
                  Browsing as Guest
                </h2>
                <p className="text-slate-500 text-sm leading-relaxed">
                  Sign in to track your progress, earn real cards, and compete on the leaderboard.
                </p>
              </div>

              <button
                onClick={handleSignIn}
                className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide text-slate-950
                           bg-amber-500 hover:bg-amber-400 active:bg-amber-600
                           shadow-lg shadow-amber-500/25 transition-all duration-200">
                Sign In / Register
              </button>
            </div>
          </div>
        )}

        {/* Logged-in state */}
        {isLoggedIn && (
          <div className="w-full max-w-sm">
            <div
              className="rounded-3xl p-8 flex flex-col items-center text-center gap-6
                         bg-white/[0.03] backdrop-blur-sm"
              style={{ border: '1px solid rgba(255,255,255,0.07)' }}>

              {/* Avatar */}
              <div
                className="inline-flex items-center justify-center w-24 h-24 rounded-2xl"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <span className="text-6xl select-none">◉</span>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold tracking-wide text-white uppercase mb-1">
                  Your Profile
                </h2>
                <p className="text-slate-500 text-xs tracking-widest uppercase">
                  Great People Player
                </p>
              </div>

              {/* Stats row */}
              <div
                className="w-full grid grid-cols-3 rounded-xl overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                {[
                  { label: 'Wins',  value: '—' },
                  { label: 'Cards', value: '—' },
                  { label: 'ELO',   value: '—' },
                ].map(({ label, value }, i) => (
                  <div key={label} className="flex flex-col items-center py-4"
                    style={i < 2 ? { borderRight: '1px solid rgba(255,255,255,0.07)' } : undefined}>
                    <span className="text-amber-400 font-bold text-lg">{value}</span>
                    <span className="text-slate-600 text-[10px] tracking-widest uppercase mt-0.5">{label}</span>
                  </div>
                ))}
              </div>

              {/* Sign out */}
              <button
                onClick={handleSignOut}
                className="w-full py-3 rounded-xl font-semibold text-sm text-red-400
                           border border-red-900/50 hover:border-red-700/60 hover:bg-red-950/30
                           transition-all duration-200">
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
