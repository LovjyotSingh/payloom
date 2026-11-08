/**
 * Renders a validated PageSchema through a component Registry.
 *
 *  - Each node subscribes only to the state paths it reads (when / templates /
 *    bind), so a keystroke re-renders one field, not the page.
 *  - Each node sits in its own error boundary: one broken component shows a
 *    small fallback and reports an event; the rest of the payment page keeps working.
 */
import {
  Component, createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef,
  type ComponentType, type CSSProperties, type ErrorInfo, type FormEvent, type ReactNode,
} from 'react'
import { dependencies, evaluate, parse } from './expr'
import type { ComponentDef, FieldApi, Registry, RenderProps } from './registry'
import { PageRuntime, type ApiAdapter, type EngineEvent } from './runtime'
import { FORM_KEY, type PageSchema, type UINode } from './schema'
import { useStoreDeps } from './store'
import { compile, hasTemplate, renderTemplate } from './template'
import { themeVars, type Mode } from '../tokens/tokens'

interface Ctx {
  runtime: PageRuntime
  registry: Registry
  debug: boolean
}
const RuntimeContext = createContext<Ctx | null>(null)

export function useRuntime(): PageRuntime {
  const c = useContext(RuntimeContext)
  if (!c) throw new Error('useRuntime must be used inside <PageRenderer>')
  return c.runtime
}

export function fieldId(pageId: string, path: string) {
  return `pl-${pageId}-${path.replace(/\./g, '-')}`
}

// ---- dependency analysis ---------------------------------------------------

function templateDeps(v: unknown, out: Set<string>) {
  if (typeof v === 'string') {
    if (hasTemplate(v)) compile(v)?.deps.forEach((d) => out.add(d))
  } else if (Array.isArray(v)) v.forEach((x) => templateDeps(x, out))
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => templateDeps(x, out))
}

/** Paths a node reads. Computed once per node object. */
export function nodeDeps(node: UINode, def: ComponentDef | undefined): string[] {
  const out = new Set<string>()
  if (node.when) dependencies(parse(node.when), out)
  templateDeps(node.props, out)
  if (node.bind) { out.add(node.bind); out.add(`$errors.${node.bind}`) }
  if (def?.bindable || def?.actionable) out.add(`${FORM_KEY}.status`)
  for (const d of def?.reads ?? []) out.add(d)
  return [...out]
}

function resolveProps(v: unknown, scope: unknown): unknown {
  if (typeof v === 'string') {
    const t = hasTemplate(v) ? compile(v) : null
    return t ? renderTemplate(t, scope) : v
  }
  if (Array.isArray(v)) return v.map((x) => resolveProps(x, scope))
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) o[k] = resolveProps(x, scope)
    return o
  }
  return v
}

// ---- error boundary ----------------------------------------------------------

class NodeBoundary extends Component<
  { node: UINode; path: string; onError: (e: EngineEvent) => void; debug: boolean; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError({ type: 'node_error', nodeId: this.props.node.id ?? this.props.path, nodeType: this.props.node.type, message: error.message })
  }
  componentDidUpdate(prev: { node: UINode }) {
    if (prev.node !== this.props.node && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error) {
      return (
        <div className="pl-fallback" role="note">
          This section is unavailable right now.
          {this.props.debug && <code> {this.props.node.type}: {this.state.error.message}</code>}
        </div>
      )
    }
    return this.props.children
  }
}

// ---- node -------------------------------------------------------------------

const NodeView = memo(function NodeView({ node, path }: { node: UINode; path: string }) {
  const ctx = useContext(RuntimeContext)!
  return (
    <NodeBoundary node={node} path={path} onError={(e) => ctx.runtime.emit(e)} debug={ctx.debug}>
      <NodeInner node={node} path={path} />
    </NodeBoundary>
  )
})

function NodeInner({ node, path }: { node: UINode; path: string }) {
  const { runtime, registry, debug } = useContext(RuntimeContext)!
  const def = registry.get(node.type)
  if (!def) throw new Error(`Unknown component "${node.type}"`)

  const deps = useMemo(() => nodeDeps(node, def), [node, def])
  useStoreDeps(runtime.store, deps)
  const state = runtime.store.getState()
  const nodeId = node.id ?? path

  const flashRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!debug) return
    runtime.emit({ type: 'render', nodeId, nodeType: node.type })
    const el = flashRef.current
    if (el) { el.classList.remove('pl-flash'); void el.offsetWidth; el.classList.add('pl-flash') }
  })

  const visible = node.when ? Boolean(evaluate(parse(node.when), state)) : true
  const busy = (state[FORM_KEY] as { status?: string } | undefined)?.status === 'submitting'

  const field = useField(node, def, visible)
  const run = useAction(node, def, visible)

  if (!visible) return null

  const props = resolveProps(node.props ?? {}, state) as Record<string, unknown>
  const children = def.children && node.children
    ? node.children.map((c, i) => <NodeView key={c.id ?? i} node={c} path={`${path}/children/${i}`} />)
    : undefined

  const Comp = def.component as ComponentType<RenderProps>
  const el = <Comp props={props} node={node} field={field} run={run} busy={busy}>{children}</Comp>
  return debug
    ? <div ref={flashRef} className="pl-debug" data-node={nodeId} data-type={node.type}>{el}</div>
    : el
}

