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

function ChallengeWrapper({ challenge, attempt, onPass, onFail }: {
  challenge: Challenge
  attempt: number
  onPass: () => void
  onFail: () => void
}) {
  const [result, setResult] = useState<boolean | null>(null)
  // A new attempt gets a new seed so boards and option order reshuffle.
  const seed = useMemo(() => hashString(`${challenge.id ?? challenge.fact}:${attempt}`), [challenge, attempt])

  const handleWin = () => setResult(true)
  const handleLose = () => { setResult(false); setTimeout(onFail, 1800) }

  return (
    <div className="flex flex-col gap-3">
      <ChallengeRenderer challenge={challenge} seed={seed} onWin={handleWin} onLose={handleLose} />

      {result !== null && (
        <div className={`p-3 rounded-xl border text-xs leading-relaxed
          ${result ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800' : 'bg-red-500/10 border-red-500/30 text-red-800'}`}>
          <span className="font-bold mr-1">{result ? '✓ Correct!' : '✗ Wrong — restarting…'}</span>
          {challenge.fact}
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

// ── Fail overlay ───────────────────────────────────────────────────────────────

function FailOverlay({ onReset }: { onReset: () => void }) {
  const [count, setCount] = useState(3)
  useEffect(() => {
    const t = setInterval(() => setCount(c => { if (c <= 1) { clearInterval(t); onReset(); return 0 } return c - 1 }), 1000)
    return () => clearInterval(t)
  }, [onReset])
  return (
    <div className="fixed inset-0 z-[55] flex flex-col items-center justify-center bg-red-950/80 backdrop-blur-sm">
      <p className="text-red-300 font-bold text-2xl mb-2">Wrong Answer!</p>
      <p className="text-red-400/70 text-sm mb-6">Restarting the story in…</p>
      <div className="w-16 h-16 rounded-full border-4 border-red-400/60 flex items-center justify-center">
        <span className="text-red-200 font-bold text-3xl">{count}</span>
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
  onComplete: (unlockKey: string | null) => void
  onClose: () => void
}

export default function StoryViewer({ eraName, storyTitle, figureName, portraitKey, bonusCard, locationImage, onComplete, onClose }: StoryViewerProps) {
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
  const [failing, setFailing] = useState(false)
  const [storyComplete, setStoryComplete] = useState(false)
  const [cardUnlock, setCardUnlock] = useState(false)
  const [bonusUnlock, setBonusUnlock] = useState(false)
  const [challengeKey, setChallengeKey] = useState(0)

  const totalChallenges = scenes.filter(s => s.type === 'challenge').length
  const [passedChallenges, setPassedChallenges] = useState<Set<number>>(new Set())

  const currentScene = scenes[sceneIdx]

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

  const handleChallengePass = (challengeIdx: number) => {
    setPassedChallenges(prev => new Set([...prev, challengeIdx]))
    advanceScene()
  }

  const handleChallengeFail = () => {
    setFailing(true)
  }

  const handleReset = () => {
    setFailing(false)
    setSceneIdx(0)
    setPassedChallenges(new Set())
    setChallengeKey(k => k + 1)
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
                  Challenge {passedChallenges.size + 1} of {totalChallenges}
                </p>
              </div>
              <ChallengeWrapper
                key={`${challengeKey}-${sceneIdx}`}
                challenge={challenge}
                attempt={challengeKey}
                onPass={() => handleChallengePass(challengeIdx)}
                onFail={handleChallengeFail}
              />
            </div>
          )
        })()}
      </div>

      {/* Fail overlay */}
      {failing && <FailOverlay onReset={handleReset} />}

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
          </div>
        </div>
      )}
    </div>
  )
}
