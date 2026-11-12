"""Create local configuration with fresh service credentials; preserve existing files."""
import argparse
import os
from pathlib import Path
import secrets

ROOT = Path(__file__).resolve().parent.parent


def create_environment(destination, template):
    password = secrets.token_hex(24)
    replacements = {
        'DATABASE_URL': f'postgres://safesight:{password}@127.0.0.1:55432/safesight',
        'POSTGRES_PASSWORD': password,
        'INFERENCE_KEY': secrets.token_hex(32),
    }
    lines = []
    for line in template.splitlines():
        key, separator, _ = line.partition('=')
        lines.append(f'{key}={replacements[key]}' if separator and key in replacements else line)
    try:
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return False
    with os.fdopen(descriptor, 'w') as output:
        output.write('\n'.join(lines) + '\n')
    return True


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.env')
    args = parser.parse_args()
    created = create_environment(args.output, (ROOT / '.env.example').read_text())
    print(f'{"Created" if created else "Kept existing"} {args.output}. Credentials are not printed.')
