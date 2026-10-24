# Recommendation Engine — Phase 4 Review

Reviewed 2026-10-08 against `docs/recommendation_engine_integration_plan.md` section 8 (Phase 4 exit gate) and section 17 (implementation evidence). HEAD `a109a72`. No application code was modified by this review.

**Verdict: NEEDS FIXES.** M1 is a Medium regression: "Add a Preferred Day" and "Allow Friday + Saturday" can no longer be applied after a selected-sections run. L1 is a Low text regression. The server interpreter, authorization, sync/queue compatibility and automatic-retry behavior all check out.

## Scope reviewed

Phase 4 was isolated with the implementer's entry snapshot (`%TEMP%/wicars-phase4-sf1z622_`). Its before-images match the recorded entry hashes. Of the 3,081 hashed paths, exactly the 15 claimed files changed and none were removed. HEAD and the staged diff are unchanged. All diffs below were rebuilt from the before-images rather than taken from the implementer's saved diff.

- **Backend (new):** `GenerationAdjustmentInterpreter`, `GenerationRecommendationPolicy`.
- **Backend (changed):** `ScheduleRecommendationController` (`prepareYearLevelConfigs`, `selected_adjustments`), `YearLevelScheduleGenerationService`, `YearLevelGenerationDiagnostics`, `ValidateGenerationConfiguration`, `RecommendationResult`.
- **Tests:** `GenerationAdjustmentInterpreterTest`, the `GenerationAdjustmentCases.json` fixture, and `YearLevelGenerationFailureDiagnosticsTest`.
- **UI:** `YearLevelGenerateScheduleWorkflow`, `yearLevelGenerationFailure`, `recommendationGroups`, their tests, and the new `generationAdjustmentParity.test.ts`.
- **Docs:** `architecture.md`, `business_rules.md`, plan section 17.
- **Excluded:** earlier phases' uncommitted work, and plan section 18. Section 18 is a plan-only Phase 5 scope revision, written at 09:36 after Phase 4 finished at 09:26.

## Confirmed correct

- **Authorization.**
  - The department guard and writable-program section filter run before any interpretation.
  - The interpreter rejects sections outside the authorized run and courses outside the resolved `course_ids`.
  - Each batch is re-resolved through `GenerationCourseSelection` before preflight, so a stale eligibility value is rejected.
  - Invalid batches create no run, job or schedule. The negative feature tests cover this.
- **Compatibility.**
  - Requests without a selection get unchanged responses.
  - The legacy missing-configuration message is kept. Queue responses add `applied_adjustments` only when a selection was sent.
  - Old jobs that lack `_selected_adjustments` read as empty. No job constructor, route, schema or save path changed.
  - Nothing iterates or hashes config keys, so the new key has no side effects.
  - `ValidationException` propagates through `DepartmentCourseRules::withOverride`'s `finally` block.
- **Retries are unaffected.** Automatic retries still run only strategies with no adjustments (`YearLevelScheduleGenerationService.php:245-248`), so `applyAdjustments` now always receives `[]`. Planner strategies with adjustments are still offered to the user as `strategy-*` recommendations.
- **No double application.**
  - The draft path overwrites `applied_adjustments` only after `decorateDraftResult` has set it to `[]`.
  - The UI renders the server's `generation_changes`. Selected operations are display-only and are never re-applied.
- **Policy extraction is faithful.** The moved construction code is textually identical to the removed bodies. The one exception is the documented incomplete-search wording.
- **Interpreter semantics match re-resolution.** Every Hybrid-split-eligible course is also balanced-split-eligible, so disabling Hybrid Split never fails the eligibility re-check.
- **Guidance labelling improved.** `isApplicableRecommendation` now treats unsupported types (`clear_forced_day`, `remove_course`) as guidance. Before, they showed an Apply button that did nothing.

## Findings

