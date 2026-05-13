import { useState } from 'react'

interface Ingredient { symbol: string; name: string; color: string; max: number }
interface ChemistryConfig {
  title: string
  question: string
  targetFormula: string
  targetName: string
  ingredients: Ingredient[]
  solution: Record<string, number>
  hint: string
  fact: string
}

const CONFIGS: Record<string, ChemistryConfig> = {
  'tea-blend': {
    title: "Lu Yu's Perfect Cup",
    question: "Combine the ingredients in the proportions Lu Yu prescribed in the Classic of Tea.",
    targetFormula: "2茶 + 3水 + 1塩",
    targetName: "Perfect Tea (陸羽法)",
    ingredients: [
      { symbol: '茶', name: 'Tea Leaves', color: 'bg-emerald-700', max: 5 },
      { symbol: '水', name: 'Spring Water', color: 'bg-blue-600', max: 6 },
      { symbol: '塩', name: 'Salt',        color: 'bg-slate-300', max: 4 },
      { symbol: '炭', name: 'Bamboo Charcoal', color: 'bg-slate-700', max: 3 },
    ],
    solution: { '茶': 2, '水': 3, '塩': 1 },
    hint: 'Bamboo charcoal is used to heat the water — it is not added to the cup.',
    fact: "Lu Yu's Classic of Tea (茶經, c. 760 CE) specified mountain spring water, 2 measures of powdered tea cake, 3 ladles of water, and a pinch of salt. The text also described the ideal colour of flame, the sound of boiling water, and the correct bowl shape — the world's first systematic sensory science.",
  },
  'spice-route': {
    title: "Magellan's Hold",
    question: "Load the flagship Trinidad with the spice ratio that will make the voyage profitable.",
    targetFormula: "3 Cloves + 1 Cinnamon + 2 Pepper",
    targetName: "Spice Manifest (1521)",
    ingredients: [
      { symbol: '⚘', name: 'Cloves',    color: 'bg-rose-800',  max: 6 },
      { symbol: '🌿', name: 'Cinnamon', color: 'bg-amber-700', max: 4 },
      { symbol: '●',  name: 'Pepper',   color: 'bg-slate-600', max: 5 },
      { symbol: '✦',  name: 'Nutmeg',   color: 'bg-orange-700',max: 3 },
    ],
    solution: { '⚘': 3, '🌿': 1, '●': 2 },
    hint: 'Nutmeg is valuable but too heavy to justify against the other three.',
    fact: "When the Victoria limped back to Seville in 1522 — the only ship of five to complete the circumnavigation — its hold of cloves, cinnamon, and pepper was enough to cover the entire cost of the expedition and turn a profit. A single voyage transformed European understanding of the globe.",
  },
  'mendel-cross': {
    title: "Mendel's Garden Cross",
    question: "Gregor Mendel crosses pea plants. Select the correct ratio of dominant to recessive offspring.",
    targetFormula: "3 Round + 1 Wrinkled",
    targetName: "F₂ Mendelian Ratio",
    ingredients: [
      { symbol: 'R', name: 'Round (dominant)',    color: 'bg-green-600', max: 6 },
      { symbol: 'W', name: 'Wrinkled (recessive)', color: 'bg-yellow-700', max: 4 },
      { symbol: 'Y', name: 'Yellow seed',          color: 'bg-yellow-400', max: 4 },
      { symbol: 'G', name: 'Green seed',           color: 'bg-green-800',  max: 4 },
    ],
    solution: { 'R': 3, 'W': 1 },
    hint: "Seed colour is a separate trait — focus on shape.",
    fact: "When Mendel crossed two heterozygous round-seed plants (Rr × Rr), three out of four offspring showed the round phenotype — the famous 3:1 ratio. He published this finding in 1866. It was ignored for 35 years, until 1900, when three botanists simultaneously rediscovered his work and founded the science of genetics.",
  },
}

