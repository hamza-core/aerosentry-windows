import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import { Badge, Card, Empty, ErrorText, PageHeader, PageSkeleton, ProgressBar, SearchBox, Tabs } from '../components/ui'
import { useSession } from '../state/session'
import { useLoad, useOnAlertsChanged } from '../lib/hooks'
import { alertService } from '../services/alertService'
import { alertStatus, formatDateTime } from '../lib/format'

export default function Incidents() {
  useTitle('Incidents')
  const { property } = useSession()
  const navigate = useNavigate()
  const [tab, setTab] = useState('active')
  const [query, setQuery] = useState('')
  const { data, error, loading, reload } = useLoad(() => alertService.list({ propertyId: property.id, pageSize: 100 }), [property.id])
  useOnAlertsChanged(() => reload({ quiet: true }))        // a new alert appears by itself: no refresh needed

  const items = data?.items ?? []
  const active = items.filter((a) => alertStatus(a.status).active)
  const history = items.filter((a) => !alertStatus(a.status).active)
  const shown = useMemo(() => {
    const base = tab === 'active' ? active : tab === 'history' ? history : items
    const q = query.trim().toLowerCase()
    return q ? base.filter((a) => `${a.incidentCode} ${a.wallName} ${a.cellLabel ?? ''} ${a.cameraName} ${alertStatus(a.status).label} ${a.recognizedPerson?.name ?? ''}`.toLowerCase().includes(q)) : base
  }, [tab, query, items, active, history])

  if (loading && !data) return <PageSkeleton />

  return (
    <>
      <PageHeader title="Incidents" subtitle={`${property.name} · new incidents appear here by themselves`} />
      <ErrorText message={error} />
      <Card flush>
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'active', label: 'Active', count: active.length }, { value: 'history', label: 'History', count: history.length }, { value: 'all', label: 'All', count: items.length }]} />
        <div className="toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search incidents…" /></div>
        {shown.length === 0 ? (
          query ? <Empty icon="search" title="No incident matches">Try another word.</Empty>
            : tab === 'active' ? <Empty icon="shield-check" title="No active incidents">When a person is detected at a watched wall it appears here at once.</Empty>
              : <Empty icon="clock" title="Nothing here yet">Closed incidents are listed here.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Incident</th><th>Location</th><th>Camera</th><th>Confidence</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map((a) => {
                  const s = alertStatus(a.status)
                  return (
                    <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/incidents/${a.id}`)}>
                      <td><div className="cell-main"><Link to={`/incidents/${a.id}`} className="cell-id" onClick={(e) => e.stopPropagation()}>{a.incidentCode}</Link></div><div className="cell-sub">{formatDateTime(a.createdAtUtc)}</div></td>
                      <td><div className="cell-main">{a.wallName}</div><div className="cell-sub">{a.cellLabel ? `Cell ${a.cellLabel}` : 'Outside every cell'}</div></td>
                      <td>{a.cameraName}</td>
                      <td><span className="confbar"><ProgressBar value={a.probability * 100} /><span>{Math.round(a.probability * 100)}%</span></span></td>
                      <td><div className="cluster">{a.recognizedPerson ? <Badge tone="ok">{a.recognizedPerson.name}</Badge> : null}<Badge tone={s.tone} dot>{s.label}</Badge></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.totalCount > items.length ? <div className="card-foot"><span className="footnote">Showing the newest {items.length} of {data.totalCount}.</span></div> : null}
      </Card>
    </>
  )
}
