# Dean Functional Test Cases

This suite covers the Dean functionality implemented in the available Scheduling-FE checkout. It provides manual test steps, test data, and expected results for authentication, viewing academic data, schedule review, room transfers, reports, and access restrictions.

The backend Dean controller is not present in this repository. These cases are derived from frontend routes, handlers, capability checks, and existing component tests; they are not a controller coverage audit. API persistence, authorization, and cross-department isolation require validation against a running backend. No cases have been executed. Actual Results remain blank and Status is Not Run.

## Test preparation

- Use a dedicated test environment and an active Dean account assigned to Department A, with the normal Dean capabilities `schedule.view` and `schedule.approve_dean`. Do not grant schedule creation, instructor assignment, curriculum authoring, or VPAA administration permissions.
- Prepare Department B records to detect data-scope leaks. Populate Department A with programs, instructors, facilities available to it, courses, sections, curricula, and an active semester.
- Prepare separate schedule submissions for ordinary approval, return for revision, and an on-site class with no room (Room TBA). Include a previously reviewed submission and approved records for reporting.
- Prepare room-transfer requests in pending_dean, pending_vpaa, applied/approved, and rejected states. Record the original room assignments before testing.
- Use disposable submissions for each decision test. Restore fixtures between tests; approval and return actions change workflow state.
- Use a controlled API mock or test proxy for failure and stale-data scenarios. Use browser network inspection to verify requests and payloads. Do not manufacture permission fixtures in production.
- Priority: P1 = access boundaries and decision integrity; P2 = normal viewing, filtering, exports, and recovery.

## Authentication and access

| ID | Priority | Test Scenario | Test Steps | Test Data / Preconditions | Expected Results | Actual Results | Status |
|---|---|---|---|---|---|---|---|
| DEAN-001 | P1 | Log in using valid Dean credentials | Open login; enter the Dean credentials; submit. | Active Department A Dean account. | Login succeeds and opens `/dean/dashboard`; Dean navigation is displayed. | | Not Run |
| DEAN-002 | P1 | Reject invalid credentials | Open login; enter a valid Dean username with an incorrect password; submit. | Incorrect password. | Login error appears; the user does not enter an authenticated dashboard. | | Not Run |
| DEAN-003 | P1 | Protect Dean pages without authentication | In a signed-out browser, navigate directly to `/dean/schedules/approval`. | No authentication token. | Authentication is required; protected approval content is not displayed. | | Not Run |
| DEAN-004 | P1 | Block VPAA administration pages | As Dean, visit `/users`, `/designations`, `/archive`, and `/settings` directly. | Normal Dean account. | Each page displays the locked-module view rather than its administrative controls. | | Not Run |
| DEAN-005 | P1 | Enforce approval capability in the UI | Open the Dean approval route with a controlled session fixture lacking `schedule.approve_dean`. | Test-only capability fixture. | Approval module is locked; approving or returning submissions is unavailable. This does not prove API authorization. | | Not Run |
| DEAN-006 | P2 | Handle the former Dean settings route | Navigate directly to `/dean/settings`. | Authenticated Dean. | User is redirected to `/dean/dashboard`. | | Not Run |

## Dashboard and academic information

