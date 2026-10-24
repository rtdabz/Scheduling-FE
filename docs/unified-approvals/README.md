# Unified schedule and room transfer approvals

Dean and VPAA room transfers appear in the existing Pending Approval table. Request Type distinguishes Room Transfer from Schedule Approval. Both use the existing status tabs, department/status filters, sorting, pagination and View action. Request Type filtering and Reset Filters apply to the shared queue. Notifications open the selected transfer's details from that queue.

Room transfers reuse the existing review and confirmation components. The Dean forwards a request to the VPAA without applying schedules. Only final VPAA approval applies the stored plan after validation. Rejections require a reason and preserve original schedules. Regular approval actions and payloads remain unchanged.

The transfer API's `changes` field is a details projection that excludes online meetings. Complete plan membership, linked meetings, validation and application remain intact. Regular schedule queries and previews include online classes. Secretary monitoring retains its paginated table. Dean and VPAA details reuse the Schedule Approval PDF preview, with a Changes Summary and View Details to expand the full proposed change list.

Independent transfer loading failures show a retry notice while regular approvals remain available. Closing nested confirmation/details dialogs now restores the page's original scroll state, regardless of cleanup order.

## Verification

- 80 backend tests passed (1,055 assertions): RoomRecoveryTest and ScheduleApprovalTargetingTest. Includes physical-only transfer details, complete stored plan membership, online regular approvals through both stages, rejection, scoping, duplicate decisions, and preservation before final approval.
- 94 frontend tests passed across approval queues, room recovery, transfer review, notification links, rooms, room detail modals, ToastContainer and Assign Instructors.
- Production TypeScript/Vite build passed. Targeted ESLint has no errors; TanStack Table produces its existing React Compiler compatibility warnings. Whitespace checks passed.
- 27 headless Chromium checks passed with isolated fixtures and the actual components. Includes mixed queues, request/department filters, main/detail pagination, Dean approval, rejection, VPAA confirmation, notification links, keyboard focus, scroll restoration and 390/768/1440px layouts. No console errors or runtime exceptions.
- Axe reports no WCAG A/AA violations in the inspected transfer details at those widths. This is an automated check, not a claim of full accessibility compliance.

Browser evidence is in this directory. The local sample preview is http://localhost:5173/unified-approvals-preview.local/ (`?stage=vpaa` for VPAA). Fixture callbacks do not update real schedules. Real approval persistence and authorization were verified with isolated backend tests; authenticated production approvals were not performed.
