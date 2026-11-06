import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useUnlockedCards } from '@/hooks/useUnlockedCards'
import type { Card, StatKey } from '@/types'
import cardsJson from '@/data/cards.json'
import locationCardsJson from '@/data/location_cards.json'
import { locationImageUrl, portraitUrl } from '@/data/images'
import PageLoader from '@/components/PageLoader'
import EraIcon, { ERA_NAMES } from '@/components/EraIcon'
import IdentityIcon, { IDENTITY_NAMES } from '@/components/IdentityIcon'
import ArtGallery, { ARTWORKS } from '@/components/ArtGallery'
import { FIGHT_REWARD_POOL } from '@/battle/rewards'

// ── GP cards ─────────────────────────────────────────────────────────────────

const ALL_CARDS: Card[] = (cardsJson as unknown as Omit<Card, 'portraitUrl'>[]).map(c => ({
  ...c,
  portraitUrl: portraitUrl(c.portraitKey ?? c.id),
}))

// ── Location cards ────────────────────────────────────────────────────────────

interface LocationCard {
  id: string
  name: string
  era: string
  imageKey?: string
  countries?: string[]
  buildings: string[]
  capacity: number
  bonuses: Partial<Record<StatKey, number>>
  trait?: string
}

const ALL_LOCATIONS: LocationCard[] = locationCardsJson as LocationCard[]

function parseTraitText(trait: string | undefined): { name: string; description: string } | null {
  if (!trait) return null
  const match = trait.match(/\*\*(.*?)\*\*\s*[—–-]\s*(.+)/)
  if (!match) return { name: '', description: trait }
  return { name: match[1], description: match[2] }
}

const ERA_COLORS: Record<string, string> = {
  Ancient:     'bg-yellow-100 text-yellow-800 border-yellow-400/60',
  Classical:   'bg-accent/10 text-accent border-accent/40',
  Medieval:    'bg-orange-100 text-orange-800 border-orange-400/60',
  Renaissance: 'bg-purple-100 text-purple-800 border-purple-400/60',
  Steam:       'bg-line text-ink-2 border-line-2',
  Electricity: 'bg-blue-100 text-blue-800 border-blue-400/60',
  Information: 'bg-cyan-100 text-cyan-800 border-cyan-400/60',
}

const STAT_COLORS: Record<StatKey, string> = {
  politics:      'bg-red-100 text-red-800 border-red-400/60',
  strength:      'bg-orange-100 text-orange-800 border-orange-400/60',
  culture:       'bg-purple-100 text-purple-800 border-purple-400/60',
  wealth:        'bg-yellow-100 text-yellow-800 border-yellow-400/60',
  intelligence:  'bg-cyan-100 text-cyan-800 border-cyan-400/60',
  technique:     'bg-blue-100 text-blue-800 border-blue-400/60',
  belief:        'bg-indigo-100 text-indigo-800 border-indigo-400/60',
  reputation:    'bg-pink-100 text-pink-800 border-pink-400/60',
}

const BUILDING_ICONS: Record<string, string> = {
  Palace: '🏯', Tomb: '🪦', Monument: '🗿', Barracks: '⚔️',
  Port: '⚓', Forum: '🏛️', Theatre: '🎭', Arena: '🏟️',
  Parliament: '📜', Infrastructure: '🛤️', Sanctuary: '⛪', Gallery: '🖼️',
  Factory: '🏭', 'Stock Exchange': '📈', Bank: '💰', Museum: '🏺',
  University: '🎓', 'Military Academy': '🎖️', 'Enterprise Quarter': '💼',
  'Fine Dining': '🍷', 'Concert Hall': '🎵', Salon: '💬',
}

// ── Filtering and grouping ────────────────────────────────────────────────────

type StatusFilter = 'all' | 'claimed' | 'unclaimed'
type GroupBy = 'none' | 'status' | 'age' | 'identity'

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'none',     label: 'None' },
  { value: 'status',   label: 'Claimed' },
  { value: 'age',      label: 'Age' },
  { value: 'identity', label: 'Identity' },
]

interface CardGroup {
  key: string
  label: string
  cards: Card[]
}

