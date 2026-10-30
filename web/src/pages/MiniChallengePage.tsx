import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import allStories from '@/data/story_challenges.json'
import ChallengeRenderer from '@/games/ChallengeRenderer'
import ResultPanel from '@/games/ResultPanel'
import { gameCategory, gameLabel, type Category } from '@/games/registry'
import type { Challenge } from '@/games/types'
import { hashString } from '@/components/minigames/_shared'
import EraIcon from '@/components/EraIcon'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlatChallenge {
  id: string
  /** Game key, or quiz / truefalse / sort. */
  game: string
  storyName: string
  era: string
  instruction: string  // shown on card
  challenge: Challenge
}

// ── Category config ───────────────────────────────────────────────────────────

type CategoryKey = 'All' | 'Trivia' | Category

const CATEGORIES: { key: CategoryKey; label: string; icon: string; color: string; border: string; bg: string }[] = [
  { key: 'All',      label: 'All',      icon: '◈', color: 'text-ink-2',       border: 'border-line-2',    bg: 'bg-panel-2'        },
  { key: 'Trivia',   label: 'Trivia',   icon: '?', color: 'text-amber-700',   border: 'border-amber-500', bg: 'bg-amber-500/20'   },
  { key: 'Puzzle',   label: 'Puzzle',   icon: '◻', color: 'text-cyan-700',    border: 'border-cyan-500',  bg: 'bg-cyan-500/20'    },
  { key: 'Strategy', label: 'Strategy', icon: '♜', color: 'text-accent',      border: 'border-accent',    bg: 'bg-accent/15'      },
  { key: 'Creative', label: 'Creative', icon: '✿', color: 'text-emerald-700', border: 'border-emerald-500', bg: 'bg-emerald-500/20' },
  { key: 'Story',    label: 'Story',    icon: '✦', color: 'text-violet-700',  border: 'border-violet-500', bg: 'bg-violet-500/20' },
  { key: 'Explore',  label: 'Explore',  icon: '◎', color: 'text-red-700',     border: 'border-red-500',   bg: 'bg-red-500/20'     },
]

// ── Flatten all challenges ────────────────────────────────────────────────────

function flattenChallenges(): FlatChallenge[] {
  const result: FlatChallenge[] = []
  for (const story of allStories as { era: string; story: string; challenges: Challenge[] }[]) {
    for (const ch of story.challenges) {
      const game = ch.type === 'minigame' ? ch.game : ch.type
      const instruction =
        ch.type === 'minigame' ? ch.instruction
        : ch.type === 'truefalse' ? ch.statement
        : ch.question
      result.push({
        id: ch.id ?? `${story.story}-${game}-${result.length}`,
        game,
        storyName: story.story,
        era: story.era,
        instruction,
        challenge: ch,
      })
    }
  }
  return result
}

const ALL_CHALLENGES = flattenChallenges()

function catFor(game: string) {
  return CATEGORIES.find(c => c.key === gameCategory(game)) ?? CATEGORIES[0]
}

// ── Play overlay ──────────────────────────────────────────────────────────────

function ChallengeOverlay({ ch, onClose, onNext }: { ch: FlatChallenge; onClose: () => void; onNext?: () => void }) {
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null)
  const [attempt, setAttempt] = useState(0)
  const seed = useMemo(() => hashString(`${ch.id}:${attempt}`), [ch.id, attempt])
  const cat = catFor(ch.game)

  const handleWin = useCallback(() => setOutcome('won'), [])
  const handleLose = useCallback(() => setOutcome('lost'), [])
  const retry = () => { setOutcome(null); setAttempt(a => a + 1) }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper relative">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pb-3 pt-4 border-b border-line shrink-0">
        <div className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${cat.bg} ${cat.color} border ${cat.border}`}>
          {gameLabel(ch.game)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-muted text-[10px] truncate">{ch.storyName}</p>
        </div>
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-panel text-muted hover:text-ink hover:bg-panel-2 transition-all text-lg">
          ✕
        </button>
      </div>

      {/* Challenge content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-paper-2 rounded-xl p-4">
          <ChallengeRenderer key={attempt} challenge={ch.challenge} seed={seed} onWin={handleWin} onLose={handleLose} />
        </div>
      </div>

      {outcome && (
        <ResultPanel outcome={outcome} fact={ch.challenge.fact} onReplay={retry} onNext={onNext} onBack={onClose} />
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
                 bg-panel border border-line
                 hover:bg-panel-2 hover:border-line-2
                 active:scale-[0.98] transition-all duration-150">
      {/* Top row: type badge + era */}
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${cat.bg} ${cat.color} ${cat.border}`}>
          {gameLabel(ch.game)}
        </span>
        <EraIcon era={ch.era} className="w-3.5 h-3.5 text-muted/80" />
      </div>

      {/* Instruction */}
      <p className="text-ink/85 text-xs leading-snug line-clamp-2 font-medium">
        {ch.instruction}
      </p>

      {/* Story name + arrow */}
      <div className="flex items-center justify-between gap-1">
        <p className="text-muted/80 text-[10px] truncate">{ch.storyName}</p>
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
    return ALL_CHALLENGES.filter(ch => gameCategory(ch.game) === activeCategory)
  }, [activeCategory])

  // Count per category
  const counts = useMemo(() => {
    const m: Partial<Record<CategoryKey, number>> = { All: ALL_CHALLENGES.length }
    for (const ch of ALL_CHALLENGES) {
      const cat = gameCategory(ch.game)
      m[cat] = (m[cat] ?? 0) + 1
    }
    return m
  }, [])

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-paper/95 backdrop-blur-md border-b border-line">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/home')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-panel text-muted hover:text-ink hover:bg-panel-2 transition-all">
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-ink font-bold text-base tracking-wide">ARCADE</h1>
            <p className="text-muted text-[10px]">{ALL_CHALLENGES.length} mini challenges · play any, anytime</p>
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
                    : 'bg-panel border-line text-muted hover:border-line-2 hover:text-ink-2'}`}>
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
            <p className="text-muted/80 text-sm">No challenges in this category</p>
          </div>
        )}
      </div>

      {/* Play overlay */}
      {playing && (
        <ChallengeOverlay
          key={playing.id}
          ch={playing}
          onClose={() => setPlaying(null)}
          onNext={(() => {
            // The next card in the list as currently filtered.
            const idx = filtered.findIndex(c => c.id === playing.id)
            const next = idx >= 0 ? filtered[idx + 1] : undefined
            return next ? () => setPlaying(next) : undefined
          })()}
        />
      )}
    </div>
  )
}
