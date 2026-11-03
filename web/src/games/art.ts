// Painted art for the minigames, generated in Google Flow.
//
// Originals live in data/images/games/<key>.jpeg (or .png); scripts/
// build-images.mjs writes web/public/games/<key>.webp.  Games reference art
// only through gameArt(), and always as a CSS background or an <img> that
// hides itself on error, so a game still renders if a file is missing.

export const GAME_ART = {
  // Maze — top-down ground texture per theme, tiled under the board.
  maze_sandstone: 'Sandstone flagstones of a pyramid corridor, top-down',
  maze_ice:       'Cracked blue glacier ice with snow drifts, top-down',
  maze_cedar:     'Forest floor of cedar needles, roots and moss, top-down',
  maze_mountain:  'Grey mountain scree and rock slabs, top-down',
  maze_steppe:    'Dry steppe grass and packed earth, top-down',
  maze_sea:       'Open sea water with gentle swell, top-down',
  maze_sky:       'Sea of clouds seen from above, top-down',
  maze_bamboo:    'Bamboo grove floor with fallen leaves and stones, top-down',

  // Match three — market backdrop per config.
  m3_lisbon_spices:   'Lisbon spice wharf, 1500s, crates of pepper and cinnamon',
  m3_changan_silks:   "Chang'an silk market, Tang dynasty, bolts of silk",
  m3_cairo_alchemy:   "Medieval Cairo alchemist's bench, glass vessels and minerals",
  m3_venice_glass:    'Murano glassblower workshop, Venice, colored glass',
  m3_babylon_tablets: 'Babylonian scribe house, rows of clay tablets',
  m3_aztec_market:    'Tlatelolco market, Aztec, cacao, feathers and jade',
  m3_hanseatic_runes: 'Hanseatic warehouse in Lübeck, furs, wax and herring barrels',
  m3_mughal_gems:     'Mughal jeweller workshop, emeralds and rubies on velvet',

  // Sudoku — board surfaces.
  sudoku_clay:      'Fired clay tablet surface with faint cuneiform, top-down',
  sudoku_parchment: 'Aged parchment with ink ruling lines, top-down',

  // Typeset — print shops and the type case.
  typeset_gutenberg: "Gutenberg's Mainz print shop, wooden press, 1450s",
  typeset_bisheng:   "Song dynasty printer's workshop, clay type and iron frame",
  typeset_franklin:  "Benjamin Franklin's Philadelphia print shop, 1730s",
  typeset_case:      'Wooden type case drawers full of lead sorts, top-down',

  // Rhythm — performance spaces.
  rhythm_bach:      'Organ loft of St Thomas Church, Leipzig, candlelit',
  rhythm_beethoven: 'Theater an der Wien concert hall, 1808, orchestra',
  rhythm_court:     'Tang dynasty court orchestra with drums and bells',
  rhythm_hildegard: 'Romanesque abbey choir at Rupertsberg, nuns singing',

  // Geometry — drafting surfaces.
  geometry_drafting: "Renaissance architect's drafting table, compasses and rulers, top-down",
  geometry_wax:      'Greek wax writing tablet with stylus diagrams, top-down',

  // Tactics — board and theaters.
  tactics_board:        'Antique carved wooden chessboard, top-down',
  tactics_ganryu:       'Ganryū Island beach at dawn, Japan, 1612',
  tactics_senate:       'Roman Senate house interior, marble benches',
  tactics_gaugamela:    'Plain of Gaugamela, armies and chariots, 331 BCE',
  tactics_thermopylae:  'Pass of Thermopylae between cliffs and sea',
  tactics_red_cliffs:   'Battle of Red Cliffs, burning fleet on the Yangtze',
  tactics_troy:         'Walls of Troy with the Greek camp on the shore',

  // Logic gates — machines and studies.
  logic_boole:    "George Boole's study in Cork, 1850s, books and slate",
  logic_shannon:  'Bell Labs relay switching room, 1930s',
  logic_turing:   'Bletchley Park bombe machine, rotating drums',
  logic_lovelace: "Babbage's Analytical Engine with punched cards",
} as const

export type GameArtKey = keyof typeof GAME_ART

export const gameArtUrl = (key: GameArtKey) => `/games/${key}.webp`

/** Style for an element that shows the art as a cover background. */
export const artCover = (key: GameArtKey): React.CSSProperties => ({
  backgroundImage: `url(${gameArtUrl(key)})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
})

/** Style for a repeating texture (maze floors, boards). */
export const artTexture = (key: GameArtKey, tile = 256): React.CSSProperties => ({
  backgroundImage: `url(${gameArtUrl(key)})`,
  backgroundSize: `${tile}px ${tile}px`,
  backgroundRepeat: 'repeat',
})
