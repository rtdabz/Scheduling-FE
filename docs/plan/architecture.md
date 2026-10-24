# System architecture

WICARS is a Laravel API and React/Vite client. Authentication and authorization
are enforced by Laravel Sanctum and Spatie permissions. The client calls the
API through the shared Axios client; role-specific pages should compose shared
tables, forms, and scheduling components rather than duplicate domain logic.

## Temporary PDF previews

Client-side PDF builders retain ownership of report layout and contents. The
shared `pdfPreview.ts` helper uploads those bytes to the temporary PDF API and
opens a named HTTP response with inline `Content-Disposition`, allowing the
browser viewer's existing download arrow to use a descriptive filename.

Preview creation/deletion use existing Sanctum, active-account, and
`schedule.view` checks. Native-viewer GET requests use a signed relative URL
for one PDF; `ResolvePdfPreview` validates the signature and restores the
original credential from the encrypted cache entry before the normal
authentication/authorization middleware runs. The middleware priority entry
applies only to routes containing this resolver. Original-token revocation,
expiry, disabled accounts, and removed capabilities continue to deny access.

`TemporaryPdfPreview` encrypts the PDF/credential cache payload, expires access
after 30 minutes, and retains at most five previews per user under cache locks.
Modal cleanup/closed-tab polling deletes owned previews; expiry bounds access
if the parent app closes first. Signed URLs are private, temporary access links;
they do not certify the client-generated PDF as an approved server record.
No domain schema or scheduling permission was added. See [[print_download_review]]
for the endpoint contract, limits, and validation evidence.

## Capability authorization

Base roles identify organizational positions (`vpaa`, `dean`, `secretary`, and
`program_head`). Scheduling actions are granted as
generic Spatie permissions such as `schedule.create` and
`schedule.assign_instructor`; a job title does not imply every scheduling
action. An account's capabilities come from its role alone; there are no
per-account grants, and `model_has_permissions` is not used for users.

Capability names, module metadata, role defaults, and workflow role constraints
are maintained in the backend capability registry
(`backend/config/capabilities.php`). Secretaries and Program Heads share one
schedule-building set; Deans hold view and dean approval; the VPAA holds every
capability. The authenticated user payload exposes this registry to the React
client, so module labels and capability rows are not duplicated in frontend
code. The API still
enforces every capability and workflow constraint; frontend locks are the
corresponding usability layer.

Resource scope remains data-driven: timetable mutations use
`schedules.department_id` (and `program_id` for Program Heads), while faculty
assignment uses `courses.teaching_department_id` and, where applicable,
`teaching_program_id`. Changing what a role may do means editing its defaults
and adding a migration that re-syncs the stored roles; no department names or
subject labels are hardcoded into authorization defaults.

Schedule detail, semester/section lists, and split reads share
`ScheduleAuthorizationService::scopeReadableSchedules`: owning or delegated
teaching department, existing Program Head/shared-room scope, and VPAA status
visibility. Split visibility follows its parent schedule. Alternate section
lists apply department/program scope, and their cache keys include that scope.

Secretary, Program Head, and Dean navigation, scheduling routes, and action
controls are derived from these permissions. UI visibility is only a usability
layer; each API mutation is protected by its exact capability. Secretary and
Program Head accounts inherit the scheduling workspace permissions defined
above, while Dean accounts inherit only approval permissions.
The former Director portal and account role are retired; legacy Director rows
remain available for administrative cleanup but cannot be created or signed in.

## Scheduling boundary

`SchedulingPolicy` is the canonical source for supported days, modes, statuses,
time-grid conventions, and the constraint catalog. `RuleEngine` validates a
manual or persisted placement. `CspSolver` searches valid placement domains and
must apply the same hard constraints before ranking candidates. `ScheduleQualityEvaluator`
only scores feasible candidates; it must not replace hard validation.

The application services around the solver are currently split between legacy
controller orchestration and the refactoring boundary:

- `GenerateSectionSchedulePlans` is the production section-level application
  adapter. It owns preflight, requirement construction, configuration
  confirmation, and legacy response mapping around `GenerateSchedulePlan`.
