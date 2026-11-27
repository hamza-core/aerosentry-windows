import { useTitle } from '../components/Layout'
import { Avatar, Button, Card, KV, Notice } from '../components/ui'
import { useSession } from '../state/session'

export default function Account() {
  useTitle('Account', [{ label: 'Settings', to: '/settings' }])
  const { user, isAdmin, signOut } = useSession()
  return (
    <>
      <Card title="Account" flush footer={<Button variant="secondary" icon="logout" onClick={() => signOut()}>Sign out</Button>}>
        <div style={{ padding: '18px 18px 8px' }} className="who-cell"><Avatar name={user.fullName} large /><div><div className="cell-main" style={{ fontSize: 16 }}>{user.fullName}</div><div className="cell-sub">{user.email}</div></div></div>
        <KV items={[['Role', isAdmin ? 'Security Admin' : 'Guard'], ['Phone', user.phoneNumber || 'Not set'], ['Password', 'Cannot be changed here yet']]} />
      </Card>
      <Notice title="Notifications and storage">Notification and storage settings are not on the server yet, so they are not here.</Notice>
    </>
  )
}
