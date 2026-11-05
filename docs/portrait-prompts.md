# Portrait prompts for the 65 new Great People

The 65 portraits added in `7cd922a` were painted as busy scenes, and in most of
them the Great Person is a small figure among a crowd. The hand-made portraits
(Gandhi, Turing, Earhart, Aspasia, …) are close, waist-up portraits: one figure
fills a third to half of the frame, and the background is simple and supports
them. These prompts redo the new ones in that framing.

**Already fine, keep:** Frida Kahlo, Marie Curie, Hedy Lamarr, José Rizal,
Yuri Gagarin, Nelson Mandela, Timur, Gyges, Jabir ibn Hayyan, Meskalamdug.

**Redo:** the 55 below.

## How to use

Paste the **framing block** first, then the person's line. In Google Flow, use
16:9 landscape and save at 1920×1080 as
`data/images/portraits/portrait_<key>.jpeg`. Then run `npm run images` in `web/`.

Cards crop the middle of the image, so the person must stand in the centre.

### Framing block (same for every portrait)

> Painterly digital portrait in a warm, richly detailed storybook-realism style,
> soft golden light, like a museum-quality illustrated history book.
> Waist-up portrait of ONE person, centred in the frame, facing the viewer or at
> a slight three-quarter angle, with a calm, characterful expression.
> The person dominates the image: head in the upper third, figure filling
> roughly 60–70% of the image height from the top of the head to the waist,
> shoulders spanning about a third of the image width. Sharp focus on the face.
> Simple, softly blurred background that tells the person's story through one
> or two landmarks or objects. No crowds, at most two small, out-of-focus
> figures far behind. No text, no letters, no logos, no watermark.
> 16:9 landscape.

### People

