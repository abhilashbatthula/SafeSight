# Development and testing

## Local setup

Run `pnpm setup:dev` from the repository root. This creates `.env` only when absent, installs the pinned Node and Python dependencies, starts the database, applies migrations, and initializes the workspace. It does not reset existing data.

`pnpm dev` starts the web client, API, inference service, and same-origin proxy. Logs are written under `.runtime/logs/`. Open `http://localhost:8080`; the standalone web port does not provide the API routes expected by the client.

| Command               | Purpose                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `pnpm setup:env`      | Create `.env` with generated credentials, preserving an existing file       |
| `pnpm db:migrate`     | Apply checked-in SQL migrations                                             |
| `pnpm db:init`        | Initialize a workspace and default location without replacing saved records |
| `pnpm db:generate`    | Generate a migration after a schema change                                  |
| `pnpm dev`            | Start the development application                                           |
| `pnpm health`         | Check the application and API                                               |
| `pnpm lint`           | ESLint and Prettier verification                                            |
| `pnpm format`         | Apply Prettier formatting                                                   |
| `pnpm typecheck`      | Generate Next.js route types and check all TypeScript projects              |
| `pnpm test:unit`      | Contract, inference-adapter, configuration, and publication-scanner tests   |
| `pnpm test`           | API/contract suite, Python inference tests, and setup/publication tests     |
| `pnpm test:e2e`       | Playwright application workflows                                            |
| `pnpm build`          | Build shared packages, API, and production web output                       |
| `pnpm check:secrets`  | Scan publishable files, reachable Git history, and frontend/log output      |
| `pnpm package:source` | Produce a clean source ZIP under `.runtime/releases/`                       |

`pnpm db:seed` remains an alias for `pnpm db:init` for existing local workflows.

## Unit checks without running services

The contract suite imports shared database configuration, so it needs a `DATABASE_URL` value even though it makes no database connection. With dependencies installed, use the generated `.env` or provide a placeholder:

```bash
DATABASE_URL=postgres://safesight:unused@127.0.0.1:5432/safesight pnpm test:unit
pnpm typecheck
pnpm lint
pnpm build
.venv/bin/python -m pip check
```

Python tests exercise structured validation, the HTTP provider adapter, and explicit quota failures against local fixtures. They do not require a Gemini key. Publication tests use temporary Git repositories; configuration tests verify credential consistency, file permissions, and preservation of existing files.

## API and browser integration

The API suite requires PostgreSQL, migrated tables, initialized workspace records, and the running application. To exercise inference jobs without live API quota, first stop normal `pnpm dev`. Keep the database running.

In terminal 1:

```bash
python3 tests/fixtures/gemini-server.py
```

In terminal 2:

```bash
GEMINI_API_KEY=test-fixture-only GEMINI_BASE_URL=http://127.0.0.1:8270 pnpm dev
```

In terminal 3, after `pnpm health` succeeds:

```bash
TEST_VISION_PROVIDER=mock pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm exec tsx --env-file-if-exists=.env scripts/verify-compose.ts
```

The HTTP fixture returns explicitly synthetic observations. Browser tests combine API fixtures with live workspace checks, including desktop/mobile navigation, file validation, equipment selection, machinery guidance, exports, settings drafts, and job polling. These checks verify software behavior, not recognition accuracy.

Stop both fixture processes when finished and restart normal `pnpm dev`. The environment overrides apply to the fixture process; they do not modify `.env`. Integration tests remove their temporary inspection records and image files.

## Build output and continuous integration

The web build writes `.next-production` separately from `.next` development output. Shared packages and the API write `dist` directories. These outputs, dependencies, logs, virtual environments, and test reports are ignored.

GitHub Actions runs secrets, lint, types, unit tests, dependency consistency, and production builds. It supplies a placeholder database URL and creates a Python environment. API/browser tests require running application services and are separate from this workflow.

## Source distribution

Run `pnpm package:source` from a Git checkout. The command checks secrets, then packages current tracked and untracked publishable files into `.runtime/releases/SafeSight-final.zip`. It omits Git metadata, local credentials, uploads, dependency installations, build output, and generated test reports.

Extract the ZIP before using it. The top-level `SafeSight/` directory contains the source project. To update a GitHub repository, upload or commit the extracted files; a ZIP committed as a file remains a downloadable archive rather than becoming the source tree.

## Troubleshooting

| Symptom                              | Check                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Database connection fails            | Docker engine is running; Compose database is healthy; `.env` password matches the existing volume |
| Web page loads but API requests fail | Open port `8080` through the proxy and check `.runtime/logs/api.log`                               |
| Analysis unavailable                 | Add a provider key, restart the app, and check inference configuration/quotas                      |
| Worker lock is already held          | Stop the other API process before starting another instance                                        |
| Browser executable missing           | Run `pnpm exec playwright install chromium`                                                        |
| Local port already in use            | Stop the existing service or align API/web/proxy port variables                                    |

[Back to README](../README.md)
