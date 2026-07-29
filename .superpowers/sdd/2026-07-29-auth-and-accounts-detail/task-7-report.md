Task 7 report

- Red: `npm test -- AuthProvider.test.tsx App.test.tsx` failed before implementation because the auth provider did not exist and App rendered only the old heading. The drawer-focus test also failed before the focus-managed drawer was added.
- Green: added sessionStorage-only auth state, one-time startup `/auth/me`, 401 clearing, guarded public/protected/role/forced routes, minimal shared primitives, responsive shell, and placeholders.
- Verification: `cd frontend; npm test -- AuthProvider.test.tsx App.test.tsx` passed (8 tests); `npm run build` passed. Vite emitted its existing React Router `"use client"` directive warnings during bundling.
