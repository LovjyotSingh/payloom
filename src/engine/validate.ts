/**
 * Config validator. Runs before anything renders and reports every problem
 * with a JSON-pointer path ("/body/2/children/0/props/label"), so a broken
 * config is caught in review or CI instead of on a customer's payment page.
 */
import { contrast, parseHex } from './color'
import { ExprError, parse } from './expr'
import type { PropSpec, Registry } from './registry'
import { RULE_TYPES } from './rules'
import type { PageSchema } from './schema'
import { compile, hasTemplate } from './template'

export interface Issue {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export interface ValidationResult {
  ok: boolean
  errors: Issue[]
  warnings: Issue[]
  page?: PageSchema
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const typeOf = (x: unknown) => (Array.isArray(x) ? 'array' : x === null ? 'null' : typeof x)

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1]!.toLowerCase() === b[j - 1]!.toLowerCase() ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]!
}

export function suggest(word: string, options: readonly string[]): string | undefined {
  let best: string | undefined
  let bestD = Infinity
  for (const o of options) {
    const d = levenshtein(word, o)
    if (d < bestD) { bestD = d; best = o }
  }
  return bestD <= Math.max(2, Math.floor(word.length / 3)) ? best : undefined
}

const ACTION_TYPES = ['submit', 'set', 'reset', 'navigate', 'emit'] as const

