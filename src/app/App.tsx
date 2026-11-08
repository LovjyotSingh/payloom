import { lazy, Suspense, useEffect } from 'react'
import { Gallery } from './Gallery'
import { Home } from './Home'
import { useHashRoute } from './shared'

// The editor and the docs are split into their own chunks.
const Playground = lazy(() => import('./Playground').then((m) => ({ default: m.Playground })))
const Docs = lazy(() => import('./Docs').then((m) => ({ default: m.Docs })))

const NAV = [
  { href: '#/', label: 'Overview', match: '' },
  { href: '#/pages/checkout', label: 'Pages', match: 'pages' },
  { href: '#/playground', label: 'Playground', match: 'playground' },
  { href: '#/components', label: 'Components', match: 'components' },
]

export function App() {
  const [section = '', arg] = useHashRoute()

  useEffect(() => {
    const titles: Record<string, string> = { '': 'Schema-driven payment UI', pages: 'Sample pages', playground: 'Playground', components: 'Components' }
    document.title = `Payloom · ${titles[section] ?? 'Not found'}`
    // Move focus to the new page's heading so screen reader users hear the route change.
    const h = document.querySelector<HTMLElement>('main h1')
    if (h && section) { h.tabIndex = -1; h.focus({ preventScroll: true }) }
    if (section === 'components' && arg) setTimeout(() => document.getElementById(`c-${arg}`)?.scrollIntoView(), 50)
  }, [section, arg])

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
      <header className="topbar">
        <div className="wrap topbar-in">
          <a className="logo" href="#/" aria-label="Payloom home">
            <svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF8A3D" /><stop offset=".5" stopColor="#FF3D81" /><stop offset="1" stopColor="#8B5CFF" /></linearGradient></defs><path d="M9 8h8a6 6 0 0 1 0 12h-4v4H9z M13 12v4h4a2 2 0 0 0 0-4z" fill="url(#lg)" fillRule="evenodd" /></svg>
            <span>Payloom</span>
          </a>
          <nav aria-label="Main">
            <ul>
              {NAV.map((n) => (
                <li key={n.href}><a href={n.href} aria-current={section === n.match ? 'page' : undefined}>{n.label}</a></li>
              ))}
            </ul>
          </nav>
          <a className="gh" href="https://github.com/LovjyotSingh/payloom" aria-label="Source on GitHub">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<p className="wrap loading">Loading…</p>}>
          {section === '' && <Home />}
          {section === 'pages' && <Gallery id={arg} />}
          {section === 'playground' && <Playground sampleId={arg} />}
          {section === 'components' && <Docs />}
          {!['', 'pages', 'playground', 'components'].includes(section) && (
            <div className="wrap page-head"><h1>Page not found</h1><p className="lede"><a href="#/">Back to the overview</a></p></div>
          )}
        </Suspense>
      </main>
      <footer className="foot">
        <div className="wrap">
          <p>Built by <a href="https://lovjyotsingh.github.io">Lovjyot Singh</a>. React 19 + TypeScript, no UI libraries. Payments here are simulated in the browser.</p>
        </div>
      </footer>
    </>
  )
}
