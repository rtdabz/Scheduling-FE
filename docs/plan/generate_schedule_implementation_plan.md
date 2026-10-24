# Generate Schedule Reliability and Configuration Implementation Plan

Date: 2026-10-09 (Asia/Shanghai)

Status: Review and planning complete; awaiting user approval. No implementation phase is complete. This document proposes focused improvements for Claude Code to implement after approval.

## 1. Objective and completion criteria

Improve the correctness and reliability of the existing Generate Schedule workflow, including configuration, preview generation, draft review, saving, and queued-run recovery. Preserve the working scheduling engine and intended scheduling behavior.

Completion means:

- Saving a generated result replaces only the approved generation scope and never removes unchecked courses accidentally.
- Configuration has a consistent meaning from setup through generation, review, save, and reopening the workflow.
- Synchronous and queued generation enforce equivalent applicable validation and return useful failures.
- Queued work rechecks current authorization and scheduling eligibility before computing a preview.
- Feasibility checks do not reject a feasible configuration because they counted unrelated days, delivery modes, or schedules.
- Draft review checks complete meeting groups and does not silently skip invalid input.
- Saved defaults and delivery choices survive normal navigation and appear accurately in the generated request.
- Cancellation, restoration, polling, and terminal status updates handle asynchronous races reliably.
- Existing permissions, scheduling rules, recommendation behavior, transactional saves, history, and manual instructor assignment remain compatible.
- Focused regression tests and final acceptance checks demonstrate the approved behavior.

This is a reliability plan, not a replacement solver, recommendation-engine redesign, or general application refactor. Proposed behavior decisions remain subject to approval.

## 2. Baseline established from current code

The inspected application checkout is `C:/Users/toman/Web-Based-Intelligent-Conflict-Detection-and-Recommendation-System-for-Academic-Scheduling`. The chat's Laragon directory contains artifacts rather than this application checkout. Use the confirmed application checkout for implementation.

The document-creation checkpoint is Git HEAD `67c86c49`. Findings concern the implementation inspected during the preceding review, including its working-tree state; they are not a production deployment certification. Record a fresh commit and working-tree baseline before implementing, and preserve any intervening or unrelated work.

Review followed `AGENTS.md`, started documentation discovery from `docs/DASHBOARD.md`, and inspected the relevant scheduling rules, decisions, implementation, and tests. The recommendation implementation plan provides the format for this document; its completed phases do not imply completion of any phase below.

| Area | Relevant implementation | Review responsibility |
|---|---|---|
| Wizard orchestration | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/YearLevelGenerateScheduleWorkflow.tsx` | Selection, effective rules, request construction, review, replacement scope, final save |
| Course configuration | `GenerateSchedule/SetupCoursesStep.tsx`, `GenerateSchedule/courseClassConfig.ts` under the same frontend directory | Defaults, durations, session shapes, delivery choices, navigation |
| Run lifecycle | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/hooks/useGenerationRun.tsx` | Queue creation, cancellation, restoration, polling, stale responses |
| Generation endpoints | `backend/app/Http/Controllers/Scheduling/ScheduleRecommendationController.php` | Validation, normalization, synchronous/queued parity, run reconciliation |
| Queued preview | `backend/app/Jobs/GenerateYearLevelSchedulePreview.php` | Fresh authorization, scope, eligibility, requirements, terminal result |
| Course selection | `backend/app/Services/Scheduling/Generation/GenerationCourseSelection.php` | Explicit course membership and legacy configuration normalization |
| Feasibility | `backend/app/Services/Scheduling/YearLevel/YearLevelFeasibilityService.php` | Day, duration, delivery, occupancy, and resource accounting |
| Draft review | `backend/app/Services/Scheduling/Generation/GenerationDraftReviewer.php` | Input validity, per-row constraints, complete-group constraints |
| Save boundary | `backend/app/Http/Controllers/Scheduling/ScheduleController.php` | Authorized replacement, locked validation, transaction, rollback, history |
| Shared policies | Existing authorization, eligibility, course-rule, constraint-kernel, requirement-building and scheduling-policy services | Reuse authoritative rules rather than duplicate them |

The review used targeted tests and temporary in-memory runtime probes. Those probes establish observed failure cases, but are not committed regression tests. Convert the relevant cases into maintained tests during implementation.

