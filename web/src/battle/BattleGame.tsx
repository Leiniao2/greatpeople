// The battle board: cards, modals, the CPU opponent and the turn UI.  The
// Battle tab mounts it full screen; FightGame embeds it inside an Epic story
// with a lesson goal and a coach (see `embedded`).

import { useEffect, useCallback, useState, useRef } from 'react'
import type {
  Card, FollowerCard, EventCard, OnboardCard, LocationState,
  GameState, EventType, CardContrib, GameSummary, LifeStatus, PlayerState,
} from '@/types'
import { cardBackUrl, followerUrl, locationImageUrl, scenarioImageUrl } from '@/data/images'
import EraIcon from '@/components/EraIcon'
import {
  ALL_GP_CARDS, STATS, STAT_LABELS, ACHIEVEMENT_SPECS, getAchievementThreshold, followerFromId,
  FOLLOWER_IDENTITY_MATCH_BONUS, LEGACY_SLOTS, CITY_STATE_CHANCE, DEFAULT_CAREER_AGE,
  careerStartYear, deathYear, describeLegacyEffect, formatYear, getGPCard, lifeStatus, successorOptions,
  type GameAction,
} from './engine'

export const ERA_COLORS: Record<string, string> = {
  Ancient:     'bg-yellow-200/70 border-yellow-600/50',
  Medieval:    'bg-orange-200/70 border-orange-600/50',
  Renaissance: 'bg-purple-200/70 border-purple-600/50',
  Steam:       'bg-panel-2 border-line-2',
  Electricity: 'bg-blue-200/70 border-blue-600/50',
  Information: 'bg-cyan-200/70 border-cyan-600/50',
  Classical:   'bg-accent/15 border-accent/50',
}

