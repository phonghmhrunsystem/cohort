# Auth & Accounts UI decisions

## Direction

Calm, professional, light-theme SaaS UI: a dark-indigo navigation frame,
white content surfaces, and restrained soft elevation. The design-system
query recommended accessible Soft UI Evolution; this implementation keeps its
clarity and subtle shadows, but uses indigo for navigation as required by the
plan. No dark mode, gradients, glass effects, decorative motion, icon package,
or component library.

## Semantic tokens

| Token | Value | Use |
| --- | --- | --- |
| `--color-nav` | `#1E1B4B` | Sidebar and mobile header |
| `--color-primary` | `#2563EB` | Primary action and focus ring |
| `--color-success` | `#059669` | Active/success states |
| `--color-danger` | `#DC2626` | Errors and destructive actions |
| `--color-canvas` | `#F8FAFC` | App background |
| `--color-surface` | `#FFFFFF` | Cards and dialogs |
| `--color-text` | `#0F172A` | Primary text |
| `--color-muted` | `#475569` | Secondary text |
| `--color-border` | `#E2E8F0` | Boundaries and inputs |
| `--focus-ring` | `#2563EB` | 3px visible keyboard focus |

Typography uses **Be Vietnam Pro** for headings and **Noto Sans** for body
text, with system fallbacks. Sizes: 14px supporting text, 16px body, 20px
section headings, 28px page headings. Spacing is the 4px/8px scale:
4, 8, 12, 16, 24, 32, 48. Borders are 1px, radius is 8px for controls and
12px for cards, and elevation is one restrained shadow. Z-index: drawer 20,
dialog 30, alert 40.

## Interaction and responsive rules

- Controls have a 44px minimum target, visible focus, native semantics, inline
  persistent field errors, and disabled/loading feedback.
- Destructive operations require confirmation. Native `dialog` returns focus
  to its opener; Escape closes dialogs and the mobile drawer.
- Desktop (`>=1024px`) shows a fixed sidebar; tablet (`>=768px`) uses spacious
  content gutters; mobile keeps a topbar/drawer and scrollable data tables.
- A skip link targets the main region. Tables wrap in a horizontal scroll area
  rather than clipping account data.

## Rejected alternatives

- The generated blue-only navigation was rejected for the required dark-indigo
  app frame.
- Dark mode, gradients, glassmorphism and motion libraries were rejected by
  plan constraints.
- A component/icon package was rejected: native elements and CSS cover this
  scope.
