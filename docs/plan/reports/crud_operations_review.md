# CRUD API, operations, and connections review

Review date: 2026-10-11. Scope: academic master data, curricula, sections, schedules, splits, faculty, rooms, archive restoration, and their React consumers and cache connections.

This is a fix backlog, not an implementation change. P1 means high priority: authorization, workflow integrity, invalid connected records, or unsafe write coordination. P2 means medium priority: validation consistency, stale data, user interactions, or documentation. API probe results below were reproduced with Laravel feature requests against SQLite `:memory:`. Concurrency and frontend interaction findings are identified as source review, not runtime reproductions.

## Necessity recheck

The 17 entries are not 17 equally urgent implementation requirements. The user requested a second check that the work is necessary. The following classification supersedes any broader reading of the initial recommendations:

| Entries | Decision | Reason and scope |
|---|---|---|
| 1, 2 | Necessary security/workflow fixes | Reproduced approval bypass and cross-department draft-data access. Apply existing authorization rules; preserve intentionally shared reads. |
| 3, 4, 5 | Necessary validation/error fixes | Reproduced unusable archived parents, component bounds bypass, and raw SQL disclosure. Reuse existing validators/messages; no API redesign is needed. |
| 6, 7, 8, 9 | Necessary scheduling-integrity fixes | Alternate mutations bypass guards already enforced on equivalent operations, or leave related identities incompatible. Reject the incompatible change; do not blanket-disable valid CRUD. |
| 10, 11, 12 | Necessary dependency/restore fixes | Reproduced live children with archived parents, classes in an incompatible room type, and restoration into an unavailable room. Cover live operational dependencies; preserve archived history. |
| 14 | Necessary consistency fix | Four API probes returned old relationships, availability, or teaching load after successful writes. This is server-side staleness, not merely a visual preference. |
| 13 | Production safeguard needing targeted verification | Missing lock/transaction boundaries are visible in source, but concurrent requests and partial-write failures were not reproduced. Validate those paths before broad refactoring. Prioritize the existing single-create lock gap. |
| 15, 16 | Lower-priority frontend follow-ups | Source evidence supports the concerns, but no browser walkthrough was performed. Verify the affected navigation/action flow before expanding invalidation. The inaccurate archive message can be corrected independently. |
| 17 | Documentation correction only | The discrepancy is verified. It does not authorize changing the tested business behavior to match stale documentation. |

**Confirmed necessary defect categories: 13** (entries 1–12 and 14). **Other follow-ups: 4** (13 and 15–17), with different evidence and urgency. The 19 probes are reproduction cases, not 19 separate backlog entries.

Implementation status: Phases 1-4 are implemented in the workspace. Entries 1-12 and 14-17 have targeted corrections. Entry 13 has lock/transaction safeguards and failure-injection coverage; real MySQL/MariaDB contention remains an integration verification item.

The implementation should stay limited to the failing paths. Shared-validator/service reuse is recommended where it prevents the demonstrated bypass; a new abstraction is not mandatory. No redesign, new permissions, new endpoints, or database fields have been justified by this review. Preserve multiple active curricula, current Secretary/Program Head authoring, intentional same-department/shared-resource visibility, faculty assignment preservation for restoration, and existing per-row partial success.

## API fixes

### 1. P1 — Force new schedules through the draft workflow

**Resolved (2026-10-11):** Single creation now accepts an omitted status or explicit `draft`, rejects other supplied statuses with Laravel's 422 validation response, and explicitly persists and returns `draft`. The rejection uses the existing batch workflow message. Regression tests cover every supported non-draft status, malformed status input, omitted/explicit draft, absence of writes for rejected requests, and continued conflict rejection. Verification passed PHP syntax checks and 68 relevant tests (283 assertions) across the workflow/authorization suite and the added conflict check. The reproduction below describes the behavior before this fix.

**Entry point:** `POST /api/schedules`; `backend/app/Http/Controllers/Scheduling/ScheduleController.php:135`, especially status validation and the write at line 196.

**Reproduced:** A secretary submitted a valid placement with `status: finalized`. The API returned 201 and persisted `finalized`, bypassing submission, Dean review, VPAA review, and instructor finalization. Batch creation already rejects non-draft initial statuses.