function toggle(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/**
 * Splits the visible cards into sections, in age order or follower-deck order.
 * A card with several identities appears under each of them; while identities
 * are being filtered, only the selected ones get a section.
 */
function groupCards(
  cards: Card[],
  groupBy: GroupBy,
  isOwned: (card: Card) => boolean,
  selectedIdentities: ReadonlySet<string>,
): CardGroup[] {
  const sections = (keys: string[], matches: (card: Card, key: string) => boolean) =>
    keys
      .map(key => ({ key, label: key, cards: cards.filter(c => matches(c, key)) }))
      .filter(g => g.cards.length > 0)

  switch (groupBy) {
    case 'none':
      return [{ key: 'all', label: 'All cards', cards }]
    case 'status':
      return [
        { key: 'claimed',   label: 'Claimed',   cards: cards.filter(isOwned) },
        { key: 'unclaimed', label: 'Unclaimed', cards: cards.filter(c => !isOwned(c)) },
      ].filter(g => g.cards.length > 0)
    case 'age':
      return sections(ERA_NAMES, (c, era) => c.era === era)
    case 'identity': {
      const keys = selectedIdentities.size > 0
        ? IDENTITY_NAMES.filter(i => selectedIdentities.has(i))
        : IDENTITY_NAMES
      return sections(keys, (c, identity) => c.identities.includes(identity))
    }
  }
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
        ${active
          ? 'bg-panel text-ink border border-line-2'
          : 'bg-panel text-muted border border-line hover:border-line-2 hover:text-ink-2'
        }`}>
      {children}
    </button>
  )
}

/** An icon-only filter button; the name lives in the tooltip and for screen readers. */
function IconToggle({ label, active, dimmed, onClick, children }: {
  label: string
  active: boolean
  /** Fade unselected buttons once something in the row is selected. */
  dimmed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`shrink-0 p-1 rounded-full border transition-all duration-200
        ${active
          ? 'border-accent bg-accent/15 text-accent ring-1 ring-accent/40'
          : `border-line bg-panel text-muted hover:border-line-2 hover:text-ink-2 ${dimmed ? 'opacity-45 hover:opacity-100' : ''}`
        }`}>
      {children}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

// The grid shows every portrait at once, so decode them all before revealing
// the page rather than letting 80 cards pop in one by one.
const COLLECTION_ASSETS = ALL_CARDS.map(c => c.portraitUrl!)

export default function CollectionPage() {
  return (
    <PageLoader assets={COLLECTION_ASSETS} label="Opening collection">
      <CollectionContent />
    </PageLoader>
  )
}

function CollectionContent() {
  const navigate = useNavigate()
  const { isGuest, isAdmin, exitGuestMode } = useAuth()
  const { unlocked } = useUnlockedCards()
  const [tab, setTab] = useState<'gp' | 'location' | 'gallery'>('gp')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [eras, setEras] = useState<ReadonlySet<string>>(new Set())
  const [identities, setIdentities] = useState<ReadonlySet<string>>(new Set())
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [selectedLocation, setSelectedLocation] = useState<LocationCard | null>(null)

  const isOwned = (card: Card) => {
    if (isAdmin) return true
    return unlocked.includes(card.portraitKey ?? '')
  }

  // Within one dimension any selected value matches; across dimensions all must.
  const filteredGP = ALL_CARDS.filter(card => {
    if (status === 'claimed' && !isOwned(card)) return false
    if (status === 'unclaimed' && isOwned(card)) return false
    if (eras.size > 0 && !eras.has(card.era)) return false
    if (identities.size > 0 && !card.identities.some(i => identities.has(i))) return false
    return true
  })

  const groups = groupCards(filteredGP, groupBy, isOwned, identities)
  const filtersActive = status !== 'all' || eras.size > 0 || identities.size > 0
  const clearFilters = () => { setStatus('all'); setEras(new Set()); setIdentities(new Set()) }

  const ownedCount = ALL_CARDS.filter(isOwned).length

  return (
    <div className="relative min-h-screen bg-paper overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-accent/8 blur-[160px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full bg-line/40 blur-[160px]" />
      </div>

      {/* Guest banner */}
      {isGuest && (
        <div className="relative z-20 flex items-center justify-between px-6 py-2.5
                        bg-accent/10 border-b border-accent/20">
          <p className="text-accent/80 text-xs">
            Complete stories in Epic mode, win fights or finish Arcade tracks to unlock cards
          </p>
          <button
            onClick={() => { exitGuestMode(); navigate('/login') }}
            className="text-accent text-xs font-semibold hover:text-accent transition-colors ml-4 shrink-0">
            Sign In →
          </button>
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-[0.1em] text-ink uppercase">
              Collection
            </h1>
            <p className="text-muted text-xs tracking-widest mt-1">
              {tab === 'gp'
                ? `${ownedCount} / ${ALL_CARDS.length} unlocked`
                : tab === 'location'
                  ? `${ALL_LOCATIONS.length} locations`
                  : `${ARTWORKS.length} artworks`}
            </p>
          </div>
          <button
            onClick={() => navigate('/battle')}
            className="px-5 py-2.5 rounded-xl font-bold text-sm tracking-wide text-ink
                       bg-accent hover:bg-accent-hover active:bg-accent-hover
                       shadow-lg shadow-accent/25 transition-all duration-200">
            Battle →
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setTab('gp')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
              ${tab === 'gp'
                ? 'bg-accent text-accent-fg shadow shadow-accent/30'
                : 'bg-panel text-muted border border-line hover:border-accent/30 hover:text-accent'
              }`}>
            Great People
          </button>
          <button
            onClick={() => setTab('location')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
              ${tab === 'location'
                ? 'bg-accent text-accent-fg shadow shadow-accent/30'
                : 'bg-panel text-muted border border-line hover:border-accent/30 hover:text-accent'
              }`}>
            Locations
          </button>
          <button
            onClick={() => setTab('gallery')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
              ${tab === 'gallery'
                ? 'bg-accent text-accent-fg shadow shadow-accent/30'
                : 'bg-panel text-muted border border-line hover:border-accent/30 hover:text-accent'
              }`}>
            Gallery
          </button>
        </div>

        {/* GP tab */}
        {tab === 'gp' && (
          <>
            <div className="flex flex-col gap-3 mb-6">
              {/* Status filter and grouping */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {(['all', 'claimed', 'unclaimed'] as const).map(s => (
                    <Chip key={s} active={status === s} onClick={() => setStatus(s)}>
                      {s === 'all' ? 'All'
                        : s === 'claimed' ? `Claimed (${ownedCount})`
                        : `Unclaimed (${ALL_CARDS.length - ownedCount})`}
                    </Chip>
                  ))}
                </div>
                <div className="flex items-center gap-1.5" role="group" aria-label="Group by">
                  <span className="text-[10px] uppercase tracking-widest text-muted mr-1">Group</span>
                  {GROUP_OPTIONS.map(g => (
                    <Chip key={g.value} active={groupBy === g.value} onClick={() => setGroupBy(g.value)}>
                      {g.label}
                    </Chip>
                  ))}
                </div>
              </div>

              {/* Age filter */}
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by age">
                {ERA_NAMES.map(era => (
                  <IconToggle
                    key={era}
                    label={era}
                    active={eras.has(era)}
                    dimmed={eras.size > 0}
                    onClick={() => setEras(toggle(eras, era))}>
                    <EraIcon era={era} className="w-5 h-5" />
                  </IconToggle>
                ))}
              </div>

              {/* Identity filter: one row that scrolls on narrow screens */}
              <div className="flex gap-1.5 overflow-x-auto md:flex-wrap md:overflow-visible pb-1 -mb-1"
                   role="group" aria-label="Filter by identity">
                {IDENTITY_NAMES.map(identity => (
                  <IconToggle
                    key={identity}
                    label={identity}
                    active={identities.has(identity)}
                    dimmed={identities.size > 0}
                    onClick={() => setIdentities(toggle(identities, identity))}>
                    <IdentityIcon identity={identity} className="w-7 h-7" />
                  </IconToggle>
                ))}
              </div>

              {filtersActive && (
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span>{filteredGP.length} of {ALL_CARDS.length} cards</span>
                  <button onClick={clearFilters} className="text-accent font-semibold hover:underline">
                    Clear filters
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-8">
              {groups.map(group => (
                <section key={group.key} aria-label={group.label}>
                  {groupBy !== 'none' && (
                    <h2 className="flex items-center gap-2 mb-3 pb-2 border-b border-line" title={group.label}>
                      {groupBy === 'age' && <EraIcon era={group.key} className="w-6 h-6 text-ink-2" />}
                      {groupBy === 'identity' && <IdentityIcon identity={group.key} className="w-8 h-8" />}
                      {groupBy === 'status' && (
                        <span className="text-sm font-semibold text-ink-2">{group.label}</span>
                      )}
                      <span className="text-xs text-muted">{group.cards.length}</span>
                    </h2>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {group.cards.map((card) => (
                      <CardItem
                        key={card.id}
                        card={card}
                        owned={isOwned(card)}
                        onClick={() => isOwned(card) ? navigate(`/card/${card.id}`, { state: { card } }) : undefined}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {filteredGP.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <p className="text-muted text-sm">
                  {eras.size > 0 || identities.size > 0
                    ? 'No cards match these filters.'
                    : status === 'claimed' ? 'No cards unlocked yet.' : 'All cards are unlocked!'}
                </p>
                {eras.size > 0 || identities.size > 0 ? (
                  <button onClick={clearFilters}
                    className="px-5 py-2 rounded-xl bg-panel border border-line text-ink-2 font-semibold text-sm hover:border-accent/40 transition-all">
                    Clear filters
                  </button>
                ) : status === 'claimed' && (
                  <button onClick={() => navigate('/epic')}
                    className="px-5 py-2 rounded-xl bg-accent text-accent-fg font-bold text-sm hover:bg-accent-hover transition-all">
                    Play Epic Stories →
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* Locations tab */}
        {tab === 'location' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {ALL_LOCATIONS.map(loc => (
              <LocationItem key={loc.id} loc={loc} onClick={() => setSelectedLocation(loc)} />
            ))}
          </div>
        )}

        {/* Gallery tab */}
        {tab === 'gallery' && <ArtGallery />}
      </div>

      {/* Location detail modal */}
      {selectedLocation && (
        <LocationDetailModal loc={selectedLocation} onClose={() => setSelectedLocation(null)} />
      )}
    </div>
  )
}

const FIGHT_REWARD_KEYS = new Set(FIGHT_REWARD_POOL.map(c => c.portraitKey ?? c.id))

// ── GP card grid item ─────────────────────────────────────────────────────────

function CardItem({ card, owned, onClick }: { card: Card; owned: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl overflow-hidden flex flex-col
                   bg-panel border border-line backdrop-blur-sm
                   transition-all duration-200
                   ${owned ? 'hover:scale-[1.03] cursor-pointer' : 'cursor-default'}`}>

      <div className="relative h-40 bg-paper-2">
        {card.portraitUrl ? (
          <img
            src={card.portraitUrl}
            alt={card.figureName}
            className={`w-full h-full object-cover transition-all duration-300 ${owned ? '' : 'brightness-[0.25] saturate-0'}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl select-none opacity-30">♟</span>
          </div>
        )}
        {!owned && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="text-2xl">🔒</span>
            <p className="text-paper/85 text-[9px] text-center px-2 leading-tight">
              {FIGHT_REWARD_KEYS.has(card.portraitKey ?? card.id) ? 'Win a fight or finish an Arcade track' : 'Complete the story in Epic mode'}
            </p>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1.5">
        <p className={`text-sm font-semibold leading-tight line-clamp-2 ${owned ? 'text-ink' : 'text-muted/80'}`}>
          {card.figureName}
        </p>
        <EraIcon era={card.era} className={`w-3.5 h-3.5 ${owned ? 'text-muted' : 'text-muted/60'}`} />
        {owned && card.identities.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {card.identities.map(id => (
              <IdentityIcon key={id} identity={id} className="w-5 h-5" />
            ))}
          </div>
        )}
        {card.countries && card.countries.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {card.countries.map(c => (
              <span key={c}
                className={`text-[9px] px-1.5 py-0.5 rounded-full border
                  ${owned ? 'border-cyan-500/30 text-cyan-400/80' : 'border-line text-muted/60'}`}>
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Location grid item ────────────────────────────────────────────────────────

function LocationItem({ loc, onClick }: { loc: LocationCard; onClick: () => void }) {
  const eraStyle = ERA_COLORS[loc.era] ?? 'bg-panel-2 text-muted border-line'
  const imageUrl = locationImageUrl(loc.imageKey)

  return (
    <div
      onClick={onClick}
      className="relative rounded-2xl overflow-hidden flex flex-col
                 bg-panel border border-line backdrop-blur-sm
                 hover:scale-[1.03] cursor-pointer transition-all duration-200
                 hover:border-accent/20">

      {/* Image */}
      <div className="relative h-40 bg-paper-2 overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={loc.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl select-none opacity-20">🗺</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 to-transparent" />
        {/* Era badge */}
        <span className={`absolute top-2 right-2 p-1 rounded-full border ${eraStyle}`} title={loc.era}>
          <EraIcon era={loc.era} className="w-3 h-3" />
        </span>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-ink leading-tight">{loc.name}</p>
        {loc.countries && loc.countries.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {loc.countries.slice(0, 2).map(c => (
              <span key={c} className="text-[9px] px-1.5 py-0.5 rounded-full border border-cyan-500/25 text-cyan-400/70">
                {c}
              </span>
            ))}
          </div>
        )}
        {loc.buildings.length > 0 && (
          <p className="text-[9px] text-muted/80 truncate">
            {loc.buildings.slice(0, 2).map(b => BUILDING_ICONS[b] ?? '🏗️').join(' ')}
            {loc.buildings.length > 2 && <span className="ml-1">+{loc.buildings.length - 2}</span>}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Location detail modal ─────────────────────────────────────────────────────

function LocationDetailModal({ loc, onClose }: { loc: LocationCard; onClose: () => void }) {
  const imageUrl = locationImageUrl(loc.imageKey)
  const eraStyle = ERA_COLORS[loc.era] ?? 'bg-panel-2 text-muted border-line'
  const ability = parseTraitText(loc.trait)
  const bonusEntries = Object.entries(loc.bonuses ?? {}) as [StatKey, number][]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/70 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div
        className="bg-panel border border-line rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Image */}
        <div className="relative w-full h-48 overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt={loc.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-paper-2 flex items-center justify-center">
              <span className="text-5xl opacity-20">🗺</span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#0e1020] to-transparent" />

          {/* Era badge */}
          <span className={`absolute top-3 left-3 p-1.5 rounded-full border ${eraStyle}`} title={loc.era}>
            <EraIcon era={loc.era} className="w-3.5 h-3.5" />
          </span>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-ink/60 border border-line
                       flex items-center justify-center text-paper/80 hover:text-paper transition-colors text-xs">
            ✕
          </button>

          {/* Name overlaid on image bottom */}
          <div className="absolute bottom-3 left-4 right-4">
            <h2 className="text-xl font-bold text-ink leading-tight">{loc.name}</h2>
            {loc.countries && loc.countries.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {loc.countries.map(c => (
                  <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full border border-cyan-500/30 text-cyan-400/80 bg-black/30">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 space-y-4 max-h-[50vh] overflow-y-auto">

          {/* Special ability */}
          {ability && (
            <div className="rounded-xl bg-accent/15 border border-accent/20 p-3 space-y-1">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-accent text-xs">★</span>
                <span className="text-[10px] uppercase tracking-widest text-accent/80 font-semibold">Special Ability</span>
              </div>
              {ability.name && (
                <p className="text-accent text-sm font-semibold">{ability.name}</p>
              )}
              <p className="text-ink-2 text-xs leading-relaxed">{ability.description}</p>
            </div>
          )}

          {/* Stat bonuses */}
          {bonusEntries.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted mb-2">Stat Bonuses</p>
              <div className="flex flex-wrap gap-1.5">
                {bonusEntries.map(([stat, amount]) => (
                  <span key={stat}
                    className={`text-xs px-2.5 py-1 rounded-full border font-semibold capitalize ${STAT_COLORS[stat]}`}>
                    {stat} +{amount}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Buildings */}
          {loc.buildings.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted mb-2">Buildings</p>
              <div className="flex flex-wrap gap-1.5">
                {loc.buildings.map(b => (
                  <span key={b}
                    className="text-xs px-2.5 py-1 rounded-full bg-panel border border-line text-ink-2">
                    {BUILDING_ICONS[b] ?? '🏗️'} {b}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Capacity */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] uppercase tracking-widest text-muted">Capacity</span>
            <div className="flex gap-1">
              {Array.from({ length: loc.capacity }).map((_, i) => (
                <span key={i} className="w-2 h-2 rounded-full bg-accent/60" />
              ))}
            </div>
            <span className="text-muted text-xs">{loc.capacity} slots</span>
          </div>
        </div>
      </div>
    </div>
  )
}
