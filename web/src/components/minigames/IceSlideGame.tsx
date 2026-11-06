import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { MinigameProps } from '@/games/types'
import { useGameTimer, TimerBar, storyText } from './_shared'
import { TIERS, timeLimitFor, yardFor, analyse, parseGrid, slide, type Dir } from './iceslide/model'

export { TIERS, timeLimitFor, yardFor, analyse, parseGrid, slide, slidePos, generate } from './iceslide/model'
export type { Tier, Dir, Grid } from './iceslide/model'

// A config is the story dressing of a yard: the yard itself is generated from
// the seed and scaled by the difficulty (see iceslide/model.ts).
interface Config {
  title: string
  question: string
  fact: string
}

export const CONFIGS: Record<string, Config> = {
  'enkidu-ice': {
    title: 'Cedar Forest Path',
    question: 'Enkidu slides through the frozen cedar forest. Reach the exit.',
    fact: "Enkidu, raised by animals in the wild, became Gilgamesh's equal and closest companion — together they journeyed to the Cedar Forest to slay the monster Humbaba.",
  },
  'mashu-passes': {
    title: 'The Passes of Mashu',
    question: 'Gilgamesh crosses the frozen mountain passes toward Mashu, where the sun goes down. On the ice you cannot stop until a rock stops you — reach the mouth of the mountain.',
    fact: 'Grieving for Enkidu, Gilgamesh roamed the wild in a lion skin in search of Utnapishtim, the one man the gods had made immortal. He entered the twin-peaked mountain Mashu and walked the path of the sun — twelve double-hours in utter darkness — before coming out into a garden of jewelled trees.',
  },
  'lycaeum-ice': {
    title: 'Winter on Mount Lycaeum',
    question: 'Snow has frozen the Arcadian slopes. Slide from the exile\'s house down to the precinct of Zeus — once you start, you cannot stop until a rock stops you.',
    fact: 'Thucydides says Pleistoanax spent his exile on Mount Lycaeum in Arcadia, living in a house built half inside the sacred precinct of Zeus, so afraid was he of the Spartans.',
  },
  'pyramid-ice': {
    title: 'Pyramid Corridors',
    question: 'Slide through the icy pyramid passages to find the exit.',
    fact: "The internal passages of the Great Pyramid were designed with deliberate complexity — angled shafts, false doors, and sealed chambers to protect the pharaoh's journey to the afterlife.",
  },
  'meiji-ice': {
    title: 'Meiji Labyrinth',
    question: 'Navigate the reformer\'s path through the maze of old and new Japan.',
    fact: "Itō Hirobumi navigated impossible contradictions — preserving imperial tradition while importing Western law, industry, and constitutional government in the span of a single generation.",
  },
  'versailles-sleigh': {
    title: 'Sleighs on the Grand Canal',
    question: 'The Dauphine’s sleigh glides across the frozen park of Versailles. A sleigh cannot stop until it meets a bank or a statue — reach the far landing.',
    fact: 'In the hard winter of 1776 Marie Antoinette revived the Viennese fashion for sleighing: gilded sleighs with bells and plumes ran through the park of Versailles and even the streets of Paris, where critics saw one more Austrian extravagance.',
  },
  'mulan-ice': {
    title: 'Battle on the Ice',
    question: 'Hua Mulan charges across the frozen battlefield. Reach the far end.',
    fact: "Hua Mulan disguised herself as a man to take her elderly father's place in military conscription — serving for twelve years before her identity was discovered.",
  },
  'turing-ice': {
    title: 'Logic Grid',
    question: 'Navigate the ice logic puzzle — each path is determined by rules.',
    fact: "Turing's mathematical logic treated computation as a mechanical process of following strict rules — just as ice physics forces the slider to follow deterministic paths.",
  },
  'long-march-ice': {
    title: 'The Long March',
    question: 'Lead the forces through treacherous mountain passes.',
    fact: "The Long March covered 9,000 km through mountains, swamps, and enemy territory — a strategic retreat that became the founding myth of the Chinese Communist Party.",
  },
  'knights-ice': {
    title: 'Frozen Castle',
    question: "Lancelot slides across the castle's iced-over courtyard.",
    fact: "Medieval knights trained extensively in winter conditions — ice and mud were constant battlefield hazards that required both horse and rider to adapt their tactics.",
  },
  'cicero-ice': {
    title: 'Senate Corridors',
    question: 'Cicero must navigate the frozen senate halls to make his speech.',
    fact: "Cicero's Catilinarian Orations required navigating the treacherous politics of the late Roman Republic — where every step in the Senate was calculated.",
  },
  'batu-ice': {
    title: 'Steppe Crossing',
    question: 'Batu Khan rides across the frozen steppe to outflank the enemy.',
    fact: "Mongol cavalry could cover 100 miles per day on the frozen steppe — their speed in winter was a strategic advantage that repeatedly caught European armies off guard.",
  },
  'taira-ice': {
    title: 'Frozen Coast',
    question: 'Taira no Tadanori slides across the icy coast before battle.',
    fact: "The Battle of Dan-no-Ura was fought on the sea — the Taira clan's final stand on the waters of the Shimonoseki Strait, where the tide itself turned against them.",
  },
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right',
}

