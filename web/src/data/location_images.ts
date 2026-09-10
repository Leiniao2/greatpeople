// Location card artwork resolution.
//
// Only ~50 location images exist in /public/locations, but location_cards.json
// defines 142 cards.  Cards whose own imageKey has no file fall back to an
// existing image chosen for regional, cultural and era proximity — the same
// substitution the card data already does inline (ancient_memphis also serves
// Ur and Babylon, electricity_london also serves Kiev and New York).
//
// Keeping the substitutions here rather than overwriting imageKey preserves
// which artwork each card actually wants.  When real art lands, drop the file
// into /public/locations and delete the entry below.

const FALLBACKS: Record<string, string> = {
  // ── Ancient ────────────────────────────────────────────────────────────────
  ancient_aksum:         'ancient_petra',              // rock-cut monumental, arid highland
  ancient_anyang:        'ancient_yin_city',           // Yin stood at Anyang — same site
  ancient_caral:         'ancient_olmec_laventa',      // earliest monumental Americas
  ancient_kerma:         'ancient_memphis',            // Nubian Nile valley
  ancient_knossos:       'ancient_athens',             // Aegean palace complex
  ancient_monte_alban:   'ancient_olmec_sanlorenzo',   // Mesoamerican ceremonial centre
  ancient_poverty_point: 'ancient_olmec_laventa',      // earthwork mound complex
  ancient_taxila:        'ancient_mohenjo_daro',       // Indus valley, same region
  ancient_thebes:        'ancient_memphis',            // Egyptian palace and tombs
  ancient_troy:          'ancient_athens',             // Aegean fortified city

  // ── Classical ──────────────────────────────────────────────────────────────
  classical_alexandria:     'classical_carthage',      // Mediterranean harbour city
  classical_antioch:        'classical_petra',         // Levantine classical
  classical_carthago_nova:  'classical_carthage',      // literally "New Carthage"
  classical_chersonesus:    'classical_sparta',        // Greek colony
  classical_luoyang:        'classical_xianyang',      // Chinese imperial capital
  classical_meroe:          'ancient_memphis',         // Nubian pyramids echo Egypt
  classical_oc_eo:          'ancient_mohenjo_daro',    // Indianised riverine port
  classical_pataliputra:    'ancient_mohenjo_daro',    // South Asian capital
  classical_samarkand:      'classical_petra',         // arid Silk Road caravan city
  classical_tiwanaku:       'classical_teotihuacan',   // Andean/American monumental

  // ── Medieval ───────────────────────────────────────────────────────────────
  medieval_angkor:         'medieval_kyoto',           // Asian temple complex
  medieval_cahokia:        'medieval_chichen_itza',    // pre-Columbian mound city
  medieval_constantinople: 'medieval_jerusalem',       // Byzantine Levantine domes
  medieval_cordoba:        'medieval_damascus',        // Moorish/Islamic architecture
  medieval_great_zimbabwe: 'medieval_chichen_itza',    // dry-stone monumental enclosure
  medieval_kilwa:          'classical_carthage',       // African coastal trading port
  medieval_lalibela:       'ancient_petra',            // rock-hewn churches
  medieval_nara:           'medieval_kyoto',           // Japanese Buddhist capital
  medieval_novgorod:       'medieval_krakow',           // Slavic medieval town
  medieval_timbuktu:       'medieval_damascus',        // Islamic scholarly city

  // ── Renaissance ────────────────────────────────────────────────────────────
  renaissance_antwerp:   'renaissance_venice',         // Renaissance mercantile port
  renaissance_augsburg:  'renaissance_genoa',          // Renaissance banking city
  renaissance_calicut:   'renaissance_lisbon',         // Portuguese Indian Ocean trade
  renaissance_cuzco:     'renaissance_qusqu',          // Qusqu is Cuzco — same city
  renaissance_edo:       'medieval_kyoto',             // Japanese castle town
  renaissance_istanbul:  'steam_istanbul',             // same city, one era later
  renaissance_kilwa:     'renaissance_lisbon',         // Portuguese Indian Ocean port
  renaissance_nanjing:   'medieval_changan',           // Chinese imperial capital
  renaissance_potosi:    'renaissance_qusqu',          // Andean colonial highland
  renaissance_samarkand: 'renaissance_baghdad',        // Timurid/Islamic observatory city

  // ── Steam ──────────────────────────────────────────────────────────────────
  steam_calcutta:  'electricity_delhi',                // British Raj India
  steam_cape_town: 'steam_cairo',                      // African colonial port
  steam_chicago:   'steam_manchester',                 // industrial factory city
  steam_lagos:     'steam_cairo',                      // African colonial port
  steam_lima:      'renaissance_lisbon',               // Iberian colonial port
  steam_melbourne: 'steam_london',                     // Victorian British colonial
  steam_osaka:     'steam_manchester',                 // industrialising mill city
  steam_sao_paulo: 'renaissance_lisbon',               // Portuguese colonial Brazil
  steam_shanghai:  'electricity_hongkong',             // Chinese treaty port
  steam_vienna:    'steam_st_petersburg',              // imperial European capital

  // ── Electricity ────────────────────────────────────────────────────────────
  electricity_cape_town:    'steam_cairo',             // African port city
  electricity_chicago:      'electricity_london',      // electric-era metropolis
  electricity_johannesburg: 'electricity_berlin',      // early-20thC banking district
  electricity_lagos:        'steam_cairo',             // African port city
  electricity_melbourne:    'electricity_london',      // British imperial civic
  electricity_mumbai:       'electricity_delhi',       // Indian port metropolis
  electricity_nairobi:      'steam_cairo',             // African colonial city
  electricity_osaka:        'electricity_hongkong',    // East Asian port
  electricity_sao_paulo:    'electricity_berlin',      // early-20thC exchange district
  electricity_vienna:       'electricity_berlin',      // Central European capital

  // ── Information ────────────────────────────────────────────────────────────
  information_amsterdam: 'steam_amsterdam',            // same city, earlier era
  information_bangalore: 'information_shenzhen',       // modern tech hub
  information_berlin:    'electricity_berlin',         // same city, earlier era
  information_lagos:     'information_dubai',          // modern non-Western metropolis
  information_london:    'electricity_london',         // same city, earlier era
  information_mumbai:    'information_singapore',      // Indian Ocean financial hub
  information_nairobi:   'information_dubai',          // modern metropolis
  information_sao_paulo: 'information_rio',            // same country
  information_stockholm: 'information_seoul',          // modern tech-forward city
  information_tel_aviv:  'information_dubai',          // Middle Eastern modern skyline
}

/** Image key actually rendered for a card, after substitution. */
export function resolveLocationImageKey(imageKey: string): string {
  return FALLBACKS[imageKey] ?? imageKey
}

/** Public URL for a location card's artwork, or null when it has no imageKey. */
export function locationImageUrl(imageKey?: string): string | null {
  if (!imageKey) return null
  return `/locations/${resolveLocationImageKey(imageKey)}.jpeg`
}

export const LOCATION_IMAGE_FALLBACKS = FALLBACKS
