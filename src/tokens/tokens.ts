/**
 * Design tokens: the single source of truth for colour, radius, spacing and type.
 * Components only ever read CSS custom properties (--pl-*), so a page can be
 * re-themed (brand accent, light/dark, density) without touching component code.
 * Contrast of every text/background pair is checked in tokens.test.ts.
 */
import { mix, readableOn } from '../engine/color'
import type { PageTheme } from '../engine/schema'

export type Mode = 'light' | 'dark'

export const palettes = {
  light: {
    bg: '#f6f6f8',
    surface: '#ffffff',
    surfaceAlt: '#f1f0f5',
    border: '#d9d8e0',
    borderStrong: '#8e8c99',
    text: '#14131a',
    muted: '#55535f',
    accent: '#6d28d9',
    success: '#0f7a3d',
    successBg: '#e7f6ed',
    warning: '#8a5300',
    warningBg: '#fdf3e1',
    danger: '#c0262d',
    dangerBg: '#fdeceb',
    info: '#1d5fc2',
    infoBg: '#e9f1fd',
    focus: '#6d28d9',
  },
  dark: {
    bg: '#000000',
    surface: '#0e0e12',
    surfaceAlt: '#17171d',
    border: '#2a2a33',
    borderStrong: '#6b6977',
    text: '#f4f3f8',
    muted: '#a9a7b4',
    accent: '#a78bfa',
    success: '#4ade80',
    successBg: '#0c2216',
    warning: '#fbbf24',
    warningBg: '#251b05',
    danger: '#ff6b6b',
    dangerBg: '#2a0e0e',
    info: '#7cb3ff',
    infoBg: '#0c1a2e',
    focus: '#c4b5fd',
  },
} as const

export type Palette = { -readonly [K in keyof (typeof palettes)['light']]: string }

const RADII = {
  sharp: { sm: '2px', md: '4px', lg: '6px' },
  soft: { sm: '6px', md: '10px', lg: '16px' },
  round: { sm: '10px', md: '16px', lg: '24px' },
}

const DENSITY = {
  compact: { control: '40px', gap: '12px', pad: '16px' },
  comfortable: { control: '48px', gap: '16px', pad: '24px' },
}

/** Resolve the palette for a mode, applying a page's brand accent if it has one. */
export function resolvePalette(mode: Mode, theme?: PageTheme): Palette {
  const base: Palette = { ...palettes[mode] }
  if (theme?.accent) {
    // In dark mode lighten the brand colour so it stays legible on black.
    const accent = mode === 'dark' ? mix(theme.accent, '#ffffff', 0.35) : theme.accent
    base.accent = accent
    base.focus = accent
  }
  return base
}

/** CSS custom properties for a page wrapper. */
export function themeVars(mode: Mode, theme?: PageTheme): Record<string, string> {
  const p = resolvePalette(mode, theme)
  const r = RADII[theme?.radius ?? 'soft']
  const d = DENSITY[theme?.density ?? 'comfortable']
  const vars: Record<string, string> = {}
  for (const [k, v] of Object.entries(p)) vars[`--pl-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`] = v
  vars['--pl-on-accent'] = readableOn(p.accent)
  vars['--pl-accent-soft'] = mix(p.accent, p.surface, mode === 'dark' ? 0.82 : 0.9)
  vars['--pl-radius-sm'] = r.sm
  vars['--pl-radius-md'] = r.md
  vars['--pl-radius-lg'] = r.lg
  vars['--pl-control-h'] = d.control
  vars['--pl-gap'] = d.gap
  vars['--pl-pad'] = d.pad
  return vars
}

/** Text/background pairs that must meet WCAG AA (4.5:1). */
export function contrastPairs(p: Palette): [string, string, string][] {
  return [
    ['text on surface', p.text, p.surface],
    ['text on bg', p.text, p.bg],
    ['muted on surface', p.muted, p.surface],
    ['muted on surface-alt', p.muted, p.surfaceAlt],
    ['accent on surface', p.accent, p.surface],
    ['success on success-bg', p.success, p.successBg],
    ['warning on warning-bg', p.warning, p.warningBg],
    ['danger on danger-bg', p.danger, p.dangerBg],
    ['danger on surface', p.danger, p.surface],
    ['info on info-bg', p.info, p.infoBg],
  ]
}
