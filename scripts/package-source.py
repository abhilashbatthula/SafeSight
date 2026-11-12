"""Create a checked source archive from the current Git working tree."""
import subprocess
import sys
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def main():
    subprocess.run([sys.executable, 'scripts/check-secrets.py', '--history'], cwd=ROOT, check=True)
    names = subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT,
    ).decode().split('\0')
    files = sorted({ROOT / name for name in names if name and (ROOT / name).is_file()})
    output = ROOT / '.runtime/releases/SafeSight-final.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            if path.is_symlink():
                raise ValueError(f'Source distribution cannot contain symlinks: {path.relative_to(ROOT)}')
            archive.write(path, str(Path('SafeSight') / path.relative_to(ROOT)))
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise ValueError('Source archive integrity check failed')
    print(f'Source archive: {output}')
    print(f'{len(files)} files; {output.stat().st_size:,} bytes. Extract before uploading the source files.')


if __name__ == '__main__':
    main()
