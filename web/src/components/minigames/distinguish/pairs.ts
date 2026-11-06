// Look-alikes for the Distinguish game: things people mix up, each with the
// one feature that tells it apart.  Art is painted in Google Flow from
// `subject`; originals live in data/images/distinguish/<key>.jpeg and
// scripts/build-images.mjs writes web/public/distinguish/<key>.webp.

export interface LookAlike {
  /** Image key. */
  key: string
  name: string
  /** What sets it apart, written to finish "The <name> …". */
  trait: string
  subject: string
}

export interface Pair {
  id: string
  /** Shelf the pair belongs to; configs draw from shelves. */
  shelf: Shelf
  items: [LookAlike, LookAlike] | [LookAlike, LookAlike, LookAlike]
}

export type Shelf = 'animals' | 'birds-and-bugs' | 'buildings' | 'craft' | 'earth-and-sky'

const l = (key: string, name: string, trait: string, subject: string): LookAlike => ({ key, name, trait, subject })

export const PAIRS: Pair[] = [
  // Animals
  { id: 'croc', shelf: 'animals', items: [
    l('crocodile', 'crocodile', 'has a narrow, pointed V-shaped snout, and its lower teeth show even with the mouth shut', 'a Nile crocodile resting on a riverbank, side view, mouth closed, narrow pointed V-shaped snout with interlocking upper and lower teeth clearly visible'),
    l('alligator', 'alligator', 'has a broad, rounded U-shaped snout, and only its upper teeth show with the mouth shut', 'an American alligator resting on a swamp bank, side view, mouth closed, broad rounded U-shaped snout with only the upper teeth showing'),
  ] },
  { id: 'bigcat', shelf: 'animals', items: [
    l('cheetah', 'cheetah', 'has solid round black spots and a black “tear line” running from each eye to its mouth', 'a cheetah standing on the savanna, slim body, solid round black spots and bold black tear lines from its eyes to its mouth, face clearly visible'),
    l('leopard', 'leopard', 'has rosettes — rings of black around a tawny centre — and no tear lines on its face', 'a leopard resting on a tree branch, stocky body covered in rosette spots, face clearly visible with no tear lines'),
    l('jaguar', 'jaguar', 'has big rosettes with small black dots inside them, and a heavy, broad head', 'a jaguar standing by a rainforest river, very muscular with a broad heavy head, large rosettes that have small black dots inside them'),
  ] },
  { id: 'elephant', shelf: 'animals', items: [
    l('african_elephant', 'African elephant', 'has huge ears shaped like the map of Africa and a rounded head', 'an African bush elephant walking on the savanna, side view, enormous fan-shaped ears and a smoothly rounded head'),
    l('asian_elephant', 'Asian elephant', 'has small rounded ears and a head with two domes on top', 'an Asian elephant standing in a forest, side view, small rounded ears and a twin-domed head'),
  ] },
  { id: 'frog', shelf: 'animals', items: [
    l('frog', 'frog', 'has smooth, wet-looking skin and long back legs built for leaping', 'a green frog sitting on a lily pad, smooth shiny moist skin, long folded back legs'),
    l('toad', 'toad', 'has dry, bumpy, warty skin and short legs for walking', 'a brown common toad sitting on dry leaves, dry warty bumpy skin, short stubby legs'),
  ] },
  { id: 'hare', shelf: 'animals', items: [
    l('hare', 'hare', 'has very long black-tipped ears and long legs', 'a brown hare sitting upright in a field, very long ears with black tips, long hind legs'),
    l('rabbit', 'rabbit', 'has shorter ears with no black tips and a rounder, smaller body', 'a wild grey-brown rabbit sitting on grass, shorter ears without black tips, round compact body'),
  ] },
  { id: 'camel', shelf: 'animals', items: [
    l('dromedary', 'dromedary', 'has a single hump', 'a dromedary camel walking in the Sahara desert, side view, one single hump'),
    l('bactrian', 'Bactrian camel', 'has two humps', 'a shaggy Bactrian camel standing on the Gobi steppe, side view, two humps clearly visible'),
  ] },
  { id: 'seal', shelf: 'animals', items: [
    l('sea_lion', 'sea lion', 'has small ear flaps and props itself up on its long front flippers', 'a sea lion sitting upright on a rock propped on its front flippers, small visible ear flaps on its head'),
    l('seal', 'seal', 'has no ear flaps, just holes, and lies on its belly with short front flippers', 'a harbour seal lying on its belly on a rock, no external ear flaps, short front flippers, spotted coat'),
  ] },
  { id: 'llama', shelf: 'animals', items: [
    l('llama', 'llama', 'is tall with long curved banana-shaped ears and a long face', 'a tall llama standing in the Andes, side view, long curved banana-shaped ears and a long face'),
    l('alpaca', 'alpaca', 'is small with short pointed ears and a fluffy, flat face', 'a small fluffy alpaca standing in the Andes, short straight pointed ears and a short fluffy face'),
  ] },
  { id: 'tortoise', shelf: 'animals', items: [
    l('tortoise', 'tortoise', 'has a high domed shell and thick stumpy feet for walking on land', 'a Galápagos giant tortoise walking on dry ground, high domed shell, thick elephant-like stumpy legs'),
    l('sea_turtle', 'sea turtle', 'has a flat streamlined shell and flippers for swimming', 'a green sea turtle swimming in clear blue sea, flat streamlined shell and long paddle flippers'),
  ] },
  { id: 'dolphin', shelf: 'animals', items: [
    l('dolphin', 'dolphin', 'beats a flat, sideways tail fluke up and down and breathes through a blowhole', 'a bottlenose dolphin leaping out of the sea, horizontal tail flukes, blowhole on top of the head'),
    l('shark', 'shark', 'swings an upright tail fin side to side and has gill slits behind its head', 'a blue shark swimming in open water, side view, tall upright vertical tail fin and five gill slits behind the head'),
  ] },
  { id: 'mammoth', shelf: 'animals', items: [
    l('mammoth', 'woolly mammoth', 'has a high domed head, a back that slopes down to the tail, and long tusks curling in a spiral', 'a woolly mammoth on an icy tundra, side view, shaggy brown coat, high domed head, back sloping down toward the tail, long spiralling tusks'),
    l('mastodon', 'mastodon', 'has a low flat head, a straight level back, and shorter, straighter tusks', 'an American mastodon in a pine forest, side view, low flat head, long straight level back, shorter straighter tusks, reddish hair'),
  ] },
  // Birds and insects
  { id: 'beak', shelf: 'birds-and-bugs', items: [
    l('warbler', 'warbler', 'has a thin, pointed, needle-like beak for picking insects', 'a yellow warbler perched on a twig, close up, thin pointed needle-like beak holding a small insect'),
    l('sparrow', 'sparrow', 'has a short, thick, cone-shaped beak for cracking seeds', 'a house sparrow perched on a fence, close up, short thick cone-shaped beak cracking a seed, streaked brown back'),
  ] },
  { id: 'moth', shelf: 'birds-and-bugs', items: [
    l('butterfly', 'butterfly', 'has thin antennae with little clubs at the tips and rests with its wings folded upright', 'a swallowtail butterfly resting on a flower with its wings folded upright together, thin antennae with clubbed knobs at the tips'),
    l('moth', 'moth', 'has feathery antennae and rests with its wings spread flat', 'a brown moth resting on tree bark with its wings spread flat, large feathery comb-like antennae'),
  ] },
  { id: 'bee', shelf: 'birds-and-bugs', items: [
    l('honeybee', 'honeybee', 'is fuzzy and golden-brown with a thick body', 'a honeybee on a flower, close up, fuzzy hairy golden-brown thick body, pollen on its legs'),
    l('wasp', 'wasp', 'is smooth and shiny bright yellow and black with a thin “wasp waist”', 'a common wasp on a leaf, close up, smooth shiny bright yellow and black body with a very thin narrow waist'),
  ] },
  { id: 'raptor', shelf: 'birds-and-bugs', items: [
    l('eagle', 'eagle', 'has a feathered head and a big hooked beak, and hunts live prey', 'a golden eagle perched on a rock, fully feathered golden-brown head, large hooked beak, sharp talons'),
    l('vulture', 'vulture', 'has a bare, featherless head and neck so it can feed inside carcasses', 'a griffon vulture perched on a dead tree, bare pale featherless head and neck, ruff of feathers at the base of the neck'),
  ] },
  // Buildings
  { id: 'column', shelf: 'buildings', items: [
    l('doric', 'Doric column', 'has a plain, cushion-like capital and no base', 'a single ancient Greek Doric marble column, close up of the plain round cushion capital, fluted shaft standing straight on the floor with no base'),
    l('ionic', 'Ionic column', 'has a capital with two rolled scrolls like a ram’s horns', 'a single ancient Greek Ionic marble column, close up of the capital with two large spiral scrolls (volutes), slender fluted shaft on a base'),
    l('corinthian', 'Corinthian column', 'has a tall capital covered in carved acanthus leaves', 'a single ancient Greek Corinthian marble column, close up of the tall bell-shaped capital covered in carved acanthus leaves'),
  ] },
  { id: 'arch', shelf: 'buildings', items: [
    l('romanesque', 'Romanesque church', 'has round arches, thick walls and small windows', 'a Romanesque stone church, round semicircular arches over the doors and small windows, thick heavy walls'),
    l('gothic', 'Gothic cathedral', 'has pointed arches, flying buttresses and huge stained-glass windows', 'a Gothic cathedral, tall pointed arches, flying buttresses on the sides, huge stained-glass rose window'),
  ] },
  { id: 'dome', shelf: 'buildings', items: [
    l('pagoda', 'pagoda', 'is a tower of many stacked roofs, each with upturned eaves', 'a tall Chinese wooden pagoda with many stacked tiers of roofs with upturned eaves'),
    l('stupa', 'stupa', 'is a solid round dome topped with a spire, with no rooms inside', 'a white Buddhist stupa, a solid round dome with a square base and a tall golden spire on top'),
  ] },
  // Craft: ships, blades, writing, instruments
  { id: 'ship', shelf: 'craft', items: [
    l('junk', 'Chinese junk', 'has stiff sails ribbed with bamboo battens, like folding fans', 'a Chinese junk sailing ship at sea, side view, red-brown sails stiffened with many horizontal bamboo battens like folding fans'),
    l('carrack', 'carrack', 'has billowing square cloth sails and tall castles at bow and stern', 'a 15th-century Portuguese carrack at sea, side view, billowing square white sails with red crosses, tall castles at bow and stern'),
  ] },
  { id: 'warship', shelf: 'craft', items: [
    l('trireme', 'trireme', 'has a bronze ram at the waterline of its bow and an eye painted on the prow', 'an ancient Greek trireme rowing at sea, side view, three stacked banks of oars, bronze ram at the waterline of the bow'),
    l('longship', 'Viking longship', 'has a single row of oars, a carved dragon head on the prow and round shields along the side', 'a Viking longship at sea, side view, one single row of oars, a carved dragon head on the prow, round painted shields along the side, one square striped sail'),
  ] },
  { id: 'blade', shelf: 'craft', items: [
    l('katana', 'katana', 'is curved, with a single cutting edge', 'a Japanese katana sword laid on a dark stand, gently curved single-edged blade, wrapped handle and round guard'),
    l('jian', 'jian', 'is straight, with two cutting edges and a pointed tip', 'a Chinese jian sword laid on a dark stand, perfectly straight double-edged blade with a pointed tip, tassel on the hilt'),
  ] },
  { id: 'script', shelf: 'craft', items: [
    l('hieroglyphs', 'hieroglyphs', 'are little pictures — birds, eyes, reeds — carved or painted in stone', 'a carved Egyptian stone wall covered in painted hieroglyphs, birds, eyes, reeds and ankh signs, close up'),
    l('cuneiform', 'cuneiform', 'is made of tiny wedge-shaped marks pressed into clay', 'a Mesopotamian clay tablet covered in cuneiform script, rows of tiny wedge-shaped marks pressed into the clay, close up'),
  ] },
  { id: 'telescope', shelf: 'craft', items: [
    l('refractor', 'refracting telescope', 'is a long tube with a lens at the front and you look straight through the back end', 'an antique brass refracting telescope on a tripod, a long slim tube with a glass lens at the front and the eyepiece at the back end'),
    l('reflector', 'reflecting telescope', 'is a short wide tube with a mirror at the bottom and an eyepiece on its side near the top', 'Isaac Newton’s small reflecting telescope on a wooden ball mount, a short wide tube with the eyepiece sticking out of the side near the top'),
  ] },
  // Earth and sky
  { id: 'cave', shelf: 'earth-and-sky', items: [
    l('stalactites', 'stalactites', 'hang down from the cave ceiling (they hold “tight” to the roof)', 'a limestone cave with many stalactites hanging down from the ceiling like icicles, a flat smooth floor, nothing rising from the ground'),
    l('stalagmites', 'stalagmites', 'rise up from the cave floor (they “might” reach the roof one day)', 'a limestone cave with many stalagmites rising up from the floor like cones, a plain smooth ceiling with nothing hanging down'),
  ] },
  { id: 'cloud', shelf: 'earth-and-sky', items: [
    l('cumulus', 'cumulus clouds', 'are puffy heaps like cotton wool with flat bottoms', 'a blue summer sky with puffy white cumulus clouds like cotton wool with flat grey bottoms over green fields'),
    l('cirrus', 'cirrus clouds', 'are thin wispy streaks high in the sky, like horses’ tails', 'a high blue sky with thin wispy cirrus clouds in feathery streaks like horses’ tails over green fields'),
  ] },
  { id: 'tree', shelf: 'earth-and-sky', items: [
    l('conifer', 'conifer', 'has needles and cones and stays green all winter', 'a tall spruce conifer tree in winter, needles and hanging cones, still green with snow on its branches'),
    l('deciduous', 'deciduous tree', 'has broad flat leaves that it drops every autumn', 'a broad oak deciduous tree in autumn, wide flat leaves turning orange and falling to the ground'),
  ] },
  { id: 'rock', shelf: 'earth-and-sky', items: [
    l('sandstone', 'sedimentary rock', 'is laid down in flat stripes of layers, one on top of another', 'a cliff of red sandstone sedimentary rock with clear flat horizontal layered stripes'),
    l('basalt', 'volcanic basalt', 'cooled from lava into dark six-sided columns', 'dark volcanic basalt rock columns, many tall six-sided hexagonal columns packed together like the Giant’s Causeway'),
  ] },
  { id: 'moon', shelf: 'earth-and-sky', items: [
    l('waxing', 'waxing crescent', 'is lit on the right side and grows fuller night by night (seen from the north)', 'a thin waxing crescent moon in a dark night sky, the lit sliver on the RIGHT side of the moon, the rest dark'),
    l('waning', 'waning crescent', 'is lit on the left side and shrinks night by night (seen from the north)', 'a thin waning crescent moon in a dark dawn sky, the lit sliver on the LEFT side of the moon, the rest dark'),
  ] },
]

export const SHELVES: Shelf[] = ['animals', 'birds-and-bugs', 'buildings', 'craft', 'earth-and-sky']