function useField(node: UINode, def: ComponentDef, visible: boolean): FieldApi | undefined {
  const { runtime } = useContext(RuntimeContext)!
  const path = node.bind
  const id = path ? fieldId(runtime.page.id, path) : ''
  const label = String((node.props as Record<string, unknown> | undefined)?.label ?? def.props.label?.default ?? path ?? '')
  const rulesKey = JSON.stringify(node.rules ?? [])

  useLayoutEffect(() => {
    if (!path || !def.bindable || !visible) return
    const focus = () => {
      const el = document.getElementById(id) as HTMLElement | null
      el?.focus()
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }
    return runtime.registerField(path, { rules: JSON.parse(rulesKey), label, focus })
  }, [runtime, path, id, label, rulesKey, visible, def.bindable])

  const setValue = useCallback((v: unknown) => { if (path) runtime.setValue(path, v) }, [runtime, path])
  const onBlur = useCallback(() => { if (path) runtime.blur(path) }, [runtime, path])

  if (!path || !def.bindable) return undefined
  const state = runtime.store
  return {
    id,
    name: path,
    value: state.get(path),
    setValue,
    onBlur,
    error: (state.get(`$errors.${path}`) as string | undefined) ?? null,
    errorId: `${id}-error`,
    required: (node.rules ?? []).some((r) => r.type === 'required'),
    read: (p: string) => state.get(p),
  }
}

function useAction(node: UINode, def: ComponentDef, visible: boolean): (() => void) | undefined {
  const { runtime } = useContext(RuntimeContext)!
  const action = node.action
  const run = useCallback(() => { void runtime.runAction(action) }, [runtime, action])
  const isSubmit = !!action && !Array.isArray(action) && action.type === 'submit'
  useEffect(() => {
    if (!isSubmit || !visible || !def.actionable) return
    return runtime.registerSubmit(run)
  }, [runtime, run, isSubmit, visible, def.actionable])
  return action && def.actionable ? run : undefined
}

// ---- page -------------------------------------------------------------------

export interface PageRendererProps {
  page: PageSchema
  registry: Registry
  api?: ApiAdapter
  onEvent?: (e: EngineEvent) => void
  navigate?: (to: string) => void
  mode?: Mode
  /** Highlight nodes as they re-render and emit render events. */
  debug?: boolean
  now?: () => Date
  newKey?: () => string
  /** Receives the runtime (tests, devtools). */
  runtimeRef?: (r: PageRuntime) => void
}

export function PageRenderer(p: PageRendererProps) {
  const { page, registry, mode = 'light', debug = false } = p
  // Keep callbacks fresh without rebuilding the runtime (and losing state).
  const latest = useRef(p)
  latest.current = p
  const runtime = useMemo(
    () => new PageRuntime(page, {
      api: (req) => latest.current.api!(req),
      onEvent: (e) => latest.current.onEvent?.(e),
      navigate: (to) => latest.current.navigate?.(to),
      now: () => latest.current.now?.() ?? new Date(),
      newKey: p.newKey,
    }),
    // A new page object means a new page: fresh state.
    [page],
  )
  useEffect(() => { p.runtimeRef?.(runtime) }, [runtime, p])

  const ctx = useMemo(() => ({ runtime, registry, debug }), [runtime, registry, debug])
  const style = useMemo(() => themeVars(mode, page.theme), [mode, page.theme])

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    runtime.submitDefault()
  }

  return (
    <RuntimeContext.Provider value={ctx}>
      <div className="pl-root" data-theme={mode} style={style as CSSProperties}>
        <form className="pl-page" aria-label={page.title} noValidate onSubmit={onSubmit}>
          {page.body.map((n, i) => <NodeView key={n.id ?? i} node={n} path={`/body/${i}`} />)}
        </form>
      </div>
    </RuntimeContext.Provider>
  )
}
