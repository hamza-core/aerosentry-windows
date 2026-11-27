import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import FaceCapture from '../components/FaceCapture'
import { Button, Card, ErrorText, Field, Notice, PageHeader, TextField } from '../components/ui'
import { useSession } from '../state/session'
import { useAction } from '../lib/hooks'
import { personService } from '../services/personService'

const today = () => new Date().toISOString().slice(0, 10)

export default function EnrollPerson() {
  useTitle('Enroll person', [{ label: 'Settings', to: '/settings' }, { label: 'Authorized people', to: '/settings/people' }])
  const { property } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('Resident')
  const [phone, setPhone] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [note, setNote] = useState('')
  const [video, setVideo] = useState(null)
  const [frames, setFrames] = useState(null)
  const [problem, setProblem] = useState(null)
  const { run, busy, error } = useAction()

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return setProblem("Enter the person's name.")
    if (phone.trim() && !/^[0-9+ ()-]+$/.test(phone.trim())) return setProblem('Enter a valid phone number, or leave it empty.')
    if (!video && !frames) return setProblem('Capture the face frames first, or choose a video file.')
    setProblem(null)
    const details = { name: name.trim(), category, phone: phone.trim(), validUntil, note: note.trim() }
    const created = await run(() => (frames ? personService.enrollCaptured(property.id, details, frames) : personService.enrollFrames(property.id, details, video)))
    if (created) navigate('/settings/people', { replace: true })
  }

  return (
    <form onSubmit={submit} className="stack">
      <PageHeader title="Enroll a person" subtitle="Add a face that is not treated as an intruder"
        actions={<><Button type="button" variant="secondary" onClick={() => navigate('/settings/people')}>Cancel</Button><Button type="submit" busy={busy} disabled={!video && !frames}>{busy ? 'Saving the face…' : 'Enroll person'}</Button></>} />
      <ErrorText message={problem || error} />
      {/* The camera comes first and gets the page's width (up to 640 px, the size the frames are judged at), so the counter,
          the box and the message do not cover the face. */}
      <div className="stack" style={{ maxWidth: 680 }}>
        <FaceCapture propertyId={property.id} video={video} onFrames={setFrames} onVideo={setVideo} />
        <Card title="Details">
          <div className="stack">
            <TextField label="Name" value={name} onChange={setName} autoFocus />
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)}><option>Resident</option><option>Employee</option><option>Visitor</option></select>
            </Field>
            <TextField label="Phone (optional)" value={phone} onChange={setPhone} />
            <Field label="Valid until (optional, the last day counts)"><input type="date" min={today()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
            <Field label="Note (optional)"><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
        </Card>
        <Notice title={frames ? '30 frames ready' : video ? 'Video ready' : 'No frames yet'}>A frame counts when it shows exactly one face, close enough. Of up to 45 good frames the 30 sharpest are stored with the person, and deleted when the person is removed.</Notice>
        <p className="footnote">This does not check that a live person is in front of the camera: a video of a video would pass. Enrol only people who are present and agree.</p>
      </div>
    </form>
  )
}
