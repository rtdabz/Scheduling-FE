# Tour Guide repair plan

Planned: 2026-11-08. Implemented and verified: 2026-11-09.

Status: repairs implemented for all 12 existing guide IDs. All 164 focused tests, 51 authenticated Chrome browser scenarios, production build, and scoped lint passed. Repository-wide test/lint checks remain unsuccessful for separate existing issues; native browser zoom and other browser engines were not verified. See the [verification record](../tour-guide-repair/README.md) for commands, evidence, and limits.

User priority: fix **all** reported problem categories: guides that get stuck or advance incorrectly, highlights that target or block the wrong control, and instructions that do not match the workflow.

## Outcome and scope

Repair all **12 existing workflow guide IDs** so Help reliably explains the current page, role, data state, and workflow stage. A guide must either finish its applicable instructions or explain an unavailable prerequisite and offer recovery. Disappearing, waiting invisibly, skipping required work, and claiming completion after dismissal are failures.

Keep React, the installed `react-joyride` 3.2.0, the existing per-page Help entry, and existing application/API behavior. Use one shared runner for action and review steps. No second tour library, new backend endpoint, database table, global mission overlay, or unrelated page redesign is needed.

This plan covers the existing workflow tours and related generator help copy. Adding tours to modules that currently have none is a separate feature. Preserve existing role/capability boundaries and the unrelated uncommitted work in both repositories, including changes in `InstructorAssignment.tsx`.

## Evidence and current verification

Three parallel reviews identified the original defects below. The shared runner and all page integrations have since been repaired. The original findings and implementation specification are retained below for traceability; old line references refer to the pre-repair source.

- One manual runner now owns progress, cancellable waits, actual target identity, recovery, focus, and truthful completion. Help requested during loading starts when that requested page becomes ready; it never starts just because a page was visited.
- Every guide builds its steps from current role, List/Grid view, open form, prerequisites, selected department/section, or generator stage/run state. Save, Submit, Apply, immediate assignments, and launching jobs are review-only.
- Real browser checks exposed and fixed two additional integration problems: Floating UI accessing a clicked target after its removal, and nested scrolling clipping tooltips on short screens. The runner unmounts positioning for disconnected targets and fits guidance to the viewport.
- [Page browser results](../tour-guide-repair/page-guides-final/results.json): **30/30 passed** across eight guide IDs, including read-only access, forms, empty/locked states, department deep links, keyboard navigation, and narrow screens.
- [Builder/generator browser results](../tour-guide-repair/scheduler-guides/results.json): **21/21 passed** across the other four guide IDs, including all four generator stages and queued, running, blocked, failed, cancelled, complete, and partial outcomes. Run/status and editable-scope fixtures are explicitly identified in the verification record.
- All browser scenarios reported **zero domain write attempts and zero page errors**. Temporary local verification tokens were revoked after the run. No backend source changes were needed for the tour repair.
- Follow-up screenshot fix: the generator header's separate question-mark popup now positions within the full header instead of overflowing from its icon. All four stages passed isolated browser clipping/text/toggle checks at desktop, 390px, and 320px (**12/12 cases**); 25 generator tests and the production build passed again. See the [follow-up evidence](../tour-guide-repair/README.md#generator-header-help-popup-follow-up).
- Automated checks: **13 files / 164 focused tests passed**, including **six installed-Joyride integration tests**; `npm run build` passed; shared guide/new-file ESLint passed; `git diff --check` passed. Repository-wide limitations are recorded separately in the verification record.

- Entry and lifecycle: [useWorkflowGuide.ts](../../src/hooks/useWorkflowGuide.ts), [WorkflowGuideButton.tsx](../../src/components/help/WorkflowGuideButton.tsx).
- Shared behavior: [TaskGuideRunner.tsx](../../src/onboarding/TaskGuideRunner.tsx), [taskGuide.ts](../../src/onboarding/taskGuide.ts), [joyrideTour.ts](../../src/onboarding/joyrideTour.ts).
- Presentation: [TaskTooltip.tsx](../../src/onboarding/TaskTooltip.tsx), [onboarding.css](../../src/styles/onboarding.css), [tourDiagnostics.ts](../../src/onboarding/tourDiagnostics.ts).
- Existing policy: [Task-based interactive guides](decisions.md), especially manual Help entry and review-only persistence actions.
- Original baseline: **33 helper tests passed** before repair. The current helper suite has 49 tests and is supplemented by runner/hook regressions, real Joyride/modal integration, page contracts, and browser evidence.
- Installed dependency source confirms the STOP/CLOSE event behavior described below. Dependency files are evidence, not files to modify.

