/**
 * A small, safe expression language for page configs.
 *
 *   when: "method == 'card' && total > 0"
 *   label: "Pay {{ total | inr }}"
 *
 * Expressions are tokenized and parsed with a Pratt parser into an AST, then
 * evaluated against page state. Nothing is ever passed to eval/new Function,
 * and member access is restricted to own data properties, so a config cannot
 * reach prototypes, globals or the DOM.
 */

export type Node =
  | { k: 'lit'; v: unknown }
  | { k: 'path'; parts: string[] }
  | { k: 'unary'; op: '!' | '-'; arg: Node }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'cond'; test: Node; then: Node; else: Node }
  | { k: 'call'; fn: string; args: Node[] }

export class ExprError extends Error {
  constructor(message: string, readonly pos: number, readonly source: string) {
    super(`${message} at position ${pos + 1} in "${source}"`)
    this.name = 'ExprError'
  }
}

type Tok =
  | { t: 'num'; v: number; p: number }
  | { t: 'str'; v: string; p: number }
  | { t: 'id'; v: string; p: number }
  | { t: 'op'; v: string; p: number }
  | { t: 'eof'; p: number }

const OPS = ['==', '!=', '<=', '>=', '&&', '||', '<', '>', '+', '-', '*', '/', '%', '!', '(', ')', '?', ':', '.', ',']

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i))!
      out.push({ t: 'num', v: Number(m[0]), p: i })
      i += m[0].length
      continue
    }
    if (c === "'" || c === '"') {
      let j = i + 1
      let s = ''
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; continue }
        s += src[j]
        j++
      }
      if (j >= src.length) throw new ExprError('Unterminated string', i, src)
      out.push({ t: 'str', v: s, p: i })
      i = j + 1
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i))!
      out.push({ t: 'id', v: m[0], p: i })
      i += m[0].length
      continue
    }
    const op = OPS.find((o) => src.startsWith(o, i))
    if (!op) throw new ExprError(`Unexpected character '${c}'`, i, src)
    out.push({ t: 'op', v: op, p: i })
    i += op.length
  }
  out.push({ t: 'eof', p: src.length })
  return out
}

// Binding power for infix operators (higher binds tighter).
const BP: Record<string, number> = {
  '?': 1,
  '||': 2,
  '&&': 3,
  '==': 4, '!=': 4,
  '<': 5, '<=': 5, '>': 5, '>=': 5,
  '+': 6, '-': 6,
  '*': 7, '/': 7, '%': 7,
}

export const FUNCTIONS: Record<string, (...a: unknown[]) => unknown> = {
  len: (x) => (typeof x === 'string' || Array.isArray(x) ? x.length : 0),
  sum: (list, key) =>
    Array.isArray(list)
      ? list.reduce((acc: number, it) => acc + num(typeof key === 'string' && isObj(it) ? it[key] : it), 0)
      : 0,
  round: (x, d) => {
    const f = 10 ** num(d ?? 0)
    return Math.round(num(x) * f) / f
  },
  min: (...xs) => Math.min(...xs.map(num)),
  max: (...xs) => Math.max(...xs.map(num)),
  includes: (h, n) => (typeof h === 'string' ? h.includes(String(n)) : Array.isArray(h) ? h.includes(n) : false),
  upper: (s) => String(s ?? '').toUpperCase(),
  lower: (s) => String(s ?? '').toLowerCase(),
  last4: (s) => String(s ?? '').replace(/\D/g, '').slice(-4),
}

function num(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x)
  return Number.isFinite(n) ? n : 0
}
function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

class Parser {
  private i = 0
  constructor(private toks: Tok[], private src: string) {}

  private peek() { return this.toks[this.i]! }
  private next() { return this.toks[this.i++]! }
  private isOp(v: string) { const t = this.peek(); return t.t === 'op' && t.v === v }
  private expect(v: string) {
    const t = this.next()
    if (t.t !== 'op' || t.v !== v) throw new ExprError(`Expected '${v}'`, t.p, this.src)
  }

  parse(): Node {
    const n = this.expr(0)
    const t = this.peek()
    if (t.t !== 'eof') throw new ExprError(`Unexpected '${'v' in t ? t.v : ''}'`, t.p, this.src)
    return n
  }

  private expr(minBp: number): Node {
    let left = this.prefix()
    for (;;) {
      const t = this.peek()
      if (t.t !== 'op') break
      const bp = BP[t.v]
      if (bp === undefined || bp <= minBp) break
      this.next()
      if (t.v === '?') {
        const then = this.expr(0)
        this.expect(':')
        const els = this.expr(bp - 1) // right-associative
        left = { k: 'cond', test: left, then, else: els }
      } else {
        left = { k: 'bin', op: t.v, l: left, r: this.expr(bp) }
      }
    }
    return left
  }

