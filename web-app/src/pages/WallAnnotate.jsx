import { useNavigate, useParams } from 'react-router-dom'
import { useTitle } from '../components/Layout'
import AnnotationEditor from '../components/AnnotationEditor'
import { ErrorText, Notice, PageHeader, PageSkeleton } from '../components/ui'
import { useSession } from '../state/session'
import { useAction, useLoad } from '../lib/hooks'
import { perimeterService } from '../services/perimeterService'

// Draw an existing wall again (replaces its annotation).
export default function WallAnnotate() {
  const { wallId } = useParams()
  const { property } = useSession()
  const navigate = useNavigate()
  const wall = useLoad(() => perimeterService.getWall(property.id, wallId), [property.id, wallId])
  const { run, busy, error } = useAction()
  useTitle('Annotate', [{ label: 'Perimeter', to: '/perimeter' }, { label: wall.data?.name ?? 'Wall', to: `/perimeter/walls/${wallId}` }])

  if (wall.loading) return <PageSkeleton rows={2} />
  if (wall.error) return <ErrorText message={wall.error} />

  async function save(annotation) {
    const done = await run(async () => { await perimeterService.saveAnnotation(property.id, wallId, annotation); return true })
    if (done) navigate(`/perimeter/walls/${wallId}`, { replace: true })
  }

  return (
    <>
      <PageHeader title={`Mark ${wall.data.name} again`} subtitle="Replaces the old wall annotation" />
      <Notice tone="warn" title="If the wall is being watched">The system switches to the new lines at once.</Notice>
      <AnnotationEditor propertyId={property.id} cameraId={wall.data.cameraId} initial={wall.data} submitLabel="Save annotation" busy={busy} error={error} onSubmit={save} />
    </>
  )
}
