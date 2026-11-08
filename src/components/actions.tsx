import { useEffect, useState } from 'react'
import type { ComponentDef, RenderProps } from '../engine/registry'
import { fieldId, useRuntime } from '../engine/Renderer'
import { cx, ErrorIcon, numOr, Spinner, str } from './shared'

// ---- Button ---------------------------------------------------------------------

type ButtonProps = { label: string; variant?: string; fullWidth?: boolean; loadingLabel?: string; disabled?: boolean }
function Button({ props, node, run, busy }: RenderProps<ButtonProps>) {
  const action = node.action && !Array.isArray(node.action) ? node.action : undefined
  const isSubmit = action?.type === 'submit'
  const loading = isSubmit && busy
  // aria-disabled (not disabled) keeps the button focusable, so focus is not
  // thrown back to <body> mid-payment and screen readers can still find it.
  const inactive = loading || props.disabled === true || (busy && isSubmit)
  return (
    <button
      type={isSubmit ? 'submit' : 'button'}
      className={cx('pl-button', props.fullWidth && 'is-full')}
      data-variant={props.variant ?? 'primary'}
      aria-disabled={inactive || undefined}
      aria-busy={loading || undefined}
      onClick={(e) => {
        e.preventDefault()
        if (inactive) return
        run?.()
      }}
    >
      {loading && <Spinner />}
      <span>{loading ? str(props.loadingLabel, 'Processing…') : str(props.label)}</span>
    </button>
  )
}
export const ButtonDef: ComponentDef<ButtonProps> = {
  type: 'Button',
  category: 'Action',
  description: 'Runs an action. Submit buttons show a spinner and stay focusable (aria-disabled) while the request is in flight; repeat clicks are ignored by the engine.',
  component: Button,
  actionable: true,
  props: {
    label: { type: 'string', required: true, description: 'Button text. Supports {{ templates }}, e.g. "Pay {{ total | inr }}".' },
    variant: { type: 'enum', values: ['primary', 'secondary', 'ghost', 'danger'], default: 'primary', description: 'Visual emphasis.' },
    fullWidth: { type: 'boolean', default: false, description: 'Stretch to the container width.' },
    loadingLabel: { type: 'string', default: 'Processing…', description: 'Text while a submit is in flight.' },
    disabled: { type: 'boolean', default: false, description: 'Accepts a {{ template }} such as "{{ !agree }}".' },
  },
  example: { type: 'Button', props: { label: 'Pay ₹2,109', fullWidth: true }, action: { type: 'emit', event: 'pay' } },
}

// ---- ResendTimer ----------------------------------------------------------------

type ResendProps = { seconds?: number; label?: string }
function ResendTimer({ props, run, busy }: RenderProps<ResendProps>) {
  const total = Math.max(1, numOr(props.seconds, 30))
  const [left, setLeft] = useState(total)
  const [round, setRound] = useState(0)
  useEffect(() => {
    setLeft(total)
    const t = setInterval(() => setLeft((s) => (s <= 1 ? (clearInterval(t), 0) : s - 1)), 1000)
    return () => clearInterval(t)
  }, [total, round])
  const ready = left === 0
  return (
    <div className="pl-resend">
      {ready ? (
        <button type="button" className="pl-link" aria-disabled={busy || undefined} onClick={() => { if (busy) return; run?.(); setRound((r) => r + 1) }}>
          {str(props.label, 'Resend code')}
        </button>
      ) : (
        <p className="pl-text" data-tone="muted" data-size="sm">
          {str(props.label, 'Resend code')} in <span className="is-mono">0:{String(left).padStart(2, '0')}</span>
        </p>
      )}
      {/* Announce once when it becomes available, not every second. */}
      <span className="pl-sr-only" aria-live="polite">{ready ? 'You can now request a new code' : ''}</span>
    </div>
  )
}
export const ResendTimerDef: ComponentDef<ResendProps> = {
  type: 'ResendTimer',
  category: 'Action',
  description: 'Countdown that turns into a "Resend code" link. Announces once when ready instead of every second.',
  component: ResendTimer,
  actionable: true,
  props: {
    seconds: { type: 'number', default: 30, description: 'Wait before a resend is allowed.' },
    label: { type: 'string', default: 'Resend code', description: 'Link text.' },
  },
  example: { type: 'ResendTimer', props: { seconds: 30 }, action: { type: 'emit', event: 'resend' } },
}

// ---- ErrorSummary ---------------------------------------------------------------

type SummaryProps = { title?: string }
function ErrorSummary({ props }: RenderProps<SummaryProps>) {
  const runtime = useRuntime()
  const state = runtime.store.getState() as { $form?: { submitCount?: number } }
  const errors = runtime.errorList()
  if (!state.$form?.submitCount || errors.length === 0) return null
  return (
    <div className="pl-error-summary" role="alert">
      <p className="pl-error-summary-title"><ErrorIcon /> {str(props.title, `Fix ${errors.length} ${errors.length === 1 ? 'problem' : 'problems'} to continue`)}</p>
      <ul>
        {errors.map((e) => (
          <li key={e.path}>
            <a
              href={`#${fieldId(runtime.page.id, e.path)}`}
              onClick={(ev) => { ev.preventDefault(); runtime.focusField(e.path) }}
            >
              {e.label}: {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
export const ErrorSummaryDef: ComponentDef<SummaryProps> = {
  type: 'ErrorSummary',
  category: 'Feedback',
  description: 'After a failed submit, lists every problem with a link that moves focus to the field (the GOV.UK pattern). Hidden until then.',
  component: ErrorSummary,
  reads: ['$errors', '$form.submitCount'],
  props: { title: { type: 'string', description: 'Heading; defaults to "Fix N problems to continue".' } },
  example: { type: 'ErrorSummary', props: {} },
}

// ---- Steps ----------------------------------------------------------------------

type StepsProps = { steps: string[]; current: number; label?: string }
function Steps({ props }: RenderProps<StepsProps>) {
  const steps = Array.isArray(props.steps) ? props.steps.map(String) : []
  const current = Math.max(0, Math.min(steps.length - 1, numOr(props.current, 0)))
  return (
    <nav aria-label={str(props.label, 'Progress')}>
      <ol className="pl-steps">
        {steps.map((s, i) => (
          <li key={i} className={cx('pl-step', i < current && 'is-done', i === current && 'is-current')} aria-current={i === current ? 'step' : undefined}>
            <span className="pl-step-dot" aria-hidden="true">{i < current ? '✓' : i + 1}</span>
            <span className="pl-step-label">{s}{i < current && <span className="pl-sr-only"> (completed)</span>}</span>
          </li>
        ))}
      </ol>
    </nav>
  )
}
export const StepsDef: ComponentDef<StepsProps> = {
  type: 'Steps',
  category: 'Feedback',
  description: 'Progress through a multi-step flow, with aria-current="step" on the active step.',
  component: Steps,
  props: {
    steps: { type: 'array', required: true, description: 'Step labels.' },
    current: { type: 'number', required: true, description: 'Zero-based index of the active step. Usually a {{ template }}.' },
    label: { type: 'string', default: 'Progress', description: 'Accessible name of the navigation landmark.' },
  },
  example: { type: 'Steps', props: { steps: ['Details', 'Review', 'Pay'], current: 1 } },
}
