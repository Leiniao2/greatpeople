// Authored cases for Detective.  Each is a real place and time with a
// fictional cast; the fact shown on a win is real history.  The killer, the
// method, the hour and every clue are generated per seed (./model).

export type MethodId = 'poison' | 'blade' | 'blunt' | 'strangle' | 'firearm' | 'drown' | 'smother'
export type Feature = 'blood' | 'bruise' | 'neck' | 'froth' | 'vomit' | 'powder' | 'lips'
export type TraitDim = 'hand' | 'height'

/** What each method leaves on a body.  No two methods share the same set. */
export const METHOD_TRACES: Record<MethodId, Feature[]> = {
  poison:   ['vomit', 'lips'],
  blade:    ['blood'],
  blunt:    ['bruise', 'blood'],
  strangle: ['neck', 'lips', 'bruise'],
  firearm:  ['blood', 'powder'],
  drown:    ['froth', 'lips'],
  smother:  ['lips'],
}

/** [present, absent] wording for each trace, as the examiner reports it. */
export const TRACE_TEXT: Record<Feature, [string, string]> = {
  blood:  ['The body lies in a pool of blood.', 'There is no blood on the body or the floor.'],
  bruise: ['Dark bruises mark the head and arms.', 'There is not a bruise anywhere on the body.'],
  neck:   ['A thin livid line circles the neck.', 'The throat and neck are unmarked.'],
  froth:  ['Fine froth at the mouth and nose; water in the lungs.', 'No froth at the mouth, no water in the lungs.'],
  vomit:  ['Vomit stains the collar and the belly is cramped.', 'There is no sign of vomiting or cramps.'],
  powder: ['Burnt powder grains pepper the edges of the wound.', 'No smell or grains of gunpowder anywhere.'],
  lips:   ['The lips and fingernails are blue-grey.', 'The lips and nails have their natural colour.'],
}

export const TRAITS: Record<TraitDim, [string, string]> = {
  hand: ['left-handed', 'right-handed'],
  height: ['tall', 'short'],
}

/** How a witness describes the trait they glimpsed. */
export const TRAIT_SEEN: Record<string, string> = {
  'left-handed': 'they carried the lamp in the left hand, as left-handed people do',
  'right-handed': 'they carried the lamp in the right hand, as right-handed people do',
  tall: 'tall, their head brushed the lintel of the door',
  short: 'short, barely up to the window ledge',
}

export interface SuspectDef { name: string; role: string; profile: string; means: MethodId[] }
export interface PlaceDef { name: string; witness: string }
export interface VictimDef { name: string; role: string; foundAt: string }

export interface CaseDef {
  title: string
  setting: string
  intro: string
  fact: string
  /** Who reads the body. */
  examiner: string
  /** Six consecutive hours of the night. */
  hours: string[]
  victims: [VictimDef, VictimDef]
  places: PlaceDef[]
  suspects: SuspectDef[]
  methods: Partial<Record<MethodId, string>>
  herrings: string[]
}

