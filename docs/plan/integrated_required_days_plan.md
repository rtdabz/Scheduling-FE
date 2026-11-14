# Schedule Generator: separate Integrated lecture and laboratory Required Days

Date: 2026-11-11 (Asia/Shanghai)

Status: Implemented 2026-11-11 (frontend and backend, with regression tests). A manual browser check is still outstanding.

## 1. Intended result

In **Schedule Generator -> Setup Courses -> Configure**, an Integrated course must expose two independent optional controls:

| Control | Example | Meaning |
| --- | --- | --- |
| Lecture Required Day | Monday | Generate the lecture on Monday. |
| Laboratory Required Day | Thursday | Generate the laboratory on Thursday. |

Selecting either day must preserve the Integrated configuration and its two meetings. Support both Integrated On-site and Integrated Hybrid. A blank control means the generator chooses that component's day within the existing scheduling rules.

Example: an Integrated course with a Monday lecture and Thursday laboratory remains two meetings with the existing component hours, delivery modes and room requirements. It must not become one Regular meeting. Preview, draft repair, review and save must agree on these choices.

## 2. Findings from the current implementation

The problem spans configuration and generation; adding another dropdown alone will not make the selected days apply.

| Priority | Verified finding | Implementation evidence |
| --- | --- | --- |
| High | The generator stores one `requiredDay`. Selecting it for a multi-meeting course converts the course to Regular. | [courseClassConfig.ts](../../src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/courseClassConfig.ts), [ConfigureClassSidebar.tsx](../../src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/ConfigureClassSidebar.tsx), [SetupCoursesStep.tsx](../../src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/SetupCoursesStep.tsx). |
| High | The workflow also removes Integrated markers when it sees a course-wide Required Day, including during payload construction. | [YearLevelGenerateScheduleWorkflow.tsx](../../src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/YearLevelGenerateScheduleWorkflow.tsx), notably the normalization effect and `selected_split_session_course_ids` construction. |
| High | Backend forced-day handling is course-wide. It filters every block to one day, while Integrated meetings require different days. | [CspSolver.php](../../../backend/app/Services/Scheduling/Engine/CspSolver.php), [ValidateGenerationConfiguration.php](../../../backend/app/Services/Scheduling/Generation/ValidateGenerationConfiguration.php). |
| High | Draft review currently carries rows and Preferred Days without the generation's component constraints. A repair could otherwise move a pinned component. | [draftReview.ts](../../src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/draftReview.ts), [GenerationDraftReviewer.php](../../../backend/app/Services/Scheduling/Generation/GenerationDraftReviewer.php). |
| Medium | Manual plotting already has separately editable laboratory and lecture meeting days. The generator lacks the equivalent component settings. | [DropModal.tsx](../../src/pages/ClassSchedules/SchedulerPanel/Modals/DropModal.tsx), [DropModal.test.tsx](../../src/pages/ClassSchedules/SchedulerPanel/Modals/DropModal.test.tsx). |
| Medium | Some documentation still describes Required Day as a persistent department rule. Current code and tests deliberately make day rules choices for one generation run. | [SchedulingSettingsControllerTest.php](../../../backend/tests/Feature/SchedulingSettingsControllerTest.php), `test_day_rules_are_no_longer_saved`; [YearLevelGenerateScheduleWorkflow.test.tsx](../../src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/YearLevelGenerateScheduleWorkflow.test.tsx), the test starting without saved Required Days. |

The broader [Generate Schedule reliability plan](generate_schedule_implementation_plan.md), GS-02, already identifies rule-context differences between generation, review and save. This feature must close that gap for its component days. Other reliability work in that document remains separate.

## 3. Proposed behavior and scope

