# Backend Demo Seed Design

## Goal

Make a fresh local backend database immediately usable with fixed demo accounts and cohort data, and start it through one Windows batch file.

## Approach

Use a data migration tracked with the schema migrations. It creates, only when missing, one administrator, two teachers, four students, two cohorts, and their enrollments. This runs exactly when a new database applies migrations, and later migrations do not overwrite existing accounts or data.

`backend/start-backend.bat` will install requirements, apply migrations, and run the development server. It does not reload or overwrite demo data on later starts. Grading data is not seeded because grade-related models are not implemented yet.

## Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | phong@gmail.com | Admin@123 |
| Teacher | teacher.anh@example.com | Teacher@123 |
| Teacher | teacher.binh@example.com | Teacher@123 |
| Student | student.an@example.com | Student@123 |
| Student | student.bao@example.com | Student@123 |
| Student | student.chi@example.com | Student@123 |
| Student | student.dung@example.com | Student@123 |

The same table will be included in the README for quick login reference.

## Files

- `backend/accounts/migrations/0002_seed_demo_data.py`: idempotent default accounts, cohorts, and enrollments.
- `backend/start-backend.bat`: Windows shortcut for dependency install, migration, and server startup.
- `backend/accounts/tests/test_seed.py`: verifies the seed migration creates the expected roles and password logins.
- `README.md`: replaces manual setup commands with the batch-file command and credentials.

## Error handling and verification

The batch file stops at the failing Django command using `|| exit /b 1`, preventing a server from starting against an unprepared database. A Django migration test will apply the seed migration and assert the admin password and expected account/cohort counts.