## 3. Current flow and responsibility boundaries

The workflow selects a scheduling scope, configures courses, requests a synchronous or queued preview, reviews generated rows, and saves through the existing schedule batch route. Some department settings persist immediately from configuration controls.

| Boundary | Owns | Required improvement |
|---|---|---|
| Configuration UI | Display and editing of selections, defaults, rules and delivery | Preserve choices and construct the same effective configuration used by later stages |
| Authorized generation endpoints | Trusted request validation and normalization | Reject invalid explicit scope consistently before creating work |
| Queued job | Preview computation against current permitted state | Revalidate permission, exact scope and eligibility when execution starts |
| Feasibility and solver | Resource accounting and timetable search | Align accounting with actual constraints; distinguish bounds from proof |
| Draft reviewer | Explain invalid draft rows and groups | Reuse authoritative row and meeting-group validation |
| Batch save | Fresh authorization, final validation, locks and transactional writes | Enforce exact replacement scope and current status under the lock |
| Run lifecycle | Client recovery and server terminal transitions | Prevent late responses and stale updates from undoing newer state |

Extend existing boundaries. A small shared validator or normalization helper is appropriate where parity requires it; a new orchestration framework, service per configuration field, or schema migration is not justified by this review.

## 4. Prioritized issue register

P1 issues should be resolved before relying on Generate Schedule in final acceptance or actual use. P2 issues follow, and remain part of this plan's completion criteria. Evidence labels distinguish reproduced behavior from code-path findings.

| Order | ID | Priority | Issue | Evidence |
|---|---|---|---|---|
| 1 | GS-01 | P1 | A partial result can delete unchecked courses in a fully unplaced section | Runtime reproduced |
| 2 | GS-02 | P1 | Course rules differ between preview, review, save and reopening | Runtime reproduced; persistence intent requires approval |
| 3 | GS-03 | P1 | Synchronous and queued validation diverge; explicit invalid course selection can be silently narrowed | Runtime reproduced |
| 4 | GS-04 | P1 | Queued jobs do not fully recheck authorization and the original eligible scope | Permission case reproduced; other stale-state gaps identified in code |
| 5 | GS-05 | P1 | Feasibility accounting can reject feasible inputs or overstate capacity | Restricted-day false rejection reproduced; other accounting gaps identified in code |
| 6 | GS-06 | P2 | Draft review can report invalid meeting groups or malformed rows as clean | Runtime reproduced |
| 7 | GS-07 | P2 | Regular Online configuration is reconstructed as On-site | Configuration-helper probe reproduced |
| 8 | GS-08 | P2 | Restored duration defaults do not apply to freshly loaded courses | Code-path finding |
| 9 | GS-09 | P2 | Cancellation, recovery and orphan reconciliation have asynchronous races | Code-path finding |

Implement GS-01 first. It is independent of the unresolved rule-persistence decision and has the greatest direct data-loss risk. Do not use a successful preview as evidence that saving it is safe.

## 5. Findings and proposed changes

### GS-01 - Restrict generated replacement to the exact course scope

**Problem and impact:** `ScheduleController` builds its per-section generated course set from create operations. If a replacement section has no generated operations, the missing course set falls back to whole-section replacement. The wizard includes sections with unplaced courses in replacement scope. A fully unplaced section can therefore lose existing unchecked courses even though the user excluded them.

**Evidence:** A batch request contained generated operations for section A, replacement sections A and B, and no explicit delete IDs. Section B contained an excluded course. The response succeeded and the excluded schedule row was absent even when querying deleted rows. This is a destructive scope mismatch, not merely a misleading preview.

**Proposed change:** Carry and enforce the exact approved replacement course scope for every generation section, including sections with zero placements. Never infer whole-section clearing from an absent generated course set. Keep the existing intentional Clear Schedules action explicit and compatible. Validate server-side scope against the authorized selection. Recheck deletion/status eligibility inside the existing locked transaction rather than relying only on earlier reads.

**Tests and exit evidence:** Cover complete results, partial results, one fully unplaced section, unchecked regular and field courses, and schedules omitted from the UI's loaded rows. Preserve the existing no-placements outcome when the entire run has no placements. Verify submitted/approved restrictions, concurrent status changes, atomic rollback, schedule history and instructor-release behavior. Add a separate test proving intentional full-section Clear Schedules still works.

