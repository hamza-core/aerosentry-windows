"""AeroSentry: set up and run the whole project on one computer.

    start    THE ONE COMMAND: setup on first use, database update, then everything. Ctrl+C stops everything.
    run X    one service by itself in this window: model, backend, media, face, web or worker
    setup    once, inside the conda environment cv_env: missing Python packages, face model, video server,
             web and backend packages, settings file (SQL Server connection + NEW random keys)
    db       once (and after a database change): create / update the database tables
    demo     run everything with RECORDED climbing footage as the camera (no phone, nobody climbing)
    check    replay the test videos through the running model and compare with the reference run

Only Python's standard library is used here, so this file runs before anything is installed.
On Windows use the .bat files next to it.
"""
import hashlib
import importlib.util
import io
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
API_DIR = ROOT / "backend" / "AeroSentry.Api"
SETTINGS = API_DIR / "appsettings.Local.json"          # made by "setup". Private: never share it, never commit it.
WEB = ROOT / "web-app"
LOGS = ROOT / "logs"
LOCAL = ROOT / "local"                                 # files that belong to THIS computer only
WINDOWS = os.name == "nt"
PY = sys.executable                                    # the Python of cv_env: the .bat files activate it first
EF = ROOT / "tools" / ("dotnet-ef.exe" if WINDOWS else "dotnet-ef")

# Ports. AERO_PORT_OFFSET moves all of them (for example to run a second copy for a test).
OFFSET = int(os.environ.get("AERO_PORT_OFFSET", "0"))
P = {name: port + OFFSET for name, port in
     {"model": 8010, "backend": 5078, "face": 8020, "web": 5173, "rtsp": 8554, "hls": 8888, "webrtc": 8889, "webrtc_media": 8189, "camera": 8099}.items()}
URL = {name: "http://localhost:%d" % P[name] for name in ("model", "backend", "face", "web", "hls")}


def say(text):
    print(text, flush=True)


def stop_with(text):
    raise SystemExit("\nSTOPPED: " + text)


def run(command, cwd=ROOT, env=None):
    say("> " + " ".join(str(c) for c in command))
    if subprocess.run([str(c) for c in command], cwd=str(cwd), env=env).returncode != 0:
        stop_with("the command above failed. Read the lines above it.")


def tool(name):
    path = shutil.which(name)
    if not path:
        stop_with("'%s' was not found. Install it (see README.md), close this window, open a new one." % name)
    return path


# ------------------------------------------------------------------ setup
def sql_server_name():
    """The SQL Server installed on this Windows computer, as a connection text names it. SQL Express if unsure."""
    if WINDOWS:
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL", 0,
                                winreg.KEY_READ | winreg.KEY_WOW64_64KEY) as key:
                names = [winreg.EnumValue(key, i)[0] for i in range(winreg.QueryInfoKey(key)[1])]
            if names:
                name = "SQLEXPRESS" if "SQLEXPRESS" in names else ("MSSQLSERVER" if "MSSQLSERVER" in names else names[0])
                say("SQL Server found on this computer: %s" % ", ".join(names))
                return "localhost" if name == "MSSQLSERVER" else "localhost\\" + name
        except OSError:
            pass
        say("No installed SQL Server was found in the registry; assuming SQL Server Express.")
    return "localhost\\SQLEXPRESS"


def connection_text(server):
    # Windows sign-in: no user name and no password in the file
    return "Server=%s;Database=AeroSentry;Trusted_Connection=True;TrustServerCertificate=True" % server


def make_settings():
    if SETTINGS.exists():
        say("Settings file already exists, left as it is: %s" % SETTINGS)
        return
    data = {
        "ConnectionStrings": {"DefaultConnection": connection_text(sql_server_name())},
        "Jwt": {"Key": secrets.token_urlsafe(48)},          # made on THIS computer
        "Worker": {"ApiKey": secrets.token_urlsafe(32)},    # made on THIS computer
    }
    SETTINGS.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    say("Made a settings file with new random keys: %s" % SETTINGS)
    say("Database connection: %s" % data["ConnectionStrings"]["DefaultConnection"])


# package name -> the name Python imports (used to see whether it is already there, whatever variant is installed)
IMPORT_NAMES = {"opencv-python": "cv2", "pillow": "PIL", "python-multipart": "multipart", "python-dotenv": "dotenv",
                "scikit-image": "skimage", "scikit-learn": "sklearn", "pydantic-settings": "pydantic_settings"}


