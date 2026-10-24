# Scheduling Core Phase 4 Configuration Validation

## Decision

Phase 4 introduces a single application service for validating a complete
generation configuration before solver work begins. The service captures one
Phase 2 `SchedulingSnapshot`, evaluates the supplied Phase 1
`GenerationConfiguration`, and returns immutable violations and recommendations.

This phase is additive. Controllers, queued jobs, `YearLevelScheduleGenerationService`,
`CspSolver`, recommendation acceptance, and persistence continue to use their
existing runtime paths. Phase 5 may adopt this boundary after parity coverage is
established.

## Components

| Component | Responsibility |
|---|---|
| `ValidateGenerationConfiguration` | Captures one snapshot and coordinates deterministic configuration checks |
| `GenerationConfigurationValidationResult` | Reports `valid`, `confirmation_required`, or `invalid` and preserves the snapshot fingerprint |
| `GenerationConfigurationRecommendation` | Carries the existing generation-diagnostics fields plus machine-applicable adjustments |
| `SchedulingSnapshot.operatingHours` | Makes opening time, closing time, and slot size available without database access during validation |

The public `validate(termId, departmentId, configuration)` method captures the
snapshot. The reusable `validateSnapshot(configuration, snapshot)` method is pure
with respect to persistence and must execute no database queries.

## Validation Order

The validator processes configuration state in this order:

1. Configuration references and supported option values.
2. Section, term, department, course, and curriculum alignment.
3. Department scheduling-profile compatibility.
4. Room and laboratory feasibility, including Room TBA policy.
5. Forced-day concentration and forced-day feasibility.
6. Hybrid, lecture/laboratory split, minor split, and delivery-mode compatibility.
7. Recommendation de-duplication and result construction.

Validation uses the same captured snapshot throughout the request. The result
includes that snapshot's fingerprint so later phases can detect stale validation
before solving or committing a plan.

## Outcome Semantics

Hard violations make `canGenerate()` false and produce the `invalid` status.
Warnings keep `canGenerate()` true, make `requiresConfirmation()` true, and
produce the `confirmation_required` status. A result without hard violations or
warnings is `valid`.

Warnings are not soft optimization penalties. They describe a configuration
that can be attempted but requires an explicit user decision. Quality scoring
remains separate from configuration validity.

## Forced-Day Rules

Multiple selected courses forced to the same day produce the non-blocking
`same_day_concentration` warning. This is the review case requested by the
Schedule Generator workflow: the configuration is possible in principle but may
be unrealistically concentrated.

A forced day becomes blocking when:

- A preferred multi-day pattern is also configured.
- Lecture/laboratory split or minor split requires separated meetings.
- The total single-meeting duration exceeds the operating slots available on
  that day.

These cases use `forced_day_multi_meeting_conflict` or
`forced_day_capacity_exceeded` because user confirmation cannot make an
impossible configuration feasible.

## Room And Laboratory Rules

An on-site course that requires physical capacity is rejected when the active
profile and explicit delivery mode do not permit an existing fallback. A missing
laboratory room is:

- `laboratory_room_unresolved`, a warning, when Room TBA fallback is enabled.
- `no_physical_rooms`, a hard violation, when Room TBA fallback is disabled.

This preserves the distinction between a resolvable assignment and a
configuration with no permitted placement.

## Recommendation Contract

Recommendations retain the payload shape already used by generation diagnostics:

- `id`, `title`, `detected_cause`, and `suggested_adjustment`
- `section_id` and `section_name`
- `course_id` and `course_code`
- `impact`
- `adjustments`

Machine-applicable adjustment types introduced or reused by this phase are:

- `remove_course`
- `remove_configuration_reference`
- `set_delivery_mode`
- `disable_lecture_lab_split`
- `disable_minor_split`
- `clear_forced_day`

Applying an adjustment creates a changed configuration. Later integration must
version that payload and require the user to review or confirm it before solving;
recommendations must not silently mutate the submitted configuration.

## Performance Boundary

Snapshot-backed validation performs zero queries. Capturing the complete snapshot
uses a bounded query set that does not grow with the number of schedules. The
snapshot query ceiling is 16 after adding one shared operating-hours settings
query. `SchedulingPolicy` loads opening and closing times together so the same
settings row is not queried twice.

## Exit Criteria

- Complete configuration validation is deterministic against one snapshot.
- Hard violations block generation and warnings require confirmation.
- Same-day concentration is independent from impossible forced-day rules.
- Recommendations use stable diagnostic fields and explicit adjustments.
- Snapshot-only validation performs no database access.
- Existing generation, solver, API, queue, and persistence behavior is unchanged.
- Phase 0 through Phase 4 characterization and parity tests pass.
