# Scheduling Profile removal

Status: implementation, automated verification, and local MySQL migration complete.

## Result

The department Scheduling Profile card, toggle, and table column have been
removed. Course data and configured meetings determine laboratory requirements;
room ownership, program policies, and approved borrowing determine room access.
Setup Courses shows laboratory defaults only when an included, non-field course
needs a laboratory. Hiding those controls preserves saved defaults.

## Implementation

- `CourseScheduleRequirementBuilder` consolidates the former Standard and
  Laboratory builders. It retains the existing requirement contract, component
  durations, delivery choices, preferred rooms, and lab room-type defaults.
- `ScheduleRequirementBuilderResolver` loads selected courses without resolving
  a department profile. Lecture-only majors can use laboratory fallback subject
  to the existing `allow_lecture_usage` room rule. Minor lectures cannot.
- Preflight retains curriculum, active-status, ownership, and duration checks.
  Profile mismatch checks were removed from preflight, configuration validation,
  settings, audits, and diagnostics. Resource feasibility and existing fallback
  policies still apply. Year-level generation with no physical rooms continues
  to request a usable room or an explicit Online choice.
- Configuration validation recognizes borrowed rooms with approved grant windows;
  the solver and placement validators continue to enforce time-window access.
- Year-level generation counts lab demand from course data. Retry and adjustment
  paths rebuild course requirements without profile metadata.
- Department forms ignore stale `scheduling_profile` input; it cannot reset
  laboratory defaults. New responses and snapshots omit profile fields, and old
  serialized profile metadata has no effect on configuration validation.
- The profile enum/resolver, obsolete builders, model attributes, seed values,
  and fixture switches are removed. The department page cache version is bumped.
- A new forward migration drops only `departments.scheduling_profile`. Historical
  create-table migrations remain intact. Rollback restores a Standard column;
  it cannot recover the retired per-department classifications.

## Verification

- 59 targeted backend tests passed (177 assertions): requirement building,
  preflight, scheduling settings, fairness, lab room parity, and domain contracts.
- 186 additional backend tests passed (1,494 assertions): generation, queued
  previews, diagnostics, Integrated/Split behavior, room requests, program room
  sharing, room exhaustion, manual/consecutive scheduling, and engine parity.
- 80 frontend tests passed across Departments, Setup Courses, Course Defaults,
  the year-level workflow, and failure diagnostics. Setup Courses was rerun after
  correcting a test-file encoding issue introduced during editing.
- The production frontend build, including TypeScript checking, passed.
- Regression coverage includes lab scheduling without a profile, lecture fallback
  to an eligible laboratory, stale profile input preserving defaults, foreign
  rooms with and without grants, laboratory requirements without lab hours, and
  excluding/re-including lab courses without losing defaults.
- The migration runs successfully against the isolated SQLite test database.

## Local database rollout

The configured database is local MySQL at `127.0.0.1`. Before the migration there
were no queued/running generation runs. A preservation snapshot recorded 9
existing departments, 13 programs, 590 courses, 56 rooms, 12 room requests, and
325 schedules, plus a hash of all department data excluding the retired column.

The local migration completed successfully. The retired column is absent and the
migration is recorded. Post-migration counts and the department-data hash exactly
match the preservation snapshot. Department/initial-data lookup caches were
invalidated and queue workers were signalled to restart. The unrelated pending
migration was not applied.

The server repeatedly became unavailable during the preliminary
`Schema::hasColumn` metadata query. The migration now uses the normal direct
column drop against the column created by the historical migration; migration
tracking prevents repeat execution. This path passed the scheduling settings
suite again (11 tests, 57 assertions) and succeeded on local MySQL.

For another installation, apply this migration through the usual deployment:

```powershell
cd backend
php artisan migrate --path=database/migrations/2026_10_16_100001_remove_department_scheduling_profile.php --force
```

For other deployments, deploy the API and frontend together with this migration
and restart workers. Already serialized profile fields are inert; do not run
old application code against the schema after the profile column is removed.

## Scope

No new room types or equipment matching were introduced. The existing broad
laboratory classification cannot distinguish computer labs from chemistry labs
or training kitchens; that requires a separate domain requirement.

Stable rules are recorded in `business_rules.md`, `decisions.md`,
`architecture.md`, and `database.md`. Schema diagrams were updated. Existing
unrelated workspace changes were preserved.
