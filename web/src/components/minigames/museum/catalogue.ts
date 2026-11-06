// The exhibits the Museum game hangs, each a real object with three labels a
// room can share: the region it comes from, the era it was made in and what
// kind of thing it is.  Art is painted in Google Flow from `subject`;
// originals live in data/images/exhibits/<id>.jpeg and scripts/build-images.mjs
// writes web/public/exhibits/<id>.webp.

export type Region =
  | 'Egypt' | 'Greece & Rome' | 'Near East' | 'China' | 'Japan'
  | 'Italy' | 'France' | 'Northern Europe' | 'Americas' | 'Africa'
export type Kind = 'Painting' | 'Sculpture' | 'Vessel' | 'Writing' | 'Treasure'
export type Era = 'Ancient' | 'Medieval' | 'Early Modern' | 'Modern'

export interface Exhibit {
  id: string
  title: string
  /** Display date, e.g. "c. 1503" or "196 BCE". */
  date: string
  /** Year for the era band; negative is BCE. */
  year: number
  region: Region
  kind: Kind
  subject: string
}

export const ERA_BANDS: { era: Era; label: string }[] = [
  { era: 'Ancient',      label: 'before 500' },
  { era: 'Medieval',     label: '500 – 1399' },
  { era: 'Early Modern', label: '1400 – 1699' },
  { era: 'Modern',       label: '1700 on' },
]

export const eraOf = (year: number): Era =>
  year < 500 ? 'Ancient' : year < 1400 ? 'Medieval' : year < 1700 ? 'Early Modern' : 'Modern'

const x = (id: string, title: string, date: string, year: number, region: Region, kind: Kind, subject: string): Exhibit =>
  ({ id, title, date, year, region, kind, subject })

