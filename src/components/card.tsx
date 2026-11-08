import { useRef, type ChangeEvent } from 'react'
import type { ComponentDef, RenderProps } from '../engine/registry'
import { CARD_BRANDS, detectBrand } from '../engine/rules'
import { reformat, setCaret } from './caret'
import { describedBy, FieldShell, str } from './shared'

const isDigit = (c: string) => c >= '0' && c <= '9'

export function formatCardNumber(digits: string): string {
  const brand = CARD_BRANDS[detectBrand(digits)]
  const max = Math.max(...brand.lengths)
  const d = digits.slice(0, max)
  let out = ''
  for (let i = 0; i < d.length; i++) {
    if (brand.gaps.includes(i)) out += ' '
    out += d[i]
  }
  return out
}

function BrandMark({ brand }: { brand: string }) {
  if (brand === 'unknown') return null
  return <span className="pl-brand" data-brand={brand}>{CARD_BRANDS[brand as keyof typeof CARD_BRANDS].label}</span>
}

// ---- CardNumberField -------------------------------------------------------------

type CardNumberProps = { label?: string; hint?: string }
function CardNumberField({ props, field, busy }: RenderProps<CardNumberProps>) {
  const f = field!
  const ref = useRef<HTMLInputElement>(null)
  const digits = str(f.value).replace(/\D/g, '')
  const brand = detectBrand(digits)
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const r = reformat(e.target.value, e.target.selectionStart ?? e.target.value.length, isDigit, formatCardNumber)
    f.setValue(r.clean.slice(0, Math.max(...CARD_BRANDS[detectBrand(r.clean)].lengths)))
    setCaret(ref.current, r.caret)
  }
  return (
    <FieldShell field={f} label={str(props.label, 'Card number')} hint={props.hint} aside={<BrandMark brand={brand} />}>
      <div className="pl-input-wrap">
        <input
          ref={ref}
          id={f.id}
          name={f.name}
          className="pl-input is-mono"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
          value={formatCardNumber(digits)}
          onChange={onChange}
          onBlur={f.onBlur}
          readOnly={busy}
          aria-invalid={f.error ? true : undefined}
          aria-required={f.required || undefined}
          aria-describedby={describedBy(f, props.hint)}
        />
      </div>
      <span className="pl-sr-only" aria-live="polite">{brand !== 'unknown' ? `${CARD_BRANDS[brand].label} card detected` : ''}</span>
    </FieldShell>
  )
}
export const CardNumberFieldDef: ComponentDef<CardNumberProps> = {
  type: 'CardNumberField',
  category: 'Payment',
  description: 'Card number with brand detection (Visa, Mastercard, RuPay, Amex), brand-specific spacing (4-6-5 for Amex), caret-safe formatting and a polite live announcement of the brand. Stores digits only.',
  component: CardNumberField,
  bindable: 'string',
  props: {
    label: { type: 'string', default: 'Card number', description: 'Visible label.' },
    hint: { type: 'string', description: 'Help text.' },
  },
  example: { type: 'CardNumberField', bind: 'card.number', props: { label: 'Card number' }, rules: [{ type: 'required' }, { type: 'luhn' }] },
  exampleState: { card: { number: '4111111111111111' } },
}

// ---- ExpiryField -----------------------------------------------------------------

type ExpiryProps = { label?: string; hint?: string }
function formatExpiry(d: string): string {
  let digits = d.slice(0, 4)
  if (digits.length === 1 && Number(digits) > 1) digits = '0' + digits // "4" -> "04"
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits
}
function ExpiryField({ props, field, busy }: RenderProps<ExpiryProps>) {
  const f = field!
  const ref = useRef<HTMLInputElement>(null)
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const deleting = e.target.value.length < str(f.value).length
    const r = reformat(e.target.value, e.target.selectionStart ?? e.target.value.length, isDigit, formatExpiry)
    // Typing "12" moves straight on to the year; deleting past the slash removes it.
    // Count digits after formatting: "4" is padded to "04", which completes the month.
    const monthDone = !deleting && r.text.replace(/\D/g, '').length === 2
    const text = monthDone ? r.text + '/' : r.text
    f.setValue(text)
    setCaret(ref.current, monthDone ? text.length : r.caret)
  }
  const hint = props.hint ?? 'MM/YY, as printed on the card'
  return (
    <FieldShell field={f} label={str(props.label, 'Expiry date')} hint={hint}>
      <div className="pl-input-wrap">
        <input
          ref={ref}
          id={f.id}
          name={f.name}
          className="pl-input is-mono"
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder="MM/YY"
          maxLength={5}
          value={str(f.value)}
          onChange={onChange}
          onBlur={f.onBlur}
          readOnly={busy}
          aria-invalid={f.error ? true : undefined}
          aria-required={f.required || undefined}
          aria-describedby={describedBy(f, hint)}
        />
      </div>
    </FieldShell>
  )
}
export const ExpiryFieldDef: ComponentDef<ExpiryProps> = {
  type: 'ExpiryField',
  category: 'Payment',
  description: 'Card expiry that inserts the slash for you and pads single-digit months ("4" becomes "04/").',
  component: ExpiryField,
  bindable: 'string',
  props: {
    label: { type: 'string', default: 'Expiry date', description: 'Visible label.' },
    hint: { type: 'string', description: 'Help text.' },
  },
  example: { type: 'ExpiryField', bind: 'card.expiry', props: {}, rules: [{ type: 'required' }, { type: 'expiry' }] },
  exampleState: { card: { expiry: '' } },
}

// ---- CvvField --------------------------------------------------------------------

type CvvProps = { label?: string; cardPath?: string }
function CvvField({ props, field, busy }: RenderProps<CvvProps>) {
  const f = field!
  const cardPath = props.cardPath ?? 'card.number'
  const need = CARD_BRANDS[detectBrand(str(f.read(cardPath)))].cvv
  const hint = need === 4 ? '4 digits on the front of the card' : '3 digits on the back of the card'
  return (
    <FieldShell field={f} label={str(props.label, 'CVV')} hint={hint}>
      <div className="pl-input-wrap">
        <input
          id={f.id}
          name={f.name}
          className="pl-input is-mono"
          type="password"
          inputMode="numeric"
          autoComplete="cc-csc"
          maxLength={need}
          value={str(f.value)}
          onChange={(e) => f.setValue(e.target.value.replace(/\D/g, '').slice(0, need))}
          onBlur={f.onBlur}
          readOnly={busy}
          aria-invalid={f.error ? true : undefined}
          aria-required={f.required || undefined}
          aria-describedby={describedBy(f, hint)}
        />
      </div>
    </FieldShell>
  )
}
export const CvvFieldDef: ComponentDef<CvvProps> = {
  type: 'CvvField',
  category: 'Payment',
  description: 'Masked security code whose length and hint follow the card brand (4 digits for Amex, 3 otherwise).',
  component: CvvField,
  bindable: 'string',
  reads: ['card.number', 'cardNumber'],
  props: {
    label: { type: 'string', default: 'CVV', description: 'Visible label.' },
    cardPath: { type: 'string', default: 'card.number', description: 'State path of the card number, used to pick the length.' },
  },
  example: { type: 'CvvField', bind: 'card.cvv', props: {}, rules: [{ type: 'required' }, { type: 'cvv' }] },
  exampleState: { card: { number: '378282246310005', cvv: '' } },
}