export default function IceSlideGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const base = CONFIGS[configId] ?? CONFIGS['enkidu-ice']
  const story = storyText(params)
  const cfg = { title: story.title ?? base.title, question: story.intro ?? base.question, fact: story.fact ?? base.fact }
  const tier = TIERS[difficulty]
  const yard = useMemo(() => yardFor(configId, difficulty, seed ?? 0), [configId, difficulty, seed])
  const { grid, sr, sc } = useMemo(() => parseGrid(yard), [yard])
  const par = useMemo(() => analyse(yard).optimal, [yard])

  // One run: where the slider is, every cell it has crossed, and how it ended.
  interface Run { pos: [number, number]; trail: Set<string>; slides: number; won: boolean; broke: string | null }
  const fresh = useCallback((): Run => ({ pos: [sr, sc], trail: new Set([`${sr},${sc}`]), slides: 0, won: false, broke: null }), [sr, sc])
  const [run, setRun] = useState<Run>(fresh)
  const { pos, trail, slides, won, broke } = run
  const over = won || broke !== null
  const timer = useGameTimer({ seconds: timeLimitFor(difficulty), running: !over, onExpire: () => onLose('out of time') })

  // A pure update: React may call it twice in development.
  const move = useCallback((dir: Dir) => {
    setRun(cur => {
      if (cur.won || cur.broke) return cur
      const [r, c] = cur.pos
      const s = slide(grid, r, c, dir)
      if (s.r === r && s.c === c) return cur
      return {
        pos: [s.r, s.c],
        trail: new Set([...cur.trail, ...s.path.map(([pr, pc]) => `${pr},${pc}`)]),
        slides: cur.slides + 1,
        won: !s.fell && grid[s.r][s.c] === 'E',
        broke: s.fell ? `${s.r},${s.c}` : null,
      }
    })
  }, [grid])

  useEffect(() => {
    if (won) { const t = setTimeout(onWin, 700); return () => clearTimeout(t) }
    if (broke) { const t = setTimeout(() => onLose('fell through thin ice'), 900); return () => clearTimeout(t) }
  }, [won, broke, onWin, onLose])

  const restart = () => setRun(cur => (cur.won || cur.broke ? cur : { ...fresh(), slides: cur.slides }))

  useEffect(() => {
    const h = (e: KeyboardEvent) => { const d = KEYS[e.key]; if (d) { e.preventDefault(); move(d) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [move])

  // Swipe on the board slides in that direction.
  const touch = useRef<[number, number] | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { touch.current = [e.touches[0].clientX, e.touches[0].clientY] }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return
    const dx = e.changedTouches[0].clientX - touch.current[0], dy = e.changedTouches[0].clientY - touch.current[1]
    touch.current = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
  }

  const [row, col] = pos
  const cols = grid[0].length
  const cellPx = Math.max(16, Math.min(30, Math.floor(344 / cols)))

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3">
      {timer.active && <div className="w-full"><TimerBar remaining={timer.remaining} total={timer.total} /></div>}
      <p className="text-cyan-400/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
      <p className="text-ink text-sm font-medium leading-snug">{cfg.question}</p>

      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>Slides <span className="text-ink font-bold">{slides}</span> · fewest {par}</span>
        <button onClick={restart} disabled={over} className="px-2 py-1 rounded bg-panel text-ink disabled:opacity-40">↺ Back to start</button>
      </div>

      <div className="flex justify-center touch-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="inline-grid border border-line rounded-lg overflow-hidden"
          style={{ gridTemplateColumns: `repeat(${cols}, ${cellPx}px)` }}>
          {grid.map((rowArr, r) => rowArr.map((cell, c) => {
            const k = `${r},${c}`
            const isPlayer = r === row && c === col
            const isWall = cell === '#'
            const isBlock = cell === 'B'
            const isThin = cell === 'O'
            const isExit = cell === 'E'
            const isTrail = trail.has(k) && !isPlayer && !isWall && !isThin

            let bg = 'bg-sky-950/60'
            if (isWall) bg = 'bg-line'
            if (isBlock) bg = 'bg-line-2'
            if (isThin) bg = broke === k ? 'bg-sky-950' : 'bg-sky-200/20'
            if (isExit) bg = won ? 'bg-emerald-500/50' : 'bg-emerald-900/30'
            if (isTrail) bg = 'bg-cyan-900/40'

            return (
              <div key={k}
                style={{ width: cellPx, height: cellPx }}
                className={`${bg} flex items-center justify-center`}>
                {isBlock && <div className="w-2/3 h-2/3 rounded bg-slate-400/70" />}
                {isThin && <span className={`text-[9px] font-bold ${broke === k ? 'text-sky-300' : 'text-sky-300/70'}`}>{broke === k ? '◌' : '✕'}</span>}
                {isExit && <div className={`text-[9px] font-bold ${won ? 'text-emerald-300' : 'text-emerald-600'}`}>▣</div>}
                {isTrail && <div className="w-1 h-1 rounded-full bg-cyan-500/50" />}
                {isPlayer && (
                  <div className={`w-3/5 h-3/5 rounded-full shadow-[0_0_6px_rgba(251,191,36,0.9)] ${won ? 'bg-emerald-400' : broke ? 'bg-sky-700' : 'bg-accent'}`} />
                )}
              </div>
            )
          }))}
        </div>
      </div>

      {/* D-pad */}
      <div className="flex flex-col items-center gap-1">
        <button onClick={() => move('up')} className="w-10 h-10 rounded-lg bg-panel active:bg-cyan-500/30 flex items-center justify-center text-ink">▲</button>
        <div className="flex gap-1">
          <button onClick={() => move('left')} className="w-10 h-10 rounded-lg bg-panel active:bg-cyan-500/30 flex items-center justify-center text-ink">◀</button>
          <div className="w-10 h-10 rounded-lg bg-panel flex items-center justify-center text-muted/80 text-[9px]">❄</div>
          <button onClick={() => move('right')} className="w-10 h-10 rounded-lg bg-panel active:bg-cyan-500/30 flex items-center justify-center text-ink">▶</button>
        </div>
        <button onClick={() => move('down')} className="w-10 h-10 rounded-lg bg-panel active:bg-cyan-500/30 flex items-center justify-center text-ink">▼</button>
      </div>

      <p className="text-muted text-[10px] text-center">
        {won
          ? <span className="text-emerald-400 font-bold">Exit reached!</span>
          : broke
            ? <span className="text-sky-300 font-bold">The thin ice gave way.</span>
            : <>Slide — you stop only at a wall ■ or stone ▪, and only a stop on ▣ wins.{tier.holes > 0 && ' Thin ice ✕ breaks under you.'}</>}
      </p>

      {won && (
        <div className="p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 text-xs leading-relaxed">
          <span className="font-bold mr-1">✓</span>{cfg.fact}
        </div>
      )}
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
