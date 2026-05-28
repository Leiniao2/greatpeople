import { useState, useMemo } from 'react'

interface Piece { id: string; emoji: string; label: string; color: string }

interface JigsawConfig {
  title: string
  artist: string
  era: string
  pieces: Piece[]
  cols: number
  fact: string
}

const CONFIGS: Record<string, JigsawConfig> = {
  'venetian-master': {
    title: 'Assumption of the Virgin',
    artist: 'Titian',
    era: 'Venice, 1518',
    pieces: [
      { id: 'p1', emoji: '☁️', label: 'Heaven Above',    color: 'from-sky-800 to-sky-950'       },
      { id: 'p2', emoji: '😇', label: 'God the Father',  color: 'from-amber-700 to-amber-950'   },
      { id: 'p3', emoji: '✨', label: 'Golden Glow',     color: 'from-yellow-700 to-yellow-900' },
      { id: 'p4', emoji: '👼', label: 'Cherubs',         color: 'from-rose-800 to-rose-950'     },
      { id: 'p5', emoji: '🙏', label: 'Mary Ascending',  color: 'from-blue-700 to-blue-950'     },
      { id: 'p6', emoji: '👼', label: 'More Cherubs',    color: 'from-pink-800 to-pink-950'     },
      { id: 'p7', emoji: '😮', label: 'Apostle Left',    color: 'from-emerald-800 to-emerald-950'},
      { id: 'p8', emoji: '🤲', label: 'Apostle Centre',  color: 'from-teal-800 to-teal-950'     },
      { id: 'p9', emoji: '😯', label: 'Apostle Right',   color: 'from-indigo-800 to-indigo-950' },
    ],
    cols: 3,
    fact: 'Titian\'s Assumption (1518) in the Frari Basilica, Venice, was revolutionary — ten metres of soaring colour and movement that broke every convention of Renaissance altarpiece painting.',
  },
  'starry-night': {
    title: 'The Starry Night',
    artist: 'Vincent van Gogh',
    era: 'Saint-Rémy, 1889',
    pieces: [
      { id: 'p1', emoji: '🌙', label: 'Crescent Moon',   color: 'from-yellow-700 to-yellow-900' },
      { id: 'p2', emoji: '⭐', label: 'Bright Star',     color: 'from-yellow-600 to-amber-900'  },
      { id: 'p3', emoji: '🌀', label: 'Swirl A',         color: 'from-blue-700 to-blue-900'     },
      { id: 'p4', emoji: '🌀', label: 'Swirl B',         color: 'from-indigo-700 to-indigo-900' },
      { id: 'p5', emoji: '🌲', label: 'Cypress Top',     color: 'from-emerald-800 to-emerald-950'},
      { id: 'p6', emoji: '🌲', label: 'Cypress Base',    color: 'from-green-900 to-green-950'   },
      { id: 'p7', emoji: '🏘️', label: 'Village Rooftops',color: 'from-slate-700 to-slate-900'  },
      { id: 'p8', emoji: '⛪', label: 'Church Steeple',  color: 'from-slate-600 to-slate-800'   },
      { id: 'p9', emoji: '🏔️', label: 'Rolling Hills',  color: 'from-blue-800 to-blue-950'     },
    ],
    cols: 3,
    fact: 'Van Gogh painted The Starry Night in June 1889 while at the Saint-Paul-de-Mausole asylum. The swirling sky reflects turbulent emotion; the calm village below, perhaps peace.',
  },
  'mona-lisa': {
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    era: 'Florence, 1503–1519',
    pieces: [
      { id: 'p1', emoji: '🌄', label: 'Sky & Bridge L',  color: 'from-sky-800 to-sky-950'       },
      { id: 'p2', emoji: '🌉', label: 'Winding Road',    color: 'from-stone-700 to-stone-900'   },
      { id: 'p3', emoji: '🌄', label: 'Sky & Bridge R',  color: 'from-blue-800 to-blue-950'     },
      { id: 'p4', emoji: '😐', label: 'Enigmatic Smile', color: 'from-amber-700 to-amber-950'   },
      { id: 'p5', emoji: '👘', label: 'Folded Hands',    color: 'from-slate-700 to-slate-900'   },
      { id: 'p6', emoji: '🏞️', label: 'Landscape',      color: 'from-teal-800 to-teal-950'     },
    ],
    cols: 3,
    fact: 'The Mona Lisa\'s blurred background uses "sfumato" — a hazy layering technique da Vinci perfected, dissolving edges into smoke. X-ray scans reveal three different earlier compositions beneath the final paint.',
  },
  'girl-pearl': {
    title: 'Girl with a Pearl Earring',
    artist: 'Johannes Vermeer',
    era: 'Delft, c. 1665',
    pieces: [
      { id: 'p1', emoji: '⬛', label: 'Dark Background', color: 'from-slate-900 to-black'        },
      { id: 'p2', emoji: '🎀', label: 'Blue-Yellow Turban',color:'from-blue-700 to-yellow-800'  },
      { id: 'p3', emoji: '👁️', label: 'Glancing Eyes',  color: 'from-amber-800 to-amber-950'   },
      { id: 'p4', emoji: '💎', label: 'Pearl Earring',   color: 'from-slate-300 to-slate-600'   },
      { id: 'p5', emoji: '👄', label: 'Parted Lips',     color: 'from-rose-800 to-rose-950'     },
      { id: 'p6', emoji: '✨', label: 'Light on Skin',   color: 'from-orange-700 to-orange-900' },
    ],
    cols: 3,
    fact: '"Girl with a Pearl Earring" (c. 1665) is called the "Mona Lisa of the North." The sitter\'s identity is unknown; the earring may be glass, not pearl — and its latch is missing in the painting.',
  },
  'last-supper': {
    title: 'The Last Supper',
    artist: 'Leonardo da Vinci',
    era: 'Milan, 1495–1498',
    pieces: [
      { id: 'p1', emoji: '🪟', label: 'Window Left',    color: 'from-sky-800 to-sky-900'        },
      { id: 'p2', emoji: '😤', label: 'Bartholomew',    color: 'from-purple-800 to-purple-900'  },
      { id: 'p3', emoji: '🗣️', label: 'Andrew',         color: 'from-indigo-800 to-indigo-900' },
      { id: 'p4', emoji: '🤔', label: 'Peter',          color: 'from-blue-800 to-blue-900'      },
      { id: 'p5', emoji: '😮', label: 'Judas',          color: 'from-amber-800 to-amber-900'    },
      { id: 'p6', emoji: '✋', label: 'John',            color: 'from-rose-800 to-rose-900'      },
      { id: 'p7', emoji: '☝️', label: 'Jesus',          color: 'from-emerald-700 to-emerald-900'},
      { id: 'p8', emoji: '👆', label: 'Thomas',         color: 'from-teal-800 to-teal-900'      },
      { id: 'p9', emoji: '🎭', label: 'James Major',    color: 'from-cyan-800 to-cyan-900'      },
      { id: 'p10',emoji: '😯', label: 'Philip',         color: 'from-lime-800 to-lime-900'      },
      { id: 'p11',emoji: '🙋', label: 'Matthew',        color: 'from-green-800 to-green-900'    },
      { id: 'p12',emoji: '🪟', label: 'Window Right',   color: 'from-sky-700 to-sky-900'        },
    ],
    cols: 4,
    fact: 'Da Vinci painted The Last Supper on a dining-room wall in Milan (1495–98), depicting the moment Christ announces a betrayal. He used tempera on plaster instead of true fresco — causing it to deteriorate within decades.',
  },
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function JigsawGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId]
  const correctOrder = useMemo(() => config.pieces.map(p => p.id), [config])
  const [board, setBoard] = useState<string[]>(() => shuffle(correctOrder))
  const [selected, setSelected] = useState<number | null>(null)
  const [won, setWon] = useState(false)

  const pieceMap = useMemo(() => Object.fromEntries(config.pieces.map(p => [p.id, p])), [config])

  const handleClick = (idx: number) => {
    if (won) return
    if (selected === null) { setSelected(idx); return }
    if (selected === idx) { setSelected(null); return }
    const next = [...board]
    ;[next[selected], next[idx]] = [next[idx], next[selected]]
    setBoard(next)
    setSelected(null)
    if (next.every((id, i) => id === correctOrder[i])) {
      setWon(true)
      setTimeout(onWin, 900)
    }
  }

  const wrongCount = board.filter((id, i) => id !== correctOrder[i]).length

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm">{config.title}</p>
        <p className="text-slate-400 text-xs">{config.artist} · {config.era}</p>
        <p className="text-slate-500 text-xs mt-1">Tap two pieces to swap them · {wrongCount} piece{wrongCount !== 1 ? 's' : ''} out of place</p>
      </div>

      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${config.cols}, 1fr)` }}>
        {board.map((pieceId, idx) => {
          const piece = pieceMap[pieceId]
          const isCorrect = pieceId === correctOrder[idx]
          const isSelected = selected === idx
          return (
            <button
              key={idx}
              onClick={() => handleClick(idx)}
              className={[
                'relative aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-0.5',
                `bg-gradient-to-br ${piece.color}`,
                'transition-all duration-200',
                isSelected
                  ? 'border-amber-400 scale-105 shadow-lg shadow-amber-500/30'
                  : isCorrect && !won
                  ? 'border-emerald-500/50'
                  : won
                  ? 'border-emerald-400/80'
                  : 'border-white/10 hover:border-white/30',
              ].join(' ')}
            >
              <span className="text-xl leading-none select-none">{piece.emoji}</span>
              <span className="text-[8px] text-white/60 text-center leading-tight px-1 select-none">{piece.label}</span>
              <span className="absolute bottom-0.5 right-1 text-[7px] text-white/25 select-none">{idx + 1}</span>
            </button>
          )
        })}
      </div>

      {won && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
          <p className="text-emerald-400 font-bold text-sm">Masterpiece Restored!</p>
          <p className="text-slate-400 text-xs mt-1 leading-relaxed">{config.fact}</p>
        </div>
      )}
    </div>
  )
}
