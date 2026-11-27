// Takes a visual tour: seeds a realistic property through the API, then screenshots every screen (light, dark, phone width).
//   SHOT_JPEG=... FRAMES_DIR=... FACE_DIR=... SHOT_DIR=... node e2e/shots.mjs
import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'

const WEB = process.env.WEB_URL || 'http://localhost:5173', API = process.env.API_URL || 'http://localhost:5078/api/v1'
const SHOT = process.env.SHOT_JPEG, FRAMES = process.env.FRAMES_DIR, FACES = process.env.FACE_DIR, OUT = process.env.SHOT_DIR
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const stamp = Date.now() % 1000000
const admin = { email: `tour${stamp}@example.test`, password: 'Passw0rd!x' }
const jpeg = fs.readFileSync(SHOT)
const phone = http.createServer((req, res) => {
  if (req.url.startsWith('/shot.jpg')) { res.setHeader('Content-Type', 'image/jpeg'); return res.end(jpeg) }
  if (req.url.startsWith('/video')) { res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame' }); const send = () => { res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`); res.write(jpeg); res.write('\r\n') }; send(); const t = setInterval(send, 400); req.on('close', () => clearInterval(t)); return }
  res.statusCode = 404; res.end()
})
await new Promise((r) => phone.listen(0, '127.0.0.1', r)); const port = phone.address().port
async function api(method, path, { token, body, form } = {}) {
  const res = await fetch(API + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : form })
  const t = await res.text(); return { status: res.status, body: t ? JSON.parse(t) : null }
}
await api('POST', '/auth/register', { body: { fullName: 'Hamza Khan', email: admin.email, password: admin.password, phoneNumber: '' } })
const token = (await api('POST', '/auth/login', { body: admin })).body.accessToken
const P = (await api('POST', '/properties/create', { token, body: { name: 'Head Office', address: '12 Mall Road, Lahore', note: 'Gate code changes on Mondays', latitude: 31.5204, longitude: 74.3587 } })).body
await api('POST', '/properties/create', { token, body: { name: 'Warehouse', address: 'Plot 4, Industrial Area' } })
const cam = async (name) => (await api('POST', `/cameras/create?propertyId=${P.id}`, { token, body: { name, sourceType: 'MobileApp', host: '127.0.0.1', port, streamPath: '/video' } })).body
const c1 = await cam('Front gate'); await cam('North fence')
const grid = (await api('POST', `/laser-grids/create?propertyId=${P.id}`, { token, body: { name: 'Main grid', rows: 4, columns: 6, squareSizeMeters: 2.5 } })).body
const q = (l, a, b) => ({ label: l, lengthMeters: 10, topLeft: [a, 0.5], bottomLeft: [a, 0.9], topRight: [b, 0.5], bottomRight: [b, 0.9] })
async function makeWall(name, fw, fh, cells, routes) {
  const w = (await api('POST', `/walls/create?propertyId=${P.id}`, { token, body: { name, cameraId: c1.id, frameWidth: fw, frameHeight: fh, wallTopPoints: [[0.1, 0.4], [0.9, 0.4]], wallBottomPoints: [[0.1, 0.6], [0.9, 0.6]] } })).body
  await api('PUT', `/walls/save-cells?propertyId=${P.id}&wallId=${w.id}`, { token, body: cells })
  await api('PUT', `/walls/update?propertyId=${P.id}&wallId=${w.id}`, { token, body: { name, cameraId: c1.id, frameWidth: fw, frameHeight: fh, wallTopPoints: [[0.1, 0.4], [0.9, 0.4]], wallBottomPoints: [[0.1, 0.6], [0.9, 0.6]], laserGridId: grid.id, cameraGridRow: 0, cameraGridCol: 3 } })
  const full = (await api('GET', `/walls/get?propertyId=${P.id}&wallId=${w.id}`, { token })).body
  for (let i = 0; i < full.cells.length; i++) await api('PUT', `/walls/set-cell-route?propertyId=${P.id}&wallId=${w.id}&cellId=${full.cells[i].id}`, { token, body: routes[i] })
  return w
}
const north = await makeWall('North wall', 640, 480, [q('A1', 0.05, 0.35), q('A2', 0.35, 0.65), q('A3', 0.65, 0.95)], [[{ row: 1, col: 0 }, { row: 1, col: 1 }], [{ row: 1, col: 2 }, { row: 1, col: 3 }], [{ row: 1, col: 4 }]])
const alarm = await makeWall('Back wall', 478, 850, [q('B1', 0.05, 0.45), q('B2', 0.55, 0.95)], [[{ row: 3, col: 0 }], [{ row: 3, col: 1 }]])
const guardInfo = { fullName: 'Bilal Ahmed', email: `tourg${stamp}@example.test`, password: 'Passw0rd!x', phoneNumber: '' }
const g = (await api('POST', '/guards/create', { token, body: guardInfo })).body
await api('PUT', `/properties/assign-guard?propertyId=${P.id}&guardId=${g.id}`, { token })
let incident = null
const ml = (await api('GET', '/ml/health', { token })).body
if (ml.available && FRAMES) {
  await api('POST', `/detection/start?propertyId=${P.id}&wallId=${alarm.id}&threshold=0.5`, { token })
  await api('POST', `/detection/start?propertyId=${P.id}&wallId=${north.id}&threshold=0.5`, { token })
  const index = JSON.parse(fs.readFileSync(`${FRAMES}/index.json`, 'utf8'))
  for (const f of index) {
    const form = new FormData(); form.append('frame', new Blob([fs.readFileSync(`${FRAMES}/f_${String(f.i).padStart(5, '0')}.jpg`)], { type: 'image/jpeg' }), 'f.jpg'); form.append('frameIndex', String(f.i)); form.append('timestampSeconds', String(f.t))
    const r = await (await fetch(`${API}/detection/send-frame?propertyId=${P.id}&wallId=${alarm.id}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })).json()
    if (r.alarmRaised) { incident = r; break }
  }
  const items = (await api('GET', `/alerts/list?propertyId=${P.id}`, { token })).body.items
  if (items[0]) await api('POST', `/alerts/acknowledge?alertId=${items[0].id}`, { token, body: {} })
}
if (FACES) {
  const form = new FormData(); form.append('name', 'Alia Khan'); form.append('category', 'Resident'); form.append('note', 'Lives in the main house')
  for (const [k, f] of [['front', 'Alia Bhatt_0.jpg'], ['left', 'Alia Bhatt_13.jpg'], ['right', 'Alia Bhatt_15.jpg']]) form.append(k, new Blob([fs.readFileSync(`${FACES}/${f}`)], { type: 'image/jpeg' }), f)
  console.log('enrol person:', (await api('POST', `/people/enroll?propertyId=${P.id}`, { token, form })).status)
}
const alerts = (await api('GET', `/alerts/list?propertyId=${P.id}`, { token })).body.items

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
async function tour(prefix, { width, height, scheme }) {
  const page = await browser.newPage()
  await page.setViewport({ width, height })
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
  await page.evaluateOnNewDocument((t) => { try { sessionStorage.setItem('aerosentry.accessToken', t) } catch {} }, token)
  const pages = [['01-overview', '/'], ['02-incidents', '/incidents'], ['04-cameras', '/cameras'], ['05-add-camera', '/cameras/new'], ['06-perimeter', '/perimeter'], ['07-wall', `/perimeter/walls/${north.id}`],
    ['08-cells', `/perimeter/walls/${north.id}/cells`], ['09-mapping', `/perimeter/walls/${north.id}/mapping`], ['10-response', '/settings/response'], ['11-guards', '/settings/guards'],
    ['12-people', '/settings/people'], ['13-properties', '/settings/properties'], ['14-appearance', '/settings/appearance'], ['15-drones', '/drones']]
  if (alerts[0]) pages.splice(2, 0, ['03-incident', `/incidents/${alerts[0].id}`])
  for (const [name, path] of pages) {
    await page.goto(WEB + path, { waitUntil: 'domcontentloaded' })
    await new Promise((r) => setTimeout(r, path.includes('cells') || path.includes('walls') || path === '/cameras' || path === '/' ? 2600 : 1400))
    await page.screenshot({ path: `${OUT}/${prefix}-${name}.png` })
  }
  await page.close()
}
await tour('L', { width: 1440, height: 900, scheme: 'light' })
await tour('D', { width: 1440, height: 900, scheme: 'dark' })
await tour('M', { width: 390, height: 844, scheme: 'light' })
// the signed-out screens
const anon = await browser.newPage(); await anon.setViewport({ width: 1440, height: 900 }); await anon.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])
for (const [n, p] of [['login', '/login'], ['register', '/register']]) { await anon.goto(WEB + p, { waitUntil: 'domcontentloaded' }); await new Promise((r) => setTimeout(r, 800)); await anon.screenshot({ path: `${OUT}/L-00-${n}.png` }) }
await browser.close(); phone.close()
// tidy
const t = (await api('POST', '/auth/login', { body: admin })).body.accessToken
for (const p of (await api('GET', '/properties/list', { token: t })).body) await api('DELETE', `/properties/delete?propertyId=${p.id}`, { token: t })
await api('DELETE', `/guards/delete?guardId=${g.id}`, { token: t })
console.log('done')
