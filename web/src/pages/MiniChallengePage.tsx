import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isEmbedded, postToNative } from '@/bridge/native'
import ChallengeRenderer from '@/games/ChallengeRenderer'
import ResultPanel, { RewardCard } from '@/games/ResultPanel'
import { GAMES, type Category, type GameKey } from '@/games/registry'
import { ARCADE_TRACKS, LEVELS_PER_TRACK, buildTrack, levelChallenge, levelCode, starsForAttempts, type ArcadeLevel } from '@/games/arcade'
import { useStoryProgress } from '@/hooks/useStoryProgress'
import type { ArcadeProgress } from '@/api/progress'
import UiIcon, { type UiIconName } from '@/components/UiIcon'
import { pickFightReward, rewardCard } from '@/battle/rewards'
import type { Card } from '@/types'

// The Arcade is a set of ladders, one per game type, grouped by category.
// Each ladder is LEVELS_PER_TRACK generated levels of rising difficulty;
// clearing a level unlocks the next and offers to play it straight away.
// Finishing a whole track (every level cleared) unlocks one random Great
// Person, once per track.

type CategoryKey = 'All' | Category

const CATEGORIES: { key: CategoryKey; label: string; icon: UiIconName; color: string; border: string; bg: string }[] = [
  { key: 'All',      label: 'All',      icon: 'all', color: 'text-ink-2',       border: 'border-line-2',      bg: 'bg-panel-2'        },
  { key: 'Puzzle',   label: 'Puzzle',   icon: 'puzzle', color: 'text-cyan-700',    border: 'border-cyan-500',    bg: 'bg-cyan-500/20'    },
  { key: 'Strategy', label: 'Strategy', icon: 'strategy', color: 'text-accent',      border: 'border-accent',      bg: 'bg-accent/15'      },
  { key: 'Creative', label: 'Creative', icon: 'creative', color: 'text-emerald-700', border: 'border-emerald-500', bg: 'bg-emerald-500/20' },
  { key: 'Story',    label: 'Story',    icon: 'story', color: 'text-violet-700',  border: 'border-violet-500',  bg: 'bg-violet-500/20'  },
  { key: 'Explore',  label: 'Explore',  icon: 'explore', color: 'text-red-700',     border: 'border-red-500',     bg: 'bg-red-500/20'     },
]
const SECTIONS = CATEGORIES.filter(c => c.key !== 'All')
const catFor = (key: GameKey) => CATEGORIES.find(c => c.key === GAMES[key].category) ?? CATEGORIES[0]
const TIERS = ['A', 'B', 'C', 'D']

const EMPTY: ArcadeProgress = { cleared: 0, stars: [] }
const totalStars = (p: ArcadeProgress) => p.stars.reduce((a, b) => a + (b ?? 0), 0)

/** Give a finished track its Great Person, once. Null if not finished, already given, or nothing is left to give. */
export function grantTrackReward(game: string): Card | null {
  const { doc, rewardArcadeTrack } = useStoryProgress.getState()
  const p = doc.arcade?.[game]
  if (!p || p.cleared < LEVELS_PER_TRACK || p.reward) return null
  const card = pickFightReward(doc.unlockedCards)
  if (!card) return null
  rewardArcadeTrack(game, card.portraitKey ?? card.id)
  return card
}

/** Loads a game's config ids and builds its ladder. */
function useTrack(game: GameKey | null): ArcadeLevel[] | null {
  const [track, setTrack] = useState<ArcadeLevel[] | null>(null)
  useEffect(() => {
    if (!game) { setTrack(null); return }
    let alive = true
    setTrack(null)
    GAMES[game].load().then(mod => { if (alive) setTrack(buildTrack(game, mod.CONFIG_IDS ?? [])) })
    return () => { alive = false }
  }, [game])
  return track
}

// ── Play overlay ──────────────────────────────────────────────────────────────