def tested_versions():
    wanted = {}
    for line in (ROOT / "python" / "requirements.txt").read_text(encoding="utf-8").splitlines():
        line = line.split("#")[0].strip()
        if "==" in line:
            name, version = line.split("==")
            wanted[name.strip()] = version.strip()
    return wanted


def installed_version(name):
    from importlib import metadata
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return None


def python_packages():
    """cv_env already has most packages: install ONLY the missing ones, and never change torch or numpy."""
    wanted = tested_versions()
    missing = [n for n in wanted if importlib.util.find_spec(IMPORT_NAMES.get(n, n.replace("-", "_"))) is None]
    say("already installed: %d of %d" % (len(wanted) - len(missing), len(wanted)))
    if missing:
        say("installing the missing ones: %s" % ", ".join(missing))
        LOCAL.mkdir(exist_ok=True)
        keep = LOCAL / "keep-versions.txt"                  # pip may not replace these
        keep.write_text("".join("%s==%s\n" % (n, installed_version(n).split("+")[0]) for n in ("torch", "torchvision", "numpy")
                                if installed_version(n)), encoding="utf-8")
        pip = [PY, "-m", "pip", "install", "-c", str(keep)]
        for name in missing:
            if subprocess.run(pip + ["%s==%s" % (name, wanted[name])]).returncode != 0:
                say("the tested version of %s does not fit this environment: installing one that does" % name)
                run(pip + [name])
    run([PY, "-c", "import torch, numpy, cv2, ultralytics, insightface, onnxruntime, fastapi, uvicorn, multipart, pydantic_settings, dotenv, sklearn, scipy, requests; "
                   "torch.from_numpy(numpy.zeros(2)).numpy(); print('Python packages load correctly')"])
    different = ["%s %s (tested %s)" % (n, installed_version(n), v) for n, v in wanted.items()
                 if installed_version(n) and installed_version(n).split("+")[0] != v]
    if different:
        say("\nNOTE: some versions differ from the tested ones. They were left as they are:\n  " + "\n  ".join(different)
            + "\nRun check.bat (see README.md) to see that detection gives the same results.")


def face_model():
    target = Path.home() / ".insightface" / "models" / "buffalo_l"       # where InsightFace looks for it
    needed = ["det_10g.onnx", "w600k_r50.onnx", "1k3d68.onnx"]
    for source in sorted((ROOT / "face-model").glob("*.onnx")):          # optional copy brought along by hand
        target.mkdir(parents=True, exist_ok=True)
        if not (target / source.name).exists():
            shutil.copy2(source, target / source.name)
    if not all((target / n).exists() for n in needed):
        say("downloading the face model (about 280 MB, once) from InsightFace ...")
        run([PY, "-c", "from insightface.utils import ensure_available; ensure_available('models', 'buffalo_l')"])
    lost = [n for n in needed if not (target / n).exists()]
    if lost:
        stop_with("face model files are missing: %s. Delete the folder %s and run setup again." % (", ".join(lost), target))
    say("Face model is in %s" % target)


MEDIA_URL = "https://github.com/bluenviron/mediamtx/releases/download/v1.21.4/mediamtx_v1.21.4_windows_amd64.zip"
MEDIA_SHA256 = "835645b2700ffce4d2b6cb04bfa0aadce95335da6dfc0d7c2114e6da585734f8"


def media_server(force=False):
    target = ROOT / "media" / "mediamtx.exe"
    if target.exists() or not (WINDOWS or force):
        say("video server: %s" % ("already there" if target.exists() else "Windows only, skipped"))
        return
    say("downloading the video server MediaMTX 1.21.4 ...")
    with urllib.request.urlopen(MEDIA_URL, timeout=300) as reply:
        data = reply.read()
    if hashlib.sha256(data).hexdigest() != MEDIA_SHA256:
        stop_with("the downloaded video server does not match its published checksum. Nothing was installed.")
    target.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for name in ("mediamtx.exe", "LICENSE"):
            (target.parent / name).write_bytes(archive.read(name))
    say("video server ready (checksum matches)")


