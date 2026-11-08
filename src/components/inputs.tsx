import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent, type ReactElement } from 'react'
import type { ComponentDef, RenderProps } from '../engine/registry'
import { groupIndian, inr } from '../engine/format'
import { reformat, setCaret } from './caret'
import { cx, describedBy, ErrorIcon, FieldShell, numOr, str } from './shared'

// ---- TextField ----------------------------------------------------------------

type TextFieldProps = {
  label: string; hint?: string; placeholder?: string; type?: string; inputMode?: string
  autoComplete?: string; maxLength?: number; prefix?: string; suffix?: string; transform?: string
}
function TextField({ props, field, busy }: RenderProps<TextFieldProps>) {
  const f = field!
  const transform = (v: string) =>
    props.transform === 'upper' ? v.toUpperCase()
      : props.transform === 'lower' ? v.toLowerCase()
        : props.transform === 'digits' ? v.replace(/\D/g, '')
          : v
  return (
    <FieldShell field={f} label={str(props.label)} hint={props.hint}>
      <div className={cx('pl-input-wrap', props.prefix && 'has-prefix', props.suffix && 'has-suffix')}>
        {props.prefix && <span className="pl-affix" aria-hidden="true">{str(props.prefix)}</span>}
        <input
          id={f.id}
          name={f.name}
          className="pl-input"
          type={props.type ?? 'text'}
          inputMode={props.inputMode as never}
          autoComplete={props.autoComplete ?? 'off'}
          placeholder={props.placeholder}
          maxLength={props.maxLength}
          value={str(f.value)}
          onChange={(e) => f.setValue(transform(e.target.value))}
          onBlur={f.onBlur}
          readOnly={busy}
          aria-invalid={f.error ? true : undefined}
          aria-required={f.required || undefined}
          aria-describedby={describedBy(f, props.hint)}
          spellCheck={false}
        />
        {props.suffix && <span className="pl-affix" aria-hidden="true">{str(props.suffix)}</span>}
      </div>
    </FieldShell>
  )
}
export const TextFieldDef: ComponentDef<TextFieldProps> = {
  type: 'TextField',
  category: 'Input',
  description: 'Single-line input with label, hint and error wired to aria-describedby. Transforms keep values clean (upper-case IFSC, digits-only phone).',
  component: TextField,
  bindable: 'string',
  props: {
    label: { type: 'string', required: true, description: 'Visible label (also the accessible name).' },
    hint: { type: 'string', description: 'Help text under the label.' },
    placeholder: { type: 'string', description: 'Example value. Never a substitute for the label.' },
    type: { type: 'enum', values: ['text', 'email', 'tel', 'password'], default: 'text', description: 'Input type.' },
    inputMode: { type: 'enum', values: ['text', 'numeric', 'decimal', 'tel', 'email'], description: 'Mobile keyboard hint.' },
    autoComplete: { type: 'string', description: 'Autofill token, e.g. "email", "tel-national", "cc-name".' },
    maxLength: { type: 'number', description: 'Maximum characters.' },
    prefix: { type: 'string', description: 'Fixed text before the value, e.g. "+91".' },
    suffix: { type: 'string', description: 'Fixed text after the value.' },
    transform: { type: 'enum', values: ['none', 'upper', 'lower', 'digits'], default: 'none', description: 'Normalise input as it is typed.' },
  },
  example: { type: 'TextField', bind: 'upi', props: { label: 'UPI ID', hint: 'For example, name@okhdfcbank', autoComplete: 'off' }, rules: [{ type: 'required' }, { type: 'upi' }] },
  exampleState: { upi: '' },
}

// ---- AmountField ----------------------------------------------------------------

