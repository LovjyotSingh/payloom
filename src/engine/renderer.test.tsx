import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultRegistry, defaultRegistry } from '../components'
import { pageById } from '../pages'
import { PageRenderer } from './Renderer'
import type { ComponentDef } from './registry'
import { ApiError, type ApiRequest, type EngineEvent, type PageRuntime } from './runtime'
import type { PageSchema } from './schema'

const checkout = () => structuredClone(pageById('checkout')!.page)
const billPay = () => structuredClone(pageById('bill-pay')!.page)

function setup(page: PageSchema, api = vi.fn(async (_r: ApiRequest): Promise<unknown> => ({ reference: 'PL-TEST-1' })), opts: { debug?: boolean; registry?: typeof defaultRegistry } = {}) {
  const events: EngineEvent[] = []
  let runtime!: PageRuntime
  let n = 0
  const utils = render(
    <PageRenderer
      page={page}
      registry={opts.registry ?? defaultRegistry}
      api={api}
      debug={opts.debug}
      onEvent={(e) => events.push(e)}
      now={() => new Date(2026, 10, 8)}
      newKey={() => `key-${++n}`}
      runtimeRef={(r) => { runtime = r }}
    />,
  )
  return { ...utils, api, events, runtime: () => runtime, user: userEvent.setup() }
}

const payButton = () => screen.getByRole('button', { name: /^Pay ₹/ })

describe('PageRenderer: checkout', () => {
  it('resolves templates from state', () => {
    setup(checkout())
    expect(payButton()).toHaveTextContent('Pay ₹2,109')
    expect(screen.getByRole('table', { name: 'Items in this order' })).toBeInTheDocument()
  })

  it('shows only the fields for the chosen method', async () => {
    const { user } = setup(checkout())
    expect(screen.getByLabelText('UPI ID')).toBeInTheDocument()
    expect(screen.queryByLabelText('Card number')).toBeNull()
    await user.click(screen.getByRole('radio', { name: /Credit or debit card/ }))
    expect(screen.getByLabelText('Card number')).toBeInTheDocument()
    expect(screen.queryByLabelText('UPI ID')).toBeNull()
  })

  it('blocks an invalid submit, focuses the first bad field and links every error', async () => {
    const { user, api, events } = setup(checkout())
    await user.click(payButton())
    expect(api).not.toHaveBeenCalled()
    const upi = screen.getByLabelText('UPI ID')
    expect(upi).toHaveFocus()
    expect(upi).toHaveAttribute('aria-invalid', 'true')
    expect(upi.getAttribute('aria-describedby')).toContain(`${upi.id}-error`)
    const summary = screen.getByRole('alert')
    expect(within(summary).getByRole('link', { name: 'UPI ID: Enter your UPI ID' })).toHaveAttribute('href', `#${upi.id}`)
    expect(events).toContainEqual({ type: 'validation_failed', fields: ['upi'] })
  })

  it('clears an error as soon as it is fixed', async () => {
    const { user } = setup(checkout())
    await user.click(payButton())
    await user.type(screen.getByLabelText('UPI ID'), 'riya@okicici')
    expect(screen.getByLabelText('UPI ID')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('never validates hidden fields: an empty card form does not block UPI', async () => {
    const { user, api } = setup(checkout())
    await user.type(screen.getByLabelText('UPI ID'), 'riya@okicici')
    await user.click(payButton())
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
    expect(api.mock.calls[0]![0]).toMatchObject({ endpoint: 'payments/create', idempotencyKey: 'key-1', payload: { method: 'upi', upi: 'riya@okicici' } })
  })

  it('also validates fields revealed later (card rules apply once card is chosen)', async () => {
    const { user, api } = setup(checkout())
    await user.click(screen.getByRole('radio', { name: /Credit or debit card/ }))
    await user.type(screen.getByLabelText('Card number'), '4111111111111112')
    await user.click(payButton())
    expect(api).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Card number: Enter a valid card number')
  })

  it('sends a payment exactly once however many times Pay is clicked', async () => {
    let resolve!: (v: unknown) => void
    const api = vi.fn(() => new Promise((r) => { resolve = r }))
    const { user, events } = setup(checkout(), api)
    await user.type(screen.getByLabelText('UPI ID'), 'riya@okicici')
    await user.click(payButton())
    const busy = screen.getByRole('button', { name: /Processing payment/ })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    await user.click(busy)
    await user.click(busy)
    await user.keyboard('{Enter}')
    expect(api).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ reference: 'PL-1' }))
    expect(await screen.findByRole('heading', { name: '₹2,109 paid to Bluebird Books' })).toHaveFocus()
    expect(events.filter((e) => e.type === 'submit')).toHaveLength(1)
  })

  it('retries a failed payment with the same idempotency key, and mints a new key when the payload changes', async () => {
    const api = vi.fn(async (_r: ApiRequest): Promise<unknown> => { throw new ApiError('Your bank declined this payment.', 'declined') })
    const { user, events } = setup(checkout(), api)
    await user.type(screen.getByLabelText('UPI ID'), 'riya@okicici')
    await user.click(payButton())
    expect(await screen.findByText('Your bank declined this payment.')).toBeInTheDocument()
    await user.click(payButton())
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
    expect(api.mock.calls.map((c) => c[0].idempotencyKey)).toEqual(['key-1', 'key-1'])
    expect(events.filter((e) => e.type === 'submit').map((e) => (e as { retry: boolean }).retry)).toEqual([false, true])

    await user.clear(screen.getByLabelText('UPI ID'))
    await user.type(screen.getByLabelText('UPI ID'), 'riya@okaxis')
    await user.click(payButton())
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3))
    expect(api.mock.calls[2]![0].idempotencyKey).toBe('key-2')
  })

  it('times out a hung request and lets the customer retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = vi.fn((r: ApiRequest) => new Promise((_, reject) => r.signal.addEventListener('abort', () => reject(new Error('aborted')))))
      const { events } = setup(checkout(), api)
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      await user.type(screen.getByLabelText('UPI ID'), 'riya@okicici')
      await user.click(payButton())
      await act(async () => { vi.advanceTimersByTime(8001) })
      expect(await screen.findByText(/timed out/)).toBeInTheDocument()
      expect(payButton()).not.toHaveAttribute('aria-disabled')
      expect(api.mock.calls[0]![0].signal.aborted).toBe(true)
      expect(events.at(-1)).toMatchObject({ type: 'response', ok: false })
    } finally {
      vi.useRealTimers()
    }
  })

  it('submits with Enter from a text field', async () => {
    const { user, api } = setup(checkout())
    await user.type(screen.getByLabelText('UPI ID'), 'riya@okicici{Enter}')
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
  })

  it('resets to a fresh order', async () => {
    const { user } = setup(checkout())
    await user.type(screen.getByLabelText('UPI ID'), 'riya@okicici')
    await user.click(payButton())
    await user.click(await screen.findByRole('button', { name: 'Start a new order' }))
    expect(screen.getByLabelText('UPI ID')).toHaveValue('')
    expect(payButton()).toBeInTheDocument()
  })
})

