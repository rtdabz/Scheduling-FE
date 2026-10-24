# Scheduling Core Phase 5 Solver Boundaries

> **Status: partially retired.** The snapshot-propagation half of this phase was
> never adopted. `SchedulingHardConstraintPropagator`, `CspCandidateRowMapper`,
> and the `SOLVER_CONSTRAINT_SHADOW` shadow-mode flag have been deleted:
> shadow mode was removed from `CspSolver` earlier, which left them with no
> caller and no test coverage, and `CspSolver::prunePersistedConflictingCandidates`
> remains the runtime authority for persisted-conflict pruning. The solver-port
> half of the phase (`SchedulingSolver`, `CspSchedulingSolverAdapter`,
> `SolverResultMapper`) is still in use. The domain-compilation half
> (`SolverVariableDomain`, `SolverDomainCompilation`, `LegacyCspDomainCompiler`,
> `SolverDomainParityReporter`) was deleted on 2026-09-19: the canonical
> compiler it was built to compare against never existed, so the "legacy"
> compiler passed its input through unchanged and only tests called it.
> Generator/validator agreement is now enforced end to end by
> `tests/Feature/EngineParityMatrixTest.php`.
> Sections below are kept as a record of the original design; treat any
> propagation or shadow-mode instruction as historical, not current.

## Decision

Phase 5 introduces explicit boundaries around the existing CSP without replacing
its search behavior. The current `CspSolver` remains the runtime authority for
candidate enumeration, search ordering, backtracking, scoring, diversity, room
fallback, and public schedule ordering.

The phase extracts the contracts and pure services required to migrate that work
incrementally:

- Immutable solver variable domains and propagation metrics.
- A legacy-domain compiler adapter.
- A CSP-candidate to `ScheduleRow` mapper.
- Snapshot-backed hard-constraint propagation.
- A solver interface and legacy compatibility adapter.
- A ranked-result to `ScheduleCandidate` mapper.
- Legacy-versus-canonical domain parity reporting.

No controller, queue job, year-level coordinator, or persistence path is switched
to a new search implementation in this phase.

## Components

| Component | Responsibility |
|---|---|
| `SchedulingSolver` | Stable application port returning domain `ScheduleCandidate` contracts |
| `CspSchedulingSolverAdapter` | Delegates the stable port to the current `CspSolver` schema |
| `SolverResultMapper` | Maps ranked legacy results to immutable candidates |
| `SolverVariableDomain` | Represents one course variable and its candidate domain |
| `SolverDomainCompilation` | Carries fingerprinted domains and pruning instrumentation |
| `LegacyCspDomainCompiler` | Normalizes existing CSP variable arrays into the immutable domain boundary |
| `SolverDomainParityReporter` | Compares candidate identities after legacy and canonical pruning |

The Laravel container binds `SchedulingSolver` to `CspSchedulingSolverAdapter`. This
allows later application services to depend on the port while preserving the
current implementation.

## Propagated Constraints

Phase 5 propagates the persisted-conflict rule family currently owned by
`CspSolver::prunePersistedConflictingCandidates`:

- `section_conflict`
- `subject_section_time_conflict`
- `faculty_conflict`
- `room_conflict`
- `room_capacity_conflict`
- `online_capacity_conflict`

Candidate construction still applies day, room type, delivery, forced-day,
hybrid, split, pattern, and requirement filters before this propagation stage.
Those builders are not duplicated in a new service. They will be extracted only
when their complete parity matrix can move with them.

## Replacement And Tentative State

The propagator preserves current generation semantics:

- Existing draft, completed, or revision rows for the selected section and
  selected courses are ignored because generation replaces those rows.
- Persisted IDs represented in tentative state are ignored at their stored
  position, while the tentative replacement row participates at its new position.
- New tentative rows participate in overlap and capacity evaluation.
- Persisted schedules are read only from the supplied immutable snapshot.

`SchedulingHardConstraintPropagator::propagate` performs no database queries.

## Instrumentation

`SolverDomainCompilation` records:

- Snapshot fingerprint.
- Candidate count before propagation.
- Candidate count after propagation.
- Total pruned candidates.
- Pruned candidates grouped by canonical constraint ID.
- Section, course, compiler, and propagated-rule metadata.

`SolverDomainParityReporter` compares stable SHA-256 candidate identities and
reports legacy-only and canonical-only candidates. Search-only annotations such
as `_weekday_physical_available` are excluded from identity because they do not
describe a placement.

## Shadow Mode (removed)

This mode no longer exists. It is described here only to explain why the
propagation components were retired.

It originally worked as follows: `SOLVER_CONSTRAINT_SHADOW=true` made the active
legacy solver dual-run the snapshot propagator after domain construction, and the
solver exposed the most recent comparison through `constraintPropagationReport()`.
That dual-run was removed from `CspSolver`; the flag and the propagator it drove
have now been deleted as well. Re-introducing a parity pass means rebuilding the
propagator against the current kernel, not re-enabling a flag.

Shadow mode:

- Is disabled by default.
- Never changes the variable domains used by the search.
- Never blocks generation when comparison instrumentation fails.
- Captures an additional snapshot and therefore adds bounded queries only when
  explicitly enabled.
- Reports the snapshot fingerprint, candidate counts, constraint pruning counts,
  and domain mismatches.

This mode is intended for parity tests and controlled diagnostics, not permanent
production overhead.

## Deferred Extraction

The following remain inside `CspSolver` during Phase 5:

- Database/model loading used by the legacy path.
- Day/time/room candidate enumeration.
- Hybrid and split candidate construction.
- Search variable ordering and candidate ranking.
- Backtracking and search-limit handling.
- Quality scoring and diverse-solution selection.
- Public row ordering and split-group UUID assignment.

Extracting these concerns before their behavior is characterized would create a
second solver implementation and increase semantic drift. Later work should move
one responsibility at a time behind the Phase 5 ports.

## Adoption Sequence

1. Run shadow propagation across representative section and year-level fixtures.
2. Instrument and resolve every legacy-only or canonical-only candidate.
3. Make canonical persisted-conflict propagation authoritative after sustained
   parity, while retaining the legacy comparison temporarily.
4. Extract candidate enumeration into a snapshot-only domain compiler.
5. Extract search ordering/backtracking behind a search-strategy port.
6. Move scoring and result mapping after feasible-solution parity is established.
7. Remove legacy arrays only after application services consume the solver port.

## Exit Criteria

- Solver input/output can pass through stable domain ports.
- Legacy variable domains have an immutable representation.
- Persisted-conflict propagation uses the shared kernel and snapshot without DB access.
- Replacement and tentative schedule semantics are preserved.
- Pruning metrics identify candidates removed by each constraint.
- An opt-in real-solver shadow pass reports domain parity without changing output.
- Existing solver, fallback, split, hybrid, diagnostics, and generation tests pass.
