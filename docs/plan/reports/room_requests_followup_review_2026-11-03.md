# Room Request follow-up review and fix report

Review date: 2026-11-03 (Asia/Shanghai). Reviewed the current backend and frontend working trees, including existing uncommitted changes. The review itself changed documentation only; the fixes below were implemented in a separate pass on the same date.

## Resolution status (fix pass, 2026-11-03)

All nine findings are implemented and covered by regression tests. Verification ran under SQLite (repository default), against an isolated MariaDB 10.4 scratch database (`wicars_rr_concurrency_test`, never the application database), and in a real browser against that scratch database.

| ID | Status | What changed | Evidence |
|---|---|---|---|
| RR-01 | Resolved | `approve()` rechecks the locked room's current `department_id` against the request's recorded owner and refuses stale requests (422) with a cancel-and-resubmit explanation. Reassignment is blocked by pending/approved requests in the active **or any enabled** semester (`RoomRequest::scopeUnresolvedOperational`). Recorded ownership is never rewritten. API adds `owner_changed`. | `test_a_stale_owner_cannot_approve_after_the_room_is_reassigned`, `test_an_open_future_term_request_blocks_reassigning_the_room`, `test_historical_requests_do_not_block_reassigning_the_room`; UI test hides Approve for `owner_changed`. |
| RR-02 | Resolved | `endGrant()` locks affected rows, then inside the grant transaction writes the recovery case, Room TBA change, `ScheduleHistoryRecorder` version `room_grant_ended` (actor, request ID, previous room, reason, `ended_by`, affected IDs), `RevisionChangeRecorder` changes when a section is under revision, and a `SchedulingAuditLog` row. Schedule statuses are unchanged. | `test_revoking_records_the_room_tba_change_in_history_and_audit`, `test_giving_back_records_history_and_audit_for_the_borrower`, `test_a_history_failure_rolls_back_the_whole_grant_release` (grant, recovery case, room assignment, and audit all roll back). |
| RR-03 | Resolved | Notifications are built after commit and dispatched as `App\Jobs\DeliverSystemNotifications` (5 tries, backoff 10s/60s/5m/15m, `failed()` logs; exhausted jobs land in `failed_jobs` for `php artisan queue:retry`). Each attempt writes all rows in one transaction. Dispatch failures are `report()`ed, never returned to the user. Recipients and messages are unchanged, except the owner's submission message now names the semester. | `test_notification_failures_do_not_misreport_committed_actions` (submit, approve, return, reject all succeed with a throwing service; no duplicate requests), `test_notifications_are_queued_and_a_retry_delivers_them_once` (failed attempt leaves zero rows; retry delivers exactly once). |
| RR-04 | Resolved | Request form, room timetable, and `useRoomGrants` distinguish loading, ready (including truly empty), failed, and stale data with inline Retry. Submission requires a successful read for the current room and semester. | UI tests: failure blocks POST, Retry enables it; `useRoomGrants.test.ts` (error vs empty, stale refresh, per-semester keys). |
| RR-05 | Resolved | A "Choose Schedule" picker (on the shared `WeeklyTimetableGrid`) selects one recurring weekday window of **1.5 or 3 hours**; the end time is calculated. These two lengths replace the earlier free start/end controls by product decision (2026-11-04). The backend still accepts any valid positive duration. | UI test submits a confirmed 3-hour Wednesday 10:00–13:00 window; backend parity tests validate/generate classes inside a two-hour grant, so other durations remain supported server-side. |
| RR-06 | Resolved | The page loads the active semester once and passes `semester_id` to the list, occupancy, submission, and grant reads; cached requests carry their semester and are cleared when it changes; `settings` live updates reload. Semester is shown in the form, list, and details. | `test_requests_are_listed_and_checked_for_an_explicit_semester`; UI tests for the `semester_id` list parameter and payload; out-of-order response test. |
| RR-07 | Resolved | Every mutation updates the page cache and calls `publishLiveTopics` locally (`rooms`, `notifications`, plus `schedules` when a grant starts or ends), invalidating scheduler, room, and dashboard caches and refetching open views without a WebSocket echo. | UI test: after approval the cached request is `approved` and scheduler cache is no longer fresh. |
| RR-08 | Resolved | Room and building archive run under the shared scheduling lock with room rows locked and refuse while classes or operational pending/approved requests exist. Submission against a just-archived room returns a clear 422. Archived rooms are flagged (`room.is_archived`) on historical requests; approval of a legacy request for an archived room is refused (422), rejection still works. | `test_a_pending_request_blocks_archiving_its_room`, `test_an_approved_grant_blocks_archiving_its_building`, `test_a_request_for_an_already_archived_room_cannot_be_approved_but_can_be_rejected`; MariaDB race probe below. |
| RR-09 | Resolved | Availability compares exact minutes with `windowConflicts()`; grid rounding is no longer used for occupancy. | UI test: booking to 08:40 rejects 08:30 and suggests 09:00; backend `test_off_grid_occupancy_is_compared_by_exact_minutes`. |

