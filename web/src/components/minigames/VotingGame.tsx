import { useState } from 'react'

interface Choice { label: string; gain: number; note: string }
interface Round { situation: string; choices: Choice[] }
interface VotingConfig {
  title: string
  intro: string
  target: number
  maxPossible: number
  rounds: Round[]
  fact: string
}

const CONFIGS: Record<string, VotingConfig> = {
  'roman-senate': {
    title: 'Senatorial Crisis',
    intro: "Cicero addresses the Senate. He must win enough senatorial votes to authorise emergency action against Catiline's conspirators.",
    target: 7, maxPossible: 9,
    rounds: [
      {
        situation: "Catiline sits in the Senate, glaring. You rise to speak. How do you open?",
        choices: [
          { label: '"How long, Catiline, will you abuse our patience?" — denounce him directly', gain: 3, note: 'The bold opening puts Catiline on the defensive and galvanises wavering senators.' },
          { label: 'Present evidence methodically before naming the accused', gain: 2, note: 'Careful, but loses the drama of the moment.' },
          { label: 'Propose a procedural delay to gather further evidence', gain: 1, note: 'Overly cautious — Catiline uses the delay to consolidate his allies.' },
        ],
      },
      {
        situation: "Senators fear executing citizens without trial sets a dangerous precedent. Cato demands death; Caesar argues for exile.",
        choices: [
          { label: 'Side with Cato — those who take arms against Rome forfeit their rights', gain: 3, note: 'Hard but decisive. The crisis demands the ultimate sanction.' },
          { label: 'Invoke the safety of the state superseding ordinary constitutional rights', gain: 2, note: 'Legally creative, though some senators remain uneasy.' },
          { label: 'Propose indefinite imprisonment pending a full trial', gain: 1, note: 'Too lenient — the conspirators use the delay to flee.' },
        ],
      },
      {
        situation: "Lentulus has been caught with incriminating letters sealed with his own ring. How do you present this evidence?",
        choices: [
          { label: 'Read the letters aloud and let Lentulus identify his own seal before the Senate', gain: 3, note: 'Devastating. The Senate erupts; Lentulus cannot deny it.' },
          { label: 'Summarise the evidence in your own words', gain: 2, note: 'Clear, but without the theatrical impact of the letters themselves.' },
          { label: 'Ask another senator to authenticate the letters', gain: 1, note: 'Diffuses the moment — the personal confrontation is lost.' },
        ],
      },
    ],
    fact: "Cicero's Catilinarian Orations (63 BCE) are among the most famous speeches in history. He secured the Senate's vote for emergency execution of the conspirators — and was later exiled for it, as Caesar's faction argued he had violated Roman citizens' right to trial. The tension between state security and civil liberties is 2,000 years old.",
  },
  'spanish-court': {
    title: "Isabel's Gamble",
    intro: 'Queen Isabel must build court support to fund Columbus\'s westward voyage. Sceptics are many; the treasury is drained by war.',
    target: 7, maxPossible: 9,
    rounds: [
      {
        situation: "The learned committee of Salamanca challenges Columbus's calculation of the Earth's circumference — they say it is far too small.",
        choices: [
          { label: "Point out that even if Columbus is wrong, the prize of a western route justifies the risk", gain: 3, note: 'Strategic framing — courtiers respond to ambition, not arithmetic.' },
          { label: "Stand behind Columbus and directly challenge the committee's mathematics", gain: 2, note: 'Bold, but risks embarrassing the scholars publicly.' },
          { label: "Commission a second committee from Alcalá to review the calculations", gain: 1, note: 'Another delay — Columbus has already waited years.' },
        ],
      },
      {
        situation: "Ferdinand is sceptical. The Granada war drains the treasury and he sees little return from Atlantic speculation.",
        choices: [
          { label: 'Offer your own jewels as collateral for the three ships', gain: 3, note: 'The personal sacrifice silences objectors. Ferdinand is moved.' },
          { label: 'Argue that the glory of Spain demands the gamble', gain: 2, note: 'Patriotism lands well but does not resolve the budget concern.' },
          { label: "Ask Columbus to find private Genoese investors to share the cost", gain: 1, note: 'Practical but diminishes the crown\'s claim to any profits.' },
        ],
      },
      {
        situation: "Court jesters mock Columbus's plan openly. The mood has turned. Key nobles hedge their support.",
        choices: [
          { label: 'Arrange a private dinner with Columbus and the key nobles to rebuild confidence', gain: 3, note: 'Personal diplomacy restores the coalition quietly and effectively.' },
          { label: 'Dismiss the jesters publicly — court is no place for mockery of enterprise', gain: 2, note: 'Assertive, though some nobles quietly resent the rebuke.' },
          { label: 'Press forward and sign the Capitulations of Santa Fe regardless', gain: 1, note: 'Contract signed, but without noble support the voyage begins in ill favour.' },
        ],
      },
    ],
    fact: "Isabel I of Castile finally approved Columbus's expedition in January 1492 — the same year Granada fell. The Capitulations of Santa Fe gave Columbus the title of Admiral and a share of any wealth discovered. Her gamble yielded the largest territorial windfall in European history. The jewels story is possibly apocryphal, but it endures because it captures Isabel's decisive character.",
  },
  'akkadian-council': {
    title: "Sargon's Council",
    intro: "Sargon of Akkad has conquered the Sumerian city-states. He must win loyalty among the governors to hold the world's first empire together.",
    target: 7, maxPossible: 9,
    rounds: [
      {
        situation: "The conquered Sumerian governors resist answering to a foreign king. How do you win their allegiance?",
        choices: [
          { label: 'Adopt Sumerian titles and worship Sumerian gods alongside Akkadian ones', gain: 3, note: 'Cultural bridge-building: Sargon earned legitimacy by becoming partly Sumerian. His daughter Enheduanna served as High Priestess of Ur.' },
          { label: 'Place Akkadian loyalists in each city to monitor the governors', gain: 2, note: 'Effective but breeds the resentment that will fuel future rebellions.' },
          { label: 'Demand tribute and threaten force for any resistance', gain: 1, note: 'Raw power works short-term but creates enemies at every border.' },
        ],
      },
      {
        situation: "Your daughter Enheduanna has been appointed High Priestess of Ur. The old priests object to a foreign woman holding the role.",
        choices: [
          { label: "Support Enheduanna — have her compose hymns that blend Akkadian and Sumerian worship", gain: 3, note: 'A masterstroke. Enheduanna became history\'s first named author; her hymns united the empire spiritually.' },
          { label: 'Negotiate with the priests — offer gifts and donations to the temple', gain: 2, note: 'Transactional peace, but their loyalty remains conditional on continued payment.' },
          { label: 'Remove the objecting priests and replace them with Akkadian loyalists', gain: 1, note: 'Silences dissent but permanently alienates the religious establishment.' },
        ],
      },
      {
        situation: "Rebellion breaks out in Ur. Three other governors waver on their pledges of loyalty.",
        choices: [
          { label: 'Personally lead the army to Ur — your visible command is the message', gain: 3, note: "Sargon's personal presence in the field was legendary. The rebellion collapses; the wavering governors fall back into line." },
          { label: 'Send your general to Ur while you address the wavering governors by envoy', gain: 2, note: 'Sound strategy, though splitting focus slows both responses.' },
          { label: 'Negotiate terms with the rebel leaders to end the crisis quickly', gain: 1, note: 'Concession reads as weakness — the other governors draw exactly the wrong lesson.' },
        ],
      },
    ],
    fact: "Sargon of Akkad (c. 2334–2279 BCE) built the world's first recorded empire, stretching from the Persian Gulf to the Mediterranean. His daughter Enheduanna, High Priestess of Ur, is history's first named author — her hymns to Inanna survive on clay tablets. Sargon's empire lasted 150 years through exactly this combination of military force and cultural assimilation.",
  },
  'athenian-assembly': {
    title: "The Parthenon Vote",
    intro: "Pericles addresses the Athenian Assembly. He must win a majority to fund the Parthenon — using tribute money from the Delian League.",
    target: 7, maxPossible: 9,
    rounds: [
      {
        situation: "Critics accuse you of using allied tribute — meant for defence — to build Athenian monuments. How do you answer?",
        choices: [
          { label: "Athens provides security for all the allies — a magnificent Athens is their greatest protection", gain: 3, note: 'The pragmatic argument lands: the Assembly cheers. Athens deserves to benefit from the leadership it provides.' },
          { label: "Promise to consult the allies before any further major expenditure", gain: 2, note: 'Placatory but undermines Athenian authority — a concession you may regret later.' },
          { label: "Point out that the treasury is in surplus — allies are paying no more than before", gain: 1, note: 'Technically correct but sounds evasive. The critics press harder.' },
        ],
      },
      {
        situation: "Phidias, your chosen sculptor, is accused of stealing temple gold. Your opponents use it to undermine the whole project.",
        choices: [
          { label: "Demonstrate publicly that the statue's gold is detachable for weighing — proving no theft occurred", gain: 3, note: "Brilliant. Phidias had suggested making the gold removable precisely for this purpose. The accusation collapses." },
          { label: 'Offer a full public audit of all temple accounts', gain: 2, note: 'Transparent, but delays the project and gives opponents a prolonged platform.' },
          { label: 'Dismiss the accusation as political persecution and move on', gain: 1, note: 'True, but without proof it looks like a cover-up.' },
        ],
      },
      {
        situation: "Sparta sends an envoy warning that Athenian power has grown too great. Some in the Assembly argue for restraint.",
        choices: [
          { label: "Athens will not be intimidated — we build as our greatness demands", gain: 3, note: "Pericles' defiance rallies the Assembly behind Athenian pride. The Parthenon proceeds." },
          { label: 'Reassure the Assembly that the Thirty Years\' Peace holds — Sparta is posturing', gain: 2, note: 'Calm and rational, but concedes rhetorical ground to Spartan pressure.' },
          { label: 'Propose a conference with Sparta to address their concerns', gain: 1, note: 'Diplomatic but reads as weakness in a chamber that voted for monuments, not modesty.' },
        ],
      },
    ],
    fact: "The Parthenon (447–432 BCE) was built under Pericles' direction by architects Ictinus and Callicrates, with sculpture by Phidias. Its columns are subtly curved to correct optical distortion; its proportions follow the golden ratio. The Elgin Marbles, now in the British Museum, were removed from its frieze in 1801.",
  },
  'versailles-crisis': {
    title: "The Hall of Mirrors",
    intro: "It is July 1789. The Bastille has fallen. Louis XVI must navigate three decisions that will define whether France has a revolution — or a king.",
    target: 7, maxPossible: 9,
    rounds: [
      {
        situation: "The National Assembly has declared itself the sovereign power of France. Your advisors are divided between recognition and force.",
        choices: [
          { label: 'Formally recognise the Assembly — demonstrate willingness to share power', gain: 3, note: 'The concession buys crucial goodwill. The moderate deputies might have steered the Revolution away from regicide.' },
          { label: 'Dismiss the Assembly and recall the old Estates-General', gain: 2, note: 'Preserves royal theory but inflames the crisis — the Assembly simply refuses to leave.' },
          { label: 'Deploy the army around Paris to signal royal strength', gain: 1, note: 'Triggers panic in the city. The Bastille falls the next day.' },
        ],
      },
      {
        situation: "Bread prices have tripled. A women's march is approaching Versailles with pikes and pitchforks. How do you receive them?",
        choices: [
          { label: 'Meet the delegation personally and promise to send grain wagons to Paris at once', gain: 3, note: "The personal gesture works: the crowd's fury softens. The march becomes a victory for the people, not a revolution." },
          { label: 'Send Marie Antoinette to address the crowd', gain: 2, note: 'She is composed and effective — but her appearance feeds the narrative of a detached queen.' },
          { label: 'Order the palace gates sealed and wait for military reinforcements', gain: 1, note: 'The crowd breaches the gates. The royal family is forcibly moved to Paris, prisoners in all but name.' },
        ],
      },
      {
        situation: "Your brother Artois and the court conservatives urge you to flee to the Austrian border and return with a foreign army.",
        choices: [
          { label: 'Remain in Paris — flee and you confirm you are at war with your own people', gain: 3, note: 'The one path to constitutional monarchy. Louis chose the opposite — and paid with his life.' },
          { label: 'Negotiate secretly with Prussia for military intervention', gain: 2, note: "Discovered, it becomes the evidence that convicts him of treason." },
          { label: 'Flee to Varennes with the royal family', gain: 1, note: 'He made this choice. He was caught, brought back, and the flight ended any hope of reconciliation.' },
        ],
      },
    ],
    fact: "Louis XVI was guillotined on 21 January 1793, convicted of treason. His fatal error — the Flight to Varennes in June 1791, attempting to reach Austrian troops — proved to the Revolutionary government that he was conspiring against France. Had he worked with the constitutional moderates in 1789, the Revolution might have produced a constitutional monarchy rather than a republic of terror.",
  },
  'mellon-treasury': {
    title: "The Treasury Decision",
    intro: "Andrew Mellon faces the Senate with his Revenue Act, proposing to slash the top income tax rate from 73% to 25%. He must win enough votes to pass it.",
    target: 7, maxPossible: 9,
    rounds: [
      {
        situation: "Progressive senators argue that cutting taxes on the wealthy will increase inequality while working Americans struggle.",
        choices: [
          { label: "High tax rates drive capital underground — lower rates produce more revenue by releasing investment", gain: 3, note: "The 'scientific taxation' argument. Tax revenues did rise in the 1920s — though critics disputed who benefitted." },
          { label: 'Present historical data showing that lower rates correlate with stronger growth periods', gain: 2, note: 'Persuasive to moderates, but progressives have their own data and push back hard.' },
          { label: 'Argue that productive citizens deserve to keep the fruits of their enterprise', gain: 1, note: 'Principled but politically toxic in an era of Progressive reform sentiment.' },
        ],
      },
      {
        situation: "Farm-state senators demand agricultural subsidies in exchange for their votes. The farmers are struggling while Wall Street booms.",
        choices: [
          { label: 'Offer targeted tax relief for agricultural businesses — within your fiscal framework', gain: 3, note: 'A workable compromise: farm senators get something real; Mellon avoids direct spending he opposes.' },
          { label: "Promise to revisit agricultural support in a separate bill next session", gain: 2, note: 'Kicks the issue forward — farm senators accept reluctantly, knowing they may never get the separate bill.' },
          { label: 'Reject agricultural intervention as outside Treasury\'s mandate', gain: 1, note: 'Philosophically consistent but loses four critical votes.' },
        ],
      },
      {
        situation: "The bill passes the Senate but hits a conference committee. Democrats insist on keeping the estate tax at 40%.",
        choices: [
          { label: 'Accept a slightly higher estate tax in exchange for the full income tax cuts', gain: 3, note: "Mellon prioritised income tax reduction above everything else. The estate tax concession was worth the trade." },
          { label: 'Delay the bill and build more public support before the final vote', gain: 2, note: 'Produces a stronger bill theoretically but risks losing the legislative momentum of the Harding boom.' },
          { label: 'Threaten to walk away from the compromise entirely', gain: 1, note: 'The other side calls the bluff. Mellon blinks first.' },
        ],
      },
    ],
    fact: "Andrew Mellon's Revenue Acts of 1921, 1924, and 1926 cut the top marginal tax rate from 73% to 25%. Tax revenues rose during the 1920s boom, but the same policies concentrated wealth so severely that the Great Depression, when it came, proved catastrophic. Mellon famously advised Hoover to 'liquidate labour, liquidate stocks, liquidate the farmers' in 1929 — advice that deepened the crisis he helped create.",
  },
  'mockingbird-jury': {
    title: "To the Jury",
    intro: "Atticus Finch closes his argument for Tom Robinson — an innocent man tried in 1930s Alabama. He must win enough jurors to his side.",
    target: 7, maxPossible: 9,
    rounds: [
      {
        situation: "The prosecution claims Mayella was beaten on her right side, implying a left-handed attacker. Tom Robinson's left arm is crippled.",
        choices: [
          { label: "Demonstrate Tom's crippled arm directly — he physically cannot have delivered those blows", gain: 3, note: "The physical evidence is irrefutable. Several jurors lean forward." },
          { label: "Focus on Mayella's inconsistent testimony under cross-examination", gain: 2, note: "Effective, but the concrete evidence is stronger." },
          { label: "Ask the jury to consider who in Maycomb has motive to lie", gain: 1, note: "Too indirect — without naming Bob Ewell the point is diffused." },
        ],
      },
      {
        situation: "The jury is all-white in a county where racial prejudice runs deep. The law alone may not be enough.",
        choices: [
          { label: "Appeal directly to their conscience — ask them to be honest with themselves in the jury room", gain: 3, note: "The moral directness cuts through. Atticus trusts the jury's better nature." },
          { label: "Invoke the Constitution's equal protection clause", gain: 2, note: "Legally sound, but legal argument alone seldom moves prejudiced hearts." },
          { label: "Focus exclusively on the forensic inconsistencies", gain: 1, note: "Technically correct, but it sidesteps the real barrier in that courtroom." },
        ],
      },
      {
        situation: "In your final words, you must give the jury a reason to acquit despite the social pressure of Maycomb.",
        choices: [
          { label: '"In this country our courts are the great levellers — all men are created equal." Leave them with that.', gain: 3, note: "The appeal to American ideals is the closing Atticus believes in — and it echoes." },
          { label: "Remind them that a miscarriage of justice will haunt this town's reputation", gain: 2, note: "Pragmatic, but Atticus doesn't argue from reputation — he argues from principle." },
          { label: "Ask them to imagine what Tom Robinson's children will think of Maycomb's justice", gain: 1, note: "Emotionally resonant but risks alienating jurors uncomfortable with that framing." },
        ],
      },
    ],
    fact: "Harper Lee's To Kill a Mockingbird (1960) is based partly on the 1931 Scottsboro Boys case. Atticus Finch's closing speech is one of American fiction's most quoted passages. In the novel, the jury convicts despite the evidence — Lee's point being that moral courage is not always enough against structural injustice.",
  },
}

