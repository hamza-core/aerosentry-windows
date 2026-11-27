# Changelog

## Unreleased

### Added
- Live face capture: `POST people/check-frame` (box, message, sharpness for one picture) and `POST people/enroll-captured` (30 to 60 pictures). Both this and enroll-frames look at up to 45 good frames and keep the 30 SHARPEST.
- `POST people/enroll-frames`: enrol from one video of about 20 s, like the learning script enroll_user.py: a frame about every 0.4 s, 30 frames with exactly one face wider than 100 px (picture 640 wide), face profile = normalised average of the 30. All 30 are stored (Frame01..Frame30); every pair must look like the same person. No database change; the photo and head-turn enrolments are unchanged. No liveness check.

### Fixed
- The camera address given to the worker is now rtsp:// for a phone's .sdp stream (it was http://, which made the worker skip the media server and open a wrong address).
- Wall cells: when a person's feet are in no drawn cell, the cell's sides extended up and down (its wall section) decide, so cells drawn only above the wall still give a location. The drawn cells are unchanged.
- The worker now sends frameIndex and timestampSeconds as form fields; they used to arrive as 0.
- The worker's live preview no longer draws inside-out person boxes.
- An inside-out person box (returned at times by the person finder on the Apple graphics chip) no longer chooses a wall cell; the alarm uses the last good position within the previous 5 pictures, otherwise no cell. The model and its input are unchanged.
- A wall line may now have 2 to 100 points (was exactly 2). Tested on 117 clips: with lines cut to 2 points the model's readings differed on 73 frames and 13 clips raised their first alarm on another (mostly later) frame; walls that really have 2 points gave identical readings.

### Changed
- **The ingest worker analyses every 5th frame by counting** (frames 0, 5, 10 ... like the training script), instead of 5 frames per second by time. New option `--every N`; the old time-based choice is `--sample-rate N`. The frame number sent to the backend is now the 0-based frame index. When the ML service is slower than the gap, the worker widens the gap by itself and warns once. The first answer of a stream (ML warm-up) no longer counts towards the speed estimate.

### Added
- **Live preview with boxes.** The ingest worker draws a box round every person the model finds on the camera picture (red during the alarm) and sends it to the backend (`worker/post-preview`); apps watch it at `detection/preview` as a picture stream. Only the latest picture per wall is kept in memory. The stream ends by itself when the worker stops. `--no-preview` turns it off in the worker.

### Added
- Optional auto MediaMTX config sync: when `Media:MtxManageConfig=true`, backend regenerates `media/mediamtx.yml` from camera records on camera create/update/delete and startup (`IMediaMtxConfigService`). Default remains off.
- `POST people/enroll-video`: enrol a person from ONE 10 to 20 second video instead of three pictures. The face service (`/api/faces/analyze-video`) samples about 60 frames, measures head angles, sharpness and embedding, and returns the sharpest frame of each pose (front, left, right, up, down); the backend applies the usual rules and stores them. Front, left and right are required; `Up` and `Down` pictures are stored when found. `people/enroll` (three pictures) is unchanged.

### Added
- Optional `note` (up to 500 characters) on a property: create, update, get and list. New nullable column `Properties.Note` (migration `AddPropertyNotes`).

- `properties/list?search=text`: keeps properties whose name contains the text (case ignored); admins also match on the address, guards only on the name. Filtering and sorting run in SQL Server.
- A guard now gets `address: null` on `properties/get` and `properties/list` (admins unchanged). `address` in a property response can therefore be `null`.

### Fixed
- `properties/list` sorted by name again after the search change (a result was being thrown away and the query ran twice), and a guard can no longer find a property by its hidden address through `?search=`.

### Removed
- The leftover ASP.NET template `WeatherForecast` controller and model. It was a public endpoint (`/WeatherForecast`) that returned random sample data and nothing used it.

### API naming: function-style endpoints
- Every endpoint is now `/api/v1/<feature>/<action>` (e.g. `cameras/create`, `walls/save-cells`); ids moved from the path to the query string (`?propertyId=&cameraId=`). Full list in `docs/API.md`.
- Guards endpoints from Feature 1 changed accordingly: `guards/create`, `guards/list`, `guards/set-status`, `guards/delete`. Auth endpoints did not change.

### Refactor: interfaces in their own folder
- The 11 service interfaces moved from `Services/` to `Services/Interfaces/` (one interface per file). The exceptions and small data types that used to sit inside four of those files now have their own files next to the service (`MlModels.cs`, `FaceModels.cs`, `PersonModels.cs`, `CameraSnapshotException.cs`). No behaviour change. As everywhere in the project the namespace follows the folder, so the interfaces are now in `AeroSentry.Api.Services.Interfaces` and the 23 files that use one got `using AeroSentry.Api.Services.Interfaces;`.

### Documentation
- Complete documentation set: `README.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md` (generated from the live database), `docs/HOW-IT-WORKS.md` (every feature), `docs/TESTING.md`; `docs/API.md` checked against all 73 endpoints. Checked by a script: no file, endpoint, setting or class name in the documents is wrong.

