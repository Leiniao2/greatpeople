// Authored cases for Detective.  Each is a real place and time with a
// fictional cast, a drawn scene full of things to examine, a few questions
// to put to everyone, and a handful of tricks a killer might have used.  The
// fact shown on a win is real history.  Which trick was used, who used it,
// where everyone claims to have been and what the scene shows are decided
// per seed (./model).

export type MethodId = 'poison' | 'blade' | 'blunt' | 'strangle' | 'firearm' | 'drown' | 'smother'

/** Things the scene can draw (./Scene.tsx). */
export type Glyph =
  | 'body' | 'candle' | 'book' | 'sword' | 'rope' | 'coat' | 'trapdoor' | 'cup' | 'chest' | 'window'
  | 'barrel' | 'mask' | 'boat' | 'cards' | 'lantern' | 'post' | 'bottle' | 'sack' | 'pillow' | 'altar'
  | 'boots' | 'pole' | 'stove' | 'letter' | 'pin' | 'scarf' | 'decanter' | 'cushion' | 'fireplace'
  | 'bellcord' | 'knife' | 'clock' | 'dog' | 'plate' | 'tray' | 'door' | 'wig' | 'bag' | 'basket'

export interface SceneObjectDef {
  id: string
  glyph: Glyph
  /** Centre, in a 320 × 200 scene. */
  x: number
  y: number
  /** Scale, 1 = a 40-unit box. */
  size?: number
  name: string
  /** What a close look shows when nothing was done to it. */
  plain: string
}

export interface TrickDef {
  id: string
  /** Short name, used when the player must say how it was done. */
  label: string
  method: MethodId
  /** What a close look shows on each object the trick touched; the body is always among them. */
  traces: Record<string, string>
  /** The killer's cover story: a false answer to one of the case questions, and the object it cannot square with. */
  lie: { q: number; text: string; clashes: string; why: string }
  /** The whole trick, told on the solution. */
  how: string
}

export interface SuspectDef {
  name: string
  role: string
  profile: string
  means: MethodId[]
  /** Honest answers to the case questions, in order. */
  answers: string[]
}

export interface CaseDef {
  title: string
  setting: string
  intro: string
  fact: string
  /** Six consecutive hours of the night. */
  hours: string[]
  victim: { name: string; role: string; foundAt: string }
  /** Where a suspect may say they were. */
  places: string[]
  /** Wall and floor colours of the scene. */
  palette: { wall: string; floor: string; trim: string }
  scene: SceneObjectDef[]
  questions: string[]
  suspects: SuspectDef[]
  tricks: TrickDef[]
  methods: Record<MethodId, string>
}