**Fix:** Enforce `draft` at the server's single-create boundary and reject attempts to select a later stage. Reuse the batch/approval workflow rules. Cover each non-draft initial status in a regression test.

**Connections:** Schedule creation → approval queues → faculty assignment → reports/calendar. A forged stage affects every consumer that trusts persisted status.

### 2. P1 — Apply consistent resource scope to alternate read routes

**Resolved (2026-10-11):** Schedule details and split list/detail reads now reuse the existing scoped schedule-list rules through `ScheduleAuthorizationService::scopeReadableSchedules`. Alternate section lists enforce department/program scope and include scope in cache keys. Delegated teaching, shared-room visibility, and VPAA approval-queue visibility are preserved. Six new regression tests cover denied and allowed reads, cache isolation, and archived parents (88 assertions). PHP syntax checks and the broader relevant backend suite passed: 88 tests, 451 assertions. One existing ownership test fixture was updated to submit `draft` so it continues reaching its intended ownership guard after entry 1's fix. The reproduction below describes the behavior before this fix.

**Entry points:**

- `GET /api/schedules/{schedule}` — `ScheduleController.php:1224` (`show`).
- `GET /api/sections/semester/{semesterId}` and `/api/sections/department/{departmentId}` — `SectionsController.php:358` and `:367`.
- `GET /api/schedule-splits` and `/api/schedule-splits/{scheduleSplit}` — `ScheduleSplitController.php:17` and `:47`.

**Reproduced:** A secretary in a different department retrieved the first department's draft schedule, its splits including the nested schedule, and its sections through these endpoints. Authentication and `schedule.view` middleware were present; resource scoping was missing. Main section `index/show` and schedule list routes already have stronger scope checks.

**Fix:** Reuse `ScheduleAuthorizationService` department/program and schedule visibility rules in every applicable read adapter. Preserve intentionally shared room/instructor visibility in existing list flows; do not apply a blanket restriction to those flows. Include caller scope in cached alternate lists.

### 3. P2 — Reject archived parents in create/update validation

**Remaining authoring adapters resolved in Phase 2 (2026-10-11):** User, faculty, section, curriculum, room, room-request, and teaching-assignment parent selections reject archived records. Curriculum creation/update also validates inherited department/program values. Nullable shared curriculum ownership remains supported. Sections use hard deletion in the current implementation, so section existence checks intentionally do not assume `deleted_at`; this is the documentation discrepancy tracked in #17.

**Program/course paths resolved (2026-10-11):** Program create/update validates its non-archived department; update retains immutable ownership. Course create/update rejects archived departments and programs, including retained parents on partial updates, and validates the resulting department/program pair. Clearing an optional program and conversion to a minor remain supported. Batch course creation validates the department inherited from its curriculum before writing. Eight new regression tests cover rejection without writes and valid operations. The relevant backend suite passed 93 tests (435 assertions). This implementation is limited to program/course authoring; analogous parent-reference rules in other CRUD adapters remain follow-up work.

**Entry points:** `POST /api/programs`, `POST /api/courses`, and related parent-ID request rules. See `backend/app/Http/Requests/Program/StoreProgramRequest.php:28`, `Course/StoreCourseRequest.php:47`, and `Course/CourseRequest.php:30`.

**Reproduced:** A VPAA created a program under an archived department. A secretary created a course referencing an archived program while another live program kept the department eligible for `schedule.create`.

**Cause:** Bare `exists` rules query rows regardless of `deleted_at`; the foreign key also accepts the archived row.

**Fix:** Use the existing parent relationships/scopes to require usable parents, including `deleted_at IS NULL` for soft-deleted tables, and validate the final department/program pair. Apply this consistently to relevant single and batch endpoints, without assuming every table has `deleted_at`.

### 4. P2 — Share course validation across single and batch creation

