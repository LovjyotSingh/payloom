import type { ReactNode } from 'react'
import type { FieldApi } from '../engine/registry'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export const str = (v: unknown, d = '') => (v === undefined || v === null ? d : String(v))
export const numOr = (v: unknown, d: number) => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : d
}

/** ids to put in aria-describedby for a field (hint first, then error). */
export function describedBy(field: FieldApi, hint?: string): string | undefined {
  const ids = [hint ? `${field.id}-hint` : null, field.error ? field.errorId : null].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

export function ErrorIcon() {
  return (
    <svg className="pl-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 5.5v5.25" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="10" cy="13.75" r="1.1" fill="currentColor" />
    </svg>
  )
}

/** Label + hint + control + error, wired for screen readers. */
export function FieldShell(p: {
  field: FieldApi
  label: string
  hint?: string
  children: ReactNode
  /** Render the label as a <legend>-less span (for grouped controls that label themselves). */
  as?: 'label' | 'span'
  aside?: ReactNode
}) {
  const { field, label, hint } = p
  const LabelTag = p.as === 'span' ? 'span' : 'label'
  return (
    <div className={cx('pl-field', field.error && 'is-invalid')}>
      <div className="pl-label-row">
        <LabelTag className="pl-label" {...(LabelTag === 'label' ? { htmlFor: field.id } : { id: `${field.id}-label` })}>
          {label}
          {!field.required && <span className="pl-optional"> (optional)</span>}
        </LabelTag>
        {p.aside}
      </div>
      {hint && <p className="pl-hint" id={`${field.id}-hint`}>{hint}</p>}
      {p.children}
      {field.error && (
        <p className="pl-error" id={field.errorId}>
          <ErrorIcon />
          <span>{field.error}</span>
        </p>
      )}
    </div>
  )
}

export function Spinner() {
  return (
    <svg className="pl-spinner" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Visually hidden but read by screen readers. */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span className="pl-sr-only">{children}</span>
}
