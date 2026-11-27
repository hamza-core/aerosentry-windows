# AeroSentry API: endpoint list

Base URL: `http://<server>:5078/api/v1`  (Scalar page: `/scalar`, Development only)

## How every endpoint is named

`/api/v1/<feature>/<action>`

- The path says **what the function does**: `cameras/create`, `walls/save-cells`, `detection/start`.
- **Ids always go in the query string**: `?propertyId=...&cameraId=...`.
- The **JSON body holds only data** (the thing being created or changed).
- HTTP method: `GET` reads, `POST` creates or runs a command, `PUT` updates, `PATCH` changes one field, `DELETE` removes.
- Auth: `Authorization: Bearer <token>` on everything except `auth/register` and `auth/login`.
- Roles: **Admin** can do everything on their own properties. **Guard** can only read (and only assigned properties).
- Errors are ProblemDetails JSON: 400 bad input, 401 no/invalid token, 403 wrong role, 404 not found (or not yours), 409 conflict, 503 ML service down.
- Times are UTC ISO-8601. Coordinates on camera frames are normalised 0 to 1.

## Auth
| Function | Method and path | Who |
|---|---|---|
| Register an admin | `POST auth/register` | public |
| Log in, get a token | `POST auth/login` | public |
| Who am I | `GET auth/me` | any |

## Guards (Admin)
| Function | Method and path |
|---|---|
| Add a guard | `POST guards/create` |
| List my guards (optional `?status=Active\|Suspended`) | `GET guards/list` |
| Suspend or re-activate | `PATCH guards/set-status?guardId=` body `{ "status": "Suspended" }` |
| Remove a guard | `DELETE guards/delete?guardId=` |

## Properties
| Function | Method and path | Who |
|---|---|---|
| Add a property | `POST properties/create` | Admin |
| List properties I can see, sorted by name (optional `?search=text`, see below) | `GET properties/list` | any |
| One property | `GET properties/get?propertyId=` | any |
| Edit a property | `PUT properties/update?propertyId=` | Admin |
| Delete a property | `DELETE properties/delete?propertyId=` | Admin |
| Guards of a property | `GET properties/list-guards?propertyId=` | Admin |
| Give a guard access | `PUT properties/assign-guard?propertyId=&guardId=` | Admin |
| Take access away | `DELETE properties/unassign-guard?propertyId=&guardId=` | Admin |

A property has `name`, `address`, `latitude`, `longitude` and an optional `note` (text, at most 500 characters; trimmed; **400** if longer). Create and update accept them, get and list return them. **Update replaces everything**: leaving `note` out clears it.

**What a guard sees:** a guard gets `address: null` on get and list (name, note and the rest are returned). Guards also cannot change anything (403).

**Search:** `GET properties/list?search=text` keeps the properties whose **name** contains the text, ignoring case. For an **admin** the **address** is searched too; for a **guard** only the name is, so a guard cannot find a hidden address by guessing. Blank or missing `search` returns everything.

## Cameras
| Function | Method and path | Who |
|---|---|---|
| Add a camera | `POST cameras/create?propertyId=` | Admin |
| List cameras | `GET cameras/list?propertyId=` | any |
| One camera | `GET cameras/get?propertyId=&cameraId=` | any |
| Edit a camera | `PUT cameras/update?propertyId=&cameraId=` | Admin |
| Delete a camera (409 if a wall uses it) | `DELETE cameras/delete?propertyId=&cameraId=` | Admin |
| Can the server reach this host:port? (nothing saved) | `POST cameras/test-connection?propertyId=` | Admin |
| A still picture to draw the wall annotation on (the picture itself, `image/jpeg`; size in headers `X-Frame-Width`, `X-Frame-Height`) | `GET cameras/get-snapshot?propertyId=&cameraId=` | Admin |

`cameras/get-snapshot` works for `MobileApp` (IP Webcam) cameras: 400 for RTSP and ONVIF cameras (capture a frame of the
playback stream instead), 503 with a reason when the phone is off, unreachable or refuses the login.

