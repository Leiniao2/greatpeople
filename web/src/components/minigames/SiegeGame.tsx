import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Siege: defend the keep.  Spend a budget on walls (block a cell) and towers
// (shoot nearby attackers) before each wave, then watch the attackers path
// around your walls toward the keep.  Lose when the keep's hit points reach
// zero; win when every wave is beaten.
//
// Difficulty scales the number of waves, attacker toughness and the budget.

type Cell = 'floor' | 'wall' | 'tower' | 'keep' | 'spawn'

interface SiegeConfig {
  title: string
  intro: string
  rows: number
  cols: number
  keep: [number, number]
  spawns: [number, number][]
  /** Budget at difficulty 1 per wave; wall costs 1, tower costs 3. */
  budget: number
  keepHp: number
  fact: string
}

const CONFIGS: Record<string, SiegeConfig> = {
  'great-wall': {
    title: 'The Northern Frontier',
    intro: 'Qin Shi Huang joins the old border walls into one. Raise walls and watchtowers so the raiders never reach the garrison.',
    rows: 9, cols: 11, keep: [4, 9], spawns: [[0, 0], [8, 0], [4, 0]],
    budget: 12, keepHp: 5,
    fact: 'After unifying China in 221 BCE, Qin Shi Huang had General Meng Tian link the walls of the former states into a single frontier. The brick-and-stone Great Wall tourists see today is mostly Ming work from eighteen centuries later.',
  },
  'constantinople-1453': {
    title: 'The Theodosian Walls',
    intro: 'For a thousand years the triple walls of Constantinople held. Place your defences against the Ottoman assault.',
    rows: 9, cols: 11, keep: [4, 9], spawns: [[1, 0], [7, 0]],
    budget: 11, keepHp: 4,
    fact: "Mehmed II's siege in 1453 brought the largest cannon yet cast, a 27-foot bombard that took three hours to reload. After 53 days the walls were breached near the Gate of St Romanus, and the Byzantine Empire ended.",
  },
  'vauban-star': {
    title: 'The Star Fort',
    intro: "Vauban's bastions leave no dead ground: every approach is covered by fire from two sides. Build so that attackers are always under a tower.",
    rows: 9, cols: 11, keep: [4, 5], spawns: [[0, 0], [0, 10], [8, 0], [8, 10]],
    budget: 14, keepHp: 4,
    fact: 'Sébastien Le Prestre de Vauban fortified some 160 places for Louis XIV and conducted around fifty sieges. His angled bastions, built to deflect cannon fire and sweep approaches with crossfire, defined European fortification until rifled artillery made them obsolete.',
  },
}

const WALL_COST = 1, TOWER_COST = 3, TOWER_RANGE = 2

interface Attacker { id: number; r: number; c: number; hp: number }

function bfsPath(grid: Cell[][], from: [number, number], to: [number, number]): [number, number][] | null {
  const rows = grid.length, cols = grid[0].length
  const prev = new Map<string, string | null>()
  const k = (r: number, c: number) => `${r},${c}`
  const queue: [number, number][] = [from]
  prev.set(k(...from), null)
  while (queue.length) {
    const [r, c] = queue.shift()!
    if (r === to[0] && c === to[1]) {
      const path: [number, number][] = []
      let cur: string | null = k(r, c)
      while (cur) { const [pr, pc] = cur.split(',').map(Number); path.unshift([pr, pc]); cur = prev.get(cur) ?? null }
      return path
    }
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nr = r + dr, nc = c + dc
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      const cell = grid[nr][nc]
      if (cell === 'wall' || cell === 'tower') continue
      if (!prev.has(k(nr, nc))) { prev.set(k(nr, nc), k(r, c)); queue.push([nr, nc]) }
    }
  }
  return null
}

