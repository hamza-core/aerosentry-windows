// The building blocks of every screen. Plain React + CSS (styles/app.css), no UI library.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './icons'

export { Icon }

/* ---------- loading and feedback ---------- */
export function Spinner({ big }) { return <span className={`spinner ${big ? 'big' : ''}`} role="status" aria-label="Loading" /> }
export function Center({ children }) { return <div className="center">{children}</div> }
export function Loading() { return <Center><Spinner big /></Center> }
export function Skeleton({ h = 14, w = '100%', style }) { return <div className="skeleton" style={{ height: h, width: w, ...style }} /> }

// A grey outline of a screen while its data loads (feels faster than a spinner).
export function PageSkeleton({ rows = 4 }) {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <div className="stack-sm"><Skeleton h={26} w={260} /><Skeleton h={14} w={380} /></div>
      <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="card" style={{ padding: 18 }}><Skeleton h={14} w="45%" /><Skeleton h={28} w="30%" style={{ marginTop: 12 }} /></div>)}</div>
      <div className="card" style={{ padding: 18 }}><div className="stack-sm">{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} h={16} />)}</div></div>
    </div>
  )
}

export function SectionTitle({ children }) { return <h3 className="section-label">{children}</h3> }
export function Footnote({ children }) { return <p className="footnote">{children}</p> }
export function ErrorText({ message }) { return message ? <p className="error" role="alert">{message}</p> : null }

export function Notice({ title, children, tone = '', icon }) {
  const name = icon || (tone === 'bad' ? 'alert' : tone === 'warn' ? 'alert' : tone === 'ok' ? 'check' : 'info')
  return (
    <div className={`notice ${tone}`}>
      <Icon name={name} />
      <div>{title ? <strong className="notice-title">{title}</strong> : null}{children}</div>
    </div>
  )
}

export function Empty({ title, children, icon = 'layers', action }) {
  return (
    <div className="empty">
      <div className="bubble"><Icon name={icon} /></div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action ? <div style={{ marginTop: 10 }}>{action}</div> : null}
    </div>
  )
}

export function Badge({ tone = '', dot, children }) {
  return <span className={`badge ${tone}`}>{dot ? <span className="bdot" /> : null}{children}</span>
}

export function Avatar({ name = '', large }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
  return <span className={`avatar ${large ? 'lg' : ''}`} aria-hidden="true">{initials}</span>
}

export function ProgressBar({ value, tone = '' }) {
  return <div className={`progress ${tone}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
}

/* ---------- layout pieces ---------- */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  )
}

// A white panel. With a title it gets a header (and optional actions on the right); `flush` removes the inner padding
// (for tables and lists); `footer` is a grey strip at the bottom.
export function Card({ title, sub, actions, flush, footer, padded, className = '', children }) {
  return (
    <section className={`card ${className}`}>
      {title ? <header className="card-head"><div><h2>{title}</h2>{sub ? <div className="sub">{sub}</div> : null}</div>{actions ? <div className="cluster">{actions}</div> : null}</header> : null}
      {flush ? children : <div className="card-body">{children}</div>}
      {footer ? <footer className="card-foot">{footer}</footer> : null}
      {padded ? null : null}
    </section>
  )
}

export function StatCard({ icon, tone = '', label, value, hint, to }) {
  const inner = (
    <>
      <div className={`bubble ${tone}`}><Icon name={icon} /></div>
      <div><div className="label">{label}</div><div className="value">{value}</div>{hint ? <div className="hint">{hint}</div> : null}</div>
    </>
  )
  return to ? <Link to={to} className="card stat">{inner}</Link> : <div className="card stat">{inner}</div>
}

export function KV({ items }) {
  return <div className="kv">{items.flatMap(([k, v]) => [<div key={`k${k}`} className="k">{k}</div>, <div key={`v${k}`} className="v">{v}</div>])}</div>
}

// A line in a list: title + sub on the left, extras / a value / a chevron on the right. Put them in <div className="rows">.
export function Row({ title, sub, value, valueTone, dot, to, onClick, chevron, children }) {
  const inner = (
    <>
      <div className="grow"><div className="title">{title}</div>{sub ? <div className="sub">{sub}</div> : null}</div>
      {children}
      {value !== undefined && value !== null && value !== '' ? (
        <span className={`value ${valueTone ? `${valueTone}-text` : ''}`}>{dot ? <span className={`bdot`} style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 6, background: dot === 'ok' ? '#22c55e' : dot === 'warn' ? '#f59e0b' : 'var(--danger)' }} /> : null}{value}</span>
      ) : null}
      {(to || onClick) && chevron !== false ? <Icon name="chevron-right" size={16} /> : null}
    </>
  )
  if (to) return <Link to={to}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick}>{inner}</button>
  return <div>{inner}</div>
}

/* ---------- buttons and forms ---------- */
export function Button({ variant = '', small, large, block, busy, icon, children, ...rest }) {
  const classes = ['btn', variant, small ? 'small' : '', large ? 'large' : '', block ? 'block' : ''].filter(Boolean).join(' ')
  return (
    <button className={classes} disabled={busy || rest.disabled} {...rest}>
      {busy ? <Spinner /> : icon ? <Icon name={icon} /> : null}{children}
    </button>
  )
}

export function IconButton({ icon, label, bordered, badge, className = '', ...rest }) {
  return (
    <button type="button" className={`iconbtn ${bordered ? 'bordered' : ''} ${className}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} />{badge ? <span className="dot-badge">{badge}</span> : null}
    </button>
  )
}

