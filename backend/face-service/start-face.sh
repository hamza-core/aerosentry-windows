#!/bin/bash
# Start / stop the face service on port 8020.
#   face-service/start-face.sh start     (runs in this terminal; Ctrl+C stops it)
#   face-service/start-face.sh stop
#   face-service/start-face.sh status
# Paths can be overridden:  FACE_PYTHON=/path/to/python FACE_PORT=8020 face-service/start-face.sh start

HERE="$(cd "$(dirname "$0")" && pwd)"
# Which Python to use: $FACE_PYTHON, else the conda environment cv_env (torch, ultralytics, insightface ...), else python3.
pick_python() {
  for c in "${FACE_PYTHON:-}" "$HOME/miniconda3/envs/cv_env/bin/python" "$HOME/anaconda3/envs/cv_env/bin/python" "$HOME/miniforge3/envs/cv_env/bin/python" "$(command -v python3 || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && { echo "$c"; return; }
  done
}
PY="$(pick_python)"
PORT="${FACE_PORT:-8020}"

case "${1:-}" in
  start)
    [ -x "$PY" ] || { echo "Python not found: $PY (set FACE_PYTHON)"; exit 1; }
    if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "Port $PORT is already in use. Run:  $0 stop"; exit 1; fi
    echo "Starting the face service on port $PORT (offline; the model is read from ~/.insightface/models)"
    cd "$HERE" && PYTHONDONTWRITEBYTECODE=1 exec "$PY" -m uvicorn app:app --port "$PORT" ;;
  stop)
    if pkill -f "uvicorn app:app --port $PORT"; then echo "Face service stopped"; else echo "Face service was not running"; fi ;;
  status)
    curl -s -m 3 "http://localhost:$PORT/api/health" || echo "Face service is not running on port $PORT"; echo ;;
  *) echo "usage: $0 start | stop | status"; exit 1 ;;
esac