Modal redesign: Request Room shows the selected room (code and building), owning department, and semester read-only — there is no room dropdown, and the request is sent for that room. "Choose Schedule" opens a compact weekly picker using the existing timetable grid: choose 1.5 or 3 hours, then a day and starting slot; the whole interval is highlighted, classes (red), lent time (dashed orange), selected time (gold), and starts that cannot fit before the next booking or closing time (hatched) are distinct, and occupied blocks are drawn at their exact minutes. Starts that overlap any booking or run past operating hours cannot be chosen (exact-minute checks). The picker has loading, failure with Retry, stale, and no-availability states and Confirm Schedule / Cancel actions. After confirmation the form shows the weekday, start–end time, and duration with "Change Schedule", which reopens the picker with the selection and duration preserved. Purpose stays required; Send stays disabled until the schedule is confirmed and verified against freshly loaded availability; entries persist after a failed submission. The list uses **Sent / Received** tabs (arrow-key navigable) with room, owner/requester, semester, window with duration, and status per request, and keeps loading, failed, stale, and empty states distinct. Details show requester, owner, semester, windows, purpose, review and remarks, warn on reassigned or archived rooms, require reasons to reject or revoke, and list the borrower's classes that would move to Room TBA (same room, semester, department, and window-overlap rule the server applies) before give-back or revocation.

### Verification

- Backend `php artisan test --compact --filter=RoomRequestTest` — **33 passed (216 assertions)**: 20 existing + 13 new.
- Backend related suites `--filter='RoomRequestTest|CrudIntegrityGuardsTest|RoomRecoveryTest'` — **121 passed (1,399 assertions)** under SQLite.
- Whole backend suite (SQLite), run in batches of 12 test classes because a single process exceeds the configured 512 MB `memory_limit`: **1,330 tests**. Five failures occurred only while the frontend suite was loading the machine (`GenerationPerformanceBenchmarkTest`, 4 × `YearLevelScheduleGenerationTest`, all "search time limit" wall-clock failures in generation code this pass did not change); both classes pass when rerun alone. `PdfPreviewTest` and `RealisticDepartmentLoadTest` exceed 512 MB in the shared process; they pass alone (the latter needs ~720 MB, run with a 2 GB scratch copy of `phpunit.xml`).
- Whole frontend suite: **145 files, 1,220 tests passed**, excluding `src/components/GanttDepartmentLogos.test.tsx`, which exhausts the 2 GB Node heap even alone and with the original `src/lib/roomRequests.ts` restored, so it is pre-existing and unrelated.
- Same Room Request and CRUD-guard suites against isolated MariaDB 10.4 (real `GET_LOCK` path) — **42 passed (254 assertions)**.
- MariaDB two-process probe, submit vs room archive started simultaneously, 20 runs: both orderings occurred (submission first → archive refused; archive first → submission refused with "This room has just been archived"); **0 runs** left an archived room with an open request. With a request-mutation lock held for 3 s, archive waited ~1.8–2.1 s before proceeding, confirming both paths use the same lock.
- Frontend `npx vitest run src/pages/shared/RoomRequests.test.tsx src/hooks/useRoomGrants.test.ts` — **18 passed** after the schedule-picker update (read-only room; failure/Retry; confirmed 3-hour payload; selection preserved on Change Schedule; exact 8:40 boundary and closing-time limits for both durations; no-availability state; late previous-semester response ignored). `tsc --noEmit -p tsconfig.app.json` clean; ESLint clean for touched files; `npm run build` succeeded.
- Browser, picker update (2026-11-04, same isolated setup): read-only room block, picker with exact 7:00–8:40 class and dashed lent grant, 1.5 h and 3 h selections, hatched too-late starts, confirmed summary, Change Schedule preserving the selection, Escape closing only the picker with focus returned to Change Schedule, and 390 px layout with horizontal grid scroll.
- Browser, first pass (Playwright, scratch backend on port 8123 and Vite on 5199): request form, conflict at 08:30 against a 07:00–08:40 class, 09:00–11:00 submission, Sent list, owner's notification badge, review/approval, approved details with the Room TBA section, 390 px width layout, and keyboard focus kept inside the top dialog.

