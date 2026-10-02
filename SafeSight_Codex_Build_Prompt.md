# SafeSight: Codex implementation prompt

You are my senior full-stack engineer. Build a complete, runnable college project named **SafeSight — Smart Industrial Safety Analytics** in my **WSL2 Ubuntu** development environment. Implement the application, execute it, test the important workflows, and fix problems. Do not stop after producing a plan, scaffolding, or a static UI.

## 1. Working instructions

- First inspect the working directory, repository instructions, Git status, and existing tooling. Preserve unrelated work and secrets. If this is an existing project, extend it instead of overwriting it.
- If starting fresh, use `~/projects/safesight` inside the Ubuntu filesystem. Do not put a new repository under `/mnt/c` by default.
- Check Node, pnpm, Python, Docker/Compose, and PostgreSQL availability. Use compatible, supported stable versions; consult official documentation for version-sensitive setup. Pin dependencies and commit lockfiles. Do not blindly upgrade the user's global tools.
- Use a Python virtual environment. Do not install Python packages into the system interpreter. If Docker Desktop already provides WSL integration, use it rather than installing another Docker daemon.
- Make ordinary reversible implementation decisions autonomously. Ask only for a genuinely blocking requirement, missing external credential, destructive action, or required permission. Never bypass access controls. Never purchase services or publish publicly without authorization.
- Maintain a short implementation plan and update `docs/BUILD_STATUS.md` after milestones with completed work, commands, test outcomes, remaining tasks, and exact blockers. Continue beyond each milestone without asking whether to proceed.
- Build working vertical slices before expanding scope. Avoid placeholder buttons, fake success messages, invented detection accuracy, and claims of verification that did not occur.
- If external services are unavailable, complete the remaining application using explicit local/demo adapters. Document the precise steps for enabling real integrations. A demo adapter does not count as successful real-model verification.

## 2. Purpose and scope

Create an industrial safety decision-support prototype with uploaded-image PPE inspections, live simulated temperature/humidity/AQI, facility-wide monitoring, incident management, historical analytics, and QR access on a phone.

There are **no physical sensors or industrial cameras**. Temperature, humidity, and zone AQI are simulated. Uploaded-image analysis is genuine only when an actual PPE-trained model runs. Outdoor API data is geographic context, not indoor measurement. Make those distinctions visible in the product.

Seed one facility with five zones: Production Floor, Welding Area, Warehouse, Loading Bay, and Chemical Storage. Start with helmet and high-visibility vest requirements; other PPE classes are optional future extensions.

## 3. Required stack and structure

- Next.js App Router, React, TypeScript with strict mode.
- Tailwind CSS and real shadcn/ui components.
- Recharts, TanStack Query, React Hook Form, and Zod where useful.
- NestJS REST API with validation, Swagger/OpenAPI, and Server-Sent Events (SSE).
- PostgreSQL with Drizzle ORM and Drizzle Kit migrations.
- Cloudinary for configured image storage, plus an explicit local development storage adapter.
- Python FastAPI inference service and a PPE-trained YOLO-compatible detector. Do not substitute a generic COCO model and claim PPE support.
- pnpm workspace; keep architecture simple. No Kafka, Kubernetes, mandatory Redis, or unnecessary microservices.

Use a structure similar to:

    apps/web              Next.js frontend
    apps/api              NestJS backend
    services/inference    FastAPI/model service
    packages/contracts    Shared API contracts, no server secrets
    packages/db           Drizzle schema and migrations; backend only
    infra                 Docker and proxy configuration
    scripts               Setup, development, seeding, health checks
    docs                  Architecture, setup, API, demo and evaluation

Keep business rules and database access in NestJS. Python performs inference only. The browser never connects directly to PostgreSQL or the private inference service.

## 4. Authentication and authorization

Implement login/logout and server-side sessions using secure password hashing and HttpOnly cookies. Use secure cookies in HTTPS environments, appropriate SameSite configuration, CSRF protection for mutations, and rate limiting for login/uploads.

Roles: Admin manages facility settings/rules/simulation; Safety Officer uploads/reviews inspections and manages incidents; Viewer reads permitted information. Enforce facility membership and roles on the backend, including SSE, images, exports, and share links.

Provide development seed accounts. Generate/document local credentials without committing real passwords. Demo accounts and demo mode must not silently become production defaults.

Prefer a same-origin `/api` path through a streaming-capable local reverse proxy. Verify SSE is not buffered or prematurely terminated. Do not place session tokens in URLs or browser localStorage.

## 5. Dashboard and UI

Create a polished industrial operations dashboard: dark navy/slate navigation, light content background, teal accents, restrained amber/red severity colors, readable typography, consistent spacing, and accessible status labels. Support desktop and mobile, including a 390px-wide viewport. Avoid decorative landing pages; open directly into the operational application after login.

Implement Dashboard, Zones/Zone Detail, PPE Inspections/Inspection Detail, Alerts/Incident Detail, Analytics/Reports, Simulation Controls, and Settings/QR Access.