### GS-02 - Keep one effective course-rule policy through the workflow

**Problem and impact:** The wizard's `withoutCourseRules` removes persisted Required Day, consecutive-day and field-course rules on load. Its rule-edit handlers update local state. Generation sends `rule_overrides`, while draft review and `/schedules/batch` do not carry equivalent effective rules. Generation temporarily uses the override through the existing department course-rule service; review/save evaluate persisted rules. Local rule choices are also absent from the persisted wizard draft.

**Evidence:** With a persisted Monday Required Day rule, a wizard-style generation request with cleared overrides and Tuesday allowed produced a successful Tuesday preview. Saving equivalent, minute-normalized rows failed with a `forced_course_day` violation. Conversely, a newly selected local rule may not become a rule enforced by later manual scheduling.

**Intent discrepancy:** Scheduling documentation describes Required Day and field rules as persistent department rules saved immediately. Existing wizard behavior and a frontend test deliberately start without saved Required Days. Neither behavior should be silently declared authoritative without a decision.

**Proposed change:** After approval of persistence semantics, use the same effective rule context for generation, review, save and reopening. Reuse existing course-rule services and final validation. Define how clearing, replacing and concurrent editing of rules behave. Do not weaken final validation to accept a preview, and do not introduce immediate department-wide persistence as an incidental fix.

**Tests and exit evidence:** Set, change and clear each of the three rule types. Cover pre-existing persisted rules, fresh local selections, selected course/section scope, reopening and reload, subsequent manual edits, and a second user changing persisted rules between preview and save. Assert consistent preview/review/save behavior and the approved persistence behavior.

### GS-03 - Align synchronous and queued request validation

**Problem and impact:** The synchronous endpoint validates nested preferred patterns and course delivery-mode values; the queued endpoint validates only their containing arrays. Queued requirement preparation can throw outside the equivalent error handling. Explicit course selection also accepts a nonempty valid subset and silently drops invalid selected courses. Queue configuration validation can accept extra section configurations that synchronous validation rejects.

**Evidence:** An invalid delivery mode returned 422 synchronously but was accepted with 202 by queue creation. An invalid preferred pattern was also accepted by the queued endpoint. An all-invalid course selection returned 422 synchronously and 500 through queue preparation. A mixed active/ineligible course selection resolved only the eligible course instead of reporting the invalid explicit selection.

**Proposed change:** Reuse common applicable validation, scope normalization and expected exception translation before queue creation or synchronous execution. Validate every explicitly selected main course against the active curriculum and period. Require the exact selected section/configuration scope. Preserve deliberate compatibility normalization for ineligible legacy split/hybrid markers and unrelated legacy patterns; existing tests document those cases. Avoid a blanket strictness change across historical payloads.

**Tests and exit evidence:** Run a shared endpoint matrix for invalid nested values/types, stale IDs, course-map keys, mixed valid/invalid selection, missing curriculum/preflight data, duplicate or extra section configurations, and intentional subset selection. Assert useful 422 responses where appropriate and that invalid queued requests create neither a run nor a job. Maintain legacy normalization tests.

### GS-04 - Recheck current permission and eligibility when queued work starts

**Problem and impact:** `GenerateYearLevelSchedulePreview` checks active requester/department/semester state but does not fully recheck generation capability and program authorization. It accepts a nonempty subset of the original active sections rather than requiring the original exact scope. Prepared requirements can also outlive changes to curriculum or scheduling eligibility.

**Evidence:** After queue creation, a requester was changed to a role without the original generation capability and direct permissions were removed. The job still invoked the mocked generator and completed. This demonstrates an unauthorized preview computation; it does not demonstrate an unauthorized batch write, which has separate guards.

**Proposed change:** At job start, reuse `ScheduleAuthorizationService` and `YearLevelGenerationEligibilityService` for current actor and scope checks. Require the originally requested section set. Recheck curriculum/configuration compatibility and refresh necessary prepared requirements rather than trusting stale preparation. Return a useful terminal explanation when the original scope is no longer authorized or eligible; do not silently generate a smaller scope.

