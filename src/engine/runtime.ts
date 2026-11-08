/**
 * Page runtime: owns state, field validation and actions for one rendered page.
 *
 * Payment-specific guarantees:
 *  - A submit cannot run twice at once (double clicks and Enter-mashing are dropped).
 *  - Every submit carries an idempotency key. Retrying the same payload after a
 *    failure reuses the key, so the server can dedupe; changing the payload mints a new one.
 *  - Requests time out (default 15 s) and surface as a retryable error, never a hang.
 *  - Only fields currently on screen are validated, so hidden card fields
 *    never block a UPI payment.
 */
import { run as runExpr } from './expr'
import type { ActionSpec, Json, PageSchema } from './schema'
import { ERRORS_KEY, FORM_KEY, RESULT_KEY, type FormStatus } from './schema'
import { check, type Rule } from './rules'
import { Store, getIn } from './store'

export interface ApiRequest {
  endpoint: string
  payload: Record<string, unknown>
  idempotencyKey: string
  signal: AbortSignal
}
export type ApiAdapter = (req: ApiRequest) => Promise<unknown>

export type EngineEvent =
  | { type: 'render'; nodeId: string; nodeType: string }
  | { type: 'submit'; endpoint: string; idempotencyKey: string; retry: boolean }
  | { type: 'response'; endpoint: string; ok: boolean; ms: number; idempotencyKey: string; error?: string }
  | { type: 'duplicate_blocked'; endpoint: string }
  | { type: 'validation_failed'; fields: string[] }
  | { type: 'node_error'; nodeId: string; nodeType: string; message: string }
  | { type: 'navigate'; to: string }
  | { type: 'emit'; event: string }

export interface RuntimeOptions {
  api?: ApiAdapter
  onEvent?: (e: EngineEvent) => void
  navigate?: (to: string) => void
  now?: () => Date
  newKey?: () => string
}

interface FieldReg {
  rules: Rule[]
  label: string
  touched: boolean
  focus: () => void
}

export class ApiError extends Error {
  constructor(message: string, readonly code = 'error') {
    super(message)
    this.name = 'ApiError'
  }
}

const defaultKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export class PageRuntime {
  readonly store: Store
  private fields = new Map<string, FieldReg>()
  private submitButtons: (() => void)[] = []
  private lastAttempt: { endpoint: string; payload: string; key: string } | null = null
  private initial: Record<string, unknown>

  constructor(readonly page: PageSchema, private opts: RuntimeOptions = {}) {
    this.initial = { ...(page.state ?? {}) }
    this.store = new Store({
      ...this.initial,
      [FORM_KEY]: { status: 'idle', error: null, submitCount: 0 },
      [ERRORS_KEY]: {},
      [RESULT_KEY]: null,
    })
  }

  emit(e: EngineEvent) { this.opts.onEvent?.(e) }

  get status(): FormStatus {
    return (getIn(this.store.getState(), `${FORM_KEY}.status`) as FormStatus) ?? 'idle'
  }

  // ---- fields -------------------------------------------------------------

  registerField(path: string, reg: Omit<FieldReg, 'touched'>): () => void {
    const prev = this.fields.get(path)
    this.fields.set(path, { ...reg, touched: prev?.touched ?? false })
    return () => {
      if (this.fields.get(path)?.focus === reg.focus) {
        this.fields.delete(path)
        this.setError(path, null) // a hidden field must not keep an error on screen
      }
    }
  }

  fieldLabel(path: string): string { return this.fields.get(path)?.label ?? path }
  focusField(path: string) { this.fields.get(path)?.focus() }

  setValue(path: string, value: unknown) {
    this.store.batch(() => {
      this.store.set(path, value)
      const f = this.fields.get(path)
      // After a field has been left once (or a submit was tried), re-check as the user types
      // so the error disappears the moment it is fixed.
      if (f && (f.touched || this.submitCount() > 0) && this.store.get(`${ERRORS_KEY}.${path}`)) this.validateField(path)
      if (this.status === 'error' || this.status === 'success') this.setForm({ status: 'idle', error: null })
    })
  }

  blur(path: string) {
    const f = this.fields.get(path)
    if (!f) return
    f.touched = true
    this.validateField(path)
  }

  private ctx() {
    return { cardNumber: String(this.store.get('card.number') ?? this.store.get('cardNumber') ?? ''), now: this.opts.now?.() }
  }

  validateField(path: string): string | null {
    const f = this.fields.get(path)
    if (!f) return null
    const msg = check(this.store.get(path), f.rules, this.ctx())
    this.setError(path, msg)
    return msg
  }

  private setError(path: string, msg: string | null) {
    const key = `${ERRORS_KEY}.${path}`
    if (msg) this.store.set(key, msg)
    else if (this.store.get(key) !== undefined) this.store.set(key, undefined)
  }

  /** Validate every mounted field; returns the invalid paths in on-screen order. */
  validateAll(): string[] {
    const bad: string[] = []
    this.store.batch(() => {
      for (const path of this.fields.keys()) if (this.validateField(path)) bad.push(path)
    })
    return bad
  }

  errorList(): { path: string; label: string; message: string }[] {
    const out: { path: string; label: string; message: string }[] = []
    const walk = (obj: unknown, prefix: string) => {
      if (typeof obj === 'string') { out.push({ path: prefix, label: this.fieldLabel(prefix), message: obj }); return }
      if (typeof obj === 'object' && obj) for (const [k, v] of Object.entries(obj)) walk(v, prefix ? `${prefix}.${k}` : k)
    }
    walk(this.store.get(ERRORS_KEY), '')
    const order = [...this.fields.keys()]
    return out.sort((a, b) => order.indexOf(a.path) - order.indexOf(b.path))
  }

  // ---- actions ------------------------------------------------------------

  registerSubmit(fn: () => void): () => void {
    this.submitButtons.push(fn)
    return () => { this.submitButtons = this.submitButtons.filter((f) => f !== fn) }
  }

  /** Called by the page <form> on Enter: run the first submit button's action. */
  submitDefault() { this.submitButtons[0]?.() }

  private submitCount(): number {
    return Number(this.store.get(`${FORM_KEY}.submitCount`) ?? 0)
  }

  private setForm(patch: Record<string, unknown>) {
    const cur = (this.store.get(FORM_KEY) ?? {}) as Record<string, unknown>
    this.store.set(FORM_KEY, { ...cur, ...patch })
  }

  async runAction(action: ActionSpec | ActionSpec[] | undefined, result?: unknown): Promise<void> {
    if (!action) return
    if (Array.isArray(action)) {
      for (const a of action) await this.runAction(a, result)
      return
    }
    switch (action.type) {
      case 'submit': return this.submit(action)
      case 'set': {
        const value = action.from !== undefined
          ? runExpr(action.from, { ...this.store.getState(), [RESULT_KEY]: result ?? this.store.get(RESULT_KEY) })
          : action.value
        // Direct write: unlike user input, this must not reset the form status.
        this.store.set(action.path, value ?? null)
        return
      }
      case 'reset': {
        this.store.batch(() => {
          const paths = action.paths ?? Object.keys(this.initial)
          for (const p of paths) this.store.set(p, getIn(this.initial, p) ?? null)
          for (const p of paths) this.setError(p, null)
          for (const f of this.fields.values()) f.touched = false
          this.setForm({ status: 'idle', error: null, submitCount: 0 })
        })
        this.lastAttempt = null
        return
      }
      case 'navigate':
        this.emit({ type: 'navigate', to: action.to })
        this.opts.navigate?.(action.to)
        return
      case 'emit':
        this.emit({ type: 'emit', event: action.event })
        return
    }
  }

  private payloadFor(paths?: string[]): Record<string, unknown> {
    const state = this.store.getState()
    const keys = paths ?? Object.keys(state).filter((k) => !k.startsWith('$'))
    const out: Record<string, unknown> = {}
    for (const k of keys) out[k] = getIn(state, k)
    return out
  }

  private async submit(action: Extract<ActionSpec, { type: 'submit' }>): Promise<void> {
    if (this.status === 'submitting') {
      this.emit({ type: 'duplicate_blocked', endpoint: action.endpoint })
      return
    }
    this.setForm({ submitCount: this.submitCount() + 1 })

    if (action.validate !== false) {
      const bad = this.validateAll()
      if (bad.length) {
        this.emit({ type: 'validation_failed', fields: bad })
        this.focusField(bad[0]!)
        return
      }
    }

    const payload = this.payloadFor(action.payload)
    const serialized = JSON.stringify([action.endpoint, payload])
    const retry = this.lastAttempt?.payload === serialized
    const key = retry ? this.lastAttempt!.key : (this.opts.newKey ?? defaultKey)()
    this.lastAttempt = { endpoint: action.endpoint, payload: serialized, key }

    this.setForm({ status: 'submitting', error: null })
    this.emit({ type: 'submit', endpoint: action.endpoint, idempotencyKey: key, retry })
    const started = Date.now()
    const controller = new AbortController()
    const timeoutMs = action.timeoutMs ?? 15000
    let timer: ReturnType<typeof setTimeout> | undefined

    try {
      if (!this.opts.api) throw new ApiError('No API adapter is configured for this page')
      const result = await Promise.race([
        this.opts.api({ endpoint: action.endpoint, payload, idempotencyKey: key, signal: controller.signal }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            // Settle with the timeout first, then abort, so the customer sees
            // "timed out" rather than the adapter's low-level abort error.
            reject(new ApiError('The request timed out. Your payment was not confirmed; please try again.', 'timeout'))
            controller.abort()
          }, timeoutMs)
        }),
      ])
      this.emit({ type: 'response', endpoint: action.endpoint, ok: true, ms: Date.now() - started, idempotencyKey: key })
      this.lastAttempt = null // done: the next submit is a new operation
      this.store.batch(() => {
        this.store.set(RESULT_KEY, result as Json)
        this.setForm({ status: 'success', error: null, result })
      })
      await this.runAction(action.onSuccess, result)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.'
      this.emit({ type: 'response', endpoint: action.endpoint, ok: false, ms: Date.now() - started, idempotencyKey: key, error: message })
      this.setForm({ status: 'error', error: message, code: e instanceof ApiError ? e.code : 'error' })
      await this.runAction(action.onError, { error: message })
    } finally {
      clearTimeout(timer)
    }
  }
}
