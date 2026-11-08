/** Keyboard and input behaviour of the interactive components. */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { defaultRegistry } from '../components'
import { formatCardNumber } from '../components/card'
import { reformat } from '../components/caret'
import { PageRenderer } from '../engine/Renderer'
import type { PageRuntime } from '../engine/runtime'
import type { PageSchema, UINode } from '../engine/schema'

function mount(body: UINode[], state: Record<string, unknown> = {}) {
  let runtime!: PageRuntime
  const page = { version: 1, id: 't', title: 'T', state, body } as PageSchema
  render(<PageRenderer page={page} registry={defaultRegistry} runtimeRef={(r) => { runtime = r }} />)
  return { state: (p: string) => runtime.store.get(p), user: userEvent.setup() }
}

describe('RadioCards', () => {
  const node: UINode = {
    type: 'RadioCards', bind: 'method',
    props: { label: 'Payment method', options: [{ value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'nb', label: 'Netbanking', description: 'All banks' }] },
  }

  it('is a labelled group of native radios', () => {
    mount([node], { method: 'upi' })
    expect(screen.getByRole('group', { name: /Payment method/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'UPI' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Netbanking' })).toHaveAccessibleDescription('All banks')
  })

  it('moves the selection with arrow keys', async () => {
    const { user, state } = mount([node], { method: 'upi' })
    screen.getByRole('radio', { name: 'UPI' }).focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('radio', { name: 'Card' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Card' })).toHaveFocus()
    expect(state('method')).toBe('card')
  })
})

describe('OtpField', () => {
  const node: UINode = { type: 'OtpField', bind: 'otp', props: { label: 'Code' } }

  it('auto-advances, and backspace steps back', async () => {
    const { user, state } = mount([node], { otp: '' })
    const boxes = screen.getAllByRole('textbox')
    expect(boxes).toHaveLength(6)
    expect(boxes[1]).toHaveAccessibleName('Digit 2 of 6')
    await user.click(boxes[0]!)
    await user.keyboard('482')
    expect(state('otp')).toBe('482')
    expect(boxes[3]).toHaveFocus()
    await user.keyboard('{Backspace}')
    expect(state('otp')).toBe('48')
    expect(boxes[2]).toHaveFocus()
  })

  it('fills every box from a paste and ignores non-digits', async () => {
    const { user, state } = mount([node], { otp: '' })
    const boxes = screen.getAllByRole('textbox')
    await user.click(boxes[0]!)
    await user.paste('123-456')
    expect(state('otp')).toBe('123456')
    expect(boxes.map((b) => (b as HTMLInputElement).value).join('')).toBe('123456')
  })

  it('offers one-time-code autofill on the first box only', () => {
    mount([node], { otp: '' })
    const boxes = screen.getAllByRole('textbox')
    expect(boxes[0]).toHaveAttribute('autocomplete', 'one-time-code')
    expect(boxes[1]).toHaveAttribute('autocomplete', 'off')
  })
})

describe('card inputs', () => {
  it('groups digits by brand', () => {
    expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111')
    expect(formatCardNumber('378282246310005')).toBe('3782 822463 10005')
    expect(formatCardNumber('41111111111111119999')).toBe('4111 1111 1111 1111')
  })

  it('keeps the caret beside the same digit when spaces are inserted', () => {
    // caret after the 5th digit of "41111" -> after "4111 1"
    expect(reformat('41111', 5, (c) => /\d/.test(c), formatCardNumber)).toEqual({ text: '4111 1', caret: 6, clean: '41111' })
  })

  it('stores digits only and announces the detected brand', async () => {
    const { user, state } = mount([{ type: 'CardNumberField', bind: 'card.number' }], { card: { number: '' } })
    await user.type(screen.getByLabelText(/^Card number/), '3782 8224 6310 005')
    expect(state('card.number')).toBe('378282246310005')
    expect(screen.getByLabelText(/^Card number/)).toHaveValue('3782 822463 10005')
    expect(screen.getByText('American Express card detected')).toBeInTheDocument()
  })

  it('inserts the expiry slash and pads the month', async () => {
    const { user, state } = mount([{ type: 'ExpiryField', bind: 'exp' }], { exp: '' })
    await user.type(screen.getByLabelText(/^Expiry date/), '4')
    expect(state('exp')).toBe('04/')
    await user.type(screen.getByLabelText(/^Expiry date/), '29')
    expect(state('exp')).toBe('04/29')
  })

  it('sizes the CVV to the card brand', async () => {
    const { user } = mount([
      { type: 'CardNumberField', bind: 'card.number' },
      { type: 'CvvField', bind: 'card.cvv' },
    ], { card: { number: '4111111111111111', cvv: '' } })
    expect(screen.getByLabelText(/^CVV/)).toHaveAttribute('maxlength', '3')
    await user.clear(screen.getByLabelText(/^Card number/))
    await user.type(screen.getByLabelText(/^Card number/), '378282246310005')
    expect(screen.getByLabelText(/^CVV/)).toHaveAttribute('maxlength', '4')
    expect(screen.getByText('4 digits on the front of the card')).toBeInTheDocument()
  })
})

describe('AmountField', () => {
  it('groups digits the Indian way while storing a number', async () => {
    const { user, state } = mount([{ type: 'AmountField', bind: 'amount', props: { label: 'Amount', presets: [500] } }], { amount: null })
    await user.type(screen.getByLabelText(/^Amount/), '100000.555')
    expect(screen.getByLabelText(/^Amount/)).toHaveValue('1,00,000.55')
    expect(state('amount')).toBe(100000.55)
    await user.click(screen.getByRole('button', { name: '₹500' }))
    expect(state('amount')).toBe(500)
    expect(screen.getByRole('button', { name: '₹500' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Steps', () => {
  it('marks the current step for assistive tech', () => {
    mount([{ type: 'Steps', props: { steps: ['A', 'B', 'C'], current: 1 } }])
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).toHaveTextContent('A (completed)')
  })
})
