# Ingest worker

A small Python program that reads the camera streams and feeds the backend. It is **not** part of the
frozen ML service, and it never talks to the ML service: it only posts frames to the backend.

```
Camera -> MediaMTX --RTSP--> ingest worker --(about 5 JPEG frames per second)--> backend -> ML service
                  \--HLS--> the apps (viewing)                          \-> wall cell + stored alarm
```

## What it needs
- Python with `opencv-python` and `requests` (the `cv_env` conda environment already has both; see `requirements.txt`).
- The backend running, and its worker key. The key lives in `AeroSentry.Api/appsettings.json` under `Worker:ApiKey`.
- No internet.

## Run it
```bash
cd ingest-worker
export WORKER_KEY="<the value of Worker:ApiKey>"
python worker.py                      # reads streams from MediaMTX (rtsp://localhost:8554/cam-<cameraId>)
python worker.py --source camera      # reads each camera directly (no media server)
```

It asks the backend every 5 seconds which walls are switched on (`detection/start` switches a wall on,
`detection/stop` switches it off), and starts or stops watching them by itself.

## Reading RTSP
The worker reads RTSP over **TCP** and gives up on a dead camera after 10 s (it then reconnects). OpenCV's default is UDP, which lost packets over
Wi-Fi in testing. Set `OPENCV_FFMPEG_CAPTURE_OPTIONS` yourself to change that. The media server and its camera config are in `../media/`.

## Options
| Option | Meaning |
|---|---|
| `--source auto\|media\|camera` | where to read the video. Default `auto`: a phone saved with `/video` is read directly (the media server cannot read it) at about 5 frames per second; RTSP cameras go through the media server, every 5th frame |
| `--every 5` | analyse every Nth frame of the stream: frames 0, N, 2N ... (default 5, as in training); see below |
| `--sample-rate 5` | instead: analyse about this many frames per **second**, whatever the camera's frame rate (chooses by time, not by count) |
| `--poll 5` | seconds between asking for jobs |
| `--backend URL` | default `http://localhost:5078` (or env `BACKEND_URL`) |
| `--override WALLID=FILE_OR_URL` | test with a video file instead of a camera |
| `--loop` | restart a test video file when it ends |
| `--no-preview` | do not send the live preview picture (the camera picture with a box round each person) to the backend |

## Which frames are analysed
- **Every 5th frame, by counting, as in training.** The model was trained on frames 0, 5, 10, ... of every video
  (`extract_every_5_frames.py`: `np.arange(0, total_frames, 5)`), and the ML service is set the same way (`frame_stride = 5`).
  The worker keeps exactly those frames of the stream. `--every N` changes the 5.
- **What that means per second depends on the camera's frame rate.** 25 fps gives 5 analysed frames per second (what most
  training videos gave), 30 fps gives 6, a 15 fps phone only 3, a 60 fps camera 12. Measured on the training set
  (`wall-intrusion-detection/dataset/train`, 703 videos): 65% are 25 fps, 20% are 30 fps, 14% are 24 fps.
- **Want about 5 per second whatever the camera?** Use `--sample-rate 5`. It chooses frames by **time** instead: the same 5 per second
  for 15, 25, 30 or 60 fps, but the frames are no longer the exact multiples of 5.
- **The frame number sent to the backend is the 0-based index** of the frame in the stream (0, 5, 10, ...), the same numbering as
  the training videos. For a live camera the worker measures the camera's real frame rate (about once a second).
- **The ML service is the limit, not the camera.** In live mode it re-runs its whole 60-frame window through the
  bidirectional LSTM on every frame. Measured on the development Mac it handles about 5.6 frames/s at first and only about
  2 to 2.5 frames/s once the window is full (GPU copy; the CPU copy is faster, see `ml-service/`). So the worker measures the time
  per frame and, when that is longer than the gap between two every-5th frames, **widens the gap** (every 6th, 7th ... frame) so
  analyses never pile up. It prints a warning the first time it has to (the model then sees frames further apart than in training)
  and `analysis NNN ms/frame` in its report. The very first answer of a stream is not counted: the ML service opens its session
  and warms up then (about 2 s), which is not its normal speed.
- **More walls = less speed each.** One ML process serves every wall, so the per-wall rate drops as walls are added.
- If a frame is still being analysed when the next is due, the new one is skipped (counted as `dropped`) instead of queuing.
- A stream that cannot be opened (for example a camera that is off) blocks the other walls' streams from opening for up to 10 s,
  because OpenCV opens one stream at a time. They start as soon as it gives up.

## The live preview
For every frame it analyses, the worker also draws the people on a copy of the picture (a box round each person: orange, **red**
while the climbing alarm is on, with the model's confidence and the wall cell) and uploads it, about 640 px wide, to
`POST /api/v1/worker/post-preview`. The apps watch it at `GET /api/v1/detection/preview`. It runs on its own thread and is simply
skipped when the previous upload is still going, so it never slows the detection down. If the upload fails, the detection goes on
and the worker says so once a minute.