1. Show **Lecture Required Day** and **Laboratory Required Day** when the configuration is Integrated. Keep the existing single **Required Day** control and behavior for other configurations.
2. Each component may be automatic independently. Both automatic preserves current Integrated generation behavior.
3. Preserve the current requirement that Integrated meetings use **different days**. Reject equal selected days beside the controls and on the server. If only one is pinned, schedule its partner on another permitted day.
4. Restrict both choices to the run's Preferred Days and applicable department/Sunday/delivery rules. Evaluate Sunday eligibility for each component: an online lecture and a physical laboratory can have different restrictions. Never widen Preferred Days to satisfy a pin.
5. Reuse **Apply To**. Default to all sections; selected-section application changes only those sections. A Regular section outside the selected Integrated scope must receive no component rule.
6. Keep the new rules scoped to the generation run and its draft. Preserve them through Back/Next, reopening Configure, draft restoration and queued-result recovery. They do not create department settings or constrain unrelated later manual plotting.
7. Preserve pins when changing Integrated delivery if they remain valid. If a change makes a pin invalid, show the reason and require correction. Do not silently change its day.
8. Switching away from Integrated explicitly clears that configuration's component pins, with a visible explanation. Do not convert them into a course-wide Required Day or restore stale pins later. Automatic retries must never make this switch to discard constraints.
9. Do not infer a lecture or laboratory pin from an old course-wide Required Day. Retain existing behavior for old drafts and requests. Reject incompatible simultaneous course-wide and component rules with a clear correction message.
10. Show component-labeled values in Setup Courses and the review summary, for example `Lecture: Monday` and `Laboratory: Thursday`. Include section scope when sections differ; do not display an arbitrary section's values as shared defaults.

## 4. Minimal data and API changes

Reuse existing per-section course configuration and existing run request/result JSON. No new package, table, scheduling enum or permanent schedule column is needed for this proposal.

Frontend additions:

- An optional `componentRequiredDays` value on `CourseClassConfig`, containing `lecture` and `laboratory` day values.
- An optional `componentRequiredDaysByCourseId` map on `CourseSetupConfig` and the workflow's `SectionConfig`.

Proposed serialized section configuration:

```json
{
  "section_id": 123,
  "component_required_days_by_course_id": {
    "456": {
      "lecture": "Monday",
      "laboratory": "Thursday"
    }
  }
}
```

Missing or null component values mean automatic. Normalize empty entries away. A missing map keeps old clients and drafts compatible. This example illustrates only the added fields; existing course-selection and Integrated markers still accompany generation requests.

Backend additions:

- Validate and normalize the map through the existing configuration preparation path, reusing `CourseSetupOverrides` where appropriate.
- Add nullable `requiredDay` / `required_day` to `ScheduleRequirement`, including `fromArray` and `toArray`. Populate it on each typed Integrated requirement in `CourseScheduleRequirementBuilder`.
- Retain the raw map and typed requirement values through legacy mapping, configuration serialization, queued preparation, retries, cache identity and result restoration. Old serialized requirements default to no component pin.
- Extend draft-review and generated batch-save requests with optional `section_configs` carrying the section IDs, Integrated selections, delivery settings and component map needed to rebuild canonical requirements. Derive component hours and eligibility server-side; do not trust submitted requirement arrays. Use the same normalizer and component-day validator as generation. These fields add restrictions; they must not disable existing authorization, status checks or persisted hard constraints.
- Validate requested sections/courses against the authorized generation and replacement scope. Reject unsupported keys, invalid days, unknown/out-of-scope courses, ineligible configurations and conflicting rules. Client data is untrusted even when restored from browser storage.

Use component identity throughout. Manual plotting presents the laboratory first, the requirement builder emits lecture first, and the solver can generate either chronological order. Match by `component_type` / `meeting_type`, never meeting index, row position, duration or which day comes first.

## 5. Ordered implementation phases

### Phase 1 - Configuration contract and validation

