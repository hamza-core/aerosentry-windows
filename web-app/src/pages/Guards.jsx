import { useState } from 'react'
import { useTitle } from '../components/Layout'
import { Avatar, Badge, Button, Card, Confirm, Dialog, Empty, ErrorText, Icon, PageSkeleton, PasswordField, TextField } from '../components/ui'
import { useSession } from '../state/session'
import { useAction, useLoad } from '../lib/hooks'
import { guardService } from '../services/guardService'
import { propertyService } from '../services/propertyService'
import { checkEmail, checkPassword } from '../lib/domain'

// Guards belong to PROPERTIES on the server: a guard sees only the properties they are assigned to.
export default function Guards() {
  useTitle('Guards', [{ label: 'Settings', to: '/settings' }])
  const { properties } = useSession()
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const { run, busy, error, setError } = useAction()

  // The guards, and which property each one is assigned to.
  const { data, loading, reload } = useLoad(async () => {
    const guards = await guardService.list()
    const assignments = {}
    await Promise.all(properties.map(async (p) => {
      for (const g of await propertyService.listGuards(p.id)) (assignments[g.id] ||= new Set()).add(p.id)
    }))
    return { guards, assignments }
  }, [properties.length])

  if (loading && !data) return <PageSkeleton rows={3} />
  const { guards = [], assignments = {} } = data ?? {}

  const toggleStatus = (g) => run(async () => { await guardService.setStatus(g.id, g.status !== 'Suspended'); await reload({ quiet: true }) })
  const toggleProperty = (g, p, assigned) => run(async () => {
    if (assigned) await propertyService.unassignGuard(p.id, g.id); else await propertyService.assignGuard(p.id, g.id)
    await reload({ quiet: true })
  })
  async function remove() {
    const done = await run(async () => { await guardService.remove(removing.id); return true })
    if (done) { setRemoving(null); reload({ quiet: true }) }
  }

  return (
    <>
      <Card title="Guards" sub="People who sign in to watch incidents and respond" flush actions={<Button icon="plus" onClick={() => { setError(null); setAdding(true) }}>Add guard</Button>}>
        <ErrorText message={error} />
        {guards.length === 0 ? <Empty icon="users" title="No guards yet">Add a guard so they can sign in, see the alerts and respond.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Guard</th><th>Status</th><th>Can see these properties</th><th /></tr></thead>
            <tbody>
              {guards.map((g) => (
                <tr key={g.id}>
                  <td><div className="who-cell"><Avatar name={g.fullName} /><div><div className="cell-main">{g.fullName}</div><div className="cell-sub">{g.email}</div></div></div></td>
                  <td><Badge tone={g.status === 'Suspended' ? 'bad' : 'ok'} dot>{g.status}</Badge></td>
                  <td>
                    <div className="cluster">
                      {properties.map((p) => {
                        const assigned = assignments[g.id]?.has(p.id) ?? false
                        return <button key={p.id} type="button" className="chip" aria-pressed={assigned} disabled={busy} aria-label={`${g.fullName} can see ${p.name}`} onClick={() => toggleProperty(g, p, assigned)}>{assigned ? <Icon name="check" /> : null}{p.name}</button>
                      })}
                    </div>
                  </td>
                  <td className="actions">
                    <Button small variant="secondary" disabled={busy} onClick={() => toggleStatus(g)}>{g.status === 'Suspended' ? 'Re-activate' : 'Suspend'}</Button>
                    <Button small variant="danger-ghost" icon="trash" disabled={busy} onClick={() => { setError(null); setRemoving(g) }}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
      <p className="footnote">A suspended guard is signed out at once and cannot sign in. A guard sees only the properties ticked here, and never their address.</p>
      {adding ? <AddGuard properties={properties} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload({ quiet: true }) }} /> : null}
      {removing ? <Confirm title={`Remove ${removing.fullName}?`} danger confirmLabel="Remove" busy={busy} message={error || 'Their account is deleted and any open session is closed.'} onConfirm={remove} onCancel={() => setRemoving(null)} /> : null}
    </>
  )
}

function AddGuard({ properties, onClose, onDone }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [chosen, setChosen] = useState(new Set(properties.map((p) => p.id)))
  const [problem, setProblem] = useState(null)
  const { run, busy, error } = useAction()

  async function submit(e) {
    e.preventDefault()
    const issue = (!fullName.trim() && "Enter the guard's name.") || checkEmail(email) || checkPassword(password)
    setProblem(issue || null)
    if (issue) return
    const done = await run(async () => {
      const guard = await guardService.create({ fullName: fullName.trim(), email: email.trim(), phoneNumber: phone.trim(), password })
      for (const id of chosen) await propertyService.assignGuard(id, guard.id)
      return true
    })
    if (done) onDone()
  }

  return (
    <Dialog title="Add guard" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="form-grid">
          <TextField label="Full name" value={fullName} onChange={setFullName} autoFocus />
          <TextField label="Phone (optional)" value={phone} onChange={setPhone} />
          <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="off" />
          <PasswordField label="Password (at least 8 characters)" value={password} onChange={setPassword} autoComplete="new-password" />
        </div>
        <div className="section-label">Can see these properties</div>
        <div className="stack-sm">
          {properties.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={chosen.has(p.id)} onChange={() => setChosen((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} />
              <span className="grow">{p.name}</span>
            </label>
          ))}
        </div>
        <ErrorText message={problem || error} />
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>Add guard</Button>
        </div>
      </form>
    </Dialog>
  )
}
