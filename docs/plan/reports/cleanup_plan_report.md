# Codebase Cleanup Plan and Reference Review

Date: 2026-09-01

Scope: source, configuration, documentation, and checked-in assets. No files were deleted or modified as part of the review other than this report. Existing uncommitted changes were treated as user-owned and were not reverted.

## Review method

- Read `docs/DASHBOARD.md`, then the architecture, coding standards, decisions, and database notes.
- Enumerated Laravel application classes, routes, jobs, migrations, React entry points, route targets, components, hooks, services, utilities, and assets.
- Traced PHP class names and TypeScript/React imports/references across application code, tests, routes, jobs, documentation, and HTML.
- Checked duplicate asset hashes and inspected package/build entry points.
- Applied a conservative rule: a file is not a removal candidate if it is part of Laravel migration history, a documented compatibility path, a queue/job contract, or a runtime entry point.

## 1. Files confirmed safe to remove

These have no runtime or test references in the repository and are not part of a framework bootstrapping contract. Remove only after approval, with a final build check:

- `backend/app/Http/Requests/StoreUserRequest.php` — empty validation scaffold; `authorize()` always returns `false`; no controller, route, or test references.
- `wicars-ui/src/assets/login-pattern.png` — byte-identical to `src/assets/login-pattern.jpg`; `LoginPage.tsx` imports the JPG.
- `wicars-ui/public/login-pattern.jpg` and `wicars-ui/public/login-pattern.png` — no source or HTML references; the application uses bundled `src/assets/login-pattern.jpg`.
- `wicars-ui/public/campus-bg.jpg` — byte-identical to the imported `src/assets/campus-bg.jpg`; no public-URL references.
- `wicars-ui/src/assets/hero.png`, `grid-pattern.png`, `helper-robot.jpg`, `helper-robot-transparent.png`, `react.svg`, and `vite.svg` — no application imports or public HTML references. `helper-robot-spritesheet.png` is used and must remain.
- `wicars-ui/public/favicon.svg` and `wicars-ui/public/icons.svg` — no references; `index.html` derives the favicon from `src/assets/logo.jpg`.

The asset candidates should be removed as one small batch so the resulting asset ownership is unambiguous. Confirm with product/deployment owners that no external static URL depends on the public copies.

## 2. May be unused; verification required

- ~~`backend/app/Services/Scheduling/GenerateScheduleService.php`~~ — **RESOLVED: removed.** Verification found no runtime import, route, job, command, container binding, or test reference, and two further findings settled it: its `accept()` called `json_decode` on the `array`-cast `recommended_schedules` attribute (a `TypeError` on entry, present since the method was written 11 days after that cast landed, so it cannot have had a live consumer), and it re-derived curriculum from the department's active curriculum — the fallback `SectionCurriculumResolver` explicitly forbids. Architecture documentation updated.
- `backend/app/Models/ScheduleSubmissionSection.php` — no direct application reference was found, but it maps the authoritative `schedule_submission_sections` table and may be used through Eloquent relationship conventions or future workflow code. Inspect `ScheduleSubmission`, migrations, admin tooling, and serialized model usage before removal.
- `wicars-ui/src/components/curriculum/CurriculumDetailModal.tsx` and `YearLevelTabs.tsx` — no consumers beyond their own definitions were found. Verify whether they are intended extension points, dynamically referenced by tooling, or superseded by `CurriculumDetailPage` before removal.
- Frontend test-only files with no production consumer are generally intentional coverage and should be retained; do not classify them as dead code solely from import counts.
- `backend/routes/web.php` and `backend/resources/views/welcome.blade.php` are framework defaults. They are not used by the React SPA, but confirm whether the root web route is needed for health checks or deployment smoke tests.

## 3. Duplicate or redundant implementations

- Duplicate login-pattern assets exist in both `src/assets` and `public`, and both JPG and PNG forms exist. The bundled JPG is the only referenced implementation; the other three are redundant.
- `src/assets/campus-bg.jpg` and `public/campus-bg.jpg` are identical copies. Keep the bundled source asset and remove the public copy after URL verification.
- React route aliases are intentional compatibility paths, not duplicates to remove: `/calendar` and `/vpaa/calendar`, `/secretary/courses` and `/secretary/subjects`, and `/program_head/faculty` and `/program_head/instructors` all target shared pages. See `wicars-ui/src/App.tsx`.
- ~~`GenerateScheduleService` versus newer year-level/split/preflight services~~ — resolved; it was dead rather than a live compatibility boundary (see section 2). The remaining generator overlap is `SplitScheduleService`, which enumerates its own day/slot/room candidates instead of using `CspSolver`. That duplication is deliberate and constraint-correct — it validates every candidate through `RuleEngine`, which enforces the department online/field slot limits — so it is live and must not be removed.

## 4. Dependencies and references affected

- Removing `StoreUserRequest.php` affects only Composer PSR-4 discovery; no route/controller contract changes are expected.
- Removing assets affects Vite's asset graph and any external requests to `/login-pattern.*`, `/campus-bg.jpg`, `/favicon.svg`, or `/icons.svg`.
- ~~Removing `GenerateScheduleService.php`~~ — done. Residual risk was bounded by the fact that its `accept()` raised a `TypeError` on entry, so any external integration calling it was already failing; the backend suite showed no change (20 pre-existing failures before and after, identical failure names).
- Removing `ScheduleSubmissionSection.php` could affect relationship hydration, serialization, factories, or migration-era operational tooling.
- No package dependency was confirmed unused from manifest inspection alone. Dependency removal requires a separate lockfile-aware analysis and build/test run.

## 5. Recommended removal order

1. Confirm the current worktree changes are committed or otherwise backed up; do not mix cleanup with feature/refactoring changes.
2. Remove unreferenced duplicate assets and the empty `StoreUserRequest` scaffold.
3. Run frontend type-check, lint, unit tests, and production build; run Laravel route discovery and focused backend tests.
4. Verify public URL usage, deployment manifests, monitoring/health checks, and any scheduled jobs.
5. ~~Decide the fate of `GenerateScheduleService`~~ — done with owner approval; removed and architecture documentation updated. `ScheduleSubmissionSection` is still undecided and needs the same treatment.
6. Only then consider non-source artifacts (database backups, generated reports, `tmp/`, IDE metadata). Prefer ignoring or archiving them rather than deleting recovery artifacts as part of application cleanup.

## 6. Risks and regression controls

- Static reference scans cannot detect runtime string-based class names, Laravel auto-discovery, reflection, external consumers, or operational scripts outside the repository.
- Public assets may be referenced by bookmarks, reverse-proxy rules, or cached HTML even when source imports are absent.
- Laravel migrations are append-only history and must not be deleted because a later migration replaces a column/table; doing so breaks fresh installs and schema reconstruction.
- Compatibility aliases and synchronous scheduling endpoints are documented and must remain until clients migrate and parity tests pass.
- Validate with `php artisan route:list`, targeted Laravel tests, `npm run lint`, `npm test -- --run`, and `npm run build`. Capture a baseline before cleanup and compare route counts, bundle output, and critical scheduling/approval workflows afterward.

## Approval gate

No cleanup action should proceed until the owner approves the confirmed-safe list and resolves the verification items above. After approval, perform the changes in small commits so each removal batch can be reverted independently.
