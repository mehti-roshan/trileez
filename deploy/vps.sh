#!/usr/bin/env bash
set -eu
EXPECTED_SHA="${EXPECTED_SHA:-origin/main}"
REPO="${REPO:-mehti-roshan/trileez}"
GIT_TOKEN="${GIT_TOKEN:-}"
export GIT_TERMINAL_PROMPT=0

cd
git_auth() {
  if [ -n "$GIT_TOKEN" ]; then
    git -c "url.https://x-access-token:${GIT_TOKEN}@github.com/.insteadOf=https://github.com/" "$@"
  else
    git "$@"
  fi
}

if [ -d trileez ]; then
  cd trileez
elif [ -d /home/deployment/trileez ]; then
  cd /home/deployment/trileez
else
  git_auth clone "https://github.com/${REPO}.git" trileez
  cd trileez
fi
git_auth fetch origin
git reset --hard "$EXPECTED_SHA"
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
