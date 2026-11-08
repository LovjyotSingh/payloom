/** The page config format. Pages are plain JSON so any team or service can author them. */
import type { Rule } from './rules'

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

export interface PageTheme {
  /** Brand accent, e.g. "#7C3AED". Text on it is chosen automatically for contrast. */
  accent?: string
  radius?: 'sharp' | 'soft' | 'round'
  density?: 'compact' | 'comfortable'
}

export interface PageSchema {
  $schema?: string
  version: 1
  id: string
  title: string
  description?: string
  theme?: PageTheme
  /** Initial page state. Inputs bind to these paths. */
  state?: Record<string, Json>
  body: UINode[]
}

export type ActionSpec =
  | {
      type: 'submit'
      /** Endpoint name handed to the host's API adapter. */
      endpoint: string
      /** State paths to send. Defaults to every non-$ key. */
      payload?: string[]
      /** Skip client validation (e.g. "resend OTP"). */
      validate?: boolean
      timeoutMs?: number
      onSuccess?: ActionSpec | ActionSpec[]
      onError?: ActionSpec | ActionSpec[]
    }
  | { type: 'set'; path: string; value?: Json; from?: string }
  | { type: 'reset'; paths?: string[] }
  | { type: 'navigate'; to: string }
  | { type: 'emit'; event: string }

export interface UINode {
  type: string
  id?: string
  props?: Record<string, Json>
  children?: UINode[]
  /** Expression; the node renders only while it is truthy. */
  when?: string
  /** State path for input components. */
  bind?: string
  rules?: Rule[]
  action?: ActionSpec
}

/** Reserved state keys the engine maintains; configs can read them in expressions. */
export const FORM_KEY = '$form'
export const ERRORS_KEY = '$errors'
export const RESULT_KEY = '$result'

export type FormStatus = 'idle' | 'submitting' | 'success' | 'error'
