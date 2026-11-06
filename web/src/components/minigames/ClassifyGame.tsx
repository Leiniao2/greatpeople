import { useState, useMemo } from 'react'
import type { MinigameProps } from '@/games/types'
import { scale } from './_shared'
import { classifyArtUrl } from '@/games/classifyArt'

interface ClassifyConfig {
  title: string
  question: string
  categories: { id: string; label: string }[]
  /** art: painted card in web/public/classify/<art>.webp (see CLASSIFY_ART). */
  items: { label: string; category: string; art: string }[]
  fact: string
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export const CONFIGS: Record<string, ClassifyConfig> = {
  'linnaeus-kingdom': {
    title: 'Linnaeus\'s Classification',
    question: 'Sort each organism into the correct kingdom.',
    categories: [
      { id: 'animal', label: 'Animalia' },
      { id: 'plant',  label: 'Plantae' },
      { id: 'fungi',  label: 'Fungi' },
    ],
    items: [
      { label: 'Oak Tree', category: 'plant', art: 'oak_tree' },
      { label: 'Brown Bear', category: 'animal', art: 'brown_bear' },
      { label: 'Chanterelle', category: 'fungi', art: 'chanterelle' },
      { label: 'Honeybee', category: 'animal', art: 'honeybee' },
      { label: 'Rose', category: 'plant', art: 'rose' },
      { label: 'Porcini', category: 'fungi', art: 'porcini' },
      { label: 'Tulip', category: 'plant', art: 'tulip' },
      { label: 'Wolf', category: 'animal', art: 'wolf' },
    ],
    fact: 'Carl Linnaeus\'s 1735 Systema Naturae introduced binomial nomenclature — every species named with two Latin words, genus first. He personally classified over 12,000 species.',
  },
  'mendel-traits': {
    title: 'Mendel\'s Peas',
    question: 'Sort each pea trait into Dominant or Recessive.',
    categories: [
      { id: 'dominant',  label: 'Dominant' },
      { id: 'recessive', label: 'Recessive' },
    ],
    items: [
      { label: 'Round seed', category: 'dominant', art: 'pea_round' },
      { label: 'Wrinkled seed', category: 'recessive', art: 'pea_wrinkled' },
      { label: 'Yellow seed', category: 'dominant', art: 'pea_yellow' },
      { label: 'Green seed', category: 'recessive', art: 'pea_green' },
      { label: 'Tall plant', category: 'dominant', art: 'pea_tall' },
      { label: 'Short plant', category: 'recessive', art: 'pea_short' },
      { label: 'Purple flower', category: 'dominant', art: 'pea_purple_flower' },
      { label: 'White flower', category: 'recessive', art: 'pea_white_flower' },
    ],
    fact: 'Gregor Mendel\'s 1866 pea experiments revealed the laws of inheritance. His paper went unnoticed for 35 years — rediscovered simultaneously in 1900 by three botanists.',
  },
  'darwin-beaks': {
    title: 'Darwin\'s Finches',
    question: 'Match each beak type to what it is best adapted for.',
    categories: [
      { id: 'seeds',   label: 'Seeds & Nuts' },
      { id: 'insects', label: 'Insects' },
      { id: 'fruit',   label: 'Fruit & Cactus' },
    ],
    items: [
      { label: 'Thick crushing beak', category: 'seeds', art: 'finch_crushing' },
      { label: 'Long probing beak', category: 'fruit', art: 'finch_probing' },
      { label: 'Thin pointed beak', category: 'insects', art: 'finch_pointed' },
      { label: 'Heavy parrot beak', category: 'seeds', art: 'finch_parrot' },
      { label: 'Slender curved beak', category: 'fruit', art: 'finch_curved' },
      { label: 'Short warbler beak', category: 'insects', art: 'finch_warbler' },
    ],
    fact: 'Darwin observed 13 finch species on the Galápagos Islands, each with beaks shaped by the food available on their island. This became key evidence for natural selection.',
  },
  'taxonomy-ranks': {
    title: 'Taxonomy Ranks',
    question: 'Sort these taxonomic levels from broadest to most specific.',
    categories: [
      { id: 'broad',    label: 'Broad (top)' },
      { id: 'middle',   label: 'Middle' },
      { id: 'specific', label: 'Specific (bottom)' },
    ],
    items: [
      { label: 'Kingdom', category: 'broad', art: 'rank_kingdom' },
      { label: 'Phylum', category: 'broad', art: 'rank_phylum' },
      { label: 'Order', category: 'middle', art: 'rank_order' },
      { label: 'Family', category: 'middle', art: 'rank_family' },
      { label: 'Genus', category: 'specific', art: 'rank_genus' },
      { label: 'Species', category: 'specific', art: 'rank_species' },
    ],
    fact: 'Linnaeus established the hierarchical classification system still used today. The full hierarchy is: Domain → Kingdom → Phylum → Class → Order → Family → Genus → Species.',
  },
  'ecosystems': {
    title: 'Ecosystem Sorting',
    question: 'Sort each organism by its role in the food chain.',
    categories: [
      { id: 'producer',  label: 'Producer' },
      { id: 'herbivore', label: 'Herbivore' },
      { id: 'carnivore', label: 'Carnivore' },
    ],
    items: [
      { label: 'Grass', category: 'producer', art: 'grass' },
      { label: 'Rabbit', category: 'herbivore', art: 'rabbit' },
      { label: 'Fox', category: 'carnivore', art: 'fox' },
      { label: 'Oak Tree', category: 'producer', art: 'oak_tree' },
      { label: 'Deer', category: 'herbivore', art: 'deer' },
      { label: 'Eagle', category: 'carnivore', art: 'eagle' },
      { label: 'Algae', category: 'producer', art: 'algae' },
      { label: 'Caterpillar', category: 'herbivore', art: 'caterpillar' },
    ],
    fact: 'Linnaeus understood that nature formed an "economy" — each species occupying a role. His concept of the "balance of nature" foreshadowed modern ecology.',
  },
  'magellan-seas': {
    title: "Magellan's Seas",
    question: "Sort each port or landmark into the ocean Magellan's fleet crossed to reach it.",
    categories: [
      { id: 'atlantic', label: 'Atlantic' },
      { id: 'pacific',  label: 'Pacific' },
      { id: 'indian',   label: 'Indian' },
    ],
    items: [
      { label: 'Canary Islands', category: 'atlantic', art: 'canary_islands' },
      { label: 'Rio de Janeiro', category: 'atlantic', art: 'rio_de_janeiro' },
      { label: 'Patagonia', category: 'atlantic', art: 'patagonia' },
      { label: 'Guam', category: 'pacific', art: 'guam' },
      { label: 'Philippines (Cebu)', category: 'pacific', art: 'cebu' },
      { label: 'Spice Islands', category: 'pacific', art: 'spice_islands' },
      { label: 'Mozambique Channel', category: 'indian', art: 'mozambique_channel' },
      { label: 'Cape of Good Hope', category: 'indian', art: 'cape_of_good_hope' },
    ],
    fact: "Magellan's fleet crossed three oceans: the Atlantic on the outward leg, the Pacific in the longest and most grueling stretch (98 days with no landfall), and the Indian Ocean on the homeward run after Magellan's death in the Philippines.",
  },
  'apple-grid': {
    title: 'Four Boxes, Cupertino 1997',
    question: "Jobs's grid has a consumer row and a pro row, each with one desktop and one portable. Put every product in its row — or cut it.",
    categories: [
      { id: 'consumer', label: 'Consumer' },
      { id: 'pro',      label: 'Pro' },
      { id: 'cut',      label: 'Cut' },
    ],
    items: [
      { label: 'iMac', category: 'consumer', art: 'imac' },
      { label: 'iBook', category: 'consumer', art: 'ibook' },
      { label: 'Power Mac G3', category: 'pro', art: 'power_mac_g3' },
      { label: 'PowerBook G3', category: 'pro', art: 'powerbook_g3' },
      { label: 'Newton MessagePad', category: 'cut', art: 'newton_messagepad' },
      { label: 'eMate 300', category: 'cut', art: 'emate_300' },
      { label: 'Pippin console', category: 'cut', art: 'pippin' },
      { label: 'QuickTake camera', category: 'cut', art: 'quicktake' },
    ],
    fact: 'When Jobs returned in 1997, Apple sold a confusing spread of Macintosh models alongside printers, cameras, the Newton handheld and the Pippin console. He cut the line to four boxes — consumer and pro, desktop and portable — later filled by the iMac, iBook, Power Mac G3 and PowerBook G3.',
  },
}

export default function ClassifyGame({ configId, difficulty, onWin, onLose }: MinigameProps) {
  const maxMistakes = scale(difficulty, [3, 3, 2, 2])
  const [mistakes, setMistakes] = useState(0)
  const config = CONFIGS[configId] ?? CONFIGS['linnaeus-kingdom']
  const items = useMemo(() => shuffle(config.items), [config.items])

  const [placed, setPlaced] = useState<Record<string, string>>({}) // label → categoryId
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [wrongItem, setWrongItem] = useState<string | null>(null)
  const [won, setWon] = useState(false)

  const unplaced = items.filter(it => !placed[it.label])

  const selectItem = (label: string) => {
    if (won) return
    setSelectedItem(prev => prev === label ? null : label)
  }

  const placeInCategory = (catId: string) => {
    if (!selectedItem || won) return
    const item = items.find(it => it.label === selectedItem)
    if (!item) return

    if (item.category === catId) {
      const next = { ...placed, [selectedItem]: catId }
      setPlaced(next)
      setSelectedItem(null)
      if (Object.keys(next).length === items.length) {
        setWon(true)
        setTimeout(onWin, 600)
      }
    } else {
      setWrongItem(selectedItem)
      const n = mistakes + 1
      setMistakes(n)
      if (n >= maxMistakes) { setTimeout(() => onLose('too many misplacements'), 800); return }
      setTimeout(() => { setWrongItem(null); setSelectedItem(null) }, 800)
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3">
      <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
      <p className="text-ink text-sm font-medium leading-snug">{config.question}</p>

      {/* Category bins: placed cards collect here as thumbnails */}
      <div className="flex gap-2">
        {config.categories.map(cat => {
          const placedHere = items.filter(it => placed[it.label] === cat.id)
          return (
            <button
              key={cat.id}
              onClick={() => placeInCategory(cat.id)}
              disabled={!selectedItem || won}
              className={`flex-1 min-h-[92px] rounded-xl border-2 border-dashed p-1.5 text-center transition-all
                ${selectedItem ? 'border-accent/60 bg-accent/5 hover:bg-accent/15' : 'border-line bg-panel'}
              `}
            >
              <div className="text-[11px] font-bold text-ink-2 mb-1.5 uppercase tracking-wide">{cat.label}</div>
              <div className="flex flex-wrap gap-1 justify-center">
                {placedHere.map(it => (
                  <img key={it.label} src={classifyArtUrl(it.art)} alt={it.label} title={it.label}
                    className="w-9 h-9 rounded-md object-cover ring-2 ring-emerald-500/70" />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* Cards still to sort */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 min-h-[40px]">
        {unplaced.map(item => {
          const isSelected = selectedItem === item.label
          const isWrong = wrongItem === item.label
          return (
            <button
              key={item.label}
              onClick={() => selectItem(item.label)}
              disabled={won}
              aria-label={item.label}
              className={`rounded-xl border-2 overflow-hidden bg-panel text-left transition-all
                ${isWrong ? 'border-red-500 animate-pulse'
                  : isSelected ? 'border-accent scale-105 shadow-lg'
                  : 'border-line hover:border-accent/40'}`}
            >
              <div className="aspect-[4/3] bg-paper overflow-hidden">
                <img src={classifyArtUrl(item.art)} alt="" loading="eager" draggable={false}
                  className="w-full h-full object-cover"
                  onError={e => { e.currentTarget.style.display = 'none' }} />
              </div>
              <div className={`px-1.5 py-1 text-[11px] font-semibold leading-tight text-center
                ${isWrong ? 'bg-red-500/20 text-red-300' : isSelected ? 'bg-accent/20 text-ink' : 'text-ink-2'}`}>
                {item.label}
              </div>
            </button>
          )
        })}
      </div>
      {unplaced.length === 0 && !won && (
        <p className="text-muted text-xs text-center italic">All items placed!</p>
      )}

      <p className="text-muted text-[10px] text-center">
        {won ? '' : selectedItem ? `Tap a category to place "${selectedItem}"` : 'Tap an item, then tap its category'}
      </p>

      {won && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs leading-relaxed">
          <span className="font-bold mr-1">✓ Perfectly classified!</span>{config.fact}
        </div>
      )}
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
