import { useMemo, useState } from 'react'
import type { Difficulty, MinigameProps } from '@/games/types'
import { mulberry32, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Debate: an opponent makes a claim each round; answer with the evidence
// card that rebuts it.  Strong rebuttals move the persuasion meter toward
// you, weak or irrelevant ones toward the opponent.  Reach the winning mark
// before the meter empties.
//
// Difficulty: more rounds and a higher mark, a harsher penalty for weak
// cards, and from tier 3 a clock.  A card's strength is shown only once it
// is played (showing it up front made the game "tap the biggest number"),
// so D1–D2 ask for a lower mark that forgives a weak reply.

interface Card { text: string; effect: number; tag?: string }
interface Round { claim: string; speaker?: string; cards: Card[] }

interface DebateConfig {
  title: string
  intro: string
  opponent: string
  rounds: Round[]
  fact: string
}

export const CONFIGS: Record<string, DebateConfig> = {
  'socrates-apology': {
    title: 'The Apology',
    intro: 'Athens, 399 BCE. Meletus accuses Socrates before 501 jurors. Answer each charge as Socrates did — with questions that turn the charge on itself.',
    opponent: 'Meletus',
    rounds: [
      { claim: 'Socrates corrupts the young of Athens.', cards: [
        { text: 'Who then improves them? If everyone but me improves the young, how lucky they are — and how unlikely.', effect: 3 },
        { text: 'I have never charged a fee; a corrupter would at least have been paid.', effect: 1 },
        { text: 'The young follow me because I am wise.', effect: -2 },
        { text: 'Meletus is young himself and cannot judge.', effect: -1 },
      ] },
      { claim: 'He does not believe in the gods of the city, but in new divinities.', cards: [
        { text: 'You say I believe in divine things yet in no gods — can a man believe in horsemanship and not in horses?', effect: 3 },
        { text: 'I attend the festivals like everyone else.', effect: 1 },
        { text: 'The gods of the city are stories for children.', effect: -3 },
        { text: 'Anaxagoras taught that the sun is a stone; blame him.', effect: -1 },
      ] },
      { claim: 'He makes the weaker argument appear the stronger.', cards: [
        { text: 'The oracle at Delphi said no one was wiser; I have only tried to learn what it meant by questioning those who claimed wisdom.', effect: 3 },
        { text: 'Aristophanes put those words in my mouth in a comedy, not in court.', effect: 2 },
        { text: 'A strong argument needs no defence.', effect: -1 },
        { text: 'If my arguments are weak, why fear them?', effect: 0 },
      ] },
      { claim: 'Then why not leave Athens and live quietly elsewhere?', cards: [
        { text: 'The unexamined life is not worth living; I would rather die than stop questioning.', effect: 3 },
        { text: 'Exile would be fine, provided I am paid.', effect: -3 },
        { text: 'I am too old to travel.', effect: -1 },
        { text: 'My friends would come with me.', effect: 0 },
      ] },
    ],
    fact: "Socrates was convicted by a vote of roughly 280 to 220 and, offered the chance to propose his own penalty, suggested free meals for life in the Prytaneum. The jury chose death. Plato's Apology is the record his student wrote of the defence.",
  },
  'zeno-paradoxes': {
    title: 'In Defence of the One',
    intro: 'Athens, at the Great Panathenaea. Parmenides\' critics laugh at the claim that all is one and unchanging. Zeno answers each objection by showing where it leads.',
    opponent: 'A Critic of Parmenides',
    rounds: [
      { claim: 'Look around you: things are many, not one.', cards: [
        { text: 'If things are many, they must be both like and unlike each other — and that is impossible. So the many cannot be.', effect: 3 },
        { text: 'Many things may still share one nature.', effect: 1 },
        { text: 'Parmenides said so, and that is enough.', effect: -2 },
        { text: 'Count them, then.', effect: 0 },
      ] },
      { claim: 'Swift Achilles plainly overtakes the slow tortoise.', cards: [
        { text: 'First he must reach the place the tortoise left; by then it has moved on, and so again, without end. He never catches it.', effect: 3 },
        { text: 'Races are a matter of luck.', effect: -1 },
        { text: 'The tortoise is faster than it looks.', effect: -2 },
        { text: 'Achilles might stumble.', effect: 0 },
      ] },
      { claim: 'An arrow in flight is moving.', cards: [
        { text: 'At each instant it fills a space equal to itself, so at each instant it is at rest. When, then, does it move?', effect: 3 },
        { text: 'It only seems to move because it is quick.', effect: 1 },
        { text: 'The archer is the one who moves.', effect: -1 },
        { text: 'Arrows are not real.', effect: -2 },
      ] },
      { claim: 'Anyone can walk the length of the stadium.', cards: [
        { text: 'Before the end he must reach the half, before the half the quarter — infinitely many places to pass in a finite time.', effect: 3 },
        { text: 'The stadium is very long.', effect: -1 },
        { text: 'Then let him run.', effect: -2 },
        { text: 'Walking is not the same as moving.', effect: 0 },
      ] },
    ],
    fact: 'In Plato\'s Parmenides, Zeno comes to Athens with Parmenides for the Great Panathenaea and reads his book aloud. He says he wrote it as a young man to defend his teacher: if things are many, he argued, even stranger consequences follow than from saying all is one.',
  },
  'euclid-proof': {
    title: 'No Royal Road',
    intro: 'Alexandria, c. 300 BCE. A king, a student and a sceptic each want geometry made easier. Answer them as Euclid would.',
    opponent: 'The Doubters',
    rounds: [
      { claim: 'Is there no shorter way to geometry than all thirteen books of your Elements?', speaker: 'King Ptolemy', cards: [
        { text: 'There is no royal road to geometry.', effect: 3 },
        { text: 'For you, my king, I will write a short version.', effect: -2 },
        { text: 'Read only the first book.', effect: -1 },
        { text: 'Ask the philosophers in Athens.', effect: 0 },
      ] },
      { claim: 'What shall I gain by learning these things?', speaker: 'A student', cards: [
        { text: 'Give him a coin, since he must make a profit from what he learns.', effect: 3 },
        { text: 'It will help you survey land.', effect: 1 },
        { text: 'A post at court.', effect: -1 },
        { text: 'Nothing; it is useless.', effect: -2 },
      ] },
      { claim: 'Why prove what anyone can see in a drawing?', speaker: 'A sceptic', cards: [
        { text: 'A drawing can fool the eye and shows one triangle; a proof from the postulates holds for every triangle at once.', effect: 3 },
        { text: 'Because the king demands proofs.', effect: -2 },
        { text: 'Drawings are easily smudged.', effect: -1 },
        { text: 'Plato would have wanted it.', effect: 0 },
      ] },
      { claim: 'Surely the primes run out somewhere. No one has counted them all.', speaker: 'A sceptic', cards: [
        { text: 'Take any primes you like, multiply them and add one. None of them divides the result, so there is always another prime.', effect: 3 },
        { text: 'I have counted past a thousand and found more.', effect: -1 },
        { text: 'The gods made them endless.', effect: -2 },
        { text: 'There are as many primes as stars.', effect: -1 },
      ] },
    ],
    fact: 'Proclus tells of Euclid\'s answer to Ptolemy I, and Stobaeus of the student who asked what he would gain. Book IX, Proposition 20 of the Elements proves that there are more primes than any number you name — the proof is still taught today.',
  },
  'hutton-kirwan': {
    title: 'Fire against Water',
    intro: 'Edinburgh, 1790s. Richard Kirwan, champion of the Neptunists, attacks the Theory of the Earth. Answer each charge with what the rocks themselves show.',
    opponent: 'Richard Kirwan',
    rounds: [
      { claim: 'Every rock, granite included, settled out of a universal ocean that once covered the globe.', cards: [
        { text: 'At Glen Tilt veins of red granite run up into the schist and break it apart. The granite was molten, and it forced its way in after the schist was laid down.', effect: 3 },
        { text: 'No one has ever seen granite settle out of water.', effect: 1 },
        { text: 'Water cannot make anything so hard.', effect: -1 },
        { text: 'Werner has never visited Scotland.', effect: -2 },
      ] },
      { claim: 'Scripture fixes the age of the world at a few thousand years.', cards: [
        { text: 'At Siccar Point upright strata were raised, worn flat and buried under new sandstone. Rivers do that work grain by grain; no few thousand years could hold it.', effect: 3 },
        { text: 'Scripture was not written to teach mineralogy.', effect: 1 },
        { text: 'The Bible is wrong.', effect: -3 },
        { text: 'Nobody can know how old the world is.', effect: -1 },
      ] },
      { claim: 'A theory that finds no beginning denies the Creator.', cards: [
        { text: 'I find no vestige of a beginning — that is the limit of the evidence, not a denial of design. A world that repairs itself shows more wisdom, not less.', effect: 3 },
        { text: 'My theory says nothing about religion at all.', effect: 0 },
        { text: 'Many good Christians agree with me.', effect: 1 },
        { text: 'Then so much the worse for the Creator.', effect: -3 },
      ] },
      { claim: 'If rivers wear the land away, the continents should long ago have washed into the sea.', cards: [
        { text: 'So they would, unless they are renewed: heat below the ocean floor hardens the sediments and lifts them up as new land — which is why sea shells lie in mountain strata.', effect: 3 },
        { text: 'Erosion is far too slow to matter.', effect: -1 },
        { text: 'Perhaps the continents are shrinking.', effect: -2 },
        { text: 'Rivers carry away only soil, never rock.', effect: 0 },
      ] },
    ],
    fact: 'In 1793 the Irish chemist Richard Kirwan attacked Hutton’s theory as contrary to reason and to Scripture. Hutton answered by expanding it into the two-volume Theory of the Earth (1795), and his friend John Playfair’s clearer Illustrations of the Huttonian Theory (1802) won it readers.',
  },
  'nzinga-luanda': {
    title: 'The Talks at Luanda',
    intro: 'Luanda, 1622. Governor João Correia de Sousa demands that Ndongo submit to Portugal. Nzinga, envoy of her brother Ngola Mbandi, answers him — pick the reply that keeps her kingdom free.',
    opponent: 'Governor Correia de Sousa',
    rounds: [
      { claim: 'Ndongo must become a vassal of the King of Portugal and pay him a yearly tribute.', cards: [
        { text: 'Tribute is paid by the conquered. Ndongo has not been conquered: we come as one sovereign to another, offering friendship, not submission.', effect: 3 },
        { text: 'My brother may consider a small gift each year.', effect: -1 },
        { text: 'Portugal has no right to be in Africa at all.', effect: -2 },
        { text: 'We will answer after the rains.', effect: 0 },
      ] },
      { claim: 'Your brother\'s warriors attack our forts. Why should Portugal trust Ndongo?', cards: [
        { text: 'Pull your fort at Ambaca back from our land and stop arming the Imbangala bands who ravage both our peoples — and the fighting ends.', effect: 3 },
        { text: 'Our warriors only answer your raids.', effect: 1 },
        { text: 'Trust is for merchants, not kings.', effect: -2 },
        { text: 'Those warriors do not obey my brother.', effect: -1 },
      ] },
      { claim: 'A Christian king cannot ally himself with a pagan court.', cards: [
        { text: 'Then let me be baptised here in Luanda, and let the governor stand as my godfather.', effect: 3 },
        { text: 'Our own gods have served Ndongo well.', effect: -1 },
        { text: 'The priests may visit our court.', effect: 1 },
        { text: 'Religion has nothing to do with treaties.', effect: -2 },
      ] },
      { claim: 'Why should Portugal treat with a woman instead of the king himself?', cards: [
        { text: 'I speak with my brother\'s authority and my own blood. You gave me no chair, so I made one — I sit at this table as your equal.', effect: 3 },
        { text: 'The king is too busy to come.', effect: -2 },
        { text: 'I am only a messenger.', effect: -1 },
        { text: 'In Ndongo women have ruled before.', effect: 1 },
      ] },
    ],
    fact: 'In 1622 Nzinga persuaded Governor João Correia de Sousa to treat Ndongo as an ally rather than a tributary vassal, and was baptised in Luanda as Dona Ana de Sousa. The story that she sat on a kneeling attendant because no chair was offered comes from the later account of the Capuchin missionary Cavazzi.',
  },
  'lincoln-douglas': {
    title: 'The Lincoln–Douglas Debates',
    intro: 'Illinois, 1858. Stephen Douglas defends popular sovereignty; Abraham Lincoln answers. Pick the reply that cuts deepest.',
    opponent: 'Stephen Douglas',
    rounds: [
      { claim: 'Each territory should decide for itself whether to permit slavery.', cards: [
        { text: 'A house divided against itself cannot stand; this government cannot endure permanently half slave and half free.', effect: 3 },
        { text: 'The Dred Scott decision already says a territory cannot exclude slavery — so what does your "choice" amount to?', effect: 3 },
        { text: 'Illinois voters will never accept this.', effect: -1 },
        { text: 'The founders would have been shocked.', effect: 0 },
      ] },
      { claim: 'Lincoln wants racial equality in every respect.', cards: [
        { text: 'In the right to eat the bread that his own hand earns, the Black man is my equal and the equal of every living man.', effect: 3 },
        { text: 'I have never said that; Judge Douglas invents my positions.', effect: 1 },
        { text: 'Equality is a matter for the courts.', effect: -1 },
        { text: 'The question is beneath this debate.', effect: -2 },
      ] },
      { claim: 'The Declaration of Independence was written for white men.', cards: [
        { text: 'If it is not true of all men, then by what logic does it protect any of us once a majority decides otherwise?', effect: 3 },
        { text: 'Jefferson owned slaves, so the Judge may be right.', effect: -3 },
        { text: 'The Declaration is not law.', effect: -1 },
        { text: 'Let the people of Kansas decide what it means.', effect: 0 },
      ] },
    ],
    fact: 'Lincoln lost the 1858 Senate race, but newspapers printed the seven debates in full across the country. The national reputation they built carried him to the Republican nomination and the presidency two years later.',
  },
  'wollstonecraft-vindication': {
    title: 'A Vindication',
    intro: "London, 1792. A critic repeats Rousseau's view of women; answer with Mary Wollstonecraft's arguments.",
    opponent: 'The Critic',
    rounds: [
      { claim: 'Women are naturally frivolous and need not be educated beyond pleasing men.', cards: [
        { text: 'Taught from infancy that beauty is woman\'s sceptre, the mind shapes itself to the body and roams its gilt cage — the frivolity is made, not born.', effect: 3 },
        { text: 'Some women are cleverer than most men.', effect: 1 },
        { text: 'Men are frivolous too.', effect: -1 },
        { text: 'Education is wasted on anyone.', effect: -3 },
      ] },
      { claim: 'Virtue in a woman means obedience.', cards: [
        { text: 'There can be no virtue without reason; an obedience that cannot judge is not virtue but habit.', effect: 3 },
        { text: 'Obedience is a fine quality in a servant.', effect: -2 },
        { text: 'Men should obey too.', effect: 0 },
        { text: 'The scriptures say nothing of the kind.', effect: 1 },
      ] },
      { claim: 'Educated women would neglect their children.', cards: [
        { text: 'How can a mother teach reason she was never allowed to use? Educate women and you educate the nursery.', effect: 3 },
        { text: 'Nurses can raise children.', effect: -2 },
        { text: 'Children need little teaching.', effect: -2 },
        { text: 'Many educated women have children.', effect: 1 },
      ] },
    ],
    fact: "A Vindication of the Rights of Woman (1792) argued that women appeared inferior only because they were denied education. It was widely read in its day, then eclipsed for a century before the suffrage movement reclaimed it.",
  },
  'eisenstein-montage': {
    title: 'The Kino-Fist',
    intro: 'Moscow, 1925–26. Critics, rivals and censors attack Battleship Potemkin. Answer each objection with Eisenstein’s own ideas about cinema.',
    opponent: 'The Critics',
    rounds: [
      { claim: 'Cinema is only theatre photographed.', cards: [
        { text: 'Cinema is montage: two shots placed side by side create a meaning that neither holds alone.', effect: 3 },
        { text: 'A camera can go where no stage can — up and down the Odessa Steps.', effect: 1 },
        { text: 'The theatre is dead, so it hardly matters.', effect: -2 },
        { text: 'Films sell more tickets than plays.', effect: -1 },
      ] },
      { claim: 'A film needs one hero for the audience to follow.', cards: [
        { text: 'In Potemkin the hero is the mass — the sailors and the people of Odessa acting together.', effect: 3 },
        { text: 'The sailor Vakulinchuk’s death gives the crowd its cause.', effect: 1 },
        { text: 'Stars cost too much to hire.', effect: -2 },
        { text: 'The audience will find a hero anyway.', effect: 0 },
      ] },
      { claim: 'There was no massacre on the Odessa Steps in 1905.', cards: [
        { text: 'Montage is not a newsreel: it builds the truth of 1905 out of fragments — the boots, the mother, the pram.', effect: 3 },
        { text: 'Troops did fire on the people of Odessa that June.', effect: 1 },
        { text: 'No one in the audience will check.', effect: -2 },
        { text: 'It is only a film.', effect: -1 },
      ] },
      { claim: 'Then cinema should simply record life as it is, as Vertov’s Kino-Eye does.', cards: [
        { text: 'Not a Kino-Eye but a Kino-Fist: a film must strike the spectator and change how he thinks.', effect: 3 },
        { text: 'A newsreel camera cannot cut between the rolling pram and the advancing boots.', effect: 1 },
        { text: 'Recording life is cheaper, but dull.', effect: -1 },
        { text: 'Life is too boring to film.', effect: -2 },
      ] },
    ],
    fact: 'In a 1925 essay Eisenstein answered the documentary-maker Dziga Vertov: what cinema needed, he wrote, was not a “Kino-Eye” but a “Kino-Fist” — films that strike the audience through the shock of montage.',
  },
}

/** Rounds played and the persuasion needed at a difficulty, bounded by what the best replies can score. */
export function debateTargets(cfg: Pick<DebateConfig, 'rounds'>, difficulty: Difficulty) {
  const roundsToPlay = Math.min(cfg.rounds.length, scale(difficulty, [2, 3, cfg.rounds.length, cfg.rounds.length]))
  const best = cfg.rounds.slice(0, roundsToPlay).reduce((sum, r) => sum + Math.max(0, ...r.cards.map(c => c.effect)), 0)
  // A short debate (3 rounds × +3) can never reach the flat 10 of tier 4; allow one slip at most.
  const winAt = Math.min(scale(difficulty, [4, 6, 9, 10]), Math.ceil(best * 0.85))
  return { roundsToPlay, winAt, best }
}

export default function DebateGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'socrates-apology')
  const { roundsToPlay, winAt } = debateTargets(cfg, difficulty)
  const penaltyScale = scale(difficulty, [1, 1.5, 2, 2])
  const timeLimit = scale(difficulty, [0, 0, 150, 120])

  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1000 })
  const timer = useGameTimer({ seconds: timeLimit, running: !settled, onExpire: () => lose('out of time') })

  const rng = useMemo(() => mulberry32(seed), [seed])
  const rounds = useMemo(() => cfg.rounds.slice(0, roundsToPlay).map(r => ({ ...r, cards: shuffle(r.cards, rng) })), [cfg, roundsToPlay, rng])

  const [roundIdx, setRoundIdx] = useState(0)
  const [meter, setMeter] = useState(0)
  const [played, setPlayed] = useState<number | null>(null)
  const round = rounds[roundIdx]
  const finished = roundIdx >= rounds.length

  const play = (i: number) => {
    if (settled || played !== null) return
    const card = round.cards[i]
    const delta = card.effect >= 0 ? card.effect : Math.round(card.effect * penaltyScale)
    const next = meter + delta
    setPlayed(i)
    setMeter(next)
    setTimeout(() => {
      if (next <= -4) { lose('the room turned against you'); return }
      const nextRound = roundIdx + 1
      if (nextRound >= rounds.length) {
        if (next >= winAt) win(); else lose('not persuasive enough')
        return
      }
      setRoundIdx(nextRound)
      setPlayed(null)
    }, 1100)
  }

  const pct = Math.max(0, Math.min(1, (meter + 4) / (winAt + 4)))

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div>
        <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
        <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
      </div>
      {timer.active && <TimerBar remaining={timer.remaining} total={timer.total} />}

      {/* Persuasion meter */}
      <div>
        <div className="flex justify-between text-[10px] text-muted">
          <span>{cfg.opponent}</span>
          <span>Round {Math.min(roundIdx + 1, rounds.length)} / {rounds.length} · need {winAt}</span>
          <span>You</span>
        </div>
        <div className="h-2 bg-panel rounded-full overflow-hidden border border-line">
          <div className={`h-full rounded-full transition-all duration-500 ${meter < 0 ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${pct * 100}%` }} />
        </div>
      </div>

      {!finished && !settled && (
        <>
          <div className="bg-panel border border-line rounded-xl p-3">
            <p className="text-[10px] text-muted uppercase tracking-widest mb-1">{round.speaker ?? cfg.opponent}</p>
            <p className="text-ink text-sm font-medium leading-snug">“{round.claim}”</p>
          </div>
          <div className="flex flex-col gap-2">
            {round.cards.map((card, i) => {
              const isPlayed = played === i
              let cls = 'bg-panel border-line text-ink-2 hover:border-accent/40'
              if (played !== null) {
                if (isPlayed) cls = card.effect > 0 ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-900' : 'bg-red-500/15 border-red-500/40 text-red-900'
                else cls = 'bg-panel border-line text-muted'
              }
              return (
                <button key={i} disabled={played !== null} onClick={() => play(i)}
                  className={`text-left px-3 py-2.5 rounded-xl border text-xs leading-snug transition-all ${cls}`}>
                  {card.text}
                  {isPlayed && (
                    <span className={`ml-2 font-bold ${card.effect > 0 ? 'text-emerald-700' : card.effect < 0 ? 'text-red-700' : 'text-muted'}`}>
                      {card.effect > 0 ? `+${card.effect}` : card.effect}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="The room is persuaded!" loseTitle="The argument is lost" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
