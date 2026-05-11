import { useState, useMemo, useCallback } from 'react'

interface WordDef {
  number: number
  word: string
  clue: string
  direction: 'across' | 'down'
  row: number
  col: number
}

interface CrosswordConfig {
  rows: number
  cols: number
  words: WordDef[]
}

const CONFIGS: Record<string, CrosswordConfig> = {
  imhotep: {
    rows: 7, cols: 7,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'PHARAOH', clue: 'Divine ruler of ancient Egypt' },
      { number: 1, direction: 'down',   row: 0, col: 0, word: 'PYRAMID', clue: "Imhotep's immortal stone monument" },
      { number: 2, direction: 'across', row: 6, col: 0, word: 'DUNE',    clue: 'Rolling hill of desert sand' },
    ],
  },
  pericles: {
    rows: 6, cols: 9,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'PERICLES', clue: 'The great statesman of Athens' },
      { number: 2, direction: 'down',   row: 0, col: 7, word: 'SPARTA',   clue: "Athens' fierce rival city-state" },
      { number: 3, direction: 'across', row: 4, col: 5, word: 'VOTE',     clue: 'Democratic act in the Assembly' },
    ],
  },
  turing: {
    rows: 6, cols: 6,
    words: [
      { number: 1, direction: 'down',   row: 0, col: 2, word: 'BINARY', clue: 'The language of computers: 0s and 1s' },
      { number: 2, direction: 'across', row: 1, col: 0, word: 'ENIGMA', clue: 'The German cipher machine Turing cracked' },
      { number: 3, direction: 'across', row: 4, col: 0, word: 'MORSE',  clue: 'Dot-and-dash telegraph code' },
    ],
  },
  gandhi: {
    rows: 5, cols: 4,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'SPIN',  clue: "Gandhi's daily act on the spinning wheel" },
      { number: 1, direction: 'down',   row: 0, col: 2, word: 'INDIA', clue: 'The nation Gandhi won independence for' },
    ],
  },
  magellan: {
    rows: 5, cols: 5,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'GLOBE', clue: 'What Magellan set out to circumnavigate' },
      { number: 1, direction: 'down',   row: 0, col: 2, word: 'OCEAN', clue: 'The vast Pacific Magellan crossed' },
      { number: 2, direction: 'across', row: 2, col: 0, word: 'STEER', clue: 'To guide a ship through the waves' },
      { number: 3, direction: 'across', row: 4, col: 0, word: 'WINDS', clue: 'Trade winds that filled the sails' },
    ],
  },
  linnaeus: {
    rows: 6, cols: 5,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'PINES',  clue: 'Evergreen conifers Linnaeus catalogued' },
      { number: 1, direction: 'down',   row: 0, col: 2, word: 'NATURE', clue: 'What Linnaeus devoted his life to naming' },
      { number: 2, direction: 'across', row: 2, col: 0, word: 'PETAL',  clue: 'Flower part key to plant classification' },
      { number: 3, direction: 'across', row: 4, col: 0, word: 'SHRUB',  clue: 'Small woody plant, between grass and tree' },
    ],
  },
  belisarius: {
    rows: 6, cols: 6,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'LEGION', clue: 'Roman military unit Belisarius commanded' },
      { number: 1, direction: 'down',   row: 0, col: 0, word: 'LANCE',  clue: 'Cavalry weapon of the Byzantine horseman' },
      { number: 2, direction: 'across', row: 3, col: 1, word: 'ITALY',  clue: 'Territory Belisarius reconquered for Justinian' },
    ],
  },
  gutenberg: {
    rows: 5, cols: 5,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'PRESS', clue: "Gutenberg's revolutionary printing machine" },
      { number: 1, direction: 'down',   row: 0, col: 1, word: 'PROOF', clue: 'Printer\'s test impression before final run' },
      { number: 2, direction: 'across', row: 2, col: 1, word: 'OTYPE', clue: 'Moveable ___ — the individual letter blocks' },
      { number: 3, direction: 'across', row: 4, col: 0, word: 'BIBLE', clue: "Gutenberg's first major printed work" },
    ],
  },
  ito: {
    rows: 5, cols: 5,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'MEIJI', clue: 'The great Japanese restoration Itō shaped' },
      { number: 1, direction: 'down',   row: 0, col: 3, word: 'JAPAN', clue: 'The empire Itō modernised as first PM' },
      { number: 2, direction: 'across', row: 3, col: 0, word: 'KOREA', clue: 'The peninsula at the heart of the dispute' },
    ],
  },
  'digital-cw': {
    rows: 6, cols: 7,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'SILICON', clue: 'The material that made the microchip possible' },
      { number: 1, direction: 'down',   row: 0, col: 3, word: 'SCREEN', clue: 'Interface through which the digital world appears' },
      { number: 2, direction: 'across', row: 3, col: 1, word: 'PIXEL',  clue: 'Smallest unit of a digital image' },
      { number: 3, direction: 'across', row: 5, col: 0, word: 'BYTE',   clue: '8 bits — basic unit of digital information' },
    ],
  },
  mcluhan: {
    rows: 5, cols: 6,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'GLOBAL', clue: 'McLuhan\'s "_____ village" — the connected world' },
      { number: 1, direction: 'down',   row: 0, col: 2, word: 'MEDIA', clue: 'McLuhan\'s famous subject: "The ____ is the message"' },
      { number: 2, direction: 'across', row: 3, col: 1, word: 'PRINT', clue: 'The medium Gutenberg created that McLuhan studied' },
    ],
  },
  climate: {
    rows: 6, cols: 6,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'CARBON', clue: 'The greenhouse gas driving climate change' },
      { number: 1, direction: 'down',   row: 0, col: 2, word: 'CORAL',  clue: 'Ocean reef bleached by warming seas' },
      { number: 2, direction: 'across', row: 3, col: 0, word: 'POLAR',  clue: 'Arctic and Antarctic regions warming fastest' },
      { number: 3, direction: 'across', row: 5, col: 1, word: 'SOLAR',  clue: 'Renewable energy from the sun' },
    ],
  },
  armstrong: {
    rows: 6, cols: 6,
    words: [
      { number: 1, direction: 'across', row: 0, col: 0, word: 'APOLLO', clue: 'NASA programme that landed humans on the Moon' },
      { number: 1, direction: 'down',   row: 0, col: 0, word: 'AIRMAN', clue: 'Armstrong began his career as one of these' },
      { number: 2, direction: 'across', row: 3, col: 1, word: 'LUNAR', clue: 'Relating to the Moon' },
      { number: 3, direction: 'across', row: 5, col: 0, word: 'ORBIT',  clue: 'Curved path around a celestial body' },
    ],
  },
}

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
]

