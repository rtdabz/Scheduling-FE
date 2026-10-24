# Scheduling Core Phase 0 Baseline

## Purpose

Phase 0 freezes the observable scheduling behavior before structural refactoring.
It is a characterization baseline, not the target architecture and not permission
to change scheduling rules.

The baseline covers the current working implementation of manual placement,
batch writes, generation, recommendation acceptance, instructor assignment,
hybrid and split meetings, resource fallback, and asynchronous generation.

## Current execution paths

| Path | Entry point | Validation and decision owners | Persistence |
|---|---|---|---|
| Manual single placement | `ScheduleController::store/update` | Request validation, `RuleEngine` | Direct schedule write |
| Manual batch placement | `ScheduleController::batch` | `BatchConflictValidator`, meeting-group validation, `RuleEngine` | Advisory lock and transaction |
| Section preview | `ScheduleRecommendationController` or queued job | Preflight, `CspSolver`, quality scoring | Generation run or recommendation JSON |
| Year-level preview | `ScheduleRecommendationController` or queued job | Preflight, feasibility, sequential section CSP, retries, quality evaluator | `schedule_generation_runs.result` |
| Recommendation acceptance | `ScheduleRecommendationController::accept` | Batch conflicts, `RuleEngine`, duplicate check | Recommendation transaction |
| Instructor assignment | Instructor and schedule controllers | Rule Engine, faculty-load projection, overload confirmation | Schedule update transaction |

## Effective validation order

The Rule Engine currently applies priority through method order rather than an
explicit priority model:

1. Required fields and simple enum validation.
2. Entity existence and relational integrity.
3. Term, curriculum, section, room, faculty, and delivery eligibility.
4. Time-grid, preferred-pattern, day-category, field-window, and forced-day rules.
5. Persisted room, faculty, section, and online-subject conflicts.
6. Online and shared-resource capacity limits.
7. Hybrid and split row shape, followed by group validation in batch paths.

The CSP implements equivalent concepts through domain construction, persisted
candidate pruning, tentative-assignment checks, and fast candidate guards. These
are separate implementations and are the primary parity risk for Phase 3.

## Constraint ownership matrix

| Family | Rule Engine | Batch validator | CSP/generation | Instructor workflow | Acceptance | Current parity evidence |
|---|---:|---:|---:|---:|---:|---|
| Required/entity integrity | Yes | No | Preflight/CSP loading | Indirect | Yes | API and Rule Engine tests |
| Time grid and hours | Yes | No | Yes | Indirect | Yes | Timeslot and generation tests |
| Section overlap | Yes | Yes | Yes | Indirect | `CoreConflictConstraintParityTest` |
| Exclusive room overlap | Yes | Yes | Yes | No | Yes | `CoreConflictConstraintParityTest` |
| Faculty overlap | Yes | Yes | Existing faculty only | Yes | Yes | `CoreConflictConstraintParityTest` |
| Same online subject overlap | Yes | Yes | Yes | No | Yes | `CoreConflictConstraintParityTest` |
| Room/field/online capacity | Yes | Yes | Yes | No | Yes | Batch and Rule Engine capacity tests |
| Room/laboratory suitability | Yes | No | Yes | No | Yes | `LaboratoryRoomRequirementParityTest` |
| Day/category/field window | Yes | No | Yes | No | Yes | `DayCategoryConstraintParityTest` |
| Forced course day | Yes | No | Yes | No | Yes | Rule Engine and generation tests |
| Hybrid meeting shape | Row/group | Pairwise only | Builder and CSP | Group-aware assignment | Yes | Split and hybrid feature tests |
| Minor split shape | Group | Pairwise only | Builder and CSP | Group-aware assignment | Yes | Split validation tests |
| Instructor eligibility/load | Yes | Faculty overlap only | Not assigned | Yes | Only if faculty present | Instructor and overload tests |
| Soft quality rules | No | No | CSP/evaluator | No | Preview rank only | Quality evaluator tests |

`SchedulingPolicy::CONSTRAINT_CATALOG` is the canonical Phase 0 ID inventory.
`SchedulingConstraintCatalogTest` prevents literal runtime rule IDs and batch
conflict IDs from existing outside that inventory.

## Diagnostic namespaces

Generation feasibility currently reports diagnostic codes separately from rule
violations:

- `no_physical_rooms`
- `insufficient_room_slots`
- `no_laboratory_room`
- `insufficient_laboratory_slots`
- `fixed_pattern_overloaded`
- `insufficient_online_slots`

These remain diagnostic codes during Phase 0. Phase 3 must decide whether each
becomes a constraint ID, an aggregate feasibility finding, or an unresolved
resource status.

## API and solver behavior to preserve

- Synchronous year-level preview remains available for compatibility.
- Queued preview returns HTTP 202 and a `run_id`; the run record contains the
  terminal result or structured failure payload.
- Generated rows normally have no instructor assignment.
- Year-level solving composes bounded per-section solutions rather than running
  one global CSP.
- Baseline generation is attempted before retry strategies.
- Search may retry with alternate ordering or seed without changing rules.
- Preference retries may change patterns, split selection, or delivery mode and
  report `applied_strategy` and `applied_adjustments`.
- Room TBA is searched only after attempts without TBA fail.
- Quality scoring ranks feasible candidates and must not authorize an invalid
  candidate.
- Recommendation acceptance revalidates against current persisted schedules.
- Manual batch writes are serialized by the scheduling scope lock.

## Known discrepancies frozen for later phases

- The catalog previously omitted runtime rule IDs; Phase 0 registers them but
  does not centralize execution.
- `duplicate_section_subject` and `duplicate_section_course` describe related
  concepts under different IDs.
- Recommendation acceptance does not yet use the batch API scheduling lock.
- Aggregate forced-day concentration is currently a client warning, not a
  backend feasibility finding.
- Laboratory capacity can degrade to Room TBA rather than a distinct incomplete
  plan state.
- Generated timetable validity excludes future instructor availability and load.
- Schedule model events still create history and split persistence side effects.
- The section preview queue job still invokes a controller.

## Phase 0 exit criteria

Phase 0 is complete when:

1. Every emitted scheduling rule ID is cataloged.
2. Every rule family has a documented current owner and expected enforcement paths.
3. Core overlap rules have persisted-versus-batch parity tests.
4. Existing day, laboratory, split, hybrid, capacity, generation, recommendation,
   instructor, and transaction tests pass.
5. Remaining gaps are explicitly recorded here rather than silently corrected.

Behavioral corrections begin only in later phases with dedicated migration and
parity coverage.
