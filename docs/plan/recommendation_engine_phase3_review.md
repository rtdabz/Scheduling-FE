# Recommendation Engine — Phase 3 Review

Reviewed 2026-10-07 against `docs/recommendation_engine_integration_plan.md` section 8 (Phase 3 exit gate) and section 16 (implementation evidence). HEAD `a109a72`. No application code was modified by this review.

**Verdict: NEEDS FIXES.** M1 is a Medium latency regression in the interactive manual path and should be fixed before Phase 4. Correctness, compatibility and authorization checks passed. L1 and I1 are minor.

## Scope reviewed

The Phase 3 files were identified from section 16 and from modification times after the Phase 2 follow-up. Prior phases and unrelated dirty UI work were excluded. Where a diff against HEAD mixes in earlier uncommitted work, only the hunks section 16 claims were reviewed (for example, the summer-day and wording changes in `DropModal.tsx` are not Phase 3).

- **Backend:** `PlacementRecommendationProvider`, new `PlacementGroupValidator` and `ManualPlacementRanker`, `AvailableSlotFinder` (`rowTemplate`), `GenerationDraftReviewer`, `DraftRecommendationProvider`, `ScheduleRecommendationController::availableSlots`/`reviewDraft`, and `YearLevelScheduleGenerationService` (unplaced projection and `consecutive_rule`).
- **Tests:** `PlacementRecommendationGroupTest`, `ManualPlacementRankerTest`, `GenerationDraftReviewTest`.
- **UI:** `DropModal`, `PlacementAlternatives`, `placementAlternativesModel`, `courseSlotPlan`, `useScheduler` (helper move), `draftReview.ts`, and the new `draftReview.test.ts`.
- **Docs:** `architecture.md`.

## Confirmed correct

- **Authorization is intact.**
  - The capability/department guard still runs before snapshot capture.
  - Group rows can't carry an `id`. Section, course, semester, department, group ID and meeting index are all derived on the server.
  - `ignore_schedule_ids` belonging to another course or section are rejected with 422.
  - Run settings and the selected duration must match the rows.
  - Request-local consecutive rules are never persisted, and nothing in this phase writes data.
- **Compatibility is preserved.** Callers that omit `placement` get the unchanged legacy contract. Group fields are additive. The unplaced `consecutive_rule` field is optional, so older queued results stay readable. The `days:X-Y` pattern used for Integrated pairs matches the existing frontend and server convention (both use Monday as index 0). The edit-order helper move is byte-identical to the HEAD version. The draft test was extended with a data provider, not weakened.
- **Group validation is sound.**
  - Every candidate passes per-row kernel checks against partners and other occupancy, then `evaluateMeetingGroup`.
  - Faculty are captured department-wide by default, and no caller opts out, so cross-department instructors don't empty the results.
  - The draft path calls `groupOptions` directly, not through the engine, so there is no recursive dispatch.
- **Split-pair presentation is unchanged from HEAD.** I probed this specifically. For same-time pairs, `placements` contains only the selected meeting's own day, room and mode (`PlacementRecommendationProvider.php:236-240`), even though other-day and other-room pairs would save. HEAD's `PlacementAlternatives` already showed only the same-time pair-start picker for those pairs (its `isSplitPair` branch), restricted to the current days and rooms, so this is not a regression.

## Findings