- `CommitSchedulePlan` is the refactored persistence boundary. Recommendation
  acceptance and section auto-apply now coordinate recommendation state and
  plan persistence inside one transaction.
- `YearLevelScheduleGenerationService` coordinates year-level generation,
  retries, diagnostics, and aggregate metrics through its compatibility path.
- `ScheduleGenerationPreflightService` checks feasibility before expensive searches.

## Course-driven scheduling requirements

`ScheduleRequirementBuilderResolver` loads the selected courses and delegates to
`CourseScheduleRequirementBuilder`, which emits the existing `ScheduleRequirement`
contract per course/meeting. The department Scheduling Profile, enum, profile
resolver, and Standard/Laboratory builder split were retired on 2026-10-16.
Preflight validates curriculum and course eligibility; resource feasibility,
configuration validation, and the solver retain ownership of room restrictions
and fallback behavior. Configuration validation recognizes approved borrowed
rooms through snapshot `grant_windows`; placement still enforces those windows.

No `scheduling_profile` or `department_profile` capability metadata is emitted by
new responses/snapshots. Old request fields are ignored by validated department
writes, and old profile metadata in serialized configurations has no effect on
eligibility. Course requirements and room authorization remain authoritative.

## Current runtime adoption

The refactoring contracts are adopted incrementally rather than uniformly:

| Capability | Current runtime owner | Refactoring status |
|---|---|---|
| Manual single placement | `RuleEngine` through `ScheduleController` | Legacy path, parity-covered |
| Manual batch placement | `BatchConflictValidator` plus `RuleEngine` | Legacy path, lock and transaction enforced |
| Section preview/recommendation | `GenerateSectionSchedulePlans` through `ScheduleRecommendationController` | Phase 10 adoption complete; `GenerateSchedulePlan` is the decision boundary and legacy response shape is preserved |
| Recommendation acceptance | `CommitSchedulePlan` plus recommendation state transaction | Atomic plan/status/history boundary adopted; non-migrated payloads are rejected |
| Year-level preview | `YearLevelScheduleGenerationService` | Retry diagnostics and metrics adopted; aggregate snapshot/configuration contracts deferred |
| Candidate hard validation | CSP guards, `RuleEngine`, and constraint kernel parity paths | Kernel available; legacy implementations remain active |
| Persistence | Controller paths and `CommitSchedulePlan` | Schedule-plan writes share the lock and transaction boundary |

This table is the authoritative current-state summary. The phase notes below
describe the sequence in which capabilities were introduced, not a claim that
every phase is already the sole production implementation.

## Write and approval flow

Schedule writes are validated inside a transaction and serialized with the
semester-level scheduling lock. New rows start as `draft`; approval transitions are
handled by the approval endpoints, not by ordinary batch plotting updates.
Notifications and cache invalidation happen after a successful commit.

Queued year-level previews return a run identifier and are processed by the
scheduling queue. The synchronous endpoint remains for compatibility and small
interactive requests.

## Ownership rules

`department_id` on a schedule is persisted ownership. A course may have a
different `teaching_department_id`; that affects instructor assignment, not the
authority to edit or delete the owning department's timetable. Existing-row
updates must hydrate identity from the database and ignore client attempts to
change ownership for authorization purposes.

Curriculum authoring uses `curriculum.manage`: Secretaries author within their
department, and Program Heads author only records owned by their assigned
program. Department-wide curricula remain readable by Program Heads. VPAA and
Dean defaults provide review access, not curriculum authoring. Frontend list,
detail, and restore controls mirror record scope; API authorization remains
authoritative. Multiple curricula may be active concurrently; sections select
the curriculum governing their course placements.

## Refactoring boundary

Controllers should remain thin adapters. New scheduling behavior belongs in a
focused application service or constraint class, with feature tests covering the
API contract and unit tests covering individual rules and scoring behavior.

The scheduling-core refactor introduces immutable, schema-versioned contracts
under `App\Services\Scheduling\Domain`. See [[scheduling_core_phase_1]] for the
contract responsibilities and incremental adoption sequence. These contracts do
not replace existing runtime arrays until the owning application-service phase is
migrated and covered by parity tests.