### Feature 9: Authorized people (face ID)
- `face-service/` (FastAPI + InsightFace `buffalo_l`, offline) and `people/enroll`, `check-photo`, `list`, `get`, `get-photo`, `update`, `disable-access`, `enable-access`, `delete`, `identify` (admin only).
- Enrolment takes 3 photos (front, left, right): exactly one face each, at least 100 px, the three must be the same person; duplicates give 409. Matching threshold 0.45.
- Alarms: faces are looked for in the alarm frame and ~4 earlier ones. A trusted authorized person (face at least 60 px, the same person in at least 2 frames, every person at the wall cleared) is named on the alert (`recognizedPerson`) and the alert gets `autoResponseSkipped` (no automatic drone), policy `Face:AuthorizedPolicy` = `SkipDrone` (default) or `LabelOnly`. The alert itself is never suppressed.
- `alerts/confirm-authorized` (guard or admin, final, in the history), `alerts/get-snapshot` (the alarm picture, for the guard to see who it is). New alert status `ConfirmedAuthorized`.
- Found and fixed while testing: one face could clear two overlapping people; each face now belongs to exactly one person.
- Finding: faces on wall-camera footage are 13 to 50 px wide, too small for reliable recognition. See `docs/FUTURE-WORK.md`.

### Annotation, IP Webcam and frame rate
- `GET cameras/get-snapshot` (picture from an IP Webcam phone, with its size) and `PUT walls/save-annotation`; a changed annotation resets the running ML session.
- Ingest worker now samples by time at 5 frames/s (measured training rate: 65% of training videos are 25 fps, 20% are 30 fps, 14% are 24 fps), paces itself to what the ML service can analyse, and warns when the camera's picture shape differs from the annotation. Details in `ingest-worker/README.md`.
- Tested against a real IP Webcam phone (640x480, about 30 fps, no login): snapshot, stream and the whole detection chain.
- Media server: `media/` (MediaMTX config template and notes). Verified with the real phone: RTSP over TCP pull, RTSP and HLS out, one connection to the phone, config hot-reload. The worker reads RTSP over TCP.
- `ml-service/start-ml.sh cpu|gpu|stop|status`: switch between the original (GPU) ML service and a new CPU copy (`standalone_every_5_frames_cpu`, two lines changed, original untouched). `tools/probe-rtsp.py` finds a camera's RTSP address. `docs/REAL-CAMERAS.md` is the checklist for real cameras.
- Finding: the ML service on the GPU (mps) analyses only about 2-2.5 frames/s once its 60-frame window is full; on the CPU about 14. See `docs/FUTURE-WORK.md`.

### Feature 8: Drone (planned, NOT implemented)
- Placeholder `drones/...` functions answer 501 so the apps can prepare. Open decisions and the full list of unfinished work: `docs/FUTURE-WORK.md`.

### Feature 7: Alert actions
- `POST alerts/acknowledge`, `alerts/mark-false-alarm`, `alerts/close`, `alerts/escalate` (admin only) and `GET alerts/list-actions`.
- Rules in `AlertTransitions` (FalseAlarm and Closed are final); status changes are compare-and-set, so simultaneous presses give one 200 and 409s.
- `AlertAction` table keeps the history (who, what, when, note). Status changes are pushed over SignalR as `AlertUpdated`.
- Suspending or deleting a guard now closes their open SignalR connection; connections also close when the token expires.

### Feature 6: Alerts and real-time
- Every stored detection alarm creates an `Alert` (incident number from a database IDENTITY column, `INC-0001`...).
- Alerts log: `GET /api/v1/alerts/list` and `GET /api/v1/alerts/get`.
- Live push over SignalR at `/hubs/alerts` (message `AlertRaised`) to the property's owner and its active assigned guards.
- JWT accepted as `?access_token=` on `/hubs` paths; CORS added (`Cors:Origins`).
- Ingest worker (`ingest-worker/`) and `worker/get-jobs`, `worker/send-frame`; watching a wall is now saved in the database.

### Feature 2 to 5: properties, cameras, laser grids and walls, ML detection bridge (in progress on feature/cameras)
- Properties with guard assignment, cameras with connection test, laser grids with configurable size, walls with annotation, cells and laser routes, and the detection bridge to the ML service with stored alarm events.

### Feature 1: Auth and roles (merged from feature/auth)
- Added `POST /api/v1/auth/register` (public admin sign-up, password hashed with PasswordHasher).
- Added `POST /api/v1/auth/login` (JWT access token with `sub`, `email`, `role`; 401 for bad credentials, 403 for suspended guards).
- Added `GET /api/v1/auth/me` (requires a valid token).
- Added Admin-only guard management: `POST /api/v1/guards`, `GET /api/v1/guards?status=`, `PATCH /api/v1/guards/{id}/status`, `DELETE /api/v1/guards/{id}`.
- Tokens of suspended or deleted users are rejected (checked on every request).
- Added optional `phoneNumber` on users.
- Added `Users` table (unique index on `Email`) and two migrations.
- Added Scalar API page at `/scalar` (Development only).

### Feature 0: Setup
- Scaffolded `AeroSentry.Api` (.NET 11), SQL Server 2022 in Docker, EF Core.