## Original prioritized defects (repaired)

P1 blocks acceptance of the repair. P2 must be resolved or explicitly shown not to affect supported flows before sign-off.

| Priority | Verified problem | Evidence and consequence |
| --- | --- | --- |
| P1 | Pausing can advance an unfinished task. | `TaskGuideRunner.tsx:239` treats every `STEP_AFTER` except PREV as success. Installed Joyride emits `STEP_AFTER` for a controlled paused tour (`node_modules/react-joyride/src/hooks/useControls.ts:199`, `useLifecycleEffect.ts:394`). The runner itself sets `run=false` during transitions and modal coverage. |
| P1 | Escape advances instead of consistently exiting. | `joyrideTour.ts:15` uses `dismissKeyAction: close`; Joyride's `close()` advances the index. The runner accepts CLOSE as completion. Application modal Escape listeners can also receive the same key. |
| P1 | Readiness checks a parent while the spotlight needs its child. | `TaskGuideRunner.tsx:73` waits for `waitFor` instead of checking both prerequisite and actual target. Optional missing children then reach a retry branch that aborts without honoring `skipIfMissing` (`:229`). Empty room/faculty lists and missing unassigned classes expose this. |
| P1 | Required actions can persist real data and still report success on failure. | Sections and curriculum require form submission (`Sections.tsx:386`, `CurriculumListPage.tsx:360`); generator requires Apply curriculum (`YearLevelGenerateScheduleWorkflow.tsx:1813`). Captured submit/click events are recognized before application success (`taskGuide.ts:373`). This conflicts with the documented review-only policy. |
| P1 | Several guide paths do not match the page. | Curriculum omits required Effective School Year and offers Create instructions to read-only users. Manual Plotting can close the panel it needs next. Generator replay always assumes Configuration despite restoring stages 1–4. See workflow matrix below. |
| P1 | Interactive tasks inherit a tooltip-only keyboard focus trap. | Joyride's `Step.tsx:44` enables its trap by default; task options do not disable it. Required page controls sit outside that scope. Modal-contained tours add another focus boundary. Source confirms the conflict; browser testing must establish the final interaction. |
| P2 | Transitions and waits can outlive their step or tour. | Readiness runs in both `goToStep` and a step effect. There is no cancellation signal or transition token; Back does not clear the pending 520ms advance. The unused `reveal` feature can click after its pending wait ends, even after unmount. |
| P2 | Back can leave the guide waiting invisibly behind a modal. | Back changes only guide index. `waitForElement` repeatedly extends its deadline while a matching target is covered (`taskGuide.ts:202`), with no visible recovery. |
| P2 | Completion and startup behavior differ between runners. | `useWorkflowGuide.ts:151` and `:217` auto-start unseen guides despite the manual-entry decision. Review mode marks done at startup; action mode marks dismissed tours done. Review mode also drops initially invisible steps. |
| P2 | Modal and target identity are inconsistent. | `taskGuide.ts:99` ignores all alertdialogs, including real approval/session dialogs. `queryVisible` finds a reachable match, but Joyride receives a selector and can resolve a different first match. |
| P2 | Presentation and diagnostics miss important failures. | Custom tooltip lacks linked accessible title/description; diagnostic coverage queries the default tooltip class instead of the custom one; unmount does not stop diagnostic RAF. The later pulse rule overrides the earlier reduced-motion rule. Short-screen clipping remains a browser hypothesis. |

## Behavioral decisions for implementation

