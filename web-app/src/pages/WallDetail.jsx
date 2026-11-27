import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import PointPicker from '../components/PointPicker'
import { Badge, Button, Card, Confirm, Dialog, Empty, ErrorText, Notice, PageHeader, PageSkeleton, Row, TextField } from '../components/ui'
import { useSession } from '../state/session'
import { useAction, useLoad } from '../lib/hooks'
import { useSnapshot } from '../lib/useSnapshot'
import { perimeterService } from '../services/perimeterService'
import { meters } from '../lib/format'
import { wallRequest, wallState, wallOutline } from '../lib/domain'

const pt = ([x, y]) => ({ x, y })
export const cellShape = (cell, extra = {}) => ({
  id: cell.id, label: cell.label, points: [cell.topLeft, cell.topRight, cell.bottomRight, cell.bottomLeft].map(pt), ...extra,
})

export default function WallDetail() {
  const { wallId } = useParams()
  const { isAdmin, property } = useSession()
  const navigate = useNavigate()
  const wall = useLoad(() => perimeterService.getWall(property.id, wallId), [property.id, wallId])
  const grids = useLoad(() => perimeterService.listGrids(property.id), [property.id])
  const { picture } = useSnapshot(isAdmin ? property.id : null, isAdmin ? wall.data?.cameraId : null)
  const [validation, setValidation] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const { run, busy, error, setError } = useAction()
  useTitle(wall.data?.name ?? 'Wall', [{ label: 'Perimeter', to: '/perimeter' }])

  if (wall.loading && !wall.data) return <PageSkeleton rows={3} />
  if (wall.error) return <><ErrorText message={wall.error} /><div><Link to="/perimeter" className="btn secondary">Back to perimeter</Link></div></>
  const w = wall.data
  const state = wallState(w)
  const grid = grids.data?.find((g) => g.id === w.laserGridId)
  const linked = w.cells.length > 0 && w.cells.every((c) => c.route.length)

  const shapes = [
    { id: 'wall', points: wallOutline(w.wallTopPoints.map(pt), w.wallBottomPoints.map(pt)), tone: 'accent', fill: 'var(--accent)', dashed: true },
    ...w.cells.map((c) => cellShape(c)),
  ]

  async function check() {
    const result = await run(() => perimeterService.validateWall(property.id, w.id))
    if (result) setValidation(result)
  }
  async function rename() {
    const done = await run(async () => { await perimeterService.updateWall(property.id, w.id, wallRequest(w, { name: renaming.trim() })); return true })
    if (done) { setRenaming(null); wall.reload({ quiet: true }) }
  }
  async function remove() {
    const done = await run(async () => { await perimeterService.removeWall(property.id, w.id); return true })
    if (done) navigate('/perimeter', { replace: true })
  }
  const link = (to) => (isAdmin ? to : undefined)

  return (
    <>
      <PageHeader title={w.name} subtitle={`${w.cameraName} · ${w.frameWidth} × ${w.frameHeight} picture`}
        actions={<>
          <Badge tone={state.tone}>{state.label}</Badge>
          <Badge tone={w.detectionEnabled ? 'ok' : 'grey'} dot>{w.detectionEnabled ? 'Watching' : 'Not watching'}</Badge>
          <Button variant="secondary" icon="check" busy={busy} onClick={check}>Check if ready</Button>
          {isAdmin ? <Button variant="secondary" icon="edit" onClick={() => setRenaming(w.name)}>Rename</Button> : null}
          {isAdmin ? <Button variant="danger-ghost" icon="trash" onClick={() => { setError(null); setDeleting(true) }}>Delete wall</Button> : null}
        </>} />
      <ErrorText message={error} />
      {validation ? (
        validation.status === 'Valid'
          ? <Notice tone="ok" title="This wall is ready">Cells, laser grid, camera position and routes are all set.</Notice>
          : <Notice tone="warn" title="Not ready yet"><ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{validation.problems.map((p) => <li key={p}>{p}</li>)}</ul></Notice>
      ) : null}

      <div className="grid main-side">
        <div className="stack">
          <Card title="Wall on the camera" sub="The dashed area is what the intrusion model watches. White outlines are the cells.">
            {picture ? <PointPicker src={picture.url} points={[]} max={0} overlay={shapes} ariaLabel={`${w.name} with its cells`} />
              : <Empty icon="camera" title="No picture to show">{isAdmin ? 'The camera did not give a picture right now.' : 'Only administrators see the camera picture.'}</Empty>}
          </Card>
          <Card title="Cells" flush actions={isAdmin ? <Link className="btn secondary small" to={`/perimeter/walls/${w.id}/cells`}>Edit cells</Link> : null}>
            {w.cells.length === 0 ? <Empty icon="layers" title="No cells yet">Mark the cells on the camera picture.</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Cell</th><th>Along the wall</th><th className="num">Length</th><th>Laser route</th></tr></thead>
                <tbody>
                  {w.cells.map((c) => (
                    <tr key={c.id}>
                      <td className="cell-main">{c.label}</td>
                      <td>{meters(c.startMeters)}–{meters(c.endMeters)} m</td>
                      <td className="num">{meters(c.lengthMeters)} m</td>
                      <td>{c.route.length ? <span className="mono">{c.route.map((s) => `${s.row},${s.col}`).join(' → ')}</span> : <Badge tone="warn">Not linked</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Card>
        </div>

        <Card title="Configuration" flush className="sticky">
          <div className="rows">
            <Row title="Camera" value={w.cameraName} />
            <Row title="Wall annotation" sub={`${w.frameWidth} × ${w.frameHeight} picture`} value="Marked" valueTone="ok" dot="ok" to={link(`/perimeter/walls/${w.id}/annotate`)} />
            <Row title="Wall cells" value={`${w.cells.length} · ${meters(w.totalLengthMeters)} m`} to={link(`/perimeter/walls/${w.id}/cells`)} />
            <Row title="Laser grid" value={grid ? grid.name : 'None'} valueTone={grid ? undefined : 'warn'} to={link(`/perimeter/walls/${w.id}/mapping`)} />
            <Row title="Camera position on the grid" value={w.cameraGridRow != null ? `row ${w.cameraGridRow}, column ${w.cameraGridCol}` : 'Not set'} valueTone={w.cameraGridRow != null ? undefined : 'warn'} to={link(`/perimeter/walls/${w.id}/mapping`)} />
            <Row title="Cell links" value={linked ? 'Linked' : 'Unlinked'} valueTone={linked ? 'ok' : 'warn'} dot={linked ? 'ok' : 'warn'} to={link(`/perimeter/walls/${w.id}/mapping`)} />
          </div>
        </Card>
      </div>

      {renaming !== null ? (
        <Dialog title="Rename wall" onClose={() => setRenaming(null)}>
          <TextField label="Name" value={renaming} onChange={setRenaming} autoFocus />
          <ErrorText message={error} />
          <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setRenaming(null)}>Cancel</Button>
            <Button busy={busy} disabled={!renaming.trim()} onClick={rename}>Save</Button>
          </div>
        </Dialog>
      ) : null}
      {deleting ? <Confirm title={`Delete ${w.name}?`} danger confirmLabel="Delete" busy={busy} message={error || 'The wall, its cells and its laser links will be removed.'} onConfirm={remove} onCancel={() => setDeleting(false)} /> : null}
    </>
  )
}
