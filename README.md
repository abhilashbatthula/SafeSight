# SafeSight

An account-free image inspection workspace with a Windows 95 interface. Upload photographs, inventory each person's visible PPE, clothing and equipment, check a chosen equipment list, analyze visible machinery for hazards, precautions and operator PPE, and save inspection reports. The desktop provides Human analysis, Machinery analysis, Inspection history and Settings icons.

## Local setup

Requires Node 24.21.0, pnpm 12.8.1, Python 3.14 with venv, and Docker for PostgreSQL.

Development scripts use Bash and a Unix-style Python environment. On Windows, run them in WSL. Install the pinned pnpm version with `npm install -g pnpm@12.8.1` if needed.

```bash
pnpm install --frozen-lockfile
pnpm setup:dev
```

Create a free API key in [Google AI Studio](https://aistudio.google.com/apikey). Use a project with **billing disabled** to remain on the free tier. Add it locally to `.env`:

```dotenv
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-3.1-flash-lite
```

```bash
pnpm dev
```

Open **http://localhost:8080** through the same-origin proxy; port 3000 alone does not provide the API. Setup generates database/service secrets, applies migrations and initializes the workspace without creating accounts. Existing records remain intact. Restart after changing `.env`.

[Google pricing](https://ai.google.dev/gemini-api/docs/pricing) lists Gemini 3.1 Flash-Lite image input and text output as free on the free tier, subject to quota and availability. No paid subscription is needed. The app does not upgrade billing, switch providers, or fall back to paid models. It cannot inspect your Google project's billing status: keep billing disabled. Quota exhaustion fails explicitly; retry later.

Images are sent to Google. Under free-tier terms, submitted content may be used to improve Google's products. Check these terms before submitting private photographs.

## Windows 95 desktop

The home page opens a teal desktop. Click an application icon once or launch it from Start. Human analysis is a photo inspector with a file list, large zoomable preview and work-activity field. Required equipment opens a small Windows-style dialog; an empty checklist inventories all visible equipment. Machinery analysis has a separate task-focused assessment brief beside its photograph, with an assessment focus, task and machine/model. Expand Material & work environment when needed. Operator PPE is recommended automatically. Each application retains its own upload state; analysis actions remain visible. Saved inspections appear only in History, while the current upload batch shows live status and progress. Inspection history, Settings and results open in separate windows. The classic font is bundled locally with its free license.

Drag a title bar to move a window, use the corner to resize it, and use the top-right buttons to minimize, maximize/restore or close it. Double-clicking a title bar toggles maximize. Taskbar buttons switch to another window, restore a minimized window or minimize the active one. Start → Show desktop minimizes all windows. Uploads, selected files and form inputs survive minimizing and switching applications; closing a window discards its unsaved form state. Saved server inspections remain accessible in History. Reloading the page starts a fresh desktop, reopening the application addressed by the URL.

The bottom-right clock shows current time and date in the workspace time zone. Click it for Date / Time Properties and the time-zone settings shortcut. Custom local pixel cursors cover arrows, links, text and window dragging. On narrow screens, applications fill the work area while the taskbar and clock remain reachable. Printing includes the active inspection window.

Routes: `/` desktop, `/human`, `/machinery`, `/history`, `/settings`, and `/inspections/:id`. Keyboard controls: Tab/Enter for icons and taskbar, Ctrl+Escape for Start, Alt+F9 minimize, Alt+F10 maximize/restore, Alt+F4 close. Escape dismisses Start or Date / Time Properties.

## Inspection workflow

Open Human analysis or Machinery analysis, then:

1. Browse or drop JPEG, PNG or WebP files: up to 8 MB and 20 MP each, minimum 32 × 32. Animated images are rejected.
2. In Human analysis, open Required equipment to select items or add custom names if you need per-person checks. An empty checklist requests an inventory only. Choices do not restrict which visible items are inventoried. Machinery analysis recommends operator PPE automatically.
3. Describe the work activity in Human analysis, or choose the assessment focus and fill in known task/model details in Machinery analysis. Expand Material & work environment for additional context. Leave unknown details blank. Context applies to every image in the batch and is saved with the inspection.
4. Analyze. Each image receives a separate persistent job and record. The current batch shows queued, analyzing, complete or failed status; completed records remain in History even after clearing the file list.
5. Open a result and switch between people to see worn equipment/clothing, carried equipment, uncertain identifications, required-item checks and visibility notes. Machinery is analyzed automatically, including photos without people. Switch between machines for visible versus typical hazards, recommended/task-dependent/avoid-during-operation wearables, and before-use, operation, maintenance/isolation and emergency precautions.
6. Filter machine precautions by work phase when useful; printing and JSON reports include every phase. Download a JSON report or print the inspection. Reports retain machinery guidance and the supplied context.

Images are oriented, composited to white when transparent and stripped of metadata. Provider images are bounded to 2048 pixels on the longest side. No fabricated bounding boxes or confidence percentages are displayed. Hidden equipment stays uncertain; visible boots do not establish safety-toe certification. A scene without identifiable people cannot establish PPE compliance.

Machinery guidance is preliminary: a photograph cannot establish every hazard or replace the manufacturer manual, task risk assessment and competent operator training. Model/identity uncertainty, missing information and confirmation questions remain visible. Operator PPE recommendations are separate from equipment observed on a person. Rotating-machine prompts address glove/loose-wearable entanglement and response validation rejects unconditional glove recommendations when entanglement risk is flagged. Earlier AI inventories remain readable; Analyze again adds machinery analysis to a new record.

Results keep the source photograph and commands fixed; only Safety analysis scrolls. Analysis-limitations and visual-review panels are removed. History shows People and Machinery counts side by side.

**Analyze again** copies a retained photo into a new inspection, preserving earlier results and reviews. Removing a photo retains its analysis and review history. Failed jobs allow up to three explicit attempts. Earlier detector results are labelled and can be reanalyzed with AI.

## Configuration

The server-side Gemini key must never be exposed in NEXT_PUBLIC variables. The default is gemini-3.1-flash-lite. Legacy settings gemini-2.5-flash and gemini-2.5-flash-lite remain supported for projects with access; [Google restricts 2.5 models to prior active users](https://ai.google.dev/gemini-api/docs/deprecations). Check pricing before changing models. Configuration readiness does not verify authentication; provider access and quota are checked on analysis.

Settings is a compact Windows 95 properties dialog for workspace name and IANA time zone, with a clock preview and OK/Cancel/Apply controls. Gemini configuration and setup details appear in a collapsible group. APP_FACILITY_ID selects the workspace. Local private image storage is the default; an optional Cloudinary adapter requires separate credentials. Anyone who can reach the app can use this shared workspace. HttpOnly anonymous sessions, origin/CSRF checks and facility boundaries remain; individual reviewer identity is unavailable by design. Services bind to loopback by default. Use a network access boundary for a shared deployment, and COOKIE_SECURE=true with HTTPS.

The active stack is Next.js, NestJS, PostgreSQL/Drizzle and private FastAPI inference. Trained PPE detectors, model downloads, simulator, incident workflows, charts, QR and roles have been removed. Legacy database tables and historical results remain for data compatibility.

## Verification

With the app/database running:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
pnpm health
.venv/bin/python -m pip check
python3 scripts/check-secrets.py
```

`pnpm test:unit` runs the contract, Python inference and publication-scanner tests without running the app, database or a live AI provider. Install dependencies first; provide `.env` from setup or a placeholder `DATABASE_URL` for module initialization. `pnpm test` additionally exercises the running API.

GitHub Actions runs secret scanning, lint, type checking, unit tests and production builds on pushes and pull requests. API/browser integration requires running services.

Python tests exercise the real HTTP adapter against a local provider fixture, structured inventory validation and quota failures without consuming API quota. Browser fixtures exercise inventory/report/reanalysis states; other checks use the live workspace. The normal API suite skips provider-dependent jobs.

To exercise provider-dependent API jobs without live quota, run `python3 tests/fixtures/gemini-server.py` in one terminal. In another, start the app with:

```bash
GEMINI_API_KEY=test-fixture-only GEMINI_BASE_URL=http://127.0.0.1:8270 pnpm dev
```

Once services are ready, run `TEST_VISION_PROVIDER=mock pnpm test` and `pnpm test:e2e`. Stop the test provider and app afterward, then restart normal `pnpm dev` to restore live inference. The provider returns explicit synthetic observations; it does not assess image-recognition accuracy.

Without a key, saved inspections remain accessible and new analysis is disabled with setup instructions. PPE and machinery accuracy still require representative photographs and competent human review. Compare inventories and guidance with labelled images, manufacturer manuals and task-specific assessments; record the model and prompt version when evaluating results.

Logs are in .runtime/logs/. Secrets, uploads, screenshots and generated artifacts are ignored by Git. Production builds use .next-production separately from development output.

## Docker

Configure the free-tier key, then stop local services before starting Compose:

```bash
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml build
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.full.yaml up -d --wait
```

Inference installs lightweight Python dependencies and receives the key server-side. API startup applies migrations. Seed a fresh workspace using development variables. Compose and local development use different private upload locations; transfer photos when switching deployments.

## Repository layout

| Path                  | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `apps/web/`           | Next.js desktop interface                                |
| `apps/api/`           | NestJS REST API and persistent job worker                |
| `packages/contracts/` | Shared types and validation schemas                      |
| `packages/db/`        | PostgreSQL schema and complete migration history         |
| `services/inference/` | Private FastAPI service and server-side vision adapter   |
| `infra/`              | Dockerfiles, Compose services and reverse proxy          |
| `scripts/`            | Setup, migration, seeding, health and publication checks |
| `tests/`              | Contract, API, browser and explicit provider fixtures    |

OpenAPI documentation is served at `http://localhost:8080/api/docs` while the app is running. The UI bundles the WIN95FA font; its license and attribution are included in [public/fonts](apps/web/public/fonts/). Upstream dependency licenses apply to their respective packages.

## Upload to GitHub

Run `pnpm check:secrets` before committing. It checks tracked and untracked publishable files, all reachable Git history, and local frontend/log output for configured secret values and common credential formats. It reports paths and rule names without printing credentials. This is a bounded check, not an exhaustive security audit.

The repository excludes `.env`, private uploads and logs in `.runtime/`, dependencies, virtual environments, downloaded models, build output and test artifacts. Keep `.env.example`, the lockfiles, all migrations, test fixtures and bundled font licenses.

After signing in with `gh auth login`, configure HTTPS authentication, then create and upload a private repository from the project root. The first two commands set GitHub CLI's upload protocol and Git credential helper for this machine:

```bash
gh config set git_protocol https --host github.com
gh auth setup-git --hostname github.com
git add .
git diff --cached --stat
git commit -m "Prepare SafeSight for GitHub"
git branch -M main
gh repo create SafeSight --private --source=. --remote=origin --push
```

Use `--public` if you want the repository to be publicly visible. For later changes, commit them and run `git push`.
