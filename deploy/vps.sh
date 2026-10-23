#!/usr/bin/env bash
# Point the existing VPS compose.yaml at GHCR images and recreate server/web.
set -eu

: "${GHCR_USER:?}"
: "${GHCR_TOKEN:?}"
: "${SERVER_IMAGE:?}"
: "${WEB_IMAGE:?}"

DEPLOY_DIR="${DEPLOY_DIR:-.}"
cd "$DEPLOY_DIR"
test -f compose.yaml
test -f .env

umask 077
printf 'SERVER_IMAGE=%s\nWEB_IMAGE=%s\n' "$SERVER_IMAGE" "$WEB_IMAGE" > .env.images
printf '%s\n' 'services:' '  server:' '    image: ${SERVER_IMAGE}' '  web:' '    image: ${WEB_IMAGE}' > compose.override.yaml

printf '%s\n' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
timeout 6m docker compose --env-file .env --env-file .env.images pull server web
docker compose --env-file .env --env-file .env.images up -d --no-build --remove-orphans server web
docker compose --env-file .env --env-file .env.images ps