  private prefix(): Node {
    const t = this.next()
    switch (t.t) {
      case 'num':
      case 'str':
        return { k: 'lit', v: t.v }
      case 'id': {
        if (t.v === 'true') return { k: 'lit', v: true }
        if (t.v === 'false') return { k: 'lit', v: false }
        if (t.v === 'null') return { k: 'lit', v: null }
        if (this.isOp('(')) {
          if (!(t.v in FUNCTIONS)) throw new ExprError(`Unknown function '${t.v}'`, t.p, this.src)
          this.next()
          const args: Node[] = []
          if (!this.isOp(')')) {
            do { args.push(this.expr(0)) } while (this.isOp(',') && this.next())
          }
          this.expect(')')
          return { k: 'call', fn: t.v, args }
        }
        const parts = [t.v]
        while (this.isOp('.')) {
          this.next()
          const p = this.next()
          if (p.t !== 'id' && p.t !== 'num') throw new ExprError('Expected property name', p.p, this.src)
          parts.push(String(p.v))
        }
        return { k: 'path', parts }
      }
      case 'op':
        if (t.v === '!' || t.v === '-') return { k: 'unary', op: t.v, arg: this.expr(8) }
        if (t.v === '(') {
          const e = this.expr(0)
          this.expect(')')
          return e
        }
        throw new ExprError(`Unexpected '${t.v}'`, t.p, this.src)
      case 'eof':
        throw new ExprError('Unexpected end of expression', t.p, this.src)
    }
  }
}

const cache = new Map<string, Node>()

/** Parse (and cache) an expression. Throws ExprError on bad syntax. */
export function parse(src: string): Node {
  let n = cache.get(src)
  if (!n) {
    n = new Parser(tokenize(src), src).parse()
    if (cache.size > 2000) cache.clear()
    cache.set(src, n)
  }
  return n
}

const BLOCKED = new Set(['__proto__', 'prototype', 'constructor'])

/** Read a dotted path from plain data, refusing anything that is not an own property. */
export function readPath(scope: unknown, parts: readonly string[]): unknown {
  let cur: unknown = scope
  for (const p of parts) {
    if (BLOCKED.has(p)) return undefined
    if (p === 'length' && (typeof cur === 'string' || Array.isArray(cur))) { cur = cur.length; continue }
    if (!isObj(cur) || !Object.prototype.hasOwnProperty.call(cur, p)) return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function evaluate(node: Node, scope: unknown): unknown {
  switch (node.k) {
    case 'lit': return node.v
    case 'path': return readPath(scope, node.parts)
    case 'unary': {
      const v = evaluate(node.arg, scope)
      return node.op === '!' ? !v : -num(v)
    }
    case 'cond': return evaluate(node.test, scope) ? evaluate(node.then, scope) : evaluate(node.else, scope)
    case 'call': return FUNCTIONS[node.fn]!(...node.args.map((a) => evaluate(a, scope)))
    case 'bin': {
      if (node.op === '&&') return evaluate(node.l, scope) && evaluate(node.r, scope)
      if (node.op === '||') return evaluate(node.l, scope) || evaluate(node.r, scope)
      const l = evaluate(node.l, scope)
      const r = evaluate(node.r, scope)
      switch (node.op) {
        case '==': return looseEq(l, r)
        case '!=': return !looseEq(l, r)
        case '<': return num(l) < num(r)
        case '<=': return num(l) <= num(r)
        case '>': return num(l) > num(r)
        case '>=': return num(l) >= num(r)
        case '+': return typeof l === 'string' || typeof r === 'string' ? `${l ?? ''}${r ?? ''}` : num(l) + num(r)
        case '-': return num(l) - num(r)
        case '*': return num(l) * num(r)
        case '/': return num(r) === 0 ? 0 : num(l) / num(r)
        case '%': return num(r) === 0 ? 0 : num(l) % num(r)
      }
      return undefined
    }
  }
}

// Empty string / null / undefined compare equal to each other, so "upi == ''"
// works whether or not the field has been touched.
function looseEq(a: unknown, b: unknown): boolean {
  const blank = (x: unknown) => x === undefined || x === null || x === ''
  if (blank(a) && blank(b)) return true
  if (typeof a === 'number' || typeof b === 'number') {
    if (blank(a) || blank(b)) return false
    return num(a) === num(b)
  }
  return a === b
}

/** Top-level state paths an expression reads, e.g. "card.number" -> "card.number". */
export function dependencies(node: Node, out = new Set<string>()): Set<string> {
  switch (node.k) {
    case 'path': out.add(node.parts.join('.')); break
    case 'unary': dependencies(node.arg, out); break
    case 'bin': dependencies(node.l, out); dependencies(node.r, out); break
    case 'cond': dependencies(node.test, out); dependencies(node.then, out); dependencies(node.else, out); break
    case 'call': node.args.forEach((a) => dependencies(a, out)); break
  }
  return out
}

/** Convenience: parse + evaluate. */
export function run(src: string, scope: unknown): unknown {
  return evaluate(parse(src), scope)
}
