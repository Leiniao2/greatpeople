import { useEffect, useRef, useState, useCallback } from 'react'

interface FlightConfig {
  title: string
  aircraft: string
  planeEmoji: string
  obstacleEmoji: string
  duration: number
  fact: string
}

const CONFIGS: Record<string, FlightConfig> = {
  'wright-first-flight': {
    title: 'First Flight — Kitty Hawk, 1903',
    aircraft: 'Wright Flyer',
    planeEmoji: '🛩️',
    obstacleEmoji: '🌬️',
    duration: 12,
    fact: 'On 17 December 1903 Orville Wright flew 120 feet in 12 seconds — the first powered, controlled, sustained heavier-than-air flight in history. The brothers made four flights that morning.',
  },
  'earhart-atlantic': {
    title: 'Solo Atlantic — Amelia Earhart, 1932',
    aircraft: 'Lockheed Vega 5B',
    planeEmoji: '✈️',
    obstacleEmoji: '⛈️',
    duration: 15,
    fact: 'On 20 May 1932 Amelia Earhart became the first woman to fly solo non-stop across the Atlantic, covering 2,026 miles from Newfoundland to Northern Ireland in 14 h 56 min — battling ice, flames, and a broken altimeter.',
  },
  'lindbergh-paris': {
    title: 'Spirit of St. Louis — New York to Paris, 1927',
    aircraft: 'Ryan NYP',
    planeEmoji: '🛫',
    obstacleEmoji: '🌫️',
    duration: 15,
    fact: 'Charles Lindbergh flew 3,600 miles from New York to Paris on 20–21 May 1927, alone in 33.5 hours. He stayed awake by slapping his face and sticking his head out the window into freezing air.',
  },
}

const W = 360, H = 260
const PLANE_X = 55
const PLANE_H = 26
// Physics normalised to 60 fps — multiply by dt*60 at runtime
const GRAVITY = 0.30
const FLAP = -6.8
const OBS_W = 38
const GAP = 118        // slightly wider gap
const MIN_TOP = 38
const BASE_SPEED = 2.4 // slightly slower start

type Phase = 'ready' | 'playing' | 'dead' | 'won'

