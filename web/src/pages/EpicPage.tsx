import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import StoryViewer from '@/components/StoryViewer'
import { useUnlockedCards } from '@/hooks/useUnlockedCards'
import cardsData from '@/data/demo_cards.json'

function portraitKeyForFigure(name: string | null): string | null {
  if (!name) return null
  const card = (cardsData as { figureName: string; portraitKey: string }[])
    .find(c => c.figureName === name)
  return card?.portraitKey ?? null
}

// ── Story data ────────────────────────────────────────────────────────────────

interface Story {
  title: string
  figure: string | null
  quizzes: number
}

interface Era {
  name: string
  stories: Story[]
}

const ERAS: Era[] = [
  {
    name: 'Ancient',
    stories: [
      { title: 'Pyramid Builders',           figure: 'Imhotep',  quizzes: 5 },
      { title: 'The First Empire',           figure: 'Sargon I', quizzes: 4 },
      { title: 'The King and the Wild Man',  figure: 'Gilgamesh', quizzes: 4 },
      { title: 'Geometry of the World',      figure: 'Euclid',   quizzes: 4 },
      { title: 'Sacred Medicine',            figure: null,        quizzes: 4 },
      { title: 'River Civilizations',        figure: null,        quizzes: 3 },
    ],
  },
  {
    name: 'Classical',
    stories: [
      { title: 'The Elements',              figure: 'Euclid',      quizzes: 4 },
      { title: 'The Golden Age of Athens',  figure: 'Pericles',    quizzes: 4 },
      { title: 'The Voice of Rome',         figure: 'Cicero',      quizzes: 4 },
      { title: 'Before Socrates',           figure: 'Anaxagoras',  quizzes: 4 },
      { title: 'Senate and Forum',          figure: null,           quizzes: 4 },
      { title: 'Philosophy of Athens',      figure: null,           quizzes: 3 },
      { title: 'Olympic Games',             figure: null,           quizzes: 3 },
      { title: 'Eastern Trade',             figure: null,           quizzes: 3 },
    ],
  },
  {
    name: 'Medieval',
    stories: [
      { title: 'The Last General',         figure: 'Belisarius',   quizzes: 4 },
      { title: 'The Language of Algebra',  figure: 'Al-Khwarizmi', quizzes: 4 },
      { title: 'The Prophet of Light',     figure: 'Mani',         quizzes: 4 },
      { title: 'Tea Ceremony',             figure: 'Lu Yu',         quizzes: 3 },
      { title: 'The Disguised Warrior',    figure: 'Hua Mulan',    quizzes: 4 },
      { title: "The Knight's Code",        figure: 'Lancelot',     quizzes: 4 },
      { title: 'Words of Sorrow',          figure: 'Li Qingzhao',  quizzes: 3 },
    ],
  },
  {
    name: 'Renaissance',
    stories: [
      { title: 'Way of the Sword',    figure: 'Miyamoto Musashi', quizzes: 4 },
      { title: 'Art and Science',     figure: null,                quizzes: 4 },
      { title: 'The Colors of Venice',figure: 'Titian',            quizzes: 4 },
      { title: 'The Printing Press',  figure: null,                quizzes: 3 },
      { title: 'Around the World',    figure: 'Magellan',          quizzes: 4 },
      { title: 'New Worlds',          figure: null,                quizzes: 3 },
      { title: 'The Mystic Doctor',   figure: 'Teresa of Ávila',   quizzes: 4 },
      { title: 'Reformation',         figure: null,                quizzes: 3 },
    ],
  },
  {
    name: 'Steam',
    stories: [
      { title: 'Soul Force',               figure: 'Gandhi',          quizzes: 4 },
      { title: 'Keys and Concertos',       figure: 'Clara Schumann',  quizzes: 3 },
      { title: 'The Naming of Everything', figure: 'Carl Linnaeus',   quizzes: 4 },
      { title: 'Garden of Genetics',       figure: 'Gregor Mendel',   quizzes: 4 },
      { title: 'Symphony of Shadows',      figure: 'Johannes Brahms', quizzes: 3 },
      { title: 'The Gilded Court',         figure: 'Louis XVI',       quizzes: 4 },
    ],
  },
  {
    name: 'Electricity',
    stories: [
      { title: 'Breaking Enigma',        figure: 'Alan Turing',      quizzes: 4 },
      { title: 'Light Before Einstein',  figure: 'Hendrik Lorentz',  quizzes: 4 },
      { title: 'Fashion Revolution',     figure: 'Coco Chanel',      quizzes: 3 },
      { title: 'Wings Over the Atlantic',figure: 'Amelia Earhart',   quizzes: 4 },
      { title: "Cinema's Architect",     figure: 'Sergei Eisenstein', quizzes: 4 },
      { title: 'Top of the World',       figure: 'Edmund Hillary',   quizzes: 4 },
      { title: 'The Long March',         figure: 'Mao Zedong',       quizzes: 4 },
      { title: "A Martyr's Bullet",      figure: 'An Jung-geun',     quizzes: 3 },
      { title: 'The Gilded Age',         figure: 'Andrew Mellon',    quizzes: 3 },
    ],
  },
  {
    name: 'Information',
    stories: [
      { title: "Breakfast at Tiffany's", figure: 'Audrey Hepburn',    quizzes: 4 },
      { title: 'Moonwalk',               figure: 'Michael Jackson',   quizzes: 4 },
      { title: 'The Digital Revolution', figure: null,                 quizzes: 4 },
      { title: 'The Global Village',     figure: null,                 quizzes: 3 },
      { title: 'Climate Reckoning',      figure: null,                 quizzes: 3 },
      { title: 'The New Frontier',       figure: null,                 quizzes: 3 },
    ],
  },
]

