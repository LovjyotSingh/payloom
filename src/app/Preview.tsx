/** A rendered page inside a device frame, with an engine/API event log. */
import { useMemo, useState } from 'react'
import { defaultRegistry } from '../components'
import { PageRenderer } from '../engine/Renderer'
import type { EngineEvent } from '../engine/runtime'
import type { PageSchema } from '../engine/schema'
import type { Mode } from '../tokens/tokens'
import { createMockApi, type ApiLogEntry } from './mockApi'
import { Segmented } from './shared'

export type LogLine = { id: number; at: number; kind: 'api' | 'engine' | 'render'; ok?: boolean; text: string; detail?: string }

let seq = 0

export function useEventLog(debug: boolean) {
  const [lines, setLines] = useState<LogLine[]>([])
  const push = (l: Omit<LogLine, 'id' | 'at'>) => setLines((prev) => [{ ...l, id: ++seq, at: Date.now() }, ...prev].slice(0, 120))
  const api = useMemo(
    () => createMockApi({
      onLog: (e: ApiLogEntry) => push({
        kind: 'api', ok: e.ok,
        text: `POST /${e.endpoint} · ${e.ms}ms · ${e.ok ? (e.replayed ? 'replayed' : '200') : 'failed'}`,
        detail: `Idempotency-Key ${e.key.slice(0, 8)}… ${e.detail}`,
      }),
    }),
    [],
  )
  const onEvent = (e: EngineEvent) => {
    switch (e.type) {
      case 'render': if (debug) push({ kind: 'render', text: `render ${e.nodeType}`, detail: e.nodeId }); break
      case 'submit': push({ kind: 'engine', text: `submit → ${e.endpoint}`, detail: e.retry ? `retry, same key ${e.idempotencyKey.slice(0, 8)}…` : `new key ${e.idempotencyKey.slice(0, 8)}…` }); break
      case 'duplicate_blocked': push({ kind: 'engine', ok: true, text: 'duplicate submit blocked', detail: 'a request is already in flight' }); break
      case 'validation_failed': push({ kind: 'engine', ok: false, text: `validation failed: ${e.fields.join(', ')}`, detail: 'focus moved to the first invalid field' }); break
      case 'node_error': push({ kind: 'engine', ok: false, text: `component crashed: ${e.nodeType}`, detail: `${e.message} (isolated by its error boundary)` }); break
      case 'navigate': push({ kind: 'engine', text: `navigate → ${e.to}` }); break
      case 'emit': push({ kind: 'engine', text: `event: ${e.event}` }); break
      case 'response': break
    }
  }
  return { lines, clear: () => setLines([]), api, onEvent }
}

export function EventLog({ lines, onClear }: { lines: LogLine[]; onClear: () => void }) {
  return (
    <section className="log" aria-labelledby="log-h">
      <div className="log-head">
        <h3 id="log-h">Event log</h3>
        <button type="button" className="btn-text" onClick={onClear} disabled={!lines.length}>Clear</button>
      </div>
      {lines.length === 0 ? (
        <p className="log-empty">Interact with the page. Submits, retries, idempotency replays, validation and (with re-renders on) every node render show up here.</p>
      ) : (
        <ol className="log-list" aria-live="off">
          {lines.map((l) => (
            <li key={l.id} data-kind={l.kind} data-ok={l.ok === undefined ? undefined : String(l.ok)}>
              <span className="log-time">{new Date(l.at).toLocaleTimeString('en-IN', { hour12: false })}</span>
              <span className="log-text">{l.text}</span>
              {l.detail && <span className="log-detail">{l.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function PreviewControls(p: {
  mode: Mode; setMode: (m: Mode) => void
  width: 'phone' | 'desktop'; setWidth: (w: 'phone' | 'desktop') => void
  debug: boolean; setDebug: (d: boolean) => void
  onRestart: () => void
}) {
  return (
    <div className="controls">
      <Segmented label="Preview width" value={p.width} onChange={p.setWidth} options={[{ value: 'phone', label: 'Phone' }, { value: 'desktop', label: 'Desktop' }]} />
      <Segmented label="Colour scheme" value={p.mode} onChange={p.setMode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      <label className="toggle">
        <input type="checkbox" checked={p.debug} onChange={(e) => p.setDebug(e.target.checked)} />
        <span>Show re-renders</span>
      </label>
      <button type="button" className="btn-text" onClick={p.onRestart}>Restart</button>
    </div>
  )
}

export function DeviceFrame(p: {
  page: PageSchema; mode: Mode; width: 'phone' | 'desktop'; debug: boolean
  api: ReturnType<typeof useEventLog>['api']; onEvent: (e: EngineEvent) => void; label: string
}) {
  return (
    <div className="frame" data-width={p.width} data-mode={p.mode}>
      <div className="frame-bar" aria-hidden="true"><span /><span /><span /><em>{p.label}</em></div>
      <div className="frame-screen">
        <PageRenderer page={p.page} registry={defaultRegistry} mode={p.mode} debug={p.debug} api={p.api} onEvent={p.onEvent} />
      </div>
    </div>
  )
}
