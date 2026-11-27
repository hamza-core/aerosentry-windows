import { useEffect, useRef, useState } from 'react'
import { Button, Card, Notice } from './ui'
import { personService } from '../services/personService'

// Live face capture, like the learning script enroll_user.py: the camera is shown with a box round the face, a counter
// and the same kind of messages. A frame counts when it has exactly ONE face wider than 100 px (the server judges that).
// One difference, on purpose: up to CANDIDATES good frames are taken and the TARGET SHARPEST are kept.
const TARGET = 30
const CANDIDATES = 45
const AFTER_GOOD_MS = 400          // the script waits 0.4 s after a kept frame, so the frames differ a little
const AFTER_BAD_MS = 150
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sharpest = (frames) => [...frames].sort((a, b) => b.sharpness - a.sharpness).slice(0, TARGET).sort((a, b) => a.order - b.order)

// onFrames(array of TARGET pictures | null). onVideo(file | null) for "choose a video file instead".
export default function FaceCapture({ propertyId, video, onFrames, onVideo }) {
  const preview = useRef(null)
  const stream = useRef(null)
  const run = useRef(0)                       // a new number stops the loop that is running
  const good = useRef([])
  const fileInput = useRef(null)
  const [phase, setPhase] = useState('idle')  // idle | ready | capturing | done
  const [count, setCount] = useState(0)
  const [look, setLook] = useState(null)      // the server's judgement of the latest frame: box, message, ok, sharpness
  const [kept, setKept] = useState([])
  const [problem, setProblem] = useState(null)

  const stopCamera = () => {
    run.current++
    stream.current?.getTracks().forEach((t) => t.stop())     // the camera light goes off
    stream.current = null
  }
  const dropFrames = () => { good.current = []; setCount(0); setLook(null); setKept((old) => { old.forEach((f) => URL.revokeObjectURL(f.url)); return [] }) }
  useEffect(() => () => stopCamera(), [])
  useEffect(() => { if ((phase === 'ready' || phase === 'capturing') && preview.current && stream.current) preview.current.srcObject = stream.current }, [phase])

  async function startCamera() {
    setProblem(null); dropFrames(); onFrames(null); onVideo(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This page may not use a camera here')
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      setPhase('ready')
    } catch (e) {
      setProblem(`The camera could not be opened (${e.message}). Allow it in the browser, or choose a video file instead.`)
    }
  }

  function finish() {
    const chosen = sharpest(good.current).map((f) => ({ ...f, url: URL.createObjectURL(f.blob) }))
    stopCamera()
    setKept(chosen)
    setPhase('done')
    onFrames(chosen.map((f) => f.blob))
  }

  async function capture() {
    dropFrames(); setProblem(null); setPhase('capturing')
    const mine = ++run.current
    const canvas = document.createElement('canvas')
    let failures = 0
    let order = 0
    while (run.current === mine && good.current.length < CANDIDATES) {
      const v = preview.current
      if (!v || !v.videoWidth) { await pause(AFTER_BAD_MS); continue }
      canvas.width = 640
      canvas.height = Math.round((v.videoHeight * 640) / v.videoWidth)
      canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      let result
      try {
        result = await personService.checkFrame(propertyId, blob)
        failures = 0
      } catch (e) {
        if (run.current !== mine) return
        if (++failures >= 5) { setProblem(`Capture stopped: ${e.message}`); stopCamera(); setPhase('idle'); return }
        await pause(1000)
        continue
      }
      if (run.current !== mine) return
      setLook(result)
      if (result.ok) { good.current.push({ blob, sharpness: result.sharpness, order: order++ }); setCount(good.current.length) }
      await pause(result.ok ? AFTER_GOOD_MS : AFTER_BAD_MS)
    }
    if (run.current === mine) finish()
  }

  const cancel = () => { stopCamera(); dropFrames(); setPhase('idle') }
  const live = phase === 'ready' || phase === 'capturing'
  const counter = count < TARGET ? `Captured: ${count}/${TARGET}` : `Captured: ${TARGET}/${TARGET} · picking sharper ones ${count}/${CANDIDATES}`
  const colour = look?.ok ? '#22c55e' : '#ef4444'

  return (
    <Card title="Face capture" sub="One person only, facing the camera">
      <div className="stack">
        {live ? (
          <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', lineHeight: 0 }}>
            {/* the picture is shown as a mirror; the frames that are sent are not mirrored, so the box is flipped to match */}
            <video ref={preview} muted autoPlay playsInline data-testid="capture-live" style={{ width: '100%', transform: 'scaleX(-1)' }} />
            {phase === 'capturing' && look?.box ? (
              <div data-testid="face-box" style={{ position: 'absolute', left: `${(1 - look.box[2]) * 100}%`, top: `${look.box[1] * 100}%`, width: `${(look.box[2] - look.box[0]) * 100}%`, height: `${(look.box[3] - look.box[1]) * 100}%`, border: `3px solid ${colour}`, borderRadius: 6, pointerEvents: 'none' }} />
            ) : null}
            {phase === 'capturing' ? (
              <>
                <div data-testid="capture-counter" style={{ position: 'absolute', left: 10, top: 10, lineHeight: 1.4, padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,.65)', color: '#22c55e', fontWeight: 700 }}>{counter}</div>
                <div data-testid="capture-message" style={{ position: 'absolute', left: 10, right: 10, bottom: 14, lineHeight: 1.4, textAlign: 'center', padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,.65)', color: look?.ok ? '#22c55e' : '#fbbf24', fontWeight: 600 }}>
                  {!look ? 'Looking for face...' : look.ok ? `Good frame · sharpness ${Math.round(look.sharpness)}` : look.message}
                </div>
                <div style={{ position: 'absolute', left: 0, bottom: 0, height: 6, width: `${(count / CANDIDATES) * 100}%`, background: '#22c55e' }} />
              </>
            ) : null}
          </div>
        ) : null}
        {phase === 'done' ? (
          <>
            <Notice title={`${kept.length} sharpest frames chosen from ${good.current.length}`}>Check them, then press “Enroll person”.</Notice>
            <div data-testid="capture-chosen" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(86px, 1fr))', gap: 8 }}>
              {kept.map((f, i) => (
                <figure key={f.url} style={{ margin: 0 }}>
                  <img src={f.url} alt={`Chosen frame ${i + 1}`} style={{ width: '100%', borderRadius: 8, display: 'block', transform: 'scaleX(-1)' }} />
                  <figcaption className="footnote" style={{ textAlign: 'center' }}>sharp {Math.round(f.sharpness)}</figcaption>
                </figure>
              ))}
            </div>
          </>
        ) : null}
        {video ? <Notice title={`Video file chosen: ${video.name || 'video'}`}>The server will take frames from it and keep the 30 sharpest good ones.</Notice> : null}
        {problem ? <Notice tone="warn" title={problem} /> : null}
        <div className="btn-row">
          {!live ? <Button type="button" icon="camera" onClick={startCamera}>{phase === 'done' ? 'Capture again' : 'Start camera'}</Button> : null}
          {phase === 'ready' ? <Button type="button" icon="face" onClick={capture}>Start capturing</Button> : null}
          {phase === 'capturing' && count >= TARGET ? <Button type="button" onClick={finish}>Use these frames</Button> : null}
          {live ? <Button type="button" variant="secondary" onClick={cancel}>Cancel</Button> : null}
          {!live ? <Button type="button" variant="secondary" icon="upload" onClick={() => fileInput.current.click()}>Choose a video file…</Button> : null}
          <input ref={fileInput} type="file" accept="video/*" hidden onChange={(e) => { if (e.target.files[0]) { setProblem(null); dropFrames(); setPhase('idle'); onFrames(null); onVideo(e.target.files[0]) } e.target.value = '' }} />
        </div>
        <p className="footnote">Stand close so your face fills a good part of the picture, in good light, looking at the camera. Move your head slowly and only a little.</p>
      </div>
    </Card>
  )
}