type AmountFieldProps = { label: string; hint?: string; presets?: number[]; min?: number; max?: number }
const keepAmount = (c: string) => /[0-9.]/.test(c)
function formatAmount(clean: string): string {
  const [i = '', ...rest] = clean.split('.')
  const int = i.replace(/^0+(?=\d)/, '').slice(0, 9)
  const dec = rest.length ? '.' + rest.join('').slice(0, 2) : ''
  return (int ? groupIndian(int) : dec ? '0' : '') + dec
}
function AmountField({ props, field, busy }: RenderProps<AmountFieldProps>) {
  const f = field!
  const ref = useRef<HTMLInputElement>(null)
  const value = f.value === null || f.value === undefined || f.value === '' ? null : Number(f.value)
  // Keep the text the user typed ("12." mid-edit) instead of re-deriving it from the number.
  const [text, setText] = useState(() => (value === null ? '' : formatAmount(String(value))))
  useEffect(() => {
    const parsed = text === '' ? null : Number(text.replace(/,/g, ''))
    if (parsed !== value) setText(value === null ? '' : formatAmount(String(value)))
  }, [value])

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const r = reformat(e.target.value, e.target.selectionStart ?? e.target.value.length, keepAmount, formatAmount)
    setText(r.text)
    setCaret(ref.current, r.caret)
    const n = r.text === '' ? null : Number(r.text.replace(/,/g, ''))
    f.setValue(n === null || Number.isNaN(n) ? null : n)
  }
  const presets = Array.isArray(props.presets) ? props.presets.map((p) => numOr(p, 0)) : []
  const hintText = props.hint ?? (props.min !== undefined && props.max !== undefined ? `Between ${inr(props.min)} and ${inr(props.max)}` : undefined)
  return (
    <FieldShell field={f} label={str(props.label)} hint={hintText}>
      <div className="pl-input-wrap has-prefix is-amount">
        <span className="pl-affix" aria-hidden="true">₹</span>
        <input
          ref={ref}
          id={f.id}
          name={f.name}
          className="pl-input"
          inputMode="decimal"
          autoComplete="transaction-amount"
          value={text}
          onChange={onChange}
          onBlur={f.onBlur}
          readOnly={busy}
          aria-invalid={f.error ? true : undefined}
          aria-required={f.required || undefined}
          aria-describedby={describedBy(f, hintText)}
        />
      </div>
      {presets.length > 0 && (
        <div className="pl-chips" role="group" aria-label={`Quick amounts for ${str(props.label)}`}>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className="pl-chip"
              aria-pressed={value === p}
              onClick={() => { f.setValue(p); setText(formatAmount(String(p))) }}
              disabled={busy}
            >
              {inr(p)}
            </button>
          ))}
        </div>
      )}
    </FieldShell>
  )
}
export const AmountFieldDef: ComponentDef<AmountFieldProps> = {
  type: 'AmountField',
  category: 'Input',
  description: 'Rupee amount input with live Indian digit grouping, caret-safe formatting, 2-decimal limit and optional quick-pick chips.',
  component: AmountField,
  bindable: 'number',
  props: {
    label: { type: 'string', required: true, description: 'Visible label.' },
    hint: { type: 'string', description: 'Help text; defaults to the min-max range.' },
    presets: { type: 'array', description: 'Quick-pick amounts in rupees.' },
    min: { type: 'number', description: 'Shown in the default hint. Enforce with a "min" rule.' },
    max: { type: 'number', description: 'Shown in the default hint. Enforce with a "max" rule.' },
  },
  example: {
    type: 'AmountField', bind: 'amount', props: { label: 'Amount', presets: [500, 1000, 2000], min: 100, max: 100000 },
    rules: [{ type: 'required' }, { type: 'min', value: 100 }, { type: 'max', value: 100000 }],
  },
  exampleState: { amount: 1000 },
}

// ---- SelectField ----------------------------------------------------------------

