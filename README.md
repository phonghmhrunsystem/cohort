# Class Management Demo

## Backend

```powershell
cd backend
python -m pip install -r requirements.txt
python manage.py runserver
```

`GET http://127.0.0.1:8000/api/health` returns `{"status":"ok"}`.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite proxies `/api` requests to the Django server on port 8000.