describe('PageRenderer: rendering guarantees', () => {
  it('re-renders only the field being typed in', async () => {
    const { user, events } = setup(checkout(), undefined, { debug: true })
    const upi = screen.getByLabelText('UPI ID')
    await user.click(upi)
    events.length = 0
    await user.keyboard('r')
    const renders = events.filter((e) => e.type === 'render').map((e) => (e as { nodeId: string }).nodeId)
    expect(renders).toEqual(['upi'])
  })

  it('isolates a crashing component behind its own error boundary', () => {
    const registry = createDefaultRegistry()
    const Boom: ComponentDef = {
      type: 'Boom', category: 'Content', description: 'throws', props: {}, example: { type: 'Boom' },
      component: () => { throw new Error('kaboom') },
    }
    registry.register(Boom)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { events } = setup({ version: 1, id: 'p', title: 'P', body: [{ type: 'Boom', id: 'b' }, { type: 'Text', props: { text: 'Still here' } }] }, undefined, { registry })
    spy.mockRestore()
    expect(screen.getByText('Still here')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('This section is unavailable right now.')
    expect(events).toContainEqual({ type: 'node_error', nodeId: 'b', nodeType: 'Boom', message: 'kaboom' })
  })

  it('lets teams register their own components without touching the engine', () => {
    const registry = defaultRegistry.extend()
    registry.register({
      type: 'Cashback', category: 'Payment', description: 'Promo', example: { type: 'Cashback', props: { amount: 50 } },
      props: { amount: { type: 'number', required: true, description: 'Rupees' } },
      component: ({ props }) => <p>Get ₹{String(props.amount)} cashback</p>,
    })
    setup({ version: 1, id: 'p', title: 'P', state: { amt: 75 }, body: [{ type: 'Cashback', props: { amount: '{{ amt }}' } }] }, undefined, { registry })
    expect(screen.getByText('Get ₹75 cashback')).toBeInTheDocument()
    expect(() => registry.register({ ...registry.get('Cashback')! })).toThrow(/already registered/)
    expect(defaultRegistry.has('Cashback')).toBe(false)
  })
})

describe('PageRenderer: bill payment flow', () => {
  it('fetches a bill into state, then pays it', async () => {
    const api = vi.fn(async (r: ApiRequest): Promise<unknown> =>
      r.endpoint === 'bill/fetch'
        ? { name: 'R. Sharma', amount: 1847.5, units: 1214, period: 'October 2026', due: '18 Nov 2026', overdue: true }
        : { reference: 'PL-BILL-1' })
    const { user } = setup(billPay(), api)
    expect(screen.getByRole('navigation', { name: 'Bill payment progress' }).querySelector('[aria-current="step"]')).toHaveTextContent('Find bill')

    await user.selectOptions(screen.getByLabelText('Electricity board'), 'dhbvn')
    await user.type(screen.getByLabelText('Consumer number'), '1234 5678 90')
    expect(screen.getByLabelText('Consumer number')).toHaveValue('1234567890')
    await user.click(screen.getByRole('button', { name: 'Fetch bill' }))

    expect(await screen.findByRole('heading', { name: 'Bill for R. Sharma' })).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByText('1,214 kWh')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Bill payment progress' }).querySelector('[aria-current="step"]')).toHaveTextContent('Review')

    await user.type(screen.getByLabelText('UPI ID'), 'r.sharma@oksbi')
    await user.click(screen.getByRole('button', { name: 'Pay ₹1,847.50' }))
    expect(await screen.findByRole('heading', { name: '₹1,847.50 paid' })).toBeInTheDocument()
    expect(screen.getByText('PL-BILL-1')).toBeInTheDocument()
    expect(api.mock.calls[1]![0].payload).toMatchObject({ consumer: '1234567890', method: 'upi', bill: { amount: 1847.5 } })
  })
})
