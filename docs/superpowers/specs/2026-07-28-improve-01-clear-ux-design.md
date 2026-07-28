# Feature 01 — Clear UX and Safe Actions

## Goal

Make every role understand who is signed in, where they are navigating, and
which actions are irreversible.

## Scope

- Seed data creates `full_name` for every demo Teacher and Student. A data
  migration also fills an empty legacy `full_name` from the email local-part,
  converted to a readable fallback, so existing local databases do not render
  blank or incorrect identities. Explicit existing names are never overwritten.
- The authenticated shell shows `Chào, {full_name}` and a Vietnamese role label.
  Legacy accounts without a name use their email local-part only as fallback.
- Page returns use a `Quay lại` button. It calls browser back when there is
  usable history; otherwise it goes to that role's class or account home.
- Account deactivation, removing a Student from a Class, and deleting a rubric
  criterion require a native confirmation dialog. The button names the target
  and confirmation is disabled while pending.
- Every native dialog is centered with a safe max width/height, scrolls inside
  its own bounds, and has a visible title, Cancel button, Escape/overlay close
  when idle, and focus restoration.
- Teacher UI uses `Chấm điểm` and `Đã chấm`; it never presents `student #id` or
  a submission version as the primary student identity.

## UI contract

| Surface | Required behavior |
| --- | --- |
| Shell | Greeting appears above or beside navigation without crowding mobile nav. |
| Back | The button is not a plain link; it retains a deterministic role-home fallback. |
| Confirm | Dialog renders target name and the exact destructive verb: `Xóa`, `Gỡ`, or `Vô hiệu hóa`. |
| Pending | Cancel, overlay, Escape, and duplicate confirm are blocked only while its mutation is pending. |

## Acceptance

- A fresh migrate/seed has a non-empty full name for every demo Teacher and
  Student; rerunning it remains idempotent.
- An existing account with a blank name receives only the fallback name, while
  an existing non-empty name remains unchanged.
- At 320 px and desktop, no normal page content overflows horizontally.
- Cancel causes no API call; confirm causes exactly one call.
- A `422` leaves the dialog/form open and shows its server error.
- A saved grade shows `Đã chấm`; all student lists lead with a human name.

## Out of scope

Global toast framework, route-animation library, custom modal dependency, and
changing the underlying access rules.