| Key | Prompt line |
|---|---|
| `alberto_santos_dumont` | Alberto Santos-Dumont, Brazilian aviation pioneer, 1900s Paris. Slim man with a neat dark moustache, high stiff collar, dark suit, signature narrow-brimmed Panama hat. Behind him, softly blurred: his bamboo-and-silk 14-bis biplane and the Eiffel Tower in a hazy sky. |
| `averroes` | Averroes (Ibn Rushd), 12th-century Andalusian philosopher and judge. Bearded scholar in a cream turban and brown robe, holding an open manuscript of Aristotle. Behind him, blurred: the horseshoe arches of Córdoba in red and white stripes. |
| `avicenna` | Avicenna (Ibn Sina), Persian physician and philosopher, around 1000. Bearded man in a white turban and deep blue robe, holding his Canon of Medicine with a small glass flask. Behind him, blurred: a Bukhara courtyard with a turquoise dome. |
| `brahmagupta` | Brahmagupta, 7th-century Indian mathematician-astronomer. Lean man with a topknot and short beard, bare-chested with a white dhoti and shawl, holding a wooden board of numerals. Behind him, blurred: a sandstone temple spire and a brass armillary sphere. |
| `chandragupta_maurya` | Chandragupta Maurya, founder of the Maurya Empire, around 320 BC. Young bearded emperor in a jewelled turban, gold necklaces and a crimson-and-gold sash, one hand on a sword hilt. Behind him, blurred: the timber palisade of Pataliputra and a caparisoned war elephant. |
| `charlemagne` | Charlemagne, King of the Franks and Emperor, around 800. Broad-shouldered older man with a full white beard, wearing the jewelled octagonal imperial crown and a red-and-gold mantle, holding an orb. Behind him, blurred: the arches of the Aachen Palatine Chapel. |
| `cleopatra_vii` | Cleopatra VII, last pharaoh of Ptolemaic Egypt. Striking woman with dark braided hair, a golden vulture-and-cobra diadem and a deep blue gown with a broad gold collar, holding a papyrus scroll. Behind her, blurred: the harbour and Lighthouse of Alexandria at sunset. |
| `confucius` | Confucius, Chinese philosopher and teacher, around 500 BC. Elderly man with a long grey beard and a scholar's cap, layered brown-and-cream hanfu robes, holding bamboo-slip books. Behind him, blurred: an old apricot tree and a tiled-roof Zhou-era pavilion. |
| `cosimo_de_medici` | Cosimo de' Medici, Florentine banker and patron, 1430s. Middle-aged man with a long thoughtful face, red cappuccio hat and crimson fur-trimmed robe, holding a ledger and gold florins. Behind him, blurred: Brunelleschi's dome of Florence Cathedral. |
| `cyrus_the_great` | Cyrus the Great, founder of the Persian Empire, around 540 BC. Bearded king with long curled hair, a gold crenellated crown and a deep blue-and-crimson robe, one hand raised in greeting, holding a clay cylinder. Behind him, blurred: the blue glazed-brick gate of Babylon. |
| `djoser` | Pharaoh Djoser, Third Dynasty Egypt, around 2670 BC. Regal man with the white crown of Upper Egypt, a false beard, a broad beaded collar and a white linen kilt, holding a crook and flail. Behind him, blurred: the stepped pyramid of Saqqara rising in the desert haze. |
| `eannatum` | Eannatum, king of Lagash and Sumerian general, around 2450 BC. Bearded warrior with a gold-and-leather helmet, a fleece kaunakes skirt and a bronze-studded cloak, holding a long spear. Behind him, blurred: a phalanx of rectangular shields and vultures in a dusty sky. |
| `emperor_yao` | Emperor Yao, legendary Chinese sage-king. Kind elderly ruler with a long white beard, a simple dark mianguan crown and earth-toned robes, holding a bronze gnomon for measuring the sun. Behind him, blurred: terraced fields, a winding river and misty mountains at dawn. |
| `empress_theodora` | Empress Theodora of Byzantium, 6th century. Elegant woman with large dark eyes, a jewelled pearl crown with hanging pendilia, and an imperial purple robe embroidered with gold. Behind her, blurred: the dome of Hagia Sophia and gold mosaics. |
| `enheduanna` | Enheduanna, high priestess of Ur and the first named author, around 2280 BC. Woman with braided dark hair under a round priestess's cap, a tiered fleece robe and a gold necklace, holding a clay tablet and stylus. Behind her, blurred: a moonlit ziggurat with flickering braziers. |
| `epicurus` | Epicurus, Greek philosopher, around 300 BC. Serene bearded man with curly grey hair, a simple cream himation over one shoulder, holding a pomegranate and a scroll. Behind him, blurred: a sunlit garden with olive trees and a vine pergola in Athens. |
| `fibonacci` | Fibonacci (Leonardo of Pisa), Italian mathematician and merchant, around 1200. Clean-shaven man in a dark cap and brown merchant's tunic, holding a parchment of Hindu-Arabic numerals and an abacus. Behind him, blurred: a Pisan harbour with a trading ship. |
| `guan_zhong` | Guan Zhong, chancellor of the state of Qi, 7th century BC. Shrewd bearded statesman in a black official's hat and layered blue-and-ochre robes, holding a handful of bronze knife coins and a bamboo ledger. Behind him, blurred: granaries and sacks of salt. |
| `hafez` | Hafez, Persian poet of Shiraz, 14th century. Bearded poet with warm eyes, a white turban and a patterned cream-and-saffron robe, holding an open illuminated book of verse and a rose. Behind him, blurred: a Persian garden with cypresses, a fountain and roses. |
| `harkhuf` | Harkhuf, Old Kingdom Egyptian explorer and caravan leader, around 2280 BC. Sun-weathered man with short hair, a white kilt, a beaded collar and a long walking staff, holding a papyrus letter. Behind him, blurred: a donkey caravan and red desert cliffs. |
| `harriet_tubman` | Harriet Tubman, Underground Railroad conductor, 1850s. Determined woman with a headscarf, a dark wool shawl over a plain dress, holding a glowing oil lantern at chest height. Behind her, blurred: a moonlit forest with the North Star bright in the sky. |
| `hildegard_of_bingen` | Hildegard of Bingen, Benedictine abbess, composer and healer, 12th century. Wise older woman in a black Benedictine habit and white wimple, holding a quill and a manuscript of musical neumes. Behind her, blurred: a Romanesque window, hanging herbs and the Rhine valley. |
| `ibn_khaldun` | Ibn Khaldun, North African historian and economist, 14th century. Thoughtful bearded scholar in a white turban and cream burnous, holding a quill and the Muqaddimah. Behind him, blurred: Tunis's whitewashed walls and a desert camel caravan. |
| `jayavarman_vii` | Jayavarman VII, Khmer king who built Bayon and hospitals, around 1200. Serene man with a gentle meditative smile, a gilded crown, a bare chest with gold armlets and a silk sampot, hands in a calm gesture. Behind him, blurred: the smiling stone faces of the Bayon temple. |
| `julius_caesar` | Julius Caesar, Roman general and dictator. Lean, clean-shaven man with receding short hair and a laurel wreath, a polished bronze cuirass and a red general's cloak, one arm forward. Behind him, blurred: a legionary eagle standard and the Rubicon river. |
| `ku_baba` | Ku-Baba, tavern-keeper who became queen of Kish, around 2450 BC. Confident woman with dark braids, a gold headband and a fringed fleece dress, pouring beer from a clay jug. Behind her, blurred: a mud-brick tavern with jars and a palm-lined city wall. |
| `leif_erikson` | Leif Erikson, Norse explorer, around 1000. Tall man with long reddish-blond hair and beard, a fur-trimmed wool cloak with a bronze brooch and a chainmail shirt. Behind him, blurred: a dragon-headed longship on a grey sea and a forested Vinland shore. |
| `murasaki_shikibu` | Murasaki Shikibu, author of The Tale of Genji, around 1000. Elegant woman with very long straight black hair, wearing layered jūnihitoe silk robes in plum, green and red, holding a brush and a scroll. Behind her, blurred: a Heian palace veranda and autumn maple leaves. |
| `mursili_i` | Mursili I, Hittite king who sacked Babylon, around 1595 BC. Fierce bearded king in a tall pointed Hittite helmet, a bronze scale coat and a dark cloak, holding a war axe. Behind him, blurred: the stone walls of Hattusa and a war chariot. |
| `nedjeh` | Nedjeh, first king of Kerma in Kush, around 1650 BC. Powerful man with dark skin, a gold-and-feather headdress, heavy gold necklaces and a leopard-skin cloak, holding an ivory sceptre. Behind him, blurred: the great mud-brick Western Deffufa of Kerma and cattle with long horns. |
| `nikola_tesla` | Nikola Tesla, inventor, 1890s. Tall gaunt man with centre-parted black hair and a thin moustache, a dark three-piece suit and a white wing collar, holding a glowing glass bulb without wires. Behind him, blurred: a Tesla coil throwing violet sparks in a dim laboratory. |
| `osei_tutu` | Osei Tutu, founder of the Ashanti Empire, around 1700. Dignified king in vivid kente cloth, heavy gold jewellery and a gold-studded crown, one hand resting on the Golden Stool beside him. Behind him, blurred: a ceremonial umbrella and the thatched palace of Kumasi. |
| `pele` | Pelé, Brazilian footballer, 1970. Smiling athlete in the yellow Brazil shirt with green trim and number 10, holding a leather football at his hip. Behind him, blurred: a packed stadium under floodlights and a green pitch. |
| `peter_the_great` | Peter the Great, Tsar of Russia, around 1700. Very tall young man with a small moustache and dark shoulder-length hair, a green Preobrazhensky coat with gold buttons and a white cravat, holding shipwright's dividers. Behind him, blurred: a ship's hull on the stocks and the Neva river. |
| `plotinus` | Plotinus, Neoplatonist philosopher, 3rd century. Ascetic older man with a long grey beard and a simple pale toga, eyes lifted, one hand raised toward a soft beam of light. Behind him, blurred: a Roman colonnade and a hazy sunlit sky. |
| `puabi` | Queen Puabi of Ur, around 2600 BC. Regal woman wearing her famous headdress of gold leaves, rings and flowers, a cape of carnelian and lapis beads, holding a gold cup. Behind her, blurred: a mud-brick ziggurat and a golden bull-headed lyre. |
| `queen_seondeok` | Queen Seondeok of Silla, 7th century Korea. Composed woman in a tall golden Silla crown with jade pendants and layered red-and-gold silk robes, holding a star chart. Behind her, blurred: the stone Cheomseongdae observatory and peonies. |
| `queen_tiye` | Queen Tiye, Great Royal Wife of Amenhotep III, around 1370 BC. Strong-featured woman with dark skin, a tall double-plumed crown with a vulture headdress, a white pleated linen gown and a broad gold collar, holding a papyrus letter. Behind her, blurred: painted lotus columns of a Theban palace. |
| `saint_genevieve` | Saint Genevieve, patron of Paris, 5th century. Calm young woman with a pale wool veil and a simple brown cloak, hands clasped holding a small candle. Behind her, blurred: Roman-era walls of Paris on the Seine and distant smoke. |
| `shapur_i` | Shapur I, Sasanian King of Kings, 3rd century. Imperious bearded king with a tall crenellated crown topped by a silk globe, flowing ribbons, a pearl-studded robe and a long sword. Behind him, blurred: a Sasanian banner and the rock relief of Naqsh-e Rustam. |
| `sneferu` | Pharaoh Sneferu, builder of the first true pyramids, around 2600 BC. Kindly regal man with the red-and-white double crown, a false beard and a white kilt with a beaded collar, holding a measuring rod. Behind him, blurred: the Bent and Red Pyramids of Dahshur. |
| `sundiata_keita` | Sundiata Keita, founder of the Mali Empire, 13th century. Strong man with dark skin, a white-and-indigo boubou, a gold-trimmed cap and a carved wooden staff. Behind him, blurred: the mud-brick towers of a Sahel town and a griot's kora. |
| `suppiluliuma_i` | Suppiluliuma I, Hittite great king, 14th century BC. Commanding bearded king in a tall conical crown, a long fringed robe and a curved lituus staff, one hand raised. Behind him, blurred: the Lion Gate of Hattusa. |
| `theodoric_the_great` | Theodoric the Great, Ostrogothic king of Italy, around 500. Bearded king with long blond hair, a gold diadem and a purple-and-gold cloak over a mail shirt, holding a law book. Behind him, blurred: the gold mosaics and arches of Ravenna. |
| `tomoe_gozen` | Tomoe Gozen, samurai warrior, 12th century Japan. Fierce young woman with long black hair tied back and a white headband, in red-laced ō-yoroi armour, holding a naginata upright. Behind her, blurred: battle smoke and a white Minamoto banner. |
| `tomyris` | Tomyris, queen of the Massagetae, 6th century BC. Strong woman with braided hair under a gold-plated pointed cap, a scale-armour vest and a fur-trimmed cloak, holding a bow. Behind her, blurred: the open steppe, felt tents and grazing horses. |
| `tushratta` | Tushratta, king of Mitanni, 14th century BC. Diplomatic bearded king in a rounded crown and an embroidered fringed robe, holding a clay tablet letter with a cylinder seal. Behind him, blurred: a Mitanni palace hall with painted pillars. |
| `ur_nanshe` | Ur-Nanshe, king of Lagash and temple builder, around 2500 BC. Bare-chested, clean-shaven man with a shaved head, a fleece kaunakes skirt, carrying a basket of bricks on his head with both hands. Behind him, blurred: a temple under construction and canals. |
| `vercingetorix` | Vercingetorix, Gallic chieftain, 52 BC. Fierce man with long hair and a drooping moustache, a gold torc, a checked wool cloak and a winged helmet held under one arm, holding a long sword. Behind him, blurred: the hillfort of Alesia and smoke. |
| `wangari_maathai` | Wangari Maathai, Kenyan environmentalist and Nobel laureate. Warm smiling woman with a colourful patterned headwrap and a bright African-print dress, holding a young tree seedling in her hands. Behind her, blurred: green hills and Mount Kenya. |
| `xuanzang` | Xuanzang, Tang dynasty Buddhist monk and traveller, 7th century. Calm shaved-head monk in saffron-and-brown robes, carrying a bamboo frame backpack of scrolls with a small lamp, holding a staff. Behind him, blurred: a desert mountain pass and a camel. |
| `yi_yin` | Yi Yin, Shang dynasty chef-turned-chancellor, around 1600 BC. Wise bearded man in a plain cap and layered brown robes, holding a long ladle over a steaming bronze ding cauldron. Behind him, blurred: a Shang palace hall with bronze vessels. |
| `zara_yaqob` | Zara Yaqob, emperor of Ethiopia, 15th century. Bearded man with dark skin, an ornate gold crown and a red-and-gold embroidered cape, holding a processional cross and an illuminated Ge'ez manuscript. Behind him, blurred: a round thatched church and highlands. |
| `zenobia` | Zenobia, queen of Palmyra, 3rd century. Commanding woman with dark hair, a gold diadem, a purple cloak over a cuirass, holding a spear. Behind her, blurred: the colonnades and Temple of Bel of Palmyra. |
| `zu_chongzhi` | Zu Chongzhi, Chinese mathematician and astronomer, 5th century. Thoughtful man with a thin beard, a black scholar's cap and grey-blue robes, holding counting rods over a drawing of a circle. Behind him, blurred: a south-pointing chariot and a calendar sundial. |
