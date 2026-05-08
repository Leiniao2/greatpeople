import { useLocation, useNavigate } from 'react-router-dom'
import type { Card, CardTier } from '@/types'

const TIER_STYLE: Record<CardTier, { badge: string; glow: string; border: string; accent: string }> = {
  common:    { badge: 'bg-slate-700 text-slate-200',   glow: 'from-slate-800/80',    border: 'border-slate-700/50', accent: '#64748b' },
  rare:      { badge: 'bg-blue-900 text-blue-200',     glow: 'from-blue-950/80',     border: 'border-blue-700/50',  accent: '#3b82f6' },
  epic:      { badge: 'bg-violet-900 text-violet-200', glow: 'from-violet-950/80',   border: 'border-violet-700/50',accent: '#8b5cf6' },
  legendary: { badge: 'bg-amber-900 text-amber-200',   glow: 'from-amber-950/80',    border: 'border-amber-600/50', accent: '#f59e0b' },
}

export default function CardDetailPage() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const card = state?.card as Card | undefined

  if (!card) {
    return (
      <div className="min-h-screen bg-[#080812] flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-slate-400">Card not found.</p>
          <button onClick={() => navigate('/collection')}
            className="text-amber-400 text-sm hover:text-amber-300 transition-colors">
            ← Back to Collection
          </button>
        </div>
      </div>
    )
  }

  const tier = TIER_STYLE[card.tier] ?? TIER_STYLE.common

  return (
    <div className="min-h-screen bg-[#080812] overflow-x-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full blur-[160px]"
          style={{ background: `${tier.accent}18` }} />
      </div>

      <div className="relative z-10 max-w-sm mx-auto px-0">

        {/* Image slot — 9:16 portrait aspect ratio */}
        <div className="relative w-full aspect-[9/16] overflow-hidden">
          {card.portraitUrl ? (
            <img src={card.portraitUrl} alt={card.figureName}
              className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: `linear-gradient(180deg, ${tier.accent}22 0%, #080812 100%)` }}>
              <span className="text-8xl opacity-20 select-none">♟</span>
            </div>
          )}

          {/* Bottom gradient overlay */}
          <div className={`absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t ${tier.glow} to-transparent`} />

          {/* Back button */}
          <button onClick={() => navigate('/collection')}
            className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5
                       rounded-full text-xs font-semibold text-white/80 hover:text-white
                       bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all">
            ← Collection
          </button>

          {/* Tier badge */}
          <span className={`absolute top-4 right-4 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${tier.badge}`}>
            {card.tier}
          </span>

          {/* Name overlay at bottom of image */}
          <div className="absolute bottom-0 inset-x-0 px-5 pb-5">
            <h1 className="text-white text-2xl font-bold leading-tight drop-shadow-lg">
              {card.figureName}
            </h1>
            {card.years && (
              <p className="text-white/60 text-sm mt-0.5 drop-shadow">{card.years}</p>
            )}
          </div>
        </div>

        {/* Info panel */}
        <div className="px-5 py-6 space-y-6">

          {/* Identities */}
          {card.identities?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {card.identities.slice(0, 2).map((id) => (
                <span key={id}
                  className="px-3 py-1 rounded-full text-xs font-semibold border"
                  style={{ borderColor: `${tier.accent}60`, color: tier.accent, background: `${tier.accent}15` }}>
                  {id}
                </span>
              ))}
            </div>
          )}

          {/* Characteristics */}
          {card.characteristics && (
            <InfoSection label="Characteristics" text={card.characteristics} accent={tier.accent} />
          )}

          {/* Achievement */}
          {card.achievement && (
            <InfoSection label="Achievement" text={card.achievement} accent={tier.accent} />
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'INFLUENCE', short: 'INF', val: card.influence },
              { label: 'INNOVATION', short: 'INN', val: card.innovation },
              { label: 'LEGACY', short: 'LEG', val: card.legacy },
            ].map(({ label, short, val }) => (
              <div key={short} className="flex flex-col items-center py-3 rounded-xl border"
                style={{ background: `${tier.accent}08`, borderColor: `${tier.accent}25` }}>
                <span className="font-bold text-xl" style={{ color: tier.accent }}>{val}</span>
                <span className="text-slate-500 text-[10px] tracking-widest mt-0.5">{short}</span>
              </div>
            ))}
          </div>

          {/* Era / Domain */}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="uppercase tracking-wider">{card.era}</span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span className="capitalize">{card.domain}</span>
          </div>

          {/* Lore */}
          {card.lore && (
            <InfoSection label="Lore" text={card.lore} accent={tier.accent} italic />
          )}

          <div className="h-8" />
        </div>
      </div>
    </div>
  )
}

function InfoSection({
  label, text, accent, italic = false,
}: { label: string; text: string; accent: string; italic?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em]"
        style={{ color: accent }}>
        {label}
      </p>
      <p className={`text-slate-300 text-sm leading-relaxed ${italic ? 'italic text-slate-400' : ''}`}>
        {text}
      </p>
    </div>
  )
}
