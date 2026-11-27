"""Does detection behave on THIS computer like on the development computer? Replays the test videos (every 5th frame, alarm
level 0.50) through the running model, compares each video's result with tests/reference.json, and measures the speed.
   check_detection.py <model live address>           all videos (can take a long time on a slow computer)
   check_detection.py <model live address> --quick   every 5th video"""
import json, sys, time
from pathlib import Path
import cv2
import os
import requests
from videos import clip_dir

TESTS = Path(__file__).resolve().parent.parent / "tests"


def points(raw):
    return [{"x": p[0], "y": p[1]} if isinstance(p, (list, tuple)) else {"x": p["x"], "y": p["y"]} for p in raw]


def replay(api, label, clip):
    a = json.loads((TESTS / "walls" / label / (clip + ".json")).read_text(encoding="utf-8"))
    wall = {"wall_top_points": points(a["wall_top_points"]), "wall_bottom_points": points(a["wall_bottom_points"]), "frame_width": a["frame_width"], "frame_height": a["frame_height"]}
    r = requests.post(api + "/start", data={"boundaries": json.dumps(wall), "threshold": 0.5}, timeout=120); r.raise_for_status(); sid = r.json()["session_id"]
    video = cv2.VideoCapture(str(clip_dir(os.environ["AERO_VIDEOS"], label) / (clip + ".mp4"))); fps = video.get(cv2.CAP_PROP_FPS) or 25.0
    if not video.isOpened():
        raise SystemExit("cannot open the %s video %s.mp4 in your videos folder" % (label, clip))
    i = 0; alarm = False; times = []
    while True:
        ok, frame = video.read()
        if not ok:
            break
        if i % 5 == 0:
            jpg = cv2.imencode(".jpg", frame)[1].tobytes(); started = time.time()
            reply = requests.post(api + "/frame", data={"session_id": sid, "frame_index": i, "timestamp_seconds": i / fps}, files={"frame": ("f.jpg", jpg, "image/jpeg")}, timeout=300)
            reply.raise_for_status(); times.append(time.time() - started)
            alarm = alarm or bool(reply.json()["alarm_raised"])
        i += 1
    requests.post(api + "/stop", data={"session_id": sid}, timeout=120)
    return alarm, times


def summary(rows, key):
    climbs = [r for r in rows if r["label"] == "crossing"]; normal = [r for r in rows if r["label"] == "normal"]
    return "climbs detected %d of %d | normal videos with a false alarm %d of %d" % (sum(r[key] for r in climbs), len(climbs), sum(r[key] for r in normal), len(normal))


if __name__ == "__main__":
    api = sys.argv[1]
    reference = json.loads((TESTS / "reference.json").read_text(encoding="utf-8"))
    todo = reference["clips"][::5] if "--quick" in sys.argv else reference["clips"]
    rows = []; times = []
    for n, item in enumerate(todo, 1):
        alarm, t = replay(api, item["label"], item["clip"])
        rows.append({"label": item["label"], "clip": item["clip"], "here": alarm, "reference": item["alarm"]}); times += t
        if n % 10 == 0 or n == len(todo):
            print("%d of %d videos done, %d remaining" % (n, len(todo), len(todo) - n), flush=True)
    different = [r for r in rows if r["here"] != r["reference"]]
    times.sort(); middle = times[len(times) // 2] * 1000; slow = times[int(len(times) * 0.95)] * 1000
    print("\nreference (%s):\n   %s" % (reference["made_on"], summary(rows, "reference")))
    print("this computer:\n   %s" % summary(rows, "here"))
    print("videos with a different result: %d %s" % (len(different), ["%s %s" % (r["label"], r["clip"]) for r in different]))
    print("speed: middle %.0f ms for one picture, 95%% under %.0f ms (the camera worker asks for 5 pictures a second: 200 ms each at most)" % (middle, slow))
    if middle > 200:
        print("TOO SLOW for 5 pictures a second: live detection will behave differently from these tests.")
