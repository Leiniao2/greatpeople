import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useUnlockedCards } from '@/hooks/useUnlockedCards'
import type { Card, StatKey } from '@/types'
import cardsJson from '@/data/cards.json'
import locationCardsJson from '@/data/location_cards.json'
import { locationImageUrl, portraitUrl } from '@/data/images'

// ── GP cards ─────────────────────────────────────────────────────────────────

const ALL_CARDS: Card[] = cardsJson.map(c => ({
  ...c,
  portraitUrl: portraitUrl(c.portraitKey),
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CollectionPage() {
  const navigate = useNavigate()
  const { isGuest, isAdmin, exitGuestMode } = useAuth()
  const { unlocked } = useUnlockedCards()
  const [tab, setTab] = useState<'gp' | 'location'>('gp')
  const [filter, setFilter] = useState<'all' | 'owned' | 'locked'>('all')
  const [selectedLocation, setSelectedLocation] = useState<LocationCard | null>(null)

  const isOwned = (card: Card) => {
    if (isAdmin) return true
    return unlocked.includes(card.portraitKey ?? '')
  }

  const filteredGP = ALL_CARDS.filter(card => {
    if (filter === 'owned') return isOwned(card)
    if (filter === 'locked') return !isOwned(card)
    return true
  })

  const ownedCount = isAdmin ? ALL_CARDS.length : unlocked.length

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
            Complete stories in Epic mode to unlock cards
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
                : `${ALL_LOCATIONS.length} locations`}
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
        </div>

        {/* GP tab */}
        {tab === 'gp' && (
          <>
            {/* Filter tabs */}
            <div className="flex gap-2 mb-6">
              {(['all', 'owned', 'locked'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
                    ${filter === f
                      ? 'bg-panel text-ink border border-line-2'
                      : 'bg-panel text-muted border border-line hover:border-line-2 hover:text-ink-2'
                    }`}>
                  {f === 'all' ? 'All' : f === 'owned' ? `Owned (${ownedCount})` : `Locked (${ALL_CARDS.length - ownedCount})`}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredGP.map((card) => (
                <CardItem
                  key={card.id}
                  card={card}
                  owned={isOwned(card)}
                  onClick={() => isOwned(card) ? navigate(`/card/${card.id}`, { state: { card } }) : undefined}
                />
              ))}
            </div>

            {filteredGP.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 gap-3">
                <p className="text-muted text-sm">
                  {filter === 'owned' ? 'No cards unlocked yet.' : 'All cards are unlocked!'}
                </p>
                {filter === 'owned' && (
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
      </div>

      {/* Location detail modal */}
      {selectedLocation && (
        <LocationDetailModal loc={selectedLocation} onClose={() => setSelectedLocation(null)} />
      )}
    </div>
  )
}

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
              Complete the story in Epic mode
            </p>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-1.5">
        <p className={`text-sm font-semibold leading-tight line-clamp-2 ${owned ? 'text-ink' : 'text-muted/80'}`}>
          {card.figureName}
        </p>
        <p className={`text-[10px] uppercase tracking-wider ${owned ? 'text-muted' : 'text-muted/60'}`}>
          {card.era}
        </p>
        {owned && card.identities.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {card.identities.slice(0, 2).map(id => (
              <span key={id} className="text-[9px] px-1.5 py-0.5 rounded-full border border-accent/30 text-accent/70">
                {id}
              </span>
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
        <span className={`absolute top-2 right-2 text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${eraStyle}`}>
          {loc.era}
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
          <span className={`absolute top-3 left-3 text-[10px] px-2 py-0.5 rounded-full border font-semibold ${eraStyle}`}>
            {loc.era}
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