| ID | Severity | File / line | Finding | Required fix |
|---|---|---|---|---|
| M1 | **Medium (regression)** | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/YearLevelGenerateScheduleWorkflow.tsx:1088`; `.../yearLevelGenerationFailure.ts:308` | **Year-level recommendations can't be applied after a selected-sections run.** See the M1 details below the table. | See the M1 details below the table. |
| L1 | Low (regression) | `backend/app/Services/Scheduling/YearLevel/YearLevelGenerationDiagnostics.php:281` | **Corrupted dashes in a user-visible message.** The `TYPE_LIMITED_ROOMS` detected cause was re-encoded: each `—` became `â€”`. The text is shown as the failure headline (`RecommendedAdjustmentPanel.tsx:63`). No test asserts it. | Restore both `—` characters (or use plain hyphens). Save the file as UTF-8. Optionally assert the message in the diagnostics test. |
| I1 | Info | `docs/recommendation_engine_integration_plan.md:899` | The section 17 text lost its curly quotes: `?Tick at least two days?` / `?Pick at least two days.?`. | Optional: restore the quotes. |

### M1 details

**What happens.** The workflow keeps `configs` for every section in the year level. A selected-sections run sends only `targetSections`. The server therefore builds its preferred-day advice and its Friday/Saturday strategy for the targeted sections only.

`applyRecommendationAndRetry` then checks those operations against the full `configs`. The new year-level coverage check throws "A year-level adjustment must include every configured section". The user sees "Cannot Apply", and refreshing returns the same recommendations. "Apply all" fails the same way whenever one of these recommendations is in the batch. The server is correct here: it checks coverage against the run's own sections (`GenerationAdjustmentInterpreter.php:76`).

**Probe** (current helper vs the entry before-image; `configs` = sections 5 and 6; run scope = section 5):

| Recommendation | Entry | Phase 4 |
|---|---|---|
| `add_preferred_day` for [5] | Applied | Throws |
| `enable_friday_saturday_split` for [5] | Applied | Throws |
| Same, with `configs` scoped to section 5 | Applied | Applied |

**Required fix.**
1. Run the preview/coverage check against the configs of the run's sections, i.e. the sections of the result being acted on (`targetSections`). Merge the previewed changes back into the full `configs` for local state.
2. Keep the server check as it is.
3. Add a workflow test: a selected-sections run that fails and offers a year-level recommendation. Applying it must send `section_ids`, the original target configs, and `selected_adjustments`.

## Verification run for this review

All database checks used `APP_ENV=testing`, SQLite `:memory:`, empty `DB_URL`, array cache/session stores, and no cached config. Development data was not touched.

| Check | Result |
|---|---|
| Full backend suite (`php artisan test`) | **1,070 passed, 6,524 assertions, 209s.** Matches section 17. |
| UI: all `GenerateSchedule` tests + `useGenerationRun` | **187 passed, 1 failed (188, 18 files).** The failure is the known `SetupCoursesStep` "Tick/Pick" copy assertion. |
| ESLint on the 7 Phase 4 UI files | Workflow: 10 `set-state-in-effect` + 3 `refs` errors, identical to the entry copy (linted via stdin). Other files are clean. Nothing new. |
| `npm run build` | Fails only on the known 34 errors (`Reports.tsx` 33, `SecretaryDashboardPage.tsx` 1). No Phase 4 file has errors. |
| Pint `--test`: interpreter, policy, result, validator, diagnostics, unit test | Passed |
| Pint `--test`: controller, generation service, feature test | Fails. The fixer categories are identical on the entry copies, so this predates Phase 4. |
| PHP syntax (9 files) | Passed |
| Scope / hashes / HEAD / removed files | 15 changed + 5 new files; no removals; HEAD and staged diff unchanged; no review artifacts left in the checkout. |
| Scratch probes (outside the checkout) | M1 reproduced as above. Encoding scan found L1 only. |

## Existing failures vs regressions

- **Regressions introduced by Phase 4:** M1 and L1.
- **Existing (not Phase 4; files match entry hashes):**
  - The `SetupCoursesStep` copy assertion ("Tick" vs "Pick"). `ConfigureClassSidebar.tsx` and the test are unchanged.
  - The UI build errors in `Reports.tsx` and `SecretaryDashboardPage.tsx`.
  - The workflow lint errors.
  - The Pint categories in the controller, service and feature test.

## Handoff to Sol

Fix M1, with a selected-sections regression test, and L1 before starting Phase 5. Section 18 also requires this. I1 is optional. Keep the server interpreter's scope and coverage checks unchanged; the fix belongs in the UI's choice of preview scope. Re-run the affected UI suite, the generation endpoint tests and the full isolated backend suite afterwards.
