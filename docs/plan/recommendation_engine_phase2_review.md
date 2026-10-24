# Recommendation Engine — Phase 2 Review

Reviewed 2026-10-07 against `docs/recommendation_engine_integration_plan.md` section 8 (Phase 2 exit gate) and section 15 (implementation evidence). HEAD `a109a72`. No application code was modified by this review.

**Verdict: NEEDS FIXES.** One High regression (H1) must be fixed before Phase 3. The other items are Low or Info.

## Scope reviewed

The Phase 2 files were identified from section 15 and from modification times after the Phase 1 follow-up. Phase 1 and unrelated dirty work were excluded. The implementer's saved entry-state copies were not available, so Phase 2 hunks were separated using the Phase 1 content reviewed earlier.

- New: `SessionDescription`, `SessionInterpreter`, `SessionAlternativePolicy` (`backend/app/Services/Scheduling/Recommendations/`), `SessionInterpretationTest`, `SessionRecommendationEvidenceTest`.
- Changed: `GenerationDraftReviewer`, `YearLevelGenerationDiagnostics`, `DraftRecommendationProvider`, `GenerationRecommendationProvider`, `GenerateSchedulePlan`, `YearLevelScheduleGenerationService` (snapshot in context), `GenerationDraftReviewTest`, UI `recommendationGroups.ts` plus 2 tests, `docs/business_rules.md`.

## Confirmed correct

- **Eligibility extraction is equivalent to HEAD.** `generationHybridEligible`, `generationOnlineEligible` and `draftOnlineMeetingSlots` match the removed predicates exactly. Diagnostic IDs, adjustments and order are unchanged. Only titles and wording changed.
- **`shapeOf` matches HEAD for every shape except consecutive-marked pairs.** This covers Integrated, Hybrid, Online and Field pairs. The consecutive case is H1.
- **Generation session metadata is safe.**
  - It reads arrays from `requirements_by_course_id` (`ScheduleRequirementBuilderResolver::build` returns arrays).
  - The year-level snapshot is captured inside `DepartmentCourseRules::withOverride`, so per-run consecutive rules are visible.
  - The snapshot is removed before diagnostics are called and isn't serialized.
- **The mapping `selected_split_session_course_ids` → Integrated is correct**: it is the lecture/lab selection (`CspSolver.php:268`).
- **Authorization, routes, save workflows, ranking and budgets are unchanged.** No controller was touched in Phase 2.
- **The `business_rules.md` change matches the cited code and tests.**

## Findings

