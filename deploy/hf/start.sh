#!/bin/bash
# VORQON — Hugging Face Space entrypoint (see deploy/hf/Dockerfile.space).
#
# One container, two processes:
#   - backend (Node/Express) on 127.0.0.1:3000 via `npm start`, which
#     first runs src/bootstrap-db.js (DB self-seeding when
#     DB_BOOTSTRAP=true) and then src/server.js.
#   - nginx in the foreground on :7860, serving the SPA from
#     /app/frontend-dist and proxying /api/ to the backend.
#
# If either process dies, the container exits with that failure visible
# in the Space logs, so HF restarts the Space instead of leaving a
# half-broken store running.
set -u

# Each process gets its own session/process group (setsid) so shutdown
# can signal the whole group — `npm start` spawns node children that a
# signal to the npm PID alone would orphan.
setsid bash -c 'cd /app/backend && PORT=3000 exec npm start' &
BACKEND_PID=$!
echo "[start] backend launching (pid group $BACKEND_PID) — npm start on :3000"

setsid nginx -g 'daemon off;' &
NGINX_PID=$!
echo "[start] nginx launching (pid group $NGINX_PID) on :7860"

shutdown() {
    echo "[start] shutdown requested — stopping backend and nginx."
    kill -TERM -"$BACKEND_PID" -"$NGINX_PID" 2>/dev/null
    exit 0
}
trap shutdown TERM INT

# Exit as soon as EITHER process exits.
wait -n "$BACKEND_PID" "$NGINX_PID"
EXIT_CODE=$?
echo "[start] ERROR: a core process exited with code $EXIT_CODE — stopping the container." >&2
kill -TERM -"$BACKEND_PID" -"$NGINX_PID" 2>/dev/null
exit "$EXIT_CODE"