Dashboard content:
- Summary cards for zones in warning/critical state, open alerts, recent inspections, reviewed PPE findings, and freshness.
- Clickable zone tiles or a simple floor-layout view, with normal/warning/critical/unknown states.
- Temperature and AQI charts, time-range filters, latest readings, live connection status, and timestamps.
- Recent PPE inspections with image thumbnails and review state.
- Alert feed and incident workload.

Never show missing data as zero or safe. Display stale/unknown state independently of active alerts; stale data must not hide an unresolved critical alert. Treat image inspections as timestamped snapshots, not continuous worker monitoring. For PPE percentages, define the denominator and report uncertain/unreviewed cases separately.

Provide loading, empty, error, retry, validation, and disconnected states. Use labels/icons as well as color. All visible actions must work.

## 6. Environmental simulator and live updates

Run one centrally controlled server-side simulator, not a timer in each browser. Generate a shared set of zone readings every five seconds with seeded, bounded, gradual variation.

Support normal operation, rising temperature, AQI deterioration, recovery, and interrupted readings. Admins can start/stop a scenario for a selected zone and reset demo data through an explicit confirmation. Stop/restart operations must not create duplicate schedulers.

Persist zone ID, temperature in Celsius, humidity percent, simulated AQI, AQI scale, observedAt, receivedAt, source, and simulation run ID. Label AQI as a single declared scale, such as simulated US AQI. Never mix scales or claim it is Indian AQI.

Use clearly labeled configurable demonstration limits. Explain that these rules are not certified occupational exposure limits. Do not infer complete heat safety from temperature alone or complete air safety from AQI.

Use SSE to send committed readings, alerts, and inspection-state changes to authorized clients. Provide heartbeats, connection cleanup, reconnect behavior, and a fresh authoritative dashboard fetch after reconnection. Start the generator independently of client connections. The desktop and phone must display matching persisted readings.

Bound retained raw demo history and downsample historical chart queries so the database and UI do not grow indefinitely. Store dates as UTC/timestamptz; display facility timezone and use Asia/Kolkata for the seeded facility.

Optional after the core works: Open-Meteo outdoor weather/AQI panel, visibly separate from zone readings. Cache requests, preserve provider timestamps, attribute the source, handle outages, and avoid frequent polling that implies finer temporal resolution than the source provides.

## 7. Image upload and actual PPE inference

Implement JPEG/PNG/WebP uploads with file-signature checks, size/pixel limits, orientation normalization, and useful errors. Do not accept arbitrary remote URLs for server-side fetching. Use protected image delivery; signed uploads alone do not make images private. Keep all Cloudinary secrets server-side and allow authorized image deletion.

Workflow:
1. Select a zone and upload an image.
2. Store it using the configured adapter and create a QUEUED inspection.
3. A backend worker claims it and changes status to PROCESSING.
4. Send trusted image bytes to the private inference service with a timeout.
5. Detect persons, helmets, and vests; associate equipment with each person.
6. Save findings and model metadata, mark COMPLETED, and notify clients.
7. On failure, mark FAILED with a useful message and controlled retry.

Use a small PostgreSQL-backed job loop for the single-instance assignment deployment, with atomic job claiming, bounded retries, and recovery of abandoned work. Do not run expensive inference inside an open upload request. Document the single-instance assumptions.

Return bounding boxes in a documented coordinate system, source image dimensions, classes, confidence, person references, model version, inference mode, and processing time. Render aligned, responsive overlays in the frontend; account for EXIF orientation and image scaling. Clearly document and test the person-to-PPE matching method. Ambiguous matches require review.

For every person, distinguish detected PPE, potential missing PPE, and unknown/not visible. Cropping, occlusion, low confidence, or failure to detect a person must not imply compliance or proven missing equipment. Use person labels within the image, not face recognition or identity claims.

Allow a Safety Officer to confirm/correct findings and add notes. Preserve the original model result and a review audit trail. Potential findings can create review alerts; confirmed violations remain distinguishable.

Implement two explicit inference modes:
- REAL: Load licensed, PPE-trained weights from a configurable local path. Validate the label map on startup; run CPU inference by default. Document model/dataset provenance, license, setup, limitations, and optional fine-tuning/evaluation commands. Investigate a legitimate ready-to-use model first; if unavailable, supply the real inference/training integration and report the missing weights honestly.
- DEMO: Use clearly labeled fixture results only for matching bundled sample images with documented provenance. Never return fixture predictions for arbitrary uploads. For other images without working weights, show that real inference is unavailable. Never silently fall back from REAL to DEMO.

Make the rest of the application demonstrable without paid accounts or GPU access. Mark any unverified real model/cloud integration as incomplete in the final handoff.

## 8. Alert rules and incident workflow

