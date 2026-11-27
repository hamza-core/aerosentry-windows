// Used by 03-stream/verify/measure_delay.py: plays a camera over WebRTC in Chrome, as the web app does, and writes down
// [time, brightness] for every new picture.   node e2e/whep_brightness.mjs WHEP_URL SECONDS OUT.json
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const [url, seconds, out] = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] })
const page = await b.newPage(); await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded' })
await page.evaluate(async (url) => {
  const { connectWhep } = await import('/src/network/whep.js')                    // the web app's own connection code
  const pc = new RTCPeerConnection(); const v = document.createElement('video'); v.muted = true; v.autoplay = true; document.body.append(v)
  await connectWhep(pc, v, url, AbortSignal.timeout(25000))
  const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d', { willReadFrequently: true }); window.__s = []
  const take = () => { g.drawImage(v, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; window.__s.push([Date.now() / 1000, s / (64 * 36 * 3)]); v.requestVideoFrameCallback(take) }
  v.requestVideoFrameCallback(take)
}, url)
await page.waitForFunction(() => window.__s.length > 10, { timeout: 20000 }).then(() => console.log('Chrome is receiving the video'), () => console.log('Chrome got NO video'))
await new Promise((r) => setTimeout(r, Number(seconds) * 1000))
fs.writeFileSync(out, JSON.stringify(await page.evaluate(() => window.__s))); await b.close()
