/**
 * Hand-extracted record of what web/src/pages/BattlePage.tsx actually implements.
 * Keep this in step with the engine; it is the "code side" of the trait and
 * achievement audit. Every entry cites the function it was read from.
 */
import type { StatKey } from '../types'

export const ENGINE_SOURCE = 'web/src/pages/BattlePage.tsx'

export const ENGINE_CONSTANTS = {
  locationsPerGame: 7,
  startingGP: 4,
  startingEvents: 2,
  startingFollowers: 8,
  followerDeckCopies: 3,
  followerBonus: 2,
  followerIdentityMatchBonus: 3,
  localSurvivalThreshold: 5,
  hazardMinStatThreshold: 5,
  hazardChancePerRound: 0.2,
  winningPointsToWin: 5,
  defaultAchievementTicks: 3,
  mappedAchievementTicks: 1,
  worthyOpponentMinStat: 5,
  localEventRounds: 99,
  globalCompetitionRounds: 1,
}

export const DOC_CONSTANTS = {
  localSurvivalThreshold: 10,   // docs/fight.md §5
  hazardTotalThreshold: 100,    // docs/fight.md §5 (sum of all stats)
}

export interface ImplementedTrait {
  figure: string
  /** Plain-language description of the code path. */
  engine: string
  /** Which stats the bonus can touch; 'all' when every stat. */
  stats: StatKey[] | 'all'
  /** Maximum magnitude the code can add (approximate for scaling traits). */
  magnitude: number
  /** Does the code match the card's trait text? */
  matchesCardText: boolean
  note: string
}

/** Source: traitBonusForGP(). */
export const IMPLEMENTED_TRAITS: Record<string, ImplementedTrait> = {
  'Belisarius': {
    figure: 'Belisarius',
    engine: '+3 to strength and politics while opponent cards at the location outnumber allied cards.',
    stats: ['strength', 'politics'], magnitude: 3, matchesCardText: false,
    note: 'Card text: +5 to ALL stats while outnumbered.',
  },
  'Imhotep': {
    figure: 'Imhotep',
    engine: '+4 to technique and intelligence while at least 2 allied followers are at the location.',
    stats: ['technique', 'intelligence'], magnitude: 4, matchesCardText: false,
    note: 'Card text: once per match grant a permanent +5 all stats to another allied GP.',
  },
  'Lu Yu': {
    figure: 'Lu Yu',
    engine: '+3 to every stat while it is the only allied GP at the location (opponent GPs are not checked).',
    stats: 'all', magnitude: 3, matchesCardText: false,
    note: 'Card text: +5 all stats when it is the only GP (any owner) at the location.',
  },
  'Andrew Mellon': {
    figure: 'Andrew Mellon',
    engine: '+2 wealth per allied Merchant follower at the location.',
    stats: ['wealth'], magnitude: 6, matchesCardText: false,
    note: 'Card text: extra achievement tick when another allied GP earns one.',
  },
  'Pericles': {
    figure: 'Pericles',
    engine: '+1 to every stat per allied follower at the location.',
    stats: 'all', magnitude: 8, matchesCardText: true,
    note: 'Matches card text.',
  },
  'Aspasia': {
    figure: 'Aspasia',
    engine: '+4 politics and intelligence while Pericles (any owner) is anywhere on the field.',
    stats: ['politics', 'intelligence'], magnitude: 4, matchesCardText: false,
    note: 'Card text: cannot be directly attacked; redirect eliminations to a follower.',
  },
  'Enkidu': {
    figure: 'Enkidu',
    engine: '+5 strength and +3 culture while any female GP (any owner) is at the location.',
    stats: ['strength', 'culture'], magnitude: 5, matchesCardText: false,
    note: 'Card text: Forest-feature locations give +2 strength / +2 technique to all allied cards. Locations have no feature data yet.',
  },
  'Lancelot': {
    figure: 'Lancelot',
    engine: '−5 politics, always.',
    stats: ['politics'], magnitude: -5, matchesCardText: false,
    note: 'Card text: wins all stat ties until it moves. Ties are never checked in the engine.',
  },
  'Marie Antoinette': {
    figure: 'Marie Antoinette',
    engine: '+8 wealth and −5 politics to herself, always.',
    stats: ['wealth', 'politics'], magnitude: 8, matchesCardText: false,
    note: 'Card text: −3 wealth to ALL GP at her location (including enemies).',
  },
  'Mani': {
    figure: 'Mani',
    engine: '+N belief and intelligence where N = number of distinct eras among all GP on the field.',
    stats: ['belief', 'intelligence'], magnitude: 7, matchesCardText: false,
    note: 'Card text: immune to survival; +3 all stats to allied cards when allied GPs of 2+ eras share the location.',
  },
  'Johannes Brahms': {
    figure: 'Johannes Brahms',
    engine: '+2 to the contested stat if the sum of that stat across allied GPs at the location is ≥ 13, otherwise −2.',
    stats: 'all', magnitude: 2, matchesCardText: false,
    note: 'Card text: threshold 25 and ±3. Followers are not counted in the code sum.',
  },
  'Sergei Eisenstein': {
    figure: 'Sergei Eisenstein',
    engine: 'Culture gains max(0, intelligence − culture), i.e. culture is raised to intelligence when lower.',
    stats: ['culture'], magnitude: 11, matchesCardText: false,
    note: 'Card text: play two event cards at once, once per match.',
  },
  'Gregory Peck': {
    figure: 'Gregory Peck',
    engine: '+3 reputation while the location has any active event.',
    stats: ['reputation'], magnitude: 3, matchesCardText: false,
    note: 'Card text: opponents must declare events; discard a follower to negate one. Code also has a lookup bug: it inspects the location of the first card in the list, not necessarily Peck\'s.',
  },
}

