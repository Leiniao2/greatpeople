import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import challengesData from '@/data/story_challenges.json'
import scriptsData from '@/data/story_scripts.json'
import { useAuth } from '@/hooks/useAuth'
import { eraBackdropUrl, speakerImageUrl } from '@/data/images'
import { useAssetPreload } from '@/hooks/useAssetPreload'
import LoadingScreen from '@/components/LoadingScreen'
import ChallengeRenderer from '@/games/ChallengeRenderer'
import type { Challenge } from '@/games/types'
import { hashString } from '@/components/minigames/_shared'
import EraIcon from '@/components/EraIcon'

// ── Types ─────────────────────────────────────────────────────────────────────

interface NarrationScene { type: 'narration'; text: string }
interface DialogScene { type: 'dialog'; speaker: string; portraitKey?: string; text: string }
interface ChallengeScene { type: 'challenge'; index: number }
interface StageScene { type: 'stage'; key: string; label: string; difficulty: number; intro?: string }
type Scene = NarrationScene | DialogScene | ChallengeScene | StageScene

interface StoryScript {
  era: string; story: string; portraitKey: string | null; scenes: Scene[]
}
interface StoryChallengeData { era: string; story: string; challenges: Challenge[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function getScript(era: string, story: string): StoryScript | null {
  return (scriptsData as StoryScript[]).find(s => s.era === era && s.story === story) ?? null
}

function getChallenges(era: string, story: string): Challenge[] {
  const entry = (challengesData as StoryChallengeData[]).find(d => d.era === era && d.story === story)
  return entry?.challenges ?? []
}

function portraitUrl(key: string | null | undefined) {
  return key ? speakerImageUrl(key) : null
}

// ── Typewriter ─────────────────────────────────────────────────────────────────

function useTypewriter(text: string, speed = 22) {
  const [displayed, setDisplayed] = useState('')
  const [done, setDone] = useState(false)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setDisplayed('')
    setDone(false)
    let i = 0
    ref.current = setInterval(() => {
      i++
      setDisplayed(text.slice(0, i))
      if (i >= text.length) {
        if (ref.current) clearInterval(ref.current)
        setDone(true)
      }
    }, speed)
    return () => { if (ref.current) clearInterval(ref.current) }
  }, [text, speed])

  const skip = () => {
    if (ref.current) clearInterval(ref.current)
    setDisplayed(text)
    setDone(true)
  }

  return { displayed, done, skip }
}

// ── Challenge wrapper with fail state ─────────────────────────────────────────

function ChallengeWrapper({ challenge, attempt, livesLeft, onPass, onFail }: {
  challenge: Challenge
  /** Attempts already made at this challenge; a new one reshuffles and shows the hint. */
  attempt: number
  livesLeft: number
  onPass: () => void
  onFail: () => void
}) {
  const [result, setResult] = useState<boolean | null>(null)
  const seed = useMemo(() => hashString(`${challenge.id ?? challenge.fact}:${attempt}`), [challenge, attempt])

  const handleWin = () => setResult(true)
  const handleLose = () => { setResult(false); setTimeout(onFail, 1200) }

  return (
    <div className="flex flex-col gap-3">
      {attempt > 0 && challenge.hint && (
        <p className="text-amber-800 text-xs leading-relaxed bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
          <span className="font-bold mr-1">Hint:</span>{challenge.hint}
        </p>
      )}

      <ChallengeRenderer challenge={challenge} seed={seed} onWin={handleWin} onLose={handleLose} />

      {result === true && (
        <div className="p-3 rounded-xl border text-xs leading-relaxed bg-emerald-500/10 border-emerald-500/30 text-emerald-800">
          <span className="font-bold mr-1">✓ Correct!</span>
          {challenge.fact}
        </div>
      )}
      {result === false && (
        <div className="p-3 rounded-xl border text-xs leading-relaxed bg-red-500/10 border-red-500/30 text-red-800">
          <span className="font-bold">✗ Not this time.</span>
          {livesLeft > 1 ? ' Try again…' : ' That was your last life.'}
        </div>
      )}

      {result && (
        <button onClick={onPass}
          className="py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-fg font-bold text-sm transition-all">
          Continue →
        </button>
      )}
    </div>
  )
}