function wKey(w: WordDef) {
  return `${w.number}${w.direction === 'across' ? 'A' : 'D'}`
}

export default function CrosswordGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS.magellan

  const { answerGrid, wordCellsMap, cellWordsMap, cellNumberMap } = useMemo(() => {
    const ag: string[][] = Array.from({ length: config.rows }, () => Array(config.cols).fill('#'))
    const wcm: Record<string, Array<[number, number]>> = {}
    const cwm: Record<string, string[]> = {}
    const cnm: Record<string, number> = {}

    for (const w of config.words) {
      const key = wKey(w)
      wcm[key] = []
      for (let i = 0; i < w.word.length; i++) {
        const r = w.direction === 'across' ? w.row : w.row + i
        const c = w.direction === 'across' ? w.col + i : w.col
        ag[r][c] = w.word[i]
        wcm[key].push([r, c])
        const ck = `${r},${c}`
        cwm[ck] = cwm[ck] ? [...cwm[ck], key] : [key]
      }
      const sk = `${w.row},${w.col}`
      if (!(sk in cnm)) cnm[sk] = w.number
    }
    return { answerGrid: ag, wordCellsMap: wcm, cellWordsMap: cwm, cellNumberMap: cnm }
  }, [config])

  const [playerGrid, setPlayerGrid] = useState<string[][]>(() =>
    Array.from({ length: config.rows }, () => Array(config.cols).fill(''))
  )
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [cursorPos, setCursorPos] = useState(0)
  const [won, setWon] = useState(false)

  const activeWord = useMemo(
    () => config.words.find(w => wKey(w) === activeKey) ?? null,
    [config.words, activeKey]
  )

  const handleCellTap = useCallback((r: number, c: number) => {
    const wks = cellWordsMap[`${r},${c}`]
    if (!wks?.length) return
    let chosen: string
    if (wks.length === 1) {
      chosen = wks[0]
    } else {
      chosen = activeKey && wks.includes(activeKey)
        ? wks.find(k => k !== activeKey)!
        : wks[0]
    }
    const cells = wordCellsMap[chosen]
    const pos = cells.findIndex(([cr, cc]) => cr === r && cc === c)
    setActiveKey(chosen)
    setCursorPos(pos >= 0 ? pos : 0)
  }, [cellWordsMap, wordCellsMap, activeKey])

  const checkWin = useCallback((grid: string[][]) => {
    for (let r = 0; r < config.rows; r++)
      for (let c = 0; c < config.cols; c++)
        if (answerGrid[r][c] !== '#' && grid[r][c] !== answerGrid[r][c]) return false
    return true
  }, [answerGrid, config.rows, config.cols])

  const handleKey = useCallback((key: string) => {
    if (!activeKey || won) return
    const cells = wordCellsMap[activeKey]
    if (!cells) return

    if (key === '⌫') {
      const pos = cursorPos > 0 ? cursorPos - 1 : 0
      const [r, c] = cells[pos]
      setPlayerGrid(prev => {
        const next = prev.map(row => [...row])
        next[r][c] = ''
        return next
      })
      setCursorPos(pos)
    } else {
      if (cursorPos >= cells.length) return
      const [r, c] = cells[cursorPos]
      setPlayerGrid(prev => {
        const next = prev.map(row => [...row])
        next[r][c] = key
        if (checkWin(next)) setTimeout(() => { setWon(true); onWin() }, 400)
        return next
      })
      setCursorPos(Math.min(cursorPos + 1, cells.length - 1))
    }
  }, [activeKey, cursorPos, wordCellsMap, won, checkWin, onWin])

  const cellSize = Math.min(40, Math.floor(300 / config.cols))

  const cellState = (r: number, c: number) => {
    if (answerGrid[r][c] === '#') return 'blocked'
    const wks = cellWordsMap[`${r},${c}`] ?? []
    const isActive = activeKey ? wks.includes(activeKey) : false
    const cells = activeKey ? wordCellsMap[activeKey] ?? [] : []
    const isCursor = isActive && cells[cursorPos]?.[0] === r && cells[cursorPos]?.[1] === c
    const letter = playerGrid[r][c]
    if (isCursor) return 'cursor'
    if (isActive) return 'active'
    if (!letter) return 'empty'
    return letter === answerGrid[r][c] ? 'correct' : 'wrong'
  }

  const BG: Record<string, string> = {
    blocked: 'bg-slate-900',
    empty:   'bg-slate-800 border border-slate-600 cursor-pointer hover:border-amber-500/50',
    active:  'bg-amber-500/15 border border-amber-500/50 cursor-pointer',
    cursor:  'bg-amber-500/35 border-2 border-amber-400 cursor-pointer',
    correct: 'bg-emerald-900/50 border border-emerald-500/50 cursor-pointer',
    wrong:   'bg-red-900/40 border border-red-500/40 cursor-pointer',
  }
  const TEXT: Record<string, string> = {
    blocked: '',
    empty: 'text-white',
    active: 'text-amber-100',
    cursor: 'text-amber-200',
    correct: 'text-emerald-300',
    wrong: 'text-red-300',
  }

  return (
    <div className="flex flex-col gap-3 bg-slate-950 rounded-xl p-3 select-none">
      {/* Active clue */}
      <div className="min-h-[36px] flex items-center">
        {activeWord ? (
          <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 w-full">
            <span className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mr-2">
              {activeWord.number} {activeWord.direction}
            </span>
            <span className="text-slate-300 text-xs">{activeWord.clue}</span>
          </div>
        ) : (
          <p className="text-slate-500 text-xs text-center w-full">Tap a white cell to start</p>
        )}
      </div>

      {/* Grid */}
      <div className="flex justify-center">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${config.cols}, ${cellSize}px)`, gap: 2 }}>
          {Array.from({ length: config.rows }, (_, r) =>
            Array.from({ length: config.cols }, (_, c) => {
              const state = cellState(r, c)
              const ck = `${r},${c}`
              const num = cellNumberMap[ck]
              const letter = playerGrid[r][c]
              return (
                <div
                  key={ck}
                  style={{ width: cellSize, height: cellSize }}
                  className={`relative flex items-center justify-center ${BG[state]}`}
                  onClick={() => state !== 'blocked' && handleCellTap(r, c)}
                >
                  {state !== 'blocked' && (
                    <>
                      {num !== undefined && (
                        <span className="absolute top-0 left-0.5 text-[6px] text-slate-400 font-bold leading-none pt-px">
                          {num}
                        </span>
                      )}
                      <span className={`font-bold leading-none text-sm ${TEXT[state]}`}>{letter}</span>
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Keyboard */}
      {!won ? (
        <div className="flex flex-col gap-1">
          {KEYBOARD_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1">
              {row.map(k => (
                <button
                  key={k}
                  onClick={() => handleKey(k)}
                  className={`h-8 rounded text-xs font-bold transition-colors active:scale-95 ${
                    k === '⌫'
                      ? 'px-3 bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
                      : 'w-7 bg-slate-800 text-slate-200 hover:bg-amber-500/25 hover:text-amber-200 border border-slate-700'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-emerald-400 font-bold text-sm py-1">Puzzle solved! ✓</p>
      )}

      {/* Clue list */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.06]">
        {(['across', 'down'] as const).map(dir => (
          <div key={dir}>
            <p className="text-amber-400/60 font-bold uppercase tracking-widest text-[9px] mb-1 capitalize">{dir}</p>
            {config.words.filter(w => w.direction === dir).map(w => (
              <p
                key={wKey(w)}
                onClick={() => {
                  const cells = wordCellsMap[wKey(w)]
                  if (cells) { setActiveKey(wKey(w)); setCursorPos(0) }
                }}
                className={`text-[10px] leading-snug mb-0.5 cursor-pointer transition-colors ${
                  activeKey === wKey(w) ? 'text-amber-300' : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                <span className="font-bold text-slate-400 mr-1">{w.number}.</span>
                {w.clue}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
