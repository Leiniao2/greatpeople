import { useState, useMemo } from 'react'

interface TradeEvent {
  text: string
  change: number  // price multiplier delta, e.g. +0.30 = +30%
}

interface TradeConfig {
  title: string
  good: string
  symbol: string
  unit: string
  startPrice: number
  startCash: number
  targetCash: number
  rounds: number
  events: TradeEvent[]
  fact: string
}

// ── Configs ───────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, TradeConfig> = {
  'silk-road': {
    title: 'Silk Road Merchant',
    good: 'Silk', symbol: '🧵', unit: 'bolt',
    startPrice: 50, startCash: 200, targetCash: 360,
    rounds: 8,
    events: [
      { text: 'Camel caravans blocked by sandstorm — supply delayed.',        change: +0.30 },
      { text: 'Emperor bans silk exports for the royal treasury.',             change: +0.35 },
      { text: 'Byzantine envoys arrive with urgent bulk order.',               change: +0.25 },
      { text: 'Persian merchants flood market with captured silk stores.',     change: -0.25 },
      { text: 'New route discovered, bypassing the dangerous eastern pass.',   change: +0.15 },
      { text: 'Merchant guild undercuts rivals — prices tumble.',              change: -0.20 },
      { text: 'Plague closes trading posts across the steppe.',                change: -0.30 },
      { text: 'War erupts; the western pass is cut off entirely.',             change: +0.40 },
      { text: 'Bumper mulberry harvest promises record silk production.',      change: -0.15 },
      { text: 'Nomadic raiders seize three caravans near Samarkand.',         change: +0.28 },
      { text: 'New silk-producing region opens in Central Asia.',              change: -0.18 },
      { text: 'Royal wedding: court demands ten thousand bolts immediately.',  change: +0.22 },
    ],
    fact: 'The Silk Road was not one road but a network of routes spanning 4,000 miles. Merchants rarely traveled the full length — goods changed hands many times, each trader profiting from the next leg of the journey.',
  },
  'spice-fleet': {
    title: 'Magellan\'s Spice Fleet',
    good: 'Pepper', symbol: '🌶', unit: 'sack',
    startPrice: 40, startCash: 200, targetCash: 380,
    rounds: 8,
    events: [
      { text: 'Monsoon floods the pepper fields of Malabar.',                  change: +0.32 },
      { text: 'Portuguese fleet arrives with 200 tons — prices collapse.',    change: -0.28 },
      { text: 'Spanish court orders spices for the royal feast.',              change: +0.20 },
      { text: 'New sea route to Maluku discovered — supply incoming.',        change: -0.22 },
      { text: 'Ottoman blockade cuts off the overland spice route.',           change: +0.38 },
      { text: 'Rival Dutch merchants undersell to capture the market.',       change: -0.25 },
      { text: 'Spice warehouse fire destroys half the Lisbon stock.',          change: +0.30 },
      { text: 'Antwerp speculators corner the pepper market.',                 change: +0.18 },
      { text: 'Harvest season: record crop of nutmeg and cloves.',             change: -0.20 },
      { text: 'English pirates seize two Spanish galleons near the Azores.',  change: +0.25 },
      { text: 'Magellan\'s fleet returns — first circumnavigation complete!', change: -0.15 },
      { text: 'Venice monopoly broken — prices open to competition.',         change: -0.18 },
    ],
    fact: 'A single shipload of spices could generate 1,000% profit. When Magellan\'s last ship Victoria returned in 1522 with 26 tons of cloves, it more than paid for the entire three-year expedition — despite losing four of five ships.',
  },
  'steel-stocks': {
    title: 'Carnegie Steel Exchange',
    good: 'Carnegie Steel', symbol: '⚙', unit: 'share',
    startPrice: 80, startCash: 500, targetCash: 850,
    rounds: 8,
    events: [
      { text: 'Transcontinental railroad expansion: steel demand surges.',    change: +0.28 },
      { text: 'Carnegie announces new Bessemer converter — output triples.',  change: -0.20 },
      { text: 'Strike at the Homestead mill halts production.',               change: +0.22 },
      { text: 'J.P. Morgan proposes merging all steel companies.',            change: +0.35 },
      { text: 'British steel undercuts US market — prices fall.',             change: -0.25 },
      { text: 'Bridge construction contracts signed in seven cities.',        change: +0.18 },
      { text: 'Panic of 1893 — banks call in loans, stocks crash.',           change: -0.35 },
      { text: 'New ore deposit found in the Mesabi Range — cheap supply.',    change: -0.22 },
      { text: 'Congress raises tariffs protecting domestic steel.',            change: +0.20 },
      { text: 'Boiler explosion shuts the Pittsburgh mill for six weeks.',    change: +0.15 },
      { text: 'Rockefeller buys into steel — market confidence soars.',      change: +0.25 },
      { text: 'Price war: Carnegie slashes prices to bankrupt rivals.',       change: -0.30 },
    ],
    fact: 'Andrew Carnegie sold Carnegie Steel to J.P. Morgan in 1901 for $480 million — roughly $17 billion today — creating U.S. Steel, the world\'s first billion-dollar corporation. Carnegie gave away 90% of his fortune before he died.',
  },
  'wedgwood-pottery': {
    title: 'Wedgwood China Market',
    good: 'Wedgwood China', symbol: '🏺', unit: 'set',
    startPrice: 30, startCash: 180, targetCash: 310,
    rounds: 8,
    events: [
      { text: 'Queen Charlotte orders a full service — royal warrant granted.', change: +0.32 },
      { text: 'Rival Staffordshire potteries undercut on price.',               change: -0.22 },
      { text: 'Grand Tour fashion: aristocrats demand classical designs.',       change: +0.25 },
      { text: 'Kaolin clay shortage delays new production run.',                 change: +0.20 },
      { text: 'Canal network opens — distribution costs halved.',               change: -0.18 },
      { text: 'French Revolution: continental luxury trade collapses.',          change: -0.28 },
      { text: 'Wedgwood\'s Etruria factory doubles capacity.',                   change: -0.15 },
      { text: 'American colonies place large orders before independence.',       change: +0.22 },
      { text: 'New jasperware line causes fashionable sensation in London.',     change: +0.30 },
      { text: 'Economic recession — households cut luxury spending.',            change: -0.25 },
      { text: 'Export licences granted for three new markets.',                  change: +0.18 },
      { text: 'Josiah Wedgwood\'s catalogue mailed to 10,000 customers.',       change: +0.15 },
    ],
    fact: 'Josiah Wedgwood was the first manufacturer to use direct mail catalogues, money-back guarantees, and celebrity endorsements — all before 1790. He pioneered mass-market luxury, making "good taste" affordable for the middle class.',
  },
  'apple-stock': {
    title: 'Apple Stock, 1997',
    good: 'Apple (AAPL)', symbol: '🍎', unit: 'share',
    startPrice: 12, startCash: 300, targetCash: 510,
    rounds: 8,
    events: [
      { text: 'Jobs returns to Apple — confidence rises despite losses.',         change: +0.22 },
      { text: 'Gil Amelio resigns — leadership vacuum spooks investors.',        change: -0.18 },
      { text: 'Microsoft invests $150M — Apple will survive.',                   change: +0.35 },
      { text: 'iMac concept leaked: colorful, simple, radical design.',          change: +0.28 },
      { text: 'Apple posts worst quarterly loss in company history.',             change: -0.30 },
      { text: '"Think Different" campaign launches — media frenzy.',             change: +0.20 },
      { text: 'Clones cancelled: Apple takes back control of Mac market.',       change: +0.18 },
      { text: 'Newton PDA scrapped — investors fear product contraction.',      change: -0.15 },
      { text: 'iMac ships to record pre-orders — 800,000 in first 5 months.',  change: +0.40 },
      { text: 'Dell suggests Apple should "close and return cash to investors."',change: -0.12 },
      { text: 'Jobs announces 90-day product line simplification.',             change: +0.15 },
      { text: 'Holiday sales disappoint — retail strategy unclear.',            change: -0.20 },
    ],
    fact: 'Apple stock was $12 when Jobs returned in 1997. By 2000 it was $50; by 2023 it passed $3 trillion market cap. Investors who bought $1,000 of Apple stock in 1997 held shares worth over $600,000 by 2023.',
  },
  'amsterdam-tulip': {
    title: 'Amsterdam Tulip Exchange',
    good: 'Tulip Bulbs', symbol: '🌷', unit: 'bulb',
    startPrice: 25, startCash: 150, targetCash: 270,
    rounds: 8,
    events: [
      { text: 'Semper Augustus variety — the most beautiful tulip ever seen.',  change: +0.40 },
      { text: 'Winter frost damages half the bulb stock in storage.',           change: +0.30 },
      { text: 'Futures contracts allow buying bulbs not yet planted.',           change: +0.22 },
      { text: 'New cultivar breaks — spectacular flame-streaked petals.',       change: +0.35 },
      { text: 'Buyers panic: nobody wants tulips anymore — crash begins.',      change: -0.50 },
      { text: 'Speculative fever peaks: a single bulb buys a house.',           change: +0.45 },
      { text: 'Government refuses to enforce tulip futures contracts.',         change: -0.40 },
      { text: 'Ottoman traders offer rare black tulip stock.',                  change: +0.25 },
      { text: 'Plague fear keeps buyers away from the auction house.',          change: -0.20 },
      { text: 'Florist guilds meet to set minimum prices.',                    change: +0.15 },
      { text: 'Broken bulbs (mosaic virus) condemned — rarity drives up price.',change: +0.28 },
      { text: 'Market collapses overnight — most contracts worthless.',        change: -0.55 },
    ],
    fact: 'Tulip Mania (1636–37) is history\'s first recorded speculative bubble. At peak, a single Semper Augustus bulb sold for 10,000 guilders — the price of a canal house in Amsterdam. The crash came in February 1637 in a matter of days.',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNum(n: number) { return Math.round(n).toLocaleString() }

function SparkLine({ prices }: { prices: number[] }) {
  if (prices.length < 2) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const W = 200, H = 48
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W
    const y = H - ((p - min) / range) * (H - 8) - 4
    return `${x},${y}`
  }).join(' ')
  const last = prices[prices.length - 1]
  const prev = prices[prices.length - 2]
  const up = last >= prev
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <polyline points={pts} fill="none"
        stroke={up ? '#34d399' : '#f87171'} strokeWidth="2" strokeLinejoin="round" />
      {prices.map((p, i) => {
        const x = (i / (prices.length - 1)) * W
        const y = H - ((p - min) / range) * (H - 8) - 4
        return <circle key={i} cx={x} cy={y} r="3"
          fill={i === prices.length - 1 ? (up ? '#34d399' : '#f87171') : 'rgba(255,255,255,0.3)'} />
      })}
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TradeGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['silk-road']

  // Shuffle events once on mount
  const shuffledEvents = useMemo(() => {
    const e = [...cfg.events]
    for (let i = e.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [e[i], e[j]] = [e[j], e[i]]
    }
    return e.slice(0, cfg.rounds)
  }, [cfg])

  const [round, setRound] = useState(0)          // 0 = not started, 1..rounds = active
  const [phase, setPhase] = useState<'event'|'result'>('event')
  const [cash, setCash] = useState(cfg.startCash)
  const [holdings, setHoldings] = useState(0)
  const [price, setPrice] = useState(cfg.startPrice)
  const [priceHistory, setPriceHistory] = useState<number[]>([cfg.startPrice])
  const [qty, setQty] = useState(1)
  const [lastChange, setLastChange] = useState<number | null>(null)
  const [won, setWon] = useState(false)
  const [lost, setLost] = useState(false)

  const portfolioValue = cash + holdings * price
  const currentEvent = round >= 1 && round <= shuffledEvents.length ? shuffledEvents[round - 1] : null

  const maxBuy = Math.floor(cash / price)
  const maxSell = holdings

  const applyAction = (action: 'buy' | 'sell' | 'hold') => {
    let newCash = cash
    let newHoldings = holdings
    if (action === 'buy' && qty > 0 && qty <= maxBuy) {
      newCash = cash - qty * price
      newHoldings = holdings + qty
    } else if (action === 'sell' && qty > 0 && qty <= maxSell) {
      newCash = cash + qty * price
      newHoldings = holdings - qty
    }
    setCash(newCash)
    setHoldings(newHoldings)

    // Apply price change
    const event = shuffledEvents[round - 1]
    const noise = (Math.random() - 0.5) * 0.10
    const newPrice = Math.max(
      Math.round(cfg.startPrice * 0.2),
      Math.round(price * (1 + event.change + noise))
    )
    setLastChange(newPrice - price)
    setPrice(newPrice)
    setPriceHistory(h => [...h, newPrice])
    setPhase('result')

    // Check end condition
    const finalPortfolio = newCash + newHoldings * newPrice
    if (round >= cfg.rounds) {
      if (finalPortfolio >= cfg.targetCash) {
        setWon(true)
        setTimeout(onWin, 800)
      } else {
        setLost(true)
      }
    }
  }

  const advance = () => {
    if (round >= cfg.rounds) return
    setRound(r => r + 1)
    setPhase('event')
    setQty(1)
    setLastChange(null)
  }

  const reset = () => {
    setRound(0)
    setPhase('event')
    setCash(cfg.startCash)
    setHoldings(0)
    setPrice(cfg.startPrice)
    setPriceHistory([cfg.startPrice])
    setQty(1)
    setLastChange(null)
    setWon(false)
    setLost(false)
  }

  // ── Intro screen ──────────────────────────────────────────────────────────

  if (round === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 bg-slate-950 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{cfg.symbol}</span>
          <span className="text-amber-400 font-bold text-sm tracking-wide">{cfg.title}</span>
        </div>
        <p className="text-slate-400 text-xs leading-relaxed">
          You have <span className="text-amber-400 font-bold">{formatNum(cfg.startCash)} gold</span> to trade{' '}
          <span className="text-white font-semibold">{cfg.good}</span> over {cfg.rounds} rounds.
          Reach <span className="text-emerald-400 font-bold">{formatNum(cfg.targetCash)} gold</span> to win.
        </p>
        <p className="text-slate-500 text-xs leading-relaxed">
          Each round shows a market event. Decide to BUY, SELL, or HOLD — then the new price reveals. Buy low, sell high.
        </p>
        <button onClick={() => { setRound(1); setPhase('event') }}
          className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm tracking-wide transition-all">
          Start Trading
        </button>
      </div>
    )
  }

  // ── Game over ─────────────────────────────────────────────────────────────

  if (won || lost) {
    const finalVal = cash + holdings * price
    return (
      <div className="flex flex-col gap-4 p-4 bg-slate-950 rounded-xl">
        <div className={`p-4 rounded-xl border text-center ${won ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <p className={`font-bold text-base mb-1 ${won ? 'text-emerald-300' : 'text-red-300'}`}>
            {won ? '✓ Trade Mastered!' : '✕ Short of Target'}
          </p>
          <p className="text-slate-400 text-sm">
            Final portfolio: <span className={won ? 'text-emerald-400' : 'text-red-400'}>{formatNum(finalVal)} gold</span>
            {' '}(target: {formatNum(cfg.targetCash)})
          </p>
        </div>
        <SparkLine prices={priceHistory} />
        <p className="text-slate-400 text-xs leading-relaxed">{cfg.fact}</p>
        {lost && (
          <button onClick={reset}
            className="w-full py-2.5 rounded-xl bg-white/[0.07] border border-white/10 text-slate-300 text-sm font-semibold hover:bg-white/10 transition-all">
            Try Again
          </button>
        )}
      </div>
    )
  }

  // ── Active round ──────────────────────────────────────────────────────────

  const progress = Math.min((portfolioValue / cfg.targetCash) * 100, 100)

  return (
    <div className="flex flex-col gap-3 p-4 bg-slate-950 rounded-xl select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-amber-400 font-bold text-sm">{cfg.symbol} {cfg.good}</span>
        <span className="text-slate-500 text-xs">Round {round}/{cfg.rounds}</span>
      </div>

      {/* Portfolio bar */}
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-500">Portfolio</span>
          <span className={portfolioValue >= cfg.targetCash ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
            {formatNum(portfolioValue)} / {formatNum(cfg.targetCash)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
          <div className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Cash', value: formatNum(cash) + 'g', color: 'text-slate-200' },
          { label: cfg.unit + 's held', value: holdings.toString(), color: 'text-indigo-300' },
          { label: 'Price', value: formatNum(price) + 'g', color: price > cfg.startPrice ? 'text-emerald-400' : 'text-red-400' },
        ].map(s => (
          <div key={s.label} className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.07]">
            <div className={`font-bold text-sm ${s.color}`}>{s.value}</div>
            <div className="text-slate-600 text-[10px] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2">
        <SparkLine prices={priceHistory} />
      </div>

      {/* Event */}
      {currentEvent && (
        <div className="rounded-xl p-3 bg-amber-500/[0.07] border border-amber-500/20">
          <p className="text-amber-200 text-xs leading-relaxed">{currentEvent.text}</p>
        </div>
      )}

      {phase === 'event' ? (
        /* Action phase */
        <div className="flex flex-col gap-2">
          {/* Qty control */}
          <div className="flex items-center justify-center gap-3">
            <button onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-8 h-8 rounded-lg bg-white/[0.07] border border-white/10 text-slate-300 hover:bg-white/10 text-lg transition-all">
              −
            </button>
            <span className="text-white font-bold text-lg w-8 text-center">{qty}</span>
            <button onClick={() => setQty(q => Math.min(Math.max(maxBuy, maxSell, 1), q + 1))}
              className="w-8 h-8 rounded-lg bg-white/[0.07] border border-white/10 text-slate-300 hover:bg-white/10 text-lg transition-all">
              +
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => applyAction('buy')} disabled={qty > maxBuy || maxBuy === 0}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all
                         bg-emerald-500/15 border-emerald-500/40 text-emerald-300
                         hover:bg-emerald-500/25 disabled:opacity-30 disabled:cursor-not-allowed">
              BUY {qty}
            </button>
            <button onClick={() => applyAction('hold')}
              className="px-4 py-2.5 rounded-xl font-bold text-sm border transition-all
                         bg-white/[0.06] border-white/10 text-slate-400 hover:bg-white/10">
              HOLD
            </button>
            <button onClick={() => applyAction('sell')} disabled={qty > maxSell || maxSell === 0}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm border transition-all
                         bg-red-500/15 border-red-500/40 text-red-300
                         hover:bg-red-500/25 disabled:opacity-30 disabled:cursor-not-allowed">
              SELL {qty}
            </button>
          </div>
        </div>
      ) : (
        /* Result phase */
        <div className="flex flex-col gap-2">
          <div className={`p-3 rounded-xl border text-center text-sm font-bold ${
            lastChange !== null && lastChange > 0
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}>
            Price {lastChange !== null && lastChange > 0 ? '↑' : '↓'} to {formatNum(price)}g
            {lastChange !== null && (
              <span className="ml-2 font-normal text-xs opacity-80">
                ({lastChange > 0 ? '+' : ''}{formatNum(lastChange)})
              </span>
            )}
          </div>
          {round < cfg.rounds ? (
            <button onClick={advance}
              className="w-full py-2.5 rounded-xl bg-amber-500/80 hover:bg-amber-500 text-slate-950 font-bold text-sm transition-all">
              Next Round →
            </button>
          ) : (
            <button onClick={() => {
              const finalVal = cash + holdings * price
              if (finalVal >= cfg.targetCash) { setWon(true); setTimeout(onWin, 800) }
              else setLost(true)
            }}
              className="w-full py-2.5 rounded-xl bg-amber-500/80 hover:bg-amber-500 text-slate-950 font-bold text-sm transition-all">
              See Results
            </button>
          )}
        </div>
      )}
    </div>
  )
}
