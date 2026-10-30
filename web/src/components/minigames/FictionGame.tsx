import { useState } from 'react'
import type { MinigameProps } from '@/games/types'

interface FictionConfig {
  title: string
  passage: string
  prompt: string
  options: string[]
  answer: number
  fact: string
}

const CONFIGS: Record<string, FictionConfig> = {
  'marie-escape': {
    title: 'The Flight to Varennes',
    passage: 'June 1791. The royal family slipped out of the Tuileries at night in a heavy berline coach, disguised as a Russian baroness and her household. Marie Antoinette had insisted the family travel together rather than in fast, separate carriages. By the next evening the great coach was hours behind schedule, and at Sainte-Menehould a postmaster named Drouet looked hard at the "valet" — then reached into his pocket for a banknote.',
    prompt: 'What happened next?',
    options: [
      'The postmaster accepted a bribe and the family crossed safely into the Austrian Netherlands.',
      'Drouet recognised the king from his portrait on the banknote, rode ahead, and the family was stopped at Varennes.',
      'Royalist troops met the coach at Sainte-Menehould and escorted it to the frontier.',
      'The family abandoned the coach and continued on foot, reaching Montmédy by dawn.',
    ],
    answer: 1,
    fact: 'The family was arrested at Varennes, fifty kilometres short of the loyal garrison at Montmédy, and brought back to Paris through silent crowds. The failed flight destroyed what remained of trust in the monarchy; fourteen months later the Tuileries was stormed and the king deposed.',
  },
  'mani-parable': {
    title: "The Prophet's Parable",
    passage: 'Mani told his disciples of two great forces locked in eternal conflict: Light and Darkness. Each soul, he said, was a spark of Light trapped in the material world. A king summoned Mani to his court and demanded: "If Light is always good and Darkness always evil, what is the purpose of this world of suffering?"',
    prompt: 'What did Mani answer?',
    options: [
      '"This world is a mistake — Darkness conquered Light and must be opposed by force."',
      '"This world is the arena where Light slowly frees itself through righteous living and purification."',
      '"The king himself is an agent of Darkness and must convert or be destroyed."',
      '"Light and Darkness are equal — one cannot exist without the other."',
    ],
    answer: 1,
    fact: 'Mani taught that the material world was a cosmic battlefield, not an accident. Through righteous living — vegetarianism, prayer, and chastity — souls could purify their divine spark and return it to the realm of Light. His cosmology shaped Gnostic, Christian, and Islamic thought for centuries.',
  },
  'eisenstein-ending': {
    title: "Cut to the Crowd",
    passage: "In Eisenstein's Battleship Potemkin (1925), Tsarist soldiers descend the Odessa Steps in perfect formation. Civilians scatter. A mother is shot; her baby carriage begins to roll down the long marble staircase. The camera cuts between the rolling carriage, the advancing boots, and the watching faces of revolutionaries below.",
    prompt: 'How did Eisenstein resolve the sequence?',
    options: [
      'A revolutionary heroically catches the carriage at the bottom.',
      'The carriage rolls off the edge; we cut immediately to the triumphant fleet.',
      'Eisenstein cuts rapidly between carriage, soldiers, and watching faces — the collision implied, never shown.',
      'The scene fades to black as a political caption appears on screen.',
    ],
    answer: 2,
    fact: "Eisenstein's 'montage of attractions' creates emotional impact through juxtaposition, not direct depiction. The baby carriage sequence is one of cinema's most studied examples: meaning is built between the cuts, not inside any single shot.",
  },
  'pygmalion-ending': {
    title: "The Bet",
    passage: "Professor Higgins has spent six months transforming Eliza Doolittle, a Cockney flower girl, into a woman who passes as a duchess. The test: a royal ambassador's party. A Hungarian phonetics expert — Higgins's professional peer — moves through the room studying guests. He stops before Eliza.",
    prompt: 'What does the linguist conclude about Eliza?',
    options: [
      "Her accent slips under his questioning and the ruse is exposed.",
      "He declares she must be foreign royalty — her English is too perfect for a native speaker.",
      "He recognises Higgins's training methods and congratulates them both.",
      "Eliza improvises so brilliantly that even Higgins is astonished.",
    ],
    answer: 1,
    fact: "Shaw's irony is precise: Eliza succeeds so completely that the phonetics expert concludes her English is impossibly refined — she must be foreign nobility. Perfect speech becomes a disguise that fools even the experts. The play satirises how class is performed, not inherited.",
  },
  'musashi-choice': {
    title: "Two Swords, One Bridge",
    passage: "Miyamoto Musashi arrives two hours late for his duel with Sasaki Kojirō on Ganryū Island. Kojirō has waited in the heat, rage building. As Musashi steps off the boat, Kojirō draws his famous long blade — nicknamed 'the drying pole' — and hurls his scabbard into the sea. Musashi holds only a wooden sword he carved from an oar during the crossing.",
    prompt: 'What was Musashi\'s first move?',
    options: [
      "He waited patiently, letting Kojirō's rage exhaust itself further.",
      "He charged immediately, pressing the advantage of Kojirō's anger.",
      "He apologised for his lateness to disarm Kojirō psychologically.",
      "He sat cross-legged and proposed a moment of meditation before fighting.",
    ],
    answer: 1,
    fact: "Musashi arrived late deliberately. When Kojirō threw his scabbard, Musashi remarked, 'You have already lost.' Then he charged — striking with the wooden oar before Kojirō could complete the Swallow Cut. Musashi's strategy was psychological: anger destroys precision.",
  },
  'lu-yu-verse': {
    title: "The First Sip",
    passage: "Lu Yu tested three kettles of water drawn from different sources: a mountain spring, a slow river, and a city well. His Classic of Tea had taught him that water quality shapes the entire cup. A student asked him to explain which water he chose and why.",
    prompt: 'What did Lu Yu say?',
    options: [
      '"The city well is best — consistency is more important than purity."',
      '"The mountain spring — swift water carries away impurities and holds the finest chi."',
      '"All three are acceptable; the teacup cannot distinguish between them."',
      '"The river — its long journey mellows the minerals that would otherwise bite the leaf."',
    ],
    answer: 1,
    fact: "Lu Yu's Classic of Tea (茶經, c. 760 CE) was the world's first systematic treatise on tea. He ranked water sources precisely: mountain spring water first, river water second, well water last. The text covered cultivation, processing, utensils, and brewing — shaping Chinese tea culture for a thousand years.",
  },
}

