/**
 * String templates in props: "Pay {{ total | inr }} to {{ merchant }}".
 * Each {{ }} holds an expression and an optional chain of formatters.
 * Templates are compiled once and cached; their state dependencies are
 * known up front so the renderer can subscribe nodes to exactly what they read.
 */
import { dependencies, evaluate, ExprError, parse, type Node } from './expr'
import { FORMATTERS } from './format'

type Part = string | { expr: Node; fmts: { name: string; arg?: string }[] }
export interface Template { parts: Part[]; deps: Set<string>; single: boolean }

const RE = /\{\{([\s\S]+?)\}\}/g
const cache = new Map<string, Template | null>()

export function hasTemplate(s: string): boolean {
  return s.includes('{{')
}

/** Split "a | inr | default:'x'" on pipes that are not inside quotes or "||". */
function splitPipes(src: string): string[] {
  const out: string[] = []
  let cur = ''
  let q: string | null = null
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!
    if (q) { if (c === q) q = null; cur += c; continue }
    if (c === "'" || c === '"') { q = c; cur += c; continue }
    if (c === '|') {
      if (src[i + 1] === '|' || src[i - 1] === '|') { cur += c; continue }
      out.push(cur); cur = ''; continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

export function compile(src: string): Template | null {
  if (cache.has(src)) return cache.get(src)!
  if (!hasTemplate(src)) { cache.set(src, null); return null }
  const parts: Part[] = []
  const deps = new Set<string>()
  let last = 0
  for (const m of src.matchAll(RE)) {
    if (m.index! > last) parts.push(src.slice(last, m.index))
    const [exprSrc, ...fmtSrcs] = splitPipes(m[1]!)
    const expr = parse(exprSrc!.trim())
    dependencies(expr, deps)
    const fmts = fmtSrcs.map((f) => {
      const [name, ...rest] = f.trim().split(':')
      const n = name!.trim()
      if (!(n in FORMATTERS)) throw new ExprError(`Unknown formatter '${n}'`, m.index!, src)
      const raw = rest.join(':').trim()
      return { name: n, arg: raw ? raw.replace(/^['"]|['"]$/g, '') : undefined }
    })
    parts.push({ expr, fmts })
    last = m.index! + m[0].length
  }
  if (last < src.length) parts.push(src.slice(last))
  const t: Template = { parts, deps, single: parts.length === 1 && typeof parts[0] !== 'string' }
  cache.set(src, t)
  return t
}

/**
 * Render a template. A string that is exactly one "{{ expr }}" with no
 * formatters returns the raw value (so "{{ items }}" can feed an array prop).
 */
export function renderTemplate(t: Template, scope: unknown): unknown {
  if (t.single) {
    const p = t.parts[0] as Exclude<Part, string>
    if (p.fmts.length === 0) return evaluate(p.expr, scope)
  }
  return t.parts
    .map((p) => {
      if (typeof p === 'string') return p
      let v: unknown = evaluate(p.expr, scope)
      for (const f of p.fmts) v = FORMATTERS[f.name]!(v, f.arg)
      return v === undefined || v === null ? '' : String(v)
    })
    .join('')
}
