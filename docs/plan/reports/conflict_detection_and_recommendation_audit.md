# Conflict Detection and Recommendation — Accuracy Audit

Date: 2026-09-19

Scope: every path that decides whether a placement conflicts, and every path that proposes a conflict-free placement:

| Layer | Where | Used by |
|---|---|---|
| Rule engine (one row vs. saved rows) | `backend/app/Services/Scheduling/Engine/RuleEngine.php` + `Engine/Rules/*` | manual save, drag-and-drop, instructor assignment, split recommendations |
| Batch validator (rows vs. each other + shared capacity) | `backend/app/Services/Scheduling/Schedule/BatchConflictValidator.php` | batch save, recommendation accept |
| Constraint kernel (generator/commit) | `backend/app/Services/Scheduling/Engine/Constraints/*` | CSP generation, `CommitSchedulePlan` |
| Client pre-check | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/hooks/useConflict.ts` | grid highlighting, drop modal |
| Recommenders | `CspSolver`, `SplitScheduleService::recommend`, `ScheduleController::validateSplits`, `ScheduleRecommendationController::select` | recommendation panels |

No application code was changed. Two findings (F1, F2) were confirmed by a throwaway PHPUnit probe run against the real services. The probe file was deleted afterwards. Everything else comes from reading the code, and each item says so.

---

## Fix status (2026-09-19)

| Finding | Status | Where |
|---|---|---|
| F1 online capacity | **Fixed** (PHP + client) | `RoomAvailabilityRule::onlineCapacity`, `useConflict.checkOnlineCapacity` |
| F2 room concurrency | **Fixed** | `Rooms::booted` clamp, migration `2026_09_19_000001_*` |
| F3 field scope | **Fixed** | `RoomAvailabilityRule::booking` |
| F4 select re-solves | **Fixed** | `PreviewedPlanStore`, `select` takes `plan_id`, `DropModal` sends it |
| F5 split ranking | **Fixed** | `SplitScheduleService::recommend` ranks before validating; one prefilter query |
| F6 override scope | **Fixed** | `FacultyConflictOverride::withoutStanding` / `partnerIds` |
| F7 generator faculty rules | **Guarded** | Flow test fails if generated rows carry an instructor |
| F8 dead `validate-splits` | **Open**: removal needs product-owner sign-off | |
| F9 client gaps | **Partly fixed**: same-online-course check added; the client still sees only loaded rows | `useConflict.checkConflict` |
| F10 touching windows | **Fixed** (PHP + both clients) | `InstructorAvailabilityRule`, `lib/availabilityWindows.ts` |
| F11 first clash only | **Fixed** | section and room violations carry `conflicting_schedule_ids` |

Regression tests: `ConflictDetectionParityTest` (RuleEngine vs kernel vs batch on the same fixtures), plus new cases in `FacultyConflictOverrideTest`, `ManualPlacementRecommendationFlowTest`, `useConflict.test.ts` and `availabilityWindows.test.ts`.

---

## 1. Verdict

The core detection is **accurate**. Section, instructor, and exclusive-room double-booking all use the same half-open overlap test (`start < other.end && end > other.start`). All three are scoped by semester and day, and back-to-back classes (08:00–09:00 followed by 09:00–10:00) are correctly *not* conflicts. Times are validated as `H:i` before they reach SQL, and every accepted plan is re-validated against a fresh snapshot fingerprint at commit. That stops stale recommendations from being written.

The weaknesses are about **consistency, not the basic idea**. The system has four implementations of the same rules, and they disagree on shared-capacity resources (online slots, rooms with more than one concurrent class, field rooms). One of them counts capacity incorrectly. The recommenders are sound in what they return, but they can return a *worse* answer than the best available, or a different answer than the one the user previewed.

| Severity | Count | Theme |
|---|---|---|
| High | 2 | Wrong answers from capacity rules (false refusals; validators disagree) |
| Medium | 5 | Parity gaps and recommendation quality/stability |
| Low | 4 | Edge cases, dead code, and messaging |

---

## 2. What is accurate (keep as is)

- **Section conflict:** the same section, semester, and day with overlapping times is refused in all four layers.
- **Instructor conflict:** all overlapping meetings are reported (`conflicting_schedule_ids`), so an override can flag every partner. The override lapses automatically when faculty, day, or time changes (`Schedule::booted`).
- **Exclusive room conflict:** checked across *all* departments in the rule engine and in the generator snapshot, which loads the whole semester (`SchedulingSnapshotRepository.php:124`).
- **Same online course, two sections:** `subject_section_time_conflict` in the rule engine, batch validator, and kernel.
- **Slot grid and operating hours:** start/end aligned to 30-minute slots from opening time; the end must be after the start.
- **Stale-plan guard:** `CommitSchedulePlan` refuses a plan whose snapshot fingerprint changed, then re-runs the kernel. A recommendation therefore can never commit a conflict created by someone else in the meantime.
- **Split recommendations:** every candidate `SplitScheduleService` returns has passed the full `RuleEngine::validate`, so nothing it recommends is refused on save.
- **Sweep-line capacity:** `BatchConflictValidator` and `SchedulingConstraintPredicates::concurrencyExceeds` compute true peak concurrency, with ends sorted before starts so touching intervals don't count.

---

## 3. Findings

### High

#### F1. Online capacity counts overlapping rows instead of peak concurrency (false refusals) — CONFIRMED

`backend/app/Services/Scheduling/Engine/Rules/RoomAvailabilityRule.php:138` counts every online row that overlaps the attempt and refuses when `count >= limit`. The same logic is mirrored on the client at `useConflict.ts:382`.

**Scenario (reproduced):** online limit = 2. The department has online classes at 07:00–08:00 and 08:00–09:00. A new 07:00–09:00 online class is never more than 2 concurrent, yet:

```
RuleEngine            -> ["online_capacity_conflict"]
BatchConflictValidator -> []
```

The same placement is refused by a single save and accepted by a batch save and by the generator (the kernel uses the sweep). This is the only rule where the rule engine is *stricter* than the generator. Generated schedules that are later dragged or edited can then fail to save "for no reason".

**Fix:** replace the count with the sweep already used for field rooms (`exceedsCapacity`, or `SchedulingConstraintPredicates::concurrencyExceeds`). Apply the same change to `checkOnlineCapacity` in `useConflict.ts`. Add a regression test with the staggered case above.

#### F2. Rooms with `max_concurrent_classes > 1` get three different answers — CONFIRMED

| Layer | Non-field room with capacity 2 |
|---|---|
| `RoomAvailabilityRule::booking` (line 87) | Capacity **ignored**; any overlap is `room_conflict` across all departments |
| `BatchConflictValidator` | Capacity honoured, but counted **per department only** |
| Kernel `RoomAvailabilityConstraints.php:43` | Capacity honoured, counted **per department only** |

Reproduced: two sections in one capacity-2 lecture room at the same time give `RuleEngine -> ["room_conflict"]` and `BatchConflictValidator -> []`.

There are two defects here:
1. **Disagreement.** The generator can place two classes in such a room, and any later manual edit of either one is refused.
2. **Cross-department overbooking.** In the batch/kernel paths, departments A and B can each fill the room to capacity at the same time, which puts 4 classes in a capacity-2 room.

The root cause is data. `RoomsController::store` (line 31) accepts any `max_concurrent_classes` for any room type, while `update` (line 68) forces it back to 1 for non-field/online rooms. Changing a field room's type without sending the field leaves the old value (for example 3) in place.

**Fix (recommended, simplest):** make `max_concurrent_classes` meaningful only for field/online rooms. Clamp it to 1 in `store`, clamp it on any `room_type` change, and add a one-off migration that sets it to 1 for existing lecture/laboratory rooms. All three layers then agree without code changes to the validators. If shared lecture rooms are a real requirement, the sweep has to count all departments for non-field rooms, and that change must land in all three layers together.

### Medium

#### F3. Field-room scope differs between the rule engine and the generator

When a department's field limit is **1**, `RoomAvailabilityRule::booking` (line 64 requires `capacity > 1`) falls through to the exclusive check, which counts **every department**. The kernel and batch validator always scope field rooms to the department. As a result, a generated schedule can share the field with another department's class, and moving it one slot later is refused. Decide on one policy (business rules say per-department) and make the rule engine follow it.

#### F4. `select` re-runs the solver instead of committing what was previewed

`ScheduleRecommendationController::select` (line 1079) regenerates solutions and picks `selected_rank` from the new run. The UI passes the same seed, but the solver stops on a wall-clock limit (`CspSolver.php:4451`, `timeout_seconds: 5` from `DropModal.tsx:500`). Under different server load, the new run can explore a different part of the search space, and the saved "Rank 2" can differ from the Rank 2 the user compared. The UI applies whatever comes back, so the user is not told.

**Fix:** preview already builds immutable `SchedulePlan`s with `plan_id`s. Cache them briefly (keyed by plan id and snapshot fingerprint) and let `select` take a `plan_id`. The existing commit-time fingerprint check already covers staleness. As a stop-gap, compare the reselected rows with the previewed rows and return 409 on mismatch.

#### F5. Split recommendations are "first valid found", not "best"

`SplitScheduleService::recommend` walks candidates in order: preferred day first, then the remaining days × start slots × rooms. It calls the full `RuleEngine::validate` (roughly 15–20 queries each) on each one and stops at the timeout (line 117). Scoring happens only among the candidates reached. With several rooms, the 5-second budget runs out on the first day or two, so later days and the user's `preferred_start_time` may never be evaluated even when they would score highest.

**Fix:** prefilter candidates in memory against one query of the semester's rows for the section, room, faculty, and department (the pattern `candidateHasPersistedConflict` started). Order candidates by score *before* validating, and run `RuleEngine::validate` only on the top N as final confirmation.

#### F6. Standing faculty override suppresses *every* instructor conflict on that meeting

`FacultyConflictOverride::withoutStanding` (line 185) drops all `faculty_conflict` violations whenever the attempt's own row is flagged and unchanged. It doesn't check that the reported clashes are the ones originally overridden. A clash with a new, never-approved meeting is hidden on re-save of the flagged row. The new meeting's own save is still checked, which limits exposure, but a batch that moves the partner into place does not re-check the flagged row.

**Fix:** keep only violations whose `conflicting_schedule_ids` are all themselves flagged (partners that were overridden together), and surface the rest.

#### F7. The generator does not model part-time availability or inactive faculty

The kernel has no counterpart for `part_time_faculty_availability` or `faculty_active`. Generated rows currently carry `faculty_id = null`, so this is latent today. If generation ever pre-assigns faculty, it will produce plans that the rule engine refuses, which breaks the rule "a placement the validator refuses is not a candidate". Add the families before enabling that feature, or add a parity test that fails if generated rows carry a faculty id.

### Low

- **F8. `validateSplits` auto-resolver is dead code.** `POST schedules/batch/validate-splits` (`ScheduleController.php:637`, about 400 lines including slot-shift, day-swap, and room-swap) has no caller in `wicars-ui`, only an authorization test. It also silently moves sessions to different times or days and returns `ok`, which would surprise a user if it were ever wired up. Remove it, or if it is kept, return the adjustments as explicit suggestions.
- **F9. Client pre-check has gaps.** `useConflict.checkConflict` lacks `subject_section_time_conflict` and reports only the first conflict. It also works from the loaded `schedules` list, which is department-scoped and capped (see the `/initial-data` 500-row cap), so cross-department room and faculty clashes appear only after the server refuses the save. This is acceptable as advisory, but the grid should not show a "Place" hint as a guarantee.
- **F10. Part-time availability requires a single covering window.** `InstructorAvailabilityRule.php:54` refuses a 09:00–11:00 class when availability is stored as 08:00–10:00 plus 10:00–12:00. Merge adjacent or overlapping windows before the containment test, and mirror the change in `isPartTimeOutsideAvailability`.
- **F11. Messages report only the first clash.** `section_conflict` and `room_conflict` use `->first()`. The faculty rule already lists all clashes. Doing the same for section and room would let the UI show everything that must move.

---

## 4. Recommended order of work

1. **F1** (small, isolated, user-visible false refusals): switch to the sweep in PHP and TS, and add a regression test.
2. **F2 + F3** (data and policy): clamp `max_concurrent_classes`, add the migration, and align the field-room scope. Then add a parity test that feeds the same fixtures to `RuleEngine`, `BatchConflictValidator`, and the kernel and asserts identical rule ids. That test would have caught F1–F3 and will prevent the next drift.
3. **F4** (recommendation stability): select by `plan_id`.
4. **F5** (recommendation quality and speed).
5. **F6, F7**, then the low-severity items as convenient.

The long-term fix for this class of bug is architectural. The rule engine's capacity rules should call the same predicates the kernel uses (`SchedulingConstraintPredicates`), so each capacity rule has one implementation. Today each layer re-implements them, and the report above is the result.