export default function FictionGame({ configId, onWin, onLose }: MinigameProps) {
  const config = CONFIGS[configId] ?? CONFIGS['mani-parable']
  const [selected, setSelected] = useState<number | null>(null)
  const revealed = selected !== null
  const correct = selected === config.answer

  const pick = (i: number) => {
    if (revealed) return
    setSelected(i)
    if (i === config.answer) setTimeout(onWin, 900)
    else setTimeout(() => onLose(), 900)
  }

  return (
    <div className="flex flex-col gap-4 bg-paper-2 rounded-xl p-4">
      <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>

      <div className="bg-panel border border-line rounded-xl p-4">
        <p className="text-ink-2 text-sm leading-relaxed">{config.passage}</p>
      </div>

      <p className="text-ink text-sm font-semibold">{config.prompt}</p>

      <div className="flex flex-col gap-2">
        {config.options.map((opt, i) => {
          let cls = 'w-full text-left px-4 py-3 rounded-xl text-sm transition-all border '
          if (!revealed) {
            cls += 'bg-panel border-line text-ink-2 hover:border-accent/40 hover:text-ink cursor-pointer'
          } else if (i === config.answer) {
            cls += 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-medium'
          } else if (i === selected) {
            cls += 'bg-red-500/10 border-red-500/30 text-red-300'
          } else {
            cls += 'bg-panel border-line text-muted'
          }
          return (
            <button key={i} onClick={() => pick(i)} className={cls}>
              <span className="text-xs opacity-40 mr-2">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          )
        })}
      </div>

      {revealed && (
        <div className={`p-3 rounded-xl border text-xs leading-relaxed ${correct ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-accent/10 border-accent/30'}`}>
          <span className={`font-bold ${correct ? 'text-emerald-300' : 'text-accent'}`}>
            {correct ? '✓ Correct! ' : '✗ Not quite — '}
          </span>
          <span className="text-muted">{config.fact}</span>
        </div>
      )}
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
