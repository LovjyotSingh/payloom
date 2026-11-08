/**
 * Reformat an input's text while keeping the caret next to the same character.
 * Used by masked inputs (card number, amount, expiry): "4111 1111|" stays
 * after the 8th digit even though spaces are inserted before it.
 */
export function reformat(
  raw: string,
  caret: number,
  keep: (ch: string) => boolean,
  format: (clean: string) => string,
): { text: string; caret: number; clean: string } {
  const clean = [...raw].filter(keep).join('')
  const before = [...raw.slice(0, caret)].filter(keep).length
  const text = format(clean)
  let seen = 0
  let pos = 0
  while (pos < text.length && seen < before) {
    if (keep(text[pos]!)) seen++
    pos++
  }
  return { text, caret: pos, clean }
}

export function setCaret(el: HTMLInputElement | null, pos: number) {
  if (!el || document.activeElement !== el) return
  requestAnimationFrame(() => {
    try { el.setSelectionRange(pos, pos) } catch { /* some input types do not support selection */ }
  })
}