### Remaining limits

- Approval-versus-placement and revocation-versus-placement races were not probed across two MariaDB connections; they rely on the same shared semester lock already used by schedule writes. Lock scope is still every semester (unchanged; narrowing needs a lock-order review).
- Notification retry is real only with a queue worker on the `database` connection (production default). Under `QUEUE_CONNECTION=sync`, a failed delivery is logged but not retried. If queuing itself fails after commit, the error is reported to the log, not retried automatically. A worker crash between the job's commit and acknowledgement could deliver a notification twice.
- The Room TBA preview reflects the timetable at the moment the details open; the server's release decision remains authoritative and is returned as `released_schedule_ids`.
- Test-environment limits outside this scope: the backend suite cannot run in one process under the 512 MB `phpunit.xml` limit, and `GanttDepartmentLogos.test.tsx` runs out of Node heap.
- The browser pass used seeded scratch data and did not include a grant with a dependent borrower class (covered by component and API tests), live WebSocket delivery, or screen-reader testing.

## Result at review time

The findings below describe the code before the fix pass; see Resolution status above.

**Nine confirmed issues remain: two P1 and seven P2.** Seven findings from the [October review](room_requests_review.md) remain open; two additional defects were reproduced. The previous missing-scheduling-lock finding is no longer accurate: request mutations now acquire `SchedulingScopeLock`. Production database contention still needs separate verification.

P1 means authorization or timetable-integrity risk. P2 means a broken workflow, misleading availability, or unreliable/stale results. No critical issue was established by this review.

Scope: Secretary Room Request creation, review, return/revocation, grant-aware scheduling, occupancy, local caches, room archive interactions, and the new recovery integration. This is not a complete audit of room transfers or every scheduling write path.

## Prioritized backlog

| ID | Priority | Finding | Prior review |
|---|---|---|---|
| RR-01 | P1 | A former owner can still approve a future-term request | Finding 1, open |
| RR-02 | P1 | Returning/revoking a grant changes schedules without timetable history/audit | Finding 3, partially improved but open |
| RR-03 | P2 | Notification failure returns an error after saving successfully | Finding 4, open |
| RR-04 | P2 | Failed occupancy reads are presented as available time | Finding 5, open |
| RR-05 | P2 | The form only creates one fixed three-slot window | Finding 6, open |
| RR-06 | P2 | Request list and actions lack a consistent visible semester context | Finding 7, open |
| RR-07 | P2 | Successful local mutations leave request and grant caches stale | Finding 8, open |
| RR-08 | P2 | Room/building archive leaves unresolved requests and grants active | Newly reproduced |
| RR-09 | P2 | Rounding occupied intervals offers conflicting request times | Newly reproduced |

File references below use `backend/` for `C:/Users/toman/backend` and `wicars-ui/` for `C:/Users/toman/wicars-ui`. Line numbers describe the reviewed working tree.

## Findings and fixes

### RR-01 — Revalidate the current owner before approval

**Evidence: API reproduction.** Submit a request for an enabled, inactive future semester; reassign its room to a third department through `PATCH /api/rooms/{id}`; approve as the former owner's Secretary. Both reassignment and approval return 200. The approved request retains the former `owner_department_id`, while the room belongs to the third department.

**Cause:** `backend/app/Services/RoomStructuralUpdate.php:35` protects requests only when their semester is active. `backend/app/Http/Controllers/Rooms/RoomRequestController.php:197` authorizes against the stored request owner; `assertLendable()` at line 328 never compares that owner with the locked room's current department.

**Impact:** Access can be granted without the actual owner's decision. The new owner also does not receive this request in its department-scoped request list.

