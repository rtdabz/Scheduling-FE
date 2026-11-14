# Architecture decisions

## Owner revocation temporarily moves borrowed classes Online (2026-11-09)

When a room owner revokes an approved borrowing grant, automatically switch only
the borrower's overlapping classes in the granted room and semester to Online.
Clear `room_id` and retain the original room and displacement time in
`displaced_room_id` and `displaced_at` so existing room recovery can identify
classes that still need reassignment. Preserve day, time, instructor, and
schedule status, and keep history, revision tracking when applicable, audit,
and recovery records in the grant transaction. Borrower Give Back/cancellation
continues to move affected classes to Room TBA without changing delivery mode.

## Master Calendar centers the weekly timeline

The Master Calendar uses the existing Gantt components as its primary workspace.
A compact semester header and meeting count replace the introductory banner and
statistic cards. Search, department, row grouping, days, zoom, session type,
density, collapse controls, printing, and standard hours stay visible. The
Overlaps filter and View options disclosure are removed.

All seven days, including Sunday, are always available. Selecting a day shows
only that day's timeline and expands it if collapsed; All days restores the
full week, while Clear filters also resets the other filters.
The meeting count and department legend follow the selected day and filters.
Overlap detection still considers all loaded meetings, including hidden ones.
Fit uses the available chart width and reduces time-label density on narrow
screens; fixed zoom levels remain available for inspecting small blocks.

The VPAA dashboard reuses `MasterGantt`, its layout helpers, department palette,
and schedule detail modal through `DashboardGantt`. Its preview retains the
active-semester and `isVpaaApproved` publication scope, defaults to today's
on-site meetings, and offers Week plus separate On-site, Online, and Field
delivery filters. Field meetings are excluded from On-site. Time settings come
from the existing `/initial-data.time_grid` payload. Overlaps are calculated
across the loaded published semester meetings before display filters; the
2,000-row preview limit remains explicit and is not a campus-wide aggregate.
The dashboard timeline uses a compact title/search/action row instead of a
subtitle and statistic cards. Department, building, and room filters open from
the Filters button and retain their selections when closed; the visible meeting
count remains alongside Today/Week, delivery mode, grouping, and zoom controls.

Schedule cards, hover summaries, and details display the department's uploaded
logo. Both views resolve departments from their already-loaded directory by ID,
keeping logo data out of repeated nested schedule API relations. The shared
department-logo component shows an icon when an upload is absent or fails to load.
The dean, secretary, and program-head dashboard timelines and the dean schedule
viewer also resolve logos from the `/initial-data.departments` directory. The
instructor timetable loads `/departments` alongside its faculty-filtered schedules
and joins each meeting by its own department ID, including cross-department
teaching. If that directory request fails, the timetable remains available with
the shared fallback icon.

## VPAA settings preview drafts before saving

VPAA Settings groups semesters, operating hours, signatories, and activation
history behind in-page section links. The daily-hours bar and printed-signature
preview reflect the form drafts; they do not persist changes. Existing explicit
save actions, validation, and the semester activation confirmation remain the
only paths that apply those settings. The hours preview uses the shared
operating-hours parser and hides the range when the draft is invalid.

## Reports share a department directory

The shared Reports page presents Department Schedule, Teaching Load, Room
Utilization, and Curriculums & Courses above a department-grouped directory.
The directory header shows only the selected report title; descriptions,
readiness notices, search, filters, and the directory scope counter are omitted.
Availability counts represent report scopes, not unique sections or faculty.
The existing reports API remains authoritative for approval and access scope,
and the existing schedule and teaching-load PDF builders produce the documents.
Failed refreshes keep the last loaded directory visible with an inline notice.
Teaching-load PDFs use red text for instructor conflict overrides. Pro bono
entries remain grey even when overridden, and retain the grey pro bono legend.

## One rule catalog, two execution modes

Manual edits and generated schedules use different execution strategies, but
they share `SchedulingPolicy` and the `RuleEngine` constraint definitions. The
CSP solver may use optimized domain pruning, while the final candidate is still
validated through the same hard-rule semantics.

## Course configuration owns Split and Hybrid behavior

The scheduling Settings page no longer controls Minor, Major, or Hybrid
availability. Step 2 of the schedule generator is the source of truth for
per-course delivery and configuration. Split Session is always available to
eligible courses; Hybrid Split and Hybrid Laboratory are resolved from the
course's units, component hours, delivery mode, and selected section. The API
retains legacy fields for compatibility, but their boolean enable switches are
ignored when course selections are supplied.

