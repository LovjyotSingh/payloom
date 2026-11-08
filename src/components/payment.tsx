import { useEffect, useId, useRef } from 'react'
import type { ComponentDef, RenderProps } from '../engine/registry'
import { inr, inrSpoken } from '../engine/format'
import { numOr, str } from './shared'

type Line = { label: string; amount: number; note?: string }
type OrderSummaryProps = { title?: string; items: Line[]; total?: number; totalLabel?: string }
function OrderSummary({ props }: RenderProps<OrderSummaryProps>) {
  const items = Array.isArray(props.items) ? props.items : []
  const total = props.total ?? items.reduce((s, it) => s + numOr(it.amount, 0), 0)
  return (
    <table className="pl-summary">
      <caption className="pl-summary-cap">{str(props.title, 'Order summary')}</caption>
      <tbody>
        {items.map((it, i) => {
          const amt = numOr(it.amount, 0)
          return (
            <tr key={i}>
              <th scope="row">
                {str(it.label)}
                {it.note && <span className="pl-summary-note">{str(it.note)}</span>}
              </th>
              <td data-negative={amt < 0 || undefined}>{inr(amt)}</td>
            </tr>
          )
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">{str(props.totalLabel, 'Total')}</th>
          <td>{inr(total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
export const OrderSummaryDef: ComponentDef<OrderSummaryProps> = {
  type: 'OrderSummary',
  category: 'Payment',
  description: 'Line items and total as a real table, so screen readers announce each label with its amount.',
  component: OrderSummary,
  props: {
    title: { type: 'string', default: 'Order summary', description: 'Table caption.' },
    items: { type: 'array', required: true, itemKeys: ['label', 'amount'], description: 'Rows of { label, amount, note? }. Negative amounts render as discounts.' },
    total: { type: 'number', description: 'Total; defaults to the sum of items. Accepts a {{ template }}.' },
    totalLabel: { type: 'string', default: 'Total', description: 'Label for the total row.' },
  },
  example: {
    type: 'OrderSummary',
    props: { items: [{ label: 'The Pragmatic Programmer', amount: 2299 }, { label: 'Delivery', amount: 40 }, { label: 'Coupon READ10', amount: -230 }] },
  },
}

type AmountProps = { value: number; label?: string; size?: string }
function Amount({ props }: RenderProps<AmountProps>) {
  const v = numOr(props.value, 0)
  return (
    <div className="pl-amount" data-size={props.size ?? 'lg'}>
      {props.label && <p className="pl-amount-label">{str(props.label)}</p>}
      <p className="pl-amount-value">
        <span className="pl-sr-only">{inrSpoken(v)}</span>
        <span aria-hidden="true">{inr(v)}</span>
      </p>
    </div>
  )
}
export const AmountDef: ComponentDef<AmountProps> = {
  type: 'Amount',
  category: 'Payment',
  description: 'A prominent rupee amount with Indian digit grouping (₹1,23,456) and a spoken label for screen readers.',
  component: Amount,
  props: {
    value: { type: 'number', required: true, description: 'Amount in rupees. Accepts a {{ template }}.' },
    label: { type: 'string', description: 'Caption above the amount.' },
    size: { type: 'enum', values: ['md', 'lg', 'xl'], default: 'lg', description: 'Display size.' },
  },
  example: { type: 'Amount', props: { label: 'Amount to pay', value: 123456.5 } },
}

type StatusProps = { status: string; title: string; text?: string; reference?: string; autoFocus?: boolean }
function PaymentStatus({ props }: RenderProps<StatusProps>) {
  const id = useId()
  const ref = useRef<HTMLHeadingElement>(null)
  // When the result appears, move focus to it so keyboard and screen reader
  // users land on the outcome instead of a button that no longer exists.
  useEffect(() => { if (props.autoFocus !== false) ref.current?.focus() }, [props.status, props.autoFocus])
  const status = props.status === 'success' || props.status === 'failure' ? props.status : 'pending'
  return (
    <div className="pl-status" data-status={status} role="status" aria-labelledby={id}>
      <StatusIcon status={status} />
      <h2 id={id} ref={ref} tabIndex={-1} className="pl-status-title">{str(props.title)}</h2>
      {props.text && <p className="pl-status-text">{str(props.text)}</p>}
      {props.reference && <p className="pl-status-ref">Reference: <span>{str(props.reference)}</span></p>}
    </div>
  )
}
function StatusIcon({ status }: { status: string }) {
  return (
    <svg className="pl-status-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22" fill="currentColor" opacity=".14" />
      <circle cx="24" cy="24" r="15" fill="currentColor" />
      {status === 'success' && <path d="M17.5 24.5l4.5 4.5 9-10" fill="none" stroke="var(--pl-surface)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {status === 'failure' && <path d="M19 19l10 10M29 19L19 29" fill="none" stroke="var(--pl-surface)" strokeWidth="3" strokeLinecap="round" />}
      {status === 'pending' && <path d="M24 17v8l5 3" fill="none" stroke="var(--pl-surface)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}
export const PaymentStatusDef: ComponentDef<StatusProps> = {
  type: 'PaymentStatus',
  category: 'Payment',
  description: 'Outcome screen for a payment. Moves keyboard focus to its heading when it appears.',
  component: PaymentStatus,
  props: {
    status: { type: 'enum', values: ['success', 'failure', 'pending'], required: true, description: 'Outcome.' },
    title: { type: 'string', required: true, description: 'Headline, e.g. "₹2,109 paid".' },
    text: { type: 'string', description: 'Supporting text.' },
    reference: { type: 'string', description: 'Transaction reference shown for support.' },
    autoFocus: { type: 'boolean', default: true, description: 'Move focus to the heading when shown.' },
  },
  example: { type: 'PaymentStatus', props: { status: 'success', title: '₹2,109 paid to Bluebird Books', text: 'A receipt is on its way to your email.', reference: 'PL2611080042', autoFocus: false } },
}
