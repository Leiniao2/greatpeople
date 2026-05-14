import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import allStories from '@/data/story_challenges.json'
import MazeGame from '@/components/minigames/MazeGame'
import MirrorGame from '@/components/minigames/MirrorGame'
import CircuitGame from '@/components/minigames/CircuitGame'
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
import TradeGame from '@/components/minigames/TradeGame'
import PunnettGame from '@/components/minigames/PunnettGame'
import AuctionGame from '@/components/minigames/AuctionGame'
import PseudoCodeGame from '@/components/minigames/PseudoCodeGame'

// ── Types ─────────────────────────────────────────────────────────────────────

type GameType =
  | 'quiz' | 'truefalse' | 'sort'
  | 'maze' | 'mirror' | 'circuit' | 'crossword'
  | 'geometry' | 'painting' | 'music' | 'tactics' | 'classify'
  | 'cooking' | 'fiction' | 'sudoku' | 'voting' | 'chemistry' | 'matchthree'
  | 'klotski' | 'lorentz' | 'porcelain' | 'trade' | 'punnett'
  | 'wordle' | 'decode' | 'wargame'
  | 'auction' | 'pseudocode'

interface FlatChallenge {
  id: string
  game: GameType
  storyName: string
  era: string
  instruction: string  // shown on card
  // raw data for rendering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any
}

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'All',      label: 'All',      icon: '◈', color: 'text-slate-300',   border: 'border-slate-500',   bg: 'bg-slate-500/20'   },
  { key: 'Trivia',   label: 'Trivia',   icon: '?', color: 'text-amber-400',   border: 'border-amber-500',   bg: 'bg-amber-500/20'   },
  { key: 'Puzzle',   label: 'Puzzle',   icon: '◻', color: 'text-cyan-400',    border: 'border-cyan-500',    bg: 'bg-cyan-500/20'    },
  { key: 'Creative', label: 'Creative', icon: '✿', color: 'text-emerald-400', border: 'border-emerald-500', bg: 'bg-emerald-500/20' },
  { key: 'Story',    label: 'Story',    icon: '✦', color: 'text-violet-400',  border: 'border-violet-500',  bg: 'bg-violet-500/20'  },
  { key: 'Explore',  label: 'Explore',  icon: '◎', color: 'text-red-400',     border: 'border-red-500',     bg: 'bg-red-500/20'     },
] as const

type CategoryKey = typeof CATEGORIES[number]['key']

const GAME_CATEGORY: Record<string, CategoryKey> = {
  quiz: 'Trivia', truefalse: 'Trivia',
  mirror: 'Puzzle', sudoku: 'Puzzle', circuit: 'Puzzle', geometry: 'Puzzle',
  chemistry: 'Puzzle', classify: 'Puzzle', crossword: 'Puzzle', matchthree: 'Puzzle',
  klotski: 'Puzzle', lorentz: 'Puzzle', punnett: 'Puzzle', decode: 'Puzzle',
  wordle: 'Puzzle', pseudocode: 'Puzzle',
  painting: 'Creative', cooking: 'Creative', music: 'Creative', porcelain: 'Creative',
  fiction: 'Story', voting: 'Story', sort: 'Story', tactics: 'Story',
  wargame: 'Story', trade: 'Story', auction: 'Story',
  maze: 'Explore',
}

const GAME_LABEL: Record<string, string> = {
  quiz: 'Quiz', truefalse: 'True / False', sort: 'Sort',
  maze: 'Maze', mirror: 'Mirror', circuit: 'Circuit',
  crossword: 'Crossword', geometry: 'Geometry', painting: 'Painting',
  music: 'Music', tactics: 'Tactics', classify: 'Classify',
  cooking: 'Cooking', fiction: 'Fiction', sudoku: 'Sudoku',
  voting: 'Voting', chemistry: 'Chemistry', matchthree: 'Match Three',
  klotski: 'Klotski', lorentz: 'Lorentz Force', porcelain: 'Porcelain',
  trade: 'Trade', punnett: 'Punnett Square',
  wordle: 'Wordle', decode: 'Decode', wargame: 'Wargame',
  auction: 'Auction', pseudocode: 'Pseudo Code',
}

// ── Flatten all challenges ────────────────────────────────────────────────────