## Queue expensive generation

Year-level preview generation is asynchronous for production workloads because
constraint search can exceed a normal HTTP request budget. The run record is
the durable progress contract; polling is preferred to holding an HTTP worker.

## Preserve compatibility during refactoring

Existing synchronous endpoints and response shapes remain available while new
services and shared UI components are introduced. Refactors must be covered by
the existing feature suite before old paths are removed.

## Normalize schedule approval by submission cycle

`schedule_submissions` and `schedule_submission_sections` are the authoritative
approval workflow records. A submission row owns the revision lineage, actors,
review timestamps, rejection reason, withdrawal state, and override decision;
its section rows define the exact cohort sent through that cycle.

`schedules.status` remains an operational mirror because timetable editing,
generation, faculty assignment, finalization, and conflict checks depend on a
row-level lock state. Approval actor and decision columns must not be added back
to `schedules`. Workflow events remain in `scheduling_audit_logs` and schedule
history, so a second approval-event table would be redundant.

Dean and VPAA queues read submission cycles directly. Notifications are delivery
records and must not be used to reconstruct authoritative workflow state.

## Access follows the role; Manage Access was removed

At the adviser's request, User Management no longer has a per-account Manage
Access matrix. Capabilities come from the role alone (`config/capabilities.php`
`role_defaults` in the backend): Secretaries and Program Heads share one
schedule-building set (view, create, update, delete, generate, submit, withdraw,
instructor and cross-department assignment, curriculum authoring). Only
Secretaries additionally request other departments' rooms, review requests for
their own department's rooms, and assign rooms to programs. Deans keep view and
dean approval. The VPAA views, assigns instructors, approves schedules, and
manages designations; it does not build schedules or take part in room
requests, and is only notified of them. Cross-department assignment is included
because existing secretaries relied on it. (Corrected 2026-11-03: this entry
previously listed room requests for Program Heads and said the VPAA kept every
capability; neither matched the enforced role defaults.) The capability middleware still guards every route, so moving to roles
changed where grants come from, not how they are enforced.

Migration `2026_09_15_000001` re-syncs the roles before deleting per-account
grants, so no account loses access in between. Grants are deleted rather than
kept because nothing could display or revoke them afterwards. The migration
cannot restore them; back up `model_has_permissions` first if they may be needed.

## Archive domain records instead of permanently deleting them

User-facing delete endpoints preserve domain records with soft deletes. The
VPAA reviews and restores them from an Archived tab inside the module that owns
them (Users, Departments, Facilities, Instructors, Designations, Settings →
Academic Semesters, and Curriculum for courses). Schedules have no archive (see
below). Each tab is locked to its module's record types; the central
`/archive` page was removed and its links redirect to the owning module. Restore
authority is unchanged: the archive API stays VPAA-only, so sharing a module
with other roles does not let them restore. Curricula continue
to use their established `archived` status because that status is part of the
curriculum workflow. Security-sensitive token revocation and transient
replacement data are excluded from archival and remain immediate deletions.

## Reset permanently deletes draft schedules only (2026-11-09)

Supersedes the earlier "Clear schedules uses the section checklist" decision and
the 2026-11-01 proposal to archive Reset actions
([schedule archive policy review](reports/schedule_archive_policy_review.md)).

Reset uses the section checklist with only the open section preselected, then
`POST /api/schedules/reset/preview` and `POST /api/schedules/reset`
(`schedule.delete`). The request carries one `semester_id` and explicit
`section_ids`; the server resolves the rows. Only live `draft` rows are eligible:
a selected section with any other live status, a section in an open submission,
an inactive semester, an empty section, or a section outside the user's
department/program write scope rejects the whole request. The preview returns
server counts and a token; the confirm must present the same token, and a changed
target returns 409 with a refreshed preview that must be confirmed again.

Reset takes the semester scheduling lock, then the department workflow row lock
as the transaction's first statement, re-checks everything, and physically
deletes the schedules and all their split rows (soft-deleted ones included)
with query-builder deletes, so no model events, archive, history, or revision
recorders run. It never archives. It writes one metadata-only `schedule_reset`
Activity Log entry and sends the existing cross-department release notice after
commit. It never inserts, updates, or deletes Schedule History, submissions,
approvals, or earlier audit rows; history keeps `original_schedule_id` values
for rows that no longer exist.

