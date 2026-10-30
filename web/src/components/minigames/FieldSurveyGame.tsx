import { useMemo, useState } from 'react'
import type { MinigameProps, Difficulty } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Field Survey: a few finds are hidden somewhere in a patch of country.
// Each square you search either turns one up or tells you how far away
// the nearest find is (in steps across the grid), so a handful of searches
// is enough to pin them down by deduction.  At the top tier the reading is
// only rough — close, near or far.

interface SurveyConfig {
  title: string
  intro: string
  find: string
  ground: string
  /** What an empty square reports, e.g. "nests" or "shards". */
  sign: string
  fact: string
}

export const CONFIGS: Record<string, SurveyConfig> = {
  'gombe-chimps': {
    title: 'Field Notes, Gombe',
    intro: 'Find the chimpanzees in the forest without disturbing them. Every empty spot you check shows how many steps away the nearest group is, judged from fresh nests and dropped fruit.',
    find: '🐒',
    ground: '🌿',
    sign: 'nests',
    fact: 'Goodall spent months before the chimps of Gombe let her come near. Her patience paid off in 1960, when she watched David Greybeard strip a twig and use it to fish termites from a mound — and science had to rethink what made humans unique.',
  },
  'kuyunjik-dig': {
    title: 'The Mound of Kuyunjik',
    intro: 'The library lies buried under the mound across the Tigris from Mosul. Each trench you dig shows how many steps away the nearest cache of tablets is, judged by the shards in the soil.',
    find: '📜',
    ground: '🟫',
    sign: 'shards',
    fact: "Austen Henry Layard's trenches at Kuyunjik reached the first rooms of tablets in 1849–51, and Hormuzd Rassam found Ashurbanipal's North Palace in 1853. Between them they shipped more than 30,000 clay tablets and fragments to the British Museum — among them the Epic of Gilgamesh, first read again by George Smith in 1872.",
  },
  'fossil-cliffs': {
    title: 'The Lyme Cliffs',
    intro: 'Winter storms have opened the cliffs. Search the shore for fossils; each empty spot shows how many steps away the nearest one lies, judged by the fragments washed out of the clay.',
    find: '🦴',
    ground: '🪨',
    sign: 'fragments',
    fact: 'Mary Anning combed the crumbling cliffs at Lyme Regis after every storm. At twelve she and her brother dug out the first ichthyosaur skeleton to be correctly identified, and in 1823 she found the first complete plesiosaur.',
  },
}

// ── Engine ─────────────────────────────────────────────────────────────────────

export interface SurveyTier { size: number; finds: number; searches: number; rough: boolean }

export const tierFor = (d: Difficulty): SurveyTier => scale(d, [
  { size: 6, finds: 2, searches: 15, rough: false },
  { size: 7, finds: 3, searches: 20, rough: false },
  { size: 7, finds: 3, searches: 18, rough: false },
  { size: 7, finds: 3, searches: 22, rough: true },
])

/** Searches the reference solver may need on an accepted board, leaving the rest as slack. */
export const SLACK = 3

const steps = (size: number, a: number, b: number) =>
  Math.abs((a % size) - (b % size)) + Math.abs(Math.floor(a / size) - Math.floor(b / size))

/** What a search reports: 0 means a find; otherwise steps to the nearest one (banded when rough). */
export function reading(size: number, finds: readonly number[], cell: number, rough: boolean): number {
  const d = Math.min(...finds.map(f => steps(size, f, cell)))
  if (!rough || d <= 1) return d
  return d <= 3 ? 2 : 3
}

export const roughLabel = (r: number) => (r === 1 ? 'close' : r === 2 ? 'near' : 'far')

function combinations(n: number, k: number): number[][] {
  const out: number[][] = [], cur: number[] = []
  const rec = (start: number) => {
    if (cur.length === k) { out.push([...cur]); return }
    for (let i = start; i < n; i++) { cur.push(i); rec(i + 1); cur.pop() }
  }
  rec(0)
  return out
}

/**
 * Reference player: keep every layout consistent with the readings so far and
 * search the square most layouts agree holds a find.  Returns the searches made.
 */
