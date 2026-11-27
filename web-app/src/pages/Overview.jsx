import { Link } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import LiveVideo from '../components/LiveVideo'
import { Badge, Card, Empty, ErrorText, Notice, PageHeader, PageSkeleton, ProgressBar, Row, StatCard, Icon } from '../components/ui'
import { useSession } from '../state/session'
import { usePropertyData } from '../state/propertyData'
import { useLoad, useOnAlertsChanged } from '../lib/hooks'
import { alertService } from '../services/alertService'
import { alertStatus, formatDateTime, percent } from '../lib/format'
import { SETUP_STEPS, computeSetup } from '../lib/domain'

export default function Overview() {
  useTitle('Overview')
  const { isAdmin, property } = useSession()
  const data = usePropertyData()
  const alerts = useLoad(() => alertService.list({ propertyId: property.id, pageSize: 50 }), [property.id])
  useOnAlertsChanged(() => alerts.reload({ quiet: true }))

  const watching = data.walls.filter((w) => w.detectionEnabled).length
  const responseOn = data.walls.length > 0 && watching === data.walls.length
  const setup = computeSetup({ cameras: data.cameras, walls: data.walls, grids: data.grids, responseOn })
  const required = SETUP_STEPS.filter((s) => !s.optional)
  const doneCount = required.filter((s) => s.done(setup)).length
  const ready = doneCount === required.length
  const items = alerts.data?.items ?? []
  const active = items.filter((a) => alertStatus(a.status).active)

  if (data.loading && !data.loaded) return <PageSkeleton />

  return (
    <>
      <PageHeader title={property.name}
        subtitle={[isAdmin ? property.address : null, active.length ? `${active.length} open incident${active.length > 1 ? 's' : ''}` : ready ? (responseOn ? 'System armed and watching' : 'Ready to arm') : 'Setup in progress'].filter(Boolean).join(' · ')}
        actions={isAdmin && !ready ? <Link className="btn" to="/cameras/new">Continue setup</Link> : null} />
      <ErrorText message={data.error || alerts.error} />

      {active[0] ? (
        <Notice tone="bad" title={`Active incident ${active[0].incidentCode}`}>
          Person detected in {active[0].wallName} / {active[0].cellLabel ?? 'outside the cells'} · {percent(active[0].probability)} · {active[0].cameraName}.{' '}
          <Link to={`/incidents/${active[0].id}`}><strong>Respond now</strong></Link>
        </Notice>
      ) : null}

      <div className="stats">
        <StatCard to="/incidents" icon="alert" tone={active.length ? 'bad' : 'ok'} label="Open incidents" value={active.length} hint={active.length ? 'Need a guard' : 'All clear'} />
        <StatCard to="/cameras" icon="video" label="Cameras" value={data.cameras.length} hint={data.cameras.length ? 'Configured' : 'None yet'} />
        <StatCard to="/perimeter" icon="shield" tone={responseOn ? 'ok' : data.walls.length ? 'warn' : ''} label="Walls watched" value={`${watching} / ${data.walls.length}`} hint={responseOn ? 'Automatic response on' : 'Response is off'} />
        <StatCard to={isAdmin ? '/settings/response' : undefined} icon={ready ? 'shield-check' : 'activity'} tone={ready ? 'ok' : 'warn'} label="System" value={ready ? 'Ready' : 'Setup'} hint={`${doneCount} of ${required.length} steps done`} />
      </div>

      <div className="grid main-side">
        <div className="stack">
          <Card title="Live cameras" sub={data.cameras.length ? `${data.cameras.length} camera${data.cameras.length > 1 ? 's' : ''}` : undefined}
            actions={data.cameras.length ? <Link className="btn secondary small" to="/cameras">All cameras</Link> : null}>
            {data.cameras.length === 0
              ? <Empty icon="video" title="No cameras yet" action={isAdmin ? <Link className="btn" to="/cameras/new">Add a camera</Link> : null}>{isAdmin ? 'Add a phone or CCTV camera to see its live picture here.' : 'No cameras are set up for this property.'}</Empty>
              : <div className="grid cols-2">{data.cameras.slice(0, 2).map((c) => <LiveVideo key={c.id} camera={c} />)}</div>}
          </Card>

          <Card title="Recent incidents" flush actions={<Link className="btn secondary small" to="/incidents">View all</Link>}>
            {items.length === 0 ? <Empty icon="shield-check" title="No incidents yet">Alerts appear here the moment a person is detected at a watched wall.</Empty> : (
              <div className="table-wrap"><table className="table"><tbody>
                {items.slice(0, 5).map((a) => {
                  const s = alertStatus(a.status)
                  return (
                    <tr key={a.id}>
                      <td><div className="cell-main"><Link to={`/incidents/${a.id}`} className="cell-id">{a.incidentCode}</Link></div><div className="cell-sub">{formatDateTime(a.createdAtUtc)}</div></td>
                      <td>{a.wallName} / {a.cellLabel ?? 'outside the cells'}<div className="cell-sub">{a.cameraName}</div></td>
                      <td className="num">{percent(a.probability)}</td>
                      <td className="actions"><Badge tone={s.tone} dot>{s.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody></table></div>
            )}
          </Card>
        </div>

        <div className="stack">
          {isAdmin ? (
            <Card title="Setup progress" sub={`${doneCount} of ${required.length} required steps`} flush>
              <div style={{ padding: '14px 18px 4px' }}><ProgressBar value={(doneCount / required.length) * 100} tone={ready ? 'ok' : ''} /></div>
              {SETUP_STEPS.map((step) => {
                const done = step.done(setup)
                return (
                  <Link key={step.key} to={step.to} className={`setup-step ${done ? 'done' : ''}`}>
                    <span className="tick">{done ? <Icon name="check" /> : null}</span>
                    <span className="grow"><span className="t">{step.title}</span><br /><span className="s">{step.text(setup)}</span></span>
                    <Icon name="chevron-right" size={16} />
                  </Link>
                )
              })}
            </Card>
          ) : !ready ? (
            <Notice tone="warn" title="System not configured">This property is not fully set up, so Aerosentry cannot monitor it yet. A security admin needs to finish the setup.</Notice>
          ) : null}

          {ready && data.walls.length ? (
            <Card title="Protected walls" flush>
              <div className="rows">
                {data.walls.map((w) => (
                  <Row key={w.id} to={`/perimeter/walls/${w.id}`} title={w.name} sub={`${w.cameraName} · ${w.cells.length} cells · ${Math.round(w.totalLengthMeters)} m`}>
                    <Badge tone={w.detectionEnabled ? 'ok' : 'warn'} dot>{w.detectionEnabled ? 'Watching' : 'Not watching'}</Badge>
                  </Row>
                ))}
              </div>
            </Card>
          ) : null}

          {ready && !responseOn && isAdmin ? (
            <Notice tone="warn" title="Automatic response is off">The walls are set up but not being watched.<br /><Link to="/settings/response"><strong>Activate it</strong></Link></Notice>
          ) : null}
        </div>
      </div>
    </>
  )
}
