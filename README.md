# SafeSight — Smart Industrial Safety Analytics

A runnable college decision-support prototype: five facility zones, shared simulated environmental readings, timestamped private PPE inspections, human review, incidents, charts, CSV history and QR/mobile access. **No physical sensors or cameras.** Default PPE mode is **DEMO sample fixtures**, not real AI. Real PPE-trained weights and Cloudinary are optional integrations requiring configuration. This is not certified safety monitoring or a production deployment.

## Ubuntu / WSL2 development

This checkout lives at `/home/abhi/projects/SafeSight`. It preserves the original build prompt. Prerequisites: existing Docker Desktop WSL integration, Git, Node **24.21.0** with pnpm **12.8.1**, Python 3.13/3.14 with venv, and network access for dependencies. Do not install a second Docker daemon. If using nvm:

```bash
cd /home/abhi/projects/SafeSight
source "$HOME/.nvm/nvm.sh"
nvm install 24.21.0  # only if this version is absent
nvm use
corepack enable
corepack prepare pnpm@12.8.1 --activate
pnpm install --frozen-lockfile
pnpm setup:dev
pnpm dev
```

`setup:dev` generates `.env` only when absent, creates a Python virtual environment, installs pinned dependencies, generates the labeled samples, starts the dedicated PostgreSQL Docker container, applies tracked migrations, and seeds without erasing existing accounts/data. Database credentials and the private inference key are random. Existing host PostgreSQL and unrelated Docker containers are untouched. PostgreSQL publishes only **127.0.0.1:55432**. Raw demo history retains seven days.

Open **http://localhost:8080** through the same-origin streaming proxy. Direct port 3000 lacks `/api` and is not the application entry point. Logs: `.runtime/logs/{web,api,inference,proxy}.log`. Generated credentials: `.runtime/dev-credentials.json` (local permissions 0600, ignored by Git). Read that file locally:

```bash
cat .runtime/dev-credentials.json
pnpm health
```

Accounts: `admin@safesight.local` (Admin), `officer@safesight.local` (Safety Officer), `viewer@safesight.local` (Viewer). Passwords are generated once and are not committed or silently enabled in production. Seeder requires APP_MODE=development and non-production NODE_ENV. If accounts already exist, seeding will not reset their passwords. Existing database accounts cannot be recovered by deleting the credential file; use an explicit local administrator procedure instead.

Stop dev with Ctrl+C (all child process groups shut down). Database stays persistent. Stop it separately with:

```bash
docker compose --env-file .env -f infra/compose.yaml stop db
```

Never use `down -v` unless you intentionally want to destroy this project's database volume. Demo reset is an Admin action requiring typed confirmation, separate from startup.

## Commands and checks

```bash
pnpm db:migrate       # repeat-safe tracked Drizzle migrations
pnpm db:seed          # repeat-safe development seed
pnpm db:generate     # generate a migration after schema edits; review SQL
pnpm format
pnpm lint
pnpm typecheck
pnpm test            # live API integration + rule/security units + Python matching
pnpm exec playwright install chromium
pnpm test:e2e        # application must already be running
pnpm build           # backend + frontend production builds
.venv/bin/python -m compileall -q services/inference
.venv/bin/python -m pip check
```

For Chromium launch failures run `pnpm exec playwright install-deps chromium` only if the needed Ubuntu packages are missing. Run `pnpm test` against the development API: its isolated-facility reset check requires APP_MODE=development. API tests create and remove an isolated verification facility. Browser tests use seeded development users and create explicit fixture inspections. Production build uses `.next-production` so it does not collide with `.next` used by hot reload. See [actual results](docs/BUILD_STATUS.md).

Service addresses: application http://localhost:8080; health http://localhost:8080/api/health; Swagger http://localhost:8080/api/docs; OpenAPI http://localhost:8080/api/openapi.json. API 4000 and private inference 8001 bind only loopback by default. Browser sessions use HttpOnly cookies. Mutations require Origin and X-CSRF-Token from `/api/auth/me`; no session token is stored in URLs or localStorage.

## Environment fields

Copy `.env.example` only for a custom setup; normal setup generates matching random secrets. DATABASE_URL and POSTGRES_USER/PASSWORD/DB must point at the same dedicated database. API_PORT/HOST, WEB_PORT/HOST and PROXY_PORT/HOST control local services. STORAGE_DIR is a private server directory. INFERENCE_URL/KEY configure the private caller. INFERENCE_MODE is DEMO or REAL. APP_MODE=development enables explicit development seeding/reset; NODE_ENV=production refuses that mode. COOKIE_SECURE must be true for an HTTPS environment; the app also enables it when PUBLIC_APP_URL starts with HTTPS. INFERENCE_PYTHON optionally selects a separate real-model venv interpreter.

PUBLIC_APP_URL defaults empty. Staff QR and new guest links refuse localhost URLs and explain how to configure reachability. Facility timezone defaults Asia/Kolkata; stored dates are UTC. No Cloudinary or model secret uses NEXT_PUBLIC variables.

## Inference and storage adapters

DEMO works only for bundled samples: PPE inspections → Run equipped sample / Run review sample. Every result identifies DEMO, original schematic provenance and fixture model version. Uploading another valid photo records a FAILED inspection with a clear unavailable-model message; retry is capped at 3 total attempts. There is no silent fallback from REAL.

