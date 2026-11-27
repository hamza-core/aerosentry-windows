# How AeroSentry works

> DRAFT written for review. Rewrite any sentence in your own words before the exam.

## Feature 1: Auth and roles

### What it does
Admins sign up themselves. An admin creates guard accounts. Everyone signs in
through one login endpoint and receives a JWT. The token carries the user's role,
and the server uses it to decide what each caller may do.

### The request flow
Client -> Controller -> Service -> Data (AppDbContext) -> SQL Server

1. **Controller** (`AuthController`, `GuardsController`) receives the HTTP request,
   ASP.NET validates the DTO, and the controller turns the service result into a
   status code. It never touches the database.
2. **Service** (`AuthService`, `GuardService`) holds the real logic: hash a password,
   verify it, create the token, check duplicates.
3. **Data** (`AppDbContext`, `User`) maps the `Users` table. EF Core turns LINQ into SQL.
4. **Database**: `Users` has a unique index on `Email`.

### Passwords
We never store a password. `PasswordHasher<User>` hashes it with PBKDF2 and a random
salt, and the salt is stored inside the hash string. The same password therefore
produces a different hash for each user. At login we verify the typed password
against the stored hash. Nothing is ever decrypted.

### The JWT
A token is `header.payload.signature`. The payload holds claims (`sub`, `email`,
`role`, `exp`, ...) and is readable by anyone. The signature is
`HMAC-SHA256(header.payload, Jwt:Key)`. If anyone edits the payload, the server
recomputes the HMAC with its own key, gets a different result, and rejects the token
with 401. Only the server knows the key, so only the server can create valid tokens.

### Validation and roles
- `AddJwtBearer` checks signature, issuer, audience and expiry on each request.
- `MapInboundClaims = false` keeps claim names exactly as we wrote them (`sub`, `role`).
- `RoleClaimType = "role"` tells ASP.NET which claim `[Authorize(Roles = ...)]` reads.
- `OnTokenValidated` also checks the database: a suspended or deleted user gets 401
  even with an unexpired token. This gives up some of JWT's statelessness so that
  suspension takes effect immediately.
- `UseAuthentication()` must come before `UseAuthorization()` in `Program.cs`.

### Status codes
- 400: the DTO failed validation.
- 401: we don't know who you are (no token, bad token, expired, user suspended).
- 403: we know who you are but your role is not allowed (guard on an Admin endpoint),
  or a suspended guard tries to log in.
- 409: email already registered.

### Why decisions were made
- The role is never accepted from the client. The server sets it (public register = Admin,
  `POST guards/create` = Guard), so nobody can promote themselves.
- Login returns the same 401 for a wrong email and a wrong password, so attackers
  cannot discover which emails exist.
- Login is a POST so the password travels in the body, not in a URL that gets logged.
- Services are Scoped because they depend on the Scoped `AppDbContext`.
- DTOs stop overposting (a client sending `role`) and keep `PasswordHash` out of responses.

### Guard management (Admin only)
- `GET guards/list?status=` builds the query with `Where` on an `IQueryable`, so SQL Server does the
  filtering. Only `ToListAsync()` runs it.
- `PATCH guards/set-status?guardId=` flips `IsActive`. The `Role == "Guard"` filter means an Admin can
  never be suspended or deleted through these endpoints.
- `DELETE guards/delete?guardId=` returns 204 with no body. A deleted user's old token stops working
  because of the `OnTokenValidated` database check.

### Not done yet
- Password reset by email (needs a mail server, so it does not fit the offline rule).
- Rate limiting on login.
- Pagination on the guards list.

---

## Feature 2: Properties

### What it does
An admin owns properties (a house, a yard, a site). The admin adds, edits and deletes them,
and gives guards access to them. A guard only sees the properties they were given access
to, and can only read them.