1. **Help starts and restarts the guide.** Remove automatic startup. Keep the existing Help buttons; register readiness and report loading/unavailable status so a click is never silently lost.
2. **One runner owns progress.** Review-only steps use `action: complete` in the same runner. Remove the separate legacy path after proving compatibility. Keep stable guide/step IDs and snapshot the applicable context when Help starts.
3. **Completion is truthful.** Only finishing all applicable instructions means completed. Exit, Close, Escape, route departure, and replacement by another tour never imply completed. Use versioned per-user records that distinguish completed from dismissed and include the applicable guide variant; completing one generator stage's help does not complete every stage. Treat old v3 booleans as legacy seen state, not verified completion. Without a user identity, keep status in memory rather than sharing the `current` fallback. Storage failure must not break Help.
4. **Domain persistence actions are review-only.** Save, Submit, Approve, Delete, Apply curriculum, immediate-save instructor choices, and launching a generation job must never be required to finish a guide. Explain their effects and leave execution to the normal UI. Finishing help means the explanation was reviewed, not that records were saved. Keep all existing confirmations and server validation. User-initiated reversible UI preferences and the guide's own outcome storage remain allowed.
5. **Action steps describe a result.** Opening a picker is different from selecting a section. A toggle step checks the desired open/closed state. Filters validate the instructed value, not any nonempty default. Text steps validate on committed input/blur or explicit Next after validation, so typing one character does not dismiss the instruction.
6. **Unavailable is not successful.** A disabled control may be loading, locked, or missing a prerequisite. Use the page's existing state to distinguish these. Already valid values may allow Next; transient disabled states do not. Optional absent steps are not applicable; required absent steps show a reason with Retry and Exit.
7. **Help preserves user work.** Back never undoes saved data, submits a form, clears selections, or resets wizard drafts. Inside a form it moves among available fields. Crossing back to a covered page control shows a close-form/retry explanation without silently closing the form. Generator help stays within the current wizard stage and ends at that stage's normal Continue/Generate/Save explanation.
8. **Nested workflows have explicit boundaries.** The builder explains the generator launch as a review step; generator Help is started from its own existing button. Opening a separate workflow ends or suspends the current presentation without falsely completing it. Do not promise automatic parent resume or maintain two active overlays.

## Implemented design and acceptance specification

The phases below describe the implemented design. The verification record distinguishes completed checks from remaining environment coverage: the whole repository is not green, and native 200% browser zoom, touch hardware, Firefox, and WebKit were not tested. These are not represented as passing checks.

### Phase 1 — Reproduce failures before changing behavior

Use existing Vitest and Testing Library. Add focused tests beside the shared runner/hook; do not add another test framework for component tests.

- Reproduce STOP/pause advancing, Escape advancing, parent-present/child-missing handling, dismissal persistence, and Back racing the advance timer.
- Exercise the installed Joyride component's real STOP/CLOSE contract in at least one integration test; a mocked event stream alone cannot prove the library integration works.
- Establish fixtures for empty rows, delayed data, prefilled fields, disabled actions, an open modal, duplicate hidden controls, and an invalid/rejected form operation.
- Record the expected flow for each guide in the matrix below. Preserve the current 33 helper checks, but correct tests that enshrine blanket alertdialog exclusion or disabled-as-success behavior.

Exit criterion: a small regression suite demonstrates the shared defects and has explicit expected outcomes. Run it during the next phases until every regression passes.

### Phase 2 — Fix shared progress, cancellation, and target handling

Primary files: `useWorkflowGuide.ts`, `TaskGuideRunner.tsx`, `taskGuide.ts`, `joyrideTour.ts`.

- Consolidate the two execution paths into the existing runner. Keep a single owner for active index, status, listener, wait, and advance timer; ordinary React state/refs are sufficient.
- Accept explicit NEXT/PREV only when the current step permits them. Ignore STOP, UPDATE, positioning, and coverage events for completion. Close/Skip/Escape dismiss. Guard index bounds and duplicate events.
- Add cancellation to `waitForElement` and a run/transition token. Cancel pending waits, observers, listeners, and timers on every transition, restart, exit, route change, session loss, and competing tour. Ignore all stale async results.
- Remove arbitrary delayed selector `.click()` behavior. If an existing local UI action must reveal a panel, invoke a known safe page action with current-run checks; it must not persist data.
- Treat `waitFor` as a prerequisite, then resolve the actual visible, reachable target. Pass that same resolved element to Joyride so the readiness check and spotlight agree. Re-resolve after target replacement.
- Apply optional/required absence policy consistently at initial preparation, after target loss, and after Joyride target errors. Show waiting/recovery UI with Exit, anchored to the Help control or active dialog rather than the missing target. A covered target must not extend an invisible wait indefinitely.
- Include real dialogs and alertdialogs when determining the topmost active layer; account for hidden/inert state and actual stacking rather than assuming DOM order. Exclude only the guide's own elements. Session expiry terminates the guide and releases focus/observers.
- Remove auto-start and unify versioned outcome storage. Manual restart always works, including after completed, dismissed, aborted, or storage-unavailable sessions.

Exit criterion: all Phase 1 regressions pass; pausing never changes completion or index, only the newest transition can show a tooltip, and no required missing target silently aborts.

### Phase 3 — Repair every page's steps and prerequisites

Use existing loading/error/capability state and add precise `data-tour` hooks where necessary. Do not use broad first-button/first-select selectors when the instruction refers to a specific control. Build branches from actual state at Help start; a changed workflow invalidates stale instructions explicitly.