def setup():
    if sys.version_info < (3, 10):
        stop_with("Python 3.10 or newer is needed; cv_env has %d.%d." % sys.version_info[:2])
    if os.environ.get("CONDA_DEFAULT_ENV") != os.environ.get("AERO_CONDA_ENV", "cv_env"):
        say("NOTE: the active conda environment is '%s', not cv_env. Packages go into: %s" % (os.environ.get("CONDA_DEFAULT_ENV", "none"), PY))
    dotnet = tool("dotnet")
    sdks = subprocess.run([dotnet, "--list-sdks"], capture_output=True, text=True).stdout.splitlines()
    if not any(line.startswith("11.") for line in sdks):
        stop_with("the .NET 11 SDK is not installed.")
    npm = tool("npm")
    tool("node")

    say("\n[1/6] Python packages (in %s)" % PY)
    python_packages()
    say("\n[2/6] Face recognition model")
    face_model()
    say("\n[3/6] Video server")
    media_server()
    say("\n[4/6] Web app packages (needs internet the first time)")
    run([npm, "ci"], cwd=WEB)
    say("\n[5/6] Backend packages and database tool (needs internet the first time)")
    run([dotnet, "restore"], cwd=API_DIR)
    if not EF.exists():
        run([dotnet, "tool", "install", "dotnet-ef", "--version", "11.0.0", "--tool-path", EF.parent])
    run([dotnet, "build", "--no-restore"], cwd=API_DIR)
    say("\n[6/6] Settings and database connection")
    make_settings()
    say("\nSetup finished. start.bat creates the database and runs everything.\n"
        "If SQL Server cannot be reached, change DefaultConnection in\n  %s" % SETTINGS)


def read_settings():
    if not SETTINGS.exists():
        stop_with("run setup first (the settings file is missing).")
    try:
        data = json.loads(SETTINGS.read_text(encoding="utf-8-sig"))
    except json.JSONDecodeError as error:
        stop_with("%s is not valid JSON (line %d). In JSON a backslash is written twice: localhost\\\\SQLEXPRESS" % (SETTINGS, error.lineno))
    if "CHANGE-ME" in data["ConnectionStrings"]["DefaultConnection"]:
        stop_with("open %s and put your database connection text in DefaultConnection." % SETTINGS)
    return data


def database():
    read_settings()
    tool("dotnet")
    if not EF.exists():
        stop_with("run setup first (the database tool is missing).")
    command = [str(EF), "database", "update"]
    say("> " + " ".join(command))
    if subprocess.run(command, cwd=str(API_DIR), env=dict(os.environ, ASPNETCORE_ENVIRONMENT="Development")).returncode != 0:
        stop_with("the database step failed. Check that SQL Server is running, and that DefaultConnection in\n  %s\n"
                  "names it (README.md, 'Database')." % SETTINGS)
    say("\nThe database is ready.")


def need_test_videos():
    """The team's test videos (dataset/test). The place is asked once and remembered in local/videos-folder.txt."""
    sys.path.insert(0, str(ROOT / "scripts"))
    from videos import looks_right
    memory = LOCAL / "videos-folder.txt"
    known = [os.environ.get("AERO_VIDEOS", ""), memory.read_text(encoding="utf-8").strip() if memory.exists() else ""]
    folder = next((f for f in known if f and looks_right(f)), None)
    if folder is None:
        say('\nThe test videos are not in the repository. Where is YOUR dataset\\test folder?\n'
            '(the folder that contains "Wall crossing" and "Normal class")')
        try:
            folder = input("paste the path here: ").strip().strip('"')
        except EOFError:
            folder = ""
        if not folder or not looks_right(folder):
            stop_with('that folder does not contain "Wall crossing" (with 43.mp4) and "Normal class".')
        LOCAL.mkdir(exist_ok=True)
        memory.write_text(folder + "\n", encoding="utf-8")
    os.environ["AERO_VIDEOS"] = str(Path(folder).resolve())


# ------------------------------------------------------------------ running
def port_busy(port):
    for host in ("127.0.0.1", "::1"):
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            pass
    return False


def answers(url, must_contain=""):
    try:
        with urllib.request.urlopen(url, timeout=3) as reply:
            return must_contain in reply.read().decode("utf-8", "ignore")
    except urllib.error.HTTPError:
        return not must_contain            # any answer means the server is up
    except Exception:
        return False


class Services:
    def __init__(self):
        self.running = []
        LOGS.mkdir(exist_ok=True)

    def start(self, name, command, cwd, env, ready, seconds, show=False):
        say("starting %-14s ..." % name)
        log_name = "logs/%s.log" % name.replace(" ", "-")
        log = None if show else open(ROOT / log_name, "w", encoding="utf-8")
        options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if WINDOWS else {"start_new_session": True}
        process = subprocess.Popen([str(c) for c in command], cwd=str(cwd), env=env, stdout=log, stderr=subprocess.STDOUT if log else None, **options)
        self.running.append((name, process))
        deadline = time.time() + seconds
        while time.time() < deadline:
            if process.poll() is not None:
                stop_with("%s ended while starting. See %s" % (name, log_name))
            if ready is None or ready():
                say("         %-14s ready" % name)
                return
            time.sleep(1)
        stop_with("%s did not answer within %d seconds. See %s" % (name, seconds, log_name))

    def stop_all(self):
        for name, process in reversed(self.running):
            if process.poll() is None:
                if WINDOWS:
                    subprocess.run(["taskkill", "/T", "/F", "/PID", str(process.pid)], capture_output=True)
                else:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    process.kill()
        self.running = []