export default function ChemistryGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['tea-blend']
  const [counts, setCounts] = useState<Record<string, number>>(
    () => Object.fromEntries(config.ingredients.map(i => [i.symbol, 0]))
  )
  const [reacted, setReacted] = useState(false)
  const [failed, setFailed] = useState(false)

  const adjust = (sym: string, delta: number) => {
    if (reacted) return
    setFailed(false)
    setCounts(c => {
      const ing = config.ingredients.find(i => i.symbol === sym)!
      const next = Math.max(0, Math.min(ing.max, (c[sym] ?? 0) + delta))
      return { ...c, [sym]: next }
    })
  }

  const checkMatch = () => {
    const sol = config.solution
    const match = Object.entries(sol).every(([sym, need]) => (counts[sym] ?? 0) === need)
    const noExtra = config.ingredients
      .filter(i => !(i.symbol in sol))
      .every(i => (counts[i.symbol] ?? 0) === 0)
    return match && noExtra
  }

  const react = () => {
    if (checkMatch()) {
      setReacted(true)
      setTimeout(onWin, 700)
    } else {
      setFailed(true)
    }
  }

  const reset = () => {
    setCounts(Object.fromEntries(config.ingredients.map(i => [i.symbol, 0])))
    setFailed(false)
  }

  const anyAdded = Object.values(counts).some(v => v > 0)

  return (
    <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-4">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
      <p className="text-white text-sm font-medium leading-snug">{config.question}</p>

      {/* Target */}
      <div className="flex flex-col gap-1 bg-white/[0.03] border border-amber-500/20 rounded-xl p-3">
        <p className="text-[10px] text-amber-400/60 uppercase tracking-wider font-semibold">Target</p>
        <p className="text-amber-300 font-mono text-sm font-bold">{config.targetFormula}</p>
        <p className="text-slate-500 text-[10px]">{config.targetName}</p>
      </div>

      {/* Flask / current mix */}
      <div className="flex flex-col gap-1 bg-white/[0.03] border border-white/10 rounded-xl p-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Your Mix</p>
        <div className="flex flex-wrap gap-2 min-h-[28px]">
          {config.ingredients.filter(i => counts[i.symbol] > 0).map(i => (
            <span key={i.symbol} className={`${i.color} text-white text-xs font-bold px-2 py-1 rounded-lg`}>
              {counts[i.symbol]}× {i.name}
            </span>
          ))}
          {!anyAdded && <span className="text-slate-600 text-xs italic">Nothing added yet</span>}
        </div>
      </div>

      {/* Ingredient controls */}
      <div className="grid grid-cols-2 gap-2">
        {config.ingredients.map(ing => (
          <div key={ing.symbol} className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2">
            <div className={`${ing.color} w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
              {ing.symbol}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{ing.name}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => adjust(ing.symbol, -1)} className="w-6 h-6 rounded bg-white/10 text-slate-300 text-sm hover:bg-white/20 transition-colors">−</button>
              <span className="text-white font-bold text-sm w-5 text-center">{counts[ing.symbol]}</span>
              <button onClick={() => adjust(ing.symbol, +1)} className="w-6 h-6 rounded bg-white/10 text-slate-300 text-sm hover:bg-white/20 transition-colors">+</button>
            </div>
          </div>
        ))}
      </div>

      {failed && (
        <p className="text-red-400 text-xs text-center">{config.hint}</p>
      )}

      {/* Action buttons */}
      {!reacted && (
        <div className="flex gap-2">
          <button onClick={reset} className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 text-sm hover:border-white/20 transition-all">
            Reset
          </button>
          <button onClick={react} className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-all">
            Combine ⚗
          </button>
        </div>
      )}

      {reacted && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-xs leading-relaxed">
          <span className="font-bold text-emerald-300">✓ Perfect blend! </span>
          <span className="text-slate-400">{config.fact}</span>
        </div>
      )}
    </div>
  )
}
