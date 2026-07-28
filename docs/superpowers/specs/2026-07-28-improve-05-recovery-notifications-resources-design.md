# Feature 05 — Password Recovery, Notifications, and Class Resources

## Goal

Provide an internal recovery route, visible Admin handling, and useful new
class content without email delivery or a general messaging system.

## Password recovery

- Login has a `Quên mật khẩu?` dialog accepting an email.
- `POST /password-reset-requests` normalizes and checks the email internally.
  It always returns `204` and displays: “Nếu tài khoản tồn tại, yêu cầu đã được
  gửi tới Admin.” Only an active Teacher/Student with no pending request gets a
  new request.
- `PasswordResetRequest` records user, requested time, status `PENDING` or
  `RESOLVED`, resolver, and resolved time. One pending request per user.
- Admin sees a pending badge and `/admin/password-reset-requests` list. Admin
  enters a temporary 8–128 character password in a confirmation dialog.
- Resolving sets the password, sets `must_change_password=true`, writes audit,
  and marks the request resolved atomically. The user can authenticate only to
  `/change-password` until `POST /auth/change-password` succeeds.

## Notifications

- `Notification` is an in-app record: recipient, type, title, internal link,
  created time, read time. It stores no sensitive content.
- Creating an assignment creates one `ASSIGNMENT_CREATED` notification per
  currently enrolled Student in the same transaction.
- Creating a class resource creates one `RESOURCE_CREATED` notification per
  currently enrolled Student in the same transaction.
- Teacher/Student shell displays unread count and a list. Opening an item marks
  it read and navigates to its internal link. Admin reset-request badge is a
  separate count, not a student notification.

## Class resources

- An assigned Teacher manages `Tài liệu lớp` from their Class: title (2–150),
  optional description (max 1,000), and required absolute `https://` URL.
- Student sees resources only for enrolled Classes. Resources open in a new
  tab with clear external-link labeling.
- Version 1 stores links only. It does not upload, mirror, scan, or proxy files.

## Acceptance

- Unknown/inactive/Admin email gets `204` but creates no request.
- Only Admin resolves a request; it cannot be resolved twice.
- An enrolled Student receives one notification per new assignment/resource;
  a non-enrolled Student receives none.
- Only the Class Teacher can create/update resource metadata; no cross-Class
  resource data is exposed.

## Out of scope

Email, reset tokens, push/WebSocket delivery, notification preferences, generic
announcements, resource file upload, chat, and Admin password reset directly
from Account edit.
