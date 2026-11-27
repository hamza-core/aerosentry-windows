# Offline checklist

Do the downloads once while you have internet. After that, everything runs with no internet (local network only).
The core API (steps 1 to 3 and 7 below) needs only .NET, Docker and SQL Server. The other programs are optional extras.

## One-time downloads
| What | Where it ends up | Needed for |
|---|---|---|
| .NET SDK 11.0.100 (`dotnet --version`) | system | everything |
| Docker image `mcr.microsoft.com/mssql/server:2022-latest` (`docker pull --platform linux/amd64 ...` on Apple Silicon) | Docker | the database |
| Global tool `dotnet tool install --global dotnet-ef` (put `~/.dotnet/tools` on PATH) | `~/.dotnet/tools` | migrations |
| NuGet packages: `dotnet restore` in `AeroSentry.Api` | `~/.nuget/packages` | building the API |
| Conda environment `cv_env` (versions below) | `~/miniconda3/envs/cv_env` (or set `PYTHON_BIN`) | ML service, face service, worker, probe tool |
| Wall model folders `standalone_every_5_frames` (GPU, original) and `standalone_every_5_frames_cpu` | the sibling `ml-service/` module (`AeroSentry-Complete/ml-service/`) | wall detection (they contain the model files) |
| InsightFace `buffalo_l` model, 325 MB. InsightFace downloads it the FIRST time it runs: this is the one thing that needs internet. Keep the folder. | `~/.insightface/models/buffalo_l` | face recognition |
| MediaMTX executable (v1.21.4 was used) | the sibling `mediamtx/bin/mediamtx` module (`AeroSentry-Complete/mediamtx/`) | camera video for the apps and the worker |

## NuGet packages (AeroSentry.Api, five, no new ones since Feature 1)
| Package | Why |
|---|---|
| Microsoft.AspNetCore.OpenApi | Generates the OpenAPI JSON |
| Scalar.AspNetCore | Browser API page, assets bundled (tested offline) |
| Microsoft.EntityFrameworkCore.SqlServer | EF Core provider for SQL Server |
| Microsoft.EntityFrameworkCore.Design | Needed by `dotnet ef` to create migrations |
| Microsoft.AspNetCore.Authentication.JwtBearer | Creates and validates JWTs |

No package is needed for password hashing (`PasswordHasher<User>`), SignalR, `HttpClient` or CORS: they are in the ASP.NET Core shared framework.

## Python packages (conda environment `cv_env`)
torch 2.2.2, ultralytics 8.4.161, opencv-python 4.11.0.86, numpy 1.26.4, fastapi 0.162.0, uvicorn 0.54.0, pydantic-settings 2.16.2,
python-multipart 0.0.33, requests 2.32.4, insightface 2.1, onnxruntime 1.23.2. (websockets 17.4 is only used by test scripts.)

## Config
**Secrets: `AeroSentry.Api/appsettings.Local.json`. It is NOT in git, so redo it on every new machine.**
Copy `appsettings.Local.example.json` to `appsettings.Local.json` and fill in the three values:
- `ConnectionStrings:DefaultConnection`: the SQL Server connection string (the one for your Docker database).
- `Jwt:Key`: at least 32 characters (`openssl rand -base64 48`).
- `Worker:ApiKey`: any long random text (`openssl rand -base64 32`). The ingest worker sends it as `WORKER_KEY`. Without it the worker endpoints stay closed.

If a required secret is missing, or still says `CHANGE-ME`, the backend refuses to start and says which one. A `CHANGE-ME` worker key never opens the worker endpoints.
Environment variables with a double underscore (`ConnectionStrings__DefaultConnection`, `Jwt__Key`, ...) override the file.

