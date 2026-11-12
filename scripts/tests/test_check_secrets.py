"""Exercise publication scanning against an isolated temporary Git repository."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'check-secrets.py'
SPEC = importlib.util.spec_from_file_location('check_secrets', SCRIPT)
scanner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(scanner)


class PublicationScanTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.root_patch = patch.object(scanner, 'ROOT', self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.env_patch = patch.dict(os.environ, {}, clear=True)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Scanner test')
        self.git('config', 'user.email', 'scanner@example.invalid')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.PIPE)

    def scan(self, *args):
        output = io.StringIO()
        with patch.object(sys, 'argv', [str(SCRIPT), *args]), contextlib.redirect_stdout(output):
            status = scanner.main()
        return status, output.getvalue()

    def test_clean_clone_needs_no_env_file(self):
        (self.root / '.env.example').write_text('GEMINI_API_KEY=\n')
        self.assertEqual(self.scan('--history')[0], 0)

    def test_ignored_env_is_not_published_but_its_values_are_checked(self):
        secret = 'local-' + 'secret-value-for-test'
        (self.root / '.gitignore').write_text('.env\n')
        (self.root / '.env').write_text(f'GEMINI_API_KEY="{secret}"\n')
        self.assertEqual(self.scan()[0], 0)
        (self.root / 'leak.txt').write_text(secret)
        status, output = self.scan()
        self.assertEqual(status, 1)
        self.assertIn('leak.txt', output)
        self.assertNotIn(secret, output)

    def test_forced_tracked_env_fails_even_when_ignored(self):
        (self.root / '.gitignore').write_text('.env\n')
        (self.root / '.env').write_text('GEMINI_API_KEY=\n')
        self.git('add', '-f', '.env')
        self.assertEqual(self.scan()[0], 1)

    def test_unknown_provider_key_in_untracked_file_is_detected(self):
        key = 'AIza' + 'A' * 35
        (self.root / 'notes.txt').write_text(key)
        status, output = self.scan()
        self.assertEqual(status, 1)
        self.assertIn('Google API key', output)
        self.assertNotIn(key, output)

    def test_history_detects_a_secret_deleted_from_the_working_tree(self):
        key = 'ghp_' + 'A' * 36
        path = self.root / 'old.txt'
        path.write_text(key)
        self.git('add', '.')
        self.git('commit', '-qm', 'Add example')
        path.unlink()
        self.git('add', '-u')
        self.git('commit', '-qm', 'Remove example')
        self.assertEqual(self.scan()[0], 0)
        status, output = self.scan('--history')
        self.assertEqual(status, 1)
        self.assertIn('history', output)
        self.assertNotIn(key, output)


if __name__ == '__main__':
    unittest.main()
