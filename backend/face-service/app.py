"""
AeroSentry face service.

A small, stateless FastAPI service around InsightFace's `buffalo_l` model (the same model and settings as the
learning scripts in Documents/CV/learn: SCRFD face detector + ArcFace recogniser, CPU, 512-number embeddings).

What it does:
  - given a picture, it finds the faces and returns, for each one, its box and its embedding (512 numbers, length 1);
  - given a short VIDEO of a person turning their head (look straight, left, right, up, down), it looks at about 60
    frames, measures the head angles, the sharpness and the embedding of each, and returns the best, sharpest frame for
    each pose with its embedding (/api/faces/analyze-video).
It stores nothing and knows nobody: the backend keeps the people, their photos and their embeddings in the database,
and decides who matches whom (cosine similarity = a dot product).

Runs fully offline: the model files are read from ~/.insightface/models/buffalo_l.

Run (from this folder, in the conda environment that has insightface, opencv and onnxruntime):
    python -m uvicorn app:app --port 8020
"""

import base64
import logging
import os
import tempfile
import threading
from contextlib import asynccontextmanager

import cv2
import numpy as np
from typing import List

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from insightface.app import FaceAnalysis
from insightface.model_zoo import get_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("face-service")

MODEL_NAME = os.environ.get("FACE_MODEL", "buffalo_l")
DEFAULT_DET_SIZE = 640              # same as the learning scripts. A bigger value finds smaller faces but is slower.
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_VIDEO_BYTES = 120 * 1024 * 1024
VIDEO_SAMPLES = 60                  # how many frames of a video are looked at

state = {"app": None, "pose": None, "det_size": DEFAULT_DET_SIZE}
lock = threading.Lock()             # the detector's input size is shared state: one request at a time (about 70 ms each)


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("Loading %s (CPU, offline)...", MODEL_NAME)
    # Only the two modules that are needed: face detection and face recognition (the age/gender and landmark models are skipped).
    face_app = FaceAnalysis(name=MODEL_NAME, providers=["CPUExecutionProvider"], allowed_modules=["detection", "recognition"])
    face_app.prepare(ctx_id=-1, det_size=(DEFAULT_DET_SIZE, DEFAULT_DET_SIZE))
    state["app"] = face_app
    # The head-pose model is used ONLY for videos (about 25 ms a face), so picture analysis stays as fast as before.
    pose_path = os.path.join(os.path.expanduser("~"), ".insightface", "models", MODEL_NAME, "1k3d68.onnx")
    if os.path.exists(pose_path):
        pose_model = get_model(pose_path, providers=["CPUExecutionProvider"])
        pose_model.prepare(ctx_id=-1)
        state["pose"] = pose_model
    else:
        log.warning("%s not found: video analysis is switched off", pose_path)
    log.info("Face service ready.")
    yield


app = FastAPI(title="AeroSentry face service", version="0.1.0", lifespan=lifespan)


@app.get("/api/health")
def health():
    return {"status": "healthy" if state["app"] is not None else "loading", "model": MODEL_NAME,
            "default_det_size": DEFAULT_DET_SIZE, "provider": "CPUExecutionProvider"}


@app.post("/api/faces/analyze")
def analyze(image: UploadFile = File(..., description="A picture (JPEG or PNG)"),
            det_size: int = Form(DEFAULT_DET_SIZE, description="Detector input size, 320 to 1920. Bigger finds smaller faces, slower.")):
    if state["app"] is None:
        raise HTTPException(503, "The face model is still loading")
    if not 320 <= det_size <= 1920:
        raise HTTPException(422, "det_size must be between 320 and 1920")

    data = image.file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(422, "The picture is larger than 15 MB")
    frame = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(422, "The upload is not a picture the service can read")

    with lock:
        if det_size != state["det_size"]:
            state["app"].det_model.input_size = (det_size, det_size)
            state["det_size"] = det_size
        faces = state["app"].get(frame)

    height, width = frame.shape[:2]
    result = []
    for face in sorted(faces, key=lambda f: -(f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])):   # biggest face first
        embedding = face.embedding / np.linalg.norm(face.embedding)
        result.append({
            "box": [int(v) for v in face.bbox],                      # [x1, y1, x2, y2] in pixels of the picture
            "det_score": round(float(face.det_score), 4),            # how sure the detector is that this is a face (0 to 1)
            "embedding": [round(float(v), 6) for v in embedding],    # 512 numbers, length 1
        })
    return {"image_width": width, "image_height": height, "faces": result}


