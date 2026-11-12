"""Verify fresh credentials, restricted permissions and preservation of local configuration."""
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('create_env', ROOT / 'scripts/create-env.py')
generator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generator)


class EnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.destination = Path(self.directory.name) / '.env'
        self.template = (ROOT / '.env.example').read_text()

    def test_fresh_configuration_has_consistent_independent_credentials(self):
        self.assertTrue(generator.create_environment(self.destination, self.template))
        values = dict(line.split('=', 1) for line in self.destination.read_text().splitlines()
                      if '=' in line and not line.startswith('#'))
        self.assertNotIn('CHANGE_ME', self.destination.read_text())
        self.assertEqual(urlparse(values['DATABASE_URL']).password, values['POSTGRES_PASSWORD'])
        self.assertGreaterEqual(len(values['POSTGRES_PASSWORD']), 48)
        self.assertGreaterEqual(len(values['INFERENCE_KEY']), 64)
        self.assertNotEqual(values['POSTGRES_PASSWORD'], values['INFERENCE_KEY'])
        self.assertEqual(values['GEMINI_API_KEY'], '')
        if os.name == 'posix':
            self.assertEqual(self.destination.stat().st_mode & 0o777, 0o600)

    def test_existing_configuration_is_preserved(self):
        self.destination.write_text('existing local configuration\n')
        self.assertFalse(generator.create_environment(self.destination, self.template))
        self.assertEqual(self.destination.read_text(), 'existing local configuration\n')

    def test_each_installation_gets_different_credentials(self):
        second = self.destination.with_name('.env.second')
        generator.create_environment(self.destination, self.template)
        generator.create_environment(second, self.template)
        self.assertNotEqual(self.destination.read_text(), second.read_text())


if __name__ == '__main__':
    unittest.main()
