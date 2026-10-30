import { useMemo, useState } from 'react'
import artworksJson from '@/data/artworks.json'
import cardsJson from '@/data/cards.json'
import { artworkUrl, type ArtworkFolder } from '@/data/images'

// The art library: famous paintings, battles, items, maps, religious symbols
// and the scenario cards, as catalogued in data/artworks.json.

export interface Artwork {
  folder: ArtworkFolder
  key: string
  title: string
  subtitle?: string
  /** Ids of the Great People cards this piece relates to. */
  cards?: string[]
}

export const ARTWORKS = artworksJson as Artwork[]

const FOLDERS: { id: ArtworkFolder | 'all'; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'paintings', label: 'Paintings' },
  { id: 'battles',   label: 'Battles' },
  { id: 'items',     label: 'Items' },
  { id: 'maps',      label: 'Maps' },
  { id: 'symbols',   label: 'Symbols' },
  { id: 'scenarios', label: 'Scenarios' },
]

const CARD_NAMES: Record<string, string> = Object.fromEntries(cardsJson.map(c => [c.id, c.figureName]))

/** Artworks linked to a card, for its detail page. */
export const artworksForCard = (cardId: string) => ARTWORKS.filter(a => a.cards?.includes(cardId))

export default function ArtGallery() {
  const [folder, setFolder] = useState<ArtworkFolder | 'all'>('all')
  const [selected, setSelected] = useState<Artwork | null>(null)

  const shown = useMemo(
    () => folder === 'all' ? ARTWORKS : ARTWORKS.filter(a => a.folder === folder),
    [folder],
  )

  return (
    <>
      <div className="flex gap-2 mb-6 flex-wrap">
        {FOLDERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFolder(f.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
              ${folder === f.id
                ? 'bg-panel text-ink border border-line-2'
                : 'bg-panel text-muted border border-line hover:border-line-2 hover:text-ink-2'
              }`}>
            {f.label}
            <span className="ml-1.5 text-muted/70">
              {f.id === 'all' ? ARTWORKS.length : ARTWORKS.filter(a => a.folder === f.id).length}
            </span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {shown.map(a => (
          <div
            key={`${a.folder}/${a.key}`}
            onClick={() => setSelected(a)}
            className="relative rounded-2xl overflow-hidden flex flex-col
                       bg-panel border border-line backdrop-blur-sm
                       hover:scale-[1.03] hover:border-accent/20 cursor-pointer transition-all duration-200">
            <div className="relative aspect-video bg-paper-2 overflow-hidden">
              <img
                src={artworkUrl(a.folder, a.key)}
                alt={a.title}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold text-ink leading-tight line-clamp-1">{a.title}</p>
              {a.subtitle && <p className="text-[10px] text-muted mt-0.5 line-clamp-1">{a.subtitle}</p>}
            </div>
          </div>
        ))}
      </div>

      {selected && <ArtworkModal art={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function ArtworkModal({ art, onClose }: { art: Artwork; onClose: () => void }) {
  const related = (art.cards ?? []).map(id => CARD_NAMES[id]).filter(Boolean)
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/80 p-4" onClick={onClose}>
      <div
        className="relative bg-panel border border-line rounded-2xl overflow-hidden w-full max-w-3xl shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <img src={artworkUrl(art.folder, art.key)} alt={art.title} className="w-full aspect-video object-cover" />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-ink/70 text-paper flex items-center justify-center hover:bg-ink">
          ✕
        </button>
        <div className="p-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-muted">{art.folder}</p>
          <p className="font-display text-lg font-bold text-ink leading-tight">{art.title}</p>
          {art.subtitle && <p className="text-ink-2 text-sm">{art.subtitle}</p>}
          {related.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {related.map(name => (
                <span key={name} className="text-[10px] px-2 py-0.5 rounded-full border border-accent/30 text-accent/80">
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
