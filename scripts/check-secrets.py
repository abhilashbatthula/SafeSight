"""Check only known local secret values; never print their values."""
from pathlib import Path
import json
secrets=[]
for line in Path('.env').read_text().splitlines():
    key,sep,value=line.partition('=')
    if sep and key in ['INFERENCE_KEY','POSTGRES_PASSWORD','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET'] and value:secrets.append(value)
secrets.extend(json.loads(Path('.runtime/dev-credentials.json').read_text()).values())
files=list(Path('apps/web/.next-production').rglob('*.js'))+list(Path('.runtime/logs').glob('*.log'))
failed=[]
for file in files:
    contents=file.read_text(errors='replace')
    if any(secret in contents for secret in secrets):failed.append(str(file))
if failed:raise SystemExit('Secret exposure in: '+', '.join(failed))
print(f'PASS: none of the configured local secrets or generated passwords found in {len(files)} frontend JS/log files.')
