/**
 * The colour registry, read from `tokens.css`.
 *
 * The values live in CSS variables so that they are the single source of truth
 * for the whole app - this module only names them and says what they mean. The
 * Design page renders whatever is actually in the stylesheet, so the page can
 * never drift from the theme.
 *
 * Two rules the palette encodes:
 *   1. Red and black carry the identity. Everything else is a neutral.
 *   2. A colour earns a token only if it signals state.
 *   3. Red is a fill or a rail, never small text: #af000e on black is 2.83:1.
 *      White on red is 6.76:1, so red surfaces always carry white type.
 */

export interface ColorToken {
  /** Stable name to use in code and design discussion. */
  name: string
  /** The CSS variable that holds the value. */
  cssVar: string
  /** What the colour means, not what it looks like. */
  role: string
}

export interface TokenGroup {
  title: string
  note: string
  tokens: ColorToken[]
}

export const COLOR_GROUPS: TokenGroup[] = [
  {
    title: 'Core',
    note: 'Red means "look here" and black means "look away". Nothing else competes.',
    tokens: [
      { name: 'brand', cssVar: '--c-brand', role: 'Brand marks and light surfaces - too glary as a dark-mode fill' },
      { name: 'brand-deep', cssVar: '--c-brand-deep', role: 'Buttons, active tabs, rails, washes - the working red' },
      { name: 'brand-press', cssVar: '--c-brand-press', role: 'Pressed state under brand-deep' },
      { name: 'state-warning', cssVar: '--c-warning', role: 'Paused, countdown caution, lost socket - the only non-red signal' },
      { name: 'team-alt', cssVar: '--c-team-alt', role: 'The second team on a red/black board' },
    ],
  },
  {
    title: 'Neutrals',
    note: 'Three surfaces, one border, three text steps. Contrast is measured on black.',
    tokens: [
      { name: 'black', cssVar: '--c-black', role: 'Page canvas, big-screen base' },
      { name: 'surface', cssVar: '--c-surface', role: 'Panels' },
      { name: 'surface-raised', cssVar: '--c-surface-raised', role: 'Cards, inputs, list rows' },
      { name: 'border', cssVar: '--c-border', role: 'Every border, divider and outline' },
      { name: 'text-primary', cssVar: '--c-text', role: 'Body copy, values, headings' },
      { name: 'text-muted', cssVar: '--c-text-muted', role: 'Labels, captions, secondary copy' },
      { name: 'text-dim', cssVar: '--c-text-dim', role: 'Hints, disabled, timestamps' },
    ],
  },
]

/** The current value of a token, as the browser resolved it (e.g. `#af000e`). */
export function resolveColor(cssVar: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
  return value || '—'
}

/**
 * WCAG contrast against pure black, so a step that is unreadable on a projector
 * is obvious here rather than on stage. 4.5 is the body-text floor; 3.0 is the
 * floor for large text and UI outlines.
 */
export function contrastOnBlack(hex: string): number {
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return 0
  const full =
    hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex
  const channel = (offset: number) => {
    const value = parseInt(full.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
  return (luminance + 0.05) / 0.05
}
