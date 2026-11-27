import { useState } from 'react'
import { Button, Dialog, ErrorText, TextField } from './ui'
import { useAction } from '../lib/hooks'
import { perimeterService } from '../services/perimeterService'

// Add a laser grid: how many squares across and deep, and how big each square is on the ground.
export default function GridDialog({ propertyId, suggestedName, onCreated, onClose }) {
  const [name, setName] = useState(suggestedName)
  const [columns, setColumns] = useState('5')
  const [rows, setRows] = useState('5')
  const [size, setSize] = useState('2')
  const [problem, setProblem] = useState(null)
  const { run, busy, error } = useAction()

  async function submit(e) {
    e.preventDefault()
    const c = Number(columns), r = Number(rows), s = Number(String(size).replace(',', '.'))
    if (!name.trim()) return setProblem('Enter a name for the laser grid.')
    if (!Number.isInteger(c) || c < 1 || c > 50 || !Number.isInteger(r) || r < 1 || r > 50 || !(s >= 0.1 && s <= 100))
      return setProblem('Columns and rows must be from 1 to 50, and the square size from 0.1 to 100 metres.')
    setProblem(null)
    const grid = await run(() => perimeterService.createGrid(propertyId, { name: name.trim(), rows: r, columns: c, squareSizeMeters: s }))
    if (grid) onCreated(grid)
  }

  return (
    <Dialog title="Add laser grid" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <TextField label="Name" value={name} onChange={setName} autoFocus />
        <div className="form-grid">
          <TextField label="Columns (across)" value={columns} onChange={setColumns} inputMode="numeric" />
          <TextField label="Rows (away from the wall)" value={rows} onChange={setRows} inputMode="numeric" />
          <TextField label="Square size (metres)" value={size} onChange={setSize} inputMode="decimal" />
        </div>
        <p className="footnote">Row 0 is the row nearest the wall. A square of 2 m means the grid covers {Math.round(Number(columns) * Number(String(size).replace(',', '.')) * 10) / 10 || 0} m across.</p>
        <ErrorText message={problem || error} />
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>Add grid</Button>
        </div>
      </form>
    </Dialog>
  )
}
