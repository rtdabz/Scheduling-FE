# Scheduling Core Phase 2 Snapshot Repository

## Decision

Scheduling rules and solver adapters will consume one immutable
`SchedulingSnapshot` instead of loading their own database state. Phase 2 adds the
repository and deterministic fingerprint without switching existing execution
paths; migration of validators and the CSP occurs in later phases under parity
tests.

## Repository boundary

`SchedulingSnapshotRepository` captures:

- The selected term and department scheduling settings.
- Target department sections, optionally restricted to requested IDs.
- Requested courses and authoritative active-curriculum periods.
- Course category assignments.
- Department/shared rooms plus external rooms referenced by term schedules.
- Every persisted schedule in the term, including split metadata and instructor-assignment stage state.
- Faculty records and availability windows, unless explicitly omitted.
- Department forced-course days.
- Department and institution-wide field-course codes.
- Online and field resource limits.
- Deterministic effective `ONLINE` and `FIELD` virtual resources when no
  persisted room of that type exists.
- The operating-hours window and scheduling slot size.
- Active curriculum IDs and requested snapshot scope metadata.

Persisted schedules are term-wide by design. Room, faculty, online-subject, and
shared-resource conflicts can cross section and department boundaries, so a
department-only schedule query would produce an inaccurate snapshot.

## Fingerprint semantics

`SchedulingSnapshotFingerprint` recursively sorts associative keys and hashes the
normalized scheduling payload with SHA-256. Capture time is excluded.

The fingerprint changes when scheduling-relevant state changes, including:

- Persisted schedule placement or assignment.
- Room/resource configuration.
- Course or curriculum placement.
- Forced-day or field-course settings.
- Faculty eligibility or availability.
- Department scheduling settings.

Repeated captures of unchanged state produce the same fingerprint. Later plan
commit logic can compare the source fingerprint with a fresh snapshot to reject a
stale preview.

## Query and normalization rules

- Queries are collection-based and independent of the number of schedules,
  rooms, courses, or faculties loaded.
- Eloquent models are converted into scalar arrays before entering the snapshot;
  mutable models and query builders do not cross the repository boundary.
- IDs are integer map keys, times are normalized to `HH:MM`, and collections are
  ordered before fingerprinting.
- Virtual resource IDs and capacities match the legacy CSP fallback resources,
  allowing kernel validation without an additional room query.
- Faculty loading may be disabled for operations that require only timetable and
  room validation.
- The current implementation selects the first active department curriculum to
  match existing generator behavior, while recording every active curriculum ID
  as metadata. Program-specific curriculum resolution remains a documented later
  refinement because sections currently have no program identity.

## Adoption sequence

1. Phase 3 constraints receive the snapshot instead of issuing queries.
2. Phase 4 configuration validation captures one snapshot before feasibility and
   anomaly checks.
3. Phase 5 the solver adapter receives the same snapshot used by validation.
4. Phase 6 generation stores the snapshot fingerprint in `SchedulePlan`.
5. Phase 7 commit captures fresh state inside the scheduling lock and rejects a
   changed fingerprint before persistence.

## Exit criteria

- Snapshot capture includes every data source used by current core rules.
- Persisted conflicts are term-wide and retain referenced resource metadata.
- Repeated unchanged captures have a stable fingerprint.
- Scheduling-state changes alter the fingerprint.
- Query count remains bounded as fixture size grows.
- Snapshot data contains no live Eloquent models.
- Phase 0 and Phase 1 behavior and contract tests remain green.
