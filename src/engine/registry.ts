/**
 * Component registry. The renderer knows nothing about specific components:
 * each one is registered with a typed prop spec, which drives config
 * validation, the docs page and the playground. Client teams can register
 * their own components without touching the engine.
 */
import type { ComponentType, ReactNode } from 'react'
import type { ActionSpec, UINode } from './schema'

export type PropType = 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'expression'

export interface PropSpec {
  type: PropType
  description: string
  required?: boolean
  values?: readonly string[]
  default?: unknown
  /** For arrays of objects: the keys each item must have. */
  itemKeys?: readonly string[]
}

export type Category = 'Layout' | 'Content' | 'Input' | 'Action' | 'Feedback' | 'Payment'

/** What a bound input receives from the engine. */
export interface FieldApi<V = unknown> {
  id: string
  name: string
  value: V
  setValue: (v: V) => void
  onBlur: () => void
  error: string | null
  errorId: string
  required: boolean
  /** Value of another state path (e.g. CVV reads the card number for its length). */
  read: (path: string) => unknown
}

export interface RenderProps<P = Record<string, unknown>> {
  /** Props with templates already resolved against state. */
  props: P
  node: UINode
  /** Rendered children, when the component accepts them. */
  children?: ReactNode
  /** Present when the node has a `bind`. */
  field?: FieldApi
  /** Run the node's action (buttons). */
  run?: () => void
  /** True while a submit action is in flight anywhere on the page. */
  busy: boolean
}

export interface ComponentDef<P = any> {
  type: string
  category: Category
  description: string
  component: ComponentType<RenderProps<P>>
  props: Record<string, PropSpec>
  /** Accepts child nodes. */
  children?: boolean
  /** Type of value this component binds to, if it is an input. */
  bindable?: 'string' | 'number' | 'boolean'
  /** Extra state paths the component reads itself (e.g. ErrorSummary reads "$errors"). */
  reads?: string[]
  /** Can carry an `action`. */
  actionable?: boolean
  /** Rendered on the docs page and checked by the accessibility tests. */
  example: UINode | UINode[]
  exampleState?: Record<string, unknown>
}

export class Registry {
  private defs = new Map<string, ComponentDef>()

  register(def: ComponentDef, opts: { override?: boolean } = {}): this {
    if (this.defs.has(def.type) && !opts.override) {
      throw new Error(`Component "${def.type}" is already registered. Pass { override: true } to replace it.`)
    }
    if (!/^[A-Z][A-Za-z0-9]*$/.test(def.type)) throw new Error(`Component type "${def.type}" must be PascalCase`)
    this.defs.set(def.type, def)
    return this
  }

  get(type: string): ComponentDef | undefined { return this.defs.get(type) }
  has(type: string): boolean { return this.defs.has(type) }
  list(): ComponentDef[] { return [...this.defs.values()] }
  types(): string[] { return [...this.defs.keys()] }

  /** A copy that teams can extend without mutating the shared default registry. */
  extend(): Registry {
    const r = new Registry()
    for (const d of this.defs.values()) r.register(d)
    return r
  }
}

export type { ActionSpec }
