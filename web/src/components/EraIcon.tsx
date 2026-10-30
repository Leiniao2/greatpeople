import type { SVGProps } from 'react'

/**
 * One line-drawn glyph per era, used everywhere the era used to be written out.
 * Stroke follows `currentColor`, so the surrounding text colour applies.
 */
const ERA_PATHS: Record<string, string> = {
  // stepped pyramid
  Ancient:     'M3 20h18L12 4 3 20z M7.4 13h9.2 M5.4 16.5h13.2',
  // Greek temple: pediment, four columns, stylobate
  Classical:   'M3 9l9-6 9 6H3z M6 9v9 M10 9v9 M14 9v9 M18 9v9 M4 18h16 M3 21h18',
  // castle keep with battlements and gate
  Medieval:    'M4 21V8h3V5h3v3h4V5h3v3h3v13H4z M10 21v-5h4v5',
  // quill
  Renaissance: 'M4 20l5-5 M9 15C9 9 14 4 20 4c0 6-5 11-11 11z M9 15l6-6',
  // cogwheel
  Steam:       'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1 M18 12a6 6 0 1 1-12 0 6 6 0 1 1 12 0 M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0',
  // light bulb
  Electricity: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0 0 12 3z',
  // microchip
  Information: 'M7 7h10v10H7z M10 10h4v4h-4z M10 2v5 M14 2v5 M10 17v5 M14 17v5 M2 10h5 M2 14h5 M17 10h5 M17 14h5',
}

export const ERA_NAMES = Object.keys(ERA_PATHS)

interface EraIconProps extends Omit<SVGProps<SVGSVGElement>, 'className'> {
  era: string
  /** Tailwind size/colour classes; defaults to a 1rem glyph in the current text colour. */
  className?: string
}

export default function EraIcon({ era, className = 'w-4 h-4', ...rest }: EraIconProps) {
  const d = ERA_PATHS[era]
  if (!d) return null
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={era}
      {...rest}>
      <title>{era}</title>
      <path d={d} />
    </svg>
  )
}
