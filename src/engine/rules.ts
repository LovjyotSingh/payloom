/** Field validation rules used by page configs ("rules": [{ "type": "luhn" }]). */

export type RuleType =
  | 'required' | 'minLength' | 'maxLength' | 'pattern' | 'min' | 'max'
  | 'email' | 'phone' | 'upi' | 'ifsc' | 'luhn' | 'expiry' | 'cvv' | 'otp'

export interface Rule {
  type: RuleType
  value?: string | number
  message?: string
}

export type CardBrand = 'visa' | 'mastercard' | 'rupay' | 'amex' | 'unknown'

export const CARD_BRANDS: Record<CardBrand, { label: string; lengths: number[]; cvv: number; gaps: number[] }> = {
  visa: { label: 'Visa', lengths: [16], cvv: 3, gaps: [4, 8, 12] },
  mastercard: { label: 'Mastercard', lengths: [16], cvv: 3, gaps: [4, 8, 12] },
  rupay: { label: 'RuPay', lengths: [16], cvv: 3, gaps: [4, 8, 12] },
  amex: { label: 'American Express', lengths: [15], cvv: 4, gaps: [4, 10] },
  unknown: { label: 'Card', lengths: [16], cvv: 3, gaps: [4, 8, 12] },
}

export function detectBrand(input: string): CardBrand {
  const d = input.replace(/\D/g, '')
  if (/^3[47]/.test(d)) return 'amex'
  if (/^(60|65|81|82|508|353|356)/.test(d)) return 'rupay'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return 'mastercard'
  if (/^4/.test(d)) return 'visa'
  return 'unknown'
}

export function luhn(input: string): boolean {
  const d = input.replace(/\D/g, '')
  if (d.length < 12) return false
  let sum = 0
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i])
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9 }
    sum += n
  }
  return sum % 10 === 0
}

/** "MM/YY" that is a real month and not in the past. */
export function validExpiry(input: string, now = new Date()): boolean {
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(input.trim())
  if (!m) return false
  const month = Number(m[1])
  const year = 2000 + Number(m[2])
  if (month < 1 || month > 12) return false
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)
  return endOfMonth >= now && year <= now.getFullYear() + 20
}

const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  phone: /^[6-9]\d{9}$/, // Indian mobile, 10 digits
  upi: /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/,
  ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/,
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '' || v === false

export const DEFAULT_MESSAGES: Record<RuleType, (r: Rule) => string> = {
  required: () => 'This field is required',
  minLength: (r) => `Enter at least ${r.value} characters`,
  maxLength: (r) => `Enter no more than ${r.value} characters`,
  pattern: () => 'Enter a valid value',
  min: (r) => `Enter at least ${r.value}`,
  max: (r) => `Enter no more than ${r.value}`,
  email: () => 'Enter a valid email address',
  phone: () => 'Enter a valid 10-digit mobile number',
  upi: () => 'Enter a valid UPI ID, like name@bank',
  ifsc: () => 'Enter a valid 11-character IFSC code',
  luhn: () => 'Enter a valid card number',
  expiry: () => 'Enter a valid expiry date (MM/YY)',
  cvv: () => 'Enter a valid CVV',
  otp: (r) => `Enter the ${r.value ?? 6}-digit code`,
}

/**
 * Check one value against its rules. Returns the first failing message, or null.
 * Non-required rules pass on blank values so optional fields stay optional.
 * `ctx` lets a rule read sibling state (the CVV length depends on the card brand).
 */
export function check(value: unknown, rules: readonly Rule[], ctx: { cardNumber?: string; now?: Date } = {}): string | null {
  for (const r of rules) {
    if (r.type === 'required') {
      if (isBlank(typeof value === 'string' ? value.trim() : value)) return r.message ?? DEFAULT_MESSAGES.required(r)
      continue
    }
    if (isBlank(value)) continue
    const s = String(value).trim()
    let ok = true
    switch (r.type) {
      case 'minLength': ok = s.length >= Number(r.value); break
      case 'maxLength': ok = s.length <= Number(r.value); break
      case 'pattern': ok = new RegExp(`^(?:${String(r.value)})$`).test(s); break
      case 'min': ok = Number(value) >= Number(r.value); break
      case 'max': ok = Number(value) <= Number(r.value); break
      case 'email': ok = PATTERNS.email.test(s); break
      case 'phone': ok = PATTERNS.phone.test(s.replace(/[\s-]/g, '').replace(/^\+?91/, '')); break
      case 'upi': ok = PATTERNS.upi.test(s); break
      case 'ifsc': ok = PATTERNS.ifsc.test(s.toUpperCase()); break
      case 'luhn': {
        const d = s.replace(/\D/g, '')
        ok = luhn(d) && CARD_BRANDS[detectBrand(d)].lengths.includes(d.length)
        break
      }
      case 'expiry': ok = validExpiry(s, ctx.now); break
      case 'cvv': {
        const need = CARD_BRANDS[detectBrand(ctx.cardNumber ?? '')].cvv
        ok = new RegExp(`^\\d{${need}}$`).test(s)
        break
      }
      case 'otp': ok = new RegExp(`^\\d{${Number(r.value ?? 6)}}$`).test(s); break
    }
    if (!ok) return r.message ?? DEFAULT_MESSAGES[r.type](r)
  }
  return null
}

export const RULE_TYPES = Object.keys(DEFAULT_MESSAGES) as RuleType[]
