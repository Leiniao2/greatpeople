import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface StorySortConfig {
  title: string
  source: string
  paragraphs: string[]  // in correct order
  fact: string
}

// ── Configs ────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, StorySortConfig> = {
  'odyssey-return': {
    title: 'Odysseus Returns',
    source: "Homer's Odyssey — Book XIII",
    paragraphs: [
      "When Odysseus awoke from his deep sleep, he did not recognise his native land; for a goddess had poured mist all around him. He stood up and looked at his own country with a grieving heart, and beat his thighs, and cried aloud with sorrow.",
      "Then grey-eyed Athena appeared before him in the form of a young shepherd — handsome as only princes are. She spoke gently, telling him he was standing on the shores of Ithaca, whose name had reached even to the skies.",
      "Hearing this, much-enduring Odysseus rejoiced, glad at last to be on his own native soil. Yet even now he answered cautiously, concealing his true name, testing whether this stranger could be trusted with such knowledge.",
      "And Athena smiled at his caution, stroked him with her hand, and told him he was always the same — cautious and cunning. That was precisely why she would not abandon him in his misery: for he was discreet, quick-witted, and steady.",
    ],
    fact: "Homer's Odyssey, composed around 800–700 BCE, is one of the oldest works of Western literature. The hero Odysseus spent ten years trying to return home to Ithaca after the fall of Troy — opposed by Poseidon but aided by Athena, who valued his cleverness above all.",
  },
  'don-quixote-windmills': {
    title: 'The Battle with the Windmills',
    source: "Cervantes' Don Quixote — Part I, Chapter VIII",
    paragraphs: [
      "At this point they came in sight of thirty or forty windmills that stood on that plain. As soon as Don Quixote saw them he said to his squire: 'Fortune is arranging matters better than we could have wished — for look there, Sancho, where thirty or more monstrous giants present themselves!'",
      "'What giants?' said Sancho Panza. 'Those thou seest there,' answered his master, 'with the long arms.' 'Look, your worship,' said Sancho, 'what we see there are not giants but windmills, and what seem to be their arms are the sails that, turned by the wind, make the millstone go.'",
      "So saying, and commending himself to his lady Dulcinea, with lance in rest and at the full speed of Rocinante he charged the nearest windmill — and driving his lance into the sail, the wind whirled it around with such force that it shivered the lance to pieces and swept horse and rider away together.",
      "He was sent rolling over the plain in a sorry condition. Sancho Panza hastened to his assistance and found him unable to move, such was the shock of his fall. 'God bless me!' said Sancho, 'did I not tell your worship to mind what you were about, for they were only windmills?'",
    ],
    fact: "Published in 1605, Don Quixote by Miguel de Cervantes is widely considered the first modern novel. The windmill episode became one of literature's most enduring metaphors — 'tilting at windmills' now means fighting imaginary enemies or pursuing delusional ideals.",
  },
  'genji-moonlight': {
    title: 'A Lady Not of the First Rank',
    source: "Murasaki Shikibu's The Tale of Genji — Chapter I",
    paragraphs: [
      "In a certain reign there was a lady not of the first rank whom the Emperor loved more than any of the others. The grand ladies with high ambitions thought her a presumptuous upstart, and the ladies of lower rank were still more resentful.",
      "Everything she did offended them. As the months and years passed, the Lady of the Paulownia Court was the victim of constant taunting and ill-treatment. She fell into a decline, spending more time at home than at court.",
      "The Emperor's pity and affection for her grew ever deeper, and he no longer cared what his ladies and courtiers might say. Such was indeed the example which the wise men of China had held to be the ruin of dynasties.",
      "She bore the Emperor a son — a beautiful child beyond all description. The Emperor insisted on seeing him immediately, and was astonished. So perfect was the child that superstitious fears came over him: it seemed impossible that such a being could long survive in this world.",
    ],
    fact: "Written around 1008 CE, The Tale of Genji by Murasaki Shikibu is considered the world's first novel. Its author was a lady-in-waiting at the Japanese imperial court who created a vast psychological portrait of court life — over 400 characters across 54 chapters.",
  },
  'iliad-achilles': {
    title: "The Wrath of Achilles",
    source: "Homer's Iliad — Book I",
    paragraphs: [
      "Sing, goddess, the anger of Achilles son of Peleus, that brought countless ills upon the Achaeans. Many a brave soul did it send hurrying down to Hades, and many a hero did it yield a prey to dogs and vultures, for so the will of Zeus was accomplished.",
      "For the son of Atreus had dishonoured Chryses, priest of Apollo, who came to the ships of the Achaeans to free his daughter. He brought a great ransom and bore in his hand the sceptre of Apollo, wreathed with a suppliant's chaplet on a golden staff.",
      "He besought the Achaeans, and most of all the two sons of Atreus. But Agamemnon spoke harshly, threatening to send him away without his daughter. Then Chryses prayed to Apollo, and Apollo sent his plague upon the host — and the people died one after another.",
      "Then Achilles called the people to assembly. The goddess Hera put this in his mind, for she was sorry to see the Achaeans dying. When they were gathered, Achilles rose and spoke among them — and the quarrel between the greatest of kings and the greatest of warriors began.",
    ],
    fact: "Homer's Iliad, composed around 750–700 BCE, covers only 51 days of the decade-long Trojan War but centres on a single conflict: the rage of Achilles after King Agamemnon dishonours him. Ancient Greeks considered it their most sacred text — Alexander the Great slept with a copy under his pillow.",
  },
  'arabian-nights-opening': {
    title: "Scheherazade's First Night",
    source: "One Thousand and One Nights — Frame Story",
    paragraphs: [
      "There was, in the antiquity of time and the passage of the age, a king of the kings of Sassan in the islands of India and China, who had two sons — an elder and a younger — both of them valiant knights, but the elder was a more excellent horseman than his brother.",
      "The elder son, Shahryar, ruled justly. But when he discovered his wife's infidelity, grief disordered his mind, and he swore to take a new bride each night and put her to death in the morning, that he might never be deceived again.",
      "Now the king had a minister whose duty it was to provide these wives. This man had a daughter of great beauty and uncommon learning named Shahrazad, who had read the books, annals, and legends of preceding kings, and had memorised a thousand stories.",
      "Shahrazad said to her father: 'I will ask thee to give me in marriage to this king; either I shall live, or I shall be a ransom for the daughters of the Muslims and save them from him.' And that very night her father presented her to King Shahryar.",
    ],
    fact: "One Thousand and One Nights is a collection of Middle Eastern folk tales compiled in Arabic during the Islamic Golden Age (8th–13th centuries), drawing from Persian, Indian, and Arab sources. Scheherazade's storytelling technique — ending each night on a cliffhanger — is one of literature's oldest narrative structures.",
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function StorySortGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['odyssey-return']
  const correct = config.paragraphs

  const [order, setOrder] = useState<string[]>(() => shuffle([...correct]))
  const [submitted, setSubmitted] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)

  const isCorrect = submitted && order.every((p, i) => p === correct[i])

  const handleSubmit = () => {
    setSubmitted(true)
    if (order.every((p, i) => p === correct[i])) {
      setTimeout(onWin, 700)
    } else {
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
    }
  }

  const move = (from: number, dir: -1 | 1) => {
    if (submitted && isCorrect) return
    const to = from + dir
    if (to < 0 || to >= order.length) return
    const next = [...order]
    ;[next[from], next[to]] = [next[to], next[from]]
    setOrder(next)
    if (submitted) setSubmitted(false)
  }

  const handleDrop = (targetIdx: number) => {
    if (dragging === null || dragging === targetIdx) return
    const next = [...order]
    const [removed] = next.splice(dragging, 1)
    next.splice(targetIdx, 0, removed)
    setOrder(next)
    setDragging(null)
    if (submitted) setSubmitted(false)
  }

  return (
    <div className="flex flex-col gap-3 select-none">
      {/* Header */}
      <div className="text-center px-1">
        <p className="text-amber-400 font-bold text-sm tracking-wide">{config.title}</p>
        <p className="text-slate-500 text-[10px] mt-0.5 italic">{config.source}</p>
        <p className="text-slate-400 text-xs mt-1">Arrange the paragraphs in the correct order.</p>
      </div>

      {/* Cards */}
      <div className={`flex flex-col gap-2 ${shaking ? 'animate-[shake_0.45s_ease-in-out]' : ''}`}>
        {order.map((para, i) => {
          const paraCorrect = submitted && para === correct[i]
          const paraWrong   = submitted && !isCorrect && para !== correct[i]
          const isDraggingThis = dragging === i

          return (
            <div
              key={para}
              draggable={!isCorrect}
              onDragStart={() => setDragging(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              onDragEnd={() => setDragging(null)}
              className={`
                flex items-start gap-3 p-3 rounded-xl border text-xs leading-relaxed transition-all
                ${isDraggingThis      ? 'opacity-40'
                : paraCorrect         ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                : paraWrong           ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-white/[0.04] border-white/10 text-slate-200 cursor-grab active:cursor-grabbing hover:border-white/20'}
              `}
            >
              {/* Number badge */}
              <span className={`
                shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold mt-0.5
                ${paraCorrect ? 'bg-emerald-500/30 text-emerald-300'
                : paraWrong   ? 'bg-red-500/20 text-red-400'
                : 'bg-white/10 text-slate-400'}
              `}>
                {i + 1}
              </span>

              {/* Paragraph text */}
              <span className="flex-1 leading-relaxed">{para}</span>

              {/* Up/down controls */}
              {!isCorrect && (
                <div className="flex flex-col gap-0.5 shrink-0 mt-0.5">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-xs leading-none px-1"
                  >▲</button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === order.length - 1}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-xs leading-none px-1"
                  >▼</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Actions */}
      {!isCorrect && (
        <button
          onClick={handleSubmit}
          className="py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 active:scale-95 transition-all"
        >
          Check Order →
        </button>
      )}

      {submitted && !isCorrect && (
        <button
          onClick={() => setSubmitted(false)}
          className="py-2 rounded-xl border border-slate-700 text-slate-400 text-xs hover:border-slate-600 transition-all"
        >
          Try again
        </button>
      )}

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-6px); }
          40%      { transform: translateX(6px); }
          60%      { transform: translateX(-4px); }
          80%      { transform: translateX(4px); }
        }
      `}</style>
    </div>
  )
}
