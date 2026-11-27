#!/bin/bash
# Start the ML service on port 8010, either the CPU copy or the original GPU version. Only ONE can run at a time
# (both use port 8010, and the backend's Ml:BaseUrl points there), so switching = stop one, start the other.
#
#   ml-service/start-ml.sh cpu       the CPU copy      (standalone_every_5_frames_cpu): about 14 frames/s on the development Mac
#   ml-service/start-ml.sh gpu       the original      (standalone_every_5_frames):     about 2 frames/s on the development Mac
#   ml-service/start-ml.sh stop      stop whichever is running
#   ml-service/start-ml.sh status    is it running, and on which device ("cpu" or "mps" = GPU)
#
# Paths can be overridden:  ML_BASE=/path/to/folder ML_PYTHON=/path/to/python ML_PORT=8010 ml-service/start-ml.sh cpu

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The model folders are in the sibling module  ml-service/  next to the backend (AeroSentry-Complete/ml-service). Override with ML_BASE.
BASE="${ML_BASE:-$HERE/../../ml-service}"
# Which Python to use: $ML_PYTHON, else the conda environment cv_env (torch, ultralytics, insightface ...), else python3.
pick_python() {
  for c in "${ML_PYTHON:-}" "$HOME/miniconda3/envs/cv_env/bin/python" "$HOME/anaconda3/envs/cv_env/bin/python" "$HOME/miniforge3/envs/cv_env/bin/python" "$(command -v python3 || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }
  done
}
PY="$(pick_python)"
PORT="${ML_PORT:-8010}"

case "${1:-}" in
  cpu)  DIR="$BASE/standalone_every_5_frames_cpu"; LABEL="CPU copy" ;;
  gpu)  DIR="$BASE/standalone_every_5_frames";     LABEL="original (GPU)" ;;
  stop)
    if pkill -f "uvicorn app.main:app --port $PORT"; then echo "ML service stopped"; else echo "ML service was not running"; fi
    exit 0 ;;
  status)
    curl -s -m 3 "http://localhost:$PORT/api/health" || echo "ML service is not running on port $PORT"
    echo; exit 0 ;;
  *) echo "usage: $0 cpu | gpu | stop | status"; exit 1 ;;
esac

[ -d "$DIR/backend" ] || { echo "Folder not found: $DIR"; exit 1; }
[ -x "$PY" ] || { echo "Python not found: $PY (set ML_PYTHON)"; exit 1; }

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use (is an ML service running?). Run:  $0 stop"
  exit 1
fi

echo "Starting the ML service, $LABEL, from $DIR on port $PORT"
echo "(Ctrl+C stops it. Check the device from another terminal:  $0 status)"
cd "$DIR/backend" || exit 1
# PYTHONDONTWRITEBYTECODE: do not write __pycache__ files into the (approved, frozen) ML folders.
PYTHONDONTWRITEBYTECODE=1 exec "$PY" -m uvicorn app.main:app --port "$PORT"