export function Field({ label, invalid, hint, children }) {
  return (
    <div className={`field ${invalid ? 'invalid' : ''}`}>
      <label>{label}</label>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function TextField({ label, value, onChange, type = 'text', placeholder, invalid, hint, ...rest }) {
  return (
    <Field label={label} invalid={invalid} hint={hint}>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  )
}

export function PasswordField({ label = 'Password', value, onChange, ...rest }) {
  const [shown, setShown] = useState(false)
  return (
    <Field label={label}>
      <div className="pw-wrap">
        <input type={shown ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
        <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide password' : 'Show password'}>{shown ? 'Hide' : 'Show'}</button>
      </div>
    </Field>
  )
}

export function Segmented({ options, value, onChange, block }) {
  return (
    <div className={`segmented ${block ? 'block' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className={value === t.value ? 'on' : ''} onClick={() => onChange(t.value)}>
          {t.label}{t.count !== undefined ? <span className="pill">{t.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return <div className="search"><Icon name="search" /><input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></div>
}

/* ---------- dialogs, menus, toasts ---------- */
export function Dialog({ title, children, onClose, wide, className = '' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={`dialog ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        {title ? <div className="dialog-head"><h3>{title}</h3><IconButton icon="x" label="Close" onClick={onClose} /></div> : null}
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  )
}

export function Confirm({ title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onCancel }) {
  return (
    <Dialog title={title} onClose={onCancel}>
      {message ? <p className="muted">{message}</p> : null}
      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant={danger ? 'danger' : ''} busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  )
}

// A drop-down: <Menu trigger={({ toggle, open }) => <button onClick={toggle}>…</button>}>{({ close }) => …}</Menu>
export function Menu({ trigger, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open ? <div className="menu" role="menu">{children({ close: () => setOpen(false) })}</div> : null}
    </div>
  )
}

const ToastContext = createContext(() => {})
// const toast = useToast();  toast({ title: 'Saved', tone: 'ok' })     tone: ok | warn | bad | '' ;  onClick runs when it is clicked
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const remove = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), [])
  const push = useCallback(({ title, body, tone = '', onClick, ms = 5000 }) => {
    const id = `${Date.now()}-${Math.random()}`
    setItems((list) => [...list, { id, title, body, tone, onClick }])
    setTimeout(() => remove(id), ms)
  }, [remove])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`} onClick={() => { t.onClick?.(); remove(t.id) }}>
            <div><strong>{t.title}</strong>{t.body ? <span>{t.body}</span> : null}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
