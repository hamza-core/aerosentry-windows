import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import GridDialog from '../components/GridDialog'
import { Button, Card, Confirm, Empty, ErrorText, Field, Notice, PageHeader, PageSkeleton, Row, Segmented } from '../components/ui'
import { useSession } from '../state/session'
import { useAction, useLoad } from '../lib/hooks'
import { perimeterService } from '../services/perimeterService'
import { wallRequest } from '../lib/domain'

// Link each wall cell to laser squares. The route is the squares the drone visits, IN ORDER. Row 0 is nearest the wall.
// A square can belong to only ONE cell (on any wall that uses the same grid): the server refuses a second owner.
export default function WallMapping() {
  const { wallId } = useParams()
  const { property } = useSession()
  const wall = useLoad(() => perimeterService.getWall(property.id, wallId), [property.id, wallId])
  const grids = useLoad(() => perimeterService.listGrids(property.id), [property.id])
  const walls = useLoad(() => perimeterService.listWalls(property.id), [property.id])
  const [mode, setMode] = useState('route')                  // 'route' | 'camera'
  const [cellId, setCellId] = useState(null)
  const [route, setRoute] = useState([])
  const [addingGrid, setAddingGrid] = useState(false)
  const [changeTo, setChangeTo] = useState(null)             // a grid id waiting for confirmation (it clears the routes)
  const [savedMessage, setSavedMessage] = useState(null)
  const { run, busy, error, setError } = useAction()
  useTitle('Laser grid', [{ label: 'Perimeter', to: '/perimeter' }, { label: wall.data?.name ?? 'Wall', to: `/perimeter/walls/${wallId}` }])

  const w = wall.data
  const grid = grids.data?.find((g) => g.id === w?.laserGridId)
  const cell = w?.cells.find((c) => c.id === cellId) ?? w?.cells[0]

  // Start the route editor from the cell's saved route. Only when the cell or its SAVED route changes: a background reload
  // that brings the same data must not wipe the squares being tapped right now.
  const savedRoute = JSON.stringify(cell?.route.map((s) => ({ row: s.row, col: s.col })) ?? [])
  useEffect(() => { if (cell) { setCellId(cell.id); setRoute(JSON.parse(savedRoute)) } }, [cell?.id, savedRoute])

  if ((wall.loading && !w) || grids.loading || walls.loading) return <PageSkeleton rows={3} />
  if (wall.error) return <ErrorText message={wall.error} />

  const refresh = async () => { await Promise.all([wall.reload({ quiet: true }), walls.reload({ quiet: true })]) }

  // Squares used by OTHER cells of any wall on the same grid: square -> that cell's name.
  const used = new Map()
  if (grid) {
    for (const other of walls.data ?? []) {
      if (other.laserGridId !== grid.id) continue
      for (const c of other.cells) {
        if (c.id === cell?.id) continue
        for (const s of c.route) used.set(`${s.row},${s.col}`, other.id === w.id ? c.label : `${other.name}`)
      }
    }
  }

  async function chooseGrid(id) {
    setChangeTo(null)
    const done = await run(async () => { await perimeterService.updateWall(property.id, w.id, wallRequest(w, { laserGridId: id, cameraGridRow: null, cameraGridCol: null })); return true })
    if (done) await refresh()
  }
  async function setCameraSquare(row, col) {
    const done = await run(async () => { await perimeterService.updateWall(property.id, w.id, wallRequest(w, { cameraGridRow: row, cameraGridCol: col })); return true })
    if (done) { await refresh(); setSavedMessage(`Camera position saved: row ${row}, column ${col}.`) }       // "saved" only once the page shows it
  }
  async function saveRoute() {
    setSavedMessage(null)
    const done = await run(async () => { await perimeterService.setCellRoute(property.id, w.id, cell.id, route); return true })
    if (done) { await refresh(); setSavedMessage(route.length ? `${cell.label}: route saved (${route.length} squares).` : `${cell.label}: route cleared.`) }
  }

  function click(row, col) {
    setSavedMessage(null)
    if (mode === 'camera') return setCameraSquare(row, col)
    const key = `${row},${col}`
    if (used.has(key)) return
    const at = route.findIndex((s) => s.row === row && s.col === col)
    setRoute(at >= 0 ? route.filter((_, i) => i !== at) : [...route, { row, col }])      // click again to remove
  }

  const changed = JSON.stringify(route) !== JSON.stringify((cell?.route ?? []).map((s) => ({ row: s.row, col: s.col })))
  const allLinked = w.cells.length > 0 && w.cells.every((c) => c.route.length > 0)

  return (
    <>
      <PageHeader title="Laser grid mapping" subtitle={`${w.name} · link each cell to the squares the drone flies to`} />
      <ErrorText message={error} />

      <div className="grid main-side">
        <div className="stack">
          {!grid ? (
            <Card><Empty icon="grid" title="Choose a laser grid" action={<Button onClick={() => setAddingGrid(true)}>Add a laser grid</Button>}>Pick a grid on the right, or add one. Then mark where the camera is and link each cell to its squares.</Empty></Card>
          ) : w.cells.length === 0 ? (
            <Notice tone="warn" title="This wall has no cells yet">Mark the cells first (Perimeter › the wall › Wall cells).</Notice>
          ) : (
            <Card title={mode === 'route' ? `Route for ${cell.label}` : 'Where the camera stands'}
              sub={mode === 'route' ? 'Click the squares in the order the drone visits them. Click a square again to remove it. Grey squares belong to another cell.' : 'Click the square where this wall’s camera stands. The server needs it to call the wall ready.'}
              actions={<Segmented value={mode} onChange={(m) => { setMode(m); setSavedMessage(null) }} options={[{ value: 'route', label: 'Cell routes' }, { value: 'camera', label: 'Camera position' }]} />}
              footer={mode === 'route' ? <>
                <Button busy={busy} disabled={!changed} onClick={saveRoute}>Save route for {cell.label}</Button>
                <Button variant="secondary" onClick={() => setRoute(route.slice(0, -1))} disabled={route.length === 0}>Undo last</Button>
                <Button variant="secondary" onClick={() => setRoute([])} disabled={route.length === 0}>Clear</Button>
              </> : null}>
              <div className="stack">
                {mode === 'route' ? (
                  <Field label="Cell">
                    <select value={cell.id} onChange={(e) => { setCellId(e.target.value); setSavedMessage(null) }}>
                      {w.cells.map((c) => <option key={c.id} value={c.id}>{c.label}{c.route.length ? ` · ${c.route.length} squares` : ' · not linked'}</option>)}
                    </select>
                  </Field>
                ) : null}
                {savedMessage ? <Notice tone="ok" title={savedMessage} /> : null}
                <div className="card" style={{ background: 'var(--surface-2)' }}>
                  <div className="lgrid" style={{ gridTemplateColumns: `repeat(${grid.columns}, minmax(30px, 1fr))`, margin: '0 auto' }} aria-label="Laser grid">
                    <div className="wall-edge">The wall</div>
                    {Array.from({ length: grid.rows }).flatMap((_, row) => Array.from({ length: grid.columns }).map((__, col) => {
                      const key = `${row},${col}`
                      const order = route.findIndex((s) => s.row === row && s.col === col)
                      const isCamera = w.cameraGridRow === row && w.cameraGridCol === col
                      const owner = used.get(key)
                      const cls = isCamera ? 'sq camera' : mode === 'route' && order >= 0 ? 'sq mine' : mode === 'route' && owner ? 'sq used' : 'sq'
                      return (
                        <button key={key} type="button" className={cls} data-testid={`sq-${row}-${col}`} title={owner ? `Used by ${owner}` : `Row ${row}, column ${col}`}
                          disabled={mode === 'route' && !!owner && order < 0} onClick={() => click(row, col)}>
                          {isCamera ? 'Cam' : mode === 'route' && order >= 0 ? order + 1 : mode === 'route' && owner ? owner : `${row},${col}`}
                        </button>
                      )
                    }))}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="stack sticky">
          <Card title="Laser grid">
            <div className="stack">
              <Field label="Grid used by this wall">
                <select value={w.laserGridId ?? ''} onChange={(e) => { setError(null); const id = e.target.value; if (!id) return; (w.laserGridId && w.cells.some((c) => c.route.length)) ? setChangeTo(id) : chooseGrid(id) }}>
                  <option value="" disabled>Choose a grid…</option>
                  {(grids.data ?? []).map((g) => <option key={g.id} value={g.id}>{g.name} ({g.columns} × {g.rows}, {g.squareSizeMeters} m)</option>)}
                </select>
              </Field>
              <div><Button variant="secondary" small icon="plus" onClick={() => setAddingGrid(true)}>Add a new laser grid</Button></div>
            </div>
          </Card>
          {grid && w.cells.length ? (
            <Card title="Links" sub={allLinked && w.cameraGridRow != null ? 'Everything is linked' : 'Link every cell and set the camera position'} flush>
              <div className="rows">
                <Row title="Camera position" value={w.cameraGridRow != null ? `row ${w.cameraGridRow}, column ${w.cameraGridCol}` : 'Not set'} valueTone={w.cameraGridRow != null ? 'ok' : 'warn'} dot={w.cameraGridRow != null ? 'ok' : 'warn'} />
                {w.cells.map((c) => <Row key={c.id} title={c.label} value={c.route.length ? c.route.map((s) => `${s.row},${s.col}`).join(' → ') : 'Not linked'} valueTone={c.route.length ? 'ok' : 'warn'} dot={c.route.length ? 'ok' : 'warn'} />)}
              </div>
            </Card>
          ) : null}
        </div>
      </div>

      {addingGrid ? <GridDialog propertyId={property.id} suggestedName={`Laser Grid ${(grids.data?.length ?? 0) + 1}`} onClose={() => setAddingGrid(false)}
        onCreated={async (g) => { setAddingGrid(false); await grids.reload({ quiet: true }); chooseGrid(g.id) }} /> : null}
      {changeTo ? <Confirm title="Use another laser grid?" danger confirmLabel="Change grid" message="The old routes belong to the old grid, so they are cleared and the camera position must be set again." onConfirm={() => chooseGrid(changeTo)} onCancel={() => setChangeTo(null)} /> : null}
    </>
  )
}
