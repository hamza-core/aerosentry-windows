import { Link } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import LiveDetection from '../components/LiveDetection'
import { Badge, Card, Empty, ErrorText, Notice, PageHeader, PageSkeleton } from '../components/ui'
import { useSession } from '../state/session'
import { usePropertyData } from '../state/propertyData'
import { useLoad, useOnAlertsChanged } from '../lib/hooks'
import { alertService } from '../services/alertService'
import { alertStatus, percent } from '../lib/format'

// Every wall of the property: the watched ones show what the model sees right now.
export default function LiveDetectionPage() {
  useTitle('Live detection')
  const { property, isAdmin } = useSession()
  const data = usePropertyData()
  const alerts = useLoad(() => alertService.list({ propertyId: property.id }), [property.id])
  useOnAlertsChanged(() => { alerts.reload({ quiet: true }); data.reload({ quiet: true }) })

  if (data.loading && !data.loaded) return <PageSkeleton rows={2} />
  const watched = data.walls.filter((w) => w.detectionEnabled)
  const active = (alerts.data?.items ?? []).filter((a) => alertStatus(a.status).active)

  return (
    <>
      <PageHeader title="Live detection" subtitle={`${property.name} · what the model sees right now`} />
      <ErrorText message={data.error || alerts.error} />
      {watched.length === 0 ? (
        <Card>
          <Empty icon="eye" title="No wall is being watched" action={isAdmin ? <Link className="btn" to="/settings/response">Turn on automatic response</Link> : null}>
            {data.walls.length === 0 ? 'Set up a camera and a wall first.' : 'Nothing is analysed until automatic response is activated.'}
          </Empty>
        </Card>
      ) : (
        <>
          <Notice tone="info" title="How to read the picture">
            Orange box: a person. Red box and “ALARM”: the model sees a wall crossing. It moves as fast as the model analyses, a few pictures a second.
          </Notice>
          <div className={watched.length > 1 ? 'grid cols-2' : 'stack'}>
            {watched.map((wall) => {
              const incident = active.find((a) => a.wallId === wall.id)
              return (
                <Card key={wall.id} title={wall.name} sub={wall.cameraName}
                  actions={incident ? <Link className="btn small" to={`/incidents/${incident.id}`}>{incident.incidentCode} · {incident.cellLabel ?? 'outside the cells'} · {percent(incident.probability)}</Link> : <Badge tone="ok" dot>Watching</Badge>}>
                  <LiveDetection propertyId={property.id} wallId={wall.id} label={wall.name} />
                </Card>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
