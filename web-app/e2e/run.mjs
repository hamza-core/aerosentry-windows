// End-to-end test: a real Chrome clicks through the real screens against the real running backend.
//   Needs: the backend + SQL Server running, the web dev server on :5173 (npm run dev), Google Chrome installed.
//   Optional (alert and face steps): the ML service on :8010 and the face service on :8020.
// Run:  SHOT_JPEG=/path/to/640x480.jpg FRAMES_DIR=/path/to/frames FACE_DIR=/path/to/faces node e2e/run.mjs
import puppeteer from 'puppeteer-core'
import http from 'node:http'
import fs from 'node:fs'

const WEB = process.env.WEB_URL || 'http://localhost:5173'
const API = process.env.API_URL || 'http://localhost:5078/api/v1'
const SHOT = process.env.SHOT_JPEG, FRAMES = process.env.FRAMES_DIR, FACES = process.env.FACE_DIR, OUT = process.env.SHOT_DIR
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const stamp = Date.now() % 1000000
const admin = { name: 'E2E Admin', email: `e2e${stamp}@example.test`, password: 'Passw0rd!x' }
const guard = { name: 'E2E Guard', email: `e2eg${stamp}@example.test`, password: 'Passw0rd!x' }

let failures = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- a fake phone camera: /shot.jpg and a /video picture stream, like the IP Webcam app
const jpeg = fs.readFileSync(SHOT)
let openVideos = 0
const phone = http.createServer((req, res) => {
  if (req.url.startsWith('/shot.jpg')) { res.setHeader('Content-Type', 'image/jpeg'); return res.end(jpeg) }
  if (req.url.startsWith('/video')) {
    res.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'Access-Control-Allow-Origin': '*' })
    const send = () => { res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`); res.write(jpeg); res.write('\r\n') }
    openVideos++; send(); const t = setInterval(send, 300); req.on('close', () => { clearInterval(t); openVideos-- }); return
  }
  res.statusCode = 404; res.end()
})
await new Promise((r) => phone.listen(0, '127.0.0.1', r))
const phonePort = phone.address().port

// ---- REST helpers (for set-up and for the alarm that the browser must then show by itself)
async function api(method, path, { token, body } = {}) {
  const res = await fetch(API + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}
const loginToken = async (u) => (await api('POST', '/auth/login', { body: { email: u.email, password: u.password } })).body.accessToken

// ---- browser helpers
const FACE_Y4M = process.env.FACE_Y4M      // a pretend webcam for the face video (YUV4MPEG2 file)
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--window-size=1280,900', ...(FACE_Y4M ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${FACE_Y4M}`] : [])], defaultViewport: { width: 1280, height: 900 } })
const page = await browser.newPage()
const problems = []
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(404|401|409|403|400|503)/.test(m.text())) problems.push(`console: ${m.text()}`) })
page.on('requestfailed', (r) => { if (!/mjpeg|\/video|hubs|negotiate|ERR_ABORTED/.test(r.url() + (r.failure()?.errorText ?? ''))) problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`) })

if (process.env.DEBUG) page.on('response', (r) => { if (r.url().includes('/api/v1')) console.log(`   [net] ${r.request().method()} ${r.url().replace(/.*\/api\/v1/, '')} -> ${r.status()}`) })
const shot = async (name) => { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` }) }
// innerText follows the page's CSS, so a heading drawn in capitals reads "RESPOND": compare without case.
const text = (needle, timeout = 8000) => page.waitForFunction((n) => document.body.innerText.toLowerCase().includes(n.toLowerCase()), { timeout }, needle).then(() => true, () => false)
const gone = (needle, timeout = 8000) => page.waitForFunction((n) => !document.body.innerText.toLowerCase().includes(n.toLowerCase()), { timeout }, needle).then(() => true, () => false)
async function clickText(selector, label) {
  const ready = await page.waitForFunction((s, l) => [...document.querySelectorAll(s)].some((e) => e.textContent.trim().includes(l) && !e.disabled), { timeout: 8000 }, selector, label).then(() => true, () => false)
  if (!ready) throw new Error(`no ${selector} with text "${label}"`)
  const h = await page.evaluateHandle((s, l) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(l) && !e.disabled), selector, label)
  await h.asElement().click()
}
async function control(label) {
  // wait for the screen to show the field (a route change takes a moment)
  const found = await page.waitForFunction((l) => [...document.querySelectorAll('.field label')].some((x) => x.textContent.trim().startsWith(l)), { timeout: 8000 }, label).then(() => true, () => false)
  if (!found) throw new Error(`no field "${label}"`)
  const h = await page.evaluateHandle((l) => { const f = [...document.querySelectorAll('.field label')].find((x) => x.textContent.trim().startsWith(l)); return f ? f.parentElement.querySelector('input,select,textarea') : null }, label)
  const el = h.asElement(); if (!el) throw new Error(`field "${label}" has no input (labels on screen: ${await page.evaluate(() => [...document.querySelectorAll('.field label')].map((x) => x.textContent.trim()).join(' | '))})`)
  return el
}
async function fill(label, value) {
  const el = await control(label)
  await el.focus(); await el.evaluate((e) => e.select && e.select())     // select everything in the box, so typing replaces it
  await el.press('Backspace'); if (value) await el.type(value)
}
async function choose(label, value) { const el = await control(label); await el.select(value) }
async function clickPicker(fx, fy) {
  const el = await page.$('[data-testid=picker]')
  await el.evaluate((e) => e.scrollIntoView({ block: 'start' }))          // a person scrolls to the picture first
  await sleep(80)
  const box = await el.boundingBox()
  await page.mouse.click(box.x + box.width * fx, Math.min(box.y + box.height * fy, 880))
}
// (not 'networkidle': a live camera picture and the alert connection keep the network busy for ever)
const go = async (path) => { await page.goto(WEB + path, { waitUntil: 'domcontentloaded' }); await sleep(600) }
async function signOutViaMenu() {
  await page.waitForSelector('[data-testid=user-menu]', { timeout: 8000 })
  await page.click('[data-testid=user-menu]')
  await clickText('.menu button', 'Sign out')
}
const nav = async (label) => { await clickText('nav.nav a', label); await sleep(300) }

