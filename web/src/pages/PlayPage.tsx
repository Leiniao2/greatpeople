import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StoryViewer from '@/components/StoryViewer'
import ChallengeRenderer from '@/games/ChallengeRenderer'
import ResultPanel from '@/games/ResultPanel'
import { gameLabel } from '@/games/registry'
import type { Challenge } from '@/games/types'
import storyConfigs from '@/data/story_configs.json'
import storyChallenges from '@/data/story_challenges.json'
import { locationImageUrl } from '@/data/images'
import { useStoryProgress } from '@/hooks/useStoryProgress'
import { useUnlockedCards } from '@/hooks/useUnlockedCards'
import { adoptTokenFromFragment, isEmbedded, postToNative } from '@/bridge/native'
import { hashString } from '@/components/minigames/_shared'

// Full-screen play routes with no tab bar, used by the native apps' WebViews
// and usable in a browser too:
//   /play/story/:slug        — a whole story
//   /play/challenge/:id      — one challenge (Arcade on native)
// `?embed=1` marks a native host; `#token=…` carries its session.

interface Config {
  era: string; title: string; slug: string; figure: string | null; portraitKey: string | null
  locationImage?: string; bonusCard?: { figureName: string; portraitKey: string | null }; lives: number
}

const CONFIGS = storyConfigs as Config[]
const CHALLENGES = (storyChallenges as { era: string; story: string; slug: string; challenges: Challenge[] }[])
// Every challenge in play order, for "next challenge" on the stand-alone route.
const ALL_IDS = CHALLENGES.flatMap(e => e.challenges.map(c => c.id!))

// The token must be stored before any API call or auth check renders.
adoptTokenFromFragment()

export function PlayStoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const cfg = CONFIGS.find(c => c.slug === slug)
  const { markComplete, markStage, stageOf, isComplete } = useStoryProgress()
  const { unlock } = useUnlockedCards()
  const embedded = isEmbedded()

  useEffect(() => { if (embedded) postToNative({ type: 'ready' }) }, [embedded])

  if (!cfg) return <Missing what="story" onBack={() => leave(navigate, embedded)} />

  return (
    <StoryViewer
      eraName={cfg.era}
      storyTitle={cfg.title}
      figureName={cfg.figure}
      portraitKey={cfg.portraitKey}
      bonusCard={cfg.bonusCard ?? null}
      locationImage={locationImageUrl(cfg.locationImage) ?? undefined}
      lives={cfg.lives}
      startStage={isComplete(cfg.slug) ? 0 : stageOf(cfg.slug)}
      onStageReached={stage => markStage(cfg.slug, stage)}
      onComplete={unlockKey => {
        markComplete(cfg.slug)
        if (unlockKey) unlock(unlockKey)
        if (cfg.bonusCard?.portraitKey && unlockKey) unlock(cfg.bonusCard.portraitKey)
        postToNative({ type: 'storyComplete', slug: cfg.slug, unlockKey })
        leave(navigate, embedded)
      }}
      onClose={() => leave(navigate, embedded)}
    />
  )
}

export function PlayChallengePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const embedded = isEmbedded()
  const found = useMemo(() => {
    for (const entry of CHALLENGES) {
      const ch = entry.challenges.find(c => c.id === id)
      if (ch) return { entry, ch }
    }
    return null
  }, [id])
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const seed = useMemo(() => hashString(`${id}:${attempt}`), [id, attempt])

  useEffect(() => { if (embedded) postToNative({ type: 'ready' }) }, [embedded])

  if (!found) return <Missing what="challenge" onBack={() => leave(navigate, embedded)} />
  const { entry, ch } = found
  const game = ch.type === 'minigame' ? ch.game : ch.type
  const nextId = ALL_IDS[ALL_IDS.indexOf(ch.id!) + 1]
  const goNext = nextId ? () => { setOutcome(null); setAttempt(0); navigate(`/play/challenge/${nextId}${window.location.search}`) } : undefined

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-paper">
      <div className="flex items-center gap-3 px-4 pt-safe pb-3 pt-4 border-b border-line shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">{gameLabel(game)}</span>
        <p className="flex-1 text-muted text-[10px] truncate">{entry.story}</p>
        <button onClick={() => leave(navigate, embedded)} className="w-8 h-8 flex items-center justify-center rounded-xl bg-panel text-muted hover:text-ink text-lg">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-paper-2 rounded-xl p-4">
          <ChallengeRenderer key={attempt} challenge={ch} seed={seed} onWin={() => setOutcome('won')} onLose={() => setOutcome('lost')} />
        </div>
      </div>
      {outcome && (
        <ResultPanel
          outcome={outcome}
          fact={ch.fact}
          onReplay={() => { setOutcome(null); setAttempt(a => a + 1) }}
          onNext={goNext}
          onBack={() => { if (outcome === 'won') postToNative({ type: 'challengeComplete', id: ch.id! }); leave(navigate, embedded) }}
          backLabel={embedded ? 'Back to Arcade' : 'Back'}
        />
      )}
    </div>
  )
}

function leave(navigate: ReturnType<typeof useNavigate>, embedded: boolean) {
  if (embedded) postToNative({ type: 'close' })
  else navigate(-1)
}

function Missing({ what, onBack }: { what: string; onBack: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-paper">
      <div className="text-center">
        <p className="text-muted text-sm mb-4">This {what} doesn't exist.</p>
        <button onClick={onBack} className="px-6 py-2 rounded-xl bg-accent text-accent-fg font-bold text-sm">Back</button>
      </div>
    </div>
  )
}
