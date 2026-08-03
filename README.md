# Class Management Demo

## Backend

```powershell
backend\start-backend.bat
```

`GET http://127.0.0.1:8000/api/health` returns `{"status":"ok"}`.

### Demo data

Migrations seed 1 Admin, 10 Teachers and 80 Students. To also get Classes,
Assignments, Resources, Submissions, Grades and Notifications:

```powershell
cd backend
python manage.py seed_demo
```

The command is idempotent — run it again after any migration to top the dataset
back up. It produces 12 Classes, 15 Students per Class, 4 Assignments (each with
a 4-criterion rubric) and 5 Resources per Class (3 links + 2 downloadable files).

Emails are `<tên> + <chữ cái đầu của các chữ còn lại>@eduplatform.local`, so
*Nguyễn Văn An* signs in as `annv@eduplatform.local`.

| Role | Email | Password |
| --- | --- | --- |
| Admin | phongnd@eduplatform.local | Admin@123 |
| Teacher | anhttm@eduplatform.local | Teacher@123 |
| Teacher | hunglv@eduplatform.local | Teacher@123 |
| Student | annv@eduplatform.local | Student@123 |
| Student | bichtt@eduplatform.local | Student@123 |

Every Teacher shares `Teacher@123` and every Student `Student@123`; the full
roster lives in `backend/accounts/seed_data.py`.

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Vite proxies `/api` requests to the Django server on port 8000.

Teachers can open **Bảng điểm** from a Class to review that Class only and download its UTF-8 CSV gradebook.