**Resolved (2026-10-11):** Single create, partial update, and batch creation reuse `CourseRequest` rules for course code/name, component limits, units, and category. `BatchStoreCoursesRequest` applies those rules to each row and shares code normalization while retaining numeric curriculum placement. Code/name lengths are bounded to the schema's 255 characters; malformed codes remain invalid instead of being coerced. Invalid requests return 422 before writes, and accepted batches retain their per-row success/error response. Ten regression cases cover parity, no writes on rejection, boundary values, normalization, placement, and mixed results. Verification: 41 relevant tests passed (278 assertions).

**Entry point:** `POST /api/curriculum/{curriculum}/courses/batch-create`; `CurriculumController.php:373`.

**Reproduced:** Single course creation rejected `lecture_hours: 100`, but batch curriculum course creation accepted the same value and persisted it. The batch rules lack the component bounds used by `StoreCourseRequest` and `UpdateCourseRequest`.

**Fix:** Extract/reuse the existing course normalization and bounded component rules. Preserve numeric curriculum-pivot placement versus string course-default placement and the existing per-row batch response contract. Align string limits with the actual schema. Test both entry points with the same invalid values.

### 5. P2 — Return safe, actionable batch row errors

**Resolved (2026-10-11):** Batch lookup includes archived courses within the owning department and returns the existing single-course restoration message for archived duplicates. Known placement conflicts retain their actionable message. Unexpected row failures roll back, are reported through Laravel's exception handler, and return a generic retry/contact-administrator message instead of exception text. Successful rows remain committed, and success is added only after commit. Regression coverage verifies archived duplicates, safe responses, internal reporting, rollback after an inserted row, and successful rows before/after a failure. Verification: 37 relevant tests passed (270 assertions), plus PHP syntax checks.

**Entry point:** The same batch-create endpoint; `CurriculumController.php:483`.

**Reproduced:** Reusing an archived course code produced an HTTP 200 batch response with an error row containing `SQLSTATE` and an `insert into` statement. The ordinary create flow already returns a restore-oriented duplicate message.

**Fix:** Check archived duplicates explicitly, return the established user-facing duplicate/restoration message, log unexpected exceptions internally, and map them to a generic row error. Preserve the existing 200-with-row-results contract for partially successful batches.

## CRUD operation fixes

### 6. P1 — Protect bulk curriculum assignment with the section lock rules

**Resolved (2026-10-11):** Bulk assignment reloads and locks selected sections inside its transaction, locks existing schedules, and uses `hasLockedSchedules()` before changing curriculum. A locked target rejects the entire batch with the ordinary section-update message, leaving section and schedule curriculum identities unchanged. Assigning the current curriculum is allowed, and explicit selection of an unlocked section excludes locked peers. Tests cover seven approval-stage statuses, atomic rejection, no-op assignment, and selected targets. Verification: 43 relevant tests passed (191 assertions), plus PHP syntax checks. SQLite feature tests verify behavior; production database concurrency was not exercised.

**Entry point:** `POST /api/sections/assign-curriculum`; `SectionsController.php:246`.

**Reproduced:** A section with an `approved_by_dean` class received a different curriculum successfully. The section's `curriculum_id` changed, while the persisted schedule retained the previous curriculum. Ordinary section update checks `hasLockedSchedules()`; this bulk path does not.

**Fix:** Reuse the ordinary structural-edit guard before any bulk change, fail the batch atomically when a target is locked, and validate the resulting section/schedule curriculum relationship. Recheck inside the coordinated write boundary.

### 7. P1 — Validate the complete section identity on structural edits

**Resolved (2026-10-11):** Section updates reload the section in a transaction, validate the merged identity, and reject incompatibility with its retained curriculum, live schedules, or course placement. Valid unscheduled changes and name edits remain supported. Regression coverage includes a program-only edit, year change, curriculum change, and valid edits.

**Entry point:** `PUT/PATCH /api/sections/{section}`; `SectionsController.php:187`.

**Reproduced:** Changing only a draft section's `program_id` succeeded while its existing program-specific curriculum and draft schedule still belonged to the old program. The curriculum check runs only when `curriculum_id` is included in the request.

**Fix:** Validate the merged persisted-plus-request section, not just supplied fields. Check the existing curriculum when department/program changes. Reject moves that leave its curriculum or classes incompatible unless an established workflow can migrate and revalidate the dependent rows atomically. Do not prohibit a structural change merely because a class exists if the resulting relationships remain valid. Evaluate year, semester, department, program, and curriculum changes against their existing contracts.