### The map: which file does what, in the order a request travels
| Order | File | Its one job |
|---|---|---|
| 1 | `Program.cs` | Registers `PropertyService` (`AddScoped`), switches on authentication |
| 2 | `Controllers/PropertiesController.cs` | Reads the token, calls the service, turns the result into a status code. No logic |
| 3 | `DTOs/PropertyRequest.cs` | What the client may send (name, address, optional coordinates) and its validation |
| 4 | `Services/PropertyService.cs` | All the logic: who may see what, create, update, assign a guard |
| 5 | `Data/AppDbContext.cs` | Maps the tables and their rules (lengths, foreign keys, what happens on delete) |
| 6 | `Data/Entities/Property.cs`, `PropertyGuard.cs` | The two tables as C# classes |
| 7 | `DTOs/PropertyResponse.cs` | What we send back (never the entity itself) |
| 8 | `Migrations/..._AddPropertiesAndGuardOwnership.cs` | The SQL that created the tables |

Flow: Client -> `PropertiesController` -> `PropertyService` -> `AppDbContext` -> SQL Server.

### The functions
| Function | Who | Success | Errors |
|---|---|---|---|
| `POST properties/create` | Admin | 201 | 400 (bad body, or only one of latitude/longitude) |
| `GET properties/list` | any | 200 | |
| `GET properties/get?propertyId=` | any | 200 | 404 |
| `PUT properties/update?propertyId=` | Admin | 200 | 400, 404 |
| `DELETE properties/delete?propertyId=` | Admin | 204 | 404 |
| `GET properties/list-guards?propertyId=` | Admin | 200 | 404 |
| `PUT properties/assign-guard?propertyId=&guardId=` | Admin | 204 | 404 |
| `DELETE properties/unassign-guard?propertyId=&guardId=` | Admin | 204 | 404 |
401 everywhere without a valid token; 403 when a guard calls an Admin function.

### The central idea: ownership
The caller's id and role come from the **token** (`sub` and `role` claims), never from the request.
`PropertiesController` reads them in `CallerId` and `CallerRole`. The service then asks one question in one
place, `VisibleTo(userId, role)`:
- Admin: properties where `OwnerAdminId` equals my id.
- Anyone else (a guard): properties that have a `PropertyGuards` row with my id.
Every read goes through it, so an admin can never read another admin's property, whatever id they guess.
Writes use `OwnerAdminId == adminId` in the same way.

### "Not yours" looks the same as "does not exist"
When the property is not visible to the caller, the service returns `null` (or `false`) and the controller
answers **404**, not 403. A 403 would tell an attacker "this id exists, it just isn't yours". With 404 they
cannot find out which ids are real.

### The two tables
- `Properties`: `Id`, `OwnerAdminId`, `Name` (max 200), `Address` (max 300), optional `Latitude` and
  `Longitude`, `CreatedAtUtc`. `OwnerAdminId` is a foreign key to `Users` with **Restrict**: deleting an admin
  never silently deletes their properties.
- `PropertyGuards` is a **join table**: one row means "this guard works at this property". A guard can work at
  many properties and a property can have many guards. Its primary key is the pair (`PropertyId`, `GuardId`),
  so the same guard can never be assigned twice. Both foreign keys are **Cascade**: delete the property or the
  guard and their assignment rows go too.
- `Users.OwnerAdminId` (added by the same migration) says which admin created a guard. An admin can only assign
  *their own* guards (`Role == "Guard" && OwnerAdminId == adminId`).

### Details worth knowing
- Latitude and longitude must come together or not at all. The controller checks this and returns 400.
  The DTO also limits them: latitude -90 to 90, longitude -180 to 180.
- `Name` and `Address` are trimmed before saving.
- `list` builds the query on an `IQueryable` (`VisibleTo(...).OrderBy(...)`), and only `ToListAsync()` sends one
  SQL query. The filtering happens in SQL Server, not in memory.
