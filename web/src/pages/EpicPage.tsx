import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import StoryViewer from '@/components/StoryViewer'
import { useUnlockedCards } from '@/hooks/useUnlockedCards'
import cardsData from '@/data/cards.json'
import storyConfigsData from '@/data/story_configs.json'
import { eraBackdropUrl, locationImageUrl, portraitUrl } from '@/data/images'
import PageLoader from '@/components/PageLoader'
import { useAssetPreload } from '@/hooks/useAssetPreload'
import EraIcon from '@/components/EraIcon'

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
  tagline: string
  quizzes: number
  locationImage?: string
  bonusCard?: string
}

interface Era {
  name: string
  stories: Story[]
}

const ERA_ORDER = ['Ancient', 'Classical', 'Medieval', 'Renaissance', 'Steam', 'Electricity', 'Information']

const ERAS: Era[] = ERA_ORDER.map(eraName => ({
  name: eraName,
  stories: (storyConfigsData as Story[]).filter(s => (s as unknown as { era: string }).era === eraName),
}))

const STORIES_TO_ADVANCE = 4

// Artwork an era's story list draws: each story's location card and portrait.
function eraAssets(eraIdx: number): string[] {
  const era = ERAS[eraIdx]
  const urls: string[] = []
  for (const story of era.stories) {
    urls.push(locationImageUrl(story.locationImage) ?? eraBackdropUrl(era.name))
    const pKey = portraitKeyForFigure(story.figure)
    if (pKey) urls.push(portraitUrl(pKey))
  }
  return [...new Set(urls)]
}