Generation replacement keeps using `/schedules/batch`. The frontend no longer
sends Reset through `/schedules/batch`.

## Schedules have no archive (2026-11-09)

Class schedules and meeting splits are never archived and never restored. Every
delete path (single Delete, group Delete, batch deletion, split deletion, and
Reset) removes the rows and all their split rows permanently
(`Schedule::deletePermanently`). Schedule History keeps its own snapshots and is
not touched. The archive API no longer accepts the `schedules` or
`schedule-splits` types (list validation rejects them; detail and restore return
404), and the scheduler warns that removing a class is permanent. Rows
soft-deleted before this decision stay in the database, hidden and unrecoverable;
removing them needs separate approval of the legacy inventory. This is an
exception to "archive domain records instead of permanently deleting them".

## Task-based interactive guides on the existing tour library

Onboarding stays on react-joyride (`useWorkflowGuide`, `joyrideTour`,
`WorkflowGuideButton`); no second tour library is introduced. Guides are
page-scoped and always start/restart from the existing per-page Help (?)
button — there is no global mission overlay or extra entry button.
All 12 workflow guides use one controlled `TaskGuideRunner`, including
review-only `complete` steps. Help snapshots the page's current role, view,
and workflow stage when opened; changing a wizard stage does not reset its
draft. Reopening or retrying Help uses the latest page state. There is no
automatic startup on page visits. If Help is requested during loading, visible
recovery remains available and that request opens the latest guide once ready;
exiting recovery cancels it. Outcomes are versioned per user, guide, and variant (v4);
dismissal and completion are distinct, and legacy v3 flags are not treated
as verified completion.

`src/onboarding/taskGuide.ts` defines action/result validation and bounded,
cancelable target waits. The actual reachable element is passed to Joyride;
an optional missing control is skipped, while required missing controls show
Retry/Exit recovery. Only explicit guide navigation and verified task results
change progress; library pause/update callbacks do not. Reversible opening
actions can advance after their resulting UI is observed. Committed input
or explicit Next follows validation rather than the first keystroke.

Save, submit, approve, delete, curriculum/settings persistence, immediate-save
instructor choices, and generation launches are review-only. Completing Help
does not mean that an application operation succeeded. Existing authorization,
validation, and confirmations remain authoritative.

Guidance uses a labeled nonmodal tooltip with keyboard access to the highlighted
control. Modal-contained guide controls share the active modal's focus scope;
the existing Help entry moves into ordinary forms and is hidden for a separate
scoped workflow such as the generator, which retains its own Help. Escape exits
Help without also closing the underlying form. Timers, observers, listeners,
portals, waits, and opt-in diagnostic sampling are canceled on exit, restart,
unmount, session expiry, and replacement by another guide. Positioning unmounts
when a successful action removes its target. Floating UI tracks scroll/resize/layout
changes and fits tooltip height to the viewport; reduced motion and narrow/short screens are
supported. Implementation and verification evidence are recorded in the
[Tour Guide repair plan](tour_guide_repair_plan.md).

## Course Configure choices travel on the requirement, not new solver inputs

Custom Time Duration and Preferred Room are copied by the requirement builders
onto each course's `ScheduleRequirement` (`custom_duration`,
`preferred_room_id`). The requirement is already the per-course contract that
flows from the controller through `GenerationConfiguration`, the retry ladder
(which rebuilds requirements from the same section config) and the solver's
domain cache key, so no new solver parameter or cache part was added.
`CourseSetupOverrides` owns the request normalisation and refuses a length the
save would reject, so generation and validation cannot disagree.