Body: `name`, `sourceType` (`MobileApp`, `Onvif`, `Rtsp`), `host`, `port`, `streamPath`, optional `username`, `password`, `isActive`.
The response never contains the password (only `hasPassword`). `playbackUrl` is what the apps play.

## Laser grids
| Function | Method and path | Who |
|---|---|---|
| Add a grid | `POST laser-grids/create?propertyId=` | Admin |
| List grids | `GET laser-grids/list?propertyId=` | any |
| One grid | `GET laser-grids/get?propertyId=&gridId=` | any |
| Edit a grid (409 if it would drop a linked square) | `PUT laser-grids/update?propertyId=&gridId=` | Admin |
| Delete a grid (409 if a wall uses it) | `DELETE laser-grids/delete?propertyId=&gridId=` | Admin |

Body: `name`, `rows`, `columns`, `squareSizeMeters`.

## Walls (camera + wall annotation + cells + laser routes)
| Function | Method and path | Who |
|---|---|---|
| Add a wall (annotation required) | `POST walls/create?propertyId=` | Admin |
| List walls (with cells and routes) | `GET walls/list?propertyId=` | any |
| One wall | `GET walls/get?propertyId=&wallId=` | any |
| Edit a wall | `PUT walls/update?propertyId=&wallId=` | Admin |
| **Save the wall annotation** (only the two lines, drawn on a camera picture) | `PUT walls/save-annotation?propertyId=&wallId=` | Admin |
| Delete a wall | `DELETE walls/delete?propertyId=&wallId=` | Admin |
| Save all cells of a wall | `PUT walls/save-cells?propertyId=&wallId=` | Admin |
| Set the laser route of one cell | `PUT walls/set-cell-route?propertyId=&wallId=&cellId=` | Admin |
| Is the wall ready? | `GET walls/validate?propertyId=&wallId=` | any |

Wall body: `name`, `cameraId`, `frameWidth`, `frameHeight`, `wallTopPoints` (2 to 100 points `[x,y]` along the top edge), `wallBottomPoints` (same, bottom edge), optional `laserGridId`, `cameraGridRow`, `cameraGridCol`.
**Annotating a wall (the flow for the app):** 1) show a camera picture (`cameras/get-snapshot`, or a frame captured from the
playback stream); 2) the admin taps along the top edge and then along the bottom edge of the wall (2 points each for a straight wall, more where it bends); 3) send them with the
picture's size to `walls/save-annotation`. Body: `frameWidth`, `frameHeight`, `wallTopPoints`, `wallBottomPoints` (2 to 100 points `[x,y]`
each, 0 to 1). If the annotation really changed (here or in `walls/update`) a running detection switches to the new lines at once.
Keep the camera and its picture size fixed afterwards; the annotation is a fraction of the picture.
Cells body (a list): `label`, `lengthMeters`, `topLeft`, `bottomLeft`, `topRight`, `bottomRight` (each `[x,y]`).
Route body (a list, in drone visiting order): `[{ "row": 0, "col": 0 }, ...]`.

## Detection (talks to the ML service)
| Function | Method and path | Who |
|---|---|---|
| Start watching a wall | `POST detection/start?propertyId=&wallId=[&threshold=0.5]` | Admin |
| Send one JPEG frame (multipart: `frame`, optional `frameIndex`, `timestampSeconds`) | `POST detection/send-frame?propertyId=&wallId=` | Admin |
| Stop watching | `POST detection/stop?propertyId=&wallId=` | Admin |
| Stored alarms, newest first | `GET detection/list-events?propertyId=&wallId=&page=1&pageSize=20` | any |
| Is the ML service running? | `GET ml/health` | Admin |

`detection/start` switches a wall **on** (saved in the database, so it survives a backend restart; the wall then shows
`detectionEnabled: true`) and `detection/stop` switches it **off**. The ingest worker watches every wall that is switched on.

