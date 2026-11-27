import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import Logo from './Logo'
import Icon from './icons'
import CommandPalette from './CommandPalette'
import { Avatar, IconButton, Menu, useToast } from './ui'
import { useSession } from '../state/session'
import { alertService } from '../services/alertService'
import { ALERT_RAISED, ALERTS_CHANGED, LIVE_STATE, getLiveState } from '../network/alertLive'
import { getAppearance, setAppearance } from '../lib/theme'

const TitleContext = createContext(() => {})

// A screen names itself in the top bar:  useTitle('Cameras')   or   useTitle('INC-0004', [{ label: 'Incidents', to: '/incidents' }])
export function useTitle(title, trail = []) {
  const set = useContext(TitleContext)
  const key = JSON.stringify(trail)
  useEffect(() => { set({ title, trail: JSON.parse(key) }) }, [title, key, set])
}

const NAV = [
  { group: 'Monitor', items: [
    { to: '/', label: 'Overview', icon: 'dashboard', end: true },
    { to: '/live', label: 'Live detection', icon: 'eye' },
    { to: '/incidents', label: 'Incidents', icon: 'alert', badge: true },
    { to: '/cameras', label: 'Cameras', icon: 'video' },
    { to: '/perimeter', label: 'Perimeter', icon: 'shield' },
  ] },
  { group: 'Operate', items: [{ to: '/drones', label: 'Drones', icon: 'drone' }] },
  { group: 'Manage', items: [{ to: '/settings', label: 'Settings', icon: 'settings' }] },
]
const LIVE_TEXT = { live: 'Live', connecting: 'Connecting', reconnecting: 'Reconnecting', offline: 'Offline' }

