import { describe, it, expect } from 'vitest'
import { annotationFromEdges, wallOutline, checkEmail, checkIP, checkPassword, checkPort, computeSetup, parseCoordinate, usesRtspPath, wallRequest, wallState } from './domain'
import { alertStatus, actionSentence, meters } from './format'

describe('input rules (the same as the iOS app)', () => {
  it('emails', () => {
    expect(checkEmail('a@b.co')).toBeNull()
    for (const bad of ['', 'a', 'a@b', 'a b@c.d', '@x.y']) expect(checkEmail(bad)).not.toBeNull()
  })
  it('passwords', () => {
    expect(checkPassword('12345678')).toBeNull()
    expect(checkPassword('1234567')).toMatch(/at least 8/)
    expect(checkPassword('12345678', 'different')).toMatch(/do not match/)
  })
  it('coordinates are optional but must be in range', () => {
    expect(parseCoordinate('', 90)).toEqual({ value: null, valid: true })
    expect(parseCoordinate(' 31.5 ', 90)).toEqual({ value: 31.5, valid: true })
    expect(parseCoordinate('91', 90).valid).toBe(false)
    expect(parseCoordinate('abc', 180).valid).toBe(false)
  })
  it('IP address and port', () => {
    expect(checkIP('192.168.0.107')).toBeNull()
    for (const bad of ['192.168.0', '256.1.1.1', 'a.b.c.d', '']) expect(checkIP(bad)).not.toBeNull()
    expect(checkPort('8080')).toBeNull()
    for (const bad of ['0', '70000', 'x', '80.5']) expect(checkPort(bad)).not.toBeNull()
  })
})

describe('which stream a phone camera uses', () => {
  it('an RTSP path (.sdp) goes through the media server; /video is direct', () => {
    expect(usesRtspPath({ sourceType: 'MobileApp', streamPath: '/h264.sdp' })).toBe(true)
    expect(usesRtspPath({ sourceType: 'MobileApp', streamPath: '/H264_ULAW.SDP' })).toBe(true)
    expect(usesRtspPath({ sourceType: 'MobileApp', streamPath: '/video' })).toBe(false)
    expect(usesRtspPath({ sourceType: 'Rtsp', streamPath: '/x.sdp' })).toBe(false)     // CCTV always uses the media server anyway
  })
})

describe('wall edges', () => {
  const p = (x, y) => ({ x, y })
  it('a 2-point edge is stored left to right, whichever end was tapped first', () => {
    expect(annotationFromEdges([p(0.9, 0.3), p(0.1, 0.31)], [p(0.8, 0.8), p(0.2, 0.79)], 640, 480)).toEqual({
      frameWidth: 640, frameHeight: 480, wallTopPoints: [[0.1, 0.31], [0.9, 0.3]], wallBottomPoints: [[0.2, 0.79], [0.8, 0.8]],
    })
  })
  it('a longer edge keeps the tapping order, so it can turn back on itself', () => {
    const a = annotationFromEdges([p(0.1, 0.4), p(0.6, 0.4), p(0.5, 0.9), p(0.7, 0.9)], [p(0.9, 0.8), p(0.5, 0.8), p(0.1, 0.8)], 640, 480)
    expect(a.wallTopPoints).toEqual([[0.1, 0.4], [0.6, 0.4], [0.5, 0.9], [0.7, 0.9]])
    expect(a.wallBottomPoints).toEqual([[0.9, 0.8], [0.5, 0.8], [0.1, 0.8]])
  })
  it('the outline walks back along the bottom edge from its nearer end, in either tapping direction', () => {
    const top = [p(0.1, 0.3), p(0.9, 0.3)], leftToRight = [p(0.1, 0.8), p(0.5, 0.8), p(0.9, 0.8)]
    const expected = [...top, ...[...leftToRight].reverse()]
    expect(wallOutline(top, leftToRight)).toEqual(expected)
    expect(wallOutline(top, [...leftToRight].reverse())).toEqual(expected)
    expect(wallOutline([p(0, 0)], leftToRight)).toEqual([])
  })
  it('a wall with long edges counts as marked in the setup checklist', () => {
    const wall = { wallTopPoints: [[0, 0], [0.5, 0], [1, 0]], wallBottomPoints: [[0, 1], [1, 1]], cells: [{ route: [] }] }
    expect(computeSetup({ walls: [wall] }).wallsMarked).toBe(true)
  })
})

describe('wall state and the wall request', () => {
  const cell = (route) => ({ route })
  it('walks through what is missing, in order', () => {
    expect(wallState({ cells: [] }).label).toBe('No cells')
    expect(wallState({ cells: [cell([])] }).label).toBe('No grid')
    expect(wallState({ cells: [cell([])], laserGridId: 'g' }).label).toBe('Camera position missing')
    expect(wallState({ cells: [cell([])], laserGridId: 'g', cameraGridRow: 0 }).label).toBe('Unlinked')
    expect(wallState({ cells: [cell([{ row: 0, col: 0 }])], laserGridId: 'g', cameraGridRow: 0 })).toEqual({ label: 'Ready', tone: 'ok' })
  })
  it('walls/update gets every field back (the server replaces the whole wall)', () => {
    const wall = { name: 'W', cameraId: 'c', frameWidth: 640, frameHeight: 480, wallTopPoints: [[0, 0], [1, 0]], wallBottomPoints: [[0, 1], [1, 1]], cells: [{}], id: 'x' }
    const req = wallRequest(wall, { name: 'Renamed' })
    expect(req).toEqual({ name: 'Renamed', cameraId: 'c', frameWidth: 640, frameHeight: 480, wallTopPoints: [[0, 0], [1, 0]], wallBottomPoints: [[0, 1], [1, 1]], laserGridId: null, cameraGridRow: null, cameraGridCol: null })
    expect(req.cells).toBeUndefined()
  })
})

describe('setup progress', () => {
  const route = [{ row: 0, col: 0 }]
  const ready = { id: 'w', wallTopPoints: [[0, 0], [1, 0]], wallBottomPoints: [[0, 1], [1, 1]], laserGridId: 'g', cameraGridRow: 0, cells: [{ route }] }
  it('nothing set up', () => {
    expect(computeSetup({})).toMatchObject({ cameraCount: 0, wallsMarked: false, laserGridCount: 0, mappingDone: false, automaticResponseOn: false })
  })
  it('everything set up', () => {
    const s = computeSetup({ cameras: [{}], walls: [ready], grids: [{}], responseOn: true })
    expect(s).toMatchObject({ cameraCount: 1, wallsMarked: true, laserGridCount: 1, mappingDone: true, automaticResponseOn: true })
  })
  it('mapping needs the camera position too, like the server', () => {
    expect(computeSetup({ walls: [{ ...ready, cameraGridRow: null }], grids: [{}] }).mappingDone).toBe(false)
  })
})

describe('texts', () => {
  it('alert status', () => {
    expect(alertStatus('New')).toMatchObject({ label: 'Person detected', active: true })
    expect(alertStatus('FalseAlarm')).toMatchObject({ label: 'False alarm', active: false })
    expect(alertStatus('Escalated').active).toBe(false)
  })
  it('history sentences', () => {
    expect(actionSentence({ action: 'MarkFalseAlarm', byName: 'Bilal', byRole: 'Guard' })).toBe('Bilal (Guard) marked it as a false alarm')
    expect(actionSentence({ action: 'Close', byName: 'A', byRole: 'Admin', note: 'done' })).toBe('A (Admin) closed the incident: done')
  })
  it('meters', () => { expect(meters(10)).toBe('10'); expect(meters(3.5)).toBe('3.5') })
})