Implement configurable per-zone rules for temperature/AQI breaches over consecutive readings or duration, stale readings, and PPE findings. Use hysteresis/recovery duration to prevent flapping and deduplicate active alerts per zone/rule/source condition.

Track condition state separately from incident workflow. Incidents move OPEN → ACKNOWLEDGED → RESOLVED. Acknowledgment is not recovery. Prevent unexplained resolution of an active condition, or require an explicit audited override. Recovery updates the condition while retaining incident history.

Store severity, evidence, opening time, acknowledger, assignee if used, actions/notes, recovery time, and resolution reason. Persist state across restart. Enforce deduplication under concurrent processing at the database level where appropriate.

## 9. QR and mobile access

Generate actual QR codes containing facility or zone page URLs. Scanning on a phone opens the responsive application and live stream. Staff authenticate normally. QR codes do not contain passwords, desktop sessions, or the entire dataset.

Add optional read-only guest links with cryptographically random tokens, stored token hashes, facility/zone scope, expiry, revocation, and configurable access to inspection images. Do not expose account/admin data. Exchange a link token for a scoped session and remove it from the address bar; avoid token leakage to logs/referrers. SSE must enforce expiry/revocation throughout the connection, not only on initial load.

Configure a user-reachable PUBLIC_APP_URL. Never generate phone QR links containing localhost. If no reachable URL is configured, explain how to configure one rather than displaying a broken code.

Document separate WSL2 local-browser and phone-access procedures. Explain that LAN access depends on WSL networking, host binding, Windows firewall, and network configuration. Do not assume the WSL VM IP is phone-reachable. Provide narrowly scoped Windows-side commands only when needed; never disable the firewall. An HTTPS deployment/tunnel is an optional user-approved alternative, not an automatic public exposure. State that physical phone scanning remains manually verified unless actually tested.

## 10. Data and API design

Create migrations for users, sessions, facilities, memberships, zones, readings, inspections/jobs, detections, reviews, rules, alerts, alert actions, simulation runs, and optional share links. Use foreign keys, timestamps, useful constraints, and indexes on facility/zone/time/status. Add idempotent development seeds; keep destructive reset separate from normal startup.

Document REST endpoints with OpenAPI. Include dashboard snapshot, facility events, paginated/filterable reading history, inspection upload/detail/review/retry, alerts and actions, simulation controls, settings, and share links. Validate all requests and return consistent safe errors. Version contracts when needed.

CSV exports must work for readings, inspections, and incidents, honor permissions and filters, and escape spreadsheet-formula injection. PDF export is optional after the core is complete.

## 11. WSL2 developer experience

Supply `.env.example`, `.gitignore`, version/lock files, Dockerfiles and Compose configuration with persistent volumes and health checks. Do not embed real secrets. Default container port publishing should avoid exposing databases/inference publicly.

Provide a development path with PostgreSQL in Docker and hot-reloading services in Ubuntu, plus a reproducible full Compose path where practical. Do not require GPU support.

Provide working root commands such as `pnpm setup:dev`, `pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, and `pnpm build`. Document Python and Compose equivalents and any prerequisites. Setup should be idempotent and must not erase user databases.

README: exact Ubuntu commands from a fresh checkout, environment fields, Cloudinary/model setup, demo accounts, startup/shutdown, service URLs, health checks, logs, common WSL port/Docker problems, QR configuration, and how to switch demo adapters to real services. A missing optional integration should not crash unrelated modules.

## 12. Verification and definition of done

Run formatting/lint, TypeScript checks, backend/frontend builds, Python checks, migrations, and meaningful tests. Use Playwright where supported for end-to-end/browser checks. Test rules, authorization, persistence, uncertain detections, and user workflows rather than mirroring implementation details.

Required checks:
- Login/logout and role restrictions, including unauthorized cross-facility access.
- Seeded zones, persisted readings, scenario controls, threshold delay, deduplication, recovery, and stale state.
- Two browser clients see matching server readings; reconnect fetches current state.
- Uploaded valid/invalid images, queued/processing/completed/failed states, retry limits, responsive overlays, and review history.
- Real inference on representative held-out images if weights are available; fixture tests never substitute for real accuracy measurement.
- QR payload uses the configured URL; mobile viewport has no horizontal overflow.
- Guest expiry/revocation, including an already-open live connection if guest links are implemented.
- Data persists across restart; exports work; no secret is included in frontend bundles or logs.

If browser tooling or external credentials are missing, record the exact unperformed checks and complete the others. Do not claim production readiness or certified safety monitoring.

Provide `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `docs/EVALUATION.md`, and `docs/BUILD_STATUS.md`. Include a five-minute demonstration: normal readings → PPE inspection → temperature event → matching mobile dashboard → acknowledge → recovery → export history.

In your final handoff, report implemented features, commands and URLs to run it, actual checks/results, remaining credentials/model setup, and any manual phone verification. Distinguish complete features from integrations awaiting configuration.

**Start by inspecting my environment, then implement the application. Do not return only another project plan.**
