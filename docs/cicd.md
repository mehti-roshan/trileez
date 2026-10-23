# CI/CD

GitHub Actions tests every pull request and every push. A successful push to `main` builds the API and panel images, publishes them to GitHub Container Registry, and updates the VPS. The VPS no longer needs a GitHub token for `git pull`.

MongoDB and SeaweedFS stay on the VPS. Their named volumes are not rebuilt.

## What runs

| Event | Tests | Publish images | Update VPS |
| --- | --- | --- | --- |
| Pull request | Yes | No | No |
| Push to `main` | Yes | Yes | Yes |
| Workflow dispatch on `main` | Yes | Yes | Yes |

Images:

- `ghcr.io/<owner>/<repo>/server:<git-sha>` and `:latest`
- `ghcr.io/<owner>/<repo>/web:<git-sha>` and `:latest`

## One-time VPS setup

The VPS still needs Docker Compose, `compose.yaml`, and a filled `.env`. It does not need a git checkout after this is working.

1. Install Docker Engine and the Compose plugin.
2. Create the deploy directory, for example `/opt/trileez`.
3. Copy `compose.yaml` into that directory once. Later deploys overwrite it.
4. Copy `.env.docker.example` to `.env` in the same directory and replace every placeholder. Keep `AUTO_SEED=false`.
5. Create a dedicated SSH key that can log in and run Docker:

```bash
ssh-keygen -t ed25519 -f trivix-deploy -N ''
# install trivix-deploy.pub on the VPS, then store trivix-deploy as VPS_SSH_KEY
```

The key's user must be able to run `docker` and `docker compose` without a TTY password. Adding the user to the `docker` group is enough.

6. Open GitHub → repo → Settings → Secrets and variables → Actions, and add:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS hostname or IP |
| `VPS_USER` | SSH user |
| `VPS_SSH_KEY` | Full private key, including `BEGIN` / `END` lines |
| `VPS_DEPLOY_PATH` | Absolute path that contains `compose.yaml` and `.env` |
| `GHCR_TOKEN` | Optional. Classic PAT with `read:packages` if the VPS cannot pull with the workflow `GITHUB_TOKEN` |

SSH port: add a **repository variable** (Settings → Secrets and variables → Actions → **Variables**), not an Environment variable and not a secret:

| Variable | Value |
| --- | --- |
| `VPS_SSH_PORT` | `9011` (or your SSH port) |

`VPS_PORT` as a variable or secret is also accepted. The deploy log line `Using SSH port …` shows which value was picked.

7. Push this branch to `main`, or run **Actions → CI/CD → Run workflow**.

Each deploy writes `.env.images` and `compose.override.yaml` in `VPS_DEPLOY_PATH`. The `compose.yaml` already on the VPS is left in place. Those two generated files are gitignored.

`GITHUB_TOKEN` is often empty on the VPS. Create a classic PAT with `read:packages` and store it as secret `GHCR_TOKEN`.

## Manual commands on the VPS

After a CI deploy, restart or inspect with the same image tags:

```bash
cd /opt/trileez
docker compose --env-file .env --env-file .env.images ps
docker compose --env-file .env --env-file .env.images logs -f server web
```

Do not run `docker compose up --build` on the VPS for routine releases. GitHub already built the images with the public npm registry. A local rebuild uses the Liara npm mirror inside the Dockerfiles and is only for emergency recovery.

## GitHub Container Registry

Packages are private when the repository is private. Each deploy logs the VPS into `ghcr.io` with the short-lived `GITHUB_TOKEN` from that workflow run, so you do not store a second GitHub token on the server.

If a pull is denied, confirm the `server` and `web` packages on GitHub → Packages are linked to this repository.

## Agent

The desktop agent is tested on Linux in CI. It is not deployed to the VPS. Windows WPF publish stays a local Windows-machine step; see `apps/agent/deploy/DEPLOYMENT.md`.
