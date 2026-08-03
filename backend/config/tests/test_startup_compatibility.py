import subprocess
import sys
from pathlib import Path
from unittest import TestCase


class StartupCompatibilityTests(TestCase):
    def test_manage_check_succeeds(self):
        backend = Path(__file__).resolve().parents[2]
        result = subprocess.run(
            [sys.executable, "manage.py", "check"],
            cwd=backend,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
