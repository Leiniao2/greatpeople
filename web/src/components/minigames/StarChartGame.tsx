import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { mulberry32, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Star chart: two instruments in one.
//   identify – find the named constellations among the stars of the night sky
//   altitude – set an astrolabe to the star's altitude and read the latitude
//              (for the pole star, latitude equals altitude; for a star at
//              declination δ culminating south, latitude = 90° − altitude + δ)
// Difficulty: more targets and a tighter tolerance, decoy stars, a clock,
// and at tier 4 the constellation outlines are hidden.

interface Constellation { name: string; stars: [number, number][]; lines?: [number, number][] }
export interface Sighting { star: string; declination: number; /** true altitude at the ship's latitude */ altitude: number; south: boolean }

interface StarChartConfig {
  title: string
  intro: string
  mode: 'identify' | 'altitude'
  constellations?: Constellation[]
  sightings?: Sighting[]
  fact: string
}

export const CONFIGS: Record<string, StarChartConfig> = {
  'hipparchus-catalogue': {
    title: 'The First Catalogue',
    intro: 'Hipparchus fixed the positions of some 850 stars. Find each constellation named below among the stars.',
    mode: 'identify',
    constellations: [
      { name: 'Orion',      stars: [[30, 60], [34, 50], [38, 40], [26, 42], [44, 58], [28, 70], [42, 72]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 5], [4, 6]] },
      { name: 'Cassiopeia', stars: [[60, 15], [66, 22], [72, 14], [78, 22], [84, 12]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
      { name: 'Ursa Major', stars: [[10, 20], [16, 24], [22, 22], [28, 26], [30, 34], [22, 36], [18, 30]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
      { name: 'Cygnus',     stars: [[60, 50], [66, 56], [72, 62], [60, 66], [78, 54]], lines: [[0, 1], [1, 2], [1, 3], [1, 4]] },
      { name: 'Lyra',       stars: [[86, 40], [90, 46], [88, 52], [82, 50]], lines: [[0, 1], [1, 2], [2, 3], [3, 0]] },
    ],
    fact: 'Comparing his observations with those of Timocharis 150 years earlier, Hipparchus (c. 190–120 BCE) discovered the precession of the equinoxes — the slow 26,000-year wobble of the Earth\'s axis.',
  },
  'anaxagoras-sky': {
    title: 'Stones on Fire',
    intro: 'Anaxagoras looked up and saw not gods but burning stones. Find each figure the Greeks knew in the night sky over Athens.',
    mode: 'identify',
    constellations: [
      { name: 'Orion',      stars: [[30, 60], [34, 50], [38, 40], [26, 42], [44, 58], [28, 70], [42, 72]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 5], [4, 6]] },
      { name: 'Cassiopeia', stars: [[60, 15], [66, 22], [72, 14], [78, 22], [84, 12]], lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
      { name: 'The Great Bear', stars: [[10, 20], [16, 24], [22, 22], [28, 26], [30, 34], [22, 36], [18, 30]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
      { name: 'The Swan',   stars: [[60, 50], [66, 56], [72, 62], [60, 66], [78, 54]], lines: [[0, 1], [1, 2], [1, 3], [1, 4]] },
      { name: 'The Lyre',   stars: [[86, 40], [90, 46], [88, 52], [82, 50]], lines: [[0, 1], [1, 2], [2, 3], [3, 0]] },
    ],
    fact: 'Anaxagoras taught that the sun, moon and stars are fiery stones carried round by the whirl of the heavens, too far off for us to feel the stars\' heat. Aristotle reports his idea that the Milky Way is the light of the stars the Earth\'s shadow hides from the sun.',
  },
  'polynesian-navigators': {
    title: 'The Star Compass',
    intro: 'Polynesian wayfinders memorised where each star rises and sets. Find the guiding constellations before they drop below the horizon.',
    mode: 'identify',
    constellations: [
      { name: 'Southern Cross', stars: [[50, 70], [54, 56], [44, 60], [60, 64]], lines: [[0, 1], [2, 3]] },
      { name: 'Scorpius',  stars: [[20, 30], [26, 36], [30, 44], [32, 54], [38, 62], [46, 66], [52, 60]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
      { name: 'Orion',     stars: [[72, 30], [76, 22], [80, 14], [68, 16], [86, 30], [70, 42], [84, 42]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 5], [4, 6]] },
      { name: 'Pleiades',  stars: [[88, 60], [90, 64], [86, 66], [92, 68], [89, 70]], lines: [[0, 1], [1, 3], [2, 4]] },
    ],
    fact: 'Without instruments, Polynesian navigators settled islands across 10 million square miles of the Pacific, steering by a star compass of rising and setting points, swell patterns and the flight of birds. Hōkūleʻa proved the method again in 1976.',
  },
  'theban-night': {
    title: 'The Stars of the Hours',
    intro: 'The hour-watcher of Amun names the night by its stars. Find each star group named below before the dawn washes them out.',
    mode: 'identify',
    constellations: [
      { name: 'Meskhetyu — the Foreleg', stars: [[8, 12], [14, 16], [20, 14], [26, 18], [28, 26], [20, 28], [16, 22]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]] },
      { name: 'The Lion', stars: [[44, 10], [48, 6], [54, 8], [56, 14], [52, 18], [66, 20], [60, 14]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 6], [6, 5]] },
      { name: 'Sah — Orion', stars: [[22, 58], [26, 48], [30, 38], [18, 40], [36, 56], [20, 68], [34, 70]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 5], [4, 6]] },
      { name: 'Sopdet — Sirius', stars: [[52, 62], [56, 68], [50, 72], [60, 74], [48, 66]], lines: [[0, 1], [1, 3], [1, 2], [0, 4]] },
      { name: 'The Pleiades', stars: [[80, 40], [82, 44], [78, 46], [84, 48], [81, 50]], lines: [[0, 1], [1, 3], [2, 4]] },
    ],
    fact: 'The ceiling of Senenmut’s tomb at Thebes (c. 1470 BCE), a few decades before Nakht, is the oldest Egyptian star chart known. It lists the decans — star groups whose risings marked the hours of the night — with Sah (Orion) and Sopdet (Sirius) among them, and Meskhetyu, the bull’s foreleg we call the Plough, in the northern sky.',
  },
  'kalpa-sutra': {
    title: 'The Lodgings of the Moon',
    intro: 'Indian sky-watchers told the days by the nakshatras, the moon’s lodgings among the stars. Find each one named below.',
    mode: 'identify',
    constellations: [
      { name: 'Magha — the Sickle', stars: [[10, 40], [12, 32], [16, 26], [14, 20], [8, 18], [6, 24]], lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] },
      { name: 'Purva Phalguni', stars: [[30, 22], [34, 30]], lines: [[0, 1]] },
      { name: 'Hastottara — Uttara Phalguni', stars: [[52, 26], [56, 20]], lines: [[0, 1]] },
      { name: 'Hasta — the Hand', stars: [[60, 52], [68, 50], [70, 58], [62, 60], [66, 44]], lines: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4]] },
      { name: 'Chitra — Spica', stars: [[84, 68]] },
      { name: 'Svati — Arcturus', stars: [[86, 14]] },
    ],
    fact: 'The Jain Kalpa Sutra says that Mahavira’s conception, birth, renunciation and enlightenment all came when the moon stood in Hastottara — the asterism Uttara Phalguni, in Leo — and that he reached nirvana under Svati, the star Arcturus.',
  },
  'zheng-he-astrolabe': {
    title: 'Steering by the Pole',
    intro: "Zheng He's pilots measured the pole star's height with a qianxingban. Set the instrument to each altitude and give the ship's latitude.",
    mode: 'altitude',
    sightings: [
      { star: 'Polaris', declination: 90, altitude: 23, south: false },
      { star: 'Polaris', declination: 90, altitude: 12, south: false },
      { star: 'Canopus', declination: -52.7, altitude: 30, south: true },
      { star: 'Polaris', declination: 90, altitude: 3, south: false },
    ],
    fact: "The Mao Kun map, printed in 1628 from Zheng He's charts, records star altitudes in 'fingers' (zhi) — the width of a finger at arm's length, about 1.6° — for every leg from Calicut to Hormuz and the African coast.",
  },
  'al-biruni-latitude': {
    title: "Al-Bīrūnī's Latitude",
    intro: 'Al-Bīrūnī measured latitude from the sun and stars at their meridian. Read each altitude and compute where you stand.',
    mode: 'altitude',
    sightings: [
      { star: 'Polaris', declination: 90, altitude: 41, south: false },
      { star: 'Sirius', declination: -16.7, altitude: 32, south: true },
      { star: 'Vega', declination: 38.8, altitude: 86, south: true },
      { star: 'Polaris', declination: 90, altitude: 36, south: false },
    ],
    fact: 'Abū Rayḥān al-Bīrūnī (973–1048) measured the radius of the Earth to within 1% from the dip of the horizon seen from a mountain in Punjab, and wrote on astronomy, geodesy, pharmacology and the history of India.',
  },
  'noonan-sextant': {
    title: "Noonan's Star Sights",
    intro: "Fred Noonan fixes the Electra's position by the stars on the long legs of the world flight. Set the sextant to each star's altitude and give the latitude.",
    mode: 'altitude',
    sightings: [
      { star: 'Polaris', declination: 90, altitude: 26, south: false },
      { star: 'Polaris', declination: 90, altitude: 25, south: false },
      { star: 'Canopus', declination: -52.7, altitude: 44, south: true },
      { star: 'Sirius', declination: -16.7, altitude: 72, south: true },
    ],
    fact: 'Fred Noonan, a former Pan American navigator who had charted its Pacific clipper routes, navigated Earhart\'s 1937 world flight by sextant and dead reckoning. Their last leg, from Lae in New Guinea to tiny Howland Island just north of the equator, was some 2,500 miles of open ocean.',
  },
}

/** Sightings asked for at a tier. */
export const altitudeCount = (available: number, difficulty: number) => Math.min(available, scale(difficulty as 1 | 2 | 3 | 4, [2, 3, 3, 4]))
/** ±degrees allowed when sighting by eye on the dial, and when giving the latitude. */
export const sightTolerance = (difficulty: number) => scale(difficulty as 1 | 2 | 3 | 4, [4, 3, 2, 2])
export const latitudeTolerance = (difficulty: number) => scale(difficulty as 1 | 2 | 3 | 4, [3, 2, 1, 1])

export const latitudeFrom = (s: Sighting) => s.declination === 90 ? s.altitude : 90 - s.altitude + s.declination

export default function StarChartGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'hipparchus-catalogue')
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 900 })
  // Identify: a few taps per figure.  Altitude: ~30 s per sighting to sight
  // and compute, so its clock scales with the sightings asked for.
  const timeLimit = cfg.mode === 'altitude'
    ? scale(difficulty, [0, 0, 45, 45]) * altitudeCount(cfg.sightings?.length ?? 0, difficulty)
    : scale(difficulty, [0, 0, 120, 90])
  const timer = useGameTimer({ seconds: timeLimit, running: !settled, onExpire: () => lose('the sky clouded over') })
  // The game is lost on this many mistakes (D4 forgives one).
  const maxMistakes = scale(difficulty, [3, 3, 2, 2])
  const [mistakes, setMistakes] = useState(0)

  const miss = () => {
    const n = mistakes + 1
    setMistakes(n)
    if (n >= maxMistakes) lose('lost among the stars')
    return n >= maxMistakes
  }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
          <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
        </div>
        <p className={`shrink-0 text-[10px] ${mistakes ? 'text-red-600 font-bold' : 'text-muted'}`}>✗ {mistakes} / {maxMistakes}</p>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      {cfg.mode === 'identify'
        ? <Identify constellations={cfg.constellations ?? []} difficulty={difficulty} seed={seed} disabled={settled} onDone={win} onMiss={miss} />
        : <Altitude sightings={cfg.sightings ?? []} difficulty={difficulty} disabled={settled} onDone={win} onMiss={miss} />}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="Course fixed!" loseTitle="The sky gives no answer" />
    </div>
  )
}