`SchedulingSnapshotRepository` is the database boundary for the refactored core.
It captures normalized semester-wide conflict state and department configuration in a
versioned `SchedulingSnapshot`; see [[scheduling_core_phase_2]]. Rules and solver
code must migrate to this shared snapshot incrementally rather than adding new
database queries inside search or validation loops.

Phase 3 adds a presentation-neutral constraint kernel under
`App\Services\Scheduling\Engine\Constraints`; see [[scheduling_core_phase_3]]. The
kernel consumes domain contracts and snapshots only, uses explicit rule
priorities, and performs no database access. Existing validators remain the
runtime authority until later phases replace each path under parity coverage.

Both validators share one rule vocabulary. `RuleEngine` (live records) is a thin
orchestrator over `Engine\Rules`, one class per concern, and the kernel
(snapshots) mirrors each with a same-stem class in `Engine\Constraints\Families`:

| Concern | `Engine\Rules` (RuleEngine) | `Engine\Constraints\Families` (kernel) |
|---|---|---|
| Records exist and are usable | `ReferenceIntegrityRule` | — |
| Semester and curriculum placement | `CurriculumPlacementRule` | — |
| Department, room grant, instructor department/program | `DepartmentAssignmentRule` | — |
| Instructor active, part-time windows | `InstructorAvailabilityRule` | — |
| Room, instructor and section clash; same online course | `OverlapConflict` | `OverlapConflict` |
| Room status | `RoomAvailabilityRule` | `RoomAvailabilityConstraints` |
| Room type for the delivery | `RoomTypeRule` | `RoomTypeConstraints` |
| Slot grid, opening hours, field evening window | `OperatingHoursRule` | `OperatingHoursConstraints` (evening window only) |
| Allowed days, pattern, forced day | `MeetingDayRule` | `MeetingDayConstraints` |
| Delivery mode, hybrid, Sunday major, section online limit | `DeliveryModeRule` | `DeliveryModeConstraints` |
| Weekly contact time per course and section | `ClassDurationRule` | — |
| Hybrid and Split Session groups | `MeetingGroupRule` | `MeetingGroupConstraints` |

What each class and rule id means is in [scheduling_rules_glossary.md](scheduling_rules_glossary.md).

The first four need live records and are not planned for the kernel. Rule ids
are unchanged by this layout (`faculty_conflict`, `subject_exists`, ...), since
the UI and the constraint catalog key on them. Migrating a concern onto the
kernel means making its `Engine\Rules` class delegate to the matching family,
one concern at a time with a parity test each.

Phase 4 adds `ValidateGenerationConfiguration` as the application boundary for
pre-generation configuration checks; see [[scheduling_core_phase_4]]. It captures
one immutable snapshot, separates blocking violations from confirmation warnings,
and returns machine-applicable recommendations. Its later Phase 8 adoption is
limited to section recommendation and preview paths; year-level orchestration
still uses its legacy preflight boundary.

Phase 5 introduces explicit solver ports, immutable variable-domain contracts,
snapshot-backed hard-constraint propagation, result mapping, and legacy/canonical
domain parity reporting; see [[scheduling_core_phase_5]]. `CspSolver` remains the
active search implementation. An opt-in shadow pass can compare its persisted
conflict pruning against the constraint kernel without changing generated output.

Phase 6 adds `GenerateSchedulePlan` as the application-service boundary from a
validated `GenerationConfiguration` to ranked, fingerprinted `SchedulePlan`
contracts; see [[scheduling_core_phase_6]]. It records configuration confirmation,
performs final kernel validation, and distinguishes invalid, room-unresolved, and
room-complete plans. Phase 10 now routes all section recommendation generation,
preview, selection, queued preview execution, and auto-apply through the
`GenerateSectionSchedulePlans` adapter. Order 3 now retains the complete typed
plans and exposes them as an additive `schedule_plans` response field. Each
persisted section recommendation also carries the exact `SchedulePlan` contract
under `_scheduling.schedule_plan`, including its plan ID, fingerprints, rows,
violations, recommendations, scores, and generation metadata. Legacy
`recommendations` rows and acceptance behavior remain unchanged.

