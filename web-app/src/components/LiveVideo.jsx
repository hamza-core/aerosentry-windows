import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner } from './ui'
import { connectWhep, WhepRefused } from '../network/whep'
import { WEBRTC_URL } from '../config'
import { usesRtspPath } from '../lib/domain'

// The live picture of one camera.
//
// A phone camera app (IP Webcam) can serve only ONE kind of stream at a time. While the media server holds its
// H.264 / RTSP connection (/h264.sdp, which the intrusion-detection worker needs), the phone's /video picture stream
// stops delivering, and the other way round. So:
//   - a camera saved with an RTSP path, and every CCTV / NVR camera: through the media server (HLS, playbackUrl).
//     The media server keeps ONE connection to the camera and serves every screen and the worker from it.
//   - a phone camera saved with /video: directly (a picture stream, low delay). It works only while nothing else
//     uses the phone's H.264 stream.
// The connection is closed when the screen is left, so a hidden tile never keeps the phone busy.
export default function LiveVideo({ camera, label }) {
  const viaMediaServer = camera.sourceType !== 'MobileApp' || usesRtspPath(camera)
  return (
    <div className="video">
      {viaMediaServer ? <MediaServerPlayer key={camera.id} camera={camera} /> : <MjpegPlayer camera={camera} />}
      <span className="overlay-chip">{label ?? camera.name}</span>
    </div>
  )
}

function Status({ children, busy }) {
  return <div className="status">{busy ? <Spinner big /> : null}<span>{children}</span></div>
}

// What to tell the person when no video arrives: the address that is being tried, because a mistyped one looks like any
// other failure.
const noVideo = (camera) => `No video from ${camera.host}:${camera.port}${camera.streamPath || ''}. Check that this address is exactly what the camera shows and that the camera is on. Trying again...`

// Cameras read by the media server: WebRTC first (little delay); HLS when WebRTC cannot be used here.
function MediaServerPlayer({ camera }) {
  const [useHls, setUseHls] = useState(() => !window.RTCPeerConnection)
  const fallBack = useCallback(() => setUseHls(true), [])
  return useHls ? <HlsPlayer camera={camera} /> : <WebRtcPlayer camera={camera} onUnusable={fallBack} />
}

function WebRtcPlayer({ camera, onUnusable }) {
  const ref = useRef(null)
  const [state, setState] = useState({ live: false, error: null })

  useEffect(() => {
    const video = ref.current
    let pc = null
    let abort = null
    let retry = null
    let stopped = false
    let answered = false          // the media server accepted the current connection
    let shown = false             // a picture has been shown at least once
    let frames = 0
    let stillSeconds = 0
    setState({ live: false, error: null })

    const close = () => { abort?.abort(); pc?.close(); pc = null; video.srcObject = null }

    const again = (message) => {
      if (stopped) return
      close()
      setState({ live: false, error: message })
      clearTimeout(retry)
      retry = setTimeout(start, RETRY_MS)
    }

    async function start() {
      if (stopped) return
      close()
      answered = false
      frames = 0
      stillSeconds = 0
      const mine = new RTCPeerConnection()
      pc = mine
      abort = new AbortController()
      try {
        await connectWhep(mine, video, `${WEBRTC_URL}/cam-${camera.id}/whep`, abort.signal)
        if (pc === mine) answered = true
      } catch (error) {
        if (stopped || pc !== mine) return
        // HLS only when WebRTC itself is the problem: its address cannot be reached (off or blocked), or the server says
        // the browser cannot take this video's CODEC over WebRTC. Every other refusal means no video from the camera. The
        // server answers 400 for an unreachable camera too (measured), so the status number cannot tell them apart; going
        // to HLS then would leave the page on the slow player after the camera came back.
        if (!(error instanceof WhepRefused) || /codec/i.test(error.message)) onUnusable()
        else again(noVideo(camera))
      }
    }

    // Live means new frames are being decoded, so that is what is counted, once a second.
    const watchdog = setInterval(async () => {
      if (stopped || document.hidden || !pc || !answered) return
      const current = pc
      let decoded = 0
      try { (await current.getStats()).forEach((s) => { if (s.type === 'inbound-rtp' && s.kind === 'video') decoded = s.framesDecoded || 0 }) } catch { return }
      if (stopped || pc !== current) return
      if (decoded > frames) {
        frames = decoded
        stillSeconds = 0
        shown = true
        setState((s) => (s.live && !s.error ? s : { live: true, error: null }))
      } else if (++stillSeconds >= STUCK_SECONDS) {
        // The server said yes but not one frame ever arrived: WebRTC's own connection does not get through here.
        if (!shown && current.connectionState !== 'connected') onUnusable()
        else again(noVideo(camera))
      }
    }, 1000)

    start()
    return () => {
      stopped = true
      clearTimeout(retry)
      clearInterval(watchdog)
      close()
    }
  }, [camera.id, camera.host, camera.port, camera.streamPath, onUnusable])

  return (
    <>
      <video ref={ref} muted playsInline autoPlay data-player="webrtc" />
      {state.live ? <span className="live-badge">LIVE</span> : null}
      {!state.live ? <Status busy={!state.error}>{state.error || 'Connecting to the camera through the media server...'}</Status> : null}
    </>
  )
}

