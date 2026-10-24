# Scheduling Core Phase 1 Contracts

## Decision

The scheduling refactor uses immutable, schema-versioned contracts under
`App\Services\Scheduling\Domain`. They form the boundary between HTTP, application
services, constraint evaluation, solver adapters, and persistence.

Phase 1 introduces these contracts without switching existing runtime paths.
Controllers, jobs, validators, and `CspSolver` continue using their current arrays
until their corresponding migration phase adopts the contracts.

## Contracts

| Contract | Responsibility |
|---|---|
| `GenerationConfiguration` | Normalized per-section generator configuration and search limits |
| `ScheduleRow` | One persistable or proposed timetable meeting |
| `ScheduleRequirement` | Existing immutable required meeting component, reused by the new domain layer |
| `MeetingGroup` | Atomic single, multi-day, hybrid, or minor-split aggregate |
| `ConstraintViolation` | Presentation-neutral hard rule, warning, information, or soft finding |
| `ScheduleCandidate` | Feasible solver candidate with scores and current API metadata |
| `SchedulingSnapshot` | Versioned immutable resource and persisted-state view used for one operation |
| `SchedulePlan` | Versioned configuration, source snapshot, rows, findings, adjustments, resources, and scores |
| `SchedulePlanStatus` | Explicit validity and completion stage for a plan |

All transport-facing contracts implement `SchedulingContract`, expose `toArray()`
and `jsonSerialize()`, and preserve the current snake-case API field names.

## Plan status model

The initial status vocabulary is:

1. `configuration_valid`
2. `timetable_feasible`
3. `room_assignment_unresolved`
4. `room_assignment_complete`
5. `instructor_feasible`
6. `instructor_assignment_complete`
7. `persistence_valid`
8. `committed`
9. `invalid`

These are domain states, not replacements for the current `schedules.status`
approval workflow. Schedule approval statuses continue to represent plotting,
submission, review, instructor assignment, reassignment, and finalization.

## Compatibility rules

- `ScheduleRow::fromArray()` accepts the legacy `subject_id` alias.
- `GenerationConfiguration::fromArray()` accepts the snake-case and camelCase
  keys currently accepted by `CspSolver::solveRankedFromSchema()`.
- `ConstraintViolation::fromArray()` accepts current `rule`, `rule_id`, and
  diagnostic `code` identifiers.
- `ScheduleCandidate` retains unrecognized quality-result fields as metadata so
  current response details are not discarded during later adoption.
- Online rows are considered room-resolved without a physical room. An on-site
  or field row without a room is explicitly unresolved.
- `SchedulePlan` cannot represent a committed plan with no rows or with a hard
  violation.
- Adjustments, warnings, or unresolved resources mark a plan as requiring user
  confirmation.

## Adoption sequence

1. Phase 2 snapshot loading returns `SchedulingSnapshot`.
2. Phase 3 constraint evaluators consume `ScheduleRow`, `MeetingGroup`, and the
   snapshot, returning `ConstraintViolation` objects.
3. Phase 4 configuration validation consumes `GenerationConfiguration`.
4. Phase 5 the solver adapter accepts configuration and snapshot contracts and
   returns `ScheduleCandidate` objects.
5. Phase 6 application services return `SchedulePlan`.
6. Phase 7 the plan committer accepts only a final validated `SchedulePlan`.

No database migration is required in Phase 1. Persisted schema-version and plan
metadata are deferred until the application begins storing schedule plans.

## Exit criteria

- Every Phase 1 contract is immutable and serializable.
- Current transport aliases can be adapted without controller changes.
- Contract invariants prevent structurally impossible committed plans.
- Unit tests cover normalization, serialization, meeting groups, unresolved
  resources, warnings, confirmation, and committed-plan safeguards.
- Existing Phase 0 characterization tests remain green.