Phase 7 adds `CommitSchedulePlan` as the single fresh-snapshot persistence
boundary for final plans; see [[scheduling_core_phase_7]]. It shares the existing
semester advisory lock with batch writes, rejects stale or invalid plans, replaces
only editable rows, persists through Eloquent lifecycle events, and records
aggregate history and audit evidence in the same transaction. It is currently a
tested service boundary; controller and job adoption remains deferred until
recommendation status locking and plan commit can share one transaction.

Phase 8 adds deterministic configuration fingerprints, versioned warning
confirmations, and the `_scheduling` recommendation payload envelope; see
[[scheduling_core_phase_8]]. Section recommendation paths now validate and
confirm configurations before solving while preserving their legacy row and
response contracts. Year-level aggregate versioning and atomic recommendation
acceptance through `CommitSchedulePlan` remain later migration steps.

Phase 9 adds the schema-versioned `SchedulingGenerationMetrics` observability
contract; see [[scheduling_core_phase_9]]. Snapshot capture, section solving,
plan generation, and the complete year-level retry ladder now report query cost,
domain size, pruning, iterations, attempts, elapsed time, retry reasons, and
fallback use. Operational timing and query metadata are excluded from snapshot
fingerprints, and instrumentation does not participate in scheduling decisions.

Order 4 adopts `CommitSchedulePlan` for recommendations that carry the
versioned plan envelope. Acceptance and section auto-apply now revalidate and
persist through the shared lock, snapshot, constraint, history, and audit
boundary. Legacy recommendation rows without a serialized plan are rejected
with an actionable regeneration response.

Order 5 completes the recommendation acceptance migration. Historical
recommendations are converted by `php artisan
scheduling:backfill-recommendation-plans`; migrated records carry the
versioned plan envelope, while records that cannot be safely converted remain
explicitly rejected with a regeneration response. The controller-local legacy
acceptance write path and row-normalization fallback have been removed.

Order 6 propagates the captured `SchedulingSnapshot` through the
`SchedulingSolver` port, legacy adapter, and `CspSolver` entry point. The
configuration validator, solver, and shadow constraint propagator can now use
the same snapshot identity and fingerprint without recapturing state. The
application solver port requires a non-null snapshot, making snapshot
propagation explicit at compile time; only the legacy `CspSolver` entry points
retain optional input for compatibility tests and remaining loader migration.
legacy solver's internal course, room, and schedule loaders remain temporarily
behind this input contract and are the next extraction target.

Order 7A makes persisted schedules and forced-day rules snapshot-authoritative
inside `CspSolver` whenever the solver is invoked through the new port. Room
type lookup for persisted rows also uses snapshot metadata. Legacy database
queries remain only for callers that do not provide a snapshot, preserving
compatibility during the remaining loader migration.

Order 8 makes snapshot-aware solver runs consume room records, virtual-room
capacity limits, and department scheduling flags from `SchedulingSnapshot`.
This removes room/resource/settings queries from the snapshot path while
leaving the legacy loader branch for direct non-snapshot callers.

Order 9 makes section, semester, course, and curriculum-period data snapshot-
authoritative for snapshot-aware solver runs. Existing Eloquent model shapes
are hydrated from normalized snapshot records so candidate builders and rule
checks retain their current behavior without issuing those loader queries.

Order 10 is now adopted for production orchestration. Year-level retries use
the `YearLevelSchedulingSolver` port and its `CspYearLevelSchedulingSolverAdapter`;
section generation uses the `SchedulingSolver` port. Both paths pass a complete
`SchedulingSnapshot` before solving.

No-snapshot execution is now explicitly observable through the
`legacy_database_loader` generation-metrics fallback marker and
`usesLegacyDatabaseFallback()`. New application-service paths must pass a
snapshot; the marker is retained only to measure remaining migration work.

Order 10 also adds the `REQUIRE_SCHEDULING_SNAPSHOT` rollout guard. Once all
production callers are confirmed snapshot-aware, enabling this flag makes
direct no-snapshot solver execution fail fast instead of silently selecting a
different database state.

