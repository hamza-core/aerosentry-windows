import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './icons'

// The jump menu (Ctrl/Cmd + K): type to find a screen or an action, arrows to choose, Enter to go.
export default function CommandPalette({ items, onClose }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const input = useRef(null)
  useEffect(() => { input.current?.focus() }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(q)) : items
  }, [items, query])
  useEffect(() => { setIndex(0) }, [query])

  const choose = (item) => { onClose(); item.run() }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, shown.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' && shown[index]) { e.preventDefault(); choose(shown[index]) }
    else if (e.key === 'Escape') onClose()
  }

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="dialog palette" role="dialog" aria-modal="true" aria-label="Jump to">
        <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Jump to a screen or an action…" aria-label="Jump to" />
        {shown.length === 0 ? <div className="none">Nothing matches “{query}”.</div> : (
          <ul>
            {shown.map((item, i) => (
              <li key={item.id}>
                <button type="button" className={i === index ? 'on' : ''} onMouseEnter={() => setIndex(i)} onClick={() => choose(item)}>
                  <Icon name={item.icon} /><span>{item.label}</span>{item.hint ? <small>{item.hint}</small> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