export function solve(tier: SurveyTier, finds: readonly number[]): number[] {
  const { size, rough } = tier
  let layouts = combinations(size * size, finds.length)
  const searched: number[] = []
  let found = 0
  while (found < finds.length && searched.length < size * size) {
    const votes = new Array<number>(size * size).fill(0)
    for (const l of layouts) for (const c of l) votes[c]++
    let best = -1
    for (let i = 0; i < size * size; i++) if (!searched.includes(i) && (best < 0 || votes[i] > votes[best])) best = i
    searched.push(best)
    const r = reading(size, finds, best, rough)
    layouts = layouts.filter(l => reading(size, l, best, rough) === r)
    if (r === 0) found++
  }
  return searched
}

/** Seeded hiding places the reference player finds with SLACK searches to spare. */
export function makeFinds(seed: number, difficulty: Difficulty): number[] {
  const tier = tierFor(difficulty)
  let fallback: number[] | null = null
  for (let attempt = 0; attempt < 100; attempt++) {
    const rng = mulberry32(seed + attempt * 7919)
    const finds: number[] = []
    while (finds.length < tier.finds) {
      const c = Math.floor(rng() * tier.size * tier.size)
      if (!finds.includes(c)) finds.push(c)
    }
    fallback ??= finds
    if (solve(tier, finds).length <= tier.searches - SLACK) return finds
  }
  return fallback!
}

// ── Component ──────────────────────────────────────────────────────────────────

const HEAT = ['', 'bg-orange-300', 'bg-amber-200', 'bg-yellow-100', 'bg-lime-100', 'bg-sky-100']

export default function FieldSurveyGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'gombe-chimps')
  const tier = tierFor(difficulty)
  const finds = useMemo(() => makeFinds(seed, difficulty), [seed, difficulty])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const [readings, setReadings] = useState<Map<number, number>>(() => new Map())

  const found = [...readings.values()].filter(r => r === 0).length
  const left = tier.searches - readings.size

  const search = (cell: number) => {
    if (settled || readings.has(cell)) return
    const r = reading(tier.size, finds, cell, tier.rough)
    const next = new Map(readings).set(cell, r)
    setReadings(next)
    const nowFound = found + (r === 0 ? 1 : 0)
    if (nowFound >= finds.length) win()
    else if (next.size >= tier.searches) lose('out of time in the field')
  }

  const label = (r: number) => (tier.rough ? roughLabel(r) : String(r))

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className="shrink-0 text-[10px] text-muted text-right">
          {cfg.find} <b className="text-ink">{found}</b> / {finds.length}<br />
          🔍 <b className={left <= 3 ? 'text-red-600' : 'text-ink'}>{left}</b> left
        </p>
      </div>

      <div className="self-center grid gap-[3px] p-1 rounded-lg bg-emerald-900/15 border border-line"
        style={{ gridTemplateColumns: `repeat(${tier.size}, minmax(0, 1fr))` }}>
        {Array.from({ length: tier.size * tier.size }, (_, i) => {
          const r = readings.get(i)
          const revealFind = r === 0 || (settled && finds.includes(i))
          return (
            <button key={i} onClick={() => search(i)} disabled={settled || r !== undefined}
              aria-label={`search ${i % tier.size + 1},${Math.floor(i / tier.size) + 1}`}
              className={`w-10 h-10 rounded-md flex flex-col items-center justify-center leading-none transition-colors
                ${revealFind ? 'bg-emerald-300' : r !== undefined ? HEAT[Math.min(r, HEAT.length - 1)] : 'bg-panel hover:bg-panel-2 active:scale-90'}`}>
              {revealFind
                ? <span className="text-xl">{cfg.find}</span>
                : r !== undefined
                  ? <span className="text-xs font-bold text-ink">{label(r)}</span>
                  : <span className="text-base opacity-60">{cfg.ground}</span>}
            </button>
          )
        })}
      </div>

      <p className="text-[10px] text-muted/80 text-center">
        {tier.rough
          ? `The ${cfg.sign} only say close (1 step), near (2–3) or far (4+). Steps go across and up/down, never diagonally.`
          : `Each number counts steps to the nearest ${cfg.find}, moving across and up/down — never diagonally.`}
      </p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="All found!" loseTitle="The light is gone" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