### 8. P1 — Prevent course replacement from bypassing the detach guard

**Resolved (2026-10-11):** Replacement and single/batch placement changes reuse the direct-removal dependency check. Checks occur inside the pivot-write transaction before any pivot changes, under a curriculum row lock. Unchanged placement remains allowed. Tests verify replacement rejection, atomic batch rejection, unchanged placement, and replacement after scheduled dependencies are cleared.

**Entry point:** `POST /api/curriculum/{curriculum}/courses` with `replace_course_id`; `CurriculumController.php:303`.

**Reproduced:** Direct removal of a scheduled course returned 422, but replacing it through this endpoint returned 200 and removed its pivot while leaving the class scheduled. The frontend replacement flow uses this endpoint (`wicars-ui/src/hooks/curriculum/useCurriculumDetail.ts:487`).

**Fix:** Reuse the scheduled-course removal check inside the replacement transaction before altering either pivot. Also guard moving an existing course's pivot placement through `syncWithoutDetaching` in single/batch attach paths when current scheduled cohorts depend on it. The latter extension is identified by source review.

### 9. P1 — Give split CRUD the same workflow and integrity guards as schedules

**Resolved (2026-10-11):** Split writes use the shared scheduling scope lock, transactions, fresh parent ownership/stage checks, the schedule rule engine, and configured meeting-group validation. They reject archived/locked parents, incompatible group identities/indexes, and removal of required linked metadata. Successful writes record schedule history, revision changes, and audit entries, then invalidate schedule-related payload caches. Tests cover create/update/delete, reassignment, rollback, required groups, duplicate indexes, history/audit, and cache invalidation. Phase 1 verification: 116 relevant tests passed (656 assertions), plus syntax and diff checks. Production database concurrency and browser interactions were not exercised.

**Entry points:** `POST/PUT/PATCH/DELETE /api/schedule-splits`; `ScheduleSplitController.php:30`.

**Reproduced:** A secretary changed the meeting type of a split belonging to a `finalized` class from lecture to laboratory. The controller checks writable ownership but does not enforce the parent schedule's editable stage or validate the resulting meeting group.

**Fix:** Reuse parent schedule stage checks, meeting-group validation, write coordination, history/audit behavior, and cache invalidation. Prevent creating or reattaching split metadata under archived/locked schedules. Model events announce split changes, but they do not invalidate all cached schedule payloads by themselves.

### 10. P1 — Check every live dependent before archiving parent records

**Resolved in Phase 2 (2026-10-11):** A shared dependency service checks live users, faculty, courses, sections, non-archived curricula, schedules, teaching assignments, and room assignments. Department checks also cover programs and current pending/approved room requests; program checks cover delegated-source courses. Responses identify `blocking_relations`. Soft-deleted records and archived curricula alone do not block archiving.

**Entry points:** `DELETE /api/programs/{program}` — `ProgramController.php:74`; `DELETE /api/departments/{department}` — `DepartmentsController.php:101`.

**Reproduced:** A program with live sections and an active curriculum was archived because the guard checked only users, faculty, and owned courses. A department containing courses and an active curriculum was archived when it had none of the relations currently checked. The child rows remained live, but their normal Eloquent parent relationships returned null.

**Fix:** Extend existing dependency guards first to the reproduced live sections, curricula, and courses. Evaluate schedules, room program assignments, and teaching delegation against their actual operational contracts before adding further blockers. Return the blocking relations so the operator can resolve them. Archived historical references alone should not become a blanket blocker. Preserve archived history and the existing soft-delete contract; do not cascade permanent deletion to make the guard pass.

### 11. P1 — Revalidate affected classes before room structural changes

**Resolved in Phase 2 (2026-10-11):** Room updates and the separate department-assignment route share transactional validation under scheduling scope locks. Room-type, lecture-use, access, and current-semester availability violations reject the proposed change and roll it back. Ownership/shared-type changes also protect program allocations and active room requests. Existing past-semester availability behavior remains supported. Tests cover finalized bookings, compatible edits, incompatible type/ownership/lecture-use changes, and retained program allocations.

