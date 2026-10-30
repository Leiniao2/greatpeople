import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Arch builder: raise a structure course by course.  Every block must rest
// on two supports below it (or the ground), the keystone can only be placed
// once both springers meet, and the stock of blocks is limited.  Place a
// block with no support and the course collapses — costing one block.
//
// Difficulty: taller spans, fewer spare blocks, a load test at the end that
// needs every keystone in, and a clock.

interface Blueprint {
  title: string
  intro: string
  /** Rows from the ground up; '#' required block, 'K' keystone, '.' empty. */
  plan: string[]
  fact: string
}

export const CONFIGS: Record<string, Blueprint> = {
  'imhotep-step': {
    title: 'The Step Pyramid',
    intro: 'Imhotep stacks mastaba upon mastaba for Djoser. Build each course on the one below, capstone last.',
    plan: [
      '...K...',
      '..###..',
      '.#####.',
      '#######',
    ],
    fact: "The Step Pyramid at Saqqara (c. 2650 BCE) is the oldest large-scale stone building in the world. Imhotep, its architect, was later worshipped as a god of medicine — one of very few non-royal Egyptians to be deified.",
  },
  'roman-aqueduct': {
    title: 'Pont du Gard',
    intro: 'Three tiers of arches carry water across the Gardon. Set the springers, then close each arch with its keystone.',
    plan: [
      '.K...K.',
      '#.#.#.#',
      '#.#.#.#',
      '#######',
    ],
    fact: 'The Pont du Gard, built around 50 CE, carried the Nîmes aqueduct 50 km with a fall of just 17 metres — a gradient of 1 in 3,000 — using unmortared stone blocks of up to six tonnes.',
  },
  'brunelleschi-dome': {
    title: 'The Dome of Florence',
    intro: "Brunelleschi's dome rose without centering: each ring supported the next. Lay the rings inward until the lantern can sit on top.",
    plan: [
      '...K...',
      '..#.#..',
      '.#.#.#.',
      '#.#.#.#',
      '#######',
    ],
    fact: "Filippo Brunelleschi won the 1418 competition for the cathedral dome with a design needing no wooden scaffold across the 45-metre span: a double shell, herringbone brickwork and an ox-hoist of his own invention.",
  },
}

type Cell = '.' | '#' | 'K'

/** A block rests on the block beneath it or bridges two diagonal supports; a keystone needs both springers. */
export function isSupported(built: boolean[][], r: number, c: number, want: Cell): boolean {
  if (want === 'K') return r > 0 && !!built[r - 1][c - 1] && !!built[r - 1][c + 1]
  if (r === 0) return true
  const below = built[r - 1]
  return !!(below[c] || (below[c - 1] && below[c + 1]))
}

/** Whether every block of a top-down plan can be placed in some order under the support rules. */
export function isBuildable(plan: string[]): boolean {
  const rows = [...plan].reverse().map(r => [...r] as Cell[])
  const built = rows.map(r => r.map(() => false))
  let placed = true
  while (placed) {
    placed = false
    rows.forEach((row, r) => row.forEach((want, c) => {
      if (want !== '.' && !built[r][c] && isSupported(built, r, c, want)) { built[r][c] = true; placed = true }
    }))
  }
  return rows.every((row, r) => row.every((want, c) => want === '.' || built[r][c]))
}

export default function ArchBuildGame({ configId, difficulty, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'imhotep-step')
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1000 })
  const timeLimit = scale(difficulty, [0, 0, 120, 90])
  const timer = useGameTimer({ seconds: timeLimit, running: !settled, onExpire: () => lose('the season ended') })

  // Rows are stored bottom-up for the support check; drawn top-down.
  const plan = useMemo(() => [...cfg.plan].reverse().map(r => [...r] as Cell[]), [cfg])
  const rows = plan.length, cols = plan[0].length
  const required = plan.flat().filter(c => c !== '.').length
  const spare = scale(difficulty, [4, 3, 2, 1])
  const [stock, setStock] = useState(required + spare)
  const [built, setBuilt] = useState<boolean[][]>(() => plan.map(r => r.map(() => false)))
  const [flash, setFlash] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const placedCount = built.flat().filter(Boolean).length
  const supported = (r: number, c: number) => isSupported(built, r, c, '#')
  const keystoneReady = (r: number, c: number) => isSupported(built, r, c, 'K')

  const place = (r: number, c: number) => {
    if (settled || built[r][c]) return
    const want = plan[r][c]
    if (want === '.') { setNote('The blueprint has no block there.'); return }
    if (want === 'K' && !keystoneReady(r, c)) { setNote('A keystone needs both springers in place first.'); return }
    if (!supported(r, c)) {
      // Collapse: the block is lost.
      setFlash(`${r},${c}`)
      setTimeout(() => setFlash(null), 500)
      const left = stock - 1
      setStock(left)
      setNote('No support — the block fell and shattered.')
      if (left < required - placedCount) lose('not enough stone left')
      return
    }
    const next = built.map(row => [...row])
    next[r][c] = true
    setBuilt(next)
    setStock(stock - 1)
    setNote(null)
    if (next.flat().filter(Boolean).length === required) win()
  }

  const cellPx = cols > 7 ? 30 : 36

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className={`shrink-0 text-[10px] ${stock - (required - placedCount) <= 0 ? 'text-red-600 font-bold' : 'text-muted'}`}>
          Stone {stock} · need {required - placedCount}
        </p>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div className="flex justify-center">
        <div className="grid gap-0.5 p-2 rounded-xl bg-sky-200/40 border border-line" style={{ gridTemplateColumns: `repeat(${cols}, ${cellPx}px)` }}>
          {[...plan].map((_, i) => rows - 1 - i).map(r => plan[r].map((want, c) => {
            const isBuilt = built[r][c]
            const bad = flash === `${r},${c}`
            const ghost = want !== '.' && !isBuilt
            return (
              <button key={`${r},${c}`} onClick={() => place(r, c)}
                className={`rounded-sm border transition-all
                  ${isBuilt ? (want === 'K' ? 'bg-accent border-accent' : 'bg-line-2 border-ink-2') : bad ? 'bg-red-500/40 border-red-500' : ghost ? 'bg-paper/60 border-dashed border-line-2 hover:bg-paper' : 'bg-transparent border-transparent'}`}
                style={{ width: cellPx, height: cellPx }}>
                {ghost && <span className="text-[9px] text-muted">{want === 'K' ? 'K' : ''}</span>}
                {isBuilt && want === 'K' && <span className="text-[10px] text-accent-fg font-bold">K</span>}
              </button>
            )
          }))}
        </div>
      </div>

      <p className="text-[10px] text-muted/80 text-center">
        Tap a dashed cell to set a block. Each block needs the block beneath it, or two supports diagonally below. Keystones last.
      </p>
      {note && !settled && <p className="text-[11px] text-amber-800 text-center">{note}</p>}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="It stands!" loseTitle="The structure cannot be finished" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
