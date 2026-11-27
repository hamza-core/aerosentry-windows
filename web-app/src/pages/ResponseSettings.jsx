import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import { Badge, Button, Card, ErrorText, Field, KV, Notice, PageSkeleton, Spinner } from '../components/ui'
import { useSession } from '../state/session'
import { usePropertyData } from '../state/propertyData'
import { useAction, useLoad } from '../lib/hooks'
import { detectionService } from '../services/detectionService'
import { SETUP_STEPS, computeSetup } from '../lib/domain'

const THRESHOLDS = [50, 60, 70, 75, 80, 85, 90, 95]
const key = (propertyId) => `aerosentry.responseThreshold.${propertyId}`
const readThreshold = (propertyId) => { try { return Number(localStorage.getItem(key(propertyId))) || 85 } catch { return 85 } }

// Automatic response. With no drone yet, ACTIVATING it means the system starts WATCHING: detection/start on every
// wall of the property. DEACTIVATING stops the watching. A person at a watched wall raises an alert (pushed to the
// guards); the drone is sent later, when the drone feature exists. The ingest worker must be running to send the
// camera pictures to the model.
export default function ResponseSettings() {
  useTitle('Automatic response', [{ label: 'Settings', to: '/settings' }])
  const { property } = useSession()
  const data = usePropertyData()
  const ml = useLoad(() => detectionService.mlHealth(), [])
  const [threshold, setThreshold] = useState(readThreshold(property.id))
  const { run, busy, error, setError } = useAction()

  if (data.loading && !data.loaded) return <PageSkeleton rows={3} />
  const watching = data.walls.filter((w) => w.detectionEnabled).length
  const on = data.walls.length > 0 && watching === data.walls.length
  const setup = computeSetup({ cameras: data.cameras, walls: data.walls, grids: data.grids, responseOn: on })
  const missing = SETUP_STEPS.filter((s) => !s.optional && s.key !== 'response' && !s.done(setup)).map((s) => s.title.toLowerCase())

  async function apply(enable, level) {
    setError(null)
    const done = await run(async () => {
      for (const wall of data.walls) {
        if (enable) await detectionService.start(property.id, wall.id, level / 100)
        else if (wall.detectionEnabled) await detectionService.stop(property.id, wall.id)
      }
      return true
    })
    if (done) data.reload({ quiet: true })
  }

  const changeThreshold = (value) => {
    setThreshold(value)
    try { localStorage.setItem(key(property.id), String(value)) } catch { /* no storage */ }
    if (on) apply(true, value)                       // restart the watching with the new confidence
  }

  return (
    <>
      <Card title="Automatic response" sub={`Watching the walls of ${property.name}`} actions={<Badge tone={on ? 'ok' : 'warn'} dot>{on ? 'Activated' : 'Off'}</Badge>}
        footer={on
          ? <Button variant="danger" icon="power" busy={busy} onClick={() => apply(false)}>Deactivate</Button>
          : <><Button icon="power" busy={busy} disabled={missing.length > 0 || data.walls.length === 0} onClick={() => apply(true, threshold)}>Activate</Button>{missing.length > 0 ? <span className="footnote">Finish the setup first.</span> : null}</>}>
        <div className="stack">
          <p className="muted">Activating starts watching every wall. A person climbing a watched wall raises an alert for the owner and the assigned guards at once. The drone is not connected yet, so no drone is sent.</p>
          {!on && missing.length > 0 ? <Notice tone="warn" title="Finish the setup first">Still missing: {missing.join(', ')}. <Link to="/">See the setup progress</Link></Notice> : null}
          <ErrorText message={error} />
        </div>
      </Card>

      <Card title="Status" flush>
        <KV items={[
          ['Walls being watched', `${watching} of ${data.walls.length}`],
          ['Intrusion model', ml.loading ? <Spinner /> : ml.data?.available ? <Badge tone="ok" dot>{`Running · ${ml.data.device}`}</Badge> : <Badge tone="bad" dot>Not running</Badge>],
        ]} />
      </Card>
      {!ml.loading && ml.data && !ml.data.available ? <Notice tone="bad" title="The ML service is not running">{ml.data.message || 'Start it, then try again.'}</Notice> : null}

      <Card title="Confidence" sub="A lower value finds more climbers but gives more false alarms. Remembered in this browser.">
        <div style={{ maxWidth: 360 }}>
          <Field label="Raise an alarm when the model is at least this sure">
            <select value={threshold} onChange={(e) => changeThreshold(Number(e.target.value))} disabled={busy}>
              {THRESHOLDS.map((t) => <option key={t} value={t}>{t}%</option>)}
            </select>
          </Field>
        </div>
      </Card>
      <p className="footnote">The ingest worker program must be running: it sends the camera pictures to the model. Without it, a watched wall sees nothing.</p>
    </>
  )
}