function flattenChallenges(): FlatChallenge[] {
  const result: FlatChallenge[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const story of allStories as any[]) {
    for (const ch of story.challenges ?? []) {
      const game: GameType = ch.game ?? ch.type
      const instruction =
        ch.instruction ??
        ch.question ??
        ch.statement ??
        `Play ${GAME_LABEL[game] ?? game}`
      result.push({
        id: `${story.story}-${game}-${result.length}`,
        game,
        storyName: story.story,
        era: story.era,
        instruction,
        raw: ch,
      })
    }
  }
  return result
}

const ALL_CHALLENGES = flattenChallenges()

// ── Category badge ────────────────────────────────────────────────────────────

function catFor(game: string) {
  return CATEGORIES.find(c => c.key === (GAME_CATEGORY[game] ?? 'All')) ?? CATEGORIES[0]
}

// ── In-overlay challenge renderer ─────────────────────────────────────────────

function ChallengeOverlay({ ch, onClose }: { ch: FlatChallenge; onClose: () => void }) {
  const [won, setWon] = useState(false)
  const [answered, setAnswered] = useState<boolean | null>(null) // for quiz/truefalse/sort
  const [fact, setFact] = useState<string | null>(null)

  const handleWin = useCallback(() => setWon(true), [])

  // Quiz
  if (ch.raw.type === 'quiz') {
    const r = ch.raw
    return (
      <OverlayShell ch={ch} won={won} onClose={onClose}>
        <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-4">
          <p className="text-white text-sm font-medium leading-snug">{r.question}</p>
          <div className="flex flex-col gap-2">
            {r.options.map((opt: string, i: number) => {
              const picked = answered !== null
              const correct = i === r.answer
              let cls = 'w-full text-left px-4 py-3 rounded-xl text-sm border transition-all '
              if (!picked) cls += 'bg-white/[0.04] border-white/10 text-slate-200 hover:border-amber-500/40'
              else if (correct) cls += 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
              else cls += 'bg-white/[0.02] border-white/[0.05] text-slate-500'
              return (
                <button key={i} className={cls} disabled={picked}
                  onClick={() => {
                    setAnswered(i === r.answer)
                    setFact(r.fact)
                    if (i === r.answer) setTimeout(() => setWon(true), 700)
                  }}>
                  {opt}
                </button>
              )
            })}
          </div>
          {fact && (
            <div className={`p-3 rounded-xl border text-xs leading-relaxed ${answered ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
              {fact}
            </div>
          )}
        </div>
      </OverlayShell>
    )
  }

  // True / False
  if (ch.raw.type === 'truefalse') {
    const r = ch.raw
    return (
      <OverlayShell ch={ch} won={won} onClose={onClose}>
        <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-4">
          <p className="text-white text-sm font-medium leading-snug italic">"{r.statement}"</p>
          <div className="flex gap-3">
            {[true, false].map(val => {
              const picked = answered !== null
              const correct = val === r.correct
              let cls = 'flex-1 py-3 rounded-xl font-bold text-sm border transition-all '
              if (!picked) cls += 'bg-white/[0.04] border-white/10 text-slate-200 hover:border-amber-500/40'
              else if (correct) cls += 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
              else cls += 'bg-red-500/10 border-red-500/20 text-red-400'
              return (
                <button key={String(val)} className={cls} disabled={picked}
                  onClick={() => {
                    setAnswered(val === r.correct)
                    setFact(r.fact)
                    if (val === r.correct) setTimeout(() => setWon(true), 700)
                  }}>
                  {val ? 'TRUE' : 'FALSE'}
                </button>
              )
            })}
          </div>
          {fact && (
            <div className={`p-3 rounded-xl border text-xs leading-relaxed ${answered ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
              {fact}
            </div>
          )}
        </div>
      </OverlayShell>
    )
  }

  // Sort
  if (ch.raw.type === 'sort') {
    return (
      <OverlayShell ch={ch} won={won} onClose={onClose}>
        <SortPlayer raw={ch.raw} onWin={handleWin} />
      </OverlayShell>
    )
  }

  // Minigame
  const g = ch.raw.game
  const cId = ch.raw.configId
  return (
    <OverlayShell ch={ch} won={won} onClose={onClose}>
      {g === 'maze'       && <MazeGame configId={cId} onWin={handleWin} />}
      {g === 'mirror'     && <MirrorGame configId={cId} onWin={handleWin} />}
      {g === 'circuit'    && <CircuitGame configId={cId} onWin={handleWin} />}
      {g === 'crossword'  && <CrosswordGame configId={cId} onWin={handleWin} />}
      {g === 'geometry'   && <GeometryGame configId={cId} onWin={handleWin} />}
      {g === 'painting'   && <PaintingGame configId={cId} onWin={handleWin} />}
      {g === 'music'      && <MusicGame configId={cId} onWin={handleWin} />}
      {g === 'tactics'    && <TacticsGame configId={cId} onWin={handleWin} />}
      {g === 'classify'   && <ClassifyGame configId={cId} onWin={handleWin} />}
      {g === 'cooking'    && <CookingGame configId={cId} onWin={handleWin} />}
      {g === 'fiction'    && <FictionGame configId={cId} onWin={handleWin} />}
      {g === 'sudoku'     && <SudokuGame configId={cId} onWin={handleWin} />}
      {g === 'voting'     && <VotingGame configId={cId} onWin={handleWin} />}
      {g === 'chemistry'  && <ChemistryGame configId={cId} onWin={handleWin} />}
      {g === 'matchthree' && <MatchThreeGame configId={cId} onWin={handleWin} />}
      {g === 'klotski'    && <KlotskiGame configId={cId} onWin={handleWin} />}
      {g === 'lorentz'    && <LorentzGame configId={cId} onWin={handleWin} />}
      {g === 'porcelain'  && <PorcelainGame configId={cId} onWin={handleWin} />}
      {g === 'trade'       && <TradeGame configId={cId} onWin={handleWin} />}
      {g === 'punnett'     && <PunnettGame configId={cId} onWin={handleWin} />}
      {g === 'auction'     && <AuctionGame configId={cId} onWin={handleWin} />}
      {g === 'pseudocode'  && <PseudoCodeGame configId={cId} onWin={handleWin} />}
      {ch.raw.fact && won === false && (
        <p className="text-slate-600 text-[10px] leading-relaxed mt-1 px-1">{ch.raw.fact}</p>
      )}
    </OverlayShell>
  )
}

// Shared overlay shell with win state
function OverlayShell({
  ch, won, onClose, children,
}: {
  ch: FlatChallenge; won: boolean; onClose: () => void; children: React.ReactNode
}) {
  const cat = catFor(ch.game)
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#080812]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pb-3 pt-4 border-b border-white/[0.06] shrink-0">
        <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${cat.bg} ${cat.color} border ${cat.border}`}>
          {GAME_LABEL[ch.game] ?? ch.game}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-slate-400 text-[10px] truncate">{ch.storyName}</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.05] text-slate-400 hover:text-white hover:bg-white/10 transition-all text-lg">
          ✕
        </button>
      </div>

      {/* Challenge content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {children}
      </div>

      {/* Win banner */}
      {won && (
        <div className="shrink-0 px-4 pb-safe pb-6 pt-3 border-t border-emerald-500/20 bg-emerald-500/[0.07]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">✓</span>
            <div className="flex-1">
              <p className="text-emerald-300 font-bold text-sm">Challenge Complete!</p>
              {ch.raw.fact && (
                <p className="text-slate-400 text-[11px] leading-relaxed mt-0.5 line-clamp-3">{ch.raw.fact}</p>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="mt-3 w-full py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-sm hover:bg-emerald-500/30 transition-all">
            Back to Arcade
          </button>
        </div>
      )}
    </div>
  )
}

// Sort challenge player
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SortPlayer({ raw, onWin }: { raw: any; onWin: () => void }) {
  const original: string[] = raw.items
  const [order, setOrder] = useState<string[]>(() => [...original].sort(() => Math.random() - 0.5))
  const [submitted, setSubmitted] = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)

  const correct = submitted && order.every((item, i) => item === original[i])

  const move = (from: number, dir: -1 | 1) => {
    if (submitted) return
    const to = from + dir
    if (to < 0 || to >= order.length) return
    const next = [...order]
    ;[next[from], next[to]] = [next[to], next[from]]
    setOrder(next)
  }

  const handleSubmit = () => {
    setSubmitted(true)
    if (order.every((item, i) => item === original[i])) setTimeout(onWin, 700)
  }

  return (
    <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-4">
      <p className="text-white text-sm font-medium leading-snug">{raw.question}</p>
      <div className="flex flex-col gap-2">
        {order.map((item, i) => {
          const isCorrect = submitted && item === original[i]
          const isWrong = submitted && item !== original[i]
          return (
            <div key={item}
              className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition-all
                ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                : isWrong   ? 'bg-red-500/10 border-red-500/30 text-red-300'
                            : 'bg-white/[0.04] border-white/10 text-slate-200'}`}
              draggable={!submitted}
              onDragStart={() => setDragging(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => {
                if (dragging === null || dragging === i || submitted) return
                const next = [...order]
                const [removed] = next.splice(dragging, 1)
                next.splice(i, 0, removed)
                setOrder(next)
                setDragging(null)
              }}>
              <span className="text-slate-600 text-xs font-bold w-4 shrink-0">{i + 1}</span>
              <span className="flex-1 leading-snug">{item}</span>
              {!submitted && (
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => move(i, -1)} disabled={i === 0}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-xs leading-none px-1">▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === order.length - 1}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-xs leading-none px-1">▼</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!submitted && (
        <button onClick={handleSubmit}
          className="py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-all">
          Check Order →
        </button>
      )}
      {submitted && !correct && (
        <button onClick={() => { setSubmitted(false); setOrder([...original].sort(() => Math.random() - 0.5)) }}
          className="py-2 rounded-xl border border-slate-700 text-slate-400 text-xs hover:border-slate-600 transition-all">
          Try again
        </button>
      )}
    </div>
  )
}

// ── Challenge card ────────────────────────────────────────────────────────────

function ChallengeCard({ ch, onClick }: { ch: FlatChallenge; onClick: () => void }) {
  const cat = catFor(ch.game)
  return (
    <button onClick={onClick}
      className="group w-full text-left flex flex-col gap-2.5 p-3.5 rounded-2xl
                 bg-white/[0.03] border border-white/[0.07]
                 hover:bg-white/[0.06] hover:border-white/[0.14]
                 active:scale-[0.98] transition-all duration-150">
      {/* Top row: type badge + era */}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cat.bg} ${cat.color} ${cat.border}`}>
          {GAME_LABEL[ch.game] ?? ch.game}
        </span>
        <span className="text-slate-600 text-[9px] uppercase tracking-wider shrink-0">{ch.era}</span>
      </div>

      {/* Instruction */}
      <p className="text-white/85 text-xs leading-snug line-clamp-2 font-medium">
        {ch.instruction}
      </p>

      {/* Story name + arrow */}
      <div className="flex items-center justify-between gap-1">
        <p className="text-slate-600 text-[10px] truncate">{ch.storyName}</p>
        <span className={`${cat.color} opacity-0 group-hover:opacity-100 transition-opacity text-xs`}>→</span>
      </div>
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MiniChallengePage() {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('All')
  const [playing, setPlaying] = useState<FlatChallenge | null>(null)

  const filtered = useMemo(() => {
    if (activeCategory === 'All') return ALL_CHALLENGES
    return ALL_CHALLENGES.filter(ch => GAME_CATEGORY[ch.game] === activeCategory)
  }, [activeCategory])

  // Count per category
  const counts = useMemo(() => {
    const m: Partial<Record<CategoryKey, number>> = {}
    for (const ch of ALL_CHALLENGES) {
      const cat = GAME_CATEGORY[ch.game] ?? 'All'
      m[cat as CategoryKey] = (m[cat as CategoryKey] ?? 0) + 1
    }
    m['All'] = ALL_CHALLENGES.length
    return m
  }, [])

  return (
    <div className="min-h-screen bg-[#080812] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#080812]/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/home')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/[0.05] text-slate-400 hover:text-white hover:bg-white/10 transition-all">
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-base tracking-wide">ARCADE</h1>
            <p className="text-slate-500 text-[10px]">{ALL_CHALLENGES.length} mini challenges · play any, anytime</p>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.key
            const count = counts[cat.key] ?? 0
            return (
              <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all shrink-0
                  ${active
                    ? `${cat.bg} ${cat.color} ${cat.border}`
                    : 'bg-white/[0.04] border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300'}`}>
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
                <span className={`text-[9px] ${active ? 'opacity-70' : 'opacity-40'}`}>{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Challenge grid */}
      <div className="flex-1 px-3 py-3">
        <div className="grid grid-cols-2 gap-2.5 max-w-2xl mx-auto">
          {filtered.map(ch => (
            <ChallengeCard key={ch.id} ch={ch} onClick={() => setPlaying(ch)} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <span className="text-4xl opacity-20">◈</span>
            <p className="text-slate-600 text-sm">No challenges in this category</p>
          </div>
        )}
      </div>

      {/* Play overlay */}
      {playing && (
        <ChallengeOverlay ch={playing} onClose={() => setPlaying(null)} />
      )}
    </div>
  )
}
