# Recommendation Engine — Final Review (Phases 0–7)

Reviewed 2026-10-09 against `docs/recommendation_engine_integration_plan.md`:

- sections 1–11 (objective, contracts, session policy, application rules),
- sections 21–22 (cutover, gate closure and the O1/O2 improvements),
- the Phase 1–6 independent reviews and their recorded follow-ups.

HEAD is `a109a72`. This review did not modify application code or tests. Nothing was committed, pushed or deployed. The only file added is this review.

**Verdict: NEEDS FIXES.** There is one Low UX regression (L1), introduced by the gate-closure DropModal lint refactor. The fix is small and UI-only.

The rest of the integration checks out:

- shared ownership, and Manual/Draft/Generate consistency,
- session and delivery rules, authorization and save workflows,
- the compatibility adapters, and both O1 and O2.

The full backend suite, the full UI suite and the production build all reproduce the section 22 results.

## Scope and baseline

- **Tree matches the closure snapshot.** I recomputed every tracked or unignored file hash against `wicars-phase7-close-hk00u_wq/final-hashes.json`:
  - 3,094 paths, 0 differences.
  - The staged diff is byte-identical to `index.diff`, and HEAD is unchanged.
  - Section 22's evidence therefore applies to the code reviewed here.
- **`closure.diff` covers 19 files.**
  - **Recommendation-relevant:** `CspSolver`, `GenerationRecommendationProvider`, `SchedulingPolicy`, `PlacementRecommendationGroupTest`, `BalancedSplitDayPairsTest`, `DropModal` (with its test) and `SessionAlternatives` (with its test).
  - **Gate fixes unrelated to recommendations:** Reports, SecretaryDashboard, Departments, SetupCoursesStep, `initialDataMapper` and `types`.
- **Earlier phases.** I reviewed them through the final code at the integration points and through the prior reviews and follow-ups. I did not rebuild each earlier phase diff.

## Confirmed findings

