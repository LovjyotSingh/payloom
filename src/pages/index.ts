import type { PageSchema } from '../engine/schema'
import billPay from './bill-pay.json'
import checkout from './checkout.json'
import otp from './otp.json'
import walletTopup from './wallet-topup.json'

export interface SamplePage {
  id: string
  name: string
  summary: string
  page: PageSchema
}

export const SAMPLE_PAGES: SamplePage[] = [
  { id: 'checkout', name: 'Checkout', summary: 'UPI, card and netbanking with conditional fields', page: checkout as unknown as PageSchema },
  { id: 'bill-pay', name: 'Bill payment', summary: 'Fetch, review, pay: a 3-step flow in one config', page: billPay as unknown as PageSchema },
  { id: 'wallet-topup', name: 'Wallet top-up', summary: 'Live computed balance and amount presets', page: walletTopup as unknown as PageSchema },
  { id: 'otp', name: 'OTP verification', summary: '6-box code entry with resend countdown', page: otp as unknown as PageSchema },
]

export const pageById = (id: string) => SAMPLE_PAGES.find((p) => p.id === id)