`minor_split_duration` was relaxed from "equals the course's units" to "no
more than the course's units" (in both `MeetingGroupRule` and the kernel's
`MeetingGroupConstraints`) so a shortened Split Session is saveable.
`hybrid_component_shape` no longer fixes Integrated Hybrid's lengths
(2026-09-19, reversing the first version of this decision, at the product
owner's request): the lecture and laboratory are set per course in Setup
Courses, so the rule now checks only that the lecture is online and the
laboratory on-site. The week's total is still capped by `class_duration`.
The department's Custom Lab Duration becomes the laboratory's default rather
than a lock; `CustomLabDurationTest` pins the new behaviour. Hybrid Split
stays exact at `HYBRID_SPLIT_MEETING_MINUTES` per meeting.

Required Day stays the department forced-day rule rather than a per-run
field, because `MeetingDayRule` enforces it on manual edits too.

*Superseded in part (2026-11-11):* the generator treats day rules as choices
for one run (`SchedulingSettingsControllerTest::test_day_rules_are_no_longer_saved`).
Integrated courses now take separate, run-scoped Lecture and Laboratory
Required Days instead of the course-wide one; they are never persisted and
never constrain manual plotting. Review and the generated save enforce them
from the context the run returns (see
`docs/plan/integrated_required_days_plan.md`).

## Shared-resource conflicts: one answer from every validator (2026-09-19)

The rule engine, `BatchConflictValidator` and the constraint kernel had drifted
on the shared resources, so a generated schedule could be refused the moment
it was edited (see `docs/reports/conflict_detection_and_recommendation_audit.md`).
They now agree, and `ConflictDetectionParityTest` feeds the same fixtures to
all three:

- **Online and field classes are not capped.** An online class occupies no
  room and the field is open ground, so any number of classes, from any
  department, may share them. The department online/field slot limits,
  `field_evening_schedule_enabled` and `rooms.max_concurrent_classes` were
  removed (migration `2026_09_19_000002`), along with the
  `online_capacity_conflict` and `room_capacity_conflict` rules. The per-section
  cap on online courses (`section_online_limit`) is a curriculum rule and stays.
- **A lecture or laboratory room holds one class.** Shared lecture rooms would
  need all three validators changed together.
- **The field end time is a setting, not a constant.** Field classes must end by
  `institution_settings.field_end_time` (default 17:00), edited by the VPAA beside
  the operating hours. `SchedulingPolicy::fieldDayEndTime()` clamps it into the
  operating hours; the kernel reads the value pinned in the snapshot, and the
  client reads it from `/initial-data` `time_grid`. Set it to the closing time
  to allow evening field classes.
- **Historical override behavior:** standing overrides once covered only their
  recorded meetings. Current assignment routes refuse overlapping assignments;
  see the instructor recommendation retirement decision below. No override path
  is restored by that retirement.
- **Part-time availability windows that touch count as one.**

Selecting a recommendation saves the plan the preview showed
(`PreviewedPlanStore`, 30 minutes, by `plan_id`) instead of solving again,
because the solver's wall-clock limit made a second run's "rank N" differ.
Staleness is still caught at accept by the snapshot fingerprint.


## Retire ranked instructor recommendations (2026-10-08)

The user revised recommendation-engine Phase 5 to remove ranked faculty
suggestions from Instructor Assignment and conflict fixes. Manual instructor
selection, clearing, bulk/linked assignment and permitted conflict reassignment
remain supported with existing authorization and hard validation. An overlap is
refused even if an older client sends an override flag. Teaching history and load
accounting are shared services and are retained.

External clients of the old suggestion URL cannot be ruled out. Retain its
existing authentication, capability and teaching-scope guards, then return an
explicit HTTP 410 retirement response without invoking a recommender. The UI
stops requesting that URL and ignores instructor candidates from older conflict
responses during rollout. Remaining conflict placement recommendations share
complete-group validation and the resolver's linked-meeting projection. No
routes for assignment/save, schema or persistence workflow are replaced. See
[[recommendation_engine_integration_plan]] section 19 for deletion and verification
evidence.

## Recommendation selection cutover with additive compatibility (2026-10-09)

Generation option priority and active/supported applicability now come from the
shared `GenerationRecommendationPolicy` through the existing engine provider.
Public year-level consumers opt into additive `selection` metadata version 1;
legacy provider consumers retain their exact payloads. No new route, storage
schema, permission or application workflow is introduced. Manual already consumes
backend-ranked complete groups, so its unused frontend ranker is removed after
replacement behavior and call sites were verified.

Keep frontend legacy priority/attempt adapters for persisted generation results
and older responses until those consumers are demonstrably retired. Keep typed
configuration contracts, diagnostics delegators, raw-slot browsing, preflight
guidance mapping, guarded `validate-splits`, and the instructor HTTP 410 tombstone.
They have explicit compatibility owners; an absent repository UI caller is not
proof that an external API is unused. The Split controller's preview helpers are
also used by batch saving and must not be deleted as recommendation-only code.

Rollback can disable the year-level service's selection-contract opt-in while
retaining the UI adapter; no data rollback or queued-result rewrite is necessary.
Fresh server authorization/validation, individual session-enhancement application
and existing save/history/transaction boundaries remain required. Integration-plan
section 21 records verification and the final gate; these decisions do not waive
unrelated failing repository checks.

## Remove department Scheduling Profile (2026-10-16)

Course data and per-course meeting configuration determine laboratory behavior.
The VPAA department toggle and classification were removed because they could
contradict valid curriculum data and prevent laboratory scheduling. All
requirements use `CourseScheduleRequirementBuilder`; the database profile column
is removed by a forward migration. Existing course defaults are preserved.

The existing lecture-only-major / `allow_lecture_usage` rule now controls lecture
fallback to labs across all departments, including former Standard departments.
Room ownership, approved borrowing windows, program restrictions, physical-room
conflicts, and Room TBA eligibility still apply. Department identity or merely
owning a lab does not grant a course laboratory eligibility.

This explicitly retires profile request/response fields. Stale department input
is ignored, while old serialized profile metadata cannot gate new execution.
Deploy the API, frontend, and migration together, restart generation workers,
and invalidate department/initial-data lookup caches. No compatibility profile
or automatic department-level toggle replaces the removed setting.

## Director shares the Secretary slot (2026-11-10)

Director returns as a distinct account role (`director`) that runs a department
office exactly like a Secretary: the same capabilities (one shared list in
`config/capabilities.php`), department scope, workflow, Program Head ownership
limits, notifications, Sunday-class and curriculum-import settings, room
borrowing/review, program room allocation, and room-transfer submission. It adds
no approval stage and receives no Dean/VPAA approval or VPAA administration.
This supersedes the 2026-09-27 retirement of the Director portal.

A department has EITHER one active Secretary OR one active Director. The two
roles share one slot in `AdministrativeRoleSlots`/`User::activeRoleHolder` and in
the database backstop (see [[database]]); inactive and archived accounts do not
occupy it, and switching one account between the roles is allowed. The faculty
"Director" designation is unrelated to the login role and creates no account.

Legacy Director accounts kept by the retirement migration are not silently
re-enabled. The upgrade migration disables them and revokes their tokens; the
VPAA must reactivate each one deliberately, which runs the slot check and
restores the Spatie role. As defence in depth, a Director without its role
assignment cannot authenticate even if code is deployed before the migration.
Roll out with `php artisan migrate --force` (no `DatabaseSeeder`); the
migration creates the `director` role and permissions itself.


## Scheduler stays complete past the meeting limit (2026-11-11)

`/initial-data` still returns at most `schedule_limit` (2,000) full meeting
rows. When the list is cut, the scheduler also asks for `schedule_section_id`
(the open section's meetings are always returned in full) and
`schedule_occupancy=1` (every other visible meeting as a compact row of ids,
times, room, instructor and status). Occupancy rows feed client conflict checks
only and are never rendered; the server remains the authority on every save.
Occupancy applies the same scope and borrowed-instructor masking as full rows.

Sections are scoped to the active `semester_id` (plus sections with no
semester). The former match on the `1st`/`2nd` label pulled in same-named
sections from other academic years. Without `schedule_submissions` in the
response, only each section's latest submission is loaded, and
`schedule_signatories` lists only the submissions rows reference.

Requests cut off by sign-out or session expiry now reject with an axios
cancellation marked `sessionEnded` instead of staying pending, so caller
cleanup runs; failure notices are suppressed while the session-ended screen
shows.

## Concurrent online classes (2026-11-11)

Online is a shared resource, like the field. Different sections may take the
same online course at the same time; each meeting is stored as `mode = online`
with `room_id = null`, so no schema change was needed. The
`subject_section_time_conflict` rule is retired everywhere it ran: both
`OverlapConflict` implementations (rule engine and constraint kernel),
`BatchConflictValidator`, `CspSolver`, the client pre-check (`useConflict`) and
Draft Review's option selection (`draftReview.ts`). Its catalog entry, message,
priority and conflict-inbox resolution options went with it.

Section and instructor double-bookings, exclusive physical-room conflicts,
availability, laboratory eligibility and hybrid meeting requirements still
apply to online meetings. The solver keeps its per-course index for the soft
mixed-mode preference (an online meeting avoiding another section's
face-to-face meeting of the same course). Old conflict responses that carry
the retired rule id still get a label in `lib/conflicts.ts`.