export default function FlightGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['earhart-atlantic']
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<Phase>('ready')
  const [phase, setPhaseState] = useState<Phase>('ready')

  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p) }

  const gameRef = useRef({
    y: H / 2, vy: 0,
    obstacles: [] as { x: number; topH: number }[],
    frame: 0, elapsed: 0, speed: BASE_SPEED,
    raf: 0, lastTs: 0,
  })

  const flap = useCallback(() => {
    if (phaseRef.current === 'ready') setPhase('playing')
    if (phaseRef.current === 'playing') gameRef.current.vy = FLAP
  }, [])

  const resetGame = useCallback(() => {
    const g = gameRef.current
    g.y = H / 2; g.vy = 0; g.obstacles = []
    g.frame = 0; g.elapsed = 0; g.speed = BASE_SPEED; g.lastTs = 0
    setPhase('ready')
  }, [])

  const handleTap = useCallback(() => {
    if (phaseRef.current === 'dead') resetGame()
    else flap()
  }, [flap, resetGame])

  // Keyboard: Space / ArrowUp / W
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault()
        if (phaseRef.current === 'dead') resetGame()
        else flap()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flap, resetGame])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const g = gameRef.current

    g.y = H / 2; g.vy = 0; g.obstacles = []
    g.frame = 0; g.elapsed = 0; g.speed = BASE_SPEED; g.lastTs = 0

    const STAR_X = Array.from({ length: 30 }, (_, i) => ((i * 137.5) % W))
    const STAR_Y = Array.from({ length: 30 }, (_, i) => ((i * 97.3) % H))

    function loop(ts: number) {
      g.raf = requestAnimationFrame(loop)

      // Delta-time capped at 50 ms (handles tab switch / slow frames)
      const dt = g.lastTs ? Math.min((ts - g.lastTs) / 1000, 0.05) : 1 / 60
      g.lastTs = ts
      const k = dt * 60  // scale factor so constants feel like 60 fps

      g.frame++
      const ph = phaseRef.current

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, H)
      sky.addColorStop(0, '#05051a')
      sky.addColorStop(1, '#0a0a2a')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, W, H)

      // Stars
      STAR_X.forEach((sx, i) => {
        const tx = ((sx - g.frame * 0.4 * (ph === 'playing' ? g.speed / BASE_SPEED : 0)) % W + W) % W
        ctx.fillStyle = `rgba(255,255,255,${0.2 + (i % 3) * 0.1})`
        ctx.fillRect(tx, STAR_Y[i], 1.5, 1.5)
      })

      if (ph === 'playing') {
        // Delta-time physics
        g.vy += GRAVITY * k
        g.y  += g.vy * k
        g.elapsed += dt
        g.speed = BASE_SPEED + g.elapsed * 0.05

        // Spawn obstacles based on time intervals, not frame count
        const spawnInterval = 88 / 60  // seconds between spawns
        const prevElapsed = g.elapsed - dt
        if (Math.floor(g.elapsed / spawnInterval) > Math.floor(prevElapsed / spawnInterval)) {
          const topH = MIN_TOP + Math.random() * (H - GAP - MIN_TOP * 2)
          g.obstacles.push({ x: W + OBS_W, topH })
        }

        g.obstacles.forEach(o => { o.x -= g.speed * k })
        g.obstacles = g.obstacles.filter(o => o.x > -OBS_W)

        // Collision
        let crashed = g.y < 0 || g.y + PLANE_H > H
        if (!crashed) {
          for (const o of g.obstacles) {
            const inX = PLANE_X + 4 < o.x + OBS_W && PLANE_X + PLANE_H - 4 > o.x
            if (inX && (g.y + 4 < o.topH || g.y + PLANE_H - 4 > o.topH + GAP)) { crashed = true; break }
          }
        }
        if (crashed) { setPhase('dead'); return }
        if (g.elapsed >= cfg.duration) { setPhase('won'); setTimeout(onWin, 700); return }
      }

      // Obstacles
      for (const o of g.obstacles) {
        const grad = ctx.createLinearGradient(o.x, 0, o.x + OBS_W, 0)
        grad.addColorStop(0, '#1a4a30')
        grad.addColorStop(1, '#0f2e1e')
        ctx.fillStyle = grad
        ctx.beginPath(); ctx.roundRect(o.x, 0, OBS_W, o.topH, [0, 0, 6, 6]); ctx.fill()
        ctx.beginPath(); ctx.roundRect(o.x, o.topH + GAP, OBS_W, H - o.topH - GAP, [6, 6, 0, 0]); ctx.fill()
        ctx.font = '18px serif'
        ctx.fillText(cfg.obstacleEmoji, o.x + 9, o.topH + GAP / 2 + 8)
      }

      // Plane
      ctx.save()
      ctx.translate(PLANE_X + PLANE_H / 2, g.y + PLANE_H / 2)
      const tilt = Math.max(-28, Math.min(28, g.vy * 3.5))
      ctx.rotate((tilt * Math.PI) / 180)
      ctx.font = `${PLANE_H + 2}px serif`
      ctx.fillText(cfg.planeEmoji, -PLANE_H / 2, PLANE_H / 2)
      ctx.restore()

      // Timer bar
      if (ph === 'playing' || ph === 'won') {
        const progress = Math.min(g.elapsed / cfg.duration, 1)
        ctx.fillStyle = 'rgba(255,255,255,0.07)'
        ctx.beginPath(); ctx.roundRect(10, 10, W - 20, 5, 3); ctx.fill()
        ctx.fillStyle = progress > 0.8 ? '#10b981' : '#f59e0b'
        ctx.beginPath(); ctx.roundRect(10, 10, (W - 20) * progress, 5, 3); ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = '11px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(`${Math.ceil(cfg.duration - g.elapsed)}s`, W - 10, 22)
        ctx.textAlign = 'left'
      }

      // Overlays
      ctx.textAlign = 'center'
      if (ph === 'ready') {
        ctx.fillStyle = 'rgba(0,0,0,0.45)'
        ctx.fillRect(0, H / 2 - 38, W, 76)
        ctx.fillStyle = '#f59e0b'
        ctx.font = 'bold 15px sans-serif'
        ctx.fillText('Click · Tap · Space to fly!', W / 2, H / 2 - 10)
        ctx.fillStyle = '#94a3b8'
        ctx.font = '11px sans-serif'
        ctx.fillText(`Survive ${cfg.duration} seconds · ${cfg.aircraft}`, W / 2, H / 2 + 10)
        ctx.fillStyle = '#64748b'
        ctx.font = '10px sans-serif'
        ctx.fillText('Space / ↑ / W also works', W / 2, H / 2 + 26)
      }
      if (ph === 'dead') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(0, H / 2 - 36, W, 72)
        ctx.fillStyle = '#ef4444'
        ctx.font = 'bold 17px sans-serif'
        ctx.fillText('Crashed!', W / 2, H / 2 - 8)
        ctx.fillStyle = '#94a3b8'
        ctx.font = '12px sans-serif'
        ctx.fillText('Click / Space to try again', W / 2, H / 2 + 14)
      }
      if (ph === 'won') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(0, H / 2 - 32, W, 64)
        ctx.fillStyle = '#10b981'
        ctx.font = 'bold 16px sans-serif'
        ctx.fillText('Flight Complete! ✈', W / 2, H / 2 + 6)
      }
      ctx.textAlign = 'left'
    }

    loop(performance.now())
    return () => cancelAnimationFrame(g.raf)
  }, [cfg, onWin])

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm">{cfg.title}</p>
        <p className="text-slate-500 text-xs">{cfg.aircraft}</p>
      </div>

      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="rounded-xl border border-white/10 cursor-pointer select-none"
        style={{ maxWidth: '100%', touchAction: 'none' }}
        onClick={handleTap}
        onTouchStart={e => { e.preventDefault(); handleTap() }}
      />

      {/* Always-visible flap button for easy tapping */}
      {(phase === 'ready' || phase === 'playing') && (
        <button
          onPointerDown={e => { e.preventDefault(); handleTap() }}
          className="w-full max-w-[360px] py-4 rounded-2xl
                     bg-amber-500/20 border-2 border-amber-500/50
                     text-amber-300 font-bold text-lg
                     active:scale-95 active:bg-amber-500/30
                     transition-all select-none touch-none"
        >
          {phase === 'ready' ? '▲  FLY' : '▲  FLAP'}
        </button>
      )}

      {phase === 'won' && (
        <p className="text-xs text-slate-400 text-center px-4 leading-relaxed">{cfg.fact}</p>
      )}
      {phase === 'dead' && (
        <div className="flex gap-3 w-full max-w-[360px]">
          <button
            onClick={resetGame}
            className="flex-1 py-3 rounded-xl bg-amber-500/20 border border-amber-500/40
                       text-amber-300 font-bold text-sm hover:bg-amber-500/30
                       active:scale-95 transition-all"
          >
            Try Again
          </button>
          <button
            onClick={onWin}
            className="flex-1 py-3 rounded-xl bg-slate-700 border border-slate-600
                       text-slate-200 font-bold text-sm hover:bg-slate-600
                       active:scale-95 transition-all"
          >
            Continue →
          </button>
        </div>
      )}
    </div>
  )
}
