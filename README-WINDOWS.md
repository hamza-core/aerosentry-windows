# AeroSentry on a Windows laptop

Everything runs on ONE laptop. The web app opens on that same laptop (`http://localhost:5173`).
A phone camera connects over the local Wi-Fi.

**Status:** this code was prepared and tested on a Mac. It has **not been run on Windows yet**. Follow
"Check it" at the end before you rely on it.

## What is in the repository

| Folder / file | What it is |
|---|---|
| `backend/` | ASP.NET Core API (`AeroSentry.Api`, SQL Server), face service, camera worker |
| `web-app/` | React web app |
| `model/` | the wall-crossing model: its code and weights, unchanged. Do not edit |
| `python/requirements.txt` | Python packages with the tested versions |
| `tests/` | wall lines and reference results (no videos) |
| `scripts/` | demo camera, detection check, camera-position check |
| `*.bat`, `aerosentry.py` | setup and run |

Downloaded by setup, not in git: the face model (InsightFace buffalo_l, for non-commercial research use) and
MediaMTX 1.21.4 (video server; its checksum is verified). No password, key or camera login is in the repository.

## 1. What you need

64-bit Windows 10 or 11 (Intel or AMD).

| Needed | Notes |
|---|---|
| **conda environment `cv_env`** | you already have it (Python 3.10 or newer; tested with 3.11) |
| **.NET 11 SDK, x64** | |
| **Node.js** 22.22.2+ (22.x) or 24.15+ | |
| **SQL Server** | Express or Developer, installed on Windows |
| Microsoft Visual C++ Redistributable, x64 | usually already there |
| Git, and Chrome or Edge | |

## 2. Get the code

Use a short path without spaces:

```
git clone https://github.com/hamza-core/aerosentry-windows.git C:\AeroSentry
```

**Test videos** are not in the repository. They are needed only for `demo.bat` and `check.bat`. Use your own copy
of the dataset: the first time, those two ask for the path of your `dataset\test` folder (the one that contains
`Wall crossing` and `Normal class`) and remember it in `local\videos-folder.txt` (delete that file to change it).
`check.bat` compares results by file name, so your copy must be the same dataset.

## 3. Set up (needs internet)

Double-click **`setup.bat`**. It activates `cv_env`, then:

1. installs **only the Python packages `cv_env` does not have** (it does not replace your torch or numpy, and lists
   versions that differ from the tested ones),
2. downloads the face model (about 280 MB) if you do not have it, and the video server,
3. installs the web and backend packages and the database tool,
4. makes `backend\AeroSentry.Api\appsettings.Local.json` with a SQL Server connection and new random keys.

If it says conda was not found: open **Anaconda Prompt**, then

```
conda activate cv_env
cd C:\AeroSentry
setup.bat
```

Is your environment named differently? Run `set AERO_CONDA_ENV=yourname` first.

## 4. Database (SQL Server)

Setup looks for the SQL Server installed on the laptop and writes a **Windows sign-in** connection (no password):

```
Server=localhost\\SQLEXPRESS;Database=AeroSentry;Trusted_Connection=True;TrustServerCertificate=True
```

Double-click **`db.bat`**. It creates the database `AeroSentry` and its tables. It starts **empty**: register a new
account in the web app.

If it cannot connect, change only `DefaultConnection` in `appsettings.Local.json`. In JSON a backslash is written twice.

| Your SQL Server | `Server=` part |
|---|---|
| Express | `localhost\\SQLEXPRESS` |
| Developer / default instance | `localhost` |
| Another named instance | `localhost\\NAME` |
| In Docker, with the `sa` user | `localhost,1433` and replace `Trusted_Connection=True` with `User Id=sa;Password=<yours>` (never commit it) |

Check in **Services** that "SQL Server (...)" is running. To see the tables, connect with SSMS to the same server name.

## 5. Run

Double-click **`start.bat`**. When it says "AeroSentry is running", open <http://localhost:5173>.
Keep the window open. Press **Ctrl+C** to stop everything (do this before closing the window).

**Watch the speed.** While a wall is on, the window prints lines like `sent 5.0/s`. It should stay near 5.
The model looks at the last 60 pictures: when the laptop is slow, those cover a much longer time, one alarm can
stay on across several events, and later climbs get **no new alert**. In a test here at under 2 pictures a second,
the recorded demo made 1 alert; at 5 a second it made 8. If it is low: plug in the charger, use the "best
performance" power mode, and close other programs.

The first start is slower. If Windows Firewall asks, allow access on **private** networks.

Order inside the web app: register, add a property, add the camera, add the wall, mark it (Grab frame),
make cells, add a laser grid and map the wall, then switch on Automatic response.

**Phone camera (IP Webcam app):** laptop and phone on the same Wi-Fi. Use the `/video` address
(host = the phone's IP, port = 8080, path = `/video`). In our tests it had less delay than `.sdp`.
Mark the wall again if the camera moves or its resolution changes.

## Demo with recorded footage

Double-click **`demo.bat`** (do not run `start.bat` at the same time). It runs the whole system with **recorded test
videos** as the camera. The window shows the demo account's sign-in (also saved in `local\demo-login.txt`).
Open "Live detection". Say clearly that this is recorded footage: it is not a live climbing test.

## Check it (do this on every new laptop)

1. **Detection:** run `start.bat`, then double-click **`check.bat`** in a second window. It replays the test videos and
   prints: climbs detected, false alarms, which videos differ from the reference, and the speed.
   Do not have a camera wall switched on while it runs. For a shorter run: `check.bat --quick`.
   - Detection is only comparable if the speed line stays **under 200 ms** a picture.
2. **App:** register, add a camera, mark a wall, get an alert, open the incident, enroll one face.
3. **Offline:** after everything worked once, turn the internet off (keep the local Wi-Fi), restart the laptop,
   run `start.bat` and repeat step 2. Do this **before** the demo day.

## Before a live climbing test

`camera-check.bat PHONE_IP:8080 "your wall name"` compares the camera view with the training videos
(one person standing beside the wall). It does not check that a wall is safe. Use a solid wall, have a
helper beside the climber, and never climb a vehicle or furniture.

## Known limits

- The model runs on the **processor (CPU)** on Windows, even with an NVIDIA card.
- The detector can see a **person where there is none**. We saw a parked motorbike detected as a person, with
  alarms. Keep such objects out of view. A backend safeguard for this is **not built yet**.
- One alarm stays "on" until the model's score falls again; no second alert is made while it is on.
- The **drone** is not built. Face matching has no liveness check (a video of a person could pass).

## If something fails

Each service writes a log in `logs\`.

| Message | What to do |
|---|---|
| "... was not found" | install it, then open a **new** window |
| "ports are already in use" | AeroSentry is already running: stop it, or restart the laptop |
| `db.bat` cannot connect | step 4 |
| backend ended while starting | read `logs\backend.log`; usually the database is not running or the text is wrong |
| model ended while starting | read `logs\model.log`; check the Visual C++ Redistributable, and that `setup.bat` finished in `cv_env` |
| `.sdp` camera shows no video | read `logs\media-server.log` |

## Keep private

Never share or commit `appsettings.Local.json`, the `local\` folder (it can hold camera logins) or `logs\`.
`.gitignore` in this folder already excludes them.
