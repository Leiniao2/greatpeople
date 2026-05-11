import { useState, useMemo } from 'react'

interface CookingConfig {
  title: string
  question: string
  steps: string[]  // correct order
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

const CONFIGS: Record<string, CookingConfig> = {
  'lu-yu-tea': {
    title: 'The Classic of Tea',
    question: 'Lu Yu wrote the first treatise on tea. Arrange the steps to brew tea in the Tang Dynasty style:',
    steps: [
      '🔥 Kindle a charcoal fire in the wind-sheltered brazier',
      '💧 Boil fresh spring water until first bubbles appear',
      '🍃 Crumble the compressed tea cake into fine powder',
      '🧂 Add a pinch of salt as the water nears boil',
      '🌊 Ladle in a cup of water to calm the boil',
      '🍵 Add tea powder and stir in a circular motion',
      '🫖 Pour into small ceramic bowls and serve immediately',
    ],
    fact: 'Lu Yu\'s Chajing (茶經), written around 760 CE, described every detail of tea — from the ideal fuel to the correct water source. He recommended mountain spring water above all.',
  },
  'japanese-tea': {
    title: 'The Tea Ceremony',
    question: 'Arrange the steps of a Japanese matcha tea ceremony in the correct order:',
    steps: [
      '🏮 Enter the tea room and bow in greeting',
      '🧹 Wipe the tea bowl with a silk cloth (fukusa)',
      '🥄 Scoop two scoops of matcha into the bowl',
      '💧 Add hot water at 80°C — not boiling',
      '🎋 Whisk in a W-shape until frothy',
      '🍵 Turn the bowl so the front faces the guest',
      '🙏 Guest bows, rotates the bowl, and drinks',
    ],
    fact: 'The Japanese tea ceremony (Chanoyu) was codified by Sen no Rikyū in the 16th century. Every gesture carries meaning — a meditative practice disguised as hospitality.',
  },
  'silk-road-spice': {
    title: 'Silk Road Pilaf',
    question: 'A Central Asian feast during the golden age of trade. Arrange the steps to make pilaf:',
    steps: [
      '🛢️ Heat lamb fat or oil in a heavy kazan (cauldron)',
      '🧅 Fry sliced onions until deep golden-brown',
      '🥩 Add diced lamb and sear on all sides',
      '🥕 Add julienned carrots and stir to coat',
      '🌶️ Season with cumin, coriander, and barberries',
      '🌾 Rinse and add soaked rice, level the surface',
      '💧 Pour in just enough water to cover by one finger',
      '🔥 Reduce heat, cover, and steam for 20 minutes',
    ],
    fact: 'Plov (pilaf) spread from Persia to China along the Silk Road. The name comes from the Sanskrit pulāka. Every culture along the route adapted the dish to local ingredients.',
  },
  'aztec-chocolate': {
    title: 'Sacred Cacao Drink',
    question: 'Arrange the Aztec steps to prepare the sacred cacao drink offered to warriors and gods:',
    steps: [
      '☀️ Dry harvested cacao pods in the sun for five days',
      '🔥 Roast the dried beans over an open flame',
      '🪨 Grind roasted beans on a stone metate',
      '🌶️ Mix in chilli, vanilla, and achiote paste',
      '💧 Add water and mix to a thick paste',
      '🫗 Pour the liquid back and forth to create foam',
      '🏺 Serve cold in a painted gourd cup',
    ],
    fact: 'Theobroma cacao means "food of the gods." The Aztec emperor Moctezuma reportedly drank 50 cups a day. Spanish conquistadors brought the drink to Europe, where sugar was added.',
  },
  'bread-egypt': {
    title: 'Ancient Egyptian Bread',
    question: 'Arrange the steps as an Egyptian baker would have followed 3,000 years ago:',
    steps: [
      '🌾 Grind emmer wheat with a stone hand-mill',
      '💧 Mix flour with Nile water and a pinch of natron',
      '🍞 Knead the dough until smooth and elastic',
      '⏳ Leave to rise in the shade for several hours',
      '🔥 Heat a clay oven with acacia wood',
      '👁️ Shape loaves and press sesame seeds on top',
      '🍞 Bake until golden and hollow-sounding when tapped',
    ],
    fact: 'Ancient Egyptians baked over 30 varieties of bread. Workers who built the pyramids received beer and bread as wages. The word "Lord" (hm) in Egyptian is related to "bread-baker."',
  },
}

export default function CookingGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['lu-yu-tea']
  const shuffled = useMemo(() => shuffle(config.steps), [config.steps])

  const [chosen, setChosen] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)

  const remaining = shuffled.filter(s => !chosen.includes(s))
  const allPicked = chosen.length === config.steps.length

  const select = (step: string) => {
    if (submitted) return
    setChosen(prev => [...prev, step])
  }

  const remove = (step: string) => {
    if (submitted) return
    setChosen(prev => prev.filter(s => s !== step))
  }

  const handleCheck = () => {
    const correct = chosen.every((s, i) => s === config.steps[i])
    setSubmitted(true)
    if (correct) setTimeout(onWin, 700)
  }

  const isCorrect = submitted && chosen.every((s, i) => s === config.steps[i])

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-3">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
      <p className="text-white text-sm font-medium leading-snug">{config.question}</p>

      {/* Chosen steps in order */}
      <div className="flex flex-col gap-1.5 min-h-[60px] p-2 rounded-xl bg-slate-900 border border-white/[0.06]">
        {chosen.length === 0 && (
          <p className="text-slate-600 text-xs italic self-center my-1">Tap steps below in order…</p>
        )}
        {chosen.map((step, i) => {
          const isStepCorrect = submitted && step === config.steps[i]
          const isStepWrong = submitted && step !== config.steps[i]
          return (
            <button
              key={step}
              onClick={() => remove(step)}
              disabled={submitted}
              className={`text-left px-3 py-1.5 rounded-lg text-xs border transition-all flex items-start gap-2
                ${isStepCorrect ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : isStepWrong ? 'border-red-500/40 bg-red-500/10 text-red-300'
                  : 'border-amber-500/20 bg-amber-500/5 text-amber-200'}`}
            >
              <span className="text-slate-500 font-mono shrink-0">{i + 1}.</span>
              {step}
            </button>
          )
        })}
      </div>

      {/* Available steps */}
      <div className="flex flex-col gap-1.5">
        {remaining.map(step => (
          <button
            key={step}
            onClick={() => select(step)}
            disabled={submitted}
            className="text-left px-3 py-1.5 rounded-lg text-xs border border-white/10 bg-white/5 text-slate-300 hover:border-amber-500/30 hover:text-amber-200 transition-all"
          >
            {step}
          </button>
        ))}
      </div>

      {allPicked && !submitted && (
        <button
          onClick={handleCheck}
          className="py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-all"
        >
          Follow Recipe →
        </button>
      )}

      {submitted && (
        <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
          isCorrect
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <span className="font-bold mr-1">{isCorrect ? '✓ Perfect recipe!' : '✗ Not quite —'}</span>
          {config.fact}
        </div>
      )}

      {submitted && !isCorrect && (
        <button
          onClick={() => { setChosen([]); setSubmitted(false) }}
          className="py-2 rounded-xl border border-slate-700 text-slate-400 text-xs hover:border-slate-600 transition-all"
        >
          Try again
        </button>
      )}
    </div>
  )
}