- Assigning the same guard twice is harmless (the service checks first and returns 204 either way).
- `list-guards` reuses `GuardService.ToResponse`, so a guard looks the same everywhere.
- From Feature 3 on, deleting a property also deletes everything that hangs under it (cameras, walls, ...).

### Why decisions were made
- Controllers hold no logic, so the rules live in one testable place (the service).
- The 404-for-not-yours rule and the single `VisibleTo` method mean there is exactly one place to get access control
  wrong, and it is easy to read.
- A join table (not a list inside `Property`) is how a relational database stores many-to-many.
- DTOs stop the client from sending `OwnerAdminId` and keep internal fields out of responses.

### How to check it yourself (Scalar at `/scalar`, or Postman)
1. Register an admin (`POST auth/register`), log in, copy the token (`Authorize` button in Scalar).
2. `POST properties/create` with `{ "name": "Home", "address": "Street 1" }`: expect 201 and an `id`.
3. `GET properties/list`: your property is there. `GET properties/get?propertyId=<id>`: 200.
4. Register a second admin and log in as them: `GET properties/get?propertyId=<the first admin's id>` gives **404**.
5. Create a guard (`POST guards/create`), assign it (`PUT properties/assign-guard`), log in as the guard:
   `properties/list` shows the property, `POST properties/create` as the guard gives **403**.
6. Ask SQL Server: `SELECT * FROM Properties; SELECT * FROM PropertyGuards;`

### Not done yet
- Pagination on the properties list.
- Transferring a property to another admin.

---

## Patterns used by every feature (read this once)
- **Layers:** Controller -> Service -> `AppDbContext` -> SQL Server. Controllers read the token and turn a result into a status code; services hold every rule; entities are the tables; DTOs are the only things that cross the API (an entity is never returned).
- **Function-named endpoints:** `/api/v1/<feature>/<action>`, ids in the query string (`cameras/update?propertyId=..&cameraId=..`), the body holds only data. The full list is `docs/API.md`.
- **`Result<T>`** (`Services/Result.cs`) is what a service returns when it can fail in several ways: `Ok`, `NotFound`, `Conflict`, `BadRequest`, `Unavailable`. `ApiControllerBase.FromResult` maps them to 200/201, 404, 409, 400, 503. (Features 2 and 3 are older and return `null`/`false` or their own small result class; same idea.)
- **`PropertyAccess`** (`Services/PropertyAccess.cs`) has the one rule "who may see this property" (`VisibleProperties`, `CanSeeProperty`, `OwnsProperty`). Every feature under a property uses it, so access control lives in one place.
- **404 for "not yours"**, never 403, so ids cannot be probed (Feature 2).
- **Interfaces:** each new service has an interface (`ICameraService`...) in `Services/Interfaces/` (one interface per file, nothing else in it), registered in `Program.cs` with `AddScoped<I..., ...>`. The exceptions and small data types that go with a client or service live in their own files next to it (`MlModels.cs`, `FaceModels.cs`, `PersonModels.cs`, `CameraSnapshotException.cs`). As everywhere in the project the namespace follows the folder: the interfaces are in `AeroSentry.Api.Services.Interfaces`, so a file that uses one needs `using AeroSentry.Api.Services.Interfaces;`.
- **Migrations:** a model change = `dotnet ef migrations add Name` (writes the file, database untouched) then `dotnet ef database update`.
- **Settings:** secrets in `appsettings.Local.json` (not in git), everything else in `appsettings*.json` (`docs/OFFLINE-CHECKLIST.md`).

---

## Feature 3: Cameras

### What it does
An admin adds the cameras of a property: an IP Webcam phone, a CCTV camera or an NVR channel. The backend stores the camera's address and login, tells the apps where to play its video, and can check that the camera answers.

