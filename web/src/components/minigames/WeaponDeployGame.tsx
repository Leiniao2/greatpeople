import { useState, useEffect, useRef, useCallback } from 'react'
import type { MinigameProps } from '@/games/types'

type WeaponType = 'archer' | 'catapult' | 'cannon'
type Phase = 'deploy' | 'battle' | 'won' | 'lost'

interface WeaponSpec {
  emoji: string; label: string; range: number; damage: number; fireRate: number; cost: number; color: string
}
export interface Enemy {
  id: number; hp: number; maxHp: number; speed: number; pos: number; alive: boolean; reached: boolean
}
interface DeployConfig {
  title: string; cols: number; rows: number; pathRow: number; budget: number
  weapons: WeaponType[]
  waves: { count: number; hp: number; speed: number }[]
  fact: string
}

export const SPECS: Record<WeaponType, WeaponSpec> = {
  archer:   { emoji: '🏹', label: 'Archer',   range: 2, damage: 18, fireRate: 2, cost: 20, color: 'text-green-400'  },
  catapult: { emoji: '⚙️', label: 'Catapult', range: 3, damage: 45, fireRate: 4, cost: 35, color: 'text-accent'  },
  cannon:   { emoji: '💣', label: 'Cannon',   range: 4, damage: 85, fireRate: 7, cost: 60, color: 'text-red-400'    },
}

/** Cells an enemy of speed 1 advances per tick; a 7-column path takes ~9 s to cross. */
export const CELLS_PER_TICK = 0.25
/** Gap between consecutive enemies on the approach, in cells. */
const SPACING = 2.5

export const CONFIGS: Record<string, DeployConfig> = {
  'sun-tzu-ambush': {
    title: 'Art of War — Sun Tzu\'s Ambush',
    cols: 7, rows: 4, pathRow: 2, budget: 100,
    weapons: ['archer', 'catapult'],
    waves: [{ count: 5, hp: 55, speed: 1 }, { count: 4, hp: 75, speed: 2 }],
    fact: '"All warfare is based on deception." Sun Tzu taught that the best victories are won before battle begins — through intelligence, terrain advantage, and positioning that forces the enemy into a trap.',
  },
  'macedonian-phalanx': {
    title: 'Battle of Gaugamela — Alexander the Great, 331 BCE',
    cols: 8, rows: 4, pathRow: 2, budget: 120,
    weapons: ['archer', 'catapult'],
    waves: [{ count: 4, hp: 65, speed: 1 }, { count: 5, hp: 90, speed: 1 }],
    fact: 'At Gaugamela, Alexander defeated a Persian army five times larger by concentrating force on a weakened point and striking before the Persians could encircle him. He deployed obliquely to lure their cavalry wide.',
  },
  'waterloo-artillery': {
    title: 'Battle of Waterloo — Napoleon, 1815',
    cols: 8, rows: 4, pathRow: 1, budget: 160,
    weapons: ['archer', 'catapult', 'cannon'],
    waves: [{ count: 4, hp: 70, speed: 1 }, { count: 5, hp: 100, speed: 1 }, { count: 4, hp: 130, speed: 2 }],
    fact: 'Napoleon\'s Grand Battery of 246 guns was meant to shatter Wellington\'s line before the infantry advanced. But muddy ground slowed positioning, and by the time his artillery fired, the Prussians had arrived.',
  },
  'mongol-siege': {
    title: 'Mongol Siege Tactics — Genghis Khan',
    cols: 7, rows: 5, pathRow: 2, budget: 140,
    weapons: ['archer', 'catapult', 'cannon'],
    waves: [{ count: 6, hp: 60, speed: 1 }, { count: 5, hp: 80, speed: 1 }, { count: 3, hp: 150, speed: 2 }],
    fact: 'The Mongols conquered cities far larger than their army by combining rapid cavalry raids, psychological terror, and siege engineering learned from Chinese and Persian experts they had previously defeated.',
  },
}

/** Line up every wave's enemies on the approach, one after another, SPACING cells apart. */
export function spawnEnemies(cfg: DeployConfig): Enemy[] {
  let id = 0
  const all: Enemy[] = []
  cfg.waves.forEach(w => {
    for (let i = 0; i < w.count; i++) {
      all.push({ id, hp: w.hp, maxHp: w.hp, speed: w.speed, pos: -(id * SPACING), alive: true, reached: false })
      id++
    }
  })
  return all
}

