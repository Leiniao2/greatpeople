import { useState, useMemo } from 'react'

interface ClassifyConfig {
  title: string
  question: string
  categories: { id: string; label: string; emoji: string }[]
  items: { label: string; category: string; emoji?: string }[]
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

const CONFIGS: Record<string, ClassifyConfig> = {
  'linnaeus-kingdom': {
    title: 'Linnaeus\'s Classification',
    question: 'Sort each organism into the correct kingdom.',
    categories: [
      { id: 'animal', label: 'Animalia', emoji: '🐾' },
      { id: 'plant',  label: 'Plantae',  emoji: '🌿' },
      { id: 'fungi',  label: 'Fungi',    emoji: '🍄' },
    ],
    items: [
      { label: 'Oak Tree',     category: 'plant',  emoji: '🌳' },
      { label: 'Brown Bear',   category: 'animal', emoji: '🐻' },
      { label: 'Chanterelle',  category: 'fungi',  emoji: '🍄' },
      { label: 'Honeybee',     category: 'animal', emoji: '🐝' },
      { label: 'Rose',         category: 'plant',  emoji: '🌹' },
      { label: 'Porcini',      category: 'fungi',  emoji: '🍄' },
      { label: 'Tulip',        category: 'plant',  emoji: '🌷' },
      { label: 'Wolf',         category: 'animal', emoji: '🐺' },
    ],
    fact: 'Carl Linnaeus\'s 1735 Systema Naturae introduced binomial nomenclature — every species named with two Latin words, genus first. He personally classified over 12,000 species.',
  },
  'mendel-traits': {
    title: 'Mendel\'s Peas',
    question: 'Sort each pea trait into Dominant or Recessive.',
    categories: [
      { id: 'dominant',  label: 'Dominant',  emoji: '💪' },
      { id: 'recessive', label: 'Recessive', emoji: '🔬' },
    ],
    items: [
      { label: 'Round seed',    category: 'dominant',  emoji: '🟢' },
      { label: 'Wrinkled seed', category: 'recessive', emoji: '🫛' },
      { label: 'Yellow seed',   category: 'dominant',  emoji: '💛' },
      { label: 'Green seed',    category: 'recessive', emoji: '💚' },
      { label: 'Tall plant',    category: 'dominant',  emoji: '📏' },
      { label: 'Short plant',   category: 'recessive', emoji: '🌱' },
      { label: 'Purple flower', category: 'dominant',  emoji: '💜' },
      { label: 'White flower',  category: 'recessive', emoji: '🤍' },
    ],
    fact: 'Gregor Mendel\'s 1866 pea experiments revealed the laws of inheritance. His paper went unnoticed for 35 years — rediscovered simultaneously in 1900 by three botanists.',
  },
  'darwin-beaks': {
    title: 'Darwin\'s Finches',
    question: 'Match each beak type to what it is best adapted for.',
    categories: [
      { id: 'seeds',   label: 'Seeds & Nuts', emoji: '🌰' },
      { id: 'insects', label: 'Insects',       emoji: '🐛' },
      { id: 'fruit',   label: 'Fruit & Cactus',emoji: '🌵' },
    ],
    items: [
      { label: 'Thick crushing beak', category: 'seeds',   emoji: '🔨' },
      { label: 'Long probing beak',   category: 'fruit',   emoji: '📍' },
      { label: 'Thin pointed beak',   category: 'insects', emoji: '🔪' },
      { label: 'Heavy parrot beak',   category: 'seeds',   emoji: '🦜' },
      { label: 'Slender curved beak', category: 'fruit',   emoji: '🌺' },
      { label: 'Short warbler beak',  category: 'insects', emoji: '🐦' },
    ],
    fact: 'Darwin observed 13 finch species on the Galápagos Islands, each with beaks shaped by the food available on their island. This became key evidence for natural selection.',
  },
  'taxonomy-ranks': {
    title: 'Taxonomy Ranks',
    question: 'Sort these taxonomic levels from broadest to most specific.',
    categories: [
      { id: 'broad',    label: 'Broad (top)',   emoji: '🌍' },
      { id: 'middle',   label: 'Middle',        emoji: '🔍' },
      { id: 'specific', label: 'Specific (bottom)', emoji: '🔬' },
    ],
    items: [
      { label: 'Kingdom', category: 'broad',    emoji: '👑' },
      { label: 'Phylum',  category: 'broad',    emoji: '🌿' },
      { label: 'Order',   category: 'middle',   emoji: '📋' },
      { label: 'Family',  category: 'middle',   emoji: '🏠' },
      { label: 'Genus',   category: 'specific', emoji: '🏷️' },
      { label: 'Species', category: 'specific', emoji: '🧬' },
    ],
    fact: 'Linnaeus established the hierarchical classification system still used today. The full hierarchy is: Domain → Kingdom → Phylum → Class → Order → Family → Genus → Species.',
  },
  'ecosystems': {
    title: 'Ecosystem Sorting',
    question: 'Sort each organism by its role in the food chain.',
    categories: [
      { id: 'producer',  label: 'Producer',  emoji: '🌿' },
      { id: 'herbivore', label: 'Herbivore', emoji: '🐰' },
      { id: 'carnivore', label: 'Carnivore', emoji: '🦁' },
    ],
    items: [
      { label: 'Grass',      category: 'producer',  emoji: '🌾' },
      { label: 'Rabbit',     category: 'herbivore', emoji: '🐇' },
      { label: 'Fox',        category: 'carnivore', emoji: '🦊' },
      { label: 'Oak Tree',   category: 'producer',  emoji: '🌳' },
      { label: 'Deer',       category: 'herbivore', emoji: '🦌' },
      { label: 'Eagle',      category: 'carnivore', emoji: '🦅' },
      { label: 'Algae',      category: 'producer',  emoji: '🫧' },
      { label: 'Caterpillar',category: 'herbivore', emoji: '🐛' },
    ],
    fact: 'Linnaeus understood that nature formed an "economy" — each species occupying a role. His concept of the "balance of nature" foreshadowed modern ecology.',
  },
}

export default function ClassifyGame({ configId, onWin }: { configId: string; onWin: () => void }) {
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
      setTimeout(() => { setWrongItem(null); setSelectedItem(null) }, 800)
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-3">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
      <p className="text-white text-sm font-medium leading-snug">{config.question}</p>

      {/* Category buckets */}
      <div className="flex gap-2">
        {config.categories.map(cat => {
          const placedHere = items.filter(it => placed[it.label] === cat.id)
          return (
            <button
              key={cat.id}
              onClick={() => placeInCategory(cat.id)}
              disabled={!selectedItem || won}
              className={`flex-1 min-h-[80px] rounded-xl border p-2 text-center transition-all
                ${selectedItem ? 'border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/15' : 'border-white/10 bg-white/[0.03]'}
              `}
            >
              <div className="text-lg mb-1">{cat.emoji}</div>
              <div className="text-[10px] font-bold text-slate-300 mb-1">{cat.label}</div>
              <div className="flex flex-wrap gap-1 justify-center">
                {placedHere.map(it => (
                  <span key={it.label} className="text-xs bg-emerald-500/20 text-emerald-300 rounded px-1">
                    {it.emoji} {it.label}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* Unplaced items */}
      <div className="flex flex-wrap gap-2 justify-center min-h-[40px]">
        {unplaced.map(item => {
          const isSelected = selectedItem === item.label
          const isWrong = wrongItem === item.label
          return (
            <button
              key={item.label}
              onClick={() => selectItem(item.label)}
              disabled={won}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all
                ${isWrong ? 'border-red-500/60 bg-red-500/20 text-red-300'
                  : isSelected ? 'border-amber-400 bg-amber-500/20 text-amber-200 scale-105'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:border-amber-500/30'}`}
            >
              {item.emoji} {item.label}
            </button>
          )
        })}
        {unplaced.length === 0 && !won && (
          <p className="text-slate-500 text-xs self-center italic">All items placed!</p>
        )}
      </div>

      <p className="text-slate-500 text-[10px] text-center">
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