| ID | Severity | File / line | Finding | Required fix |
|---|---|---|---|---|
| M1 | **Medium (regression)** | `backend/app/Services/Scheduling/Recommendations/Providers/PlacementRecommendationProvider.php:51`, `:219-222`, `:266`, `:290` | **Group-aware manual requests are 3–4× slower, and most of the added work is discarded.** See the M1 details below the table. | See the M1 details below the table. |
| L1 | Low | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/Modals/DropModal.tsx:361` | A new `react-hooks/exhaustive-deps` warning. The fetch effect reads `availableSlotsPayload` but depends on `requestKey`. It works because the key is the payload's JSON, but the dependency is invisible to the linter. The three `set-state-in-effect` errors in this file already exist at HEAD. | Make the dependency explicit: depend on a payload memoized by `requestKey`, or parse the key inside the effect. |
| I1 | Info | `backend/app/Http/Controllers/Scheduling/ScheduleRecommendationController.php:67-71`, `:198-202` | A request-local `consecutive_rule` can carry a `meeting_days` count that differs from `day_count`. That silently yields no options. There is no crash and nothing is persisted. | Optional: validate `count(meeting_days) === day_count` when both are present. |

### M1 details

**What happens.** When the modal sends `placement` (now on every modal refresh, after a 350 ms debounce), the provider does four things:

1. Runs the full legacy discovery (`:51`).
2. Runs a second full discovery on the scoped snapshot (`:219-222`).
3. Group-validates every discovered candidate (`:266`).
4. Builds the full draft-style catalog through `groupOptions` (`:290`). That means per-day finder scans for each meeting, plus Hybrid Split and Online (All) alternatives.

`DropModal` reads only `placements`, `best_matches`, `same_time_starts`, `placement_rooms` and `placement_truncated`. No frontend code reads `recommendations`, `placement_total` or the legacy `slots`.

**Measured** (isolated probe, SQLite `:memory:`, 15 rooms):

| Fixture | Legacy request | Group request |
|---|---|---|
| No other bookings | 80 ms | 254 ms (single meeting), 328 ms (pair) |
| 300 persisted rows, editing with ignored IDs | 0.38–0.60 s | 1.5–2.1 s |

Breakdown for the 300-row fixture:

| Stage | Cost |
|---|---|
| One discovery | ~370 ms (run twice) |
| Catalog `groupOptions` | ~430 ms (result unused by manual) |
| Group validation | ~0.54 ms per candidate (~350 ms for 654 candidates) |
| Snapshot rebuild | ~0.1 ms (negligible) |

Section 16 records no manual latency measurement. Phase 0 requires new provider work to be gated on measured timings.

**Required fix.**
1. In group-aware requests, run one discovery, and derive or keep the legacy fields from it rather than enumerating again.
2. Skip the catalog for manual requests, or compute it only when a caller asks for it. It can still be produced for parity tests and draft review.
3. Keep per-candidate group validation.
4. Re-measure the fixtures above and record manual latency in section 16. A reasonable target is under 1.5× the legacy request.

## Verification run for this review

| Check | Result |
|---|---|
| Full backend suite (`php artisan test`, `APP_ENV=testing`, SQLite `:memory:`, no cached config) | **1031 passed, 5730 assertions, 193s.** Matches section 16. |
| Scratch probes outside the repo (same isolation) | Split-pair presentation, latency and breakdown as reported above. Both hidden pair alternatives (Tue/Wed, and Monday in room 102) saved with 200. |
| UI: DropModal, PlacementAlternatives, model, draftReview, workflow, adjustment panel, courseSlotPlan | **75 passed (7 files)** |
| `npm run build` | Fails only in `SecretaryDashboardPage.tsx` (1) and `Reports.tsx` (33). No Phase 3 file has errors. |
| ESLint on Phase 3 UI files (current vs HEAD `DropModal`) | 3 `set-state-in-effect` errors existed at HEAD. The 1 `exhaustive-deps` warning is new (L1). |
| Pint `--test`: provider, validator, ranker, finder, reviewer, draft provider, 2 new tests | Passed |
| Pint `--test`: `ScheduleRecommendationController` | Fails. The identical fixer categories reproduce on the HEAD copy, so this predates Phase 3. |
| PHP syntax: recommendation classes and providers | Passed |

## Existing failures vs regressions

- **Regressions introduced by Phase 3:** M1 (latency) and L1 (new lint warning).
- **Existing (not Phase 3):**
  - UI build TypeScript errors in `SecretaryDashboardPage.tsx` and `Reports.tsx`.
  - The `set-state-in-effect` lint errors in `DropModal`.
  - Pint findings in `ScheduleRecommendationController`.

## Handoff to Sol

Fix M1, with recorded before-and-after manual latency, before starting Phase 4. L1 is a small change in the same area. I1 is optional. Keep the existing group-validation and authorization behavior unchanged while optimizing.

## Implementer response (2026-10-07)

The original independent verdict and findings above are preserved. This response records implementation verification of the Phase 3 fixes, not a second independent review. Details and fixture methodology are in [the integration plan, section 16](recommendation_engine_integration_plan.md#independent-phase-3-review-follow-up-2026-10-07).

- **M1:** group-aware Manual requests now run discovery once and reuse that result's raw slot fields/counts. They skip the unused catalog and retain an empty `recommendations` compatibility field. Draft Review and explicit service callers still obtain the existing shared catalog. Fixed occupancy and the invariant session count are prepared once per request; every proposed row and complete group still receive kernel validation. Internal Manual options describe the actual validated placements.
- **L1:** the request effect parses `requestKey` inside the effect. ESLint reports no new dependency warning; the same three existing `set-state-in-effect` errors remain. The equivalent-payload UI test passes alongside changed-data refresh coverage.
- **I1:** retained as optional input-validation work. Mismatched request-local counts yield no options and do not write a rule.

HTTP median timings, same 15-room isolated fixture before/after, one warm-up and 15 samples per request:

| Fixture | Before | After | After / legacy control |
|---|---|---|---|
| Empty / single | 187.20 ms | 72.87 ms | 1.94x |
| Empty / pair | 163.76 ms | 41.86 ms | 1.11x |
| 300 persisted rows / single | 1,224.09 ms | 571.19 ms | 1.48x |
| 300 persisted rows / pair | 1,166.89 ms | 380.81 ms | 0.92x |

The wasted discovery/catalog work is removed, with 53-74% lower group-request medians and unchanged candidate counts. **The empty single fixture remains above the suggested 1.5x comparison**, adding about 35 ms to validate all 864 groups. That measured performance limit is explicitly retained in the plan; the other fixtures meet the suggested comparison. These representative fixtures differ from the review's original 654-candidate probe and are not production SLA measurements.

Verification: **1,032 backend tests passed** on SQLite `:memory:`; the final group/ranker/draft/interpreter/finder subset passed **46 tests** after extending tentative-occupancy coverage; **76 affected UI tests passed**. PHP syntax and focused Pint pass. The UI build still fails only on the known 34 errors in `SecretaryDashboardPage.tsx` and `Reports.tsx`. Existing controller/legacy formatting findings were not rewritten. Entry hashes/index and the scoped diff were checked; unrelated work is preserved.

The implementer considers the Phase 3 functional exit gate and requested M1/L1 corrections satisfied, with the timing exception explicitly documented. Phase 4 is ready and unstarted. No routes, permissions, schema, save workflow, candidate budgets or session alternatives changed; no files were removed. No commit, push or deployment occurred.
