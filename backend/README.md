# AeroSentry: drone-based house wall monitoring (backend)

Final Year Project. Fixed cameras watch the walls of a property. When a person climbs a wall, the system works out **which part of the wall** they are in, alerts the owner and the guards in real time, and (planned) sends a drone to that spot. People who are enrolled (residents, employees, visitors) are recognised by face so they do not trigger the automatic response. Everything runs on a local network with **no internet** at runtime.

This repository is the **backend**: one ASP.NET Core Web API that every app talks to (SwiftUI, Flutter, React Native, ReactJS). It also holds the small helper programs around it.

## Status
| # | Feature | State |
|---|---|---|
| 1 | Auth and roles (admins, guards, JWT) | Done |
| 2 | Properties and guard assignment | Done |
| 3 | Cameras | Done |
| 4 | Laser grids, walls with annotation, cells, laser routes | Done |
| 5 | Detection bridge to the wall-detection ML service, ingest worker, media server | Done (tested with a real IP Webcam phone; real CCTV not yet) |
| 6 | Alerts and live push (SignalR) | Done |
| 7 | Alert actions (acknowledge, false alarm, close, escalate, confirm authorized) | Done |
| 8 | Drone | **Planned**: placeholders answer 501 |
| 9 | Authorized people (face ID) | Done (faces at wall cameras are usually too small to recognise) |
| 10 | Reports and settings | Not started |

73 endpoints (62 real, 11 drone placeholders), 14 migrations, 13 tables. What is missing and why: `docs/FUTURE-WORK.md`.

## Quick start
You need .NET 11, Docker and the conda environment described in `docs/OFFLINE-CHECKLIST.md`. The short version for the core API:
```bash
docker start aerosentry-sql                          # SQL Server (first time: see the checklist)
cp AeroSentry.Api/appsettings.Local.example.json AeroSentry.Api/appsettings.Local.json   # then fill in the 3 secrets
cd AeroSentry.Api
dotnet ef database update                            # creates the database and applies the 14 migrations
dotnet run                                           # http://localhost:5078 , API page at /scalar
```
The optional parts (ML service, face service, media server, worker) and the full start order: `docs/OFFLINE-CHECKLIST.md`.

## Documentation
| Read | For |
|---|---|
| `docs/ARCHITECTURE.md` | The parts, the data flow, the security model, why it is built this way |
| `docs/API.md` | Every function (method, path, who may call it, bodies, errors), live updates over SignalR |
| `docs/DATABASE.md` | Every table, column, relationship and delete rule (generated from the real database) |
| `docs/HOW-IT-WORKS.md` | How each feature works inside, file by file |
| `docs/OFFLINE-CHECKLIST.md` | Downloads, packages, settings, start order, commands |
| `docs/REAL-CAMERAS.md` | Setting up real CCTV cameras and the NVR |
| `docs/TESTING.md` | What was tested, how, and what was not |
| `docs/FUTURE-WORK.md` | What is not built, open decisions, known limits |
| `docs/EXERCISES.md` | "Change it yourself" exercises for learning |
| `CONTRIBUTING.md` | Branches, commits, how to add a feature |
| `CHANGELOG.md` | What changed, feature by feature |
| `ingest-worker/`, `face-service/`, `ml-service/`, `media/` | A README in each helper folder |

## Repository layout
```
AeroSentry.Api/        the backend (Controllers, Services and Services/Interfaces, DTOs, Data/Entities, Hubs, Migrations)
face-service/          face detection and embeddings (FastAPI + InsightFace), offline
ingest-worker/         reads camera streams and feeds the backend (Python + OpenCV)
media/                 MediaMTX config template (camera video for the apps and the worker)
ml-service/            start-ml.sh: switch between the GPU original and the CPU copy of the wall model
tools/                 probe-rtsp.py: finds a camera's RTSP address
docs/                  all documentation
```
The wall-detection model itself (YOLO11n-pose + BiLSTM) is a separate, frozen, supervisor-approved project and is **not** in this repository.

## Conventions
`/api/v1/<feature>/<action>` endpoints with ids in the query string; JWT bearer; UTC ISO-8601 times; ProblemDetails for errors; one paged format (`page`, `pageSize` -> `items`, `page`, `pageSize`, `totalCount`); normalised 0 to 1 coordinates for anything drawn on a camera picture. Secrets never go in git.