**Tests and exit evidence:** Revoke generation capability, change role/program assignment, deactivate or remove one requested section, edit relevant curriculum, change a section to a noneditable approval stage, and deactivate the semester while queued. Confirm no generation call on invalid current state and a recoverable, structured failure. Include a still-authorized unchanged control case.

### GS-05 - Make feasibility accounting match actual generation constraints

**Problem and impact:** Weekly room supply respects allowed days, but occupied-room subtraction can count bookings outside those days. Other paths use default course duration rather than configured per-section duration, assume physical rooms for Online delivery, or omit relevant external replaceable-status occupancy. Target-section occupancy can exclude all replaceable rows even when unchecked courses must remain. Counting start positions as independent placements can also overstate usable capacity.

**Evidence:** A configuration restricted to a free Monday was rejected as `insufficient_room_slots` because occupied Tuesday room time reduced the supply. Additional duration, delivery, retained-course and occupancy discrepancies were identified in the code paths and need maintained reproductions.

**Proposed change:** Compute supply and demand using the same allowed days, effective durations, delivery modes, exact replacement scope, room compatibility and access windows as generation. Count retained unchecked courses as occupancy. Include external schedules that still constrain placement regardless of whether their status makes them replaceable in another context. Treat uncertain bounds as warnings or let the solver decide; a heuristic should not assert impossibility without a sound bound. Do not add a second expensive full search to every preflight.

**Tests and exit evidence:** Use configurations with an independently known feasible timetable. Cover bookings outside allowed days, retained target rows, external draft schedules, per-section custom durations, explicit Online, laboratory room-type requirements, and borrowed-room access windows. Exercise both false-rejection and overstated-capacity cases. Inspect differing per-section day arrays at the API boundary; preserve the UI's deliberate global-day behavior instead of adding a new feature.

### GS-06 - Validate complete draft meeting groups and malformed rows

**Problem and impact:** `GenerationDraftReviewer` evaluates rows individually without the existing complete meeting-group check. Parsing errors can be caught and silently skipped. The review request does not adequately reject inverted time intervals. A clean review can therefore conflict with the final save validator or represent zero checked rows.

**Evidence:** A Split group with unequal partner start times returned an empty issue list during review but failed batch save with `split_group_same_time`. An inverted time interval returned a clean review with `checked_rows: 0`.

**Proposed change:** Reuse existing meeting-group parsing, session interpretation and constraint-kernel group validation. Reject malformed request rows or report explicit blocking issues; do not omit them silently. Review fixes as complete affected groups and preserve atomic application through existing mechanisms. Respect the approved hard rule context from GS-02.

**Tests and exit evidence:** Cover missing partners, unequal Split times, duplicate meeting indexes, incomplete Integrated groups, inverted intervals, invalid references and fixes affecting multiple rows. Compare review and actual batch validation for equivalent rows and state. A clean result must mean the submitted applicable rows and complete groups were checked.

### GS-07 - Preserve Regular course delivery during configuration restoration

**Problem and impact:** The Regular branch of `inferCourseClassConfig` reconstructs delivery as On-site even when the stored course map says Online. Returning from a later wizard step can remount configuration with the wrong display. A subsequent duration-only edit can write the inferred On-site value back into the request.

**Evidence:** A helper probe supplied a stored Regular Online choice and received inferred On-site delivery. The navigation and subsequent-edit consequences follow from the current initialization and synchronization paths.

**Proposed change:** Restore effective delivery from existing configuration and preserve the distinction between automatic selection and explicit On-site. Keep section-specific values when scopes differ; do not collapse them silently. Reuse current configuration helpers and UI conventions rather than add a new domain delivery mode.

**Tests and exit evidence:** Choose Regular Online, advance, go back, and edit only duration. Assert both display and payload remain Online. Cover Auto, explicit On-site, differing section choices, Split/Integrated restoration and reopening an active result.

### GS-08 - Apply restored duration defaults to fresh course configuration

**Problem and impact:** Course setup initializes through configuration inference without applying restored duration defaults. Existing default application runs when values change or are reset. Loading saved defaults alone therefore updates the controls without necessarily updating fresh courses or the generation request. Existing restoration coverage exercises the Friday/Saturday preference but not saved duration values.

