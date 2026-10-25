# Trilez panel API

This is the TypeScript MERN backend backbone for the panel. It exposes Express routes, Mongoose schemas, JWT authentication, role/permission authorization, MongoDB persistence, and authenticated SeaweedFS object storage through its S3-compatible API.

## Run it

```bash
cd apps/api
cp .env.example .env
npm install
npm run dev
```

Development runs the TypeScript entry point directly with `tsx`. For a production-style run:

```bash
npm run build
npm start
```

Useful validation commands:

```bash
npm run typecheck
npm test
```

The API starts on `http://localhost:4000`; the in-memory database and object store are enabled by default for local development. Set `MONGO_URI`, `USE_MOCK_DB=false`, and `STORAGE_DRIVER=s3` to use MongoDB and SeaweedFS. The root `compose.yaml` supplies the service wiring, but deployment secrets and origins must be provided in `.env` from `.env.docker.example`.

Demo credentials:

- `admin@trileez.ir` / `Admin123!`
- `manager@trileez.ir` / `Manager123!`

Never use these credentials outside local development. Mock users are not created in production, `AUTO_SEED=true` is rejected in production, and there are no default production credentials.

## Persistent MVP seed data

The root Compose project includes an explicit, one-shot `seed` service for MongoDB/SeaweedFS environments:

```bash
docker compose --profile tools run --rm --build seed
```

Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in the root `.env` first. The password must satisfy the regular application password policy. The command refuses to use the in-memory database, initializes the object-storage bucket, and exits after the seed completes.

The application seed uses natural keys and deterministic IDs, preserves relationships, and can be run repeatedly without duplicate rows. Existing user password hashes are not overwritten. Newly inserted seed users share the supplied internal-test seed password; only its bcrypt hash is persisted. Seed files are real private storage objects with matching `FileRecord` metadata, not metadata-only placeholders.

## Deployment configuration

On production startup, the API validates its environment and refuses to start with mock persistence, memory object storage, missing MongoDB configuration, placeholder or reused cryptographic secrets, default storage credentials, automatic seeding, invalid URLs, invalid email addresses, or malformed numeric/boolean settings.

The main runtime settings are:

- `JWT_SECRET` and `PROJECT_ACCESS_ENCRYPTION_KEY`: independent random secrets of at least 32 characters.
- `MONGO_URI`, `MONGO_MAX_POOL_SIZE`, and `USE_MOCK_DB=false`: persistent database configuration.
- `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_PORT`, `S3_USE_SSL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_BUCKET`: SeaweedFS/S3 configuration.
- `CLIENT_ORIGIN` and `TRUST_PROXY_HOPS`: browser origin and the exact number of trusted reverse-proxy hops.
- `LOG_LEVEL`, `METRICS_ENABLED`, `SERVICE_NAME`, and `APP_VERSION`: observability identity and verbosity.
- `DEPENDENCY_TIMEOUT_MS`, `STARTUP_MAX_ATTEMPTS`, and `STARTUP_RETRY_BASE_MS`: bounded dependency startup retry/backoff.
- `SHUTDOWN_TIMEOUT_MS`: maximum HTTP/job drain time during graceful shutdown.
- `EMAIL_FROM` and optional HTTPS `EMAIL_DELIVERY_WEBHOOK_URL`: delivery identity/provider.

