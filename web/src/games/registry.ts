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
  maze:         def('Maze',          'Explore',  () => import('@/components/minigames/BigMazeGame'), true),
  mirror:       def('Mirror',        'Puzzle',   () => import('@/components/minigames/MirrorGame'), true),
  circuit:      def('Circuit',       'Puzzle',   () => import('@/components/minigames/CircuitGame'), true),
  sliding:      def('Sliding Tiles', 'Puzzle',   () => import('@/components/minigames/SlidingPuzzle'), true),
  crossword:    def('Crossword',     'Puzzle',   () => import('@/components/minigames/CrosswordGame'), true),
  geometry:     def('Geometry',      'Puzzle',   () => import('@/components/minigames/GeometryGame'), true),
  painting:     def('Painting',      'Creative', () => import('@/components/minigames/PaintingGame'), true),
  music:        def('Music',         'Creative', () => import('@/components/minigames/MusicGame'), true),
  tactics:      def('Tactics',       'Strategy', () => import('@/components/minigames/TacticsGame'), true),
  classify:     def('Classify',      'Puzzle',   () => import('@/components/minigames/ClassifyGame'), true),
  cooking:      def('Cooking',       'Creative', () => import('@/components/minigames/CookingGame'), true),
  fiction:      def('Fiction',       'Story',    () => import('@/components/minigames/FictionGame'), true),
  sudoku:       def('Sudoku',        'Puzzle',   () => import('@/components/minigames/SudokuGame'), true),
  voting:       def('Voting',        'Strategy', () => import('@/components/minigames/VotingGame'), true),
  chemistry:    def('Chemistry',     'Puzzle',   () => import('@/components/minigames/ChemistryGame'), true),
  matchthree:   def('Match Three',   'Puzzle',   () => import('@/components/minigames/MatchThreeGame'), true),
  klotski:      def('Klotski',       'Puzzle',   () => import('@/components/minigames/KlotskiGame'), true),
  lorentz:      def('Lorentz Force', 'Puzzle',   () => import('@/components/minigames/LorentzGame'), true),
  porcelain:    def('Porcelain',     'Creative', () => import('@/components/minigames/PorcelainGame'), true),
  trade:        def('Trade',         'Strategy', () => import('@/components/minigames/TradeGame'), true),
  punnett:      def('Punnett Square','Puzzle',   () => import('@/components/minigames/PunnettGame'), true),
  wordle:       def('Wordle',        'Puzzle',   () => import('@/components/minigames/WordleGame'), true),
  decode:       def('Decode',        'Puzzle',   () => import('@/components/minigames/DecodeGame'), true),
  wargame:      def('Wargame',       'Strategy', () => import('@/components/minigames/WargameGame'), true),
  auction:      def('Auction',       'Strategy', () => import('@/components/minigames/AuctionGame'), true),
  pseudocode:   def('Pseudo Code',   'Puzzle',   () => import('@/components/minigames/PseudoCodeGame'), true),
  iceslide:     def('Ice Slide',     'Puzzle',   () => import('@/components/minigames/IceSlideGame'), true),
  bridge:       def('Bridges',       'Puzzle',   () => import('@/components/minigames/BridgeGame'), true),
  compose:      def('Compose',       'Creative', () => import('@/components/minigames/ComposeMusicGame'), true),
  weapondeploy: def('Weapon Deploy', 'Strategy', () => import('@/components/minigames/WeaponDeployGame'), true),
  museum:       def('Museum',        'Story',    () => import('@/components/minigames/MuseumGame'), true),
  jigsaw:       def('Jigsaw',        'Puzzle',   () => import('@/components/minigames/JigsawGame'), true),
  pipeline:     def('Pipeline',      'Puzzle',   () => import('@/components/minigames/PipelineGame'), true),
  colormix:     def('Color Mix',     'Creative', () => import('@/components/minigames/ColorMixGame'), true),
  storysort:    def('Story Sort',    'Story',    () => import('@/components/minigames/StorySortGame'), true),
  battlearena:  def('Battle Arena',  'Strategy', () => import('@/components/minigames/BattleArenaGame'), true),
  soccer:       def('Soccer',        'Explore',  () => import('@/components/minigames/SoccerGame'), true),
  reporterflee: def('Reporter Flee', 'Explore',  () => import('@/components/minigames/ReporterFleeGame'), true),
  chimpmath:    def('Chimp Math',    'Puzzle',   () => import('@/components/minigames/ChimpMathGame'), true),
  // ── The card game itself: scripted lessons that close every Epic story
  fight:        def('Fight',         'Strategy', () => import('@/components/minigames/FightGame'), true),
  // ── New engines (growth-arc redesign)
  expedition:   def('Expedition',    'Strategy', () => import('@/components/minigames/ExpeditionGame'), true),
  cipher:       def('Cipher',        'Puzzle',   () => import('@/components/minigames/CipherGame'), true),
  debate:       def('Debate',        'Story',    () => import('@/components/minigames/DebateGame'), true),
  siege:        def('Siege',         'Strategy', () => import('@/components/minigames/SiegeGame'), true),
  typeset:      def('Typeset',       'Creative', () => import('@/components/minigames/TypesetGame'), true),
  caravan:      def('Caravan',       'Strategy', () => import('@/components/minigames/CaravanGame'), true),
  starchart:    def('Star Chart',    'Explore',  () => import('@/components/minigames/StarChartGame'), true),
  logicgate:    def('Logic Gates',   'Puzzle',   () => import('@/components/minigames/LogicGateGame'), true),
  archbuild:    def('Arch Builder',  'Creative', () => import('@/components/minigames/ArchBuildGame'), true),
  rhythm:       def('Rhythm',        'Creative', () => import('@/components/minigames/RhythmGame'), true),
  // ── Codebook: historical codes, one game per system
  atbash:       def('Atbash',        'Puzzle',   () => import('@/components/minigames/CodebookGame').then(m => m.CODEBOOKS.atbash), true),
  polybius:     def('Polybius Square','Puzzle',  () => import('@/components/minigames/CodebookGame').then(m => m.CODEBOOKS.polybius), true),
  scytale:      def('Scytale',       'Puzzle',   () => import('@/components/minigames/CodebookGame').then(m => m.CODEBOOKS.scytale), true),
  pigpen:       def('Pigpen',        'Puzzle',   () => import('@/components/minigames/CodebookGame').then(m => m.CODEBOOKS.pigpen), true),
  braille:      def('Braille',       'Puzzle',   () => import('@/components/minigames/CodebookGame').then(m => m.CODEBOOKS.braille), true),
  telegraph:    def('Telegraph',     'Puzzle',   () => import('@/components/minigames/CodebookGame').then(m => m.CODEBOOKS.telegraph), true),
  binary:       def('Binary',        'Puzzle',   () => import('@/components/minigames/CodebookGame').then(m => m.CODEBOOKS.binary), true),
  // ── Outdoor games
  roundup:      def('Round-Up',      'Strategy', () => import('@/components/minigames/RoundUpGame'), true),
  fieldsurvey:  def('Field Survey',  'Explore',  () => import('@/components/minigames/FieldSurveyGame'), true),
  riverrun:     def('River Run',     'Explore',  () => import('@/components/minigames/RiverRunGame'), true),
  // ── Vote games
  rollcall:     def('Roll Call',     'Strategy', () => import('@/components/minigames/RollCallGame'), true),
  coalition:    def('Coalition',     'Strategy', () => import('@/components/minigames/CoalitionGame'), true),
  campaign:     def('Campaign Trail','Strategy', () => import('@/components/minigames/CampaignGame'), true),
  // ── Wave 1 of the new game types (docs/game-catalog.md)
  sokoban:      def('Stone Haulers',     'Puzzle',   () => import('@/components/minigames/SokobanGame'), true),
  packtrain:    def('Pack Train',        'Explore',  () => import('@/components/minigames/PackTrainGame'), true),
  tradeboard:   def('Merchant Board',    'Strategy', () => import('@/components/minigames/TradeBoardGame'), true),
  ferry:        def('River Crossing',    'Puzzle',   () => import('@/components/minigames/FerryGame'), true),
  hanoi:        def('Temple Disks',      'Puzzle',   () => import('@/components/minigames/HanoiGame'), true),
  tangram:      def('Tangram',           'Puzzle',   () => import('@/components/minigames/TangramGame'), true),
  nonogram:     def('Picture Logic',     'Puzzle',   () => import('@/components/minigames/NonogramGame'), true),
  sapper:       def('Sapper',            'Puzzle',   () => import('@/components/minigames/SapperGame'), true),
  lamplighter:  def('Lamplighter',       'Puzzle',   () => import('@/components/minigames/LamplighterGame'), true),
  magicsquare:  def('Lo Shu',            'Puzzle',   () => import('@/components/minigames/MagicSquareGame'), true),
  pairs:        def('Archive Pairs',     'Puzzle',   () => import('@/components/minigames/PairsGame'), true),
  mint:         def('2048',              'Puzzle',   () => import('@/components/minigames/MintGame'), true),
  knightstour:  def("Knight's Tour",     'Puzzle',   () => import('@/components/minigames/KnightsTourGame'), true),
  queens:       def('Eight Queens',      'Puzzle',   () => import('@/components/minigames/QueensGame'), true),
  tafl:         def('Hnefatafl',         'Strategy', () => import('@/components/minigames/TaflGame'), true),
  morris:       def("Nine Men's Morris", 'Strategy', () => import('@/components/minigames/MorrisGame'), true),
  mancala:      def('Oware',             'Strategy', () => import('@/components/minigames/MancalaGame'), true),
  gomoku:       def('Five in a Row',     'Strategy', () => import('@/components/minigames/GomokuGame'), true),
  senet:        def('Senet',             'Strategy', () => import('@/components/minigames/SenetGame'), true),
  royalur:      def('Royal Game of Ur',  'Strategy', () => import('@/components/minigames/RoyalUrGame'), true),
  // ── Wave 2: numbers, measurement and machines (docs/game-catalog.md)
  abacus:       def('Suanpan'           , 'Puzzle'  , () => import('@/components/minigames/AbacusGame'), true),
  quipu:        def('Quipu'             , 'Puzzle'  , () => import('@/components/minigames/QuipuGame'), true),
  cryptarithm:  def('Merchant Sums'     , 'Puzzle'  , () => import('@/components/minigames/CryptarithmGame'), true),
  gears:        def('Gear Train'        , 'Puzzle'  , () => import('@/components/minigames/GearsGame'), true),
  pendulum:     def('Pendulum Clock'    , 'Puzzle'  , () => import('@/components/minigames/PendulumGame'), true),
  orbit:        def('Orbits'            , 'Puzzle'  , () => import('@/components/minigames/OrbitGame'), true),
  optics:       def('Lenses'            , 'Puzzle'  , () => import('@/components/minigames/OpticsGame'), true),
  alchemy:      def('Elements'          , 'Puzzle'  , () => import('@/components/minigames/AlchemyGame'), true),
  surveyor:     def('Triangulation'     , 'Explore' , () => import('@/components/minigames/SurveyorGame'), true),
  irrigation:   def('Nile Basins'       , 'Strategy', () => import('@/components/minigames/IrrigationGame'), true),
  rotation:     def('Crop Rotation'     , 'Strategy', () => import('@/components/minigames/RotationGame'), true),
  cargo:        def('Cargo Hold'        , 'Puzzle'  , () => import('@/components/minigames/CargoGame'), true),
  wallbuilder:  def('Wall Builder'      , 'Puzzle'  , () => import('@/components/minigames/WallBuilderGame'), true),
  truss:        def('Truss Bridge'      , 'Creative', () => import('@/components/minigames/TrussGame'), true),
  canallock:    def('Canal Locks'       , 'Puzzle'  , () => import('@/components/minigames/CanalLockGame'), true),
  railway:      def('Railway'           , 'Puzzle'  , () => import('@/components/minigames/RailwayGame'), true),
  telegraphnet: def('Telegraph Network' , 'Strategy', () => import('@/components/minigames/TelegraphNetGame'), true),
  postroute:    def('Post Route'        , 'Explore' , () => import('@/components/minigames/PostRouteGame'), true),
  konigsberg:   def('Seven Bridges'     , 'Puzzle'  , () => import('@/components/minigames/KonigsbergGame'), true),
  assembly:     def('Assembly Line'     , 'Strategy', () => import('@/components/minigames/AssemblyGame'), true),
  // ── Wave 3: physics, simulation, strategy and economics (docs/game-catalog.md)
  trebuchet:    def('Trebuchet'         , 'Puzzle'  , () => import('@/components/minigames/TrebuchetGame'), true),
  eureka:       def('Eureka'            , 'Puzzle'  , () => import('@/components/minigames/EurekaGame'), true),
  lever:        def('Balance and Lever' , 'Puzzle'  , () => import('@/components/minigames/LeverGame'), true),
  sundial:      def('Sundial'           , 'Puzzle'  , () => import('@/components/minigames/SundialGame'), true),
  firebreak:    def('Firebreak'         , 'Strategy', () => import('@/components/minigames/FirebreakGame'), true),
  quarantine:   def('Quarantine'        , 'Strategy', () => import('@/components/minigames/QuarantineGame'), true),
  harvest:      def('Harvest'           , 'Strategy', () => import('@/components/minigames/HarvestGame'), true),
  tradewinds:   def('Trade Winds'       , 'Explore' , () => import('@/components/minigames/TradeWindsGame'), true),
  tulips:       def('Tulip Mania'       , 'Strategy', () => import('@/components/minigames/TulipsGame'), true),
  bankrun:      def('Bank Run'          , 'Strategy', () => import('@/components/minigames/BankRunGame'), true),
  logistics:    def('Supply Lines'      , 'Strategy', () => import('@/components/minigames/LogisticsGame'), true),
  bazaar:       def('Grand Bazaar'      , 'Strategy', () => import('@/components/minigames/BazaarGame'), true),
  battleship:   def('Naval Battle'      , 'Strategy', () => import('@/components/minigames/BattleshipGame'), true),
  xiangqi:      def('Xiangqi Mates'     , 'Strategy', () => import('@/components/minigames/XiangqiGame'), true),
  castrum:      def('Roman Camp'        , 'Puzzle'  , () => import('@/components/minigames/CastrumGame'), true),
  shipyard:     def('Shipyard'          , 'Puzzle'  , () => import('@/components/minigames/ShipyardGame'), true),
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