**Proposed change:** Derive fresh effective course durations using the existing default-application helper, with displayed values and request values sharing that result. Preserve explicit course overrides, field courses and fixed hybrid shapes. Respect current time increments and operating-day limits. Avoid introducing explicit On-site delivery as a side effect of synchronizing durations.

**Tests and exit evidence:** Save lecture/laboratory defaults, open fresh courses in another eligible scope without an existing draft, and generate without touching the default controls. Assert displayed durations, request payload and generated meeting durations agree. Cover custom overrides, field courses, fixed hybrid shapes, empty course lists and invalid restored defaults.

### GS-09 - Handle cancellation, restoration and reconciliation races

**Problem and impact:** Cancelling before queue creation returns clears the client request identity while no run ID is available. The late creation response is ignored without cancelling the newly created server run. Cancellation failures are swallowed, and a replacement start can proceed despite a failed cancellation. Polling treats 404 as terminal but can repeat 401/403 failures indefinitely. A late restoration response can compete with a manual new start. Server orphan reconciliation can overwrite a newer completed/cancelled state using stale loaded state.

**Proposed change:** Retain cancellation intent while creation is pending, then cancel the returned run. Surface cancellation failure with a recoverable state. Guard restoration and creation responses using the current request generation. Treat permission/authentication failures as actionable terminal polling outcomes. Make orphan reconciliation conditional on current status and staleness, using existing database concurrency conventions. Keep search budgets, polling throttles and timeout policy unless evidence justifies changing them.

**Tests and exit evidence:** Delay queue creation, cancel before its response, fail cancellation, start again, return a late restore, and simulate 401/403 polling. Race reconciliation against worker completion and user cancellation. Confirm terminal results are not overwritten and the UI can recover without hidden duplicate work.

## 6. Configuration and compatibility matrix

| Configuration or behavior | Contract to preserve | Required verification |
|---|---|---|
| Selected courses | Unchecked courses are outside generation replacement | GS-01 exact deletion scope; GS-03 explicit membership validation |
| Partial previews | Existing partial-result behavior remains available | Fully unplaced section does not imply Clear Schedules |
| Clear Schedules | Intentional whole-section clearing remains supported | Separate clear action and generation replacement tests |
| Regular / Split / Integrated | Existing session interpreter and meeting-group rules remain authoritative | Draft/save parity and existing shape tests |
| Delivery | Auto and explicit choices retain their current meanings | Restoration, payload and physical-resource demand agree |
| Durations | Preserve tested current limits and time increments | Saved defaults, explicit overrides and per-section duration accounting |
| Required Day / consecutive / field rules | Persistence and effective scope require a documented approval decision | Generation, review, save, manual follow-up and reopening agree |
| Allowed days and Friday/Saturday preference | Preserve current UI scope and fallback rules | Preflight and solver use the same effective allowed days |
| Preferred room / laboratory room type | Preserve compatible-resource and access rules | Physical supply and generation agree |
| Sunday and laboratory setting controls | Current handlers persist through the scheduling-settings API immediately | Accurate save timing, failure handling and restored settings |
| Recommendations | Existing engine, explicit adjustment selection and fallback tiers remain compatible | Existing recommendation and generation-adjustment tests pass |
| Approval / access / semester / program scope | Existing authorization and stage guards remain authoritative | Queue execution and final save both check current state |
| Instructor assignment and history | Manual assignment, release and history retain established behavior | Replacement, rollback and history regression tests |

Documentation discrepancies to resolve after the relevant implementation is verified:

1. Some earlier configuration documentation describes a weekly course-unit duration ceiling. Current tests and scheduling policy allow Regular custom duration up to the operating-day limit and independently limit Integrated components. Do not reintroduce the older aggregate limit as a reliability fix; document the supported behavior after confirming the current tests.
2. The guide's broad claim that nothing is saved until the final step conflicts with Sunday and laboratory setting controls that PATCH settings immediately. Document the actual timing and the approved rule-persistence decision.
3. Do not restore deprecated Online/field concurrency quotas from stale wording. Confirm applicable current policy and tests when updating those passages.

## 7. Decisions requiring approval before dependent implementation

### D1 - Course-rule persistence and effective context

Approve one explicit behavior for Required Day, consecutive-day and field-course rules:

