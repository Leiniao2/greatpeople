import { useMemo, useState } from 'react'
import type { MinigameProps } from '@/games/types'
import { mulberry32, resolveConfig, scale, useGameOutcome, OutcomeBanner } from './_shared'

// Caravan: a trading ledger across a chain of cities.  Each city buys and
// sells goods at its own prices; buy low here, carry, sell high there,
// through a fixed number of stops and a few events along the road.  Reach
// the profit target by the final city — go broke and the caravan is lost.
//
// Difficulty: higher target, fewer stops, harsher events, and from tier 3
// the next city's prices are hidden.

interface City { name: string; prices: Record<string, number> }
interface RoadEvent { text: string; effect: { good?: string; priceMul?: number; goldDelta?: number; lose?: string } }

interface CaravanConfig {
  title: string
  intro: string
  goods: string[]
  cities: City[]
  startGold: number
  /** Profit target at difficulty 1, as a multiple of startGold. */
  targetMul: number
  events: RoadEvent[]
  fact: string
}

const CONFIGS: Record<string, CaravanConfig> = {
  'silk-road': {
    title: 'The Silk Road',
    intro: "Lead a caravan from Chang'an to Constantinople. Silk is cheap in the east, glass and silver in the west — carry what each city wants.",
    goods: ['Silk', 'Spice', 'Glass', 'Horses'],
    cities: [
      { name: "Chang'an",  prices: { Silk: 10, Spice: 30, Glass: 45, Horses: 40 } },
      { name: 'Dunhuang',  prices: { Silk: 18, Spice: 26, Glass: 40, Horses: 28 } },
      { name: 'Samarkand', prices: { Silk: 28, Spice: 20, Glass: 32, Horses: 22 } },
      { name: 'Merv',      prices: { Silk: 36, Spice: 16, Glass: 24, Horses: 30 } },
      { name: 'Baghdad',   prices: { Silk: 44, Spice: 14, Glass: 18, Horses: 36 } },
      { name: 'Constantinople', prices: { Silk: 60, Spice: 24, Glass: 12, Horses: 50 } },
    ],
    startGold: 200, targetMul: 2,
    events: [
      { text: 'Bandits in the Taklamakan take a tenth of your gold.', effect: { goldDelta: -0.1 } },
      { text: 'A Sogdian merchant tips you: silk fetches double in the next city.', effect: { good: 'Silk', priceMul: 2 } },
      { text: 'Drought on the steppe — horses sell for half.', effect: { good: 'Horses', priceMul: 0.5 } },
      { text: 'A caravanserai host trades you a free camel load of spice.', effect: { goldDelta: 0.05 } },
    ],
    fact: "No single trader walked the Silk Road end to end; goods passed through many hands, and Sogdian merchants from Samarkand were its great middlemen. The name itself was coined by the geographer Ferdinand von Richthofen in 1877.",
  },
  'mansa-musa': {
    title: 'The Golden Pilgrimage',
    intro: "Mansa Musa's hajj of 1324 carried so much gold it crashed the price in Cairo. Trade gold, salt and copper across the Sahara without doing the same to yourself.",
    goods: ['Gold', 'Salt', 'Copper', 'Cloth'],
    cities: [
      { name: 'Timbuktu', prices: { Gold: 20, Salt: 40, Copper: 30, Cloth: 25 } },
      { name: 'Walata',   prices: { Gold: 26, Salt: 32, Copper: 28, Cloth: 28 } },
      { name: 'Taghaza',  prices: { Gold: 34, Salt: 10, Copper: 36, Cloth: 34 } },
      { name: 'Sijilmasa', prices: { Gold: 42, Salt: 22, Copper: 20, Cloth: 30 } },
      { name: 'Cairo',    prices: { Gold: 55, Salt: 30, Copper: 16, Cloth: 18 } },
    ],
    startGold: 240, targetMul: 1.8,
    events: [
      { text: 'Your own gold floods the market — gold sells for half here.', effect: { good: 'Gold', priceMul: 0.5 } },
      { text: 'A sandstorm costs a tenth of your gold in lost camels.', effect: { goldDelta: -0.1 } },
      { text: 'The Taghaza mines are closed; salt doubles ahead.', effect: { good: 'Salt', priceMul: 2 } },
      { text: 'A Berber guide finds a shortcut — you keep your coin.', effect: {} },
    ],
    fact: "Contemporary accounts say Mansa Musa travelled with 60,000 people and some 12,000 kg of gold. He gave away so much in Cairo that gold's value there fell for a decade, and he had to borrow at high interest on the way home.",
  },
  'hanseatic-league': {
    title: 'The Hansa',
    intro: 'Sail a Hanseatic cog from Novgorod to Bruges. Furs and wax go west, cloth and wine come east.',
    goods: ['Furs', 'Wax', 'Herring', 'Cloth'],
    cities: [
      { name: 'Novgorod', prices: { Furs: 12, Wax: 14, Herring: 30, Cloth: 44 } },
      { name: 'Reval',    prices: { Furs: 20, Wax: 18, Herring: 26, Cloth: 38 } },
      { name: 'Visby',    prices: { Furs: 26, Wax: 24, Herring: 18, Cloth: 32 } },
      { name: 'Lübeck',   prices: { Furs: 34, Wax: 30, Herring: 14, Cloth: 24 } },
      { name: 'Bruges',   prices: { Furs: 48, Wax: 40, Herring: 20, Cloth: 16 } },
    ],
    startGold: 220, targetMul: 1.9,
    events: [
      { text: 'The Sound toll: Denmark takes a tenth of your gold.', effect: { goldDelta: -0.1 } },
      { text: 'Lent approaches — herring doubles in the next port.', effect: { good: 'Herring', priceMul: 2 } },
      { text: 'A Flemish glut: cloth sells for half.', effect: { good: 'Cloth', priceMul: 0.5 } },
      { text: 'Fair winds; you arrive early and sell before the fleet.', effect: { goldDelta: 0.05 } },
    ],
    fact: 'The Hanseatic League of northern trading towns ran its own kontors from Novgorod to London and once went to war with Denmark over the herring trade. Its last diet met in 1669; Lübeck, Hamburg and Bremen still call themselves Hanseatic cities.',
  },
}

