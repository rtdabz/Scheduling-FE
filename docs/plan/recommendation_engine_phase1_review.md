# Recommendation Engine — Phase 1 Review

Reviewed 2026-10-07 against `docs/recommendation_engine_integration_plan.md` section 8 (Phase 1 exit gate) and section 14 (implementation evidence). HEAD `a109a72`. No application code was modified by this review.

**Verdict: PASS.** No Critical, High or Medium findings. The Low/Info items below don't block Phase 2. L1 and L2 must be resolved before any phase reads the normalized `verification`/`metadata` fields (no consumer reads them today).

## Scope reviewed

Phase 1 files were identified from section 14. The working tree carries unrelated dirty work (faculty ceiling, override removal, release notifications). It was excluded by checking only the Phase 1 hunks.

- Added: `backend/app/Services/Scheduling/Recommendations/` (6 contracts + 6 providers), 4 test files.
- Changed: `AppServiceProvider`, `GenerateSchedulePlan`, `YearLevelScheduleGenerationService`, `ScheduleRecommendationController`, `ScheduleConflictController`, `InstructorAssignmentController`, `ScheduleController` (`splitValidationResponse` only).

## Confirmed correct

| Area | Result |
|---|---|
| Compatibility | Every engine call passes named inputs that match the wrapped signature exactly (`AvailableSlotFinder::find`, `GenerationDraftReviewer::review`, `ConflictRecommender::recommend`, `InstructorRecommender::recommend`, the three diagnostics methods). Every endpoint returns `legacyPayload` unchanged. Status codes, response wrappers (`{options: …}`, conflict `rank` reassignment) and argument values match HEAD. |
| Authorization | Each controller guard runs before the engine call and is byte-identical to HEAD. Conflict per-action filtering and the `limit + 5` over-fetch still run on the raw `legacyPayload` after the provider returns. `validate-splits` capability and ownership checks are unchanged. Context `scope` is informational only, and no code reads it for authorization. |
| Reachability | All 9 `RecommendationSource` cases are registered (the `match` is exhaustive). No producer call bypasses the engine. The only remaining direct references are `ConflictRecommender::DEFAULT_LIMIT` and `ConflictRecommender`'s documented internal use of the finder and instructor recommender. |
| Laziness / lifetime | Providers resolve per `recommend()` call through closures. Resolving the engine creates no providers. The interim-report path builds one throwaway `YearLevelGenerationDiagnostics`, which has no constructor and is called once per run, so the cost is negligible. |
| Generation | The feasibility scope reads `generationSnapshot`, which is captured at line 168 before first use at line 182. The optional constructor parameter keeps `YearLevelScheduleFairnessScoreTest`'s positional construction working. `GenerateSchedulePlan` has no production `new` call sites. |
| Payload shapes | `issues[].options`, `checked_rows`, `slots`/`total`/`truncated` and the split `status` always exist on every return path the providers read. |
| No writes | The providers perform no persistence. The legacy split test asserts zero schedule, history and audit rows. |

## Findings