- **Persistent department rules:** configuration edits update the authorized department rule set through existing settings behavior, and preview/review/save use that set. Define how existing rules are loaded and how concurrent updates invalidate a preview.
- **Run-scoped overrides:** wizard choices belong to the run, survive its restoration, and are validated consistently during preview/review/save. Define their relationship to persisted rules and later manual edits before implementation. Run overrides must not become a way to bypass an established hard department constraint accidentally.

The first option aligns with the cited persistent-rule documentation; current wizard initialization suggests a different intent. This review does not settle that product decision. A clean review and save must use the approved effective rules in either case.

### D2 - Approve exact generation replacement scope

Approve preserving existing replacement behavior only for explicitly selected eligible courses in the requested sections, including courses that remain unplaced. Existing unchecked rows remain. Whole-section Clear Schedules stays an intentional separate operation. The backend remains authoritative for scope and status.

### D3 - Approve stale queued-request handling

Approve failing with an actionable explanation when original authorization, section scope or configuration eligibility becomes invalid before execution. Do not silently narrow the user's requested run. Recomputing against fresh compatible data can reuse existing preparation, but must not silently change selected configuration.

No automatic schema migration, new permission, new scheduling enum, new endpoint family or recommendation-policy change is approved by this document.

## 8. Ordered implementation phases and exit gates

### Phase 0 - Confirm the approved baseline and behavior decisions

Record commit, working-tree changes, current relevant contracts and narrow test results. Turn the review probes into specific regression cases in the relevant phases. Resolve D1 before changing course-rule persistence. Confirm D2 and D3 and record the approved interpretation here.

**Exit:** Approved scope and decisions are recorded; the implementer knows which existing work to preserve. No policy conflict is silently resolved.

### Phase 1 - Protect generated replacement and final save (GS-01)

Implement exact replacement scope and fresh locked deletion/status checks through the existing save boundary. Preserve Clear Schedules and established history/instructor behavior.

**Exit:** Partial and fully unplaced-section tests prove unchecked schedules survive; intentional clearing still works; rollback and stage guards pass. This is the first implementation priority.

### Phase 2 - Align rules and endpoint validation (GS-02, GS-03)

Implement the approved effective rule policy across generation, review, save and restoration. Share applicable synchronous/queued validation and reject invalid explicit scope while preserving deliberate legacy normalization.

**Exit:** Equivalent supported payloads produce equivalent validation outcomes, invalid requests create no queued work, and effective rules agree across all stages and reopening.

### Phase 3 - Validate queued state and repair feasibility accounting (GS-04, GS-05)

Recheck authorization and exact eligible scope when jobs start. Refresh required compatible inputs. Correct resource arithmetic and distinguish uncertain estimates from definitive blockers.

**Exit:** Revoked or stale invalid scope never reaches generation; known feasible restricted-day cases pass; duration, delivery and retained occupancy are covered.

### Phase 4 - Correct draft review and configuration restoration (GS-06, GS-07, GS-08)

Validate complete groups and malformed rows through existing authoritative helpers. Preserve delivery choices and apply saved duration defaults to fresh courses without overwriting explicit configuration.

**Exit:** Draft/save validation agrees for the new cases; navigation and reload preserve intended choices; displayed defaults match request and generated durations.

### Phase 5 - Stabilize queued lifecycle and recovery (GS-09)

Handle pending-creation cancellation, visible cancellation failures, late restore/creation responses and terminal authorization failures. Protect server terminal transitions from stale reconciliation.

**Exit:** Controlled asynchronous tests demonstrate no orphan caused by late creation, no silently lost terminal state, and usable recovery from cancellation and permission failures.

### Phase 6 - Final acceptance, compatibility and documentation

Run focused backend/frontend suites, relevant type/build checks, real-browser workflow checks, and production-like queue/concurrency checks. Update only the documentation affected by verified behavior. Record commands, counts, limitations and any explicitly deferred work.

**Exit:** Approved issues are resolved with evidence; grouped frontend tests pass reliably or a diagnosed limitation is explicitly accepted; production-like checks cover behavior that synchronous SQLite tests cannot establish. No unrelated module refactor is included.

## 9. Verification matrix and existing test foundations

