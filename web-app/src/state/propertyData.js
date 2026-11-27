import { useLoad } from '../lib/hooks'
import { useSession } from './session'
import { cameraService } from '../services/cameraService'
import { perimeterService } from '../services/perimeterService'

// Cameras, walls and laser grids of the selected property, loaded together.
export function usePropertyData() {
  const { property } = useSession()
  const id = property?.id
  const { data, error, loading, reload } = useLoad(async () => {
    const [cameras, walls, grids] = await Promise.all([
      cameraService.list(id), perimeterService.listWalls(id), perimeterService.listGrids(id),
    ])
    return { cameras, walls, grids }
  }, [id])
  return {
    cameras: data?.cameras ?? [], walls: data?.walls ?? [], grids: data?.grids ?? [],
    loaded: data !== undefined, loading, error, reload,
  }
}