| ID | Severity | File / line | Finding | Required fix |
|---|---|---|---|---|
| L1 | Low | `backend/app/Services/Scheduling/Recommendations/RecommendationResult.php:44-50`; codified by `backend/tests/Unit/GenerationRecommendationCompatibilityTest.php:91` | Generation-source status depends only on whether `adjustments` is empty. As a result, `clear_forced_day`, `remove_course`, `remove_configuration_reference` and `split_session_single_meeting_fallback` options are labelled `requires_regeneration`. Section 13 catalogues these as guidance-only, gated on Phase 4, or not applicable. The label suggests an apply-then-regenerate path that doesn't exist. Section 14 disclaims applicability in prose, but the field itself doesn't. | Before any consumer reads `verification.status`: classify unsupported adjustment types as `guidance` (or add a distinct status), and update the test at line 91. |
| L2 | Low | `backend/app/Services/Scheduling/Recommendations/Providers/GenerationRecommendationProvider.php:39`; caller `backend/app/Services/Scheduling/YearLevel/YearLevelScheduleGenerationService.php:769-775` | `metadata.search_incomplete` comes from the producer argument `searchIncomplete`. The provisional interim report (`provisional: true`, "still searching") doesn't pass that argument, so its normalized metadata reports `search_incomplete: false` for a search that hasn't finished. That contradicts section 4: "Do not misrepresent truncated search". Passing `searchIncomplete: true` to fix it would change the legacy payload, so the argument isn't a safe input for metadata. | Set request metadata from the caller (for example, a context or metadata field set by `interimReport`) rather than from producer arguments. Add an assertion that provisional reports normalize as incomplete. |
| I1 | Info | `RecommendationOption.php`, `RecommendationResult.php` | The status vocabulary (`legacy_checks_only`, `guidance`, `requires_regeneration`) doesn't map onto section 4's five verification states. This is acceptable for an internal facade. | Record the mapping in section 4 or 14 when Phase 2/3 introduces verified states. |
| I2 | Info | `RecommendationContext.php:9-12`, `RecommendationEngine.php:11,14`, `LegacySplitRecommendationProvider.php:11`, `ConflictRecommendationProvider.php:20`, `GenerationRecommendationProvider.php:22` | New prose docblocks and `//` comments. They follow `docs/coding_standards.md:45` (comments for invariants), but the rest of the app source is comment-free since commit `a109a72`. | Owner decision: either strip them to match `a109a72`, or keep them and leave the standard as written. Not a defect. |
| I3 | Info | Tests | Endpoint-level dispatch through the engine is covered only implicitly: the paths call the engine unconditionally, and the existing endpoint tests pass. No test binds a fake provider per controller to prove routing. | Optional. Add one when Phase 3/5 changes the providers. |

## Verification run for this review

| Check | Result |
|---|---|
| Full backend suite (`php artisan test`, `APP_ENV=testing`, SQLite `:memory:`, no `bootstrap/cache/config.php`) | **999 passed, 5089 assertions, 131s**. No failures. |
| `pint --test` on the 12 new app files, the 4 new tests and `AppServiceProvider` | Passed |
| Frontend | Not re-run. Phase 1 changed no `wicars-ui` files and no API shapes. |

## Existing failures vs regressions

- **Regressions introduced by Phase 1: none found.**
- **Existing (pre-Phase 1, not re-verified here):** `npm run build` TypeScript errors in `SecretaryDashboardPage.tsx:66` and `Reports.tsx` (sections 13 and 14). Pint findings in the four previously dirty touched files reproduce on HEAD copies (section 14). Neither is a Phase 1 regression.

## Handoff

L1 and L2 are the confirmed findings to address. Both are small, and fixing them now, before Phase 2 starts, is the simplest path. They must be fixed no later than when any phase first reads normalized `verification`/`metadata`. I1-I3 are informational and left to Sol's discretion.

## Implementer response — 2026-10-07

**L1 and L2 resolved.** The original review above is preserved; this response records the implementer's fixes and checks, not a second independent review.

- **L1:** unsupported, unknown and mixed unsupported adjustment types normalize as `guidance`, retaining their exact legacy payloads. Recognized types remain `requires_regeneration`, subject to existing eligibility, authorization and application validation. The configuration-finding expectation was corrected and negative cases added.
- **L2:** the caller supplies separate context metadata. Provisional generation marks `search_incomplete: true` without adding/changing the legacy `searchIncomplete` producer argument. Unit and actual generation-path tests verify the metadata and unchanged recommendations; final metadata still reflects the final caller's search flag.
- **Verified:** 47 targeted tests (289 assertions); full isolated backend suite **1001 passed, 5111 assertions, 119.60s**; syntax on seven changed PHP files; Pint on new recommendation files and changed unit tests; scoped whitespace check. No frontend or public-response changes; existing build/style limitations remain as recorded.
- **Info:** invariant comments retained; provisional status vocabulary and later-phase mapping recorded in the plan. Actual year-level engine dispatch now has explicit test evidence; other endpoint dispatch tests remain optional during migration.

Phase 1 remains complete and Phase 2 is ready. No code was committed, pushed or deployed, and no Phase 2 work was implemented.
