import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import AnnotationEditor from '../components/AnnotationEditor'
import { Button, Card, Empty, ErrorText, Field, PageHeader, PageSkeleton, TextField } from '../components/ui'
import { useSession } from '../state/session'
import { usePropertyData } from '../state/propertyData'
import { useAction } from '../lib/hooks'
import { perimeterService } from '../services/perimeterService'

// Step 1: a name and the covering camera. Step 2: mark the wall on a picture from that camera. Then: mark its cells.
export default function WallCreate() {
  useTitle('Create wall', [{ label: 'Perimeter', to: '/perimeter' }])
  const { property } = useSession()
  const { cameras, walls, loaded } = usePropertyData()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [cameraId, setCameraId] = useState('')
  const [step, setStep] = useState(1)
  const [problem, setProblem] = useState(null)
  const { run, busy, error } = useAction()

  if (!loaded) return <PageSkeleton rows={2} />
  if (cameras.length === 0) return <Card><Empty icon="video" title="No cameras yet" action={<Link className="btn" to="/cameras/new">Add a camera</Link>}>Add a camera first. The wall is marked on a picture from its camera.</Empty></Card>

  const effectiveName = name || `Wall ${walls.length + 1}`
  const effectiveCamera = cameraId || cameras[0].id

  function next() {
    if (!effectiveName.trim()) return setProblem('Enter a wall name.')
    if (walls.some((w) => w.name.toLowerCase() === effectiveName.trim().toLowerCase())) return setProblem('A wall with this name already exists. Choose a different name.')
    setProblem(null)
    setStep(2)
  }

  async function create(annotation) {
    const wall = await run(() => perimeterService.createWall(property.id, { name: effectiveName.trim(), cameraId: effectiveCamera, ...annotation }))
    if (wall) navigate(`/perimeter/walls/${wall.id}/cells`, { replace: true })
  }

  if (step === 2) {
    return (
      <>
        <PageHeader title="Annotate the wall" subtitle={`Step 2 of 3 · ${effectiveName} · ${cameras.find((c) => c.id === effectiveCamera)?.name}`} actions={<Button variant="secondary" onClick={() => setStep(1)}>← Back</Button>} />
        <AnnotationEditor propertyId={property.id} cameraId={effectiveCamera} submitLabel="Save wall and mark cells" busy={busy} error={error} onSubmit={create} />
      </>
    )
  }

  return (
    <>
      <PageHeader title="Create wall" subtitle="Step 1 of 3 · name the wall and choose the camera that sees it" />
      <div style={{ maxWidth: 620 }}>
        <Card footer={<><Button onClick={next}>Next: annotate wall</Button><span className="footnote">Next you mark the wall on a picture from the camera, then its cells.</span></>}>
          <div className="stack">
            <TextField label="Wall name" value={name} onChange={setName} placeholder={`Wall ${walls.length + 1}`} autoFocus />
            <Field label="Covering camera" hint="A camera can cover several walls. The wall is tied to this camera and its picture size, so the camera cannot be changed later.">
              <select value={effectiveCamera} onChange={(e) => setCameraId(e.target.value)}>{cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </Field>
            <ErrorText message={problem} />
          </div>
        </Card>
      </div>
    </>
  )
}