// A video that has not moved for this long is started again with a fresh player.
const STUCK_SECONDS = 10
const RETRY_MS = 3000

function HlsPlayer({ camera }) {
  const ref = useRef(null)
  const [state, setState] = useState({ live: false, error: null })

  useEffect(() => {
    const video = ref.current
    let hls = null
    let retry = null
    let stopped = false
    let lastPosition = 0
    let stillSeconds = 0
    setState({ live: false, error: null })

    const fail = (message) => {
      if (stopped) return
      setState({ live: false, error: message })
      clearTimeout(retry)
      stillSeconds = -RETRY_MS / 1000                 // the new player gets its full time again
      retry = setTimeout(start, RETRY_MS)             // try again while the screen is open
    }

    // "Live" means the picture MOVES, so it is judged by the video's position, once a second. It also catches a player that
    // is stuck without reporting any error: seen on the first view of a camera, when the media server had only just begun
    // preparing the video (the position stayed at 0; a new player then played). A stream that freezes later is caught too.
    const watchdog = setInterval(() => {
      if (stopped || document.hidden) return            // a hidden tab may pause video by itself
      const position = video.currentTime
      const moved = position > 0 && position !== lastPosition
      lastPosition = position
      if (moved) {
        stillSeconds = 0
        setState((s) => (s.live && !s.error ? s : { live: true, error: null }))
      } else if (++stillSeconds >= STUCK_SECONDS) {
        fail(noVideo(camera))
      }
    }, 1000)

    async function start() {
      if (stopped) return
      hls?.destroy()
      setState((s) => ({ live: s.live, error: null }))
      if (video.canPlayType('application/vnd.apple.mpegurl')) {          // Safari plays HLS itself
        video.src = camera.playbackUrl
        video.play().catch(() => {})
        return
      }
      const { default: Hls } = await import('hls.js')                    // loaded only when a stream needs it
      if (stopped) return
      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 2, manifestLoadingMaxRetry: 2 })
        hls.on(Hls.Events.ERROR, (_e, data) => { if (data.fatal) fail(noVideo(camera)) })
        hls.loadSource(camera.playbackUrl)
        hls.attachMedia(video)
        video.play().catch(() => {})
      } else {
        fail('This browser cannot play the video.')
      }
    }

    start()
    return () => {
      stopped = true
      clearTimeout(retry)
      clearInterval(watchdog)
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [camera.playbackUrl])

  return (
    <>
      <video ref={ref} muted playsInline autoPlay data-player="hls" />
      {state.live ? <span className="live-badge">LIVE</span> : null}
      {!state.live ? (
        <Status busy={!state.error}>
          {state.error || 'Connecting to the camera through the media server. The first picture can take about 15 seconds.'}
        </Status>
      ) : null}
    </>
  )
}

function MjpegPlayer({ camera }) {
  const ref = useRef(null)
  const [state, setState] = useState({ live: false, error: null, attempt: 0 })
  const url = `http://${camera.host}:${camera.port}${camera.streamPath || '/video'}`

  useEffect(() => {
    const img = ref.current
    let retry = null
    setState((s) => ({ ...s, live: false, error: null }))
    img.src = `${url}${url.includes('?') ? '&' : '?'}t=${state.attempt}`
    return () => {
      clearTimeout(retry)
      img.removeAttribute('src')               // closes the connection to the phone
    }
  }, [url, state.attempt])

  const failed = () => {
    setState((s) => ({ ...s, live: false, error: `Cannot reach the camera at ${camera.host}:${camera.port}. Retrying...` }))
    setTimeout(() => setState((s) => ({ ...s, attempt: s.attempt + 1 })), 3000)
  }

  return (
    <>
      <img ref={ref} className="live" alt={`Live picture of ${camera.name}`} onLoad={() => setState((s) => ({ ...s, live: true, error: null }))} onError={failed} />
      {state.live ? <span className="live-badge">LIVE</span> : null}
      {!state.live ? <Status busy={!state.error}>{state.error || 'Connecting to the camera...'}</Status> : null}
    </>
  )
}
