# Recommendation Engine — Phase 5 Review

Reviewed 2026-10-08 against `docs/recommendation_engine_integration_plan.md`:

- section 8 (the Phase 5 steps and exit gate),
- section 18 (the revised scope),
- section 19 (the implementation evidence).

HEAD is `a109a72`. This review did not modify any application code.

**Verdict: PASS.** There are no correctness, authorization or compatibility regressions:

- The retired endpoint keeps its guards.
- Manual assignment still refuses overlaps and ceilings.
- Conflict options keep the instructor, check the complete group, and save exactly the rows they preview.

L1 is a Low test-coverage gap. Two of the new linked-group tests cannot fail on the path they are named for. Fix it before Phase 6. I1 and I2 are informational.

## Scope reviewed

The phase was isolated with the implementer's entry snapshot (`%TEMP%/wicars-phase5-fkxtn8ju`). I recomputed all 3,087 entry hashes against the checkout:

- Exactly the 20 claimed files changed, the 2 claimed files were deleted, and the 2 claimed UI tests are new.
- HEAD is unchanged.
- The staged diff matches the saved `index.diff` (same SHA-256).

I rebuilt every diff below from the before-images. I did not use the implementer's saved diff.

- **Backend:**
  - `InstructorAssignmentController::recommendations` (now a 410 response)
  - `AppServiceProvider`
  - `RecommendationSource`
  - `ConflictRecommendationProvider`
  - `ConflictRecommender`
  - `SameTimePartnerMover` (new `groupPartnersFor` and `project`)
- **Deleted:** `InstructorRecommender.php`, `Providers/InstructorRecommendationProvider.php`.
- **Tests:**
  - `ScheduleConflictResolutionTest`
  - `InstructorConflictBlockTest`
  - `FacultyUnitCeilingTest`
  - `FacultyTeachingHistoryTest`
  - `RecommendationEngineRegistrationTest`
  - `conflicts.test.ts`
  - new `FacultyModal.test.tsx` and `ResolveConflictModal.test.tsx`
- **UI:** `conflicts.ts`, `InstructorAssignment.tsx`, `FacultyModal.tsx`, `ResolveConflictModal.tsx`.
- **Docs:** `architecture.md`, `business_rules.md`, `decisions.md`, plan section 19.
- **Excluded:**
  - uncommitted work from earlier phases;
  - section 18, which was a plan-only edit;
  - unrelated staged and unstaged faculty/UI work.

## Confirmed correct

- **Retirement and authorization.**
  - The retained `GET instructor-assignments/{schedule}/recommendations` route is still under `capability:schedule.assign_instructor`.
  - `userCanManageInstructor` applies the teaching department and program checks before the 410 response. The 410 carries `code: instructor_recommendations_retired` and `options: []`. The route no longer loads faculty or calls the engine.
  - Tests cover 401, three 403 cases (no capability, outside department, wrong program head) and the 410.
  - Caller searches find no remaining reference to the ranker, the provider, `RecommendationSource::Instructor` or `fetchInstructorRecommendations`.
  - The enum value is never read back from storage. Other `instructor_assignment` strings are activity-log categories and are unrelated.
- **Manual assignment is preserved.** These tests pass:
  - overlap refusal, including the old `override_conflicts` flag;
  - ceiling refusal followed by a valid selection;
  - assigning and clearing an instructor;
  - archived teaching history.

  The teaching department of a delegated course now gets `options: []`, but it can still resolve the conflict with a manual `reassign_instructor` call. `AutoAssignModal` and the shared `RecommendedOptionList` are untouched.
- **Conflict ranking is unchanged** apart from the removed instructor bucket:
  - action scores, ordering, `PER_BUCKET = 2`, `MAX_VALIDATIONS = 60` and the per-schedule budget split;
  - the Consecutive Days exclusion;
  - authorization of each action after the engine, and the final ranks.
- **Preview/save parity.**
  - `move()` now gets its partner rows from `project()`, so previews and saves use the same projection.
  - The locked-partner refusal now runs before any partner write. Before, it ran after the first partner update, inside the transaction. The new order is strictly safer, and the messages are unchanged.
  - Saved rows equal `group_rows`, both by test and by reading the code.
  - Probe: with the partner's instructor booked Wednesday 09:30–10:30, the Monday 10:00 move disappears.
  - On an on-grid fixture:
    - room-only options appear when the partner has no clash and are removed when it has one;
    - with a locked partner, every remaining option keeps `affected_schedule_ids = [target]`.
- **Response compatibility.**
  - `group_rows` and `affected_schedule_ids` are additive.
  - `verified_group`/`affected_meeting_group` matches the Manual and Draft providers.
  - `group_rows` appears only on options the caller is authorized to apply.
- **UI.**
  - The suggestion effect, state, props and type are removed. No dangling imports remain, and the changed files have no TypeScript errors.
  - The rollout filter drops `reassign_instructor` options and preserves the order of the rest.
  - The empty state no longer says that no fix exists.
- **Docs** describe the shipped behavior accurately.

## Findings