To create the first production administrator, build the application and run the explicit one-time command with `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and optional `BOOTSTRAP_ADMIN_NAME`. The command assigns a generated MongoDB ObjectId as the organization id:

```bash
npm run build
npm run bootstrap-admin
```

The command requires MongoDB, applies the normal password policy, hashes the password, creates an append-only audit record, and marks the credential for change on first login. It does not log the password and is idempotent when the same active administrator already exists.

## Operations and observability

- `GET /api/health/live` is a dependency-free liveness check.
- `GET /api/health/ready` checks runtime shutdown state, performs a MongoDB ping, checks object storage, and returns HTTP 503 when unavailable.
- `GET /api/health` is the backward-compatible readiness alias.
- `GET /api/metrics` returns Prometheus text metrics when `METRICS_ENABLED=true`.

Logs are JSON lines on stdout/stderr. Requests receive `X-Request-ID` and `X-Correlation-ID`; valid incoming IDs are preserved and invalid/missing IDs are generated. The same IDs appear in request logs and centralized JSON error responses. Sensitive keys are redacted, request bodies are not logged, and authentication/authorization denials generate structured security events.

The HTTP process handles `SIGTERM` and `SIGINT` by becoming unready, closing idle connections, draining in-flight jobs and HTTP work, disconnecting MongoDB, and enforcing `SHUTDOWN_TIMEOUT_MS`. MongoDB and object-storage startup use bounded exponential backoff with jitter.

## Backbone routes

Operational health/metrics endpoints and the authentication entry/reset endpoints are public. Business, audit, job, file, user, and resource routes enforce authentication plus server-owned permissions. Restrict `/api/metrics` at the ingress if it should only be available to monitoring systems.

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST/PATCH /api/users`, `POST /api/users/:id/password-reset`
- `GET/POST/PATCH/DELETE /api/employees`
- `GET/POST/PATCH/DELETE /api/projects`
- `GET/POST/PATCH/DELETE /api/tasks`
- `GET/POST/PATCH/DELETE /api/meetings`
- `GET/POST/PATCH/DELETE /api/project-events`
- `GET/POST/PATCH/DELETE /api/performance/events`
- `GET/POST/PATCH/DELETE /api/performance/periods`
- `GET /api/dashboard/summary`
- `GET/POST /api/files`
- `GET/PATCH/DELETE /api/files/:id`
- `GET /api/files/:id/content`
- `GET /api/jobs`, `GET /api/jobs/stats`, `GET /api/jobs/:id`
- `POST /api/jobs/reports`, `POST /api/jobs/:id/retry`, `DELETE /api/jobs/:id`
- `GET/POST/PATCH /api/jobs/recurring`

`POST /api/files` accepts one multipart field named `file` plus optional relationship and visibility fields. File metadata is stored in `FileRecord`; object bytes are stored in the private `S3_BUCKET`. The content route streams authenticated downloads without exposing storage credentials or making the bucket public.

The remaining panel collections use the generic persisted resource API while
their dedicated domain schemas are being expanded:

- `GET/POST/PATCH/DELETE /api/data/:resource/:id`
- `POST /api/data/:resource/bulk`

These resources include customers, tickets, finance records, recruitment,
documents, project execution metadata, notifications, goals, payroll, and
other panel-owned collections. They are stored in MongoDB through the
`LegacyEntity` collection when Mongo mode is enabled, and in the mock database
when mock mode is enabled.

The frontend Vite config proxies `/api` to port `4000`, and `apps/frontend/src/services/apiClient.ts` provides the typed fetch wrapper for login, session, and resource calls. The existing mock repositories remain available while each panel area is migrated incrementally.

## Background jobs

Background work is persisted in MongoDB rather than held in process memory. Jobs use atomic leases, heartbeat renewal, bounded retry with backoff, organization scoping, idempotency keys, and retained result/error state for observability. The API process runs the worker by default, which keeps local and lightweight deployments simple.

Implemented handlers currently cover:

- notification creation;
- meeting reminder fan-out to notifications and email delivery jobs;
- open monthly performance-period refresh;
- file checksum and stored-size verification after upload;
- expired authentication/reset-token and old job cleanup;
- JSON and CSV report generation into authenticated file storage;
- persisted recurring schedules.

Email uses the development `logged` transport unless `EMAIL_DELIVERY_WEBHOOK_URL` is configured. Webhook calls include the job ID as an `Idempotency-Key` header. A standalone worker can be run when process separation or additional capacity is useful:

```bash
npm run build
npm run worker
```

When a standalone worker is used, point it at the same MongoDB and object-storage configuration. The leasing model permits multiple workers without intentionally executing the same active lease twice. Relevant tuning variables are `JOBS_ENABLED`, `JOB_POLL_INTERVAL_MS`, `JOB_CONCURRENCY`, `JOB_LEASE_SECONDS`, and `JOB_RETENTION_DAYS`.

Quick smoke test:

```bash
curl http://localhost:4000/api/health/live
curl http://localhost:4000/api/health/ready
curl http://localhost:4000/api/metrics
curl -X POST http://localhost:4000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@trileez.ir","password":"Admin123!"}'
```

The login example is for the local mock database only.