Order 11 completes the production caller migration. No application service
invokes `CspSolver` without a snapshot; direct no-snapshot execution is now
observable through `legacy_database_loader` metrics and blocked by the rollout
guard in production. Compatibility-only low-level tests explicitly disable the
guard in PHPUnit.

**Update 2026-09-19: the database loader is gone.** The snapshot is the
solver's only data source. A direct caller that passes none gets one captured
by `SchedulingSnapshotRepository`, exactly as generation captures it, and
recaptured on every call (metrics marker: `auto_captured_snapshot`). The
`REQUIRE_SCHEDULING_SNAPSHOT` guard, `legacy_database_loader` marker and
`usesLegacyDatabaseFallback()` were removed with it. A snapshot whose semester
or department differs from the section being solved is refused. One live read
remains: department-wide room-fairness demand (`prepareDepartmentRoomFairness`)
is not in the snapshot; it only shapes a soft score.

Order 12 removes the obsolete `LegacyCspSolverAdapter` name and binds the
application port to `CspSchedulingSolverAdapter`. The remaining legacy loader
branches are retained only inside `CspSolver` for explicit compatibility tests
until the final loader extraction, not as production orchestration paths.

Year-level generation now requires `SchedulingSnapshotRepository` and captures
one aggregate snapshot for its full retry run. Retry and fairness parity tests
exercise the port-backed adapter. The deleted `LegacyCspSolverCompatibilityAdapter`
is no longer part of the application dependency graph; direct low-level solver
tests remain explicit compatibility tests and are not production entry points.

The legacy `GenerateScheduleService` has been removed. It had no runtime,
route, command, or test caller; its `accept()` path called `json_decode` on the
`array`-cast `recommended_schedules` attribute, so it raised a `TypeError` on
entry from the day it was written and could not have had a live consumer; and it
re-derived a section's curriculum from the department's active curriculum, the
fallback `SectionCurriculumResolver` explicitly forbids. Section generation runs
through `GenerateSectionSchedulePlans`, and acceptance through
`CommitSchedulePlan`, which additionally locks the recommendation row, enforces
the department guard, and records an audit entry.

The recommendation portion of this gate now has an explicit migration tool:
`php artisan scheduling:backfill-recommendation-plans`. It reports updated,
skipped, and failed records and never fabricates a plan when required schedule
data is invalid. Phase 10 may remove the acceptance fallback after the command
completes with no failed pending recommendations; the solver-loader fallback
still requires the year-level and legacy callers to be migrated.

## Remaining migration boundary

Phase 10 section-generation adoption and Orders 3-5 plan propagation and
commitment are complete. Historical recommendation payloads are handled by
the backfill command and acceptance is routed through `CommitSchedulePlan`.
The solver's database-loader branch remains only as a low-level compatibility
surface for legacy direct APIs/tests; production generation is snapshot-only.

`GenerateScheduleService` is gone (see above); the legacy response mapping it
shared with `GenerateSectionSchedulePlans` stays until the remaining consumer
contracts are retired. Any future removal of the CSP compatibility loader must
be preceded by migrating the remaining direct low-level tests to a dedicated
test fixture that supplies a `SchedulingSnapshot`.


## Shared recommendation placement boundary

The recommendation engine migration and final cutover work are recorded in
[[recommendation_engine_integration_plan]]. Existing authorized endpoints dispatch
through `Recommendations/RecommendationEngine`; their response adapters and
application workflows remain in place.

`PlacementRecommendationProvider` owns complete-group Manual/Draft candidate
construction and the existing draft catalog ranking. `GenerationDraftReviewer`
retains draft conflict detection. `AvailableSlotFinder` supplies candidate
intervals; its optional row template carries existing instructor and group facts.
`PlacementGroupValidator` checks every affected kept/replacement row and the
complete meeting group with the constraint kernel and `MeetingGroupRule` against
persisted and tentative occupancy. Manual prepares fixed occupancy and session
count once per request, then checks every candidate's rows and complete group.
Manual Best Match ranking and same-time pair selection are server-owned;
frontend filters and quality notes remain display behavior.

