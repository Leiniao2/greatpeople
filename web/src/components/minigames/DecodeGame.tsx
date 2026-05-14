import { useState, useEffect, useCallback } from 'react'

// ── Config ─────────────────────────────────────────────────────────────────────

interface DecodeConfig {
  title: string
  hint: string
  plaintext: string
}

const CONFIGS: Record<string, DecodeConfig> = {
  'enigma-msg':     { title: 'Encrypted Dispatch',   hint: 'Intercept decoded at Bletchley Park, November 1942',             plaintext: 'BREAK THE CODE WIN THE WAR' },
  'cipher-al':      { title: 'The Hidden Formula',   hint: 'A message encoded by the House of Wisdom scholars',              plaintext: 'ALGEBRA FREES THE MIND' },
  'cicero-code':    { title: 'Secret Missive',        hint: "A Roman senator's encrypted letter, circa 50 BCE",               plaintext: 'WORDS MOVE ROME TO ACTION' },
  'belisarius-msg': { title: 'Field Cipher',          hint: 'A dispatch from the Byzantine eastern front',                    plaintext: 'KNOW YOUR FOE WIN YOUR WAR' },
  'sargon-code':    { title: 'Royal Seal',            hint: 'An Akkadian royal decree encoded for messengers',                plaintext: 'UNITE THE LAND OR LOSE IT' },
  'mulan-code':     { title: 'Hidden Orders',         hint: 'A military dispatch from the Northern Wei campaigns',            plaintext: 'HONOR NEEDS NO NAME' },
  'mao-code':       { title: 'Long March Dispatch',   hint: 'A coded military order from the Jiangxi Soviet, 1934',           plaintext: 'MARCH OR FACE DEFEAT' },
  'turing-dispatch':{ title: 'Naval Intercept',       hint: 'An Enigma-encoded naval message, North Atlantic 1943',           plaintext: 'THE MACHINE SEES ALL' },
}

// ── Cipher generation ──────────────────────────────────────────────────────────

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function makeCipher(configId: string): Record<string, string> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  const shuffled = [...alpha]
  let rng = hashCode(configId)
  for (let i = shuffled.length - 1; i > 0; i--) {
    rng = (Math.imul(1664525, rng) + 1013904223) >>> 0
    const j = rng % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const cipher: Record<string, string> = {}
  alpha.forEach((l, i) => { cipher[l] = shuffled[i] })  // plaintext l -> cipher shuffled[i]
  return cipher
}

// reverse map: cipher -> plaintext
function makeDecipherMap(cipher: Record<string, string>): Record<string, string> {
  const rev: Record<string, string> = {}
  for (const [plain, enc] of Object.entries(cipher)) rev[enc] = plain
  return rev
}

// ── Alphabet panel layout ──────────────────────────────────────────────────────

const ALPHA_ROWS = [
  'ABCDEFGHIJKLM'.split(''),
  'NOPQRSTUVWXYZ'.split(''),
]

// ── Component ──────────────────────────────────────────────────────────────────