| ID | Severity | File / line | Finding | Required fix |
|---|---|---|---|---|
| H1 | **High (regression)** | `backend/app/Services/Scheduling/Generation/GenerationDraftReviewer.php:234`, `:248`, `:323-324`, `:612-614`; `backend/app/Services/Scheduling/Recommendations/SessionInterpreter.php:32-36` | **Draft review offers unsaveable fixes for Consecutive Days runs.** See the H1 details below the table. | See the H1 details below the table. |
| L1 | Low | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/generationGuideContent.ts:95` | The guide glossary still names the both-online shape "Online Split". Phase 2 renamed it **Online (All)** in the draft and diagnostics and wired that through `recommendationGroups.ts`, so users now see two names for one shape. | Rename the term to "Online (All)" (keep the meaning text). |
| L2 | Low | `backend/app/Services/Scheduling/YearLevel/YearLevelScheduleGenerationService.php:556-560` | `unplacedCourse` still builds the Hybrid Split meetings inline. This duplicates `SessionAlternativePolicy::hybridSplitMeetings()`, which Phase 2 introduced to own that construction. The policy extraction is incomplete. | Call `SessionAlternativePolicy::hybridSplitMeetings()`. Its output is identical, so the legacy payload doesn't change. |
| I1 | Info | `SessionInterpreter.php:39-40` | `fromRows` computes `duration_slots` with `/`, which returns a float for off-grid rows. `fromConfiguration` returns ints. This is internal metadata only. | Optional: use `intdiv`, or document fractional slots. |

### H1 details

**What goes wrong.** For a Consecutive Days run, draft review now offers fixes that save refuses. The fix options it returns pair the kept meeting with a replacement at a different time.

**Cause.** Phase 2 decides whether a class is a consecutive run in two different ways:

- `shapeOf` now uses the row marker (`preferred_pattern: consecutive:N`). For a two-meeting run it returns `null`, where HEAD returned `split`.
- The new alternative gate and the new `$sameTime` term check only the saved rule (`$snapshot->consecutiveDayRulesFor()`).

`DepartmentCourseRules::put` has no caller in `app/`. Consecutive rules are per-run overrides, applied only inside generation (`DepartmentCourseRules::withOverride`). Draft review receives no override. So in normal use, a generated run carries the marker but has no saved rule.

**Result.**
- `$sameTime` becomes false, so replacement meetings are no longer held to the kept meeting's interval. HEAD held them through `shape === 'split'`.
- Hybrid Split is still offered for the run, so the Phase 2 guard ("two-day runs must never be reshaped") has no effect in practice.

**Reproduced.** Isolated probe on in-memory SQLite: a `consecutive:2` run (Mon/Tue 08:00–09:30) conflicts on Monday.
- Marker only: 5 options. Three pair Tue 08:00 with Mon 10:00, 11:30 or 13:00. Two are Hybrid Split reshapes.
- Marker plus saved rule: 0 options.

`MeetingGroupRule.php:176-191` rejects mismatched consecutive intervals (`split_group_same_time`), so the offered fixes can't be saved.

**Test gap.** The new test `GenerationDraftReviewTest.php:376` seeds both the saved rule and the marker, which hides the bug.

**Required fix.**
1. Treat an issue as consecutive when its section/course rows carry a consecutive marker (`SchedulingPolicy::consecutiveDayCount`, or `SessionInterpreter::fromRows(...)->kind === 'consecutive'`) **or** the snapshot rule exists.
2. Use that one decision for the Hybrid/Online (All) gate and for `$sameTime`.
3. Add an endpoint test with the marker only (no `department_course_rules` row). It must assert that no option has mismatched intervals, and that no Hybrid or Online (All) alternative is offered.
4. Record in section 15 that `unplaced` entries carry no consecutive marker. Their run handling stays a Phase 3 gap.

## Verification run for this review

| Check | Result |
|---|---|
| Full backend suite (`php artisan test`, `APP_ENV=testing`, SQLite `:memory:`, no cached config) | **1015 passed, 5201 assertions, 141s.** Matches section 15. |
| H1 probe (scratch test outside the repo, same isolation) | Reproduced as described above |
| UI: `recommendationGroups`, `RecommendedAdjustmentPanel`, `YearLevelGenerateScheduleWorkflow`, `DropModal` | 60 passed (4 files) |
| `npm run build` | Fails only in `SecretaryDashboardPage.tsx:66` and `Reports.tsx`. No Phase 2 file has errors. |
| Pint `--test`: 3 new app files + 2 new unit tests | Passed |
| Pint `--test`: `YearLevelGenerationDiagnostics`, `GenerateSchedulePlan`, `YearLevelScheduleGenerationService` | Fail on existing categories. `no_unused_imports` (`YearLevelScheduleGenerationService` import in `GenerateSchedulePlan`) is confirmed present at HEAD. |

## Existing failures vs regressions

- **Regression introduced by Phase 2:** H1.
- **Existing (not Phase 2):**
  - UI build TypeScript errors in `SecretaryDashboardPage.tsx` and `Reports.tsx`.
  - Pint findings in the three large touched services (HEAD-level style debt).
  - Hybrid alternatives offered to consecutive runs. This existed at HEAD. Phase 2 meant to remove it, but the guard is ineffective; see H1.

## Handoff to Sol

Fix H1, with its marker-only regression test, before starting Phase 3. Phase 3's complete-group discovery depends on the reviewer recognizing runs the same way save validation does. L1 and L2 are small and can go in the same change. I1 is optional.

## Implementer response (2026-10-07)

The original **NEEDS FIXES** verdict and findings above remain the independent review record. The fixes below have been implemented and verified; this response is not a second independent review.

- **H1 resolved:** one decision recognizes the snapshot rule or a consecutive marker on any kept/replaced issue row. The Hybrid/Online (All) gates and same-time search use that decision. A new endpoint test leaves `department_course_rules` empty and reproduced the mismatched 10:00/08:00 intervals before the fix. It now rejects the partial-run fixture's unsaveable options and both reshapes. Its whole-run scenario verifies every option with `MeetingGroupRule`, retains matching intervals/markers and saves a selected option through `/api/schedules/batch`.
- **L1 resolved:** glossary term changed to Online (All), with meaning text preserved.
- **L2 resolved:** unplaced Hybrid Split meetings come from `SessionAlternativePolicy::hybridSplitMeetings()`, preserving the old payload exactly.
- **I1 documented:** fractional row-description slots remain descriptive metadata so off-grid input is not silently shortened; no validity claim was added.

Checks: isolated SQLite `:memory:` backend suite **1,016 passed, 5,249 assertions**; targeted backend subset **32 passed, 423 assertions**; affected UI **62 passed in five files**. PHP syntax and reviewer Pint passed. Existing Pint categories in the year-level service/feature test were reproduced on entry-state copies. UI build still fails only in the previously reviewed dashboard/report files. Entry-state diff/hash review preserves unrelated changes.

Section 15 of the integration plan records the corrected exit gate and handoff. **Unplaced entries carry no consecutive marker**; their request-local run semantics and general complete-group discovery remain Phase 3 work. Phase 3 has not started. No files were removed, and no commit, push or deployment occurred.