/** One battle step: enemies advance, each ready weapon hits the first enemy in range, leakers are marked. */
export function battleStep(cfg: DeployConfig, board: (WeaponType | null)[], enemies: Enemy[], step: number): { next: Enemy[]; flash: Set<number> } {
  const next = enemies.map(e => ({ ...e }))
  const flash = new Set<number>()
  const col = (idx: number) => idx % cfg.cols
  const row = (idx: number) => Math.floor(idx / cfg.cols)

  // Move enemies
  next.forEach(e => { if (e.alive && !e.reached) e.pos += e.speed * CELLS_PER_TICK })

  // Weapons fire
  for (let wi = 0; wi < board.length; wi++) {
    const wt = board[wi]
    if (!wt) continue
    const spec = SPECS[wt]
    if (step % spec.fireRate !== 0) continue
    const wCol = col(wi), wRow = row(wi)
    for (const e of next) {
      if (!e.alive || e.reached) continue
      const eCol = Math.floor(e.pos)
      if (eCol < 0 || eCol >= cfg.cols) continue
      const dist = Math.abs(wCol - eCol) + Math.abs(wRow - cfg.pathRow)
      if (dist <= spec.range) {
        e.hp -= spec.damage
        flash.add(wi)
        if (e.hp <= 0) { e.hp = 0; e.alive = false }
        break
      }
    }
  }

  // Enemies reach end
  next.forEach(e => {
    if (e.alive && e.pos >= cfg.cols) { e.reached = true; e.alive = false }
  })
  return { next, flash }
}