## Live preview (the wall with the people marked)
The ingest worker draws a box round every person the model finds (orange; **red** while the climbing alarm is on, with the
confidence and the cell) on the camera picture and sends it to the backend. The apps show it as a picture stream. Only the
**latest** picture of each wall is kept, in memory (nothing on disk or in the database).
| Function | Method and path | Who |
|---|---|---|
| Watch a wall's live preview (a never-ending `multipart/x-mixed-replace` JPEG stream, like an IP camera's MJPEG) | `GET detection/preview?propertyId=&wallId=` | any who can see the property |
| *(worker only)* Send the picture with the boxes drawn on it (multipart `frame`, a JPEG up to 2 MB) | `POST worker/post-preview?wallId=` + `X-Worker-Key` | worker |

`detection/preview`: **404** when the wall is not yours, **or** when no picture comes in within 5 seconds (the wall is not being watched,
or the ingest worker is not running). The stream **ends by itself** when the worker stops for 6 seconds, so the app notices and
reconnects instead of showing a frozen picture. Send the login token as a normal `Authorization: Bearer` header.
It is about as fast as the model: roughly 4 pictures per second on the CPU model, 1 to 2 on the GPU one.
`worker/post-preview`: 204 stored, 400 not a JPEG or too big, 401 wrong key.

## Alerts (the alerts log)
Every alarm the detection bridge stores becomes an alert automatically (one alarm = one alert).
| Function | Method and path | Who |
|---|---|---|
| Alerts log, newest first. `propertyId` is optional (leave out = every property I can see); optional `status`, `page`, `pageSize` | `GET alerts/list[?propertyId=&status=New&page=1&pageSize=20]` | any |
| One alert | `GET alerts/get?alertId=` | any |
| The picture taken at the moment of the alarm (`image/jpeg`), to see who it is | `GET alerts/get-snapshot?alertId=` | any (owner and assigned guards) |

### Alert actions
Body is optional: `{ "note": "text up to 500 characters" }`. Each returns the updated alert (200). **409** if the alert's current
status does not allow the action. Admins and guards assigned to the property can act; **escalate is admin only** (403 for a guard).
| Function | Method and path | Allowed from | Becomes |
|---|---|---|---|
| I am on it | `POST alerts/acknowledge?alertId=` | New | Acknowledged |
| It was nothing | `POST alerts/mark-false-alarm?alertId=` | New, Acknowledged | FalseAlarm (final) |
| Incident over | `POST alerts/close?alertId=` | New, Acknowledged, Escalated | Closed (final) |
| Call the authorities | `POST alerts/escalate?alertId=` (Admin) | New, Acknowledged | Escalated |
| **I looked at the picture: this is an authorized person** | `POST alerts/confirm-authorized?alertId=` | New, Acknowledged | ConfirmedAuthorized (final) |
| History: who did what and when, oldest first | `GET alerts/list-actions?alertId=` | | |

History entry: `action`, `fromStatus`, `toStatus`, `byUserId`, `byName`, `byRole`, `note`, `atUtc`.
If two people press at the same moment, exactly one succeeds and the other gets 409.