export default function VotingGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const config = CONFIGS[configId] ?? CONFIGS['roman-senate']
  const [roundIdx, setRoundIdx] = useState(0)
  const [support, setSupport] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [finished, setFinished] = useState(false)
  const [won, setWon] = useState(false)

  const round = config.rounds[roundIdx]
  const isLast = roundIdx === config.rounds.length - 1

  const choose = (i: number) => {
    if (picked !== null) return
    setPicked(i)
    setSupport(s => s + round.choices[i].gain)
  }

  const advance = () => {
    if (isLast) {
      const finalSupport = support + (picked !== null ? 0 : 0)
      const didWin = finalSupport >= config.target
      setFinished(true)
      setWon(didWin)
      if (didWin) setTimeout(onWin, 800)
    } else {
      setRoundIdx(r => r + 1)
      setPicked(null)
    }
  }

  const supportPct = Math.min(support / config.maxPossible, 1)

  if (finished) {
    return (
      <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-4">
        <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
        <div className={`flex flex-col items-center gap-3 p-6 rounded-xl border ${won ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <span className="text-3xl">{won ? '🏛️' : '⚖️'}</span>
          <p className={`font-bold text-lg ${won ? 'text-emerald-300' : 'text-red-300'}`}>
            {won ? 'Motion Carried!' : 'Motion Defeated'}
          </p>
          <p className="text-slate-400 text-sm text-center">
            {won ? `You secured ${support} / ${config.maxPossible} support — enough to prevail.` : `You gathered ${support} / ${config.target} required — not enough.`}
          </p>
        </div>
        <div className="p-3 rounded-xl border bg-amber-500/10 border-amber-500/20 text-xs leading-relaxed text-slate-400">
          <span className="font-bold text-amber-300 mr-1">Historical note:</span>{config.fact}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 bg-slate-950 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-amber-400/80 text-[10px] font-bold uppercase tracking-widest">{config.title}</p>
        <p className="text-slate-500 text-[10px]">Round {roundIdx + 1} / {config.rounds.length}</p>
      </div>

      {roundIdx === 0 && (
        <p className="text-slate-400 text-xs leading-relaxed border-l-2 border-amber-500/30 pl-3">{config.intro}</p>
      )}

      {/* Support meter */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Support</span>
          <span>{support} / {config.target} needed</span>
        </div>
        <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-500"
            style={{ width: `${supportPct * 100}%` }}
          />
        </div>
        <div className="flex justify-end">
          <div
            className="h-2 w-px bg-white/30 relative"
            style={{ marginRight: `${(1 - config.target / config.maxPossible) * 100}%` }}
            title="Target"
          />
        </div>
      </div>

      {/* Situation */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
        <p className="text-white text-sm font-medium leading-snug">{round.situation}</p>
      </div>

      {/* Choices */}
      <div className="flex flex-col gap-2">
        {round.choices.map((ch, i) => {
          const isSelected = picked === i
          let cls = 'w-full text-left px-4 py-3 rounded-xl text-sm transition-all border '
          if (picked === null) {
            cls += 'bg-white/[0.04] border-white/10 text-slate-200 hover:border-amber-500/40 hover:text-white cursor-pointer'
          } else if (isSelected) {
            const good = ch.gain === 3
            cls += good
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
              : ch.gain === 2
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              : 'bg-red-500/10 border-red-500/20 text-red-200'
          } else {
            cls += 'bg-white/[0.02] border-white/[0.05] text-slate-500'
          }
          return (
            <button key={i} onClick={() => choose(i)} className={cls}>
              {ch.label}
              {isSelected && (
                <p className="text-xs mt-1 opacity-80 font-normal leading-relaxed">{ch.note}</p>
              )}
            </button>
          )
        })}
      </div>

      {picked !== null && (
        <button
          onClick={advance}
          className="py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 transition-all"
        >
          {isLast ? 'See Outcome →' : 'Next Round →'}
        </button>
      )}
    </div>
  )
}
