import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import { Button, Card, ErrorText, Field, Notice, PageHeader, PasswordField, Segmented, TextField } from '../components/ui'
import { useSession } from '../state/session'
import { useAction } from '../lib/hooks'
import { cameraService } from '../services/cameraService'
import { checkIP, checkPort } from '../lib/domain'

const APPS = {
  'IP Webcam': { port: '8080', hint: 'Open IP Webcam, tap Start server, and copy the IPv4 address and port shown on the screen.' },
  DroidCam: { port: '4747', hint: 'Open DroidCam on the phone and copy the Wi-Fi IP and DroidCam Port shown on its screen.' },
  'IP Camera Lite': { port: '8081', hint: 'Open IP Camera Lite, start streaming, and copy the address shown on the screen.' },
  'Other app': { port: '8080', hint: 'Enter the address and stream path of any app that streams video over Wi-Fi.' },
}

export default function AddCamera() {
  useTitle('Add camera', [{ label: 'Cameras', to: '/cameras' }])
  const { property } = useSession()
  const navigate = useNavigate()
  const [source, setSource] = useState('MobileApp')
  const [app, setApp] = useState('IP Webcam')
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')
  const [port, setPort] = useState('8080')
  const [streamPath, setStreamPath] = useState('/video')
  const [rtspUrl, setRtspUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState(null)
  const [tested, setTested] = useState(null)
  const test = useAction()
  const save = useAction()

  // Turn the form into what the server wants. Returns { input } or { problem }.
  function build() {
    if (!name.trim()) return { problem: 'Enter a camera name.' }
    const login = { username: username.trim() || null, password: password || null }
    if (source === 'Rtsp') {
      let url
      try { url = new URL(rtspUrl.trim()) } catch { return { problem: 'Enter a full RTSP address, for example rtsp://192.168.1.20:554/stream1.' } }
      if (url.protocol !== 'rtsp:' || !url.hostname) return { problem: 'Enter a full RTSP address, for example rtsp://192.168.1.20:554/stream1.' }
      const user = decodeURIComponent(url.username) || login.username
      const pass = decodeURIComponent(url.password) || login.password
      return { input: { name: name.trim(), sourceType: 'Rtsp', host: url.hostname, port: Number(url.port) || 554, streamPath: url.pathname + url.search, username: user, password: pass } }
    }
    const bad = checkIP(ip) || checkPort(port)
    if (bad) return { problem: bad }
    if (source === 'Onvif') {
      if (!login.username || !login.password) return { problem: 'ONVIF cameras need a username and password.' }
      return { input: { name: name.trim(), sourceType: 'Onvif', host: ip.trim(), port: Number(port), streamPath: '', ...login } }
    }
    const path = streamPath.trim().startsWith('/') ? streamPath.trim() : `/${streamPath.trim()}`
    return { input: { name: name.trim(), sourceType: 'MobileApp', host: ip.trim(), port: Number(port), streamPath: path, ...login } }
  }

  async function runTest() {
    setProblem(null); setTested(null)
    const { input, problem: issue } = build()
    if (issue) return setProblem(issue)
    const result = await test.run(() => cameraService.testConnection(property.id, input))
    if (result) setTested(result)
  }

  async function submit(e) {
    e.preventDefault()
    setProblem(null)
    const { input, problem: issue } = build()
    if (issue) return setProblem(issue)
    const created = await save.run(() => cameraService.create(property.id, input))
    if (created) navigate('/cameras', { replace: true })
  }

  function pickApp(value) { setApp(value); setPort(APPS[value].port) }

  return (
    <>
      <PageHeader title="Add camera" subtitle={`A new camera for ${property.name}`} />
      <form onSubmit={submit} className="grid main-side">
        <Card title="Camera details" footer={<>
          <Button type="submit" busy={save.busy}>Save camera</Button>
          <Button type="button" variant="secondary" busy={test.busy} onClick={runTest}>Test connection</Button>
          <span className="footnote">The test is made by the server, from where it runs.</span>
        </>}>
          <div className="stack">
            <Segmented block value={source} onChange={(v) => { setSource(v); setTested(null) }}
              options={[{ value: 'MobileApp', label: 'Phone camera' }, { value: 'Rtsp', label: 'CCTV (RTSP)' }, { value: 'Onvif', label: 'CCTV (ONVIF)' }]} />
            <TextField label="Camera name" value={name} onChange={setName} placeholder="Gate camera" autoFocus />

            {source === 'MobileApp' ? (
              <div className="form-grid">
                <Field label="App"><select value={app} onChange={(e) => pickApp(e.target.value)}>{Object.keys(APPS).map((a) => <option key={a}>{a}</option>)}</select></Field>
                <TextField label="IP address" value={ip} onChange={setIp} placeholder="192.168.1.50" inputMode="decimal" />
                <TextField label="Port" value={port} onChange={setPort} inputMode="numeric" />
                <Field label="Stream">
                  <select value={streamPath === '/video' || streamPath === '/h264.sdp' ? streamPath : 'other'} onChange={(e) => e.target.value !== 'other' && setStreamPath(e.target.value)}>
                    <option value="/video">/video: picture stream (direct)</option>
                    <option value="/h264.sdp">/h264.sdp: through the media server</option>
                    <option value="other">Other path…</option>
                  </select>
                </Field>
                {streamPath !== '/video' && streamPath !== '/h264.sdp' ? <div className="full"><TextField label="Stream path" value={streamPath} onChange={setStreamPath} /></div> : null}
              </div>
            ) : null}

            {source === 'Rtsp' ? <TextField label="Full RTSP address" value={rtspUrl} onChange={setRtspUrl} placeholder="rtsp://192.168.1.20:554/Streaming/Channels/101" hint="The exact path depends on the brand: take it from the camera or NVR settings. For an NVR, each camera is a different channel. Prefer the sub stream (smaller picture) for detection." /> : null}

            {source === 'Onvif' ? (
              <div className="form-grid">
                <TextField label="IP address" value={ip} onChange={setIp} placeholder="192.168.1.50" inputMode="decimal" />
                <TextField label="Port" value={port} onChange={setPort} inputMode="numeric" />
              </div>
            ) : null}

            <hr className="divider" />
            <div className="section-label">Login {source === 'Onvif' ? '' : '(only if the camera asks for one)'}</div>
            <div className="form-grid">
              <TextField label="Username" value={username} onChange={setUsername} autoComplete="off" />
              <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" />
            </div>
            <p className="footnote">The password is stored on the server only. It is never sent back to the apps.</p>
            <ErrorText message={problem || test.error || save.error} />
          </div>
        </Card>

        <div className="stack sticky">
          {tested ? <Notice tone={tested.reachable ? 'ok' : 'bad'} title={tested.reachable ? 'The server can reach the camera' : 'The server cannot reach the camera'}>{tested.message}</Notice> : null}
          {source === 'MobileApp' ? (
            <>
              <Notice title="Which stream?">
                A phone app serves only <strong>one kind of stream at a time</strong>. Use <strong>/h264.sdp</strong> for a camera that the detection worker watches: the media server then keeps one connection to the phone for every screen. Use <strong>/video</strong> only for a camera that is just for looking at.
              </Notice>
              <p className="footnote">{APPS[app].hint}</p>
            </>
          ) : (
            <Notice title="CCTV and NVR cameras">They are always watched through the media server. If the test fails, check the address, the login, and that RTSP is switched on in the camera.</Notice>
          )}
        </div>
      </form>
    </>
  )
}
