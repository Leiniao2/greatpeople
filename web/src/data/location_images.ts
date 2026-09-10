// Location card artwork resolution.
//
// Only ~50 location images exist in /public/locations, but the card data
// defines 142 cards.  Cards whose own imageKey has no file fall back to an
// existing image chosen for regional, cultural and era proximity — the same
// substitution the card data already does inline (ancient_memphis also serves
// Ur and Babylon, electricity_london also serves Kiev and New York).
//
// The mapping itself lives in data/location_image_fallbacks.json so iOS and
// Android read the same table once they render locations.  Keeping it separate
// from location_cards.json preserves which artwork each card actually wants:
// when real art lands, add the file and delete the entry.

import fallbacksJson from '@/data/location_image_fallbacks.json'

const FALLBACKS: Record<string, string> = Object.fromEntries(
  Object.entries(fallbacksJson.fallbacks).map(([key, { image }]) => [key, image]),
)

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
