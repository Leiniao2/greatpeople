import { useState } from 'react'

type Piece = 'WK' | 'WQ' | 'WR' | 'WB' | 'BK' | 'BP' | null

interface TacticsConfig {
  title: string
  question: string
  rows: number
  cols: number
  board: { piece: Piece; row: number; col: number }[]
  // The winning move: move piece at [fromRow,fromCol] to [toRow,toCol]
  winFrom: [number, number]
  winTo: [number, number]
  fact: string
}

const CONFIGS: Record<string, TacticsConfig> = {
  'musashi-duel': {
    title: 'Ganryū Island',
    question: "Musashi holds the high ground. One move wins the duel — find it.",
    rows: 5, cols: 5,
    board: [
      { piece: 'BK', row: 0, col: 4 },
      { piece: 'BP', row: 0, col: 3 },
      { piece: 'BP', row: 1, col: 4 },
      { piece: 'WQ', row: 3, col: 1 },
      { piece: 'WK', row: 4, col: 4 },
    ],
    winFrom: [3, 1], winTo: [0, 4],
    fact: "Musashi arrived two hours late to his duel with Sasaki Kojirō — deliberately. The waiting shattered Kojirō's composure. When Kojirō threw his scabbard into the sea, Musashi said, 'You have already lost.' He then charged, striking before Kojirō could complete his famous Swallow Cut.",
  },
  senate: {
    title: 'Senate Gambit',
    question: 'Pericles commands the white pieces. Find the move that delivers checkmate in one.',
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 0 },
      { piece: 'BP', row: 0, col: 1 },
      { piece: 'BP', row: 1, col: 0 },
      { piece: 'WQ', row: 2, col: 2 },
      { piece: 'WK', row: 5, col: 5 },
    ],
    winFrom: [2, 2], winTo: [0, 2],
    fact: 'Pericles used strategic positioning — controlling Athens through placement of allies — just as a queen controls the board by commanding lines.',
  },
  general: {
    title: 'The Rook\'s Decree',
    question: 'Cicero\'s forces are in position. Move the rook to deliver checkmate.',
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 5 },
      { piece: 'WR', row: 0, col: 0 },
      { piece: 'WK', row: 2, col: 4 },
    ],
    winFrom: [0, 0], winTo: [0, 4],
    fact: 'Cicero\'s speeches cornered his opponents as surely as a rook seals off escape squares — leaving no room for evasion.',
  },
  consul: {
    title: 'Consular Strike',
    question: 'The black king is exposed. Find the queen move that ends the game.',
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 5 },
      { piece: 'BP', row: 0, col: 4 },
      { piece: 'BP', row: 1, col: 5 },
      { piece: 'WQ', row: 3, col: 4 },
      { piece: 'WK', row: 5, col: 0 },
    ],
    winFrom: [3, 4], winTo: [0, 4],  // Qxp+ — BK can't flee, both escape squares covered
    fact: 'Gandhi\'s Salt March cornered the British Empire like a queen forking king and pawn — forcing a response on unfavorable terms.',
  },
  reform: {
    title: 'The Reform Gambit',
    question: 'Itō Hirobumi studies the Meiji board. Deliver checkmate with the queen.',
    rows: 5, cols: 5,
    board: [
      { piece: 'BK', row: 0, col: 0 },
      { piece: 'WQ', row: 4, col: 0 },
      { piece: 'WK', row: 2, col: 1 },
    ],
    winFrom: [4, 0], winTo: [1, 0],
    fact: 'Itō Hirobumi\'s Meiji reforms systematically cornered the old feudal order — each reform a move that narrowed the shogunate\'s escape squares.',
  },
  temple: {
    title: 'The Bishop\'s Path',
    question: 'Three white pieces surround the black king. Find the rook move for checkmate.',
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 5 },
      { piece: 'WB', row: 3, col: 3 },
      { piece: 'WR', row: 5, col: 1 },
      { piece: 'WK', row: 2, col: 4 },
    ],
    winFrom: [5, 1], winTo: [0, 1],
    fact: 'Mao\'s Long March was a strategic retreat that repositioned forces — like a rook sliding to a decisive file — to deliver a winning blow later.',
  },

  // ── Harder: bigger boards, more distractors ────────────────────────────────

  gaugamela: {
    title: 'Battle of Gaugamela',
    question: "Alexander's queen controls the long diagonal. The black king is hemmed in — deliver checkmate with the diagonal strike.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 0 },
      { piece: 'BP', row: 0, col: 1 },
      { piece: 'BP', row: 1, col: 0 },
      { piece: 'WQ', row: 5, col: 5 },
      { piece: 'WR', row: 6, col: 3 },
      { piece: 'WB', row: 4, col: 3 },
      { piece: 'WK', row: 6, col: 6 },
    ],
    winFrom: [5, 5], winTo: [2, 2],
    fact: "At Gaugamela (331 BCE), Alexander the Great used a diagonal cavalry charge — the oblique advance — that cut through Darius's line at exactly the right angle. It is still studied in military academies as the definitive example of breakthrough tactics.",
  },
  thermopylae: {
    title: 'Thermopylae Pass',
    question: "The white rook holds the narrow pass. Slide it to seal off the black king's only escape.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 6 },
      { piece: 'BP', row: 0, col: 5 },
      { piece: 'BP', row: 1, col: 6 },
      { piece: 'WR', row: 6, col: 0 },
      { piece: 'WB', row: 4, col: 4 },
      { piece: 'WK', row: 5, col: 5 },
    ],
    winFrom: [6, 0], winTo: [0, 0],
    fact: "At Thermopylae (480 BCE), 300 Spartans under Leonidas used the narrow pass to neutralise Persia's numerical advantage for three days. The tactical lesson — use terrain to reduce the enemy's effective force — is still taught in military strategy courses.",
  },
  actium: {
    title: 'Battle of Actium',
    question: "Octavian's forces flank from the sea. Move the queen along the open file to deliver the decisive blow.",
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 2 },
      { piece: 'BP', row: 0, col: 1 },
      { piece: 'BP', row: 0, col: 3 },
      { piece: 'BP', row: 1, col: 2 },
      { piece: 'WQ', row: 5, col: 2 },
      { piece: 'WR', row: 5, col: 0 },
      { piece: 'WK', row: 4, col: 5 },
    ],
    winFrom: [5, 2], winTo: [2, 2],
    fact: "At Actium (31 BCE), Octavian's fleet outmanoeuvred Mark Antony and Cleopatra by controlling the central channel. The battle ended the Roman Republic and began the Empire — a single engagement that decided a century of civil war.",
  },
  'cannae-trap': {
    title: 'Cannae Envelopment',
    question: "Hannibal surrounds the Romans. Move the queen to complete the encirclement — no escape square remains.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 3 },
      { piece: 'BP', row: 0, col: 2 },
      { piece: 'BP', row: 0, col: 4 },
      { piece: 'BP', row: 1, col: 3 },
      { piece: 'WQ', row: 4, col: 6 },
      { piece: 'WR', row: 6, col: 1 },
      { piece: 'WB', row: 3, col: 1 },
      { piece: 'WK', row: 6, col: 6 },
    ],
    winFrom: [4, 6], winTo: [1, 3],
    fact: "At Cannae (216 BCE), Hannibal destroyed a Roman army twice his size using double envelopment — drawing the centre forward while the wings folded inward. It remains the most studied tactical encirclement in military history.",
  },
  'red-cliffs': {
    title: 'Battle of Red Cliffs',
    question: "Zhuge Liang positions the decisive piece. Move the bishop to pin the opposing force and deliver checkmate.",
    rows: 6, cols: 6,
    board: [
      { piece: 'BK', row: 0, col: 0 },
      { piece: 'BP', row: 0, col: 1 },
      { piece: 'BP', row: 1, col: 0 },
      { piece: 'WQ', row: 4, col: 4 },
      { piece: 'WR', row: 5, col: 2 },
      { piece: 'WB', row: 2, col: 2 },
      { piece: 'WK', row: 5, col: 5 },
    ],
    winFrom: [4, 4], winTo: [1, 1],
    fact: "At Red Cliffs (208 CE), Cao Cao's vast northern fleet was destroyed by fire ships launched by Sun Quan and Liu Bei. The battle prevented the unification of China for four centuries, giving rise to the Three Kingdoms period.",
  },
  'siege-of-troy': {
    title: 'The Trojan Endgame',
    question: "Ten years of siege reach their conclusion. Find the long-range queen move that ends the war.",
    rows: 7, cols: 7,
    board: [
      { piece: 'BK', row: 0, col: 6 },
      { piece: 'BP', row: 1, col: 6 },
      { piece: 'BP', row: 0, col: 5 },
      { piece: 'WQ', row: 6, col: 0 },
      { piece: 'WR', row: 4, col: 5 },
      { piece: 'WB', row: 2, col: 3 },
      { piece: 'WK', row: 6, col: 5 },
    ],
    winFrom: [6, 0], winTo: [0, 6],
    fact: "The Trojan War, as described in Homer's Iliad, lasted ten years — but was decided in a single day's battle with a wooden horse. Odysseus's stratagem required patience, deception, and a single decisive strike: the model for Greek tactical thinking.",
  },
}

