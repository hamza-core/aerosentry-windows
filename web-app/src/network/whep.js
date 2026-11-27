// WebRTC playback from the media server (the "WHEP" way): the browser offers to receive video, posts that offer to the
// server, and the server answers. The video then arrives frame by frame, with far less delay than HLS (which sends it in
// finished pieces of a few seconds). Everything stays on the local network: no STUN or TURN server, no internet.

// The media server answered, but with an error: usually it cannot get video from the camera.
export class WhepRefused extends Error {
  constructor(status, detail) { super(detail || `The media server answered ${status}.`); this.status = status }
}

// Wait until the browser has listed its own addresses (with a limit, so a slow one cannot hold the video back).
const gathered = (pc) => new Promise((resolve) => {
  if (pc.iceGatheringState === 'complete') return resolve()
  const done = () => { if (pc.iceGatheringState === 'complete') resolve() }
  pc.addEventListener('icegatheringstatechange', done)
  setTimeout(resolve, 1000)
})

// Connects `pc` so that the camera's video plays in `video`. Throws WhepRefused when the server says no, and a TypeError
// (from fetch) when the server cannot be reached at all.
export async function connectWhep(pc, video, url, signal) {
  pc.addTransceiver('video', { direction: 'recvonly' })              // the picture only: detection does not use sound
  pc.ontrack = (event) => { video.srcObject = event.streams[0]; video.play().catch(() => {}) }
  await pc.setLocalDescription(await pc.createOffer())
  await gathered(pc)
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription.sdp, signal })
  if (!response.ok) throw new WhepRefused(response.status, (await response.text()).slice(0, 200))
  await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() })
}
