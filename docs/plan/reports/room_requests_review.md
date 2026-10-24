# Room Request frontend and backend review

Review date: 2026-10-12. Reviewed the current workspace, including existing uncommitted changes. This is a review and implementation backlog; application behavior was not changed.

## Assessment

Room Request needs focused improvements. Preserve the existing Secretary-to-Secretary workflow, lecture-only borrowing, department scope, overlap checks, grant-aware validation/generation, required rejection/revocation reasons, notifications, and confirmed return behavior. A redesign, new permission system, or new database fields is not justified by this review.

Three high-priority findings concern authorization, concurrent writes, and timetable history. Five medium-priority findings concern reliable responses and frontend correctness. Each finding distinguishes runtime reproduction from source evidence.

P1 means high priority: authorization or scheduling integrity. P2 means medium priority: error handling, data consistency, or an obstructed user workflow.

## Findings

### 1. P1 — Former room owners can approve a request after reassignment

**Locations:** `backend/app/Http/Controllers/Rooms/RoomRequestController.php:192`, `:321`; `backend/app/Services/RoomStructuralUpdate.php:24`.

**Reproduced through API requests:**

1. A Secretary requests another department's room for an enabled future semester that is not active.
2. The VPAA changes the room's department through `PATCH /api/rooms/{id}`. This succeeds because the room-change guard only checks requests associated with an active semester.
3. The former owning Secretary approves the request. The response is 200 with `approved`, even though the room now belongs to a different department.

Approval authorizes against the request's stored `owner_department_id`. After locking the room, `assertLendable()` checks that it belongs to some other department, but does not check that its current owner matches the request owner or reviewer. A stale request can therefore grant access without the actual owner's approval.

**Recommended fix:** Revalidate current room ownership inside the transaction before a reviewer can grant or revoke access. Reject a stale pending request with a clear message rather than silently transferring it or accepting the former owner's decision. Extend the structural dependency check to operational future-term requests, while preserving historical completed requests. Cover stale approvals and the current owner's resulting workflow with feature tests.

### 2. P1 — Grant changes do not share the schedule-write lock

**Locations:** `backend/app/Http/Controllers/Rooms/RoomRequestController.php:192`, `:272`, `:481`; `backend/app/Services/Scheduling/Lock/DatabaseSchedulingScopeLock.php:19`; `backend/app/Http/Controllers/Scheduling/ScheduleController.php:162`.

**Source evidence; real database contention was not exercised:** Schedule writes use the shared semester-level `SchedulingScopeLock`. Room approval uses a request-row lock and room-row lock, while returning/revoking a grant locks its request and reads dependent schedules without locking those rows. These operations do not acquire the shared semester lock.

An owner can validate a class placement while the room is vacant, an approval can reserve that same window, and the previously validated placement can then commit. A borrower placement can likewise validate against an approved grant while revocation is releasing its previously observed classes. Separate row locks do not coordinate these paths with the existing advisory scheduling lock.

**Recommended fix:** Acquire the existing `SchedulingScopeLock` for the request's semester before approving a grant or releasing an approved grant. Keep fresh authorization, conflict checks, dependent-schedule reads, and writes within the transaction; lock affected schedule rows when releasing them. Use a consistent lock order with room structural updates. Add integration coverage with two MySQL/MariaDB connections for approval versus placement and revocation versus placement. SQLite cannot verify the production advisory-lock behavior.

### 3. P1 — Forced Room TBA changes bypass timetable history and audit

**Location:** `backend/app/Http/Controllers/Rooms/RoomRequestController.php:481`.

**Reproduced:** Approve a grant, create a finalized borrower class in its window, then revoke it. The class's `room_id` becomes null and its status remains `finalized`. No schedule-history version or scheduling-audit entry is created for the room change.

Returning a room at any time and moving dependent classes to Room TBA are intentional behaviors, explicitly covered by the existing feature tests. The defect is that these timetable changes bypass the explicit history/revision/audit services used by ordinary schedule mutations. Eloquent model events announce live updates but do not record immutable history.

**Recommended fix:** Preserve the tested return behavior. Capture before/after schedule state and use `ScheduleHistoryRecorder`, applicable `RevisionChangeRecorder` handling, and the existing scheduling audit mechanism inside the transaction. Record the actor, previous room, affected grant, and reason. Verify that a history/audit failure rolls back both the grant transition and schedule release. Any change to finalized/submission status after forced displacement requires an explicit business decision; do not infer a new transition.

