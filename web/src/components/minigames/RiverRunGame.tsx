import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// River Run: take a canoe down a river full of rocks and river beasts.
// Every stroke carries you one stretch downstream; steer left, right or
// straight on.  Only a few stretches ahead are visible through the spray,
// and from the third tier the current pushes you on if you hesitate.
// A clear channel always exists; each bump costs one of your lives.

export const LANES = 5

interface RiverConfig {
  title: string
  intro: string
  boat: string
  hazards: string[]
  goal: string
  fact: string
}

export const CONFIGS: Record<string, RiverConfig> = {
  'kwanza-river': {
    title: 'Down the Kwanza',
    intro: "Portuguese columns hold the riverbanks. Run Nzinga's war canoe down the Kwanza to the Kindonga islands, dodging rocks, hippos and crocodiles.",
    boat: '🛶',
    hazards: ['🪨', '🦛', '🐊'],
    goal: '🏝️',
    fact: 'The Kindonga islands in the middle of the Kwanza were the old refuge of the Ndongo kings. Nzinga fell back to them in 1626 and, when the Portuguese took the islands, slipped away across the river with her followers to fight on from Matamba.',
  },
  'colorado-powell': {
    title: 'Into the Great Unknown',
    intro: 'Read the rapids of the Colorado ahead of your wooden boat. Steer between the boulders and reach the end of the canyon.',
    boat: '🚣',
    hazards: ['🪨', '🪵'],
    goal: '🏕️',
    fact: 'In 1869 the one-armed Civil War veteran John Wesley Powell led nine men in four wooden boats down the Green and Colorado rivers, the first recorded passage through the Grand Canyon. Three men left before the end, convinced the rapids ahead would kill them.',
  },
  'yangtze-gorges': {
    title: 'The Three Gorges',
    intro: 'Junks shoot the Three Gorges on the flood. Steer past the reefs and whirlpools to reach the calm water at Yichang.',
    boat: '⛵',
    hazards: ['🪨', '🌀'],
    goal: '🏯',
    fact: "For two thousand years the Three Gorges were the Yangtze's most feared stretch. Trackers hauled junks upstream with bamboo ropes cut into the cliffs, and the poet Li Bai wrote of racing the whole thousand li downriver to Jiangling in a single day.",
  },
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export interface RiverTier { length: number; view: number; density: number; lives: number; currentMs: number }

export const tierFor = (d: Difficulty): RiverTier => scale(d, [
  { length: 18, view: 6, density: 0.22, lives: 3, currentMs: 0 },
  { length: 24, view: 5, density: 0.28, lives: 3, currentMs: 0 },
  { length: 28, view: 4, density: 0.32, lives: 2, currentMs: 1500 },
  { length: 32, view: 4, density: 0.36, lives: 2, currentMs: 1100 },
])

/** Hazard index per lane per stretch (-1 for open water), and the clear channel carved through it. */
export interface River { rows: number[][]; channel: number[] }

export function makeRiver(seed: number, tier: RiverTier, hazardKinds: number): River {
  const rng = mulberry32(seed)
  const channel: number[] = [Math.floor(LANES / 2)]
  for (let r = 1; r < tier.length; r++) {
    const prev = channel[r - 1]
    const move = Math.floor(rng() * 3) - 1
    channel.push(Math.max(0, Math.min(LANES - 1, prev + move)))
  }
  const rows = channel.map((safe, r) =>
    Array.from({ length: LANES }, (_, lane) => {
      // The start, the landing and the channel itself are always open water.
      if (r === 0 || r === tier.length - 1 || lane === safe) return -1
      return rng() < tier.density ? Math.floor(rng() * hazardKinds) : -1
    }))
  return { rows, channel }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function RiverRunGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'kwanza-river')
  const tier = tierFor(difficulty)
  const river = useMemo(() => makeRiver(seed, tierFor(difficulty), cfg.hazards.length), [seed, difficulty, cfg.hazards.length])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })

  const [pos, setPos] = useState({ row: 0, lane: river.channel[0] })
  const [lives, setLives] = useState(tier.lives)
  const [bumped, setBumped] = useState<Set<string>>(() => new Set())
  const [flash, setFlash] = useState(false)

  const stroke = useCallback((dx: number) => {
    if (settled) return
    const row = pos.row + 1
    const lane = Math.max(0, Math.min(LANES - 1, pos.lane + dx))
    setPos({ row, lane })
    const key = `${row}:${lane}`
    if (river.rows[row][lane] >= 0 && !bumped.has(key)) {
      setBumped(new Set(bumped).add(key))
      setFlash(true)
      setTimeout(() => setFlash(false), 300)
      const l = lives - 1
      setLives(l)
      if (l <= 0) { lose('the canoe was wrecked'); return }
    }
    if (row >= tier.length - 1) win()
  }, [settled, pos, river, bumped, lives, tier.length, win, lose])

  // The current carries you straight on if you wait too long.
  useEffect(() => {
    if (!tier.currentMs || settled) return
    const t = setTimeout(() => stroke(0), tier.currentMs)
    return () => clearTimeout(t)
  }, [tier.currentMs, settled, stroke])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dx = { ArrowLeft: -1, ArrowUp: 0, ArrowRight: 1 }[e.key]
      if (dx === undefined) return
      e.preventDefault()
      stroke(dx)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stroke])

  // Visible stretches, nearest at the bottom.
  const visible = Array.from({ length: tier.view + 1 }, (_, k) => pos.row + tier.view - k)

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex gap-0.5 justify-end">
            {Array.from({ length: tier.lives }, (_, i) => (
              <span key={i} className={`text-sm ${i < lives ? '' : 'opacity-25'}`}>❤️</span>
            ))}
          </div>
          <p className="text-[10px] text-muted mt-0.5">
            Stretch <b className="text-ink">{pos.row}</b> / {tier.length - 1}
          </p>
        </div>
      </div>

      <div className={`self-center rounded-lg overflow-hidden border border-line flex transition-colors ${flash ? 'bg-red-300' : 'bg-emerald-700/40'}`}>
        <div className="w-4 bg-emerald-600/50" />
        <div className="flex flex-col gap-[2px] py-[2px]">
          {visible.map(row => (
            <div key={row} className="flex gap-[2px]">
              {Array.from({ length: LANES }, (_, lane) => {
                const beyond = row >= tier.length
                const hazard = beyond ? -1 : river.rows[row][lane]
                const here = row === pos.row && lane === pos.lane
                const content = here ? cfg.boat
                  : row === tier.length - 1 ? cfg.goal
                  : hazard >= 0 && !bumped.has(`${row}:${lane}`) ? cfg.hazards[hazard] : ''
                return (
                  <div key={lane}
                    className={`w-10 h-9 flex items-center justify-center text-xl leading-none
                      ${beyond ? 'bg-emerald-600/40' : row === tier.length - 1 ? 'bg-amber-100' : 'bg-sky-400/70'}`}>
                    {content}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
        <div className="w-4 bg-emerald-600/50" />
      </div>

      <div className="flex justify-center gap-2">
        {([[-1, '↖ Left'], [0, '↑ Straight'], [1, 'Right ↗']] as const).map(([dx, label]) => (
          <button key={dx} onClick={() => stroke(dx)} disabled={settled}
            className="px-4 py-2.5 rounded-xl bg-line hover:bg-line-2 text-ink-2 font-bold text-sm active:scale-95 transition-all disabled:opacity-40">
            {label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted/80 text-center">
        Each stroke moves one stretch downstream. A clear channel always runs to {cfg.goal}.
        {tier.currentMs ? ' The current pushes you straight on if you wait.' : ''}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Safe ashore!" loseTitle="Wrecked on the river" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
