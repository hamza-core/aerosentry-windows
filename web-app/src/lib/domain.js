// Rules checked in the browser before anything is sent (the server checks them again). Taken from the iOS app's
// domain layer so both apps accept and refuse the same input.

export function checkEmail(email) {
  const parts = email.trim().split('@')
  const valid = parts.length === 2 && parts[0] && parts[1].includes('.') && !/\s/.test(email)
  return valid ? null : 'Enter a valid email address.'
}

export function checkPassword(password, confirm) {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (confirm !== undefined && password !== confirm) return 'The two passwords do not match.'
  return null
}

// Latitude / longitude are optional: blank means "not set", otherwise a number inside the range.
export function parseCoordinate(text, limit) {
  const t = String(text ?? '').trim()
  if (t === '') return { value: null, valid: true }
  const v = Number(t)
  return Number.isFinite(v) && Math.abs(v) <= limit ? { value: v, valid: true } : { value: null, valid: false }
}

export function checkIP(text) {
  const parts = text.trim().split('.')
  const ok = parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  return ok ? null : 'Enter a valid IP address, for example 192.168.1.50.'
}

export function checkPort(text) {
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? null : 'Port must be a number from 1 to 65535.'
}

// Does a camera use an RTSP path (/h264.sdp)? A phone camera app serves only ONE kind of stream at a time:
// while the media server holds its H.264/RTSP connection, the picture stream (/video) goes silent. So an RTSP-path
// camera is watched through the media server (HLS) and a /video camera is watched directly.
export const usesRtspPath = (camera) => camera.sourceType === 'MobileApp' && (camera.streamPath || '').toLowerCase().endsWith('.sdp')

// How far the setup of a property has got. Drives the Overview checklist.
export function computeSetup({ cameras = [], walls = [], grids = [], responseOn = false }) {
  const annotated = walls.length > 0 && walls.every((w) => w.wallTopPoints?.length >= 2 && w.wallBottomPoints?.length >= 2)
  const cellsMarked = walls.length > 0 && walls.every((w) => w.cells.length > 0)
  // The backend calls a wall ready ("Valid") when it has cells, a grid, the camera's grid position and a route per cell.
  const mapped = walls.length > 0 && walls.every((w) => w.laserGridId && w.cameraGridRow != null && w.cells.length > 0 && w.cells.every((c) => c.route.length > 0))
  return {
    cameraCount: cameras.length,
    wallsMarked: annotated && cellsMarked,
    laserGridCount: grids.length,
    mappingDone: mapped,
    droneCount: 0,                 // the drone feature does not exist on the server yet
    automaticResponseOn: responseOn,
  }
}

export const SETUP_STEPS = [
  { key: 'camera', title: 'Camera sources', to: '/cameras', done: (s) => s.cameraCount > 0, text: (s) => (s.cameraCount > 0 ? `${s.cameraCount} configured` : '0 configured') },
  { key: 'walls', title: 'Wall marking', to: '/perimeter', done: (s) => s.wallsMarked, text: (s) => (s.wallsMarked ? 'Done' : 'Not configured') },
  { key: 'grid', title: 'Laser grid', to: '/perimeter', done: (s) => s.laserGridCount > 0, text: (s) => (s.laserGridCount > 0 ? 'Done' : 'Not configured') },
  { key: 'mapping', title: 'Laser-grid mapping', to: '/perimeter', done: (s) => s.mappingDone, text: (s) => (s.mappingDone ? 'Done' : 'Not configured') },
  { key: 'drone', title: 'Drone', to: '/drones', done: (s) => s.droneCount > 0, text: (s) => (s.droneCount > 0 ? 'Registered' : 'Not available yet'), optional: true },
  { key: 'response', title: 'Automatic response', to: '/settings/response', done: (s) => s.automaticResponseOn, text: (s) => (s.automaticResponseOn ? 'Activated' : 'Not activated') },
]

// A wall as the server wants it for walls/update (the whole wall is replaced, so every field is sent back).
export const wallRequest = (wall, overrides = {}) => ({
  name: wall.name, cameraId: wall.cameraId, frameWidth: wall.frameWidth, frameHeight: wall.frameHeight,
  wallTopPoints: wall.wallTopPoints, wallBottomPoints: wall.wallBottomPoints,
  laserGridId: wall.laserGridId ?? null, cameraGridRow: wall.cameraGridRow ?? null, cameraGridCol: wall.cameraGridCol ?? null,
  ...overrides,
})

// How ready a wall is, in the order a person fixes things.
export function wallState(wall) {
  if (wall.cells.length === 0) return { label: 'No cells', tone: 'warn' }
  if (!wall.laserGridId) return { label: 'No grid', tone: 'warn' }
  if (wall.cameraGridRow == null) return { label: 'Camera position missing', tone: 'warn' }
  if (wall.cells.some((c) => c.route.length === 0)) return { label: 'Unlinked', tone: 'warn' }
  return { label: 'Ready', tone: 'ok' }
}

// A wall edge is a line through 2 to 100 points that follows the wall (the server's limits).
export const MAX_EDGE_POINTS = 100

// The two edges as the server wants them. Points stay in the order they were tapped, so an edge can follow corners and
// steps. A plain 2-point edge is stored left to right, whichever end was tapped first.
export function annotationFromEdges(top, bottom, width, height) {
  const toXY = (p) => [Number(p.x.toFixed(5)), Number(p.y.toFixed(5))]
  const edge = (points) => (points.length === 2 ? [...points].sort((p, q) => p.x - q.x) : points).map(toXY)
  return { frameWidth: width, frameHeight: height, wallTopPoints: edge(top), wallBottomPoints: edge(bottom) }
}

// The area between the two edges, for drawing: along the top, then back along the bottom. The bottom edge may have been
// tapped in either direction, so it is walked starting from the end nearest to where the top edge finishes.
export function wallOutline(top, bottom) {
  if (top.length < 2 || bottom.length < 2) return []
  const from = top[top.length - 1]
  const distance = (p) => Math.hypot(p.x - from.x, p.y - from.y)
  const startsNear = distance(bottom[0]) <= distance(bottom[bottom.length - 1])
  return [...top, ...(startsNear ? bottom : [...bottom].reverse())]
}
