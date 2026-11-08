/** Formatting helpers shared by templates and components (Indian locale conventions). */

/** 123456.5 -> "1,23,456.50" (Indian digit grouping: last 3, then pairs). */
export function groupIndian(intPart: string): string {
  const neg = intPart.startsWith('-')
  const digits = neg ? intPart.slice(1) : intPart
  if (digits.length <= 3) return (neg ? '-' : '') + digits
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return (neg ? '-' : '') + rest + ',' + last3
}

/** Format a rupee amount (configs use rupees): 2499 -> "₹2,499", 10.5 -> "₹10.50". */
export function inr(value: unknown, opts: { decimals?: 'auto' | 'always' } = {}): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '₹0'
  const fixed = Math.abs(n).toFixed(2)
  const [i, d] = fixed.split('.') as [string, string]
  const showDec = opts.decimals === 'always' || d !== '00'
  return (n < 0 ? '-' : '') + '₹' + groupIndian(i) + (showDec ? '.' + d : '')
}

/** Spoken form for screen readers: "2,499 rupees". */
export function inrSpoken(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '0 rupees'
  const [i, d] = Math.abs(n).toFixed(2).split('.') as [string, string]
  return `${groupIndian(i)} rupees${d !== '00' ? ` ${Number(d)} paise` : ''}`
}

/** Card number for display: "4111111111111111" -> "•••• 1111". */
export function maskCard(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : ''
}

export const FORMATTERS: Record<string, (v: unknown, arg?: string) => string> = {
  inr: (v) => inr(v),
  number: (v) => groupIndian(String(Math.round(Number(v) || 0))),
  upper: (v) => String(v ?? '').toUpperCase(),
  lower: (v) => String(v ?? '').toLowerCase(),
  mask: (v) => maskCard(v),
  default: (v, arg) => (v === undefined || v === null || v === '' ? (arg ?? '') : String(v)),
  plural: (v, arg) => {
    const [one, many] = (arg ?? 's').includes('/') ? arg!.split('/') : ['', arg ?? 's']
    return Number(v) === 1 ? one ?? '' : many ?? ''
  },
}
