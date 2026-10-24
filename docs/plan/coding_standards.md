# WICARS Coding Standards

> [!info] Scope
> These standards describe conventions verified in the current WICARS codebase. Follow the implementation nearest to the code being changed, and do not use this note to justify unrelated refactoring.

## Technology Baseline

### Backend

- PHP 8.2 or newer.
- Laravel 12 with Laravel Sanctum authentication.
- Spatie Laravel Permission is installed; application routes also use the project `role` middleware and `users.role`.
- PHPUnit 11 is used for unit and feature tests.
- Laravel Pint is the configured PHP formatter.

### Frontend

- React 19 with TypeScript and Vite.
- React Router for routing and Axios for HTTP requests.
- Tailwind CSS for utility styling.
- Vitest and Testing Library for frontend tests.
- ESLint uses the recommended JavaScript, TypeScript, React Hooks, and Vite React Refresh configurations.

## Core Development Rule

Use the project workflow:

`UNDERSTAND -> REUSE -> MODIFY -> VERIFY`

Before changing behavior:

1. Start at [[DASHBOARD]] and read the relevant architecture, business-rule, workflow, decision, or database note.
2. Locate the route, page, command, or job that enters the affected behavior.
3. Inspect its direct controller, service, model, hook, API service, and tests.
4. Reuse existing policies, validators, mappers, components, and utilities.
5. Make the smallest change that preserves existing contracts.
6. Run the narrowest useful checks before broader verification.

## General Style

- Use UTF-8, LF line endings, spaces, final newlines, and no trailing whitespace.
- PHP uses four-space indentation. YAML uses two spaces.
- Preserve the established style of the file being edited; do not mass-normalize unrelated code.
- Use descriptive names and avoid one-letter variables outside conventional short callbacks.
- Comments should explain business reasoning, invariants, or non-obvious tradeoffs.
- Keep changes focused and do not combine feature work with broad cleanup.

## Backend Conventions

### Routes And Access Control

- API routes live in `backend/routes/api.php`.
- Public authentication routes are throttled.
- Protected routes use `auth:sanctum` and `active` middleware.
- Role restrictions are declared with `role:...`; route protection must not be replaced by frontend-only checks.
- Department and program scope must come from the authenticated user and existing authorization services.
- Schedule ownership and teaching assignment are different concepts. Reuse `ScheduleAuthorizationService` and scheduling policy logic rather than comparing only `schedule.department_id`.

See [[architecture]] and [[business_rules]] for ownership rules.

### Controllers, Requests, And Services

- Controllers coordinate HTTP concerns: authorization, validated input, service calls, transactions, and response construction.
- Put reusable validation in Form Request classes under `backend/app/Http/Requests/`.
- Course create, update, and curriculum batch-create requests share `CourseRequest::courseRules()` and code normalization. Component bounds come from `SchedulingPolicy`; code/name lengths follow the 255-character schema. Batch placement keeps numeric year/semester values, while single-course requests keep their existing enum values. Batch request validation completes before writes; accepted batches retain per-row operation results.
- Put scheduling and cross-controller domain logic in `backend/app/Services/`, with scheduling-specific logic under `backend/app/Services/Scheduling/`.
- Prefer dependency injection over constructing services inside methods.
- Use explicit return and parameter types in new or substantially modified service code where Laravel contracts allow them.
- Classes with no extension purpose may be `final`, following the scheduling service pattern.
- Do not duplicate rule-engine, authorization, generation, conflict, faculty-load, notification, or audit behavior in controllers.

### Validation And API Responses

- Validate identifiers, enums, nested arrays, and ownership before persistence.
- Preserve existing response shapes consumed by the frontend.
- Validation failures should use Laravel's normal `422` response with an `errors` object unless an endpoint has a documented exception.
- Authentication and authorization failures use clear JSON messages and `401` or `403` status codes.
- Do not expose stack traces, SQL, credentials, or internal exception details.
- Curriculum batch course creation returns explicit messages for archived duplicates and placement conflicts. Unexpected row failures are rolled back and reported through Laravel's exception handler; responses use a generic retry/contact-administrator message and retain per-row partial success.

### Eloquent Models

- Declare mass-assignable fields with `$fillable`.
- Declare boolean, JSON, date, and numeric casts when callers depend on typed values.
- Define relationships on models instead of repeating joins when the relationship is part of the domain model.
- Respect historical naming exceptions such as `Curriculum` using the singular `curriculum` table and plural model names including `Departments`, `Rooms`, and `Sections`.
- Inspect model lifecycle hooks before bypassing Eloquent. `Schedule` persists split metadata through model events; workflow history uses the explicit `ScheduleHistoryRecorder`. `Curriculum` synchronizes course placement defaults after status/school-year updates; it does not demote other active curricula.
- Use query-builder or bulk updates only after confirming which Eloquent events, casts, and audit records would be skipped.

### Transactions, Jobs, And Side Effects

- Wrap multi-table writes in `DB::transaction()` when partial success would leave an invalid schedule, curriculum, assignment, approval, or audit state.
- Single schedule creation and grouped deletion use the existing semester scheduling lock and transaction; validate fresh state inside that boundary. Curriculum duplication commits the copied parent and placements together. Required audit/revision writes belong inside the transaction; notifications and cache invalidation follow successful persistence.
- Keep preview and generation staging isolated from committed schedule data.
- Long-running generation work belongs in existing jobs and generation services.
- Queue behavior must remain compatible with the database queue configuration.
- Emit notifications and audit records through existing services; do not create a second logging path.

