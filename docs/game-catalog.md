# New game types — catalog

Goal: about 80 new game types so Epic can cap each type at 3 challenges
(397 challenges ÷ ~143 types ≈ 2.8) while the Arcade gets a 24-level ladder
for every type. Each entry: registry key — name — mechanic — historical frame.
Built in waves of 20; tick a box when the game is in the registry.

Merged: the nine decode-a-message games (`decode`, `cipher` and the seven
Codebook games `atbash`, `polybius`, `scytale`, `pigpen`, `braille`,
`telegraph`, `binary`) are now one type, `cipher` — Codebreaker. The config
id picks the system, each with its own mechanic; Epic's per-type cap counts
Codebreaker per system.

## Wave 1 — classic mechanics with a historical skin
- [x] `sokoban` — Stone Haulers — push blocks onto marks in a grid (Sokoban) — hauling limestone to the Giza ramps
- [x] `packtrain` — Pack Train — tap-to-step route puzzle: collect every load and reach the market on limited supplies (wrong loads, one-use wells, spoiling goods); replaced the real-time Snake — Silk Road camel trains
- [x] `tradeboard` — Merchant Board — roll dice round a board, buy ports, charge tolls, manage cash vs AI rivals (Monopoly-style) — Venice / Hanseatic ports
- [x] `tangram` — Tangram — fit seven pieces to a silhouette — Song/Qing China
- [x] `nonogram` — Picture Logic — fill a grid from row/column clues to reveal an artefact (nonogram)
- [x] `sapper` — Sapper — reveal a field without touching hidden mines, number clues (Minesweeper) — Vauban's siege sappers
- [x] `lamplighter` — Lamplighter — toggle lamps and neighbours until all are lit (Lights Out) — gaslit Victorian London
- [x] `hanoi` — Temple Disks — move a stack of discs between three pegs (Tower of Hanoi) — Lucas's 1883 Brahma legend
- [x] `pairs` — Archive Pairs — memory card matching of portraits and their works — the Library of Alexandria
- [x] `mint` — 2048 — slide and merge coins of equal value up the denominations — Lydian electrum to the solidus
- [x] `ferry` — River Crossing — get everyone across without leaving a bad pair alone — Alcuin of York's 800 CE puzzles
- [x] `morris` — Nine Men's Morris — place and move to form mills vs AI — Roman and medieval boards
- [x] `mancala` — Oware — sow seeds and capture vs AI — West African mancala
- [x] `gomoku` — Five in a Row — first to five vs AI on a go board — Edo Japan
- [x] `senet` — Senet — race pieces with throw sticks, block and swap vs AI — Ancient Egypt
- [x] `royalur` — Royal Game of Ur — race with rosettes and captures vs AI — Mesopotamia
- [x] `tafl` — Hnefatafl — escort the king to a corner against attackers — Viking Age
- [x] `knightstour` — Knight's Tour — visit every square once with a knight — Euler, 1759
- [x] `queens` — Eight Queens — place N queens with no two attacking — Gauss and Bezzel, 1848
- [x] `magicsquare` — Lo Shu — fill a magic square so every line sums equal — the Lo Shu turtle

