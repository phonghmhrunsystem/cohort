# Class Management Demo

## Backend

```powershell
backend\start-backend.bat
```

`GET http://127.0.0.1:8000/api/health` returns `{"status":"ok"}`.

| Role | Email | Password |
| --- | --- | --- |
| Admin | phong@gmail.com | Admin@123 |
| Teacher | teacher.anh@example.com | Teacher@123 |
| Teacher | teacher.binh@example.com | Teacher@123 |
| Student | student.an@example.com | Student@123 |
| Student | student.bao@example.com | Student@123 |
| Student | student.chi@example.com | Student@123 |
| Student | student.dung@example.com | Student@123 |

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite proxies `/api` requests to the Django server on port 8000.