**Smallest fix:** Check fresh room ownership inside the decision transaction. Reject stale requests with a clear explanation while allowing requester cancellation/resubmission. Extend structural reassignment guards to unresolved operational future-term requests using the existing semester policy. Do not rewrite historical ownership silently.

**Acceptance:** Current owner succeeds; former/unrelated owners cannot approve; the future-term sequence above is blocked; legacy stale requests can be cancelled and resubmitted; terminal historical requests do not block ordinary reassignment.

### RR-02 — Record forced Room TBA changes in schedule history and audit

**Evidence: API/database reproduction.** Approve a grant, create a finalized borrower class within its window, and revoke. The class becomes Room TBA and remains finalized. A `room_recovery_cases` record is created, but neither `ScheduleHistoryVersion` nor `SchedulingAuditLog` gains an entry.

**Cause:** `backend/app/Http/Controllers/Rooms/RoomRequestController.php:486` calls `recordImpact()` and then directly saves `room_id = null`. `backend/app/Services/RoomRecoveryService.php:74` preserves the original rows and arranges a notification; it does not record a timetable version. Recovery application records history later at line 677, but that does not document the original grant-ending mutation when it occurs.

**Impact:** Schedule history and scheduling audit omit the forced displacement, despite the recovery snapshot now preserving useful original data. This is an improvement over October, not a complete history fix.

**Smallest fix:** Reuse `ScheduleHistoryRecorder`, applicable revision-change handling, and scheduling audit within the grant transaction. Include actor, grant ID, previous room, reason, and affected rows. Preserve the intentionally tested at-any-time return and existing schedule statuses.

**Acceptance:** Both borrower return and owner revocation produce accurate before/after history and audit. Failure of required history/audit persistence rolls back the grant transition, recovery record, and schedule changes. Unaffected classes remain unchanged.

### RR-03 — Return a truthful result when notifications fail

**Evidence: failure-injection reproduction.** Make `SystemNotificationService::notifyRoles()` throw during submission. The API returns 500, while the pending request and its window remain saved.

**Cause:** `backend/app/Http/Controllers/Rooms/RoomRequestController.php:170`, `:230`, and `:299` invoke notification work after the transaction without isolating failures. `backend/app/Services/SystemNotificationService.php:41` persists recipient records synchronously. Approval and close share the same exposure by source inspection; failure injection in this review exercised submission.

**Impact:** Users are told the operation failed and may retry a request that already exists. Review/return retries can likewise encounter an already-transitioned request.

**Smallest fix:** Use existing notification/queue conventions to make delivery retryable and keep the committed action's response reliable. If notification records must be atomic, persist them inside the transaction and deliver after commit. Do not merely swallow errors without logging/recovery.

**Acceptance:** Inject submission, approval, rejection, and return notification failures. Each response accurately reflects the persisted action; retries do not duplicate requests, releases, or notifications; required primary-write failures still roll back.

### RR-04 — Treat unknown occupancy as an error

**Evidence: component reproduction.** Reject the occupancy GET, fill Purpose, and submit. Available windows are generated and the POST is sent despite the failed availability read.

**Cause:** `wicars-ui/src/pages/shared/RoomRequests.tsx:832` replaces failed occupancy with `blocks: []`, the same representation as verified vacancy. The room timetable similarly becomes empty at line 248. `wicars-ui/src/hooks/useRoomGrants.ts:19` also converts an initial failure into a ready, empty grant cache.

**Impact:** The UI presents unknown availability as free time and can conceal reservations. Backend vacancy checks still reject actual conflicts; this is not evidence of accepted double bookings.

**Smallest fix:** Distinguish loading, loaded-empty, failed, and stale data. Add inline retry and require a successful read for the current room/semester before enabling submission. Keep retained data visibly stale after a refresh failure.

**Acceptance:** Initial failure prevents submission; retry restores it; genuinely empty occupancy remains usable; room changes and late responses cannot reuse the wrong availability.

### RR-05 — Allow a window matching the class duration

**Evidence: component reproduction.** Every offered option is 90 minutes on the standard 30-minute grid. Submission sends exactly one window.

**Cause:** `wicars-ui/src/pages/shared/RoomRequests.tsx:153` hardcodes `durationSlots = 3`; line 857 constructs a single window. The backend supports other positive durations and up to 21 windows. Existing backend tests successfully use a two-hour grant.

