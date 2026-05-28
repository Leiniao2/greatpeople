import { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface AnimalDef {
  emoji: string
  speed: number   // px/frame, positive = rightward spawn
  yBand: [number, number]  // random y range
  size: number    // font size px
  points: number
  count: number
}

interface HuntingConfig {
  title: string
  instruction: string
  animals: AnimalDef[]
  bullets: number
  targetScore: number
  fact: string
}

interface Animal {
  id: number
  emoji: string
  x: number
  y: number
  speed: number
  size: number
  points: number
  yBand: [number, number]
  alive: boolean
}

interface ShotEffect {
  x: number
  y: number
  born: number  // timestamp
}

// ── Configs ────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, HuntingConfig> = {
  'mongol-hunt': {
    title: 'The Great Nerge',
    instruction: "Genghis Khan's grand hunt trained the army. Use your limited arrows wisely.",
    animals: [
      { emoji: '🦊', speed: 2.5, yBand: [95, 110],  size: 28, points: 2, count: 4 },
      { emoji: '🐗', speed: 1.6, yBand: [115, 130], size: 34, points: 3, count: 3 },
      { emoji: '🐇', speed: 4.5, yBand: [100, 115], size: 22, points: 1, count: 5 },
    ],
    bullets: 10,
    targetScore: 12,
    fact: 'The Mongol nerge was a massive coordinated hunt where thousands of soldiers formed a vast encircling ring. It trained logistics, discipline, and coordination — the same skills that made the Mongol army nearly unstoppable in the field.',
  },
  'roman-venatio': {
    title: 'The Roman Venatio',
    instruction: 'Exotic animals brought from across the empire fill the arena. Hunt enough to satisfy the crowd.',
    animals: [
      { emoji: '🦁', speed: 2.0, yBand: [110, 128], size: 36, points: 4, count: 2 },
      { emoji: '🐆', speed: 3.5, yBand: [100, 118], size: 30, points: 3, count: 3 },
      { emoji: '🦌', speed: 2.8, yBand: [108, 122], size: 28, points: 2, count: 4 },
    ],
    bullets: 9,
    targetScore: 14,
    fact: "At the inaugural games of the Colosseum in 80 CE, the Emperor Titus staged 100 days of spectacle. Over 9,000 animals were killed. The venatio used hunters, trained beast-fighters called bestiarii, and sometimes condemned criminals.",
  },
  'african-safari': {
    title: 'The Royal Safari',
    instruction: "19th-century game hunting at its peak. Score enough before your shots run out.",
    animals: [
      { emoji: '🦓', speed: 3.2, yBand: [105, 120], size: 32, points: 2, count: 4 },
      { emoji: '🦏', speed: 1.2, yBand: [120, 135], size: 38, points: 5, count: 2 },
      { emoji: '🦒', speed: 2.0, yBand: [85, 105],  size: 44, points: 3, count: 3 },
    ],
    bullets: 8,
    targetScore: 14,
    fact: "Theodore Roosevelt's 1909 African safari killed or captured over 11,000 animals for the Smithsonian. It sparked a backlash that helped launch the modern conservation movement. By the 1960s, many African nations began replacing hunting with photographic safaris.",
  },
}

// ── Canvas dimensions ──────────────────────────────────────────────────────────

const W = 360
const H = 180
const GROUND_Y = 142
const HIT_RADIUS = 36
const SHOT_DURATION = 380

// ── Helpers ────────────────────────────────────────────────────────────────────

let idCounter = 0

function spawnAnimal(def: AnimalDef, fromRight = false): Animal {
  const dir = fromRight ? -1 : 1
  return {
    id: idCounter++,
    emoji: def.emoji,
    x: fromRight ? W + 20 : -20,
    y: def.yBand[0] + Math.random() * (def.yBand[1] - def.yBand[0]),
    speed: def.speed * dir,
    size: def.size,
    points: def.points,
    yBand: def.yBand,
    alive: true,
  }
}

