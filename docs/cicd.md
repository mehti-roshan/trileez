# CI/CD

On a push to `main`, GitHub tests the API, panel, and Linux agent, then SSHs to the VPS as `deployment` and runs:

```bash
cd
if [ ! -d trileez ]; then
  git clone https://github.com/<owner>/trileez.git trileez
fi
cd trileez
git fetch origin
git reset --hard <commit>
docker compose --env-file .env up -d --build
```

## Secrets

| Secret | Value |
| --- | --- |
| `VPS_HOST` | VPS hostname or IP |
| `VPS_USER` | `deployment` |
| `VPS_SSH_KEY` | private key for that user |

Repository variable `VPS_SSH_PORT` if SSH is not on 22.

Keep a filled `.env` in `~/trileez` on the VPS. Optional `GIT_TOKEN` if clone/fetch needs a PAT.