| ID | Priority | Test Scenario | Test Steps | Test Data / Preconditions | Expected Results | Actual Results | Status |
|---|---|---|---|---|---|---|---|
| DEAN-007 | P2 | Load dashboard overview | Open Dashboard; compare displayed totals and schedule overview with the prepared records. | Department A overview data and active semester. | Dashboard loads and its displayed metrics agree with the corresponding accessible records. | | Not Run |
| DEAN-008 | P2 | Filter dashboard schedules | Apply year, section, instructor, and room filters individually and in combination; clear them. | Records spanning multiple filter values. | Schedule display follows the selected filters and restores its original scope when cleared. | | Not Run |
| DEAN-009 | P1 | View assigned department | Open Department; inspect its details and programs. | Department A and B fixtures. | Assigned Department A is displayed; Department B is not included in the Dean department list. | | Not Run |
| DEAN-010 | P1 | Prevent department and program creation | Open Department and its detail view; inspect available actions. | Normal Dean account. | Add Department, Add Program, and department/program mutation controls are unavailable. | | Not Run |
| DEAN-011 | P2 | View facilities | Open Facility; select a visible building; inspect its rooms and a room's details. | Building with rooms accessible to the Dean. | Building and room information is displayed and corresponds to the selected record. | | Not Run |
| DEAN-012 | P1 | Prevent facility administration | Inspect the building list and room list actions. | Normal Dean account. | Add Building, Add Room, edit, and archive management controls are unavailable. | | Not Run |
| DEAN-013 | P2 | Search and inspect instructors | Open Instructors; search for an existing instructor; open their details; search for a nonexistent name. | Department A instructor and unmatched search text. | Matching instructor details are shown; unmatched search shows no matching records. | | Not Run |
| DEAN-014 | P1 | Prevent instructor administration | Inspect instructor actions and detail controls. | Dean without instructor-assignment or designation-management capabilities. | Instructor creation/edit/archive and workload/availability editing controls are unavailable. | | Not Run |
| DEAN-015 | P2 | View courses | Open Courses; compare displayed records with the accessible course fixtures. | Existing accessible courses. | Course information loads correctly; the page is usable for Dean review. | | Not Run |
| DEAN-016 | P2 | Search and filter sections | Open Sections; search an existing section; apply program, year-level, and semester filters. | Multiple Department A sections and Department B fixtures. | Results match selected filters within the Dean's department scope. | | Not Run |
| DEAN-017 | P1 | Prevent section creation and editing | Inspect Sections actions. | Dean without `schedule.create`. | Section creation and management controls are unavailable. | | Not Run |
| DEAN-018 | P2 | View and search curricula | Open Curriculum; search by existing name/code; open its details. | Existing accessible curriculum. | Matching curriculum and its course information are displayed. | | Not Run |
| DEAN-019 | P1 | Preserve curriculum review access | Inspect curriculum actions; open an accessible curriculum detail URL with `?mode=edit`. | Normal Dean account. | Curriculum authoring controls remain unavailable, including when edit mode is requested in the URL. | | Not Run |
| DEAN-020 | P2 | Print a curriculum | Select Print Curriculum for an accessible record. | Curriculum containing courses. | Printable output is generated for the selected curriculum and contains its expected course information. | | Not Run |

## Schedule viewing and approval

