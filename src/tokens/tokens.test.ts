import { describe, expect, it } from 'vitest'
import { contrast } from '../engine/color'
import { SAMPLE_PAGES } from '../pages'
import { contrastPairs, resolvePalette, themeVars } from './tokens'

describe('design tokens', () => {
  it.each(['light', 'dark'] as const)('every %s text/background pair meets WCAG AA (4.5:1)', (mode) => {
    const failing = contrastPairs(resolvePalette(mode))
      .map(([name, fg, bg]) => [name, Number(contrast(fg, bg).toFixed(2))] as const)
      .filter(([, ratio]) => ratio < 4.5)
    expect(failing).toEqual([])
  })

  it.each(SAMPLE_PAGES.filter((p) => p.page.theme?.accent).flatMap((p) => (['light', 'dark'] as const).map((m) => [p.id, m] as const)))(
    '%s brand accent stays readable in %s mode',
    (id, mode) => {
      const page = SAMPLE_PAGES.find((p) => p.id === id)!.page
      const pal = resolvePalette(mode, page.theme)
      expect(contrast(pal.accent, pal.surface)).toBeGreaterThanOrEqual(4.5)
      const vars = themeVars(mode, page.theme)
      expect(contrast(vars['--pl-on-accent']!, pal.accent)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('exposes every token as a --pl-* custom property', () => {
    const vars = themeVars('light', { radius: 'sharp', density: 'compact' })
    expect(vars['--pl-text']).toBe('#14131a')
    expect(vars['--pl-radius-md']).toBe('4px')
    expect(vars['--pl-control-h']).toBe('40px')
    expect(vars['--pl-success-bg']).toBeDefined()
  })
})