1. Add the optional frontend map and backend requirement field without changing existing single-day handling.
2. Accept the same nested fields in synchronous and queued year-level endpoints in `ScheduleRecommendationController`; preserve them in `prepareYearLevelConfigs` and `GenerateYearLevelSchedulePreview`.
3. Validate Integrated eligibility, exact component keys, section/course selection, day names, distinct days, Preferred Days and Sunday/delivery constraints. Reject constraints that cannot be applied rather than silently dropping them.
4. Keep the old course-wide forced-day rule separate. A component pin must not enter `forcedDaysByCourseId` or trigger its one-meeting checks.

Exit: valid values round-trip through request preparation, requirement serialization and queued transport; invalid values produce the same useful error in both generation paths.

### Phase 2 - Enforce component days in generation

1. Populate typed requirements in `CourseScheduleRequirementBuilder` and preserve them through `GenerationConfiguration` / `LegacyGenerationConfigurationMapper`.
2. Update `CspSolver` Integrated day-pair generation and filtering to apply each pin to the block with the matching `meeting_type`. Prune disallowed pairs before expensive room/time enumeration where practical. Retain the existing distinct-day rule and normal room/time search.
3. Add a hard candidate validation check using those requirements. Missing, mislabeled, duplicated or off-day components must not pass validation. Reuse existing meeting-group checks and add only the missing component-day check.
4. Update `YearLevelFeasibilityService` and diagnostics to count each pinned component with its own duration, delivery and room needs. Do not count an online lecture as physical laboratory demand or pin the whole course's duration to both days.
5. Preserve pins through room fallback, allocation passes, search restarts and delivery-only adjustments. `YearLevelRetryStrategyPlanner` and `GenerationAdjustmentInterpreter` must not silently disable Integrated or clear either day. Exclude incompatible adjustment options, or require an explicit configuration edit before applying them.
6. Include normalized pins in domain/cache identity and relevant quality evaluation. A required Saturday component must not be treated as avoidable weekend placement.

Exit: On-site and Hybrid generation honor independently pinned components in either chronological order. An impossible choice returns a component-specific explanation instead of a different day or Regular fallback.

### Phase 3 - Configure UI, section scope and restoration

1. Update `ConfigureClassSidebar` with two labeled optional selects for Integrated. Reuse the existing select styling, day options and inline error pattern. Support narrow screens and keyboard operation.
2. Update `courseClassConfig` inference/synchronization and `SetupCoursesStep` state so pins apply only to targeted Integrated sections and count as customized configuration. Handle mixed section values without silently overwriting them.
3. Keep `requiredDayCollapsesShape`, `asRegularClass`, one-meeting eligibility gates and workflow Integrated stripping limited to the existing course-wide `requiredDay`. Neither new pin may trigger them.
4. Serialize the new map in `YearLevelGenerateScheduleWorkflow` and retain it during state normalization, local draft restoration and active-result reopening. Missing maps in old drafts become empty maps.
5. Update Setup Courses badges, `ReviewGenerateStep`, final-summary inputs and `generationGuideContent`. Ensure the displayed days correspond to the effective section configuration sent to generation.

Exit: Apply/reopen/Back/Next/reload preserve the two independent values and Integrated shape; selected sections remain isolated and legacy single-day behavior still works.

### Phase 4 - Review, repair and save parity

1. Carry the same normalized section configuration and component maps from generation into `draftReview.ts`, `GenerationDraftReviewer` and draft placement alternatives. Include both placed and unplaced Integrated courses, and enough Integrated/delivery context to rebuild their canonical requirements.
2. Validate complete lecture/laboratory groups before offering fixes. Every suggested alternative must preserve the pinned days and current Integrated shape unless the user explicitly returns to configuration to change them.
3. Pass the component context into every generated `/schedules/batch` save. Recheck complete groups and component days server-side inside the existing authorized save transaction, before any schedule replacement writes. Reject a batch violating the supplied effective context atomically with the course, component and required day identified. Ordinary manual batch requests without generation context retain their existing behavior.
4. Continue saving existing meeting types and split-group metadata. No permanent component-rule rows are created. Later manual edits retain their current rules and permissions.
5. Preserve pins in `yearLevelGenerationFailure.ts` and server adjustment handling. Clear stale entries when a course is explicitly removed from generation; never leave a hidden rule on a different course or section.

