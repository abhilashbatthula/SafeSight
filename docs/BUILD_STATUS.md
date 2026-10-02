# SafeSight build status

The supplied build document is the specification, interpreted under the user's explicit request to implement and verify. Original prompt preserved. No prior application or Git repository existed.

## Environment inspection — 2026-10-02

WSL2 Ubuntu 26.04.1, Python 3.14.4, existing nvm Node 24.21.0, pnpm 12.8.1, Docker Desktop 29.8.1 / Compose 5.5.1. Existing host PostgreSQL 18 on 5432 left untouched. Dedicated project PostgreSQL 18 container on loopback 55432. Project stays in the user's selected Ubuntu directory. No global runtime was upgraded. Python uses `.venv`. No Windows firewall or public publishing action was performed.

## Implementation checklist

- [x] Inspect environment, instructions and existing work
- [x] Pinned pnpm workspace, lockfile, environment templates and local secrets
- [x] Drizzle schema, two tracked migrations, idempotent seed and generated credentials
- [x] Scrypt sessions, CSRF, login/upload rate limits, roles and facility authorization
- [x] Central persisted simulator, threshold delay, hysteresis/recovery, stale handling and incidents
- [x] Streaming SSE, heartbeats, continuous access checks, reconnect fetch and cleanup
- [x] Private image signature/pixel validation, orientation normalization, queued atomic jobs, bounded retries
- [x] FastAPI DEMO exact fixtures and optional REAL PPE-trained YOLO integration
- [x] Conservative person/PPE association, responsive overlays, immutable originals and review history
- [x] Operational desktop/mobile UI, charts, histories, working incident/simulation/settings controls
- [x] Configurable environmental and per-zone PPE requirements; safe explicit demo reset
- [x] Scoped CSV exports, actual QR generation and optional hashed expiring/revocable guest sessions
- [x] Setup/dev/health commands, Dockerfiles, full Compose configuration and required documentation
- [x] Final verification after dependency/security updates and fixes
- [x] Full Compose runtime and restart persistence checks

## Completed milestone evidence

1. `pnpm setup:dev` succeeded: dependency installation, Python venv, fixture generation, dedicated Docker database, migrations and seed. Existing data was preserved. Generated credentials are in ignored `.runtime/dev-credentials.json` with permissions 0600.
2. `pnpm typecheck` and `pnpm build` initially passed for all workspace packages and Next/Nest builds.
3. Initial `pnpm test`: **13 Node tests passed, 8 Python tests passed**. Live tests cover sessions/logout, roles, cross-facility denial, CSRF, shared persisted readings, valid/invalid uploads, fixture completion, arbitrary-image failure, immutable reviews, bounded retry, threshold delay, deduplication, stale critical preservation, recovery, incident resolution, exports, guest scope, guest revocation on an already-open SSE connection, and expired-link denial.
4. Browser verification discovered and fixed the local proxy's missing Next HMR WebSocket forwarding. Shutdown was fixed to terminate entire child process groups. Production output now uses `.next-production` separately from development `.next`.
5. Subsequent browser runs passed inspection review/logout, two-client synchronized readings/reconnect, simulator/settings and secret-bundle checks. All six permitted views passed **390px horizontal-overflow checks**. The mobile menu dismissal test found a blocked pointer target; an actual visible close button and inert hidden navigation fixed it. A test locator was tightened to wait for inspection detail rather than an existing table status.
6. All full Compose images built successfully. PostgreSQL, FastAPI, NestJS, Next.js and Nginx subsequently passed all five container health checks. Fixed container startup's assumption that an ignored `.env` exists in the image and the sample endpoint's working-directory-dependent fixture path. All four browser workflows passed against the full Compose stack.
7. Dependency audit identified vulnerable Multer/Sharp pins. Updated to Multer 2.4.0 and Sharp 0.35.5, refreshed lockfile. `pnpm audit --prod`: **No known vulnerabilities found**. FastAPI/Pillow/Uvicorn/multipart/Starlette demo runtime updated and exact Python lock refreshed. This is not a general production security certification.
8. Final refinements validate the private inference response contract, preserve critical zone condition even after a workflow override, serialize short database transactions for reset/worker consistency and add configurable helmet/vest/PPE-alert requirements.
9. Actual API restart acceptance passed: previously committed reading IDs, immutable original inspection result, incident status and current scenario run IDs survived. An intentionally abandoned fixture job recovered and completed on attempt two. Only the probe's own job/incident rows were removed afterward.
10. Actual QR/guest browser acceptance passed with a temporary documentation-only address (`http://192.0.2.10:8080`): PNG decoded to the configured zone URL; an endpoint-created link stored only a token hash, exchanged its fragment for a scoped session, removed the token from the address bar, showed one permitted zone and returned to login after revocation. This verifies payload/session behavior, not network reachability or a physical scan. Default PUBLIC_APP_URL remains empty.