# ---------------------------------------------------------------------------------------------------------------------
# Video: pick the best frame of each head pose
# ---------------------------------------------------------------------------------------------------------------------
# The person is asked to look straight, turn left, turn right, tilt up and tilt down. We do not rely on timing: every
# sampled frame gets its head angles (degrees), sharpness and embedding, then the sharpest frame of each pose wins.
# Which SIGN means "left" or "up" depends on the camera and its mirroring, so the pose is named by ORDER: the side the
# person turned to FIRST is "left", the tilt they made first is "up" (the prompts ask left before right, up before down).

FRONT_YAW, FRONT_PITCH = 8.6, 6.9           # degrees: "looking straight"
TURN_RANGE = (14.3, 37.2)                   # a turn that is clear but not yet a profile the model cannot match
TILT_RANGE = (8.6, 31.5)
SIDE_PITCH_TOLERANCE = 14.3                 # while turned sideways, the up/down angle may differ this much
TILT_YAW_TOLERANCE = 17.2                   # while tilted, the face must face roughly forward


def sharpness_of(frame, box):
    """How sharp the face is: variance of the Laplacian of the face crop, resized to 112 x 112 grey. Motion blur and
    out-of-focus faces score low. Independent of the picture size."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = max(int(box[0]), 0), max(int(box[1]), 0), min(int(box[2]), w), min(int(box[3]), h)
    if x2 - x1 < 8 or y2 - y1 < 8:
        return 0.0
    crop = cv2.cvtColor(cv2.resize(frame[y1:y2, x1:x2], (112, 112)), cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(crop, cv2.CV_64F).var())


def choose_poses(shots):
    """shots: dicts with index, yaw, pitch, width, sharp. Returns ({pose: shot}, [poses that were not found])."""
    if not shots:
        return {}, ["front", "left", "right", "up", "down"]

    # The person's own "straight up/down": the middle pitch among the forward-facing frames.
    forward = sorted(s["pitch"] for s in shots if abs(s["yaw"]) < 12) or sorted(s["pitch"] for s in shots)
    baseline = forward[len(forward) // 2]
    delta = lambda s: s["pitch"] - baseline
    best = lambda items: max(items, key=lambda s: (s["sharp"], s["width"])) if items else None

    chosen, missing = {}, []
    straight = [s for s in shots if abs(s["yaw"]) < FRONT_YAW and abs(delta(s)) < FRONT_PITCH]
    chosen["front"] = best(straight) or min(shots, key=lambda s: abs(s["yaw"]) + abs(delta(s)))

    def pair(measure, value_range, allowed, fallback_min, names):
        """One shot for each side of an axis, named by which side was visited first."""
        sides = []
        for sign in (1, -1):
            reaches = [s for s in shots if measure(s) * sign > value_range[0]]
            if not reaches:
                return None
            first_seen = min(s["index"] for s in reaches)
            good = [s for s in reaches if value_range[0] <= measure(s) * sign <= value_range[1] and allowed(s)]
            pick = best(good) or max((s for s in reaches if measure(s) * sign > fallback_min), key=lambda s: measure(s) * sign, default=None)
            if pick is None:
                return None
            sides.append((first_seen, pick))
        sides.sort(key=lambda t: t[0])
        return {names[0]: sides[0][1], names[1]: sides[1][1]}

    turns = pair(lambda s: s["yaw"], TURN_RANGE, lambda s: abs(delta(s)) < SIDE_PITCH_TOLERANCE, 8.6, ("left", "right"))
    tilts = pair(delta, TILT_RANGE, lambda s: abs(s["yaw"]) < TILT_YAW_TOLERANCE, 5.7, ("up", "down"))
    for pose, group in (("left", turns), ("right", turns), ("up", tilts), ("down", tilts)):
        if group and pose in group:
            chosen[pose] = group[pose]
        else:
            missing.append(pose)
    return chosen, missing


# ---- enrolment the way the learning script enroll_user.py does it, keeping the SHARPEST frames ---------------------
ENROLL_FRAMES = 30            # TARGET_FRAMES in the script
ENROLL_CANDIDATES = 45        # good frames looked for; the 30 sharpest are kept (the script keeps the first 30)
ENROLL_EVERY_SECONDS = 0.4    # the script waits 0.4 s after each kept frame
ENROLL_MIN_FACE_WIDTH = 100   # "face is reasonably close to the camera": wider than this ...
ENROLL_PICTURE_WIDTH = 640    # ... in a picture 640 wide (the script works on 640 x 480; here the shape is kept, not stretched)


def look_at(frame):
    """One picture, judged as in the script: exactly one face, wider than 100 px at a width of 640."""
    height, width = frame.shape[:2]
    if width != ENROLL_PICTURE_WIDTH:
        frame = cv2.resize(frame, (ENROLL_PICTURE_WIDTH, max(1, round(height * ENROLL_PICTURE_WIDTH / width))))
    with lock:
        faces = state["app"].get(frame)
    h, w = frame.shape[:2]
    result = {"faces": len(faces), "ok": False, "message": "Position your face in the center", "box": None, "face_width": 0, "sharpness": 0.0}
    if len(faces) > 1:
        result["message"] = "Only 1 person allowed during enrollment!"
    if len(faces) != 1:
        return result, frame, None
    face = faces[0]
    x1, y1, x2, y2 = (float(v) for v in face.bbox)
    result.update(box=[max(x1 / w, 0.0), max(y1 / h, 0.0), min(x2 / w, 1.0), min(y2 / h, 1.0)], face_width=int(x2 - x1),
                  sharpness=round(sharpness_of(frame, [x1, y1, x2, y2]), 1))
    if result["face_width"] <= ENROLL_MIN_FACE_WIDTH:
        result["message"] = "Please step closer"
        return result, frame, None
    result.update(ok=True, message="Good frame")
    return result, frame, face


def candidate(result, frame, face, seconds):
    ok_jpeg, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok_jpeg:
        return None
    return {"time_seconds": round(seconds, 2), "face_width": result["face_width"], "sharpness": result["sharpness"], "raw": face.embedding,
            "embedding": (face.embedding / np.linalg.norm(face.embedding)).tolist(), "jpeg_base64": base64.b64encode(buf.tobytes()).decode("ascii")}


def enrollment_answer(candidates, counts, seconds):
    """The 30 sharpest candidates (in the order they were taken) and their average face, computed as the script does."""
    sharpest = sorted(candidates, key=lambda c: c["sharpness"], reverse=True)[:ENROLL_FRAMES]
    kept = sorted(sharpest, key=lambda c: c["time_seconds"])
    mean = []
    if kept:
        average = np.mean([c["raw"] for c in kept], axis=0)   # as the script: average the faces' own vectors ...
        mean = (average / np.linalg.norm(average)).tolist()   # ... then scale back to length 1
    return {"wanted": ENROLL_FRAMES, "frames": [{k: v for k, v in c.items() if k != "raw"} for c in kept], "mean_embedding": mean,
            "good": len(candidates), "seconds_used": round(seconds, 1), **counts}


def require_model():
    if state["app"] is None:
        raise HTTPException(503, "The face model is still loading")


@app.post("/api/faces/enrollment-check")
def enrollment_check(image: UploadFile = File(..., description="One camera picture, while a person is being enrolled")):
    """For the live capture screen: where is the face, is the frame good enough, and how sharp is it? Stores nothing."""
    require_model()
    data = image.file.read(MAX_IMAGE_BYTES + 1)
    frame = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR) if 0 < len(data) <= MAX_IMAGE_BYTES else None
    if frame is None:
        raise HTTPException(422, "The upload is not a picture the service can read")
    return look_at(frame)[0]


@app.post("/api/faces/enrollment-images")
def enrollment_images(images: List[UploadFile] = File(..., description="The captured pictures of ONE person (up to 60)")):
    """The pictures chosen on the capture screen. Each one is judged again here: what the browser said is not trusted."""
    require_model()
    if len(images) > 60:
        raise HTTPException(422, "At most 60 pictures")
    candidates, counts = [], {"sampled": 0, "no_face": 0, "many_faces": 0, "too_small": 0}
    for number, image in enumerate(images):
        data = image.file.read(MAX_IMAGE_BYTES + 1)
        frame = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR) if 0 < len(data) <= MAX_IMAGE_BYTES else None
        if frame is None:
            raise HTTPException(422, f"Picture {number + 1} cannot be read")
        counts["sampled"] += 1
        result, frame, face = look_at(frame)
        if face is None:
            counts["many_faces" if result["faces"] > 1 else "too_small" if result["faces"] == 1 else "no_face"] += 1
            continue
        c = candidate(result, frame, face, float(number))
        if c:
            candidates.append(c)
    return enrollment_answer(candidates, counts, 0.0)


@app.post("/api/faces/enrollment-frames")
def enrollment_frames(video: UploadFile = File(..., description="A video of about 20 seconds of ONE person facing the camera")):
    """A frame about every 0.4 s; of up to 45 with exactly one face wider than 100 px, the 30 sharpest are kept. The face
    profile is the average of those 30 face vectors, scaled to length 1: the maths of enroll_user.py."""
    require_model()
    data = video.file.read(MAX_VIDEO_BYTES + 1)
    if len(data) > MAX_VIDEO_BYTES:
        raise HTTPException(422, "The video is larger than 120 MB")
    with tempfile.NamedTemporaryFile(suffix=".video", delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    candidates, counts = [], {"sampled": 0, "no_face": 0, "many_faces": 0, "too_small": 0}
    read, seconds = 0, 0.0
    try:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise HTTPException(422, "The upload is not a video the service can read")
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        if not 1.0 <= fps <= 120.0:       # a browser's recording (webm) may not say its frame rate (it can claim 1000)
            fps = 30.0
        next_time = 0.0
        while len(candidates) < ENROLL_CANDIDATES:
            ok, frame = cap.read()
            if not ok:
                break
            # The frame's own time in the video; if the file does not say, count frames.
            stamp = (cap.get(cv2.CAP_PROP_POS_MSEC) or 0.0) / 1000.0
            seconds = stamp if stamp > 0 else read / fps
            read += 1
            if seconds + 1e-6 < next_time:
                continue
            next_time = seconds + ENROLL_EVERY_SECONDS
            counts["sampled"] += 1
            result, frame, face = look_at(frame)
            if face is None:
                counts["many_faces" if result["faces"] > 1 else "too_small" if result["faces"] == 1 else "no_face"] += 1
                continue
            c = candidate(result, frame, face, seconds)
            if c:
                candidates.append(c)
        cap.release()
    finally:
        os.unlink(path)
    return enrollment_answer(candidates, counts, seconds)


@app.post("/api/faces/analyze-video")
def analyze_video(video: UploadFile = File(..., description="A short video (about 10 to 20 seconds) of one person turning their head"),
                  samples: int = Form(VIDEO_SAMPLES, description="How many frames to look at (20 to 120)")):
    if state["app"] is None:
        raise HTTPException(503, "The face model is still loading")
    if state["pose"] is None:
        raise HTTPException(503, "Video analysis is not available: the head-pose model (1k3d68.onnx) is missing")
    samples = max(20, min(int(samples), 120))

    data = video.file.read(MAX_VIDEO_BYTES + 1)
    if len(data) > MAX_VIDEO_BYTES:
        raise HTTPException(422, "The video is larger than 120 MB")
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        tmp.write(data)
        path = tmp.name
    try:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise HTTPException(422, "The upload is not a video the service can read")
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        # about `samples` frames spread over the whole video
        step = max(1, round(total / samples)) if total > 0 else max(1, round(fps / 4))

        shots, jpegs, embeddings = [], {}, {}
        read = analysed = one_face = 0
        index = -1
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            index += 1
            read += 1
            if index % step != 0:
                continue
            analysed += 1
            with lock:
                faces = state["app"].get(frame)
                if len(faces) != 1:      # nobody, or two people: not usable for the face profile
                    continue
                face = faces[0]
                state["pose"].get(frame, face)
            one_face += 1
            pitch, yaw, _roll = (float(v) for v in face.pose)
            box = [float(v) for v in face.bbox]
            shot = {"index": index, "time": round(index / fps, 2), "yaw": yaw, "pitch": pitch, "width": int(box[2] - box[0]),
                    "sharp": sharpness_of(frame, box), "det_score": float(face.det_score)}
            shots.append(shot)
            ok_jpeg, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 92])
            if ok_jpeg:
                jpegs[index] = buf.tobytes()
                embeddings[index] = face.embedding / np.linalg.norm(face.embedding)
        cap.release()
        duration = (read / fps) if fps else 0.0
    finally:
        os.unlink(path)

    log.info("video: %d frames read, %d looked at, %d with exactly one face", read, analysed, one_face)
    chosen, missing = choose_poses([s for s in shots if s["index"] in jpegs])
    poses = []
    for pose in ("front", "left", "right", "up", "down"):
        shot = chosen.get(pose)
        if shot is None:
            continue
        poses.append({
            "pose": pose, "frame_index": shot["index"], "time_seconds": shot["time"],
            "yaw": round(shot["yaw"], 1), "pitch": round(shot["pitch"], 1), "face_width": shot["width"],
            "sharpness": round(shot["sharp"], 1), "det_score": round(shot["det_score"], 4),
            "embedding": [round(float(v), 6) for v in embeddings[shot["index"]]],
            "jpeg_base64": base64.b64encode(jpegs[shot["index"]]).decode("ascii"),
        })
    return {"frames_read": read, "frames_analyzed": analysed, "frames_with_one_face": one_face,
            "duration_seconds": round(duration, 1), "poses": poses, "missing": missing}