export const EXHIBITS: Exhibit[] = [
  // Egypt
  x('nefertiti',        'Bust of Nefertiti',            'c. 1345 BCE', -1345, 'Egypt', 'Sculpture', 'the painted limestone bust of Queen Nefertiti with her tall flat-topped blue crown'),
  x('tut_mask',         'Mask of Tutankhamun',          'c. 1323 BCE', -1323, 'Egypt', 'Treasure',  'the gold funerary mask of Tutankhamun with blue-striped nemes headdress, cobra and vulture on the brow'),
  x('rosetta',          'Rosetta Stone',                '196 BCE',      -196, 'Egypt', 'Writing',   'the dark granodiorite Rosetta Stone with its three bands of hieroglyphs, Demotic and Greek script'),
  x('fayum',            'Fayum Mummy Portrait',         'c. 150',        150, 'Egypt', 'Painting',  'a Roman-era Fayum mummy portrait painted on a wooden panel, a dark-eyed young man looking straight out'),
  x('crystal_ewer',     'Fatimid Rock-Crystal Ewer',    'c. 1000',      1000, 'Egypt', 'Vessel',    'a clear carved rock-crystal ewer from Fatimid Cairo with lions and palmettes cut into it'),
  // Greece & Rome
  x('venus_milo',       'Venus de Milo',                'c. 100 BCE',   -100, 'Greece & Rome', 'Sculpture', 'the armless white marble Venus de Milo statue'),
  x('exekias',          'Amphora of Achilles and Ajax', 'c. 530 BCE',   -530, 'Greece & Rome', 'Vessel',    'a Greek black-figure amphora painted with Achilles and Ajax playing a board game'),
  x('pompeii_fresco',   'Villa of the Mysteries Fresco','c. 60 BCE',     -60, 'Greece & Rome', 'Painting',  'a Pompeii wall fresco of robed women on a deep Pompeian-red background, framed as a museum panel'),
  x('antikythera',      'Antikythera Mechanism',        'c. 100 BCE',   -100, 'Greece & Rome', 'Treasure',  'the corroded bronze gears of the ancient Greek Antikythera mechanism'),
  x('vergil',           'Vergilius Vaticanus',          'c. 400',        400, 'Greece & Rome', 'Writing',   'an open late-Roman parchment codex of Virgil with Latin capitals and a small painted scene'),
  // Near East
  x('hammurabi',        'Code of Hammurabi',            'c. 1754 BCE', -1754, 'Near East', 'Writing',   'the tall black basalt stele of the Code of Hammurabi, the king before the sun god at the top, cuneiform below'),
  x('lamassu',          'Lamassu of Khorsabad',         'c. 710 BCE',   -710, 'Near East', 'Sculpture', 'an Assyrian stone lamassu, a winged human-headed bull guardian with a curled beard'),
  x('standard_ur',      'Standard of Ur',               'c. 2600 BCE', -2600, 'Near East', 'Treasure',  'the Standard of Ur, a box inlaid with shell figures and blue lapis lazuli'),
  x('blue_quran',       'Blue Qur’an Folio',            'c. 900',        900, 'Near East', 'Writing',   'a page of the Blue Qur’an, gold Kufic script on indigo-dyed parchment'),
  x('iznik_bowl',       'Iznik Bowl',                   'c. 1540',      1540, 'Near East', 'Vessel',    'an Ottoman Iznik pottery bowl painted with cobalt blue and tomato red tulips and carnations'),
  x('shahnameh',        'Shahnameh of Shah Tahmasp',    'c. 1530',      1530, 'Near East', 'Painting',  'a Persian miniature painting page from the Shahnameh, a court of colourful figures among rocks and gold sky'),
  // China
  x('terracotta',       'Terracotta Warrior',           'c. 210 BCE',   -210, 'China', 'Sculpture', 'a single standing terracotta warrior of the Qin emperor in armour'),
  x('ding',             'Shang Bronze Ding',            'c. 1200 BCE', -1200, 'China', 'Vessel',    'a Shang dynasty bronze ding cauldron on three legs with taotie mask patterns and green patina'),
  x('jade_suit',        'Jade Burial Suit',             'c. 113 BCE',   -113, 'China', 'Treasure',  'a Han dynasty burial suit made of small jade plates sewn with gold wire, laid out flat'),
  x('diamond_sutra',    'Diamond Sutra',                '868',           868, 'China', 'Writing',   'the Diamond Sutra printed scroll, a woodblock frontispiece of the Buddha preaching and columns of Chinese text'),
  x('qingming',         'Along the River at Qingming',  'c. 1100',      1100, 'China', 'Painting',  'a section of the Song dynasty handscroll Along the River During the Qingming Festival, an arched bridge crowded with people'),
  x('ming_vase',        'Ming Blue-and-White Vase',     'c. 1420',      1420, 'China', 'Vessel',    'a Ming dynasty blue-and-white porcelain vase painted with a dragon among clouds'),
  // Japan
  x('jomon_pot',        'Jōmon Flame Pot',              'c. 3000 BCE', -3000, 'Japan', 'Vessel',    'a Jōmon flame-rimmed clay pot with wild flame-like handles around its rim'),
  x('genji_scroll',     'Tale of Genji Scroll',         'c. 1130',      1130, 'Japan', 'Painting',  'a Heian handscroll of the Tale of Genji seen from above through a roofless palace, court ladies in layered robes'),
  x('amida',            'Amida Buddha of Byōdō-in',     '1053',         1053, 'Japan', 'Sculpture', 'the gilded wooden seated Amida Buddha of the Byōdō-in with a flaming halo'),
  x('samurai_armour',   'Ō-yoroi Armour',               'c. 1300',      1300, 'Japan', 'Treasure',  'a Kamakura-era ō-yoroi samurai armour on a stand, red silk lacing and a horned helmet'),
  x('great_wave',       'The Great Wave',               'c. 1831',      1831, 'Japan', 'Painting',  'the woodblock print The Great Wave off Kanagawa, a giant clawed wave over boats with Mount Fuji small behind'),
  // Italy
  x('birth_venus',      'The Birth of Venus',           'c. 1485',      1485, 'Italy', 'Painting',  'Botticelli’s painting The Birth of Venus, Venus standing on a scallop shell at sea, in a gilt frame'),
  x('mona_lisa',        'Mona Lisa',                    'c. 1503',      1503, 'Italy', 'Painting',  'Leonardo’s Mona Lisa in a gilt frame, the half-smiling woman before a hazy landscape'),
  x('david',            'David',                        '1504',         1504, 'Italy', 'Sculpture', 'Michelangelo’s marble statue of David, standing tall with a sling over his shoulder'),
  x('codex_leicester',  'Leonardo’s Notebook',          'c. 1510',      1510, 'Italy', 'Writing',   'an open notebook page of Leonardo da Vinci in brown ink mirror-writing with sketches of water currents'),
  x('maiolica',         'Urbino Maiolica Plate',        'c. 1530',      1530, 'Italy', 'Vessel',    'an Italian Renaissance maiolica plate from Urbino painted with a bright mythological scene'),
  x('apollo_daphne',    'Apollo and Daphne',            '1625',         1625, 'Italy', 'Sculpture', 'Bernini’s marble Apollo and Daphne, Daphne’s fingers turning into laurel leaves as Apollo catches her'),
  // France
  x('tres_riches',      'Très Riches Heures',           'c. 1412',      1412, 'France', 'Writing',  'an open page of the Très Riches Heures du Duc de Berry, a blue calendar arch above a castle and peasants'),
  x('louis_crown',      'Crown of Louis XV',            '1722',         1722, 'France', 'Treasure', 'the jewelled coronation crown of Louis XV with fleur-de-lis on top, set with diamonds and coloured stones'),
  x('sevres_vase',      'Sèvres Porcelain Vase',        'c. 1760',      1760, 'France', 'Vessel',   'an ornate Sèvres porcelain vase in rose-pink and gold with painted panels of flowers'),
  x('liberty',          'Liberty Leading the People',   '1830',         1830, 'France', 'Painting', 'Delacroix’s painting Liberty Leading the People, Liberty raising the tricolour flag over a barricade, in a gilt frame'),
  x('impression',       'Impression, Sunrise',          '1872',         1872, 'France', 'Painting', 'Monet’s painting Impression, Sunrise, an orange sun over a misty blue harbour with a small rowing boat, in a frame'),
  x('thinker',          'The Thinker',                  '1904',         1904, 'France', 'Sculpture','Rodin’s bronze sculpture The Thinker, a seated man with his chin on his hand'),
  // Northern Europe
  x('gundestrup',       'Gundestrup Cauldron',          'c. 100 BCE',   -100, 'Northern Europe', 'Vessel',    'the silver Gundestrup cauldron with embossed Celtic gods and antlered figures'),
  x('sutton_hoo',       'Sutton Hoo Helmet',            'c. 625',        625, 'Northern Europe', 'Treasure',  'the Anglo-Saxon Sutton Hoo helmet with its iron face mask, eyebrows and moustache of bronze'),
  x('lindisfarne',      'Lindisfarne Gospels',          'c. 715',        715, 'Northern Europe', 'Writing',   'an open page of the Lindisfarne Gospels with an intricate knotwork carpet page in red, green and gold'),
  x('lewis_chessmen',   'Lewis Chessmen',               'c. 1150',      1150, 'Northern Europe', 'Sculpture', 'a group of walrus-ivory Lewis chessmen, a king, queen and a shield-biting warrior'),
  x('night_watch',      'The Night Watch',              '1642',         1642, 'Northern Europe', 'Painting',  'Rembrandt’s painting The Night Watch, a militia company stepping out of shadow into light, in a frame'),
  x('pearl_earring',    'Girl with a Pearl Earring',    'c. 1665',      1665, 'Northern Europe', 'Painting',  'Vermeer’s painting Girl with a Pearl Earring, a girl in a blue and yellow turban looking over her shoulder, in a frame'),
  // Americas
  x('olmec_head',       'Olmec Colossal Head',          'c. 1000 BCE', -1000, 'Americas', 'Sculpture', 'an Olmec colossal basalt head wearing a helmet-like headdress'),
  x('moche_vessel',     'Moche Portrait Vessel',        'c. 400',        400, 'Americas', 'Vessel',    'a Moche ceramic portrait vessel from Peru shaped as a man’s head with a stirrup spout'),
  x('dresden_codex',    'Dresden Codex',                'c. 1200',      1200, 'Americas', 'Writing',   'pages of the Maya Dresden Codex, folded bark paper painted with glyphs, numbers and gods'),
  x('turquoise_serpent','Turquoise Double-Headed Serpent','c. 1450',    1450, 'Americas', 'Treasure',  'the Aztec double-headed serpent carved in wood and covered with turquoise mosaic, red shell mouths'),
  x('sun_stone',        'Aztec Sun Stone',              'c. 1500',      1500, 'Americas', 'Sculpture', 'the round carved Aztec Sun Stone with the face of the sun god at its centre'),
  // Africa
  x('igbo_ukwu',        'Igbo-Ukwu Roped Pot',          'c. 900',        900, 'Africa', 'Vessel',    'the Igbo-Ukwu bronze roped pot from Nigeria, cast as a vessel tied in a net of rope'),
  x('golden_rhino',     'Golden Rhinoceros of Mapungubwe','c. 1250',    1250, 'Africa', 'Treasure',  'the small golden rhinoceros of Mapungubwe made of gold foil on a dark cloth'),
  x('ife_head',         'Ife Bronze Head',              'c. 1300',      1300, 'Africa', 'Sculpture', 'a naturalistic Ife copper-alloy head of a king with fine lines across the face and a crown'),
  x('idia_mask',        'Queen Idia Mask',              'c. 1520',      1520, 'Africa', 'Treasure',  'the Benin ivory pendant mask of Queen Idia with a crown of small heads'),
  x('benin_plaque',     'Benin Bronze Plaque',          'c. 1550',      1550, 'Africa', 'Sculpture', 'a Benin brass plaque showing the Oba with attendants in raised relief'),
  x('timbuktu_ms',      'Timbuktu Manuscript',          'c. 1600',      1600, 'Africa', 'Writing',   'an open Timbuktu manuscript on astronomy in brown and red Arabic script with a circular diagram'),
]

export const EXHIBIT_BY_ID: Record<string, Exhibit> = Object.fromEntries(EXHIBITS.map(e => [e.id, e]))
