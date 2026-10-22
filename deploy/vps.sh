#!/usr/bin/env bash
# Pull pre-built panel images and recreate the public services.
# MongoDB and SeaweedFS volumes are left in place.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: deploy/vps.sh

Required environment:
  GHCR_USER       GitHub username that can pull the packages
  GHCR_TOKEN      Token with read:packages (CI passes GITHUB_TOKEN)
  IMAGE_PREFIX    Example: ghcr.io/mehti-roshan/trileez
  IMAGE_TAG       Git SHA or latest

Optional:
  DEPLOY_DIR      Directory that contains compose.yaml and .env (default: cwd)
  COMPOSE_BIN     docker compose command (default: docker compose)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

: "${GHCR_USER:?GHCR_USER is required}"
: "${GHCR_TOKEN:?GHCR_TOKEN is required}"
: "${IMAGE_PREFIX:?IMAGE_PREFIX is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"

DEPLOY_DIR="${DEPLOY_DIR:-.}"
cd "$DEPLOY_DIR"

if [[ ! -f compose.yaml ]]; then
  echo "compose.yaml was not found in $PWD" >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  echo ".env was not found in $PWD. Copy .env.docker.example and fill production secrets first." >&2
  exit 1
fi

COMPOSE_BIN="${COMPOSE_BIN:-docker compose}"
SERVER_IMAGE="${IMAGE_PREFIX}/server:${IMAGE_TAG}"
WEB_IMAGE="${IMAGE_PREFIX}/web:${IMAGE_TAG}"

umask 077
cat > .env.images <<EOF
SERVER_IMAGE=${SERVER_IMAGE}
WEB_IMAGE=${WEB_IMAGE}
EOF

echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

compose() {
  $COMPOSE_BIN --env-file .env --env-file .env.images "$@"
}

compose pull server web
if compose up -d --no-build --remove-orphans --wait --wait-timeout 120 server web; then
  :
else
  compose up -d --no-build --remove-orphans server web
fi

WEB_PORT="$(awk -F= '/^WEB_PORT=/{print $2; found=1} END{if(!found) print "80"}' .env | tail -n 1)"
WEB_PORT="${WEB_PORT:-80}"

ok=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health/live" >/dev/null \
    && curl -fsS "http://127.0.0.1:${WEB_PORT}/health" >/dev/null; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  echo "The stack started but health checks did not pass on port ${WEB_PORT}." >&2
  compose ps
  compose logs --tail=80 server web
  exit 1
fi

echo "Deployed ${SERVER_IMAGE} and ${WEB_IMAGE}"
compose ps
curl -fsS "http://127.0.0.1:${WEB_PORT}/api/health/live"
echo