export const CASES: Record<string, CaseDef> = {
  'globe-1599': {
    title: 'Murder at the Globe',
    setting: 'Bankside, London, 1599',
    intro: 'The new playhouse has been open a month. After the revels the company locked up, and by dawn the bookkeeper lay dead in the tiring-house.',
    fact: 'The Globe opened on Bankside in 1599, built from the timbers of The Theatre, which the Burbages\' men pulled down in Shoreditch over Christmas 1598. It burned down in 1613 when a stage cannon fired during Henry VIII set the thatch alight.',
    hours: ['10 pm', '11 pm', 'midnight', '1 am', '2 am', '3 am'],
    victim: { name: 'Thomas Heale', role: 'the company bookkeeper', foundAt: 'in the tiring-house' },
    places: ['yard', 'Anchor tavern', 'river stairs', 'property room'],
    palette: { wall: '#4a3728', floor: '#7a5a3a', trim: '#2b1d12' },
    scene: [
      { id: 'body', glyph: 'body', x: 160, y: 158, size: 1.3, name: 'the body', plain: 'Thomas Heale lies on his back among the costume baskets, his ledger under one arm.' },
      { id: 'candle', glyph: 'candle', x: 44, y: 60, name: 'the candle', plain: 'A tallow candle burned down to a stub; it was lit for hours.' },
      { id: 'ledger', glyph: 'book', x: 110, y: 112, name: 'the ledger', plain: 'The takings are entered to the last penny in a neat hand.' },
      { id: 'rapier', glyph: 'sword', x: 250, y: 64, name: 'the property rapier', plain: 'The stage rapier hangs on its rack, its blunt button in place.' },
      { id: 'rope', glyph: 'rope', x: 290, y: 44, name: 'the flying rope', plain: 'The rope for the flying throne is coiled on its cleat, sunwise, as the apprentice always leaves it.' },
      { id: 'rack', glyph: 'coat', x: 200, y: 62, name: 'the costume rack', plain: 'Doublets and gowns hang in order of the play, all dry and brushed.' },
      { id: 'trap', glyph: 'trapdoor', x: 60, y: 172, name: 'the trapdoor', plain: 'The stage trap is bolted from below, dusty on the bolt.' },
      { id: 'jug', glyph: 'cup', x: 112, y: 64, name: 'the posset jug', plain: 'A jug of hot posset gone cold; honest nutmeg and ale.' },
      { id: 'chest', glyph: 'chest', x: 262, y: 150, name: 'the wardrobe chest', plain: 'Needles, thread, moth-herbs and a sealed paper of ratsbane against the mice.' },
      { id: 'window', glyph: 'window', x: 160, y: 40, name: 'the shutter', plain: 'The shutter is latched; rain has streaked the sill.' },
      { id: 'barrel', glyph: 'barrel', x: 30, y: 128, name: 'the rain barrel', plain: 'Full to the brim after the evening\'s rain.' },
      { id: 'wig', glyph: 'wig', x: 230, y: 108, name: 'the wig', plain: 'A queen\'s wig on its block, smelling of rosewater.' },
    ],
    questions: [
      'When did you last see Thomas Heale?',
      'Did you hear anything after the doors were locked?',
      'Who handled the stage properties tonight?',
    ],
    suspects: [
      { name: 'Walter Crane', role: 'player', profile: 'Plays the kings and fences on stage every afternoon.', means: ['blade', 'blunt'],
        answers: ['He was counting the takings when I left the tiring-house.', 'The rain on the thatch, nothing else.', 'The boy and I put the swords away after the jig.'] },
      { name: 'Joan Hart', role: 'seamstress', profile: 'Mends the costumes and keeps ratsbane against the wardrobe mice.', means: ['poison', 'strangle'],
        answers: ['He asked me for a candle at ten and I gave him one.', 'I sleep in the wardrobe loft and heard a door, once.', 'I only touched the gowns; the swords are not my business.'] },
      { name: 'Gideon Lowe', role: 'sharer', profile: 'Part-owner of the company, owed money by the bookkeeper. Keeps a wheel-lock pistol.', means: ['firearm', 'blade'],
        answers: ['We argued about my share and I left him to his sums.', 'A watchman calling the hour on the Bankside.', 'I do not handle properties; I own them.'] },
      { name: 'Kit Morrow', role: 'apprentice', profile: 'A boy player who works the ropes for the flying effects.', means: ['strangle', 'drown'],
        answers: ['He boxed my ears for losing a cue and sent me to bed.', 'Master Crane snoring through the wall.', 'I coiled the flying rope and hung the swords with Master Crane.'] },
      { name: 'Bess Ward', role: 'ale-wife', profile: 'Sells ale in the yard; strong-armed from rolling barrels.', means: ['blunt', 'strangle'],
        answers: ['He paid me for the posset ale and bade me goodnight.', 'Barrels rolling, which was me.', 'I never go backstage; the players guard it like a chapel.'] },
      { name: 'Master Fenn', role: 'scrivener', profile: 'Copies out the players\' parts by candlelight and sharpens his own penknife.', means: ['poison', 'blade'],
        answers: ['He brought me a part to copy and I saw him no more.', 'My own pen scratching until the candle went.', 'I copy parts; I do not carry them.'] },
    ],
    tricks: [
      { id: 'rapier', label: 'The unbuttoned rapier', method: 'blade',
        traces: {
          body: 'A single narrow wound under the ribs; the doublet shows one clean cut and little blood: a thin blade, thrust once.',
          rapier: 'The button is gone from the stage rapier and the blade has been wiped and oiled; a red thread lies in the fuller.',
          rack: 'One doublet hangs damp at the cuff, sponged clean but not yet dry.',
        },
        lie: { q: 2, text: 'The swords went straight back on the rack after the jig, buttons and all; nobody touched them after.', clashes: 'rapier',
          why: 'The rapier\'s button is gone and the blade was wiped and oiled after the jig.' },
        how: 'The stage rapier was unbuttoned, used once, wiped, oiled and hung back on its rack as if it had never left the play.' },
      { id: 'posset', label: 'Ratsbane in the posset', method: 'poison',
        traces: {
          body: 'Vomit on the collar and the belly drawn up in cramp; there is no wound anywhere.',
          jug: 'A grey grit at the bottom of the posset jug that is not nutmeg; it smells faintly of garlic. Ratsbane.',
          chest: 'The paper of ratsbane in the wardrobe chest has been torn open and is half empty.',
        },
        lie: { q: 0, text: 'He had nothing to drink after the play; the ale was locked away with the takings.', clashes: 'jug',
          why: 'The posset jug was drunk from, and its dregs hold ratsbane.' },
        how: 'Ratsbane from the wardrobe chest was stirred into the bookkeeper\'s hot posset; the nutmeg hid the taste.' },
      { id: 'flyrope', label: 'The flying rope', method: 'strangle',
        traces: {
          body: 'A thin livid line circles the neck with the twist pattern of hemp; the heels are scuffed from being dragged.',
          rope: 'The flying rope is wound back on its cleat the wrong way round, and there is a fresh kink a yard from the end.',
          trap: 'The dust on the trap bolt is wiped and boot heels have scored the boards towards it.',
        },
        lie: { q: 2, text: 'The flying rope has not left its cleat since the matinee; I saw it coiled sunwise, as always.', clashes: 'rope',
          why: 'The rope was recoiled the wrong way, with a fresh kink from being pulled tight.' },
        how: 'The rope for the flying throne was slipped off its cleat, pulled tight round the bookkeeper\'s neck, then coiled back, but widdershins.' },
      { id: 'shot', label: 'The muffled pistol', method: 'firearm',
        traces: {
          body: 'A small burnt hole in the doublet over the heart, powder grains in the cloth: shot at arm\'s length through a cloak.',
          candle: 'The candle guttered out from a blast of air; grains of black powder are stuck in its wax.',
          window: 'The shutter was opened and latched again; a smear of soot is on the latch.',
        },
        lie: { q: 1, text: 'The bang at midnight was the thunder-sheet; I dropped it in the property room and the candle went out from the draught.', clashes: 'candle',
          why: 'Powder grains in the candle wax: the draught that put it out was a pistol shot.' },
        how: 'A wheel-lock was fired through a folded cloak to dull the sound; the shutter was opened to let the smoke out and latched again.' },
    ],
    methods: { poison: 'Ratsbane', blade: 'Rapier', blunt: 'Cudgel', strangle: 'Rope', drown: 'Drowning', firearm: 'Pistol', smother: 'Smothering' },
  },

  'venice-1750': {
    title: 'Masks at Carnival',
    setting: 'Venice, Carnival of 1750',
    intro: 'Half the city is masked and the gaming rooms never close. Count Alvise Ferro was found at the foot of his own water-stairs before the lamps went out.',
    fact: 'Venice let anyone post an anonymous denunciation into a bocca di leone, a stone lion\'s mouth in the wall, for the magistrates to read. The Signori di Notte policed the city after dark, and masks were often restricted outside Carnival because they hid crimes.',
    hours: ['9 pm', '10 pm', '11 pm', 'midnight', '1 am', '2 am'],
    victim: { name: 'Count Alvise Ferro', role: 'a gambler', foundAt: 'at the foot of his water-stairs' },
    places: ['gaming rooms', 'café on the Piazza', 'glassworks yard', 'Count\'s hall'],
    palette: { wall: '#3b4a5c', floor: '#5c6b78', trim: '#1f2a36' },
    scene: [
      { id: 'body', glyph: 'body', x: 150, y: 160, size: 1.3, name: 'the body', plain: 'The Count lies on the lowest step, one hand trailing in the canal.' },
      { id: 'gondola', glyph: 'boat', x: 262, y: 170, size: 1.2, name: 'the gondola', plain: 'Moored at the stairs, its oar lashed to the forcola, dry since dusk.' },
      { id: 'mask', glyph: 'mask', x: 54, y: 164, name: 'the white bauta', plain: 'A white bauta mask floats by the steps, as masks do at Carnival.' },
      { id: 'cards', glyph: 'cards', x: 70, y: 70, name: 'the faro cards', plain: 'Cards scattered on the hall table, the queen of cups on top.' },
      { id: 'cup', glyph: 'cup', x: 118, y: 70, name: 'the chocolate cup', plain: 'A cup of chocolate drunk to the dregs, a silver spoon beside it.' },
      { id: 'sconce', glyph: 'candle', x: 160, y: 44, name: 'the candle sconce', plain: 'Candles burned to their sockets.' },
      { id: 'cloak', glyph: 'coat', x: 210, y: 66, name: 'the Count\'s cloak', plain: 'A black cloak on its peg, smelling of tobacco.' },
      { id: 'post', glyph: 'post', x: 298, y: 120, name: 'the mooring post', plain: 'A striped mooring post with the gondola\'s hemp rope hitched to it.' },
      { id: 'window', glyph: 'window', x: 250, y: 40, name: 'the balcony window', plain: 'The window over the stairs is shuttered, as the Count ordered.' },
      { id: 'lantern', glyph: 'lantern', x: 40, y: 112, name: 'the stair lantern', plain: 'The lantern on the stairs still burns, its wick trimmed once at dusk.' },
      { id: 'ledger', glyph: 'letter', x: 110, y: 118, name: 'the debt book', plain: 'Debts owed to and by the Count, most of them marked unpaid.' },
      { id: 'tray', glyph: 'tray', x: 170, y: 112, name: 'the silver tray', plain: 'A tray with one clean cup turned upside down.' },
    ],
    questions: [
      'When did you last see the Count?',
      'Who wore a bauta mask tonight?',
      'What happened on the water-stairs?',
    ],
    suspects: [
      { name: 'Marco Sanudo', role: 'nephew', profile: 'Heir to the Count\'s house and to his debts. Carries a pocket pistol.', means: ['firearm', 'blade'],
        answers: ['At the faro table, winning for once.', 'My uncle, and half of Venice.', 'I heard nothing from the stairs; the gaming rooms are loud.'] },
      { name: 'Sister Elena', role: 'cousin', profile: 'Brews remedies at her convent and keeps arsenic for the rats.', means: ['poison', 'strangle'],
        answers: ['He asked me to pray for his luck, which I did.', 'I wear no mask; the habit is mask enough.', 'I keep away from the water; I cannot swim.'] },
      { name: 'Pietro', role: 'gondolier', profile: 'Rows the Count home every night; strong as his oar.', means: ['drown', 'strangle'],
        answers: ['I rowed him home at nine and he dismissed me for the night.', 'Any gentleman who wished to go unknown.', 'I was not at the stairs after nine.'] },
      { name: 'Signora Zen', role: 'rival player', profile: 'Lost a fortune to the Count at faro last week.', means: ['poison', 'blade'],
        answers: ['Across the faro table, taking my money again.', 'I had a moretta; a bauta spoils the gown.', 'I never went down to the water.'] },
      { name: 'Doctor Valier', role: 'physician', profile: 'Goes masked as a plague doctor and carries a case of scalpels.', means: ['poison', 'blade'],
        answers: ['He complained of his liver and I prescribed abstinence.', 'I wore the beak, as always; a bauta hides nothing.', 'I was called to the stairs only when they found him.'] },
      { name: 'Tonio', role: 'mask-maker', profile: 'Works gesso and papier-mâché with a heavy mallet.', means: ['blunt', 'drown'],
        answers: ['He owed me for six masks and paid for none.', 'I sold bautas to five people this week; I keep no list.', 'I heard a splash from the yard, late, and thought nothing of it.'] },
    ],
    tricks: [
      { id: 'bauta', label: 'The second bauta', method: 'blade',
        traces: {
          body: 'One narrow wound between the ribs, a stiletto\'s width; the cloak is unmarked because he was not wearing it.',
          mask: 'The white bauta by the steps is too small for the Count\'s head and has blood inside the chin: a second bauta, worn by whoever held the blade.',
          cloak: 'The Count\'s cloak hangs dry on its peg though he was found by the water; he went down to meet someone he knew.',
        },
        lie: { q: 1, text: 'Nobody but the Count had a bauta tonight; the rest of us wore morettas and beaks.', clashes: 'mask',
          why: 'The bauta by the steps is too small for the Count and bloodied inside: someone else wore one.' },
        how: 'A second white bauta let the killer pass for any gentleman on the stairs; one stiletto thrust, and the mask was dropped in the canal.' },
      { id: 'chocolate', label: 'Arsenic in the chocolate', method: 'poison',
        traces: {
          body: 'The belly cramped, the lips blue-grey, vomit on the lace; no wound at all.',
          cup: 'Grit at the bottom of the chocolate cup; the dregs are bitter and the silver spoon has turned black.',
          tray: 'The second cup on the tray was rinsed and set down wet: someone drank with him and washed their cup.',
        },
        lie: { q: 0, text: 'He took no chocolate tonight; after supper he drank only wine.', clashes: 'cup',
          why: 'The chocolate cup was drunk to the dregs, and the dregs hold arsenic.' },
        how: 'Arsenic stirred into the Count\'s chocolate, bitter enough to hide in bitter chocolate; the killer shared a cup to allay suspicion and rinsed their own.' },
      { id: 'silkcord', label: 'The cord from the window', method: 'strangle',
        traces: {
          body: 'A thin line round the neck with the weave of silk pressed into the skin, and bruises on the nape.',
          post: 'A silk cord is knotted to the mooring post under the hemp rope, frayed where it was hauled tight.',
          window: 'The balcony window over the stairs stands open; the silk cord was dropped from here and drawn up.',
        },
        lie: { q: 2, text: 'The stairs were empty and the window above them was shuttered all night, as the Count ordered.', clashes: 'window',
          why: 'The window over the stairs stands open, with the cord\'s mark on the sill.' },
        how: 'A silk cord dropped from the balcony window as the Count stood on the stairs, hauled from above and tied off on the mooring post.' },
      { id: 'oar', label: 'Held under with the oar', method: 'drown',
        traces: {
          body: 'Froth at the mouth and nose, canal weed under the fingernails, and a bruise across the shoulders the width of an oar blade.',
          gondola: 'The oar is wet to the handle and freshly scored; the forcola is loose where it was wrenched.',
          lantern: 'The stair lantern was put out and relit: the wick has been trimmed twice.',
        },
        lie: { q: 2, text: 'The gondola never left its mooring and the oar stayed lashed to it, dry since dusk.', clashes: 'gondola',
          why: 'The oar is wet to the handle and scored, and the forcola was wrenched loose.' },
        how: 'The Count was pushed from the lowest step and held under with the gondola\'s oar, the lantern put out so no window would see.' },
    ],
    methods: { poison: 'Arsenic', blade: 'Stiletto', blunt: 'Mallet', strangle: 'Silk cord', drown: 'Drowning', firearm: 'Pistol', smother: 'Smothering' },
  },

  'song-1247': {
    title: 'Injustice at the Ford',
    setting: 'A county in Fujian, Song dynasty, 1247',
    intro: 'The new county coroner has a fresh copy of the forensic handbook and a body in the shallows by the ferry. The magistrate wants a confession by dawn; the coroner wants the truth.',
    fact: 'In 1247 the judge Song Ci finished Collected Cases of Injustice Rectified, the oldest known handbook of forensic medicine. It taught examiners to tell a real drowning from a body thrown in after death, and a hanging from a strangling, by the marks on the body.',
    hours: ['the first watch', 'the second watch', 'the third watch', 'the fourth watch', 'the fifth watch', 'dawn'],
    victim: { name: 'Merchant Lin', role: 'a salt trader', foundAt: 'in the shallows by the ferry' },
    places: ['ferry landing', 'teahouse', 'county granary', 'Earth God temple'],
    palette: { wall: '#5b6b4a', floor: '#8a7a55', trim: '#2f3a28' },
    scene: [
      { id: 'body', glyph: 'body', x: 150, y: 165, size: 1.3, name: 'the body', plain: 'Merchant Lin lies face up in the reeds, his silk gown heavy with river water.' },
      { id: 'boat', glyph: 'boat', x: 270, y: 168, size: 1.2, name: 'the ferry boat', plain: 'The flat ferry boat is pulled up on the mud, its pole across the thwarts.' },
      { id: 'bowl', glyph: 'cup', x: 70, y: 74, name: 'the tea bowl', plain: 'A cracked tea bowl, rinsed clean and set upside down.' },
      { id: 'sack', glyph: 'sack', x: 236, y: 112, name: 'the salt sack', plain: 'A sack of salt tied with its own hemp cord, waiting for the morning boat.' },
      { id: 'lantern', glyph: 'lantern', x: 40, y: 120, name: 'the hut lantern', plain: 'The ferryman\'s lantern, oil half gone; it burned from dusk till the third watch.' },
      { id: 'quilt', glyph: 'pillow', x: 118, y: 72, name: 'the quilt', plain: 'A cotton quilt folded on the ferryman\'s sleeping platform, dry and undisturbed.' },
      { id: 'altar', glyph: 'altar', x: 170, y: 62, name: 'the Earth God altar', plain: 'Joss sticks burned down to ash before the little altar; the ash lies in a neat cone.' },
      { id: 'slip', glyph: 'letter', x: 200, y: 112, name: 'the papers in the sleeve', plain: 'A debt slip for three strings of cash, long since paid.' },
      { id: 'pole', glyph: 'pole', x: 290, y: 90, size: 1.1, name: 'the boat pole', plain: 'A bamboo pole, worn smooth, mud on the foot.' },
      { id: 'prints', glyph: 'boots', x: 60, y: 172, name: 'the footprints', plain: 'Many prints in the mud of the landing: porters, ducks, the ferryman.' },
      { id: 'door', glyph: 'door', x: 240, y: 52, name: 'the hut door', plain: 'A reed door on leather hinges, half open.' },
      { id: 'basket', glyph: 'basket', x: 110, y: 120, name: 'the fish basket', plain: 'Two carp, still alive, from the evening\'s lines.' },
    ],
    questions: [
      'When did Merchant Lin come down to the ferry?',
      'What did you hear from the river?',
      'Who was inside the ferryman\'s hut with him?',
    ],
    suspects: [
      { name: 'Wang Er', role: 'porter', profile: 'Carries salt sacks; quarrelled with the merchant over wages.', means: ['blunt', 'drown'],
        answers: ['At dusk, to count the sacks and dock my pay.', 'Frogs. The river is all frogs at night.', 'Not I. He does not let porters sit with him.'] },
      { name: 'Madam Zhou', role: 'herbalist', profile: 'Sells medicines, among them arsenic for rats.', means: ['poison', 'smother'],
        answers: ['He bought a liver tonic from my stall in the afternoon.', 'I was in the town; the river is too far to hear.', 'I never set foot in that hut.'] },
      { name: 'Liu the clerk', role: 'county clerk', profile: 'Keeps the ledgers; the merchant owed him a bribe.', means: ['poison', 'strangle'],
        answers: ['He came to the granary at dusk to stamp his salt permit.', 'The watchman\'s clapper, every watch.', 'I had no business in a ferryman\'s hut.'] },
      { name: 'Chen San', role: 'boatman', profile: 'Rival of the ferryman for the crossing trade.', means: ['drown', 'blade'],
        answers: ['He came down after dark to ask my price for a crossing.', 'Oars, upstream; the night boats to the salt yards.', 'Old Hu the ferryman, I suppose; it is his hut.'] },
      { name: 'Guo the butcher', role: 'butcher', profile: 'Owns a cleaver and a short temper.', means: ['blade', 'blunt'],
        answers: ['I saw him pass my shop at dusk and spat.', 'I sleep like a hog; I heard nothing.', 'He would not sit with a butcher.'] },
      { name: 'Sun Mei', role: 'the merchant\'s concubine', profile: 'Would inherit nothing; knows every room of the house.', means: ['smother', 'poison'],
        answers: ['He left the house at dusk and said he would be back by the third watch.', 'From the house I hear only the house.', 'He often waited for the boat in the hut, with tea.'] },
    ],
    tricks: [
      { id: 'thrown', label: 'Drowned after death', method: 'blunt',
        traces: {
          body: 'No froth at the mouth, no water in the belly, no mud under the nails: the handbook says he was dead before the river took him. A dent behind the ear.',
          pole: 'The foot of the bamboo pole is split, and a hair is caught in the split with dried blood.',
          prints: 'Two sets of prints go down to the water, deep, carrying a weight; one set comes back light.',
        },
        lie: { q: 1, text: 'I heard him cry out and splash; he went in drunk and the river did the rest.', clashes: 'body',
          why: 'A man who drowns swallows the river; this one has no water in him. He was dead before he went in.' },
        how: 'One blow behind the ear with the boat pole, then the body carried into the shallows to pass for a drunkard\'s drowning.' },
      { id: 'tea', label: 'Arsenic in the tea', method: 'poison',
        traces: {
          body: 'The belly drawn up in cramp, the nails blue, no wound; the handbook\'s silver needle, pushed into the throat, comes out black.',
          bowl: 'The bowl was rinsed, but a silver hairpin dipped in the last drops turns black: arsenic.',
          slip: 'In the merchant\'s sleeve, a receipt from the herbalist\'s stall for rat powder, dated yesterday, in another\'s name.',
        },
        lie: { q: 2, text: 'Nobody drank tea with him; the stove was cold and that bowl is the ferryman\'s own, unused.', clashes: 'bowl',
          why: 'The bowl was used tonight and rinsed, and its dregs turn silver black.' },
        how: 'Rat powder in the merchant\'s tea while he waited for the boat, the bowl rinsed and the body rolled into the shallows.' },
      { id: 'quilt', label: 'The quilt', method: 'smother',
        traces: {
          body: 'Tiny red spots in the whites of the eyes, cotton fibres in the nose, and no water in the lungs.',
          quilt: 'The quilt is damp at one corner and pressed flat, with the shape of a struggle across it; a thread of silk gown is caught in the seam.',
          lantern: 'The lantern was put out early: the oil is nearly full though it was lit at dusk.',
        },
        lie: { q: 0, text: 'He never went into the hut; he stood on the landing the whole time, waiting for the boat.', clashes: 'quilt',
          why: 'His gown left a silk thread in the quilt, and the quilt bears the shape of the struggle.' },
        how: 'The lantern put out, the quilt pressed over his face on the sleeping platform, and the body dragged to the water.' },
      { id: 'sackcord', label: 'The salt-sack cord', method: 'strangle',
        traces: {
          body: 'A line round the neck with the three-strand twist of hemp, deepest at the back: strangled from behind.',
          sack: 'The salt sack has been retied with a strip of cloth; its hemp cord is gone.',
          altar: 'The ash before the altar is scattered and the joss sticks were knocked over and stuck back in crooked.',
        },
        lie: { q: 2, text: 'The sacks were all tied with their own cords when I checked them at dusk, and nobody touched them after.', clashes: 'sack',
          why: 'One sack has lost its cord and was retied with cloth: the cord was taken after dusk.' },
        how: 'The cord from a salt sack, looped round the neck from behind as he knelt at the little altar, then the sack retied with a rag.' },
    ],
    methods: { poison: 'Arsenic', blade: 'Knife', blunt: 'Boat pole', strangle: 'Cord', drown: 'Drowning', smother: 'Quilt', firearm: 'Firearm' },
  },

  'sleeper-1869': {
    title: 'Night on the Sleeping Car',
    setting: 'Union Pacific, Wyoming Territory, 1869',
    intro: 'The new line runs all the way to California now. Somewhere past Laramie a passenger in the sleeping car stopped breathing, and nobody has left the train.',
    fact: 'The first transcontinental railroad in the United States was finished with the golden spike at Promontory Summit, Utah, on 10 May 1869. Sleeping cars like George Pullman\'s let passengers cross from coast to coast in about a week instead of months.',
    hours: ['9 pm', '10 pm', '11 pm', 'midnight', '1 am', '2 am'],
    victim: { name: 'Amos Pratt', role: 'a railroad bond dealer', foundAt: 'in berth 7' },
    places: ['dining car', 'smoking car', 'baggage car', 'rear platform'],
    palette: { wall: '#5a3a2a', floor: '#6e4b36', trim: '#2b1a12' },
    scene: [
      { id: 'body', glyph: 'body', x: 150, y: 150, size: 1.3, name: 'the body', plain: 'Amos Pratt lies in berth 7 in his nightshirt, the blanket pulled to his chin.' },
      { id: 'pillow', glyph: 'pillow', x: 76, y: 136, name: 'the pillow', plain: 'A Pullman pillow, plump, with the company\'s monogram.' },
      { id: 'laudanum', glyph: 'bottle', x: 50, y: 70, name: 'the laudanum bottle', plain: 'Mrs Ellery\'s laudanum, half gone, as it has been since Omaha.' },
      { id: 'window', glyph: 'window', x: 160, y: 42, name: 'the window', plain: 'The pane is cracked from a stone at Cheyenne; cinders blow in.' },
      { id: 'stove', glyph: 'stove', x: 282, y: 150, size: 1.1, name: 'the stove', plain: 'The car stove, gone cold; the ash is grey and old.' },
      { id: 'lamp', glyph: 'lantern', x: 230, y: 50, name: 'the car lamp', plain: 'An oil lamp turned low, its glass clean.' },
      { id: 'bag', glyph: 'bag', x: 250, y: 110, name: 'the carpet bag', plain: 'A carpet bag under the seat, strapped shut, a San Francisco label on it.' },
      { id: 'telegram', glyph: 'letter', x: 100, y: 72, name: 'the telegram', plain: 'A telegram from Omaha about cattle prices.' },
      { id: 'pin', glyph: 'pin', x: 300, y: 72, name: 'the coupling pin', plain: 'A spare coupling pin on its hook by the door, black with grease.' },
      { id: 'scarf', glyph: 'scarf', x: 200, y: 110, name: 'the silk scarf', plain: 'A long silk scarf, the singer\'s, folded on her seat.' },
      { id: 'novel', glyph: 'book', x: 42, y: 170, name: 'the dime novel', plain: 'Deadwood Dick, its corners turned down.' },
      { id: 'boots', glyph: 'boots', x: 110, y: 110, name: 'the boots', plain: 'The dealer\'s boots, set out for the porter to black.' },
    ],
    questions: [
      'When did you last see Mr Pratt?',
      'What did you hear in the night?',
      'Who came through the car after the berths were made up?',
    ],
    suspects: [
      { name: 'Colonel Brand', role: 'army veteran', profile: 'Carries his service revolver everywhere.', means: ['firearm', 'blade'],
        answers: ['At cards in the smoking car, losing to him.', 'The whistle at Laramie; I sleep light.', 'The porter, making his rounds.'] },
      { name: 'Mrs. Ellery', role: 'widow', profile: 'Takes laudanum for her nerves and keeps the bottle by her berth.', means: ['poison', 'smother'],
        answers: ['He said goodnight to me in the aisle, quite civil.', 'Nothing; I take my drops and sleep.', 'I keep my curtain drawn; I could not say.'] },
      { name: 'Jake Dunn', role: 'porter', profile: 'Makes up the berths and knows every lock in the car.', means: ['smother', 'strangle'],
        answers: ['When I made up his berth and he gave me a dime.', 'The couplings; they talk all night on this grade.', 'Only me, sir, and I went through twice.'] },
      { name: 'Dr. Whitcomb', role: 'dentist', profile: 'Travels with a bag of steel tools and a bottle of chloroform.', means: ['poison', 'blade'],
        answers: ['He asked me about a bad tooth and I told him to wait for Sacramento.', 'Someone coughing, two berths down.', 'I saw a shape in the aisle but took it for the porter.'] },
      { name: 'Sam Rourke', role: 'track boss', profile: 'Built this line and quarrelled with the dealer over pay.', means: ['blunt', 'firearm'],
        answers: ['I told him what I thought of his bonds and went to the platform to smoke.', 'Rail joints. I can count the miles by them.', 'I came in from the platform at midnight and went to my berth.'] },
      { name: 'Lottie Gray', role: 'singer', profile: 'Bound for San Francisco; her silk scarf never leaves her.', means: ['strangle', 'poison'],
        answers: ['He asked me to sing in the dining car and I declined.', 'The wheels. I hum to them.', 'Somebody brushed my curtain late; I did not look.'] },
    ],
    tricks: [
      { id: 'pillow', label: 'The pillow', method: 'smother',
        traces: {
          body: 'Feathers caught in the mouth, red spots in the eyes, and no smell of laudanum on the breath.',
          pillow: 'The pillow is dented from the middle, both sides pushed in by a pair of hands, and damp where he breathed into it.',
          laudanum: 'The laudanum bottle is full to the neck; it has been topped up with water so no dose would be missed.',
        },
        lie: { q: 1, text: 'He took his drops and slept; I heard him snoring at one o\'clock.', clashes: 'body',
          why: 'There is no laudanum on his breath and feathers in his mouth: he did not sleep, he was smothered.' },
        how: 'The pillow pressed down with both hands while the wheels covered the sound, and the laudanum bottle topped up to suggest a sleeping draught.' },
      { id: 'whistle', label: 'The shot under the whistle', method: 'firearm',
        traces: {
          body: 'A small hole in the nightshirt over the heart with powder grains around it; a close shot.',
          window: 'The cracked pane has a neat round hole stopped with candle wax: the ball went on through.',
          lamp: 'The lamp glass is smoked on one side, as if a flash went off beside it.',
        },
        lie: { q: 1, text: 'Nothing but the whistle at Laramie; a shot in a car this size would have woken everyone.', clashes: 'window',
          why: 'The window has a bullet hole plugged with wax: there was a shot, timed under the whistle.' },
        how: 'The revolver fired as the engine whistled for Laramie, the hole in the window stopped with wax and the lamp turned down.' },
      { id: 'scarf', label: 'The silk scarf', method: 'strangle',
        traces: {
          body: 'A broad soft line round the neck with no twist marks: silk, not rope.',
          scarf: 'The scarf is stretched out of shape and its fringe is torn; a thread of it lies in berth 7.',
          bag: 'The scarf was stuffed into this bag afterwards, creased in a ball, and the strap was buckled wrong.',
        },
        lie: { q: 2, text: 'Nobody touched that carpet bag; it stayed strapped under the seat from Omaha on.', clashes: 'bag',
          why: 'The bag was opened and strapped back wrong, with the scarf crushed inside it.' },
        how: 'The singer\'s silk scarf taken from her seat, drawn tight round the sleeping dealer\'s neck, and hidden in the carpet bag.' },
      { id: 'pin', label: 'The coupling pin', method: 'blunt',
        traces: {
          body: 'A crushed wound at the temple the size and shape of an iron pin head.',
          pin: 'The spare pin has been wiped, but the shank is bright where it was gripped, and a hair is caught in the collar.',
          stove: 'A burnt rag in the stove, still warm; it smells of coal oil and of blood.',
        },
        lie: { q: 1, text: 'The stove went cold at nine and nobody opened it after.', clashes: 'stove',
          why: 'There is a rag still warm in the stove: somebody burned it there after nine.' },
        how: 'The coupling pin from its hook by the door, one blow as the car swayed, and the rag that wiped it burned in the stove.' },
    ],
    methods: { poison: 'Laudanum', blade: 'Knife', blunt: 'Coupling pin', strangle: 'Scarf', smother: 'Pillow', firearm: 'Revolver', drown: 'Drowning' },
  },

  'mayfair-1893': {
    title: 'The House in Mayfair',
    setting: 'London, 1893',
    intro: 'A banker\'s townhouse, a dinner party that ended early, and a household that went to bed at different times. By morning the police surgeon had been sent for.',
    fact: 'Victorian Britain sold arsenic in flypapers, rat poison and green wallpaper dye. The Arsenic Act of 1851 made every seller record each sale in a poisons register, and the Marsh test of 1836 could find even a trace of it in a body.',
    hours: ['8 pm', '9 pm', '10 pm', '11 pm', 'midnight', '1 am'],
    victim: { name: 'Sir Henry Vane', role: 'a banker', foundAt: 'in the library' },
    places: ['drawing room', 'servants\' hall', 'mews', 'front steps'],
    palette: { wall: '#4a3b3b', floor: '#6b4a3a', trim: '#2a1c1c' },
    scene: [
      { id: 'body', glyph: 'body', x: 150, y: 150, size: 1.3, name: 'the body', plain: 'Sir Henry sits slumped in his armchair by the fire, a book open on his knee.' },
      { id: 'decanter', glyph: 'decanter', x: 60, y: 70, name: 'the decanter', plain: 'Cut glass, the port untouched; the glass beside it is clean and dry.' },
      { id: 'cushion', glyph: 'cushion', x: 90, y: 150, name: 'the cushion', plain: 'A silk cushion with four tassels, plumped by the maid.' },
      { id: 'fire', glyph: 'fireplace', x: 262, y: 148, size: 1.2, name: 'the fireplace', plain: 'The fire banked at ten; the poker stands in its rack.' },
      { id: 'bell', glyph: 'bellcord', x: 300, y: 70, name: 'the bell cord', plain: 'A braided bell cord that rings in the servants\' hall.' },
      { id: 'knife', glyph: 'knife', x: 190, y: 110, name: 'the paper knife', plain: 'An ivory paper knife on the desk, beside the morning\'s letters.' },
      { id: 'clock', glyph: 'clock', x: 160, y: 42, name: 'the mantel clock', plain: 'A French clock under a glass dome, ticking, correct to the minute.' },
      { id: 'window', glyph: 'window', x: 230, y: 42, name: 'the sash window', plain: 'Closed and latched; fog against the glass.' },
      { id: 'letter', glyph: 'letter', x: 120, y: 110, name: 'the letter', plain: 'An unopened letter from the bank\'s Paris office.' },
      { id: 'dog', glyph: 'dog', x: 40, y: 168, name: 'the old dog', plain: 'A deaf spaniel of fourteen, asleep in its basket, as it has been all night.' },
      { id: 'flypaper', glyph: 'plate', x: 100, y: 70, name: 'the dish on the sill', plain: 'A saucer of water with a flypaper soaking in it, against the summer flies.' },
      { id: 'boots', glyph: 'boots', x: 290, y: 108, name: 'the boots', plain: 'Muddy boots by the area door, the groom\'s as always.' },
    ],
    questions: [
      'When did you last see Sir Henry?',
      'Did the dog bark, or did anyone ring?',
      'Who went into the library after dinner?',
    ],
    suspects: [
      { name: 'Lady Vane', role: 'wife', profile: 'Uses arsenic complexion wafers, as many ladies did.', means: ['poison', 'smother'],
        answers: ['When the guests left; he went to the library and I to my room.', 'The dog is deaf, poor thing. No bell that I heard.', 'Hobbs, with the coffee.'] },
      { name: 'Captain Royce', role: 'nephew', profile: 'Back from India with a service revolver and debts.', means: ['firearm', 'blade'],
        answers: ['He refused me a loan over the cheese.', 'I was at the club; ask the porter.', 'I did not go in; I was shown the door, in a manner of speaking.'] },
      { name: 'Miss Lark', role: 'governess', profile: 'Quiet and clever; reads chemistry books at night.', means: ['poison', 'strangle'],
        answers: ['He asked after the children\'s Latin and went in to read.', 'Nothing rang on the schoolroom board.', 'I returned a book to the library shelf at nine, while he read.'] },
      { name: 'Hobbs', role: 'butler', profile: 'Holds every key in the house.', means: ['blunt', 'poison'],
        answers: ['I took in the coffee tray at half past nine.', 'The library bell did not ring tonight, sir; I should have heard it.', 'Myself, with the tray, and the governess for a book.'] },
      { name: 'Doctor Ashby', role: 'family physician', profile: 'Calls every week and signs the household\'s certificates.', means: ['poison', 'smother'],
        answers: ['He complained of indigestion over dinner; I said it was the port.', 'I had left by nine; I heard nothing.', 'I looked in to say goodnight and found him reading.'] },
      { name: 'Tom Pike', role: 'groom', profile: 'Strong, sullen, and dismissed yesterday.', means: ['blunt', 'strangle'],
        answers: ['Yesterday, when he turned me off.', 'That dog could not hear a cannon.', 'Not I. I am not let in the house.'] },
    ],
    tricks: [
      { id: 'clock', label: 'The clock set back', method: 'blade',
        traces: {
          body: 'A narrow flat wound to the chest, the width of the paper knife; the blood is dry and stiff, hours older than the clock suggests.',
          clock: 'The clock has stopped at ten past ten. The dust on the dome is smudged where it was lifted, and the pendulum is caught on a hairpin.',
          knife: 'The paper knife has been wiped, but the ivory is stained at the hilt and the tip is bent.',
        },
        lie: { q: 0, text: 'I said goodnight to him at ten, by the library clock, and heard it strike as I left.', clashes: 'clock',
          why: 'The clock was stopped by hand at ten past ten; it struck nothing, and the body is hours older than ten.' },
        how: 'The paper knife, then the clock stopped at ten past ten under its dome to fix the time of death when the killer had company.' },
      { id: 'port', label: 'Arsenic in the port', method: 'poison',
        traces: {
          body: 'The belly cramped, vomit on the shirt front, no wound; the surgeon will run the Marsh test.',
          decanter: 'The port in the decanter is untouched, but the glass beside it has a chalky ring, and the stopper is sticky with something that is not port.',
          flypaper: 'Two flypapers are soaking in the saucer, not one, and the water has been poured off: arsenic steeps out of them.',
        },
        lie: { q: 2, text: 'He drank nothing after dinner; the decanter was never unstoppered.', clashes: 'decanter',
          why: 'The glass beside the decanter was used, and the stopper is sticky with the dose.' },
        how: 'Arsenic steeped out of flypapers into a saucer, poured into one glass of port, and the decanter left full so nobody would suspect it.' },
      { id: 'bell', label: 'The bell cord', method: 'strangle',
        traces: {
          body: 'A line round the neck with the braid pattern of the bell cord pressed into the skin.',
          bell: 'The bell cord has been cut short and reknotted, and the wire above is slack: the servants\' bell could not ring.',
          window: 'The sash was raised an inch to let the fog in and cool the room; the cord\'s tassel lies on the sill.',
        },
        lie: { q: 1, text: 'The library bell rang once, about eleven; I supposed he wanted the fire made up.', clashes: 'bell',
          why: 'The bell cord was cut and its wire is slack: it could not ring tonight.' },
        how: 'The bell cord cut down, looped round the banker\'s neck from behind the armchair, and reknotted shorter afterwards.' },
      { id: 'cushion', label: 'The cushion', method: 'smother',
        traces: {
          body: 'Red spots in the whites of the eyes and a thread of silk from the cushion between the teeth.',
          cushion: 'The cushion is pressed flat with a damp patch in the middle, and one tassel is torn off.',
          dog: 'The old dog is deaf but its nose is not: it has dragged the torn tassel under its basket.',
        },
        lie: { q: 1, text: 'The dog barked at midnight, so I came down; the library was dark and he was asleep in his chair.', clashes: 'dog',
          why: 'The dog is stone deaf and has not barked in years; it heard no one at midnight.' },
        how: 'The cushion from his own armchair pressed over his face as he dozed; the torn tassel went under the dog\'s basket.' },
    ],
    methods: { poison: 'Arsenic', blade: 'Paper knife', blunt: 'Poker', strangle: 'Bell cord', smother: 'Cushion', firearm: 'Revolver', drown: 'Drowning' },
  },
}