export const CASES: Record<string, CaseDef> = {
  'globe-1599': {
    title: 'Murder at the Globe',
    setting: 'Bankside, London, 1599',
    intro: 'The new playhouse has been open a month. After the evening\'s revels the company locked up, and by dawn there was a corpse backstage.',
    fact: 'The Globe opened on Bankside in 1599, built from the timbers of The Theatre, which the Burbages\' men pulled down in Shoreditch over Christmas 1598. It burned down in 1613 when a stage cannon fired during Henry VIII set the thatch alight.',
    examiner: 'the coroner',
    hours: ['10 pm', '11 pm', 'midnight', '1 am', '2 am', '3 am'],
    victims: [
      { name: 'Thomas Heale', role: 'the company bookkeeper', foundAt: 'in the tiring-house' },
      { name: 'Ned Pryor', role: 'a hired man', foundAt: 'under the stage' },
    ],
    places: [
      { name: 'yard', witness: 'The gatherer at the door' },
      { name: 'Anchor tavern', witness: 'The tapster' },
      { name: 'river stairs', witness: 'A waterman' },
      { name: 'property room', witness: 'The sweeping boy' },
    ],
    suspects: [
      { name: 'Walter Crane', role: 'player', profile: 'Plays the kings and fences on stage every afternoon.', means: ['blade', 'blunt'] },
      { name: 'Joan Hart', role: 'seamstress', profile: 'Mends the costumes and keeps ratsbane against the wardrobe mice.', means: ['poison', 'strangle'] },
      { name: 'Gideon Lowe', role: 'sharer', profile: 'Part-owner of the company, owed money by the bookkeeper. Keeps a wheel-lock pistol.', means: ['firearm', 'blade'] },
      { name: 'Kit Morrow', role: 'apprentice', profile: 'A boy player who works the ropes for the flying effects.', means: ['strangle', 'drown'] },
      { name: 'Bess Ward', role: 'ale-wife', profile: 'Sells ale in the yard; strong-armed from rolling barrels.', means: ['blunt', 'drown'] },
      { name: 'Master Fenn', role: 'scrivener', profile: 'Copies out the players\' parts by candlelight and sharpens his own penknife.', means: ['poison', 'blade'] },
    ],
    methods: { poison: 'Ratsbane', blade: 'Rapier', blunt: 'Cudgel', strangle: 'Cord', drown: 'Drowning', firearm: 'Pistol' },
    herrings: [
      'Hazelnut shells under the benches, the groundlings\' supper.',
      'A wig hangs on a nail, still smelling of rosewater.',
      'Someone chalked a tally of debts on the wall; the sums are months old.',
      'A cat sleeps on a coil of rope.',
      'Rain has filled the yard drain to the brim.',
      'A torn playbill, much folded, in a doublet pocket.',
    ],
  },
  'venice-1750': {
    title: 'Masks at Carnival',
    setting: 'Venice, Carnival of 1750',
    intro: 'Half the city is masked and the gaming rooms never close. Somewhere between the canals and the card tables, someone used the masks to kill.',
    fact: 'Venice let anyone post an anonymous denunciation into a bocca di leone, a stone lion\'s mouth in the wall, for the magistrates to read. The Signori di Notte policed the city after dark, and masks were often restricted outside Carnival because they hid crimes.',
    examiner: 'the physician of the night magistrates',
    hours: ['9 pm', '10 pm', '11 pm', 'midnight', '1 am', '2 am'],
    victims: [
      { name: 'Count Alvise Ferro', role: 'a gambler', foundAt: 'at the foot of his water-stairs' },
      { name: 'Lucia Bon', role: 'his housekeeper', foundAt: 'in the linen room' },
    ],
    places: [
      { name: 'gaming rooms', witness: 'A croupier' },
      { name: 'water-stairs', witness: 'A gondolier' },
      { name: 'café on the Piazza', witness: 'The waiter' },
      { name: 'glassworks yard', witness: 'The night watchman' },
    ],
    suspects: [
      { name: 'Marco Sanudo', role: 'nephew', profile: 'Heir to the count\'s house and to his debts. Carries a pocket pistol.', means: ['firearm', 'blade'] },
      { name: 'Sister Elena', role: 'cousin', profile: 'Brews remedies at her convent and keeps arsenic for the rats.', means: ['poison', 'strangle'] },
      { name: 'Pietro', role: 'gondolier', profile: 'Rows the count home every night; strong as his oar.', means: ['drown', 'strangle'] },
      { name: 'Signora Zen', role: 'rival player', profile: 'Lost a fortune to the count at faro last week.', means: ['poison', 'blade'] },
      { name: 'Doctor Valier', role: 'physician', profile: 'Goes masked as a plague doctor and carries a case of scalpels.', means: ['poison', 'blade'] },
      { name: 'Tonio', role: 'mask-maker', profile: 'Works gesso and papier-mâché with a heavy mallet.', means: ['blunt', 'drown'] },
    ],
    methods: { poison: 'Arsenic', blade: 'Stiletto', blunt: 'Mallet', strangle: 'Silk cord', drown: 'Drowning', firearm: 'Pistol' },
    herrings: [
      'A lost white bauta mask floats by the steps.',
      'Faro cards scattered on the floor, the queen of cups on top.',
      'A love letter, unsigned, smelling of orange water.',
      'The candles in the hall burned down to their sockets.',
      'Somebody has scratched a lion on the shutter.',
      'Spilled chocolate on a gilt chair.',
    ],
  },
  'song-1247': {
    title: 'Injustice at the Ford',
    setting: 'A county in Fujian, Song dynasty, 1247',
    intro: 'The new county coroner has a fresh copy of the forensic handbook and a body by the river. The magistrate wants a confession by dawn; the coroner wants the truth.',
    fact: 'In 1247 the judge Song Ci finished Collected Cases of Injustice Rectified, the oldest known handbook of forensic medicine. It taught examiners to tell a real drowning from a body thrown in after death, and a hanging from a strangling, by the marks on the body.',
    examiner: 'the coroner',
    hours: ['the first watch', 'the second watch', 'the third watch', 'the fourth watch', 'the fifth watch', 'dawn'],
    victims: [
      { name: 'Merchant Lin', role: 'a salt trader', foundAt: 'in the shallows by the ferry' },
      { name: 'Old Hu', role: 'the ferryman', foundAt: 'in his reed hut' },
    ],
    places: [
      { name: 'ferry landing', witness: 'A fisherman' },
      { name: 'teahouse', witness: 'The tea boy' },
      { name: 'county granary', witness: 'The granary guard' },
      { name: 'Earth God temple', witness: 'A monk' },
    ],
    suspects: [
      { name: 'Wang Er', role: 'porter', profile: 'Carries salt sacks; quarrelled with the merchant over wages.', means: ['blunt', 'drown'] },
      { name: 'Madam Zhou', role: 'herbalist', profile: 'Sells medicines, among them arsenic for rats.', means: ['poison', 'smother'] },
      { name: 'Liu the clerk', role: 'county clerk', profile: 'Keeps the ledgers; the merchant owed him a bribe.', means: ['poison', 'strangle'] },
      { name: 'Chen San', role: 'boatman', profile: 'Rival of the ferryman for the crossing trade.', means: ['drown', 'blade'] },
      { name: 'Guo the butcher', role: 'butcher', profile: 'Owns a cleaver and a short temper.', means: ['blade', 'blunt'] },
      { name: 'Sun Mei', role: 'the merchant\'s concubine', profile: 'Would inherit nothing; knows every room of the house.', means: ['smother', 'poison'] },
    ],
    methods: { poison: 'Arsenic', blade: 'Knife', blunt: 'Club', strangle: 'Cord', drown: 'Drowning', smother: 'Quilt' },
    herrings: [
      'Joss sticks burned down to ash before the altar.',
      'A broken sandal strap in the mud.',
      'A debt slip for three strings of cash, long since paid.',
      'Ducks asleep under the landing.',
      'A cracked tea bowl, rinsed clean.',
      'Salt crystals on the floorboards, from the day\'s loading.',
    ],
  },
  'sleeper-1869': {
    title: 'Night on the Sleeping Car',
    setting: 'Union Pacific, Wyoming Territory, 1869',
    intro: 'The new line runs all the way to California now. Somewhere past Laramie a passenger in the sleeping car stopped breathing, and nobody has left the train.',
    fact: 'The first transcontinental railroad in the United States was finished with the golden spike at Promontory Summit, Utah, on 10 May 1869. Sleeping cars like George Pullman\'s let passengers cross from coast to coast in about a week instead of months.',
    examiner: 'a doctor travelling in the next car',
    hours: ['9 pm', '10 pm', '11 pm', 'midnight', '1 am', '2 am'],
    victims: [
      { name: 'Amos Pratt', role: 'a railroad bond dealer', foundAt: 'in berth 7' },
      { name: 'Ida Fell', role: 'his secretary', foundAt: 'on the rear platform' },
    ],
    places: [
      { name: 'dining car', witness: 'The waiter' },
      { name: 'smoking car', witness: 'The brakeman' },
      { name: 'baggage car', witness: 'The express messenger' },
      { name: 'water stop at Laramie', witness: 'The station agent' },
    ],
    suspects: [
      { name: 'Colonel Brand', role: 'army veteran', profile: 'Carries his service revolver everywhere.', means: ['firearm', 'blade'] },
      { name: 'Mrs. Ellery', role: 'widow', profile: 'Takes laudanum for her nerves and keeps the bottle by her berth.', means: ['poison', 'smother'] },
      { name: 'Jake Dunn', role: 'porter', profile: 'Makes up the berths and knows every lock in the car.', means: ['smother', 'strangle'] },
      { name: 'Dr. Whitcomb', role: 'dentist', profile: 'Travels with a bag of steel tools and a bottle of chloroform.', means: ['poison', 'blade'] },
      { name: 'Sam Rourke', role: 'track boss', profile: 'Built this line and quarrelled with the dealer over pay.', means: ['blunt', 'firearm'] },
      { name: 'Lottie Gray', role: 'singer', profile: 'Bound for San Francisco; her silk scarf never leaves her.', means: ['strangle', 'poison'] },
    ],
    methods: { poison: 'Laudanum', blade: 'Knife', blunt: 'Coupling pin', strangle: 'Scarf', smother: 'Pillow', firearm: 'Revolver' },
    herrings: [
      'Cinders from the engine have blown in through a cracked window.',
      'A dime novel, its corners turned down.',
      'A telegram from Omaha about cattle prices.',
      'Cigar ash on the carpet, a good Havana.',
      'The stove in the car has gone cold.',
      'A child\'s tin whistle under a seat.',
    ],
  },
  'mayfair-1893': {
    title: 'The House in Mayfair',
    setting: 'London, 1893',
    intro: 'A banker\'s townhouse, a dinner party that ended early, and a household that all went to bed at different times. By morning the police surgeon had been sent for.',
    fact: 'Victorian Britain sold arsenic in flypapers, rat poison and green wallpaper dye. The Arsenic Act of 1851 made every seller record each sale in a poisons register, and the Marsh test of 1836 could find even a trace of it in a body.',
    examiner: 'the police surgeon',
    hours: ['8 pm', '9 pm', '10 pm', '11 pm', 'midnight', '1 am'],
    victims: [
      { name: 'Sir Henry Vane', role: 'a banker', foundAt: 'in the library' },
      { name: 'Mrs. Partridge', role: 'the cook', foundAt: 'in the scullery' },
    ],
    places: [
      { name: 'servants\' hall', witness: 'The footman' },
      { name: 'club on Pall Mall', witness: 'The hall porter' },
      { name: 'chemist\'s on Bond Street', witness: 'The chemist' },
      { name: 'mews', witness: 'The stable boy' },
    ],
    suspects: [
      { name: 'Lady Vane', role: 'wife', profile: 'Uses arsenic complexion wafers, as many ladies did.', means: ['poison', 'smother'] },
      { name: 'Captain Royce', role: 'nephew', profile: 'Back from India with a service revolver and debts.', means: ['firearm', 'blade'] },
      { name: 'Miss Lark', role: 'governess', profile: 'Quiet and clever; reads chemistry books at night.', means: ['poison', 'strangle'] },
      { name: 'Hobbs', role: 'butler', profile: 'Holds every key in the house.', means: ['blunt', 'poison'] },
      { name: 'Doctor Ashby', role: 'family physician', profile: 'Calls every week and signs the household\'s certificates.', means: ['poison', 'smother'] },
      { name: 'Tom Pike', role: 'groom', profile: 'Strong, sullen, and dismissed yesterday.', means: ['blunt', 'strangle'] },
    ],
    methods: { poison: 'Arsenic', blade: 'Paper knife', blunt: 'Poker', strangle: 'Bell cord', smother: 'Cushion', firearm: 'Revolver' },
    herrings: [
      'The fire in the grate was banked at ten.',
      'A sheet of green wallpaper samples on the desk.',
      'The dog did not bark; it is deaf and fourteen years old.',
      'An unopened letter from the bank\'s Paris office.',
      'Muddy boots by the area door, the groom\'s as always.',
      'A cut-glass decanter, the port untouched.',
    ],
  },
}
