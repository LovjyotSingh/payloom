/**
 * Live config editor: edit JSON, see validation issues with exact paths,
 * and the page re-render as you type. An invalid edit keeps the last valid
 * render on screen, which is exactly how a config pipeline should fail.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultRegistry } from '../components'
import type { PageSchema } from '../engine/schema'
import { parseJson, validatePage, type Issue } from '../engine/validate'
import type { Mode } from '../tokens/tokens'
import { SAMPLE_PAGES, pageById } from '../pages'
import { DeviceFrame, EventLog, PreviewControls, useEventLog } from './Preview'
import { Segmented } from './shared'

const STORAGE_KEY = 'payloom.playground'

function encode(s: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function decode(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))
}

function initialText(sampleId?: string): string {
  const shared = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('c')
  if (shared) { try { return decode(shared) } catch { /* fall through */ } }
  if (sampleId && pageById(sampleId)) return JSON.stringify(pageById(sampleId)!.page, null, 2)
  try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) return saved } catch { /* storage blocked */ }
  return JSON.stringify(SAMPLE_PAGES[0]!.page, null, 2)
}

/** Best-effort line lookup for a JSON pointer such as /body/0/children/2/props/label. */
function lineOf(text: string, pointer: string): number | null {
  const parts = pointer.split('/').filter(Boolean)
  const key = [...parts].reverse().find((p) => !/^\d+$/.test(p))
  if (!key) return null
  let from = 0
  for (const p of parts) {
    if (/^\d+$/.test(p)) continue
    const i = text.indexOf(`"${p}"`, from)
    if (i === -1) break
    from = i + 1
  }
  return text.slice(0, Math.max(0, from - 1)).split('\n').length
}

export function Playground({ sampleId }: { sampleId?: string }) {
  const [text, setText] = useState(() => initialText(sampleId))
  const [debounced, setDebounced] = useState(text)
  const [mode, setMode] = useState<Mode>('light')
  const [width, setWidth] = useState<'phone' | 'desktop'>('phone')
  const [debug, setDebug] = useState(false)
  const [run, setRun] = useState(0)
  const [copied, setCopied] = useState(false)
  const [panel, setPanel] = useState<'issues' | 'log'>('issues')
  const lastGood = useRef<PageSchema | null>(null)
  const editor = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const log = useEventLog(debug)

  useEffect(() => { const t = setTimeout(() => setDebounced(text), 250); return () => clearTimeout(t) }, [text])
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, debounced) } catch { /* ignore */ } }, [debounced])

  const result = useMemo(() => {
    const parsed = parseJson(debounced)
    if (parsed.error) return { syntax: parsed.error, errors: [] as Issue[], warnings: [] as Issue[], page: null as PageSchema | null }
    const v = validatePage(parsed.value, defaultRegistry)
    return { syntax: null, errors: v.errors, warnings: v.warnings, page: v.page ?? null }
  }, [debounced])

  // Re-mount the preview only when the config actually changes.
  const page = useMemo(() => {
    if (result.page) lastGood.current = structuredClone(result.page)
    return lastGood.current
  }, [result.page, run]) // eslint-disable-line react-hooks/exhaustive-deps

  const lines = text.split('\n').length
  const stale = !result.page && !!lastGood.current
  const issueCount = (result.syntax ? 1 : 0) + result.errors.length

  const jumpTo = (line: number) => {
    const el = editor.current
    if (!el) return
    const offset = text.split('\n').slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0)
    el.focus()
    el.setSelectionRange(offset, offset + (text.split('\n')[line - 1]?.length ?? 0))
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 20
    el.scrollTop = Math.max(0, (line - 4) * lh)
  }

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/playground?c=${encode(text)}`
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { window.prompt('Copy this link', url) }
  }

  return (
    <div className="wrap playground">
      <header className="page-head compact">
        <p className="eyebrow">Playground</p>
        <h1>Edit the config. <em>Watch the page follow.</em></h1>
        <p className="lede">The validator runs on every keystroke and points at the exact path. Break something on purpose: misspell a component, use a bad rule, or write an invalid expression.</p>
      </header>

      <div className="pg">
        <section className="pg-editor" aria-labelledby="ed-h">
          <div className="pg-toolbar">
            <h2 id="ed-h" className="sr-only">Config editor</h2>
            <label className="select-wrap">
              <span className="sr-only">Load a sample</span>
              <select value="" onChange={(e) => { const s = pageById(e.target.value); if (s) { const t = JSON.stringify(s.page, null, 2); setText(t); setDebounced(t); log.clear() } }}>
                <option value="" disabled>Load sample…</option>
                {SAMPLE_PAGES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <button type="button" className="btn-ghost" onClick={() => { const p = parseJson(text); if (p.value) setText(JSON.stringify(p.value, null, 2)) }}>Format</button>
            <button type="button" className="btn-ghost" onClick={share}>{copied ? 'Link copied' : 'Share link'}</button>
            <span className={`pg-status ${issueCount ? 'bad' : 'good'}`} role="status">
              {result.syntax ? 'JSON syntax error' : issueCount ? `${issueCount} error${issueCount > 1 ? 's' : ''}` : `Valid${result.warnings.length ? ` · ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}` : ''}`}
            </span>
          </div>
          <div className="pg-code">
            <div className="pg-gutter" ref={gutter} aria-hidden="true">
              {Array.from({ length: lines }, (_, i) => <span key={i}>{i + 1}</span>)}
            </div>
            <textarea
              ref={editor}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop }}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              aria-label="Page config JSON"
            />
          </div>
          <div className="pg-panel">
            <Segmented label="Panel" value={panel} onChange={setPanel} options={[{ value: 'issues', label: `Problems (${issueCount + result.warnings.length})` }, { value: 'log', label: 'Event log' }]} />
            {panel === 'issues' ? (
              <ul className="pg-issues" tabIndex={-1}>
                {result.syntax && (
                  <li data-sev="error"><button type="button" onClick={() => jumpTo(result.syntax!.line)}><b>Line {result.syntax.line}:{result.syntax.col}</b> {result.syntax.message}</button></li>
                )}
                {[...result.errors, ...result.warnings].map((i, k) => {
                  const line = lineOf(text, i.path)
                  return (
                    <li key={k} data-sev={i.severity}>
                      <button type="button" onClick={() => line && jumpTo(line)}>
                        <b>{i.severity === 'error' ? 'Error' : 'Warning'}</b> <code>{i.path || '/'}</code> {i.message}
                      </button>
                    </li>
                  )
                })}
                {!result.syntax && result.errors.length + result.warnings.length === 0 && <li data-sev="ok">No problems. This config would pass CI.</li>}
              </ul>
            ) : (
              <EventLog lines={log.lines} onClear={log.clear} />
            )}
          </div>
        </section>

        <section className="pg-preview" aria-label="Live preview">
          <PreviewControls mode={mode} setMode={setMode} width={width} setWidth={setWidth} debug={debug} setDebug={setDebug} onRestart={() => { setRun((r) => r + 1); log.clear() }} />
          {stale && <p className="stale" role="status">Showing the last valid version. Fix the problems on the left to update it.</p>}
          <div className={stale ? 'is-stale' : undefined}>
            {page ? <DeviceFrame page={page} mode={mode} width={width} debug={debug} api={log.api} onEvent={log.onEvent} label={page.title} /> : <p className="empty">Nothing to render yet.</p>}
          </div>
        </section>
      </div>
    </div>
  )
}
