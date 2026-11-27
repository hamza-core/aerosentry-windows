"""
AeroSentry ingest worker.

What it does, in one paragraph:
    Every few seconds it asks the backend "which walls must I watch?" (GET worker/get-jobs).
    For each wall it opens the camera stream (via the media server, or the camera directly), reads
    the video and keeps every 5th frame in REAL TIME (see below), and
    posts each kept frame to the backend (POST worker/send-frame). The backend calls the ML service,
    works out the wall cell and stores the alarm. This program never talks to the ML service itself.

Which frames are analysed: every 5th frame, as in training.
    The model was trained on frames 0, 5, 10, ... of each video (extract_every_5_frames.py: np.arange(0, total, 5)), and the
    ML service is configured the same way (frame_stride = 5). So by default the worker keeps frame 0, 5, 10, ... of the
    stream: the same frames the model was trained on, whatever the camera's frame rate. The consequence: a 25 fps camera
    gives 5 analysed frames per second (what most training videos gave), a 30 fps camera 6, a 15 fps phone only 3, a 60 fps
    camera 12. If a camera's rate is far from 25 fps and you want about 5 per second anyway, use --sample-rate 5: it chooses
    frames by TIME instead (see the options).

What the ML service can really do:
    In live mode it re-runs its whole trailing window (up to 60 frames) through the bidirectional LSTM on every frame.
    Measured on the development Mac: about 5.6 frames/s at first, falling to about 2-2.5 frames/s once the window is full.
    So the worker PACES itself: it measures how long a frame takes (backend + ML) and, when that is longer than the gap
    between two every-5th frames, widens the gap (every 6th, 7th, ... frame) so analyses never pile up. It logs a warning
    when it has to, because the model then sees frames further apart than in training.

Run (from this folder, in the environment that has opencv and requests):
    WORKER_KEY=<same value as Worker:ApiKey in appsettings.json> python worker.py

Everything is local-network only. No internet is needed.
"""

import argparse
import logging
import math
import os
import sys
import threading
import time

# Read RTSP over TCP and give up on a dead camera after 10 s. By default OpenCV tries UDP, which loses packets on Wi-Fi
# (measured with a phone: lost keyframes, broken frames). Must be set BEFORE opencv is imported. A value already set wins.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|stimeout;10000000")

import cv2
import requests

log = logging.getLogger("worker")

# Frames are spaced PACE_MARGIN x the measured time one frame takes (backend + ML), so a slightly slower answer does not
# collide with the next frame. Higher = more even spacing, lower rate.
PACE_MARGIN = 1.25


class FrameSampler:
    """Decides which frames of a stream are analysed. No video, no network: only numbers, so it can be tested alone.

    Count mode (the default): every `every`-th frame, indexes 0, every, 2*every, ... exactly like training. When analysing
    a frame (backend + ML) takes longer than the gap between two such frames, the gap is widened to the next whole number
    of frames that can be kept up, so analyses never pile up.

    Time mode (rate given): about `rate` frames per second of real time, whatever the camera's frame rate (the old way).
    """

    def __init__(self, every=5, rate=None):
        self.every = every
        self.rate = rate
        self._next_index = 0           # count mode: the index of the next frame to keep
        self._next_time = None         # time mode: the second at which the next frame must be kept

    def stride(self, camera_fps, round_trip):
        """Frames between two analysed frames right now."""
        stride = self.every
        if round_trip and camera_fps:
            stride = max(stride, math.ceil(PACE_MARGIN * round_trip * camera_fps))
        return stride

    def keep(self, index, t, camera_fps, round_trip):
        """index: 0 for the first frame of the stream. t: seconds since the stream started."""
        if self.rate is not None:
            if self._next_time is None:
                self._next_time = t
            if t < self._next_time:
                return False
            interval = max(1.0 / self.rate, PACE_MARGIN * (round_trip or 0.0))
            self._next_time += interval
            if t - self._next_time > 2 * interval:
                self._next_time = t + interval        # the stream stalled for a while: do not burst to catch up
            return True

        if index < self._next_index:
            return False
        self._next_index = index + self.stride(camera_fps, round_trip)
        return True


