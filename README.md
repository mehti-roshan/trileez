# Trilez panel

Persian RTL organization panel built as a MERN application:

- React + TypeScript + Vite frontend
- Express + TypeScript API with JWT authentication and permission checks
- MongoDB persistence
- SeaweedFS private S3-compatible object storage for uploaded files
- Nginx production frontend and API reverse proxy

## Run the full stack with Docker Compose

Docker Compose starts the web app, API, MongoDB, and SeaweedFS with persistent named volumes and container health checks.

```bash
cp .env.docker.example .env
# Replace every `replace-with-...` value and example domain before starting the stack.
docker compose up --build -d
docker compose ps
```

Production startup fails closed when required settings are missing, use placeholder secrets, enable the mock database, use memory storage, or enable automatic demo seeding. Generate independent random values for `JWT_SECRET`, `PROJECT_ACCESS_ENCRYPTION_KEY`, `MONGO_ROOT_PASSWORD`, and `S3_SECRET_KEY`; do not reuse one secret for another purpose. URL-encode MongoDB credentials when placing them in `MONGO_URI`.

Local endpoints:

- Panel: `http://localhost`
- Liveness: `http://localhost/api/health/live`
- Readiness: `http://localhost/api/health/ready`
- Prometheus-format metrics: `http://localhost/api/metrics`

The edge Nginx reverse proxy is the only published host port. The panel, API, MongoDB, Redis, and SeaweedFS stay on the Compose network. Browser API requests use the same-origin `/api` route.

Infrastructure services (MongoDB, Redis, SeaweedFS, edge Nginx) live in `infra.yaml` and are pulled in from `compose.yaml`.

Production does not create demo users. After the stack is healthy, create the first administrator once with transient bootstrap values:

```bash
export BOOTSTRAP_ADMIN_EMAIL=admin@your-company.example
export BOOTSTRAP_ADMIN_NAME='System administrator'
read -rsp 'Initial admin password: ' BOOTSTRAP_ADMIN_PASSWORD && export BOOTSTRAP_ADMIN_PASSWORD
docker compose run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL \
  -e BOOTSTRAP_ADMIN_NAME \
  -e BOOTSTRAP_ADMIN_PASSWORD \
  api npm run bootstrap-admin
unset BOOTSTRAP_ADMIN_PASSWORD
```

The command assigns a generated MongoDB ObjectId as the organization id, enforces the backend password policy, is safe to retry for the same active administrator, records an audit entry, and forces a password change on first login. It never prints the password. Keep `AUTO_SEED=false` in production.

## Seed an internally testable MVP

For local/internal testing, set `SEED_ADMIN_EMAIL` and a password that satisfies the backend password policy in `.env`, then run the one-shot seed service:

```bash
docker compose --profile tools run --rm --build seed
```

The seed is relationship-aware and idempotent. It upserts a connected company dataset into MongoDB, including users/employees, customers, projects, project roles/members/phases, tasks, time entries, meetings, events, CRM, finance, contracts, payroll, HR, tickets, notifications, and real file objects plus metadata in SeaweedFS. Running the command again updates the same natural-key/deterministic records instead of duplicating them. Existing matching user passwords are intentionally preserved; all newly inserted seed users use the password supplied through `SEED_ADMIN_PASSWORD`, which is only hashed in MongoDB.

The seed finishes with a relationship-integrity check and reconciles the organization storage quota with active file metadata. To also execute the complete seed twice and verify that the second run does not add or replace any organization-owned record identities, run:

```bash
docker compose --profile tools run --rm --build seed node dist/seed.js --verify-idempotency
```

The frontend does not import or upload this data. It reads the seeded records through the normal authenticated API, so an unavailable API or database still produces the normal loading/error/empty behavior instead of a mock fallback. `AUTO_SEED` remains disabled; explicit seeding is preferred so production startup never creates demo data unexpectedly.

Useful commands:

```bash
docker compose logs -f api frontend nginx
docker compose restart api
docker compose down
```

`docker compose down` preserves MongoDB, Redis, and SeaweedFS data. Adding `--volumes` deletes those volumes and should only be used when a full local reset is intended.

The containers are intentionally small: multi-stage Alpine Node images, an Alpine Nginx runtime, an explicit single-node `weed mini -dir=/data -admin.port=22646` SeaweedFS service, capped log files, health checks, and conservative memory limits. SeaweedFS readiness is checked through the master status endpoint rather than the credential-protected S3 root. MongoDB and SeaweedFS are the only stateful services.