// ── Story complete screen ──────────────────────────────────────────────────────

function StoryCompleteScreen({ storyTitle, challengeCount, hasCard, onContinue }: {
  storyTitle: string
  challengeCount: number
  hasCard: boolean
  onContinue: () => void
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 50) }, [])
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink/70 backdrop-blur-md">
      <div className={`flex flex-col items-center gap-6 text-center px-8 transition-all duration-700
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="text-5xl select-none">🏆</div>
        <div>
          <p className="text-accent/70 text-xs uppercase tracking-widest font-semibold mb-2">Story Complete!</p>
          <h2 className="text-ink font-bold text-xl leading-tight">{storyTitle}</h2>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-panel border border-line">
          <span className="text-emerald-400 font-bold">{challengeCount}</span>
          <span className="text-muted text-sm">challenge{challengeCount !== 1 ? 's' : ''} conquered</span>
        </div>
        {hasCard && (
          <p className="text-accent/80 text-sm">A new card has been added to your collection!</p>
        )}
        <button onClick={onContinue}
          className="px-8 py-3 rounded-xl bg-accent hover:bg-accent-hover text-accent-fg font-bold text-sm tracking-wide transition-all shadow-lg shadow-accent/30">
          {hasCard ? 'Collect Card →' : 'Back to Stories →'}
        </button>
      </div>
    </div>
  )
}

// ── Card unlock screen ─────────────────────────────────────────────────────────

function CardUnlock({ portraitKey, figureName, era, onCollect }: {
  portraitKey: string | null; figureName: string; era: string; onCollect: () => void
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 50) }, [])
  const url = portraitUrl(portraitKey)

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink/70 backdrop-blur-md">
      <div className={`flex flex-col items-center gap-6 transition-all duration-700
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <p className="text-accent/70 text-xs uppercase tracking-widest font-semibold">Card Unlocked!</p>
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-accent/20 blur-2xl scale-110 animate-pulse" />
          <div className="relative w-40 h-52 rounded-2xl overflow-hidden border-2 border-accent/60 shadow-2xl shadow-accent/30">
            {url ? (
              <img src={url} alt={figureName} className="w-full h-full object-cover object-top" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-paper-2 to-line flex items-center justify-center">
                <span className="text-accent text-5xl">★</span>
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <p className="text-paper font-bold text-sm">{figureName}</p>
              <EraIcon era={era} className="w-3.5 h-3.5 text-accent/80" />
            </div>
          </div>
        </div>
        <p className="text-muted text-sm text-center max-w-xs">
          {figureName} has been added to your collection.
        </p>
        <button onClick={onCollect}
          className="px-8 py-3 rounded-xl bg-accent hover:bg-accent-hover text-accent-fg font-bold text-sm tracking-wide transition-all shadow-lg shadow-accent/30">
          Add to Collection →
        </button>
      </div>
    </div>
  )
}

// ── Scene renderers ────────────────────────────────────────────────────────────

function NarrationScene({ scene, onNext }: { scene: NarrationScene; onNext: () => void }) {
  const { displayed, done, skip } = useTypewriter(scene.text)
  return (
    <div className="py-4 flex flex-col gap-4">
      <div className="bg-panel/90 rounded-2xl p-5 border border-line backdrop-blur-sm cursor-pointer"
        onClick={!done ? skip : undefined}>
        <p className="text-ink-2 text-sm leading-relaxed min-h-[4rem]">
          {displayed}
          {!done && <span className="animate-pulse text-accent">|</span>}
        </p>
        {!done && (
          <p className="text-muted text-[10px] mt-2 text-right">Tap to skip</p>
        )}
      </div>
      {done && (
        <button onClick={onNext}
          className="self-end px-6 py-2.5 rounded-xl bg-accent/90 hover:bg-accent-hover text-accent-fg font-bold text-sm transition-all">
          Continue →
        </button>
      )}
    </div>
  )
}

function DialogScene({ scene, onNext }: { scene: DialogScene; onNext: () => void }) {
  const { displayed, done, skip } = useTypewriter(scene.text)
  const url = portraitUrl(scene.portraitKey)
  return (
    <div className="py-4 flex flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 border-accent/60 shadow-lg shadow-accent/20">
          {url ? (
            <img src={url} alt={scene.speaker} className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full bg-accent/60 flex items-center justify-center">
              <span className="text-accent text-lg font-bold">{scene.speaker[0]}</span>
            </div>
          )}
        </div>
        <div className="flex-1 bg-panel/90 rounded-2xl rounded-bl-sm p-4 border border-line backdrop-blur-sm cursor-pointer"
          onClick={!done ? skip : undefined}>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest mb-1">{scene.speaker}</p>
          <p className="text-ink-2 text-sm leading-relaxed">
            {displayed}
            {!done && <span className="animate-pulse text-accent">|</span>}
          </p>
          {!done && (
            <p className="text-muted text-[10px] mt-2 text-right">Tap to skip</p>
          )}
        </div>
      </div>
      {done && (
        <button onClick={onNext}
          className="self-end px-6 py-2.5 rounded-xl bg-accent/90 hover:bg-accent-hover text-accent-fg font-bold text-sm transition-all">
          Continue →
        </button>
      )}
    </div>
  )
}

// ── Stage intro ────────────────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV']

function StageIntro({ scene, onNext }: { scene: StageScene; onNext: () => void }) {
  return (
    <div className="py-6 flex flex-col items-center gap-5 text-center animate-fade-in">
      <p className="text-accent text-[10px] font-bold uppercase tracking-[0.3em]">Stage {ROMAN[scene.difficulty - 1] ?? scene.difficulty}</p>
      <h2 className="font-display text-3xl font-bold text-ink tracking-wide">{scene.label}</h2>
      <div className="flex gap-1.5" aria-label={`difficulty ${scene.difficulty} of 4`}>
        {[1, 2, 3, 4].map(d => (
          <span key={d} className={`w-2 h-2 rounded-full ${d <= scene.difficulty ? 'bg-accent' : 'bg-line'}`} />
        ))}
      </div>
      {scene.intro && (
        <p className="text-ink-2 text-sm leading-relaxed max-w-sm bg-panel/90 rounded-2xl p-5 border border-line">{scene.intro}</p>
      )}
      <button onClick={onNext}
        className="px-8 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-accent-fg font-bold text-sm transition-all">
        Begin →
      </button>
    </div>
  )
}

// ── Lives and stage progress ──────────────────────────────────────────────────

function LivesBar({ left, total }: { left: number; total: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${left} of ${total} lives`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`text-sm leading-none transition-colors ${i < left ? 'text-accent' : 'text-line'}`}>♥</span>
      ))}
    </div>
  )
}

function StageProgress({ stageIdx, stageCount, label }: { stageIdx: number; stageCount: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {Array.from({ length: stageCount }, (_, i) => (
          <span key={i}
            className={`h-1 w-5 rounded-full ${i < stageIdx ? 'bg-accent' : i === stageIdx ? 'bg-accent/60 animate-pulse' : 'bg-line'}`} />
        ))}
      </div>
      <span className="text-muted text-[10px] uppercase tracking-widest">{label}</span>
    </div>
  )
}

function LifeLostOverlay({ left, total }: { left: number; total: number }) {
  return (
    <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-red-900/40 backdrop-blur-[2px] animate-fade-in pointer-events-none">
      <p className="text-paper font-bold text-2xl drop-shadow mb-3">Life lost</p>
      <div className="scale-150"><LivesBar left={left} total={total} /></div>
    </div>
  )
}

function OutOfLivesOverlay({ stageLabel, onRetry, onQuit }: { stageLabel: string; onRetry: () => void; onQuit: () => void }) {
  return (
    <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-ink/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-paper-2 border border-line rounded-2xl p-8 flex flex-col items-center gap-4 max-w-xs w-full mx-4 text-center">
        <span className="text-4xl">💔</span>
        <p className="text-ink font-bold text-xl">Out of lives</p>
        <p className="text-ink-2 text-sm">Retry the {stageLabel} stage with full lives, or leave the story for now.</p>
        <button onClick={onRetry}
          className="w-full py-2.5 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover transition-colors">
          Retry stage
        </button>
        <button onClick={onQuit}
          className="w-full py-2 rounded-xl bg-line text-ink-2 text-sm hover:bg-line-2 transition-colors">
          Quit
        </button>
      </div>
    </div>
  )
}

// ── Main StoryViewer ──────────────────────────────────────────────────────────

interface StoryViewerProps {
  eraName: string
  storyTitle: string
  figureName: string | null
  portraitKey: string | null
  bonusCard?: { figureName: string; portraitKey: string | null } | null
  locationImage?: string
  /** Lives per stage; a lost life retries the challenge, none left retries the stage. */
  lives?: number
  onComplete: (unlockKey: string | null) => void
  onClose: () => void
}

export default function StoryViewer({ eraName, storyTitle, figureName, portraitKey, bonusCard, locationImage, lives = 3, onComplete, onClose }: StoryViewerProps) {
  const { isAdmin } = useAuth()
  const script = useMemo(() => getScript(eraName, storyTitle), [eraName, storyTitle])
  const challenges = useMemo(() => getChallenges(eraName, storyTitle), [eraName, storyTitle])
  const scenes = script?.scenes ?? []
  const bgPortrait = script?.portraitKey ?? portraitKey
  const bgUrl = portraitUrl(bgPortrait)
  const locationImg = locationImage ?? eraBackdropUrl(eraName)

  // Decode the backdrop and every speaker's portrait before the first scene,
  // so dialog avatars don't pop in mid-story.
  const storyAssets = useMemo(() => {
    const urls = new Set<string>()
    if (bgUrl) urls.add(bgUrl)
    if (locationImg) urls.add(locationImg)
    for (const s of scenes) {
      if (s.type === 'dialog' && s.portraitKey) urls.add(speakerImageUrl(s.portraitKey))
    }
    return [...urls]
  }, [bgUrl, locationImg, scenes])
  const { ready: assetsReady, progress: assetsProgress } = useAssetPreload(storyAssets)

  const [sceneIdx, setSceneIdx] = useState(0)
  const [livesLeft, setLivesLeft] = useState(lives)
  const [lifeLost, setLifeLost] = useState(false)
  const [failing, setFailing] = useState(false)
  const [storyComplete, setStoryComplete] = useState(false)
  const [cardUnlock, setCardUnlock] = useState(false)
  const [bonusUnlock, setBonusUnlock] = useState(false)
  // Attempts made at each challenge scene; drives the reshuffle seed and the hint.
  const [attempts, setAttempts] = useState<Record<number, number>>({})

  const totalChallenges = scenes.filter(s => s.type === 'challenge').length
  const currentScene = scenes[sceneIdx]

  // Stage bookkeeping: stages are marker scenes, so the current stage is the
  // last marker at or before the current scene.
  const stageStarts = useMemo(() => scenes.map((s, i) => (s.type === 'stage' ? i : -1)).filter(i => i >= 0), [scenes])
  const stageIdx = Math.max(0, stageStarts.filter(i => i <= sceneIdx).length - 1)
  const stageStart = stageStarts[stageIdx] ?? 0
  const stageScene = scenes[stageStart]
  const stageLabel = stageScene?.type === 'stage' ? stageScene.label : ''
  const passedCount = scenes.slice(0, sceneIdx).filter(s => s.type === 'challenge').length

  const advanceScene = useCallback(() => {
    setSceneIdx(prev => {
      const next = prev + 1
      if (next >= scenes.length) {
        setTimeout(() => setStoryComplete(true), 0)
        return prev
      }
      return next
    })
  }, [scenes.length])

  // Auto-advance if a challenge scene points to a missing challenge entry
  useEffect(() => {
    if (currentScene?.type === 'challenge') {
      const challenge = challenges[currentScene.index]
      if (!challenge) advanceScene()
    }
  }, [sceneIdx, currentScene, challenges, advanceScene])

  const handleChallengePass = () => advanceScene()

  // A lost life retries the same challenge with a fresh seed; the last one
  // sends the player back to the start of the stage.
  const handleChallengeFail = () => {
    if (livesLeft > 1) {
      setLivesLeft(l => l - 1)
      setLifeLost(true)
      setTimeout(() => {
        setLifeLost(false)
        setAttempts(prev => ({ ...prev, [sceneIdx]: (prev[sceneIdx] ?? 0) + 1 }))
      }, 1200)
    } else {
      setLivesLeft(0)
      setFailing(true)
    }
  }

  const handleRetryStage = () => {
    setFailing(false)
    setLivesLeft(lives)
    setAttempts(prev => ({ ...prev, [sceneIdx]: (prev[sceneIdx] ?? 0) + 1 }))
    setSceneIdx(stageStart)
  }

  const handleStoryCompleteAck = () => {
    setStoryComplete(false)
    if (figureName && portraitKey) {
      setCardUnlock(true)
    } else {
      onComplete(null)
    }
  }

  const handlePrimaryCollect = () => {
    setCardUnlock(false)
    if (bonusCard?.portraitKey) {
      setBonusUnlock(true)
    } else {
      onComplete(portraitKey)
    }
  }

  const handleBonusCollect = () => {
    setBonusUnlock(false)
    onComplete(portraitKey)
  }

  // No script fallback — show simple message
  if (scenes.length === 0) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 backdrop-blur-sm">
        <div className="text-center">
          <p className="text-muted text-sm mb-4">No story content found.</p>
          <button onClick={onClose} className="px-6 py-2 rounded-xl bg-accent text-accent-fg font-bold text-sm">Close</button>
        </div>
      </div>
    )
  }

  const progressPct = scenes.length > 0 ? (sceneIdx / scenes.length) * 100 : 0

  if (!assetsReady) return <LoadingScreen progress={assetsProgress} label="Preparing story" />

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden animate-fade-in">
      {/* ── Background stack ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-paper" />

      {/* Location image — story-specific city, clearly visible */}
      {locationImg && (
        <div className="absolute inset-0">
          <img
            src={locationImg}
            alt=""
            className="w-full h-full object-cover object-center"
            style={{ opacity: 0.38 }}
          />
          {/* Top fade so header stays readable; bottom fade for text area */}
          <div className="absolute inset-0 bg-gradient-to-b from-paper/70 via-paper/30 to-paper/85" />
        </div>
      )}

      {/* Character portrait — blurred, right-anchored, subtle presence */}
      {bgUrl && (
        <div className="absolute inset-0 flex justify-end overflow-hidden pointer-events-none">
          <img
            src={bgUrl}
            alt=""
            className="h-full w-1/2 object-cover object-top blur-md"
            style={{ opacity: 0.18, maskImage: 'linear-gradient(to left, black 0%, transparent 100%)' }}
          />
        </div>
      )}

      {!locationImg && (
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-accent/8 blur-[120px] pointer-events-none" />
      )}

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 border-b border-line">
        <div>
          <EraIcon era={eraName} className="w-4 h-4 text-accent/70 mb-0.5" />
          <p className="text-ink font-bold text-sm leading-tight">{storyTitle}</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-full bg-panel border border-line text-muted hover:text-ink hover:bg-panel-2 flex items-center justify-center text-sm transition-all">
          ✕
        </button>
      </div>

      {/* Stage + lives */}
      <div className="relative z-10 flex items-center justify-between px-4 py-2 bg-paper/60">
        <StageProgress stageIdx={stageIdx} stageCount={Math.max(1, stageStarts.length)} label={stageLabel} />
        <LivesBar left={livesLeft} total={lives} />
      </div>

      {/* Progress bar */}
      <div className="relative z-10 h-0.5 bg-panel">
        <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Scene content */}
      <div className="relative z-10 flex-1 flex flex-col px-4 py-4 pb-8 overflow-y-auto">
        {currentScene?.type === 'narration' && (
          <NarrationScene key={sceneIdx} scene={currentScene} onNext={advanceScene} />
        )}
        {currentScene?.type === 'dialog' && (
          <DialogScene key={sceneIdx} scene={currentScene} onNext={advanceScene} />
        )}
        {currentScene?.type === 'stage' && (
          <StageIntro key={sceneIdx} scene={currentScene} onNext={advanceScene} />
        )}
        {currentScene?.type === 'challenge' && (() => {
          const challengeIdx = currentScene.index
          const challenge = challenges[challengeIdx]
          if (!challenge) {
            // auto-advance is handled by the useEffect above; render nothing
            return null
          }
          return (
            <div className="flex flex-col gap-4">
              <div className="bg-accent/10 border border-accent/20 rounded-xl px-4 py-2">
                <p className="text-accent text-[10px] font-bold uppercase tracking-widest">
                  Challenge {passedCount + 1} of {totalChallenges}
                </p>
              </div>
              <ChallengeWrapper
                key={`${sceneIdx}-${attempts[sceneIdx] ?? 0}`}
                challenge={challenge}
                attempt={attempts[sceneIdx] ?? 0}
                livesLeft={livesLeft}
                onPass={handleChallengePass}
                onFail={handleChallengeFail}
              />
            </div>
          )
        })()}
      </div>

      {/* Life lost / out of lives */}
      {lifeLost && <LifeLostOverlay left={livesLeft} total={lives} />}
      {failing && <OutOfLivesOverlay stageLabel={stageLabel} onRetry={handleRetryStage} onQuit={onClose} />}

      {/* Story complete screen */}
      {storyComplete && (
        <StoryCompleteScreen
          storyTitle={storyTitle}
          challengeCount={totalChallenges}
          hasCard={!!(figureName && portraitKey)}
          onContinue={handleStoryCompleteAck}
        />
      )}

      {/* Card unlock — primary figure */}
      {cardUnlock && (
        <CardUnlock
          portraitKey={portraitKey}
          figureName={figureName ?? storyTitle}
          era={eraName}
          onCollect={handlePrimaryCollect}
        />
      )}

      {/* Card unlock — bonus figure */}
      {bonusUnlock && bonusCard && (
        <CardUnlock
          portraitKey={bonusCard.portraitKey}
          figureName={bonusCard.figureName}
          era={eraName}
          onCollect={handleBonusCollect}
        />
      )}

      {/* Admin dev panel */}
      {isAdmin && (
        <div className="fixed bottom-4 right-4 z-[70] bg-violet-950/95 border border-violet-700/50 rounded-xl p-3 text-xs max-w-[220px] backdrop-blur-sm shadow-xl">
          <p className="text-violet-400 font-bold uppercase tracking-wider text-[10px] mb-2">★ Dev Panel</p>
          <p className="text-muted mb-1">Scene {sceneIdx + 1} / {scenes.length}</p>
          {currentScene?.type === 'challenge' && (() => {
            const ch = challenges[currentScene.index]
            if (!ch) return null
            let answer = ''
            if (ch.type === 'quiz') answer = `Option ${ch.answer}: ${ch.options[ch.answer]}`
            else if (ch.type === 'truefalse') answer = ch.correct ? 'True' : 'False'
            else if (ch.type === 'sort') answer = ch.items.join(' → ')
            else answer = 'Complete the minigame'
            return (
              <div className="mb-2">
                <p className="text-muted text-[10px]">Answer:</p>
                <p className="text-emerald-400 text-[10px] leading-tight break-words">{answer}</p>
              </div>
            )
          })()}
          <div className="flex flex-col gap-1">
            <button onClick={advanceScene}
              className="py-1 px-2 rounded-lg bg-violet-800/60 text-violet-300 hover:bg-violet-700/60 transition-all text-[10px] text-left">
              Skip scene →
            </button>
            <button onClick={() => setStoryComplete(true)}
              className="py-1 px-2 rounded-lg bg-violet-800/60 text-violet-300 hover:bg-violet-700/60 transition-all text-[10px] text-left">
              Complete story ✓
            </button>
            {currentScene?.type === 'challenge' && (
              <button onClick={handleChallengeFail}
                className="py-1 px-2 rounded-lg bg-violet-800/60 text-violet-300 hover:bg-violet-700/60 transition-all text-[10px] text-left">
                Lose a life ♥
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
