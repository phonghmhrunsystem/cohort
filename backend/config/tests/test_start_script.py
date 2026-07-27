from pathlib import Path

from django.test import SimpleTestCase


class StartBackendScriptTests(SimpleTestCase):
    def test_installs_dependencies_migrates_then_starts_server(self):
        script = (Path(__file__).resolve().parents[2] / "start-backend.bat").read_text()

        self.assertIn("python -m pip install -r requirements.txt || exit /b 1", script)
        self.assertIn("python manage.py migrate || exit /b 1", script)
        self.assertIn("python manage.py runserver", script)
