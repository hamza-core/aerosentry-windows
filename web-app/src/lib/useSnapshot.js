import { useCallback, useEffect, useRef, useState } from 'react'
import { cameraService } from '../services/cameraService'

// A picture from a camera to draw on: { url, width, height } with the picture's real size in pixels.
// The wall annotation is stored as fractions of exactly this picture, so the size must be the real one.
// Only phone cameras can give a picture through the server; for CCTV the person can choose a picture file instead
// (same shape as the camera's frames).
// auto: false = take nothing until the person asks (reload), so they choose the moment.
export function useSnapshot(propertyId, cameraId, { auto = true } = {}) {
  const [state, setState] = useState({ picture: null, loading: auto && !!cameraId, error: null })
  const urlRef = useRef(null)

  const setPicture = useCallback((blob, width, height) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = URL.createObjectURL(blob)
    setState({ picture: { url: urlRef.current, width, height }, loading: false, error: null })
  }, [])

  const load = useCallback(async () => {
    if (!cameraId) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const shot = await cameraService.snapshot(propertyId, cameraId)
      if (!shot.width || !shot.height) throw new Error('The server did not say how big the camera picture is.')
      setPicture(shot.blob, shot.width, shot.height)
    } catch (e) {
      setState({ picture: null, loading: false, error: e.message })
    }
  }, [propertyId, cameraId, setPicture])

  useEffect(() => {
    if (auto) load()
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }
  }, [load, auto])

  // Use a picture file the person chose.
  const useFile = useCallback((file) => new Promise((resolve) => {
    const probe = new Image()
    const url = URL.createObjectURL(file)
    probe.onload = () => { setPicture(file, probe.naturalWidth, probe.naturalHeight); URL.revokeObjectURL(url); resolve(true) }
    probe.onerror = () => { URL.revokeObjectURL(url); setState((s) => ({ ...s, error: 'That file is not a picture.' })); resolve(false) }
    probe.src = url
  }), [setPicture])

  // Drop the picture (back to the live video).
  const clear = useCallback(() => setState({ picture: null, loading: false, error: null }), [])

  return { ...state, reload: load, clear, useFile }
}