export function validatePage(input: unknown, registry: Registry): ValidationResult {
  const issues: Issue[] = []
  const err = (path: string, message: string) => issues.push({ path, message, severity: 'error' })
  const warn = (path: string, message: string) => issues.push({ path, message, severity: 'warning' })

  if (!isObj(input)) {
    err('', `Page must be an object, got ${typeOf(input)}`)
    return finish()
  }
  if (input.version !== 1) err('/version', `Unsupported version ${JSON.stringify(input.version)}; expected 1`)
  if (typeof input.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(input.id)) err('/id', 'id must be a kebab-case string')
  if (typeof input.title !== 'string' || !input.title.trim()) err('/title', 'title is required (it becomes the page heading for screen readers)')
  for (const k of Object.keys(input)) {
    if (!['$schema', 'version', 'id', 'title', 'description', 'theme', 'state', 'body'].includes(k)) {
      warn(`/${k}`, `Unknown top-level key "${k}"${hint(k, ['version', 'id', 'title', 'description', 'theme', 'state', 'body'])}`)
    }
  }

  const stateKeys = new Set<string>()
  if (input.state !== undefined) {
    if (!isObj(input.state)) err('/state', 'state must be an object')
    else for (const k of Object.keys(input.state)) {
      if (k.startsWith('$')) err(`/state/${k}`, `"${k}" is reserved for the engine`)
      stateKeys.add(k)
    }
  }

  if (input.theme !== undefined) {
    if (!isObj(input.theme)) err('/theme', 'theme must be an object')
    else {
      const t = input.theme
      if (t.accent !== undefined) {
        if (typeof t.accent !== 'string' || !parseHex(t.accent)) err('/theme/accent', 'accent must be a hex colour like "#7C3AED"')
        else if (contrast(t.accent, '#ffffff') < 4.5) {
          warn('/theme/accent', `accent ${t.accent} has ${contrast(t.accent, '#ffffff').toFixed(2)}:1 contrast on white; links and labels in it need 4.5:1`)
        }
      }
      if (t.radius !== undefined && !['sharp', 'soft', 'round'].includes(String(t.radius))) err('/theme/radius', 'radius must be sharp, soft or round')
      if (t.density !== undefined && !['compact', 'comfortable'].includes(String(t.density))) err('/theme/density', 'density must be compact or comfortable')
    }
  }

  const ids = new Map<string, string>()
  const binds = new Map<string, string>()

  const checkExpr = (path: string, src: unknown, label: string) => {
    if (typeof src !== 'string' || !src.trim()) { err(path, `${label} must be a non-empty expression string`); return }
    try { parse(src) } catch (e) { err(path, e instanceof ExprError ? e.message : String(e)) }
  }
  const checkTemplates = (path: string, v: unknown) => {
    if (typeof v === 'string' && hasTemplate(v)) {
      try { compile(v) } catch (e) { err(path, e instanceof Error ? e.message : String(e)) }
    } else if (Array.isArray(v)) v.forEach((x, i) => checkTemplates(`${path}/${i}`, x))
    else if (isObj(v)) for (const [k, x] of Object.entries(v)) checkTemplates(`${path}/${k}`, x)
  }
  const checkStatePath = (path: string, p: unknown, label: string) => {
    if (typeof p !== 'string' || !/^[A-Za-z_][\w]*(\.[\w]+)*$/.test(p)) { err(path, `${label} must be a state path like "card.number"`); return }
    const root = p.split('.')[0]!
    if (!stateKeys.has(root)) warn(path, `"${p}" is not declared in /state; it will start empty`)
  }

  const checkAction = (path: string, a: unknown) => {
    if (Array.isArray(a)) { a.forEach((x, i) => checkAction(`${path}/${i}`, x)); return }
    if (!isObj(a)) { err(path, 'action must be an object'); return }
    if (!ACTION_TYPES.includes(a.type as never)) { err(`${path}/type`, `Unknown action "${String(a.type)}"${hint(String(a.type), ACTION_TYPES)}`); return }
    switch (a.type) {
      case 'submit':
        if (typeof a.endpoint !== 'string' || !a.endpoint) err(`${path}/endpoint`, 'submit needs an endpoint')
        if (a.payload !== undefined) {
          if (!Array.isArray(a.payload)) err(`${path}/payload`, 'payload must be an array of state paths')
          else a.payload.forEach((p, i) => checkStatePath(`${path}/payload/${i}`, p, 'payload entry'))
        }
        if (a.timeoutMs !== undefined && (typeof a.timeoutMs !== 'number' || a.timeoutMs < 100)) err(`${path}/timeoutMs`, 'timeoutMs must be a number >= 100')
        if (a.onSuccess !== undefined) checkAction(`${path}/onSuccess`, a.onSuccess)
        if (a.onError !== undefined) checkAction(`${path}/onError`, a.onError)
        break
      case 'set':
        checkStatePath(`${path}/path`, a.path, 'set.path')
        if (a.from !== undefined) checkExpr(`${path}/from`, a.from, 'set.from')
        break
      case 'navigate':
        if (typeof a.to !== 'string' || !a.to) err(`${path}/to`, 'navigate needs a target page id')
        break
      case 'emit':
        if (typeof a.event !== 'string' || !a.event) err(`${path}/event`, 'emit needs an event name')
        break
    }
  }

  const checkProp = (path: string, spec: PropSpec, v: unknown) => {
    if (typeof v === 'string' && hasTemplate(v) && spec.type !== 'string') return // resolved at runtime
    switch (spec.type) {
      case 'string':
        if (typeof v !== 'string') err(path, `expected string, got ${typeOf(v)}`)
        break
      case 'expression':
        checkExpr(path, v, 'value')
        break
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) err(path, `expected number, got ${typeOf(v)}`)
        break
      case 'boolean':
        if (typeof v !== 'boolean') err(path, `expected boolean, got ${typeOf(v)}`)
        break
      case 'enum':
        if (!spec.values!.includes(String(v))) err(path, `expected one of ${spec.values!.map((x) => `"${x}"`).join(', ')}, got ${JSON.stringify(v)}${hint(String(v), spec.values!)}`)
        break
      case 'array':
        if (!Array.isArray(v)) { err(path, `expected array, got ${typeOf(v)}`); break }
        if (spec.itemKeys) v.forEach((item, i) => {
          if (!isObj(item)) err(`${path}/${i}`, 'expected an object')
          else for (const k of spec.itemKeys!) if (!(k in item)) err(`${path}/${i}`, `missing "${k}"`)
        })
        break
      case 'object':
        if (!isObj(v)) err(path, `expected object, got ${typeOf(v)}`)
        break
    }
  }

  const visit = (node: unknown, path: string) => {
    if (!isObj(node)) { err(path, `Node must be an object, got ${typeOf(node)}`); return }
    if (typeof node.type !== 'string') { err(`${path}/type`, 'Node needs a "type"'); return }
    const def = registry.get(node.type)
    if (!def) {
      err(`${path}/type`, `Unknown component "${node.type}"${hint(node.type, registry.types())}`)
      return
    }
    for (const k of Object.keys(node)) {
      if (!['type', 'id', 'props', 'children', 'when', 'bind', 'rules', 'action'].includes(k)) {
        warn(`${path}/${k}`, `Unknown node key "${k}"${hint(k, ['props', 'children', 'when', 'bind', 'rules', 'action'])}`)
      }
    }
    if (node.id !== undefined) {
      if (typeof node.id !== 'string' || !/^[a-zA-Z][\w-]*$/.test(node.id)) err(`${path}/id`, 'id must start with a letter and use letters, digits, - or _')
      else if (ids.has(node.id)) err(`${path}/id`, `Duplicate id "${node.id}" (first used at ${ids.get(node.id)})`)
      else ids.set(node.id, path)
    }
    if (node.when !== undefined) checkExpr(`${path}/when`, node.when, 'when')

    const props = node.props ?? {}
    if (!isObj(props)) err(`${path}/props`, 'props must be an object')
    else {
      for (const [name, spec] of Object.entries(def.props)) {
        const v = props[name]
        if (v === undefined) { if (spec.required) err(`${path}/props/${name}`, `${def.type} requires "${name}"`); continue }
        checkProp(`${path}/props/${name}`, spec, v)
      }
      for (const name of Object.keys(props)) {
        if (!(name in def.props)) warn(`${path}/props/${name}`, `${def.type} has no prop "${name}"${hint(name, Object.keys(def.props))}`)
      }
      checkTemplates(`${path}/props`, props)
    }

    if (node.bind !== undefined) {
      if (!def.bindable) err(`${path}/bind`, `${def.type} is not an input and cannot bind`)
      else {
        checkStatePath(`${path}/bind`, node.bind, 'bind')
        if (typeof node.bind === 'string') {
          if (binds.has(node.bind)) warn(`${path}/bind`, `"${node.bind}" is also bound at ${binds.get(node.bind)}`)
          else binds.set(node.bind, path)
        }
      }
    } else if (def.bindable) {
      err(`${path}`, `${def.type} is an input and needs a "bind" state path`)
    }

    if (node.rules !== undefined) {
      if (!Array.isArray(node.rules)) err(`${path}/rules`, 'rules must be an array')
      else {
        if (!def.bindable) warn(`${path}/rules`, `rules have no effect on ${def.type}`)
        node.rules.forEach((r, i) => {
          if (!isObj(r) || typeof r.type !== 'string') { err(`${path}/rules/${i}`, 'rule needs a "type"'); return }
          if (!RULE_TYPES.includes(r.type as never)) err(`${path}/rules/${i}/type`, `Unknown rule "${r.type}"${hint(r.type, RULE_TYPES)}`)
          if (['minLength', 'maxLength', 'min', 'max'].includes(r.type) && typeof r.value !== 'number') err(`${path}/rules/${i}/value`, `${r.type} needs a numeric value`)
          if (r.type === 'pattern') {
            try { new RegExp(String(r.value)) } catch { err(`${path}/rules/${i}/value`, 'pattern is not a valid regular expression') }
          }
          if (r.message !== undefined && typeof r.message !== 'string') err(`${path}/rules/${i}/message`, 'message must be a string')
        })
      }
    }

    if (node.action !== undefined) {
      if (!def.actionable) err(`${path}/action`, `${def.type} cannot carry an action`)
      else checkAction(`${path}/action`, node.action)
    }

    if (node.children !== undefined) {
      if (!def.children) err(`${path}/children`, `${def.type} does not accept children`)
      else if (!Array.isArray(node.children)) err(`${path}/children`, 'children must be an array')
      else node.children.forEach((c, i) => visit(c, `${path}/children/${i}`))
    }
  }

  if (!Array.isArray(input.body)) err('/body', 'body must be an array of nodes')
  else if (input.body.length === 0) err('/body', 'body is empty')
  else input.body.forEach((n, i) => visit(n, `/body/${i}`))

  return finish(input as unknown as PageSchema)

  function finish(page?: PageSchema): ValidationResult {
    const errors = issues.filter((i) => i.severity === 'error')
    const warnings = issues.filter((i) => i.severity === 'warning')
    return { ok: errors.length === 0, errors, warnings, page: errors.length === 0 ? page : undefined }
  }
}