| Guide ID | Existing scope | Required repair and acceptance case |
| --- | --- | --- |
| `rooms` | Secretary Facilities | Wait for room loading/error state; target the current building/grid/list control. Empty buildings or filtered-empty results get useful review guidance. Restart works while a building is already open. |
| `instructors` | Secretary Instructors | Wait for faculty data; target the intended search/filter/details control in the saved List/Grid view. No-result and details-already-open states remain usable. |
| `course-list` | Secretary, Program Head, Dean Courses | Wait for data/error state; validate search without advancing on the first keystroke. Table review works for populated, empty, and failed loads. |
| `sections` | Secretary, Program Head, Dean Sections | Use existing `canManageSections`, program, and semester readiness. Keep read-only users in browse help. Creation explains every required field and ends with review-only Save. Where the reused page requires Department, explain it before Program. Invalid or failed saves never become tour success. |
| `curriculum` | Existing VPAA, Dean, Secretary, Program Head routes | Gate management instructions by `canManageCurriculum`. Creation covers Name, Code, applicable Program, and required Effective School Year (`CurriculumFormModal.tsx:78`, `:168`). Read-only users receive browse help. Secretary Import help explains the existing route handoff and ends at that boundary; it must not imply that a file was imported. |
| `course-teaching` | Secretary/Program Head Course Assignment | Replace the stale first-select instruction (`CourseTeachingAssignments.tsx:133`) with precise year buttons, Course filter, and optional Teaching Program steps. Teach eligible selection, hidden/empty selections, and review-only Save. Preserve current selection and the planned Course Assignment redesign. |
| `instructor-assignment` | Secretary/Program Head Instructor Assignment | Branch for department overview, selected department, and `?department` deep link. Respect saved List/Grid mode. Explain no eligible faculty, all assigned, and locked states. Immediate-save choices stay review-only. |
| `cross-department-assignment` | Secretary/Program Head Cross-Department | Reuse the same workspace-state handling while retaining delegated-course scope and approval locks. Empty incoming work and completed assignment have explicit explanations. |
| `schedule-builder-plotting` | Builder draft/revision/completed states | Confirm actual section selection rather than picker click. Check whether Manual Plotting is already open before asking to reveal it (`SchedulerPanel/index.tsx:36`, `TimetableGrid/index.tsx:180`). Explain generator launch separately, review timetable, and keep submission review-only. |
| `schedule-builder-faculty-assignment` | Builder approved/faculty_assignment/reassignment states | Confirm section context. Explain Auto-Assign as a separate review workflow. Handle all-assigned/locked states and optional missing unassigned classes without aborting. Opening assignment dialogs must not advance unfinished steps. |
| `schedule-builder-review` | Builder remaining states | Review the existing selected section and permitted next action. Avoid requiring an unnecessary section change. End/restart cleanly when schedule status changes the applicable guide. |
| `schedule-generator` | Builder generator modal | Choose help for the current restored stage and run state; never reset the draft to replay help (`YearLevelGenerateScheduleWorkflow.tsx:535`, `:1493`). Configuration explains immediate curriculum/settings persistence accurately. Each stage ends with its normal Continue/Generate/Save control as review-only. Cover queued/running, partial, blocked, failed, cancelled, and successful results; remove the five-minute wait for Save. |

For generator copy, distinguish **applying curricula/settings**, **creating a server generation run**, and **saving generated timetable drafts**. Update tour copy, per-stage `helpText`, and related explanatory help together. The existing blanket promise that nothing is saved before the last step is false (`YearLevelGenerateScheduleWorkflow.tsx:1791`, `:1862`; actual assignment in `YearLevelCurriculumSelector.tsx:144`).

Exit criterion: every matrix row has a tested normal path and explicit empty/locked/error behavior. No guide requires a persistent mutation, highlights a missing control, or describes a different control from the one highlighted.

### Phase 4 — Make controls, keyboard access, and placement reliable

Primary files: `TaskTooltip.tsx`, `onboarding.css`, shared options, and only the modal integration needed for correct focus behavior.