REAL: follow [evaluation/setup guidance](docs/EVALUATION.md) and [candidate provenance](docs/THIRD_PARTY.md). Supply licensed local PPE-trained weights, install optional CPU Ultralytics/PyTorch in a suitable venv, configure INFERENCE_MODE=REAL, MODEL_PATH (absolute), MODEL_VERSION, MODEL_LICENSE and MODEL_PROVENANCE. Startup validates person/human, helmet/hardhat and vest labels; generic COCO weights fail. Missing model configuration disables image inference while other modules keep working. No real accuracy is claimed without held-out evaluation.

Local storage works without paid services. Cloudinary: configure STORAGE_ADAPTER=cloudinary plus CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET. Uploads use authenticated image assets; the API fetches signed delivery internally and streams only after authorization. Browsers do not receive persistent public asset URLs. Authorized image deletion invalidates remote assets. This adapter is implemented but unverified without credentials.

## Full Compose path

Stop local `pnpm dev` before starting the Compose API: single-instance locking deliberately rejects two simulators. Both paths use the same PostgreSQL volume; Compose uses a separate image-storage volume. Compose uses APP_MODE=prototype and disables demo reset. Existing local-adapter image records point at local files, so transfer uploads after starting the destination services if those inspections must remain viewable.

```bash
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml build
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml up -d --wait
# If switching from local development, preserve its existing uploaded images:
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml exec api mkdir -p /app/.runtime/uploads
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml cp .runtime/uploads/. api:/app/.runtime/uploads/
# Only for a fresh development demonstration database, explicitly seed:
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml run --rm -e NODE_ENV=development -e APP_MODE=development api pnpm exec tsx scripts/seed.ts
# Inspect generated passwords inside the local uploads volume if seeded there:
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml exec api cat .runtime/dev-credentials.json
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml logs --tail=80
# Before switching back to local development, preserve new Compose uploads:
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml cp api:/app/.runtime/uploads/. .runtime/uploads/
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml stop
```

Compose runs built Next/Nest, FastAPI, PostgreSQL and Nginx with health checks and persistent volumes. Defaults publish only local web 8080 and local database 55432; inference/API are private to Docker. No GPU. The inference container is DEMO by default; for REAL extend its Dockerfile with optional model runtime and mount licensed weights, updating MODEL_PATH. Do not expose this local HTTP deployment publicly. HTTPS deployment/tunnel requires a user-approved environment and a TLS-aware trusted reverse-proxy configuration.

## Phone access from WSL2

Local Windows browser access commonly works through WSL localhost forwarding; it does not establish phone reachability. On a trusted private LAN, determine the Windows Wi-Fi/Ethernet LAN IPv4 address with `ipconfig`, set PROXY_HOST=0.0.0.0 and PUBLIC_APP_URL=http://WINDOWS_LAN_IPV4:8080, then restart dev. Keep API, inference and database bindings local. Do not use the WSL VM IP in a phone QR unless your network actually routes to it.

WSL mirrored networking may make this reachable directly, subject to Windows/Hyper-V firewall policy. With NAT WSL networking, a narrowly scoped port-forward may be needed. Run the following **only if needed**, in an elevated Windows PowerShell, replacing the distro name/address and using your current WSL IPv4. These commands are documented, not automatically executed:

```powershell
wsl -d Ubuntu hostname -I
# Replace WSL_IPV4 with the actual single IPv4 address from above.
netsh interface portproxy add v4tov4 listenaddress=WINDOWS_LAN_IPV4 listenport=8080 connectaddress=WSL_IPV4 connectport=8080
New-NetFirewallRule -DisplayName 'SafeSight private LAN 8080' -Direction Inbound -Action Allow -Protocol TCP -LocalAddress WINDOWS_LAN_IPV4 -LocalPort 8080 -RemoteAddress LocalSubnet -Profile Private
```

Scan Settings → QR on a phone on that same LAN, sign in normally, and compare persisted reading timestamps with the desktop. QR contains only a staff page URL. Optional guest links have scoped expiry/revocation and an opt-in image permission; their token is removed from the URL on exchange. Browser emulation is automated; **physical phone scanning is manually unverified** until you test it.

Remove the rules after your LAN demonstration:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=WINDOWS_LAN_IPV4 listenport=8080
Remove-NetFirewallRule -DisplayName 'SafeSight private LAN 8080'
```

Never disable the firewall. WSL IP can change after restart. If LAN routing/firewall policy blocks access, keep using the desktop or choose a user-approved HTTPS deployment/tunnel and configure the trusted proxy and secure cookies appropriately.

## Troubleshooting and handoff

`docker info` must report Docker Desktop. Connection refused on 55432: start db and inspect its health; a host database on 5432 is unrelated. Address in use: check `ss -ltnp`; stop only SafeSight processes or choose different web/API/proxy ports in `.env`. Browser loading/errors: use 8080, check proxy/web/API logs, verify INFERENCE_KEY and migrations. SSE reconnecting: verify proxy streaming, cookies and session expiry; a guest revoked/expired stream must disconnect. Public QR refused: configure a reachable non-localhost PUBLIC_APP_URL and restart. Login rate limits: wait one minute, do not disable security.

[Architecture](docs/ARCHITECTURE.md) · [Five-minute demonstration](docs/DEMO.md) · [Evaluation](docs/EVALUATION.md) · [Build checklist and test evidence](docs/BUILD_STATUS.md). Missing external inputs: licensed PPE weights/provenance and held-out images, Cloudinary credentials, reachable phone URL and manual physical phone verification. Optional outdoor context/PDF exports are not implemented.
