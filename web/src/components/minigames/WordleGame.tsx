import { useState, useEffect, useCallback } from 'react'

// ── Config ─────────────────────────────────────────────────────────────────────

interface WordleConfig {
  word: string
  title: string
  hint: string
}

const CONFIGS: Record<string, WordleConfig> = {
  enigma:         { word: 'BOMBE', title: 'Break the Code',      hint: 'The electromechanical machine Turing built to crack Enigma' },
  'turing-rotor': { word: 'ROTOR', title: 'The Enigma Heart',    hint: 'The spinning component at the core of the Enigma machine' },
  cedar:          { word: 'CEDAR', title: 'The Sacred Forest',   hint: 'The legendary wood guarded by Humbaba in the Epic of Gilgamesh' },
  agora:          { word: 'AGORA', title: 'Heart of Democracy',  hint: 'The central space where Athenian democracy was argued and decided' },
  spice:          { word: 'SPICE', title: 'The Price of Spice',  hint: 'What drove Portugal and Spain to risk everything on the open ocean' },
  genes:          { word: 'GENES', title: "Nature's Blueprint",  hint: "Mendel's peas revealed the unit that passes traits between generations" },
  truth:          { word: 'TRUTH', title: 'Satyagraha',          hint: "Gandhi's Sanskrit word: Satyagraha means 'truth force'" },
  climb:          { word: 'CLIMB', title: 'The Summit',          hint: 'What Hillary and Tenzing did for the first time on May 29, 1953' },
  forum:          { word: 'FORUM', title: "Rome's Stage",        hint: "The center of Roman public life — where Cicero's voice shook the republic" },
  lance:          { word: 'LANCE', title: 'The Cavalry Weapon',  hint: "The weapon that gave Belisarius's cataphracts their devastating first charge" },
  piano:          { word: 'PIANO', title: "Schumann's Voice",    hint: 'The instrument through which Robert Schumann spoke when words failed him' },
  crown:          { word: 'CROWN', title: 'The Final Price',     hint: 'What Marie Antoinette wore — and ultimately sacrificed everything for' },
  march:          { word: 'MARCH', title: 'The Long March',      hint: 'The strategic retreat that became the founding myth of Chinese Communism' },
  saint:          { word: 'SAINT', title: 'Canonized',           hint: 'The designation Pope Francis conferred on Teresa of Calcutta in 2016' },
  sword:          { word: 'SWORD', title: "Musashi's Path",      hint: "Miyamoto Musashi's way of the sword ultimately led to the way of the self" },
  brush:          { word: 'BRUSH', title: "Titian's Tool",       hint: 'Legend says Titian finished paintings with his fingers — but it started with this' },
  zeros:          { word: 'ZEROS', title: 'The Nothing Number',  hint: "Al-Khwarizmi helped transmit the concept of zero to Western mathematics" },
  flood:          { word: 'FLOOD', title: 'The Great Deluge',    hint: "The catastrophe that tests the hero in the world's oldest epic" },
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MAX_GUESSES = 6
const WORD_LENGTH = 5

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
]

// ── Types ──────────────────────────────────────────────────────────────────────

type TileState = 'correct' | 'present' | 'absent' | 'empty' | 'pending'

interface TileResult {
  letter: string
  state: TileState
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function evaluateGuess(guess: string, word: string): TileResult[] {
  const result: TileResult[] = Array(WORD_LENGTH).fill(null).map((_, i) => ({
    letter: guess[i],
    state: 'absent' as TileState,
  }))

  // Count remaining letters in word for present detection
  const remaining: Record<string, number> = {}
  for (let i = 0; i < word.length; i++) {
    if (guess[i] !== word[i]) {
      remaining[word[i]] = (remaining[word[i]] ?? 0) + 1
    }
  }

  // First pass: correct positions
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === word[i]) {
      result[i].state = 'correct'
    }
  }

  // Second pass: present letters
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i].state === 'correct') continue
    const ch = guess[i]
    if (remaining[ch] && remaining[ch] > 0) {
      result[i].state = 'present'
      remaining[ch]--
    }
  }

  return result
}

