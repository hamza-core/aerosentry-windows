// Integration test: the real service layer against the REAL running backend (http://localhost:5078).
// Run:  npm test      (the backend and SQL Server must be running; it creates and removes its own test data)
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import { tokenStore } from '../network/tokenStore'
import { ApiError } from '../network/networkLayer'
import { authService } from './authService'
import { propertyService } from './propertyService'
import { guardService } from './guardService'
import { cameraService } from './cameraService'
import { perimeterService } from './perimeterService'
import { alertService } from './alertService'
import { personService } from './personService'
import { detectionService } from './detectionService'

const stamp = Date.now() % 1000000
const adminEmail = `web${stamp}@example.test`, guardEmail = `webg${stamp}@example.test`, password = 'Passw0rd!x'
const SHOT = process.env.SHOT_JPEG        // a 640 x 480 JPEG for the fake phone camera; without it this test is skipped
let phone, phonePort

async function signIn(email) {
  const login = await authService.login(email, password)
  tokenStore.save(login.accessToken)
  return login.user
}

beforeAll(async () => {
  if (!SHOT) return
  // a fake phone camera that serves a real JPEG at /shot.jpg, like the IP Webcam app
  phone = http.createServer((req, res) => {
    if (req.url.startsWith('/shot.jpg')) { res.setHeader('Content-Type', 'image/jpeg'); res.end(fs.readFileSync(SHOT)) }
    else { res.statusCode = 404; res.end() }
  })
  await new Promise((r) => phone.listen(0, '127.0.0.1', r))
  phonePort = phone.address().port
})
afterAll(() => { phone?.close(); tokenStore.delete() })