type SelectProps = { label: string; hint?: string; placeholder?: string; options: { value: string; label: string }[] }
function SelectField({ props, field, busy }: RenderProps<SelectProps>) {
  const f = field!
  const options = Array.isArray(props.options) ? props.options : []
  return (
    <FieldShell field={f} label={str(props.label)} hint={props.hint}>
      <div className="pl-input-wrap is-select">
        <select
          id={f.id}
          name={f.name}
          className="pl-input"
          value={str(f.value)}
          onChange={(e) => f.setValue(e.target.value)}
          onBlur={f.onBlur}
          disabled={busy}
          aria-invalid={f.error ? true : undefined}
          aria-required={f.required || undefined}
          aria-describedby={describedBy(f, props.hint)}
        >
          <option value="" disabled>{str(props.placeholder, 'Select an option')}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <svg className="pl-select-caret" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M5.5 7.75L10 12.25l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
    </FieldShell>
  )
}
export const SelectFieldDef: ComponentDef<SelectProps> = {
  type: 'SelectField',
  category: 'Input',
  description: 'Native select styled to match. Native means correct keyboard, screen reader and mobile picker behaviour for free.',
  component: SelectField,
  bindable: 'string',
  props: {
    label: { type: 'string', required: true, description: 'Visible label.' },
    hint: { type: 'string', description: 'Help text.' },
    placeholder: { type: 'string', default: 'Select an option', description: 'Disabled first option.' },
    options: { type: 'array', required: true, itemKeys: ['value', 'label'], description: 'Options of { value, label }.' },
  },
  example: {
    type: 'SelectField', bind: 'bank', props: { label: 'Bank', placeholder: 'Choose your bank', options: [{ value: 'hdfc', label: 'HDFC Bank' }, { value: 'icici', label: 'ICICI Bank' }, { value: 'sbi', label: 'State Bank of India' }] },
    rules: [{ type: 'required', message: 'Choose your bank' }],
  },
  exampleState: { bank: '' },
}

// ---- RadioCards -----------------------------------------------------------------

type RadioOption = { value: string; label: string; description?: string; badge?: string; icon?: string; disabled?: boolean }
type RadioCardsProps = { label: string; hint?: string; options: RadioOption[]; columns?: number }

const ICONS: Record<string, ReactElement> = {
  upi: <path d="M7 4l5 8-5 8M12 4l5 8-5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  card: <><rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3 9.5h18M6.5 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  bank: <path d="M4 9.5L12 5l8 4.5M5.5 10v7M9.5 10v7M14.5 10v7M18.5 10v7M4 19h16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><rect x="4" y="7.5" width="16" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="16" cy="13" r="1.3" fill="currentColor" /></>,
  cash: <><rect x="3" y="6.5" width="18" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  later: <><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
}