export default function CaravanGame({ configId, difficulty, seed, params, onWin, onLose }: MinigameProps) {
  const cfg = resolveConfig(CONFIGS, configId, params, 'silk-road')
  const target = Math.round(cfg.startGold * cfg.targetMul * scale(difficulty, [1, 1.15, 1.3, 1.5]))
  const stops = useMemo(() => {
    // Fewer stops at higher difficulty: drop middle cities, keep the ends.
    const drop = scale(difficulty, [0, 0, 1, 2])
    const middle = cfg.cities.slice(1, -1)
    return [cfg.cities[0], ...middle.slice(0, Math.max(1, middle.length - drop)), cfg.cities[cfg.cities.length - 1]]
  }, [cfg, difficulty])
  const hideNext = difficulty >= 3
  const eventChance = scale(difficulty, [0.3, 0.5, 0.6, 0.75])

  const rng = useMemo(() => mulberry32(seed), [seed])
  const { outcome, settled, win, lose } = useGameOutcome({ onWin, onLose, delayMs: 1000 })

  const [stop, setStop] = useState(0)
  const [gold, setGold] = useState(cfg.startGold)
  const [cargo, setCargo] = useState<Record<string, number>>(() => Object.fromEntries(cfg.goods.map(g => [g, 0])))
  const [priceMods, setPriceMods] = useState<Record<string, number>>({})
  const [news, setNews] = useState<string | null>(null)

  const city = stops[stop]
  const price = (good: string) => Math.max(1, Math.round(city.prices[good] * (priceMods[good] ?? 1)))
  const cargoValue = cfg.goods.reduce((a, g) => a + cargo[g] * price(g), 0)
  const netWorth = gold + cargoValue
  const last = stop === stops.length - 1

  const buy = (g: string, n: number) => {
    if (settled) return
    const cost = price(g) * n
    if (cost > gold) return
    setGold(gold - cost); setCargo({ ...cargo, [g]: cargo[g] + n })
  }
  const sell = (g: string, n: number) => {
    if (settled || cargo[g] < n) return
    setGold(gold + price(g) * n); setCargo({ ...cargo, [g]: cargo[g] - n })
  }

  const travel = () => {
    if (settled) return
    if (last) { if (netWorth >= target) win(); else lose('short of the target'); return }
    let nextGold = gold
    const mods: Record<string, number> = {}
    let text: string | null = null
    if (rng() < eventChance) {
      const ev = cfg.events[Math.floor(rng() * cfg.events.length)]
      text = ev.text
      if (ev.effect.goldDelta) nextGold = Math.round(nextGold * (1 + ev.effect.goldDelta))
      if (ev.effect.good && ev.effect.priceMul) mods[ev.effect.good] = ev.effect.priceMul
    }
    setGold(nextGold)
    setPriceMods(mods)
    setNews(text)
    setStop(stop + 1)
    if (nextGold <= 0 && cfg.goods.every(g => cargo[g] === 0)) lose('bankrupt on the road')
  }

  const nextCity = stops[stop + 1]

  return (
    <div className="flex flex-col gap-3 bg-paper-2 rounded-xl p-4 select-none">
      <div>
        <p className="text-accent/80 text-[10px] font-bold uppercase tracking-widest">{cfg.title}</p>
        <p className="text-muted text-xs leading-relaxed">{cfg.intro}</p>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>Stop <b className="text-ink">{stop + 1}</b> / {stops.length} · <b className="text-ink">{city.name}</b></span>
        <span>Worth <b className={netWorth >= target ? 'text-emerald-700' : 'text-ink'}>{netWorth}</b> / {target}</span>
      </div>
      <div className="h-1.5 bg-panel rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${netWorth >= target ? 'bg-emerald-600' : 'bg-accent'}`} style={{ width: `${Math.min(100, (netWorth / target) * 100)}%` }} />
      </div>
      {news && <p className="text-[11px] text-amber-800 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-1.5">⚑ {news}</p>}

      {/* Ledger */}
      <div className="rounded-xl border border-line overflow-hidden text-xs">
        <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_1.6fr] bg-panel px-3 py-1.5 text-[10px] uppercase tracking-widest text-muted">
          <span>Good</span><span>Here</span><span>{hideNext || !nextCity ? 'Next' : nextCity.name}</span><span className="text-right">Cargo</span>
        </div>
        {cfg.goods.map(g => {
          const mod = priceMods[g]
          return (
            <div key={g} className="grid grid-cols-[1.2fr_0.8fr_0.8fr_1.6fr] items-center px-3 py-1.5 border-t border-line">
              <span className="font-semibold text-ink">{g}</span>
              <span className={mod ? (mod > 1 ? 'text-emerald-700 font-bold' : 'text-red-700 font-bold') : 'text-ink-2'}>{price(g)}</span>
              <span className="text-muted">{nextCity ? (hideNext ? '?' : nextCity.prices[g]) : '—'}</span>
              <span className="flex items-center justify-end gap-1">
                <button disabled={settled} onClick={() => sell(g, 1)} className="w-6 h-6 rounded bg-panel border border-line text-ink-2 disabled:opacity-40">−</button>
                <span className="w-6 text-center font-bold text-ink">{cargo[g]}</span>
                <button disabled={settled} onClick={() => buy(g, 1)} className="w-6 h-6 rounded bg-panel border border-line text-ink-2 disabled:opacity-40">+</button>
                <button disabled={settled} onClick={() => buy(g, 5)} className="px-1.5 h-6 rounded bg-panel border border-line text-[10px] text-ink-2 disabled:opacity-40">+5</button>
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted">Gold <b className="text-ink">{gold}</b> · cargo worth <b className="text-ink">{cargoValue}</b></p>
        {!settled && (
          <button onClick={travel} className="px-4 py-2 rounded-xl bg-accent text-accent-fg font-bold text-xs hover:bg-accent-hover transition-all">
            {last ? 'Sell up and count the gold' : `Travel to ${nextCity.name} →`}
          </button>
        )}
      </div>

      <OutcomeBanner outcome={outcome} detail={cfg.fact} winTitle="A fortune made!" loseTitle="The caravan comes home poorer" />
    </div>
  )
}

// Every hand-authored config id; the registry test renders each one.
export const CONFIG_IDS = Object.keys(CONFIGS)
