#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null; then source "$HOME/.nvm/nvm.sh"; nvm use; fi
python3 scripts/create-env.py
pnpm install --frozen-lockfile
python3 -m venv .venv
.venv/bin/pip install -r services/inference/requirements.lock
docker compose --env-file .env -f infra/compose.yaml up -d --wait db
pnpm db:migrate
pnpm db:init
printf '%s\n' 'Setup complete. Configure a free-tier GEMINI_API_KEY in .env, then run pnpm dev.'