Add meaningful failure-case regressions to existing suites rather than duplicate every implementation branch. Tests should fail before the corresponding fix and assert the user-visible contract or database effect.

| Coverage | Existing foundation | Missing cases to add |
|---|---|---|
| Replacement and save | Year-level generation and batch-save feature coverage | GS-01 fully unplaced section, unchecked rows, explicit clear, locked status race |
| Rule consistency | `ConsecutiveDaysYearLevelGenerationTest`, `SchedulingSettingsControllerTest`, workflow tests | GS-02 temporary/persisted rule parity, reopening, concurrent rule change |
| Request validation | `YearLevelQueuedGenerationTest`, `GenerationCourseSelectionTest` | GS-03 sync/queue payload matrix and invalid explicit membership |
| Queued eligibility | `YearLevelQueuedGenerationTest` | GS-04 permission, scope and curriculum changes after queue creation |
| Resource accounting | Failure diagnostics, physical-room exhaustion and generation tests | GS-05 allowed-day accounting, configured durations, Online and retained schedules |
| Meeting groups | `GenerationDraftReviewTest`, `HybridShapesAndPreferredRoomTest`, `EngineParityMatrixTest` | GS-06 complete-group review/save parity and malformed rows |
| Configuration restoration | `courseClassConfig.test.ts`, `SetupCoursesStep.test.tsx`, workflow tests | GS-07 delivery navigation; GS-08 untouched restored duration defaults |
| Lifecycle | `useGenerationRun.test.tsx`, queued generation tests | GS-09 delayed responses, cancellation failures, auth polling and reconciliation races |
| Recommendation compatibility | Generation-adjustment, consecutive-day, balanced-pair and engine parity suites | Approved fixes preserve existing adjustment interpretation and fallback behavior |

Final manual/operational acceptance should include:

- A representative complete timetable with Regular, Split and Integrated courses and permitted delivery choices.
- A partial result with a fully unplaced section and retained unchecked courses, followed by actual save and history inspection.
- Rule changes, configuration navigation, saved defaults, reopen/reload and save rejection after a meaningful stale-state change.
- A real asynchronous worker: delayed start, cancel while creating, worker delay, permission revocation, stale scope and restored run.
- Concurrent final save/status changes and terminal run transitions against the production database engine, using isolated test data.
- Borrowed-room/access-window and constrained-room cases with a known valid placement.

Do not test writes or clearing against live schedules merely to reproduce a bug. Use isolated fixtures or an approved test environment.

## 10. Risks, compatibility and recovery

| Risk | Mitigation |
|---|---|
| Restricting deletion accidentally changes intentional clearing | Distinguish action intent; test generated replacement and Clear Schedules independently |
| Rule fix changes department-wide behavior without agreement | Resolve D1 first; keep final hard validation authoritative |
| Strict validation breaks supported historical payloads | Preserve documented/tested legacy normalization; validate explicit main selections distinctly |
| Fresh queue checks silently alter a request | Require exact scope and compatible configuration; fail clearly when intent cannot be preserved |
| Feasibility fix weakens hard rules | Correct accounting while keeping solver and final validators authoritative; warnings do not waive constraints |
| UI fixes overwrite Auto or custom settings | Reuse effective configuration/default helpers and test payloads after navigation |
| Lifecycle changes overwrite newer state | Guard late client responses and use conditional server transitions |
| SQLite/synchronous testing misses production races | Add isolated real-worker and production-database checks before final acceptance |
| Broad refactor conflicts with completed Recommendation work | Keep changes inside Generate Schedule and directly shared contracts required by these fixes |

Keep implementation phases reviewable. If a regression appears, revert only the responsible phase's changes while preserving unrelated work. Do not add database fields or dependencies preemptively. Record any required contract extension and its compatibility handling before adopting it.

## 11. Review verification evidence and limitations

The preceding planning review ran these targeted checks; they are baseline evidence, not proof of completed fixes:

