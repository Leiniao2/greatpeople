// The single list of playable minigames.
//
// StoryViewer, the Arcade and the tests all read this instead of keeping
// their own switch statements, so adding a game is one entry here plus the
// component.  Each game is loaded on demand as its own chunk.

import { lazy, type LazyExoticComponent } from 'react'
import type { MinigameComponent } from './types'

export type Category = 'Puzzle' | 'Creative' | 'Story' | 'Explore' | 'Strategy'

export interface GameDef {
  label: string
  category: Category
  /** The game can be lost, not only won. False only for games still on the old win-only contract. */
  canLose: boolean
  load: () => Promise<{ default: MinigameComponent; CONFIG_IDS?: string[] }>
}

const def = (label: string, category: Category, load: GameDef['load'], canLose = false): GameDef =>
  ({ label, category, canLose, load })

export const GAMES = {
  maze:         def('Maze',          'Explore',  () => import('@/components/minigames/MazeGame')),
  mirror:       def('Mirror',        'Puzzle',   () => import('@/components/minigames/MirrorGame')),
  circuit:      def('Circuit',       'Puzzle',   () => import('@/components/minigames/CircuitGame')),
  sliding:      def('Sliding Tiles', 'Puzzle',   () => import('@/components/minigames/SlidingPuzzle')),
  crossword:    def('Crossword',     'Puzzle',   () => import('@/components/minigames/CrosswordGame')),
  geometry:     def('Geometry',      'Puzzle',   () => import('@/components/minigames/GeometryGame'), true),
  painting:     def('Painting',      'Creative', () => import('@/components/minigames/PaintingGame')),
  music:        def('Music',         'Creative', () => import('@/components/minigames/MusicGame')),
  tactics:      def('Tactics',       'Strategy', () => import('@/components/minigames/TacticsGame')),
  classify:     def('Classify',      'Puzzle',   () => import('@/components/minigames/ClassifyGame')),
  cooking:      def('Cooking',       'Creative', () => import('@/components/minigames/CookingGame')),
  fiction:      def('Fiction',       'Story',    () => import('@/components/minigames/FictionGame'), true),
  sudoku:       def('Sudoku',        'Puzzle',   () => import('@/components/minigames/SudokuGame')),
  voting:       def('Voting',        'Strategy', () => import('@/components/minigames/VotingGame')),
  chemistry:    def('Chemistry',     'Puzzle',   () => import('@/components/minigames/ChemistryGame')),
  matchthree:   def('Match Three',   'Puzzle',   () => import('@/components/minigames/MatchThreeGame')),
  klotski:      def('Klotski',       'Puzzle',   () => import('@/components/minigames/KlotskiGame')),
  lorentz:      def('Lorentz Force', 'Puzzle',   () => import('@/components/minigames/LorentzGame')),
  porcelain:    def('Porcelain',     'Creative', () => import('@/components/minigames/PorcelainGame')),
  trade:        def('Trade',         'Strategy', () => import('@/components/minigames/TradeGame'), true),
  punnett:      def('Punnett Square','Puzzle',   () => import('@/components/minigames/PunnettGame')),
  wordle:       def('Wordle',        'Puzzle',   () => import('@/components/minigames/WordleGame'), true),
  decode:       def('Decode',        'Puzzle',   () => import('@/components/minigames/DecodeGame')),
  wargame:      def('Wargame',       'Strategy', () => import('@/components/minigames/WargameGame'), true),
  auction:      def('Auction',       'Strategy', () => import('@/components/minigames/AuctionGame'), true),
  pseudocode:   def('Pseudo Code',   'Puzzle',   () => import('@/components/minigames/PseudoCodeGame')),
  iceslide:     def('Ice Slide',     'Puzzle',   () => import('@/components/minigames/IceSlideGame')),
  bridge:       def('Bridges',       'Puzzle',   () => import('@/components/minigames/BridgeGame')),
  compose:      def('Compose',       'Creative', () => import('@/components/minigames/ComposeMusicGame')),
  weapondeploy: def('Weapon Deploy', 'Strategy', () => import('@/components/minigames/WeaponDeployGame'), true),
  museum:       def('Museum',        'Story',    () => import('@/components/minigames/MuseumGame')),
  jigsaw:       def('Jigsaw',        'Puzzle',   () => import('@/components/minigames/JigsawGame')),
  pipeline:     def('Pipeline',      'Puzzle',   () => import('@/components/minigames/PipelineGame')),
  colormix:     def('Color Mix',     'Creative', () => import('@/components/minigames/ColorMixGame')),
  hunting:      def('Hunting',       'Explore',  () => import('@/components/minigames/HuntingGame'), true),
  storysort:    def('Story Sort',    'Story',    () => import('@/components/minigames/StorySortGame')),
  battlearena:  def('Battle Arena',  'Strategy', () => import('@/components/minigames/BattleArenaGame')),
  soccer:       def('Soccer',        'Explore',  () => import('@/components/minigames/SoccerGame')),
  reporterflee: def('Reporter Flee', 'Explore',  () => import('@/components/minigames/ReporterFleeGame')),
  chimpmath:    def('Chimp Math',    'Puzzle',   () => import('@/components/minigames/ChimpMathGame')),
  worldclock:   def('World Clock',   'Puzzle',   () => import('@/components/minigames/WorldClockGame')),
} satisfies Record<string, GameDef>

export type GameKey = keyof typeof GAMES
export const GAME_KEYS = Object.keys(GAMES) as GameKey[]
export const isGameKey = (key: string): key is GameKey => key in GAMES

/** Lazily loaded components, one chunk per game. */
export const LazyGame = Object.fromEntries(
  GAME_KEYS.map(key => [key, lazy(GAMES[key].load)]),
) as Record<GameKey, LazyExoticComponent<MinigameComponent>>

/** Display label for any challenge kind, including the quiz-style ones. */
export function gameLabel(key: string): string {
  if (isGameKey(key)) return GAMES[key].label
  return { quiz: 'Quiz', truefalse: 'True / False', sort: 'Sort' }[key] ?? key
}

/** Arcade category for any challenge kind; quiz-style ones are 'Trivia'. */
export function gameCategory(key: string): Category | 'Trivia' {
  return isGameKey(key) ? GAMES[key].category : 'Trivia'
}
