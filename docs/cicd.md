# CI/CD

On a push to `main`, GitHub tests the API, panel, and Linux agent, then SSHs to the VPS (any user) and runs:

```bash
cd "$HOME"
if [ ! -d trileez ]; then
  git clone https://github.com/<owner>/trileez.git trileez
fi
cd trileez
git fetch origin
git reset --hard <commit>
cp "$HOME/.env" .env
docker compose --env-file .env up -d --build
```

Keep the production `.env` in the SSH user's home directory (`~/.env`). The job copies it into `~/trileez/.env` before Compose starts.

## Secrets

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS hostname or IP |
| `VPS_USER` | SSH user (whoever owns `~/trileez` and `~/.env`) |
| `VPS_SSH_KEY` | private key for that user |

Repository variable `VPS_SSH_PORT` if SSH is not on 22.

Keep a filled `.env` in the SSH user's home (`~/.env`). Optional `GIT_TOKEN` if clone/fetch needs a PAT.
