import { useEffect, useState, type ReactNode } from 'react'

export function useHashRoute(): string[] {
  const read = () => (window.location.hash.replace(/^#\/?/, '').split('?')[0] ?? '').split('/').filter(Boolean)
  const [parts, setParts] = useState(read)
  useEffect(() => {
    const on = () => { setParts(read()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return parts
}

export const go = (path: string) => { window.location.hash = path }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Small JSON syntax highlighter (keys, strings, templates, numbers, literals). */
export function highlightJson(src: string): string {
  return esc(src).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b|\b(true|false|null)\b/g,
    (m, str: string | undefined, colon: string | undefined, num: string | undefined, lit: string | undefined) => {
      if (str) {
        if (colon) return `<span class="j-key">${str}</span>${colon}`
        const inner = str.replace(/\{\{(.*?)\}\}/g, '<span class="j-tpl">{{$1}}</span>')
        return `<span class="j-str">${inner}</span>`
      }
      if (num) return `<span class="j-num">${num}</span>`
      if (lit) return `<span class="j-lit">${lit}</span>`
      return m
    },
  )
}

export function Code({ code, label }: { code: string; label: string }) {
  return (
    <pre className="code" tabIndex={0} aria-label={label}>
      <code dangerouslySetInnerHTML={{ __html: highlightJson(code) }} />
    </pre>
  )
}

export function Segmented<T extends string>(p: { label: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={p.label}>
      {p.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={p.value === o.value}
          tabIndex={p.value === o.value ? 0 : -1}
          onClick={() => p.onChange(o.value)}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return
            e.preventDefault()
            const i = p.options.findIndex((x) => x.value === p.value)
            const next = p.options[(i + (e.key === 'ArrowRight' ? 1 : -1) + p.options.length) % p.options.length]!
            p.onChange(next.value)
            ;(e.currentTarget.parentElement?.querySelector(`[data-v="${next.value}"]`) as HTMLElement | null)?.focus()
          }}
          data-v={o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