## Wave 2 — numbers, measurement and machines
- [x] `abacus` — Suanpan — compute on a bead abacus — Ming China
- [x] `quipu` — Quipu — read and tie knotted cords as numbers — the Inca
- [x] `cryptarithm` — Merchant Sums — letter-for-digit arithmetic
- [x] `gears` — Gear Train — chain gears to hit a target ratio — Antikythera mechanism
- [x] `pendulum` — Pendulum Clock — tune length to keep time — Huygens
- [x] `orbit` — Orbits — launch a body into a stable orbit — Kepler / Newton
- [x] `optics` — Lenses — place lenses to focus light on a target — Galileo's telescope
- [x] `alchemy` — Elements — real reactions on a bench: Jabir's acids and distillation (no transmutation), the reactivity series of Song China's wet copper, Lavoisier's conserved stock, Mendeleev's gaps — Jabir ibn Hayyan, Shen Kuo, Lavoisier, Mendeleev
- [x] `chemistry` — Chemistry — balance real equations (exact atom count, smallest whole numbers) or titrate a real sample to its indicator endpoint (pH from the charge balance); replaced the recipe-ratio guessing game — Bi Sheng, Lu Yu, Magellan's limes, Lavoisier, Glauber
- [x] `surveyor` — Triangulation — measure a distance by angles — the Great Trigonometrical Survey
- [x] `irrigation` — Nile Basins — open sluices to water fields before the flood ebbs
- [x] `rotation` — Crop Rotation — plan four-field rotations for best yield — Townshend
- [x] `cargo` — Cargo Hold — pack polyomino crates into a hull (Tetris-like) — VOC ships
- [x] `wallbuilder` — Wall Builder — falling-block wall without gaps — the Great Wall
- [x] `truss` — Truss Bridge — build a truss that holds the load — Eiffel / Brunel
- [x] `canallock` — Canal Locks — fill and drain locks to pass boats — Grand Canal
- [x] `railway` — Railway — lay track tiles so every train reaches its station — Stephenson
- [x] `telegraphnet` — Telegraph Network — connect cities with the least wire (spanning tree)
- [x] `postroute` — Post Route — shortest round trip through towns (TSP) — Thurn und Taxis post
- [x] `konigsberg` — Seven Bridges — draw a route using every bridge once (Euler path)
- [x] `assembly` — Assembly Line — route parts along conveyors in order — Ford, 1913

## Wave 3 — physics, simulation, strategy and economics
Re-planned from the original list toward hands-on physical rules.  Dropped
as overlapping existing games: `conquest` (campaign), `diplomacy`
(coalition), `stockexchange` (trade); `tsume`, `workforce`, `colony`,
`guild` and `tribute` are left for later.

