# ML service launcher

Two copies of the (frozen, approved) ML service live in the sibling module `ml-service/` of the complete folder (`AeroSentry-Complete/ml-service/`; set `ML_BASE` to use another place):

| Folder | Runs on | Speed on the development Mac (live mode, window full) |
|---|---|---|
| `standalone_every_5_frames` | the GPU (`mps`) when available. **The original, never modified** | about 2 frames/s |
| `standalone_every_5_frames_cpu` | the CPU. A copy with two lines changed (see its `CPU_VERSION.md`) | about 14 frames/s |

Same model files (byte-identical), same answers (compared on 7 clips, 292 frames), same API on port 8010.

```bash
ml-service/start-ml.sh cpu       # start the CPU copy
ml-service/start-ml.sh gpu       # start the original
ml-service/start-ml.sh stop      # stop whichever runs
ml-service/start-ml.sh status    # running? "device": "cpu" or "mps" (= GPU)
```
Only one can run at a time (both use port 8010 and the backend's `Ml:BaseUrl` points there), so to switch: `stop`, then start the other.
The script refuses to start a second one. The backend also reports the device: `GET /api/v1/ml/health` (admin) shows `device`.
The model is trained for about 5 samples per second; the worker paces itself to whatever the running version can do.