| ID | Severity | File / line | Issue |
|---|---|---|---|
| L1 | Low (UX regression, closure) | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/Modals/DropModal.tsx:322-331` (with `:211-213`) | **The placement room filter resets to "All rooms" on every suggestion refetch.** |

### L1: room filter no longer survives a refetch

**Issue.**

- The new render-phase block clears `availableSlotRooms` whenever the serialized request key changes (`:328`).
- The render-phase check at `:211-213` then sees the selected room missing and resets `roomFilter` to `ALL_ROOMS`.
- The entry code behaved differently:
  - It cleared rooms only when suggestions were hidden.
  - It kept the filter across refetches.
  - It reset the filter only if the new response no longer contained that room.

**Impact.**

- The request key includes the current day, time, room and delivery. Any of these actions now discards the user's room filter while the panel stays open:
  - applying a placement from the list (`PlacementAlternatives.tsx:316`),
  - changing the duration or the delivery,
  - a schedule refresh.
- The panel stays open in two cases:
  - suggestions were requested explicitly ("Find better options", `:1096`), or
  - a conflict remains after the change.
- This is UX only. Ranking, eligibility, authorization and saving are unaffected.

**Probe** (scratch test outside the checkout). It used the same DropModal props as the existing harness. The mocked API returned both rooms on every call.

Steps: filter to room 11, apply a room-11 placement, then wait for the refetch.

| Code | Filter after refetch |
|---|---|
| Entry before-image | `11` (kept) |
| Current | `__all__` (reset) |

**Required fix.** In the request-key block, clear `availableSlotRooms` and `areSlotsTruncated` only when `activeRequestKey === null`. This matches the entry behavior. Keep these as they are:

- the other resets,
- `setIsSlotsLoading(activeRequestKey !== null)`,
- the abort guard.

An equivalent alternative is to skip the filter reset at `:211` while `isSlotsLoading` is true. Do not reintroduce `set-state-in-effect`.

**Verification.**

- Add a DropModal test covering both cases:
  - Filter to a room, apply a slot in that room, and have the refetch return that room. The filter must be kept.
  - Have a later response omit the room. The filter must reset to All rooms.
- Re-run `DropModal.test.tsx` and `SessionAlternatives.test.tsx`. This includes the stale-abort/loading test at `DropModal.test.tsx:396`.
- Re-run ESLint on `DropModal.tsx`, the full UI suite (serially) and `npm run build`.
- No backend re-run is needed.

No other confirmed issue was found.

## Verified behavior

- **Shared ownership.**
  - All eight `RecommendationSource` cases are registered as lazy, request-local factories (`AppServiceProvider.php:34-49`).
  - The engine rejects a result whose context differs from the request.
  - Manual slots, Draft Review, sync and queued year-level runs, and conflict recommendations all dispatch through the engine.
  - No application or UI reference remains to the removed manual ranker or to `InstructorRecommender`.
  - `reassign_instructor` survives only as the resolver's manual action and as a UI exclusion of generated options (`conflicts.ts:274`).
  - The instructor endpoint authorizes first, then returns the 410 tombstone.
- **Manual/Draft/Generate consistency.**
  - All three use `PlacementRecommendationProvider::sessionEnhancements` and `SessionAlternativePolicy::enhancement`.
  - Each tests the original shape first, then validates the complete replacement group.
  - Two differences are scope-justified and documented:
    - Generate restricts Split days to the solver's pair policy, so a regenerated run can reproduce the witness.
    - Manual and Draft Review save rows directly, so they allow any two distinct permitted days.
  - The Phase 6 L1/L2 guards hold: no duplicate Online (All), and the original-shape search is skipped when a selected-delivery configured fit exists inside the preferred days.
- **O1.**
  - A PHP token comparison of the entry and current `CspSolver` finds exactly one non-whitespace change: the extracted pair derivation, now `SchedulingPolicy::balancedSplitDayPairs`.
  - Both `dayIndex` implementations are equivalent.
  - The fallback condition is the same in the solver and the probe. Both normalize `allowed_days` (controller `:602`, solver `:388`), so "explicit Preferred Days" means the same thing.
  - Sunday comes from department settings in both, and Required Day still suppresses the option.
  - Six data-provider cases cover the change; the four positive cases also save their witness through the batch route.
- **O2.**
  - `forced_day_rules` maps each course ID to a day, department-wide (`SchedulingSettingsController.php:397-418`).
  - The server enforces the persisted Required Day per row, so preferring it over the modal's local Force Day is correct.
  - The message appears only after a successful empty response. An error hides it.
  - Every enhancement uses two distinct days, so the explanation is accurate.
- **Session and delivery rules.**
  - The policy excludes field, laboratory-only, consecutive, already-split, odd-length and over-ceiling cases.
  - Integrated Hybrid requires an on-site major lecture+lab course and keeps the lab on site.
  - Enhancements keep `requires_regeneration` / `complete_timetable_verified: false` semantics.
- **Authorization.**
  - `departmentGuard` checks the payload department, program existence and section writability.
  - The following return 422: foreign `ignore_schedule_ids`, mismatched run or duration, and draft rows outside the department's sections.
  - Conflict options are filtered per action.
  - Generate adjustments re-resolve course selection and return 422 on drift.
- **Save workflows.** None changed in Phase 7 or the closure.
  - Manual stages a complete group into the existing save.
  - Draft Review replaces whole-class rows.
  - Generate applies one enhancement at a time; the interpreter rejects mixed batches (`GenerationAdjustmentInterpreter.php:44-46`).
  - Conflicts go through `ResolveScheduleConflict`.
- **Compatibility adapters.**
  - Selection metadata v1 is opt-in from the year-level service only. The UI falls back to `legacyPriority` when the version is absent or unknown.
  - The raw-slot adapter, the legacy Split provider, `validate-splits` and the tombstone are retained, as section 21 documents.

## Checks performed

All database checks used `APP_ENV=testing`, SQLite `:memory:`, an empty `DB_URL`, array cache/session stores and a sync queue. No config cache was present, and no development database was touched.

| Check | Result |
|---|---|
| Tree vs closure `final-hashes.json`; staged diff; HEAD | 0 differences across 3,094 paths; `index.diff` identical; HEAD `a109a72` |
| Full isolated backend suite | **1,102 passed, 6,851 assertions**, 152.77 s (matches section 22) |
| Full UI suite (run alone) | **960 passed, 115 files**, 121.49 s (matches section 22) |
| `npm run build` | Passes TypeScript and Vite (built in 12.84 s) |
| ESLint, all 11 closure UI files | Clean |
| PHP syntax and `pint --test`, all 5 closure PHP files | Pass |
| `CspSolver` token comparison (entry vs current) | Only the pair-derivation extraction differs |
| Room-filter probe (entry vs current, scratch) | Confirms L1 |

## Remaining limitations

- No independent review of Phase 7 or the closure existed before this one. Earlier phases rely on the Phase 1–6 reviews plus inspection of the final integration points.
- No new latency measurement was taken. The closure's only search change, O1, adds pairs only when Preferred Days exclude every standard pair, and it stays inside the existing four-target, two-second probe budget.
- UI behavior was checked in jsdom, not in a browser. The L1 probe is a scratch test and was not added to the repository.

## Regressions, existing issues and optional improvements

**Regressions:** L1 only.

**Existing issues (not caused by the closure; keep separate):**

- Phase 3 I1: `placement.consecutive_rule.meeting_days` is not checked against `day_count` (`ScheduleRecommendationController.php:73-77`). A mismatch silently yields no options and writes nothing.
- Phase 5 I1 (by design): a kept partner's unrelated conflict hides fixes that the resolver would accept.
- Draft Review's configured search ranks Preferred Days softly (`PlacementRecommendationProvider.php:612-619`). Generate and the enhancement probe treat them as hard.
- Unrelated: the mojibake `Submittingâ€¦` at `SecretaryDashboardPage.tsx:701` is already present at HEAD.

**Optional improvements:**

- Phase 5 I2: tailor the conflict empty-state copy (`ResolveConflictModal.tsx:399`).
- `SetupCoursesStep.test.tsx:741` lost two spaces of indentation in the closure edit. This is cosmetic.
- Combined Apply all stays disabled until a combined timetable probe exists. This is plan policy, not a defect.

## Handoff for Sol

Fix L1 and add its regression test, then run the UI-only checks listed under its verification. Keep the following unchanged:

- the compatibility adapters,
- the selection-version fallback,
- the tombstone,
- one-at-a-time enhancement application.

Once L1 is fixed and verified, no confirmed issue remains in Phases 0–7.