export default function DecodeGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? Object.values(CONFIGS)[0]
  const usedConfigId = CONFIGS[configId] ? configId : Object.keys(CONFIGS)[0]

  // plaintext -> ciphertext mapping for this config
  const cipher = makeCipher(usedConfigId)
  // ciphertext -> plaintext (for validation)
  const decipherMap = makeDecipherMap(cipher)

  // Build ciphertext from plaintext
  const plaintext = config.plaintext.toUpperCase()
  const ciphertext = plaintext
    .split('')
    .map(ch => (ch === ' ' ? ' ' : cipher[ch] ?? ch))
    .join('')

  // Unique cipher letters in this message (for tracking)
  const uniqueCipherLetters = Array.from(
    new Set(ciphertext.split('').filter(ch => ch !== ' '))
  ).sort()

  // player assignments: cipher letter -> guessed plain letter
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  // which cipher letter is currently selected
  const [selected, setSelected] = useState<string | null>(null)
  const [won, setWon] = useState(false)

  // Check win condition
  const checkWin = useCallback((asgn: Record<string, string>) => {
    for (const ch of uniqueCipherLetters) {
      if (asgn[ch] !== decipherMap[ch]) return false
    }
    return true
  }, [uniqueCipherLetters, decipherMap])

  const assign = useCallback((plainLetter: string) => {
    if (!selected || won) return
    setAssignments(prev => {
      const next = { ...prev, [selected]: plainLetter }
      if (checkWin(next)) {
        setTimeout(() => {
          setWon(true)
          setTimeout(() => onWin(), 800)
        }, 300)
      }
      return next
    })
  }, [selected, won, checkWin, onWin])

  const handleKeydown = useCallback((e: KeyboardEvent) => {
    if (won) return
    const key = e.key.toUpperCase()
    if (/^[A-Z]$/.test(key)) {
      if (selected) assign(key)
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      if (selected) {
        setAssignments(prev => {
          const next = { ...prev }
          delete next[selected]
          return next
        })
      }
    }
  }, [won, selected, assign])

  useEffect(() => {
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [handleKeydown])

  // Split ciphertext into words
  const words = ciphertext.split(' ')
  const plainWords = plaintext.split(' ')

  // Tile state helpers
  function getTileState(cipherLetter: string): 'correct' | 'wrong' | 'assigned' | 'empty' {
    const guess = assignments[cipherLetter]
    if (!guess) return 'empty'
    const correct = decipherMap[cipherLetter]
    if (guess === correct) return 'correct'
    return 'wrong'
  }

  function cipherLetterBorder(cipherLetter: string): string {
    if (selected === cipherLetter) return 'border-2 border-violet-400'
    return 'border border-slate-600'
  }

  function guessColor(cipherLetter: string): string {
    const state = getTileState(cipherLetter)
    if (state === 'correct') return 'text-emerald-400'
    if (state === 'wrong')   return 'text-red-400'
    return 'text-slate-300'
  }

  function alphaBtnStyle(letter: string): string {
    // Is this plain letter already assigned to some cipher letter?
    const assignedTo = Object.entries(assignments).find(([, v]) => v === letter)
    if (assignedTo) {
      const cipherLetter = assignedTo[0]
      const correct = decipherMap[cipherLetter]
      if (letter === correct) return 'bg-emerald-700/60 text-emerald-200 border-emerald-600'
      return 'bg-red-900/50 text-red-300 border-red-700/50'
    }
    return 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600 hover:border-amber-500/50'
  }

  // Progress: how many cipher letters are correctly assigned
  const correctCount = uniqueCipherLetters.filter(ch => assignments[ch] === decipherMap[ch]).length
  const totalUnique = uniqueCipherLetters.length

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Header */}
      <div className="text-center px-2">
        <p className="text-amber-400 font-bold text-sm tracking-wide">{config.title}</p>
        <p className="text-slate-400 text-xs mt-0.5 max-w-[300px] leading-snug italic">{config.hint}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-[320px]">
        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
          <span>Decoded</span>
          <span className="text-amber-400/80">{correctCount}/{totalUnique} letters</span>
        </div>
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-300"
            style={{ width: totalUnique ? `${(correctCount / totalUnique) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {/* Message display */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-2 px-1 max-w-[340px]">
        {words.map((cWord, wi) => (
          <div key={wi} className="flex gap-0.5">
            {cWord.split('').map((cipherLetter, li) => {
              const guess = assignments[cipherLetter] ?? ''
              const isSelected = selected === cipherLetter
              const state = getTileState(cipherLetter)
              return (
                <div
                  key={li}
                  className="flex flex-col items-center cursor-pointer"
                  onClick={() => !won && setSelected(isSelected ? null : cipherLetter)}
                >
                  {/* Cipher letter (top) */}
                  <div
                    className={`
                      w-8 h-7 flex items-center justify-center rounded-t
                      font-mono text-xs font-bold
                      transition-colors duration-150
                      ${isSelected
                        ? 'bg-violet-900/70 text-amber-300 border-t-2 border-l-2 border-r-2 border-violet-400'
                        : state === 'correct'
                        ? 'bg-emerald-900/40 text-amber-400/80 border-t border-l border-r border-emerald-700/40'
                        : 'bg-slate-800/60 text-amber-500/70 border-t border-l border-r border-slate-600/60'
                      }
                    `}
                  >
                    {cipherLetter}
                  </div>
                  {/* Player guess (bottom) */}
                  <div
                    className={`
                      w-8 h-7 flex items-center justify-center rounded-b
                      font-mono text-sm font-bold
                      border-b border-l border-r
                      transition-colors duration-150
                      ${isSelected ? 'border-violet-400' : cipherLetterBorder(cipherLetter)}
                      ${guessColor(cipherLetter)}
                      ${isSelected ? 'bg-violet-900/40' : 'bg-slate-900/60'}
                    `}
                  >
                    {guess}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Instruction hint */}
      {!won && (
        <p className="text-slate-500 text-[10px] text-center">
          {selected
            ? <span>Press a key or tap a letter to assign <span className="text-violet-300 font-bold">{selected}</span></span>
            : 'Tap a cipher letter to select it, then type or tap to decode'
          }
        </p>
      )}

      {/* Win message */}
      {won && (
        <p className="text-emerald-400 font-bold text-sm animate-pulse">
          Decoded!
        </p>
      )}

      {/* Alphabet panel */}
      {!won && (
        <div className="flex flex-col gap-1 mt-1">
          {ALPHA_ROWS.map((row, ri) => (
            <div key={ri} className="flex justify-center gap-1">
              {row.map(letter => (
                <button
                  key={letter}
                  onClick={() => assign(letter)}
                  className={`
                    w-[22px] h-7 rounded text-[11px] font-bold border
                    transition-colors duration-100 active:scale-95
                    ${alphaBtnStyle(letter)}
                  `}
                >
                  {letter}
                </button>
              ))}
            </div>
          ))}
          {/* Backspace button */}
          <div className="flex justify-center mt-0.5">
            <button
              onClick={() => {
                if (selected) {
                  setAssignments(prev => {
                    const next = { ...prev }
                    delete next[selected]
                    return next
                  })
                }
              }}
              className="px-4 h-7 rounded text-[11px] font-bold border
                bg-slate-700 text-slate-300 border-slate-600
                hover:bg-slate-600 active:scale-95 transition-colors"
            >
              ⌫ Clear
            </button>
          </div>
        </div>
      )}

      {/* Decoded plaintext reveal on win */}
      {won && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-2 max-w-[320px] mt-1">
          {plainWords.map((w, wi) => (
            <span key={wi} className="font-mono font-bold text-base text-emerald-300 tracking-widest">
              {w}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
