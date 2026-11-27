# AeroSentry web app

The web client for the AeroSentry backend: **React + JavaScript, plain CSS** (no Tailwind, no UI library).
It talks only to the backend API (`/api/v1/...`) and its live alert channel, never to the ML service, the face service or the drone.

It looks and works like a desktop web application: a collapsible sidebar, a top bar with breadcrumbs and a live-connection light,
a dashboard with stat cards, data tables with filters, side-by-side editors (the picture stays in view while you work), a settings
area with its own menu, light and dark themes, and a jump menu (**Ctrl/Cmd + K**) to reach any screen or action. It also
adapts to a phone-sized window.

It does what the iOS app does, on a computer: sign in as an admin or a guard, properties, cameras with live video,
walls (mark the wall on a camera picture, mark its cells, link them to the laser grid), automatic response
(start/stop watching), live incidents with the alarm picture and the guard's actions, guard management and
authorized people. **Drones are not on the server yet**, so that screen says so.

## Run it

```bash
cd web-app
npm install            # once, needs internet; after that everything works with NO internet
npm run dev            # http://localhost:5173
```

The backend must be running (default `http://localhost:5078`) with the **http** profile (`dotnet run --launch-profile http`),
and its `Cors:Origins` must list this page's address (`http://localhost:5173` and `:3000` already are).

Another backend address, or opening the page from another computer:

```bash
echo "VITE_API_URL=http://192.168.0.20:5078" > .env.local     # the Mac's address on the Wi-Fi
npm run dev -- --host
```
and add `http://192.168.0.20:5173` to the backend's `Cors:Origins`.

Production files: `npm run build` (creates `dist/`, plain static files; serve them with any web server).

## Works offline

Everything is bundled (fonts are the system fonts, the video player `hls.js` and the live-alert client `@microsoft/signalr`
are npm packages). There is **no map** because map tiles need the internet: a property's location is typed in, or
filled with "Use my location".

## How the code is organised (the same layers as the iOS app and the teacher's example)

```
src/
  network/     networkLayer.js (the ONLY place that calls fetch: adds the token, turns error JSON into a sentence)
               tokenStore.js (the login token, this browser tab only)   alertLive.js (SignalR: "AlertRaised")
  services/    one file per backend feature (cameraService.js ...): knows the URLs, nothing else
  state/       session.jsx (who is signed in, which property)   propertyData.js (cameras, walls, grids)
  lib/         domain.js (input rules, setup progress)  format.js  hooks.js  theme.js  useSnapshot.js
  components/  ui.jsx (Card, Row, Button, Field ...)  Layout.jsx  LiveVideo.jsx  PointPicker.jsx  AnnotationEditor.jsx ...
  pages/       one file per screen
  styles/      theme.css (design tokens: colours, sizes, light and dark)  app.css (layout, components)
```
A request travels  **page -> service -> networkLayer -> backend**, and the answer comes back the same way.

## Things worth knowing

- **Phone cameras (IP Webcam) serve only ONE kind of stream at a time.** While the media server holds the phone's
  `/h264.sdp` (RTSP) connection, the phone's `/video` picture stream goes silent, and the other way round. So a camera
  saved with `/h264.sdp` is watched through the media server (HLS), one saved with `/video` directly. Use `/h264.sdp`
  for any camera the detection worker watches. See `components/LiveVideo.jsx`.
- **A wall is "ready" for the server only when it also knows where the camera stands on the laser grid.** The mapping screen
  has a "Camera position" mode for that.
- **Wall annotation**: the four points are saved as fractions (0 to 1) of the camera picture, so the picture box on screen
  is exactly the photo (`.canvas-wrap` in `app.css`). If the camera moves or changes size, mark the wall again.
- **Faces**: this page enrols a person with three photos checked by the server (one face, at least 100 px wide). It cannot
  check that a live person is present; the iPhone app does that with a guided video. The camera for photos works on
  `localhost` or https pages only (a browser rule); on another address, choose picture files.
- A guard never sees a property's address (the server sends `null`), and cannot open admin pages.
- The login token lives in `sessionStorage`: closing the tab signs out.

## Looking at it

`npm run shots` seeds a realistic property and saves a screenshot of every screen (light, dark, phone width) to `SHOT_DIR`.

## Tests

```bash
npm test                                   # fast unit tests (input rules, setup progress, ...), no backend needed
SHOT_JPEG=/path/to/640x480.jpg npm test    # also runs the service layer against the REAL running backend
SHOT_JPEG=... FRAMES_DIR=... FACE_DIR=... npm run e2e
```
`npm run e2e` drives a real Chrome through the real screens (register, camera, wall annotation, cells, mapping, guards,
live alert, incident actions, authorized people, guard view). It needs the backend, SQL Server, the web dev server
(`npm run dev`), Google Chrome, and for the alert and face steps the ML service (8010) and face service (8020).
`FRAMES_DIR` holds JPEG frames of a person at a wall with an `index.json`; `FACE_DIR` holds `Alia Bhatt_0.jpg`, `_13`, `_15`.
It creates its own test data and deletes it afterwards.