**Entry point:** `PUT/PATCH /api/rooms/{room}`; `RoomsController.php:61`.

**Reproduced:** A lecture room used by a finalized on-site class changed to `field` successfully. The existing booking guard protects availability status changes but does not protect room-type changes.

**Fix:** For changes to room type, lecture-use policy, or ownership/access, validate every affected live class through the existing room and assignment rules. Reject incompatible changes until classes are relocated through the scheduling workflow. Include active room grants/program shares when assessing ownership changes.

### 12. P1 — Restore schedules through current scheduling validation

**Resolved in Phase 2 (2026-10-11):** Timetable restoration runs current placement and meeting-group validation plus the existing conflict scanner inside the semester scope lock and transaction. Required linked groups restore atomically; any invalid member rolls back restoration and audit writes. Standalone split restoration checks its parent stage and current rules. Tests cover unavailable rooms, missing curriculum placement, valid restores, and complete-group rollback/success. Phase 2 verification: 192 relevant tests passed (853 assertions), plus PHP syntax and diff checks. Production database concurrency and browser behavior were not exercised.

**Entry point:** `POST /api/archives/schedules/{id}/restore`; `ArchiveController.php:71`.

**Reproduced:** After archiving a class, its room could be marked unavailable. Restoring the class still succeeded. Restoration checks parent presence and overlap conflicts, but that does not cover room availability, curriculum placement, faculty eligibility, or the rest of the scheduling policy.

**Fix:** Reuse current scheduling validation under the semester write lock and transaction. Handle split/group restores as complete groups where required. Return actionable violations and preserve the existing conflict scanner behavior. Do not treat absence of an overlap as proof that a restored placement is valid.

### 13. Conditional production follow-up — Verify write coordination and atomicity

**Phase 4 implementation (2026-10-12):** Single-create now enters the shared semester lock and transaction before fresh section/authorization/conflict checks and creation/audit writes. Single/group deletion reloads the schedule and group inside the lock/transaction, rechecks stage/scope, and rolls back every member on failure. Lock timeouts return the existing actionable 422 payload. Duplication locks/reloads its source and commits the parent and placements together, with fresh parent/scope validation. Notifications and cache invalidation follow successful persistence. Failure injection verifies create-audit rollback, grouped deletion rollback, duplicate-pivot rollback, and stale-state checks at lock entry. These tests do not claim real MySQL advisory-lock contention coverage.

**Source-review finding; concurrency/failure injection was not run.**

`ScheduleController::store` validates and writes without `SchedulingScopeLock`, while batch/update use the existing lock and transaction. `destroy` performs group deletion in a loop without a shared transaction; curriculum duplication creates the parent before attaching its courses without one transaction. Structural changes and archive restoration also need to participate in the appropriate existing coordination boundary.

**Next verification:** Reproduce concurrent single-create placement against MySQL/MariaDB and inject a failure during grouped deletion/duplication. The single-create path does not participate in the lock already used by batch/update; this is the first safeguard to address for a concurrent deployment. Assess other paths individually rather than migrating every CRUD controller to a new persistence framework.

**Targeted correction:** Reuse `App\Services\Scheduling\Lock\SchedulingScopeLock` where competing schedule writes require it; validate fresh state inside the lock/transaction. Make dependent writes plus required history/audit atomic where partial completion breaks the operation's contract. Emit notifications and cache updates after successful persistence. Keep per-row partial success in course batch import if that is the established contract; atomicity should not silently change that contract.

**Risk:** Concurrent placement can validate against the same empty slot, and interrupted multi-step operations can leave partial groups or parent/child state. Validate production locking on MySQL/MariaDB; the implementation intentionally skips advisory locks on SQLite.

## Connections and frontend fixes

### 14. P2 — Invalidate backend caches by dependent data, including restoration

**Reproduced:**

- Warm `/api/sections`, rename its curriculum, read again: the embedded curriculum name remains old.
- Warm `/api/faculties`, replace availability, read again: the availability list remains empty.
- Warm `/api/faculties`, change an assigned course from 3 to 6 units, read again: cached `assigned_units` remains 3.
- Warm `/api/sections` while its program is archived, restore that program, read again: embedded `program` remains null.

