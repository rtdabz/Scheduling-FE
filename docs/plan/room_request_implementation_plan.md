# Room Request phased implementation plan

Date: 2026-10-12 (Asia/Shanghai).

Status: Planned. No implementation phase has been completed by this planning task.

Source: [Room Request frontend and backend review](reports/room_requests_review.md). Finding numbers below refer to that review. Its verified baseline includes existing uncommitted work; inspect the current working tree before each implementation phase and preserve unrelated changes.

## Objective and scope

Correct the eight reviewed Room Request issues through focused changes to existing backend and frontend boundaries. Follow `UNDERSTAND -> REUSE -> MODIFY -> VERIFY` in every phase, adding regression tests with each correction rather than deferring them to the final phase.

Preserve:

- Secretary-to-Secretary requests and decisions; VPAA notifications and existing role restrictions.
- Lecture-only borrowing, department scope, validation, and API response compatibility.
- Vacancy checks against scheduled classes and approved grants.
- Grant-window enforcement in manual validation and generation.
- Required rejection/revocation reasons and existing confirmation interactions.
- At-any-time return/revocation and the existing Room TBA release behavior, including current schedule status handling.
- Historical records and unrelated workspace changes.

Do not add permissions, endpoints, database fields, automatic approval-stage transitions, or a replacement scheduling/notification system without a demonstrated need. Multi-window editing, historical-status browsing, pagination, and broad component extraction are outside the required fixes.

## Phase overview

| Phase | Scope | Review findings | Dependency | Status |
|---|---|---|---|---|
| 1 | Current-owner authorization and reassignment guards | 1 | None | Planned |
| 2 | Shared scheduling locks and atomic history/audit | 2, 3 | Phase 1 | Planned |
| 3 | Reliable save results when notifications fail | 4 | Phase 2 | Planned |
| 4 | Semester context, availability states, and cache consistency | 5, 7, 8 | Phases 1–3 | Planned |
| 5 | Request windows matching actual class duration | 6 | Phase 4 | Planned |
| 6 | Integrated verification and workflow documentation | All | Phases 1–5 | Planned |

Implement in this order. Keep each phase reviewable and report its changes, verification, and remaining limits before moving to the next phase during an implementation task. This plan does not require a new permission checkpoint between routine phases.

## Phase 1 — Current-owner authorization

**Outcome:** A former room owner cannot grant access after ownership changes, and operational future-term requests cannot be silently invalidated by reassignment.

**Implementation scope:**

- Inspect `RoomRequestController`, `RoomStructuralUpdate`, room mutation routes, and their existing feature tests.
- Recheck the fresh room owner, stored request owner, and acting reviewer's department inside the transaction before approving or revoking access.
- Reject stale pending requests with a clear response. Preserve cancellation so the requesting department can withdraw and resubmit; do not silently rewrite the recorded owner.
- Extend reassignment protection to unresolved operational future-term requests using existing semester fields and conventions. Historical closed requests must not blanket-block reassignment.
- Keep ordinary requesting-department and capability checks unchanged.

**Verification and exit criteria:**

- Add regression tests for the reproduced future-term reassignment/old-owner approval case and legacy stale requests already present in storage.
- Verify allowed current-owner review, forbidden former/unrelated-owner review, requester cancellation, and the resubmission path.
- Verify current/future operational request guards and allowed reassignment when only historical closed requests remain.
- Run relevant Room Request and room structural-update tests. No grant may be approved using stale ownership.

## Phase 2 — Scheduling coordination and history

**Outcome:** Grant decisions and class placement use the same scheduling coordination boundary; forced Room TBA changes have immutable history and audit evidence.

**Implementation scope:**

- Reuse `SchedulingScopeLock` and the established semester-first lock order before approval and release of approved grants.
- Keep fresh ownership/status checks, vacancy checks, dependent-schedule selection, and writes within the transaction. Coordinate submission/structural checks where needed to avoid an opposing room/request lock order.
- Lock affected schedule rows before release and recheck the matching grant windows against fresh state.
- Capture before/after schedule state and reuse `ScheduleHistoryRecorder`, applicable `RevisionChangeRecorder` handling, and the existing scheduling audit mechanism.
- Record actor, request/grant identity, previous room, affected schedules, and reason using existing metadata conventions.
- Keep grant transition, schedule release, history, revision records, and required audit entries atomic.
- Preserve the intentional release of classes to Room TBA. Do not automatically move finalized/submitted schedules to a new approval stage.

**Verification and exit criteria:**

- Test revocation and borrower return with affected and unaffected classes, multiple windows, finalized classes, and applicable revision tracking.
- Inject failures in history/audit writes and assert rollback of both the grant and all released schedules.
- Test use of the shared lock; retain existing validator/generator and competing-approval coverage.
- Verify approval versus placement and revocation versus placement using two MySQL/MariaDB connections when an isolated integration database is available. SQLite success alone cannot certify contention safety.
- If the integration environment is unavailable, record that limitation explicitly; do not claim the concurrency check passed.

## Phase 3 — Reliable save results and notifications

**Outcome:** A saved action returns its committed result even when notification delivery fails, with observable and recoverable notification failures.

**Implementation scope:**

- Inspect `SystemNotificationService`, idempotency middleware, live-update delivery, and existing queue/retry conventions before selecting the smallest compatible solution.
- Preserve the current after-commit notification convention where practical. Isolate notification failure from the saved-success response, log the failure, and provide retry using existing queue infrastructure.
- If reliable notification-record persistence requires changing its transaction boundary, explicitly document that focused decision and keep broadcast delivery after commit. Do not create a parallel notification store.
- Apply the chosen handling consistently to submission, approval, rejection, cancellation, and revocation.
- Preserve notification recipients, messages, remarks, grant-window metadata, and successful-response idempotency behavior.

