# Schedule Reset and module archives

Date: 2026-11-09
Status: implemented. Supersedes the Reset/Clear parts of the [schedule archive policy review](reports/schedule_archive_policy_review.md) and the central `/archive` page from the [VPAA Archive improvement plan](vpaa_archive_improvement_plan.md). The decision is recorded in [decisions](decisions.md#reset-permanently-deletes-draft-schedules-only-2026-11-09).

## 1. Permanent draft Reset

Current eligibility (2026-11-13): Reset follows the shared plotting-editable policy,
including draft, completed, recalled (`revision`), and Dean/VPAA returned schedules.
Returned schedules need no separate reopening action. Open-submission and approved
locks still apply. This supersedes the original draft-only eligibility below; see
[Correcting returned schedules](business_rules.md#correcting-returned-schedules).

The live workspace returns to normal plotting after Reset. An empty department
shows plotting guidance and progress, with no old rejection badges, correction
warning, submission review action, or Reset checklist. Successful Reset closes
dialogs and clears placement, conflict, drag, and helper feedback for the previous
schedule. The next submission displays its own review status normally.
When the whole scheduling scope is cleared, the previous generation run is
cancelled and late generation/helper responses cannot restore old feedback.

`initial-data` supplies `schedule_reset_since_submission` per section from the
latest reset/submission/review audit event in the active semester. This
presentation flag survives reload and rebuilding, and a later submission or
review clears it. Partial resets leave other sections' feedback intact. Original
submission/revision metadata remains available for validation; Reset does not
rewrite historical submissions, snapshots, reviews, or approval restrictions.

| Item | Behavior |
| --- | --- |
| Endpoints | `POST /api/schedules/reset/preview`, `POST /api/schedules/reset`, both behind `capability:schedule.delete`. |
| Input | `semester_id` and explicit `section_ids` (1–500). Confirm also needs the preview's `expected_token`. Schedule IDs are never accepted from the client. |
| Eligible rows | Live schedules with `status = draft` in the selected sections and semester. |
| Rejects the whole request | Inactive or missing semester; a section outside the semester; an empty section; any live non-draft row in a selected section (`reset_protected`); a section included in an open submission (`pending_dean`, `pending_vpaa`, `approved`, `partially_withdrawn`); department scope or program ownership failure (403). |
| Stale review | The token hashes the semester, sections, schedule IDs with their instructor, and split IDs. A mismatch returns 409 `reset_target_changed` with a refreshed preview; nothing is deleted. |
| Locks | Semester scheduling lock (`SchedulingScopeLock`), then the department workflow row lock as the transaction's first statement (same order now used by schedule restore). The plan is recomputed under both locks. |
| Deletion | `schedule_splits` (with trashed) then `schedules`, by query builder, so no model events or recorders run. The row count must match the plan, otherwise the transaction rolls back. |
| Preserved | Sections, faculty, courses, rooms, curricula, semesters, course teaching-department/program delegation, Schedule History versions/items/snapshots/signatories, submissions, submission-section links, reviewer data, approval records, earlier audit rows, and intentionally archived (soft-deleted) schedules. |
| Recorded | One `schedule_reset` Activity Log entry with counts and IDs, `history_version_id = null`. No recoverable copy. |
| After commit | API caches cleared; existing cross-department release notice ("reset its schedule") sent. |

Code: [`ScheduleResetService`](../../../backend/app/Services/Scheduling/Schedule/ScheduleResetService.php), [`ScheduleResetController`](../../../backend/app/Http/Controllers/Scheduling/ScheduleResetController.php), [routes](../../../backend/routes/api.php).

### Frontend

The scheduler's Reset checklist ([`MarkSectionsDoneModal`](../../src/pages/ClassSchedules/SchedulerPanel/Modals/MarkSectionsDoneModal.tsx), clear variant) offers only sections whose loaded rows are all draft ([`sectionClearCandidates`](../../src/pages/ClassSchedules/SchedulerPanel/sectionClearCandidates.ts)). Confirming calls the preview, shows the semester, section names, and server counts with the warning below, then confirms with the token ([`scheduleReset`](../../src/lib/scheduleReset.ts), [`useScheduler.confirmClearAll`](../../src/pages/ClassSchedules/SchedulerPanel/hooks/useScheduler.tsx)). A 409 shows the refreshed counts for another confirmation. The `/schedules/batch` Reset fallback was removed. Duplicate submissions are blocked while a reset runs; after success the timetable, faculty, and assignment data are refreshed.

> These draft schedules, meeting splits, and draft instructor assignments will be permanently deleted. This cannot be undone. Schedule History will remain unchanged.

### History independence and consumers

- History reads only `schedule_history_versions` / `schedule_history_items`; `original_schedule_id` is not a foreign key, so deleting live rows cannot cascade or null it.
- Teaching history (`FacultyController::teachingHistory`) reads only live rows at instructor-assigned statuses (`approved` and later), which Reset never deletes.
- **No schedule-history "reuse" workflow exists** in either repository (searched backend and frontend; the only "reuse" is curriculum-import catalog matching). None was added.

## 2. Module archives

The archive API, list, filters, detail/restore dialog, dependency checks, and VPAA-only authority are reused. [`ArchivePanel`](../../src/pages/vpaa/archive/ArchivePanel.tsx) renders one module's records; [`ModuleArchiveTabs`](../../src/pages/vpaa/archive/ModuleArchiveTabs.tsx) adds Active/Archived tabs with a module-only count.

| Module | Types | Where |
| --- | --- | --- |
| Users | accounts | `/users?archived=1` |
| Departments | departments, programs | `/departments?archived=1` |
| Facilities | buildings, rooms | `/facilities?archived=1` |
| Instructors | faculty records | `/instructors?archived=1` |
| Designations | designations | `/designations?archived=1` |
| Settings → Academic Semesters | semesters | tab inside the Academic Semesters card |
| Curriculum | courses (curriculum recovery unchanged) | `/curriculum/archived-courses` (legacy Archive links) |

- `GET /api/archives` accepts `types[]`; listing, counts, and `total_archived` stay within it, and a `type` outside it is ignored. The frontend always sends the module's types, so URL edits or clearing filters cannot widen the scope. Archive filters use an `ar_` URL prefix.
- The module Archived tab renders only for the VPAA; other roles on shared routes see only the module's records and make no archive request. Curriculum uses its existing Active/Deactivated/Archived controls without an additional Curricula/Archived row; legacy course recovery links open the separate VPAA-only course archive.
- The Archive sidebar entry was removed. `/archive?type=…` redirects to the owning module with filters carried over; an untyped `/archive` opens Users' Archived tab.

## 2a. Schedules have no archive

Schedules and meeting splits were removed from the archive entirely (superseding the earlier Academic Scheduling archive page and the recalled-only rule). Every delete path removes the class and its split rows permanently (`Schedule::deletePermanently`); the API returns `archived: false`, and the scheduler's Remove confirmation and toast say the deletion is permanent. The archive API rejects the `schedules` and `schedule-splits` types, and the timetable restore, its restore checks, provenance, and catalog code were removed. `/schedules/archived` and `/archive?type=schedules` now open Schedule Approval. The 24 schedules soft-deleted earlier (section 3) remain hidden and unrecoverable; nothing was deleted. Tests: `ScheduleDeletionIsPermanentTest`.

## 3. Legacy cleanup inventory (read-only)

`php artisan schedules:reset-archive-inventory --output=<file>` classifies every soft-deleted schedule and split. It runs inside a rolled-back transaction and changes nothing.

- **confirmed_reset**: a "reset its schedule" release notice names the schedule within 120 s of its archive time.
- **intentionally_archived**: a `schedule_deleted` or `record_archived` event names it.
- **uncertain**: everything else, including batch deletions without reset-specific evidence and generation replacements.

Run on the development database, 2026-11-09:

| Classification | Schedules | Splits |
| --- | --- | --- |
| confirmed_reset | 0 | 0 |
| intentionally_archived | 16 (IDs 15108, 15775, 15776, 16379, 16381, 16471, 16473, 16474, 16476, 16477, 16480, 16482, 16485, 16578, 16579, 16643) | 16 |
| uncertain | 8 (IDs 15112, 15777, 15778, 16380, 16479, 16481, 16483, 16484) | 8 (13963, 14564, 14565, 15113, 15212, 15214, 15216, 15217) |

Proposed deletion: **none.** No record has reset-specific evidence. The 8 uncertain rows have no deletion event naming them (most likely linked meetings removed by a group Delete, which logs only the clicked class). All 8 are referenced by Schedule History items, and 6 belong to section 405, which is in an open submission; 15112 was archived at `revision`. Keep intentional and uncertain records. Any future cleanup needs separate approval of a concrete list and never includes Schedule History.

## 4. Verification

Backend tests ran on the isolated in-memory SQLite test database (`phpunit.xml`).

- New: `ScheduleResetTest` (10), `ArchiveModuleScopeTest` (4), `ResetArchiveInventoryTest` (1): 15 tests, 161 assertions, all passed. They cover physical deletion of drafts and live/soft-deleted splits; byte-identical history, submission, and master-data tables; no new history rows; other semesters, unselected sections, and intentional archives unchanged; every non-draft status and open submissions rejected; stale tokens (new class, changed instructor); submission between preview and confirm; unauthorized department, missing capability (Dean), Program Head ownership, VPAA; invalid scope; full rollback after a failure; notification only after commit; module scope; restore stage guard.
- Existing related suites (Archive, ArchiveRecovery, ScheduleWorkflowIntegrity, ScheduleHistory, ScheduleSignatoryHistory, FacultyTeachingHistory, MultipleCurriculaPerSemester, CrossDepartmentInstructorAssignment, ActivityLog, DepartmentScheduleWithdrawal, ScheduleRecallReviewRace, InstructorAssignmentClear, ScheduleRouteResolution, RoleOperationAuthorization, ProgramScheduleOwnership, ScheduleBatchDepartmentAuthorization): 222 tests, 1597 assertions, all passed.
- Frontend: production build passed (`vite build`). Typecheck shows one error, in `Reports.test.tsx`, a file this change did not touch. Lint is clean on changed files. Changed-area tests pass: reset client, clear candidates, Reset checklist, archive panel/tabs/redirect, Settings, scheduler card. Full suite run in folder chunks: every file passes when run alone. `CurriculumImportPage` (2) and `DropModal` (1) failed only under parallel load and pass alone. `src/components/GanttDepartmentLogos.test.tsx` hangs even alone (stopped after 5 minutes). It is unchanged since 2026-10-15 and imports none of the changed modules, but this was not confirmed against a clean checkout.

## 5. Limitations

- Concurrency is enforced by MySQL/MariaDB `GET_LOCK` and row locks. SQLite tests check the re-validation logic (stale token, submission after preview) but not true parallel requests; no MariaDB concurrency run was done for Reset.
- `/schedules/batch` still accepts a delete-only request with `replace_section_ids` (the old Reset path) for API compatibility and generation; the UI no longer uses it for Reset. Restricting it is a follow-up.
- No authenticated browser walkthrough was performed.
- Deleting a recalled or returned class is now irreversible from the UI; recovery relies on Schedule History's submitted snapshot, which is view/print only.
