/**
 * Accessibility gate: axe-core runs against every registered component's
 * example and every sample page in several states (initial, errors shown,
 * each payment method, success). Any violation fails CI.
 * Colour contrast is checked separately in tokens.test.ts because jsdom
 * does not compute styles.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { ALL_COMPONENTS, defaultRegistry } from '../components'
import { PageRenderer } from '../engine/Renderer'
import type { PageRuntime } from '../engine/runtime'
import type { PageSchema, UINode } from '../engine/schema'
import { SAMPLE_PAGES } from '../pages'

async function violations(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false }, // needs a real layout engine; see tokens.test.ts
      region: { enabled: false }, // fragments are tested outside a full page shell
    },
  })
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.html).join('\n  ')}`)
}

function renderPage(page: PageSchema, api = async () => ({ reference: 'PL-A11Y' })) {
  let runtime!: PageRuntime
  const utils = render(<PageRenderer page={page} registry={defaultRegistry} api={api} now={() => new Date(2026, 10, 8)} runtimeRef={(r) => { runtime = r }} />)
  return { ...utils, runtime: () => runtime }
}

const clone = (id: string) => structuredClone(SAMPLE_PAGES.find((p) => p.id === id)!.page)

describe('axe: every component example', () => {
  it.each(ALL_COMPONENTS.map((d) => [d.type, d] as const))('%s has no violations', async (_t, def) => {
    const body = (Array.isArray(def.example) ? def.example : [def.example]) as UINode[]
    const page: PageSchema = { version: 1, id: 'example', title: `${def.type} example`, state: (def.exampleState ?? {}) as PageSchema['state'], body }
    const { container } = renderPage(page)
    expect(await violations(container)).toEqual([])
  })

  it.each(ALL_COMPONENTS.filter((d) => d.bindable).map((d) => [d.type, d] as const))('%s has no violations while showing an error', async (_t, def) => {
    const node = { ...(Array.isArray(def.example) ? def.example[0]! : def.example), rules: [{ type: 'required' as const, message: 'This is required' }] }
    const page: PageSchema = { version: 1, id: 'example', title: 'Error state', state: {}, body: [node, { type: 'ErrorSummary' }, { type: 'Button', props: { label: 'Submit' }, action: { type: 'submit', endpoint: 'x' } }] }
    const { container } = renderPage(page)
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(container.querySelector('[aria-invalid="true"]')).not.toBeNull()
    expect(await violations(container)).toEqual([])
  })
})

describe('axe: sample pages', () => {
  it.each(SAMPLE_PAGES.map((p) => [p.id] as const))('%s: initial state', async (id) => {
    const { container } = renderPage(clone(id))
    expect(await violations(container)).toEqual([])
  })

  it.each(SAMPLE_PAGES.map((p) => [p.id] as const))('%s: after a failed submit', async (id) => {
    const { container } = renderPage(clone(id))
    const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
    await userEvent.click(submit)
    expect(await violations(container)).toEqual([])
  })

  it.each(['card', 'netbanking'])('checkout: %s method', async (method) => {
    const { container, runtime } = renderPage(clone('checkout'))
    act(() => runtime().setValue('method', method))
    await userEvent.click(container.querySelector<HTMLButtonElement>('button[type="submit"]')!)
    expect(await violations(container)).toEqual([])
  })

  it('checkout: success screen', async () => {
    const { container, runtime } = renderPage(clone('checkout'))
    act(() => runtime().setValue('upi', 'riya@okicici'))
    await act(() => runtime().runAction({ type: 'submit', endpoint: 'payments/create', onSuccess: { type: 'set', path: 'step', value: 'done' } }))
    expect(screen.getByRole('status', { name: /paid to Bluebird Books/ })).toBeInTheDocument()
    expect(await violations(container)).toEqual([])
  })

  it('bill-pay: review step', async () => {
    const { container, runtime } = renderPage(clone('bill-pay'))
    act(() => {
      runtime().store.set('bill', { name: 'R. Sharma', amount: 1847.5, units: 214, period: 'October 2026', due: '18 Nov 2026', overdue: true })
      runtime().store.set('step', 'review')
    })
    expect(await violations(container)).toEqual([])
  })
})