### The map
| File | Its one job |
|---|---|
| `Controllers/CamerasController.cs` | The functions of `docs/API.md` -> Cameras; reads the token; maps results to status codes |
| `DTOs/CameraRequest.cs`, `CameraResponse.cs`, `CameraTestResponse.cs` | What goes in and out (the response never has the password) |
| `Services/Interfaces/ICameraService.cs`, `Services/CameraService.cs`, `CameraResult.cs` | The rules |
| `Data/Entities/Camera.cs`, `AppDbContext.cs` | The `Cameras` table and its rules |
| `Migrations/..._AddCameras.cs` | The SQL that created it |

### Key ideas
- **Source types:** `MobileApp`, `Onvif`, `Rtsp` (a regular expression on the request). `Onvif` is stored exactly like `Rtsp` (host, port, path): no ONVIF discovery is built.
- **The password is stored, never returned.** The backend needs it to open the stream, so it is kept in plain form; responses only say `hasPassword`. Encrypting it is not done yet.
- **Playback address:** the camera answers with `playbackUrl` = `Media:HlsBase` + `/cam-<id>/index.m3u8`. Apps play that (from MediaMTX), never the camera's own address.
- **Connection test** (`cameras/test-connection`): a TCP connection to host and port with a 3 second limit. It proves the port answers, not that the login or the video works. Nothing is saved.
- **Names are unique inside a property:** checked in the service (409) and enforced by a unique index (`PropertyId`, `Name`).
- `StreamPath` is saved with a leading `/`. Port is 1 to 65535.
- A camera used by a wall cannot be deleted (409): the wall's foreign key is Restrict.
- Admins write; an assigned guard can read (through `PropertyAccess`).

