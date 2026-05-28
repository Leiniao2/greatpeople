import { useState, useEffect } from 'react'

interface AuctionItem {
  id: string
  name: string
  hint: string
  trueValue: number
  startBid: number
  isTarget: boolean
}

interface Config {
  title: string
  description: string
  budget: number
  items: AuctionItem[]
  targetWins: number
}

const BID_STEP = 10
// AI will bid up to this fraction of an item's true value
const AI_MAX_MULT = 0.9

const CONFIGS: Record<string, Config> = {
  'venetian-auction': {
    title: 'Rialto Auction House',
    description: 'Win the starred target items to complete your collection. Watch your budget.',
    budget: 150,
    targetWins: 2,
    items: [
      { id: 'silk',     name: 'Eastern Silk Tapestry',   hint: 'A rare weave from the Levant',             trueValue: 40, startBid: 20, isTarget: false },
      { id: 'portrait', name: "Master's Portrait",        hint: 'Attributed to the finest Venetian hand',   trueValue: 80, startBid: 30, isTarget: true  },
      { id: 'glass',    name: 'Murano Glass Vase',        hint: 'Fragile island craftsmanship',             trueValue: 30, startBid: 15, isTarget: false },
      { id: 'spice',    name: 'Cinnamon & Pepper Bundle', hint: "A merchant's prize from the East",        trueValue: 55, startBid: 25, isTarget: true  },
      { id: 'compass',  name: "Navigator's Compass",      hint: 'Guides ships across unknown seas',         trueValue: 45, startBid: 20, isTarget: true  },
    ],
  },
  'tech-auction': {
    title: 'Silicon Valley Patent Auction',
    description: 'Bid on landmark computing assets. Win 2 starred items to secure the future.',
    budget: 200,
    targetWins: 2,
    items: [
      { id: 'mac',   name: 'First Macintosh Prototype',   hint: 'A personal computer that changed everything', trueValue: 90, startBid: 40, isTarget: true  },
      { id: 'lisa',  name: 'Apple Lisa Source Listing',   hint: 'The precursor to the modern desktop',        trueValue: 55, startBid: 20, isTarget: false },
      { id: 'xerox', name: 'Xerox PARC GUI Demo',         hint: 'The graphical interface that started it all', trueValue: 70, startBid: 25, isTarget: true  },
      { id: 'next',  name: 'NeXT Workstation Unit',       hint: 'Built for academics, born for the web',      trueValue: 50, startBid: 20, isTarget: false },
      { id: 'pixar', name: 'Early Pixar Partnership',     hint: 'A creative bet during the wilderness years', trueValue: 95, startBid: 35, isTarget: true  },
    ],
  },
  'gilded-auction': {
    title: 'Gilded Age Estate Sale',
    description: 'Bid on industrial-era assets. Secure at least 2 starred investments.',
    budget: 180,
    targetWins: 2,
    items: [
      { id: 'railroad', name: 'Railroad Bond Certificate', hint: 'A stake in the iron highway of progress',  trueValue: 80, startBid: 30, isTarget: true  },
      { id: 'steel',    name: 'Carnegie Steel Shares',     hint: 'The backbone of a growing nation',         trueValue: 70, startBid: 25, isTarget: true  },
      { id: 'painting', name: 'Hudson River School Canvas',hint: 'An American landscape in oils',            trueValue: 35, startBid: 15, isTarget: false },
      { id: 'clock',    name: 'Tiffany Mantel Clock',      hint: 'A gem of decorative craftsmanship',        trueValue: 40, startBid: 15, isTarget: false },
      { id: 'electric', name: 'Edison Patent License',     hint: 'The right to illuminate a city',           trueValue: 90, startBid: 35, isTarget: true  },
    ],
  },
}

type Phase = 'rules' | 'reveal' | 'bidding' | 'ai-thinking' | 'item-done' | 'finished'

