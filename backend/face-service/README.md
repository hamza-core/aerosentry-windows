# Face service

A small, stateless FastAPI service around InsightFace's `buffalo_l` model: the same model and settings as the learning scripts in
`Documents/CV/learn` (SCRFD face detector + ArcFace recogniser, CPU, 512-number embeddings, `det_size` 640).
Offline: the model is read from `~/.insightface/models/buffalo_l` (it is already on this Mac; 325 MB).

```bash
face-service/start-face.sh start     # port 8020, runs in this terminal
face-service/start-face.sh status    # {"status":"healthy","model":"buffalo_l",...}
face-service/start-face.sh stop
```
It needs the `cv_env` conda environment (insightface, onnxruntime, opencv, fastapi), the same one as the ML service.

## Video: the best frame of each head pose
`POST /api/faces/analyze-video` (multipart `video`, optional `samples`): reads about 60 frames of a 10 to 20 s video of a person turning their head, measures head pose (the `1k3d68` model that comes with `buffalo_l`), sharpness (variance of the Laplacian of the face crop) and the embedding of each frame that has exactly one face, and returns the sharpest frame of each pose with its embedding and a JPEG. Poses are named by order: the side turned to first is `left`, the tilt made first is `up`. The pose model is used only for videos, so picture analysis keeps its speed.

## What it does
`POST /api/faces/analyze` (multipart: `image`, optional `det_size` 320 to 1920) returns, for every face in the picture (biggest first):
its `box` in pixels, a `det_score`, and its `embedding` (512 numbers of length 1). That is all: it stores nothing and knows nobody.
**The backend** keeps the people, their photos and their embeddings in the database and does the matching
(cosine similarity = a dot product; same face about 0.5 to 1.0, different people about 0 to 0.25 on the project's own photos).

## How it relates to the learning scripts
| Learning script | In AeroSentry |
|---|---|
| `enroll_user.py` (30 webcam frames, one face, width over 100 px, average, scale to length 1, save `.npy`) | `POST people/enroll`: three photos (front, left, right), exactly one face each, width of at least 100 px, average, scale to length 1, stored in the database |
| `task4.py` (compare a live face with every saved identity, threshold 0.45) | `PersonService`: the same dot product against every enrolled person, threshold `Face:MatchThreshold` = 0.45 |
| `identities/*.npy`, `authorized.json` | not used. The five `.npy` identities could be enrolled through the API from photos. `authorized.json` holds old 128-number vectors from an earlier model, which do not work with `buffalo_l` |