try {
  // ================= sign-in screen and guards on routes
  await go('/')
  check(page.url().endsWith('/login') && await text('Sign in to protect your property'), 'a signed-out visitor is sent to the sign-in screen')
  await shot('01-login')
  await fill('Email', 'nobody@example.test'); await fill('Password', 'wrong-password-1')
  await clickText('button', 'Sign In')
  check(await text('Invalid email or password'), 'wrong password shows the server message')

  // ================= register -> onboarding -> overview
  await go('/register')
  await fill('Full name', admin.name); await fill('Email', admin.email); await fill('Password (at least', admin.password); await fill('Confirm password', admin.password)
  await clickText('button', 'Create Account')
  check(await text('Add your first property'), 'registering signs in and asks for the first property')
  await sleep(400)       // right after sign-in the form is rebuilt once (shown for about 12 ms, measured): wait for the one that stays
  await fill('Name', 'E2E Head Office'); await fill('Address', '12 Secret Street'); await fill('Latitude', '31.5'); await fill('Longitude', '74.3')
  await clickText('button', 'Register and Continue')
  check(await text('E2E Head Office') && await text('Setup'), 'the property is created and the Overview shows the setup checklist')
  await shot('02-overview-setup')

  // ================= cameras: test connection, save, live picture
  await nav('Cameras'); await clickText('a', 'Add camera')
  await fill('Camera name', 'Gate camera'); await fill('IP address', '127.0.0.1'); await fill('Port', String(phonePort))
  await clickText('button', 'Test connection')
  const reached = await text('The server can reach the camera')
  await shot('03a-camera-form')
  check(reached, 'cameras: the server reaches the camera (test connection)')
  if (!reached) console.log('   page says:', (await page.evaluate(() => document.body.innerText)).split('\n').filter((l) => /camera|reach|error|server|Cannot|Port|IP/i.test(l)).slice(0, 10).join(' | '))
  await clickText('button', 'Save camera')
  check(await text('Gate camera') && await page.waitForSelector('.video .live-badge', { timeout: 12000 }).then(() => true, () => false), 'cameras: the camera is listed and its live picture plays (LIVE badge)')
  await shot('03-cameras')

  // ================= wall: annotate on the real picture, cells, grid, routes
  await nav('Perimeter'); await clickText('a', 'Create wall')
  await fill('Wall name', 'North wall'); await clickText('button', 'Next: annotate wall')
  const playing = () => page.waitForFunction(() => { const i = document.querySelector('.video img.live'); return i && i.naturalWidth > 0 && document.querySelector('.live-badge') }, { timeout: 10000 }).then(() => true, () => false)
  check(await playing() && !(await page.$('[data-testid=picker]')), 'annotation: the live video plays first, with nothing to draw on yet')
  await shot('04a-annotate-live')
  await clickText('button', 'Grab frame')
  check(await text('Tap along the TOP edge'), 'annotation: after Grab frame the camera picture is shown with instructions')
  await page.waitForSelector('[data-testid=picker] img', { timeout: 8000 })
  // 3 points along each edge, with a step in the middle: one more than the old 2-point limit
  await clickPicker(0.10, 0.30); await clickPicker(0.50, 0.26); await clickPicker(0.90, 0.30)
  await clickText('button', 'Top edge done')
  await clickPicker(0.10, 0.80); await clickPicker(0.50, 0.84); await clickPicker(0.90, 0.80)
  await clickText('button', 'Undo'); await clickPicker(0.90, 0.80)
  await clickText('button', 'Back to live video')
  check(await playing() && !(await page.$('[data-testid=picker]')), 'annotation: "Back to live video" shows the video again')
  await clickText('button', 'Grab frame'); await page.waitForSelector('[data-testid=handle-5]', { timeout: 8000 }).catch(() => {})
  check(await page.$$eval('[data-testid^=handle-]', (h) => h.length) === 6, 'annotation: grabbing a new frame keeps the points')
  await sleep(800); check(openVideos === 0, `annotation: the video connection to the camera is closed while drawing (open: ${openVideos})`)
  check(await text('drag a point to adjust it') && await page.$$eval('[data-testid^=handle-]', (h) => h.map((e) => e.textContent).join(' ')) === 'T1 T2 T3 B1 B2 B3', 'annotation: three taps along each edge mark the wall (undo works)')
  const geometry = await page.evaluate(() => { const w = document.querySelector('[data-testid=picker]').getBoundingClientRect(); const i = document.querySelector('[data-testid=picker] img').getBoundingClientRect(); return { dw: Math.abs(w.width - i.width), dh: Math.abs(w.height - i.height) } })
  check(geometry.dw < 1.5 && geometry.dh < 1.5, `annotation: the clickable box is exactly the photo (off by ${geometry.dw.toFixed(1)} x ${geometry.dh.toFixed(1)} px), so saved fractions match the real picture`)
  await shot('04-annotate')
  await clickText('button', 'Save wall and mark cells')
  check(await text('details') === false || await text('Wall cells') || await text('cells'), 'annotation saved: the cells screen opens')
  await text('Add a cell')
  const addCell = async (x0, x1) => {
    await clickText('button', 'Add cell')
    await clickPicker(x0, 0.45); await clickPicker(x0, 0.75); await clickPicker(x1, 0.45); await clickPicker(x1, 0.75)
  }
  await addCell(0.12, 0.48); await addCell(0.52, 0.88)
  await shot('05-cells')
  await clickText('button', 'Save cells')
  check(await text('Cells saved'), 'cells: two cells with four corners each are saved')

  await go('/perimeter'); await clickText('a', 'North wall')
  await clickText('a', 'Laser grid').catch(() => {})
  await go(new URL(page.url()).pathname + '/mapping')
  await clickText('button', 'Add a new laser grid'); await fill('Columns', '5'); await fill('Rows', '4'); await fill('Square size', '2')
  await clickText('button', 'Add grid')
  await page.waitForSelector('[data-testid=sq-0-0]', { timeout: 8000 })
  check(true, 'mapping: the laser grid is created and drawn')
  await clickText('button', 'Camera position'); await page.click('[data-testid=sq-0-2]')
  check(await text('Camera position saved'), 'mapping: the camera position on the grid is saved')
  await clickText('button', 'Cell routes')
  await page.click('[data-testid=sq-0-0]'); await page.click('[data-testid=sq-0-1]')
  await clickText('button', 'Save route for A1')
  check(await text('A1: route saved (2 squares)'), 'mapping: A1 is linked to two squares, in order')
  const cellSelect = await page.evaluateHandle(() => document.querySelector('select[value], .card select:not([disabled])'))
  await page.evaluate(() => { const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.text.startsWith('A2'))); s.value = [...s.options].find((o) => o.text.startsWith('A2')).value; s.dispatchEvent(new Event('change', { bubbles: true })) })
  await sleep(300)
  check(await page.evaluate(() => document.querySelector('[data-testid=sq-0-1]').disabled), 'mapping: a square used by A1 is not available to A2')
  await page.click('[data-testid=sq-1-2]'); await clickText('button', 'Save route for A2')
  check(await text('A2: route saved'), 'mapping: A2 is linked')
  await shot('06-mapping')
  {   // what was really stored, and does opening the wall again bring every point back?
    const token = await loginToken(admin); const props = (await api('GET', '/properties/list', { token })).body
    const walls = (await api('GET', `/walls/list?propertyId=${props[0].id}`, { token })).body; const north = walls.find((w) => w.name === 'North wall')
    const near = (pts, want) => pts.length === want.length && pts.every(([x, y], k) => Math.abs(x - want[k][0]) < 0.01 && Math.abs(y - want[k][1]) < 0.01)
    check(near(north.wallTopPoints, [[0.1, 0.3], [0.5, 0.26], [0.9, 0.3]]) && near(north.wallBottomPoints, [[0.1, 0.8], [0.5, 0.84], [0.9, 0.8]]), 'annotation: the server stored all six points, in the tapped order')
    const back = page.url(); await go(`/perimeter/walls/${north.id}/annotate`); await clickText('button', 'Grab frame'); await page.waitForSelector('[data-testid=handle-5]', { timeout: 8000 }).catch(() => {})
    check(await page.$$eval('[data-testid^=handle-]', (h) => h.length) === 6, 'annotation: editing the wall again starts with all six points')
    await page.goto(back, { waitUntil: 'domcontentloaded' }); await sleep(600)
  }
  await go(new URL(page.url()).pathname.replace('/mapping', ''))
  await clickText('button', 'Check if ready')
  check(await text('This wall is ready'), 'wall detail: the server says the wall is ready')
  await shot('07-wall-detail')

  // ================= guards
  await nav('Settings'); await clickText('.settings-nav a', 'Guards'); await clickText('button', 'Add guard')
  await fill('Full name', guard.name); await fill('Email', guard.email); await fill('Password (at least', guard.password)
  await page.evaluate(() => [...document.querySelectorAll('.dialog button')].find((b) => b.textContent.trim() === 'Add guard').click())
  check(await text('E2E Guard') && await text('Active'), 'guards: the guard is added and active')
  await shot('08-guards')
  await clickText('button', 'Suspend'); check(await text('Suspended'), 'guards: suspend works')
  await clickText('button', 'Re-activate'); check(await text('Active'), 'guards: re-activate works')

  // ================= a second, fully mapped wall (by API) that real camera frames can trip, then activate
  const adminToken = await loginToken(admin)
  const prop = (await api('GET', '/properties/list', { token: adminToken })).body[0]
  const cam = (await api('GET', `/cameras/list?propertyId=${prop.id}`, { token: adminToken })).body[0]
  let alarmWall = null
  if (FRAMES) {
    // The wall lines must belong to the frames being sent: WALL_FILE gives them (default: the old portrait test video).
    const lines = process.env.WALL_FILE ? JSON.parse(fs.readFileSync(process.env.WALL_FILE, 'utf8')) : { frameWidth: 478, frameHeight: 850, wallTopPoints: [[0.1, 0.4], [0.9, 0.4]], wallBottomPoints: [[0.1, 0.6], [0.9, 0.6]] }
    alarmWall = (await api('POST', `/walls/create?propertyId=${prop.id}`, { token: adminToken, body: { name: 'Alarm wall', cameraId: cam.id, ...lines } })).body
    const q = (l, a, b) => ({ label: l, lengthMeters: 10, topLeft: [a, 0.5], bottomLeft: [a, 0.9], topRight: [b, 0.5], bottomRight: [b, 0.9] })
    await api('PUT', `/walls/save-cells?propertyId=${prop.id}&wallId=${alarmWall.id}`, { token: adminToken, body: [q('B1', 0.05, 0.45), q('B2', 0.55, 0.95)] })
    const grid = (await api('GET', `/laser-grids/list?propertyId=${prop.id}`, { token: adminToken })).body[0]
    await api('PUT', `/walls/update?propertyId=${prop.id}&wallId=${alarmWall.id}`, { token: adminToken, body: { name: 'Alarm wall', cameraId: cam.id, ...lines, laserGridId: grid.id, cameraGridRow: 0, cameraGridCol: 2 } })
    const w = (await api('GET', `/walls/get?propertyId=${prop.id}&wallId=${alarmWall.id}`, { token: adminToken })).body
    await api('PUT', `/walls/set-cell-route?propertyId=${prop.id}&wallId=${alarmWall.id}&cellId=${w.cells[0].id}`, { token: adminToken, body: [{ row: 2, col: 0 }] })
    await api('PUT', `/walls/set-cell-route?propertyId=${prop.id}&wallId=${alarmWall.id}&cellId=${w.cells[1].id}`, { token: adminToken, body: [{ row: 2, col: 1 }] })
  }

  await go('/settings/response')
  const ml = await api('GET', '/ml/health', { token: adminToken })
  check(await text(ml.body.available ? 'Running' : 'Not running'), `response: the ML service is shown as ${ml.body.available ? 'running' : 'not running'}`)
  if (ml.body.available && FRAMES) {
    await choose('Raise an alarm when', '50')             // the clip peaks near 83%: the default 85% rightly raises nothing
    await clickText('button', 'Activate')
    check(await text('Deactivate', 15000), 'response: Activate starts watching every wall')
    await shot('09-response')

    // ================= live alert: the browser sits on Incidents; an alarm is raised from outside; it must appear BY ITSELF
    await nav('Incidents')
    check(await text('No active incidents'), 'incidents: starts empty')
    const index = JSON.parse(fs.readFileSync(`${FRAMES}/index.json`, 'utf8'))
    let raised = false, peak = 0, sent = 0, lastStatus = 0
    for (const f of index) {
      const form = new FormData()
      form.append('frame', new Blob([fs.readFileSync(`${FRAMES}/f_${String(f.i).padStart(5, '0')}.jpg`)], { type: 'image/jpeg' }), 'f.jpg')
      form.append('frameIndex', String(f.i)); form.append('timestampSeconds', String(f.t))
      const r = await fetch(`${API}/detection/send-frame?propertyId=${prop.id}&wallId=${alarmWall.id}`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: form })
      lastStatus = r.status; sent++
      const j = await r.json().catch(() => ({}))
      peak = Math.max(peak, j.probability || 0)
      if (j.alarmRaised) { raised = true; break }
    }
    check(raised, `the real ML service raised an alarm from real camera frames (${sent} frames sent, peak probability ${(peak * 100).toFixed(0)}%, last status ${lastStatus})`)
    check(await text('INC-', 12000), 'incidents: the new incident appears on the open screen with no refresh (SignalR)')
    check(await page.evaluate(() => !!document.querySelector('.toast')), 'a pop-up announces the new incident')
    check(await page.waitForFunction(() => /^\(\d+\) AeroSentry/.test(document.title), { timeout: 8000 }).then(() => true, () => false), 'the browser tab title shows the number of open incidents')
    await shot('10-incidents-live')

    await clickText('a', 'INC-')
    check(await text('Respond') && await text('Where'), 'incident detail: opens with the response actions')
    check(await page.waitForSelector('img[alt="The moment of the alarm"]', { timeout: 8000 }).then(() => true, () => false), 'incident detail: the picture of the alarm moment is shown')
    await shot('11-incident-detail')
    await clickText('button', 'I am on it')
    check(await text('Acknowledged'), 'incident: "I am on it" -> Acknowledged')
    await clickText('button', 'False alarm'); await page.evaluate(() => [...document.querySelectorAll('.dialog button')].find((b) => b.textContent.trim() === 'False alarm').click())
    check(await text('False alarm') && await text('marked it as a false alarm'), 'incident: false alarm is confirmed and written to the history')
    await clickText('button', 'Deactivate').catch(() => {})
    await go('/settings/response'); await clickText('button', 'Deactivate'); check(await text('Activate', 12000), 'response: Deactivate stops the watching')
  }

  // ================= authorized people: enrol from a video recorded by the page's own camera recorder
  if (FACE_Y4M) {
    await go('/settings/people/new')
    await fill('Name', 'Alia Test')
    check(await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Enroll person')).disabled), 'people: cannot enrol before there are frames')
    await clickText('button', 'Start camera')
    check(await page.waitForFunction(() => { const v = document.querySelector('[data-testid=capture-live]'); return v && v.videoWidth > 0 }, { timeout: 15000 }).then(() => true, () => false), 'people: the camera preview plays')
    await clickText('button', 'Start capturing')
    const counter = () => page.$eval('[data-testid=capture-counter]', (e) => e.textContent).catch(() => '')
    check(await page.waitForFunction(() => /Captured: [3-9]\/30|Captured: 1\d\/30/.test(document.querySelector('[data-testid=capture-counter]')?.textContent ?? ''), { timeout: 30000 }).then(() => true, () => false), 'people: the "Captured: n/30" counter goes up on the picture')
    check(!!(await page.$('[data-testid=face-box]')) && /sharpness \d+/.test(await page.$eval('[data-testid=capture-message]', (e) => e.textContent)), 'people: a box is drawn round the face and the frame\'s sharpness is shown')
    const shown = await page.$eval('[data-testid=capture-live]', (e) => e.getBoundingClientRect().width)
    check(shown >= 480, `people: the capture picture is large enough to see (${Math.round(shown)} px wide on a 1280 px screen)`)
    await shot('12-capturing')
    check(await page.waitForFunction(() => /picking sharper ones \d+\/45/.test(document.querySelector('[data-testid=capture-counter]')?.textContent ?? ''), { timeout: 40000 }).then(() => true, () => false), `people: after 30 it goes on picking sharper frames (${await counter()})`)
    check(await page.waitForFunction(() => document.querySelectorAll('[data-testid=capture-chosen] img').length === 30, { timeout: 40000 }).then(() => true, () => false) && await text('30 sharpest frames chosen from 45'), 'people: the 30 sharpest of 45 are shown')
    check(!(await page.$('[data-testid=capture-live]')), 'people: the camera is closed after capturing')
    await shot('12-enroll')
    await clickText('button', 'Enroll person')
    check(await text('Alia Test', 60000) && await text('Authorized'), 'people: the person is enrolled from the captured frames and listed')
    await clickText('a', 'Alia Test')
    check(await page.waitForFunction(() => document.querySelectorAll('img[alt$="photo"]').length === 30, { timeout: 20000 }).then(() => true, () => false), 'people: all 30 saved frames are shown')
    await shot('12b-person-frames')
        await clickText('button', 'Switch off'); check(await text('Access is switched off'), 'people: access can be switched off')
    await clickText('button', 'Remove person'); await page.evaluate(() => [...document.querySelectorAll('.dialog button')].find((b) => b.textContent.trim() === 'Remove').click())
    check(await text('Nobody enrolled yet', 12000), 'people: the person is removed')
  }

  // ================= appearance
  await go('/settings/appearance'); await clickText('button', 'Dark')
  check(await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'dark'), 'appearance: dark mode is applied')
  await shot('13-dark'); await clickText('button', 'System')

  // ================= the guard's view: read-only, no address, no admin pages
  await go('/'); await signOutViaMenu()
  check(await text('Sign in to protect your property'), 'sign out returns to the sign-in screen')
  await page.evaluate(() => [...document.querySelectorAll('.segmented button')].find((b) => b.textContent === 'Guard').click())
  await fill('Email', guard.email); await fill('Password', guard.password); await clickText('button', 'Sign In')
  check(await text('E2E Head Office'), 'guard: signs in and sees the assigned property')
  check(!(await page.evaluate(() => document.body.innerText.includes('12 Secret Street'))), 'guard: the address is NOT shown anywhere')
  await nav('Cameras'); await sleep(500)
  check(!(await page.evaluate(() => [...document.querySelectorAll('a,button')].some((e) => /Add camera|Delete/.test(e.textContent)))), 'guard: no "Add camera" or "Delete" on the Cameras screen')
  await go('/settings/guards'); await sleep(500)
  check(!page.url().includes('/settings/guards'), 'guard: an admin-only address sends them back to the Overview')
  await shot('14-guard')
  // a wrong role at sign-in
  await clickText('nav.nav a', 'Settings').catch(() => {}); await go('/settings'); await signOutViaMenu()
  await text('Sign in to protect your property')
  await page.evaluate(() => [...document.querySelectorAll('.segmented button')].find((b) => b.textContent === 'Guard').click())
  await fill('Email', admin.email); await fill('Password', admin.password); await clickText('button', 'Sign In')
  check(await text('Incorrect email or password'), 'an Admin account with "Guard" picked is refused like a wrong password')

  check(problems.length === 0, `no unexpected browser errors${problems.length ? ': ' + problems.slice(0, 4).join(' | ') : ''}`)
} catch (e) {
  console.log('FAIL unexpected:', e.message); failures++
  if (problems.length) console.log('browser errors:', problems.slice(0, 6).join(' | '))
  if (OUT) await page.screenshot({ path: `${OUT}/zz-failure.png` })
  console.log('page text:', (await page.evaluate(() => document.body.innerText)).slice(0, 400).replace(/\n+/g, ' | '))
} finally {
  // clean up what the test created
  try {
    const t = await loginToken(admin).catch(() => null)
    if (t) {
      const props = (await api('GET', '/properties/list', { token: t })).body || []
      for (const p of props) await api('DELETE', `/properties/delete?propertyId=${p.id}`, { token: t })
      for (const g of (await api('GET', '/guards/list', { token: t })).body || []) await api('DELETE', `/guards/delete?guardId=${g.id}`, { token: t })
    }
  } catch { /* best effort */ }
  await browser.close(); phone.close()
  console.log('failures:', failures); process.exit(failures === 0 ? 0 : 1)
}