const PIECE_GLYPHS: Record<NonNullable<Piece>, string> = {
  WK: '♔', WQ: '♕', WR: '♖', WB: '♗',
  BK: '♚', BP: '♟',
}

const PIECE_COLOR: Record<NonNullable<Piece>, string> = {
  WK: 'text-amber-200', WQ: 'text-amber-200', WR: 'text-amber-200', WB: 'text-amber-200',
  BK: 'text-slate-800', BP: 'text-slate-800',
}

export default function TacticsGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['senate']

  const buildGrid = (): Piece[][] => {
    const g: Piece[][] = Array.from({ length: config.rows }, () => Array(config.cols).fill(null))
    for (const { piece, row, col } of config.board) g[row][col] = piece
    return g
  }

  const [grid, setGrid] = useState<Piece[][]>(buildGrid)
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [status, setStatus] = useState<'idle' | 'wrong' | 'won'>('idle')
  const [wrongCell, setWrongCell] = useState<[number, number] | null>(null)

  const handleCell = (r: number, c: number) => {
    if (status === 'won') return
    const piece = grid[r][c]

    if (!selected) {
      if (piece && piece.startsWith('W')) setSelected([r, c])
      return
    }

    const [fr, fc] = selected
    const [wr, wc] = config.winFrom
    const [tr, tc] = config.winTo

    if (r === fr && c === fc) { setSelected(null); return }

    if (fr === wr && fc === wc && r === tr && c === tc) {
      // Correct move
      const next = grid.map(row => [...row])
      next[tr][tc] = next[fr][fc]
      next[fr][fc] = null
      setGrid(next)
      setSelected(null)
      setStatus('won')
      setTimeout(onWin, 800)
    } else if (piece?.startsWith('W')) {
      setSelected([r, c])
    } else {
      setWrongCell([r, c])
      setStatus('wrong')
      setTimeout(() => { setStatus('idle'); setWrongCell(null); setSelected(null) }, 900)
    }
  }

  const cellSize = config.cols <= 5 ? 'w-14 h-14' : 'w-11 h-11'

  return (
    <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-3">
      <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
      <p className="text-white text-sm font-medium leading-snug">{config.question}</p>

      <div className="flex justify-center">
        <div
          className="grid border border-white/10 rounded-xl overflow-hidden"
          style={{ gridTemplateColumns: `repeat(${config.cols}, 1fr)` }}
        >
          {Array.from({ length: config.rows }, (_, r) =>
            Array.from({ length: config.cols }, (_, c) => {
              const piece = grid[r][c]
              const isLight = (r + c) % 2 === 0
              const isSelected = selected?.[0] === r && selected?.[1] === c
              const isWrong = wrongCell?.[0] === r && wrongCell?.[1] === c
              const isWinTarget = status === 'won' && r === config.winTo[0] && c === config.winTo[1]

              let bg = isLight ? 'bg-slate-700' : 'bg-slate-900'
              if (isSelected) bg = 'bg-amber-500/50'
              if (isWrong) bg = 'bg-red-500/40'
              if (isWinTarget) bg = 'bg-emerald-500/40'

              return (
                <button
                  key={`${r},${c}`}
                  onClick={() => handleCell(r, c)}
                  className={`${cellSize} flex items-center justify-center ${bg} transition-colors`}
                >
                  {piece && (
                    <span className={`text-2xl select-none ${PIECE_COLOR[piece]} ${piece.startsWith('B') ? 'drop-shadow-[0_0_1px_rgba(255,255,255,0.6)]' : 'drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]'}`}>
                      {PIECE_GLYPHS[piece]}
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </div>

      <p className="text-slate-500 text-[10px] text-center">
        {status === 'idle' && (selected ? 'Tap a destination square' : 'Tap a white piece to select')}
        {status === 'wrong' && <span className="text-red-400">Not the winning move — try again</span>}
        {status === 'won' && <span className="text-emerald-400 font-bold">Checkmate! Brilliant.</span>}
      </p>

      {status === 'won' && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs leading-relaxed">
          <span className="font-bold mr-1">✓ Checkmate!</span>{config.fact}
        </div>
      )}
    </div>
  )
}
