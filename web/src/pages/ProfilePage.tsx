import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { apiClient } from '@/api/client'

function toDisplayName(email: string): string {
  return email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function toInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { isLoggedIn, isGuest, email, logout, exitGuestMode } = useAuth()
  const [cardsCount, setCardsCount] = useState<number | null>(null)

  useEffect(() => {
    if (!isLoggedIn) return
    apiClient.get<{ cards: unknown[] }>('/profile/cards')
      .then(r => setCardsCount(r.data.cards.length))
      .catch(() => {})
  }, [isLoggedIn])

  const handleSignOut = async () => {
    await logout()
    navigate('/login')
  }

  const handleSignIn = () => {
    exitGuestMode()
    navigate('/login')
  }

  return (
    <div className="relative min-h-screen bg-paper overflow-hidden flex flex-col">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-accent/8 blur-[160px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-line/40 blur-[160px]" />
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center p-6 pb-24">

        {/* Guest state */}
        {isGuest && (
          <div className="w-full max-w-sm">
            <div
              className="rounded-3xl p-8 flex flex-col items-center text-center gap-6
                         bg-panel backdrop-blur-sm"
              style={{ border: '1px solid rgba(255,255,255,0.07)' }}>

              <div
                className="inline-flex items-center justify-center w-20 h-20 rounded-2xl"
                style={{ background: 'rgba(155,44,35,0.12)', border: '1px solid rgba(155,44,35,0.25)' }}>
                <span className="text-5xl select-none">◉</span>
              </div>

              <div>
                <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase mb-2">
                  Browsing as Guest
                </h2>
                <p className="text-muted text-sm leading-relaxed">
                  Sign in to track your progress, earn real cards, and compete on the leaderboard.
                </p>
              </div>

              <button
                onClick={handleSignIn}
                className="w-full py-3.5 rounded-xl font-bold text-sm tracking-wide text-ink
                           bg-accent hover:bg-accent-hover active:bg-accent-hover
                           shadow-lg shadow-accent/25 transition-all duration-200">
                Sign In / Register
              </button>
            </div>
          </div>
        )}

        {/* Logged-in state */}
        {isLoggedIn && (() => {
          const displayName = email ? toDisplayName(email) : 'Player'
          const initials = toInitials(displayName)
          return (
            <div className="w-full max-w-sm">
              <div
                className="rounded-3xl p-8 flex flex-col items-center text-center gap-6
                           bg-panel backdrop-blur-sm"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}>

                {/* Avatar with initials */}
                <div
                  className="inline-flex items-center justify-center w-24 h-24 rounded-2xl"
                  style={{ background: 'rgba(155,44,35,0.12)', border: '1px solid rgba(155,44,35,0.25)' }}>
                  <span className="text-3xl font-bold text-accent select-none tracking-wider">
                    {initials}
                  </span>
                </div>

                <div>
                  <h2 className="font-display text-xl font-bold tracking-wide text-ink uppercase mb-1">
                    {displayName}
                  </h2>
                  {email && (
                    <p className="text-muted text-xs">
                      {email}
                    </p>
                  )}
                </div>

                {/* Cards stat */}
                <div
                  className="w-full rounded-xl overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                  }}>
                  <div className="flex flex-col items-center py-5">
                    <span className="text-accent font-bold text-2xl">
                      {cardsCount ?? '—'}
                    </span>
                    <span className="text-muted/80 text-[10px] tracking-widest uppercase mt-1">
                      Cards Collected
                    </span>
                  </div>
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
          )
        })()}
      </div>
    </div>
  )
}
