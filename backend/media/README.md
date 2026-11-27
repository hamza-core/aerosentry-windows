# Media server (MediaMTX)

One small program that sits between the cameras and everything else. It pulls each camera **once** and serves it to many:

```
Camera --RTSP (TCP)--> MediaMTX --HLS  (http://<server>:8888/cam-<id>/index.m3u8)--> the four apps
                                \--RTSP (rtsp://localhost:8554/cam-<id>)------------> the ingest worker
```
The camera sees ONE connection, however many apps and workers watch (verified: one connection with an RTSP reader and an HLS reader active).
The backend already hands out these addresses: `playbackUrl` in a camera is the HLS address, and the worker's job list holds the RTSP one.
MediaMTX is a single offline executable, no internet needed.

## Add a camera

### Manual
1. Add the camera in the app (or `cameras/create`) and note its `id`.
2. In `media/mediamtx.yml` add a block named **`cam-<id>`** (see `mediamtx.example.yml`). MediaMTX reloads the file by itself.
3. Check it: open `http://localhost:8888/cam-<id>/` in a browser (MediaMTX has a built-in player page).

### Automatic (backend-managed)
Set in `AeroSentry.Api/appsettings.Development.json` (or env vars):

```json
"Media": {
  "MtxManageConfig": true,
  "MtxConfigPath": "../media/mediamtx.yml"
}
```

When enabled, backend regenerates `mediamtx.yml` from camera records on camera create/update/delete (and on startup). The file becomes backend-managed; manual edits may be overwritten. Keep `MtxManageConfig` false if you want to manage the file by hand.

## Rules learned by testing with a real IP Webcam phone
- **`rtspTransport: tcp` is required** for Wi-Fi cameras. With the default UDP, packets were lost, keyframes broke and the HLS playlist never
  started.
- MediaMTX reads **RTSP**, not the phone's plain `/video` (MJPEG). IP Webcam also offers RTSP: use `rtsp://<phone>:8080/h264.sdp`
  (video only) or `h264_ulaw.sdp` / `h264_aac.sdp` (with audio, which HLS ignores).
- A fresh HLS request is redirected once (`?cookieCheck=1`); players follow it. Playlist: `application/vnd.apple.mpegurl`, segments: `video/mp4`.
- The camera's address and password stay in this file, not in the apps. The file is not committed (`media/mediamtx.yml` is in `.gitignore`).
- Not tested yet: CCTV cameras and the NVR (RTSP paths differ by brand), `sourceOnDemand` with many cameras, WebRTC.