const FIRST_VISIT_ASSETS = [
  ...ERA_ORDER.map(eraBackdropUrl),
  ...eraAssets(0),
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function EpicPage() {
  return (
    <PageLoader assets={FIRST_VISIT_ASSETS} label="Opening the epic">
      <EpicContent />
    </PageLoader>
  )
}

function EpicContent() {
  const navigate = useNavigate()
  const { isGuest, exitGuestMode, isAdmin } = useAuth()
  const { unlock } = useUnlockedCards()
  const [activeEra, setActiveEra] = useState(0)
  const [completed, setCompleted] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState<string | null>(null)
  const [modal, setModal] = useState<{ eraIdx: number; storyIdx: number } | null>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  // Switching era fetches that era's artwork; show a slim bar rather than the
  // full loading screen so the tabs stay put.
  const { ready: eraReady, progress: eraProgress } = useAssetPreload(eraAssets(activeEra), { minMs: 0 })

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
    const story = ERAS[eraIdx].stories[storyIdx]
    if (unlockKey) {
      unlock(unlockKey)
      if (story.bonusCard) {
        const bonusKey = portraitKeyForFigure(story.bonusCard)
        if (bonusKey) unlock(bonusKey)
      }
      showToast(story.bonusCard ? '2 cards unlocked! Check your Collection.' : 'Card unlocked! Check your Collection.')
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
    <div className="relative min-h-screen bg-paper overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-accent/8 blur-[160px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full bg-line/40 blur-[160px]" />
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl
                        bg-accent/20 border border-accent/40 text-accent text-sm
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
                        bg-accent/10 border-b border-accent/20">
          <p className="text-accent/80 text-xs">
            Exploring as guest — sign in to earn real cards
          </p>
          <button
            onClick={() => { exitGuestMode(); navigate('/login') }}
            className="text-accent text-xs font-semibold hover:text-accent transition-colors ml-4 shrink-0">
            Sign In →
          </button>
        </div>
      )}

      <div className="relative z-10 max-w-2xl mx-auto px-4 pt-6 pb-24">

        {/* Page title */}
        <div className="flex flex-col items-center text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3"
            style={{ background: 'rgba(155,44,35,0.12)', border: '1px solid rgba(155,44,35,0.25)' }}>
            <span className="text-3xl select-none">⚡</span>
          </div>
          <h1 className="font-display text-xl font-bold tracking-[0.1em] text-ink uppercase mb-1">
            EPIC
          </h1>
          <p className="text-muted text-xs tracking-widest uppercase">
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
                title={e.name}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200
                  ${active
                    ? 'bg-accent text-accent-fg shadow-lg shadow-accent/30'
                    : selectable
                      ? 'bg-panel text-ink-2 border border-line hover:border-accent/30 hover:text-accent'
                      : 'bg-panel text-muted/80 border border-line cursor-not-allowed'
                  }`}>
                <EraIcon era={e.name} className="w-5 h-5" />
              </button>
            )
          })}
        </div>

        {/* Era artwork loading bar */}
        {!eraReady && (
          <div className="h-0.5 -mt-4 mb-4 rounded-full bg-line/40 overflow-hidden">
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${eraProgress * 100}%` }} />
          </div>
        )}

        {/* Era content */}
        <div className={eraReady ? 'animate-fade-in' : 'opacity-0'}>
          {/* Era header + progress */}
          <div className="mb-5">
            <h2 className="mb-2 flex items-center gap-2 text-ink" title={era.name}><EraIcon era={era.name} className="w-8 h-8 text-accent" /></h2>
            {eraComplete ? (
              <p className="text-accent text-sm font-semibold">Era Complete ✓</p>
            ) : (
              <div>
                <p className="text-muted text-xs mb-2">
                  {done} / {STORIES_TO_ADVANCE} stories to unlock next era
                </p>
                <div className="h-1.5 rounded-full bg-panel overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500"
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

              const pKey = portraitKeyForFigure(story.figure)
              const cardImg = story.locationImage
                ? locationImageUrl(story.locationImage)
                : eraBackdropUrl(era.name)
              return (
                <div
                  key={storyIdx}
                  className={`relative rounded-2xl overflow-hidden flex items-center gap-4
                    ${unlocked
                      ? 'border border-accent/30'
                      : 'border border-line'
                    }
                    transition-all duration-200`}>

                  {/* Story-specific location background */}
                  <div className="absolute inset-0 bg-paper-2 pointer-events-none" />
                  {cardImg && (
                    <div className="absolute inset-0 pointer-events-none">
                      <img
                        src={cardImg}
                        alt=""
                        className="w-full h-full object-cover"
                        style={{ opacity: unlocked ? 0.28 : 0.1 }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-paper-2/80 via-paper-2/40 to-paper-2/80" />
                    </div>
                  )}

                  {/* Portrait thumbnail */}
                  <div className="relative flex-shrink-0 w-16 h-16 overflow-hidden rounded-l-2xl">
                    {pKey ? (
                      <img
                        src={portraitUrl(pKey)}
                        alt=""
                        className={`w-full h-full object-cover object-top ${unlocked ? 'opacity-80' : 'opacity-30 grayscale'}`}
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center text-2xl
                        ${unlocked ? 'bg-accent/10 text-accent/50' : 'bg-panel-2 text-muted/80'}`}>
                        {!unlocked ? '🔒' : isDone ? '✓' : '▶'}
                      </div>
                    )}
                    {pKey && !unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center text-lg bg-ink/50">🔒</div>
                    )}
                    {pKey && unlocked && isDone && (
                      <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center text-[9px] font-bold text-accent-fg">✓</div>
                    )}
                  </div>

                  {/* Text */}
                  <div className="relative flex-1 min-w-0 py-3">
                    <p className={`text-sm font-semibold leading-tight
                      ${unlocked ? 'text-ink' : 'text-muted/80'}`}>
                      {story.title}
                    </p>
                    {story.figure && (
                      <p className={`text-xs italic mt-0.5
                        ${unlocked ? 'text-muted' : 'text-muted/60'}`}>
                        {story.figure}
                      </p>
                    )}
                    <p className={`text-[10px] mt-1
                      ${unlocked ? 'text-muted' : 'text-muted/60'}`}>
                      {story.quizzes} {story.quizzes === 1 ? 'quiz' : 'quizzes'}
                    </p>
                  </div>

                  {/* Begin / Replay button */}
                  {unlocked && (
                    <button
                      onClick={() => handleBegin(activeEra, storyIdx)}
                      className={`relative flex-shrink-0 mr-4 px-4 py-2 rounded-xl text-xs font-bold tracking-wide
                                 shadow shadow-accent/25 transition-all duration-200
                                 ${isDone
                                   ? 'text-accent bg-accent/10 hover:bg-accent/20 border border-accent/30'
                                   : 'text-accent-fg bg-accent hover:bg-accent-hover active:bg-accent-hover'
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
                className="px-8 py-3 rounded-xl font-bold text-sm tracking-wide text-ink
                           bg-accent hover:bg-accent-hover active:bg-accent-hover
                           shadow-lg shadow-accent/30 transition-all duration-200">
                <span className="inline-flex items-center gap-2">Next Era <EraIcon era={ERAS[activeEra + 1].name} className="w-4 h-4" /> →</span>
              </button>
            </div>
          )}

          {eraComplete && activeEra === ERAS.length - 1 && (
            <div className="flex flex-col items-center pt-6 gap-2">
              <span className="text-2xl">🏆</span>
              <p className="text-accent font-bold text-sm tracking-wide">All Eras Complete!</p>
            </div>
          )}
        </div>
      </div>

      {/* Story viewer */}
      {modal && (() => {
        const story = ERAS[modal.eraIdx].stories[modal.storyIdx]
        const pKey = portraitKeyForFigure(story.figure)
        const bonusKey = story.bonusCard ? portraitKeyForFigure(story.bonusCard) : null
        const bonusCard = story.bonusCard && bonusKey
          ? { figureName: story.bonusCard, portraitKey: bonusKey }
          : null
        return (
          <StoryViewer
            eraName={ERAS[modal.eraIdx].name}
            storyTitle={story.title}
            figureName={story.figure}
            portraitKey={pKey}
            bonusCard={bonusCard}
            locationImage={locationImageUrl(story.locationImage) ?? undefined}
            onComplete={(unlockKey) => { handleStoryComplete(modal.eraIdx, modal.storyIdx, unlockKey); setModal(null) }}
            onClose={() => setModal(null)}
          />
        )
      })()}
    </div>
  )
}
