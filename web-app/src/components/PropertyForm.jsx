import { useState } from 'react'
import { Button, ErrorText, Field, Footnote, TextField } from './ui'
import { parseCoordinate } from '../lib/domain'

// Add / edit a property. The same checks the server makes are made here first.
// There is no map: map tiles need the internet and this system must work without it. Type the coordinates,
// or press "Use my location" (the browser asks for permission; it works on localhost and https pages).
export default function PropertyForm({ initial, submitLabel = 'Save', busy, error, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [lat, setLat] = useState(initial?.latitude ?? '')
  const [lon, setLon] = useState(initial?.longitude ?? '')
  const [problem, setProblem] = useState(null)

  const latP = parseCoordinate(lat, 90)
  const lonP = parseCoordinate(lon, 180)
  const noteTooLong = note.length > 500

  function locate() {
    if (!navigator.geolocation) { setProblem('This browser cannot find your location. Type the coordinates instead.'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLon(pos.coords.longitude.toFixed(6)); setProblem(null) },
      () => setProblem('Your location is not available. Type the coordinates instead.'),
      { timeout: 8000 },
    )
  }

  function submit(e) {
    e.preventDefault()
    setProblem(null)
    if (!name.trim()) return setProblem('Enter a property name.')
    if (!address.trim()) return setProblem('Enter the property address.')
    if (!latP.valid) return setProblem('Latitude must be a number from -90 to 90.')
    if (!lonP.valid) return setProblem('Longitude must be a number from -180 to 180.')
    if ((latP.value === null) !== (lonP.value === null)) return setProblem('Enter both latitude and longitude, or leave both empty.')
    if (noteTooLong) return setProblem('The note can be at most 500 characters.')
    onSubmit({ name: name.trim(), address: address.trim(), note: note.trim() || null, latitude: latP.value, longitude: lonP.value })
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="form-grid">
        <TextField label="Name" value={name} onChange={setName} placeholder="Head Office" autoFocus />
        <TextField label="Address" value={address} onChange={setAddress} placeholder="Street, city" />
        <TextField label="Latitude (-90 to 90)" value={lat} onChange={setLat} invalid={!latP.valid} inputMode="decimal" />
        <TextField label="Longitude (-180 to 180)" value={lon} onChange={setLon} invalid={!lonP.valid} inputMode="decimal" />
        <div className="full"><Button type="button" variant="secondary" small icon="pin" onClick={locate}>Use my location</Button></div>
        <div className="full">
          <Field label={`Note (optional) · ${note.length} / 500`} invalid={noteTooLong}>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: gate code changes on Mondays" />
          </Field>
        </div>
      </div>
      <Footnote>The location is optional. It is used for the drone later.</Footnote>
      <ErrorText message={problem || error} />
      <div className="btn-row">
        <Button type="submit" busy={busy}>{submitLabel}</Button>
        {onCancel ? <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  )
}
