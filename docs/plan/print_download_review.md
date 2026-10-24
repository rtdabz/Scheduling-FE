# Print and Download Review

Initial review: 2026-10-16

Table print audit: 2026-10-17

## Result

The review identified six PDF preview flows, two HTML browser-print flows, and two CSV export entry points. Descriptive download filenames are now available across these flows. Existing PDF builders, report scopes, approval rules, API requests, and backend access controls are reused.

PDF previews use the browser viewer's existing download arrow. The extra WICARS download buttons and wrapper toolbar have been removed. Generated PDF bytes are uploaded through the authenticated API and exposed through a short-lived, named HTTP response with `Content-Disposition: inline` and a filename. The browser's native viewer can use that response filename when saving. [Chromium distinguishes download filenames from tab titles in its PDF handling](https://issues.chromium.org/issues/495162229).

## Inventory and implemented changes

Examples use illustrative department, instructor, room, and curriculum values; actual names come from the existing data.

| Flow | Entry point | Download name / change |
| --- | --- | --- |
| Department / all-department class schedule, including Reports | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/PrintSchedule.tsx` | `class-schedule-CIT-2026-2027-1st.pdf`; multi-department output uses `all-departments`. Native PDF download arrow. |
| Teaching load, including Reports | `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/TeachingLoad.tsx` | `teaching-load-CIT-2026-2027-1st.pdf`; a single instructor uses their name instead of the department. Native PDF download arrow. |
| Instructor timetable | `wicars-ui/src/components/InstructorTimetableModal.tsx` | `instructor-timetable-Juan-Dela-Cruz.pdf`; native PDF download arrow. |
| Curriculum print | `wicars-ui/src/lib/curriculumPrintable.ts` | `curriculum-CMO-25-2026-2027.pdf`; code and effective school year. Existing PDF auto-print instruction retained. |
| Schedule approval preview | `wicars-ui/src/components/scheduling/ScheduleApprovalPreviewModal.tsx` | Uses the shared class schedule filename through the embedded viewer's native download arrow. |
| Curriculum detail preview | `wicars-ui/src/components/curriculum/CurriculumDetailModal.tsx` | Uses the same curriculum filename as curriculum print through the embedded viewer's native download arrow. |
| Room timetable | `wicars-ui/src/pages/shared/Rooms.tsx` | Suggests `room-timetable-LAB-101.pdf` through the page title during browser printing; restores the previous title after printing. |
| VPAA master calendar | `wicars-ui/src/pages/vpaa/CalendarPage.tsx` | Suggests `master-calendar-2026-2027-1st.pdf` through the page title during browser printing; restores the previous title after printing. |
| Reports CSV, all five report categories and detail exports | `wicars-ui/src/pages/shared/Reports.tsx` | Report label plus academic year and semester when available, e.g. `CIT-Room-Utilization-2026-2027-1st.csv`. |
| VPAA activity-log CSV | `wicars-ui/src/pages/vpaa/ActivityLog.tsx` | `vpaa-activity-log-2026-10-16-14-30-05.csv`; timestamp uses the existing Philippine timezone convention. |

The class schedule builder prints department scope based on the selected section, or all supplied departments with `printAllSections`. The filename therefore identifies department scope rather than claiming the file contains only the selected section. Scope and filtering behavior were preserved.

## Shared implementation

- `src/lib/exportFile.ts` sanitizes filename parts, preserves Unicode names, removes filesystem-reserved/control characters, guards Windows device basenames, and limits filename length. Missing metadata is omitted.
- `downloadFile` reuses the existing anchor-download approach for CSV exports and popup-blocked PDF fallback. It removes temporary anchors immediately and releases object URLs after a short consumption window.
- `src/lib/pdfPreview.ts` opens the preview before asynchronous generation where possible, shows a preparation state, uploads the generated file through the shared API client, and navigates directly to the named HTTP PDF response. There is no custom PDF toolbar or duplicate download control.
- If a popup is blocked, generation falls back to a named local download without uploading. Closing a pending preview does not trigger an unexpected download. Embedded-preview cleanup and closed-tab polling release uploaded previews; expiry is the fallback if the parent app closes first.
- PDF generation failures close pending preview windows and use the existing error notification path. Teaching-load generation also resets its busy guard after failures.
- Embedded approval/curriculum previews cancel stale uploads and release their temporary preview on cleanup.

### Temporary PDF response contract

- `POST /api/pdf-previews?filename=...` accepts raw `application/pdf` bytes through existing Sanctum authentication, active-account checks, and `schedule.view`. It validates filename/content and limits files to 10 MB; creation is throttled to 10 requests per minute.
- The response returns an ID and relative signed GET URL ending in the intended filename. `GET /api/pdf-previews/{preview}/{filename}` validates the complete relative signature and expiry, restores the original credential from the encrypted cache entry, then runs normal Sanctum, active-account, and capability middleware. Revoking the original token, disabling the account, or removing permission blocks further requests.
- Signed URLs delegate temporary access to that single PDF; treat them as private links. They contain no API bearer token. Cached PDF bytes and the original credential are encrypted with Laravel's application encryption before storage.
- Preview access expires after 30 minutes or when the original login expires, whichever comes first. At most five previews per user are retained; creating a sixth evicts the oldest. The existing cache store and cache locks are reused, with a bounded owner index to clean up old keys on lazy-expiry cache stores. Redis remains the recommended production cache backend.
- `DELETE /api/pdf-previews/{preview}` uses ordinary authenticated API access and checks ownership. Responses use private/no-store caching, no-referrer, and nosniff headers. PDFs are temporary previews of client-generated output, not a new server certification or approval workflow.
- Reopen an expired or evicted preview to regenerate it. Already downloaded files are unaffected by later revocation.

## Remaining improvements, in priority order

### 1. High, conditional: prevent spreadsheet formula interpretation in CSV

**Evidence:** `Reports.tsx` places data fields directly into CSV cells. The backend activity-log export in `backend/app/Http/Controllers/Admin/ActivityLogController.php` uses `fputcsv`, which handles CSV structure but does not neutralize formulas. Neither export path contains explicit spreadsheet-formula handling.

**Impact:** If a field can contain attacker-controlled formula-like content, opening the export in a spreadsheet may interpret it as a formula. This is a static-review finding; exploitability through every input path was not tested. [OWASP describes this CSV formula-injection risk](https://owasp.org/www-community/attacks/CSV_Injection).

**Recommendation:** Define one spreadsheet-safe cell policy, apply it to both CSV exporters, and test formula prefixes, leading whitespace/control characters, embedded quotes, commas, and multiline values. Keep legitimate numeric fields numeric. Treat this as a separate change to exported data content.

### 2. Medium: fix Reports CSV quote escaping

**Evidence:** `Reports.tsx` constructs cells using strings such as `"${title}"` and joins them with commas. Embedded double quotes are not doubled.

**Impact:** Names and titles containing quotes can produce malformed or incorrectly parsed CSV rows.

**Recommendation:** Replace manual cell interpolation with one shared CSV serializer, combined with the formula policy above. Verify round-trip parsing of quotes, commas, CR/LF, Unicode, empty cells, and numeric values. Backend activity-log `fputcsv` already handles structural quoting and should be retained.

### 3. Medium: distinguish export requests from completed file generation in activity logs

**Evidence:** `Reports.tsx` posts `/reports/log-download` after loading report data and scheduling the print job, before PDF generation completes. A user may close the preview without downloading, or generation may fail afterward.

**Impact:** A recorded download does not prove that a file was generated or saved.

**Recommendation:** Review the event contract and activity-log workflow before changing it. Prefer recording an export request or successful generation at a verifiable point. A client download click can be recorded, but the browser does not provide reliable proof that the user saved the file. Preserve existing event enums until frontend/backend consumers and documentation are updated together.

### 4. Low usability limitation: Save as PDF names and expired previews

**Evidence:** Generated PDFs now use named HTTP responses. Room and calendar printing still use `window.print()`. HTTP preview URLs have an intentional 30-minute lifetime and a five-preview limit per user.

**Impact:** Native PDF downloads receive a proposed filename from the HTTP response. Print-dialog filenames and destinations remain browser/OS decisions; the page title is a suggestion. Expired/evicted previews may need to be reopened before downloading. Users can override proposed filenames.

**Recommendation:** Use the existing native download arrow for generated PDFs. If room/calendar downloads need deterministic app-provided filenames, add dedicated PDF generation using the existing report design conventions. Consider an explicit expired-preview recovery screen if long-lived preview sessions become common.

### 5. Low: improve export context and repeated-click feedback

**Evidence:** The instructor timetable currently receives instructor identity and active-semester schedule records, but no human-readable academic-year/semester metadata. The room print flow likewise has room identity without semester metadata in its print call. The table print audit added an instructor generation busy guard and stale-instructor protection.

**Recommendation:** Pass already-authorized semester metadata where available, then include it in those filenames. Keep the generation loading state and repeat-click guard for instructor timetables. Keep bulk teaching-load names scoped to the actual printed faculty set.

## Verification

- TypeScript compilation and the final production frontend build passed. `git diff --check` passed.
- Six focused frontend test files passed: 33 tests covering filenames, native preview navigation without duplicate controls, popup-blocked fallback, upload failures, stale uploads, preview cleanup, remote API URL resolution, title restoration, Reports export integration, curriculum naming, schedule scope naming, and approval behavior.
- Backend preview/report suites passed: 18 tests with 101 assertions, including inline response headers and exact bytes, signature tampering, URL/login expiry, revoked tokens, disabled accounts, removed capabilities, ownership, invalid filenames/content, Unicode names, bounded preview storage, and existing report authorization/scope. Authentication and capability regression suites also passed: 19 tests with 51 assertions.
- Changed-file lint has no new errors. `ActivityLog.tsx` retains a `react-hooks/set-state-in-effect` error, confirmed by linting its committed `HEAD` version through stdin. The other changed files pass lint with one existing missing `toast` dependency warning in `InstructorTimetableModal.tsx`.
- The temporary PDF API and middleware were added; no database schema, PDF layout, or scheduling business-rule changes were made. New PHP files pass Pint.
- Browser-native PDF toolbar downloads, print dialogs, actual filesystem saves, and visual behavior in Chrome/Edge/Firefox were not manually exercised. DOM-level tests do not replace that browser acceptance check.

## Browser acceptance checklist

1. Open each PDF flow and use the existing native download arrow. Confirm only the browser PDF toolbar is present, and confirm the proposed filename and PDF content match the selected scope.
2. Keep a curriculum preview open for more than one minute, then print/download it again.
3. Block popups and confirm a descriptive named download is requested instead of a silent failure.
4. Close a preview while generation is pending; confirm no later download is triggered.
5. Test room/calendar Save as PDF and print cancellation; confirm the original app title returns.
6. Export each Reports CSV category and a filtered activity-log CSV; confirm descriptive names and retained filter scope.
7. Revoke the login or wait beyond 30 minutes; confirm a new HTTP request cannot retrieve the previous preview. Open six previews and confirm the oldest must be regenerated.


## Table print audit (2026-10-17)

### Reviewed entry points

| Entry point | Scope and outcome |
| --- | --- |
| Curriculum management and curriculum review tables | Both retrieve the clicked curriculum's full details, resolve its saved program, disable other row print actions while pending, report failures, and release the busy state. The shared helper retains PDF auto-print and named download fallback. No additional confirmed row-scope defect found. |
| Rooms table | Uses the selected room's weekly timetable. Fixed premature printing, incomplete-cache readiness, stale request results, and cancellation cleanup. |
| VPAA Schedule History table | Builds PDF input from the selected immutable snapshot, historical semester, departments, and recorded users. No new table action defect found in static review; history API tests passed. |
| Reports directory and detail-table PDF actions | Existing department/program access checks and report scopes are preserved. Error and empty schedule handling remain. The all-semester PDF issue below remains open. |
| Instructor detail actions reached from faculty tables | Fixed stale timetable printing and missing repeat-click feedback. Individual load sheets now retrieve the selected instructor's active-semester schedules rather than printing a capped department snapshot. |
| Shared class-schedule, teaching-load, and preview helpers | Fixed cross-instance teaching-load suppression and explicit preview cancellation. Reviewed failure handlers, filenames, popup fallback, and cleanup. Calendar toolbar printing was included in the regression run as an adjacent flow. |

### Confirmed issues fixed

| Priority | Defect | Fix and regression evidence |
| --- | --- | --- |
| High, conditional on a capped snapshot or teaching across departments | `InstructorTeachingLoadButton` used only `/initial-data` schedules, warned about truncation, and continued producing an official sheet. That department snapshot can also omit the instructor's classes owned by another department. | Fetch `/schedules` with the existing faculty filter and active-semester scope. The backend retains ownership/status/program authorization. Refuse a response at the endpoint's 1,000-row limit because completeness cannot be established. Tests cover direct instructor data, retrieval failure, and the limit. |
| High | When switching instructors, an unrelated global schedule cache could suppress the loading state while the previous instructor's records remained printable. | Track the successfully loaded instructor, disable printing while loading/after failure, clear stale records, and ignore obsolete failures. Tests cover switching with the global cache present and a failed second request. |
| Medium | Room printing forced a print after 120 animation frames even if the grid was not ready, allowing a loading screen or incomplete timetable to print. Incomplete cached data could also be marked ready. | Wait for an actual rendered grid; after 15 seconds show an error without printing. Do not use cached data as complete when the caller marks it truncated. Closing the modal cancels pending automatic printing. |
| Medium | Old room requests could overwrite a newly selected room or close it after an obsolete failure. The default empty schedule array also changed identity on each render and could repeatedly fetch when initial data was omitted. | Cancel obsolete effect results and use a stable empty default. Tests verify out-of-order completion, obsolete failures, complete-data readiness, and bounded fetching. |
| Medium | A module-global 1.5-second teaching-load timer silently discarded valid print requests from other component instances. | Remove the global timer and retain the per-instance in-flight guard. Tests verify two independent requests at the same timestamp and a single generation during React Strict Mode effect replay. |
| Medium | Instructor timetable printing had no generation busy guard, permitting repeated pending PDFs and providing no progress state. | Add a synchronous guard, disabled button, preparation label, and retry after failure. |
| Low | Explicitly closing a preview handle did not cancel its blocked-popup download fallback; cancellation during an upload depended solely on the window's closed property. | Track explicit cancellation and dispose late uploads. Added tests for both cases. |

### Remaining findings and limits

1. **High: Reports teaching-load PDFs combine periods.** The Reports endpoint
   intentionally retrieves approved schedules across all semesters and returns
   `active_semester: null` (`ReportsController::show`, pinned by
   `ReportsTest::test_reports_include_every_semester`). `TeachingLoad` then
   classifies all of an instructor's supplied schedules together and prints blank
   semester/year fields. Loads from separate terms can therefore be combined and
   compared with a single basic/overload limit. Class-schedule report PDFs also
   lack per-period headings when this all-semester input is supplied. The API's
   all-semester behavior is deliberate; changing it to active-only would silently
   discard report data. Recommended follow-up: preserve the directory/API scope
   and group printable documents by semester, carrying the existing authorized
   academic-semester metadata into each group and calculating loads separately.
   This audit did not change the established Reports period contract.
2. **Medium: audit-event timing.** Reports logs a download before asynchronous
   PDF generation succeeds. This is an existing event-contract concern described
   above; a logged event does not establish a generated or saved file.
3. **Low: popup timing.** Curriculum table actions load full details before the
   shared helper opens a popup; Reports opens PDFs from an effect after fetching.
   The named download fallback avoids silent failure, but native preview/auto-print
   behavior can depend on popup availability. A future improvement can reserve
   the preview synchronously in the click handler and pass that handle through
   loading/generation, including cancellation and failure cleanup.
4. **Browser acceptance remains unverified.** Computer-use inventory returned no
   connected applications or browser sessions. Native PDF toolbar interaction,
   physical print dialogs, pagination/color fidelity, and actual saved files
   were not manually exercised. The audit used source inspection, DOM/component
   tests, PDF-builder tests, API tests, and a production build.

### Verification for this audit

- 99 distinct frontend tests passed across 17 print/export-related suites. The
  broad run passed 98 tests; a focused rerun passed the additional endpoint-limit
  regression and the instructor tests after dependency cleanup.
- 46 backend tests passed with 227 assertions across Reports, temporary PDF
  previews, Schedule History, and cross-department instructor assignment. No
  backend routes, permissions, or report data contracts changed in this audit.
- Production frontend build and TypeScript checking passed. Changed-file lint
  passes except the pre-existing `react-hooks/set-state-in-effect` error in
  `RoomDetailModal.tsx`; linting its committed HEAD version through stdin
  reproduces the same error. New test/helper code has no lint errors.
- Existing unrelated workspace changes, including Scheduling Profile removal
  and the earlier PDF preview work, were preserved.
