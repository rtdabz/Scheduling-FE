# Scheduling Core Phase 9 Generation Instrumentation

## Decision

Phase 9 adds one schema-versioned observability contract for section and
year-level schedule generation. Instrumentation is additive: it does not change
constraint evaluation, candidate ordering, scoring, retry selection, or
persistence behavior.

`SchedulingGenerationMetrics` records:

- Snapshot query count and capture elapsed time.
- Solver variable count and candidate-domain size before and after pruning.
- Candidate pruning grouped by constraint or filtering reason.
- Search iterations, attempt count, search-limit state, and elapsed time.
- Retry reasons and fallback usage.
- Operation-specific correlation metadata.

The contract is returned as `generation_metrics` in section preview, selection,
generation, auto-apply, year-level preview, and queued generation results.
Configuration failures also include validation-only metrics and explicitly state
that the solver was not invoked.

## Snapshot Metrics

`SchedulingQueryCounter` observes database queries through Laravel's database
event listener. `SchedulingSnapshotRepository` calculates the query delta for
each capture and stores it in snapshot metadata as:

```json
{
  "snapshot_query_count": 11,
  "snapshot_elapsed_ms": 4.25
}
```

Operational metrics are added only after the semantic snapshot fingerprint is
calculated. Query counts and elapsed time therefore cannot invalidate an
otherwise identical scheduling snapshot.

## Solver Metrics

The legacy CSP adapter now exposes the same metrics port as future solvers. The
current CSP records domain size before filtering, the remaining domain after
persisted-conflict and Room TBA filtering, iterations, elapsed time, and fallback
markers present in returned candidates.

Current pruning keys include:

- `persisted_schedule_conflict`
- `room_tba_disabled`

Fallback keys include:

- `room_tba`
- `laboratory_to_lecture_room`
- `lecture_to_laboratory_room`
- `preferred_pattern`
- `single_session`

The names are stable machine-readable identifiers. New solvers may add keys but
must preserve the contract shape.

## Year-Level Aggregation

Year-level generation aggregates every section solver invocation across
ordering exploration, branch backtracking, retry strategies, and Room TBA
recovery. `solver_attempts`, candidate counts, pruning counts, iterations, and
fallback counts are sums across the complete run.

`retry_reasons` uses `strategy:outcome`, for example:

```json
["preflight_pattern:failed", "alternate_pattern:succeeded"]
```

Opening the second recovery pass is recorded as `room_tba_search` even if the
final selected schedule does not contain an unresolved room.

Year-level generation still uses its legacy multi-section loading flow, so its
metrics declare `snapshot_contract_adopted: false`. Aggregate per-section
snapshot fingerprints remain part of the deferred Phase 8 migration.

## Logging

When `PERFORMANCE_LOGGING=true`, completed metric reports are written as the
structured `scheduling_generation_metrics` log event. Existing slow-query
logging remains enabled by the same setting.

Metrics are also persisted in `schedule_generation_runs.result` for queued
successes and structured domain failures. No database migration is required
because the result column is JSON.

## Exit Criteria

- Section and year-level generation expose one versioned metrics shape.
- Snapshot query cost is measurable without changing snapshot identity.
- Candidate-domain pruning and fallback use are visible.
- Year-level retries aggregate all solver invocations rather than reporting only
  the final attempt.
- Structured failures retain metrics in queued run results.
- Performance logging emits structured metrics without changing generation.
