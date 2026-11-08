import { useMemo } from 'react'
import { defaultRegistry } from '../components'
import { pageById } from '../pages'
import { DeviceFrame, useEventLog } from './Preview'
import { Code } from './shared'
import { TEST_COUNT } from './stats'

const SNIPPET = `{
  "type": "Button",
  "props": { "label": "Pay {{ total | inr }}" },
  "action": {
    "type": "submit",
    "endpoint": "payments/create",
    "payload": ["method", "upi", "card"],
    "onSuccess": { "type": "set", "path": "step", "value": "done" }
  }
}`

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Correct under failure',
    body: 'Submits cannot double-fire. Every request carries an idempotency key, and a retry of the same payload reuses it, so a flaky network never charges twice. Requests time out into a retryable error, and each component sits in its own error boundary.',
  },
  {
    title: 'Fast by construction',
    body: 'Each node subscribes only to the state paths its expressions read. Typing in the UPI field re-renders that field and nothing else. Turn on “Show re-renders” in the gallery to watch it.',
  },
  {
    title: 'Accessible, and tested for it',
    body: 'Native radios in fieldsets, labelled OTP boxes, focus moved to the first invalid field and to the payment result, an error summary with links. axe-core runs on every component and page state in CI; token contrast is checked to WCAG AA.',
  },
  {
    title: 'Safe, validated configs',
    body: 'Conditions and templates use a small expression language with its own Pratt parser: no eval, no prototype access. A validator checks every config against the registry and reports errors by path, with “did you mean” hints.',
  },
  {
    title: 'Open for extension',
    body: 'The renderer knows nothing about specific components. Teams register their own with a typed prop spec, and the validator, docs and playground pick them up automatically.',
  },
  {
    title: 'Themeable per page',
    body: 'Components read only --pl-* design tokens. A page can set its brand accent, radius and density; text on the accent is chosen for contrast, and dark mode lightens the brand colour to stay readable.',
  },
]

export function Home() {
  const checkout = pageById('checkout')!
  const page = useMemo(() => structuredClone(checkout.page), [checkout])
  const log = useEventLog(false)
  const count = defaultRegistry.list().length

  return (
    <div className="home">
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow">Schema-driven UI for payment pages</p>
          <h1>Ship a checkout by shipping <em>a config.</em></h1>
          <p className="lede">
            Payloom renders payment flows from JSON. A validator checks each config against a registry of
            {' '}{count} accessible React components, and a small runtime handles state, validation, retries and
            idempotent submits. A new payment page needs a config, not a new codebase.
          </p>
          <div className="cta">
            <a className="btn-primary" href="#/pages/checkout">See the sample pages</a>
            <a className="btn-ghost" href="#/playground/checkout">Open the playground</a>
          </div>
          <dl className="stats">
            <div><dt>Components</dt><dd>{count}</dd></div>
            <div><dt>Tests</dt><dd>{TEST_COUNT}</dd></div>
            <div><dt>axe violations</dt><dd>0</dd></div>
            <div><dt>Runtime deps</dt><dd>React</dd></div>
          </dl>
        </div>
        <div className="hero-demo" aria-label="Live checkout rendered from checkout.json">
          <DeviceFrame page={page} mode="light" width="phone" debug={false} api={log.api} onEvent={log.onEvent} label="checkout.json" />
        </div>
      </section>

      <section className="wrap how" aria-labelledby="how-h">
        <h2 id="how-h">How a page renders</h2>
        <ol className="flow">
          <li><b>Config</b><span>JSON: state, layout tree, rules, actions</span></li>
          <li><b>Validate</b><span>Schema, props, rules and expressions checked by path</span></li>
          <li><b>Render</b><span>Registry lookup, per-node boundaries and subscriptions</span></li>
          <li><b>Run</b><span>Field rules, idempotent submit, timeouts, result into state</span></li>
        </ol>
        <div className="how-grid">
          <div>
            <h3>A submit button, declared</h3>
            <p>Labels are templates over page state. The action says what to send and what to do with the result; the engine owns the hard parts: validation, double-submit protection, idempotency keys, timeouts and error states.</p>
          </div>
          <Code code={SNIPPET} label="Example button config" />
        </div>
      </section>

      <section className="wrap features" aria-labelledby="feat-h">
        <h2 id="feat-h">What the platform guarantees</h2>
        <ul>
          {FEATURES.map((f) => (
            <li key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
