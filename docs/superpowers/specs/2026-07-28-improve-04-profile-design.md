# Feature 04 — Personal Profile and Class Teacher

## Goal

Allow Teacher and Student to maintain their own profile and password, while a
Student can identify the Teacher for each enrolled Class.

## Routes and APIs

| Surface | Contract |
| --- | --- |
| `/profile` | Teacher/Student read and edit their own full name, phone, date of birth, gender, and address. |
| `GET /auth/me` | Existing authenticated user shape. |
| `PATCH /auth/me` | Accepts only mutable profile fields; ignores/rejects email, role, active state, and password. |
| `POST /auth/change-password` | `{current_password,new_password}`; requires a valid current password and existing 8–128 character policy. |
| Student Class | Shows the class Teacher's display name and read-only contact/profile card. |

## Rules

- Email and role remain immutable identity fields.
- Changing password updates only the requesting user and writes a safe audit
  event. A wrong current password returns `422` without changing the hash.
- A Student sees a Teacher only through an enrolled Class. It may not fetch an
  arbitrary account profile.
- Admin account management remains separate; this feature does not grant Admin
  profile editing of other users.

## Acceptance

- Valid profile changes survive refresh; invalid phone/date values return
  field-level `422` feedback.
- An authenticated Teacher/Student cannot change another user's profile.
- A Student in Class A cannot read the Teacher profile of Class B.

## Out of scope

Avatar upload, changing email, self-registration, public directory, and two
factor authentication.