/** Source: ACHIEVEMENT_SPECS. Figures listed here need 1 tick; all others need 3. */
export const ACHIEVEMENT_SPECS: Record<string, StatKey> = {
  'Mohandas Gandhi': 'belief', 'Coco Chanel': 'culture', 'Mao Zedong': 'politics', 'Belisarius': 'strength',
  'Imhotep': 'technique', 'Lu Yu': 'culture', 'Alan Turing': 'intelligence', 'Andrew Mellon': 'wealth',
  'Audrey Hepburn': 'reputation', 'Clara Schumann': 'culture', 'Euclid': 'intelligence', 'Hua Mulan': 'strength',
  'Johannes Brahms': 'culture', 'Lancelot': 'strength', 'Li Qingzhao': 'culture', 'Marie Antoinette': 'wealth',
  'Miyamoto Musashi': 'strength', 'Sargon I': 'politics', 'Gilgamesh': 'strength', 'Enkidu': 'strength',
  'Pericles': 'politics', 'Aspasia': 'intelligence', 'Pleistoanax': 'politics', 'Cicero': 'politics',
  'Anaxagoras': 'intelligence', 'Zeno of Elea': 'intelligence', 'Al-Khwarizmi': 'technique', 'Mani': 'belief',
  'Titian': 'culture', 'Magellan': 'technique', 'Mother Teresa': 'belief', 'Carl Linnaeus': 'intelligence',
  'Robert Schumann': 'culture', 'Hendrik Lorentz': 'intelligence', 'Amelia Earhart': 'technique',
  'Sergei Eisenstein': 'culture', 'Edmund Hillary': 'strength', 'Tenzing Norgay': 'strength',
  'Itō Hirobumi': 'politics', 'Michael Jackson': 'culture', 'George Bernard Shaw': 'culture',
  'Gregory Peck': 'belief', 'Isabel I of Castile': 'belief', 'Manuel I of Portugal': 'wealth',
  'An Jung-geun': 'strength', 'Gregor Mendel': 'intelligence', 'Louis XVI': 'politics',
}

/** CPU visibility heuristics (cpuShouldDeployPublic). */
export const CPU_PUBLIC_TRAIT_FIGURES = ['Pericles', 'Aspasia', 'Imhotep', 'Lu Yu', 'Andrew Mellon', 'Enkidu', 'Mani']
export const CPU_PRIVATE_TRAIT_FIGURES = ['Belisarius', 'Miyamoto Musashi', 'Mao Zedong']

/** Everything in the repo that carries fight knowledge. */
export const SOURCE_INVENTORY: { path: string; role: string; kind: 'doc' | 'data' | 'code' | 'text' }[] = [
  { path: 'docs/fight.md', role: 'Board-game rulebook: setup, actions, visibility, scenarios, survival, global competition, acquiring cards, turn order, end of game.', kind: 'doc' },
  { path: 'docs/great-people-trait-idea.md', role: '28 draft trait + achievement ideas for GP (older wording than cards.json).', kind: 'doc' },
  { path: 'docs/great-people-card.md', role: 'Card attributes (eras, 32 identities, 8 stats, trait, achievement), follower and location attributes, building lists per era. Also an OLDER 3-stat battle design.', kind: 'doc' },
  { path: 'docs/era.md', role: 'Era year ranges.', kind: 'doc' },
  { path: 'docs/fight_rules.json', role: 'Rules registry maintained by this tool: doc text vs engine behaviour, status, notes.', kind: 'doc' },
  { path: 'data/cards.json', role: '80 Great People: 8 stats (1–12), identities, era, gender, trait text, achievement text. Source of truth, synced to web/iOS/Android.', kind: 'data' },
  { path: 'data/demo_cards.json', role: 'Demo deck with the same 80 figures on a 1–24 stat scale (used by collection demos, not battle).', kind: 'data' },
  { path: 'data/followers.json', role: '32 follower templates: identity → stat, bonus 2.', kind: 'data' },
  { path: 'data/location_cards.json', role: '142 location cards: buildings, capacity, per-stat bonuses, trait text (web only).', kind: 'data' },
  { path: 'data/locations.json', role: '140 locations (name, era, countries, buildings) used to lay out the board.', kind: 'data' },
  { path: 'web/src/pages/BattlePage.tsx', role: 'The only battle engine: decks, reducer (deploy/move/attack/events/achievements), trait bonuses, CPU AI, UI.', kind: 'code' },
  { path: 'web/src/types/index.ts', role: 'Battle state types (GameState, EventCard, OnboardCard, summaries).', kind: 'code' },
  { path: 'service/api/battle.py', role: 'Server match API: legacy one-stat-per-round comparison, first to 5. Not the board game.', kind: 'code' },
  { path: 'service/models/battle.py', role: 'Match / Round Datastore models for the server game.', kind: 'code' },
  { path: 'ios/GreatPeople/Features/Battle/BattleView.swift', role: 'Rules summary dialog (survival < 10, hazard < 100). No engine.', kind: 'text' },
  { path: 'android/app/src/main/kotlin/com/greatpeople/card/ui/screens/BattleScreen.kt', role: 'Rules summary dialog, same text as iOS. No engine.', kind: 'text' },
]
