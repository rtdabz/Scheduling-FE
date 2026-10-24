# Recommendation Engine — Phase 6 Review

Reviewed 2026-10-09 against `docs/recommendation_engine_integration_plan.md`:

- section 8 (the Phase 6 steps and exit gate),
- section 20 (the implementation evidence).

HEAD is `a109a72`. This review did not modify any application code or tests.

**Verdict: NEEDS FIXES.** The phase is functionally sound:

- Authorization, apply-one-at-a-time and the group checks all hold.
- The full backend suite passes.

Two Low regressions in Draft Review are confirmed by probes against the entry snapshot. Both are small, contained fixes.

## Scope reviewed

The phase was isolated with the implementer's entry snapshot (`%TEMP%/wicars-phase6-nucluc9y`). I recomputed all 3,088 entry hashes against the checkout:

- Exactly the 20 claimed files changed, and `SessionAlternatives.tsx` and its test are new.
- Nothing was removed and HEAD is unchanged.
- The staged diff matches the saved `index.diff` (same SHA-256).

I rebuilt every diff from the before-images. I did not use the implementer's saved diff.

- **Backend:**
  - `SessionAlternativePolicy::enhancement`
  - `PlacementRecommendationProvider` (`sessionEnhancements`, the manual opt-in, `allowed_days`, `allowed_pairs`, the probe deadline, row templates)
  - `GenerationRecommendationProvider::sessionEnhancements`
  - `GenerationAdjustmentInterpreter` (the two new operations and the mixed-batch refusal)
  - `YearLevelScheduleGenerationService` (draft computed before recommendations; probe inputs)
  - `ScheduleRecommendationController` validation
- **UI:**
  - `SessionAlternatives.tsx`
  - `DropModal.tsx`
  - `yearLevelGenerationFailure.ts`
  - `recommendationGroups.ts`
  - `RecommendationList.tsx`
  - `generationGuideContent.ts`
- **Tests:**
  - `PlacementRecommendationGroupTest`
  - `YearLevelGenerationFailureDiagnosticsTest`
  - `SessionInterpretationTest`
  - `GenerationAdjustmentCases.json`
  - `DropModal.test.tsx`
  - `SessionAlternatives.test.tsx`
  - `RecommendedAdjustmentPanel.test.tsx`
- **Docs:** `architecture.md`, `business_rules.md`, plan section 20.
- **Excluded:** earlier phases' uncommitted work and unrelated staged changes.

## Confirmed correct

- **Authorization.**
  - The manual opt-in reuses `availableSlots`, so these checks run before the probe:
    - `departmentGuard`;
    - server-derived section, course and department on `placement.rows`;
    - the foreign `ignore_schedule_ids` refusal.
  - Generate adjustments go through `prepareYearLevelConfigs`. It re-resolves `GenerationCourseSelection` and returns 422 when eligibility drifts.
  - `balancedSplitEligible` is the same predicate in the policy and in `resolveMinorSplitCourseIds`.
  - No routes, permissions, schema or writes were added.
- **The probes are read-only and bounded.**
  - The original shape is tested first. An enhancement is offered only when the original has no placement and the complete replacement group passes the finder and the group validator.
  - The deadline is checked before each finder call and seed. An expired deadline returns `[]`.
  - Generate inspects at most four targets, and the deadline is clipped to the run's draft deadline.
  - Moving `bestEffortDraft` ahead of `recommendations()` is safe. `suggestedPreferredDay` and the diagnostics read no draft state.
  - The generation snapshot already leaves out the target sections' own rows, so the partial-draft occupancy is not double-counted.
- **Day rules.**
  - Required Day is enforced per row by `MeetingDayConstraints`. Manual's single-day `allowed_days` is therefore consistent with the kernel.
  - Generation Preferred Days are hard `allowed_days`. The probe treats them as hard, which matches the generator.
- **`set_integrated_hybrid` stays scoped to its target.**
  - It sets the section `is_hybrid` flag, but that flag is already forced true whenever any Integrated course is selected (`resolvedHybridMode`).
  - Hybrid status is still per course, via `isIntegratedOnSite` (`CspSolver.php:1507`).
- **Applying options.**
  - Server and UI interpreters both reject any batch that mixes an enhancement with another adjustment.
  - UI Apply all is hidden when a selected option is an enhancement, and per-group Apply remains.
  - The workflow sends the original configs plus only the chosen adjustments (`YearLevelGenerateScheduleWorkflow.tsx:1139`).
- **Manual staging.**
  - It matches the existing Integrated convention: lab is day 1, `modalIsHybrid`, and the `days:` pattern used by `handleIntegratedToggle`.
  - Remounting on `requestKey` discards stale witnesses.
  - Abort, loading, empty and error/retry states are present.
- The docs describe the shipped behavior accurately.

## Confirmed issues

