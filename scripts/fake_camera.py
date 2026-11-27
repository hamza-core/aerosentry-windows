"""A pretend phone camera: serves http://127.0.0.1:<port>/video like IP Webcam (MJPEG), playing RECORDED test footage at
25 pictures a second: 15 s of the empty scene, one climb, 15 s empty, ... (4 climbs, played twice), then the empty scene.
The timeline starts again each time a reader connects."""
import sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import cv2
import numpy as np
import os
from videos import clip_dir

CLIP_DIR = clip_dir(os.environ["AERO_VIDEOS"], "crossing")
CLIPS = ["43", "46", "57", "64"]        # the same camera view
EMPTY_FROM = "57"; FPS = 25; SIZE = (1920, 1080); GAP = 15


def read(clip):
    video = cv2.VideoCapture(str(CLIP_DIR / (clip + ".mp4"))); rate = video.get(cv2.CAP_PROP_FPS) or 25.0; frames = []
    while True:
        ok, frame = video.read()
        if not ok:
            break
        frames.append(frame)
    if not frames:
        raise SystemExit("cannot read clip " + clip)
    count = round(len(frames) / rate * FPS)                       # keep the clip's real speed
    return [frames[min(int(i * rate / FPS), len(frames) - 1)] for i in range(count)]


def jpg(frame):
    return cv2.imencode(".jpg", cv2.resize(frame, SIZE), [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tobytes()


def build():
    empty = jpg(np.median(np.stack(read(EMPTY_FROM)[::6]), axis=0).astype("uint8"))     # the scene with nobody in it
    pictures = {clip: [jpg(f) for f in read(clip)] for clip in CLIPS}
    frames = []
    for _ in range(2):
        for clip in CLIPS:
            frames += [empty] * (GAP * FPS) + pictures[clip]
    return frames + [empty] * (GAP * FPS), empty


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    frames, empty = build()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            if self.path != "/video":
                self.send_response(404); self.end_headers(); return
            self.send_response(200); self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame"); self.end_headers()
            start = time.time(); i = 0
            try:
                while True:
                    now = int((time.time() - start) * FPS)
                    if now < i:
                        time.sleep(max(0.0, i / FPS - (time.time() - start))); continue
                    i = max(i, now)                               # a slow reader gets the CURRENT picture, like a real camera
                    picture = frames[i] if i < len(frames) else empty
                    self.wfile.write(b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n" % len(picture) + picture + b"\r\n"); i += 1
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

    print("camera ready: %d pictures" % len(frames), flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
