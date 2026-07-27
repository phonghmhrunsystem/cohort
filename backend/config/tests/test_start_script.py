from pathlib import Path

from django.test import SimpleTestCase


class StartBackendScriptTests(SimpleTestCase):
    def test_installs_dependencies_migrates_then_starts_server(self):
        script = (Path(__file__).resolve().parents[2] / "start-backend.bat").read_text()

        install = "python -m pip install -r requirements.txt || exit /b 1"
        migrate = "python manage.py migrate || exit /b 1"
        runserver = "python manage.py runserver"

        self.assertIn(install, script)
        self.assertIn(migrate, script)
        self.assertIn(runserver, script)
        self.assertLess(script.index(install), script.index(migrate))
        self.assertLess(script.index(migrate), script.index(runserver))