### 4. P2 — Notification failure reports an error after the request is saved

**Locations:** `backend/app/Http/Controllers/Rooms/RoomRequestController.php:170`, `:228`, `:295`; `backend/app/Services/SystemNotificationService.php:39`.

**Reproduced by failure injection:** Make `SystemNotificationService::notifyRoles()` throw during submission. The API returns 500, but the pending request and its windows remain committed. A user's retry can then encounter the duplicate-pending-request validation instead of recovering the successful result.

Approval and close actions also invoke notification persistence synchronously after commit without isolating failures. Successful-response idempotency caching does not resolve an initial error response because the middleware only stores 2xx responses.

**Recommended fix:** Make the committed result reliable for the client and make notification delivery retryable. Decide whether notification-record persistence is required to be atomic with the request; if so, persist the existing records within the transaction and keep broadcast delivery after commit. Otherwise isolate and log notification failures and arrange a retry without turning an already committed action into a generic save failure. Cover submission, approval, and return failure paths. This needs a focused decision about the current after-commit notification convention, not a second notification system.

### 5. P2 — Failed occupancy reads make slots appear available

**Locations:** `wicars-ui/src/pages/shared/RoomRequests.tsx:824`, `:838`; related display behavior in `wicars-ui/src/hooks/useRoomGrants.ts:16`.

**Reproduced in a React component probe:** Reject the occupancy GET. The request modal stores `blocks: []`, generates available windows for the entire day, and enables Submit once purpose is filled in. The error toast does not prevent the form from presenting unknown availability as confirmed vacancy.

The backend still rejects conflicts, so this is a frontend correctness/error-state defect rather than proof that the server accepts conflicting requests. The grants hook similarly treats an initial failure as a ready, empty grant list, which can hide reservations in room views.

**Recommended fix:** Keep loading, successful empty occupancy, and failed occupancy as distinct states. Show an inline retry action and keep submission disabled until availability loads successfully. When revalidation fails, mark any retained data as stale. Add coverage for initial failure, retry, room switching, and genuine empty availability.

### 6. P2 — The frontend restricts requests to one 90-minute window

**Locations:** `wicars-ui/src/pages/shared/RoomRequests.tsx:150`, `:852`; `backend/app/Http/Controllers/Rooms/RoomRequestController.php:123`; `backend/app/Services/Scheduling/Support/RoomAccessPolicy.php:173`.

**Reproduced in a React component probe:** With a 30-minute grid, every Available Time option lasts exactly 90 minutes because `durationSlots` is fixed at three. Submission sends only one window. The backend supports up to 21 windows and other positive durations; its existing validator/generator tests use a two-hour grant.

A class requiring two contiguous hours cannot fit a grant created by this form. Multiple adjoining requests do not solve this generally because grant-fit validation requires a placement to fit within an individual window.

**Recommended fix:** First allow a start/end or duration choice on the existing time grid so users can request the actual class duration. Reuse overlap and operating-hour rules. Adding multiple day/window rows is a useful follow-up using the existing API, but is not required to fix the duration restriction. Cover a two-hour request, occupied intervals, closing-time boundaries, and zero available windows.

### 7. P2 — The request list mixes semesters without displaying the semester

**Locations:** `backend/app/Http/Controllers/Rooms/RoomRequestController.php:28`, `:546`; `wicars-ui/src/lib/roomRequests.ts:88`; `wicars-ui/src/pages/shared/RoomRequests.tsx:212`, `:1012`, `:1045`.

**API behavior reproduced; UI mismatch verified in source:** The default list includes both active-term and inactive-term pending requests. The backend already supports `semester_id` filtering, but the frontend wrapper exposes only `status` and calls the endpoint without a semester. The UI filters by pending/approved status alone, displays no semester in the request table or preview, and reads occupancy/submits new requests using the server's active-term default.

Old and future grants therefore appear alongside current requests with indistinguishable room/day/time details. Term changes can also leave open room views or request forms holding previous-term occupancy: they subscribe to `rooms`, while semester activation produces `settings` updates.

