# Scheduling Core Phase 3 Constraint Kernel

> **Update 2026-09-19.** `SchedulingConstraintParityReporter` was deleted; only
> tests used it. Rule-by-rule RuleEngine/kernel agreement, and generator output
> passing both validators under each setting, are enforced by
> `tests/Feature/EngineParityMatrixTest.php`. Course classification now lives
> once in `SchedulingPolicy` (model or snapshot array); the predicates delegate.

## Decision

Phase 3 introduces one executable, presentation-neutral constraint kernel for
the scheduling rule families that were duplicated across the Rule Engine, batch
validator, controller helpers, and CSP. The kernel consumes Phase 1 domain
contracts and the Phase 2 immutable snapshot. It does not query the database and
does not persist or mutate schedules.

Existing runtime paths remain authoritative during this phase. The kernel is
dual-run in parity tests so mismatches are visible before any controller, solver,
recommendation, or persistence path is switched.

## Components

| Component | Responsibility |
|---|---|
| `SchedulingConstraintPredicates` | Pure half-open overlap, concurrency sweep, course classification, room requirement, and fallback predicates |
| `SchedulingConstraintKernel` | Ordered row and meeting-group evaluation against a `SchedulingSnapshot` |
| `SchedulingConstraintParityReporter` | Compares canonical legacy and kernel rule IDs and reports legacy-only and kernel-only mismatches |

All executable kernel rule IDs remain registered in
`SchedulingPolicy::CONSTRAINT_CATALOG`. `RULE_PRIORITY` defines a unique explicit
order instead of relying on controller method order.

## Migrated rule families

The Phase 3 kernel evaluates:

- Section, faculty, exclusive-room, and same-online-course overlaps.
- Online, field, and configured multi-capacity room limits.
- NSTP, field, minor, Sunday-major, and field-evening day rules.
- Department forced-course days.
- Delivery-room alignment and lecture/laboratory/field room compatibility.
- Laboratory Room TBA and lecture online fallback eligibility.
- Hybrid eligibility, component type, duration, mode, count, and composition.
- Minor split eligibility, component count, pattern, total duration, and linked-day separation.

Overlap intervals are half-open: a meeting ending at `10:00` does not conflict
with one starting at `10:00`. Capacity uses an end-before-start sweep at equal
timestamps so adjacent meetings do not consume concurrent capacity.

## Evaluation order

The kernel reports migrated hard constraints in this order:

1. Hybrid row configuration and component shape.
2. Day/category, evening-window, and forced-day rules.
3. Room and delivery compatibility.
4. Section, online-course, faculty, and room overlap rules.
5. Room and online capacity.
6. Hybrid and split meeting-group integrity.

This order is explicit metadata. It is independent of HTTP response formatting
and solver search order.

## Parity boundary

Parity tests compare canonical rule IDs rather than exact messages. Existing
paths include controller-specific course, section, room, and operation labels;
those presentation details do not change whether a placement is valid.

The dual-run matrix covers:

- Rule Engine checks against persisted schedules.
- Batch-validator checks between candidate rows.
- Online and field capacity.
- Day, forced-day, field-window, and room-mode combinations.
- Hybrid row and group shape.
- Minor split pattern and duration.

`SchedulingConstraintParityReporter` returns `legacy_only` and `kernel_only`
lists so later shadow instrumentation can record semantic drift without changing
the active response.

## Deferred constraints

Phase 3 does not yet migrate required-field validation, entity existence,
curriculum eligibility, operating hours, time-grid validation, preferred-pattern
syntax, instructor department/program/load eligibility, quality penalties, or
aggregate feasibility diagnostics. These remain with their current owners until
their application or solver migration phase.

The kernel also does not authorize persistence. Recommendation acceptance and
manual writes continue to revalidate through existing paths and transactions.

## Adoption sequence

1. Phase 4 configuration validation uses the kernel predicates for feasibility
   and anomaly findings while legacy generation remains unchanged.
2. Phase 5 solver domain construction and pruning adopt the same predicates and
   snapshot under parity measurements.
3. Phase 6 application services produce plans whose violations come from the
   kernel.
4. Phase 7 commit re-evaluates the final plan against a fresh snapshot inside the
   scheduling lock before persistence.
5. Legacy constraint implementations are removed only after every active path
   has parity coverage and no unresolved mismatch reports.

## Exit criteria

- Migrated predicates are deterministic and have no database access.
- Row and meeting-group evaluation returns `ConstraintViolation` contracts.
- Every executable rule ID is cataloged and has one explicit priority.
- Persisted and candidate overlap semantics match current validators.
- Capacity, day, room-mode, forced-day, hybrid, and split parity tests pass.
- No runtime controller, validator, solver, recommendation, or persistence path
  has been switched prematurely.