**Verification and exit criteria:**

- Inject notification failures for submission, approval, and return/revocation; assert the intended persisted result and truthful API response.
- Verify retries do not duplicate the request or incorrectly repeat schedule release, including requests with an idempotency key.
- Test notification recovery according to the chosen retry mechanism and verify successful delivery to the existing recipients.
- Confirm required history/audit failures still roll back writes; notification handling must not swallow primary write failures.

## Phase 4 — Frontend semester, availability, and cache consistency

**Outcome:** Users see the semester they are acting on, unknown availability cannot be submitted, and successful actions immediately refresh the acting client's data.

**Implementation scope:**

- Extend the existing typed wrappers in `src/lib/roomRequests.ts` to pass the already-supported `semester_id` for list, occupancy, and submission.
- Use an explicit active-semester context for the current workspace, matching its existing default request/occupancy behavior. Show academic year/semester in request details and filter the operational list accordingly. Preserve optional backend term access; a new term selector is not required for this fix.
- Include semester identity in page, occupancy, and grant cache keys. Refresh on relevant `settings`, room, and schedule changes using existing live-refresh utilities.
- Prevent a late response or semester change from applying occupancy for the wrong room/term. Require refreshed availability before submitting a form whose context changed.
- Separate loading, loaded-empty, failed, and stale availability states in the modal and `useRoomGrants`. Provide inline retry and disable submission until the current room/term has a successful availability read.
- After successful request mutations, update or invalidate the page cache. After approval/return/revocation, reuse existing rooms/schedules/dashboard cache invalidation and refresh local occupancy/grant views.
- Account for the acting socket being excluded from its own data-change broadcast; local consistency must not depend on receiving that event.

**Verification and exit criteria:**

- Component tests cover occupancy failure, successful retry, truly empty occupancy, and room switching with out-of-order responses.
- Test active versus historical/future request filtering, semester labels, semester activation while a modal is open, and stale term responses.
- Test cancellation/submission followed by navigation away/back, approval followed by scheduler access, and return followed by refreshed displaced classes.
- Verify cache consistency with live updates disabled and relevant remote changes when enabled.
- Run affected component/hook tests and TypeScript checks. The form must never label a failed occupancy read as confirmed availability.

## Phase 5 — Actual-duration request windows

**Outcome:** A user can request a contiguous window that fits a two-hour or other supported class, instead of being limited to 90 minutes.

**Implementation scope:**

- Replace the fixed three-slot duration with start/end or duration controls using the existing time grid and design conventions.
- Keep a single-window form for this correction. Multiple day/window rows may be added separately if requested; the existing backend already supports them.
- Calculate availability for the complete chosen interval against classes and grants, using the current room/semester occupancy state from Phase 4.
- Preserve backend authority over overlaps and operating hours; frontend validation provides immediate guidance.
- Keep closing-time limits, disabled/no-window states, required purpose, busy states, and API error handling.

**Verification and exit criteria:**

- Test a two-hour request payload and its complete grant-window fit.
- Cover different supported durations, invalid start/end ordering, occupied intervals, adjacent intervals, closing-time boundaries, and no available windows.
- Verify a matching class can be validated/generated within the resulting grant and that longer or out-of-window placements remain refused.
- Run affected frontend tests, TypeScript checks, and backend Room Request parity tests.

## Phase 6 — Integrated acceptance and documentation

**Outcome:** The corrected backend and frontend work together, the documented workflow matches tested behavior, and remaining verification limits are explicit.

**Verification:**

- Run relevant backend suites covering Room Requests, structural room updates, scheduling write integrity, history/revision behavior, and grant-aware generation.
- Run affected frontend suites, TypeScript checks, and the production frontend build.
- Walk through request → owner review → approved grant → schedule placement → borrower return/owner revocation → Room TBA and history/audit inspection.
- Exercise rejection with required remarks, conflicting approval, failed occupancy/retry, a two-hour request, semester changes, and navigation after local mutations.
- Check responsive modal/table behavior and relevant live updates in a real browser when available.
- Complete or explicitly record the MySQL/MariaDB contention checks from Phase 2.
- Run diff/whitespace checks and confirm unrelated workspace changes were preserved.

**Documentation:**

- Update the relevant architecture, business-rule, and history workflow documentation with verified ownership, lock, forced-displacement, notification, and semester behavior.
- Correct stale statements suggesting Program Head/VPAA participation in Secretary-only room borrowing, while preserving their unrelated scheduling capabilities.
- Update the source review with each finding's resolution and evidence. Record the exact commands/results and any browser, queue, or database integration limitations.
- Mark phases complete only after their implementation and relevant verification are finished. Distinguish implemented safeguards from unverified production contention or delivery behavior.

## Completion checklist

- [ ] Phase 1: Current-owner authorization and operational request guards verified.
- [ ] Phase 2: Shared write coordination and atomic displacement history/audit implemented and verified; production-database evidence recorded separately.
- [ ] Phase 3: Notification failures cannot misreport committed request actions; recovery behavior verified.
- [ ] Phase 4: Explicit semester context, safe availability states, and local cache updates verified.
- [ ] Phase 5: Actual-duration requests verified against backend grant-fit rules.
- [ ] Phase 6: Integrated acceptance, build checks, documentation, and remaining limits recorded.
