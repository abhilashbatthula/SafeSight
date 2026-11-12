# Configuration

Generate local configuration with `python3 scripts/create-env.py`, or let `pnpm setup:dev` create it. The generator preserves an existing file and creates new credentials with owner-only permissions. Never commit the generated `.env`.

## Vision provider

Set a server-side `GEMINI_API_KEY` from [Google AI Studio](https://aistudio.google.com/apikey). The default model is `gemini-3.1-flash-lite`. The adapter also accepts `gemini-2.5-flash` and `gemini-2.5-flash-lite` for projects that have access. Provider availability and quota are checked when an analysis runs; a ready health response only establishes local configuration readiness.

Review Google's current [pricing](https://ai.google.dev/gemini-api/docs/pricing), [quota documentation](https://ai.google.dev/gemini-api/docs/rate-limits), and [terms](https://ai.google.dev/gemini-api/terms). To use free-tier access, keep billing disabled on the provider project. SafeSight cannot inspect billing status. It does not automatically switch providers or upgrade a project's billing.

Photographs and supplied task context are sent to Google. Free-tier terms may permit submitted content to be used for product improvement. Choose photographs and a provider project appropriate to your data requirements. Keep the key out of `NEXT_PUBLIC_*` variables and browser code.

## Environment variables

| Variable                                                               | Purpose / default                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `NODE_ENV`                                                             | `development` locally; `production` in application containers        |
| `APP_MODE`                                                             | `development` locally; `workspace` in containers                     |
| `DATABASE_URL`                                                         | PostgreSQL connection; generated local credentials use port `55432`  |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`                    | Database container credentials; password must match `DATABASE_URL`   |
| `APP_FACILITY_ID`                                                      | Workspace UUID; defaults to the ID in `.env.example`                 |
| `WORKSPACE_NAME`                                                       | Initial name for a new workspace; default `SafeSight Workspace`      |
| `WORKSPACE_TIMEZONE`                                                   | Initial IANA time zone; default `UTC`                                |
| `GEMINI_API_KEY`                                                       | Provider key; required for new image analysis                        |
| `GEMINI_MODEL`                                                         | Default `gemini-3.1-flash-lite`                                      |
| `GEMINI_BASE_URL`                                                      | Google API base URL; loopback HTTP is supported for explicit testing |
| `INFERENCE_URL`                                                        | Private inference address; local default `http://127.0.0.1:8001`     |
| `INFERENCE_KEY`                                                        | Generated shared credential for API-to-inference calls               |
| `INFERENCE_MODE`                                                       | `REAL`; retained in health/configuration plumbing                    |
| `INFERENCE_PYTHON`                                                     | Optional local interpreter override; otherwise `.venv/bin/python`    |
| `STORAGE_ADAPTER`                                                      | `local` by default; optional `cloudinary`                            |
| `STORAGE_DIR`                                                          | Local private upload directory; default `.runtime/uploads`           |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Required only for the Cloudinary adapter                             |
| `API_HOST`, `API_PORT`                                                 | Local defaults `127.0.0.1:4000`                                      |
| `WEB_HOST`, `WEB_PORT`                                                 | Local defaults `127.0.0.1:3000`                                      |
| `PROXY_HOST`, `PROXY_PORT`                                             | Local defaults `127.0.0.1:8080`                                      |
| `PUBLIC_APP_URL`                                                       | Optional externally visible URL; HTTPS enables secure cookies        |
| `COOKIE_SECURE`                                                        | Set `true` when serving over HTTPS                                   |

Initialization uses the workspace name/time zone only for new records. Run `pnpm db:init` after migrations. Repeated runs preserve existing names, preferences, and inspections. Change an existing workspace's preferences through Settings.

Restart local services after editing `.env`. The local inference listener uses port `8001`; changing `INFERENCE_URL` alone does not move that listener. Compose supplies internal service addresses separately.

## Image handling and storage

Accepted input: JPEG, PNG, or WebP; maximum 8 MB and 20 megapixels; minimum 32 × 32 pixels. Animated images are rejected. Every selected image creates a separate inspection request.

The API normalizes images and strips metadata. Local image files use private filesystem permissions and are retrieved through session-protected API endpoints. The optional Cloudinary adapter uses authenticated images and signed delivery. Cloudinary operation requires separate credentials and verification in your environment.

An empty required-equipment list requests an inventory. A populated list permits up to 20 unique item names, each up to 100 characters. Optional activity/machine context is limited to 1000 characters and is retained with the inspection and reanalysis.

[Back to README](../README.md)
