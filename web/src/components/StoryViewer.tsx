import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import challengesData from '@/data/story_challenges.json'
import scriptsData from '@/data/story_scripts.json'
import MazeGame from '@/components/minigames/MazeGame'
import MirrorGame from '@/components/minigames/MirrorGame'
import CircuitGame from '@/components/minigames/CircuitGame'
import SlidingPuzzle from '@/components/minigames/SlidingPuzzle'
import CrosswordGame from '@/components/minigames/CrosswordGame'
import GeometryGame from '@/components/minigames/GeometryGame'
import PaintingGame from '@/components/minigames/PaintingGame'
import MusicGame from '@/components/minigames/MusicGame'
import TacticsGame from '@/components/minigames/TacticsGame'
import ClassifyGame from '@/components/minigames/ClassifyGame'
import CookingGame from '@/components/minigames/CookingGame'
import FictionGame from '@/components/minigames/FictionGame'
import SudokuGame from '@/components/minigames/SudokuGame'
import VotingGame from '@/components/minigames/VotingGame'
import ChemistryGame from '@/components/minigames/ChemistryGame'
import MatchThreeGame from '@/components/minigames/MatchThreeGame'
import KlotskiGame from '@/components/minigames/KlotskiGame'
import LorentzGame from '@/components/minigames/LorentzGame'
import PorcelainGame from '@/components/minigames/PorcelainGame'
import WordleGame from '@/components/minigames/WordleGame'
import DecodeGame from '@/components/minigames/DecodeGame'
import WargameGame from '@/components/minigames/WargameGame'
import BigMazeGame from '@/components/minigames/BigMazeGame'
import TradeGame from '@/components/minigames/TradeGame'
import PunnettGame from '@/components/minigames/PunnettGame'
import { useAuth } from '@/hooks/useAuth'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QuizChallenge { type: 'quiz'; question: string; options: string[]; answer: number; fact: string }
interface TrueFalseChallenge { type: 'truefalse'; statement: string; correct: boolean; fact: string }
interface SortChallenge { type: 'sort'; question: string; items: string[]; fact: string }
interface MinigameChallenge { type: 'minigame'; game: 'maze'|'mirror'|'circuit'|'sliding'|'crossword'|'geometry'|'painting'|'music'|'tactics'|'classify'|'cooking'|'fiction'|'sudoku'|'voting'|'chemistry'|'matchthree'|'klotski'|'lorentz'|'porcelain'|'wordle'|'decode'|'wargame'|'bigmaze'|'trade'|'punnett'; configId: string; instruction: string; fact: string }
type Challenge = QuizChallenge | TrueFalseChallenge | SortChallenge | MinigameChallenge

interface NarrationScene { type: 'narration'; text: string }
interface DialogScene { type: 'dialog'; speaker: string; portraitKey?: string; text: string }
interface ChallengeScene { type: 'challenge'; index: number }
type Scene = NarrationScene | DialogScene | ChallengeScene

interface StoryScript {
  era: string; story: string; portraitKey: string | null; scenes: Scene[]
}
interface StoryChallengeData { era: string; story: string; challenges: Challenge[] }

// ── Era location images ───────────────────────────────────────────────────────

