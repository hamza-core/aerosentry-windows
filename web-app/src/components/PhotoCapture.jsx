import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Icon, Spinner } from './ui'

// One photo of a face: take it with the camera, or choose a file. The parent checks it with the server and passes the
// result back as `check` ({ checking, ok, message }).
// Note: browsers allow the camera only on localhost or on https pages. On another address, choose a file.
export default function PhotoCapture({ title, instruction, blob, check, onPhoto }) {
  const video = useRef(null)
  const stream = useRef(null)
  const [live, setLive] = useState(false)
  const [problem, setProblem] = useState(null)
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    if (!blob) { setPreview(null); return undefined }
    const url = URL.createObjectURL(blob)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setLive(false) }
  useEffect(() => stop, [])

  async function start() {
    setProblem(null)
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false })
      setLive(true)
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = stream.current; video.current.play().catch(() => {}) } })
    } catch {
      setProblem('The camera is not available. Browsers allow it only on localhost or https pages, and only if you allow it. Choose a picture file instead.')
    }
  }

  function capture() {
    const v = video.current
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth; canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0)
    canvas.toBlob((b) => { if (b) onPhoto(b) }, 'image/jpeg', 0.92)
    stop()
  }

  return (
    <section className="card">
      <header className="card-head">
        <div><h2>{title}</h2><div className="sub">{instruction}</div></div>
        {check?.checking ? <Spinner /> : check ? <Badge tone={check.ok ? 'ok' : 'bad'} dot>{check.ok ? 'Good photo' : 'Retake'}</Badge> : null}
      </header>
      <div className="card-body stack">
        {live ? <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 10, background: '#000', transform: 'scaleX(-1)' }} /> : null}
        {!live && preview ? <img src={preview} alt={`${title} preview`} style={{ width: '100%', maxWidth: 320, borderRadius: 10, border: '1px solid var(--border)' }} /> : null}
        {check && !check.ok && !check.checking ? <p className="error">{check.message}</p> : null}
        {problem ? <p className="error">{problem}</p> : null}
        <div className="btn-row">
          {live ? <Button type="button" icon="camera" onClick={capture}>Take photo</Button> : <Button type="button" variant="secondary" small icon="camera" onClick={start}>{blob ? 'Retake with camera' : 'Use camera'}</Button>}
          {live ? <Button type="button" variant="secondary" small onClick={stop}>Cancel</Button> : (
            <label className="btn small secondary"><Icon name="upload" /> Choose file…
              <input type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files[0]) onPhoto(e.target.files[0]); e.target.value = '' }} />
            </label>
          )}
        </div>
      </div>
    </section>
  )
}
