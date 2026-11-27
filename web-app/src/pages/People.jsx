import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import { Avatar, Badge, Card, Empty, ErrorText, Icon, Notice, PageSkeleton, SearchBox } from '../components/ui'
import { useSession } from '../state/session'
import { useLoad } from '../lib/hooks'
import { personService } from '../services/personService'

export const statusTone = (status) => (status === 'Authorized' ? 'ok' : status === 'Expired' ? 'warn' : 'grey')

export default function People() {
  useTitle('Authorized people', [{ label: 'Settings', to: '/settings' }])
  const { property } = useSession()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const { data, error, loading } = useLoad(() => personService.list(property.id), [property.id])
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data ?? []).filter((p) => !q || `${p.name} ${p.category} ${p.status}`.toLowerCase().includes(q))
  }, [data, query])

  if (loading && !data) return <PageSkeleton rows={3} />
  return (
    <>
      <Notice title="Not treated as intruders">
        When the wall model raises an alarm, the system also looks for faces. A person who is enrolled here and recognised is shown on the alert, and a guard confirms it. An alert is never hidden.
      </Notice>
      <Card title="Authorized people" sub={data?.length ? `${data.length} enrolled at ${property.name}` : undefined} flush
        actions={<Link to="/settings/people/new" className="btn"><Icon name="plus" /> Enroll person</Link>}>
        <ErrorText message={error} />
        {data && data.length > 0 ? <div className="toolbar"><SearchBox value={query} onChange={setQuery} placeholder="Search people…" /></div> : null}
        {data && data.length === 0 ? <Empty icon="face" title="Nobody enrolled yet">Enrol the people who live or work here, so that a guard sees right away when a known person is at the wall.</Empty> : null}
        {data && data.length > 0 ? (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Person</th><th>Category</th><th>Valid until</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/settings/people/${p.id}`)}>
                  <td><div className="who-cell"><Avatar name={p.name} /><div><div className="cell-main"><Link to={`/settings/people/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.name}</Link></div>{p.phone ? <div className="cell-sub">{p.phone}</div> : null}</div></div></td>
                  <td>{p.category}</td>
                  <td>{p.validUntil ?? <span className="muted">No expiry</span>}</td>
                  <td><Badge tone={statusTone(p.status)} dot>{p.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : null}
      </Card>
    </>
  )
}