function LevelPlayer({ track, index, progress, onLevel, onClose }: {
  track: ArcadeLevel[]
  index: number
  progress: ArcadeProgress
  onLevel: (index: number) => void
  onClose: () => void
}) {
  const level = track[index]
  const clearArcadeLevel = useStoryProgress(s => s.clearArcadeLevel)
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(null)
  const [fails, setFails] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [earned, setEarned] = useState(0)
  const [reward, setReward] = useState<Card | null>(null)
  const cat = catFor(level.game)
  // A replay reshuffles; the first attempt plays the level's own seed.
  const challenge = useMemo(() => {
    const ch = levelChallenge(level)
    return attempt === 0 ? ch : { ...ch, seed: (level.seed + attempt * 7919) >>> 0 }
  }, [level, attempt])

  const handleWin = useCallback(() => {
    const stars = starsForAttempts(fails)
    setEarned(stars)
    clearArcadeLevel(level.game, level.index, stars)
    setReward(grantTrackReward(level.game))
    setOutcome('won')
  }, [fails, level, clearArcadeLevel])
  const handleLose = useCallback(() => { setFails(f => f + 1); setOutcome('lost') }, [])
  const replay = () => { setOutcome(null); setAttempt(a => a + 1) }

  const hasNext = index + 1 < track.length
  // After a win the next level is unlocked; after a loss, only if it already was.
  const nextOpen = hasNext && (outcome === 'won' || progress.cleared >= index + 1)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-paper">
      <div className="flex items-center gap-3 px-4 pt-safe pb-3 pt-4 border-b border-line shrink-0">
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${cat.bg} ${cat.color} border ${cat.border}`}>
          {GAMES[level.game].label}
        </span>
        <p className="flex-1 min-w-0 text-muted text-[10px] truncate">
          {levelCode(index)} · {index + 1} / {track.length}
        </p>
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-panel text-muted hover:text-ink hover:bg-panel-2 transition-all text-lg"
          aria-label="Back to Arcade">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="bg-paper-2 rounded-xl p-4">
          <ChallengeRenderer key={`${index}:${attempt}`} challenge={challenge} seed={challenge.seed!} onWin={handleWin} onLose={handleLose} />
        </div>
      </div>

      {outcome && (
        <ResultPanel
          outcome={outcome}
          badge={outcome === 'won' ? '★'.repeat(earned) + '☆'.repeat(3 - earned) : undefined}
          fact={outcome === 'won' && !hasNext ? `Track complete — all ${track.length} levels cleared.` : undefined}
          reward={reward}
          onReplay={replay}
          onNext={nextOpen ? () => onLevel(index + 1) : undefined}
          nextLabel={`${levelCode(index + 1)} →`}
          onBack={onClose}
        />
      )}
    </div>
  )
}

// ── Track card and level grid ─────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: ArcadeProgress }) {
  const pct = Math.min(100, (progress.cleared / LEVELS_PER_TRACK) * 100)
  return (
    <div className="h-1.5 rounded-full bg-line overflow-hidden" role="progressbar"
      aria-valuemin={0} aria-valuemax={LEVELS_PER_TRACK} aria-valuenow={progress.cleared}
      aria-label={`${progress.cleared} of ${LEVELS_PER_TRACK} levels cleared`}>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

function TrackCard({ game, progress, onOpen, onContinue }: {
  game: GameKey; progress: ArcadeProgress; onOpen: () => void; onContinue: () => void
}) {
  const cat = catFor(game)
  const complete = progress.cleared >= LEVELS_PER_TRACK
  const given = progress.reward ? rewardCard(progress.reward) : undefined
  // Tracks finished before rewards existed can claim theirs here.
  const claimable = complete && !progress.reward && !!pickFightReward(useStoryProgress.getState().doc.unlockedCards)
  return (
    <div className="flex flex-col gap-2 p-3.5 rounded-2xl bg-panel border border-line hover:border-line-2 transition-all">
      <button onClick={onOpen} className="flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 min-w-0">
          <UiIcon name={cat.icon} className="w-7 h-7" />
          <span className="text-ink font-semibold text-sm truncate">{GAMES[game].label}</span>
        </span>
        <span className="text-[10px] text-muted shrink-0">
          {progress.cleared} / {LEVELS_PER_TRACK} · <span className="text-accent">★ {totalStars(progress)}</span>
        </span>
      </button>
      <ProgressBar progress={progress} />
      {given && <RewardCard card={given} label="Track reward" />}
      {claimable && (
        <button onClick={() => grantTrackReward(game)} data-testid="claim-reward"
          className="py-1.5 rounded-xl border border-accent/50 bg-accent/10 text-accent text-xs font-bold">
          🎁 Track complete: claim a Great Person
        </button>
      )}
      <div className="flex items-center justify-between gap-2">
        <button onClick={onOpen} className="text-muted text-[10px] hover:text-ink">All levels</button>
        <button onClick={onContinue}
          className="px-3 py-1.5 rounded-xl bg-accent text-accent-fg text-xs font-bold hover:bg-accent-hover transition-all">
          {complete ? 'Replay ▶' : progress.cleared === 0 ? 'Start ▶' : `${levelCode(progress.cleared)} ▶`}
        </button>
      </div>
    </div>
  )
}

function LevelGrid({ game, track, progress, onPlay, onBack }: {
  game: GameKey; track: ArcadeLevel[] | null; progress: ArcadeProgress; onPlay: (i: number) => void; onBack: () => void
}) {
  return (
    <div className="flex-1 px-4 py-4 max-w-2xl w-full mx-auto">
      <button onClick={onBack} className="text-muted text-xs mb-3 hover:text-ink">← All tracks</button>
      <h2 className="font-display text-2xl font-bold text-ink">{GAMES[game].label}</h2>
      <p className="text-muted text-xs mb-4">{progress.cleared} / {LEVELS_PER_TRACK} cleared · ★ {totalStars(progress)} / {LEVELS_PER_TRACK * 3}</p>
      {!track ? <p className="text-muted text-xs">Loading levels…</p> : TIERS.map((tier, t) => (
        <div key={tier} className="mb-4 flex items-start gap-3">
          <p className="w-6 pt-2 font-display text-xl font-bold text-accent text-center shrink-0">{tier}</p>
          <div className="flex-1 grid grid-cols-6 gap-1.5">
            {track.slice(t * 6, t * 6 + 6).map(level => {
              const stars = progress.stars[level.index] ?? 0
              const unlocked = level.index <= progress.cleared
              return (
                <button key={level.index} disabled={!unlocked} onClick={() => onPlay(level.index)}
                  className={`flex flex-col items-center gap-0.5 py-2 rounded-xl border text-sm transition-all
                    ${unlocked ? 'bg-panel border-line hover:border-accent/50' : 'bg-paper-2 border-line/50 opacity-50 cursor-not-allowed'}
                    ${level.index === progress.cleared ? 'ring-2 ring-accent/50' : ''}`}>
                  <span className={`font-bold ${unlocked ? 'text-ink' : 'text-muted'}`}>{levelCode(level.index)}</span>
                  <span className="text-[10px] text-accent leading-none">{stars ? '★'.repeat(stars) : ' '}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MiniChallengePage() {
  const navigate = useNavigate()
  const arcade = useStoryProgress(s => s.doc.arcade) ?? {}
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('All')
  const [openGame, setOpenGame] = useState<GameKey | null>(null)
  const [playing, setPlaying] = useState<{ game: GameKey; index: number } | null>(null)
  const track = useTrack(playing?.game ?? openGame)
  const progressOf = (g: GameKey) => arcade[g] ?? EMPTY

  const sections = useMemo(() => SECTIONS
    .filter(s => activeCategory === 'All' || s.key === activeCategory)
    .map(s => ({ ...s, games: ARCADE_TRACKS.filter(g => GAMES[g].category === s.key) }))
    .filter(s => s.games.length > 0), [activeCategory])

  const totals = useMemo(() => {
    const cleared = ARCADE_TRACKS.reduce((a, g) => a + (arcade[g]?.cleared ?? 0), 0)
    return { cleared, levels: ARCADE_TRACKS.length * LEVELS_PER_TRACK }
  }, [arcade])

  const continueTrack = (g: GameKey) =>
    setPlaying({ game: g, index: Math.min(progressOf(g).cleared, LEVELS_PER_TRACK - 1) })

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="sticky top-0 z-30 bg-paper/95 backdrop-blur-md border-b border-line">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => (openGame ? setOpenGame(null) : isEmbedded() ? postToNative({ type: 'close' }) : navigate('/home'))}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-panel text-muted hover:text-ink hover:bg-panel-2 transition-all">
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-ink font-bold text-base tracking-wide">ARCADE</h1>
            <p className="text-muted text-[10px]">
              {ARCADE_TRACKS.length} game tracks · {totals.cleared} / {totals.levels} levels cleared
            </p>
          </div>
        </div>

        {!openGame && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
            {CATEGORIES.map(cat => {
              const active = activeCategory === cat.key
              const count = cat.key === 'All' ? ARCADE_TRACKS.length : ARCADE_TRACKS.filter(g => GAMES[g].category === cat.key).length
              return (
                <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all shrink-0
                    ${active ? `${cat.bg} ${cat.color} ${cat.border}` : 'bg-panel border-line text-muted hover:border-line-2 hover:text-ink-2'}`}>
                  <UiIcon name={cat.icon} line className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                  <span className={`text-[9px] ${active ? 'opacity-70' : 'opacity-40'}`}>{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {openGame ? (
        <LevelGrid game={openGame} track={track} progress={progressOf(openGame)}
          onPlay={i => setPlaying({ game: openGame, index: i })} onBack={() => setOpenGame(null)} />
      ) : (
        <div className="flex-1 px-3 py-3 max-w-2xl w-full mx-auto">
          {sections.map(section => (
            <section key={section.key} className="mb-5">
              <h2 className={`flex items-center gap-2 px-1 mb-2 text-xs font-bold uppercase tracking-widest ${section.color}`}>
                <UiIcon name={section.icon} line className="w-4 h-4" />{section.label}
                <span className="text-muted/70 font-normal normal-case tracking-normal">· {section.games.length} tracks</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {section.games.map(g => (
                  <TrackCard key={g} game={g} progress={progressOf(g)}
                    onOpen={() => setOpenGame(g)} onContinue={() => continueTrack(g)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {playing && track && track[0]?.game === playing.game && (
        <LevelPlayer
          key={`${playing.game}:${playing.index}`}
          track={track}
          index={playing.index}
          progress={progressOf(playing.game)}
          onLevel={i => setPlaying({ game: playing.game, index: i })}
          onClose={() => setPlaying(null)}
        />
      )}
    </div>
  )
}
