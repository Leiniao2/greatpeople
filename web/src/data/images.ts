// Public URLs for the artwork under /public.
//
// Every image is a WebP produced by scripts/build-images.mjs from the
// originals in data/images/.  Nothing else in the app should spell out an
// image path, so a format or folder change is a one-file edit here.

import { locationImageUrl } from './location_images'

export type EraName =
  | 'Ancient' | 'Classical' | 'Medieval' | 'Renaissance'
  | 'Steam' | 'Electricity' | 'Information'

// Backdrop shown for an era when a story has no location image of its own.
const ERA_BACKDROP: Record<EraName, string> = {
  Ancient:     'ancient_stonehenge',
  Classical:   'classical_sparta',
  Medieval:    'medieval_changan',
  Renaissance: 'renaissance_venice',
  Steam:       'steam_london',
  Electricity: 'electricity_berlin',
  Information: 'information_sanjose',
}

export const portraitUrl = (portraitKey: string) => `/portraits/portrait_${portraitKey}.webp`
export const followerUrl = (imageKey: string) => `/followers/${imageKey}.webp`
export const cardBackUrl = (kind: 'gp' | 'follower' | 'location' | 'event') => `/card-backs/${kind}.webp`
export const eraBackdropUrl = (era: string) =>
  `/locations/${ERA_BACKDROP[era as EraName] ?? ERA_BACKDROP.Ancient}.webp`

// Gallery and event art catalogued in data/artworks.json.
export type ArtworkFolder = 'scenarios' | 'battles' | 'paintings' | 'maps' | 'items' | 'symbols'
export const artworkUrl = (folder: ArtworkFolder, key: string) => `/${folder}/${key}.webp`

/**
 * Art for an event card.  Scenario cards are keyed by stat and name
 * ("politics", "Coup" -> politics_coup); natural hazards by hazard type
 * ("Flood" -> hazard_flood).  Both come from data/images/scenarios/.
 */
export const scenarioImageUrl = (name: string, stat?: string) => {
  const slug = name.replace(/^Natural Hazard:\s*/i, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
  return artworkUrl('scenarios', `${stat ?? 'hazard'}_${slug}`)
}

/** Story scripts name speakers as a portrait key or `follower:<imageKey>`. */
export const speakerImageUrl = (key: string) =>
  key.startsWith('follower:') ? followerUrl(key.slice('follower:'.length)) : portraitUrl(key)

export { locationImageUrl }