Exit: the generated workflow supplies the same component context throughout; generation, review, fixes and final save reject rows that violate that context.

### Phase 5 - Regression checks and documentation

Extend existing relevant tests; avoid creating another test framework or parallel generation service.

| Area | Required checks |
| --- | --- |
| Core generation | On-site and Hybrid; lecture Monday/lab Thursday; lecture Thursday/lab Monday; equal component durations; each pin automatic independently; both automatic. Preserve component hours and compatible rooms/modes. |
| Validation | Same-day pins, invalid day/component key, course or section outside scope, non-Integrated course, incompatible single Required Day, Preferred Days conflict, disabled Sunday and component-specific Sunday restrictions. |
| Lifecycle | Sync/queue parity, requirement round-trip, restored drafts/results, different section choices, cache separation when days change, retries and room fallback preserving both pins. |
| Review/save | Fixes retain pins, swapped component identity fails, incomplete groups fail, off-day rows fail against the supplied context, conflicting batches roll back, unplaced courses retain their constraints. |
| Compatibility | Existing Regular Required Day and Split behavior; ordinary Integrated generation without pins; manual plotting; old requests/drafts without new fields; no department-rule persistence. |

Frontend targets: `courseClassConfig.test.ts`, `SetupCoursesStep.test.tsx`, `YearLevelGenerateScheduleWorkflow.test.tsx`, and the existing review/failure tests for modified behavior.

Backend targets: `ScheduleRequirementBuilderTest`, `DefaultLectureLabGenerationTest`, `SetupCoursesConfigureOverridesTest`, `ForcedDayCapacityCheckTest`, `PreferredDaysTest`, `YearLevelQueuedGenerationTest` and `GenerationDraftReviewTest`, plus batch-save coverage for the new context.

Run focused tests for the touched paths first, then the frontend production build and relevant lint checks. Use the existing backend test database configuration. Record actual results and any unrelated failures. Perform a browser check for both Integrated deliveries, Apply To, restored configuration, narrow-screen labels, error correction and preview-to-save behavior.

Update `business_rules.md`, the affected Required Day decision text in `decisions.md`, generator help and the GS-02 cross-reference after implementation is verified. Document the current run-scoped behavior and the new distinction between whole-course and component days.

## 6. Acceptance checklist

- [ ] Integrated Configure shows Lecture Required Day and Laboratory Required Day.
- [ ] Choosing one or both keeps the course Integrated with its two original components.
- [ ] Both automatic and one automatic work without weakening existing day restrictions.
- [ ] Same-day or otherwise incompatible choices explain how to correct them.
- [ ] Apply To affects only the selected Integrated sections.
- [ ] Sync generation, queued generation, retries and restoration preserve the effective values.
- [ ] Review and placement fixes cannot move a pinned component to another day.
- [ ] Final save validates the same component rules and rejects violating batches atomically.
- [ ] Manual plotting, legacy single Required Day and old drafts remain compatible.
- [ ] Tests, browser checks and updated documentation establish the final behavior.

## 7. Planning limits

This plan is based on source and test inspection in `C:/Users/toman/wicars-ui` and `C:/Users/toman/backend` on 2026-11-11. Both checkouts already contain extensive unrelated working-tree changes; implementation must preserve that work and confirm the current baseline before editing. No application code was changed and no runtime tests were run for this documentation-only task.

Component-day enforcement at review/save applies to the effective configuration supplied by the generated workflow. An authorized caller can still use the existing manual scheduling API without that context. If immutable enforcement of a particular original run becomes a requirement, bind review/save to `ScheduleGenerationRun.run_id` and retain its canonical configuration in existing run JSON; that stronger contract is outside this feature's proposed scope.

The recommended scope is independent **run-scoped** component days with the existing distinct-day policy. Persistent department-wide component rules or same-day lecture/laboratory scheduling would require a separate behavior change.