**Sources:** `CurriculumController.php:223`, `FacultyAvailabilityController.php:40`, `CoursesController.php:196` (`update`), `ArchiveController.php:147`, and `backend/app/Support/ApiCache.php:10`.

**Fix:** Reuse `ApiCache` groups or its existing composite dependency keys. Add missing dependencies for nested relationships, teaching-load calculations, availability, curriculum counts, and restored records. The lookup TTL is 300 seconds; a frontend refetch can still receive stale server data. Audit split changes too, because cached initial-data schedules include split information.

**Resolved in Phase 3:** Related lookup reads now reuse composite dependency versions, preserving existing scope and response shapes. Availability replacement invalidates faculty/bootstrap data after persistence. Existing program, course, schedule, and restore invalidations now refresh dependent section relations, teaching loads, curriculum counts, and assignment payloads. Ten warm-cache API regression tests cover the four reproduced cases plus related labels/counts and split create/update/delete. The bootstrap TTL documentation was corrected to the existing 300-second implementation; no TTL behavior changed. Verification: 133 related tests passed (695 assertions), including all 10 new regression tests; PHP syntax and whitespace checks passed. These checks use SQLite and the test cache, not production Redis or concurrent browser sessions.

### 15. P2 — Refresh connected frontend data after faculty mutations

**Phase 4 implementation (2026-10-12):** Faculty create/edit/archive and load-editor saves invalidate the existing faculty, department, assignment, schedule, and dashboard cache groups after success, then keep the local list current. The archive message now explains that assignments are preserved for restoration. A rendered-page test warms connected caches, archives an instructor, and verifies the next connected read reloads; a rejected write retains cached data and the visible instructor. Existing other-client live-update handling is reused. Availability replacement also explicitly advances the assignment group because its bulk SQL does not emit faculty model events; an event test verifies the assignment refresh topic.

**Source-review finding.** `wicars-ui/src/pages/shared/Faculty.tsx:400` and `:506` update only the local faculty-page cache after archive/edit/create. They do not invalidate the connected scheduler, assignment, dashboard, and department caches through `invalidateCacheGroups`, as other CRUD pages do.

**Next verification:** Warm connected pages, mutate faculty, and navigate back within the cache freshness window. Verify both the originating browser and another connected browser; the originating request supplies `X-Socket-ID`, and the backend excludes that socket from the broadcast. Other clients already receive topic-driven invalidation through `liveUpdates.ts`; that mechanism must be reused, not duplicated.

**Targeted correction if visible staleness is confirmed:** Reuse `wicars-ui/src/lib/cacheGroups.ts` after a successful mutation and refresh only the affected consumers through the existing mechanism. Do not invalidate every domain cache for every faculty change.

**Related wording fix:** The archive toast says meetings are "now unassigned" (`Faculty.tsx:412`), but the existing tested backend contract preserves `schedules.faculty_id` for restoration (`InstructorManagementTest::test_archive_reports_affected_schedules_and_preserves_assignments_for_restore`). Describe the archived instructor and affected meetings accurately; preserve that intentional restoration behavior unless the product workflow is explicitly changed.

### 16. P2 — Match curriculum controls to record-level authoring scope

**Phase 4 implementation (2026-10-12):** A shared record-scope predicate mirrors backend department/program authoring rules and gates list/grid mutations, detail editing/activation, and archive restoration. A direct `mode=edit` URL remains read-only for a Program Head viewing a department-wide or other-program curriculum. Scope and rendered-detail tests cover these cases; backend authorization remains authoritative.

**Source-review finding.** `CurriculumListPage.tsx:229` and `CurriculumDetailPage.tsx:18` gate editing on the global `curriculum.manage` capability. Backend `CurriculumController.php:169` permits a Program Head to author only a curriculum owned by their program, while read scope also includes department-wide curricula.

**Lower-priority correction:** Verify the Program Head flow on a department-wide curriculum, then make the offered edit/activate/archive/duplicate controls reflect the same ownership rule. The backend already rejects these writes, so this is an interaction correction, not an authorization vulnerability. Keep backend authorization authoritative.

