import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { mulberry32, shuffle, resolveConfig, scale, useGameOutcome, OutcomeBanner, useGameTimer, TimerBar } from './_shared'

// Debate: an opponent makes a claim each round; answer with the evidence
// card that rebuts it.  Strong rebuttals move the persuasion meter toward
// you, weak or irrelevant ones toward the opponent.  Reach the winning mark
// before the meter empties.
//
// Difficulty: more rounds needed, a harsher penalty for weak cards, and
// from tier 3 the cards' effects are hidden until played, plus a clock.

interface Card { text: string; effect: number; tag?: string }
interface Round { claim: string; speaker?: string; cards: Card[] }

interface DebateConfig {
  title: string
  intro: string
  opponent: string
  rounds: Round[]
  fact: string
}

const CONFIGS: Record<string, DebateConfig> = {
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
}

export default function DebateGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'socrates-apology')
  const roundsToPlay = Math.min(cfg.rounds.length, scale(difficulty, [2, 3, cfg.rounds.length, cfg.rounds.length]))
  const penaltyScale = scale(difficulty, [1, 1.5, 2, 2])
  const showEffects = difficulty < 3
  const winAt = scale(difficulty, [5, 7, 9, 10])
  const timeLimit = scale(difficulty, [0, 0, 150, 100])

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
                  {(showEffects || isPlayed) && (
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
