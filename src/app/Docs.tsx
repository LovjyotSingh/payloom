/** Component reference, generated from the registry: the same specs the validator enforces. */
import { useMemo, useState } from 'react'
import { defaultRegistry } from '../components'
import type { Category, ComponentDef } from '../engine/registry'
import { PageRenderer } from '../engine/Renderer'
import type { PageSchema, UINode } from '../engine/schema'
import type { Mode } from '../tokens/tokens'
import { Code, Segmented } from './shared'

const ORDER: Category[] = ['Payment', 'Input', 'Action', 'Feedback', 'Content', 'Layout']

function Example({ def, mode }: { def: ComponentDef; mode: Mode }) {
  const page = useMemo<PageSchema>(() => ({
    version: 1, id: `doc-${def.type.toLowerCase()}`, title: `${def.type} example`,
    state: (def.exampleState ?? {}) as PageSchema['state'],
    body: (Array.isArray(def.example) ? def.example : [def.example]) as UINode[],
  }), [def])
  return (
    <div className="doc-example" data-mode={mode}>
      <PageRenderer page={page} registry={defaultRegistry} mode={mode} api={async () => ({ reference: 'PL-DOCS' })} />
    </div>
  )
}

export function Docs() {
  const [mode, setMode] = useState<Mode>('light')
  const [q, setQ] = useState('')
  const defs = defaultRegistry.list()
  const shown = defs.filter((d) => !q || (d.type + d.description).toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="wrap docs">
      <header className="page-head">
        <p className="eyebrow">Components</p>
        <h1>{defs.length} components, <em>one contract.</em></h1>
        <p className="lede">Every component is registered with a typed prop spec. That spec drives config validation, this page, and the accessibility tests: each example below is checked by axe in CI, in its normal and its error state.</p>
      </header>

      <div className="docs-bar">
        <label className="search">
          <span className="sr-only">Filter components</span>
          <input type="search" placeholder="Filter components…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Segmented label="Example colour scheme" value={mode} onChange={setMode} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </div>

      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Components">
          {ORDER.map((cat) => {
            const items = shown.filter((d) => d.category === cat)
            if (!items.length) return null
            return (
              <div key={cat}>
                <p>{cat}</p>
                <ul>{items.map((d) => <li key={d.type}><a href={`#/components/${d.type}`} onClick={(e) => { e.preventDefault(); document.getElementById(`c-${d.type}`)?.scrollIntoView({ behavior: 'smooth' }); history.replaceState(null, '', `#/components/${d.type}`) }}>{d.type}</a></li>)}</ul>
              </div>
            )
          })}
        </nav>

        <div className="docs-list">
          {shown.length === 0 && <p className="empty">No component matches “{q}”.</p>}
          {ORDER.flatMap((cat) => shown.filter((d) => d.category === cat)).map((d) => (
            <article key={d.type} id={`c-${d.type}`} className="doc" aria-labelledby={`h-${d.type}`}>
              <header>
                <h2 id={`h-${d.type}`}>{d.type}</h2>
                <div className="chips">
                  <span>{d.category}</span>
                  {d.bindable && <span>binds {d.bindable}</span>}
                  {d.actionable && <span>runs actions</span>}
                  {d.children && <span>has children</span>}
                </div>
              </header>
              <p className="doc-desc">{d.description}</p>
              <Example def={d} mode={mode} />
              {Object.keys(d.props).length > 0 && (
                <div className="table-scroll" tabIndex={0} role="region" aria-label={`${d.type} props`}>
                  <table className="props">
                    <thead><tr><th scope="col">Prop</th><th scope="col">Type</th><th scope="col">Default</th><th scope="col">Description</th></tr></thead>
                    <tbody>
                      {Object.entries(d.props).map(([name, s]) => (
                        <tr key={name}>
                          <th scope="row"><code>{name}</code>{s.required && <span className="req" title="required">required</span>}</th>
                          <td><code>{s.type === 'enum' ? s.values!.map((v) => `"${v}"`).join(' | ') : s.type}</code></td>
                          <td>{s.default !== undefined ? <code>{JSON.stringify(s.default)}</code> : '–'}</td>
                          <td>{s.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <details>
                <summary>Config</summary>
                <Code code={JSON.stringify(d.example, null, 2)} label={`${d.type} config example`} />
              </details>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
