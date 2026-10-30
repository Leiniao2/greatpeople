import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { mulberry32, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Typeset: compose a line of movable type.  Sorts are picked from the case
// and dropped into the composing stick — but type reads mirrored, and the
// stick fills right to left, as it did for Gutenberg's compositors.  Wrong
// sorts cost ink; run out and the forme is spoiled.
//
// Difficulty: longer lines, fewer spare sorts, less ink, and a clock.

interface TypesetConfig {
  title: string
  intro: string
  /** Lines in rising length; the tier picks one. */
  lines: string[]
  fact: string
}

const CONFIGS: Record<string, TypesetConfig> = {
  'gutenberg-bible': {
    title: 'The 42-Line Bible',
    intro: "Set a line of Gutenberg's Bible. Remember: the sorts are mirrored, and the stick fills from the right.",
    lines: ['IN PRINCIPIO', 'IN PRINCIPIO ERAT', 'IN PRINCIPIO ERAT VERBUM', 'ET VERBUM ERAT APUD DEUM'],
    fact: 'Johannes Gutenberg printed about 180 copies of his Bible around 1455, each needing some 290 distinct sorts of type. A compositor set roughly two pages a day; the whole book took a team two years.',
  },
  'bi-sheng-clay': {
    title: 'Clay Type',
    intro: 'Bi Sheng fired characters in clay and set them in a wax-filled iron frame. Compose the line before the wax cools.',
    lines: ['MOVABLE TYPE', 'FIRED CLAY TYPE', 'TYPE SET IN WAX', 'A THOUSAND COPIES A DAY'],
    fact: "Shen Kuo's Dream Pool Essays (1088) describe Bi Sheng's invention of movable type in the 1040s — four centuries before Gutenberg. Clay sorts were set in a frame of resin and wax, printed, then melted free for reuse.",
  },
  'franklin-gazette': {
    title: 'The Pennsylvania Gazette',
    intro: 'Young Benjamin Franklin sets tomorrow\'s front page. Mirrored type, right to left, and the press waits.',
    lines: ['JOIN OR DIE', 'TIME IS MONEY', 'EARLY TO BED EARLY TO RISE', 'POOR RICHARDS ALMANACK'],
    fact: "Franklin was apprenticed to his brother's print shop at twelve and later owned the Pennsylvania Gazette. His 'Join, or Die' woodcut of 1754 was the first political cartoon printed in an American newspaper.",
  },
}

const MIRROR: Record<string, string> = { A: 'A', B: 'ᗺ', C: 'Ɔ', D: 'ᗡ', E: 'Ǝ', F: 'ꟻ', G: 'Ꭾ', H: 'H', I: 'I', J: 'Ⴑ', K: 'ꓘ', L: '⅃', M: 'M', N: 'И', O: 'O', P: 'ᑫ', Q: 'Ϙ', R: 'ᴙ', S: 'Ƨ', T: 'T', U: 'U', V: 'V', W: 'W', X: 'X', Y: 'Y', Z: 'Z' }

export default function TypesetGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'gutenberg-bible')
  const line = cfg.lines[Math.min(cfg.lines.length - 1, difficulty - 1)].toUpperCase()
  const ink = scale(difficulty, [5, 4, 3, 2])
  const timeLimit = scale(difficulty, [0, 90, 75, 60])
  const spare = scale(difficulty, [6, 5, 4, 3])

  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  const timer = useGameTimer({ seconds: timeLimit, running: !settled, onExpire: () => lose('the press could not wait') })

  // The case holds every sort the line needs plus a few decoys, shuffled.
  const caseSorts = useMemo(() => {
    const rng = mulberry32(seed)
    const needed = [...line].filter(c => c !== ' ')
    const decoys: string[] = []
    const alphabet = Object.keys(MIRROR)
    while (decoys.length < spare) decoys.push(alphabet[Math.floor(rng() * alphabet.length)])
    return shuffle([...needed, ...decoys].map((ch, i) => ({ id: i, ch })), rng)
  }, [line, seed, spare])

  const [used, setUsed] = useState<number[]>([])      // sort ids in the order set
  const [inkLeft, setInkLeft] = useState(ink)
  const [flash, setFlash] = useState<number | null>(null)
  const targets = [...line]
  // Position being filled, skipping spaces (they are set automatically).
  const nextIdx = (() => {
    let i = used.length
    let pos = 0
    for (let k = 0; k < targets.length; k++) {
      if (targets[k] === ' ') continue
      if (pos === i) return k
      pos++
    }
    return targets.length
  })()

  const pick = (id: number) => {
    if (settled || flash !== null) return
    const sort = caseSorts.find(s => s.id === id)!
    if (used.includes(id)) return
    if (sort.ch !== targets[nextIdx]) {
      setFlash(id)
      const left = inkLeft - 1
      setInkLeft(left)
      setTimeout(() => setFlash(null), 450)
      if (left <= 0) lose('the forme is spoiled')
      return
    }
    const next = [...used, id]
    setUsed(next)
    const lettersNeeded = targets.filter(c => c !== ' ').length
    if (next.length === lettersNeeded) win()
  }
  const undo = () => { if (!settled && used.length) setUsed(u => u.slice(0, -1)) }

  // Stick contents: positions filled so far, rendered mirrored and right-to-left.
  const filled = new Map<number, string>()
  {
    let i = 0
    for (let k = 0; k < targets.length; k++) {
      if (targets[k] === ' ') continue
      if (i < used.length) filled.set(k, caseSorts.find(s => s.id === used[i])!.ch)
      i++
    }
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className={`shrink-0 text-[10px] ${inkLeft <= 1 ? 'text-red-600 font-bold' : 'text-muted'}`}>Ink {'▮'.repeat(Math.max(0, inkLeft))}{'▯'.repeat(ink - Math.max(0, inkLeft))}</p>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <p className="text-ink text-sm font-medium">Set: <span className="font-mono tracking-widest">{line}</span></p>

      {/* Composing stick: right-to-left, mirrored glyphs */}
      <div className="flex flex-row-reverse justify-start gap-1 p-2 bg-ink-2 rounded-xl border-2 border-ink min-h-[52px] overflow-x-auto">
        {targets.map((t, k) => (
          <div key={k}
            className={`w-8 h-10 rounded flex items-center justify-center font-mono text-lg
              ${t === ' ' ? 'bg-transparent' : filled.has(k) ? 'bg-paper text-ink' : k === nextIdx ? 'bg-paper/30 border border-dashed border-paper/70' : 'bg-paper/10'}`}>
            {filled.has(k) ? MIRROR[filled.get(k)!] : ''}
          </div>
        ))}
      </div>

      {/* Type case */}
      <div className="grid grid-cols-8 gap-1.5">
        {caseSorts.map(s => {
          const taken = used.includes(s.id)
          const bad = flash === s.id
          return (
            <button key={s.id} disabled={taken || settled} onClick={() => pick(s.id)}
              className={`h-10 rounded-lg border font-mono text-lg transition-all
                ${taken ? 'opacity-20 bg-panel border-line' : bad ? 'bg-red-500/20 border-red-500 text-red-700' : 'bg-panel border-line text-ink hover:border-accent/50 hover:bg-accent/10'}`}>
              {MIRROR[s.ch]}
            </button>
          )
        })}
      </div>
      <div className="flex justify-between items-center">
        <p className="text-[10px] text-muted/80">Sorts are mirrored; the stick fills from the right.</p>
        <button onClick={undo} disabled={settled || used.length === 0} className="text-[10px] text-muted underline disabled:opacity-40">Pull last sort</button>
      </div>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Forme locked — print!" loseTitle="The forme is spoiled" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