function hint(word: string, options: readonly string[]): string {
  const s = suggest(word, options)
  return s && s !== word ? `. Did you mean "${s}"?` : ''
}

/** Parse JSON text and report the line/column of a syntax error (same in every browser). */
export function parseJson(text: string): { value?: unknown; error?: { message: string; line: number; col: number } } {
  try {
    return { value: JSON.parse(text) }
  } catch (e) {
    const { pos, message } = locateJsonError(text) ?? { pos: 0, message: e instanceof Error ? e.message : String(e) }
    const before = text.slice(0, pos)
    const line = before.split('\n').length
    const col = pos - before.lastIndexOf('\n')
    return { error: { message, line, col } }
  }
}

/** Minimal JSON scanner that finds where and why parsing fails. */
function locateJsonError(src: string): { pos: number; message: string } | null {
  let i = 0
  const ws = () => { while (i < src.length && ' \t\n\r'.includes(src[i]!)) i++ }
  const fail = (message: string): never => { throw { pos: i, message } }
  const str = () => {
    i++
    while (i < src.length && src[i] !== '"') {
      if (src[i] === '\\') i++
      else if (src[i] === '\n') fail('Unterminated string')
      i++
    }
    if (i >= src.length) fail('Unterminated string')
    i++
  }
  const value = (): void => {
    ws()
    const c = src[i]
    if (c === '{') {
      i++; ws()
      if (src[i] === '}') { i++; return }
      for (;;) {
        ws()
        if (src[i] !== '"') fail(src[i] === '}' ? 'Trailing comma before }' : 'Expected a double-quoted property name')
        str(); ws()
        if (src[i] !== ':') fail('Expected ":" after property name')
        i++; value(); ws()
        if (src[i] === ',') { i++; continue }
        if (src[i] === '}') { i++; return }
        fail('Expected "," or "}"')
      }
    }
    if (c === '[') {
      i++; ws()
      if (src[i] === ']') { i++; return }
      for (;;) {
        ws()
        if (src[i] === ']') fail('Trailing comma before ]')
        value(); ws()
        if (src[i] === ',') { i++; continue }
        if (src[i] === ']') { i++; return }
        fail('Expected "," or "]"')
      }
    }
    if (c === '"') return str()
    const m = /^(-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(src.slice(i))
    if (!m) fail(c === undefined ? 'Unexpected end of input' : '}],:'.includes(c) ? 'Expected a value' : `Unexpected ${c === "'" ? 'single quote (use double quotes)' : `"${c}"`}`)
    i += m![0].length
  }
  try {
    value(); ws()
    if (i < src.length) fail('Unexpected text after the end of the JSON')
    return null
  } catch (e) {
    return e as { pos: number; message: string }
  }
}