## Frontend Conventions

### Project Organization

- `src/pages/` contains route-level screens.
- `src/components/` contains reusable UI and domain components.
- `src/hooks/` contains reusable stateful behavior and data-loading hooks.
- `src/services/` contains domain API clients and response mapping.
- `src/lib/` contains shared stateless utilities and the configured Axios instance.
- `src/types/` contains shared API and domain types.
- Role-specific navigation belongs in `src/navigation/`.

Place code at the narrowest reusable level. Do not move page-specific logic into a global utility unless another consumer exists or the separation materially improves testability.

### TypeScript And React

- Use `.tsx` for components and `.ts` for non-JSX logic.
- Use `PascalCase` for components, pages, and exported React types.
- Use `camelCase` for functions, hooks, variables, and service methods.
- Prefix hooks with `use` and obey React Hooks rules.
- Use `import type` for type-only imports where practical.
- Type API responses at the Axios call and map transport shapes into UI-facing models when representations differ.
- Keep deterministic scheduling calculations in pure functions so they can be tested without rendering a page.
- Effects that perform asynchronous work must avoid updating state after unmount; follow existing cleanup patterns.

### API Access And Authentication

- Use the shared Axios instance in `src/lib/api.ts`.
- Do not create ad hoc Axios clients that bypass the base URL, timeout, headers, bearer token, cache clearing, or `401` handling.
- Put domain endpoint calls in a service when multiple components use them or response mapping is required.
- Convert backend errors through existing API error utilities instead of showing raw Axios errors.
- Frontend role checks improve UX only; backend middleware and authorization remain authoritative.

### UI States

- Preserve the existing WICARS visual language and responsive layout.
- Data-driven screens must account for loading, empty, error, disabled, and success states where applicable.
- Disable or guard repeated destructive and long-running actions.
- Show actionable error messages without exposing internal details.
- Keep role-specific behavior consistent across navigation, page access, and API authorization.

### Print And Download Filenames

- Build PDF/CSV names with `src/lib/exportFile.ts` using report type and available scope, academic year, semester, curriculum code, or instructor identity. Do not label department-wide output as a single-section export.
- Use `downloadFile` for local file downloads. PDF print windows use `openPdfPreview` from `src/lib/pdfPreview.ts`; embedded PDFs use `createPdfPreview`. These expose temporary named HTTP responses so users can use the browser's existing PDF download arrow. Do not add a duplicate PDF download toolbar.
- Dispose temporary HTTP previews when their modal/tab closes. Preserve the signed URL, original-session authentication, active-account/capability checks, ownership checks, encrypted cache storage, bounded cache entries, and expiry. Do not immediately revoke local download object URLs before the browser can consume them.
- Supply generated PDF filenames through the named response URL and inline `Content-Disposition`. Use `printWithTitle` to suggest a name for HTML Save as PDF and restore the app title after printing; print-dialog names remain browser decisions.
- See [[print_download_review]] for the reviewed entry points and remaining CSV/export improvements.

## Testing Standards

### Backend Tests

- Put isolated domain calculations in `backend/tests/Unit/`.
- Put route, authorization, validation, persistence, transaction, and workflow tests in `backend/tests/Feature/`.
- Add regression coverage for changed scheduling rules and permission boundaries.
- Test both authorized and unauthorized department or role paths.
- For multi-write operations, test rollback behavior where partial persistence is a risk.

Run from `backend/`:

```bash
php artisan test --filter=RelevantTest
php artisan test
./vendor/bin/pint --test
```

### Frontend Tests

- Co-locate tests as `*.test.ts` or `*.test.tsx` near the code they verify.
- Prefer pure-function tests for scheduling calculations and Testing Library for user-visible component behavior.
- Test loading, empty, failure, permissions, and stale-response behavior when relevant.

Run from `wicars-ui/`:

```bash
npm test -- --run path/to/file.test.ts
npm test
npm run lint
npm run build
```

## Verification Order

1. PHP syntax or TypeScript compilation for changed files.
2. Relevant unit tests.
3. Relevant feature or component tests.
4. API/database behavior for affected workflows.
5. Frontend build and visual verification for UI changes.

Do not fix unrelated failures as part of a focused task. Report them separately.

## Documentation Rule

Update the appropriate note when a change establishes or alters a stable convention:

- [[architecture]] for system boundaries and ownership.
- [[business_rules]] for scheduling rules.
- [[database]] for schema, constraints, indexes, and persistence behavior.
- [[decisions]] for intentional architectural choices.
- [[performance]] for queue, cache, generation, and production requirements.
- Workflow notes for approval, history, and audit behavior.

## Verified Sources

- `backend/composer.json`
- `backend/.editorconfig`
- `backend/routes/api.php`
- `backend/app/Http/Requests/`
- `backend/app/Services/`
- `backend/app/Models/`
- `backend/tests/`
- `wicars-ui/package.json`
- `wicars-ui/eslint.config.js`
- `wicars-ui/tsconfig.app.json`
- `wicars-ui/src/lib/api.ts`
- `wicars-ui/src/services/`
- `wicars-ui/src/hooks/`
- `wicars-ui/src/**/*.test.ts`
- `wicars-ui/src/**/*.test.tsx`

Last verified against the repository on 2026-08-25.
