#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null; then source "$HOME/.nvm/nvm.sh"; nvm use; fi
if ! test -f .env; then
  python3 - <<'PY'
import secrets,pathlib
text=pathlib.Path('.env.example').read_text().replace('CHANGE_ME',secrets.token_hex(24),2)
# Database URL and POSTGRES_PASSWORD must match.
secret=secrets.token_hex(24)
text=text.replace(text.split('DATABASE_URL=postgres://safesight:')[1].split('@')[0],secret).replace(text.split('POSTGRES_PASSWORD=')[1].split('\n')[0],secret)
text=text.replace('INFERENCE_KEY=CHANGE_ME','INFERENCE_KEY='+secrets.token_hex(32))
pathlib.Path('.env').write_text(text);pathlib.Path('.env').chmod(0o600)
PY
fi
pnpm install --frozen-lockfile
python3 -m venv .venv
.venv/bin/pip install -r services/inference/requirements.lock
docker compose --env-file .env -f infra/compose.yaml up -d --wait db
pnpm db:migrate
pnpm db:seed
printf '%s\n' 'Setup complete. Configure a free-tier GEMINI_API_KEY in .env, then run pnpm dev.'