**Impact:** A two-hour class cannot fit a grant created by this form. Several adjacent grants do not generally fix this because `RoomAccessPolicy::fitsWindows()` requires containment in one individual window.

**Smallest fix:** Add a duration or start/end choice to the existing single-window form. Keep multiple-day editing optional. Validate the full interval against occupancy and operating hours.

**Acceptance:** Create a two-hour grant through the form and validate a matching class against it. Cover closing-time boundaries, occupied intervals, adjacent intervals, and invalid durations.

### RR-06 — Bind list, occupancy, and submission to one semester

**Evidence: API reproduction plus source trace.** Default listing returns pending requests from both active and future semesters; explicit `semester_id` filtering correctly returns one term. The UI wrappers do not expose that filter or include a semester in occupancy/submission. Tables and previews omit semester identity.

**Locations:** `backend/app/Http/Controllers/Rooms/RoomRequestController.php:28`, `:555`; `wicars-ui/src/lib/roomRequests.ts:88`; `wicars-ui/src/pages/shared/RoomRequests.tsx:176`, `:213`, `:256`, `:1014`, `:1286`.

**Impact:** Identical room/day/time requests from different semesters are indistinguishable. An open form can retain old-term occupancy but submit using a newly active semester. The page and grant hook listen to `rooms`, not semester `settings` changes.

**Smallest fix:** Reuse the supported `semester_id` parameter across list, occupancy, and submission. Include it in cache identities and show academic year/semester in details. The existing active-term workspace can stay active-term-only; no new selector is necessary. Refresh or invalidate open forms on semester changes.

**Acceptance:** Other-term requests cannot be mistaken for current ones; changing the active semester invalidates old occupancy; late responses from the previous term cannot update the current form.

### RR-07 — Refresh caches after local mutations

**Evidence: component reproduction plus source trace.** Cancel a pending request. It disappears from the visible list, but `page:rooms:room-requests:1` still contains `pending`.

**Cause:** `wicars-ui/src/pages/shared/RoomRequests.tsx:285` and `:328` only change React state. Approval/revoke/return handlers also omit grant, occupancy, and scheduler invalidation. `useRoomGrants.ts:6` owns a separate module cache. The API attaches the acting socket ID, and server live updates exclude that socket, so its own broadcast cannot be relied on to repair these caches.

**Impact:** Navigation can initially show old requests, and existing grant/scheduler views can retain permissions or reservations that changed. The page fetches on mount, so a successful later fetch can correct the page cache; that does not remove the stale interval or repair all open views.

**Smallest fix:** Update/invalidate the request cache after every mutation. On grant changes, reuse local cache/live-refresh helpers for rooms, schedules, and dashboards and refresh the separate grant cache. Ensure remote room changes also revalidate an open request form.

**Acceptance:** With WebSockets disabled, cancel/approve/return then navigate or open the scheduler: request status, granted windows, and displaced classes are current. Relevant remote changes refresh open availability.

### RR-08 — Resolve active requests before archiving rooms

**Evidence: two API reproductions.** (1) Submit a pending request, then delete its otherwise unbooked room. Archiving succeeds; the owner's request list still shows the room and `pending`, but approval returns 404. (2) Approve a grant without scheduling a class, then archive its building. The room is soft-deleted while the grant remains `approved`.

**Cause:** `backend/app/Http/Controllers/Rooms/RoomsController.php:89` and `:144` guard only existing schedules. They do not check pending/approved room requests. `RoomRequest::room()` intentionally includes archived rooms, but the request presentation does not expose their archived state and approval requires a live room.

**Impact:** Actionable-looking requests become impossible to approve, and approved borrowing remains represented as active for rooms no longer available. Rejection/cancellation can still close a pending request; it is not permanently unrecoverable.

**Smallest fix:** Under the shared scheduling/transaction boundary, block single-room and building archive when operational pending/approved requests exist. Require those requests to be resolved first. Preserve terminal history. An automatic cancellation/revocation policy would require explicit workflow design and notifications; it is unnecessary for the smallest correction.

**Acceptance:** Both archive endpoints reject unresolved operational requests/grants with clear reasons; archive succeeds after resolution; terminal historical requests retain their room details. Include archive versus request/approval race coverage.

### RR-09 — Compare exact occupied times, without rounding

