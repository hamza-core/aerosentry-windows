# Testing

## The honest summary
There is **no automated test project and no CI**. The code was checked with scripts run by hand against the **real** SQL Server (and the real ML service, face service and a real IP Webcam phone where relevant), right after each piece was written. Those scripts live outside the repository, so today the evidence is this page, the pull request descriptions and the commit history. Moving the scripts into a `tests/` folder (with their file paths made settings) and running them in CI is on `docs/FUTURE-WORK.md`.

## What was checked, by area
| Area | What the checks covered |
|---|---|
| Naming and routes | Every function answers on its `/feature/action` path with ids in the query; the old nested paths answer 404; wrong method 405; bad id 400; no token 401 |
| Properties, guards | Ownership (another admin gets 404), guard read-only access (403 on writes), assignment |
| Cameras | CRUD, duplicate names (409), bad source type or port (400), password never returned, connection test (reachable and not), a camera used by a wall cannot be deleted |
| Laser grids, walls, cells, routes | Annotation required and validated, cells saved with kept ids, routes (order, one square per cell across walls, the transaction replace), validation, grid shrink and delete rules, cascade on property delete |
| Detection | Real video frames through the real ML service: alarms, cell location, stored events, pagination, bad input, ML service down (503) and restart (automatic recovery) |
| Worker and media | Key protection of `worker/*`, job list, persistence across a backend restart, the worker reading a video file, a simulated IP Webcam at 4, 15, 30, 60 fps and variable fps (always 5 frames/s, no password in logs), a **real phone** through MediaMTX (RTSP and HLS, one camera connection) |
| Alerts and SignalR | Five live connections during real alarms: only the owner and active assigned guards received them; the log, paging, filters, visibility |
| Alert actions | Every transition, final states, a real race (four simultaneous presses: one 200, three 409), history, live updates, suspended or deleted guard's open connection closed |
| Authorized people | Enrolment rules with real photos (no face, two faces, too small, different people, duplicate), identify, disabled and expired status, face service down (503 and alerts still created) |
| Authorized-person policy | Seven scenarios with the expected decision **recalculated independently** from the face service; three real two-person clips (this found a real flaw, one face clearing two overlapping people, now fixed); confirm action, alarm picture, roles |
| Configuration | Fresh clone built from the local NuGet cache only and run; missing, placeholder and short secrets refused with a clear message; an environment variable beats the file |
| Each pull request | Every branch tip was built in its own checkout (0 warnings, 0 errors) before pushing |

## Measured, not assumed
- Training frame rates (703 training videos): 65% 25 fps, 20% 30 fps, 14% 24 fps, so about 5 samples per second.
- ML service speed on the dev Mac: GPU about 2 frames/s with a full window, CPU about 14; identical answers on 7 clips (292 frames).
- Faces on wall footage: 13 to 50 px wide, none reached 60 px.
- Face scores on the project's own photos: different people 0.00 to 0.25, the same person 0.43 to 0.86.

## Not tested
Real CCTV cameras and the NVR; the real network with phones as clients; several walls at once; a long run (hours); load; the Flutter, React Native, SwiftUI and ReactJS apps (they are separate); face recognition where faces are large (only the rules and the plumbing were tested, not accuracy at a distance); liveness; the drone (not built). One run of the 4 fps frame-rate scenario failed once in a batch and passed when rerun alone: the cause was not found.

## How to check a function by hand
Open `/scalar` (Development), log in (`POST auth/login`), press Authorize with the token, call the function; error cases: no token (401), a guard's token on an admin function (403), another admin's id (404), a duplicate (409), a bad body (400). The "Check it yourself" part of each feature in `docs/HOW-IT-WORKS.md` lists the exact calls, and the SQL to look at.
