/**
 * In-browser stand-in for a payments backend, so the demo needs no server.
 * It behaves like a real one where it matters for the UI:
 *  - honours idempotency keys (a retried request returns the original result
 *    instead of charging twice),
 *  - has realistic latency, declines and timeouts you can trigger from the form.
 */
import { ApiError, type ApiAdapter, type ApiRequest } from '../engine/runtime'

export interface ApiLogEntry {
  at: number
  endpoint: string
  key: string
  replayed: boolean
  ok: boolean
  ms: number
  detail: string
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new ApiError('aborted', 'aborted')) }, { once: true })
  })

const ref = () => 'PL' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + Math.random().toString(36).slice(2, 8).toUpperCase()

export function createMockApi(opts: { latency?: number; onLog?: (e: ApiLogEntry) => void } = {}): ApiAdapter & { charges: () => number } {
  const latency = opts.latency ?? 900
  const done = new Map<string, Promise<unknown>>()
  let charges = 0

  const handle = async (req: ApiRequest): Promise<unknown> => {
    const p = req.payload as Record<string, any>
    switch (req.endpoint) {
      case 'payments/create': {
        await sleep(latency, req.signal)
        const upi = String(p.upi ?? '')
        const card = String(p.card?.number ?? '')
        if (p.method === 'upi' && upi.startsWith('timeout')) await sleep(60_000, req.signal)
        if (p.method === 'upi' && upi.startsWith('fail')) throw new ApiError('Your bank declined this payment. No money was deducted. Try another UPI ID or method.', 'declined')
        if (p.method === 'card' && card.endsWith('0002')) throw new ApiError('This card was declined by the issuing bank. No money was deducted.', 'declined')
        charges++
        return { reference: ref(), status: 'captured' }
      }
      case 'wallet/topup': {
        await sleep(latency, req.signal)
        if (String(p.upi ?? '').startsWith('fail')) throw new ApiError('Your bank declined this top-up. No money was deducted.', 'declined')
        charges++
        return { reference: ref() }
      }
      case 'bill/fetch': {
        await sleep(latency, req.signal)
        if (/^0+$/.test(String(p.consumer))) throw new ApiError('No bill was found for this consumer number. Check the number on your latest bill.', 'not_found')
        const seed = Number(String(p.consumer).slice(-4)) || 1234
        return {
          name: ['R. Sharma', 'A. Verma', 'S. Khan', 'P. Iyer'][seed % 4],
          amount: 600 + (seed % 2400) + 0.5,
          units: 120 + (seed % 380),
          period: 'October 2026',
          due: '18 Nov 2026',
          overdue: seed % 5 === 0,
        }
      }
      case 'otp/verify': {
        await sleep(latency, req.signal)
        if (p.otp !== '123456') throw new ApiError('That code is not right. Check the SMS and try again.', 'bad_otp')
        charges++
        return { reference: ref() }
      }
      case 'otp/resend':
        await sleep(latency / 2, req.signal)
        return { sent: true }
      default:
        throw new ApiError(`Unknown endpoint ${req.endpoint}`)
    }
  }

  const api = (async (req: ApiRequest) => {
    const started = performance.now()
    const prior = done.get(req.idempotencyKey)
    // Replay: same key, same request already succeeded -> same response, no new charge.
    const replayed = !!prior
    const run = prior ?? handle(req)
    try {
      const result = await run
      done.set(req.idempotencyKey, run)
      opts.onLog?.({ at: Date.now(), endpoint: req.endpoint, key: req.idempotencyKey, replayed, ok: true, ms: Math.round(performance.now() - started), detail: replayed ? 'replayed original result' : '200 OK' })
      return result
    } catch (e) {
      done.delete(req.idempotencyKey) // failures are safe to retry with the same key
      opts.onLog?.({ at: Date.now(), endpoint: req.endpoint, key: req.idempotencyKey, replayed: false, ok: false, ms: Math.round(performance.now() - started), detail: e instanceof Error ? e.message : String(e) })
      throw e
    }
  }) as ApiAdapter & { charges: () => number }
  api.charges = () => charges
  return api
}