export default function AuctionGame({
  configId,
  onWin,
}: {
  configId: string
  onWin: () => void
}) {
  const cfg = CONFIGS[configId] ?? CONFIGS['venetian-auction']

  const [itemIdx,    setItemIdx]    = useState(0)
  const [phase,      setPhase]      = useState<Phase>('rules')
  const [currentBid, setCurrentBid] = useState(cfg.items[0].startBid)
  const [playerHigh, setPlayerHigh] = useState(false)
  const [budget,     setBudget]     = useState(cfg.budget)
  const [wonIds,     setWonIds]     = useState<string[]>([])
  const [aiMsg,      setAiMsg]      = useState('')
  const [flash,      setFlash]      = useState<'win' | 'lose' | null>(null)
  const [result,     setResult]     = useState<'won' | 'lost' | null>(null)

  const item  = cfg.items[itemIdx]
  const aiMax = Math.floor(AI_MAX_MULT * item.trueValue)

  useEffect(() => {
    if (phase !== 'reveal') return
    const t = setTimeout(() => setPhase('bidding'), 600)
    return () => clearTimeout(t)
  }, [phase, itemIdx])

  function handleBid() {
    const newBid = currentBid + BID_STEP
    if (newBid > budget) return
    setCurrentBid(newBid)
    setPlayerHigh(true)
    setAiMsg('')
    setPhase('ai-thinking')

    setTimeout(() => {
      if (newBid > aiMax) {
        setAiMsg('No further bids — going once, twice…')
        setFlash('win')
        setTimeout(() => resolveItem(true, newBid), 1400)
      } else {
        const aiBid = newBid + BID_STEP
        setCurrentBid(aiBid)
        setPlayerHigh(false)
        setAiMsg(`Rival bids ${aiBid} coins.`)
        setPhase('bidding')
      }
    }, 1100)
  }

  function handlePass() {
    if (playerHigh) {
      setAiMsg('Sold!')
      setFlash('win')
      setTimeout(() => resolveItem(true, currentBid), 1400)
    } else {
      setAiMsg('Item goes to the rival.')
      setFlash('lose')
      setTimeout(() => resolveItem(false, currentBid), 1400)
    }
    setPhase('ai-thinking')
  }

  function resolveItem(playerWon: boolean, price: number) {
    const newWonIds  = playerWon ? [...wonIds, item.id] : wonIds
    const newBudget  = playerWon ? budget - price : budget
    setWonIds(newWonIds)
    setBudget(newBudget)
    setFlash(null)
    setPhase('item-done')

    setTimeout(() => {
      const next = itemIdx + 1
      if (next >= cfg.items.length) {
        const wonTargets = cfg.items.filter(i => i.isTarget && newWonIds.includes(i.id)).length
        setPhase('finished')
        const success = wonTargets >= cfg.targetWins
        setResult(success ? 'won' : 'lost')
        if (success) setTimeout(onWin, 1200)
      } else {
        setItemIdx(next)
        setCurrentBid(cfg.items[next].startBid)
        setPlayerHigh(false)
        setAiMsg('')
        setPhase('reveal')
      }
    }, 1600)
  }

  const targetItems  = cfg.items.filter(i => i.isTarget)
  const wonTargetCnt = targetItems.filter(i => wonIds.includes(i.id)).length
  const canBid       = phase === 'bidding' && currentBid + BID_STEP <= budget

  // ── Rules screen ──────────────────────────────────────────────────────────
  if (phase === 'rules') {
    return (
      <div className="flex flex-col gap-4 bg-[#0a0a18] text-white p-5 rounded-xl select-none">
        <div>
          <p className="text-amber-400 text-[10px] font-bold uppercase tracking-widest mb-1">{cfg.title}</p>
          <p className="text-white font-bold text-base">How the Auction Works</p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-slate-300">
          <div className="flex gap-2 items-start">
            <span className="text-amber-400 font-bold mt-0.5">💰</span>
            <span>You have <span className="text-amber-300 font-bold">{cfg.budget} coins</span> to bid with. Don't spend it all on decoys.</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className="text-amber-400 font-bold mt-0.5">★</span>
            <span>Items marked <span className="text-amber-300 font-bold">★ Target</span> are what you need. Win <span className="text-amber-300 font-bold">{cfg.targetWins}</span> of them to succeed.</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className="text-emerald-400 font-bold mt-0.5">↑</span>
            <span><span className="text-emerald-300 font-bold">Bid</span> — raise the current bid by {BID_STEP} coins. The rival will respond.</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className="text-slate-400 font-bold mt-0.5">→</span>
            <span><span className="text-slate-300 font-bold">Pass</span> — if you're the highest bidder, you <span className="text-emerald-300">win</span> the item at your price. If the rival is higher, you <span className="text-red-300">let it go</span>.</span>
          </div>
          <div className="flex gap-2 items-start">
            <span className="text-slate-500 font-bold mt-0.5">⚠</span>
            <span className="text-slate-400 text-xs">The rival will bid up to a hidden limit. Outbid that limit and they'll fold.</span>
          </div>
        </div>
        <button
          onClick={() => setPhase('reveal')}
          className="mt-1 py-3 rounded-xl bg-amber-500 text-slate-950 font-bold text-sm hover:bg-amber-400 active:scale-95 transition-all"
        >
          Start Auction →
        </button>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col bg-[#0a0a18] text-white select-none rounded-xl overflow-hidden" style={{ minHeight: 400 }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <p className="text-xs text-amber-400 font-semibold tracking-wide uppercase">{cfg.title}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Targets: {wonTargetCnt} / {cfg.targetWins} won
          </p>
        </div>
        <div className="text-right">
          <p className="text-amber-300 font-bold text-xl">{budget}</p>
          <p className="text-[10px] text-slate-600">coins remaining</p>
        </div>
      </div>

      {/* Item progress bar */}
      <div className="flex gap-1.5 px-4 py-2">
        {cfg.items.map((it, i) => (
          <div key={it.id} className={`h-1 flex-1 rounded-full transition-colors ${
            wonIds.includes(it.id)               ? 'bg-emerald-500' :
            i < itemIdx && !wonIds.includes(it.id) ? 'bg-slate-700'  :
            i === itemIdx                         ? 'bg-amber-500'   : 'bg-slate-800'
          }`} />
        ))}
      </div>

      {/* Main auction card */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-4">

        {item.isTarget && (
          <div className="mb-3 px-3 py-0.5 rounded-full border border-amber-500/50 bg-amber-500/15 text-amber-400 text-[10px] font-bold tracking-widest uppercase">
            ★ Target Item
          </div>
        )}

        <h2 className={`text-xl font-bold text-center mb-1 transition-opacity duration-500 ${phase === 'reveal' ? 'opacity-0' : 'opacity-100'}`}>
          {item.name}
        </h2>
        <p className="text-slate-400 text-sm text-center italic mb-6">"{item.hint}"</p>

        {/* Bid display */}
        <div className={`rounded-2xl border-2 px-10 py-5 text-center mb-4 transition-all duration-300 ${
          flash === 'win'  ? 'border-emerald-500 bg-emerald-500/10'  :
          flash === 'lose' ? 'border-red-500/50 bg-red-500/10'       :
          playerHigh       ? 'border-amber-500/60 bg-amber-500/10'   :
                             'border-slate-700 bg-slate-900/50'
        }`}>
          <p className="text-3xl font-black text-amber-300">{currentBid}</p>
          <p className="text-[10px] text-slate-500 mt-1">current bid (coins)</p>
          {phase === 'bidding' && playerHigh && (
            <p className="text-emerald-400 text-xs mt-1 font-semibold">You are highest bidder</p>
          )}
          {phase === 'bidding' && !playerHigh && currentBid > item.startBid && (
            <p className="text-rose-400 text-xs mt-1">Rival is highest</p>
          )}
        </div>

        {/* AI message / thinking */}
        {aiMsg && (
          <p className="text-slate-300 text-sm text-center italic mb-3">{aiMsg}</p>
        )}
        {phase === 'ai-thinking' && !aiMsg && (
          <div className="flex gap-1.5 mb-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-slate-600 animate-bounce"
                style={{ animationDelay: `${i * 0.14}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {phase === 'bidding' && (
        <div className="px-4 pb-5 grid grid-cols-2 gap-3">
          <button
            onClick={handlePass}
            className="py-4 rounded-xl font-bold text-sm border border-slate-700 text-slate-400 hover:border-slate-500 active:scale-95 transition-all"
          >
            {playerHigh ? 'Accept & Win' : 'Pass'}
          </button>
          <button
            onClick={handleBid}
            disabled={!canBid}
            className={`py-4 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              canBid
                ? 'bg-amber-500 text-black hover:bg-amber-400'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            Bid {currentBid + BID_STEP}
          </button>
        </div>
      )}

      {/* Won items strip */}
      {wonIds.length > 0 && phase !== 'finished' && (
        <div className="px-4 pb-3 flex gap-1.5 flex-wrap">
          {cfg.items.filter(i => wonIds.includes(i.id)).map(it => (
            <span key={it.id} className={`text-[10px] px-2 py-0.5 rounded-full border ${
              it.isTarget
                ? 'border-amber-500/50 text-amber-400 bg-amber-500/10'
                : 'border-slate-700 text-slate-500'
            }`}>
              {it.isTarget ? '★ ' : ''}{it.name}
            </span>
          ))}
        </div>
      )}

      {/* Finished overlay */}
      {phase === 'finished' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a18]/95 px-8">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 text-2xl font-black ${
            result === 'won' ? 'bg-amber-500/20 border-2 border-amber-500 text-amber-400' : 'bg-slate-800 border-2 border-slate-600 text-slate-400'
          }`}>
            {result === 'won' ? '★' : '—'}
          </div>
          <h3 className="text-xl font-bold mb-2">
            {result === 'won' ? 'Auction Won!' : 'Auction Closed'}
          </h3>
          <p className="text-slate-400 text-sm text-center">
            {result === 'won'
              ? `You secured ${wonTargetCnt} target items.`
              : `Only ${wonTargetCnt} of ${cfg.targetWins} targets acquired.`}
          </p>
          <button
            onClick={onWin}
            className="mt-6 px-8 py-3 rounded-xl font-bold text-sm bg-slate-700 text-slate-200 hover:bg-slate-600 active:scale-95 transition-all"
          >
            Continue →
          </button>
        </div>
      )}
    </div>
  )
}