| ID | Severity | File / line | Finding | Required fix |
|---|---|---|---|---|
| L1 | Low (test coverage) | `backend/tests/Feature/ScheduleConflictResolutionTest.php:883`, `:866`, `:846` (fixture `:938`) | **The new linked-group tests do not reach the room-only and locked-partner paths.** See below. | See below. |
| I1 | Info (design) | `backend/app/Services/Scheduling/Schedule/ConflictRecommender.php:263-268` | A kept partner's unrelated conflict hides fixes that the resolver would accept. This is plan-consistent (section 4: *"all proposed and kept affected meetings pass"*). | None in Phase 5. Product call before Phase 6. |
| I2 | Info (copy) | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/Modals/ResolveConflictModal.tsx:399` | The empty-state text points every user to "Instructor Assignment", including for room and section conflicts and for users without `schedule.assign_instructor`. | Optional: tailor the text to the conflict rule and the user's capability. |

### L1 details

**Cause.** `linkedConflict()` puts the pair at 08:00–09:30. `AvailableSlotFinder` steps 90-minute meetings in 90-minute increments from 07:00 (07:00, 08:30, 10:00 …), so the finder can never offer the target a same-time slot.

**Effect on each test.**

- **Kept-partner room-only test (`:883`) cannot fail.** The target gets only move options with or without the partner's clash. It would still pass if kept-partner validation were removed.
- **Locked-partner test (`:866`) asserts nothing.** The target returns zero options, so the loop runs zero times. The test only proves that no locked partner is moved; it would also pass if the target got no options at all.
- **`assertNotSame('09:30', …)` (`:846`) can never fail.** 09:30 is off the grid. The slot the booking actually removes is 10:00. This test is still effective overall, because its save loop would reject a wrong partner move.

**Probes** (scratch copy outside the checkout; current code):

| Fixture | Target options |
|---|---|
| Test fixture 08:00, room conflict, no partner clash | move ×2 only (no room options) |
| Same, partner has an unrelated clash | move ×2 only (identical) |
| Test fixture, partner `approved` | 0 |
| On-grid 07:00–08:30, no partner clash | change_room CFL202, CFL203; move ×2 (affects target + partner) |
| On-grid, partner has an unrelated clash | move ×2 only (room options correctly removed) |
| On-grid, partner `approved` | change_room ×2; move ×2 to the same time on another day; all `affected_schedule_ids=[target]` |

**Required fix** (tests only):

1. Give these tests an on-grid pair, for example 07:00–08:30 with the blocker at the same time.
2. For the kept-partner test, assert that a target `change_room` option exists before the partner clash is added and is absent afterwards.
3. In the locked-partner test, assert that the target has options and that at least one of them leaves the partner unchanged.
4. Change the `09:30` assertion to the start time the booking actually removes (10:00). Alternatively, assert that no projected partner row overlaps the instructor's Wednesday booking.

### I1 note

Probe on the on-grid fixture:

- The partner has a section clash with an unrelated class.
- The target's room conflict could be fixed by moving to CFL202, but that option is hidden.
- Posting the same `change_room` directly to `/resolve` returns **200 resolved**.

The preview is therefore stricter than the resolver. This produces no false positives, but it offers fewer options than before Phase 5.

This follows the plan's `verified_group` definition. Decide in Phase 6 whether kept rows should reject only violations that the change introduces.

## Verification run for this review

All database checks used `APP_ENV=testing`, SQLite `:memory:`, an empty `DB_URL`, array cache and session stores, and no cached configuration. Development data was not touched.

| Check | Result |
|---|---|
| Full backend suite (`php artisan test`) | **1,076 passed, 6,612 assertions, 149s.** Matches section 19. |
| Focused: conflict resolution, instructor block, unit ceiling, teaching history, registration | **61 passed, 351 assertions** |
| UI: affected modals, conflicts, worklist, faculty eligibility, hooks, `RecommendedOptionList`, Phase 4 workflow | **222 passed (20 files)** |
| UI: full suite | **938 passed, 3 failed (941).** All 3 failures are existing; see below. |
| ESLint, 7 affected UI/test files (entry copies linted via stdin) | One `set-state-in-effect` error in each of `InstructorAssignment` and `ResolveConflictModal`, identical at entry. The other files are clean. |
| `tsc -b` | **34 errors:** `Reports.tsx` 33, `SecretaryDashboardPage.tsx` 1. Both files match their entry hashes. None of the errors is in a Phase 5 file. |
| PHP syntax (11 files) | Passed |
| Pint `--test` (11 files) | 10 pass. `SameTimePartnerMover` fails with the same 5 fixer categories as its entry copy. |
| Timing: implementer's fixture, entry vs current, same session (medians, 11 samples) | single 91 → 111 ms; linked 169 → 131 ms; linked + 300 rows 273 → 202 ms. Options 4/4, 2/4, 2/4. Consistent with the section 19 claim. |
| Scope: hashes, HEAD, staged diff, review artifacts | As stated in Scope reviewed. The probes and the timing run stayed outside the checkout. |

## Existing failures vs regressions

- **Regressions introduced by Phase 5:** none. L1 is a coverage gap, not a behavior defect.
- **Existing (not Phase 5; every file matches its entry hash):**
  - `SetupCoursesStep` "Tick/Pick" copy assertion.
  - Two `Departments.test.tsx` cases fail deterministically: "Department code" and "CIT · Dean" text not found. Section 19 did not record them because it ran only affected UI subsets.
  - The UI build errors in `Reports.tsx` and `SecretaryDashboardPage.tsx`.
  - The two `set-state-in-effect` lint errors.
  - The `SameTimePartnerMover` Pint categories.

## Handoff to Sol

Fix L1 before starting Phase 6. It is a test-only change:

- Give the room-only and locked-partner tests an on-grid fixture with positive controls.
- Correct the `09:30` assertion.

Then re-run `ScheduleConflictResolutionTest` and the full isolated backend suite.

Keep the following unchanged:

- the 410 guard;
- the rollout filter;
- the shared `project()` path;
- the kept-row validation.

Unless the user decides otherwise in Phase 6, I1 stays as designed. I2 is optional.
