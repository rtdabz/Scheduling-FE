# Consecutive Days hour allocation: investigation and proposed fix

Date: 2026-11-12. Status: implemented 2026-11-12 (see **Implementation** at the end).

**Finding:** Both workflows implement Consecutive Days as an equal split of one course-hour budget. The requested behavior repeats the full course duration each day: PRAC 101 at 6 hours on 3 days must produce 18 scheduled hours. This requires coordinated allocation and validation changes, not just removing one divisor.

**Reproduction and verification**

Used PRAC 101 fixtures with a six-hour course duration and three selected days. Backend probes reused existing feature-test scaffolding with SQLite `:memory:`; frontend probes executed the actual modules through Vite SSR. No live database or browser session was used.

| Workflow | Actual result | Expected result |
| --- | --- | --- |
| Generate Schedule: `POST /api/schedule-recommendations/year-level-preview`, then `/api/schedules/batch` | Both HTTP 200; Monday/Tuesday/Wednesday each 2 hours; 6 hours total persisted | Three 6-hour meetings; 18 hours total |
| Manual Plotting: shared duration calculation, then `/api/schedules/batch` | Calculates 4 half-hour slots; Thursday/Friday/Saturday saved as 07:00-09:00; HTTP 200 | Each day 07:00-13:00; 18 hours total |
| Generate configuration display | Meeting parts `[120, 120, 120]` minutes; label `3 days x 2h` | `[360, 360, 360]`; 6 hours per day |

The existing four backend Consecutive Days suites pass: **31 tests, 155 assertions**. Frontend `courseSlotPlan.test.ts` and `courseClassConfig.test.ts` pass: **47 tests**. Several assertions explicitly require equal sharing and must change with the reviewed rule.

Validation probes confirm a second dependency: the snapshot kernel rejects three six-hour meetings with `class_duration` (`scheduled_minutes=1080`, `allowed_minutes=360`). A fresh manual batch can nevertheless accept all three full-length rows because it checks each new operation against persisted rows before writing, without aggregating the other new operations for duration. Completing an existing run can fail that same six-hour total ceiling. Allocation, recommendations and save validation therefore need parity.

**Root cause and affected components**

Line references describe the current working trees, including existing local changes.

| Component | Confirmed cause or dependency |
| --- | --- |
| Backend [SchedulingPolicy](../../../../backend/app/Services/Scheduling/Support/SchedulingPolicy.php), lines 1619-1623 | `consecutiveMeetingSlots()` returns `baseSlots / dayCount` and requires divisibility. |
| Backend [CspSolver](../../../../backend/app/Services/Scheduling/Engine/CspSolver.php), lines 1536, 1803, 1881 | Replaces the full requirement with that shortened duration, rejects nondivisible counts, then repeats the shortened block across the selected days. |
| Frontend [courseSlotPlan](../../../src/pages/ClassSchedules/SchedulerPanel/courseSlotPlan.ts), line 72 | Same division/divisibility rule. Manual [DropModal](../../../src/pages/ClassSchedules/SchedulerPanel/Modals/DropModal.tsx), line 640, and [useScheduler](../../../src/pages/ClassSchedules/SchedulerPanel/hooks/useScheduler.tsx), line 1243, consume it. |
| Frontend [courseClassConfig](../../../src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/courseClassConfig.ts), line 385 | Generate display independently divides `required / dayCount`. Actual generated times come from the backend. |
| Backend [SessionInterpreter](../../../../backend/app/Services/Scheduling/Recommendations/SessionInterpreter.php), line 90, and [YearLevelScheduleGenerationService](../../../../backend/app/Services/Scheduling/YearLevel/YearLevelScheduleGenerationService.php), line 611 | Repeat the division for configuration-based recommendations and unplaced-course recovery payloads. |
| Backend [ClassDurationRule](../../../../backend/app/Services/Scheduling/Engine/Rules/ClassDurationRule.php), line 38; [SectionLoadConstraints](../../../../backend/app/Services/Scheduling/Engine/Constraints/Families/SectionLoadConstraints.php), line 54; frontend [useConflict](../../../src/pages/ClassSchedules/SchedulerPanel/hooks/useConflict.ts), line 543 | Aggregate duration allowances assume the unmultiplied course budget. |
| Frontend configuration and guidance | `ConfigureClassSidebar` blocks nondivisible counts; labels and help describe equal sharing, contradicting other help that already promises full daily duration. |