function RadioCards({ props, field, busy }: RenderProps<RadioCardsProps>) {
  const f = field!
  const options = Array.isArray(props.options) ? props.options : []
  const legendId = `${f.id}-legend`
  const hintId = props.hint ? `${f.id}-hint` : undefined
  return (
    <fieldset className={cx('pl-fieldset', f.error && 'is-invalid')} aria-describedby={[hintId, f.error ? f.errorId : null].filter(Boolean).join(' ') || undefined}>
      <legend id={legendId} className="pl-label">
        {str(props.label)}
        {!f.required && <span className="pl-optional"> (optional)</span>}
      </legend>
      {props.hint && <p className="pl-hint" id={hintId}>{str(props.hint)}</p>}
      <div className="pl-radio-cards" data-columns={numOr(props.columns, 1)}>
        {options.map((o, i) => {
          const id = i === 0 ? f.id : `${f.id}-${i}`
          const checked = f.value === o.value
          const nameId = `${id}-name`
          // Name = the option label only; badge and description are read as its description.
          const descIds = [o.badge ? `${id}-badge` : null, o.description ? `${id}-desc` : null].filter(Boolean).join(' ') || undefined
          return (
            <label key={o.value} className={cx('pl-radio-card', checked && 'is-checked', o.disabled && 'is-disabled')} htmlFor={id}>
              <input
                id={id}
                type="radio"
                className="pl-radio-input"
                name={f.name}
                value={o.value}
                checked={checked}
                disabled={o.disabled || busy}
                onChange={() => f.setValue(o.value)}
                onBlur={f.onBlur}
                aria-labelledby={nameId}
                aria-describedby={descIds}
                aria-invalid={f.error ? true : undefined}
              />
              <span className="pl-radio-dot" aria-hidden="true" />
              {o.icon && ICONS[o.icon] && (
                <svg className="pl-radio-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{ICONS[o.icon]}</svg>
              )}
              <span className="pl-radio-text">
                <span className="pl-radio-label">
                  <span id={nameId}>{o.label}</span>
                  {o.badge && <span className="pl-badge" data-tone="success" id={`${id}-badge`}>{o.badge}</span>}
                </span>
                {o.description && <span className="pl-radio-desc" id={`${id}-desc`}>{o.description}</span>}
              </span>
            </label>
          )
        })}
      </div>
      {f.error && <p className="pl-error" id={f.errorId}><ErrorIcon /><span>{f.error}</span></p>}
    </fieldset>
  )
}
export const RadioCardsDef: ComponentDef<RadioCardsProps> = {
  type: 'RadioCards',
  category: 'Input',
  description: 'Large selectable cards over native radio inputs inside a fieldset/legend: arrow keys move the selection, exactly as screen reader users expect.',
  component: RadioCards,
  bindable: 'string',
  props: {
    label: { type: 'string', required: true, description: 'Group label (rendered as the legend).' },
    hint: { type: 'string', description: 'Help text for the group.' },
    options: { type: 'array', required: true, itemKeys: ['value', 'label'], description: 'Options of { value, label, description?, badge?, icon?, disabled? }. Icons: upi, card, bank, wallet, cash, later.' },
    columns: { type: 'number', default: 1, description: 'Columns on wide screens (always 1 on phones).' },
  },
  example: {
    type: 'RadioCards', bind: 'method',
    props: {
      label: 'Payment method',
      options: [
        { value: 'upi', label: 'UPI', description: 'Pay from any UPI app', badge: 'Fastest', icon: 'upi' },
        { value: 'card', label: 'Credit or debit card', description: 'Visa, Mastercard, RuPay, Amex', icon: 'card' },
        { value: 'netbanking', label: 'Netbanking', description: 'All major Indian banks', icon: 'bank' },
      ],
    },
    rules: [{ type: 'required', message: 'Choose a payment method' }],
  },
  exampleState: { method: 'upi' },
}

// ---- Checkbox -------------------------------------------------------------------

type CheckboxProps = { label: string; hint?: string }
function Checkbox({ props, field, busy }: RenderProps<CheckboxProps>) {
  const f = field!
  const hintId = props.hint ? `${f.id}-hint` : undefined
  return (
    <div className={cx('pl-check', f.error && 'is-invalid')}>
      <input
        id={f.id}
        name={f.name}
        type="checkbox"
        className="pl-check-input"
        checked={f.value === true}
        onChange={(e) => f.setValue(e.target.checked)}
        onBlur={f.onBlur}
        disabled={busy}
        aria-invalid={f.error ? true : undefined}
        aria-describedby={[hintId, f.error ? f.errorId : null].filter(Boolean).join(' ') || undefined}
      />
      <div>
        <label htmlFor={f.id} className="pl-check-label">{str(props.label)}</label>
        {props.hint && <p className="pl-hint" id={hintId}>{str(props.hint)}</p>}
        {f.error && <p className="pl-error" id={f.errorId}><ErrorIcon /><span>{f.error}</span></p>}
      </div>
    </div>
  )
}
export const CheckboxDef: ComponentDef<CheckboxProps> = {
  type: 'Checkbox',
  category: 'Input',
  description: 'A single boolean choice. Use a "required" rule for consent checkboxes.',
  component: Checkbox,
  bindable: 'boolean',
  props: {
    label: { type: 'string', required: true, description: 'Label.' },
    hint: { type: 'string', description: 'Help text.' },
  },
  example: { type: 'Checkbox', bind: 'saveCard', props: { label: 'Save this card for faster checkout', hint: 'Stored as a secure token as per RBI guidelines.' } },
  exampleState: { saveCard: true },
}