| ID | Priority | Test Scenario | Test Steps | Test Data / Preconditions | Expected Results | Actual Results | Status |
|---|---|---|---|---|---|---|---|
| DEAN-021 | P1 | Scope All Schedules | Open All Schedules and inspect loaded meetings. | Records in Departments A/B and multiple semesters. | Displayed schedules belong to the Dean's assigned department and active semester when those scope values are present. | | Not Run |
| DEAN-022 | P2 | Filter All Schedules | Select a section and delivery mode; then select a combination with no meetings. | Multiple sections and modes. | Only matching meetings appear; unmatched combination displays the no-schedules message. | | Not Run |
| DEAN-023 | P1 | Scope the approval queue | Open Schedule Approval; inspect submissions and section membership. | Department A/B submissions for active and other semesters. | Schedule submissions are limited to the Dean's department and active semester. | | Not Run |
| DEAN-024 | P2 | Filter approval requests | Switch queue tabs; apply status and request-type filters; clear filters. | Schedule and room-transfer requests in different states. | Visible records match the chosen tab, status, and request type; pagination remains within the available result range. | | Not Run |
| DEAN-025 | P1 | Preview the submitted schedule version | Open a pending schedule's details; wait for its snapshot to load. | Submission snapshot differing from the current working copy. | Preview uses the submitted snapshot for the package's sections after loading completes. | | Not Run |
| DEAN-026 | P2 | Recover when snapshot loading fails | Open submission details while its snapshot request fails. | Controlled snapshot API failure. | Submitted Version Unavailable notification explains that the current working copy is shown instead. | | Not Run |
| DEAN-027 | P1 | Approve an ordinary schedule | Open eligible pending submission; select Approve; confirm. | Submitted package without Room TBA. | Request uses the selected submission ID; on success the package becomes approved_by_dean / pending_vpaa and is shown as Pending VPAA Approval. | | Not Run |
| DEAN-028 | P1 | Cancel schedule approval | Start approval; cancel the confirmation. | Eligible pending submission. | No approval request is sent and the submission remains unchanged. | | Not Run |
| DEAN-029 | P1 | Require a Room TBA approval reason | Approve a package containing an on-site meeting without a room; try blank, whitespace-only, and two-character reasons. | Room TBA package. | Conditional-approval dialog appears; trimmed reasons shorter than three characters are rejected without submitting approval. | | Not Run |
| DEAN-030 | P1 | Conditionally approve Room TBA | Enter a valid justification in the conditional-approval dialog; confirm. | Reason: Awaiting laboratory allocation. | Request includes override_room_tba=true and the trimmed override_reason; success produces conditionally_approved and pending_vpaa state. | | Not Run |
| DEAN-031 | P1 | Handle newly introduced Room TBA | Attempt ordinary approval while the API responds with room_tba_override_required. | Controlled response for a schedule changed since loading. | UI opens the Room TBA reason flow and refreshes data; it does not report ordinary approval success. | | Not Run |
| DEAN-032 | P1 | Return a schedule for revision | Open a pending package; select return/reject; provide a reason; confirm return. | Reason: Resolve the overlapping laboratory classes. | Request contains selected submission ID and rejection_reason; success marks rejected_by_dean and displays Returned for Revision. | | Not Run |
| DEAN-033 | P1 | Require a return reason | Open return dialog; submit an empty or whitespace-only reason. | Eligible pending package. | Required-reason error appears; no return request is sent. | | Not Run |
| DEAN-034 | P1 | Preserve state on approval failure | Confirm approval while API returns a controlled failure. | Pending submission; API error. | Approval Failed error appears and local submission status is not advanced to approved. | | Not Run |
| DEAN-035 | P1 | Preserve return reason on failure | Type a return reason; submit while API returns a stale-review conflict or other failure. | Controlled error response. | Error appears inside the return flow; dialog and typed reason remain available; no successful local transition is shown. | | Not Run |
| DEAN-036 | P2 | Distinguish queue failure from no records | Fail the queue load; inspect the message; restore API and select Retry. | Controlled initial-data failure. | Load failure and Retry are displayed; successful retry loads records instead of leaving a misleading empty queue. | | Not Run |

## Room-transfer review

| ID | Priority | Test Scenario | Test Steps | Test Data / Preconditions | Expected Results | Actual Results | Status |
|---|---|---|---|---|---|---|---|
| DEAN-037 | P2 | Preview proposed room transfers | Filter approval queue to room transfers; open a pending request. | Transfer with known current/proposed assignments. | Transfer details identify the selected request and its proposed changes. | | Not Run |
| DEAN-038 | P1 | Approve and forward a transfer | Open a pending_dean transfer; select Approve; confirm; inspect the refreshed request and room assignments. | Disposable pending transfer. | Request advances to pending_vpaa / Pending VPAA Approval. Dean approval forwards the request; existing schedule assignments remain unchanged. Persistence requires integration validation. | | Not Run |
| DEAN-039 | P1 | Require a transfer rejection reason | Select Reject; submit blank reason; then enter a reason and confirm. | Reason: Retain the currently assigned laboratory. | Blank reason is blocked; valid rejection sends the reason and the refreshed request is rejected_by_dean. | | Not Run |
| DEAN-040 | P1 | Prevent decisions on reviewed transfers | Open pending_vpaa, approved/applied, and rejected transfer records as Dean. | Previously reviewed requests. | Approve and Reject controls are unavailable; details remain viewable. | | Not Run |
| DEAN-041 | P1 | Prevent duplicate transfer submission | Confirm an approval and rapidly click again while the request is pending. | Delayed successful response. | Only one decision request is sent for the confirmation. | | Not Run |
| DEAN-042 | P2 | Isolate transfer-loading failure | Fail transfer retrieval while ordinary schedule retrieval succeeds; retry transfer loading after restoring service. | Controlled transfer API failure. | Ordinary schedule approvals remain available; transfer error can be retried and recovered. | | Not Run |

## Reports and history

