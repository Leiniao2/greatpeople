import { useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type WeaponKey = 'sword' | 'lance' | 'bow' | 'mace' | 'fire'
type EnemyType = 'knight' | 'beast' | 'archer' | 'mage' | 'giant'

interface Weapon { key: WeaponKey; emoji: string; name: string; tip: string }
interface EnemyDef { type: EnemyType; emoji: string; name: string; hp: number; attack: number }

interface BattleConfig {
  title: string
  playerHp: number
  enemies: EnemyDef[]
  fact: string
}

// ── Weapon & damage data ───────────────────────────────────────────────────────

const WEAPONS: Weapon[] = [
  { key: 'sword', emoji: '⚔️', name: 'Sword', tip: '↑ Beast'          },
  { key: 'lance', emoji: '🗡️', name: 'Lance', tip: '↑ Knight'         },
  { key: 'bow',   emoji: '🏹', name: 'Bow',   tip: '↑ Archer & Mage'  },
  { key: 'mace',  emoji: '🔨', name: 'Mace',  tip: '↑ Knight & Giant' },
  { key: 'fire',  emoji: '🔥', name: 'Fire',  tip: '↑ Mage & Giant'   },
]

// 0 = weak (1 dmg), 1 = normal (3 dmg), 2 = strong (6 dmg)
const EFF: Record<WeaponKey, Record<EnemyType, 0 | 1 | 2>> = {
  sword: { beast: 2, knight: 1, archer: 1, mage: 0, giant: 1 },
  lance: { knight: 2, beast: 0, archer: 1, mage: 1, giant: 1 },
  bow:   { archer: 2, mage: 2,  beast: 1,  knight: 0, giant: 0 },
  mace:  { knight: 2, giant: 2, beast: 1,  archer: 1, mage: 0 },
  fire:  { mage: 2,   giant: 2, beast: 0,  archer: 1, knight: 1 },
}

const DMG_TABLE: Record<0 | 1 | 2, number> = { 0: 1, 1: 3, 2: 6 }

// ── Configs ────────────────────────────────────────────────────────────────────

const CONFIGS: Record<string, BattleConfig> = {
  'roman-gladiator': {
    title: 'Arena of Rome',
    playerHp: 15,
    enemies: [
      { type: 'beast',  emoji: '🐯', name: 'Wild Tiger',          hp:  8, attack: 2 },
      { type: 'archer', emoji: '🎯', name: 'Parthian Bowman',     hp:  8, attack: 2 },
      { type: 'knight', emoji: '🤺', name: 'Champion Gladiator',  hp: 10, attack: 3 },
    ],
    fact: 'Roman gladiators specialized in specific weapons and fighting styles. A gladiator who showed skill and bravado could win the crowd — and their life.',
  },
  'samurai-path': {
    title: 'Path of the Samurai',
    playerHp: 15,
    enemies: [
      { type: 'beast',  emoji: '🐺', name: 'Mountain Wolf',     hp:  7, attack: 2 },
      { type: 'mage',   emoji: '🧙', name: 'Onmyoji Sorcerer',  hp:  8, attack: 2 },
      { type: 'knight', emoji: '🥷', name: 'Armored Daimyo',    hp: 12, attack: 3 },
    ],
    fact: 'Samurai warriors trained for years in bushido — the way of the warrior. A skilled samurai mastered multiple weapons: the katana, naginata (spear), and yumi (bow).',
  },
  'medieval-siege': {
    title: 'The Castle Gates',
    playerHp: 15,
    enemies: [
      { type: 'archer', emoji: '🏹', name: 'Castle Archer',   hp:  7, attack: 2 },
      { type: 'giant',  emoji: '👹', name: 'Siege Troll',     hp: 10, attack: 3 },
      { type: 'mage',   emoji: '🧙', name: 'Court Wizard',    hp:  8, attack: 2 },
      { type: 'knight', emoji: '🤺', name: 'Champion Knight', hp: 12, attack: 3 },
    ],
    fact: "Medieval knights chose weapons based on their opponent's armor. Maces became essential against plate armor — they could crush a knight without piercing the steel.",
  },
  'mongol-conquest': {
    title: 'Mongol Conquest',
    playerHp: 15,
    enemies: [
      { type: 'knight', emoji: '⚔️', name: 'Jin Dynasty Guard',    hp:  8, attack: 2 },
      { type: 'mage',   emoji: '🏮', name: 'Song Alchemist',       hp:  7, attack: 2 },
      { type: 'giant',  emoji: '🐘', name: 'War Elephant',         hp: 14, attack: 4 },
    ],
    fact: "The Mongol army's versatility was its greatest strength — mounted archers engaged from distance, then switched to lances for the charge and sabers in close combat.",
  },
}

// ── Component ──────────────────────────────────────────────────────────────────

interface LastResult { effLevel: 0|1|2; playerDmg: number; enemyDmg: number }

export default function BattleArenaGame({ configId, onWin }: { configId: string; onWin: () => void }) {
  const cfg = CONFIGS[configId] ?? CONFIGS['roman-gladiator']

  const [playerHp, setPlayerHp] = useState(cfg.playerHp)
  const [enemyIdx, setEnemyIdx] = useState(0)
  const [enemyHp, setEnemyHp] = useState(cfg.enemies[0].hp)
  const [phase, setPhase] = useState<'choose' | 'animating' | 'won' | 'lost'>('choose')
  const [lastResult, setLastResult] = useState<LastResult | null>(null)
  const [log, setLog] = useState<string[]>([])

  const enemy = cfg.enemies[enemyIdx]

  function attack(weapon: Weapon) {
    if (phase !== 'choose' || !enemy) return

    const effLevel = EFF[weapon.key][enemy.type]
    const playerDmg = DMG_TABLE[effLevel]
    const enemyDmg  = enemy.attack

    const newEnemyHp  = enemyHp  - playerDmg
    const newPlayerHp = playerHp - enemyDmg

    const effLabel = effLevel === 2 ? '⚡ Super effective!' : effLevel === 0 ? '🚫 Not effective' : '✓ Hit'
    setLog(prev => [`${weapon.emoji} vs ${enemy.name} — ${effLabel} (${playerDmg} dealt, ${enemyDmg} taken)`, ...prev].slice(0, 4))
    setLastResult({ effLevel, playerDmg, enemyDmg })
    setEnemyHp(Math.max(0, newEnemyHp))
    setPlayerHp(Math.max(0, newPlayerHp))
    setPhase('animating')

    setTimeout(() => {
      if (newPlayerHp <= 0) { setPhase('lost'); return }
      if (newEnemyHp <= 0) {
        const next = enemyIdx + 1
        if (next >= cfg.enemies.length) { setPhase('won'); return }
        setEnemyIdx(next)
        setEnemyHp(cfg.enemies[next].hp)
        setLastResult(null)
      }
      setPhase('choose')
    }, 1000)
  }

  function restart() {
    setPlayerHp(cfg.playerHp)
    setEnemyIdx(0)
    setEnemyHp(cfg.enemies[0].hp)
    setPhase('choose')
    setLastResult(null)
    setLog([])
  }

  if (phase === 'won') return (
    <div className="flex flex-col items-center gap-4 p-6 text-center">
      <div className="text-5xl">🏆</div>
      <div className="text-xl font-bold text-amber-400">Victory!</div>
      <p className="text-sm text-slate-300 max-w-xs leading-relaxed">{cfg.fact}</p>
      <button onClick={onWin} className="px-6 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-semibold text-slate-900">Complete</button>
    </div>
  )

  if (phase === 'lost') return (
    <div className="flex flex-col items-center gap-4 p-6 text-center">
      <div className="text-5xl">💀</div>
      <div className="text-xl font-bold text-red-400">Defeated!</div>
      <p className="text-sm text-slate-400 max-w-xs">Use the right weapon — the enemy type and tips tell you their weakness.</p>
      <button onClick={restart} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-semibold text-white">Try Again</button>
    </div>
  )

  const maxEnemyHp = cfg.enemies[enemyIdx]?.hp ?? 1

  return (
    <div className="flex flex-col gap-3 p-4 max-w-xs mx-auto select-none">
      <div className="text-center font-semibold text-amber-400 text-sm">{cfg.title}</div>

      {/* Enemy */}
      <div className="bg-slate-800 rounded-xl p-3 text-center border border-slate-700">
        <div className="text-5xl mb-1">{enemy.emoji}</div>
        <div className="font-semibold text-sm">{enemy.name}</div>
        <div className="text-xs text-slate-400 capitalize mb-2">Type: <span className="text-slate-300">{enemy.type}</span></div>
        <div className="w-full bg-slate-700 rounded-full h-2.5">
          <div
            className="bg-red-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${(Math.max(0, enemyHp) / maxEnemyHp) * 100}%` }}
          />
        </div>
        <div className="text-xs text-red-400 mt-1">{Math.max(0, enemyHp)}/{maxEnemyHp} HP · Enemy {enemyIdx + 1}/{cfg.enemies.length}</div>
      </div>

      {/* Player HP */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs text-slate-400 shrink-0">Your HP</span>
        <div className="flex-1 bg-slate-700 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(Math.max(0, playerHp) / cfg.playerHp) * 100}%` }}
          />
        </div>
        <span className="text-xs text-green-400 font-mono shrink-0">{Math.max(0, playerHp)}</span>
      </div>

      {/* Last result */}
      {lastResult && (
        <div className={`text-xs text-center py-1.5 rounded px-2 ${
          lastResult.effLevel === 2 ? 'text-yellow-300 bg-yellow-900/30' :
          lastResult.effLevel === 0 ? 'text-red-400 bg-red-900/20' :
          'text-slate-300 bg-slate-800'
        }`}>
          {lastResult.effLevel === 2 ? '⚡ Super effective! ' :
           lastResult.effLevel === 0 ? '🚫 Not very effective! ' : ''}
          Dealt {lastResult.playerDmg} dmg · Took {lastResult.enemyDmg} dmg
        </div>
      )}

      {/* Weapon buttons */}
      <div className="text-xs text-center text-slate-400">Pick your weapon:</div>
      <div className="grid grid-cols-5 gap-1.5">
        {WEAPONS.map(w => (
          <button
            key={w.key}
            onClick={() => attack(w)}
            disabled={phase !== 'choose'}
            className="flex flex-col items-center gap-0.5 bg-slate-700 hover:bg-slate-600 active:scale-95 disabled:opacity-40 rounded-lg p-2 transition-all"
          >
            <span className="text-2xl">{w.emoji}</span>
            <span className="text-xs text-slate-300 leading-tight">{w.name}</span>
            <span className="text-xs text-slate-500 leading-tight text-center">{w.tip}</span>
          </button>
        ))}
      </div>

      {/* Battle log */}
      {log.length > 0 && (
        <div className="bg-slate-900/70 rounded-lg p-2 space-y-0.5">
          {log.map((entry, i) => (
            <div key={i} className="text-xs text-slate-500 leading-snug">{entry}</div>
          ))}
        </div>
      )}
    </div>
  )
}