Group-aware manual requests add complete `placement.rows`, `selected_meeting`
and optional request-local consecutive rules to the existing available-slots
endpoint. Responses add complete `group_rows`, group candidate counts/truncation,
Best Matches and pair starts. Each manual request uses one discovery pass; its
raw slot fields and counts come from that result. The unused `recommendations`
field remains an empty list for compatibility. Draft Review and explicit service
callers obtain the shared catalog through `groupOptions`; modal refreshes do not
build it. Internal manual options describe the actual validated placements.
Old requests without `placement` retain the raw slot contract. A truncated group
total is unknown rather than an exact count.
Generated unplaced entries forward the already captured run rule to draft review;
recommendation generation does not persist day rules or change settings.

`verified_group` means the affected course group passed its row/group checks;
it never means a complete timetable was found or permission to persist. Manual
selection stages the reviewed meetings, Draft replaces the reviewed class, and
the existing save/batch workflow revalidates fresh state before writing. Generation
adjustments require regeneration rather than a timetable feasibility claim.
Explicit session alternatives are described below; final cutover verification and
remaining baseline check failures are tracked in integration-plan section 21.

The Manual Placement and Edit Schedule dialogs are one component (`DropModal`,
keyed by `isRescheduling`) and differ only in title and final action (Place on
Timetable or Save Changes). Only while the form has a conflict, and only for
users with `schedule.generate`, it requests available slots for the current form
state (debounced, stale requests aborted) and shows a **View Alternatives**
button with the placement count (`N+` when truncated). A valid placement shows
no button and sends no request. The list opens in a separate dialog; choosing an
option only fills in the form. The client conflict check and the batch save
still revalidate before anything is written.

Generation's public year-level responses opt into `selection.contract_version: 1`
through `GenerationRecommendationProvider`. `GenerationRecommendationPolicy`
provides option priority (untried before failed attempts, then impact), tried-alone
state and supported/active applicability. The metadata is additive: existing IDs,
adjustments, option order and response fields remain intact. The UI groups options
for display and sorts within each group by the server priority. It still refuses
operations its local preview cannot interpret; the authorized server interpreter
remains authoritative when applying a selection.

The unused frontend manual ranker has been removed. Manual Best Matches and pair
starts already come from the placement provider; day/room filters and descriptive
quality notes remain local. Generation's `legacyPriority` and attempt-label adapter
remain solely for stored run results or older backend responses without recognized
selection metadata. Unknown metadata versions use the same compatibility path.
Removal requires evidence that those queued/persisted/API consumers have drained.
Preflight issue-to-guidance text and configuration previews are display adapters,
not independent placement searches or authorization decisions.


## Conflict recommendations and instructor recommendation retirement

Conflict endpoints still perform a fresh scan and filter each action by the
caller's placement/teaching scope and capability before assigning public ranks.
The engine's `ConflictRecommendationProvider` delegates placement discovery and
ranking to `ConflictRecommender`. Discovery carries the existing faculty/group
facts and excludes the complete affected group from persisted occupancy.
`SameTimePartnerMover::project` is the common preview/write projection for linked
meeting movement. `PlacementGroupValidator` and `SessionInterpreter` verify all
kept and moved rows against the snapshot and meeting-group rules. Options include
`group_rows` and `affected_schedule_ids`; normalized evidence is `verified_group`,
not complete timetable feasibility. Existing action scores and bounded search
budgets remain. Conflict recommendations still skip Consecutive Days runs.

Applying a placement keeps the instructor and uses the existing resolver,
scope lock, transaction, fresh validation, conflict scan, history and audit.
A booking that appears after preview can invalidate the whole change. Manual
instructor reassignment uses its existing instructor-only validation, so unrelated
placement drift does not block it.

Ranked instructor suggestions are retired from the assignment UI and conflict
recommendations. The instructor source/provider/ranker and frontend API helper
have no active callers and are removed. The authenticated, capability- and
teaching-scope-guarded `GET instructor-assignments/{schedule}/recommendations`
route remains for older clients and returns HTTP 410 with
`code: instructor_recommendations_retired`, guidance and `options: []`.
The conflict UI also filters generated instructor candidates from older servers.
Manual pickers, bulk/linked assignment, clearing, faculty/load/history services
and all assignment validation remain. Empty conflict suggestions direct users
to the manual workflow without claiming the timetable is infeasible.


