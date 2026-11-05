import type { SVGProps } from 'react'

/**
 * Interface icons (tabs, menus, Arcade categories, Fight modes).  By default
 * each is a painted medallion made with Google Flow (data/images/icons →
 * web/public/icons/icon_<name>.webp, also bundled in the apps), so the web
 * and the native screens share one look.  `line` draws the SVG outline
 * instead, for tiny inline chips where a painting would be a blur; it
 * follows `currentColor`, like EraIcon.
 */
const UI_PATHS = {
  // lightning bolt
  epic:       'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  // crown
  collection: 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z M5 19h14',
  // two crossed swords
  fight:      'M14.5 17.5L3 6V3h3l11.5 11.5 M13 19l6-6 M16 16l4 4 M19 21l2-2 M14.5 6.5L18 3h3v3l-3.5 3.5 M5 14l4 4 M7 17l-3 3 M3 19l2 2',
  // game controller
  arcade:     'M7 8h10a4 4 0 0 1 4 4.5l-.6 4.2a2.5 2.5 0 0 1-4.3 1.3L14 16h-4l-2.1 2a2.5 2.5 0 0 1-4.3-1.3L3 12.5A4 4 0 0 1 7 8z M7.5 11v3 M6 12.5h3 M15.5 12h.01 M17.5 14h.01',
  // head and shoulders
  profile:    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  // four tiles: everything
  all:        'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  // jigsaw piece
  puzzle:     'M4 8h4.5a2.5 2.5 0 1 1 5 0H18v4.5a2.5 2.5 0 1 1 0 5V21H4V8z',
  // chess rook
  strategy:   'M7 3h2v2h2V3h2v2h2V3h2v4l-2 2v7l2 2v3H5v-3l2-2V9L5 7V3h2z M5 21h14',
  // painter's palette
  creative:   'M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01',
  // open book
  story:      'M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6z M12 6v14.5',
  // compass
  explore:    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15.5 8.5l-2 5-5 2 2-5 5-2z',
} as const

/** Medallions with no line drawing; `line` falls back to the painting. */
type PaintedOnly = 'casual' | 'ranked' | 'computer'
export type UiIconName = keyof typeof UI_PATHS | PaintedOnly

export const uiIconUrl = (name: UiIconName) => `/icons/icon_${name}.webp`

interface UiIconProps extends Omit<SVGProps<SVGSVGElement>, 'className'> {
  name: UiIconName
  /** Tailwind size/colour classes; defaults to a 1em glyph in the current text colour. */
  className?: string
  /** Accessible name; omit when a visible label sits next to the icon. */
  label?: string
  /** Draw the line icon instead of the painted medallion. */
  line?: boolean
}

export default function UiIcon({ name, className = 'w-[1em] h-[1em]', label, line = false, ...rest }: UiIconProps) {
  if (!line || !(name in UI_PATHS)) {
    return (
      <img src={uiIconUrl(name)} alt={label ?? ''} aria-hidden={label ? undefined : true} draggable={false}
        className={`inline-block shrink-0 rounded-full object-cover select-none ${className}`} />
    )
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}>
      {label && <title>{label}</title>}
      <path d={UI_PATHS[name as keyof typeof UI_PATHS]} />
    </svg>
  )
}
