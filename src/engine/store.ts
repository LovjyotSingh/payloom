/**
 * Page state store with path-level subscriptions.
 *
 * Every rendered node declares the state paths it reads (from its `when`,
 * templates and `bind`). A write to "upi" only wakes subscribers of "upi",
 * its parents ("" / whole-state readers) or its children ("upi.x"), so typing
 * in one field re-renders that field, not the page.
 */
import { useCallback, useRef, useSyncExternalStore } from 'react'

export type State = Record<string, unknown>
type Listener = { deps: string[] | '*'; cb: () => void }

export function splitPath(path: string): string[] {
  return path === '' ? [] : path.split('.')
}

export function getIn(obj: unknown, path: string): unknown {
  let cur = obj
  for (const p of splitPath(path)) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/** Immutable set: copies only the objects along the path. */
export function setIn<T>(obj: T, path: string, value: unknown): T {
  const parts = splitPath(path)
  if (parts.length === 0) return value as T
  const [head, ...rest] = parts as [string, ...string[]]
  const base = (typeof obj === 'object' && obj !== null ? obj : {}) as Record<string, unknown>
  const next = Array.isArray(base) ? [...base] : { ...base }
  ;(next as Record<string, unknown>)[head] = rest.length ? setIn(base[head], rest.join('.'), value) : value
  return next as T
}

/** True when a change at `changed` can affect a reader of `dep`. */
export function overlaps(dep: string, changed: string): boolean {
  if (dep === changed) return true
  return changed.startsWith(dep + '.') || dep.startsWith(changed + '.')
}

export class Store {
  private state: State
  private listeners = new Set<Listener>()
  private pending: Set<string> | null = null

  constructor(initial: State = {}) {
    this.state = initial
  }

  getState(): State { return this.state }
  get(path: string): unknown { return getIn(this.state, path) }

  set(path: string, value: unknown): void {
    if (Object.is(this.get(path), value)) return
    this.state = setIn(this.state, path, value)
    if (this.pending) this.pending.add(path)
    else this.emit([path])
  }

  /** Apply several writes and notify once. */
  batch(fn: () => void): void {
    if (this.pending) { fn(); return }
    this.pending = new Set()
    try { fn() } finally {
      const changed = [...this.pending]
      this.pending = null
      if (changed.length) this.emit(changed)
    }
  }

  subscribe(deps: string[] | '*', cb: () => void): () => void {
    const l: Listener = { deps, cb }
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }

  private emit(changed: string[]): void {
    for (const l of [...this.listeners]) {
      if (l.deps === '*' || l.deps.some((d) => changed.some((c) => overlaps(d, c)))) l.cb()
    }
  }
}

/**
 * Re-render the calling component only when one of `deps` changes.
 * Returns a version number that changes on every relevant write.
 */
export function useStoreDeps(store: Store, deps: string[] | '*'): number {
  const version = useRef(0)
  const key = deps === '*' ? '*' : deps.join('|')
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(deps, () => { version.current++; onChange() }),
    [store, key],
  )
  return useSyncExternalStore(subscribe, () => version.current, () => version.current)
}