export default function Layout() {
  const { user, isAdmin, properties, property, selectProperty, signOut } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const [crumb, setCrumb] = useState({ title: '', trail: [] })
  const [open, setOpen] = useState(0)                         // alerts that still need someone
  const [live, setLive] = useState(getLiveState())
  const [palette, setPalette] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [appearance, setApp] = useState(getAppearance())
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('aerosentry.sidebar') === 'collapsed' } catch { return false } })

  const toggleCollapsed = () => setCollapsed((c) => { const next = !c; try { localStorage.setItem('aerosentry.sidebar', next ? 'collapsed' : 'open') } catch { /* no storage */ } return next })

  // The number on the Incidents item and the bell, kept fresh by the live connection.
  useEffect(() => {
    if (!property) return undefined
    let cancelled = false
    const refresh = async () => {
      try {
        const [fresh, seen] = await Promise.all([
          alertService.list({ propertyId: property.id, status: 'New', pageSize: 1 }),
          alertService.list({ propertyId: property.id, status: 'Acknowledged', pageSize: 1 }),
        ])
        if (!cancelled) setOpen(fresh.totalCount + seen.totalCount)
      } catch { /* the screen that needs the data shows the error */ }
    }
    refresh()
    window.addEventListener(ALERTS_CHANGED, refresh)
    return () => { cancelled = true; window.removeEventListener(ALERTS_CHANGED, refresh) }
  }, [property?.id])

  useEffect(() => { document.title = open > 0 ? `(${open}) AeroSentry` : 'AeroSentry' }, [open])
  useEffect(() => { setDrawer(false) }, [crumb.title])

  useEffect(() => {
    const onState = (e) => setLive(e.detail)
    window.addEventListener(LIVE_STATE, onState)
    setLive(getLiveState())        // the connection may have gone live before this screen began listening (right after sign-in it does)
    return () => window.removeEventListener(LIVE_STATE, onState)
  }, [])

  // A new alert pops up on any screen.
  useEffect(() => {
    const onRaised = (e) => {
      const a = e.detail
      if (property && a.propertyId !== property.id) return
      toast({ title: `New incident ${a.incidentCode}`, tone: 'bad', ms: 12000, onClick: () => navigate(`/incidents/${a.id}`),
        body: `Person detected in ${a.wallName} / ${a.cellLabel ?? 'outside the cells'} (${Math.round(a.probability * 100)}%)` })
    }
    window.addEventListener(ALERT_RAISED, onRaised)
    return () => window.removeEventListener(ALERT_RAISED, onRaised)
  }, [property?.id, navigate, toast])

  // Ctrl / Cmd + K opens the jump menu.
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const dark = appearance === 'dark' || (appearance === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const toggleTheme = () => { const next = dark ? 'light' : 'dark'; setAppearance(next); setApp(next) }

  const paletteItems = useMemo(() => {
    const go = (to) => () => navigate(to)
    const items = [
      { id: 'overview', label: 'Overview', icon: 'dashboard', run: go('/') },
      { id: 'live', label: 'Live detection', icon: 'eye', run: go('/live') },
      { id: 'incidents', label: 'Incidents', icon: 'alert', hint: open ? `${open} open` : undefined, run: go('/incidents') },
      { id: 'cameras', label: 'Cameras', icon: 'video', run: go('/cameras') },
      { id: 'perimeter', label: 'Perimeter: walls and laser grids', icon: 'shield', run: go('/perimeter') },
      { id: 'drones', label: 'Drones', icon: 'drone', run: go('/drones') },
      { id: 'settings', label: 'Settings', icon: 'settings', run: go('/settings') },
      { id: 'appearance', label: 'Appearance: light or dark', icon: 'sun', run: go('/settings/appearance') },
    ]
    if (isAdmin) {
      items.push(
        { id: 'add-camera', label: 'Add a camera', icon: 'plus', hint: 'Action', run: go('/cameras/new') },
        { id: 'create-wall', label: 'Create a wall', icon: 'plus', hint: 'Action', run: go('/perimeter/walls/new') },
        { id: 'response', label: 'Automatic response', icon: 'activity', run: go('/settings/response') },
        { id: 'people', label: 'Authorized people', icon: 'face', run: go('/settings/people') },
        { id: 'enroll', label: 'Enroll a person', icon: 'plus', hint: 'Action', run: go('/settings/people/new') },
        { id: 'guards', label: 'Guards', icon: 'users', run: go('/settings/guards') },
        { id: 'properties', label: 'Properties', icon: 'building', run: go('/settings/properties') },
      )
    }
    for (const p of properties) if (p.id !== property?.id) items.push({ id: `p-${p.id}`, label: `Switch to ${p.name}`, icon: 'building', hint: 'Property', run: () => selectProperty(p.id) })
    items.push({ id: 'signout', label: 'Sign out', icon: 'logout', run: () => signOut() })
    return items
  }, [isAdmin, open, properties, property?.id, navigate, selectProperty, signOut])

  const links = NAV.map((g) => (
    <div className="nav-group" key={g.group}>
      <div className="nav-title">{g.group}</div>
      <nav className="nav" aria-label={g.group}>
        {g.items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} title={n.label} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon name={n.icon} className="icon" />
            <span className="label">{n.label}</span>
            {n.badge && open > 0 ? <span className="count">{open}</span> : null}
          </NavLink>
        ))}
      </nav>
    </div>
  ))

  return (
    <TitleContext.Provider value={setCrumb}>
      <div className={`shell ${collapsed ? 'collapsed' : ''} ${drawer ? 'drawer-open' : ''}`}>
        <aside className="sidebar">
          <div className="brand"><span className="logo"><Logo /></span><span className="brand-name">AeroSentry</span></div>
          {links}
          <div className="sidebar-foot">
            <button type="button" className="side-toggle desktop-only" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}>
              <Icon name={collapsed ? 'chevrons-right' : 'chevrons-left'} className="icon" width="20" height="20" /><span className="label">Collapse</span>
            </button>
            <div className="side-user">
              <Avatar name={user?.fullName} />
              <div className="who"><strong>{user?.fullName}</strong><span>{isAdmin ? 'Security Admin' : 'Guard'}</span></div>
            </div>
          </div>
        </aside>
        {drawer ? <div className="drawer-scrim" onClick={() => setDrawer(false)} /> : null}

        <div className="main">
          <header className="topbar">
            <IconButton icon="menu" label="Open the menu" className="mobile-only" onClick={() => setDrawer(true)} />
            <nav className="crumbs" aria-label="Breadcrumb">
              <Link to="/" aria-label="Overview"><Icon name="home" /></Link>
              {crumb.title && crumb.title !== 'Overview' ? <Icon name="chevron-right" /> : null}
              {crumb.trail.map((c) => (<span key={c.to} style={{ display: 'contents' }}><Link to={c.to}>{c.label}</Link><Icon name="chevron-right" /></span>))}
              {crumb.title && crumb.title !== 'Overview' ? <span className="here">{crumb.title}</span> : <span className="here" style={{ marginLeft: 4 }}>Overview</span>}
            </nav>
            <span className="spacer" />
            <button type="button" className="searchbtn" onClick={() => setPalette(true)} aria-label="Search and jump">
              <Icon name="search" width="16" height="16" /><span className="searchlabel">Search or jump to…</span><kbd>Ctrl K</kbd>
            </button>
            <span className={`live-pill ${live}`} title="The connection that delivers new incidents the moment they happen" data-testid="live-pill"><span className="pulse" /><span className="live-text">{LIVE_TEXT[live]}</span></span>
            {properties.length > 0 ? (
              <label className="propselect">
                <Icon name="building" />
                <select aria-label="Property" value={property?.id ?? ''} onChange={(e) => selectProperty(e.target.value)}>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Icon name="chevron-down" className="caret" />
              </label>
            ) : null}
            <IconButton icon="bell" label={open ? `${open} open incidents` : 'No open incidents'} bordered badge={open || null} onClick={() => navigate('/incidents')} />
            <Menu trigger={({ toggle }) => (
              <button type="button" className="iconbtn" data-testid="user-menu" aria-label="Account menu" onClick={toggle} style={{ width: 'auto', padding: 0 }}><Avatar name={user?.fullName} /></button>
            )}>
              {({ close }) => (
                <>
                  <div className="menu-head"><strong>{user?.fullName}</strong><span>{user?.email} · {isAdmin ? 'Security Admin' : 'Guard'}</span></div>
                  <button type="button" onClick={() => { toggleTheme(); close() }}><Icon name={dark ? 'sun' : 'moon'} />{dark ? 'Light mode' : 'Dark mode'}</button>
                  <button type="button" onClick={() => { close(); navigate('/settings') }}><Icon name="settings" />Settings</button>
                  <button type="button" className="danger" onClick={() => { close(); signOut() }}><Icon name="logout" />Sign out</button>
                </>
              )}
            </Menu>
          </header>
          {/* key: switching property remounts the screen, so nothing from the old property stays on it */}
          <main className="page" key={property?.id}><Outlet /></main>
        </div>
      </div>
      {palette ? <CommandPalette items={paletteItems} onClose={() => setPalette(false)} /> : null}
    </TitleContext.Provider>
  )
}
