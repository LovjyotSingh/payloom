import { describe, expect, it, vi } from 'vitest'
import { dependencies, ExprError, parse, run } from './expr'
import { groupIndian, inr } from './format'
import { check, detectBrand, luhn, validExpiry } from './rules'
import { overlaps, setIn, Store } from './store'
import { compile, renderTemplate } from './template'
import { contrast, readableOn } from './color'

describe('expression language', () => {
  const scope = { amount: 1500, method: 'card', upi: '', card: { number: '4111111111111111' }, items: [{ a: 2 }, { a: 3 }], $form: { status: 'error' } }

  it('respects operator precedence and associativity', () => {
    expect(run('1 + 2 * 3', {})).toBe(7)
    expect(run('(1 + 2) * 3', {})).toBe(9)
    expect(run('10 - 4 - 3', {})).toBe(3)
    expect(run('-2 * 3', {})).toBe(-6)
    expect(run('true || false && false', {})).toBe(true)
    expect(run('1 < 2 == true', {})).toBe(true)
  })

  it('reads nested state, $-prefixed engine state and length', () => {
    expect(run("method == 'card' && amount > 1000", scope)).toBe(true)
    expect(run("$form.status == 'error'", scope)).toBe(true)
    expect(run('card.number.length', scope)).toBe(16)
    expect(run('missing.deep.path', scope)).toBeUndefined()
  })

  it('supports a nested ternary', () => {
    const src = "method == 'upi' ? 'U' : method == 'card' ? 'C' : 'N'"
    expect(run(src, scope)).toBe('C')
    expect(run(src, { method: 'nb' })).toBe('N')
  })

  it('treats blank values as equal to each other but not to 0', () => {
    expect(run("upi == ''", scope)).toBe(true)
    expect(run("nope == ''", scope)).toBe(true)
    expect(run('upi == 0', scope)).toBe(false)
  })

  it('calls only whitelisted functions', () => {
    expect(run("sum(items, 'a')", scope)).toBe(5)
    expect(run('last4(card.number)', scope)).toBe('1111')
    expect(run('round(10 / 3, 2)', {})).toBe(3.33)
    expect(() => parse('alert(1)')).toThrow(/Unknown function 'alert'/)
  })

  it('cannot reach prototypes or globals', () => {
    expect(run('constructor', {})).toBeUndefined()
    expect(run('items.constructor', scope)).toBeUndefined()
    expect(run('__proto__', {})).toBeUndefined()
    expect(run('toString', {})).toBeUndefined()
    expect(run('window', {})).toBeUndefined()
  })

  it('divides safely', () => {
    expect(run('5 / 0', {})).toBe(0)
  })

  it('reports syntax errors with a position', () => {
    expect(() => parse("amount > ")).toThrow(ExprError)
    expect(() => parse("amount > ")).toThrow(/end of expression/)
    expect(() => parse("'open")).toThrow(/Unterminated string/)
    try { parse('a # b') } catch (e) { expect((e as ExprError).pos).toBe(2) }
  })

  it('extracts the state paths an expression depends on', () => {
    expect([...dependencies(parse("method == 'card' && card.number.length > 0 || sum(items, 'a') > amount"))].sort())
      .toEqual(['amount', 'card.number.length', 'items', 'method'])
  })
})

describe('templates and formatting', () => {
  it('formats rupees with Indian digit grouping', () => {
    expect(groupIndian('1234567')).toBe('12,34,567')
    expect(groupIndian('999')).toBe('999')
    expect(inr(2499)).toBe('₹2,499')
    expect(inr(100000)).toBe('₹1,00,000')
    expect(inr(1847.5)).toBe('₹1,847.50')
    expect(inr(-230)).toBe('-₹230')
  })

  it('renders templates with formatter chains', () => {
    const t = compile("Pay {{ total | inr }} to {{ name | default:'merchant' }}")!
    expect(renderTemplate(t, { total: 123456 })).toBe('Pay ₹1,23,456 to merchant')
    expect([...t.deps].sort()).toEqual(['name', 'total'])
  })

  it('keeps || inside a template expression', () => {
    expect(renderTemplate(compile("{{ a || 'x' }}")!, {})).toBe('x')
  })

  it('returns raw values for a lone {{ expr }} so arrays can feed props', () => {
    expect(renderTemplate(compile('{{ items }}')!, { items: [1, 2] })).toEqual([1, 2])
  })

  it('rejects unknown formatters', () => {
    expect(() => compile('{{ a | money }}')).toThrow(/Unknown formatter 'money'/)
  })
})

