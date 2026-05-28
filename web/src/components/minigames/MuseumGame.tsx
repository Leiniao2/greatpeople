import { useState, useMemo, useCallback } from 'react'

type ArtType = 'portrait' | 'landscape' | 'sculpture' | 'ancient' | 'modern' | 'abstract'

interface Artwork { id: string; title: string; artist: string; type: ArtType; emoji: string; baseValue: number }
interface Room { id: string; name: string; emoji: string; bonusTypes: ArtType[]; mult: number; hint: string; color: string }
interface MuseumConfig { title: string; museum: string; artworks: Artwork[]; rooms: Room[]; winScore: number; fact: string }

const CONFIGS: Record<string, MuseumConfig> = {
  'louvre-arrangement': {
    title: 'Curate the Louvre',
    museum: 'Musée du Louvre, Paris',
    artworks: [
      { id: 'mona',     title: 'Mona Lisa',          artist: 'da Vinci',   type: 'portrait',   emoji: '🖼️', baseValue: 100 },
      { id: 'winged',   title: 'Winged Victory',      artist: 'Unknown',    type: 'sculpture',  emoji: '🗿', baseValue: 80  },
      { id: 'venus',    title: 'Venus de Milo',       artist: 'Unknown',    type: 'sculpture',  emoji: '🏛️', baseValue: 90  },
      { id: 'lacemaker',title: 'The Lacemaker',       artist: 'Vermeer',    type: 'portrait',   emoji: '🪡', baseValue: 70  },
      { id: 'liberty',  title: 'Liberty Leading',     artist: 'Delacroix',  type: 'modern',     emoji: '🚩', baseValue: 85  },
      { id: 'shepherd', title: 'Arcadian Shepherds',  artist: 'Poussin',    type: 'landscape',  emoji: '🌄', baseValue: 60  },
    ],
    rooms: [
      { id: 'denon',     name: 'Denon Wing',      emoji: '👑', bonusTypes: ['portrait'],             mult: 1.9, hint: '+90% for portraits',          color: 'from-violet-900' },
      { id: 'sully',     name: 'Sully Wing',       emoji: '🏺', bonusTypes: ['sculpture', 'ancient'], mult: 1.8, hint: '+80% for sculpture & ancient', color: 'from-amber-900'  },
      { id: 'richelieu', name: 'Richelieu Wing',   emoji: '🌿', bonusTypes: ['landscape'],            mult: 1.7, hint: '+70% for landscapes',          color: 'from-emerald-900'},
      { id: 'modern',    name: 'Modern Gallery',   emoji: '🔴', bonusTypes: ['modern', 'abstract'],   mult: 1.8, hint: '+80% for modern & abstract',   color: 'from-rose-900'   },
    ],
    winScore: 400,
    fact: 'The Louvre is the world\'s most-visited museum with over 9 million annual visitors. Its I. M. Pei glass pyramid, built in 1989, nearly caused a public revolt — now it\'s iconic.',
  },
  'british-museum': {
    title: 'Arrange the British Museum',
    museum: 'British Museum, London',
    artworks: [
      { id: 'rosetta', title: 'Rosetta Stone',      artist: 'Egypt, 196 BCE',  type: 'ancient',   emoji: '🪨', baseValue: 95  },
      { id: 'elgin',   title: 'Elgin Marbles',      artist: 'Pheidias',        type: 'sculpture', emoji: '🏛️', baseValue: 90  },
      { id: 'sutton',  title: 'Sutton Hoo Helmet',  artist: 'Anglo-Saxon',     type: 'ancient',   emoji: '⛑️', baseValue: 75  },
      { id: 'lewis',   title: 'Lewis Chessmen',      artist: 'Medieval Norse',  type: 'sculpture', emoji: '♟️', baseValue: 60  },
      { id: 'wave',    title: 'The Great Wave',      artist: 'Hokusai',         type: 'modern',    emoji: '🌊', baseValue: 80  },
      { id: 'lindow',  title: 'Lindow Man',          artist: 'Iron Age',        type: 'ancient',   emoji: '🦴', baseValue: 65  },
    ],
    rooms: [
      { id: 'egypt',    name: 'Egyptian Hall',     emoji: '🐪', bonusTypes: ['ancient'],             mult: 1.9, hint: '+90% for ancient works',          color: 'from-amber-800'  },
      { id: 'greece',   name: 'Greek & Rome',      emoji: '🏛️', bonusTypes: ['sculpture'],           mult: 1.8, hint: '+80% for sculptures',             color: 'from-slate-800'  },
      { id: 'asia',     name: 'Asia Gallery',      emoji: '🗼', bonusTypes: ['modern'],              mult: 1.7, hint: '+70% for modern works',            color: 'from-red-900'    },
      { id: 'medieval', name: 'Medieval Europe',   emoji: '⚔️', bonusTypes: ['ancient', 'sculpture'],mult: 1.6, hint: '+60% for ancient & sculpture',   color: 'from-indigo-900' },
    ],
    winScore: 370,
    fact: 'The British Museum holds over 8 million objects spanning 2 million years of human history. Founded in 1753, it was the world\'s first national public museum.',
  },
  'uffizi-gallery': {
    title: 'Curate the Uffizi Gallery',
    museum: 'Uffizi Gallery, Florence',
    artworks: [
      { id: 'birth',   title: 'Birth of Venus',     artist: 'Botticelli',   type: 'portrait',   emoji: '🐚', baseValue: 100 },
      { id: 'spring',  title: 'Primavera',           artist: 'Botticelli',   type: 'landscape',  emoji: '🌸', baseValue: 95  },
      { id: 'annun',   title: 'Annunciation',        artist: 'da Vinci',     type: 'portrait',   emoji: '🕊️', baseValue: 90  },
      { id: 'tondo',   title: 'Doni Tondo',          artist: 'Michelangelo', type: 'portrait',   emoji: '👶', baseValue: 85  },
      { id: 'venus2',  title: 'Venus of Urbino',     artist: 'Titian',       type: 'portrait',   emoji: '💛', baseValue: 80  },
      { id: 'medusa',  title: 'Medusa',              artist: 'Caravaggio',   type: 'modern',     emoji: '🐍', baseValue: 70  },
    ],
    rooms: [
      { id: 'botticelli', name: 'Botticelli Rooms',    emoji: '🌺', bonusTypes: ['portrait', 'landscape'], mult: 1.9, hint: '+90% for portraits & landscapes', color: 'from-rose-900'   },
      { id: 'renaissance',name: 'Renaissance Hall',    emoji: '🎨', bonusTypes: ['portrait'],               mult: 1.7, hint: '+70% for portraits',              color: 'from-violet-900' },
      { id: 'sculpture',  name: 'Sculpture Corridor',  emoji: '🗿', bonusTypes: ['sculpture'],              mult: 1.8, hint: '+80% for sculptures',             color: 'from-stone-800'  },
      { id: 'baroque',    name: 'Baroque Gallery',     emoji: '🕯️', bonusTypes: ['modern', 'abstract'],     mult: 1.8, hint: '+80% for modern & baroque',     color: 'from-slate-800'  },
    ],
    winScore: 430,
    fact: 'The Uffizi was designed by Vasari in 1560 as government offices ("uffizi") for Cosimo de\' Medici. The Medici art collection began moving there in 1581, making it the world\'s oldest art museum.',
  },
}