export default function SiegeGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'great-wall')
  const waves = scale(difficulty, [2, 3, 4, 5])
  const attackerHp = scale(difficulty, [2, 2, 3, 3])
  const perWave = scale(difficulty, [4, 5, 6, 8])
  const budgetPerWave = Math.round(cfg.budget * scale(difficulty, [1, 0.9, 0.8, 0.7]))

  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1000 })
  const rng = useRef(mulberry32(seed))

  const initialGrid = useMemo(() => {
    const g: Cell[][] = Array.from({ length: cfg.rows }, () => Array(cfg.cols).fill('floor'))
    g[cfg.keep[0]][cfg.keep[1]] = 'keep'
    for (const [r, c] of cfg.spawns) g[r][c] = 'spawn'
    return g
  }, [cfg])

  const [grid, setGrid] = useState<Cell[][]>(initialGrid)
  const [tool, setTool] = useState<'wall' | 'tower'>('wall')
  const [budget, setBudget] = useState(budgetPerWave)
  const [wave, setWave] = useState(0)
  const [phase, setPhase] = useState<'build' | 'battle'>('build')
  const [attackers, setAttackers] = useState<Attacker[]>([])
  const [keepHp, setKeepHp] = useState(cfg.keepHp)
  const [message, setMessage] = useState<string | null>(null)
  const live = useRef({ attackers, keepHp, grid })
  useEffect(() => { live.current = { attackers, keepHp, grid } }, [attackers, keepHp, grid])

  const place = (r: number, c: number) => {
    if (phase !== 'build' || settled) return
    const cell = grid[r][c]
    const next = grid.map(row => [...row])
    if (cell === 'wall' || cell === 'tower') {
      next[r][c] = 'floor'
      setGrid(next)
      setBudget(b => b + (cell === 'wall' ? WALL_COST : TOWER_COST))
      return
    }
    if (cell !== 'floor') return
    const cost = tool === 'wall' ? WALL_COST : TOWER_COST
    if (budget < cost) { setMessage('Not enough budget'); return }
    next[r][c] = tool
    // Every spawn must still have a path to the keep.
    if (cfg.spawns.some(s => !bfsPath(next, s, cfg.keep))) { setMessage("You can't wall the keep off completely"); return }
    setMessage(null)
    setGrid(next)
    setBudget(b => b - cost)
  }

  const launch = () => {
    if (phase !== 'build' || settled) return
    const spawned: Attacker[] = []
    for (let i = 0; i < perWave; i++) {
      const s = cfg.spawns[Math.floor(rng.current() * cfg.spawns.length)]
      spawned.push({ id: wave * 100 + i, r: s[0], c: s[1], hp: attackerHp + (i % 2 === 0 ? 0 : 1) })
    }
    setAttackers(spawned)
    setPhase('battle')
  }

  // Battle tick: towers shoot, then attackers advance one step along their path.
  const tick = useCallback(() => {
    const { attackers: cur, keepHp: hp, grid: g } = live.current
    const towers: [number, number][] = []
    g.forEach((row, r) => row.forEach((cell, c) => { if (cell === 'tower') towers.push([r, c]) }))

    let remaining = cur.map(a => ({ ...a }))
    for (const [tr, tc] of towers) {
      // Each tower hits the closest attacker in range once per tick.
      const target = remaining.filter(a => a.hp > 0 && Math.abs(a.r - tr) + Math.abs(a.c - tc) <= TOWER_RANGE)
        .sort((a, b) => (Math.abs(a.r - tr) + Math.abs(a.c - tc)) - (Math.abs(b.r - tr) + Math.abs(b.c - tc)))[0]
      if (target) target.hp -= 1
    }
    remaining = remaining.filter(a => a.hp > 0)

    let damage = 0
    remaining = remaining.flatMap(a => {
      const path = bfsPath(g, [a.r, a.c], cfg.keep)
      if (!path || path.length < 2) return [a]
      const [nr, nc] = path[1]
      if (nr === cfg.keep[0] && nc === cfg.keep[1]) { damage++; return [] }
      return [{ ...a, r: nr, c: nc }]
    })

    const nextHp = hp - damage
    setAttackers(remaining)
    setKeepHp(nextHp)
    if (nextHp <= 0) { lose('the keep has fallen'); return }
    if (remaining.length === 0) {
      const nextWave = wave + 1
      if (nextWave >= waves) { win(); return }
      setWave(nextWave)
      setPhase('build')
      setBudget(b => b + budgetPerWave)
      setMessage(`Wave ${nextWave} repelled — fortify for the next`)
    }
  }, [cfg, wave, waves, budgetPerWave, win, lose])

  useEffect(() => {
    if (phase !== 'battle' || settled) return
    const iv = setInterval(tick, 550)
    return () => clearInterval(iv)
  }, [phase, settled, tick])

  const cellPx = 26
  const attackerAt = (r: number, c: number) => attackers.filter(a => a.r === r && a.c === c)

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div>
        <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
        <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>Wave <b className="text-ink">{Math.min(wave + 1, waves)}</b> / {waves}</span>
        <span>Keep <b className={keepHp <= 1 ? 'text-red-600' : 'text-ink'}>{'♥'.repeat(Math.max(0, keepHp))}</b></span>
        <span>Budget <b className="text-accent">{budget}</b></span>
      </div>

      <div className="flex justify-center">
        <div className="grid border border-line rounded-lg overflow-hidden bg-panel"
          style={{ gridTemplateColumns: `repeat(${cfg.cols}, ${cellPx}px)` }}>
          {grid.map((row, r) => row.map((cell, c) => {
            const here = attackerAt(r, c)
            const bg = cell === 'wall' ? 'bg-ink-2' : cell === 'tower' ? 'bg-accent/80' : cell === 'keep' ? 'bg-yellow-500/70' : cell === 'spawn' ? 'bg-red-500/30' : (r + c) % 2 ? 'bg-paper-2' : 'bg-panel'
            return (
              <button key={`${r},${c}`} onClick={() => place(r, c)}
                className={`flex items-center justify-center border border-line/40 ${bg} ${phase === 'build' && (cell === 'floor' || cell === 'wall' || cell === 'tower') ? 'hover:brightness-95' : ''}`}
                style={{ width: cellPx, height: cellPx }}>
                {cell === 'keep' && <span className="text-sm">🏰</span>}
                {cell === 'tower' && <span className="text-[13px]">🗼</span>}
                {cell === 'spawn' && here.length === 0 && <span className="text-[10px] text-red-700">⚑</span>}
                {here.length > 0 && <span className="text-[13px]">{here.length > 1 ? `⚔${here.length}` : '⚔'}</span>}
              </button>
            )
          }))}
        </div>
      </div>

      {phase === 'build' && !settled && (
        <div className="flex gap-2">
          <button onClick={() => setTool('wall')}
            className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${tool === 'wall' ? 'bg-ink-2 text-paper border-ink-2' : 'bg-panel border-line text-ink-2'}`}>
            Wall · {WALL_COST}
          </button>
          <button onClick={() => setTool('tower')}
            className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all ${tool === 'tower' ? 'bg-accent text-accent-fg border-accent' : 'bg-panel border-line text-ink-2'}`}>
            Tower · {TOWER_COST} (range {TOWER_RANGE})
          </button>
          <button onClick={launch}
            className="flex-1 py-2 rounded-xl bg-emerald-700 text-paper text-xs font-bold hover:bg-emerald-800 transition-all">
            Sound the alarm ▶
          </button>
        </div>
      )}
      {phase === 'battle' && !settled && <p className="text-center text-[10px] text-muted animate-pulse">The assault is under way…</p>}
      {message && !settled && <p className="text-[10px] text-amber-800 text-center">{message}</p>}
      <p className="text-[10px] text-muted/80 text-center">Tap a cell to build; tap again to remove. Attackers always find a way round — make it a long one under tower fire.</p>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The siege is broken!" loseTitle="The keep has fallen" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
