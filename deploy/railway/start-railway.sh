#!/bin/bash
# VORQON — Railway entrypoint (see Dockerfile.railway).
#
# One container, two processes — same architecture as the Hugging Face
# entrypoint (deploy/hf/start.sh), which this file mirrors except for
# the port handling:
#   - backend (Node/Express) on 127.0.0.1:3000 via `npm start`, which
#     first runs src/bootstrap-db.js (DB self-seeding when
#     DB_BOOTSTRAP=true) and then src/server.js. The backend port is
#     INTERNAL and never changes: the process is launched with
#     PORT=3000 explicitly, overriding both the image ENV and any
#     platform-injected PORT.
#   - nginx in the foreground, serving the SPA from /app/frontend-dist
#     and proxying /api/ to the backend. nginx is the PUBLIC listener,
#     and Railway routes traffic to the port IT injects as $PORT — so
#     nginx must listen on $PORT, not on a baked-in number.
#
# Port selection for nginx:
#   - $PORT set by the platform (Railway) and != 3000 → nginx uses it.
#     (3000 is excluded: that is the backend's port; if a platform ever
#     injected exactly 3000 the two processes would collide.)
#   - $PORT absent or == 3000 (plain `docker run`, local test) → nginx
#     falls back to 7860, exactly the Hugging Face behaviour.
# The image still carries ENV PORT=3000 for parity with the HF image —
# that value is the backend's default (backend/src/config.js); the
# backend subshell below pins it explicitly either way.
#
# If either process dies, the container exits with that failure visible
# in the Railway logs, so the platform restarts it instead of leaving a
# half-broken store running.
set -u

BACKEND_PORT=3000

if [ -n "${PORT:-}" ] && [ "$PORT" != "$BACKEND_PORT" ]; then
    NGINX_PORT="$PORT"
else
    NGINX_PORT=7860
fi

# Render the nginx config from its pristine template (the template in
# the image is never edited, so every start renders from a clean copy).
sed -e "s/__NGINX_PORT__/$NGINX_PORT/g" \
    -e "s/__BACKEND_PORT__/$BACKEND_PORT/g" \
    /app/nginx.conf.template > /etc/nginx/nginx.conf
if grep -q '__NGINX_PORT__\|__BACKEND_PORT__' /etc/nginx/nginx.conf; then
    echo "[start] ERROR: nginx config still contains unrendered placeholders — aborting." >&2
    exit 1
fi
if ! nginx -t -q; then
    echo "[start] ERROR: rendered nginx config is invalid — aborting." >&2
    exit 1
fi
echo "[start] nginx config rendered: listen $NGINX_PORT, /api/ -> 127.0.0.1:$BACKEND_PORT"

# Each process gets its own session/process group (setsid) so shutdown
# can signal the whole group — `npm start` spawns node children that a
# signal to the npm PID alone would orphan.
setsid bash -c "cd /app/backend && PORT=$BACKEND_PORT exec npm start" &
BACKEND_PID=$!
echo "[start] backend launching (pid group $BACKEND_PID) — npm start on :$BACKEND_PORT"

setsid nginx -g 'daemon off;' &
NGINX_PID=$!
echo "[start] nginx launching (pid group $NGINX_PID) on :$NGINX_PORT"

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