**Evidence: component and API reproduction.** A Monday grant from 07:00 to 08:40 is accepted and approved by the backend. Given that occupancy, the UI offers 08:30–10:00 as available. Submitting that overlapping interval is rejected by the backend with a windows validation error.

**Cause:** `wicars-ui/src/pages/shared/RoomRequests.tsx:156` converts occupied boundaries through `timeToSlot()`, which uses `Math.round()` in `src/lib/timeGrid.ts:95`. On a 30-minute grid, 08:40 becomes 08:30. The request API accepts minute-level boundaries and does not enforce grid alignment.

**Impact:** Valid occupancy is shortened or shifted during availability checking, producing false availability or unnecessarily hidden options. The server still prevents overlapping grants.

**Smallest fix:** Keep offered starts on the UI grid, but compare their actual minute intervals with occupied intervals. Reuse `windowConflicts()` in `src/lib/roomRequests.ts:142`, which already performs exact minute comparisons. Avoid changing the shared grid conversion globally just to fix this form.

**Acceptance:** Occupancy ending 08:40 excludes 08:30–10:00; an interval beginning exactly at the occupancy end remains allowed; off-grid starts, ends, and short intervals are handled without rounding away overlaps.

## What improved, and remaining discrepancies

- **Shared locking is implemented:** `RoomRequestController::schedulingTransaction()` at line 478 wraps submission, approval, and close operations in the existing scheduling lock before opening the transaction. Do not report the old missing-lock defect as unchanged. It currently locks every live semester, even for a single-term request; narrowing that scope is a lower-priority contention improvement requiring a lock-order review. No production timing or concurrency claim is made here.
- **Recovery snapshots are implemented:** Grant release now creates a recovery case before clearing room assignments, and the existing feature test checks the original room. This resolves loss of recovery context, but RR-02 remains.
- **Role documentation is still inconsistent:** `docs/plan/decisions.md:111` includes room requests in shared Secretary/Program Head permissions and says VPAA keeps every capability. Current capability tests require Secretary-only borrowing and reviewing. Correct the documentation; do not expand permissions to match it.
- The October implementation plan still says every phase is planned. Its phase 2 should distinguish the implemented shared lock/recovery snapshot from missing immutable history and unverified production contention. The original claim that no shared scheduling lock is acquired is now stale.

## Suggested fix order

1. RR-01 and RR-08: current ownership and room-lifecycle guards, with race-safe transactions.
2. RR-02 and RR-03: atomic schedule evidence and reliable committed responses.
3. RR-06, RR-04, and RR-07: explicit term identity, trustworthy availability, and cache consistency.
4. RR-05 and RR-09: actual-duration selection and exact interval checks.
5. Correct role/status documentation and complete end-to-end and production-database verification.

Reuse the [existing phased plan](../room_request_implementation_plan.md); add RR-08 to lifecycle guards and RR-09 to duration/availability validation. A redesign or replacement request service is not required.

## Verification and limits

- Existing backend: `php artisan test --compact --filter=RoomRequestTest` — **20 passed, 112 assertions**.
- Related backend recovery: `php artisan test --compact --filter=RoomRecoveryTest` — **79 passed, 1,145 assertions**.
- Existing frontend: `npm test -- src/pages/shared/RoomRequests.test.tsx src/components/rooms/RoomRecovery.test.tsx src/components/rooms/RoomTransferRequests.test.tsx src/lib/roomRecovery.test.ts` — **51 passed across four files**. Only two of these directly cover the Room Requests page; passing this suite is not coverage of the failure paths above.
- Temporary backend characterization probes — **7 passed, 41 assertions**: stale-owner approval, recovery without history/audit, notification failure after save, cross-semester listing, pending-request room archive, approved-grant building archive, and off-grid overlap rejection.
- Temporary component characterization probes — **4 passed**: submission after occupancy failure, fixed 90-minute options, off-grid false availability, and stale request cache after cancellation. The initial cache probe needed its confirmation mock reset between tests; the final run passed all four.
- Characterization probes assert the existing defective behavior. Their passing result establishes reproduction, not a fix. Temporary probe files were removed after verification.
- API tests used the repository's SQLite in-memory test configuration; component tests used mocked APIs in jsdom. No production records were changed. Real browser layout/accessibility, live socket delivery, notification retry delivery, MySQL/MariaDB contention, the full repository suite, and a production build were not verified in this report-only task.

