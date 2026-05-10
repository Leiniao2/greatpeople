import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useUnlockedCards } from '@/hooks/useUnlockedCards'
import type { Card } from '@/types'
import demoCardsJson from '@/data/demo_cards.json'


const ALL_CARDS: Card[] = demoCardsJson.map(c => ({
  ...c,
  portraitUrl: `/portraits/portrait_${c.portraitKey}.jpeg`,
}))

export default function CollectionPage() {
  const navigate = useNavigate()
  const { isGuest, isAdmin, exitGuestMode } = useAuth()
  const { unlocked } = useUnlockedCards()
  const [filter, setFilter] = useState<'all' | 'owned' | 'locked'>('all')

  // Admin and non-guest logged-in users see full collection; guests see all cards but locked
  const isOwned = (card: Card) => {
    if (isAdmin) return true
    return unlocked.includes(card.portraitKey ?? '')
  }

  const filtered = ALL_CARDS.filter(card => {
    if (filter === 'owned') return isOwned(card)
    if (filter === 'locked') return !isOwned(card)
    return true
  })

  const ownedCount = isAdmin ? ALL_CARDS.length : unlocked.length

  return (
    <div className="relative min-h-screen bg-[#080812] overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full bg-amber-600/8 blur-[160px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] rounded-full bg-indigo-700/8 blur-[160px]" />
      </div>

      {/* Guest banner */}
      {isGuest && (
        <div className="relative z-20 flex items-center justify-between px-6 py-2.5
                        bg-amber-500/10 border-b border-amber-500/20">
          <p className="text-amber-400/80 text-xs">
            Complete stories in Epic mode to unlock cards
          </p>
          <button
            onClick={() => { exitGuestMode(); navigate('/login') }}
            className="text-amber-400 text-xs font-semibold hover:text-amber-300 transition-colors ml-4 shrink-0">
            Sign In →
          </button>
        </div>
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-[0.1em] text-white uppercase">
              Collection
            </h1>
            <p className="text-slate-500 text-xs tracking-widest mt-1">
              {ownedCount} / {ALL_CARDS.length} unlocked
            </p>
          </div>
          <button
            onClick={() => navigate('/battle')}
            className="px-5 py-2.5 rounded-xl font-bold text-sm tracking-wide text-slate-950
                       bg-amber-500 hover:bg-amber-400 active:bg-amber-600
                       shadow-lg shadow-amber-500/25 transition-all duration-200">
            Battle →
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(['all', 'owned', 'locked'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
                ${filter === f
                  ? 'bg-amber-500 text-slate-950 shadow shadow-amber-500/30'
                  : 'bg-white/[0.05] text-slate-400 border border-white/10 hover:border-amber-500/30 hover:text-amber-400'
                }`}>
              {f === 'all' ? 'All' : f === 'owned' ? `Owned (${ownedCount})` : `Locked (${ALL_CARDS.length - ownedCount})`}
            </button>
          ))}
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              owned={isOwned(card)}
              onClick={() => isOwned(card) ? navigate(`/card/${card.id}`, { state: { card } }) : undefined}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p className="text-slate-500 text-sm">
              {filter === 'owned' ? 'No cards unlocked yet.' : 'All cards are unlocked!'}
            </p>
            {filter === 'owned' && (
              <button onClick={() => navigate('/epic')}
                className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-all">
                Play Epic Stories →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function CardItem({ card, owned, onClick }: { card: Card; owned: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-2xl overflow-hidden flex flex-col
                   bg-white/[0.03] border border-white/[0.08] backdrop-blur-sm
                   transition-all duration-200
                   ${owned ? 'hover:scale-[1.03] cursor-pointer' : 'cursor-default'}`}>

      {/* Portrait */}
      <div className="relative h-40 bg-slate-900/40">
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

        {/* Lock overlay */}
        {!owned && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="text-2xl">🔒</span>
            <p className="text-slate-400 text-[9px] text-center px-2 leading-tight">
              Complete the story in Epic mode
            </p>
          </div>
        )}

      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        <p className={`text-sm font-semibold leading-tight line-clamp-2 ${owned ? 'text-white' : 'text-slate-600'}`}>
          {card.figureName}
        </p>
        <p className={`text-[10px] uppercase tracking-wider ${owned ? 'text-slate-500' : 'text-slate-700'}`}>
          {card.era}
        </p>

        {owned && card.identities.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {card.identities.slice(0, 2).map(id => (
              <span key={id} className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-500/30 text-amber-400/70">
                {id}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
