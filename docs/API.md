# REST API v1

Application base `/api` through the same-origin proxy. Live generated OpenAPI: `/api/openapi.json`; Swagger UI: `/api/docs`. Shared request schemas and result types: `packages/contracts/src/index.ts`. API version 1 is returned by health and the contract package.

Every authenticated route uses an HttpOnly cookie. GET `/auth/me` returns the session's CSRF value. Mutations must include `Origin` equal to the app origin and `X-CSRF-Token`; login and guest exchange require the same Origin without an existing CSRF token. Cookies are never provided in URL parameters. Unauthorized requests return 401, role/scope/CSRF denial 403, invalid input 400, invalid state 409 and unavailable adapters 503. Errors use `{error:{status,message}}`; unexpected internal details are kept in server logs.

| Method       | Route                       | Behavior / access                                                                                    |
| ------------ | --------------------------- | ---------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------- |
| GET          | `/health`                   | Database health, inference readiness/mode; public                                                    |
| POST         | `/auth/login`               | `{email,password}`; rate limited; sets cookie                                                        |
| GET / POST   | `/auth/me`, `/auth/logout`  | Current permitted scope / revoke current session                                                     |
| GET          | `/dashboard`                | Authoritative facility snapshot, freshness, incidents, recent inspections, review denominator        |
| GET          | `/facilities/:id/dashboard` | Explicit membership check; cross-facility denied                                                     |
| GET          | `/events`                   | Authorized SSE ready/change/heartbeat; expires and revokes during connection                         |
| GET          | `/readings`                 | `zoneId`, `range=1h                                                                                  | 24h | 7d`, `page`, `limit` (≤100); raw persisted history |
| GET          | `/history`                  | `zoneId`, `range`; downsampled aggregates with source/scale and bucket size                          |
| GET / PATCH  | `/rules`, `/rules/:id`      | Staff reads; Admin updates metric/threshold/consecutive/hysteresis/recoveryReadings/severity/enabled |
| PATCH        | `/zones/:id/ppe`            | Admin sets helmetRequired, vestRequired, alertsEnabled; original evidence retained                   |
| POST         | `/simulation`               | Admin; `{zoneId,scenario,running}`; normal/temperature/aqi/recovery/interrupted                      |
| POST         | `/simulation/reset`         | Development Admin only; `{confirmation:"RESET DEMO"}`; scoped destructive action                     |
| GET / POST   | `/inspections`              | Paginated status/zone filter; staff reads, Admin/Officer upload multipart zoneId + image             |
| GET          | `/inspections/:id`          | Scoped detail, immutable inference result, append-only review history                                |
| GET / DELETE | `/inspections/:id/image`    | Private authorized delivery; Admin/Officer deletion after job finishes                               |
| POST         | `/inspections/:id/retry`    | Failed job only, retained image, <3 total attempts                                                   |
| POST         | `/inspections/:id/reviews`  | Admin/Officer; exact original person references, helmet/vest state and required note                 |
| GET          | `/alerts`                   | Paginated status/zone filter; condition and incident state separate                                  |
| GET          | `/alerts/:id`               | Scoped evidence and action audit                                                                     |
| POST         | `/alerts/:id/actions`       | Admin/Officer; acknowledge/resolve/note, required note, explicit override when condition active      |
| GET / PATCH  | `/settings`                 | Staff reads non-secret settings; Admin changes facility name and IANA timezone                       |
| GET          | `/qr`                       | Staff, optional zoneId; actual QR data URL and configured staff page payload; rejects localhost      |
| GET          | `/samples/:name`            | Staff, equipped/review original DEMO schematics only                                                 |
| GET          | `/exports/:kind`            | Staff; readings/inspections/incidents CSV with same zone/time filters; ≤10,000 rows                  |
| GET / POST   | `/shares`                   | Admin lists metadata or creates scoped link; token returned once in URL fragment                     |
| DELETE       | `/shares/:id`               | Admin revokes link and invalidates existing guest live connections                                   |
| POST         | `/shares/exchange`          | Same-origin `{token}`; validate hash/scope/expiry/revocation and create scoped cookie                |

Review states: detected, potential_missing, unknown. In a submitted human review, potential_missing confirms a snapshot violation; unknown never implies compliance. Original DEMO/REAL result remains unchanged. Boxes are normalized-image xyxy pixel coordinates; every result records source dimensions, person references, classes, scores, model version/mode and elapsed time.

All object IDs are UUIDs and scope-checked. Never fetch images from arbitrary submitted URLs. The private FastAPI `/health` and `/infer` require X-Inference-Key and are not exposed through the browser proxy.
