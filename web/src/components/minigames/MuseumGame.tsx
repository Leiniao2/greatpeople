import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { resolveConfig, storyText, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'
import { EXHIBIT_BY_ID, ERA_BANDS, eraOf } from './museum/catalogue'
import { generate, isSolved, roomName, roomState, shownTheme, themeLabel, type Puzzle } from './museum/model'

// Museum: hang every exhibit so each room of three shares a region, an era
// or a kind of object.  Rules and generation live in ./museum/model.ts; each
// config is a real museum whose own pieces lead the first room.

interface MuseumConfig {
  title: string
  museum: string
  intro: string
  /** Exhibits this museum is known for; one of them sets the first room. */
  featured: string[]
  fact: string
}

export const CONFIGS: Record<string, MuseumConfig> = {
  'louvre-arrangement': {
    title: 'Curate the Louvre',
    museum: 'Musée du Louvre, Paris',
    intro: 'The Louvre’s keepers are rehanging the galleries. Give each room three pieces that belong together.',
    featured: ['mona_lisa', 'venus_milo', 'liberty', 'hammurabi', 'lamassu'],
    fact: 'The Louvre is the world’s most-visited museum. It opened in 1793 in the former royal palace, and I. M. Pei’s glass pyramid was added in 1989.',
  },
  'catherine-hermitage': {
    title: "Hang Catherine's Hermitage",
    museum: 'The Hermitage, St Petersburg',
    intro: 'Catherine’s purchases arrive by the cartload. Hang them so every room of her hermitage has one theme.',
    featured: ['night_watch', 'pearl_earring', 'birth_venus', 'sevres_vase'],
    fact: 'Catherine bought her first 225 paintings from the Berlin merchant Johann Ernst Gotzkowsky in 1764, the year the Hermitage counts as its founding. The Crozat collection (1772) and Sir Robert Walpole’s pictures (1779) followed.',
  },
  'british-museum': {
    title: 'Arrange the British Museum',
    museum: 'British Museum, London',
    intro: 'New cases are ready in Bloomsbury. Each room must tell one story: one region, one era or one kind of object.',
    featured: ['rosetta', 'sutton_hoo', 'lewis_chessmen', 'standard_ur', 'benin_plaque'],
    fact: 'The British Museum opened in 1759, the first national public museum in the world, built on the 71,000 objects of the physician Sir Hans Sloane.',
  },
  'uffizi-gallery': {
    title: 'Curate the Uffizi Gallery',
    museum: 'Uffizi Gallery, Florence',
    intro: 'The Medici offices are becoming a gallery. Group the treasures so each room hangs together.',
    featured: ['birth_venus', 'maiolica', 'codex_leicester', 'david'],
    fact: 'The Uffizi was built from 1560 as offices (uffizi) for the Medici. Anna Maria Luisa de’ Medici left the family collection to Florence in 1737 on condition it never leave the city.',
  },
  'galleria-borghese': {
    title: 'Cardinal Scipione’s Villa',
    museum: 'Villa Borghese, Rome',
    intro: 'Cardinal Scipione Borghese is filling his villa. Place each work so every room has a single theme.',
    featured: ['apollo_daphne', 'david', 'maiolica'],
    fact: 'Cardinal Scipione Borghese commissioned the young Bernini’s great marbles for his villa on the Pincian hill, among them Apollo and Daphne (1622–25). They stand today in the Galleria Borghese.',
  },
  'palace-museum': {
    title: 'The Forbidden City Collection',
    museum: 'Palace Museum, Beijing',
    intro: 'The emperors’ storerooms are opening to the public. Set out each hall around one theme.',
    featured: ['qingming', 'ming_vase', 'ding', 'jade_suit'],
    fact: 'The Palace Museum opened in the Forbidden City in 1925, a year after the last emperor, Puyi, was expelled. It holds about 1.8 million objects, among them Along the River During the Qingming Festival.',
  },
  'tokyo-national': {
    title: 'Tokyo National Museum',
    museum: 'Tokyo National Museum, Ueno',
    intro: 'Japan’s oldest museum is laying out a survey of art from around the world. Give each room one theme.',
    featured: ['great_wave', 'samurai_armour', 'jomon_pot', 'genji_scroll'],
    fact: 'The Tokyo National Museum grew out of an exhibition held at the Yushima Seidō in 1872 and is the oldest museum in Japan.',
  },
  'anthropology-mexico': {
    title: 'Museum of Anthropology',
    museum: 'Museo Nacional de Antropología, Mexico City',
    intro: 'Under the great stone umbrella, the halls are being arranged. Each room shows one region, one era or one kind of object.',
    featured: ['sun_stone', 'olmec_head', 'moche_vessel', 'turquoise_serpent'],
    fact: 'The Museo Nacional de Antropología opened in 1964. The Aztec Sun Stone, found in Mexico City’s main square in 1790, is its most famous piece.',
  },
  'cairo-museum': {
    title: 'The Egyptian Museum',
    museum: 'Egyptian Museum, Cairo',
    intro: 'The treasures of the Valley of the Kings have arrived. Lay them out with pieces from the world’s museums, one theme to a room.',
    featured: ['tut_mask', 'fayum', 'crystal_ewer', 'rosetta'],
    fact: 'Howard Carter found Tutankhamun’s tomb in the Valley of the Kings in November 1922. Its gold mask has been in Cairo ever since.',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']
export const exhibitArtUrl = (id: string) => `/exhibits/${id}.webp`

function ExhibitImage({ id, className }: { id: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <div className={`${className} bg-panel-2`} />
  return <img src={exhibitArtUrl(id)} alt="" draggable={false} className={`${className} object-cover`} onError={() => setBroken(true)} />
}

const emptyRooms = (pz: Puzzle) => pz.themes.map(() => Array<string | null>(pz.slots).fill(null))

export default function MuseumGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = { ...resolveConfig(CONFIGS, configId, undefined, 'louvre-arrangement'), ...storyText(params) }
  const pz = useMemo(() => generate(difficulty, seed, { featured: config.featured }), [difficulty, seed, config.featured])
  const [rooms, setRooms] = useState<(string | null)[][]>(() => emptyRooms(pz))
  const [sel, setSel] = useState<string | null>(null)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  const timer = useGameTimer({ seconds: pz.seconds, running: !settled, onExpire: () => lose('The doors opened before the rooms were ready') })

  useEffect(() => { setRooms(emptyRooms(pz)); setSel(null) }, [pz])

  const filled = useMemo(() => rooms.map(r => r.filter((x): x is string => !!x)), [rooms])
  const placed = useMemo(() => new Set(filled.flat()), [filled])
  const solved = isSolved(pz, filled)
  useEffect(() => { if (solved && !settled) win() }, [solved, settled, win])

  const clickSlot = useCallback((r: number, s: number) => {
    if (settled) return
    const here = rooms[r][s]
    setRooms(prev => {
      const next = prev.map(row => row.map(x => (x === sel ? null : x)))
      next[r][s] = sel
      return next
    })
    // Whatever was hanging there comes back into your hands.
    setSel(here && here !== sel ? here : null)
  }, [rooms, sel, settled])

  const tray = pz.exhibits.filter(id => !placed.has(id))
  const goal = pz.hidden
    ? 'The rooms have no names yet. Each room of three must share a region, an era or a kind of object, and no two rooms may tell the same story.'
    : 'Fill every room with three exhibits that fit its theme. Some pieces fit two rooms: choose where each one is needed.'

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-[10px]">{config.museum}</p>
          <p className="text-muted text-xs leading-relaxed mt-1">{config.intro}</p>
        </div>
        <p className="shrink-0 text-[10px] font-bold text-ink-2">D{difficulty}</p>
      </div>
      <p className="text-ink-2 text-xs leading-relaxed" data-testid="museum-goal">{goal}</p>
      <div className="flex flex-wrap gap-1 text-[10px]">
        {ERA_BANDS.map(b => (
          <span key={b.era} className="px-1.5 py-0.5 rounded-md bg-panel border border-line text-muted">
            <b className="text-ink-2">{b.era}</b> {b.label}
          </span>
        ))}
      </div>
      {timer.active && !settled && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div className="grid gap-2 sm:grid-cols-2">
        {rooms.map((row, r) => {
          const state = roomState(pz, r, filled[r])
          const theme = shownTheme(pz, r, filled[r])
          const name = pz.hidden ? `Room ${ROMAN[r]}` : roomName(pz.themes[r])
          return (
            <div key={r} data-room={r} data-state={state}
              className={`rounded-xl border p-2 transition-colors ${
                state === 'good' ? 'border-emerald-500/60 bg-emerald-500/5' : state === 'bad' ? 'border-red-500/50 bg-red-500/5' : 'border-line bg-panel'}`}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="text-ink text-xs font-bold">{name}</p>
                <p className={`text-[10px] ${state === 'good' ? 'text-emerald-700' : state === 'bad' ? 'text-red-700' : 'text-muted'}`}>
                  {state === 'good' && theme ? `✓ ${themeLabel(theme)}`
                    : state === 'bad' ? (pz.hidden ? '✗ nothing in common' : '✗ does not fit')
                    : `${filled[r].length}/${pz.slots}`}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {row.map((id, s) => (
                  <button key={s} data-slot={`${r}:${s}`} onClick={() => clickSlot(r, s)} disabled={settled}
                    className={`relative aspect-square rounded-lg overflow-hidden border ${
                      id ? 'border-line-2' : sel ? 'border-accent/60 border-dashed bg-accent/10' : 'border-line border-dashed'}`}>
                    {id ? (
                      <>
                        <ExhibitImage id={id} className="absolute inset-0 w-full h-full" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] leading-tight px-1 py-0.5 truncate">{EXHIBIT_BY_ID[id].title}</span>
                      </>
                    ) : <span className="text-[10px] text-muted">{sel ? 'hang here' : ''}</span>}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {tray.length > 0 && (
        <div>
          <p className="text-muted text-[10px] mb-1.5">
            {sel ? `Holding ${EXHIBIT_BY_ID[sel].title}: tap a frame to hang it` : 'Tap an exhibit, then tap a frame. Tap a hung piece to take it down.'}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {tray.map(id => {
              const e = EXHIBIT_BY_ID[id]
              return (
                <button key={id} data-exhibit={id} disabled={settled} onClick={() => setSel(sel === id ? null : id)}
                  className={`flex flex-col rounded-lg overflow-hidden border text-left transition-all ${
                    sel === id ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-line-2'} bg-panel`}>
                  <ExhibitImage id={id} className="w-full aspect-square" />
                  <div className="px-1 py-0.5">
                    <p className="text-[10px] font-bold text-ink leading-tight">{e.title}</p>
                    <p className="text-[9px] text-muted leading-tight">{e.date} · {e.region}</p>
                    <p className="text-[9px] text-muted leading-tight">{e.kind}{pz.showEra ? ` · ${eraOf(e.year)}` : ''}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="The doors open on a perfect hanging" loseTitle="The rooms were not ready" />
    </div>
  )
}
