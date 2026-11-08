import type { ComponentDef, RenderProps } from '../engine/registry'
import { ErrorIcon, numOr, str } from './shared'

type HeadingProps = { text: string; level?: number; align?: string }
function Heading({ props }: RenderProps<HeadingProps>) {
  const level = Math.min(4, Math.max(1, numOr(props.level, 2)))
  const H = `h${level}` as 'h1'
  return <H className={`pl-heading pl-h${level}`} data-align={props.align ?? 'start'}>{str(props.text)}</H>
}
export const HeadingDef: ComponentDef<HeadingProps> = {
  type: 'Heading',
  category: 'Content',
  description: 'A section heading. Levels are explicit so every page has a correct outline.',
  component: Heading,
  props: {
    text: { type: 'string', required: true, description: 'Heading text. Supports {{ templates }}.' },
    level: { type: 'number', default: 2, description: '1-4. Use one level 1 per page.' },
    align: { type: 'enum', values: ['start', 'center'], default: 'start', description: 'Text alignment.' },
  },
  example: { type: 'Heading', props: { text: 'Choose a payment method', level: 2 } },
}

type TextProps = { text: string; tone?: string; size?: string; align?: string; weight?: string }
function Text({ props }: RenderProps<TextProps>) {
  return (
    <p className="pl-text" data-tone={props.tone ?? 'default'} data-size={props.size ?? 'md'} data-align={props.align ?? 'start'} data-weight={props.weight ?? 'regular'}>
      {str(props.text)}
    </p>
  )
}
export const TextDef: ComponentDef<TextProps> = {
  type: 'Text',
  category: 'Content',
  description: 'Body copy with semantic tones. Supports {{ templates }} and formatters such as | inr.',
  component: Text,
  props: {
    text: { type: 'string', required: true, description: 'The text.' },
    tone: { type: 'enum', values: ['default', 'muted', 'success', 'danger'], default: 'default', description: 'Colour role.' },
    size: { type: 'enum', values: ['sm', 'md', 'lg'], default: 'md', description: 'Type scale step.' },
    weight: { type: 'enum', values: ['regular', 'medium', 'bold'], default: 'regular', description: 'Font weight.' },
    align: { type: 'enum', values: ['start', 'center'], default: 'start', description: 'Alignment.' },
  },
  example: { type: 'Text', props: { text: 'You will be redirected to your bank to approve this payment.', tone: 'muted' } },
}

type BadgeProps = { text: string; tone?: string }
function Badge({ props }: RenderProps<BadgeProps>) {
  return <span className="pl-badge" data-tone={props.tone ?? 'neutral'}>{str(props.text)}</span>
}
export const BadgeDef: ComponentDef<BadgeProps> = {
  type: 'Badge',
  category: 'Content',
  description: 'A short status or label chip.',
  component: Badge,
  props: {
    text: { type: 'string', required: true, description: 'Label.' },
    tone: { type: 'enum', values: ['neutral', 'accent', 'success', 'warning', 'danger'], default: 'neutral', description: 'Colour role.' },
  },
  example: { type: 'Badge', props: { text: 'Recommended', tone: 'success' } },
}

type AlertProps = { tone?: string; title?: string; text: string }
function Alert({ props }: RenderProps<AlertProps>) {
  const tone = props.tone ?? 'info'
  // Errors interrupt (role=alert); everything else is announced politely.
  const urgent = tone === 'danger' || tone === 'warning'
  return (
    <div className="pl-alert" data-tone={tone} role={urgent ? 'alert' : 'status'}>
      <AlertIcon tone={tone} />
      <div>
        {props.title && <p className="pl-alert-title">{str(props.title)}</p>}
        <p className="pl-alert-text">{str(props.text)}</p>
      </div>
    </div>
  )
}
function AlertIcon({ tone }: { tone: string }) {
  if (tone === 'danger' || tone === 'warning') return <ErrorIcon />
  return (
    <svg className="pl-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {tone === 'success'
        ? <path d="M6.5 10.25l2.4 2.4 4.6-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        : <><path d="M10 9v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /><circle cx="10" cy="6.25" r="1.1" fill="currentColor" /></>}
    </svg>
  )
}
export const AlertDef: ComponentDef<AlertProps> = {
  type: 'Alert',
  category: 'Feedback',
  description: 'Inline message. Danger and warning use role="alert" so screen readers announce them immediately.',
  component: Alert,
  props: {
    tone: { type: 'enum', values: ['info', 'success', 'warning', 'danger'], default: 'info', description: 'Severity.' },
    title: { type: 'string', description: 'Bold first line.' },
    text: { type: 'string', required: true, description: 'Message.' },
  },
  example: { type: 'Alert', props: { tone: 'info', title: 'UPI is fastest', text: 'Approve the request in your UPI app within 5 minutes.' } },
}

type KeyValueProps = { items: { label: string; value: string }[] }
function KeyValue({ props }: RenderProps<KeyValueProps>) {
  const items = Array.isArray(props.items) ? props.items : []
  return (
    <dl className="pl-kv">
      {items.map((it, i) => (
        <div key={i} className="pl-kv-row">
          <dt>{str(it.label)}</dt>
          <dd>{str(it.value)}</dd>
        </div>
      ))}
    </dl>
  )
}
export const KeyValueDef: ComponentDef<KeyValueProps> = {
  type: 'KeyValue',
  category: 'Content',
  description: 'Label/value pairs rendered as a description list (transaction details, bill details).',
  component: KeyValue,
  props: { items: { type: 'array', required: true, itemKeys: ['label', 'value'], description: 'Rows of { label, value }. Values support templates.' } },
  example: { type: 'KeyValue', props: { items: [{ label: 'Transaction ID', value: 'PL2611080042' }, { label: 'Paid via', value: 'UPI' }] } },
}

type MerchantProps = { name: string; subtitle?: string; verified?: boolean }
function Merchant({ props }: RenderProps<MerchantProps>) {
  const name = str(props.name)
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  return (
    <div className="pl-merchant">
      <span className="pl-avatar" aria-hidden="true">{initials}</span>
      <div>
        <p className="pl-merchant-name">
          {name}
          {props.verified && (
            <span className="pl-verified">
              <svg className="pl-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M10 1.8l2.1 1.6 2.6-.2.8 2.5 2.2 1.4-.8 2.5.8 2.5-2.2 1.4-.8 2.5-2.6-.2L10 18.2l-2.1-1.6-2.6.2-.8-2.5-2.2-1.4.8-2.5-.8-2.5 2.2-1.4.8-2.5 2.6.2z" fill="currentColor" /><path d="M6.8 10.2l2.2 2.2 4.2-4.6" fill="none" stroke="var(--pl-on-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span className="pl-sr-only">Verified merchant</span>
            </span>
          )}
        </p>
        {props.subtitle && <p className="pl-merchant-sub">{str(props.subtitle)}</p>}
      </div>
    </div>
  )
}
export const MerchantDef: ComponentDef<MerchantProps> = {
  type: 'Merchant',
  category: 'Payment',
  description: 'Who the customer is paying, with a generated monogram and optional verified mark.',
  component: Merchant,
  props: {
    name: { type: 'string', required: true, description: 'Merchant display name.' },
    subtitle: { type: 'string', description: 'Order reference or category.' },
    verified: { type: 'boolean', default: false, description: 'Show the verified mark.' },
  },
  example: { type: 'Merchant', props: { name: 'Bluebird Books', subtitle: 'Order #BB-20419', verified: true } },
}

