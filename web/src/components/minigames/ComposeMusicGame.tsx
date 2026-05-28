import { useState, useMemo } from 'react'

interface Passage {
  id: string
  title: string
  description: string
  emoji: string
  color: string
}

interface ComposeConfig {
  title: string
  composer: string
  year: string
  gpCard: string
  passages: Passage[]
  fact: string
}

const CONFIGS: Record<string, ComposeConfig> = {
  'beethoven-fifth': {
    title: "Symphony No. 5 in C Minor",
    composer: "Ludwig van Beethoven",
    year: "1808",
    gpCard: "Beethoven",
    passages: [
      { id: 'i',   title: 'I. Allegro con brio',    description: '"Da-da-da-DUM" — the four-note fate motif bursts open and drives forward relentlessly, full of iron tension. The two themes struggle, rise, and collapse without rest.', emoji: '⚡', color: 'from-red-900 to-red-950'     },
      { id: 'ii',  title: 'II. Andante con moto',   description: 'A lyrical theme in A-flat major — two tender melodies trade places like a quiet dialogue between sorrow and hope, with gentle variations winding around each other.', emoji: '🌿', color: 'from-emerald-900 to-emerald-950'},
      { id: 'iii', title: 'III. Allegro (Scherzo)', description: 'The fate motif returns in shadowy C minor; a hulking, mysterious dance with a gruff bassoon counter-theme. Violins whisper while lower strings stomp.', emoji: '🌑', color: 'from-slate-800 to-slate-950'  },
      { id: 'iv',  title: 'IV. Allegro (Finale)',   description: 'Trombones and piccolo enter for the first time as the symphony bursts into triumphant C major — a blazing, unstoppable march to victory after the long battle.', emoji: '🏆', color: 'from-amber-800 to-amber-950'  },
    ],
    fact: 'Beethoven\'s Fifth premiered in Vienna on 22 December 1808. He was already profoundly deaf. The "fate motif" (short-short-short-LONG) became the most recognised musical phrase in history.',
  },
  'mozart-40': {
    title: "Symphony No. 40 in G Minor",
    composer: "Wolfgang Amadeus Mozart",
    year: "1788",
    gpCard: "Mozart",
    passages: [
      { id: 'i',   title: 'I. Molto allegro',        description: 'Opens immediately — no introduction — with a breathless, sighing G-minor theme in the violins: restless, almost desperate, like being chased by an idea you cannot name.', emoji: '🌪️', color: 'from-violet-900 to-violet-950'},
      { id: 'ii',  title: 'II. Andante',              description: 'The storm pauses: a floating, consoling theme in the winds and strings moves through gently shifting harmonies, giving brief relief before unease creeps back.', emoji: '🕊️', color: 'from-sky-900 to-sky-950'     },
      { id: 'iii', title: 'III. Menuetto — Allegretto',description: 'A fierce, angular minuet — syncopated accents shove against the dance\'s natural beat. Too tense and jagged to actually dance to; a disguised storm.', emoji: '💃', color: 'from-rose-900 to-rose-950'   },
      { id: 'iv',  title: 'IV. Allegro assai',        description: 'The rushing finale amplifies the opening urgency. Harmonies writhe and shift; the symphony ends with two abrupt, blunt chords — no resolution, just cessation.', emoji: '⛈️', color: 'from-slate-700 to-slate-950' },
    ],
    fact: 'Mozart composed Symphony No. 40 in just six weeks in summer 1788, likely never hearing it in his lifetime. It remains one of only two of his 41 symphonies written in a minor key.',
  },
  'vivaldi-seasons': {
    title: "The Four Seasons",
    composer: "Antonio Vivaldi",
    year: "1725",
    gpCard: "Vivaldi",
    passages: [
      { id: 'spring', title: 'Spring — La Primavera',  description: 'Bright bird-like violin trills open over a carpet of green; blossoming meadows unfold, interrupted by a thunderstorm that rumbles and vanishes, leaving only birdsong.', emoji: '🌸', color: 'from-green-800 to-green-950' },
      { id: 'summer', title: 'Summer — L\'estate',     description: 'Oppressive heat: a cuckoo calls, a cuckoo answers. Then a violent hailstorm of rapid-fire notes hammers the solo violin — one of the most ferocious passages in all Baroque music.', emoji: '☀️', color: 'from-yellow-800 to-yellow-950'},
      { id: 'autumn', title: 'Autumn — L\'autunno',    description: 'Harvest festival dancing; peasants grow drunk (staggering viola solos); the final movement paints a cold pre-dawn and horsemen chasing a terrified stag through frozen woods.', emoji: '🍂', color: 'from-amber-700 to-amber-950' },
      { id: 'winter', title: 'Winter — L\'inverno',    description: 'Shivering staccato notes evoke frozen feet; a lyrical slow movement sits warmly by the fire while rain lashes the window; gusty wind-gusts close the cycle — and the year.', emoji: '❄️', color: 'from-slate-600 to-slate-900' },
    ],
    fact: 'Vivaldi\'s Four Seasons (1725) paired each concerto with a detailed sonnet he wrote himself — among the earliest examples of descriptive "programme music" in the Western tradition.',
  },
  'debussy-clair': {
    title: "Clair de Lune",
    composer: "Claude Debussy",
    year: "1905",
    gpCard: "Debussy",
    passages: [
      { id: 'a', title: 'Opening — Andante très expressif', description: 'Soft triplet chords in D-flat major drift upward like moonlight shimmering on still water: quiet, unhurried, barely present — a dream beginning to form.', emoji: '🌙', color: 'from-indigo-900 to-indigo-950'},
      { id: 'b', title: 'Development — Tempo di più mosso', description: 'The tempo quickens: arpeggios ripple in the right hand like reflected light on moving water, while the melody soars high above, aching and silver.', emoji: '💧', color: 'from-blue-900 to-blue-950'   },
      { id: 'c', title: 'Climax — Più animato',             description: 'Rising waves of chords reach the emotional peak — full, resonant, overwhelming — then begin subsiding like a wave that has spent itself against a cliff.', emoji: '🌊', color: 'from-teal-900 to-teal-950'   },
      { id: 'd', title: 'Coda — Un poco mosso',             description: 'The opening theme returns, softer and more distant, fading into the night with a final descending run and a whispered chord — then silence.', emoji: '⭐', color: 'from-slate-800 to-slate-950'  },
    ],
    fact: 'Debussy composed "Clair de Lune" (Moonlight) in 1890, inspired by a Paul Verlaine poem, but did not publish it until 1905. It became the defining work of Impressionist music.',
  },
  'bach-toccata': {
    title: "Toccata and Fugue in D Minor",
    composer: "Johann Sebastian Bach",
    year: "c. 1703–1707",
    gpCard: "Bach",
    passages: [
      { id: 'a', title: 'Toccata — Opening Fanfare',   description: 'A single dramatic downward flourish on full organ — then a beat of silence. The next six bars announce Bach\'s total command with theatrical authority.', emoji: '🎹', color: 'from-amber-900 to-amber-950'},
      { id: 'b', title: 'Toccata — Cascading Runs',    description: 'Rapid cascading passages, massive chord clusters, and chromatic descents build tension to a breaking point — the organist\'s hands flying across the manual.', emoji: '⚡', color: 'from-orange-900 to-orange-950'},
      { id: 'c', title: 'Fugue — Subject Entry',       description: 'The fugue subject enters in one quiet voice: a short characteristic phrase that all four voices will imitate, overlap, and develop across 87 bars.', emoji: '🔄', color: 'from-blue-900 to-blue-950'   },
      { id: 'd', title: 'Fugue — Stretto and Coda',    description: 'Voices crowd together in stretto; then the toccata\'s thunder returns for a grand coda — the whole organ blazing one last time before a final chord.', emoji: '🏛️', color: 'from-indigo-900 to-indigo-950'},
    ],
    fact: 'Bach\'s Toccata and Fugue in D Minor (BWV 565) is the most recognised organ work ever written. Its authorship has occasionally been debated, but the manuscript tradition points firmly to Bach.',
  },
  'brahms-lullaby-compose': {
    title: "A German Requiem",
    composer: "Johannes Brahms",
    year: "1869",
    gpCard: "Brahms",
    passages: [
      { id: 'i',   title: 'I. Blessed Are They That Mourn',     description: 'A hushed opening chorus in F major — gentle grief, supported by low strings without violins. "Blessed are they that mourn, for they shall be comforted."', emoji: '🕊️', color: 'from-slate-800 to-slate-950'  },
      { id: 'ii',  title: 'II. For All Flesh Is as the Grass',  description: 'A vast funeral march in 3/4 — slow, inexorable, the earth turning. The pace suddenly erupts in a fugue of hope before returning to the march.', emoji: '🌾', color: 'from-stone-700 to-stone-950'  },
      { id: 'iii', title: 'IV. How Lovely Is Thy Dwelling Place', description: 'The still centre of the Requiem: a warm, radiant chorus imagining the courts of heaven, each phrase beginning with "How lovely."', emoji: '✨', color: 'from-amber-800 to-amber-950'  },
      { id: 'iv',  title: 'VI. For Here Have We No Continuing City', description: 'A baritone soloist warns of mortality, then the chorus erupts in the great resurrection fugue: "Death is swallowed up in victory."', emoji: '🏆', color: 'from-violet-900 to-violet-950' },
    ],
    fact: 'Brahms began his German Requiem after his mother\'s death in 1865. Uniquely, he set German Bible texts of comfort rather than the Latin Mass for the dead — a Requiem for the living.',
  },
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function ComposeMusicGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId]
  const correctIds = useMemo(() => config.passages.map(p => p.id), [config])
  const [order, setOrder] = useState<string[]>(() => shuffle(correctIds))
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null)
  const [wrongIdxs, setWrongIdxs] = useState<Set<number>>(new Set())
  const [won, setWon] = useState(false)

  const passageMap = useMemo(() => Object.fromEntries(config.passages.map(p => [p.id, p])), [config])

  const swap = (dir: -1 | 1, idx: number) => {
    if (flash || won) return
    const next = [...order]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setOrder(next)
  }

  const check = () => {
    if (flash || won) return
    const wrong = new Set(order.map((id, i) => id !== correctIds[i] ? i : -1).filter(i => i >= 0))
    if (wrong.size === 0) {
      setFlash('correct')
      setWon(true)
      setTimeout(onWin, 900)
    } else {
      setWrongIdxs(wrong)
      setFlash('wrong')
      setTimeout(() => { setFlash(null); setWrongIdxs(new Set()) }, 1400)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <p className="text-amber-400 font-bold text-sm">{config.title}</p>
        <p className="text-slate-400 text-xs">{config.composer} · {config.year}</p>
        <p className="text-slate-500 text-xs mt-1">Arrange the movements in the correct order ↕</p>
      </div>

      <div className="flex flex-col gap-2">
        {order.map((id, idx) => {
          const p = passageMap[id]
          const isWrong = wrongIdxs.has(idx)
          const isCorrect = flash === 'correct'
          return (
            <div
              key={id}
              className={[
                'flex items-start gap-2 p-3 rounded-xl border transition-all duration-300',
                `bg-gradient-to-r ${p.color}`,
                isWrong    ? 'border-red-500/70'     :
                isCorrect  ? 'border-emerald-500/50'  :
                             'border-white/10',
              ].join(' ')}
            >
              <span className="text-2xl leading-none flex-shrink-0 mt-0.5 select-none">{p.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-amber-200 text-xs font-bold leading-tight">{p.title}</p>
                <p className="text-slate-300 text-[11px] leading-snug mt-0.5">{p.description}</p>
              </div>
              <div className="flex flex-col gap-0.5 flex-shrink-0 pt-0.5">
                <button onClick={() => swap(-1, idx)} disabled={idx === 0 || !!flash || won}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-20 text-xs transition-all">
                  ▲
                </button>
                <span className="text-[10px] text-slate-600 text-center tabular-nums">{idx + 1}</span>
                <button onClick={() => swap(1, idx)} disabled={idx === order.length - 1 || !!flash || won}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-20 text-xs transition-all">
                  ▼
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {!won && (
        <button onClick={check} disabled={!!flash}
          className="w-full py-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-bold rounded-xl hover:bg-amber-500/30 transition-all disabled:opacity-50">
          Check Order
        </button>
      )}

      {won && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <p className="text-emerald-400 font-bold text-sm text-center">Composition Complete!</p>
          <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{config.fact}</p>
        </div>
      )}
    </div>
  )
}
