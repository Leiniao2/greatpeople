import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cardsApi } from '@/api/cards'
import { useAuth } from '@/hooks/useAuth'
import type { Card, CardTier } from '@/types'

const TIER_STYLE: Record<CardTier, { badge: string; glow: string; border: string }> = {
  common:    { badge: 'bg-slate-700 text-slate-300',   glow: 'from-slate-700/30',  border: 'border-slate-700/40' },
  rare:      { badge: 'bg-blue-900 text-blue-300',     glow: 'from-blue-900/30',   border: 'border-blue-700/40' },
  epic:      { badge: 'bg-violet-900 text-violet-300', glow: 'from-violet-900/30', border: 'border-violet-700/40' },
  legendary: { badge: 'bg-amber-900 text-amber-300',   glow: 'from-amber-900/30',  border: 'border-amber-600/50' },
}

const DEMO_CARDS: Card[] = [
  {
    id: 'demo-1', figureName: 'Leonardo da Vinci', era: 'Renaissance', domain: 'arts',
    influence: 95, innovation: 98, legacy: 100, tier: 'legendary', portraitUrl: '',
    years: '1452–1519', identities: ['Polymath', 'Inventor'],
    characteristics: 'Insatiably curious, visionary, and obsessively detail-oriented.',
    achievement: 'Painted the Mona Lisa and The Last Supper; designed flying machines centuries before they were built.',
    lore: 'The ultimate Renaissance man — painter, sculptor, architect, mathematician, engineer, and anatomist all in one.',
  },
  {
    id: 'demo-2', figureName: 'Marie Curie', era: 'Modern', domain: 'science',
    influence: 88, innovation: 95, legacy: 92, tier: 'epic', portraitUrl: '',
    years: '1867–1934', identities: ['Scientist', 'Pioneer'],
    characteristics: 'Rigorous, determined, and fearless in the face of adversity.',
    achievement: 'First person to win Nobel Prizes in two sciences — Physics (1903) and Chemistry (1911).',
    lore: 'She broke every barrier in her path — scientific, cultural, and gender — and did so twice.',
  },
  {
    id: 'demo-3', figureName: 'Nikola Tesla', era: 'Industrial', domain: 'science',
    influence: 82, innovation: 97, legacy: 85, tier: 'epic', portraitUrl: '',
    years: '1856–1943', identities: ['Inventor', 'Engineer'],
    characteristics: 'Eccentric, brilliant, and relentlessly inventive with an extraordinary memory.',
    achievement: 'Developed alternating current (AC) electrical systems that power the modern world.',
    lore: "Visionary engineer whose ideas were decades ahead of his time, yet he died largely unrecognized.",
  },
  {
    id: 'demo-4', figureName: 'Julius Caesar', era: 'Ancient', domain: 'politics',
    influence: 90, innovation: 72, legacy: 88, tier: 'rare', portraitUrl: '',
    years: '100–44 BC', identities: ['General', 'Statesman'],
    characteristics: 'Decisive, charismatic, calculating, and supremely confident.',
    achievement: 'Conquered Gaul, won the Roman civil war, and reformed the calendar still in use today.',
    lore: "The man whose name became a title — Caesar — adopted by emperors and kings for two millennia.",
  },
]

export default function CollectionPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { isGuest, exitGuestMode } = useAuth()

  useEffect(() => {
    if (isGuest) { setCards(DEMO_CARDS); setLoading(false); return }
    cardsApi.getAll().then(setCards).finally(() => setLoading(false))
  }, [isGuest])

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
            Exploring as guest — cards are for demo only
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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-[0.1em] text-white uppercase">
              {isGuest ? 'Demo Collection' : 'My Collection'}
            </h1>
            <p className="text-slate-500 text-xs tracking-widest mt-1">
              {loading ? '…' : `${cards.length} card${cards.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => navigate('/battle')}
            className="px-5 py-2.5 rounded-xl font-bold text-sm tracking-wide text-slate-950
                       bg-amber-500 hover:bg-amber-400 active:bg-amber-600
                       shadow-lg shadow-amber-500/25 transition-all duration-200">
            Battle  →
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
            <span className="inline-block w-5 h-5 border-2 border-slate-700 border-t-amber-500 rounded-full animate-spin mr-3" />
            Loading collection…
          </div>
        )}

        {/* Empty state */}
        {!loading && cards.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
              ♛
            </div>
            <p className="text-slate-500 text-sm">No cards yet. Win battles to earn them.</p>
          </div>
        )}

        {/* Card grid */}
        {!loading && cards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {cards.map((card) => (
              <CardItem key={card.id} card={card}
                onClick={() => navigate(`/card/${card.id}`, { state: { card } })} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CardItem({ card, onClick }: { card: Card; onClick: () => void }) {
  const tier = TIER_STYLE[card.tier] ?? TIER_STYLE.common

  return (
    <div onClick={onClick}
      className={`relative rounded-2xl overflow-hidden flex flex-col
                     bg-white/[0.03] border backdrop-blur-sm
                     hover:scale-[1.03] transition-transform duration-200 cursor-pointer
                     ${tier.border}`}>

      {/* Portrait */}
      <div className={`relative h-40 bg-gradient-to-b ${tier.glow} to-transparent flex items-center justify-center`}>
        {card.portraitUrl ? (
          <img src={card.portraitUrl} alt={card.figureName}
            className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl select-none opacity-30">♟</span>
        )}
        {/* Tier badge */}
        <span className={`absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${tier.badge}`}>
          {card.tier}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1.5">
        <p className="text-white text-sm font-semibold leading-tight line-clamp-2">{card.figureName}</p>
        <p className="text-slate-500 text-[10px] uppercase tracking-wider">{card.era} · {card.domain}</p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-1 mt-1">
          {[
            { label: 'INF', val: card.influence },
            { label: 'INN', val: card.innovation },
            { label: 'LEG', val: card.legacy },
          ].map(({ label, val }) => (
            <div key={label} className="flex flex-col items-center rounded-lg py-1"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <span className="text-amber-400 font-bold text-xs">{val}</span>
              <span className="text-slate-600 text-[9px] tracking-wider">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
