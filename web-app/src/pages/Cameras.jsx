import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import LiveVideo from '../components/LiveVideo'
import { Badge, Button, Card, Confirm, Empty, ErrorText, Icon, Notice, PageHeader, PageSkeleton } from '../components/ui'
import { useSession } from '../state/session'
import { usePropertyData } from '../state/propertyData'
import { useAction } from '../lib/hooks'
import { usesRtspPath } from '../lib/domain'
import { cameraService } from '../services/cameraService'

const SOURCE = { MobileApp: 'Phone camera', Onvif: 'CCTV · ONVIF', Rtsp: 'CCTV · RTSP' }

export default function Cameras() {
  useTitle('Cameras')
  const { isAdmin, property } = useSession()
  const { cameras, loaded, loading, error, reload } = usePropertyData()
  const [removing, setRemoving] = useState(null)
  const { run, busy, error: removeError, setError } = useAction()

  if (loading && !loaded) return <PageSkeleton rows={2} />

  async function remove() {
    const done = await run(async () => { await cameraService.remove(property.id, removing.id); return true })
    if (done) { setRemoving(null); reload() }
  }

  return (
    <>
      <PageHeader title="Cameras" subtitle={cameras.length ? `${cameras.length} camera${cameras.length > 1 ? 's' : ''} at ${property.name}` : `Cameras at ${property.name}`}
        actions={isAdmin ? <Link to="/cameras/new" className="btn"><Icon name="plus" /> Add camera</Link> : null} />
      <ErrorText message={error} />
      {cameras.length === 0 ? (
        <Card><Empty icon="video" title="No cameras yet" action={isAdmin ? <Link to="/cameras/new" className="btn">Add a camera</Link> : null}>
          {isAdmin ? 'Add a phone camera or a CCTV / NVR camera. You mark the walls on its picture later.' : 'No cameras are set up for this property.'}
        </Empty></Card>
      ) : (
        <div className="grid cameras">
          {cameras.map((c) => {
            const viaServer = usesRtspPath(c) || c.sourceType !== 'MobileApp'
            return (
              <div key={c.id} className="card">
                <LiveVideo camera={c} label={c.name} />
                <div className="card-body">
                  <div className="cam-meta">
                    <div className="grow">
                      <h3>{c.name}</h3>
                      <div className="cluster" style={{ marginTop: 6 }}>
                        <Badge tone="grey">{SOURCE[c.sourceType] ?? c.sourceType}</Badge>
                        <Badge tone={viaServer ? 'ok' : ''}>{viaServer ? 'Via media server' : 'Direct'}</Badge>
                      </div>
                      <div className="addr">{c.host}:{c.port}{c.streamPath || ''}</div>
                    </div>
                    {isAdmin ? <Button small variant="danger-ghost" icon="trash" onClick={() => { setError(null); setRemoving(c) }}>Delete</Button> : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {cameras.length > 0 ? <Notice title="Via media server or Direct?">“Via media server” cameras are watched through MediaMTX, which keeps one connection to the camera for every screen and for the detection worker. “Direct” cameras are watched straight from the phone and cannot be used while the detection worker uses the same phone.</Notice> : null}
      {removing ? (
        <Confirm title={`Delete ${removing.name}?`} danger confirmLabel="Delete" busy={busy}
          message={removeError || 'The camera is removed. A wall that uses it must be deleted first.'}
          onConfirm={remove} onCancel={() => setRemoving(null)} />
      ) : null}
    </>
  )
}