| ID | Severity | File / line | Issue |
|---|---|---|---|
| L1 | Low (correctness/UX) | `backend/app/Services/Scheduling/Recommendations/Providers/PlacementRecommendationProvider.php:135` (with `:119-133`, `SessionAlternativePolicy.php:36`) | **Draft Review shows the same "Online (All)" option twice.** |
| L2 | Low (performance) | `PlacementRecommendationProvider.php:135`, `:181-185` | **Draft Review repeats the original-shape search for every Regular or Integrated issue, even when the configured shape already fits.** |

### L1: duplicate "Online (All)" in Draft Review

**Issue.**

- `groupOptions` already adds the legacy "Online (All)" alternative when a lecture-only class has no configured placement (`:119-133`).
- Phase 6 now prepends the Regular Online enhancement, which has the same label and the same half-length online meetings.
- When the class's duration equals its unit minutes, both produce identical rows.
- The Draft UI does not read `adjustment_type`, so users see two identical cards. The duplicate also takes one of the five option slots.

**Probe** (scratch test outside the checkout; 2-unit Regular Online course, only Mon/Wed 07:00–08:00 free):

| Code | Draft Review options |
|---|---|
| Entry snapshot | `Online (All)` Mon/Wed 07:00–08:00 online |
| Phase 6 | `Online (All)` (enhancement) **and** `Online (All)` (legacy), both Mon/Wed 07:00–08:00 online |

**Required fix.** In `groupOptions`, drop one of the two. Either:

- skip the legacy Online (All) alternative when an `enable_balanced_split` online enhancement was returned, or
- de-duplicate alternatives that have identical rows.

Keep exactly one.

**Verification.** Add a Draft Review regression test with the scenario above. Assert that exactly one "Online (All)" option is returned, and that the existing enhancement tests still pass.

### L2: redundant original-shape search in Draft Review

**Issue.**

- `groupOptions` calls `sessionEnhancements` for every issue, whether or not `$configured` is empty.
- `sessionEnhancements` then runs another full `shapeOptions` search on the original shape (`:181-185`), only to return `[]` when it fits.
- With no preferred days the two searches are equivalent, so the second is pure overhead. It applies to every Regular or Integrated issue, up to 40 per review, each bounded only by a 2-second deadline.
- Phase 6 measured performance only for Manual refresh. Draft Review timing was not measured.

**Probe** (10 issues whose configured shape fits; 15 rooms; 318 bookings; median of 3 runs; two separate processes each):

| Code | Median | Enhancement options returned |
|---|---:|---:|
| Entry snapshot | 2,290 ms / 2,278 ms | 0 |
| Phase 6 | 2,937 ms / 2,817 ms | 0 |

That is about 25% slower (+55–65 ms per issue) with no new output. A smaller fixture showed the same direction (223–257 ms versus 327–396 ms).

**Required fix.** Do not repeat the original search when Draft Review's configured search already found placements. Either:

- call `sessionEnhancements` only when `$configured` has no option within the preferred days, or
- pass the configured result in so the probe can skip its own original-shape check.

**Verification.**

- Re-run the probe above. Phase 6 should be within noise of the entry median.
- The fragmented-time tests should still return enhancements:
  - `test_fragmented_regular_enhancements_are_shared_and_save`
  - `test_integrated_enhancement_changes_only_lecture_delivery_and_needs_a_lab`
- Add an assertion that a configured-fits issue returns no `adjustment_type` option.

## Regressions

- L1 and L2 are regressions against the entry snapshot (probe evidence above).
- No test, type, lint or style regressions:
  - Full isolated backend suite: **1,089 passed, 6,764 assertions** (SQLite `:memory:`, array cache/session, no config cache).
  - Focused Phase 6 backend tests: 46 passed.
  - Affected UI folders (GenerateSchedule, Modals): 254 passed, 1 failed. The failure is the baseline test below.
  - TypeScript: no errors in Phase 6 files.
  - ESLint: no new findings.
  - PHP syntax passes on all 9 touched files, and Pint passes on the 6 checked.

## Pre-existing failures (not caused by Phase 6)

- `SetupCoursesStep.test.tsx`: "Tick at least two days" versus "Pick at least two days" (wording test; file not touched).
- 34 TypeScript errors: `Reports.tsx` (33) and `SecretaryDashboardPage.tsx` (1).
- 3 ESLint `set-state-in-effect` errors in `DropModal.tsx:318`, `:367`, `:373`, outside the Phase 6 hunks.
- Info: Draft Review's configured search ranks Preferred Days softly (`scoreSlot`), while generation treats them as hard `allowed_days`. This predates Phase 6. The new enhancement check correctly uses the hard meaning.

## Optional improvements

- **O1.** The Generate probe hard-codes MW, TTh and Fri–Sat pairs (`GenerationRecommendationProvider.php:101`). When allowed days rule out MW and TTh, the solver falls back to other spaced or adjacent pairs (`CspSolver.php:2705-2721`), but the probe does not. The result is a missed option only, never an invalid one. Reusing the solver's pair derivation would align them.
- **O2.** A Required Day in Manual excludes every two-day enhancement. This is consistent with the per-row rule, but the empty-state text could say that the Required Day is the reason.

**NEEDS FIXES** — confirmed issues must be fixed before continuing.