Alert: `id`, `number`, `incidentCode` (`INC-0042`), `status` (`New`, later `Acknowledged`, `FalseAlarm`, `Closed`, `Escalated`),
`propertyId/Name`, `wallId/Name`, `cameraId/Name`, `cellId`, `cellLabel` (null if the person was past the ends of every cell's wall section: see CellLocator),
`probability`, `recognizedPerson` and `autoResponseSkipped` (see Authorized people; usually null / false), `detectionEventId`, `createdAtUtc`.
`status` can also be `ConfirmedAuthorized`. Admins see alerts of their properties, guards of the properties they are assigned to.

### Live alerts (SignalR)
New alerts are **pushed** to the app, no polling.
- Hub URL: `http://<server>:5078/hubs/alerts`  (SignalR, WebSockets)
- Log in first, then connect with the token: header `Authorization: Bearer <token>`, or in the URL `?access_token=<token>` (browsers).
- Listen for two messages. Each has a single argument, an alert in the same shape as above:
  - **`AlertRaised`**: a new alert.
  - **`AlertUpdated`**: an alert changed status (someone acknowledged, closed it, ...). Update it in your list.
- Who receives them: the property's owner and every **active** guard assigned to that property, at that moment.
- Client libraries: JavaScript and React Native `@microsoft/signalr`; Flutter `signalr_netcore`; SwiftUI `SwiftSignalRClient`.
- When a guard is **suspended or deleted**, the server closes their open connection at once. The app sees the connection drop,
  and reconnecting is refused (401). The same happens when the login token expires: the app must log in again.
- After a reconnect, call `alerts/list?status=New` to catch alerts missed while offline.

## Drones (PLANNED, NOT IMPLEMENTED YET)
Every function below answers **501 Not Implemented** today. They are listed so the apps can prepare; names and parameters may
still change. See `docs/FUTURE-WORK.md` for what is decided and what is open.
| Function | Method and path |
|---|---|
| List drones | `GET drones/list?propertyId=` |
| Register a drone (Admin) | `POST drones/create?propertyId=` |
| Remove a drone (Admin) | `DELETE drones/delete?propertyId=&droneId=` |
| Send a drone to an alert's cell | `POST drones/dispatch?alertId=` |
| Live status of a drone | `GET drones/get-status?propertyId=&droneId=` |
| Flight logs | `GET drones/list-flight-logs?propertyId=&droneId=` |
| Return home | `POST drones/return-home?propertyId=&droneId=` |
| Emergency land | `POST drones/emergency-land?propertyId=&droneId=` |
| Take manual control (pauses autonomous flight) | `POST drones/take-manual-control?propertyId=&droneId=` |
| Joystick values while in manual control | `POST drones/send-controls?propertyId=&droneId=` |
| Resume the mission | `POST drones/release-manual-control?propertyId=&droneId=` |

## Authorized people (face ID)
Faces that are **not treated as intruders**. Faces are biometric data: every function here is **admin only**, for the admin's own
properties, and removing a person deletes the photos and the face numbers for good.
| Function | Method and path |
|---|---|
| Enrol a person | `POST people/enroll?propertyId=` (multipart, see below) |
| **Enrol from one video** (10 to 20 s, see below) | `POST people/enroll-video?propertyId=` (multipart, see below) |
| Is this photo good enough to enrol with? (call it for each photo as it is taken) | `POST people/check-photo?propertyId=` (multipart `image`) |
| List people (optional `category`) | `GET people/list?propertyId=[&category=Resident\|Employee\|Visitor]` |
| One person | `GET people/get?propertyId=&personId=` |
| A stored photo (the picture itself) | `GET people/get-photo?propertyId=&personId=&angle=Front\|Left\|Right` |
| Edit the details | `PUT people/update?propertyId=&personId=` (JSON) |
| Switch access off / on | `POST people/disable-access?...` / `POST people/enable-access?propertyId=&personId=` |
| Remove a person | `DELETE people/delete?propertyId=&personId=` |
| Who is in this picture? | `POST people/identify?propertyId=` (multipart `image`) |

**Enrol** (`multipart/form-data`): `name`, `category` (`Resident`, `Employee`, `Visitor`), optional `phone`, `validUntil` (`2026-10-31`, empty = no expiry),
optional `note`, and three picture files `front`, `left`, `right`. Each photo must show **exactly one face, at least 100 px wide**, and the three must
look like the same person. Errors name the photo ("The Left photo: no face was found"); 409 if this face is already enrolled.
**Enrol from a video** (`POST people/enroll-video`, `multipart/form-data`): the same `name`, `category`, `phone`, `validUntil`, `note`, and ONE file `video`
(10 to 20 seconds, at most 100 MB) of one person who is told, on screen and by voice, to look straight, turn left, turn right, tilt up and tilt down.
The server does the picking, not the app: the face service looks at about 60 frames, measures the head angles, the sharpness and the embedding of each, and
keeps the **sharpest frame of each pose** (named by the order the person made them: the side turned to first is `Left`, the tilt made first is `Up`).
`Front`, `Left` and `Right` are required (turning both ways is the liveness proof: a photo cannot do it); `Up` and `Down` are stored when found. The same rules as
the three-photo enrolment apply (face at least 100 px, the same person in every frame, 409 if already enrolled), and the face profile is the average of all the
embeddings. Errors say what to fix ("The video does not show the head turning to both sides..."). `photoAngles` still lists the three profile pictures; an `Up` or
`Down` picture can be fetched with `people/get-photo?angle=Up|Down`. Takes a few seconds (the face service must be running, 503 if not). This is a basic
challenge-response check, not a certified anti-spoofing system.

**Status** (never stored, worked out each time): `Authorized`, `Disabled` (access switched off) or `Expired` (today is after `validUntil`; the last day counts).
**Update** body: `name`, `phone`, `category`, `validUntil`, `note` (to change the photos, remove the person and enrol again).
**Identify** answers every face in the picture: `box`, `bestScore`, `matched` (score at least `Face:MatchThreshold`, 0.45), the `person`, and `isAuthorized`
(matched and status `Authorized`). 503 when the face service is not running.

**On alarms (the rule).** The alert is **always** created and pushed. When the wall model raises an alarm, the backend also looks for faces in the alarm
frame and a few earlier frames (about 2 seconds). A person is *trusted* only if ONE enrolled person, still `Authorized`, matched on them in at least
`Face:MinMatchingFrames` (2) different frames, with a face at least `Face:MinRecognizeFaceWidth` (60) px wide; each face is given to exactly one person
(so one face can never vouch for two). Then:
- the alert carries `recognizedPerson` `{ id, name, category, score }`;
- if **everyone** at the wall is trusted (policy `Face:AuthorizedPolicy` = `SkipDrone`, the default) the alert has `autoResponseSkipped: true`: **no automatic
  drone must be sent** for it (the drone feature must check this flag). One unknown person, or no visible face, means the full response stays on;
- a guard or admin looks at `alerts/get-snapshot` and presses `alerts/confirm-authorized` (recorded in the history, final).
Disabled and expired people are never trusted. If the face service is down the alert is created as usual, without any of this.
With `LabelOnly` (or any unknown value) the alert only names the person and the full response stays on.
Faces at a wall camera are often too small to recognise (see `docs/FUTURE-WORK.md`), so expect `recognizedPerson` to be null most of the time.

## Worker (only for the ingest worker program, not for apps)
Authenticated with the header `X-Worker-Key: <Worker:ApiKey>`. A user's JWT does not work here, and the key works nowhere else.
| Function | Method and path |
|---|---|
| Which walls must be watched now (with stream addresses) | `GET worker/get-jobs` |
| Send one sampled frame (multipart `frame`, `frameIndex`, `timestampSeconds`; query `wallId`) | `POST worker/send-frame?wallId=` |

Paged lists return `{ "items": [], "page": 1, "pageSize": 20, "totalCount": 0 }`.

### Enrol from video frames (like enroll_user.py)
`POST people/enroll-frames?propertyId=` (admin). multipart: `name`, `category`, optional `phone`, `validUntil`, `note`, and `video`
(about 20 s, one person facing the camera, at most 100 MB). 201 with the person; `photoAngles` lists `Frame01`..`Frame30`
(fetch with `people/get-photo?angle=Frame07`). 400 says how many good frames were found and why others were not, or that the
video does not show one person; 409 already enrolled; 503 face service not running.

### Live face capture
`POST people/check-frame?propertyId=` multipart `image` -> `{ faces, ok, message, box|null, face_width, sharpness }` (box is
[x1,y1,x2,y2], fractions of the picture). Stores nothing.
`POST people/enroll-captured?propertyId=` multipart: the details plus 30 to 60 files named `frames`; each is judged again; of
the good ones the 30 sharpest are kept. Same answers as `enroll-frames`, which now also keeps the 30 sharpest of up to 45.

