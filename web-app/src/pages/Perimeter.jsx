import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import GridDialog from '../components/GridDialog'
import { Badge, Button, Card, Empty, ErrorText, Icon, PageHeader, PageSkeleton } from '../components/ui'
import { useSession } from '../state/session'
import { usePropertyData } from '../state/propertyData'
import { wallState } from '../lib/domain'

export default function Perimeter() {
  useTitle('Perimeter')
  const { isAdmin, property } = useSession()
  const { walls, grids, loaded, loading, error, reload } = usePropertyData()
  const [addingGrid, setAddingGrid] = useState(false)
  const navigate = useNavigate()

  if (loading && !loaded) return <PageSkeleton rows={3} />
  return (
    <>
      <PageHeader title="Perimeter" subtitle="Walls the cameras watch, and the laser grids the drone flies over"
        actions={isAdmin ? <><Button variant="secondary" icon="grid" onClick={() => setAddingGrid(true)}>Add laser grid</Button><Link to="/perimeter/walls/new" className="btn"><Icon name="plus" /> Create wall</Link></> : null} />
      <ErrorText message={error} />

      <Card title="Walls" sub={walls.length ? `${walls.length} wall${walls.length > 1 ? 's' : ''}` : undefined} flush>
        {walls.length === 0 ? (
          <Empty icon="shield" title="No walls yet" action={isAdmin ? <Link to="/perimeter/walls/new" className="btn">Create a wall</Link> : null}>
            {isAdmin ? 'Create a wall to start protecting a perimeter. You mark it on a picture from its camera.' : 'No walls are set up for this property.'}
          </Empty>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Wall</th><th>Camera</th><th className="num">Cells</th><th className="num">Length</th><th>Status</th></tr></thead>
            <tbody>
              {walls.map((w) => {
                const state = wallState(w)
                return (
                  <tr key={w.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/perimeter/walls/${w.id}`)}>
                    <td><div className="cell-main"><Link to={`/perimeter/walls/${w.id}`} onClick={(e) => e.stopPropagation()}>{w.name}</Link></div></td>
                    <td>{w.cameraName}</td>
                    <td className="num">{w.cells.length}</td>
                    <td className="num">{Math.round(w.totalLengthMeters)} m</td>
                    <td><div className="cluster">{w.detectionEnabled ? <Badge tone="ok" dot>Watching</Badge> : null}<Badge tone={state.tone}>{state.label}</Badge></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </Card>

      <Card title="Laser grids" sub="Squares on the ground. The drone flies to the squares linked to a wall cell." flush>
        {grids.length === 0 ? (
          <Empty icon="grid" title="No laser grids yet" action={isAdmin ? <Button variant="secondary" onClick={() => setAddingGrid(true)}>Add a laser grid</Button> : null}>A laser grid maps a person seen in a wall cell to squares on the ground.</Empty>
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Grid</th><th className="num">Columns × rows</th><th className="num">Square size</th><th className="num">Used by</th></tr></thead>
            <tbody>
              {grids.map((g) => (
                <tr key={g.id}>
                  <td className="cell-main">{g.name}</td>
                  <td className="num">{g.columns} × {g.rows}</td>
                  <td className="num">{g.squareSizeMeters} m</td>
                  <td className="num">{walls.filter((w) => w.laserGridId === g.id).length} wall(s)</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
      {addingGrid ? <GridDialog propertyId={property.id} suggestedName={`Laser Grid ${grids.length + 1}`}
        onClose={() => setAddingGrid(false)} onCreated={() => { setAddingGrid(false); reload({ quiet: true }) }} /> : null}
    </>
  )
}