## Final verified results — 2026-10-02

- `pnpm lint`: ESLint and Prettier passed.
- `pnpm typecheck`: strict TypeScript checks passed for every workspace and scripts.
- `pnpm build`: Nest/backend and optimized Next production builds passed.
- `pnpm test`: **17 Node tests passed, 0 failed; 8 Python tests passed** against the fresh development API. Includes live roles/scope/CSRF, queued jobs and retries, immutable reviews, configurable PPE requirements, delayed/deduplicated rules, stale critical preservation, recovery/workflow, CSV, guest expiry/revocation during SSE, logout and scoped reset.
- `pnpm test:e2e`: **4 passed** against development (42.6 seconds); **4 passed** against full Compose (26.7 seconds). Includes desktop review/audit/logout, all six viewer pages at 390px without horizontal overflow, two clients with matching persisted readings/reconnect, and Admin settings/scenarios/unconfigured QR.
- Python `compileall` and `pip check`: passed; no broken requirements.
- `pnpm audit --prod`: no known vulnerabilities found at verification time.
- `scripts/check-secrets.py`: no configured secret or generated password found in **52 frontend JS/log files**. Browser-loaded bundles also checked for the inference key.
- Full Compose: **5/5 services healthy**, browser workflows and actual API restart/job recovery passed; local/Compose uploads transferred to preserve inspection images.
- `pnpm health`: app **200**, API **200**, inference mode **DEMO**, ready with `schematic-fixtures-v1`.
- Repeated `pnpm setup:dev`: frozen-lock install, existing venv, sample generation, database health, migrations and conflict-safe seeding all passed without erasing existing accounts or inspection history.

The WSL development application is left running at http://localhost:8080. Compose application containers are stopped; the dedicated PostgreSQL container remains running. Screenshots are ignored local artifacts in `.runtime/`.

## External integration blockers

- No licensed local PPE-trained weights, reproducible dataset provenance or held-out photographs supplied. REAL integration implemented; **real-model inference/accuracy unverified**. Investigated author-hosted model candidates are documented in THIRD_PARTY.md. No generic COCO substitution or automatic fixture fallback.
- No Cloudinary account credentials. Private upload/delivery/deletion adapter implemented; **cloud integration unverified**.
- PUBLIC_APP_URL is empty by default. QR/new guest links correctly explain configuration; configured QR decoding and endpoint-created guest browser sessions were verified with a temporary test address. **Physical phone scan and Windows LAN/firewall routing remain manually unverified**.
- Optional outdoor context and PDF export intentionally not implemented; core environmental data and CSV exports work locally.

## Commands

`pnpm setup:dev`, `pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm health`. Python: `.venv/bin/python -m unittest discover -s services/inference/tests`, `compileall`, `pip check`. Full Compose: `docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml ...`.

Application: http://localhost:8080 through same-origin proxy. Logs: `.runtime/logs/`. Do not use direct Next port 3000 as the application entry point. See README for exact setup, adapter and LAN access instructions.
