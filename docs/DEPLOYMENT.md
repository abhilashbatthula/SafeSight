# Deployment

SafeSight runs as a single shared workspace with one API/worker instance. Docker Compose provides PostgreSQL, private inference, API, web, and Nginx services. The included proxy binds to loopback by default.

## First launch with Docker

From the project root, create local configuration using Python:

```bash
python3 scripts/create-env.py
```

Set `GEMINI_API_KEY` in `.env`. Optionally set the initial `WORKSPACE_NAME` and `WORKSPACE_TIMEZONE`. The generated database password and inference credential are already populated. Keep this file outside version control.

Stop the local development application before using the same host port with Compose:

```bash
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml up -d --build --wait
```

Open `http://localhost:8080`. API startup applies migrations and initializes a new workspace automatically before accepting requests. Repeated initialization preserves existing records. Missing provider configuration still permits the application to start; new analysis remains unavailable until configured.

The application images install all pinned dependencies and compile the Node workspace. Initial builds require network access. The database and API health checks establish service readiness; inference health checks verify configuration without consuming provider quota.

## Operations

```bash
# Service status
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml ps

# Application logs
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml logs --tail=100 api inference web proxy

# Stop services while preserving persistent volumes
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml down
```

Keep the same Compose project name when resuming an installation so it uses the same volumes. `down -v` removes those volumes and their saved data; it is not part of normal shutdown.

## Persistence and backups

PostgreSQL uses the `db-data` volume. Normalized images use the `uploads` volume. Both are needed to recover a complete local-storage installation. Preserve `.env` credentials securely alongside a documented backup/restore procedure. Do not include private photos or database dumps in the source repository.

Development uses `.runtime/uploads` on the host, while Compose uses a named image volume. Switching runtimes requires moving retained photos together with the matching database records. The optional Cloudinary adapter changes image storage requirements and needs verification with your own credentials.

## Shared access and HTTPS

Anyone who can reach SafeSight can join the shared workspace. Anonymous cookies and CSRF checks do not provide individual user authentication. For shared deployment, place the application behind an appropriate network or identity boundary. Configure HTTPS termination, set `PUBLIC_APP_URL` to the external HTTPS URL, and use `COOKIE_SECURE=true`.

Preserve the external host and forwarded protocol through trusted proxies, and test session creation, protected mutations, image access, and the event stream through the final URL. The supplied local setup has been exercised; public-domain TLS, access control, backups, and Cloudinary need environment-specific acceptance checks.

Do not run multiple API replicas: the persistent worker deliberately acquires a single-instance advisory lock. Browser scalability, representative model accuracy, and sustained provider throughput require separate evaluation.

[Back to README](../README.md)