const ERA_LOCATION_IMAGE: Record<string, string> = {
  Ancient:     '/locations/ancient_stonehenge.jpeg',
  Classical:   '/locations/classical_sparta.jpeg',
  Medieval:    '/locations/medieval_changan.jpeg',
  Renaissance: '/locations/renaissance_venice.jpeg',
  Steam:       '/locations/steam_london.jpeg',
  Electricity: '/locations/electricity_berlin.jpeg',
  Information: '/locations/information_sanjose.jpeg',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getScript(era: string, story: string): StoryScript | null {
  return (scriptsData as StoryScript[]).find(s => s.era === era && s.story === story) ?? null
}

function getChallenges(era: string, story: string): Challenge[] {
  const entry = (challengesData as StoryChallengeData[]).find(d => d.era === era && d.story === story)
  return entry?.challenges ?? []
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function portraitUrl(key: string | null | undefined) {
  if (!key) return null
  if (key.startsWith('follower:')) return `/followers/${key.slice(9)}.jpeg`
  return `/portraits/portrait_${key}.jpeg`
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

// ── Challenge sub-views ────────────────────────────────────────────────────────

function QuizView({ challenge, onResult }: { challenge: QuizChallenge; onResult: (c: boolean) => void }) {
  const [selected, setSelected] = useState<number | null>(null)
  const answered = selected !== null
  return (
    <div className="flex flex-col gap-3">
      <p className="text-white text-sm font-medium leading-snug">{challenge.question}</p>
      <div className="flex flex-col gap-2">
        {challenge.options.map((opt, i) => {
          const isCorrect = i === challenge.answer
          const isSelected = i === selected
          let bg = 'bg-white/5 border-white/10 text-slate-300 hover:border-amber-500/40 hover:text-amber-300'
          if (answered) {
            if (isCorrect) bg = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
            else if (isSelected) bg = 'bg-red-500/20 border-red-500/40 text-red-300'
            else bg = 'bg-white/[0.03] border-white/[0.06] text-slate-500'
          }
          return (
            <button key={i} disabled={answered}
              onClick={() => { setSelected(i); onResult(i === challenge.answer) }}
              className={`text-left px-4 py-2.5 rounded-xl border text-sm transition-all duration-200 ${bg}`}>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TrueFalseView({ challenge, onResult }: { challenge: TrueFalseChallenge; onResult: (c: boolean) => void }) {
  const [answered, setAnswered] = useState<boolean | null>(null)
  const handle = (choice: boolean) => {
    if (answered !== null) return
    setAnswered(choice)
    onResult(choice === challenge.correct)
  }
  const btnClass = (choice: boolean) => {
    if (answered === null) return 'bg-white/5 border-white/10 text-slate-300 hover:border-amber-500/40 hover:text-amber-300'
    if (choice === challenge.correct) return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
    if (choice === answered) return 'bg-red-500/20 border-red-500/40 text-red-300'
    return 'bg-white/[0.03] border-white/[0.06] text-slate-500'
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-white text-sm font-medium leading-snug">{challenge.statement}</p>
      <div className="flex gap-3">
        {([true, false] as const).map(choice => (
          <button key={String(choice)} disabled={answered !== null} onClick={() => handle(choice)}
            className={`flex-1 py-3 rounded-xl border text-sm font-bold tracking-wide transition-all duration-200 ${btnClass(choice)}`}>
            {choice ? 'True' : 'False'}
          </button>
        ))}
      </div>
    </div>
  )
}

function SortView({ challenge, onResult }: { challenge: SortChallenge; onResult: (c: boolean) => void }) {
  const shuffled = useMemo(() => shuffle(challenge.items), [challenge.items])
  const [selected, setSelected] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const remaining = shuffled.filter(i => !selected.includes(i))
  const allPicked = selected.length === challenge.items.length
  const toggle = (item: string) => {
    if (submitted) return
    setSelected(prev => prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item])
  }
  const submit = () => {
    const correct = selected.every((item, i) => item === challenge.items[i])
    setSubmitted(true)
    onResult(correct)
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-white text-sm font-medium leading-snug">{challenge.question}</p>
      <div className="min-h-[44px] flex flex-wrap gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        {selected.length === 0 && <p className="text-slate-600 text-xs self-center">Tap items below in order…</p>}
        {selected.map((item, i) => {
          const isCorrect = submitted && item === challenge.items[i]
          const isWrong = submitted && item !== challenge.items[i]
          return (
            <button key={item} onClick={() => toggle(item)} disabled={submitted}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all
                ${isCorrect ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                  : isWrong ? 'bg-red-500/20 border-red-500/40 text-red-300'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300'}`}>
              {i + 1}. {item}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {remaining.map(item => (
          <button key={item} onClick={() => toggle(item)} disabled={submitted}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-white/5 border-white/10 text-slate-300 hover:border-amber-500/40 hover:text-amber-300 transition-all">
            {item}
          </button>
        ))}
      </div>
      {allPicked && !submitted && (
        <button onClick={submit} className="mt-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-all">
          Check Order
        </button>
      )}
    </div>
  )
}

function MinigameView({ challenge, onResult }: { challenge: MinigameChallenge; onResult: (c: boolean) => void }) {
  const [won, setWon] = useState(false)
  const handleWin = () => { if (!won) { setWon(true); onResult(true) } }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-slate-300 text-xs leading-relaxed italic border-l-2 border-amber-500/40 pl-3">{challenge.instruction}</p>
      <div className="rounded-xl overflow-hidden">
        {challenge.game === 'maze' && <MazeGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'mirror' && <MirrorGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'circuit' && <CircuitGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'sliding' && <SlidingPuzzle configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'crossword' && <CrosswordGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'geometry' && <GeometryGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'painting' && <PaintingGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'music' && <MusicGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'tactics' && <TacticsGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'classify' && <ClassifyGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'cooking' && <CookingGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'fiction' && <FictionGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'sudoku' && <SudokuGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'voting' && <VotingGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'chemistry' && <ChemistryGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'matchthree' && <MatchThreeGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'klotski' && <KlotskiGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'lorentz' && <LorentzGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'porcelain' && <PorcelainGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'wordle' && <WordleGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'decode' && <DecodeGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'wargame' && <WargameGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'bigmaze'  && <BigMazeGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'trade'    && <TradeGame configId={challenge.configId} onWin={handleWin} />}
        {challenge.game === 'punnett'  && <PunnettGame configId={challenge.configId} onWin={handleWin} />}
      </div>
    </div>
  )
}

// ── Challenge wrapper with fail state ─────────────────────────────────────────

function ChallengeWrapper({
  challenge,
  onPass,
  onFail,
  skipAllowed,
  onSkip,
}: {
  challenge: Challenge
  onPass: () => void
  onFail: () => void
  skipAllowed: boolean
  onSkip: () => void
}) {
  const [result, setResult] = useState<boolean | null>(null)
  const [fact, setFact] = useState(false)

  const handleResult = (correct: boolean) => {
    setResult(correct)
    setFact(true)
    if (!correct) {
      setTimeout(() => onFail(), 1800)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {challenge.type === 'quiz' && <QuizView challenge={challenge} onResult={handleResult} />}
      {challenge.type === 'truefalse' && <TrueFalseView challenge={challenge} onResult={handleResult} />}
      {challenge.type === 'sort' && <SortView challenge={challenge} onResult={handleResult} />}
      {challenge.type === 'minigame' && <MinigameView challenge={challenge} onResult={handleResult} />}

      {challenge.type === 'minigame' && !fact && skipAllowed && (
        <button onClick={onSkip}
          className="py-1.5 rounded-xl text-slate-500 text-xs border border-slate-700/40 hover:border-slate-600/50 hover:text-slate-400 transition-all">
          Skip puzzle
        </button>
      )}

      {fact && (
        <div className={`p-3 rounded-xl border text-xs leading-relaxed
          ${result ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
          <span className="font-bold mr-1">{result ? '✓ Correct!' : '✗ Wrong — restarting…'}</span>
          {challenge.fact}
        </div>
      )}

      {fact && result && (
        <button onClick={onPass}
          className="py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all">
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
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
      <div className={`flex flex-col items-center gap-6 text-center px-8 transition-all duration-700
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="text-5xl select-none">🏆</div>
        <div>
          <p className="text-amber-400/70 text-xs uppercase tracking-widest font-semibold mb-2">Story Complete!</p>
          <h2 className="text-white font-bold text-xl leading-tight">{storyTitle}</h2>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/10">
          <span className="text-emerald-400 font-bold">{challengeCount}</span>
          <span className="text-slate-400 text-sm">challenge{challengeCount !== 1 ? 's' : ''} conquered</span>
        </div>
        {hasCard && (
          <p className="text-amber-300/80 text-sm">A new card has been added to your collection!</p>
        )}
        <button onClick={onContinue}
          className="px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm tracking-wide transition-all shadow-lg shadow-amber-500/30">
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
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
      <div className={`flex flex-col items-center gap-6 transition-all duration-700
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <p className="text-amber-400/70 text-xs uppercase tracking-widest font-semibold">Card Unlocked!</p>
        <div className="relative">
          <div className="absolute inset-0 rounded-2xl bg-amber-400/20 blur-2xl scale-110 animate-pulse" />
          <div className="relative w-40 h-52 rounded-2xl overflow-hidden border-2 border-amber-400/60 shadow-2xl shadow-amber-500/30">
            {url ? (
              <img src={url} alt={figureName} className="w-full h-full object-cover object-top" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-amber-900/60 to-slate-900 flex items-center justify-center">
                <span className="text-amber-400 text-5xl">★</span>
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-3">
              <p className="text-white font-bold text-sm">{figureName}</p>
              <p className="text-amber-400/80 text-[10px]">{era}</p>
            </div>
          </div>
        </div>
        <p className="text-slate-400 text-sm text-center max-w-xs">
          {figureName} has been added to your collection.
        </p>
        <button onClick={onCollect}
          className="px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm tracking-wide transition-all shadow-lg shadow-amber-500/30">
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
      <div className="bg-black/40 rounded-2xl p-5 border border-white/5 backdrop-blur-sm cursor-pointer"
        onClick={!done ? skip : undefined}>
        <p className="text-slate-200 text-sm leading-relaxed min-h-[4rem]">
          {displayed}
          {!done && <span className="animate-pulse text-amber-400">|</span>}
        </p>
        {!done && (
          <p className="text-slate-500 text-[10px] mt-2 text-right">Tap to skip</p>
        )}
      </div>
      {done && (
        <button onClick={onNext}
          className="self-end px-6 py-2.5 rounded-xl bg-amber-500/90 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all">
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
        <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden border-2 border-amber-400/60 shadow-lg shadow-amber-500/20">
          {url ? (
            <img src={url} alt={scene.speaker} className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full bg-amber-900/60 flex items-center justify-center">
              <span className="text-amber-300 text-lg font-bold">{scene.speaker[0]}</span>
            </div>
          )}
        </div>
        <div className="flex-1 bg-black/50 rounded-2xl rounded-bl-sm p-4 border border-white/10 backdrop-blur-sm cursor-pointer"
          onClick={!done ? skip : undefined}>
          <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-1">{scene.speaker}</p>
          <p className="text-slate-200 text-sm leading-relaxed">
            {displayed}
            {!done && <span className="animate-pulse text-amber-400">|</span>}
          </p>
          {!done && (
            <p className="text-slate-500 text-[10px] mt-2 text-right">Tap to skip</p>
          )}
        </div>
      </div>
      {done && (
        <button onClick={onNext}
          className="self-end px-6 py-2.5 rounded-xl bg-amber-500/90 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-all">
          Continue →
        </button>
      )}
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

  const handleSkip = () => {
    advanceScene()
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
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm">
        <div className="text-center">
          <p className="text-slate-400 text-sm mb-4">No story content found.</p>
          <button onClick={onClose} className="px-6 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm">Close</button>
        </div>
      </div>
    )
  }

  const progressPct = scenes.length > 0 ? (sceneIdx / scenes.length) * 100 : 0

  const locationImg = locationImage ?? ERA_LOCATION_IMAGE[eraName]

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden">
      {/* ── Background stack ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-[#080812]" />

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
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/75" />
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
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-amber-600/8 blur-[120px] pointer-events-none" />
      )}

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 border-b border-white/[0.06]">
        <div>
          <p className="text-amber-400/70 text-[10px] uppercase tracking-widest font-semibold">{eraName}</p>
          <p className="text-white font-bold text-sm leading-tight">{storyTitle}</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/10 border border-white/10 text-slate-400 hover:text-white hover:bg-white/15 flex items-center justify-center text-sm transition-all">
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 h-0.5 bg-white/[0.06]">
        <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Scene content */}
      <div className="relative z-10 flex-1 flex flex-col px-4 py-4 pb-8 overflow-y-auto">
        {currentScene?.type === 'narration' && (
          <NarrationScene key={sceneIdx} scene={currentScene} onNext={advanceScene} />
        )}
        {currentScene?.type === 'dialog' && (
          <DialogScene key={sceneIdx} scene={currentScene} onNext={advanceScene} />
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
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2">
                <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest">
                  Challenge {passedChallenges.size + 1} of {totalChallenges}
                </p>
              </div>
              <ChallengeWrapper
                key={`${challengeKey}-${sceneIdx}`}
                challenge={challenge}
                onPass={() => handleChallengePass(challengeIdx)}
                onFail={handleChallengeFail}
                skipAllowed={false}
                onSkip={handleSkip}
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
          <p className="text-slate-400 mb-1">Scene {sceneIdx + 1} / {scenes.length}</p>
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
                <p className="text-slate-500 text-[10px]">Answer:</p>
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
