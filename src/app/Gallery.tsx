import { useEffect, useMemo, useState } from 'react'
import type { Mode } from '../tokens/tokens'
import { SAMPLE_PAGES, pageById } from '../pages'
import { DeviceFrame, EventLog, PreviewControls, useEventLog } from './Preview'
import { Code, Segmented, go } from './shared'

export function Gallery({ id }: { id?: string }) {
  const sample = pageById(id ?? '') ?? SAMPLE_PAGES[0]!
  const [mode, setMode] = useState<Mode>('light')
  const [width, setWidth] = useState<'phone' | 'desktop'>('phone')
  const [debug, setDebug] = useState(false)
  const [tab, setTab] = useState<'log' | 'json'>('log')
  const [run, setRun] = useState(0)
  const log = useEventLog(debug)
  // A fresh copy restarts the page with its initial state.
  const page = useMemo(() => structuredClone(sample.page), [sample, run]) // eslint-disable-line react-hooks/exhaustive-deps
  const json = useMemo(() => JSON.stringify(sample.page, null, 2), [sample])

  // On phones the tabs are a swipeable row: keep the selected one in view.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('.tabs [aria-current="page"]')
    const row = el?.parentElement
    if (el && row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' })
  }, [sample.id])

  return (
    <div className="wrap gallery">
      <header className="page-head">
        <p className="eyebrow">Sample pages</p>
        <h1>Four payment flows. <em>Zero page code.</em></h1>
        <p className="lede">Each page below is a JSON file rendered by the same engine. Try the declines, the retry, and the timeouts described in the field hints, and watch the event log.</p>
      </header>

      <nav className="tabs" aria-label="Sample pages">
        {SAMPLE_PAGES.map((p) => (
          <a key={p.id} href={`#/pages/${p.id}`} aria-current={p.id === sample.id ? 'page' : undefined}>
            <strong>{p.name}</strong>
            <span>{p.summary}</span>
          </a>
        ))}
      </nav>

      <div className="stage">
        <div className="stage-main">
          <PreviewControls mode={mode} setMode={setMode} width={width} setWidth={setWidth} debug={debug} setDebug={setDebug} onRestart={() => { setRun((r) => r + 1); log.clear() }} />
          <DeviceFrame key={`${sample.id}-${run}`} page={page} mode={mode} width={width} debug={debug} api={log.api} onEvent={log.onEvent} label={`${sample.page.title}`} />
        </div>
        <aside className="stage-side" aria-label="Inspector">
          <p className="desc">{sample.page.description}</p>
          <div className="side-tabs">
            <Segmented label="Inspector view" value={tab} onChange={setTab} options={[{ value: 'log', label: 'Event log' }, { value: 'json', label: `${sample.id}.json` }]} />
            <button type="button" className="btn-text" onClick={() => go(`/playground/${sample.id}`)}>Edit in playground →</button>
          </div>
          {tab === 'log' ? <EventLog lines={log.lines} onClear={log.clear} /> : <Code code={json} label={`${sample.id}.json`} />}
        </aside>
      </div>
    </div>
  )
}
