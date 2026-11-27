import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { Card, Icon, PageHeader } from '../components/ui'
import { useSession } from '../state/session'

// The settings area: its own menu on the left, the chosen page on the right.
const GROUPS = [
  { title: 'Protection', admin: true, items: [
    { to: '/settings/response', label: 'Automatic response', icon: 'activity' },
    { to: '/settings/people', label: 'Authorized people', icon: 'face' },
  ] },
  { title: 'Management', admin: true, items: [
    { to: '/settings/properties', label: 'Properties', icon: 'building' },
    { to: '/settings/guards', label: 'Guards', icon: 'users' },
  ] },
  { title: 'Preferences', items: [
    { to: '/settings/appearance', label: 'Appearance', icon: 'sun' },
    { to: '/settings/account', label: 'Account', icon: 'user' },
  ] },
]

export default function SettingsLayout() {
  const { isAdmin } = useSession()
  return (
    <>
      <PageHeader title="Settings" subtitle="Protection, people and preferences" />
      <div className="grid side-main">
        <Card flush className="sticky">
          <nav className="settings-nav" aria-label="Settings">
            {GROUPS.filter((g) => isAdmin || !g.admin).map((g) => (
              <div key={g.title} style={{ display: 'contents' }}>
                <div className="group">{g.title}</div>
                {g.items.map((i) => <NavLink key={i.to} to={i.to} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={i.icon} />{i.label}</NavLink>)}
              </div>
            ))}
          </nav>
        </Card>
        <div className="stack"><Outlet /></div>
      </div>
    </>
  )
}

export function SettingsIndex() {
  const { isAdmin } = useSession()
  return <Navigate to={isAdmin ? '/settings/response' : '/settings/appearance'} replace />
}