export default function MuseumGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId]

  const [assignments, setAssignments] = useState<Record<string, string | null>>(
    () => Object.fromEntries(cfg.rooms.map(r => [r.id, null]))
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [won, setWon] = useState(false)

  const artMap = useMemo(() => Object.fromEntries(cfg.artworks.map(a => [a.id, a])), [cfg])
  const assignedIds = useMemo(() => Object.values(assignments).filter(Boolean) as string[], [assignments])

  const score = useMemo(() => {
    let total = 0
    for (const room of cfg.rooms) {
      const aId = assignments[room.id]
      if (!aId) continue
      const art = artMap[aId]
      const mult = room.bonusTypes.includes(art.type) ? room.mult : 1.0
      total += Math.round(art.baseValue * mult)
    }
    return total
  }, [assignments, cfg.rooms, artMap])

  const allFilled = cfg.rooms.every(r => assignments[r.id])

  const clickRoom = useCallback((roomId: string) => {
    if (submitted) return
    if (selected) {
      const prev = assignments[roomId]
      setAssignments(a => ({ ...a, [roomId]: selected }))
      setSelected(prev)  // pick up what was displaced (null = deselect)
    } else if (assignments[roomId]) {
      setSelected(assignments[roomId])
      setAssignments(a => ({ ...a, [roomId]: null }))
    }
  }, [submitted, selected, assignments])

  const submit = () => {
    if (!allFilled) return
    setSubmitted(true)
    if (score >= cfg.winScore) { setWon(true); setTimeout(onWin, 800) }
  }

  const reset = () => {
    setAssignments(Object.fromEntries(cfg.rooms.map(r => [r.id, null])))
    setSelected(null); setSubmitted(false); setWon(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm">{cfg.title}</p>
        <p className="text-slate-400 text-xs">{cfg.museum}</p>
        <p className="text-slate-500 text-xs mt-0.5">Target: {cfg.winScore} pts — match artworks to rooms for maximum bonus</p>
      </div>

      {/* Score bar */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400">Score:</span>
        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min((score / cfg.winScore) * 100, 100)}%`,
              background: score >= cfg.winScore ? '#10b981' : '#f59e0b',
            }}
          />
        </div>
        <span className={`font-bold font-mono ${score >= cfg.winScore ? 'text-emerald-400' : 'text-amber-300'}`}>{score}</span>
      </div>

      {/* Rooms */}
      <div className="grid grid-cols-2 gap-2">
        {cfg.rooms.map(room => {
          const aId = assignments[room.id]
          const art = aId ? artMap[aId] : null
          const bonus = art ? room.bonusTypes.includes(art.type) : false
          const roomScore = art ? Math.round(art.baseValue * (bonus ? room.mult : 1.0)) : 0
          const canDrop = !!selected && !aId
          return (
            <button key={room.id} onClick={() => clickRoom(room.id)}
              className={[
                'flex flex-col gap-1.5 p-3 rounded-xl border text-left transition-all',
                `bg-gradient-to-br ${room.color} to-slate-950`,
                art
                  ? bonus ? 'border-emerald-500/50' : 'border-white/20'
                  : canDrop ? 'border-amber-400/60 bg-amber-500/5' : 'border-white/10 hover:border-white/25',
              ].join(' ')}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-base">{room.emoji}</span>
                <span className="text-white text-xs font-bold leading-tight">{room.name}</span>
              </div>
              <p className="text-slate-400 text-[10px] leading-tight">{room.hint}</p>
              {art ? (
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${bonus ? 'bg-emerald-500/20' : 'bg-white/[0.08]'}`}>
                  <span className="text-base">{art.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white truncate">{art.title}</p>
                    <p className="text-[10px] text-slate-400">{bonus ? `✓ bonus: ${roomScore} pts` : `${roomScore} pts`}</p>
                  </div>
                </div>
              ) : (
                <div className={`h-8 flex items-center justify-center rounded-lg border border-dashed ${canDrop ? 'border-amber-400/50 bg-amber-500/10' : 'border-white/10'}`}>
                  <span className={`text-[10px] ${canDrop ? 'text-amber-400' : 'text-slate-600'}`}>
                    {canDrop ? 'tap to place' : 'empty'}
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Artwork pool */}
      <div>
        <p className="text-slate-500 text-[10px] mb-1.5">
          {selected ? `Selected: ${artMap[selected]?.title} — tap a room to place it` : 'Tap an artwork to select it, then tap a room:'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {cfg.artworks.map(art => {
            const isAssigned = assignedIds.includes(art.id)
            const isSel = selected === art.id
            return (
              <button key={art.id} onClick={() => {
                if (submitted || isAssigned) return
                setSelected(isSel ? null : art.id)
              }}
                disabled={isAssigned}
                className={[
                  'flex items-center gap-1.5 px-2 py-1.5 rounded-xl border text-xs transition-all',
                  isAssigned ? 'opacity-30 cursor-default border-white/[0.05] bg-white/[0.02]' :
                  isSel      ? 'border-amber-400 bg-amber-500/20 text-amber-200 shadow-md shadow-amber-500/20' :
                               'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25',
                ].join(' ')}
              >
                <span className="text-base">{art.emoji}</span>
                <div>
                  <p className="font-bold leading-tight">{art.title}</p>
                  <p className="text-slate-500 text-[9px]">{art.baseValue} base · {art.type}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Submit */}
      {!submitted && (
        <button onClick={submit} disabled={!allFilled}
          className="w-full py-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-bold rounded-xl hover:bg-amber-500/30 transition-all disabled:opacity-40">
          {allFilled ? 'Open Museum Doors!' : `${cfg.rooms.filter(r => !assignments[r.id]).length} room${cfg.rooms.filter(r => !assignments[r.id]).length !== 1 ? 's' : ''} still empty`}
        </button>
      )}

      {submitted && won && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <p className="text-emerald-400 font-bold text-sm text-center">Masterful Curation! Score: {score} pts</p>
          <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{cfg.fact}</p>
        </div>
      )}
      {submitted && !won && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
          <p className="text-red-400 font-bold text-sm">Score: {score} — need {cfg.winScore}</p>
          <p className="text-slate-500 text-xs mt-0.5">Try matching artwork types to room specialities.</p>
          <button onClick={reset} className="mt-2 px-4 py-1.5 bg-white/10 text-slate-300 text-xs rounded-lg hover:bg-white/20 transition-all">
            Rearrange
          </button>
        </div>
      )}
    </div>
  )
}
