import { useEffect, useRef, useState } from 'react'
import { network } from '../network/networkLayer'
import { createFrameParser } from '../network/frameStream'
import { Spinner } from './ui'

// The live picture of one watched wall with the people the model found drawn on it: an orange box for a person,
// RED with "ALARM" while the climbing alarm is on. The ingest worker draws it and the backend streams it
// (GET detection/preview). It needs the login token, so it is read with fetch, not linked from an <img>.
export default function LiveDetection({ propertyId, wallId, label }) {
  const image = useRef(null)
  const [state, setState] = useState({ live: false, message: null })

  useEffect(() => {
    const abort = new AbortController()
    let shownUrl = null
    let stopped = false
    let retry = null

    const show = (jpeg) => {
      if (stopped || !image.current) return
      const url = URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' }))
      image.current.src = url
      if (shownUrl) URL.revokeObjectURL(shownUrl)
      shownUrl = url
      setState((s) => (s.live ? s : { live: true, message: null }))
    }

    async function connect() {
      if (stopped) return
      let message = 'The live picture stopped. Connecting again...'
      try {
        const response = await network.stream('/detection/preview', { propertyId, wallId }, abort.signal)
        const parse = createFrameParser(show)
        const reader = response.body.getReader()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break                              // the server ends the stream when the worker stops
          parse(value)
        }
      } catch (error) {
        if (stopped || error?.name === 'AbortError') return
        message = error?.message || message            // for example "No live picture: ... the ingest worker is not running"
      }
      if (stopped) return
      setState({ live: false, message })
      retry = setTimeout(connect, 2000)
    }

    setState({ live: false, message: null })
    connect()
    return () => {
      stopped = true
      clearTimeout(retry)
      abort.abort()
      if (shownUrl) URL.revokeObjectURL(shownUrl)
    }
  }, [propertyId, wallId])

  return (
    <div className="video" data-live-detection={state.live ? 'live' : 'waiting'}>
      <img ref={image} className="live" alt={`Live detection of ${label}`} style={{ visibility: state.live ? 'visible' : 'hidden' }} />
      <span className="overlay-chip">{label}</span>
      {state.live ? <span className="live-badge">LIVE</span> : null}
      {!state.live ? (
        <div className="status">{!state.message ? <Spinner big /> : null}<span>{state.message || 'Waiting for the first picture from the model...'}</span></div>
      ) : null}
    </div>
  )
}