# The services, in the order they start. "start" runs them all; "run <name>" runs one by itself.
SERVICES = ["model", "backend", "media", "face", "web", "worker"]
PORTS_OF = {"model": ["model"], "backend": ["backend"], "media": ["rtsp", "hls", "webrtc"], "face": ["face"], "web": ["web"], "worker": []}


def media_program():
    return Path(os.environ.get("AERO_MEDIAMTX", str(ROOT / "media" / ("mediamtx.exe" if WINDOWS else "mediamtx"))))


def media_config():
    """The video server's camera list. The backend writes the cameras into it (it can hold camera logins)."""
    path = LOCAL / "mediamtx.yml"
    LOCAL.mkdir(exist_ok=True)
    if not path.exists():
        path.write_text("paths:\n  {}\n", encoding="utf-8")
    return path


def base_env():
    return dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONUNBUFFERED="1", YOLO_OFFLINE="True", YOLO_AUTOINSTALL="False")


def service(name):
    """How to start ONE service: its title, command, folder, settings, how to see it is ready, and how long to wait."""
    base = base_env()
    if name == "model":
        return dict(name="model", command=[PY, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", P["model"]],
                    cwd=ROOT / "model" / "backend", env=base, ready=lambda: answers(URL["model"] + "/api/health", "healthy"), seconds=180)
    if name == "backend":
        env = dict(base, ASPNETCORE_ENVIRONMENT="Development", Ml__BaseUrl=URL["model"], Face__BaseUrl=URL["face"],
                   Media__MtxManageConfig="true", Media__MtxConfigPath=str(media_config()), Media__HlsBase=URL["hls"],
                   Media__RtspBase="rtsp://localhost:%d" % P["rtsp"], Cors__Origins__0=URL["web"], Cors__Origins__1=URL["web"])
        return dict(name="backend", command=[tool("dotnet"), "run", "--no-launch-profile", "--urls", URL["backend"]],
                    cwd=API_DIR, env=env, ready=lambda: port_busy(P["backend"]), seconds=300)
    if name == "media":
        env = dict(base, MTX_RTSPADDRESS="127.0.0.1:%d" % P["rtsp"], MTX_HLSADDRESS="127.0.0.1:%d" % P["hls"], MTX_RTSPTRANSPORTS="tcp",
                   MTX_RTMP="no", MTX_SRT="no", MTX_MOQ="no", MTX_HLSVARIANT="fmp4", MTX_WEBRTC="yes",
                   MTX_WEBRTCADDRESS="127.0.0.1:%d" % P["webrtc"], MTX_WEBRTCLOCALUDPADDRESS="127.0.0.1:%d" % P["webrtc_media"],
                   MTX_WEBRTCLOCALTCPADDRESS="127.0.0.1:%d" % P["webrtc_media"], MTX_WEBRTCIPSFROMINTERFACES="no",
                   MTX_WEBRTCADDITIONALHOSTS="127.0.0.1", MTX_WEBRTCALLOWORIGINS=URL["web"])
        return dict(name="media server", command=[media_program(), media_config()], cwd=LOCAL, env=env,
                    ready=lambda: port_busy(P["hls"]), seconds=30)
    if name == "face":
        return dict(name="face service", command=[PY, "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", P["face"]],
                    cwd=ROOT / "backend" / "face-service", env=base, ready=lambda: answers(URL["face"] + "/api/health", "healthy"), seconds=180)
    if name == "web":
        env = dict(base, VITE_API_URL=URL["backend"], VITE_WEBRTC_URL="http://localhost:%d" % P["webrtc"])
        return dict(name="web app", command=[tool("node"), "node_modules/vite/bin/vite.js", "--port", P["web"], "--strictPort"],
                    cwd=WEB, env=env, ready=lambda: port_busy(P["web"]), seconds=90)
    if name == "worker":
        env = dict(base, WORKER_KEY=read_settings()["Worker"]["ApiKey"])
        return dict(name="camera worker", command=[PY, ROOT / "backend" / "ingest-worker" / "worker.py", "--sample-rate", "5", "--backend", URL["backend"]],
                    cwd=ROOT, env=env, ready=None, seconds=5)
    raise ValueError(name)


def is_set_up():
    return SETTINGS.exists() and EF.exists() and (WEB / "node_modules").is_dir()


def check_ready_to_run(port_names):
    read_settings()
    if not is_set_up() or importlib.util.find_spec("ultralytics") is None:
        stop_with("run setup first (and check that cv_env is the active environment).")
    check_ports(port_names)


def check_ports(port_names):
    busy = [str(P[n]) for n in port_names if port_busy(P[n])]
    if busy:
        stop_with("these ports are already in use: %s. Is it already running? Close it (or restart the computer)." % ", ".join(busy))


def all_ports(demo):
    return [port for name in SERVICES for port in PORTS_OF[name]] + (["camera"] if demo else [])


def start_services(services, demo=False):
    """Everything except the camera worker, which comes last because it prints in this window."""
    check_ready_to_run(all_ports(demo))
    for name in SERVICES[:-1]:
        if name == "media" and not media_program().exists():
            say("media server not found: .sdp / RTSP cameras will not show. /video cameras still work.")
            continue
        services.start(**service(name))


def wait_while_running(services):
    while True:
        for name, process in services.running:
            if process.poll() is not None:
                stop_with("%s stopped. See its messages above or in the logs folder." % name)
        time.sleep(2)


def run_one(name):
    check_ready_to_run(PORTS_OF[name])
    if name == "media" and not media_program().exists():
        stop_with("the video server is missing: run setup.bat.")
    if name == "worker" and not port_busy(P["backend"]):
        say("NOTE: the backend is not running yet. The worker keeps asking until it is.")
    services = Services()
    try:
        say("This window shows this service's own messages. Press Ctrl+C to stop it.")
        services.start(**service(name), show=True)
        wait_while_running(services)
    except KeyboardInterrupt:
        say("\nstopping ...")
    finally:
        if services.running:
            services.stop_all()
            say("%s is stopped." % name)


def start_everything(demo=False):
    """The one command: sets up on the first use, brings the database up to date, then runs the whole system."""
    check_ports(all_ports(demo))                 # before anything else: a running copy would block the build
    if demo:
        need_test_videos()
    if not is_set_up():
        say("First use on this computer: running setup (needs internet) ...")
        setup()
    database()
    run_all(demo)


def run_all(demo=False):
    services = Services()
    demo_command = [str(PY), str(ROOT / "scripts" / "demo_setup.py"), URL["backend"] + "/api/v1", str(P["camera"])]
    demo_ready = False
    try:
        start_services(services, demo)
        base = base_env()
        if demo:
            say("preparing the recorded camera (about a minute) ...")
            services.start("demo camera", [PY, ROOT / "scripts" / "fake_camera.py", P["camera"]], ROOT, base, lambda: port_busy(P["camera"]), 400)
            run(demo_command, env=base)
            demo_ready = True
        services.start(**service("worker"), show=True)
        say("\n==============================================================\n  AeroSentry is running.  Open  %s  in Chrome or Edge.\n"
            "  Keep this window open. Press Ctrl+C to stop everything.\n  Logs of the other services are in the 'logs' folder.\n"
            "  While a wall is on, the worker prints its speed: it should show about 'sent 5.0/s'.\n"
            "==============================================================\n" % URL["web"])
        wait_while_running(services)
    except KeyboardInterrupt:
        say("\nstopping ...")
    finally:
        if demo_ready and port_busy(P["backend"]):
            subprocess.run(demo_command + ["stop"])
        if services.running:
            services.stop_all()
            say("everything is stopped.")


def check():
    need_test_videos()
    if not answers(URL["model"] + "/api/health", "healthy"):
        stop_with("the model is not running. Run start.bat or services\\model.bat first (in another window).")
    run([PY, ROOT / "scripts" / "check_detection.py", URL["model"] + "/api/live"] + sys.argv[2:])


if __name__ == "__main__":
    actions = {"setup": setup, "db": database, "start": start_everything, "demo": lambda: start_everything(demo=True),
               "check": check, "run": lambda: run_one(sys.argv[2])}
    usage = "use:  python aerosentry.py  setup | db | start | demo | check | run <%s>" % " | ".join(SERVICES)
    if len(sys.argv) < 2 or sys.argv[1] not in actions or (sys.argv[1] == "run" and (len(sys.argv) != 3 or sys.argv[2] not in SERVICES)):
        stop_with(usage)

    def interrupted(*_):                      # closing the window / kill: stop the services too
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupted)
    actions[sys.argv[1]]()
