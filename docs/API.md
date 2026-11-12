# API reference

All paths below are relative to `/api` on the application origin. Local interactive documentation is available at [localhost:8080/api/docs](http://localhost:8080/api/docs); the generated OpenAPI document is at `/api/openapi.json`.

## Sessions and mutations

`GET /auth/me` creates or returns the anonymous workspace session. Its JSON response includes `workspace`, `facility`, `csrf`, and `allowImages`. Retain the HttpOnly session cookie. For mutations, also send the application's exact `Origin` and the returned value in `X-CSRF-Token`.

There are no login credentials or individual reviewer identities. Session, origin, CSRF, and facility checks apply to workspace operations. The health endpoint is unauthenticated.

## Endpoints

| Method | Path                         | Purpose                                                  |
| ------ | ---------------------------- | -------------------------------------------------------- |
| GET    | `/health`                    | Database availability and nonsecret inference readiness  |
| GET    | `/auth/me`                   | Session, workspace preferences, and CSRF token           |
| GET    | `/workspace`                 | Default inspection location and inference status         |
| GET    | `/events`                    | Session-validated server-sent events and heartbeats      |
| GET    | `/inspections`               | Paginated, searchable inspection history                 |
| POST   | `/inspections`               | Upload an image and enqueue analysis                     |
| GET    | `/inspections/:id`           | Saved result, job state, and review history              |
| GET    | `/inspections/:id/image`     | Retained normalized photograph                           |
| DELETE | `/inspections/:id/image`     | Remove a finished photo while retaining its result       |
| POST   | `/inspections/:id/retry`     | Retry a failed job with fewer than three attempts        |
| POST   | `/inspections/:id/reanalyze` | Copy the retained image into a new inspection            |
| POST   | `/inspections/:id/reviews`   | Append review findings and a note                        |
| GET    | `/settings`                  | Workspace preferences, storage adapter, inference status |
| PATCH  | `/settings`                  | Update workspace name and IANA time zone                 |
| GET    | `/exports/inspections`       | Download bounded CSV history                             |

### Uploads

`POST /inspections` accepts multipart form data:

| Field               | Format                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `image`             | One JPEG, PNG, or WebP file; 8 MB, 20 MP, minimum 32 × 32; no animation                                |
| `zoneId`            | UUID returned by `/workspace`                                                                          |
| `requiredEquipment` | Optional JSON-encoded array of up to 20 unique names, 100 characters each; use `[]` for inventory only |
| `operationContext`  | Optional task, model, material, or environmental description; up to 1000 characters                    |

Legacy `helmetRequired` and `vestRequired` string fields remain accepted. New clients should send the explicit `requiredEquipment` array. A successful upload returns HTTP 201 with `{ "id": "...", "status": "QUEUED" }`.

### History and exports

History query parameters: `page` (zero-based), `limit` (1–100; default 30), `status`, `search`, and optional `zoneId`. Status is `QUEUED`, `PROCESSING`, `COMPLETED`, or `FAILED`.

CSV export accepts `range=1h|24h|7d` (default `24h`) and optional `zoneId`, with a maximum of 10,000 records. CSV cells neutralize leading spreadsheet formula markers.

### Settings and reviews

Settings updates accept `{ "name": "SafeSight Workspace", "timezone": "UTC" }`. Names must be 3–100 characters; time zones must be valid IANA identifiers.

Reviews accept `findings` and a 3–2000 character `note`. Findings must cover exactly the original person's references. Reviews append records; the original model output remains unchanged. Review submission is an API capability; the current result interface does not include a review editor.

## Results and errors

Vision results contain provider/model/prompt provenance, timing, normalized image dimensions, a scene summary, person findings, and machinery guidance. New analyses use `promptVersion=safety-v2`. A missing `machines` field is supported only for historical formats; an empty array means no machinery was identified. Vision results provide no detection boxes or confidence percentages.

Each person has an inventory of `worn`, `carried`, or `uncertain` items and required checks with `observed`, `not_observed`, or `uncertain` status. Each machine includes identity certainty, visible/typical hazards, precautions across work phases, conditional wearable recommendations, limitations, and questions.

Application errors use `{ "error": { "status": 400, "message": "..." } }`. Invalid input, unavailable provider configuration, quota failures, and job failures remain explicit. Readiness is a configuration check, not proof of provider authentication or quota. Failed analysis details are available on the saved inspection.

[Back to README](../README.md)
