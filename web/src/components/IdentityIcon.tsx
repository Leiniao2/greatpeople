import followersJson from '@/data/followers.json'
import { followerUrl } from '@/data/images'

/**
 * Each identity is drawn with its follower card's artwork, cropped to a disc,
 * wherever the identity used to be written out.
 */
const FOLLOWERS = followersJson as { name: string; imageKey: string }[]

const IMAGE_KEYS = new Map(FOLLOWERS.map(f => [f.name, f.imageKey]))

/** Identity names in follower-deck order (grouped by the stat they boost). */
export const IDENTITY_NAMES = FOLLOWERS.map(f => f.name)

interface IdentityIconProps {
  identity: string
  /** Tailwind size classes; defaults to a 1.25rem disc. */
  className?: string
}

export default function IdentityIcon({ identity, className = 'w-5 h-5' }: IdentityIconProps) {
  const key = IMAGE_KEYS.get(identity)
  if (!key) return null
  return (
    <img
      src={followerUrl(key)}
      alt={identity}
      title={identity}
      loading="lazy"
      draggable={false}
      className={`shrink-0 rounded-full object-cover ring-1 ring-line ${className}`}
    />
  )
}