// ── Identify ───────────────────────────────────────────────────────────────────

function Identify({ constellations, difficulty, seed, disabled, onDone, onMiss }: {
  constellations: Constellation[]; difficulty: number; seed: number; disabled: boolean; onDone: () => void; onMiss: () => boolean
}) {
  const targets = useMemo(() => shuffle(constellations, mulberry32(seed)).slice(0, Math.min(constellations.length, scale(difficulty as 1 | 2 | 3 | 4, [2, 3, 4, 5]))), [constellations, difficulty, seed])
  const decoys = useMemo(() => {
    const rng = mulberry32(seed ^ 0x55aa)
    const n = scale(difficulty as 1 | 2 | 3 | 4, [10, 20, 35, 50])
    return Array.from({ length: n }, () => [rng() * 100, rng() * 80] as [number, number])
  }, [difficulty, seed])
  const showLines = difficulty < 4
  const [found, setFound] = useState<string[]>([])
  const [flash, setFlash] = useState<string | null>(null)
  const [missNote, setMissNote] = useState<string | null>(null)
  const current = targets[found.length]

  const tapConstellation = (c: Constellation) => {
    if (disabled || !current || found.includes(c.name)) return
    if (c.name === current.name) {
      const next = [...found, c.name]
      setFound(next)
      setMissNote(null)
      if (next.length === targets.length) onDone()
    } else {
      setFlash(c.name)
      setTimeout(() => setFlash(null), 500)
      // D1–D2 name the figure that was tapped, so a miss teaches a shape.
      setMissNote(difficulty <= 2 ? `That is ${c.name}.` : 'Not that one.')
      onMiss()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink text-sm">Find: <span className="font-bold text-accent">{current?.name ?? '—'}</span>
        <span className="text-muted text-[10px] ml-2">{found.length} / {targets.length}</span></p>
      <div className="relative w-full rounded-xl overflow-hidden border border-line" style={{ paddingTop: '70%', background: 'radial-gradient(ellipse at 50% 100%, #1b2240, #080812)' }}>
        <svg viewBox="0 0 100 80" className="absolute inset-0 w-full h-full">
          {decoys.map(([x, y], i) => <circle key={`d${i}`} cx={x} cy={y} r={0.35} fill="#cbd5e1" opacity={0.6} />)}
          {constellations.map(c => {
            const done = found.includes(c.name)
            const bad = flash === c.name
            const color = done ? '#4ade80' : bad ? '#f87171' : '#f8fafc'
            const cx = c.stars.reduce((a, s) => a + s[0], 0) / c.stars.length
            const cy = c.stars.reduce((a, s) => a + s[1], 0) / c.stars.length
            return (
              <g key={c.name} onClick={() => tapConstellation(c)} className="cursor-pointer">
                {showLines && c.lines?.map(([a, b], i) => (
                  <line key={i} x1={c.stars[a][0]} y1={c.stars[a][1]} x2={c.stars[b][0]} y2={c.stars[b][1]} stroke={color} strokeWidth={0.3} opacity={0.5} />
                ))}
                {c.stars.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.9} fill={color} />)}
                <circle cx={cx} cy={cy} r={9} fill="transparent" />
                {done && <text x={cx} y={cy - 6} fontSize="3.2" textAnchor="middle" fill="#4ade80">{c.name}</text>}
              </g>
            )
          })}
        </svg>
      </div>
      {missNote && !disabled && <p className="text-[11px] text-red-700">{missNote}</p>}
      <p className="text-[10px] text-muted/80">Tap the stars of the constellation. {showLines ? 'Outlines are drawn for you.' : 'No outlines at this height — know the shapes.'}</p>
    </div>
  )
}

