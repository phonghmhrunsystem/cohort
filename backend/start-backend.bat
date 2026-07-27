@echo off
cd /d "%~dp0"
python -m pip install -r requirements.txt || exit /b 1
python manage.py migrate || exit /b 1
python manage.py runserver