**Recommended fix:** Use one explicit semester context for list, occupancy, submission, and cache keys. Reuse the backend's existing semester filter and show the academic year/semester in request details. If the workspace is intentionally active-term-only, filter it accordingly and clearly label it; if users need other terms, expose a selector. Refresh on semester changes and avoid allowing an open form to submit against a different term from the one whose vacancy was checked. Historical terminal statuses can be exposed separately if requested.

### 8. P2 — Local mutations leave cached requests and scheduling data stale

**Locations:** `wicars-ui/src/pages/shared/RoomRequests.tsx:284`, `:327`; `wicars-ui/src/lib/cacheGroups.ts:3`; `backend/app/Support/LiveUpdateRecorder.php:102`; `backend/app/Support/LiveUpdates.php:95`.

**Page-cache behavior reproduced:** Load a pending request, cancel it successfully, and inspect `page:rooms:room-requests:{departmentId}`. React state shows the cancellation, but the cached request remains pending. Submission and review handlers likewise update component state without updating or invalidating the cached page.

**Related source evidence:** The API attaches the acting client's socket ID and broadcasts data changes to other sockets. Its successful Axios response handler does not invalidate client data caches. Approval/return handlers do not invalidate scheduler caches or refresh local grant views. The acting client therefore cannot rely on receiving its own excluded data-change broadcast to repair stale data. Other clients do receive model-generated `rooms` updates; missing server broadcast registration is not the issue.

**Recommended fix:** After successful submission/cancellation/review, update or invalidate the room-request page cache. On grant approval/return/revocation, reuse existing rooms/schedules/dashboard cache invalidation and refresh local occupancy/grant data. Keep the active form synchronized with relevant live room/schedule changes. Verify navigation away/back, approval followed by opening the scheduler, and return followed by viewing displaced classes.

## Existing strengths verified

- Capability middleware and department-scoped mutations protect the ordinary request/review flow.
- Program Heads, Deans, and VPAA cannot participate in the Secretary borrowing workflow; VPAA receives notifications.
- Own rooms, shared rooms, and laboratories cannot be requested.
- Existing classes and approved grants are checked for overlapping windows; sequential competing approvals are covered.
- Scheduling validation and generation honor granted windows, and owners cannot schedule inside a lent window.
- Return/revocation releases borrower classes while preserving unrelated owner classes.
- Existing modals provide busy states, required remarks, confirmation text explaining Room TBA, and action error messages.

## Verification and limits

- Existing backend suite: `php artisan test --compact --filter=RoomRequestTest` — 20 passed, 109 assertions.
- Existing frontend suite: `npm test -- src/pages/shared/RoomRequests.test.tsx` — 2 passed.
- Temporary backend characterization probes — 4 passed, 22 assertions: stale-owner approval, missing history/audit, post-commit notification failure, and unfiltered semester listing.
- Temporary frontend characterization probes — 3 passed: submission after occupancy failure, fixed 90-minute duration, and stale cache after cancellation. A combined run with the existing suite passed all 5 tests.
- `npx tsc -b --pretty false` — passed.
- Probes asserted the observed defective behavior; passing them confirms reproduction and does not mean the defects are fixed. Temporary probe files were removed after verification.
- API probes used SQLite `:memory:` and component probes used mocked API responses in jsdom. No production data was changed. Production database contention, real browser layout/mobile behavior, live WebSocket delivery, and a full repository test/build run were not verified.

## Documentation discrepancy

`docs/decisions.md:105` still includes room requests among shared Secretary/Program Head permissions, while `docs/architecture.md:19` broadly states that VPAA holds every capability. The current registry, room-request permission-removal migrations, and feature tests establish the narrower Secretary-only borrowing workflow. Preserve that tested behavior and correct the documentation when documenting this workflow; do not expand role access to match stale statements. This discrepancy is also recognized in the existing CRUD review.

## Suggested implementation order

The [phased implementation plan](../room_request_implementation_plan.md) defines the scope, dependencies, and exit criteria:

1. Current-owner authorization and reassignment guards.
2. Shared scheduling locks and atomic timetable history/audit.
3. Reliable committed results and notification recovery.
4. Frontend semester context, availability error states, and local cache consistency.
5. Request windows matching actual class duration.
6. Integrated acceptance, production-database concurrency verification, and workflow documentation.

Regression tests accompany each implementation phase. Pagination, closed-request history, multi-window editing, and broad modal/service extraction remain optional follow-ups.
