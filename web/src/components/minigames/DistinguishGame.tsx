import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { resolveConfig, storyText, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'
import { plan, LOOKALIKE } from './distinguish/model'
import type { Shelf } from './distinguish/pairs'

// Distinguish: look-alikes side by side and one clue about the feature that
// tells them apart.  Pick the picture the clue asks for; after each pick
// every picture is named so the difference sticks.  Rules and round building
// live in ./distinguish/model.ts.

interface DistinguishConfig {
  title: string
  intro: string
  shelves: Shelf[]
  fact: string
}

export const CONFIGS: Record<string, DistinguishConfig> = {
  'darwin-notebook': {
    title: 'Darwin’s Notebook',
    intro: 'Aboard the Beagle, Darwin learned to see the small differences between creatures that look alike. Read the clue and pick the right animal.',
    shelves: ['animals', 'birds-and-bugs'],
    fact: 'Darwin first labelled his Galápagos finches badly; it was the ornithologist John Gould who showed in 1837 that they were separate species, told apart mainly by their beaks.',
  },
  'field-guide': {
    title: 'The Field Guide',
    intro: 'A naturalist’s field guide teaches one thing above all: which feature to look for. Use the clue to tell each pair apart.',
    shelves: ['birds-and-bugs', 'earth-and-sky'],
    fact: 'Roger Tory Peterson’s Field Guide to the Birds (1934) drew arrows to the one mark that separates look-alike species, a method still used in field guides today.',
  },
  'grand-tour': {
    title: 'The Grand Tour',
    intro: 'Travelling Europe and the East, a young scholar must name what they see: columns, arches, ships and blades. Pick the one the clue describes.',
    shelves: ['buildings', 'craft'],
    fact: 'Vitruvius, writing about 25 BCE, described the Doric, Ionic and Corinthian orders and tied each to its proportions; Renaissance architects rediscovered his book in 1414.',
  },
  'naturalist': {
    title: 'The Naturalist’s Walk',
    intro: 'From the cave to the clouds, the world is full of look-alikes. Read the clue and choose well.',
    shelves: ['earth-and-sky', 'animals'],
    fact: 'Luke Howard named the clouds in 1802 using Latin, as Linnaeus had named plants: cumulus (heap), stratus (layer) and cirrus (curl of hair).',
  },
  'cabinet-of-curiosities': {
    title: 'Cabinet of Curiosities',
    intro: 'A collector’s cabinet holds everything from beetles to swords. Tell each pair apart by the clue.',
    shelves: ['animals', 'birds-and-bugs', 'buildings', 'craft', 'earth-and-sky'],
    fact: 'Ole Worm’s cabinet in 17th-century Copenhagen mixed fossils, tools and stuffed animals; he proved that “unicorn horns” were narwhal tusks.',
  },
}

export const CONFIG_IDS = Object.keys(CONFIGS)

export const distinguishArtUrl = (key: string) => `/distinguish/${key}.webp`

function Picture({ k }: { k: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <div className="absolute inset-0 bg-panel-2 flex items-center justify-center text-[10px] text-muted">picture</div>
  return <img src={distinguishArtUrl(k)} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" onError={() => setBroken(true)} />
}

export default function DistinguishGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const config = { ...resolveConfig(CONFIGS, configId, undefined, 'darwin-notebook'), ...storyText(params) }
  const game = useMemo(() => plan(config.shelves, difficulty, seed), [config.shelves, difficulty, seed])
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose })
  // The clock stops while a pick is being explained.
  const timer = useGameTimer({ seconds: game.seconds, running: !settled && !picked, onExpire: () => lose('Time ran out') })

  const round = game.rounds[index]
  const last = index === game.rounds.length - 1

  const pick = (key: string) => {
    if (picked || settled) return
    setPicked(key)
    // A miss costs a life and shows the answer; finish the set with a life left to win.
    if (key !== round.answer) {
      const m = mistakes + 1
      setMistakes(m)
      if (m >= game.lives) { lose(`That was the ${LOOKALIKE[key].name}`); return }
    }
    if (last) win()
  }
  const next = () => { setPicked(null); setIndex(i => i + 1) }

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-accent text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
          <p className="text-muted text-xs leading-relaxed">{config.intro}</p>
        </div>
        <div className="shrink-0 text-right text-[10px]">
          <p className="font-bold text-ink-2">D{difficulty}</p>
          <p className="text-muted" data-testid="dist-lives">{'♥'.repeat(Math.max(0, game.lives - mistakes))}{'♡'.repeat(Math.min(game.lives, mistakes))}</p>
        </div>
      </div>
      <div className="flex items-center gap-1" aria-label="rounds">
        {game.rounds.map((_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < index || (i === index && picked === round.answer) ? 'bg-emerald-500' : i === index ? 'bg-accent' : 'bg-panel'}`} />
        ))}
      </div>
      {timer.active && !settled && <TimerBar remaining={timer.remaining} total={timer.total} />}

      <div className="rounded-xl border border-line bg-panel p-3" data-testid="dist-clue">
        {round.clue.map(s => <p key={s} className="text-ink-2 text-xs leading-relaxed">{s}</p>)}
        <p className="text-ink text-sm font-bold mt-1.5">{round.ask}</p>
      </div>

      <div className={`grid gap-2 ${round.options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {round.options.map(k => {
          const right = k === round.answer
          const state = !picked ? '' : right ? 'border-emerald-500 ring-2 ring-emerald-500/50' : k === picked ? 'border-red-500 ring-2 ring-red-500/50' : 'border-line opacity-80'
          return (
            <button key={k} data-pick={k} onClick={() => pick(k)} disabled={!!picked || settled}
              className={`relative aspect-[4/3] rounded-xl overflow-hidden border ${state || 'border-line hover:border-accent'}`}>
              <Picture k={k} />
              {picked && (
                <span className={`absolute inset-x-0 bottom-0 text-[11px] font-bold px-1.5 py-1 text-white ${right ? 'bg-emerald-700/85' : 'bg-black/65'}`}>
                  {right ? '✓ ' : ''}{LOOKALIKE[k].name}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {picked && !settled && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted leading-snug">
            {picked === round.answer ? 'Right.' : `That was the ${LOOKALIKE[picked].name}.`} The {LOOKALIKE[round.answer].name} {LOOKALIKE[round.answer].trait}.
          </p>
          {!last && (
            <button data-action="next" onClick={next}
              className="shrink-0 px-4 py-1.5 rounded-lg bg-accent/20 border border-accent/40 text-accent text-xs font-bold">
              Next
            </button>
          )}
        </div>
      )}

      <OutcomeBanner outcome={outcome} detail={config.fact} winTitle="A sharp eye" loseTitle="Look again next time" />
    </div>
  )
}
