# Scheduling Core Phase 6 Schedule Planning

## Decision

Phase 6 introduces `GenerateSchedulePlan`, the application-service boundary that
turns one normalized `GenerationConfiguration` into immutable, ranked
`SchedulePlan` contracts.

The service owns the planning sequence:

1. Capture one immutable scheduling snapshot.
2. Validate the complete generation configuration against that snapshot.
3. Stop before solving when hard violations exist.
4. Stop before solving when warnings have not been explicitly confirmed.
5. Invoke the Phase 5 `SchedulingSolver` port.
6. Revalidate every returned candidate through the Phase 3 constraint kernel.
7. Classify unresolved resources and plan status.
8. Return versioned plans containing the source snapshot fingerprint.

Phase 6 does not write schedules, recommendations, histories, or audit records.
Current controllers, jobs, year-level retry orchestration, and recommendation
persistence remain unchanged. Phase 7 owns fresh-snapshot commit validation,
locking, and transactional persistence.

## Components

| Component | Responsibility |
|---|---|
| `GenerateSchedulePlan` | Coordinates snapshot, configuration validation, solving, final validation, and plan mapping |
| `SchedulingConstraintEvaluationContext` | Immutable additional candidate rows and persisted schedule IDs ignored for replacement |
| `SchedulingConstraintEvaluationContextFactory` | Builds replacement and tentative-state semantics once for propagation and final validation |
| `ValidateScheduleCandidate` | Evaluates proposed rows and meeting groups through the constraint kernel |
| `SchedulePlan` | Carries configuration, fingerprint, rows, violations, recommendations, resources, scores, and metadata |

The Phase 5 `SchedulingSolver` port now exposes search iteration and limit
telemetry in addition to ranked `ScheduleCandidate` results.

## Planning Outcomes

### Invalid Configuration

A configuration with one or more hard violations returns one plan with:

- Status `invalid`.
- No schedule rows.
- Canonical configuration violations.
- Machine-applicable configuration recommendations.
- No solver invocation.

### Confirmation Required

A configuration containing only warnings, including `same_day_concentration`,
returns one plan with:

- Status `configuration_valid`.
- No schedule rows.
- `generation_deferred` metadata.
- `requiresConfirmation()` equal to true.
- No solver invocation.

The caller must explicitly repeat planning with configuration warnings confirmed.
Confirmation is recorded as `confirmed_violation_rule_ids`; confirmed warnings
remain visible for auditability but no longer keep the resulting plan in a
confirmation-required state.

### No Feasible Candidate

An empty solver result returns one `invalid` plan with the hard
`no_feasible_schedule` violation. Search iterations and search-limit state are
retained in plan metadata.

### Candidate Plans

Every solver candidate becomes one plan:

- `invalid` when final kernel validation finds a hard violation.
- `room_assignment_unresolved` when no hard violation exists but an on-site or
  field row has no resolved room.
- `room_assignment_complete` when all hard constraints pass and every required
  room is resolved.

Instructor feasibility and assignment are later stages and are not inferred from
room-complete status.

## Final Candidate Validation

`ValidateScheduleCandidate` evaluates:

- Each proposed row against persisted snapshot rows.
- Each proposed row against other rows in the same candidate.
- Each proposed row against tentative schedules from earlier planning work.
- Hybrid, minor-split, and multi-day meeting-group integrity.

The validator preserves current replacement semantics:

- Draft, completed, and revision rows for the selected section and selected
  courses are ignored at their persisted positions.
- A tentative update suppresses its persisted row and participates at its new
  position.

Once the snapshot exists, final candidate validation performs zero database
queries.

The snapshot includes the same deterministic `ONLINE` and `FIELD` virtual
resources synthesized by the legacy CSP, so final validation does not reject a
valid fallback candidate merely because no physical database row represents the
shared resource.

## Plan Contents

Each generated plan contains:

- A unique plan ID and schema version.
- The complete normalized generation configuration.
- The source snapshot fingerprint.
- Proposed `ScheduleRow` contracts.
- Canonical configuration and final-candidate violations.
- Existing generation recommendation payloads.
- Unresolved room descriptors.
- Quality, penalty, and score-breakdown values available from the solver result.
- Candidate rank and preserved solver metadata.
- Iterations used and search-limit state.

Plans are not persisted during Phase 6. Their fingerprint is the concurrency
token that Phase 7 must compare with a fresh snapshot before committing.

## Compatibility Boundary

Existing section preview endpoints cannot yet be switched safely because their
request contract does not include explicit confirmation of configuration
warnings. Silently treating a warning as confirmed would violate the Phase 4
workflow; silently refusing generation would change the current API.

Controller adoption therefore waits until the UI and API can carry:

- The validated configuration version.
- The snapshot fingerprint or plan ID.
- Explicit confirmed warning rule IDs.
- Any accepted machine-applicable adjustments.

The legacy preview and recommendation persistence paths remain authoritative in
the meantime.

## Exit Criteria

- One application service owns configuration-to-plan orchestration.
- Invalid and unconfirmed configurations never invoke the solver.
- Confirmed warnings remain visible without requiring duplicate confirmation.
- Every candidate is revalidated through the central constraint kernel.
- Replacement, tentative, hybrid, and split semantics are preserved.
- Room TBA is represented as an unresolved resource rather than a committed room.
- Empty search results use a canonical hard violation.
- Plans preserve snapshot, score, rank, and solver telemetry.
- No planning code persists or mutates schedule state.
- Phase 0 through Phase 6 regression tests pass.
