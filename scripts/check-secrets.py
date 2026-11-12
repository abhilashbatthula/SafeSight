"""Check publishable files, optional Git history and local frontend/log output.

Detects configured secret values and common credential formats. Findings contain
only paths and rule names, never secret values. This is not an exhaustive audit.
"""
import argparse
import io
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent.parent
SECRET_KEYS = {
    'INFERENCE_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY',
    'POSTGRES_PASSWORD', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
}
PATTERNS = {
    'Google API key': rb'AIza[0-9A-Za-z_-]{35}',
    'GitHub token': rb'(?:gh[pousr]_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]{60,})',
    'OpenAI key': rb'sk-(?:proj-|svcacct-)?[0-9A-Za-z_-]{40,}',
    'AWS access key': rb'(?:AKIA|ASIA)[A-Z0-9]{16}',
    'private key': rb'-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----',
}
RULES = {name: re.compile(pattern) for name, pattern in PATTERNS.items()}


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def configured_secrets():
    values = {os.environ[key] for key in SECRET_KEYS if os.environ.get(key)}
    for path in ROOT.glob('.env*'):
        if path.name == '.env.example' or not path.is_file():
            continue
        for line in path.read_text().splitlines():
            key, sep, value = line.removeprefix('export ').partition('=')
            if sep and key.strip() in SECRET_KEYS:
                value = value.strip()
                if value.startswith(('"', "'")):
                    value = value[1:].split(value[0], 1)[0]
                else:
                    value = value.split(' #', 1)[0].strip()
                values.add(value)
    legacy = ROOT / '.runtime/dev-credentials.json'
    if legacy.exists():
        values.update(v for v in json.loads(legacy.read_text()).values() if isinstance(v, str))
    placeholders = {'', 'CHANGE_ME', 'your_key', 'test-fixture-only'}
    return {value.encode() for value in values - placeholders}


def sensitive_path(name):
    path = Path(name)
    return (
        (path.name == '.env' or path.name.startswith('.env.'))
        and path.name != '.env.example'
    ) or bool({'.runtime', '.venv', 'node_modules', 'models'} & set(path.parts)) or path.suffix in {
        '.pem', '.key', '.p12', '.pfx',
    }


def matches(data, secrets):
    found = [name for name, rule in RULES.items() if rule.search(data)]
    if any(secret in data for secret in secrets):
        found.append('configured local secret')
    return found


def history_blobs():
    # Batch object reads avoid a subprocess per historical file. Scan each unique
    # blob reachable from a branch or tag, including deleted and superseded files.
    objects = git('rev-list', '--objects', '--all').splitlines()
    names = {}
    for item in objects:
        oid, _, name = item.partition(b' ')
        names[oid] = name.decode(errors='replace')
    if not names:
        return
    result = subprocess.run(
        ['git', 'cat-file', '--batch'], cwd=ROOT,
        input=b'\n'.join(names) + b'\n', stdout=subprocess.PIPE, check=True,
    )
    stream = io.BytesIO(result.stdout)
    while header := stream.readline():
        oid, kind, size = header.split()
        data = stream.read(int(size))
        stream.read(1)
        if kind == b'blob':
            yield oid.decode(), names[oid], data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history', action='store_true', help='Also scan all reachable Git history')
    args = parser.parse_args()
    secrets = configured_secrets()
    failures = []
    paths = set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').decode().split('\0')) - {''}
    checked = 0
    for name in sorted(paths):
        path = ROOT / name
        if not path.is_file():
            continue
        reasons = matches(path.read_bytes(), secrets)
        if sensitive_path(name):
            reasons.append('private/local file in upload set')
        if reasons:
            failures.append((name, reasons))
        checked += 1
    generated = set()
    for output in ('.next', '.next-production'):
        generated.update((ROOT / 'apps/web' / output).rglob('*.js'))
    generated.update((ROOT / '.runtime/logs').glob('*.log'))
    for path in sorted(generated):
        reasons = matches(path.read_bytes(), secrets)
        if reasons:
            failures.append((str(path.relative_to(ROOT)), reasons))
    historical = 0
    if args.history:
        for oid, name, data in history_blobs():
            reasons = matches(data, secrets)
            if sensitive_path(name):
                reasons.append('private/local file in history')
            if reasons:
                failures.append((f'history {oid[:12]}:{name}', reasons))
            historical += 1
    if failures:
        for name, reasons in failures:
            print(f'FAIL: {name} ({", ".join(reasons)})')
        return 1
    print(f'PASS: {checked} repository files, {historical} historical blobs and {len(generated)} frontend/log files; no configured secrets or supported credential patterns found.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