export default function WeaponDeployGame({ configId, onWin, onLose }: MinigameProps) {
  const cfg = CONFIGS[configId] ?? CONFIGS['sun-tzu-ambush']
  const total = cfg.cols * cfg.rows

  const [board, setBoard] = useState<(WeaponType | null)[]>(() => Array(total).fill(null))
  const [sel, setSel] = useState<WeaponType>('archer')
  const [budget, setBudget] = useState(cfg.budget)
  const [phase, setPhase] = useState<Phase>('deploy')
  const [enemies, setEnemies] = useState<Enemy[]>([])
  const [flashCells, setFlashCells] = useState<Set<number>>(new Set())

  const boardRef = useRef<(WeaponType | null)[]>(Array(total).fill(null))
  const enemiesRef = useRef<Enemy[]>([])
  const stepRef = useRef(0)

  boardRef.current = board

  const col = (idx: number) => idx % cfg.cols
  const row = (idx: number) => Math.floor(idx / cfg.cols)

  const clickCell = (idx: number) => {
    if (phase !== 'deploy') return
    if (row(idx) === cfg.pathRow) return
    const cur = board[idx]
    if (cur) {
      setBoard(b => { const n = [...b]; n[idx] = null; return n })
      setBudget(b => b + SPECS[cur].cost)
    } else {
      const spec = SPECS[sel]
      if (budget < spec.cost) return
      setBoard(b => { const n = [...b]; n[idx] = sel; return n })
      setBudget(b => b - spec.cost)
    }
  }

  const startBattle = useCallback(() => {
    const all = spawnEnemies(cfg)
    enemiesRef.current = all
    setEnemies([...all])
    stepRef.current = 0
    setPhase('battle')
  }, [cfg])

  useEffect(() => {
    if (phase !== 'battle') return
    const interval = setInterval(() => {
      stepRef.current++
      const { next, flash: newFlash } = battleStep(cfg, boardRef.current, enemiesRef.current, stepRef.current)

      enemiesRef.current = next
      setEnemies([...next])
      setFlashCells(newFlash)
      if (newFlash.size) setTimeout(() => setFlashCells(new Set()), 180)

      const anyAlive = next.some(e => e.alive)
      if (!anyAlive) {
        clearInterval(interval)
        const anyReached = next.some(e => e.reached)
        if (!anyReached) { setPhase('won'); setTimeout(onWin, 700) }
        else setPhase('lost')
      }
    }, 320)
    return () => clearInterval(interval)
  }, [phase, cfg, onWin]) // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    const b = Array(total).fill(null)
    setBoard(b); boardRef.current = b
    setBudget(cfg.budget); setPhase('deploy')
    setEnemies([]); enemiesRef.current = []
    stepRef.current = 0
  }

  const placed = board.filter(Boolean).length

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <p className="text-accent font-bold text-sm">{cfg.title}</p>
        <p className="text-muted text-xs">{phase === 'deploy' ? 'Place weapons, then launch the battle!' : phase === 'battle' ? 'Battle in progress…' : phase === 'won' ? '⚔️ Victory!' : '💀 Defeated'}</p>
      </div>

      {/* Weapon selector */}
      {phase === 'deploy' && (
        <div className="flex gap-1.5">
          {cfg.weapons.map(wt => {
            const s = SPECS[wt]
            return (
              <button key={wt} onClick={() => setSel(wt)}
                className={[
                  'flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl border text-xs transition-all',
                  sel === wt ? 'border-accent bg-accent/10' : 'border-line bg-panel hover:border-line-2',
                ].join(' ')}>
                <span className="text-lg">{s.emoji}</span>
                <span className={s.color + ' font-bold text-[11px]'}>{s.label}</span>
                <span className="text-muted text-[10px]">{s.cost}G · Rng {s.range}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Budget */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted">Budget:</span>
        <div className="flex-1 h-1.5 bg-panel rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(budget / cfg.budget) * 100}%` }} />
        </div>
        <span className="text-accent font-mono font-bold">{budget}G</span>
      </div>

      {/* Grid */}
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cfg.cols}, 1fr)` }}>
        {Array.from({ length: cfg.rows * cfg.cols }, (_, idx) => {
          const isPath = row(idx) === cfg.pathRow
          const wt = board[idx]
          const eHere = isPath ? enemies.find(e => e.alive && Math.floor(e.pos) === col(idx)) : null
          const isFlash = flashCells.has(idx)
          return (
            <button key={idx} onClick={() => clickCell(idx)}
              className={[
                'aspect-square rounded flex items-center justify-center text-sm transition-all duration-150',
                isPath
                  ? 'bg-stone-800/50 border border-stone-600/30 cursor-default'
                  : wt
                  ? 'bg-line border border-line-2'
                  : phase === 'deploy'
                  ? 'bg-panel-2 border border-line hover:border-accent/30'
                  : 'bg-panel-2 border border-line cursor-default',
                isFlash ? 'border-accent bg-accent/25' : '',
              ].join(' ')}
            >
              {eHere ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-0.5 p-0.5">
                  <span className="text-[11px]">⚔️</span>
                  <div className="w-full h-0.5 bg-panel rounded-full">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${(eHere.hp / eHere.maxHp) * 100}%` }} />
                  </div>
                </div>
              ) : isPath ? (
                <span className="text-stone-600 text-[9px]">─</span>
              ) : wt ? (
                <span className="text-base select-none">{SPECS[wt].emoji}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* Controls */}
      {phase === 'deploy' && (
        <button onClick={startBattle} disabled={placed === 0}
          className="w-full py-2.5 bg-red-500/20 border border-red-500/40 text-red-300 text-sm font-bold rounded-xl hover:bg-red-500/30 transition-all disabled:opacity-40">
          ⚔️ Launch Battle!
        </button>
      )}

      {phase === 'won' && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
          <p className="text-emerald-400 font-bold text-sm">All enemies defeated — Victory!</p>
          <p className="text-muted text-xs mt-1.5 leading-relaxed">{cfg.fact}</p>
        </div>
      )}
      {phase === 'lost' && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
          <p className="text-red-400 font-bold text-sm">Some enemies broke through the line!</p>
          <div className="flex gap-2 mt-2 justify-center">
            <button onClick={reset} className="px-4 py-1.5 bg-panel text-ink-2 text-xs rounded-lg hover:bg-panel-2 transition-all">
              Redeploy
            </button>
            <button onClick={() => onLose('defeated')} className="px-4 py-1.5 bg-line text-ink-2 text-xs rounded-lg hover:bg-line-2 transition-all">
              Continue →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