const STORIES_TO_ADVANCE = 4

// ── Component ─────────────────────────────────────────────────────────────────

export default function EpicPage() {
  const navigate = useNavigate()
  const { isGuest, exitGuestMode, isAdmin } = useAuth()
  const { unlock } = useUnlockedCards()
  const [activeEra, setActiveEra] = useState(0)
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [modal, setModal] = useState<{ eraIdx: number; storyIdx: number } | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)

  const key = (eraIdx: number, storyIdx: number) => `${eraIdx}-${storyIdx}`

  // Era E is selectable when era E-1 has >= STORIES_TO_ADVANCE completed stories.
  // Admin bypasses all gating.
  const isEraSelectable = (eraIdx: number): boolean => {
    if (isAdmin) return true
    if (eraIdx === 0) return true
    const prevCompleted = ERAS[eraIdx - 1].stories.filter((_, i) => completed[key(eraIdx - 1, i)]).length
    return prevCompleted >= STORIES_TO_ADVANCE
  }

  // Story 0 of any accessible era is unlocked; story N unlocked when story N-1 is completed.
  // Admin has all stories unlocked.
  const isStoryUnlocked = (eraIdx: number, storyIdx: number): boolean => {
    if (isAdmin) return true
    if (!isEraSelectable(eraIdx)) return false
    if (storyIdx === 0) return true
    return !!completed[key(eraIdx, storyIdx - 1)]
  }

  const completedInEra = (eraIdx: number) =>
    ERAS[eraIdx].stories.filter((_, i) => completed[key(eraIdx, i)]).length

  const handleBegin = (eraIdx: number, storyIdx: number) => {
    setModal({ eraIdx, storyIdx })
  }

  const handleStoryComplete = (eraIdx: number, storyIdx: number, unlockKey: string | null) => {
    setCompleted(prev => ({ ...prev, [key(eraIdx, storyIdx)]: true }))
    if (unlockKey) {
      unlock(unlockKey)
      showToast('Card unlocked! Check your Collection.')
    } else {
      showToast('Story completed! Next story unlocked.')
    }
  }

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const handleEraClick = (idx: number) => {
    if (isEraSelectable(idx)) setActiveEra(idx)
    else showToast('Complete 4 stories in the current era first.')
  }

  const era = ERAS[activeEra]
  const done = completedInEra(activeEra)
  const eraComplete = isAdmin || done >= STORIES_TO_ADVANCE

  return (
    <div className="relative min-h-screen bg-[#080812] overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-amber-600/8 blur-[160px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full bg-violet-700/8 blur-[160px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl
                        bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm
                        backdrop-blur-sm shadow-lg shadow-black/30 transition-all">
          {toast}
        </div>
      )}

      {/* Admin banner */}
      {isAdmin && (
        <div className="relative z-20 flex items-center gap-2 px-6 py-2
                        bg-violet-500/10 border-b border-violet-500/20">
          <span className="text-violet-400 text-xs font-bold uppercase tracking-widest">★ Admin</span>
          <span className="text-violet-400/60 text-xs">— all stories unlocked</span>
        </div>
      )}

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

      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-6 pb-24">

        {/* Page title */}
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <span className="text-3xl select-none">⚡</span>
          </div>
          <h1 className="font-display text-xl font-bold tracking-[0.1em] text-white uppercase mb-1">
            EPIC
          </h1>
          <p className="text-slate-500 text-xs tracking-widest uppercase">
            Stories · Quizzes · Cards
          </p>
        </div>

        {/* Era selector tabs */}
        <div ref={tabsRef} className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
          {ERAS.map((e, idx) => {
            const selectable = isEraSelectable(idx)
            const active = idx === activeEra
            return (
              <button
                key={e.name}
                onClick={() => handleEraClick(idx)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
                  ${active
                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30'
                    : selectable
                      ? 'bg-white/[0.05] text-slate-300 border border-white/10 hover:border-amber-500/30 hover:text-amber-400'
                      : 'bg-white/[0.03] text-slate-600 border border-white/[0.05] cursor-not-allowed'
                  }`}>
                {e.name}
              </button>
            )
          })}
        </div>

        {/* Era content */}
        <div>
          {/* Era header + progress */}
          <div className="mb-5">
            <h2 className="text-white text-2xl font-bold tracking-wide mb-2">{era.name}</h2>
            {eraComplete ? (
              <p className="text-amber-400 text-sm font-semibold">Era Complete ✓</p>
            ) : (
              <div>
                <p className="text-slate-400 text-xs mb-2">
                  {done} / {STORIES_TO_ADVANCE} stories to unlock next era
                </p>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500"
                    style={{ width: `${(done / STORIES_TO_ADVANCE) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Story list */}
          <div className="flex flex-col gap-3">
            {era.stories.map((story, storyIdx) => {
              const unlocked = isStoryUnlocked(activeEra, storyIdx)
              const isDone = !!completed[key(activeEra, storyIdx)]

              return (
                <div
                  key={storyIdx}
                  className={`relative rounded-2xl p-4 flex items-center gap-4
                    ${unlocked
                      ? 'bg-white/[0.03] border border-amber-500/30'
                      : 'bg-white/[0.02] border border-slate-800/60'
                    }
                    transition-all duration-200`}>

                  {/* Lock / Done indicator */}
                  <div
                    className={`flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl text-base
                      ${unlocked
                        ? isDone
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-amber-500/10 text-amber-500/70'
                        : 'bg-slate-800/60 text-slate-600'
                      }`}>
                    {!unlocked ? '🔒' : isDone ? '✓' : '▶'}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-tight
                      ${unlocked ? 'text-white' : 'text-slate-600'}`}>
                      {story.title}
                    </p>
                    {story.figure && (
                      <p className={`text-xs italic mt-0.5
                        ${unlocked ? 'text-slate-400' : 'text-slate-700'}`}>
                        {story.figure}
                      </p>
                    )}
                    <p className={`text-[10px] mt-1
                      ${unlocked ? 'text-slate-500' : 'text-slate-700'}`}>
                      {story.quizzes} {story.quizzes === 1 ? 'quiz' : 'quizzes'}
                    </p>
                  </div>

                  {/* Begin / Replay button */}
                  {unlocked && (
                    <button
                      onClick={() => handleBegin(activeEra, storyIdx)}
                      className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold tracking-wide
                                 shadow shadow-amber-500/25 transition-all duration-200
                                 ${isDone
                                   ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30'
                                   : 'text-slate-950 bg-amber-500 hover:bg-amber-400 active:bg-amber-600'
                                 }`}>
                      {isDone ? 'Replay' : 'Begin →'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Next Era button */}
          {eraComplete && activeEra < ERAS.length - 1 && (
            <div className="flex justify-center pt-6">
              <button
                onClick={() => setActiveEra(activeEra + 1)}
                className="px-8 py-3 rounded-xl font-bold text-sm tracking-wide text-slate-950
                           bg-amber-500 hover:bg-amber-400 active:bg-amber-600
                           shadow-lg shadow-amber-500/30 transition-all duration-200">
                Next Era: {ERAS[activeEra + 1].name} →
              </button>
            </div>
          )}

          {eraComplete && activeEra === ERAS.length - 1 && (
            <div className="flex flex-col items-center pt-6 gap-2">
              <span className="text-2xl">🏆</span>
              <p className="text-amber-400 font-bold text-sm tracking-wide">All Eras Complete!</p>
            </div>
          )}
        </div>
      </div>

      {/* Story viewer */}
      {modal && (() => {
        const story = ERAS[modal.eraIdx].stories[modal.storyIdx]
        const pKey = portraitKeyForFigure(story.figure)
        return (
          <StoryViewer
            eraName={ERAS[modal.eraIdx].name}
            storyTitle={story.title}
            figureName={story.figure}
            portraitKey={pKey}
            onComplete={(unlockKey) => { handleStoryComplete(modal.eraIdx, modal.storyIdx, unlockKey); setModal(null) }}
            onClose={() => setModal(null)}
          />
        )
      })()}
    </div>
  )
}