- For interactive page steps, disable tooltip-only trapping and use correctly labeled nonmodal guidance. Give the tooltip linked title/description IDs and a clear way to focus the highlighted control.
- For modal-contained steps, keep tooltip controls and the target in one supported focus scope, using the active modal/portal boundary rather than competing traps. Verify the solution against the existing shared Modal and the generator. Preserve ordinary modal accessibility.
- Escape exits help first without also closing the underlying form. Return focus to the invoking Help control, or a sensible connected fallback when that control is gone.
- Keep required controls visible, clickable, and keyboard reachable. Verify target replacement, menus, nested scrolling, sticky headers, scroll/resize tracking, and overlay stacking. Do not solve obstruction only by raising z-index.
- Fit tooltip content and footer in narrow and short viewports; allow appropriate scrolling/wrapping. Keep Exit reachable at 320px width and 200% zoom. Put reduced-motion overrides after conflicting animation rules.

Exit criterion: keyboard users can complete all nonmutating tasks, modal focus remains coherent, and the tooltip never prevents the required interaction at the supported viewport sizes.

### Phase 5 — Make failures observable and verify the whole system

Extend the existing opt-in diagnostics rather than adding telemetry infrastructure. Record guide/variant, step, expected/resolved target, outcome/reason, wait duration, and positioned tooltip/target geometry. Measure the actual custom tooltip after it renders; an unavailable measurement is not a successful placement check. Stop diagnostics on every cleanup path. Avoid logging field contents, account details, or other private data.

Run verification in this order:

1. Focused helper, runner, hook, and tooltip tests, including real Joyride event integration.
2. Relevant page/component tests for changed guide branches; avoid mocking away the guide in every integration case.
3. `npm test`, `npm run build`, and `npm run lint`. Record pre-existing failures separately, with evidence; do not silently dismiss new failures as baseline issues.
4. Authenticated browser acceptance for all 12 guide IDs and every applicable role/variant in the matrix.

Browser acceptance must include:

| Dimension | Required checks |
| --- | --- |
| Data and prerequisites | Normal seeded data; empty/filtered-empty data; one choice/prefilled values; loading delay and error; disabled/locked controls; no active semester/program/curriculum where applicable. |
| Lifecycle | Start, finish, Exit, Close, Escape, Back during auto-advance, repeated Help, restart while waiting, refresh/revisit, route departure, session expiry, and replacement by another guide. |
| Workflow context | Generator stages 1–4 and every supported run outcome; builder status branches; instructor department deep links and List/Grid; modal already open; target removed/replaced; stacked confirmation dialogs. |
| Input and presentation | Mouse/touch and keyboard-only; 1440×900 and 1366×768 desktop; 390×844 and 320×568 narrow screens; 200% zoom; reduced motion; nested scrolling and resize. Smoke-test other browsers the project supports. |
| Persistent effects | Inspect network and before/after records while starting, progressing, exiting, and restarting help. Guide controls must not save, submit, approve, delete, apply settings/curricula, or launch jobs. Separately test normal app operations' validation/API failure without false tour success. |

Use isolated test accounts and seeded data for operations that intentionally exercise normal application saves. Frontend-only guide fixes do not require backend changes; if a backend defect is reproduced, track it separately with its own regression and scope.

Capture a verification record containing guide ID/variant, role, route, data state, viewport, input method, expected/actual outcome, screenshot or recording, and unresolved defect. Store evidence under `docs/tour-guide-repair/` and update this plan with actual results. Do not label a row passed based only on a helper test.

## Definition of done

- All 12 guide IDs have recorded role/state coverage, and every normal supported path finishes.
- Unavailable prerequisites explain why and provide usable Retry/Exit or the appropriate review path.
- No false completion, duplicate advance, indefinite invisible wait, unexpected auto-start, or stale overlay.
- Every spotlight points to the same visible, reachable element that readiness validated; required controls remain usable.
- Help never requires or initiates domain/settings/job mutations; copy accurately explains actions that save immediately. Normal reversible UI preferences remain usable.
- Back/restart/Exit/Escape preserve user work and behave consistently through page and modal transitions.
- Focus, accessible naming, reduced motion, narrow/short viewports, and zoom checks pass.
- All owned waits, timers, observers, event listeners, portals, and diagnostic RAF stop after termination.
- Required automated checks pass, and browser evidence covers the matrix with no unresolved P1 defects or unassessed P2 findings.
- Update the existing onboarding decision and dashboard with implemented behavior and evidence. Do not claim the Tour Guide works end to end until these checks have actually passed.

## Suggested delivery units

1. Shared regression tests, runner/event/target fixes, manual startup, and truthful outcomes.
2. Page repairs across all 12 guides, including safe mutation boundaries and stage-aware generator help.
3. Focus/placement/accessibility corrections, diagnostics, complete browser verification, and final documentation.

Keep these units reviewable, but release acceptance applies to the whole matrix. A working demo of one guide is not evidence that the entire Tour Guide has been repaired.