// ---- OtpField -------------------------------------------------------------------

type OtpProps = { label: string; hint?: string; length?: number }
function OtpField({ props, field, busy }: RenderProps<OtpProps>) {
  const f = field!
  const n = Math.min(8, Math.max(4, numOr(props.length, 6)))
  const value = str(f.value).replace(/\D/g, '').slice(0, n)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const groupRef = useRef<HTMLDivElement>(null)
  const labelId = `${f.id}-label`
  const hintId = props.hint ? `${f.id}-hint` : undefined

  const write = (start: number, digits: string) => {
    const chars = value.padEnd(n, ' ').split('')
    let i = start
    for (const d of digits) { if (i >= n) break; chars[i++] = d }
    f.setValue(chars.join('').replace(/\s+$/, '').replace(/\s/g, ''))
    refs.current[Math.min(i, n - 1)]?.focus()
  }

  const onChange = (i: number, e: ChangeEvent<HTMLInputElement>) => {
    let digits = e.target.value.replace(/\D/g, '')
    if (!digits) return
    // Typing over a filled box appends to it ("3" + "7"): keep only the new digit.
    // Several digits at once come from SMS autofill and are spread across boxes.
    if (digits.length === 2 && value[i] && digits.startsWith(value[i]!)) digits = digits.slice(1)
    write(i, digits)
  }
  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '')
    if (!digits) return
    e.preventDefault()
    write(digits.length >= n ? 0 : i, digits)
  }
  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const chars = value.split('')
      if (chars[i]) { chars.splice(i, 1); f.setValue(chars.join('')) }
      else if (i > 0) { chars.splice(i - 1, 1); f.setValue(chars.join('')); refs.current[i - 1]?.focus() }
    } else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); refs.current[i - 1]?.focus() }
    else if (e.key === 'ArrowRight' && i < n - 1) { e.preventDefault(); refs.current[i + 1]?.focus() }
  }

  return (
    <div className={cx('pl-field', f.error && 'is-invalid')}>
      <span className="pl-label" id={labelId}>{str(props.label)}</span>
      {props.hint && <p className="pl-hint" id={hintId}>{str(props.hint)}</p>}
      <div
        ref={groupRef}
        className="pl-otp"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={[hintId, f.error ? f.errorId : null].filter(Boolean).join(' ') || undefined}
        onBlur={(e) => { if (!groupRef.current?.contains(e.relatedTarget as Node)) f.onBlur() }}
      >
        {Array.from({ length: n }, (_, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el }}
            id={i === 0 ? f.id : `${f.id}-${i}`}
            name={i === 0 ? f.name : undefined}
            className="pl-otp-box"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={i === 0 ? n : 1}
            value={value[i] ?? ''}
            onChange={(e) => onChange(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => e.target.select()}
            readOnly={busy}
            aria-label={`Digit ${i + 1} of ${n}`}
            aria-invalid={f.error ? true : undefined}
          />
        ))}
      </div>
      {f.error && <p className="pl-error" id={f.errorId}><ErrorIcon /><span>{f.error}</span></p>}
    </div>
  )
}
export const OtpFieldDef: ComponentDef<OtpProps> = {
  type: 'OtpField',
  category: 'Input',
  description: 'One-time code entry: auto-advance, backspace to previous box, paste or SMS autofill fills every box, each box labelled "Digit 2 of 6".',
  component: OtpField,
  bindable: 'string',
  props: {
    label: { type: 'string', required: true, description: 'Group label.' },
    hint: { type: 'string', description: 'Where the code was sent.' },
    length: { type: 'number', default: 6, description: 'Number of digits (4-8).' },
  },
  example: { type: 'OtpField', bind: 'otp', props: { label: 'Enter the 6-digit code', hint: 'Sent to +91 98•••••062' }, rules: [{ type: 'required' }, { type: 'otp', value: 6 }] },
  exampleState: { otp: '' },
}
