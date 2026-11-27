import { useNavigate } from 'react-router-dom'
import AuthShell from '../components/AuthShell'
import PropertyForm from '../components/PropertyForm'
import { Button } from '../components/ui'
import { propertyService } from '../services/propertyService'
import { useSession } from '../state/session'
import { useAction } from '../lib/hooks'

// An administrator with no property yet adds the first one.
export default function Onboarding() {
  const { user, reloadProperties, signOut } = useSession()
  const navigate = useNavigate()
  const { run, busy, error } = useAction()

  async function create(values) {
    const created = await run(() => propertyService.create(values))
    if (created) {
      await reloadProperties(created.id)
      navigate('/', { replace: true })
    }
  }

  return (
    <AuthShell>
      <div className="stack">
        <div><h1>Add your first property</h1><p className="sub">Welcome, {user?.fullName}. Aerosentry protects one property at a time. Register yours to configure cameras, walls and alerts. You can add more any time.</p></div>
        <PropertyForm submitLabel="Register and Continue" busy={busy} error={error} onSubmit={create} />
        <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
      </div>
    </AuthShell>
  )
}
