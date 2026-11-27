import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import { Avatar, Badge, Button, Card, Confirm, ErrorText, Field, KV, Notice, PageHeader, PageSkeleton, Row, TextField, useToast } from '../components/ui'
import { statusTone } from './People'
import { useSession } from '../state/session'
import { useAction, useLoad } from '../lib/hooks'
import { personService } from '../services/personService'

export default function PersonDetail() {
  const { personId } = useParams()
  const { property } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const person = useLoad(() => personService.get(property.id, personId), [property.id, personId])
  const [form, setForm] = useState(null)
  const [photos, setPhotos] = useState({})
  const [removing, setRemoving] = useState(false)
  const { run, busy, error, setError } = useAction()
  useTitle(person.data?.name ?? 'Person', [{ label: 'Settings', to: '/settings' }, { label: 'Authorized people', to: '/settings/people' }])

  useEffect(() => {
    const p = person.data
    if (!p) return undefined
    setForm({ name: p.name, phone: p.phone ?? '', category: p.category, validUntil: p.validUntil ?? '', note: p.note ?? '' })
    let cancelled = false
    const urls = []
    Promise.all((p.photoAngles ?? []).map(async (angle) => {
      try { const { blob } = await personService.photo(property.id, p.id, angle); const url = URL.createObjectURL(blob); urls.push(url); return [angle, url] } catch { return null }
    })).then((entries) => { if (!cancelled) setPhotos(Object.fromEntries(entries.filter(Boolean))) })
    return () => { cancelled = true; urls.forEach(URL.revokeObjectURL) }
  }, [person.data?.id])

  if (person.loading && !person.data) return <PageSkeleton rows={3} />
  if (person.error) return <ErrorText message={person.error} />
  if (!form) return <PageSkeleton rows={3} />
  const p = person.data
  const set = (patch) => setForm({ ...form, ...patch })

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return setError("Enter the person's name.")
    const updated = await run(() => personService.update(property.id, p.id, {
      name: form.name.trim(), phone: form.phone.trim() || null, category: form.category, validUntil: form.validUntil || null, note: form.note.trim() || null,
    }))
    if (updated) { person.setData(updated); toast({ title: 'Details saved', tone: 'ok' }) }
  }
  const toggleAccess = async () => {
    const done = await run(async () => { await personService.setAccess(property.id, p.id, !p.accessDisabled); return true })
    if (done) { person.reload({ quiet: true }); toast({ title: p.accessDisabled ? 'Access switched on' : 'Access switched off', tone: 'ok' }) }
  }
  async function remove() {
    const done = await run(async () => { await personService.remove(property.id, p.id); return true })
    if (done) navigate('/settings/people', { replace: true })
  }

  return (
    <>
      <PageHeader title={p.name} subtitle={`${p.category} · enrolled ${new Date(p.enrolledAtUtc).toLocaleDateString()}`} actions={<Badge tone={statusTone(p.status)} dot>{p.status}</Badge>} />
      <div className="grid main-side">
        <div className="stack">
          <Card title="Face photos" sub={`The ${(p.photoAngles ?? []).length} pictures the face profile was built from`}>
            <div className="photo-grid" style={(p.photoAngles ?? []).length > 3 ? { gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' } : undefined}>
              {(p.photoAngles ?? []).map((a) => photos[a] ? <figure key={a}><img src={photos[a]} alt={`${p.name}, ${a} photo`} /><figcaption>{a.replace(/^Frame0?/, 'Frame ')}</figcaption></figure> : null)}
            </div>
          </Card>
          <form onSubmit={save}>
            <Card title="Details" footer={<Button type="submit" busy={busy}>Save details</Button>}>
              <div className="stack">
                <div className="form-grid">
                  <TextField label="Name" value={form.name} onChange={(name) => set({ name })} />
                  <Field label="Category"><select value={form.category} onChange={(e) => set({ category: e.target.value })}><option>Resident</option><option>Employee</option><option>Visitor</option></select></Field>
                  <TextField label="Phone" value={form.phone} onChange={(phone) => set({ phone })} />
                  <Field label="Valid until (the last day counts)"><input type="date" value={form.validUntil} onChange={(e) => set({ validUntil: e.target.value })} /></Field>
                  <div className="full"><TextField label="Note" value={form.note} onChange={(note) => set({ note })} /></div>
                </div>
                <ErrorText message={error} />
              </div>
            </Card>
          </form>
        </div>
        <div className="stack sticky">
          <Card title="Access" flush>
            <div className="rows">
              <Row title={p.accessDisabled ? 'Access is switched off' : 'Access is on'} sub="A person with access off is treated like anyone else.">
                <Button small variant="secondary" disabled={busy} onClick={toggleAccess}>{p.accessDisabled ? 'Switch on' : 'Switch off'}</Button>
              </Row>
            </div>
          </Card>
          <Card title="Remove" sub="Deletes their photos and face data for good. To change the photos, remove the person and enrol again.">
            <Button variant="danger" icon="trash" onClick={() => { setError(null); setRemoving(true) }}>Remove person</Button>
          </Card>
        </div>
      </div>
      {removing ? <Confirm title={`Remove ${p.name}?`} danger confirmLabel="Remove" busy={busy} message={error || 'Their photos and face data are deleted for good.'} onConfirm={remove} onCancel={() => setRemoving(false)} /> : null}
    </>
  )
}