export const ERA_TEXT: Record<string, string> = {
  Ancient:     'text-yellow-800',
  Medieval:    'text-orange-800',
  Renaissance: 'text-purple-800',
  Steam:       'text-ink-2',
  Electricity: 'text-blue-800',
  Information: 'text-cyan-800',
  Classical:   'text-accent',
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const figureName = (id: string) => getGPCard(id)?.figureName ?? id

/** The small "i" on a card face that opens its detail view. */
function InfoDot({ onClick }: { onClick: () => void }) {
  return (
    <div
      role="button"
      aria-label="Card details"
      onClick={e => { e.stopPropagation(); onClick() }}
      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-ink/70 flex items-center justify-center text-[8px] text-paper/90 cursor-pointer z-10 hover:bg-ink/70"
    >i</div>
  )
}

interface CompactCardProps {
  card: OnboardCard
  isCurrentPlayer: boolean
  isSelected: boolean
  onClick: () => void
  onInfo?: (card: Card, ticks?: number) => void
  onFollowerInfo?: (follower: FollowerCard) => void
  gpMap: Record<string, Card>
  followerTemplates: Record<string, FollowerCard>
}

function CompactCard({ card, isCurrentPlayer, isSelected, onClick, onInfo, onFollowerInfo, gpMap, followerTemplates }: CompactCardProps) {
  const gp = card.type === 'gp' ? gpMap[card.cardId] : null
  const follower = card.type === 'follower' ? followerTemplates[card.cardId] : null

  const isPrivate = !card.isPublic && !isCurrentPlayer
  const era = gp?.era ?? 'Electricity'
  const eraColor = ERA_COLORS[era] ?? ERA_COLORS.Electricity

  const borderCls = isSelected
    ? 'border-2 border-accent shadow-lg shadow-accent/30'
    : isCurrentPlayer
    ? 'border border-accent/40'
    : 'border border-indigo-500/30'

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col rounded-lg overflow-hidden w-14 h-20 transition-all duration-150
        ${isPrivate ? 'bg-paper-2 border-line' : eraColor} ${borderCls}
        ${isSelected ? 'scale-105' : 'hover:scale-[1.03]'}`}
    >
      {card.justDeployed && (
        <span className="absolute top-0.5 right-0.5 z-10 w-2 h-2 rounded-full bg-accent border border-black" />
      )}
      {card.achievementTicks > 0 && (() => {
        const threshold = gp ? getAchievementThreshold(gp.figureName) : 3
        const ready = card.achievementTicks >= threshold
        return (
          <span className={`absolute top-0.5 left-0.5 z-10 text-[7px] font-bold rounded px-0.5 ${ready ? 'bg-accent text-accent-fg' : 'bg-ink/50 text-accent'}`}>
            {card.achievementTicks}/{threshold}
          </span>
        )
      })()}

      {isPrivate ? (
        <div className="flex-1 w-full relative overflow-hidden">
          <img
            src={cardBackUrl(card.type === 'follower' ? 'follower' : 'gp')}
            alt="face down"
            className="w-full h-full object-cover object-center"
          />
        </div>
      ) : gp ? (
        <>
          <div className="flex-1 w-full relative overflow-hidden">
            <img
              src={gp.portraitUrl}
              alt={gp.figureName}
              className="w-full h-full object-cover object-top"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {onInfo && <InfoDot onClick={() => onInfo(gp, card.achievementTicks)} />}
          </div>
          <div className="w-full bg-black/75 px-0.5 py-0.5 shrink-0">
            <span className="text-[7px] text-ink leading-none truncate block">{gp.figureName.split(' ').pop()}</span>
            {gp.countries && gp.countries.length > 0 && (
              <span className="text-[6px] text-cyan-400/70 leading-none truncate block">{gp.countries[0]}</span>
            )}
          </div>
        </>
      ) : follower ? (
        <>
          <div className="flex-1 w-full relative overflow-hidden bg-indigo-950">
            <img
              src={followerUrl(follower.imageKey)}
              alt={follower.name}
              className="w-full h-full object-cover object-center"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {onFollowerInfo && <InfoDot onClick={() => onFollowerInfo(follower)} />}
          </div>
          <div className="w-full bg-ink/70 px-0.5 py-0.5 shrink-0">
            <span className="text-[7px] text-indigo-200 leading-none truncate block">{follower.name}</span>
            <span className="text-[6px] text-indigo-400">+{follower.bonus} {STAT_LABELS[follower.stat].slice(0, 3)}</span>
          </div>
        </>
      ) : null}

      {!isPrivate && !card.isPublic && gp && (
        <span className="absolute bottom-4 left-0.5 text-[6px] text-paper/80 bg-ink/50 rounded px-0.5">priv</span>
      )}
    </button>
  )
}

interface HandCardProps {
  cardId: string
  type: 'gp' | 'event' | 'follower'
  isSelected: boolean
  onClick: () => void
  onInfo?: () => void
  gpMap: Record<string, Card>
  eventCard?: EventCard
  followerCard?: FollowerCard
  /** Timeline games: a Great Person who is not yet born or too young cannot be deployed. */
  status?: LifeStatus
  statusLabel?: string
}

function HandCard({ cardId, type, isSelected, onClick, onInfo, gpMap, eventCard, followerCard, status, statusLabel }: HandCardProps) {
  const gp = type === 'gp' ? gpMap[cardId] : null
  const era = gp?.era ?? 'Steam'
  const eraColor = ERA_COLORS[era] ?? ERA_COLORS.Steam
  const borderCls = isSelected ? 'border-2 border-accent ring-2 ring-accent/30' : 'border border-line'

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col rounded-xl overflow-hidden w-18 h-28 transition-all duration-150 shrink-0
        ${eraColor} ${borderCls} ${isSelected ? 'scale-105' : 'hover:scale-[1.03]'}`}
      style={{ width: '4.5rem', height: '6.5rem' }}
    >
      {type === 'gp' && gp && (
        <>
          <div className="flex-1 w-full relative overflow-hidden">
            <img
              src={gp.portraitUrl}
              alt={gp.figureName}
              className="w-full h-full object-cover object-top"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {onInfo && <InfoDot onClick={onInfo} />}
            {status && status !== 'active' && (
              <div className="absolute inset-0 bg-ink/55 flex items-center justify-center p-0.5">
                <span className="text-[8px] text-paper font-semibold text-center leading-tight">{statusLabel}</span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
          <div className="w-full bg-ink/70 px-1 py-0.5 shrink-0">
            <div className="text-[8px] text-ink font-semibold leading-tight truncate">{gp.figureName}</div>
            <div className="text-[8px] text-muted truncate flex items-center">
              {gp.countries && gp.countries.length > 0 ? gp.countries[0] : <EraIcon era={gp.era} className="w-2.5 h-2.5" />}
            </div>
          </div>
        </>
      )}
      {type === 'event' && eventCard && (
        <div className="relative flex flex-col items-center justify-between h-full p-1.5 overflow-hidden">
          <img
            src={scenarioImageUrl(eventCard.name, eventCard.stat)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-80"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/40" />
          {onInfo && <InfoDot onClick={onInfo} />}
          <span className="relative text-[8px] text-purple-200 uppercase tracking-wide">Event</span>
          <span className="relative text-[9px] text-paper font-semibold leading-tight text-center drop-shadow">{eventCard.name}</span>
          <span className="relative text-[8px] text-purple-200 text-center">{eventCard.stat ? STAT_LABELS[eventCard.stat].slice(0, 3) : 'Hazard'}</span>
        </div>
      )}
      {type === 'follower' && followerCard && (
        <>
          <div className="flex-1 w-full relative overflow-hidden bg-indigo-950">
            <img
              src={followerUrl(followerCard.imageKey)}
              alt={followerCard.name}
              className="w-full h-full object-cover object-center"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {onInfo && <InfoDot onClick={onInfo} />}
            <div className="absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
          <div className="w-full bg-ink/70 px-1 py-0.5 shrink-0">
            <div className="text-[8px] text-indigo-200 font-semibold leading-tight truncate">{followerCard.name}</div>
            <div className="text-[8px] text-indigo-400">+{followerCard.bonus} {STAT_LABELS[followerCard.stat].slice(0, 3)}</div>
          </div>
        </>
      )}
    </button>
  )
}

// ─── Card Detail Modals ───────────────────────────────────────────────────────

export type CardDetail =
  | { kind: 'gp'; card: Card; ticks?: number; ownerId?: string }
  | { kind: 'follower'; follower: FollowerCard }
  | { kind: 'event'; event: EventCard }

/** Shared frame for every card's detail view: picture with the title over it, then the body. */
function DetailShell({ imageUrl, imageFit = 'object-top', title, subtitle, onClose, children }: {
  imageUrl: string
  imageFit?: string
  title: string
  subtitle: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-panel border border-line rounded-2xl overflow-hidden w-full max-w-xs shadow-2xl font-bold"
        onClick={e => e.stopPropagation()}
      >
        {/* Picture with name overlay */}
        <div className="relative w-full h-48 bg-paper-2">
          <img
            src={imageUrl}
            alt={title}
            className={`w-full h-full object-cover ${imageFit}`}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-ink/50 border border-line flex items-center justify-center text-paper/80 hover:text-paper text-sm transition-colors"
          >✕</button>
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <h2 className="text-paper text-lg leading-tight">{title}</h2>
            {subtitle}
          </div>
        </div>

        <div className="px-4 pt-3 pb-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

function DescriptionBox({ text }: { text: string }) {
  return (
    <div className="bg-accent/[0.07] border border-accent/20 rounded-xl px-3 py-2.5">
      <p className="text-[10px] text-accent/70 uppercase tracking-widest mb-1">Description</p>
      <p className="text-ink-2 text-xs leading-relaxed">{text}</p>
    </div>
  )
}

const EVENT_TYPE_LABEL: Record<EventType, string> = {
  local_event: 'Local Event',
  local_survival: 'Local Survival',
  global_competition: 'Global Competition',
  natural_hazard: 'Natural Hazard',
}

function EventDetailModal({ event, onClose }: { event: EventCard; onClose: () => void }) {
  return (
    <DetailShell
      imageUrl={scenarioImageUrl(event.name, event.stat)}
      imageFit="object-center"
      title={event.name}
      subtitle={<p className="text-sm text-purple-200">{EVENT_TYPE_LABEL[event.type]}</p>}
      onClose={onClose}
    >
      <div className="flex items-center justify-between bg-panel rounded-lg px-2.5 py-1.5">
        <span className="text-muted text-[11px]">Tests</span>
        <span className="text-sm text-ink-2">{event.stat ? STAT_LABELS[event.stat] : 'Weakest stat'}</span>
      </div>
      <DescriptionBox text={event.description} />
    </DetailShell>
  )
}

function FollowerDetailModal({ follower, onClose }: { follower: FollowerCard; onClose: () => void }) {
  const stat = STAT_LABELS[follower.stat]
  return (
    <DetailShell
      imageUrl={followerUrl(follower.imageKey)}
      imageFit="object-center"
      title={follower.name}
      subtitle={<p className="text-sm text-indigo-200">Follower</p>}
      onClose={onClose}
    >
      <div className="flex items-center justify-between bg-panel rounded-lg px-2.5 py-1.5">
        <span className="text-muted text-[11px]">{stat}</span>
        <span className="text-sm text-accent">+{follower.bonus}</span>
      </div>
      <DescriptionBox
        text={`Place at a location where you have a Great Person to add +${follower.bonus} ${stat} to your total there. If one of your Great People at that location is a ${follower.name}, it adds +${FOLLOWER_IDENTITY_MATCH_BONUS} instead.`}
      />
    </DetailShell>
  )
}

function CardDetailModal({ card, achievementTicks, owner, earned, onClose }: {
  card: Card; achievementTicks?: number; owner?: PlayerState; earned?: boolean; onClose: () => void
}) {
  const achSpec = ACHIEVEMENT_SPECS[card.figureName]
  const ticks = achievementTicks ?? 0
  const threshold = achSpec?.threshold ?? 1
  const career = careerStartYear(card, owner)

  return (
    <DetailShell
      imageUrl={card.portraitUrl}
      title={card.figureName}
      subtitle={<p className={`text-sm ${ERA_TEXT[card.era] ?? 'text-muted'}`}>{card.era} · {formatYear(card.born)}–{card.died == null ? 'living' : formatYear(card.died)}</p>}
      onClose={onClose}
    >

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {STATS.map(stat => {
          const val = card[stat]
          const highlight = val >= 80 ? 'text-accent' : val >= 60 ? 'text-ink-2' : 'text-muted'
          return (
            <div key={stat} className="flex items-center justify-between bg-panel rounded-lg px-2.5 py-1.5">
              <span className="text-muted text-[11px]">{STAT_LABELS[stat]}</span>
              <span className={`text-sm font-bold ${highlight}`}>{val}</span>
            </div>
          )
        })}
      </div>

      {/* Trait */}
      {card.trait && (
        <div className="bg-accent/[0.07] border border-accent/20 rounded-xl px-3 py-2.5">
          <p className="text-[10px] text-accent/70 uppercase tracking-widest mb-1">Trait</p>
          <p className="text-ink-2 text-xs leading-relaxed">{card.trait}</p>
        </div>
      )}

      {/* Life on the timeline */}
      <div className="bg-panel rounded-xl px-3 py-2 text-[11px] text-ink-2 leading-relaxed">
        Born {formatYear(card.born)} · career from {formatYear(career)} (age {career - card.born}{(card.careerAge ?? DEFAULT_CAREER_AGE) !== DEFAULT_CAREER_AGE ? ', an early start' : ''})
        {' '}· {card.died == null ? 'still living' : `dies ${formatYear(deathYear(card, owner))}`}
      </div>

      {/* Legacy (in place of the old achievement) */}
      <div className="bg-violet-800/10 border border-violet-800/40 rounded-xl px-3 py-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-violet-800 uppercase tracking-widest">Legacy · {card.legacy.name}</p>
          {earned ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent text-accent-fg">earned</span>
          ) : achievementTicks !== undefined && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ticks >= threshold ? 'bg-accent text-accent-fg' : 'bg-panel text-muted'}`}>
              {ticks} / {threshold}
            </span>
          )}
        </div>
        <p className="text-violet-900 text-xs leading-relaxed"><span className="font-semibold">Effect:</span> {describeLegacyEffect(card.legacy.effect)}</p>
        <p className="text-violet-900/80 text-[11px] leading-relaxed">
          <span className="font-semibold">Earned by:</span> winning {threshold} {STAT_LABELS[card.legacy.unlock.stat]} fight{threshold > 1 ? 's' : ''} against a worthy rival
          {card.achievement ? ` (${card.achievement.split(' — ')[1] ?? card.achievement})` : ''}.
        </p>
        {card.legacy.flavour && <p className="text-violet-900/70 text-[11px] italic">{card.legacy.flavour}</p>}
        {!earned && achievementTicks !== undefined && ticks >= threshold && (
          <p className="text-accent text-[10px] font-bold">★ Ready to claim!</p>
        )}
      </div>

      {/* Description */}
      {card.lore && <DescriptionBox text={card.lore} />}
    </DetailShell>
  )
}

// ─── Lobby Component ──────────────────────────────────────────────────────────
export const PLAYER_COLORS = [
  { text: 'text-accent',   bg: 'bg-accent/15',   border: 'border-accent/40',   ring: 'border-accent/40',   dot: 'bg-accent'   },
  { text: 'text-indigo-400',  bg: 'bg-indigo-500/15',  border: 'border-indigo-500/40',  ring: 'border-indigo-500/40',  dot: 'bg-indigo-400'  },
  { text: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40', ring: 'border-emerald-500/40', dot: 'bg-emerald-400' },
  { text: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/40',  ring: 'border-violet-500/40',  dot: 'bg-violet-400'  },
  { text: 'text-rose-400',    bg: 'bg-rose-500/15',    border: 'border-rose-500/40',    ring: 'border-rose-500/40',    dot: 'bg-rose-400'    },
]

// ─── CPU AI helpers ───────────────────────────────────────────────────────────

// Cards whose trait actively benefits from being revealed (public):
// - Al-Khwarizmi: gains bonuses from other *revealed* GPs on the field
// - Aspasia: her bonus to Pericles is positional, but she wants Pericles visible
// - Edmund Hillary: gains 2 ticks per win — worth getting into events fast
// - Sargon I: extra achievement tick on defeat — needs to be in play publicly
// - Audrey Hepburn: global Reputation boost to all allies (telegraphs value)
// - Mani: Belief/Intelligence scale with distinct eras on field — being revealed helps other Manis
const PUBLIC_TRAIT_FIGURES = new Set([
  'Al-Khwarizmi', 'Edmund Hillary', 'Sargon I', 'Audrey Hepburn', 'Mani',
])

// Cards whose trait benefits most from staying *hidden* (private):
// - Belisarius: trait activates when outnumbered — surprise value is high
// - Miyamoto Musashi: attack-twice trait is more dangerous unseen
// - Mao Zedong: relocate-on-death trait is a surprise escape
const PRIVATE_TRAIT_FIGURES = new Set([
  'Belisarius', 'Miyamoto Musashi', 'Mao Zedong',
])

function cpuShouldDeployPublic(gp: Card, allLocations: LocationState[], gpMap: Record<string, Card>): boolean {
  if (PRIVATE_TRAIT_FIGURES.has(gp.figureName)) return false
  if (PUBLIC_TRAIT_FIGURES.has(gp.figureName)) return true

  // Go public if another revealed allied GP benefits from it (Al-Khwarizmi on the board)
  const alKhwarizmiDeployed = allLocations.some(loc =>
    loc.cards.some(c => c.type === 'gp' && c.isPublic && gpMap[c.cardId]?.figureName === 'Al-Khwarizmi')
  )
  if (alKhwarizmiDeployed) return Math.random() < 0.7

  // High-stat cards have less to hide — they win on raw numbers
  const total = STATS.reduce((sum, s) => sum + gp[s], 0)
  if (total >= 450) return Math.random() < 0.60
  if (total >= 380) return Math.random() < 0.35
  return Math.random() < 0.20
}

// ─── Game Board Component ─────────────────────────────────────────────────────

type SelectionMode = 'none' | 'deploy-gp' | 'add-follower' | 'select-onboard' | 'attack-select-target' | 'move-target' | 'start-event'

interface Selection {
  mode: SelectionMode
  handCardId?: string
  handCardIdx?: number
  handCardType?: 'gp' | 'event' | 'follower'
  handFollowerId?: string
  onboardInstanceId?: string
}

// ─── Summary Modal ─────────────────────────────────────────────────────────────

function ContribRow({ c }: { c: CardContrib }) {
  const hasBonus = c.traitBonus !== 0 || c.followerBonus !== 0 || c.locationBonus !== 0
  const portrait = c.portraitUrl ?? (c.imageKey ? followerUrl(c.imageKey) : null)
  return (
    <div className="flex items-center gap-2 py-1 border-b border-line last:border-0">
      {portrait ? (
        <img src={portrait} alt={c.name} className="w-7 h-7 rounded-full object-cover shrink-0 border border-line" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-panel-2 shrink-0 flex items-center justify-center text-xs">
          {c.type === 'follower' ? '👥' : c.type === 'legacy' ? '🏛' : '👤'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-ink-2 font-medium truncate">{c.name}</span>
          {c.type === 'follower' && <span className="text-[9px] text-indigo-400 bg-indigo-900/40 px-1 rounded">follower</span>}
          {c.type === 'legacy' && <span className="text-[9px] text-violet-800 bg-violet-800/10 px-1 rounded">legacy</span>}
        </div>
        {hasBonus && (
          <div className="flex gap-2 mt-0.5">
            {c.traitBonus !== 0 && (
              <span className="text-[9px] text-accent">{c.type === 'legacy' ? 'legacy' : 'trait'} {c.traitBonus > 0 ? '+' : ''}{c.traitBonus}</span>
            )}
            {c.followerBonus !== 0 && (
              <span className="text-[9px] text-indigo-400">follower +{c.followerBonus}</span>
            )}
            {c.locationBonus !== 0 && (
              <span className="text-[9px] text-yellow-300">terrain +{c.locationBonus}</span>
            )}
          </div>
        )}
      </div>
      <span className="text-sm font-bold text-ink shrink-0">
        {c.baseStat + c.traitBonus + c.followerBonus + c.locationBonus}
      </span>
    </div>
  )
}

function SummaryModal({ summary, onDismiss }: { summary: GameSummary; onDismiss: () => void }) {
  if (summary.kind === 'combat') {
    const s = summary
    const resultColor = s.result === 'attacker' ? 'text-emerald-400' : s.result === 'defender' ? 'text-red-400' : 'text-muted'
    const resultLabel = s.result === 'attacker' ? 'Attacker wins!' : s.result === 'defender' ? 'Defender holds!' : 'Draw'
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/70 p-4">
        <div className="bg-panel border border-line rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-red-900/20 border-b border-line px-4 py-3 text-center">
            <div className="text-lg">⚔️</div>
            <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Battle Report</h3>
            <p className="text-muted text-xs mt-0.5">{s.locationName} · {STAT_LABELS[s.stat]}</p>
            {s.locationAbility && (
              <p className="text-yellow-300/80 text-[10px] mt-1 italic">{s.locationAbility}</p>
            )}
          </div>

          <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
            {/* Attacker side */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] uppercase tracking-widest text-muted">Attacker — {s.attacker.playerName}</span>
                <span className="text-sm font-bold text-emerald-400">{s.attacker.total}</span>
              </div>
              {s.attacker.cards.map((c, i) => <ContribRow key={i} c={c} />)}
            </div>

            <div className="border-t border-line" />

            {/* Defender side */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] uppercase tracking-widest text-muted">Defender — {s.defender.playerName}</span>
                <span className="text-sm font-bold text-indigo-400">{s.defender.total}</span>
              </div>
              {s.defender.cards.map((c, i) => <ContribRow key={i} c={c} />)}
            </div>
          </div>

          {/* Outcome */}
          <div className="border-t border-line px-4 py-3 text-center space-y-1">
            <p className={`font-bold text-sm ${resultColor}`}>{resultLabel}</p>
            {s.kill && <p className="text-xs text-red-400">Defender's card eliminated!</p>}
          </div>

          <div className="px-4 pb-4">
            <button onClick={onDismiss}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-panel-2 hover:bg-line text-ink transition-all">
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (summary.kind === 'timeskip') {
    const t = summary
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/70 p-4">
        <div className="bg-panel border border-line rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
          <div className="bg-accent/10 border-b border-line px-4 py-3 text-center">
            <div className="text-lg">⏳</div>
            <h3 className="font-bold text-ink text-sm uppercase tracking-wide">Time passes</h3>
            <p className="text-muted text-xs mt-0.5">{formatYear(t.fromYear)} → {formatYear(t.toYear)} · {t.toYear - t.fromYear} years</p>
          </div>
          <div className="p-4 max-h-[60vh] overflow-y-auto">
            <p className="text-[11px] text-muted mb-2">None of your Great People were in their careers, so history moved on. Computer players' Great People lived out these years.</p>
            {t.lines.length === 0 ? <p className="text-xs text-ink-2">Nothing of note happened.</p> : (
              <ul className="space-y-1">{t.lines.map((l, i) => <li key={i} className="text-xs text-ink-2 leading-snug">{l}</li>)}</ul>
            )}
          </div>
          <div className="px-4 pb-4">
            <button onClick={onDismiss} className="w-full py-2.5 rounded-xl text-sm font-bold bg-panel-2 hover:bg-line text-ink transition-all">Continue</button>
          </div>
        </div>
      </div>
    )
  }

  // EventSummary
  const s = summary
  const isGlobal = s.eventType === 'global_competition'
  const headerColor = isGlobal ? 'bg-purple-900/20' : s.eventType === 'local_survival' ? 'bg-red-900/20' : 'bg-orange-900/20'
  const icon = isGlobal ? '🌍' : s.eventType === 'local_survival' ? '☠️' : '⚡'

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/70 p-4">
      <div className="bg-panel border border-line rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className={`${headerColor} border-b border-line px-4 py-3 text-center`}>
          <div className="text-lg">{icon}</div>
          <h3 className="font-bold text-ink text-sm uppercase tracking-wide">{s.eventName}</h3>
          <p className="text-muted text-xs mt-0.5">
            {s.locationName}{s.stat ? ` · ${STAT_LABELS[s.stat]}` : ''}
            {s.threshold > 0 ? ` · threshold ${s.threshold}` : ''}
          </p>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {s.results.map((r, ri) => (
            <div key={ri}>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-muted">{r.playerName}</span>
                  {!isGlobal && (
                    <span className={`text-[9px] font-bold px-1.5 rounded ${r.survived ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}`}>
                      {r.survived ? 'Survived' : 'Eliminated'}
                    </span>
                  )}
                  {isGlobal && s.winnerName === r.playerName && (
                    <span className="text-[9px] font-bold px-1.5 rounded bg-purple-900/50 text-purple-300">Winner</span>
                  )}
                </div>
                <span className="text-sm font-bold text-ink">{r.total}</span>
              </div>
              {r.cards.map((c, i) => <ContribRow key={i} c={c} />)}
              {ri < s.results.length - 1 && <div className="mt-3 border-t border-line" />}
            </div>
          ))}
        </div>

        <div className="px-4 pb-4 pt-2">
          <button onClick={onDismiss}
            className="w-full py-2.5 rounded-xl text-sm font-bold bg-panel-2 hover:bg-line text-ink transition-all">
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

export interface BattleGameProps {
  gameState: GameState
  dispatch: React.Dispatch<GameAction>
  onExit: () => void
  /** Inside a story: no orientation lock, no full-screen chrome, no Exit button, no end screen. */
  embedded?: boolean
  /** Rendered between the header and the board; the fight lessons put their coach here. */
  banner?: React.ReactNode
}

function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-ink/70 p-4" onClick={onClose}>
      <div className="bg-panel border border-line rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <span className="text-sm font-bold text-ink tracking-wide">📖 How to Play</span>
          <button onClick={onClose} className="text-muted hover:text-ink text-lg leading-none transition-colors">✕</button>
        </div>
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto text-sm">
          <section>
            <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1.5">Objective</p>
            <p className="text-ink-2 leading-relaxed">There is no points race: the game runs to <span className="text-accent font-bold">the end of history</span> ({formatYear(2030)}, or sooner if every lineage has ended), and the player with <span className="text-accent font-bold">the most legacies</span> wins. If all your lineages end first, the computer plays history out and the legacies are compared then.</p>
          </section>
          <section>
            <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1.5">Real history</p>
            <ul className="space-y-1.5 text-ink-2 leading-relaxed">
              <li>One round is <span className="text-ink font-semibold">one year</span> in every era. The game opens on a real year.</li>
              <li>A Great Person appears in the year they were born and can be played from their <span className="text-ink font-semibold">career start</span> (age {DEFAULT_CAREER_AGE}, earlier for prodigies such as Michael Jackson).</li>
              <li>When a Great Person dies of old age or is killed, choose a <span className="text-ink font-semibold">successor</span> born later than the current year. The computer does the same.</li>
              <li><span className="text-ink font-semibold">Retire</span> a Great Person at any time on your turn. They leave play, but their successor only comes at their real death year.</li>
              <li>When none of your Great People is in their career, time skips ahead and the computer plays out those years.</li>
            </ul>
          </section>
          <section>
            <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1.5">On Your Turn</p>
            <ul className="space-y-1.5 text-ink-2 leading-relaxed">
              <li><span className="text-ink font-semibold">Deploy</span> — Play one Great Person in their career from your hand to any location.</li>
              <li><span className="text-ink font-semibold">Add Follower</span> — Place a follower at a location where you have a Great Person.</li>
              <li><span className="text-ink font-semibold">Move</span> — Relocate one of your cards to a different location.</li>
              <li><span className="text-ink font-semibold">Trigger Event</span> — Start an event at a location where you have a Great Person that was not deployed this turn.</li>
              <li><span className="text-ink font-semibold">Attack</span> — During a Local Event, challenge a rival's card.</li>
              <li><span className="text-ink font-semibold">Retrieve</span> — Return one of your cards from the board to your hand.</li>
              <li><span className="text-ink font-semibold">Legacy</span> — Switch one legacy into or out of your {LEGACY_SLOTS} slots.</li>
            </ul>
          </section>
          <section>
            <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1.5">Events and city states</p>
            <ul className="space-y-1.5 text-ink-2 leading-relaxed">
              <li><span className="text-ink font-semibold">⚔ Local Event</span> — Compare your total stat vs. rivals. Winner may attack the loser's card.</li>
              <li><span className="text-ink font-semibold">☠ Local Survival</span> — Each round, a player whose cards here total less than 5 in that stat loses them.</li>
              <li><span className="text-ink font-semibold">🏆 Global Competition</span> — Player with the highest total stat across all public cards earns a prize bundle.</li>
              <li><span className="text-ink font-semibold">🌊 Natural Hazard</span> — A player whose weakest stat here totals less than 5 loses their cards here.</li>
              <li>Each year a city with no state has a {Math.round(CITY_STATE_CHANCE * 100)}% chance to fall into a random event, survival or hazard of its own for a few years.</li>
            </ul>
          </section>
          <section>
            <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1.5">Legacies</p>
            <p className="text-ink-2 leading-relaxed">A Great Person's legacy is earned by winning fights in its stat (shown on the card). You keep every legacy for the rest of the game, even after that person dies, but only {LEGACY_SLOTS} are in effect at once.</p>
          </section>
        </div>
        <div className="px-4 pb-4 pt-1">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-bold bg-panel-2 hover:bg-line text-ink transition-all">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

export function BattleGame({ gameState, dispatch, onExit, embedded = false, banner }: BattleGameProps) {
  const [selection, setSelection] = useState<Selection>({ mode: 'none' })
  const [attackKill, setAttackKill] = useState(false)
  const [showRewardDialog, setShowRewardDialog] = useState(false)
  const [globalCompWinner] = useState<string | null>(null)
  const [cardDetail, setCardDetail] = useState<CardDetail | null>(null)
  const [showRules, setShowRules] = useState(false)
  // Hot-seat: shown between human turns so previous player can't see next player's hand
  const [awaitingHandoff, setAwaitingHandoff] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const computerTurnRef = useRef(false)

  // Lock landscape orientation on mobile when game board is active
  useEffect(() => {
    if (embedded) return
    const lock = async () => {
      try { await (screen.orientation as { lock?: (o: string) => Promise<void> }).lock?.('landscape') } catch { /* not supported */ }
    }
    lock()
    return () => { try { screen.orientation.unlock() } catch { /* ignore */ } }
  }, [embedded])

  const currentPlayer = gameState.players[gameState.currentPlayerIdx]
  const isMyTurn = !currentPlayer.isComputer

  // Build lookup maps
  const gpMap: Record<string, Card> = {}
  for (const c of ALL_GP_CARDS) gpMap[c.id] = c

  const followerMap: Record<string, FollowerCard> = {}
  for (const p of gameState.players) {
    for (const f of p.followerHand) followerMap[f.id] = f
  }
  // Deployed followers are removed from followerHand — rebuild from template
  for (const loc of gameState.locations) {
    for (const oc of loc.cards) {
      if (oc.type === 'follower' && !followerMap[oc.cardId]) {
        const f = followerFromId(oc.cardId)
        if (f) followerMap[oc.cardId] = f
      }
    }
  }

  const deployableHand = currentPlayer.gpHand.filter(id => lifeStatus(gameState, currentPlayer.id, id) === 'active')
  const canDeployGP = !gameState.turnActions.deployedGP && deployableHand.length > 0
  const isTimeline = !!gameState.setup.timeline
  /** Timeline games are decided by legacies at the end of history; the timeless lessons by points. */
  const score = (p: PlayerState) => (isTimeline ? p.legacies.length : p.winningPoints)
  const statusLabel = (p: PlayerState, id: string): string => {
    const card = gpMap[id]
    const st = lifeStatus(gameState, p.id, id)
    if (!card) return ''
    if (st === 'unborn') return `Born ${formatYear(card.born)}`
    if (st === 'youth') return `Career ${formatYear(careerStartYear(card, p))}`
    return ''
  }
  const canAddFollower = !gameState.turnActions.addedFollower && currentPlayer.followerHand.length > 0
  const canEndTurn = gameState.phase === 'playing'

  const selectedOnboard = selection.onboardInstanceId
    ? gameState.locations.flatMap(l => l.cards).find(c => c.instanceId === selection.onboardInstanceId) ?? null
    : null

  const canClaimAchievement = selectedOnboard?.type === 'gp'
    && selectedOnboard.playerId === currentPlayer.id
    && !currentPlayer.legacies.includes(selectedOnboard.cardId)
    && selectedOnboard.achievementTicks >= getAchievementThreshold(gpMap[selectedOnboard.cardId]?.figureName ?? '')
    && selectedOnboard.isPublic
    && !gameState.turnActions.actedCards.includes(selectedOnboard.instanceId)

  const canRetrieve = selectedOnboard
    && selectedOnboard.playerId === currentPlayer.id
    && !selectedOnboard.justDeployed
    && !gameState.turnActions.actedCards.includes(selectedOnboard.instanceId)

  // Retire: the selected Great Person on the board, or the one picked in hand.
  const retireTarget = !isTimeline ? null
    : selectedOnboard?.type === 'gp' && selectedOnboard.playerId === currentPlayer.id ? selectedOnboard.cardId
    : selection.mode === 'deploy-gp' && selection.handCardId && ['active', 'youth'].includes(lifeStatus(gameState, currentPlayer.id, selection.handCardId)) ? selection.handCardId
    : null

  // A human with a successor to choose (computer players choose at once).
  const choosing = gameState.players.find(p => !p.isComputer && p.pendingSuccessors.length > 0) ?? null

  const canToggleVis = selectedOnboard
    && selectedOnboard.playerId === currentPlayer.id
    && !selectedOnboard.justDeployed
    && !gameState.turnActions.actedCards.includes(`vis-${selectedOnboard.instanceId}`)

  // CPU AI
  useEffect(() => {
    if (!currentPlayer.isComputer || gameState.phase !== 'playing') return
    if (computerTurnRef.current) return
    computerTurnRef.current = true

    const timer = setTimeout(() => {
      // 1. Deploy best GP — pick strongest card, choose location smartly, decide public/private per trait
      const cpuDeployable = currentPlayer.gpHand.filter(id => lifeStatus(gameState, currentPlayer.id, id) === 'active')
      if (cpuDeployable.length > 0 && !gameState.turnActions.deployedGP) {
        const bestCard = cpuDeployable.reduce((best, id) => {
          const gp = gpMap[id]
          if (!gp) return best
          const bestGp = gpMap[best]
          if (!bestGp) return id
          const gpTotal = STATS.reduce((s, k) => s + gp[k], 0)
          const bestTotal = STATS.reduce((s, k) => s + bestGp[k], 0)
          return gpTotal > bestTotal ? id : best
        }, cpuDeployable[0])

        // Spread out: prefer empty locations, break ties by opponent presence
        const randomStart = gameState.locations[Math.floor(Math.random() * gameState.locations.length)]
        const targetLoc = gameState.locations.reduce((best, loc) => {
          const myCards = loc.cards.filter(c => c.playerId === currentPlayer.id).length
          const bestMyCards = best.cards.filter(c => c.playerId === currentPlayer.id).length
          if (myCards !== bestMyCards) return myCards < bestMyCards ? loc : best
          const oppCount = loc.cards.filter(c => c.playerId !== currentPlayer.id).length
          const bestOppCount = best.cards.filter(c => c.playerId !== currentPlayer.id).length
          if (oppCount !== bestOppCount) return oppCount > bestOppCount ? loc : best
          return Math.random() < 0.5 ? loc : best
        }, randomStart)

        const gp = gpMap[bestCard]
        const isPublic = gp ? cpuShouldDeployPublic(gp, gameState.locations, gpMap) : false
        dispatch({ type: 'DEPLOY_GP', cardId: bestCard, locationId: targetLoc.id, isPublic })
      }

      // 2. Add follower — prefer location matching follower's stat to the strongest allied GP there
      if (currentPlayer.followerHand.length > 0 && !gameState.turnActions.addedFollower) {
        const locsWithGP = gameState.locations.filter(l =>
          l.cards.some(c => c.type === 'gp' && c.playerId === currentPlayer.id)
        )
        if (locsWithGP.length > 0) {
          // Pick the follower whose stat best complements the location with the most opponents
          const follower = (() => {
            const contested = locsWithGP.find(l => l.activeEvent?.stat) ?? locsWithGP[0]
            const eventStat = contested.activeEvent?.stat
            if (eventStat) {
              const match = currentPlayer.followerHand.find(f => f.stat === eventStat)
              if (match) return match
            }
            return currentPlayer.followerHand[0]
          })()

          const locWithGP = locsWithGP.reduce((best, loc) => {
            // Prefer location where follower's stat matches an active event
            const eventMatch = loc.activeEvent?.stat === follower.stat ? 1 : 0
            const bestEventMatch = best.activeEvent?.stat === follower.stat ? 1 : 0
            if (eventMatch !== bestEventMatch) return eventMatch > bestEventMatch ? loc : best
            const myCards = loc.cards.filter(c => c.playerId === currentPlayer.id).length
            const bestMyCards = best.cards.filter(c => c.playerId === currentPlayer.id).length
            return myCards < bestMyCards ? loc : best
          }, locsWithGP[0])

          dispatch({ type: 'ADD_FOLLOWER', followerId: follower.id, locationId: locWithGP.id, instanceId: follower.id })
        }
      }

      // 3. Visibility management — reveal cards that need to be public to claim achievement,
      //    or whose trait prefers being seen; hide cards where surprise still has value
      let toggled = false
      for (const loc of gameState.locations) {
        if (toggled) break
        for (const oc of loc.cards) {
          if (oc.type !== 'gp' || oc.playerId !== currentPlayer.id || oc.justDeployed) continue
          if (gameState.turnActions.actedCards.includes(`vis-${oc.instanceId}`)) continue
          const gp = gpMap[oc.cardId]
          if (!gp) continue
          const threshold = getAchievementThreshold(gp.figureName)

          // Priority 1: must go public to claim achievement at or near threshold
          if (!oc.isPublic && oc.achievementTicks >= threshold - 1) {
            dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: oc.instanceId })
            toggled = true
            break
          }

          // Priority 2: trait-preferred-public card that is still private — reveal with some probability
          if (!oc.isPublic && PUBLIC_TRAIT_FIGURES.has(gp.figureName) && Math.random() < 0.55) {
            dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: oc.instanceId })
            toggled = true
            break
          }

          // Priority 3: strong card (>420 total) in a contested location — go public to use event combat
          if (!oc.isPublic) {
            const total = STATS.reduce((s, k) => s + gp[k], 0)
            const hasEvent = loc.activeEvent?.type === 'local_event'
            const outnumbered = loc.cards.filter(c => c.playerId !== currentPlayer.id).length >
                                loc.cards.filter(c => c.playerId === currentPlayer.id).length
            if (total >= 420 && hasEvent && !outnumbered && Math.random() < 0.65) {
              dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: oc.instanceId })
              toggled = true
              break
            }
          }

          // Priority 4: already public but private-trait card with no pending achievement — hide again
          if (oc.isPublic && PRIVATE_TRAIT_FIGURES.has(gp.figureName) && oc.achievementTicks < threshold - 1 && Math.random() < 0.4) {
            dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: oc.instanceId })
            toggled = true
            break
          }
        }
      }

      // 4. Claim achievement for any ready public GP
      for (const loc of gameState.locations) {
        for (const oc of loc.cards) {
          if (
            oc.type === 'gp' &&
            oc.playerId === currentPlayer.id &&
            oc.isPublic &&
            oc.achievementTicks >= getAchievementThreshold(gpMap[oc.cardId]?.figureName ?? '') &&
            !currentPlayer.legacies.includes(oc.cardId) &&
            !gameState.turnActions.actedCards.includes(oc.instanceId)
          ) {
            dispatch({ type: 'CLAIM_ACHIEVEMENT', instanceId: oc.instanceId })
          }
        }
      }

      dispatch({ type: 'END_TURN' })
      computerTurnRef.current = false
    }, 1200)

    return () => {
      clearTimeout(timer)
      computerTurnRef.current = false
    }
  }, [currentPlayer.id, currentPlayer.isComputer, gameState.phase, gameState.turnActions])

  const handleLocationTap = useCallback((locId: string) => {
    if (!isMyTurn) return
    if (selection.mode === 'deploy-gp' && selection.handCardId) {
      dispatch({ type: 'DEPLOY_GP', cardId: selection.handCardId, locationId: locId, isPublic: false })
      setSelection({ mode: 'none' })
    } else if (selection.mode === 'add-follower' && selection.handFollowerId) {
      dispatch({ type: 'ADD_FOLLOWER', followerId: selection.handFollowerId, locationId: locId, instanceId: selection.handFollowerId })
      setSelection({ mode: 'none' })
    } else if (selection.mode === 'move-target' && selection.onboardInstanceId) {
      dispatch({ type: 'MOVE_CARD', instanceId: selection.onboardInstanceId, toLocationId: locId })
      setSelection({ mode: 'none' })
    } else if (selection.mode === 'start-event' && selection.handCardIdx !== undefined) {
      dispatch({ type: 'START_EVENT', eventCardIdx: selection.handCardIdx, locationId: locId })
      setSelection({ mode: 'none' })
    }
  }, [selection, dispatch, isMyTurn])

  const handleOnboardCardTap = useCallback((oc: OnboardCard, _locId: string) => {
    if (!isMyTurn) return

    if (selection.mode === 'attack-select-target' && selection.onboardInstanceId) {
      // Attack
      dispatch({ type: 'ATTACK', myInstanceId: selection.onboardInstanceId, theirInstanceId: oc.instanceId, kill: attackKill })
      setSelection({ mode: 'none' })
      return
    }

    if (oc.playerId === currentPlayer.id) {
      if (selection.onboardInstanceId === oc.instanceId) {
        setSelection({ mode: 'none' })
      } else {
        setSelection({ mode: 'select-onboard', onboardInstanceId: oc.instanceId })
      }
    } else {
      // Tapped opponent's card — if we have an onboard card selected, set up attack
      if (selection.onboardInstanceId) {
        dispatch({ type: 'ATTACK', myInstanceId: selection.onboardInstanceId, theirInstanceId: oc.instanceId, kill: attackKill })
        setSelection({ mode: 'none' })
      }
    }
  }, [selection, attackKill, dispatch, currentPlayer.id, isMyTurn])

  const handleHandCardTap = useCallback((cardId: string, cardType: 'gp' | 'event' | 'follower', idx: number, followerId?: string) => {
    if (!isMyTurn) return
    if (cardType === 'gp') {
      if (selection.handCardId === cardId) {
        setSelection({ mode: 'none' })
      } else {
        setSelection({ mode: 'deploy-gp', handCardId: cardId })
      }
    } else if (cardType === 'event') {
      if (selection.handCardIdx === idx) {
        setSelection({ mode: 'none' })
      } else {
        setSelection({ mode: 'start-event', handCardIdx: idx })
      }
    } else if (cardType === 'follower' && followerId) {
      if (selection.handFollowerId === followerId) {
        setSelection({ mode: 'none' })
      } else {
        setSelection({ mode: 'add-follower', handFollowerId: followerId })
      }
    }
  }, [selection, isMyTurn])


  const getEventBadgeColor = (type: EventType) => {
    if (type === 'local_event') return 'bg-orange-500/80'
    if (type === 'local_survival') return 'bg-red-600/80'
    if (type === 'global_competition') return 'bg-purple-600/80'
    return 'bg-yellow-600/80'
  }

  if (gameState.phase === 'ended' && gameState.winner) {
    if (embedded) return null
    const winner = gameState.players.find(p => p.id === gameState.winner)
    return (
      <div className="relative min-h-screen bg-paper flex flex-col items-center justify-center p-6">
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute inset-0 bg-accent/5 blur-[160px]" />
        </div>
        <div className="relative z-10 text-center max-w-sm">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="font-display text-3xl font-bold tracking-wide text-ink uppercase mb-2">Game Over!</h2>
          <p className="text-accent text-xl font-bold mb-6">{winner?.name} wins!</p>
          <div className="bg-paper-2 border border-line rounded-2xl p-4 mb-6">
            {[...gameState.players].sort((a, b) => score(b) - score(a)).map(p => (
              <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-line last:border-0">
                <span className="text-ink-2 text-sm">{p.name}</span>
                <span className={`font-bold text-sm ${p.id === gameState.winner ? 'text-accent' : 'text-muted'}`}>
                  {score(p)} {isTimeline ? `legac${score(p) === 1 ? 'y' : 'ies'}` : 'pts'}
                </span>
              </div>
            ))}
          </div>
          <button onClick={onExit}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-accent-fg bg-accent hover:bg-accent-hover transition-all shadow-lg shadow-accent/25">
            Play Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative bg-paper flex flex-col overflow-hidden select-none ${embedded ? '' : 'min-h-screen land:h-[100dvh] land:min-h-0'}`}>
      {!embedded && (
        <div className="pointer-events-none fixed inset-0">
          <div className="absolute top-1/3 left-1/4 w-96 h-96 rounded-full bg-line/40 blur-[120px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-accent/6 blur-[120px]" />
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 px-4 py-2 land:py-1 flex items-center gap-3 border-b border-line bg-black/20 shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-muted uppercase tracking-widest shrink-0">
              {isTimeline ? <><span className="text-ink font-bold">{formatYear(gameState.year)}</span> · Year {gameState.year - gameState.startYear + 1}</> : <>Round {gameState.round}</>}
            </span>
            <span className="text-ink/20">·</span>
            <span className={`text-xs font-bold truncate ${PLAYER_COLORS[gameState.currentPlayerIdx % 5].text}`}>
              {currentPlayer.name}{currentPlayer.isComputer ? ' (CPU)' : "'s Turn"}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {gameState.players.map((p, idx) => {
              const color = PLAYER_COLORS[idx % 5]
              const isActive = idx === gameState.currentPlayerIdx
              return (
                <div key={p.id}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all
                    ${isActive ? `${color.bg} ${color.border} border` : 'opacity-50'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
                  <span className={`font-medium ${color.text}`}>{p.name.split(' ')[0]}</span>
                  <span className={`font-bold ${color.text}`} title={isTimeline ? 'Legacies earned' : 'Winning points'}>{score(p)}{isTimeline ? ' 🏛' : '★'}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setShowRules(true)} className="text-muted hover:text-accent text-base transition-colors px-2" title="Rules">📖</button>
          {!embedded && <button onClick={onExit} className="text-muted/80 hover:text-muted text-xs transition-colors px-2">Exit</button>}
        </div>
      </div>
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      {/* The board is laid out for a phone held sideways. */}
      {!embedded && (
        <div className="hidden phone-portrait:flex fixed inset-0 z-[300] bg-paper flex-col items-center justify-center gap-4 p-8 text-center">
          <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true" className="text-accent animate-pulse">
            <rect x="24" y="10" width="24" height="44" rx="4" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.35" />
            <rect x="10" y="34" width="52" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M52 14 a14 14 0 0 1 8 14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            <path d="M56 26 l4 3 l3 -4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="font-display text-lg font-bold text-ink uppercase tracking-wide">Turn your phone sideways</p>
          <p className="text-sm text-muted max-w-xs">The Fight Arena is played in landscape, so every city and your whole hand fit on screen.</p>
        </div>
      )}
      {banner}

      {/* Landscape phones: board and hand on the left, actions on the right. */}
      <div className="flex flex-col flex-1 min-h-0 land:flex-row">
      <div className="flex flex-col min-w-0 land:flex-1 land:overflow-y-auto">
      {/* Board: Locations */}
      <div className="relative z-10 flex-shrink-0 overflow-x-auto py-2 px-3 border-b border-line">
        <div className="flex gap-2 justify-center min-w-full w-max mx-auto">
          {gameState.locations.map(loc => {
            const isLocationTarget = selection.mode === 'move-target' || selection.mode === 'deploy-gp' || selection.mode === 'add-follower' || selection.mode === 'start-event'

            return (
              <div
                key={loc.id}
                onClick={() => handleLocationTap(loc.id)}
                className={`relative rounded-xl border p-2 w-40 cursor-pointer transition-all duration-150 overflow-hidden
                  ${ERA_COLORS[loc.era] ?? 'bg-paper-2 border-line'}
                  ${isLocationTarget ? 'border-accent/60 ring-1 ring-accent/30' : ''}`}
              >
                {/* Location background image */}
                {loc.imageKey && (
                  <div className="absolute inset-0 pointer-events-none">
                    <img
                      src={locationImageUrl(loc.imageKey) ?? undefined}
                      alt=""
                      className="w-full h-full object-cover opacity-25"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-paper-2/40 via-transparent to-paper-2/70" />
                  </div>
                )}
                {/* Location name */}
                <div className="relative mb-1">
                  <p className={`text-[10px] font-bold truncate ${ERA_TEXT[loc.era] ?? 'text-ink-2'}`}>{loc.name}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <EraIcon era={loc.era} className="w-3 h-3 text-muted/80" />
                    {loc.countries && loc.countries.length > 0 && (
                      <p className="text-[9px] text-muted">{loc.countries.join(', ')}</p>
                    )}
                  </div>
                </div>

                {/* Active event badge */}
                {loc.activeEvent && (
                  <div className={`relative text-[8px] text-ink px-1 py-0.5 rounded mb-1 truncate ${getEventBadgeColor(loc.activeEvent.type)}`}
                    title={loc.activeEvent.origin === 'city' ? `The city fell into this state by itself (${loc.eventRoundsLeft} year${loc.eventRoundsLeft === 1 ? '' : 's'} left)` : undefined}>
                    {loc.activeEvent.origin === 'city' ? '🏙 ' : ''}{loc.activeEvent.name}{loc.activeEvent.origin === 'city' ? ` · ${loc.eventRoundsLeft}y` : ''}
                  </div>
                )}

                {/* Cards per player */}
                {gameState.players.map((p, pidx) => {
                  const playerCards = loc.cards.filter(c => c.playerId === p.id)
                  const pColor = PLAYER_COLORS[pidx % 5]
                  if (playerCards.length === 0) return (
                    <div key={p.id} className="relative mb-1 h-4 flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pColor.dot} opacity-30`} />
                      <span className="text-[9px] text-muted/60 italic">{p.name.split(' ')[0]}</span>
                    </div>
                  )
                  return (
                    <div key={p.id} className="relative mb-1">
                      <div className="flex items-center gap-1 mb-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pColor.dot}`} />
                        <p className={`text-[8px] font-medium ${pColor.text}`}>{p.name.split(' ')[0]}</p>
                      </div>
                      <div className="flex flex-wrap gap-0.5">
                        {playerCards.map(oc => (
                          <CompactCard
                            key={oc.instanceId}
                            card={oc}
                            isCurrentPlayer={p.id === currentPlayer.id}
                            isSelected={selection.onboardInstanceId === oc.instanceId}
                            onClick={() => handleOnboardCardTap(oc, loc.id)}
                            onInfo={(c, ticks) => setCardDetail({ kind: 'gp', card: c, ticks, ownerId: oc.playerId })}
                            onFollowerInfo={f => setCardDetail({ kind: 'follower', follower: f })}
                            gpMap={gpMap}
                            followerTemplates={followerMap}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Selection hint */}
      {selection.mode !== 'none' && (
        <div className="relative z-10 px-4 py-1.5 bg-accent/10 border-b border-accent/20 shrink-0">
          <p className="text-accent text-xs text-center">
            {selection.mode === 'deploy-gp' && (selection.handCardId && lifeStatus(gameState, currentPlayer.id, selection.handCardId) !== 'active'
              ? `${figureName(selection.handCardId)} is not in their career yet (${statusLabel(currentPlayer, selection.handCardId)}).${retireTarget ? ' You can still retire them.' : ''}`
              : 'Tap a location to deploy this Great Person')}
            {selection.mode === 'add-follower' && 'Tap a location (where you have a GP) to add follower'}
            {selection.mode === 'start-event' && 'Tap a location where you have a GP (not deployed this turn) to start this event'}
            {selection.mode === 'select-onboard' && 'Card selected — use action buttons below or tap opponent card to attack'}
            {selection.mode === 'move-target' && 'Tap a location to move card there'}
            {selection.mode === 'attack-select-target' && 'Tap an opponent card to attack'}
          </p>
        </div>
      )}

      {/* Event Log */}
      <div ref={logRef} className="relative z-10 px-4 py-1.5 border-b border-line shrink-0 bg-black/10">
        <div className="space-y-0.5 max-h-10 overflow-hidden">
          {gameState.log.slice(0, 2).map((entry, i) => (
            <p key={i} className={`text-[10px] leading-tight text-center ${i === 0 ? 'text-muted' : 'text-muted/80'}`}>
              {entry}
            </p>
          ))}
        </div>
      </div>

      {/* Your Hand */}
      {isMyTurn && (
        <div className="relative z-10 px-3 py-2 border-b border-line shrink-0">
          {currentPlayer.legacies.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap justify-center mb-2">
              <span className="text-[10px] text-violet-800 uppercase tracking-widest">Legacies {currentPlayer.activeLegacies.length}/{LEGACY_SLOTS}</span>
              {currentPlayer.legacies.map(id => {
                const card = getGPCard(id)
                if (!card) return null
                const on = currentPlayer.activeLegacies.includes(id)
                const can = !gameState.turnActions.legacyChanged && (on || currentPlayer.activeLegacies.length < LEGACY_SLOTS)
                return (
                  <button key={id} disabled={!can}
                    onClick={() => dispatch({ type: 'SET_LEGACY', cardId: id, active: !on })}
                    title={`${card.figureName}: ${describeLegacyEffect(card.legacy.effect)} ${on ? '(in effect; tap to set aside)' : '(tap to put in a slot)'} One change per turn.`}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-all disabled:opacity-40
                      ${on ? 'bg-violet-800/15 border-violet-800/50 text-violet-900 font-semibold' : 'border-line text-muted'}`}>
                    {on ? '● ' : '○ '}{card.legacy.name}
                  </button>
                )
              })}
            </div>
          )}
          {isTimeline && (currentPlayer.retired.length > 0 || currentPlayer.archive.length > 0) && (
            <p className="text-[9px] text-muted text-center mb-1">
              {currentPlayer.retired.length > 0 && <>Retired: {currentPlayer.retired.map(figureName).join(', ')}. </>}
              {currentPlayer.archive.length > 0 && <>Passed away: {currentPlayer.archive.map(figureName).join(', ')}.</>}
            </p>
          )}
          <p className="text-[10px] text-muted/80 uppercase tracking-widest mb-1.5 text-center">Your Hand</p>
          <div className="overflow-x-auto pb-1">
          <div className="flex gap-1.5 w-max min-w-full justify-center mx-auto">
            {currentPlayer.gpHand.map((id, i) => (
              <HandCard
                key={id}
                cardId={id}
                type="gp"
                isSelected={selection.handCardId === id}
                onClick={() => handleHandCardTap(id, 'gp', i)}
                onInfo={() => gpMap[id] && setCardDetail({ kind: 'gp', card: gpMap[id], ownerId: currentPlayer.id })}
                gpMap={gpMap}
                status={lifeStatus(gameState, currentPlayer.id, id)}
                statusLabel={statusLabel(currentPlayer, id)}
              />
            ))}
            {currentPlayer.eventHand.map((ev, i) => (
              <HandCard
                key={ev.id}
                cardId={ev.id}
                type="event"
                isSelected={selection.handCardIdx === i && selection.mode === 'start-event'}
                onClick={() => handleHandCardTap(ev.id, 'event', i)}
                onInfo={() => setCardDetail({ kind: 'event', event: ev })}
                gpMap={gpMap}
                eventCard={ev}
              />
            ))}
            {currentPlayer.followerHand.map((f, i) => (
              <HandCard
                key={f.id}
                cardId={f.id}
                type="follower"
                isSelected={selection.handFollowerId === f.id}
                onClick={() => handleHandCardTap(f.id, 'follower', i, f.id)}
                onInfo={() => setCardDetail({ kind: 'follower', follower: f })}
                gpMap={gpMap}
                followerCard={f}
              />
            ))}
            {currentPlayer.gpHand.length === 0 && currentPlayer.eventHand.length === 0 && currentPlayer.followerHand.length === 0 && (
              <p className="text-muted/60 text-xs italic py-6 px-2">No cards in hand</p>
            )}
          </div>
          </div>
        </div>
      )}

      </div>

      {/* Action Buttons */}
      <div className="relative z-10 flex-1 px-3 py-3 flex flex-col gap-2 max-w-lg mx-auto w-full land:flex-none land:w-60 land:max-w-none land:mx-0 land:px-2 land:py-2 land:gap-1.5 land:border-l land:border-line land:overflow-y-auto">
        {/* Kill toggle (for attacks) */}
        {selection.mode === 'select-onboard' && selectedOnboard?.playerId === currentPlayer.id && (
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setAttackKill(k => !k)}
              className={`text-xs px-3 py-1 rounded-lg border transition-all ${attackKill ? 'bg-red-900/30 border-red-700/50 text-red-400' : 'border-line text-muted'}`}>
              {attackKill ? 'Kill mode ON' : 'Kill mode OFF'}
            </button>
            <span className="text-[10px] text-muted/80">Toggle to kill vs retrieve on win</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!isMyTurn || !canDeployGP || (selection.mode !== 'none' && selection.mode !== 'deploy-gp')}
            onClick={() => {
              if (selection.mode === 'deploy-gp') { setSelection({ mode: 'none' }); return }
              if (deployableHand.length === 1) {
                setSelection({ mode: 'deploy-gp', handCardId: deployableHand[0] })
              } else {
                setSelection({ mode: 'deploy-gp' })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-paper-2 border-accent/30 text-accent
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:bg-accent/10">
            Deploy GP {gameState.turnActions.deployedGP ? '✓' : ''}
          </button>

          <button
            disabled={!isMyTurn || !canAddFollower || (selection.mode !== 'none' && selection.mode !== 'add-follower')}
            onClick={() => {
              if (selection.mode === 'add-follower') { setSelection({ mode: 'none' }); return }
              if (currentPlayer.followerHand.length === 1) {
                setSelection({ mode: 'add-follower', handFollowerId: currentPlayer.followerHand[0].id })
              } else {
                setSelection({ mode: 'add-follower' })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-paper-2 border-indigo-500/30 text-indigo-400
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:bg-indigo-500/10">
            Add Follower {gameState.turnActions.addedFollower ? '✓' : ''}
          </button>

          <button
            disabled={!isMyTurn || !selectedOnboard || selectedOnboard.playerId !== currentPlayer.id || !!selectedOnboard.justDeployed || gameState.turnActions.movedCards.includes(selectedOnboard?.instanceId ?? '')}
            onClick={() => {
              if (selection.mode === 'move-target') { setSelection({ mode: 'select-onboard', onboardInstanceId: selection.onboardInstanceId }); return }
              setSelection({ mode: 'move-target', onboardInstanceId: selection.onboardInstanceId })
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-paper-2 border-line text-ink-2
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:border-line-2">
            Move Card
          </button>

          <button
            disabled={!isMyTurn || !canRetrieve}
            onClick={() => {
              if (selection.onboardInstanceId) {
                dispatch({ type: 'RETRIEVE_CARD', instanceId: selection.onboardInstanceId })
                setSelection({ mode: 'none' })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-paper-2 border-line text-ink-2
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:border-line-2">
            Retrieve
          </button>

          <button
            disabled={!isMyTurn || !canClaimAchievement}
            onClick={() => {
              if (selection.onboardInstanceId) {
                dispatch({ type: 'CLAIM_ACHIEVEMENT', instanceId: selection.onboardInstanceId })
                setSelection({ mode: 'none' })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-paper-2 border-accent/40 text-accent
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:bg-accent/10">
            Claim Legacy
          </button>

          {isTimeline && (
            <button
              disabled={!isMyTurn || !retireTarget}
              onClick={() => {
                if (retireTarget) {
                  dispatch({ type: 'RETIRE_GP', cardId: retireTarget })
                  setSelection({ mode: 'none' })
                }
              }}
              title="Take this Great Person out of play for good. Their successor still comes at their real death year."
              className="py-2.5 rounded-xl text-xs font-semibold border transition-all
                bg-paper-2 border-line text-ink-2
                disabled:opacity-30 disabled:cursor-not-allowed
                hover:border-line-2">
              Retire {retireTarget ? figureName(retireTarget).split(' ')[0] : ''}
            </button>
          )}

          <button
            disabled={!isMyTurn || !canToggleVis}
            onClick={() => {
              if (selection.onboardInstanceId) {
                dispatch({ type: 'TOGGLE_VISIBILITY', instanceId: selection.onboardInstanceId })
              }
            }}
            className="py-2.5 rounded-xl text-xs font-semibold border transition-all
              bg-paper-2 border-line text-ink-2
              disabled:opacity-30 disabled:cursor-not-allowed
              hover:border-line-2">
            Toggle Public
          </button>

          {/* End Scenario: available when selected onboard GP is at a location with a local event */}
          {(() => {
            if (!isMyTurn || !selectedOnboard || selectedOnboard.type !== 'gp' || selectedOnboard.playerId !== currentPlayer.id || selectedOnboard.justDeployed) return null
            const loc = gameState.locations.find(l => l.cards.some(c => c.instanceId === selectedOnboard.instanceId))
            if (!loc?.activeEvent || loc.activeEvent.type === 'global_competition' || loc.activeEvent.type === 'natural_hazard') return null
            const alreadyDone = gameState.turnActions.actedCards.includes(`end-scenario-${loc.id}`)
            return (
              <button
                disabled={alreadyDone}
                onClick={() => dispatch({ type: 'END_SCENARIO', locationId: loc.id })}
                className="col-span-2 py-2.5 rounded-xl text-xs font-semibold border transition-all
                  bg-paper-2 border-red-700/40 text-red-400
                  disabled:opacity-30 disabled:cursor-not-allowed
                  hover:bg-red-900/20">
                End Scenario: {loc.activeEvent.name}
              </button>
            )
          })()}
        </div>

        <div className="mt-auto">
          <button
            disabled={!isMyTurn || !canEndTurn}
            onClick={() => {
              const numPlayers = gameState.players.length
              const nextIdx = (gameState.currentPlayerIdx + 1) % numPlayers
              const nextPlayer = gameState.players[nextIdx]
              dispatch({ type: 'END_TURN' })
              setSelection({ mode: 'none' })
              // Hot-seat: if the next player is human, hide the board until they confirm
              if (!nextPlayer.isComputer) {
                setAwaitingHandoff(true)
              }
            }}
            className="w-full py-3 rounded-xl font-bold text-sm tracking-wide text-ink
              bg-accent hover:bg-accent-hover active:bg-accent-hover
              disabled:opacity-30 disabled:cursor-not-allowed
              shadow-lg shadow-accent/25 transition-all duration-200">
            End Turn →
          </button>
        </div>

        {/* Global competition reward dialog */}
        {showRewardDialog && globalCompWinner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-6">
            <div className="bg-paper-2 border border-line rounded-2xl p-6 max-w-xs w-full shadow-2xl">
              <h3 className="font-display text-lg font-bold text-ink uppercase mb-2 text-center">Global Competition!</h3>
              <p className="text-muted text-sm text-center mb-4">
                {gameState.players.find(p => p.id === globalCompWinner)?.name} wins! Choose a reward:
              </p>
              <div className="space-y-2">
                <button onClick={() => { dispatch({ type: 'GLOBAL_COMP_REWARD', playerId: globalCompWinner, rewardType: 'events' }); setShowRewardDialog(false) }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border border-purple-500/40 text-purple-300 hover:bg-purple-500/10 transition-all">
                  2 Event Cards
                </button>
                <button onClick={() => { dispatch({ type: 'GLOBAL_COMP_REWARD', playerId: globalCompWinner, rewardType: 'followers' }); setShowRewardDialog(false) }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/10 transition-all">
                  4 Follower Cards
                </button>
                <button onClick={() => { dispatch({ type: 'GLOBAL_COMP_REWARD', playerId: globalCompWinner, rewardType: 'gp' }); setShowRewardDialog(false) }}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border border-accent/40 text-accent hover:bg-accent/10 transition-all">
                  1 Great Person Card
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Battle / event summary modal */}
      {gameState.pendingSummary && (
        <SummaryModal
          summary={gameState.pendingSummary}
          onDismiss={() => dispatch({ type: 'DISMISS_SUMMARY' })}
        />
      )}

      {/* Successor choice for a human player whose Great Person died */}
      {choosing && !gameState.pendingSummary && !awaitingHandoff && (() => {
        const pending = choosing.pendingSuccessors[0]
        const options = successorOptions(gameState, choosing.id)
        return (
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-ink/70 p-4">
            <div className="bg-panel border border-line rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
              <div className="bg-accent/10 border-b border-line px-4 py-3 text-center">
                <h3 className="font-bold text-ink text-sm uppercase tracking-wide">{choosing.name}: choose a successor</h3>
                <p className="text-muted text-xs mt-0.5">
                  {pending.predecessor ? `${figureName(pending.predecessor)} has died.` : 'A new lineage.'} Choose someone born after {formatYear(gameState.year)}.
                </p>
              </div>
              <div className="p-3 grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto">
                {options.map(id => {
                  const c = gpMap[id]
                  if (!c) return null
                  const total = STATS.reduce((sum, k) => sum + c[k], 0)
                  return (
                    <button key={id} onClick={() => dispatch({ type: 'CHOOSE_SUCCESSOR', playerId: choosing.id, cardId: id })}
                      className="flex items-center gap-3 text-left p-2 rounded-xl border border-line hover:border-accent/60 hover:bg-accent/5 transition-all">
                      <img src={c.portraitUrl} alt="" className="w-12 h-12 rounded-lg object-cover object-top shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink truncate">{c.figureName}</p>
                        <p className="text-[11px] text-muted">{c.era} · born {formatYear(c.born)} · career {formatYear(careerStartYear(c, choosing))} · stats {total}</p>
                        <p className="text-[11px] text-violet-900 truncate">Legacy {c.legacy.name}: {describeLegacyEffect(c.legacy.effect)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Card detail modal */}
      {cardDetail?.kind === 'gp' && (() => {
        const owner = gameState.players.find(p => p.id === (cardDetail.ownerId ?? currentPlayer.id))
        return <CardDetailModal card={cardDetail.card} achievementTicks={cardDetail.ticks} owner={owner}
          earned={owner?.legacies.includes(cardDetail.card.id)} onClose={() => setCardDetail(null)} />
      })()}
      {cardDetail?.kind === 'follower' && <FollowerDetailModal follower={cardDetail.follower} onClose={() => setCardDetail(null)} />}
      {cardDetail?.kind === 'event' && <EventDetailModal event={cardDetail.event} onClose={() => setCardDetail(null)} />}

      {/* Hot-seat handoff screen — covers everything until the next player confirms */}
      {awaitingHandoff && (() => {
        const pidx = gameState.currentPlayerIdx
        const color = PLAYER_COLORS[pidx % 5]
        const player = gameState.players[pidx]
        return (
          <div className="fixed inset-0 z-[200] bg-paper flex flex-col items-center justify-center p-8">
            <div className="text-center max-w-xs w-full">
              <div className={`w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center text-4xl ${color.bg} border ${color.border}`}>
                ⚔
              </div>
              <p className="text-muted text-xs uppercase tracking-widest mb-2">Next up</p>
              <h2 className={`text-3xl font-bold mb-1 ${color.text}`}>{player.name}</h2>
              <div className="flex items-center justify-center gap-1 mb-8">
                <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                <span className="text-muted text-sm">{isTimeline ? `${score(player)} legac${score(player) === 1 ? 'y' : 'ies'}` : `${player.winningPoints} winning point${player.winningPoints !== 1 ? 's' : ''}`}</span>
              </div>
              <p className="text-muted/80 text-xs mb-6 leading-relaxed">
                Hand the device to this player.<br />Others look away.
              </p>
              <button
                onClick={() => setAwaitingHandoff(false)}
                className={`w-full py-4 rounded-2xl font-bold text-sm tracking-wide border transition-all
                  ${color.bg} ${color.border} ${color.text} hover:opacity-90 active:scale-95`}>
                I'm Ready →
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
