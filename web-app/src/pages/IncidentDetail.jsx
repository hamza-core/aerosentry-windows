import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import LiveDetection from '../components/LiveDetection'
import { Badge, Button, Card, Confirm, ErrorText, Field, KV, Notice, PageHeader, PageSkeleton } from '../components/ui'
import { useSession } from '../state/session'
import { useAction, useLoad, useOnAlertsChanged } from '../lib/hooks'
import { alertService } from '../services/alertService'
import { actionSentence, alertStatus, formatDateTime, percent } from '../lib/format'

// What a person can do depends on the alert's status and their role (the server decides too: 409 / 403).
const ACTIONS = [
  { key: 'acknowledge', label: 'I am on it', from: ['New'], variant: '', icon: 'eye' },
  { key: 'confirm-authorized', label: 'Authorized person', from: ['New', 'Acknowledged'], variant: 'secondary', icon: 'face', confirm: 'I looked at the picture and this is an authorized person. The incident will be closed.' },
  { key: 'mark-false-alarm', label: 'False alarm', from: ['New', 'Acknowledged'], variant: 'secondary', icon: 'x', confirm: 'The incident will be saved to history as a false alarm.' },
  { key: 'escalate', label: 'Escalate to authority', from: ['New', 'Acknowledged'], variant: 'secondary', icon: 'alert', adminOnly: true, confirm: 'The incident will be passed to the authorities.' },
  { key: 'close', label: 'Resolved', from: ['New', 'Acknowledged', 'Escalated'], variant: 'secondary', icon: 'check', confirm: 'The incident will be saved to history as resolved.' },
]

export default function IncidentDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useSession()
  const alert = useLoad(() => alertService.get(id), [id])
  const history = useLoad(() => alertService.listActions(id), [id])
  const [picture, setPicture] = useState(null)
  const [pending, setPending] = useState(null)
  const [note, setNote] = useState('')
  const { run, busy, error, setError } = useAction()
  useTitle(alert.data ? alert.data.incidentCode : 'Incident', [{ label: 'Incidents', to: '/incidents' }])
  useOnAlertsChanged(() => { alert.reload({ quiet: true }); history.reload({ quiet: true }) })

  // The picture taken at the moment of the alarm. It needs the login token, so it is fetched, not linked.
  useEffect(() => {
    let url = null
    let cancelled = false
    alertService.snapshot(id).then(({ blob }) => { if (!cancelled) { url = URL.createObjectURL(blob); setPicture(url) } }).catch(() => {})
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [id])

  if (alert.loading && !alert.data) return <PageSkeleton rows={3} />
  if (alert.error) return <><ErrorText message={alert.error} /><div><Button variant="secondary" onClick={() => navigate('/incidents')}>Back to incidents</Button></div></>
  const a = alert.data
  const s = alertStatus(a.status)
  const available = ACTIONS.filter((x) => x.from.includes(a.status) && (isAdmin || !x.adminOnly))

  async function perform(action) {
    const updated = await run(() => alertService.act(action.key, a.id, note.trim()))
    if (updated) { setPending(null); setNote(''); alert.setData(updated); history.reload({ quiet: true }) }
  }

  return (
    <>
      <PageHeader title={`${a.incidentCode} · ${a.wallName} / ${a.cellLabel ?? 'outside the cells'}`}
        subtitle={`${formatDateTime(a.createdAtUtc)} · ${a.cameraName}`} actions={<Badge tone={s.tone} dot>{s.label}</Badge>} />

      {a.recognizedPerson ? (
        <Notice tone="warn" title={`Looks like ${a.recognizedPerson.name} (${a.recognizedPerson.category})`}>
          {a.autoResponseSkipped ? 'No automatic response was sent. ' : ''}A guard must look at the picture and confirm.
        </Notice>
      ) : null}

      <div className="grid main-side">
        <div className="stack">
          {alertStatus(a.status).active ? (
            <Card title="Live now" sub="What the model sees at this wall (while it is watched)">
              <LiveDetection propertyId={a.propertyId} wallId={a.wallId} label={a.wallName} />
            </Card>
          ) : null}
          <Card title="Alarm picture" sub="Taken at the moment of the alarm">
            {picture ? <img src={picture} alt="The moment of the alarm" style={{ borderRadius: 10, width: '100%', maxWidth: 720, display: 'block' }} /> : <p className="muted">No picture was kept for this alarm.</p>}
          </Card>
          <Card title="History" flush>
            <ul className="timeline">
              <li><time>{formatDateTime(a.createdAtUtc)}</time>Person detected in {a.wallName} / {a.cellLabel ?? 'outside the cells'} ({percent(a.probability)}) by {a.cameraName}</li>
              {(history.data ?? []).map((h) => <li key={h.id}><time>{formatDateTime(h.atUtc)}</time>{actionSentence(h)}</li>)}
            </ul>
          </Card>
        </div>

        <div className="stack sticky">
          <Card title="Where" flush>
            <KV items={[['Wall', a.wallName], ['Cell', a.cellLabel ?? 'Outside every marked cell'], ['Camera', a.cameraName], ['Confidence', percent(a.probability)], ['Property', a.propertyName]]} />
          </Card>
          {available.length > 0 ? (
            <Card title="Respond">
              <div className="stack">
                <Field label="Note (optional)"><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to the history" /></Field>
                <div className="stack-sm">
                  {available.map((x) => <Button key={x.key} variant={x.variant} icon={x.icon} block busy={busy && !pending} onClick={() => (x.confirm ? setPending(x) : perform(x))}>{x.label}</Button>)}
                </div>
                <ErrorText message={error} />
                <p className="footnote">The drone is not connected yet, so there is no drone control here.</p>
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {pending ? (
        <Confirm title={`${pending.label}?`} message={pending.confirm} confirmLabel={pending.label} busy={busy}
          onConfirm={() => perform(pending)} onCancel={() => { setPending(null); setError(null) }} />
      ) : null}
    </>
  )
}
