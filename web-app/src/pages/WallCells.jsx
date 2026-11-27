import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import PointPicker from '../components/PointPicker'
import { Button, Card, Empty, ErrorText, Icon, Notice, PageHeader, PageSkeleton, Row, TextField } from '../components/ui'
import { useSession } from '../state/session'
import { useAction, useLoad } from '../lib/hooks'
import { useSnapshot } from '../lib/useSnapshot'
import { perimeterService } from '../services/perimeterService'
import { meters } from '../lib/format'

// The four corners of a cell are tapped in this order.
const CORNERS = [['TL', 'top-left'], ['BL', 'bottom-left'], ['TR', 'top-right'], ['BR', 'bottom-right']]
const OUTLINE = [0, 2, 3, 1]              // corner order -> the order that draws the outline
const pt = ([x, y]) => ({ x, y })
const nextLabel = (cells) => `A${cells.length + 1}`

export default function WallCells() {
  const { wallId } = useParams()
  const { property } = useSession()
  const wall = useLoad(() => perimeterService.getWall(property.id, wallId), [property.id, wallId])
  const { picture, loading: pictureLoading, error: pictureError, reload, useFile } = useSnapshot(property.id, wall.data?.cameraId)
  const [cells, setCells] = useState(null)
  const [selected, setSelected] = useState(0)
  const [saved, setSaved] = useState(false)
  const [problem, setProblem] = useState(null)
  const { run, busy, error } = useAction()
  useTitle('Cells', [{ label: 'Perimeter', to: '/perimeter' }, { label: wall.data?.name ?? 'Wall', to: `/perimeter/walls/${wallId}` }])

  useEffect(() => {
    if (wall.data && cells === null) {
      setCells(wall.data.cells.map((c) => ({
        key: c.id, label: c.label, length: String(c.lengthMeters),
        corners: [c.topLeft, c.bottomLeft, c.topRight, c.bottomRight].map(pt),
      })))
    }
  }, [wall.data, cells])

  const current = cells?.[selected]
  const overlay = useMemo(() => (cells ?? []).flatMap((c, i) => (c.corners.length === 4
    ? [{ id: c.key, label: c.label, points: OUTLINE.map((k) => c.corners[k]), tone: i === selected ? 'accent' : 'white', dashed: i === selected }] : [])), [cells, selected])

  if (wall.loading || cells === null) return <PageSkeleton rows={2} />
  if (wall.error) return <ErrorText message={wall.error} />

  const update = (patch) => { setSaved(false); setCells(cells.map((c, i) => (i === selected ? { ...c, ...patch } : c))) }
  const add = () => {
    setSaved(false)
    setCells([...cells, { key: `new-${Date.now()}`, label: nextLabel(cells), length: '10', corners: [] }])
    setSelected(cells.length)
  }
  const remove = () => {
    setSaved(false)
    setCells(cells.filter((_, i) => i !== selected))
    setSelected(Math.max(0, selected - 1))
  }

  async function save() {
    setProblem(null)
    if (cells.length === 0) return setProblem('Add at least one cell.')
    const labels = new Set()
    for (const c of cells) {
      if (!c.label.trim()) return setProblem('Every cell needs a name.')
      if (labels.has(c.label.trim().toLowerCase())) return setProblem(`Two cells are called ${c.label}. Give each cell its own name.`)
      labels.add(c.label.trim().toLowerCase())
      if (!(Number(String(c.length).replace(',', '.')) > 0)) return setProblem(`${c.label} needs a length greater than 0 m.`)
      if (c.corners.length !== 4) return setProblem(`Mark all four corners of ${c.label} on the picture.`)
    }
    const body = cells.map((c) => ({
      label: c.label.trim(), lengthMeters: Number(String(c.length).replace(',', '.')),
      topLeft: [c.corners[0].x, c.corners[0].y], bottomLeft: [c.corners[1].x, c.corners[1].y],
      topRight: [c.corners[2].x, c.corners[2].y], bottomRight: [c.corners[3].x, c.corners[3].y],
    }))
    const done = await run(async () => { await perimeterService.saveCells(property.id, wallId, body); return true })
    if (done) setSaved(true)
  }

  const totalLength = cells.reduce((sum, c) => sum + (Number(String(c.length).replace(',', '.')) || 0), 0)
  const hint = !current ? 'Add a cell first'
    : current.corners.length < 4 ? `${current.label}: tap the ${CORNERS[current.corners.length][1]} corner` : `${current.label}: drag a corner to adjust it`

  return (
    <>
      <PageHeader title="Wall cells" subtitle={`${wall.data.name} · ${cells.length} ${cells.length === 1 ? 'cell' : 'cells'} · ${meters(totalLength)} m`}
        actions={<><Button variant="secondary" icon="plus" onClick={add}>Add cell</Button><Button busy={busy} icon="check" onClick={save}>Save cells</Button></>} />
      {saved ? <Notice tone="ok" title="Cells saved">{cells.length} cells covering {meters(totalLength)} m. <Link to={`/perimeter/walls/${wallId}/mapping`}><strong>Next: link them to the laser grid</strong></Link></Notice> : null}
      <ErrorText message={problem || error} />

      <div className="grid main-side">
        <div className="stack sticky">
          {!picture ? (
            <Card title="No picture from the camera">
              <div className="stack">
                <Notice tone="warn" title={pictureLoading ? 'Getting a picture…' : pictureError}>Choose a picture file with the same shape as the camera's frames.</Notice>
                <div className="btn-row">
                  <Button small variant="secondary" icon="refresh" onClick={reload}>Try again</Button>
                  <label className="btn small secondary"><Icon name="upload" /> Choose a file…<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && useFile(e.target.files[0])} /></label>
                </div>
              </div>
            </Card>
          ) : (
            <PointPicker src={picture.url} points={current?.corners ?? []} onChange={(corners) => update({ corners })} max={current ? 4 : 0}
              labels={CORNERS.map((c) => c[0])} hint={hint} overlay={overlay.filter((o) => o.id !== current?.key)} polygon={current?.corners.length === 4 ? OUTLINE.map((k) => current.corners[k]) : null}
              lines={current?.corners.length === 4 ? [{ from: 0, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 1 }, { from: 1, to: 0 }] : []} ariaLabel="Camera picture: mark the cells" />
          )}
          <p className="footnote">Two strips of masking tape are fixed on the real wall a measured distance apart. Use them as cell boundaries so the cell between them has that exact length. Select a cell, then tap its four corners on the picture in this order: top-left, bottom-left, top-right, bottom-right. Drag a corner to refine it. Keep the camera and its picture crop fixed.</p>
        </div>

        <div className="stack">
          <Card title="Cells" flush>
            {cells.length === 0 ? <Empty icon="layers" title="No cells yet">Add a cell, then mark its four corners on the picture.</Empty> : (
              <div className="rows">
                {cells.map((c, i) => (
                  <Row key={c.key} onClick={() => setSelected(i)} chevron={false} title={c.label} sub={`${c.length} m · ${c.corners.length} of 4 corners marked`} value={i === selected ? 'Selected' : ''} valueTone={i === selected ? 'ok' : undefined} />
                ))}
              </div>
            )}
          </Card>
          {current ? (
            <Card title={`${current.label} details`} footer={<>
              <Button variant="secondary" small icon="refresh" onClick={() => update({ corners: [] })}>Redo {current.label}</Button>
              <Button variant="danger-ghost" small icon="trash" onClick={remove}>Delete {current.label}</Button>
            </>}>
              <div className="stack">
                <div className="form-grid">
                  <TextField label="Name" value={current.label} onChange={(label) => update({ label })} />
                  <TextField label="Length (m)" value={current.length} onChange={(length) => update({ length })} inputMode="decimal" />
                </div>
                <p className="footnote">The real length of this cell along the wall, measured on site. Cells can differ in length.</p>
                <ol className="steps-list" style={{ margin: '0 -18px -18px', borderTop: '1px solid var(--border)' }}>
                  {CORNERS.map(([short, name], k) => (
                    <li key={short} className={k < current.corners.length ? 'done' : k === current.corners.length ? 'next' : ''}>
                      <span className="n">{k < current.corners.length ? <Icon name="check" /> : k + 1}</span>
                      <span>{name[0].toUpperCase() + name.slice(1)} corner</span><span className="spacer" /><span className="footnote">{k < current.corners.length ? 'Marked' : 'Not set'}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  )
}