## Generation recommendations and selected adjustments

`GenerationRecommendationPolicy` owns the existing configuration recommendation
factory, capacity-relief options, search suggestions and preferred-day advice.
`YearLevelGenerationDiagnostics` keeps bottleneck detection and compatibility
entry points that delegate suggestion construction to that policy.
`ValidateGenerationConfiguration` retains validation and uses the shared factory.
`GenerationRecommendationProvider` and `RecommendationResult` preserve the legacy
payloads while classifying supported adjustments as requiring regeneration.
No added CSP probe verifies these suggestions as a complete timetable.

`GenerationAdjustmentInterpreter` is the pure server interpreter for the supported
applicable operations. It checks the entire explicit selection before
applying changes: authorized section/course scope, supported values, duplicate
operations and conflicting semantic writes. Year-level day/default operations
must target every configured section. Unknown, unsupported and fallback-report
operations remain guidance. A wholly unchanged selection asks the caller to
refresh rather than claiming an adjustment was applied.

Both year-level preview endpoints reuse `prepareYearLevelConfigs`. The optional
`selected_adjustments` list is limited to 1,000 operations; it is interpreted
against the authorized course selection, then checked again with the existing
selection eligibility, required-day checks, duration/component/room normalizers,
preflight and requirement builders. The server rebuilds the seed and requirements
from the adjusted configuration. No-selection callers keep their existing
responses. Sync retains its whole-year scope, while Queue retains its existing
optional section subset.

The UI validates and stages the preview against only the run's target sections,
then merges their previewed changes into its full local configuration. This keeps
unselected section choices in place. It sends the original target configuration
plus the selected operations to avoid applying changes twice. Fixed JSON fixtures
exercise the same expected settings in PHP and TypeScript. Applied operation metadata is
server-created and travels in the first configuration's `_selected_adjustments`
key. Existing job properties and constructor remain unchanged, and previously
serialized jobs without that key keep empty selected-adjustment metadata.
Queued progress, cancellation, provisional reports and 150/180-second boundaries
retain their existing owners. Automatic retries still have no configuration
adjustments. Schedule persistence, locking, history and final validation remain
in the existing save workflows.


### Explicit session enhancement probes (integration Phase 6)

`SessionAlternativePolicy::enhancement` supplies Regular-to-Split (physical or
fully online) and Integrated On-site-to-Hybrid definitions from existing course
rules and supplied meeting durations. `PlacementRecommendationProvider` first
checks the original selected shape, then uses its existing slot construction and
`PlacementGroupValidator` for the complete alternative. No new conflict-rule or
persistence layer is introduced.

Manual requests opt in with `placement.session_alternatives`; optional
`placement.allowed_days` retains local Required Day scope. The existing endpoint
guard, server-derived identity and exact replacement-ID checks run first. Normal
modal refreshes retain the single discovery path and empty catalog. The separate
UI component requests on click, aborts on unmount/context change, and stages rows
through the existing modal controls and save path.

Draft Review consumes the same group probe. Generation consumes it after a
failed search using unplaced targets and the partial draft's occupancy. Capacity
preflight considers only Integrated Hybrid, since an on-site Split saves no
aggregate room time. Generation probes retain configured paired days, selected
allowed days, anchored rows and snapshot run rules. At most four eligible targets
are inspected, under a shared two-second soft deadline clipped to the remaining
run budget. Checks occur before each discovery call and seed; an in-flight slot
finder call can finish after the deadline. Timed-out probes return no enhancement.
There is no recursive year-level generation call or per-candidate CSP solve.

New generation options contain a `group_witness` and remain
`requires_regeneration`. The two additive adjustment types flow through the
existing authorized sync/queue configuration preparation and requirement rebuild.
They require individual application: UI Apply all excludes selections containing
them, and the server rejects mixed batches before any config application or
queue dispatch. Whole-timetable verification is still owned by regeneration and
fresh-state save validation. Phase 5 conflict kept-row semantics are unchanged.
