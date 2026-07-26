# Phase 2 UI refresh

## Goal

Replace the unstyled Phase 1 admin UI with a clean, responsive workspace while preserving all existing routes, API calls, and behavior.

## Visual direction

- Bootstrap 5 CSS loaded from its CDN; no new npm package.
- Clean professional palette: navy sidebar, white content area, restrained blue actions, and accessible status colors.
- Desktop uses a fixed-width sidebar. At narrow widths, navigation becomes a compact horizontal bar.

## Screens

- Login: centered sign-in card with clear title, labels, loading state, and alert area.
- Accounts: page heading/action row, account form card, responsive table, role and active-status badges.
- Audit log: shared workspace shell and responsive audit table with readable metadata.

## Implementation boundaries

- Change `frontend/index.html`, the three page components, and `frontend/src/styles.css` only.
- Use Bootstrap utility/component classes plus one small application stylesheet for the shared shell and responsive navigation.
- Do not alter authentication, API contracts, routes, or backend code.

## Verification

- Run the existing frontend type-check/build and tests.
- Check the login, accounts, and audit-log layouts at desktop and mobile widths.