| Check | Result |
|---|---|
| Backend targeted subset A | 68 tests passed, 594 assertions |
| Backend targeted subset B | 117 tests passed, 804 assertions |
| Backend total across the two subsets | 185 tests passed, 1,398 assertions |
| Frontend grouped Generate Schedule and run-hook suites | 201 of 202 tests passed; one workflow test exceeded its 5-second timeout |
| Isolated rerun of the timed-out workflow test | Passed in approximately 0.99 seconds; 22 other tests skipped by the name filter |
| Temporary in-memory probes | Reproduced GS-01, GS-02, GS-03, the GS-04 permission case, GS-05 restricted-day rejection and GS-06 review gaps |
| Configuration helper probe | Reproduced GS-07 Regular Online reconstruction as On-site |

Backend subset A used:

```text
YearLevelQueuedGenerationTest|GenerationCourseSelectionTest|HybridShapesAndPreferredRoomTest|GenerationDraftReviewTest|ConsecutiveDaysYearLevelGenerationTest|DayCategoryConstraintParityTest|SchedulingSettingsControllerTest
```

Backend subset B used:

```text
YearLevelGenerationFailureDiagnosticsTest|YearLevelSearchRestartTest|ConsecutiveDaysGenerationTest|EngineParityMatrixTest|PhysicalRoomExhaustionTest|DefaultLectureLabGenerationTest|GenerationAdjustmentInterpreterTest|BalancedSplitDayPairsTest
```

Both used `php vendor/phpunit/phpunit/phpunit --do-not-cache-result --filter <subset>` from `backend`, with the testing environment, in-memory SQLite, array cache and synchronous queue configuration. The synchronous queue test environment does not establish real-worker timing behavior.

Frontend grouped command from `wicars-ui`:

```text
npm.cmd test -- src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule src/pages/ClassSchedules/SchedulerPanel/hooks/useGenerationRun.test.tsx
```

The timed-out test was `leaves an unchecked course out of the run and sends the Friday + Saturday default` in `YearLevelGenerateScheduleWorkflow.test.tsx`. Its isolated pass is useful diagnostic evidence, but the grouped run remains non-clean. Diagnose the cause before changing timeout policy; do not treat the isolated rerun as a full suite pass.

Production queue operation, real-browser end-to-end behavior, concurrent MySQL behavior and a complete production build were not verified by this review. GS-08 and GS-09 remain code-path findings pending dedicated reproductions. Passing existing tests does not cover the newly reproduced failure cases.

## 12. Implementation checklist and Claude Code handoff

- [ ] User approves this plan and records D1-D3 decisions.
- [ ] Phase 0 baseline and compatibility contracts are recorded.
- [ ] GS-01 exact replacement and locked save checks are implemented and tested first.
- [ ] GS-02 effective rule context and approved persistence behavior are implemented and tested.
- [ ] GS-03 synchronous/queued validation parity and explicit selection checks are implemented and tested.
- [ ] GS-04 current queued authorization and exact eligibility checks are implemented and tested.
- [ ] GS-05 feasibility accounting is corrected and tested against known feasible cases.
- [ ] GS-06 complete draft-group and malformed-input validation is implemented and tested.
- [ ] GS-07 delivery restoration is implemented and tested through navigation and reopening.
- [ ] GS-08 saved duration defaults are applied and tested without incidental overrides.
- [ ] GS-09 cancellation, recovery and conditional reconciliation are implemented and tested.
- [ ] Relevant backend/frontend, type/build and compatibility checks pass.
- [ ] Real-worker, browser and production-database acceptance evidence is recorded.
- [ ] Verified behavior and resolved documentation discrepancies are documented.
- [ ] Final scope, remaining risks and any approved deferrals are reviewed.

Claude Code should follow `AGENTS.md`, inspect the current relevant code before each phase, reuse existing services, and keep implementation limited to approved Generate Schedule work. This document is a handoff for future implementation, not authorization to start implementation before the user's approval. Do not mark phases complete based only on this review or existing passing tests.

## 13. Future implementation evidence record

No implementation evidence has been recorded yet. Append an entry after each verified phase using the following fields:

- Phase and completed issue IDs.
- Approved behavior/decision references and any scope change.
- Changed files and concrete before/after behavior.
- Regression cases added, commands run and actual results.
- Compatibility and operational checks completed.
- Remaining limitations, risks or approved deferrals.
- Exit-gate status and next-phase handoff.

Keep findings and priorities stable by issue ID. Update this plan when approval changes an assumption; do not append contradictory behavior decisions without resolving the earlier wording.
