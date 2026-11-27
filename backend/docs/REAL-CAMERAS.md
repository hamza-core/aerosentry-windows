# Configuring real cameras (CCTV cameras and the NVR)

**No code changes are needed.** Everything is configuration: a few settings, one block per camera in `media/mediamtx.yml`, and
starting the programs the right way. This was tested with a real IP Webcam phone; CCTV cameras and the NVR have **not** been
tested (their RTSP paths differ by brand), so follow the steps and use the probe tool instead of guessing.

## 1. For each camera
1. **Prepare the camera or NVR** (its web page or app):
   - give it a fixed address (a DHCP reservation in the router, so the IP never changes);
   - switch **RTSP** on, and make a separate user for it (view-only if possible);
   - set the stream to **H.264** (not H.265, which many apps and browsers cannot play);
   - **prefer the sub stream** (a smaller picture, for example 640x360) for AeroSentry: it is lighter to decode and as good for finding a person;
   - leave resolution, zoom and angle **fixed** after annotating: the wall annotation is a fraction of the picture.
2. **Find its RTSP address** (it differs by brand):
   `python tools/probe-rtsp.py <camera-ip> --user <user> --password '<password>'`
   It tries the common paths and prints the ones that deliver video, with the exact values to type in the next two steps.
   An NVR gives each camera its own channel in the path. If nothing opens, check the login and the path in the camera's manual.
3. **Add the camera in the app** (`cameras/create`): `sourceType` `Rtsp` (or `Onvif`: it is the same thing, no ONVIF discovery is built),
   host, port (usually 554), `streamPath`, username, password. Note the `id` that comes back.
   `cameras/test-connection` only checks that the port answers, not the login or the video.
4. **Add a block to `media/mediamtx.yml`** named `cam-<id>` (template: `media/mediamtx.example.yml`). MediaMTX reloads the file by itself.
   Keep `rtspTransport: tcp`. Write special characters in the password percent-encoded (`@` = `%40`, `:` = `%3A`, `/` = `%2F`,
   space = `%20`); this encoding was checked with OpenCV but not with MediaMTX.
   **Optional auto mode:** set `Media:MtxManageConfig=true` and `Media:MtxConfigPath` in backend config; then camera create/update/delete syncs `mediamtx.yml` automatically.
5. **Check the picture:** open `http://<server>:8888/cam-<id>/` in a browser.
6. **Annotate the wall.** `cameras/get-snapshot` only works for IP Webcam phones. For RTSP cameras the app captures a frame from the playback
   stream, the admin taps the 4 points, and the app sends them with the picture's size to `walls/save-annotation`.
   Annotate on the **same stream the worker reads** (the sub stream): if the shapes differ, the worker warns that the lines will not line up.
7. Laser grid, cells and routes: as for any camera. Then `detection/start` for the wall.

## 2. Settings to change (only when other devices must reach the server)
| What | Default (works on this Mac only) | For phones and other computers |
|---|---|---|
| Backend address | listens on `localhost` only (verified: unreachable from the LAN) | start it with `--urls "http://0.0.0.0:5078"` |
| Address of the playback video in the apps | `Media:HlsBase` = `http://localhost:8888` | `http://<this-Mac's-LAN-IP>:8888`, via env var `Media__HlsBase` or `appsettings.Development.json` |
| RTSP address the worker reads | `Media:RtspBase` = `rtsp://localhost:8554` | leave it if the worker runs on the same machine as MediaMTX |
| Browser apps (ReactJS) | `Cors:Origins` = `localhost:3000`, `localhost:5173` | add the address the React app is served from |
| ML service | `Ml:BaseUrl` = `http://localhost:8010` | leave it if the ML service runs on the same machine |
Also: the Mac's firewall may ask to allow incoming connections the first time; everything must be on the same network (some Wi-Fi
networks isolate devices from each other); use the LAN IP shown by `ipconfig getifaddr en0` (it can change; a DHCP reservation fixes it).

## 3. Start everything (4 programs, in this order)
```bash
mediamtx media/mediamtx.yml                     # media server
ml-service/start-ml.sh cpu                      # ML service: cpu (fast on this Mac) or gpu (the original). Only one at a time
cd AeroSentry.Api && ASPNETCORE_ENVIRONMENT=Development Media__HlsBase=http://<LAN-IP>:8888 \
    dotnet run --no-launch-profile --urls "http://0.0.0.0:5078"
WORKER_KEY=<Worker:ApiKey from appsettings.json> python ingest-worker/worker.py     # reads the cameras
```

## 4. What to expect
- One wall is analysed at about 5 frames/s with the CPU ML service (the trained rate); with the GPU one about 2. The worker prints
  `analysis NNN ms/frame` and warns when the ML service is the limit. The ML capacity (about 14 frames/s on the CPU) is shared by all
  walls: **several walls at once has not been measured**.
- The camera sees one connection (MediaMTX), however many apps watch.
- Alarms depend on the wall annotation: a bad annotation (wrong lines) gives bad detections, whatever the camera.

## 5. When something is wrong
| Symptom | Likely cause |
|---|---|
| Probe says nothing answers on the port | wrong IP, camera off, other network, RTSP not switched on |
| Probe finds no path | wrong login (looks like "cannot open"), or a path that is not in the common list: read the manual |
| Browser page for `cam-<id>` is empty / HLS does not start | `rtspTransport: tcp` missing (UDP loses packets over Wi-Fi), wrong source address, or H.265 video |
| Worker: "the camera sends WxH but the wall was annotated on ..." | annotated on another stream or resolution: annotate again on this stream |
| Worker: "analysing a frame takes N ms, so only about X frames/s" | the ML service is the limit: `ml-service/start-ml.sh stop` then `start-ml.sh cpu` |
| Apps cannot reach the backend or the video | backend not started with `--urls 0.0.0.0`, `Media:HlsBase` still `localhost`, firewall, or a different network |
