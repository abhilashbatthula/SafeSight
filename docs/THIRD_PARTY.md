# Third-party notices

## Application dependencies

Node dependency versions and integrity hashes are recorded in `pnpm-lock.yaml`. Python dependencies are pinned in `services/inference/requirements.lock`. Their upstream licenses apply. The active application uses Next.js, React, TanStack Query, Tailwind CSS, NestJS, Express, Drizzle, PostgreSQL, Sharp, FastAPI, Pydantic, Pillow, and Uvicorn, among other transitive dependencies.

Google Gemini is an external service. Its API terms, availability, and pricing are controlled by Google. Optional Cloudinary storage is a separate external service with its own terms and credentials. Neither service's credentials are part of this source distribution.

## Bundled font

The interface uses **WIN95FA / W95FA**, Alina Sava's recreation font distributed by `@fontsource/win95fa` 5.3.0 under SIL Open Font License 1.1.

- [Original attribution](../apps/web/public/fonts/NOTICE.txt)
- [Full font license](../apps/web/public/fonts/LICENSE-WIN95FA.txt)
- [Author publication](https://fontsarena.com/w95fa-by-alina-sava/)
- [Fontsource distribution](https://fontsource.org/fonts/win95fa)

The unmodified WOFF2 and its notices remain together under `apps/web/public/fonts/`. The interface's custom SVG pixel icons, cursors, and CSS provide its retro appearance. No proprietary Windows font file is bundled.

## Documentation previews

The images under `docs/assets/` are captures of SafeSight's interface with neutral workspace metadata and no uploaded photographs. They illustrate application layout; they are not model-evaluation evidence.

[Back to README](../README.md)