### 17. P2 — Reconcile documentation with verified CRUD behavior

**Phase 4 implementation (2026-10-12):** Canonical architecture/database/coding standards now reflect Secretary/Program Head authoring, multiple active curricula, `active/deactivated/archived` statuses, and permanent section deletion. Related stale history-observer references were reconciled with the existing version/item recorder and legacy-table retirement. No business behavior was changed to match old documentation.

The current documentation and code disagree:

- `docs/architecture.md:100` says VPAA owns all curriculum mutations; `backend/config/capabilities.php` allows Secretary/Program Head authoring and excludes VPAA/Dean authoring.
- `docs/database.md:119` describes `draft/active/archived` curriculum statuses and one-active-per-scope demotion. Current model/controllers/tests use `active/deactivated/archived` and support multiple active curricula.
- `docs/database.md:145` and `:266` describe section soft deletes. `Sections` has no `SoftDeletes`, its migration has no `deleted_at`, and the existing CRUD test expects permanent removal. The Archive API does not list sections.
- `docs/coding_standards.md:85` describes an active-curriculum `saving` hook that is absent from the current model.

**Fix:** Investigate and document the intended current behavior using the existing capability, curriculum-creation, and deletion tests. Update canonical documentation after agreement. Do not change working authoring or curriculum lifecycle behavior merely to match stale prose, and do not add soft deletes as an isolated patch.

## Initial review verification and limits (before implementation)

- 102 existing backend tests passed across CRUD integrity/follow-up, archive, program management, section scope, role operations, schedule routing/workflow, faculty management, curriculum independence/creation, program scheduling ownership, and building management.
- 19 temporary API probes reproduced the behaviors recorded above; the final probe run passed 69 assertions. These probes asserted observed defects for diagnosis, not correct behavior. They were removed after the review; implementation work should add regression tests that assert the corrected behavior.
- 22 existing frontend tests passed for the shared API client, data cache, live updates, and Rooms rendering.
- No application implementation was changed. No production database writes were used for API probes. Unrelated work already present in the workspace was preserved.
- No full application test suite, production MySQL concurrency test, or live browser CRUD walkthrough was performed. The report is a prioritized review of the inspected paths, not certification of every endpoint.

Suggested implementation sequence: approval/status and read scope → section/curriculum/split integrity → parent archive and restoration safety → shared validation/error handling → cache and frontend propagation → documentation alignment. Reuse existing services and guards; no new endpoints or database fields are required merely to start these fixes.

Necessity recheck: reviewed the current capability registry, workflow guards, room constraints, existing CRUD/ownership tests, model lifecycle behavior, frontend live-update/cache handling, and record-level curriculum authoring. No unchanged test suites were rerun solely to repeat the initial results. No application code was modified during this recheck.

## Final combined review (2026-10-12)

Reviewed the four phases together: scope and status checks, merged identities, pivot guards, split integrity, archive dependencies, room structural validation, restores, cache dependencies, transaction boundaries, and frontend mutation/control connections. Additional review fixes move section cache invalidation after persistence, emit the assignment refresh topic after availability writes, and reject room/course restoration with archived retained assignment parents. The latter two restore cases first reproduced as HTTP 200 and now have regression coverage requiring HTTP 422 until those parents are restored.

Final verification:

- Full backend suite: **1,176 tests passed, 7,482 assertions**. The full run began before the final restore-parent additions; a follow-up run against the final affected restore/parent/cache/curriculum paths passed **63 tests, 403 assertions**.
- Final cache/atomicity regression run: **17 tests passed, 146 assertions**.
- Full frontend suite: **121 files, 988 tests passed**.
- TypeScript and Vite production build passed. Targeted ESLint checks passed. Changed/added PHP syntax and Git whitespace checks passed.
- No unresolved failures were found in these runs. The original 17-item backlog has local implementation/test coverage for the agreed scope; the production verification portion of #13 remains open.

 Production MySQL/MariaDB lock contention, production Redis, and a live multi-browser walkthrough remain unverified; tests use SQLite, the array cache, rendered React components, and simulated live-update events. Unrelated workspace changes were preserved.
