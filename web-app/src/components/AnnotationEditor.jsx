import { useEffect, useRef, useState } from 'react'
import PointPicker from './PointPicker'
import LiveVideo from './LiveVideo'
import { usePropertyData } from '../state/propertyData'
import { Button, Card, ErrorText, Icon, Notice } from './ui'
import { useSnapshot } from '../lib/useSnapshot'
import { annotationFromEdges, wallOutline, MAX_EDGE_POINTS } from '../lib/domain'

// Where the wall is on the camera picture. The administrator taps ALONG the wall's TOP edge on a real picture from the
// camera, then along its BOTTOM edge: 2 taps for a straight edge, one more at every corner or step. The intrusion model
// works from exactly these lines, so they decide what it watches.
export default function AnnotationEditor({ propertyId, cameraId, initial, submitLabel, busy, error, onSubmit }) {
  const { picture, loading, error: pictureError, reload, clear, useFile } = useSnapshot(propertyId, cameraId, { auto: false })
  const camera = usePropertyData().cameras.find((c) => c.id === cameraId)
  const [edges, setEdges] = useState({ top: [], bottom: [], current: 'top' })
  const seeded = useRef(false)
  const fileInput = useRef(null)

  // When editing, start from the points the wall already has.
  useEffect(() => {
    if (initial && picture && !seeded.current) {
      seeded.current = true
      const top = initial.wallTopPoints ?? [], bottom = initial.wallBottomPoints ?? []
      const point = ([x, y]) => ({ x, y })
      if (top.length >= 2 && bottom.length >= 2) setEdges({ top: top.map(point), bottom: bottom.map(point), current: 'bottom' })
    }
  }, [initial, picture])

  // First the live video, so the person sees the scene and chooses the moment; "Grab frame" then takes the picture to
  // draw on. The video closes its connection to the camera once the frame is shown.
  if (!picture) {
    return (
      <div className="grid main-side">
        {camera ? <LiveVideo camera={camera} /> : <Card><p className="footnote">Loading the camera…</p></Card>}
        <div className="stack sticky">
          <Card title="Grab a frame" sub="You will draw the wall on this frame">
            <div className="stack">
              {pictureError
                ? <Notice tone="warn" title={pictureError}>Check that the camera is on and try again. The server can take pictures from phone cameras only: for a CCTV camera, choose a picture file with the same shape as the camera's frames.</Notice>
                : <p className="footnote">Watch the live video. Put the camera in its final position with the whole wall in view, and when the scene is clear, grab the frame.</p>}
              <div className="btn-row">
                <Button icon="camera" busy={loading} onClick={reload}>Grab frame</Button>
                <Button variant="secondary" icon="upload" onClick={() => fileInput.current.click()}>Choose a picture file…</Button>
                <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && useFile(e.target.files[0])} />
              </div>
            </div>
          </Card>
        </div>
      </div>
    )
  }

  const { top, bottom, current } = edges
  const all = [...top, ...bottom]
  const ready = top.length >= 2 && bottom.length >= 2
  const onTop = current === 'top'

  // The picker works with one list (top points, then bottom points). One more point = a new tap on the edge being drawn;
  // the same number = a point was dragged.
  const change = (next) => setEdges((e) => {
    if (next.length > e.top.length + e.bottom.length) return { ...e, [e.current]: [...e[e.current], next[next.length - 1]] }
    return { ...e, top: next.slice(0, e.top.length), bottom: next.slice(e.top.length) }
  })
  const undo = () => setEdges((e) => {
    if (e.current === 'bottom' && e.bottom.length === 0) return { ...e, current: 'top' }
    return { ...e, [e.current]: e[e.current].slice(0, -1) }
  })
  const lines = [
    ...top.slice(1).map((_, i) => ({ from: i, to: i + 1 })),
    ...bottom.slice(1).map((_, i) => ({ from: top.length + i, to: top.length + i + 1 })),
  ]
  const labels = [...top.map((_, i) => `T${i + 1}`), ...bottom.map((_, i) => `B${i + 1}`)]
  const hint = onTop
    ? (top.length < 2 ? 'Tap along the TOP edge, from one end to the other' : 'Tap more points at corners, or press "Top edge done"')
    : (bottom.length < 2 ? 'Now tap along the BOTTOM edge' : 'Tap more points, or drag a point to adjust it')
  const rows = [
    { key: 'top', title: 'Top edge', points: top },
    { key: 'bottom', title: 'Bottom edge', points: bottom },
  ]

  return (
    <div className="grid main-side">
      <PointPicker src={picture.url} points={all} onChange={change} max={edges[current].length < MAX_EDGE_POINTS ? all.length + 1 : all.length} labels={labels} hint={hint}
        lines={lines} polygon={ready ? wallOutline(top, bottom) : null} ariaLabel="Camera picture: mark the wall" />
      <div className="stack sticky">
        <Card title="Mark the wall" sub={`Picture size ${picture.width} × ${picture.height}`} flush footer={<>
          <Button variant="secondary" small onClick={() => setEdges({ top: [], bottom: [], current: 'top' })}>Reset points</Button>
          <Button variant="secondary" small disabled={all.length === 0} onClick={undo}>Undo</Button>
          {onTop
            ? <Button disabled={top.length < 2} onClick={() => setEdges((e) => ({ ...e, current: 'bottom' }))}>Top edge done</Button>
            : <Button disabled={!ready} busy={busy} onClick={() => onSubmit(annotationFromEdges(top, bottom, picture.width, picture.height))}>{submitLabel}</Button>}
        </>}>
          <ol className="steps-list">
            {rows.map((r, i) => (
              <li key={r.key} className={current === r.key ? 'next' : r.points.length >= 2 ? 'done' : ''}>
                <span className="n">{r.points.length >= 2 && current !== r.key ? <Icon name="check" /> : i + 1}</span>
                <span>{r.title}</span>
                <span className="spacer" /><span className="footnote">{r.points.length ? `${r.points.length} points` : 'Not set'}</span>
              </li>
            ))}
          </ol>
        </Card>
        <div className="btn-row"><Button variant="secondary" small icon="video" onClick={clear}>Back to live video</Button></div>
        <ErrorText message={error} />
        <p className="footnote">A straight edge needs 2 points. Add one wherever the edge bends, and keep tapping in order from one end to the other. The system watches the wall between these two lines. Keep the camera and its picture size fixed afterwards: if the camera moves, mark the wall again.</p>
      </div>
    </div>
  )
}