| ID | Priority | Test Scenario | Test Steps | Test Data / Preconditions | Expected Results | Actual Results | Status |
|---|---|---|---|---|---|---|---|
| DEAN-043 | P2 | Inspect report details | Open Reports; select an available report; open details and search for a known record. | Populated accessible report. | Detail records and search results match the selected report and available data. | | Not Run |
| DEAN-044 | P2 | Export report CSV | Export a populated report; open the downloaded CSV. | Known report fixture. | CSV downloads successfully; headings and rows agree with the selected report and expected records. | | Not Run |
| DEAN-045 | P2 | Print an approved schedule report | Print an available schedule report containing a fully approved section. | Fully approved schedule. | Schedule print preview opens and contains the selected report's approved schedule data. | | Not Run |
| DEAN-046 | P2 | Handle absence of printable approved schedules | Attempt schedule printing for a scope with no fully approved sections, where the action is available. | No fully approved schedule. | Nothing to Print notification appears and no misleading schedule printout is produced. | | Not Run |
| DEAN-047 | P2 | View schedule history | Open Schedule History; open a historical schedule entry. | Existing approval/return history. | History records and selected schedule details load; the historical preview does not offer approval actions. | | Not Run |
| DEAN-048 | P2 | Print a historical schedule | Select Print schedule on a history entry. | Printable historical entry. | Print flow opens for the selected entry and represents that entry's schedule. | | Not Run |

## Backend integration checks requiring controller access

These are proposed security/integrity acceptance tests, not verified statements about the absent controller implementation. Resolve exact response codes and workflow rules from the backend before execution.

| ID | Priority | Test Scenario | Test Steps | Test Data / Preconditions | Expected Results | Actual Results | Status |
|---|---|---|---|---|---|---|---|
| DEAN-049 | P1 | Reject cross-department decisions | Using a Department A Dean token, attempt approval/return against a Department B submission and a transfer outside the account's authorized scope. | Authorized test environment; known out-of-scope records. | Proposed acceptance criterion: server denies unauthorized decisions and leaves all affected records unchanged. | | Not Run |
| DEAN-050 | P1 | Reject administrative mutations directly | Attempt VPAA-only user, designation, department, program, and building mutations using a Dean token. | Endpoint contracts obtained from backend; disposable fixtures. | Proposed acceptance criterion: server rejects every unauthorized mutation; hidden UI controls cannot be bypassed with direct requests. | | Not Run |
| DEAN-051 | P1 | Reject stale or repeated workflow decisions | Approve a submission; repeat the decision and attempt a conflicting return using its old state. | Controller workflow contract and disposable submission. | Proposed acceptance criterion: workflow remains consistent, with no duplicate transition or unauthorized reversal; client handles the backend response. | | Not Run |
| DEAN-052 | P1 | Enforce server-side read scope | Request schedules, submission snapshots, reports, history, and transfer details using unauthorized record identifiers or filters. | Department A token and out-of-scope fixtures; backend scope contract. | Proposed acceptance criterion: responses expose only data authorized for the Dean, including documented shared-resource exceptions. | | Not Run |

## Implementation traceability

Paths below are relative to the repository root. They identify the implementation reviewed, not evidence of successful execution.

| Cases | Source files |
|---|---|
| 001–006 | `src/pages/LoginPage.tsx`, `src/App.tsx`, `src/navigation/deanNav.ts` |
| 007–008 | `src/pages/dean/DeanDashboardPage.tsx` |
| 009–010 | `src/pages/vpaa/Departments.tsx` |
| 011–012 | `src/pages/shared/Rooms.tsx` |
| 013–014 | `src/pages/shared/Faculty.tsx` |
| 015–017 | `src/App.tsx`, `src/pages/secretary/Sections.tsx` |
| 018–020 | `src/pages/curriculum/CurriculumListPage.tsx`, `src/pages/curriculum/CurriculumDetailPage.tsx` |
| 021–022 | `src/pages/dean/Schedules.tsx` |
| 023–036 | `src/pages/shared/ScheduleApprovalPage.tsx`, `src/pages/shared/ScheduleApprovalPage.test.tsx` |
| 037–042 | `src/components/rooms/RoomTransferRequests.tsx`, `src/pages/shared/ScheduleApprovalPage.tsx`, `src/pages/shared/ScheduleApprovalPage.test.tsx` |
| 043–046 | `src/pages/shared/Reports.tsx` |
| 047–048 | `src/pages/vpaa/ScheduleHistory.tsx` |
| 049–052 | Proposed backend integration coverage; controller implementation unavailable in this checkout. |

