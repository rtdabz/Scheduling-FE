# Schedule Recall and Approval Fix Plan

Date: 2026-11-08  
Status: Implemented 2026-11-08 (uncommitted). Backend and frontend fixes are in place with permanent regressions and a real MariaDB lock check; two-session browser verification is still outstanding. See [Implementation status](#implementation-status).

## Objective

After recall, a Dean or VPAA action must never change a recalled section through its old submission. Resubmitted sections must complete review through their new submission. Open previews and confirmation dialogs must reflect current queue data and stop actions whose scope has changed.

Deliver the backend integrity fix first, then the frontend lifecycle fix. Reuse Laravel transactions, existing department rows, queue mapping, and modal components. No schema migration, workflow version column, new dependency, or general workflow framework is planned.

## Verified findings

| Finding | Evidence | Priority |
| --- | --- | --- |
| Ordinary full recall already blocks approval | Stale named Dean and VPAA requests each returned HTTP 422; meetings remained `revision` and the submission remained `withdrawn`. | Preserve |
| An in-flight action can cross submission revisions | With an already `partially_withdrawn` submission, recall and resubmission between preflight and the lock left its status unchanged. An old Dean request approved the resubmitted section while its new submission remained `pending_dean`. An old VPAA request moved it to `faculty_assignment` while its new submission remained `pending_vpaa`. | P1 |
| An open preview can retain approval controls after recall | Queue refresh replaces `entries`, but `viewEntry`, approval/rejection targets, and the generic confirmation callback retain old entry objects. | P2 |

The review ran 36 backend tests, 38 frontend tests, and four temporary probes with 29 assertions. The probes demonstrated the bug and were removed. These results are baseline evidence, not verification of the proposed fix.

### Root causes

- `lockSubmissionAtStage()` compares the persisted submission status with a previously loaded status. For `partially_withdrawn`, both remain the same even after membership changes.
- `includedSectionIds()` reads a previously loaded relation. Updates then use section IDs captured before the lock.
- Recall computes selected statuses and section-to-submission ownership before its transaction and changes meetings before acquiring a shared workflow lock.
- Resubmission creates a new submission, so locking only the old submission cannot coordinate every affected workflow operation.
- The page keeps copies of queue entries. `ToastContext.confirm()` retains the original callback in a ref, so rerendering the page does not refresh that callback.

## Required behavior

1. Fully recalled sections stay in `revision` until resubmitted and reviewed under their new submission ID.
2. Partial recall preserves approval eligibility for the remaining included sections. Recalled pivots stay withdrawn.
3. A review whose server-side preflight scope or stage changes before mutation returns `409` with `error_code: submission_stage_changed`, without modifying meetings, reviewer data, signatories, or history.
4. An already ineligible submission discovered at initial lookup can retain the current HTTP 422 response. Authorization and input-validation responses remain intact.
5. A stale recall must not silently target a newer submission than the one resolved for that request.
6. Concurrent decisions produce a valid serial outcome. No successful approval or return may update zero meetings or overwrite a newer revision's decision.
7. Once the page knows queue data is stale, approval and return stay disabled until a current reload succeeds.
8. A confirmation authorizes one submission, reviewer stage, and section set. A changed section set requires a new confirmation.

## Phase 1 — Add permanent regression coverage

Files: `backend/tests/Feature/ScheduleApprovalTargetingTest.php` and `backend/tests/Feature/DepartmentScheduleWithdrawalTest.php`. Add one focused concurrency test file only if keeping the interleaving cases together is clearer than extending those fixtures.

- Promote the temporary reproduction into a deterministic test that pauses a review after its initial scope read, performs recall/resubmission, and resumes the review.
- Run the scenario for Dean approval, VPAA approval, Dean return, and VPAA return. For VPAA, advance the resubmitted section through its new Dean review before resuming the old VPAA action.
- Assert the intended rejection and unchanged new-revision state, rather than asserting that the existing buggy response succeeds.
- Use a controlled database query callback or an existing test seam for interleaving; avoid timing-based sleeps. Ensure callback flags and connection state are cleaned up after each test.
- Retain full-recall tests for both roles, valid remaining-section approval after partial recall, and normal reapproval of a resubmitted section.

Exit criterion: the race regressions fail against the current implementation for the expected revision-ownership violation; ordinary recall and approval baselines remain understood.

## Phase 2 — Serialize and revalidate backend workflow changes

Primary file: `backend/app/Http/Controllers/Scheduling/DepartmentScheduleController.php`.

### 2.1 Use one common transaction lock

- Acquire the existing department row with `lockForUpdate()` as the first workflow lock inside each transaction.
- Acquire it before any authoritative plain read inside that transaction, not merely before other locks. Under MySQL/MariaDB repeatable-read, a plain read before waiting can establish an old snapshot; subsequent membership reads must see the post-wait state. Use a lock-first transaction and current locking reads where necessary.
- Apply the same lock boundary to `submitSchedules`, `withdrawSubmission`, `approveByDean`, `returnByDean`, `approveByVpaa`, and `returnByVpaa`.
- Ensure legacy submission creation in `submissionForStage()` occurs inside that boundary. It must not create a submission as an unlocked preflight side effect.
- Pin the semester ID for the operation and use it consistently in reads, updates, and history metadata.
- Keep lock ordering consistent: department first; affected submissions in ascending ID order when multiple rows are locked; then membership/meeting rows in a deterministic order.
- Reuse a small controller-local helper if it removes repeated lock code. Avoid extracting an unrelated workflow architecture.

The department is an existing stable row, including before any submission exists. This coordinates old and new revisions and revision-number allocation without introducing a new lock table. Same-department workflow writes will serialize; other departments retain independent workflow locks. Keep external notifications outside the transaction to limit lock duration.

### 2.2 Revalidate all four review actions

- Treat any preflight scope as an expectation, not an authoritative update target. Make preflight lookups read-only.
- Pin the submission ID once during preflight, including requests that omit `schedule_submission_id`. Under the lock, reload that exact ID; do not rerun "latest pending" and substitute a new revision with matching sections. For legacy meetings with no submission yet, snapshot the candidate scope and create/find its submission under the lock only if that legacy scope remains unchanged.
- After acquiring the lock, load the current scoped submission, included pivot membership, and relevant meeting rows from the database. Do not reuse a cached `sections` relation.
- Compare normalized current included section IDs with the request's server-side preflight section IDs. A change rejects the action rather than silently approving or returning a reduced package.
- Validate the actual meeting stage for the included scope. For `partially_withdrawn`, status alone is insufficient: Dean decisions require submitted meetings and VPAA decisions require Dean-approved/conditionally-approved meetings.
- Require a nonempty eligible meeting set and reject inconsistent or already advanced scope. A repeated or competing decision must not stamp a reviewer over a prior result.
- Recheck open conflicts and Room TBA eligibility against the validated scope before writing. Preserve Room TBA reason requirements and existing conflict responses.
- Update only the validated meeting IDs in the pinned department/semester scope. Derive audit section IDs and updated counts from that same scope.
- Reuse `staleReviewResponse()` for scope/stage changes. Do not record a decision, reviewer timestamp, signature, or success notification for a rejected or zero-row action.

### 2.3 Revalidate recall before changing meetings

- Under the same department lock, reload selected meetings and resolve each section to its latest included submission membership.
- Compare that mapping with any preflight mapping. Reject changed ownership instead of recalling a newer revision unintentionally.
- Recheck every selected section's current recall eligibility, including finalized protection and existing ownership permissions.
- Validate the entire selection before any update. A single ineligible section rejects the whole request.
- Update meetings, faculty-assignment handoff flags, pivot states, and all affected submissions atomically.
- Preserve existing instructor retention, partial/full withdrawal statuses, frozen signatories on full recall, and selected-section history metadata.

### 2.4 Revalidate resubmission and revision allocation

- Move authoritative readiness checks into the shared locked transaction. Reload ready/protected sections and eligible meetings there.
- Preserve the rule requiring all and only ready sections within the caller's authorized scope; do not broaden a Program Head's scope.
- Reject a stale requested selection or an empty eligible set before creating a submission.
- Resolve the parent and allocate the next revision while holding the department lock. Retain the existing revision uniqueness constraint.
- Attach only the validated revised cohort and update meetings in the pinned semester. Avoid creating duplicate or empty pending submissions from competing requests.

### 2.5 Keep transition records atomic

- Write the successful meeting/pivot transition, submission reviewer fields, signatories, audit entry, and history snapshot in the same transaction using the validated scope.
- Move the affected approval/return/recall `recordWorkflowAudit()` calls inside that transaction so another transition cannot change the snapshot before it is recorded.
- Invalidate existing cache groups and publish existing notifications/live topics after successful commit. Rejected actions produce no success effects.
- If bounded transaction retries are used, reload state on every attempt and emit external effects only once after the final successful commit.
- Preserve the current response payload and optional submission-ID compatibility. A new client-supplied version token is not required for the demonstrated race.

Exit criterion: an old submission cannot approve or return meetings belonging to a newer revision, regardless of the recall/review ordering.

## Phase 3 — Keep frontend selections and confirmations current

Primary file: `wicars-ui/src/pages/shared/ScheduleApprovalPage.tsx`.

### 3.1 Derive selected entries from the latest queue

- Store semantic selection identity instead of a copied schedule entry: submission ID plus request type. Preserve transfer identity by transfer ID.
- Resolve the selected preview from the current mapped queue on each render.
- Do not identify a selection by submission ID alone: recalled and active slices can share it. Avoid relying solely on `entryKey`, which changes from `7` to `7:active` after partial recall.
- If the selected semantic slice disappears, close its preview/details. If it remains, render its current status, section set, counts, PDF input, and action availability.
- Preserve room-transfer handling, immutable history previews, PDF signatories, and existing authorization gates.

### 3.2 Use one page-owned approval confirmation

- Expand the existing page-owned Room TBA confirmation to handle ordinary and conditional approval, using the existing `ConfirmModal`.
- Remove this page's dependency on the generic `confirm({ onConfirm })` callback for schedule approval. Leave `ToastContext` and unrelated callers unchanged.
- When opening confirmation, capture the semantic identity, reviewer stage, and normalized sorted section IDs as the approval intent.
- Immediately before posting, resolve the current queue entry and require the same identity, pending stage, and section set, plus current queue freshness.
- If scope or stage changed, cancel the intent and explain that the schedule changed and must be reviewed again. Do not post the old action or silently substitute a newer submission.
- Apply the same intent validation to rejection/return. Preserve a typed reason across harmless same-scope reloads and transient errors, but clear it when the submission or section scope changes.
- Keep Room TBA override reasons required and restricted to the current valid intent.

### 3.3 Gate actions during refresh and recover from stale responses

- Track which request key successfully loaded the queue: cache/scope key, live revision, and explicit reload revision.
- Allow mutations only when that loaded key matches the current requested key. Cached initial data may support viewing, but cannot establish fresh action eligibility.
- A live event or explicit refresh invalidates eligibility immediately. A failed reload keeps actions unavailable and offers the existing retry path.
- Add an optional disabled-confirm prop to existing approval/rejection modal components if needed. Keep cancellation available during refresh and reserve submission spinners for an actual mutation.
- Treat HTTP `409 submission_stage_changed` as a changed workflow: show the backend message, invalidate/reload the queue, and require renewed review. Refresh after a no-longer-pending response as well; retain existing handling for validation/conflict and Room TBA errors.
- Prefer authoritative queue reload after success over unconditionally applying `markEntry()` to a potentially changed slice. Keep existing live-topic publication and success feedback after confirmed server success.
- Prevent duplicate submission while a mutation is running. Late responses must not overwrite a newer queue state or act on a different selection.

Frontend checks only prevent actions against changes the page knows about. The backend lock and revalidation remain the integrity boundary when live events are delayed or missed.

Exit criterion: recall or stage advancement cannot leave an actionable stale preview/confirmation, and harmless refreshes preserve valid review context.

## Phase 4 — Verification matrix

| Scenario | Expected result |
| --- | --- |
| Full recall followed by stale Dean/VPAA approval or return | Rejected; meetings remain `revision`; no decision side effects. |
| Partial recall followed by a fresh review | Only remaining included sections advance; withdrawn sections and their newer submissions are untouched. |
| Recall/resubmit after review preflight but before its lock | Old approve/return receives 409; new submission and its meeting stages remain consistent. |
| Omitted submission ID or legacy fallback during recall/resubmission | The request remains pinned to its original submission/scope; no newer revision is selected as a replacement. |
| Review acquires lock before recall | Recall waits; operations complete in that order; final state reflects recall of the resulting eligible stage. |
| Review waits for the department lock under repeatable-read | Post-wait validation observes current membership/stage, not an earlier transaction snapshot. |
| Competing approval and return; duplicate approval | One valid decision; stale loser rejected; no successful zero-row result or duplicate signature/history. |
| Duplicate resubmission requests | One valid new cohort/revision; no duplicate included membership or empty submission. |
| Stale recall after another recall/resubmission | Changed ownership rejected; newer revision is not silently recalled. |
| Multi-submission recall with one invalid selected section | Entire action rejected; all other sections unchanged. |
| Failure during history/signatory persistence | Entire transition rolls back; no external success effects. |
| Full recall while preview is open | Current data removes action eligibility; missing semantic slice closes the preview. |
| Partial recall while confirmation or reject dialog is open | Old intent is canceled; remaining sections require a new confirmation. |
| Same-scope live refresh | Current preview remains accurate; unchanged intent/reason can resume after successful reload. |
| Live refresh fails, then Retry succeeds | No POST while stale; eligible actions resume only after a successful current reload. |
| Delayed backend rejection after a missed live event | Error shown; queue reloads; no success toast or optimistic decision. |
| Room TBA override and ordinary approval | Both use the same current-scope guard; override reason rules remain correct. |
| Transfer/history preview | Existing actions, read-only behavior, PDFs, and signatories remain correct. |

### Backend checks

Extend the focused tests above, plus cache/history coverage where assertions belong. Run from `C:\Users\toman\backend`:

```powershell
php artisan test --compact --filter='ScheduleApprovalTargetingTest|DepartmentScheduleWithdrawalTest|ScheduleApprovalCacheInvalidationTest|ScheduleSignatoryHistoryTest|ScheduleWorkflowIntegrityTest|ProgramScheduleOwnershipTest|SubmitRequiresDepartmentDeanTest'
```

Include any new dedicated race-test class in that command. Run PHP syntax checks on changed PHP files and review the final diff for authorization and unrelated behavior changes.

The default PHPUnit configuration uses SQLite in memory. Deterministic interleaving tests verify fresh-state decisions, but SQLite does not verify `FOR UPDATE` behavior. Add a focused real-database check using the deployment's MySQL/MariaDB version, separate connections/processes, committed fixtures, and explicit barriers. Exercise both lock orderings, competing decisions, stale recall, and duplicate submission. Use an isolated test database and document the executable setup; do not repoint the ordinary `RefreshDatabase` suite at application data.

### Frontend checks

In `ScheduleApprovalPage.test.tsx`, replace the constant-zero live-revision mock with controlled revisions or real live events for the new lifecycle cases. Include deferred GET/POST responses, changed section sets, both stages, no-POST assertions, reason retention, and current PDF input checks. Reuse existing queue/live-update tests.

Update the preview test stub to respect `canAct`; it currently renders action buttons even when actions are unavailable. Also invoke a previously captured callback explicitly in a focused test to confirm the submit guard blocks stale actions even if a callback outlives its visible control.

Run from `C:\Users\toman\wicars-ui`:

```powershell
npm test -- src/pages/shared/ScheduleApprovalPage.test.tsx src/lib/approvalQueue.test.ts src/lib/liveUpdates.test.ts
npm run lint
npm run build
```

Run related modal checks if shared props change. Separate pre-existing lint/build failures from regressions. Verify in two authenticated browser sessions: hold a Dean/VPAA preview or confirmation open, recall from the schedule workspace, then exercise full recall, partial recall, resubmission, delayed refresh, and retry. Check keyboard focus and disabled-state feedback when a dialog closes or changes eligibility.

## Phase 5 — Documentation and rollout

- Update only the relevant concurrency and stale-action behavior in `docs/plan/schedule_history_workflow.md`; preserve unrelated recall/faculty policies.
- Record test commands, real-database lock evidence, browser outcomes, and any remaining limits in this plan.
- Preserve existing uncommitted signatory/history and frontend work when implementing. Those files already contain changes from other work.
- Deliver the backend fix first. The frontend update can follow because it retains the existing API contract.
- No data backfill or bulk repair is included. Any previously inconsistent revision found during verification should be reported with its IDs for explicit correction.
- If rollback is needed, keep the backend integrity fix where possible. Reverting only the frontend preserves the server guard. A full backend rollback reopens the demonstrated race.

## Expected implementation footprint

| Area | Expected files |
| --- | --- |
| Backend workflow and tests | `DepartmentScheduleController.php`; existing targeting, withdrawal, cache, and signatory/history test files; one focused race/integration test artifact if needed. |
| Approval page and lifecycle tests | `ScheduleApprovalPage.tsx`; `ScheduleApprovalPage.test.tsx`. |
| Existing modal disabled states | `ConfirmModal.tsx` and `ScheduleRejectionModal.tsx`, only if required for independent refresh gating. |
| Documentation | This plan, its dashboard link, and the relevant workflow note. |

Completion requires permanent regressions, serial real-database outcomes, current frontend actions, preserved partial-recall behavior, and consistent history/signatories. A passing SQLite-only suite is insufficient to claim the row-lock fix is verified.

## Implementation status

Implemented 2026-11-08 in both working trees, uncommitted. Existing uncommitted signatory/history work was preserved: every `ScheduleSignatories` call (`initial`, the four review stamps, the full-recall freeze, and the history `frozenCopy`) remains, and its tests pass.

### Backend — `app/Http/Controllers/Scheduling/DepartmentScheduleController.php`

- `lockDepartmentWorkflow()` takes `departments` `FOR UPDATE` as the first statement of the transaction in `submitSchedules`, `withdrawSubmission`, `approveByDean`, `returnByDean`, `approveByVpaa`, and `returnByVpaa`. Affected submissions are then locked in ascending ID order, followed by meeting rows ordered by ID.
- Reviews: `reviewTarget()` is a read-only preflight that pins the submission ID (also when `schedule_submission_id` is omitted) and its included section IDs. Under the lock, `lockedReviewScope()` reloads that exact submission, its pivot membership, and its meetings from the database. It returns `409 submission_stage_changed` when membership changed, the status left the stage, the eligible set is empty, or any section of the package is no longer at the stage. Updates target only the validated meeting IDs. Open conflicts and Room TBA are rechecked on the validated scope inside the lock.
- Legacy meetings with no submission: the scope is snapshotted in preflight, and the submission is created only under the lock, after validation (`createLegacySubmission()`). No submission is created as a preflight side effect.
- Recall: `recallPlan()` (finalized protection, eligibility, section → submission ownership) runs in preflight and again under the lock. Changed ownership returns `409`; an ineligible section rejects the whole request. Instructor retention, the faculty-assignment handoff reset, partial/full statuses, and the full-recall signatory freeze are unchanged.
- Submission: readiness, the all-and-only-ready rule, parent resolution, and revision allocation run under the lock, and the meeting update is pinned to the semester. A duplicate request finds no ready sections and returns `422`.
- Audit and history are recorded inside each transaction. Cache invalidation and notifications run after commit, and only on success. Response payloads are unchanged.
- No schema change and no new dependency.

### Frontend — `src/pages/shared/ScheduleApprovalPage.tsx`

- The preview, approval, and return hold a selection identity (`submissionId:requestType`, or `room-transfer:<id>`), resolved from the current queue on every render. A slice that leaves the queue closes its preview. A partially recalled package keeps its preview open on the remaining sections.
- Ordinary and Room TBA approval share one page-owned `ConfirmModal`; this page no longer calls `ToastContext.confirm()`. Each dialog captures a `ReviewIntent` (identity, stage status, sorted section IDs). The intent is revalidated through a latest-state ref immediately before posting, so a callback that outlived its render cannot act on stale data.
- Actions require `loadedKey === requestKey` (cache key + live revision + reload counter). Cached data, a pending reload, or a failed reload keeps actions disabled until Retry succeeds. Confirm buttons use a new optional `confirmDisabled` prop on `ConfirmModal` and `ScheduleRejectionModal`, without the submission spinner.
- A current reload that changes the intent's scope or stage cancels the dialog (and its reason) with a "Schedule Changed" notice. A same-scope reload or a transient error keeps the typed reason. Every mutation response triggers an authoritative reload; the optimistic `markEntry` was removed. `mutationRunning` prevents duplicate posts.

### Verification evidence

| Check | Result |
| --- | --- |
| New `backend/tests/Feature/ScheduleRecallReviewRaceTest.php` (21 tests): recall/resubmit inside all four review actions, both revisions finishing afterwards, omitted submission ID, full recall before and during review for each action, competing decision, repeated approval, duplicate submission, stale recall, multi-submission recall with one ineligible section, recall waiting on a review, history failure rolling back the decision | Against the original controller: 9 failed for the expected reasons (old revision approved/returned the resubmitted section; duplicate submission; stale recall; wrong recall stage; non-atomic history). After the fix: 21/21 pass. |
| `php artisan test --compact --filter='ScheduleRecallReviewRaceTest\|ScheduleApprovalTargetingTest\|DepartmentScheduleWithdrawalTest\|ScheduleApprovalCacheInvalidationTest\|ScheduleSignatoryHistoryTest\|ScheduleWorkflowIntegrityTest\|ProgramScheduleOwnershipTest\|SubmitRequiresDepartmentDeanTest\|CrossDepartmentApprovalGateTest\|InitialDataPayloadTest'` | 138 passed (896 assertions); the baseline before the change was 108. |
| Whole backend suite, one file per process | 151/152 files pass. `RealisticDepartmentLoadTest` exhausts the app's 512 MB limit inside `CspSolver` (generation); it does not call the workflow endpoints. |
| `php -l` and `vendor/bin/pint --test` on changed PHP files | Pass. |
| `backend/tests/Concurrency/department_workflow_lock_check.php` against isolated MariaDB 10.4.32 (`wicars_lock_verify`, REPEATABLE-READ), separate PHP processes, the orchestrator holding the department row, and waiters confirmed by their own connection IDs in `information_schema.processlist` | 35/35 checks, four consecutive runs. Recall + resubmit committed while each of the four old reviews waited → all `409`, new revision's stage intact, no reviewer stamped. Review queued before recall → serial order review then recall (`withdrawal_stage: vpaa_review`). Approve vs return vs duplicate approve → one `200`, two `409`, one audit entry. Duplicate submission → one `200`, one `422`, one submission. Stale recall → `409`, newer revision untouched. |
| Same check against the HEAD controller (negative control) | Times out: the old code never waits on the department row, so the operations are not serialized. |
| `npm test -- src/pages/shared/ScheduleApprovalPage.test.tsx src/lib/approvalQueue.test.ts src/lib/liveUpdates.test.ts` | 59/59 pass, including 21 new lifecycle tests for both roles (11 Dean, 10 VPAA). They cover full/partial recall with the preview open, a held callback, ordinary/Room TBA/return dialogs, reason retention, failed refresh then Retry, delayed `409`, reload after success, late responses, and cached loads. Against the original page all 21 fail. |
| Test files using the changed modals or `ToastContext` (21 files) | 217/219 pass. The 2 failures in `RoomRequests.test.tsx` also fail with the original `ConfirmModal`; they come from other uncommitted work. |
| `npx eslint` on the changed files | 0 errors; 1 existing TanStack `incompatible-library` warning. |
| `npm run lint` / `npm run build` | Both fail on code outside this change: lint on the untracked `unified-approvals-preview.local/` folder and 62 existing `src/` errors in other files; `tsc -b` on `src/pages/vpaa/Archive.test.tsx` (missing `buildings`). `npx vite build` succeeds. |

To rerun the real-database check: `php tests/Concurrency/department_workflow_lock_check.php setup`, then `php tests/Concurrency/department_workflow_lock_check.php all` from `backend` (MySQL `root@127.0.0.1`, database `LOCKCHECK_DATABASE`, default `wicars_lock_verify`). The script refuses any database name not ending in `_lock_verify`, and setup runs `migrate:fresh` on that scratch database only.

### Decisions made during implementation

- The legacy fallback for a request without a submission ID now considers only sections that are not included in an open submission. Previously it could create a second submission that duplicated a partially withdrawn revision's remaining sections. Cost if wrong: such a request returns `422` instead of creating a legacy submission.
- A review is refused (`409`) when any section of its package that still has meetings is no longer at the stage, rather than updating the rest. Inactive or deleted sections with no meetings in the query are ignored.
- The open-conflict scan now runs inside the workflow transaction, which lengthens the department lock for that review. This keeps the conflict check on the validated scope.
- Approval failures show both an inline dialog error and the existing "Approval Failed" toast.

### Remaining limitations

- Two-session browser verification (preview or confirmation open, then recall, resubmission, delayed refresh, and retry) has not been performed. It needs running servers and authenticated Dean/VPAA/secretary accounts, which were not created in application data. Keyboard focus after a cancelled dialog is unverified in a browser.
- The full frontend suite exhausts the Node heap in an unrelated PDF test worker, so only the focused files and the 21 files using the changed components were run.
- No previously inconsistent revisions were found or repaired; application data was not inspected.
