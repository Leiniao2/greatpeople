import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import allChallenges from '@/data/story_challenges.json'

const CHALLENGE_COUNT = (allChallenges as { challenges: unknown[] }[])
  .reduce((sum, s) => sum + s.challenges.length, 0)

const APP_VERSION = '1.0.0'

const CHANGELOG = [
  { date: 'May 2026', note: 'New minigames: Compose, Museum, Weapon Deploy, Jigsaw' },
  { date: 'May 2026', note: 'Arcade instruction text now shown when playing' },
  { date: 'May 2026', note: 'Quiz countdown timer added' },
  { date: 'Apr 2026', note: 'Replaced excess trivia with interactive minigames' },
  { date: 'Apr 2026', note: 'GP stats rescaled to 1–12, follower identity bonuses' },
  { date: 'Apr 2026', note: 'Natural hazard: per-card min-stat elimination' },
  { date: 'Apr 2026', note: 'Achievements: single-trigger, require worthy opponent' },
]

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
    subtitle: `${CHALLENGE_COUNT} mini challenges, play freely`,
    path: '/arcade',
  },
  {
    icon: '◉',
    name: 'PROFILE',
    subtitle: 'Your account & stats',
    path: '/profile',
  },
]

function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div
        className="relative bg-panel border-t border-line rounded-t-3xl px-6 pt-5 pb-safe pb-8 max-h-[70vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="w-10 h-1 bg-panel rounded-full mx-auto mb-5" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-ink font-bold text-base tracking-wider">GREAT PEOPLE</h2>
            <p className="text-accent/70 text-[10px] uppercase tracking-widest mt-0.5">v{APP_VERSION}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-panel text-muted hover:text-ink transition-all text-lg">
            ✕
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { value: '80', label: 'Cards' },
            { value: '76', label: 'Stories' },
            { value: String(CHALLENGE_COUNT), label: 'Challenges' },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center py-3 rounded-xl bg-panel border border-line">
              <span className="text-accent font-bold text-lg leading-none">{s.value}</span>
              <span className="text-muted text-[10px] mt-1">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Changelog */}
        <p className="text-muted text-[10px] uppercase tracking-widest font-semibold mb-2">Recent Updates</p>
        <div className="flex flex-col gap-2">
          {CHANGELOG.map((entry, i) => (
            <div key={i} className="flex gap-3 items-start">
              <span className="text-muted/80 text-[10px] shrink-0 pt-0.5 w-14">{entry.date}</span>
              <p className="text-ink-2 text-xs leading-snug">{entry.note}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-muted/60 text-[10px] text-center mt-5">
          Collectible Card Game · All eras, all greatness
        </p>
      </div>
    </div>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { isGuest, exitGuestMode } = useAuth()
  const [showAbout, setShowAbout] = useState(false)

  return (
    <div className="relative min-h-screen bg-paper flex flex-col overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-accent/8 blur-[160px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[500px] h-[500px] rounded-full bg-line/40 blur-[140px]" />
      </div>

      {/* Guest banner */}
      {isGuest && (
        <div className="relative z-20 flex items-center justify-between px-6 py-2.5
                        bg-accent/10 border-b border-accent/20">
          <p className="text-accent/80 text-xs">
            Exploring as guest — sign in to save progress
          </p>
          <button
            onClick={() => { exitGuestMode(); navigate('/login') }}
            className="text-accent text-xs font-semibold hover:text-accent transition-colors ml-4 shrink-0">
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
            style={{ background: 'rgba(155,44,35,0.12)', border: '1px solid rgba(155,44,35,0.25)' }}>
            <span className="text-3xl select-none">⚡</span>
          </div>
          <h1 className="font-display text-3xl font-bold tracking-[0.15em] text-ink uppercase mb-1">
            GREAT PEOPLE
          </h1>
          <p className="text-muted text-xs tracking-[0.2em] uppercase">
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
                         bg-panel backdrop-blur-sm
                         border border-accent/25
                         hover:bg-accent/10 hover:border-accent/50
                         active:bg-accent/15
                         transition-all duration-200 text-left">

              {/* Icon box */}
              <div
                className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl text-xl"
                style={{ background: 'rgba(155,44,35,0.12)', border: '1px solid rgba(155,44,35,0.2)' }}>
                {mode.icon}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-ink font-bold text-sm tracking-wider">
                  {mode.name}
                </p>
                <p className="text-muted text-xs mt-0.5">
                  {mode.subtitle}
                </p>
              </div>

              {/* Arrow */}
              <span className="text-accent/60 group-hover:text-accent transition-colors text-lg font-light">
                →
              </span>
            </button>
          ))}
        </div>

        {/* About button */}
        <button
          onClick={() => setShowAbout(true)}
          className="mt-8 text-muted/80 text-[11px] hover:text-muted transition-colors tracking-wider">
          ⓘ about · v{APP_VERSION}
        </button>
      </div>

      {showAbout && <AboutSheet onClose={() => setShowAbout(false)} />}
    </div>
  )
}
