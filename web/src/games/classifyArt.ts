// Painted cards for the Classify minigame, generated in Google Flow.
//
// Originals live in data/images/classify/<key>.jpeg; scripts/build-images.mjs
// writes web/public/classify/<key>.webp.  Each entry is the subject given to
// Flow, so the art can be regenerated in the same style.

export const CLASSIFY_ART = {
  // Linnaeus's kingdoms and the food chain
  oak_tree:     'A broad English oak tree in full summer leaf',
  brown_bear:   'A brown bear standing on all fours',
  chanterelle:  'A cluster of golden chanterelle mushrooms on moss',
  honeybee:     'A honeybee on a clover flower, close up',
  rose:         'A single red rose with leaves',
  porcini:      'A fat porcini (cep) mushroom with a brown cap',
  tulip:        'A red and yellow tulip',
  wolf:         'A grey wolf standing in snow',
  grass:        'A tuft of green meadow grass',
  rabbit:       'A wild brown rabbit sitting up',
  fox:          'A red fox trotting',
  deer:         'A red deer stag',
  eagle:        'A golden eagle with wings spread',
  algae:        'Green algae in a pond, with a magnified view of its cells',
  caterpillar:  'A green caterpillar eating a leaf',
  // Mendel's pea traits
  pea_round:         'Smooth round green-yellow pea seeds in an open pod',
  pea_wrinkled:      'Dry wrinkled pea seeds on a table',
  pea_yellow:        'A handful of yellow pea seeds',
  pea_green:         'A handful of bright green pea seeds',
  pea_tall:          'A tall pea plant climbing a long stake in a monastery garden',
  pea_short:         'A short bushy dwarf pea plant in a clay pot',
  pea_purple_flower: 'A purple pea flower on the vine',
  pea_white_flower:  'A white pea flower on the vine',
  // Darwin's finches
  finch_crushing: 'A Galápagos ground finch with a thick seed-crushing beak, cracking a seed',
  finch_probing:  'A Galápagos cactus finch with a long probing beak, feeding at a cactus flower',
  finch_pointed:  'A Galápagos warbler-like finch with a thin pointed beak, catching an insect',
  finch_parrot:   'A Galápagos vegetarian finch with a heavy parrot-like beak, eating a nut',
  finch_curved:   'A Galápagos finch with a slender curved beak, eating cactus fruit',
  finch_warbler:  'A small Galápagos warbler finch with a short fine beak, picking a beetle off a twig',
  // Taxonomy ranks, nested from broad to narrow around the lion
  rank_kingdom: 'A crowded procession of every kind of animal: fish, birds, insects, mammals, reptiles',
  rank_phylum:  'Animals with backbones side by side: a fish, a frog, a lizard, a bird and a lion',
  rank_order:   'Meat-eating mammals together: a wolf, a bear, a seal and a lion',
  rank_family:  'The cat family together: a lion, a tiger, a lynx and a house cat',
  rank_genus:   'The big cats together: a lion, a tiger, a leopard and a jaguar',
  rank_species: 'A single male lion, Panthera leo',
  // Magellan's ports and landmarks
  canary_islands:     'Volcanic Tenerife with Mount Teide seen from a 16th-century carrack',
  rio_de_janeiro:     'Guanabara Bay and Sugarloaf Mountain, 1519, with a carrack at anchor',
  patagonia:          'A windswept Patagonian coast with guanacos, 1520',
  guam:               'A palm-fringed Pacific island with outrigger canoes, 1521',
  cebu:               'A Visayan harbour in Cebu with balangay boats, 1521',
  spice_islands:      'Clove trees on a volcanic Moluccan island',
  mozambique_channel: 'An Arab dhow under sail in the Mozambique Channel, with the African coast',
  cape_of_good_hope:  'The rocky Cape of Good Hope in a storm, with a carrack rounding it',
  // Apple's 1997 product line
  imac:              'A translucent Bondi-blue all-in-one iMac G3 computer, no logo',
  ibook:             'A tangerine clamshell iBook laptop, no logo',
  power_mac_g3:      'A blue-and-white tower Power Mac G3 desktop, no logo',
  powerbook_g3:      'A black PowerBook G3 laptop, open, no logo',
  newton_messagepad: 'A Newton MessagePad handheld with a stylus, no logo',
  emate_300:         'A green translucent eMate 300 clamshell school laptop, no logo',
  pippin:            'A dark grey Pippin game console with a boomerang controller, no logo',
  quicktake:         'A QuickTake 100 binocular-shaped digital camera, no logo',
} as const

export type ClassifyArtKey = keyof typeof CLASSIFY_ART

export const classifyArtUrl = (key: string) => `/classify/${key}.webp`

/** The Flow prompt for one card. */
export const classifyPrompt = (key: ClassifyArtKey) =>
  `Classify card, ${key}: ${CLASSIFY_ART[key]}. Painted board-game card illustration, the subject large and centred on a plain warm parchment background, soft gouache and ink, natural colours, no text, no border`