function tileBg(state: TileState, revealed: boolean): string {
  if (!revealed) return 'bg-slate-800 border border-slate-600'
  switch (state) {
    case 'correct': return 'bg-emerald-600 border-emerald-600'
    case 'present': return 'bg-amber-600 border-amber-600'
    case 'absent':  return 'bg-slate-700 border-slate-700'
    default:        return 'bg-slate-800 border border-slate-600'
  }
}

// Best state wins: correct > present > absent > unknown
function bestKeyState(
  state1: TileState | undefined,
  state2: TileState
): TileState {
  const rank: Record<TileState, number> = { correct: 3, present: 2, absent: 1, empty: 0, pending: 0 }
  if (!state1) return state2
  return rank[state1] >= rank[state2] ? state1 : state2
}

function keyBg(state: TileState | undefined): string {
  switch (state) {
    case 'correct': return 'bg-emerald-600 text-white border-emerald-600'
    case 'present': return 'bg-amber-600 text-white border-amber-600'
    case 'absent':  return 'bg-slate-700 text-slate-400 border-slate-700'
    default:        return 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600'
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function WordleGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? Object.values(CONFIGS)[0]
  const word = config.word

  const [guesses, setGuesses] = useState<TileResult[][]>([])
  const [current, setCurrent] = useState('')
  const [shaking, setShaking] = useState(false)
  // revealedRows[i] = true once that row's flip animation has fully been set in motion
  const [revealedRows, setRevealedRows] = useState<boolean[]>([])
  const [won, setWon] = useState(false)
  const [lost, setLost] = useState(false)

  const canType = !won && !lost && !shaking

  const submitGuess = useCallback(() => {
    if (current.length < WORD_LENGTH) {
      setShaking(true)
      setTimeout(() => setShaking(false), 500)
      return
    }

    const result = evaluateGuess(current, word)
    const newGuesses = [...guesses, result]
    setGuesses(newGuesses)
    setCurrent('')

    // Mark this row as revealed (triggers flip CSS)
    const rowIndex = newGuesses.length - 1
    setRevealedRows(prev => {
      const next = [...prev]
      next[rowIndex] = true
      return next
    })

    const isWin = result.every(t => t.state === 'correct')
    if (isWin) {
      setTimeout(() => {
        setWon(true)
        setTimeout(() => onWin(), 800)
      }, WORD_LENGTH * 120 + 400)
    } else if (newGuesses.length >= MAX_GUESSES) {
      setTimeout(() => setLost(true), WORD_LENGTH * 120 + 400)
    }
  }, [current, guesses, word, onWin])

  const pressKey = useCallback((key: string) => {
    if (!canType) return
    if (key === '⌫' || key === 'Backspace') {
      setCurrent(prev => prev.slice(0, -1))
    } else if (key === 'ENTER' || key === 'Enter') {
      submitGuess()
    } else if (/^[A-Za-z]$/.test(key)) {
      if (current.length < WORD_LENGTH) {
        setCurrent(prev => prev + key.toUpperCase())
      }
    }
  }, [canType, current, submitGuess])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      pressKey(e.key)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pressKey])

  // Build keyboard state from all guesses
  const keyStates = new Map<string, TileState>()
  for (const row of guesses) {
    for (const tile of row) {
      keyStates.set(tile.letter, bestKeyState(keyStates.get(tile.letter), tile.state))
    }
  }

  // Build the 6-row grid
  const rows: Array<{ tiles: Array<{ letter: string; state: TileState }>; revealed: boolean }> = []
  for (let r = 0; r < MAX_GUESSES; r++) {
    if (r < guesses.length) {
      rows.push({ tiles: guesses[r], revealed: revealedRows[r] ?? false })
    } else if (r === guesses.length && !won && !lost) {
      // Active row
      const tiles = Array(WORD_LENGTH).fill(null).map((_, i) => ({
        letter: current[i] ?? '',
        state: 'pending' as TileState,
      }))
      rows.push({ tiles, revealed: false })
    } else {
      rows.push({
        tiles: Array(WORD_LENGTH).fill(null).map(() => ({ letter: '', state: 'empty' as TileState })),
        revealed: false,
      })
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Header */}
      <div className="text-center px-2">
        <p className="text-amber-400 font-bold text-sm tracking-wide">{config.title}</p>
        <p className="text-slate-400 text-xs mt-0.5 max-w-[280px] leading-snug">{config.hint}</p>
      </div>

      {/* Tile grid */}
      <div className="flex flex-col gap-1">
        {rows.map((row, r) => {
          const isActiveRow = r === guesses.length && !won && !lost
          const isShaking = isActiveRow && shaking
          return (
            <div
              key={r}
              className={`flex gap-1 ${isShaking ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}
            >
              {row.tiles.map((tile, c) => {
                const flipDelay = `${c * 120}ms`
                const { revealed } = row
                const pendingFilled = !revealed && tile.letter !== ''
                const borderCls = pendingFilled
                  ? 'border-2 border-slate-400'
                  : 'border-2 border-slate-700'

                if (revealed) {
                  // Flip animation: use inline style animation with per-column delay
                  return (
                    <div
                      key={c}
                      className="w-11 h-11 relative"
                      style={{ perspective: '200px' }}
                    >
                      <div
                        style={{
                          animationName: 'tileFlip',
                          animationDuration: '500ms',
                          animationDelay: flipDelay,
                          animationFillMode: 'both',
                          animationTimingFunction: 'ease-in-out',
                          transformStyle: 'preserve-3d',
                        }}
                        className="w-full h-full relative"
                      >
                        {/* Front face (empty/pre-reveal) */}
                        <div
                          className="absolute inset-0 flex items-center justify-center bg-slate-800 border-2 border-slate-600 font-bold text-lg text-white"
                          style={{ backfaceVisibility: 'hidden' }}
                        >
                          {tile.letter}
                        </div>
                        {/* Back face (colored result) */}
                        <div
                          className={`absolute inset-0 flex items-center justify-center font-bold text-lg text-white ${tileBg(tile.state, true)}`}
                          style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
                        >
                          {tile.letter}
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={c}
                    className={`
                      w-11 h-11 flex items-center justify-center
                      font-bold text-lg text-white bg-slate-800
                      transition-transform duration-100
                      ${borderCls}
                      ${pendingFilled ? 'scale-105' : 'scale-100'}
                    `}
                  >
                    {tile.letter}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Result messages */}
      {won && (
        <p className="text-emerald-400 font-bold text-sm animate-pulse">
          Correct! Well done.
        </p>
      )}
      {lost && (
        <p className="text-red-400 font-bold text-sm">
          Answer: <span className="tracking-widest">{word}</span>
        </p>
      )}

      {/* On-screen keyboard */}
      {!won && !lost && (
        <div className="flex flex-col gap-1 w-full max-w-[340px]">
          {KEYBOARD_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1">
              {row.map(k => {
                const isSpecial = k === 'ENTER' || k === '⌫'
                const kState = keyStates.get(k)
                return (
                  <button
                    key={k}
                    onClick={() => pressKey(k === '⌫' ? 'Backspace' : k === 'ENTER' ? 'Enter' : k)}
                    className={`
                      h-10 rounded font-bold text-xs border transition-colors active:scale-95
                      ${isSpecial ? 'px-2 min-w-[48px]' : 'w-8'}
                      ${isSpecial
                        ? 'bg-slate-600 text-slate-200 border-slate-500 hover:bg-slate-500'
                        : keyBg(kState)
                      }
                    `}
                  >
                    {k}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Shake keyframe injected inline */}
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-6px); }
          40%      { transform: translateX(6px); }
          60%      { transform: translateX(-4px); }
          80%      { transform: translateX(4px); }
        }
        @keyframes tileFlip {
          0%   { transform: rotateX(0deg); }
          50%  { transform: rotateX(-90deg); }
          100% { transform: rotateX(-180deg); }
        }
      `}</style>
    </div>
  )
}
