import { useCallback, useEffect, useRef, useState } from 'react'

// Loads data when a screen opens (and again when `deps` change). Returns the data, an error message, a loading flag
// and reload(). A late answer from an old request is ignored, so a screen never shows stale data.
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true })
  const run = useRef(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const load = useCallback(async ({ quiet = false } = {}) => {
    const id = ++run.current
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fnRef.current()
      if (id === run.current) setState({ data, error: null, loading: false })
    } catch (error) {
      if (id === run.current) setState((s) => ({ data: quiet ? s.data : undefined, error: error.message, loading: false }))
    }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, deps)
  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data })) }
}

// Reload when the server pushed an alert (see network/alertLive.js).
export function useOnAlertsChanged(callback) {
  const ref = useRef(callback)
  ref.current = callback
  useEffect(() => {
    const handler = () => ref.current()
    window.addEventListener('aerosentry:alerts-changed', handler)
    return () => window.removeEventListener('aerosentry:alerts-changed', handler)
  }, [])
}

// Runs an action with a busy flag and an error message: const { run, busy, error } = useAction()
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = useCallback(async (work) => {
    setBusy(true)
    setError(null)
    try { return await work() } catch (e) { setError(e.message); return undefined } finally { setBusy(false) }
  }, [])
  return { run, busy, error, setError }
}