**Prioritized resolution plan**

1. **P1 - Correct the shared duration policy.** For a valid Consecutive Days run, use the section/curriculum's effective base duration for every day; expected run duration is `base x N`. Reuse the existing backend policy and frontend slot helper, including Generate display and recommendation/recovery callers. Remove consecutive-only divisibility restrictions. Keep ordinary Regular, Split, Integrated and Hybrid duration behavior unchanged; do not globally multiply course durations or academic units. No schema change appears necessary.
2. **P1 - Align enforcement before release.** Apply the same daily/run allowance to the legacy rule engine, snapshot kernel, frontend checks, recommendations, draft review, batch save and edit/move paths. Validate complete proposed groups consistently. Derive N from validated configuration/group metadata, not an unchecked client marker. Preserve per-day limits, existing handling of non-increasing over-budget edits, and all conflict checks.
3. **P1 - Replace incorrect expectations and add regressions.** Cover PRAC 101 generating, recommending, plotting, saving and editing three six-hour meetings; confirm 18 hours after reload. Include an eight-hour course on three days (formerly rejected by divisibility), conflict detection during the added hours on any selected day, operating hours, availability, incomplete groups and legacy/kernel parity. Verify ordinary meeting shapes remain unchanged.
4. **P2 - Clarify documentation and existing-schedule handling.** Show `6 hours/day x 3 days = 18 hours` and update contradictory copy/tests. Inventory shortened saved runs and prepare conflict-checked regeneration/replotting. Editing currently restores saved durations, so helper changes alone will not repair old rows. Do not silently extend persisted meetings.

Preserve selected-day semantics, including non-adjacent ticked days already supported by this feature, section-specific overrides, Preferred Days, Sunday restrictions, Required Day exclusion, shared time/mode, linked-group operations, room eligibility and room/instructor/section conflicts. Academic teaching-load units remain separate from repeated scheduled contact hours.

**Review gate:** This report proposes the implementation scope. Code and existing schedules remain unchanged pending plan review.

**Implementation (2026-11-12)**

Each day of a run now holds the course's full Total Hours; the run's weekly allowance is `base x linked run meetings`, capped at the marker's N.

| Area | Change |
| --- | --- |
| Shared policy | `SchedulingPolicy::consecutiveMeetingSlots()` and frontend `consecutiveMeetingSlots()` return the full duration for any run of two or more days; divisibility removed. New `SchedulingPolicy::durationAllowanceRepeats()` derives N from linked rows (same split group, run marker), so an unlinked marker earns nothing. |
| Generate | `CspSolver` no longer throws the "cannot share in equal half-hour meetings" error; `SessionInterpreter` and unplaced-course payloads repeat the full meeting. Display shows `6h/day x 3 days = 18h`; the sidebar total, hint and guide copy match, and the divisibility error is gone. |
| Validation | `ClassDurationRule` (legacy) and `SectionLoadConstraints` (kernel) apply the repeated allowance. Batch save passes the save's other operations to `ClassDurationRule`, which aggregates them for run rows only, closing the fresh-batch gap. `ConstraintSupport::stringValue()` now exposes `preferred_pattern` for `ScheduleRow`. |
| Manual | `DropModal` and `useScheduler` default each day to the full duration, with no divisibility error; the time summary shows hours/day x days. `useConflict.checkConflict()` takes an optional run day count for the same allowance, also used by run moves. |

Tests: updated equal-share expectations in the four Consecutive Days suites, `SessionInterpretationTest`, `SessionRecommendationEvidenceTest`, `GenerationDraftReviewTest`, `courseSlotPlan`, `courseClassConfig` and `SetupCoursesStep`. Added PRAC 101 regressions for solver generation, year-level preview plus batch save (18 hours persisted, units unchanged), manual batch save/reload, over-length and extra-meeting refusal, whole-run batch aggregation, editing, a room clash inside the added hours, a section class inside the added hours during generation, 8 hours on 3 days, kernel allowance and frontend run allowance.

Remaining limitations: existing saved runs keep their shortened rows until replotted or regenerated (nothing is resized automatically). Preflight capacity heuristics (`YearLevelFeasibilityService`, `ValidateGenerationConfiguration` room demand) still count one course length per run, so they can underestimate a run's demand; the solver still enforces real capacity. Batch-save aggregation applies to run rows only; other shapes keep their per-row checks.
