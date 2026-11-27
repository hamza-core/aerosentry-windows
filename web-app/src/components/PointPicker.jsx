import { useRef } from 'react'

// A camera picture you can click on. Points are { x, y } as FRACTIONS of the picture (0 to 1, 0,0 = top left), so they
// work for any picture size and match what the backend stores.
//   - click on the picture: adds a point (until `max`)
//   - drag a round handle: moves that point
//   - `overlay`: shapes drawn on top, [{ id, points, label, tone, dashed, fill }] (for example the other cells)
//   - `lines`: [{ from, to }] indexes into `points`, drawn as lines between your points
const clamp = (v) => Math.min(1, Math.max(0, v))

export default function PointPicker({ src, points, onChange, max, labels = [], hint, overlay = [], lines = [], polygon = null, ariaLabel = 'Camera picture' }) {
  const box = useRef(null)

  const fraction = (event) => {
    const rect = box.current.getBoundingClientRect()
    return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }
  }

  const add = (event) => { if (points.length < max) onChange([...points, fraction(event)]) }

  const drag = (index) => (event) => {
    event.stopPropagation()
    event.preventDefault()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const move = (e) => onChange(points.map((p, i) => (i === index ? fraction(e) : p)))
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up) }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  const path = (pts) => pts.map((p) => `${p.x},${p.y}`).join(' ')
  const centre = (pts) => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length })
  const colour = (tone) => (tone === 'accent' ? 'var(--accent)' : tone === 'warn' ? 'var(--warn)' : '#ffffff')

  return (
    <div className="canvas-wrap" ref={box} onClick={add} role="img" aria-label={ariaLabel} data-testid="picker">
      <img src={src} alt="" draggable={false} />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {overlay.map((shape) => (
          <polygon key={shape.id} points={path(shape.points)} fill={shape.fill ?? 'none'} fillOpacity="0.28" stroke={colour(shape.tone)}
            strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeDasharray={shape.dashed ? '8 5' : undefined} />
        ))}
        {polygon && polygon.length >= 3 ? <polygon points={path(polygon)} fill="var(--accent)" fillOpacity="0.18" stroke="none" /> : null}
        {lines.map((l, i) => points[l.from] && points[l.to] ? (
          <line key={i} x1={points[l.from].x} y1={points[l.from].y} x2={points[l.to].x} y2={points[l.to].y}
            stroke="var(--accent)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        ) : null)}
      </svg>
      {overlay.filter((s) => s.label && s.points.length).map((shape) => {
        const c = centre(shape.points)
        return <span key={`l${shape.id}`} className="canvas-hint" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, transform: 'translate(-50%,-50%)' }}>{shape.label}</span>
      })}
      {points.map((p, i) => (
        <div key={i} role="button" aria-label={`Point ${labels[i] ?? i + 1}`} data-testid={`handle-${i}`} onPointerDown={drag(i)} onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%, -50%)',
            width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', border: '2px solid #fff', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, cursor: 'grab', lineHeight: 1,
          }}>{labels[i] ?? i + 1}</div>
      ))}
      {hint ? <div className="canvas-hint" style={{ left: 8, top: 8 }}>{hint}</div> : null}
    </div>
  )
}