// ── Altitude ───────────────────────────────────────────────────────────────────

function Altitude({ sightings, difficulty, disabled, onDone, onMiss }: {
  sightings: Sighting[]; difficulty: number; disabled: boolean; onDone: () => void; onMiss: () => boolean
}) {
  const count = altitudeCount(sightings.length, difficulty)
  const sightTol = sightTolerance(difficulty)
  const tolerance = latitudeTolerance(difficulty)
  const [idx, setIdx] = useState(0)
  const [dial, setDial] = useState(45)
  const [latitude, setLatitude] = useState(30)
  const [stage, setStage] = useState<'sight' | 'compute'>('sight')
  const [note, setNote] = useState<string | null>(null)
  const s = sightings[idx]

  const confirmSight = () => {
    if (disabled) return
    // A good sight reads off the true altitude, so the sum uses exact numbers.
    if (Math.abs(dial - s.altitude) <= sightTol) { setDial(s.altitude); setStage('compute'); setNote(null) }
    else { setNote(`The star is not on the sight line at ${dial}°.`); onMiss() }
  }
  const confirmLatitude = () => {
    if (disabled) return
    const want = Math.round(latitudeFrom(s))
    if (Math.abs(latitude - want) <= tolerance) {
      const next = idx + 1
      if (next >= count) { onDone(); return }
      setIdx(next); setStage('sight'); setDial(45); setNote(null)
    } else {
      setNote(`That latitude does not match a ${s.altitude}° sight of ${s.star}.`)
      onMiss()
    }
  }

  const hint = `Sighted at ${s.altitude}°. ` + (s.declination === 90
    ? 'The pole star stands as high as your latitude.'
    : `${s.star} culminates ${s.south ? 'to the south' : 'overhead'} at declination ${s.declination}°: latitude = 90 − altitude + declination.`)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink text-sm">Sighting {idx + 1} / {count}: <span className="font-bold text-accent">{s.star}</span>
        <span className="text-muted text-[10px] ml-2">sight ±{sightTol}° · latitude ±{tolerance}°</span></p>

      {/* Astrolabe */}
      <div className="flex items-center gap-4">
        <div className="relative w-28 h-28 rounded-full border-2 border-line-2 bg-panel shrink-0">
          <div className="absolute inset-2 rounded-full border border-dashed border-line" />
          {/* true altitude star */}
          <span className="absolute text-[10px]" style={{ left: `${50 + 42 * Math.cos((-s.altitude * Math.PI) / 180)}%`, top: `${50 + 42 * Math.sin((-s.altitude * Math.PI) / 180)}%`, transform: 'translate(-50%,-50%)' }}>★</span>
          {/* alidade */}
          <div className="absolute left-1/2 top-1/2 h-0.5 w-12 bg-accent origin-left" style={{ transform: `rotate(${-dial}deg)` }} />
          <div className="absolute left-1/2 top-1/2 w-2 h-2 -ml-1 -mt-1 rounded-full bg-ink" />
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted">0°</span>
          <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[9px] text-muted">90°</span>
        </div>
        <div className="flex-1 flex flex-col gap-2">
          {stage === 'sight' ? (
            <>
              <label className="text-[10px] text-muted uppercase tracking-widest">Alidade · {dial}°</label>
              <input type="range" min={0} max={90} value={dial} disabled={disabled} onChange={e => setDial(Number(e.target.value))} className="accent-[#9b2c23]" />
              <button disabled={disabled} onClick={confirmSight} className="py-2 rounded-xl bg-accent text-accent-fg text-xs font-bold hover:bg-accent-hover">Sight the star</button>
            </>
          ) : (
            <>
              <p className="text-[10px] text-muted">{hint}</p>
              <label className="text-[10px] text-muted uppercase tracking-widest">Latitude · {latitude}° {latitude >= 0 ? 'N' : 'S'}</label>
              <input type="range" min={-60} max={80} value={latitude} disabled={disabled} onChange={e => setLatitude(Number(e.target.value))} className="accent-[#9b2c23]" />
              <button disabled={disabled} onClick={confirmLatitude} className="py-2 rounded-xl bg-accent text-accent-fg text-xs font-bold hover:bg-accent-hover">Fix our position</button>
            </>
          )}
        </div>
      </div>
      {note && <p className="text-[11px] text-red-700">{note}</p>}
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