### Why
- The playback address is built by the server so the camera's real address and login never reach the apps.
- Port and path are separate fields (as in the design deck's form) so the app can build a good form and the server can build any URL it needs.

### Check it yourself
`POST cameras/create` (201), the same name again (409), `GET cameras/list`, `POST cameras/test-connection` for a host that is on (`reachable: true`) and a closed port (`false`, with the reason), `SELECT * FROM Cameras`.

### Not done yet
Encrypting the stored password; ONVIF discovery; checking that the login and video actually work.

---

## Feature 4: Laser grids, walls, cells and laser routes

### What it does
After adding cameras the admin describes the property for the system:
- **Laser grid:** the installed laser squares (rows x columns, each of a chosen size).
- **Wall:** one camera's view of one wall, plus the **wall annotation**: two top points and two bottom points drawn on a picture of the wall. The ML model cannot run without them.
- **Cells:** areas of the wall (A1, A2, ...), each with 4 corners and a real length. They tell the system *where* on the wall a person is.
- **Routes:** for each cell, the grid squares the drone should visit, in order.
- **Validation:** is the wall ready to use?

### The map
| File | Its one job |
|---|---|
| `Controllers/LaserGridsController.cs`, `WallsController.cs` | The functions (`WallsController` also holds `save-cells`, `set-cell-route`, `validate`, `save-annotation`) |
| `Services/LaserGridService.cs`, `WallService.cs`, `WallCellService.cs` | The rules (`WallCellService` = cells, routes and validation) |
| `Services/JpegInfo.cs` | Reads a JPEG's width and height from its header (no image library) |
| `Data/Entities/LaserGrid.cs`, `Wall.cs`, `WallCell.cs`, `WallCellSquare.cs` | The tables |
| `DTOs/Laser*`, `Wall*`, `GridSquareDto.cs` | Requests and responses |

### Key ideas
- **Annotation = numbers between 0 and 1.** A point is `[x, y]` as a fraction of the picture's width and height, so it does not depend on the camera's resolution. Exactly 2 points per line. The wall stores the picture's size (`frameWidth`, `frameHeight`) and the points as JSON text. A wall cannot be created without them.
- **Cells:** corners in the order top-left, bottom-left, top-right, bottom-right (also 0 to 1). The start and end metre of each cell are *worked out* from the order and lengths (A1 0-10 m, A2 10-20 m...), never stored.
- **`save-cells` replaces the whole list but matches by label.** A cell that is saved again keeps its id and its route; a cell missing from the list is deleted. A gotcha learnt here: a new child must NOT be given an `Id` when it is added through a tracked parent, or EF thinks it already exists and sends an UPDATE that touches 0 rows.
- **Routes:** a list of `{row, col}` in drone visiting order. A square belongs to **one** cell on any wall using that grid: checked in the service (409 names the clash) and enforced by a unique index (`LaserGridId`, `Row`, `Col`). Replacing a route deletes the old rows and inserts the new ones **inside one transaction, in two steps**, because a square that stays in the route would otherwise hit the unique index while its old row still exists.
- **Validation** (`walls/validate`) is computed, never stored: it lists what is missing (no cells, no grid, no camera position, a cell without a route). It answers `Valid` when the list is empty.
- **Consistency rules:** moving a wall to another grid clears its routes (they are squares of the old grid); shrinking a grid is refused (409) if a route square or the camera position would fall outside it; a grid used by a wall cannot be deleted.
- **`walls/save-annotation`** saves only the two lines. If they really changed, the running ML session is reset so the new lines are used at once (`IDetectionService.ResetSessionAsync`). `walls/update` does the same when it changes the annotation.
- **Getting a picture to draw on:** `cameras/get-snapshot` fetches `/shot.jpg` from an IP Webcam phone and reports its size in the headers `X-Frame-Width` and `X-Frame-Height` (read with `JpegInfo`). For RTSP cameras the app captures a frame from the playback stream instead (the backend cannot decode RTSP without ffmpeg).

### Why
- Fractions keep the annotation valid if the camera's resolution changes (the *shape* must stay the same: the worker warns if it does not).
- Cell corners live in the camera picture, routes live on the laser grid: they are two different coordinate systems, joined only by the cell.
- Unique indexes back every "only one" rule so two simultaneous requests cannot both succeed.

### Check it yourself
Create a grid, a wall with the annotation (400 without it), `PUT walls/save-cells` with two cells, `PUT walls/set-cell-route` for each, `GET walls/validate` (Invalid until every cell has a route, then Valid). Try a square already used (409). `SELECT * FROM WallCellSquares ORDER BY WallCellId, [Order]`.

### Not done yet
Drawing the annotation needs a screen in the app (it is not in the design deck).

---

## Feature 5: Detection bridge, ingest worker and media server

### What it does
Turns camera video into alarms. The wall-crossing model (a separate, frozen Python service on port 8010) says "someone is climbing"; the backend works out *which cell* and stores the alarm. Clients never talk to the ML service; only the backend does.

### The flow
Camera -> MediaMTX -> **ingest worker** -> `worker/send-frame` -> `DetectionService` -> **ML service** -> cell -> `DetectionEvent` (+ alert, Feature 6).

### The map
| File | Its one job |
|---|---|
| `Services/Interfaces/IMlClient.cs`, `Services/MlClient.cs`, `MlModels.cs` | The only class that talks to the ML service. Turns its failures into our own exceptions |
| `Services/DetectionSessions.cs` | One shared map: wall -> its ML session (plus a short history of recent pictures) |
| `Services/CellLocator.cs` | "Which cell is this point in?" (ray casting) |
| `Services/DetectionService.cs` | start, frame, stop, list events, worker jobs |
| `Controllers/DetectionController.cs`, `MlController.cs`, `WorkerController.cs` | The functions |
| `Data/Entities/DetectionEvent.cs` | One stored alarm (with the alarm picture) |
| `ingest-worker/worker.py` | Reads the streams, posts frames |
| `media/`, `ml-service/`, `tools/probe-rtsp.py` | MediaMTX setup, CPU/GPU switch, finding a camera's RTSP address |

### Key ideas
- **How the ML service works** (read from its code): live mode keeps a session per camera in memory. Each picture you send counts as one sample; every time, it re-runs its trailing window of up to 60 samples through a bidirectional LSTM and answers a probability, `alarm_active` and `alarm_raised` (true only on the frame where a new alarm starts), plus a box per person. Its README shows wall points as `[[x,y]]` but the API wants `[{"x":..,"y":..}]`; `MlClient` converts.
- **Sessions:** `detection/start` closes any old session, opens a new one with the wall's annotation, and saves `DetectionEnabled` (and the threshold) **in the database**, so watching survives a backend restart. A frame for a wall with no session opens one by itself. If the ML service restarted and forgot the session (it answers 404), the backend opens a new one and retries once. A per-wall lock (`SemaphoreSlim`) keeps frames of one wall in order.
- **Which cell:** the person's foot point is the bottom centre of their box. `CellLocator` tests it against each cell's 4 corners by ray casting (draw a line to the right; an odd number of edge crossings = inside). A point outside every cell gives no cell.
- **An alarm:** the stored `DetectionEvent` has the cell, the probability, the frame number and the alarm picture. The person used is the most confident one standing in a cell.
- **Errors:** ML service down or its models not loaded = 503; a picture it cannot read = 400.
- **The worker** asks `worker/get-jobs` which walls are switched on and reads each stream. It keeps frames by **time**, not by counting: about 5 per second, because the model was trained on one frame in every 5 of videos that are mostly 25 fps (measured on the training set: 65% 25 fps, 20% 30 fps, 14% 24 fps). It measures how long a frame takes to analyse and **paces itself** to the speed the ML service can keep up; if a frame is still in flight when the next is due, the new one is skipped. It reads RTSP over **TCP** because UDP lost packets over Wi-Fi.
- **The worker's key:** it has no user login, so `worker/*` is protected by the header `X-Worker-Key` (`Worker:ApiKey`), compared in constant time. A user's token does not work there and the key works nowhere else. A `CHANGE-ME` key never works.
- **MediaMTX** pulls each camera once and serves it as RTSP (for the worker) and HLS (for the apps): the camera sees one connection however many watch. Camera blocks in `media/mediamtx.yml` are named `cam-<cameraId>`.
- **CPU or GPU ML:** the same model runs about 2 frames/s on the GPU (live window full) and about 14 on the CPU on the development Mac, with identical answers (7 clips, 292 frames). `ml-service/start-ml.sh cpu|gpu` switches between the original (GPU) and a CPU copy. See `docs/FUTURE-WORK.md` for the decision.

### Why
- One class owns the ML conversation so a change in the ML service touches one file.
- Sampling by time makes any camera frame rate look the same to the model.
- Saving "being watched" in the database means a restart does not silently stop protection.

### Check it yourself
Start MediaMTX, the ML service and the backend; `POST detection/start`; run the worker (`docs/OFFLINE-CHECKLIST.md`, step 8); read the worker's log (`camera ~30 fps | sent 5.0/s`); `GET detection/list-events`; `SELECT TOP 5 Id, CellLabel, Probability FROM DetectionEvents ORDER BY DetectedAtUtc DESC`.

### Not done yet
Several walls at once has not been measured; the real CCTV cameras and the NVR are untested (`docs/REAL-CAMERAS.md`).

---

## Feature 6: Alerts and real-time

### What it does
Every alarm becomes an **alert** with an incident number (INC-0001...), stored for the alerts log and **pushed live** to the owner and the guards of that property.

### The map
| File | Its one job |
|---|---|
| `Data/Entities/Alert.cs` | The table, and the status names |
| `Services/AlertService.cs` | Creates alerts, lists them, reads one |
| `Services/AlertNotifier.cs` | Works out who must be told and pushes to them |
| `Hubs/AlertsHub.cs` | The SignalR channel at `/hubs/alerts` (clients only listen), and `SubUserIdProvider` |
| `Controllers/AlertsController.cs` | The functions |
| `Program.cs` | `AddSignalR`, the JWT-in-query-string rule for `/hubs`, CORS, `MapHub` |

### Key ideas
- **One alarm = one alert**, saved in the same `SaveChanges` as its detection event. The incident number is a database `IDENTITY` column, so two alarms at the same moment can never get the same number.
- **Who gets the push:** the owner and every **active** guard assigned to the property, **worked out at the moment of the alarm** (not when someone connects). A guard assigned a minute ago gets it; a suspended one does not. `SubUserIdProvider` tells SignalR that a user's id is the token's `sub`.
- **A failed push never fails the frame:** the alert is already stored; the failure is only logged.
- **Browsers cannot put a header on a WebSocket,** so for paths under `/hubs` the token may come as `?access_token=`.
- **CORS** (`Cors:Origins`) is what lets a browser app (ReactJS) call the API and the hub.
- **The log:** newest first, paged (`page`, `pageSize` up to 100), filter by `status`. Without `propertyId` it covers every property the caller can see. An alert of a property you cannot see is a 404.

### Why
- Computing recipients at alarm time means access changes take effect immediately.
- The hub only pushes; all changes go through normal REST calls, which keeps the rules and the checks in one place.

### Check it yourself
Connect to the hub with a token (a SignalR client; see `docs/API.md`), run an alarm, see `AlertRaised` arrive; `GET alerts/list`; `SELECT Number, Status, CellLabel FROM Alerts`.

### Not done yet
Push notifications to phones when the app is closed; repeated alarms are not merged into one incident.

---

## Feature 7: Alert actions

### What it does
People respond to an alert: acknowledge, mark false alarm, close, escalate (admin only), or confirm "this is an authorized person". Every step is kept in a history and pushed live.

### The map
`Services/AlertTransitions.cs` (the rules), `AlertService.ChangeStatusAsync` (does it), `Data/Entities/AlertAction.cs` (the history table), `Controllers/AlertsController.cs`, `Hubs/ConnectionTracker.cs` (closes connections).

### The rules (`AlertTransitions`)
| Action | Allowed from | Becomes |
|---|---|---|
| acknowledge | New | Acknowledged |
| mark-false-alarm | New, Acknowledged | FalseAlarm (final) |
| close | New, Acknowledged, Escalated | Closed (final) |
| escalate (admin) | New, Acknowledged | Escalated |
| confirm-authorized | New, Acknowledged | ConfirmedAuthorized (final) |

### Key ideas
- **Compare-and-set:** the service reads the current status, checks the rule, then updates with `WHERE Id = .. AND Status = <what it read>`. If two people press at once, exactly one update changes a row and the other gets 409.
- **History:** each action writes an `AlertActions` row (action, from, to, who, role, note, time). The person's name is **copied** into the row, so the history stays readable if the guard is deleted.
- **Live:** every change is pushed as `AlertUpdated` to the same people as the alert.
- **A guard who is suspended or deleted loses their open connection at once:** `ConnectionTracker` remembers each open hub connection and aborts them (`GuardService`). The hub also closes a connection when its token expires (`CloseOnAuthenticationExpiration`).
- Admins and assigned guards can act; only an admin can escalate (403 for a guard, from the attribute).

### Why
A status machine in one file is easy to read and to change; compare-and-set is the simplest way to be safe against double presses without locks.

### Check it yourself
Create an alert, `POST alerts/acknowledge`, again (409), `POST alerts/close`, then `acknowledge` (409, final); `GET alerts/list-actions`; `SELECT * FROM AlertActions ORDER BY AtUtc`.

---

## Feature 8: Drone (planned, not built)
The eleven `drones/...` functions answer **501 Not Implemented** so the app teams can see the planned names. Nothing else exists: the Raspberry Pi side, its protocol, the telemetry and the dispatch are open decisions listed in `docs/FUTURE-WORK.md`. What is ready for it: an alert knows its wall and cell, a cell knows its laser route, and an alert can carry `autoResponseSkipped` (the drone code must check it).

---

## Feature 9: Authorized people (face ID)

### What it does
An admin enrols people (resident, employee, visitor) with three photos. When someone climbs a wall the backend looks for their face; a trusted authorized person gets the alert marked "no automatic response", and a guard confirms by looking at the alarm picture. **The alert is never suppressed.**

### The map
| File | Its one job |
|---|---|
| `face-service/app.py` | Finds faces in a picture and returns each face's box and its 512-number embedding. Stores nothing |
| `Services/Interfaces/IFaceClient.cs`, `Services/FaceClient.cs`, `FaceModels.cs` | The only class that talks to the face service |
| `Services/FaceMath.cs` | dot product, average, bytes <-> numbers |
| `Services/PersonService.cs` | Enrolment rules, matching, status, identify, the alarm rules |
| `Controllers/PeopleController.cs` | The functions (admin only) |
| `Data/Entities/AuthorizedPerson.cs` (+ `PersonPhoto`) | The tables |
| `Services/DetectionService.cs` | Calls the alarm rules; sets `autoResponseSkipped` |

### Key ideas
- **A face is 512 numbers of length 1.** Two faces are alike when their dot product (cosine similarity) is high: about 0.5 to 1.0 for the same person, about 0 to 0.25 for different people on the project's own photos. Threshold `Face:MatchThreshold` = 0.45. The backend stores the numbers and matches; the face service never knows anyone.
- **Enrolment** (`people/enroll`): three photos, each with **exactly one face, at least 100 px wide**; the three must look like the same person (every pair at least 0.30); a face already enrolled is a 409. The person's face vector is the average of the three, scaled back to length 1 (the same method as the `enroll_user.py` learning script, which lives in `Documents/CV/learn`, outside this repository).
- **Status is worked out, never stored:** `Disabled` (access off), `Expired` (today is past `validUntil`; the last day counts) or `Authorized`.
- **On an alarm** (`RecognizeForAlarmAsync`) the faces are looked for in the alarm frame and a few earlier ones (about 2 seconds, kept in `DetectionSessions`). A person is **trusted** only if: the face is at least 60 px wide; the same enrolled, still-authorized person matched in at least 2 different frames; and nobody else matched on that person. Each face is given to **exactly one** person (the box it is inside whose head position it is nearest to), so one face can never vouch for two. The response is skipped only if **everyone** at the wall is trusted.
- **What the alert gets:** `recognizedPerson` (named), `autoResponseSkipped` (policy `Face:AuthorizedPolicy`: `SkipDrone` default, `LabelOnly`, anything else counts as `LabelOnly`). The alarm picture is saved (`alerts/get-snapshot`) and a guard confirms with `alerts/confirm-authorized` (Feature 7).
- **Best effort:** if the face service is down, the alert is created as usual. A bug found by testing and fixed: with two people whose boxes overlapped, one face used to clear both.
- **Privacy:** admin only; removing a person deletes the photos and the numbers for good (cascade).

### Why
- Never silencing an alert is the safe choice: a false match costs far more than one extra alert.
- Requiring a big face, several frames and everyone cleared makes a wrong "trusted" very unlikely.

### The big limit
On the dataset's wall footage faces are only 13 to 50 px wide (none reached 60 px), so on such cameras this will rarely trigger. It works where faces are large (an entrance camera, close-up). Measured details: `docs/FUTURE-WORK.md`.

### Check it yourself
Start the face service, `POST people/check-photo` with a clear photo (ok) and a picture without a face (not ok), `POST people/enroll` with three photos, `POST people/identify` with a new photo of the same person (`matched: true`) and a stranger (`false`), `SELECT Name, Category, AccessDisabled FROM AuthorizedPeople`.

### Not done yet
Liveness (a photo held to the camera), encrypting the face data and alarm pictures, a retention period for alarm pictures, tests with real cameras where faces are large.

