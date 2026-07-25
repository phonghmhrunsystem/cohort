# Use Cases and Flows

## Use cases

```mermaid
flowchart LR
  A[Admin] --> U[Manage accounts]
  A --> L[View audit log]
  T[Teacher] --> C[Manage cohort and enrollments]
  T --> AS[Create assignment and optional rubric]
  T --> G[View latest submission and grade]
  S[Student] --> V[View enrolled cohorts and assignments]
  S --> SB[Submit a new version before deadline]
  S --> H[Track submission history]
  S --> R[View grade and feedback]
```

## Assignment lifecycle

```mermaid
stateDiagram-v2
  [*] --> Open: teacher creates assignment
  Open --> Open: student submits a new version before deadline
  Open --> Closed: deadline passes
  Open --> Graded: teacher grades latest version
  Closed --> Graded: teacher grades latest version
  Graded --> [*]
```

- `Open`: enrolled students may create a new submission version.
- `Closed`: no new submissions are allowed.
- `Graded`: no new submissions are allowed, regardless of deadline.

## Create, submit, and grade

```mermaid
sequenceDiagram
  participant T as Teacher
  participant S as Student
  participant API as Backend
  participant FS as Local media storage

  T->>API: Create assignment, deadline, optional rubric
  API-->>S: Expose assignment to enrolled student
  S->>API: Upload supported file before deadline
  API->>API: Check enrollment, deadline, ungraded state, and file
  API->>FS: Store file locally
  API-->>S: Create next submission version
  T->>API: Request assignment submissions
  API-->>T: Return only each student's latest version
  T->>API: Submit grade and feedback
  API->>API: Validate scores; calculate rubric total
  API-->>S: Expose result; lock future submissions
```

## Audit flow

```mermaid
sequenceDiagram
  participant U as Authenticated user
  participant API as Backend
  participant DB as SQLite

  U->>API: Perform protected action
  API->>API: Authorize and validate
  API->>DB: Persist domain change
  API->>DB: Append audit record
  API-->>U: Return result
```

Audit writes occur for account administration, cohort and enrollment changes, assignment/rubric changes, submissions, and grading.