**Non-secret settings** (safe in git): in `appsettings.json` `Jwt:Issuer`, `Jwt:Audience`, `Jwt:ExpiryMinutes`; in `appsettings.Development.json`:
| Key | Default | Meaning |
|---|---|---|
| `Media:HlsBase` | `http://localhost:8888` | where the apps play camera video. Use the Mac's LAN address for phones |
| `Media:RtspBase` | `rtsp://localhost:8554` | where the ingest worker reads camera video |
| `Cors:Origins` | `localhost:3000`, `localhost:5173` | browser apps allowed to call the API |
| `Ml:BaseUrl`, `Ml:Threshold` | `http://localhost:8010`, 0.5 | the wall-detection ML service and its alarm level |
| `Face:BaseUrl` | `http://localhost:8020` | the face service |
| `Face:MatchThreshold` | 0.45 | how alike two faces must be |
| `Face:AuthorizedPolicy` | `SkipDrone` | `SkipDrone` or `LabelOnly` (see `docs/API.md`) |
| `Face:MinRecognizeFaceWidth`, `Face:MinMatchingFrames`, `Face:RecognitionFrames` | 60, 2, 5 | the strict rules for trusting a face on an alarm |
| `Face:MinEnrollFaceWidth`, `Face:MinPhotoSimilarity`, `Face:SurveillanceDetSize` | 100, 0.30, 960 | enrolment checks and how hard to look for small faces |

## Run everything from scratch (in this order)
1. **Database.** Start Docker, then create the container (first time only):
   ```
   docker run --platform linux/amd64 -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=<password>" \
     -p 1433:1433 -v aerosentry-sqldata:/var/opt/mssql --name aerosentry-sql \
     -d mcr.microsoft.com/mssql/server:2022-latest
   ```
   Next times: `docker start aerosentry-sql`. (Only one container may publish port 1433.)
2. **Secrets.** Create `AeroSentry.Api/appsettings.Local.json` (above), with the password you chose in step 1.
3. **Migrations.** `cd AeroSentry.Api` then `dotnet ef database update` creates the `AeroSentry` database and applies all migrations.
4. *(optional, camera video)* **MediaMTX:** `cp media/mediamtx.example.yml media/mediamtx.yml`, add a block per camera, then `mediamtx media/mediamtx.yml`.
5. *(optional, wall detection)* **ML service:** `ml-service/start-ml.sh cpu` (or `gpu`, the original). Port 8010.
6. *(optional, faces)* **Face service:** `face-service/start-face.sh start`. Port 8020.
7. **Backend:** `dotnet run` in `AeroSentry.Api`. Open `/scalar` or use Postman. For phones or other computers:
   `ASPNETCORE_ENVIRONMENT=Development Media__HlsBase=http://<LAN-IP>:8888 dotnet run --no-launch-profile --urls "http://0.0.0.0:5078"`.
8. *(optional, cameras to detection)* **Ingest worker:** `WORKER_KEY=<Worker:ApiKey> python ingest-worker/worker.py` (in `cv_env`).

What each optional part gives: without 5 there is no wall detection (the API still works, detection calls answer 503); without 6 there is no face
enrolment or recognition (alerts are still created); without 4 and 8 no camera feeds the system by itself (frames can still be posted by hand).

## Commands and what each does
| Command | What it does |
|---|---|
| `dotnet restore` | Downloads/links NuGet packages |
| `dotnet restore --source ~/.nuget/packages` | Restores ONLY from the local package cache (proves it works offline) |
| `dotnet build` | Compiles the project |
| `dotnet run` | Starts the API |
| `dotnet ef migrations add <Name>` | Generates a migration from model changes (database NOT changed) |
| `dotnet ef database update` | Applies pending migrations to the database |
| `dotnet ef migrations remove` | Deletes the last migration (reverts it first if applied) |
| `cp AeroSentry.Api/appsettings.Local.example.json AeroSentry.Api/appsettings.Local.json` | Starts the secrets file |
| `ml-service/start-ml.sh cpu\|gpu\|stop\|status` | Starts, stops or checks the wall-detection ML service |
| `face-service/start-face.sh start\|stop\|status` | Starts, stops or checks the face service |
| `python tools/probe-rtsp.py <camera-ip> --user .. --password ..` | Finds a camera's RTSP address |
| `docker ps -a` | Lists containers (running and stopped) |
| `docker start/stop aerosentry-sql` | Starts/stops the database container |

## Migrations (14, all applied by `dotnet ef database update`)
`initialUserMigration` (Users), `PHonenumberAdditionCheckMigration` (phone number), `AddPropertiesAndGuardOwnership`, `AddCameras`, `AddLaserGrids`,
`AddWalls`, `AddWallCells`, `AddWallCellRoutes`, `AddDetectionEvents`, `AddWallDetectionState`, `AddAlerts`, `AddAlertActions`, `AddAuthorizedPeople`,
`AddAlertAuthorizedHandling`.
