import { useState } from 'react'
import { useTitle } from '../components/Layout'
import PropertyForm from '../components/PropertyForm'
import { Badge, Button, Card, Confirm, Dialog, Empty, ErrorText } from '../components/ui'
import { useSession } from '../state/session'
import { useAction } from '../lib/hooks'
import { propertyService } from '../services/propertyService'

export default function Properties() {
  useTitle('Properties', [{ label: 'Settings', to: '/settings' }])
  const { properties, property, selectProperty, reloadProperties } = useSession()
  const [editing, setEditing] = useState(null)         // null | 'new' | a property
  const [removing, setRemoving] = useState(null)
  const { run, busy, error, setError } = useAction()

  async function save(values) {
    const saved = await run(() => (editing === 'new' ? propertyService.create(values) : propertyService.update(editing.id, values)))
    if (saved) { setEditing(null); await reloadProperties(editing === 'new' ? saved.id : property?.id) }
  }
  async function remove() {
    const done = await run(async () => { await propertyService.remove(removing.id); return true })
    if (done) { setRemoving(null); await reloadProperties() }
  }

  return (
    <>
      <Card title="Properties" sub="Aerosentry protects one property at a time. Use the selector at the top to switch." flush
        actions={<Button icon="plus" onClick={() => { setError(null); setEditing('new') }}>Add property</Button>}>
        {properties.length === 0 ? <Empty icon="building" title="No properties">Add your first property.</Empty> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Property</th><th>Note</th><th>Location</th><th /></tr></thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id}>
                  <td><div className="cell-main">{p.name}</div><div className="cell-sub">{p.address}</div></td>
                  <td className="cell-sub">{p.note || '—'}</td>
                  <td className="cell-sub">{p.latitude != null ? `${p.latitude}, ${p.longitude}` : '—'}</td>
                  <td className="actions">
                    {p.id === property?.id ? <Badge tone="ok" dot>Selected</Badge> : <Button small variant="secondary" onClick={() => selectProperty(p.id)}>Select</Button>}
                    <Button small variant="secondary" icon="edit" onClick={() => { setError(null); setEditing(p) }}>Edit</Button>
                    <Button small variant="danger-ghost" icon="trash" onClick={() => { setError(null); setRemoving(p) }}>Delete</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
      {editing ? (
        <Dialog title={editing === 'new' ? 'Add property' : 'Edit property'} onClose={() => setEditing(null)} wide>
          <PropertyForm initial={editing === 'new' ? undefined : editing} submitLabel="Save" busy={busy} error={error} onSubmit={save} onCancel={() => setEditing(null)} />
        </Dialog>
      ) : null}
      {removing ? <Confirm title={`Delete ${removing.name}?`} danger confirmLabel="Delete" busy={busy} message="Its cameras, walls, alerts, people and guard assignments are removed for good." onConfirm={remove} onCancel={() => setRemoving(null)} /> : null}
      <ErrorText message={!editing && !removing ? error : null} />
    </>
  )
}