Physics
- [x] `trebuchet` — Trebuchet — set counterweight, sling and release angle (or a bombard's charge); the stone flies a simulated arc with gravity, drag and wind — Kenilworth 1266, Xiangyang 1273, Stirling 1304, Constantinople 1453
- [x] `eureka` — Eureka — buoyancy and displacement with real densities: overflow volume, draft, Boyle's-law diver, metacentric height — Hiero's crown, Plimsoll line, Cartesian diver, the Vasa 1628
- [x] `lever` — Balance and Lever — torque by hand: slide the fulcrum, pivot or poise, add counterweight — Archimedes, the shaduf, the Roman steelyard, Su Song's escapement
- [x] `sundial` — Sundial — tilt and turn the gnomon, lay out hour lines, correct by the equation of time, time the solstice — Catania dial at Rome, Ibn al-Shatir, Jantar Mantar, Guo Shoujing

Simulation
- [x] `firebreak` — Firebreak — one action a turn against a fire that spreads downwind and throws sparks — London 1666, Rome 64, Edo 1657, Chicago 1871, Moscow 1812 (burn the stores)
- [x] `quarantine` — Quarantine — contain an outbreak spreading along roads — Venice lazaretto, Broad Street pump, Eyam, Jenner, 1918 flu
- [x] `harvest` — Harvest — one job a week against flood, warmth, rain, blight or wind — Nile basins, 24 solar terms, Maya milpa, Irish blight, Dust Bowl
- [x] `tradewinds` — Trade Winds — sail a wind-and-current grid where speed depends on the angle to the wind — monsoon, Zheng He, volta do mar, doldrums, Viking sunstone

Strategy
- [x] `battleship` — Naval Battle — salvos against a hidden fleet, with a different clue per battle (line of battle, scout counts, ASDIC range, a moving fleet) — Trafalgar, Midway, Western Approaches, Salamis
- [x] `xiangqi` — Xiangqi Mates — mate in 1–3 on the full board against a minimax defender — Ju Zhong Mi, cannon and horse mates, Seven Stars, Korean janggi
- [x] `castrum` — Roman Camp — place gates, tents, HQ, granary and horse lines to a unique solution from row and column clues — Polybius, marching camp, milecastle, Masada, Han camp
- [x] `shipyard` — Shipyard — saw ship parts from limited timber; cuts are permanent and each new log costs a day — Venetian Arsenal, Viking longship, Zheng He, HMS Victory, Liberty ships

Economics
- [x] `tulips` — Tulip Mania — trade a momentum bubble before it bursts — Haarlem 1637, South Sea, Mississippi, Railway Mania, 1929 margin
- [x] `bankrun` — Bank Run — pay the withdrawal queue by selling, calling or pledging assets — Medici, Amsterdam, 1907, Bagehot, 1933
- [x] `logistics` — Supply Lines — route, carts and depots, where the carts' animals eat too — Napoleon 1812, Hannibal, Gedrosia, Red Ball Express, Zhuge Liang
- [x] `bazaar` — Grand Bazaar — haggle against hidden reservation prices to collect a set — Istanbul, Tlatelolco, Chang'an, Timbuktu, Kaifeng

## Wave 5 — the owner's picks
- [x] `golddig` — Gold Dig — crack a stone field with a few hammers, picks and dynamite; cracked stone reads the distance to the nearest gold, and from D2 dynamite shatters gold — Sutter's Mill, Klondike, Welcome Stranger, Witwatersrand, Wadi Hammamat
- [x] `detective` — Detective — spend limited hours on bodies, places and interviews, cross out a suspect × method grid, then accuse; two victims from D3 — Globe 1599, Venice 1750, Song Ci 1247, sleeper car 1869, Mayfair 1893
- [x] `climb` — Summit Climb — climber-centred rock face that scrolls up to the real summit; stamina, overhangs, ice, ledges, crumbling holds, pitons and falls to the last anchor — Mont Blanc, Matterhorn, Eiger, Annapurna, Everest
- [x] `pingpong` — Ping-Pong — real-time rally against a computer whose speed, reaction and aim rise by tier; bat position aims, bat motion spins — parlour gossima, London 1926, Nagoya 1971, Seoul 1988, Sydney 2000

## Wave 4 — creative, story and exploration
- [ ] `calligraphy` — Calligraphy — trace strokes in the right order
- [ ] `mosaic` — Mosaic — rebuild a Byzantine mosaic from tesserae
- [ ] `stainedglass` — Stained Glass — lead and colour a window to a pattern
- [ ] `pottery` — Potter's Wheel — shape a vessel to a profile
- [ ] `origami` — Origami — fold a sequence to a target
- [ ] `perfume` — Perfumer — blend notes to a target accord — Grasse
- [ ] `archaeology` — Dig Site — excavate carefully layer by layer
- [ ] `fossils` — Fossil Hunter — assemble a skeleton — Mary Anning
- [ ] `cavepaint` — Cave Painting — trace and colour a Lascaux animal
- [ ] `sculpt` — Sculptor — chisel away to reveal the form — Michelangelo
- [ ] `anachronism` — Spot the Anachronism — find what doesn't belong in a scene
- [ ] `detective` — Logic Grid — deduction puzzle (who, where, when)
- [ ] `courtroom` — Courtroom — present the right evidence — Cicero's trials
- [ ] `newspaper` — Front Page — set headlines and columns to fit — Pulitzer
- [ ] `orienteering` — Compass — navigate by bearing and pacing
- [ ] `balloon` — Balloon Flight — ride wind layers to a landing — Montgolfier
- [ ] `polar` — Polar Dash — sledge rations and depots — Amundsen vs Scott
- [ ] `diving` — Pearl Diver — manage air to reach the pearls
- [ ] `summit` — Summit Route — choose a climbing line with weather windows — Everest 1953
- [ ] `desert` — Desert Crossing — water and oases on a caravan route — Ibn Battuta