## CI/CD

GitHub Actions tests the API, panel, and Linux desktop agent on every pull request. A successful push to `main` SSHs to the VPS, clones `~/trileez` if it is missing, resets it to that commit, and runs `docker compose up --build`.

Secrets are in [docs/cicd.md](docs/cicd.md).

## Production operations

The API writes one structured JSON object per log line to stdout/stderr. Request logs include bounded HTTP metadata, latency, status, request ID, and correlation ID; password, token, credential, and secret fields are recursively redacted. Security-sensitive authentication and authorization decisions are emitted as `security_event` records and durable business audit records remain in MongoDB.

Clients may send valid `X-Request-ID` and `X-Correlation-ID` values. The API generates missing or malformed IDs and returns both response headers, so logs and error responses can be traced across requests. Nginx forwards these headers.

`/api/health/live` only confirms that the process is alive. `/api/health/ready` checks runtime state, MongoDB with an active ping, and object storage; it returns HTTP 503 before dependencies are ready and during shutdown. `/api/health` remains a backward-compatible readiness alias. `/api/metrics` exposes bounded Prometheus text metrics for HTTP traffic, latency, active requests, process memory/uptime, security events, jobs, and unexpected errors. Restrict the metrics path at the deployment ingress when it should not be internet-visible, or set `METRICS_ENABLED=false`.

MongoDB and object-storage initialization use bounded exponential retry with jitter. `SIGTERM`/`SIGINT` first remove the process from readiness, stop new HTTP work, drain jobs and connections, disconnect MongoDB, and then exit. Relevant controls are `STARTUP_MAX_ATTEMPTS`, `STARTUP_RETRY_BASE_MS`, `DEPENDENCY_TIMEOUT_MS`, `SHUTDOWN_TIMEOUT_MS`, `MONGO_MAX_POOL_SIZE`, `TRUST_PROXY_HOPS`, and `LOG_LEVEL`.

## Local development without Docker

Backend:

```bash
cd apps/api
cp .env.example .env
npm install
npm run dev
```

Frontend:

```bash
cd apps/frontend
cp .env.example .env
npm install
npm run dev
```

The local API defaults to an in-memory database and in-memory object storage. Those modes are rejected when `NODE_ENV=production`. To exercise real persistence, use Compose or configure `MONGO_URI`, `USE_MOCK_DB=false`, `STORAGE_DRIVER=s3`, and the S3 variables in `apps/api/.env`.

## File storage

Files are never stored inside ordinary employee, project, meeting, or document records. The API stores file metadata in MongoDB and the binary object in a private SeaweedFS S3 bucket. Downloads are streamed through authenticated API routes so the bucket does not need public access.

The file manager, business-document attachments, and optional meeting documents use this backend upload path. Uploads are streamed through restricted temporary files rather than buffered in server memory, MIME type is detected from content, and checksums and object size are verified. The API enforces a default 10 MiB per-file limit and 1 GiB organization quota, rejects active/executable content, validates attachment relationships, records sensitive access and lifecycle audit events, and enforces private/workspace/project/customer visibility rules without disclosing inaccessible file IDs.

Deletion is recoverable and idempotent at the storage-provider layer. The recurring cleanup job retries failed deletions, removes untracked SeaweedFS objects after a grace period, detects missing objects, and reconciles organization quota usage. Configure `MAX_UPLOAD_BYTES`, `ORGANIZATION_STORAGE_QUOTA_BYTES`, and `UPLOAD_ORPHAN_GRACE_MINUTES` to change the defaults.

## Validation

```bash
cd apps/api
npm run typecheck
npm test

cd ../frontend
npm run build
```

See [apps/api/README.md](apps/api/README.md) for the API route overview.

## Employee desktop agent

The cross-platform employee desktop lives in [apps/agent](apps/agent). On Linux, restore, build, test, and run it with:

```bash
cd apps/agent
export DOTNET="${DOTNET:-$HOME/.dotnet/dotnet}"
export DOTNET_ROOT="${DOTNET_ROOT:-$HOME/.dotnet}"
./scripts/linux/dev.sh all
./scripts/linux/dev.sh run
```

See [apps/agent/README.md](apps/agent/README.md) for API URL configuration, the feature matrix, and Windows publish notes.