function initAnimals(config: HuntingConfig): Animal[] {
  const list: Animal[] = []
  for (const def of config.animals) {
    for (let i = 0; i < def.count; i++) {
      const startX = 20 + Math.random() * (W - 40)
      const fromRight = i % 2 === 0
      const a = spawnAnimal(def, fromRight)
      a.x = startX  // spread them out initially
      list.push(a)
    }
  }
  return list
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function HuntingGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['mongol-hunt']

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animalsRef = useRef<Animal[]>(initAnimals(config))
  const shotRef = useRef<ShotEffect | null>(null)
  const rafRef = useRef<number>(0)
  const gameRef = useRef({ bullets: config.bullets, score: 0, done: false })

  const [display, setDisplay] = useState({ bullets: config.bullets, score: 0, won: false, lost: false })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const now = performance.now()

    // Background
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
    skyGrad.addColorStop(0, '#0f2744')
    skyGrad.addColorStop(1, '#1e5080')
    ctx.fillStyle = skyGrad
    ctx.fillRect(0, 0, W, GROUND_Y)

    // Ground
    const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H)
    groundGrad.addColorStop(0, '#3d6b1e')
    groundGrad.addColorStop(1, '#5a4020')
    ctx.fillStyle = groundGrad
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)

    // Ground line
    ctx.strokeStyle = '#4a8a28'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, GROUND_Y)
    ctx.lineTo(W, GROUND_Y)
    ctx.stroke()

    // Animals
    for (const a of animalsRef.current) {
      if (!a.alive) continue
      ctx.font = `${a.size}px serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(a.emoji, a.x, a.y + a.size * 0.1)
    }

    // Shot effect
    const shot = shotRef.current
    if (shot && now - shot.born < SHOT_DURATION) {
      const t = 1 - (now - shot.born) / SHOT_DURATION
      const r = 20 + (1 - t) * 20
      ctx.strokeStyle = `rgba(255, 80, 80, ${t})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(shot.x, shot.y, r, 0, Math.PI * 2)
      ctx.stroke()
      // crosshair
      ctx.beginPath()
      ctx.moveTo(shot.x - r, shot.y)
      ctx.lineTo(shot.x + r, shot.y)
      ctx.moveTo(shot.x, shot.y - r)
      ctx.lineTo(shot.x, shot.y + r)
      ctx.stroke()
    }

    // Win/lose overlay
    const g = gameRef.current
    if (g.done) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.fillRect(0, 0, W, H)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (g.score >= config.targetScore) {
        ctx.fillStyle = '#34d399'
        ctx.font = 'bold 28px sans-serif'
        ctx.fillText('✓  Hunt Complete!', W / 2, H / 2 - 14)
        ctx.font = '14px sans-serif'
        ctx.fillStyle = '#a7f3d0'
        ctx.fillText(`Score: ${g.score}`, W / 2, H / 2 + 16)
      } else {
        ctx.fillStyle = '#f87171'
        ctx.font = 'bold 22px sans-serif'
        ctx.fillText('Out of Arrows', W / 2, H / 2 - 14)
        ctx.font = '14px sans-serif'
        ctx.fillStyle = '#fca5a5'
        ctx.fillText(`Score: ${g.score} / ${config.targetScore}`, W / 2, H / 2 + 16)
      }
    }
  }, [config])

  const tick = useCallback(() => {
    if (gameRef.current.done) {
      draw()
      return
    }

    // Move animals
    for (const a of animalsRef.current) {
      if (!a.alive) continue
      a.x += a.speed
      // Respawn when off-screen
      if (a.x > W + 50 || a.x < -50) {
        const def = config.animals.find(d => d.emoji === a.emoji)!
        const respawned = spawnAnimal(def, a.speed > 0 ? false : true)
        Object.assign(a, respawned)
      }
    }

    draw()
    rafRef.current = requestAnimationFrame(tick)
  }, [config, draw])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [tick])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const g = gameRef.current
    if (g.done || g.bullets <= 0) return

    const rect = canvasRef.current!.getBoundingClientRect()
    const scaleX = W / rect.width
    const scaleY = H / rect.height
    const cx = (e.clientX - rect.left) * scaleX
    const cy = (e.clientY - rect.top) * scaleY

    shotRef.current = { x: cx, y: cy, born: performance.now() }
    g.bullets--

    // Check hits (use animal center)
    let hitPoints = 0
    for (const a of animalsRef.current) {
      if (!a.alive) continue
      const ax = a.x
      const ay = a.y - a.size * 0.5
      const dist = Math.sqrt((ax - cx) ** 2 + (ay - cy) ** 2)
      if (dist < HIT_RADIUS) {
        a.alive = false
        hitPoints += a.points
      }
    }
    g.score += hitPoints

    const won = g.score >= config.targetScore
    const lost = !won && g.bullets <= 0
    if (won || lost) {
      g.done = true
      if (won) setTimeout(onWin, 1200)
    }

    setDisplay({ bullets: g.bullets, score: g.score, won, lost })
  }, [config, onWin])

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Header */}
      <div className="text-center px-2">
        <p className="text-amber-400 font-bold text-sm tracking-wide">{config.title}</p>
        <p className="text-slate-400 text-xs mt-0.5 max-w-[320px] leading-snug">{config.instruction}</p>
      </div>

      {/* HUD */}
      <div className="flex items-center gap-5 text-sm font-bold">
        <span className="text-amber-400">
          🎯 {display.bullets} <span className="font-normal text-xs text-slate-500">arrows</span>
        </span>
        <span className="text-emerald-400">
          ⬤ {display.score}<span className="text-slate-600">/{config.targetScore}</span>
          <span className="font-normal text-xs text-slate-500 ml-1">pts</span>
        </span>
      </div>

      {/* Canvas */}
      <div className="rounded-xl overflow-hidden border border-white/10 shadow-lg w-full max-w-[360px]">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="w-full cursor-crosshair"
          onClick={handleCanvasClick}
        />
      </div>

      {/* Lost state retry */}
      {display.lost && !display.won && (
        <button
          onClick={onWin}
          className="mt-1 px-6 py-2.5 rounded-xl bg-slate-700 text-slate-200 font-bold text-sm hover:bg-slate-600 active:scale-95 transition-all"
        >
          Continue →
        </button>
      )}

      <style>{`
        canvas { image-rendering: crisp-edges; }
      `}</style>
    </div>
  )
}