describe('validation rules', () => {
  it('runs the Luhn checksum', () => {
    expect(luhn('4111 1111 1111 1111')).toBe(true)
    expect(luhn('4111 1111 1111 1112')).toBe(false)
    expect(luhn('378282246310005')).toBe(true)
  })

  it('detects card brands', () => {
    expect(detectBrand('4111')).toBe('visa')
    expect(detectBrand('5500 0000')).toBe('mastercard')
    expect(detectBrand('2221 00')).toBe('mastercard')
    expect(detectBrand('3782')).toBe('amex')
    expect(detectBrand('6521 1234')).toBe('rupay')
    expect(detectBrand('9999')).toBe('unknown')
  })

  it('checks expiry against today', () => {
    const now = new Date(2026, 10, 8)
    expect(validExpiry('11/26', now)).toBe(true) // valid through the end of the month
    expect(validExpiry('10/26', now)).toBe(false)
    expect(validExpiry('13/27', now)).toBe(false)
    expect(validExpiry('1/27', now)).toBe(false)
  })

  it('checks UPI IDs, IFSC and Indian mobile numbers', () => {
    expect(check('name@okhdfcbank', [{ type: 'upi' }])).toBeNull()
    expect(check('name@', [{ type: 'upi' }])).toMatch(/UPI ID/)
    expect(check('HDFC0001234', [{ type: 'ifsc' }])).toBeNull()
    expect(check('HDFC1001234', [{ type: 'ifsc' }])).toMatch(/IFSC/)
    expect(check('9958473062', [{ type: 'phone' }])).toBeNull()
    expect(check('+91 99584 73062', [{ type: 'phone' }])).toBeNull()
    expect(check('1234567890', [{ type: 'phone' }])).toMatch(/mobile/)
  })

  it('sizes the CVV by card brand', () => {
    expect(check('123', [{ type: 'cvv' }], { cardNumber: '4111111111111111' })).toBeNull()
    expect(check('123', [{ type: 'cvv' }], { cardNumber: '378282246310005' })).toMatch(/CVV/)
    expect(check('1234', [{ type: 'cvv' }], { cardNumber: '378282246310005' })).toBeNull()
  })

  it('lets optional fields stay blank and uses custom messages', () => {
    expect(check('', [{ type: 'upi' }])).toBeNull()
    expect(check('  ', [{ type: 'required', message: 'Enter your UPI ID' }])).toBe('Enter your UPI ID')
    expect(check(50, [{ type: 'min', value: 100 }])).toBe('Enter at least 100')
    expect(check('12345', [{ type: 'pattern', value: '\\d{9,12}' }])).toBe('Enter a valid value')
  })
})

describe('store', () => {
  it('updates immutably along the path only', () => {
    const a = { card: { number: '1', cvv: '2' }, other: { x: 1 } }
    const b = setIn(a, 'card.number', '9')
    expect(b.card.number).toBe('9')
    expect(a.card.number).toBe('1')
    expect(b.other).toBe(a.other)
  })

  it('matches dependencies by path prefix in both directions', () => {
    expect(overlaps('card', 'card.number')).toBe(true)
    expect(overlaps('card.number', 'card')).toBe(true)
    expect(overlaps('card', 'cardNumber')).toBe(false)
    expect(overlaps('$errors.upi', '$errors.upi')).toBe(true)
  })

  it('only notifies subscribers whose paths changed, once per batch', () => {
    const s = new Store({ upi: '', amount: 0, card: { number: '' } })
    const upi = vi.fn()
    const card = vi.fn()
    const all = vi.fn()
    s.subscribe(['upi'], upi)
    s.subscribe(['card'], card)
    s.subscribe('*', all)
    s.set('upi', 'a@b')
    expect(upi).toHaveBeenCalledTimes(1)
    expect(card).not.toHaveBeenCalled()
    s.batch(() => { s.set('card.number', '4'); s.set('amount', 5) })
    expect(card).toHaveBeenCalledTimes(1)
    expect(all).toHaveBeenCalledTimes(2)
    s.set('upi', 'a@b') // unchanged value: no notification
    expect(upi).toHaveBeenCalledTimes(1)
  })
})

describe('colour contrast', () => {
  it('computes WCAG ratios', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1)
    expect(readableOn('#6d28d9')).toBe('#ffffff')
    expect(readableOn('#a78bfa')).toBe('#000000')
  })
})
