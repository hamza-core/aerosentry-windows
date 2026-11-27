"""BEFORE anyone climbs: is the camera placed like the model's training videos? AeroSentry must be running (start.bat).
  1. In the web app add the camera (/video) and mark the wall (top edge, bottom edge).
  2. ONE person stands upright on the ground right beside the wall, whole body visible.
  3. camera-check.bat PHONE_IP:8080 "your wall name"     (it asks for your AeroSentry sign-in)
Passing does not promise a detection, and says nothing about whether a wall is SAFE to climb."""
import getpass, json, os, sys
import time
from pathlib import Path
import cv2
import numpy as np
import requests

OFFSET = int(os.environ.get("AERO_PORT_OFFSET", "0"))
API = "http://localhost:%d/api/v1" % (5078 + OFFSET); MODEL = "http://localhost:%d/api/live" % (8010 + OFFSET)
ROOT = Path(__file__).resolve().parent.parent
if len(sys.argv) != 3:
    raise SystemExit('usage: camera-check.bat PHONE_IP:8080 "wall name"')
address, name = sys.argv[1], sys.argv[2]
s = requests.Session()
email = os.environ.get("AERO_EMAIL") or input("AeroSentry email: ").strip()
password = os.environ.get("AERO_PASSWORD") or getpass.getpass("AeroSentry password: ")
r = s.post(API + "/auth/login", json={"email": email, "password": password}, timeout=60)
if not r.ok:
    raise SystemExit("sign-in failed")
s.headers["Authorization"] = "Bearer " + r.json()["accessToken"]
wall = None
for prop in s.get(API + "/properties/list", timeout=60).json():
    found = next((w for w in s.get(API + "/walls/list?propertyId=" + prop["id"], timeout=60).json() if w["name"] == name), None)
    if found:
        wall = s.get(API + "/walls/get?propertyId=%s&wallId=%s" % (prop["id"], found["id"]), timeout=60).json(); break
if not wall or not wall.get("wallTopPoints"):
    raise SystemExit('no marked wall named "%s": check the name in the web app (Perimeter)' % name)
fw, fh, top, bottom = wall["frameWidth"], wall["frameHeight"], wall["wallTopPoints"], wall["wallBottomPoints"]
q = lambda line: [{"x": x, "y": y} for x, y in line]
at = lambda line, x: float(np.interp(x, [p[0] for p in sorted(line)], [p[1] for p in sorted(line)]))
cap = cv2.VideoCapture("http://%s/video" % address); ok, frame = cap.read() if cap.isOpened() else (False, None)
if not ok:
    raise SystemExit("cannot read http://%s/video" % address)
h, w = frame.shape[:2]; problems = []; notes = []
if abs(w / h - fw / fh) > 0.02:
    problems.append("the camera now sends %dx%d but the wall was marked on %dx%d (another shape): MARK THE WALL AGAIN" % (w, h, fw, fh))
if w < 1280:
    notes.append("picture is %dx%d. Most training and test videos were sharper; try 1280x720, then mark the wall again" % (w, h))
brightness = float(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).mean())
if brightness < 60:
    notes.append("the picture is dark (brightness %.0f of 255): use daylight or more light" % brightness)
sid = requests.post(MODEL + "/start", data={"boundaries": json.dumps({"wall_top_points": q(top), "wall_bottom_points": q(bottom), "frame_width": fw, "frame_height": fh}), "threshold": 0.85}, timeout=60).json()["session_id"]
print("watching for 12 seconds: ONE person standing upright beside the wall...")
start = time.time(); next_time = start; seen = []; pictures = 0; last = frame
while time.time() - start < 12:
    ok, f = cap.read()
    if not ok:
        break
    if time.time() >= next_time:
        next_time += 0.4; last = f
        x = requests.post(MODEL + "/frame", data={"session_id": sid, "frame_index": pictures, "timestamp_seconds": time.time() - start}, files={"frame": ("f.jpg", cv2.imencode(".jpg", f)[1].tobytes(), "image/jpeg")}, timeout=60).json(); pictures += 1
        good = [p for p in x.get("people", []) if p["box"][0] < p["box"][2] and p["box"][1] < p["box"][3]]
        if good:
            seen.append((max(good, key=lambda p: p["confidence"])["box"], len(x["people"])))
requests.post(MODEL + "/stop", data={"session_id": sid}, timeout=30)
middle = (max(min(p[0] for p in top), min(p[0] for p in bottom)) + min(max(p[0] for p in top), max(p[0] for p in bottom))) / 2


def line(label, value, low, high, too_low, too_high):
    good = low <= value <= high
    print("  %-6s %-52s %.2f   (training, middle half: %.2f to %.2f)" % ("GOOD" if good else "ADJUST", label, value, low, high))
    if not good:
        problems.append(too_low if value < low else too_high)


print()
if not seen or len(seen) < pictures * 0.6:
    problems.append("a usable person was found in only %d of %d pictures: more light, whole body in view, not too small" % (len(seen), pictures))
if seen:
    boxes = np.array([b for b, _ in seen]); cx = float(np.median((boxes[:, 0] + boxes[:, 2]) / 2))
    person = float(np.median(boxes[:, 3] - boxes[:, 1])); wall_height = at(bottom, cx) - at(top, cx)
    line("wall height, as part of the picture's height", at(bottom, middle) - at(top, middle), 0.28, 0.42, "the wall looks too small: move the camera CLOSER", "the wall fills too much of the picture: move the camera FARTHER away")
    line("person's height, as part of the picture's height", person, 0.30, 0.47, "the person looks too small: move the camera closer", "the person looks too big: move the camera farther away")
    if wall_height > 0.03:
        line("person's height compared with the wall's height", person / wall_height, 0.84, 1.47, "the wall is tall compared with the person: check the lines", "the wall is low compared with the person: check the lines, or use a higher wall")
    if np.percentile(boxes[:, 1], 50) < 0.03:
        problems.append("the person's head touches the top of the picture")
    if np.percentile(boxes[:, 3], 50) > 0.985:
        problems.append("the person's feet are cut off at the bottom")
    if max(n for _, n in seen) > 1:
        notes.append("the model sometimes saw more than one person (it can mistake objects for people: check the view)")
picture = last.copy()
for pts, colour in ((top, (0, 255, 255)), (bottom, (0, 140, 255))):
    cv2.polylines(picture, [np.array([(int(x * w), int(y * h)) for x, y in pts])], False, colour, 3)
if seen:
    b = seen[-1][0]; cv2.rectangle(picture, (int(b[0] * w), int(b[1] * h)), (int(b[2] * w), int(b[3] * h)), (0, 255, 0), 2)
(ROOT / "local").mkdir(exist_ok=True); cv2.imwrite(str(ROOT / "local" / "camera-check.jpg"), picture)
for note in notes:
    print("  note: " + note)
print("\n" + ("THE VIEW LOOKS LIKE TRAINING. Picture saved: local/camera-check.jpg" if not problems else "ADJUST, then run this again:\n  - " + "\n  - ".join(problems)))