# ---------------------------------------------------------------------------
# One thread per wall: read the stream, keep every 5th frame, send them
# ---------------------------------------------------------------------------
class StreamWatcher(threading.Thread):
    def __init__(self, job, source, args):
        super().__init__(daemon=True, name="wall-" + job["wallName"])
        self.job = job
        self.name_ = job["wallName"]
        self.source = source
        self.args = args
        self.stop_event = threading.Event()
        self.finished = False          # a video FILE that reached its end (not restarted unless --loop)
        self._busy = threading.Lock()  # held while one frame is being sent
        self._preview_busy = threading.Lock()   # held while one preview picture is being uploaded
        self._preview_error_at = 0.0   # when a failed preview upload was last reported (do not flood the log)
        self.sent = 0
        self.dropped = 0
        self.alarms = 0
        self.round_trip = None         # smoothed seconds per frame (backend + ML), measured on every send
        self._first_reply = True       # the first answer of a stream is not counted: see _send

    def stop(self):
        self.stop_event.set()

    def run(self):
        is_file = os.path.exists(self.source)
        backoff = 2
        while not self.stop_event.is_set():
            cap = cv2.VideoCapture(self.source)
            if not cap.isOpened():
                log.warning("[%s] cannot open the stream, retrying in %ds", self.name_, backoff)
                self.stop_event.wait(backoff)
                backoff = min(backoff * 2, 30)
                continue

            backoff = 2
            file_fps = (cap.get(cv2.CAP_PROP_FPS) or 25.0) if is_file else None
            rate = choose_rate(self.source, self.args)
            sampler = FrameSampler(self.args.every, rate)
            self._first_reply = True          # a new stream: the ML service opens a new session on its first frame
            log.info("[%s] watching a %s, %s", self.name_, "file" if is_file else "live stream",
                     "keeping about %.1f frames per second" % rate if rate
                     else "analysing every %dth frame (frames 0, %d, %d, ...) as in training" % (self.args.every, self.args.every, 2 * self.args.every))

            frame_number = 0
            started = time.monotonic()
            camera_fps = file_fps             # a file's rate is known; a live camera's is measured below
            meter_start, meter_frames = time.monotonic(), 0
            seen = 0                          # frames the camera delivered since the last report
            sent_mark, dropped_mark = self.sent, self.dropped
            report_mark = time.monotonic()
            shape_checked = False
            warned_slow = False
            warned_ml = False

            while not self.stop_event.is_set():
                ok, frame = cap.read()
                if not ok:
                    break
                frame_number += 1
                seen += 1

                if is_file:
                    # A file is read as fast as the disk allows; slow it to real time like a camera.
                    t = frame_number / file_fps
                    time.sleep(max(0.0, started + t - time.monotonic()))
                else:
                    # A live camera: the moment the frame arrived (cap.read() waits for the next frame).
                    t = time.monotonic() - started

                if not shape_checked:
                    shape_checked = True
                    self._check_shape(frame)

                # A live camera: measure its real frame rate (about once a second), to know how long a gap of N frames is.
                if not is_file:
                    meter_frames += 1
                    elapsed = time.monotonic() - meter_start
                    if elapsed >= 1.0:
                        measured = meter_frames / elapsed
                        camera_fps = measured if camera_fps is None else 0.5 * camera_fps + 0.5 * measured
                        meter_start, meter_frames = time.monotonic(), 0

                index = frame_number - 1          # 0 for the first frame, like the frame numbers of the training videos
                if sampler.keep(index, t, camera_fps, self.round_trip):
                    # Analysis slower than the gap between two every-Nth frames: say so at once, not only in the report.
                    if sampler.rate is None and not warned_ml:
                        stride = sampler.stride(camera_fps, self.round_trip)
                        if stride > self.args.every:
                            log.warning("[%s] analysing a frame takes %.0f ms, so only every %dth frame can be kept up "
                                        "(the model was trained on every %dth). Detection works, but on frames further apart "
                                        "than in training. A faster ML machine removes this.", self.name_,
                                        self.round_trip * 1000, stride, self.args.every)
                            warned_ml = True
                    # Never let a slow answer pile frames up: if the last frame is still being sent, skip this one.
                    if self._busy.acquire(blocking=False):
                        jpeg = cv2.imencode(".jpg", frame)[1].tobytes()
                        timestamp = t
                        threading.Thread(target=self._send, args=(jpeg, index, timestamp, frame), daemon=True).start()
                    else:
                        self.dropped += 1

                now = time.monotonic()
                if now - report_mark >= self.args.report_seconds:
                    span = now - report_mark
                    sent_now, dropped_now = self.sent - sent_mark, self.dropped - dropped_mark
                    reported_fps = seen / span
                    log.info("[%s] camera %.1f fps | sent %.1f/s | dropped %d | analysis %.0f ms/frame | alarms so far %d", self.name_,
                             reported_fps, sent_now / span, dropped_now, (self.round_trip or 0) * 1000, self.alarms)
                    if sampler.rate is not None and self.round_trip and self.round_trip * PACE_MARGIN > 1.3 / sampler.rate and not warned_ml:
                        log.warning("[%s] analysing a frame takes %.0f ms, so only about %.1f frames/s can be kept up "
                                    "(you asked for %.1f/s). Detection works, but on frames further apart than asked.", self.name_,
                                    self.round_trip * 1000, 1 / (self.round_trip * PACE_MARGIN), sampler.rate)
                        warned_ml = True
                    if sampler.rate is not None and reported_fps < sampler.rate * 0.9 and not warned_slow and not is_file:
                        log.warning("[%s] the camera delivers only %.1f fps, below the sample rate %.1f: every frame is used",
                                    self.name_, reported_fps, sampler.rate)
                        warned_slow = True
                    if dropped_now > 0.2 * (sent_now + dropped_now) and sent_now + dropped_now > 5:
                        log.warning("[%s] %d of %d frames were skipped because the backend or the ML service is too slow",
                                    self.name_, dropped_now, sent_now + dropped_now)
                    seen, sent_mark, dropped_mark, report_mark = 0, self.sent, self.dropped, now

            cap.release()

            if is_file and not self.args.loop:
                log.info("[%s] end of file (%d frames sent, %d dropped)", self.name_, self.sent, self.dropped)
                self.finished = True
                return
            if not self.stop_event.is_set():
                log.warning("[%s] stream ended, reconnecting", self.name_)
                self.stop_event.wait(2)

    def _check_shape(self, frame):
        """The annotation is a fraction of the picture, so the shape (not the size) must match."""
        height, width = frame.shape[:2]
        annotated_w, annotated_h = self.job.get("frameWidth") or 0, self.job.get("frameHeight") or 0
        if annotated_w and annotated_h:
            real, wanted = width / height, annotated_w / annotated_h
            if abs(real - wanted) / wanted > 0.02:
                log.warning("[%s] the camera sends %dx%d but the wall was annotated on %dx%d: the wall lines will not line up. "
                            "Annotate the wall again on this camera's picture.", self.name_, width, height, annotated_w, annotated_h)

    def _send(self, jpeg, frame_number, timestamp, frame=None):
        began = time.monotonic()
        try:
            response = requests.post(
                self.args.backend + "/api/v1/worker/send-frame",
                params={"wallId": self.job["wallId"]},
                data={"frameIndex": frame_number, "timestampSeconds": round(timestamp, 3)},     # form fields, as the backend reads them
                files={"frame": ("frame.jpg", jpeg, "image/jpeg")},
                headers={"X-Worker-Key": self.args.key},
                timeout=30,
            )
            took = time.monotonic() - began
            if self._first_reply:
                # The first frame of a stream makes the ML service open its session and warm up (about 2 s). That is not
                # how fast it analyses a frame, and counting it made the worker skip ahead by dozens of frames.
                self._first_reply = False
            else:
                self.round_trip = took if self.round_trip is None else 0.7 * self.round_trip + 0.3 * took
            if response.status_code == 200:
                self.sent += 1
                result = response.json()
                if frame is not None and self.args.preview:
                    # Draw and upload on another thread, so the preview never slows the analysis down.
                    threading.Thread(target=self._publish_preview, args=(frame, result), daemon=True).start()
                if result.get("alarmRaised"):
                    self.alarms += 1
                    log.warning("[%s] ALARM  probability=%.2f  cell=%s  %s", self.name_, result["probability"],
                                result.get("cellLabel") or "outside every cell", result.get("incidentCode") or "")
            elif response.status_code == 409:
                log.info("[%s] the wall was switched off", self.name_)
            else:
                log.error("[%s] backend answered %d: %s", self.name_, response.status_code, response.text[:200])
        except requests.RequestException as exc:
            log.error("[%s] backend not reachable: %s", self.name_, exc)
        finally:
            self._busy.release()


    # --- the live preview: the camera picture with the people the model found drawn on it --------------------------
    def _draw(self, frame, result):
        """The picture the apps show: a box round every person (orange; RED while the climbing alarm is on), with the
        model's confidence and the wall cell the person's feet are in. Sent about 640 px wide to keep it small."""
        height, width = frame.shape[:2]
        scale = min(1.0, 640.0 / width)
        picture = cv2.resize(frame, (int(width * scale), int(height * scale))) if scale < 1.0 else frame.copy()
        h, w = picture.shape[:2]
        alarm = bool(result.get("alarmActive"))
        colour = (0, 0, 255) if alarm else (0, 165, 255)          # BGR: red / orange

        for person in result.get("people") or []:
            box = person.get("box") or []
            # An inside-out box (left past right, or top below bottom) comes now and then from the person finder on the Apple
            # graphics chip. Its place and its "feet" are wrong, so it is not drawn (the backend gives it no cell either).
            if len(box) != 4 or box[0] >= box[2] or box[1] >= box[3]:
                continue
            x1, y1, x2, y2 = int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)
            cv2.rectangle(picture, (x1, y1), (x2, y2), colour, 3 if alarm else 2)
            cell = person.get("cellLabel")
            label = "Person %d%%" % round((person.get("confidence") or 0) * 100) + (" - " + cell if cell else "")
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            top = max(y1 - th - 8, 0)
            cv2.rectangle(picture, (x1, top), (x1 + tw + 8, top + th + 8), colour, -1)
            cv2.putText(picture, label, (x1 + 4, top + th + 2), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
            # The foot point: the spot the backend uses to decide which cell the person is in.
            cv2.circle(picture, (int(person.get("footX", 0) * w), int(person.get("footY", 0) * h)), 4, colour, -1)

        if alarm:
            # Only the word: the model's reading changes from frame to frame and can dip while the alarm is still on,
            # so a number here would contradict the percentage of the alert itself.
            text = "ALARM"
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            cv2.rectangle(picture, (0, 0), (tw + 20, th + 18), (0, 0, 255), -1)
            cv2.putText(picture, text, (10, th + 8), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        return cv2.imencode(".jpg", picture, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()

    def _publish_preview(self, frame, result):
        # One upload at a time: if the last one is still going, this picture is simply skipped.
        if not self._preview_busy.acquire(blocking=False):
            return
        try:
            requests.post(
                self.args.backend + "/api/v1/worker/post-preview",
                params={"wallId": self.job["wallId"]},
                files={"frame": ("preview.jpg", self._draw(frame, result), "image/jpeg")},
                headers={"X-Worker-Key": self.args.key},
                timeout=3,
            ).raise_for_status()
        except requests.RequestException as exc:
            now = time.monotonic()
            if now - self._preview_error_at > 60:          # report at most once a minute
                self._preview_error_at = now
                log.warning("[%s] the live preview could not be sent: %s (detection itself is not affected)", self.name_, exc)
        finally:
            self._preview_busy.release()


# ---------------------------------------------------------------------------
# The manager: keep one watcher per wall that the backend wants watched
# ---------------------------------------------------------------------------
def fetch_jobs(args):
    response = requests.get(args.backend + "/api/v1/worker/get-jobs", headers={"X-Worker-Key": args.key}, timeout=10)
    if response.status_code == 401:
        log.error("The backend refused the worker key (WORKER_KEY must equal Worker:ApiKey in appsettings.json)")
        sys.exit(1)
    response.raise_for_status()
    return response.json()


def choose_source(job, args):
    """Which address to open: a test override, the camera itself, or the media server.

    auto (default): a phone camera saved with an HTTP picture stream (IP Webcam "/video") is read DIRECTLY, because the
    media server cannot read that kind of stream. Every RTSP camera is read through the media server."""
    if job["wallId"] in args.overrides:
        return args.overrides[job["wallId"]]
    if args.source == "camera":
        return job["cameraSourceUrl"]
    if args.source == "auto" and job["cameraSourceUrl"].lower().startswith("http"):
        return job["cameraSourceUrl"]
    return job["mediaSourceUrl"]


def choose_rate(source, args):
    """None = take every Nth frame (the way the model was trained). A number = take that many frames per second.

    A phone's HTTP picture stream has no fixed frame rate (about 4.5 a second was measured at 1920x1080), so "every 5th
    frame" would leave less than 1 a second. In auto mode such a stream is therefore sampled by time, about 5 a second,
    which is what every 5th frame gives on the 25 fps videos the model learned from. --every or --sample-rate override."""
    if args.sample_rate is not None:
        return args.sample_rate
    if args.source == "auto" and not args.every_given and source.lower().startswith("http"):
        return 5.0
    return None


def main():
    parser = argparse.ArgumentParser(description="AeroSentry ingest worker")
    parser.add_argument("--backend", default=os.environ.get("BACKEND_URL", "http://localhost:5078"))
    parser.add_argument("--key", default=os.environ.get("WORKER_KEY", ""), help="or set WORKER_KEY")
    parser.add_argument("--source", choices=["auto", "media", "camera"], default="auto",
                        help="auto (default) = a phone's /video stream directly, RTSP cameras through the media server; "
                             "media = always the media server; camera = always the camera itself")
    parser.add_argument("--every", type=int, default=None,
                        help="analyse every Nth frame of the stream (frames 0, N, 2N, ...), as the model was trained (default 5). "
                             "The worker widens the gap by itself when the ML service cannot keep up")
    parser.add_argument("--sample-rate", type=float, default=None,
                        help="instead of every Nth frame: analyse about this many frames per SECOND, whatever the camera's frame rate "
                             "(for example 5 for a 15 fps or 60 fps camera). Chooses frames by time, not by count")
    parser.add_argument("--poll", type=float, default=5.0, help="seconds between asking the backend for jobs")
    parser.add_argument("--report-seconds", type=float, default=30.0, help="how often to print the rate report")
    parser.add_argument("--override", action="append", default=[], metavar="WALLID=SOURCE",
                        help="for tests: read this video file or URL instead, for one wall (repeatable)")
    parser.add_argument("--loop", action="store_true", help="restart a video file when it ends")
    parser.add_argument("--no-preview", dest="preview", action="store_false",
                        help="do not send the live preview picture (boxes drawn on the camera picture) to the backend")
    parser.add_argument("--run-seconds", type=float, default=0, help="for tests: exit after this many seconds")
    args = parser.parse_args()

    if not args.key:
        sys.exit("Set the worker key: WORKER_KEY=... or --key ...")
    if args.sample_rate is not None and not 0.5 <= args.sample_rate <= 30:
        sys.exit("--sample-rate must be between 0.5 and 30")
    args.every_given = args.every is not None
    args.every = args.every or 5
    if not 1 <= args.every <= 60:
        sys.exit("--every must be between 1 and 60")
    args.overrides = dict(item.split("=", 1) for item in args.override)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
    log.info("Ingest worker started. Backend: %s  Source: %s  Sampling: %s", args.backend, args.source,
             "about %.1f frames/s (by time)" % args.sample_rate if args.sample_rate
             else "every %dth frame; a phone's /video stream about 5 frames/s" % args.every if args.source == "auto" and not args.every_given
             else "every %dth frame (by count)" % args.every)

    watchers = {}   # wallId -> StreamWatcher
    started = time.time()
    try:
        while True:
            try:
                jobs = {job["wallId"]: job for job in fetch_jobs(args)}
            except requests.RequestException as exc:
                log.error("Cannot get jobs from the backend: %s", exc)
                jobs = None

            if jobs is not None:
                # Stop watching walls that were switched off.
                for wall_id in list(watchers):
                    if wall_id not in jobs:
                        log.info("Stop watching %s", watchers[wall_id].name_)
                        watchers.pop(wall_id).stop()

                # Start (or restart) watching walls that must be watched.
                for wall_id, job in jobs.items():
                    watcher = watchers.get(wall_id)
                    if watcher is not None and (watcher.is_alive() or watcher.finished):
                        continue
                    source = choose_source(job, args)
                    shown = source if os.path.exists(source) else source.split("@")[-1]   # never print passwords
                    log.info("Start watching %s from %s", job["wallName"], shown)
                    watchers[wall_id] = StreamWatcher(job, source, args)
                    watchers[wall_id].start()

            if args.run_seconds and time.time() - started > args.run_seconds:
                break
            time.sleep(args.poll)
    except KeyboardInterrupt:
        pass
    finally:
        for watcher in watchers.values():
            watcher.stop()
        log.info("Ingest worker stopped")


if __name__ == "__main__":
    main()