describe.skipIf(!SHOT)('web services against the live backend', () => {
  let admin, guard, property, camera, wall, grid

  it('register, wrong password, login, me', async () => {
    const created = await authService.register({ fullName: 'Web Admin', email: adminEmail, password })
    expect(created.role).toBe('Admin')
    await expect(authService.register({ fullName: 'x', email: adminEmail, password })).rejects.toMatchObject({ status: 409, message: 'Email already registered' })
    await expect(authService.login(adminEmail, 'wrong-password')).rejects.toMatchObject({ status: 401, message: 'Invalid email or password' })
    await expect(authService.register({ fullName: 'x', email: `s${stamp}@example.test`, password: '123' })).rejects.toThrow(/minimum length of 8/)
    admin = await signIn(adminEmail)
    expect(admin.email).toBe(adminEmail)
    expect((await authService.me()).id).toBe(admin.id)
  })

  it('properties: create with note, list sorted, search, update, 501-char note refused', async () => {
    property = await propertyService.create({ name: 'Head Office', address: '12 Secret Street', note: 'gate code Mondays', latitude: 31.5, longitude: 74.3 })
    expect(property.note).toBe('gate code Mondays')
    const second = await propertyService.create({ name: 'Annex', address: 'Plain Rd' })
    expect((await propertyService.list()).map((p) => p.name)).toEqual(['Annex', 'Head Office'])
    expect((await propertyService.list('secret')).map((p) => p.name)).toEqual(['Head Office'])
    const up = await propertyService.update(property.id, { name: 'Head Office 2', address: '13 New', note: null })
    expect(up.name).toBe('Head Office 2')
    await expect(propertyService.create({ name: 'N', address: 'A', note: 'x'.repeat(501) })).rejects.toThrow(/500/)
    await propertyService.remove(second.id)
  })

  it('guards: create, assign, suspend, the guard sees no address and cannot edit', async () => {
    guard = await guardService.create({ fullName: 'Bilal', email: guardEmail, password })
    expect(guard.status).toBe('Active')
    await expect(guardService.create({ fullName: 'Dup', email: guardEmail, password })).rejects.toMatchObject({ status: 409 })
    await propertyService.assignGuard(property.id, guard.id)
    expect((await propertyService.listGuards(property.id)).map((g) => g.email)).toEqual([guardEmail])
    const adminToken = tokenStore.read()
    await signIn(guardEmail)
    const seen = await propertyService.list()
    expect(seen.map((p) => p.name)).toEqual(['Head Office 2'])
    expect(seen[0].address).toBeNull()
    await expect(propertyService.update(property.id, { name: 'x', address: 'y' })).rejects.toMatchObject({ status: 403 })
    tokenStore.save(adminToken)
    await guardService.setStatus(guard.id, true)
    expect((await guardService.list())[0].status).toBe('Suspended')
    await expect(authService.login(guardEmail, password)).rejects.toMatchObject({ status: 403 })
    await guardService.setStatus(guard.id, false)
  })

  it('cameras: test connection, create, list, snapshot with its size', async () => {
    const input = { name: 'Gate', sourceType: 'MobileApp', host: '127.0.0.1', port: phonePort, streamPath: '/video', isActive: true }
    expect((await cameraService.testConnection(property.id, input)).reachable).toBe(true)
    expect((await cameraService.testConnection(property.id, { ...input, port: 1 })).reachable).toBe(false)
    camera = await cameraService.create(property.id, input)
    expect(camera.playbackUrl).toContain(`cam-${camera.id}`)
    await expect(cameraService.create(property.id, input)).rejects.toMatchObject({ status: 409 })
    const shot = await cameraService.snapshot(property.id, camera.id)
    expect(shot.width).toBe(640); expect(shot.height).toBe(480); expect(shot.blob.size).toBeGreaterThan(1000)
  })

  it('walls: annotate, cells, grid, routes, validate, edit, delete', async () => {
    wall = await perimeterService.createWall(property.id, {
      name: 'North wall', cameraId: camera.id, frameWidth: 640, frameHeight: 480,
      wallTopPoints: [[0.1, 0.3], [0.9, 0.3]], wallBottomPoints: [[0.1, 0.8], [0.9, 0.8]],
    })
    expect(wall.wallTopPoints).toEqual([[0.1, 0.3], [0.9, 0.3]])
    const cell = (label, a, b) => ({ label, lengthMeters: 10, topLeft: [a, 0.4], bottomLeft: [a, 0.8], topRight: [b, 0.4], bottomRight: [b, 0.8] })
    await perimeterService.saveCells(property.id, wall.id, [cell('A1', 0.1, 0.5), cell('A2', 0.5, 0.9)])
    grid = await perimeterService.createGrid(property.id, { name: 'Grid 1', rows: 4, columns: 5, squareSizeMeters: 2.5 })
    await perimeterService.updateWall(property.id, wall.id, { ...wall, laserGridId: grid.id })
    wall = await perimeterService.getWall(property.id, wall.id)
    expect(wall.cells.map((c) => c.label)).toEqual(['A1', 'A2'])
    await perimeterService.setCellRoute(property.id, wall.id, wall.cells[0].id, [{ row: 0, col: 0 }, { row: 0, col: 1 }])
    await expect(perimeterService.setCellRoute(property.id, wall.id, wall.cells[1].id, [{ row: 0, col: 1 }])).rejects.toMatchObject({ status: 409 })
    expect((await perimeterService.validateWall(property.id, wall.id)).status).toBe('Invalid')           // A2 has no route yet
    await perimeterService.setCellRoute(property.id, wall.id, wall.cells[1].id, [{ row: 1, col: 2 }])
    // Valid also needs the camera's own position on the grid.
    const problems = (await perimeterService.validateWall(property.id, wall.id)).problems
    expect(problems).toEqual(['The camera position on the laser grid is not set'])
    await expect(perimeterService.updateWall(property.id, wall.id, { ...wall, laserGridId: grid.id, cameraGridRow: 9, cameraGridCol: 0 })).rejects.toThrow(/outside the laser grid/)
    await perimeterService.updateWall(property.id, wall.id, { ...wall, laserGridId: grid.id, cameraGridRow: 0, cameraGridCol: 2 })
    expect((await perimeterService.validateWall(property.id, wall.id)).status).toBe('Valid')
    await perimeterService.saveAnnotation(property.id, wall.id, { frameWidth: 640, frameHeight: 480, wallTopPoints: [[0.15, 0.3], [0.85, 0.3]], wallBottomPoints: [[0.15, 0.8], [0.85, 0.8]] })
    expect((await perimeterService.getWall(property.id, wall.id)).wallTopPoints[0]).toEqual([0.15, 0.3])
    await expect(perimeterService.removeGrid(property.id, grid.id)).rejects.toMatchObject({ status: 409 })   // a wall uses it
  })

  it('alerts and people lists work; ml health answers; detection start needs the ML service', async () => {
    const page = await alertService.list({ propertyId: property.id })
    expect(page.items).toEqual([]); expect(page.totalCount).toBe(0)
    expect(await personService.list(property.id)).toEqual([])
    const health = await detectionService.mlHealth()
    expect(typeof health.available).toBe('boolean')
    await detectionService.stop(property.id, wall.id).catch((e) => expect(e).toBeInstanceOf(ApiError))
  })

  it('cleans up: wall, grid, camera, guard, property', async () => {
    await perimeterService.removeWall(property.id, wall.id)
    await perimeterService.removeGrid(property.id, grid.id)
    await cameraService.remove(property.id, camera.id)
    await guardService.remove(guard.id)
    await propertyService.remove(property.id)
    expect(await propertyService.list()).toEqual([])
  })
})
