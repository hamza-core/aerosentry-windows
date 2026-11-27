"""Makes (once) a demo account with one ready wall that matches the recorded footage, then switches that wall on.
   demo_setup.py <api address> <camera port>          set up and switch on
   demo_setup.py <api address> <camera port> stop     switch off
The demo account's password is made on THIS computer and saved in local/demo-login.txt (no password is shipped)."""
import json, secrets, sys
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parent.parent
B = sys.argv[1]; CAMERA_PORT = int(sys.argv[2]); STOP = len(sys.argv) > 3
EMAIL = "demo@aerosentry.local"; LOGIN_FILE = ROOT / "local" / "demo-login.txt"
LOGIN_FILE.parent.mkdir(exist_ok=True)
if LOGIN_FILE.exists():
    PASSWORD = LOGIN_FILE.read_text(encoding="utf-8").split()[-1]
else:
    PASSWORD = "Demo-" + secrets.token_hex(6) + "9a"
    LOGIN_FILE.write_text("email    %s\npassword %s\n" % (EMAIL, PASSWORD), encoding="utf-8")
s = requests.Session()


def call(method, path, **kw):
    r = s.request(method, B + path, timeout=60, **kw)
    if not r.ok:
        raise SystemExit("demo setup failed: %s %s -> %s %s" % (method, path, r.status_code, r.text[:300]))
    return r.json() if r.content else None


s.post(B + "/auth/register", json={"fullName": "AeroSentry Demo", "email": EMAIL, "password": PASSWORD, "phoneNumber": "0"}, timeout=60)   # fine if it exists
login = s.post(B + "/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=60)
if not login.ok:
    raise SystemExit("cannot sign in as %s: the database has this account with another password than local/demo-login.txt" % EMAIL)
s.headers["Authorization"] = "Bearer " + login.json()["accessToken"]
prop = next((p for p in call("GET", "/properties/list") if p["name"] == "Demo Yard"), None) or call("POST", "/properties/create", json={"name": "Demo Yard", "address": "Recorded footage"})
P = prop["id"]
walls = call("GET", "/walls/list?propertyId=" + P)
if STOP:
    for w in walls:
        if w["detectionEnabled"]:
            call("POST", "/detection/stop?propertyId=%s&wallId=%s" % (P, w["id"]))
    print("demo wall switched off")
    raise SystemExit(0)
camera = {"name": "Recorded footage", "sourceType": "MobileApp", "host": "127.0.0.1", "port": CAMERA_PORT, "streamPath": "/video"}
wall = next((w for w in walls if w["name"] == "Demo wall"), None)
if wall is None:
    cam = next((c for c in call("GET", "/cameras/list?propertyId=" + P) if c["name"] == "Recorded footage"), None) or call("POST", "/cameras/create?propertyId=" + P, json=camera)
    grid = next(iter(call("GET", "/laser-grids/list?propertyId=" + P)), None) or call("POST", "/laser-grids/create?propertyId=" + P, json={"name": "Demo grid", "rows": 4, "columns": 4, "squareSizeMeters": 2})
    a = json.loads((ROOT / "tests" / "demo" / "wall.json").read_text(encoding="utf-8"))
    lines = {"name": "Demo wall", "cameraId": cam["id"], "frameWidth": 1920, "frameHeight": 1080, "wallTopPoints": a["wall_top_points"], "wallBottomPoints": a["wall_bottom_points"]}
    wall = call("POST", "/walls/create?propertyId=" + P, json=lines)
    cell = lambda label, x, y: {"label": label, "lengthMeters": 5, "topLeft": [x, 0.50], "bottomLeft": [x, 0.80], "topRight": [y, 0.50], "bottomRight": [y, 0.80]}
    call("PUT", "/walls/save-cells?propertyId=%s&wallId=%s" % (P, wall["id"]), json=[cell("A1", 0.05, 0.50), cell("A2", 0.50, 0.95)])
    call("PUT", "/walls/update?propertyId=%s&wallId=%s" % (P, wall["id"]), json=dict(lines, laserGridId=grid["id"], cameraGridRow=3, cameraGridCol=0))
    for i, c in enumerate(call("GET", "/walls/get?propertyId=%s&wallId=%s" % (P, wall["id"]))["cells"]):
        call("PUT", "/walls/set-cell-route?propertyId=%s&wallId=%s&cellId=%s" % (P, wall["id"], c["id"]), json=[{"row": 1, "col": i}])
call("POST", "/detection/start?propertyId=%s&wallId=%s&threshold=0.85" % (P, wall["id"]))
print("demo wall is ready and switched on")
print("SIGN IN to the web app with:\n" + LOGIN_FILE.read_text(encoding="utf-8"))
print('then open "Live detection". The first climb comes about 15 seconds after the worker starts.')
