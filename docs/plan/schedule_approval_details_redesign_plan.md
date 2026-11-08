# Schedule Approval: View Details redesign plan

Date: 2026-11-08. Status: implemented 2026-11-08 (uncommitted); verified by focused tests and fixture-driven browser checks. See [Implementation status](#implementation-status).

## Goal and scope

Make View details a concise, schedule-first review surface for Dean and VPAA. Reuse the exact existing schedules TanStack table and allow a wider modal. Keep information that establishes the submission's identity, approval scope, problems, and version changes.

This plan covers `ScheduleApprovalDetailsModal` and its composition in `ScheduleApprovalPage`. It also includes extracting the Dean schedule table for genuine reuse. The room-transfer details flow, PDF layout, approval policy, API contracts, and other schedule views remain outside the redesign scope.

## Evidence and limits

The current working-tree implementation was reviewed, including existing uncommitted approval/recall fixes. Browser and native capture were unavailable in this session, so these findings concern source-defined content and behavior. No rendered screenshots, responsive layout measurements, or browser accessibility results are claimed. Visual and keyboard verification are implementation acceptance requirements.

Relevant sources:

- [Current modal](../../src/components/scheduling/ScheduleApprovalDetailsModal.tsx).
- [Approval composition, scoped schedules, snapshots, and action guards](../../src/pages/shared/ScheduleApprovalPage.tsx).
- [Existing Dean schedules TanStack table](../../src/pages/dean/Schedules.tsx).
- [Shared table renderer](../../src/components/ui/DataTable.tsx) and [table hook](../../src/components/ui/useDataTable.ts).
- [Pre-approval findings](../../src/components/scheduling/PreApprovalCheck.tsx) and [check lifecycle](../../src/components/scheduling/usePreApprovalCheck.ts).
- [Previous-version comparison](../../src/components/scheduling/RevisionDiffPanel.tsx), [existing comparison table](../../src/components/scheduling/ScheduleChangesModal.tsx), and [working-copy history](../../src/components/scheduling/RevisionChangesPanel.tsx).
- [Recent recall and approval safeguards](schedule_recall_approval_fix_plan.md).

## Findings, in priority order

| Priority | Current content or behavior | Recommended treatment |
| --- | --- | --- |
| High | Details has Submission, Sections, Scheduling checks, and Changes, but no actual schedules table. | Make the schedules table the main content directly below compact identity and scope information. |
| High | An approval-blocked alert repeats the conflict group's blocked message and return instruction. | Keep one visible blocking alert, followed by the specific findings. |
| High | A new table could accidentally show a department's current schedules instead of the selected submission/slice. | Feed it the same `printInput.allSchedules` and section scope as the PDF. Keep historical/current source identity visible. |
| High | Dean's table treats an absent conflict map as No conflict. That would be misleading for unloaded, failed, or historical checks in Details. | Supply an explicit check state; display Checking, Unavailable, or Not checked until a successful applicable result exists. |
| Medium | The header already includes department/program; Submission repeats both as labeled facts. | Keep department/program once in the header. Remove their repeated fact rows and the Submission card. |
| Medium | Three Original/Active/Recalled cards appear even when no section was recalled. | Replace them with a single scope line. Show recall details only when relevant. |
| Medium | Every entry gets a full checks card, including two sentences explaining why checks do not run. | Omit inapplicable checks content. Pending clean checks need one short result line. |
| Medium | First/reset versions receive a Changes card containing only explanatory boilerplate. | Omit the empty card; use a short secondary First submission or Reset version label when useful. |
| Medium | Revision comparison repeats the total, per-section counts, section cards, and table row totals. | Keep one change count, compact comparison provenance, return reasons, and the existing before/after table inside one disclosure. |
| Medium | Working-copy history counts audit entries above a table that counts flattened change rows. | Remove the separate event total; use the table's change-row total. Keep When and By in the history table. |
| Low | Multiple bordered cards and uppercase section headings add hierarchy to short facts. | Use a compact metadata block, one table surface, and one secondary change disclosure. Preserve existing product colors and typography. |

## Proposed content and order

1. **Compact header.** Keep Schedule details, one department/program identity, and the existing stage-specific status badge. Keep the close control. Avoid displaying the same identity again below it.
2. **Two short metadata lines.** Show the academic year/semester and `Submitted by Name · Date`. Keep real labels/accessible structure; shortening copy must not remove the meaning of the date.
3. **Scope line and conditional recall notice.** Normal: `18 sections`. Partial recall: `17 of 18 sections included · 1 recalled`. When recalled sections exist, state `Recalled sections are excluded from this approval` once. Keep their names and current statuses in an accessible disclosure; do not repeat the counts as cards. For a fully recalled historical entry, say `18 recalled sections` and show its selected submitted snapshot as read-only history, rather than implying there is an active approval scope.
4. **Applicable check summary.** Clean: `No conflicts or rule issues.` Blocking: one alert such as `1 open conflict — approval blocked`, with its actual findings visible. Rule warnings remain warnings. Keep loading and failure states distinct; shorten their prose without converting either to success.
5. **Schedules table.** Use the exact schedule table described below, with compact search, a section selector, and the existing pagination. Keep its columns readable by using the wider dialog. Omit row click in this modal so inspecting a meeting does not open another dialog.
6. **One secondary Changes disclosure.** For modified submissions, keep the existing previous-version comparison table. For closed versions, keep working-copy change history under the explicit label `Changes since this submission`. Keep comparison version references and return reasons together with this content. Do not collapse a material return reason into a tooltip. Show an error/loading state distinctly from an empty comparison. Keep the precise limitation `Instructor changes are not included` near the comparison, rather than suggesting a zero-row comparison proves everything is unchanged.

No extra metric cards, nested View details buttons, Gantt toggle, export toolbar, or approval action bar is needed inside this details layer. Approval and return continue through the existing preview and confirmation flow.

## Exact TanStack table reuse

The concrete source is the existing Dean Schedules table in `src/pages/dean/Schedules.tsx`: its seven columns are **Course, Section, Day & Time, Room, Instructor, Mode, Status**. Secretary and Program Head Schedules currently use a timetable grid; VPAA Calendar uses Gantt. `ClassSummaryTable` is a different grouped-class table and is not the selected reuse target.

Extract the Dean table's row display contract, column definitions, formatting, chronological sort, mode badges, conflict chips, and conflict row highlights into a small shared schedules-table implementation. Both Dean Schedules and View details must import it. Reuse `DataTable` and the existing TanStack configuration/hook; do not copy table markup or introduce a new table framework. Preserve the Dean page's existing filters, reset behavior, row-detail action, and table state through the extraction.

Requirements for the shared implementation:

- One row per meeting; preserve lecture/laboratory markers and the current column order. Do not group hybrid or recurring meetings into a different row model.
- Preserve existing sort controls, chronological Day & Time sorting, 12-hour time labels, and pagination with 10/25/50 row options.
- Parents own data scope, search/section/mode filters, checks, and fetching. The shared table accepts ready-to-display rows and check state; it must not fetch all departmental schedules itself.
- Details adapts `ScheduleItem` fields to the shared display contract (`courseCode/courseName/courseType` to the current Dean subject fields). Reuse mapped room/mode labels, Room TBA, instructor names, section names, and stable meeting IDs. Do not parse formatted times again when numeric day/slot fields are already available.
- Build row conflict flags from the existing package check's `result.open` only when ready. Preserve conflicts with an external meeting when they touch this package. Keep rule issues distinguishable from conflict flags.
- Maintain the Status column for all states. Only a successful applicable conflict check can produce No conflict; unknown, failed, and inapplicable/historical results must remain explicit.
- Filters narrow the displayed table only. They must not change the package checked, the PDF's scope, or the set approved/returned.

Keep the existing `ScheduleChangesTable` for before/after comparisons and the existing working-copy history table for audit events. Those have different data and should not be forced into the meeting table.

## Data and workflow safeguards

- Use `printInput.allSchedules` as the common PDF/table source, with its selected `workflowSectionIds`, allowed statuses, and snapshot choice. Never use unfiltered `rawSchedules` or a fresh broad department fetch for Details.
- Active approval slices exclude recalled sections and their newer resubmissions. A recalled historical slice may display its own selected snapshot, with an explicit read-only recalled identity.
- Label closed-record data as As submitted when the snapshot is available. If it falls back to current data, display `Submitted version unavailable — showing current working copy` persistently in Details. The current toast alone is insufficient context for a reviewer who later opens Details.
- Preserve the existing incomplete-data notice inside Details when its source is truncated. A paginated table must not imply that its loaded total represents all meetings.
- Checks keep running for the open pending package while Details is hidden. Removing prose or collapsing findings must not change approval eligibility.
- Preserve queue freshness, selection identity, current section membership, scope-change cancellation, delayed-response handling, and server-side validation. Do not change the existing approval policy for a failed/loading client check as part of this redesign.
- Keep backend endpoints and authorization as implemented. This is a frontend presentation change; no schema or API work is required by the plan.

## Width, scrolling, and accessibility

Details already uses `size="xl"`, which is `max-w-7xl`. Switch this modal to the existing `size="full"` option to give the seven-column table more room; no shared modal width change is necessary.

On desktop, use a flex body with a constrained table scrolling region, sticky table headers, and visible pagination. Reuse the scrolling pattern in `ScheduleChangesModal`. On small screens, use one dialog-body vertical scroll area and horizontal table scrolling as needed; do not shrink text or replace the table with cards. Keep controls wrapped within the viewport.

Retain the dialog's accessible name, focus trap, close label, underlying-preview inert state, and focus return to View details. Use native disclosures with clear names and keyboard access for recall/history details. Check that Escape closes Details only, including when entered through the Modified badge. Preserve textual warning/status labels alongside colors.

## Implementation sequence

1. Extract the existing Dean schedule columns/table into shared code and use it in Dean Schedules without a visible behavior change. Verify filters, Reset, sorting, paging, and its current row-detail action.
2. Adapt the already scoped approval/PDF schedule data and mount that same shared table in Details. Add explicit check/source/incomplete-data state where needed.
3. Flatten metadata and section counts, consolidate blocking messages, and make changes secondary. Adjust shared findings panels only through a narrow presentation option if other consumers need their current layout.
4. Apply the wider modal and scrolling layout. Preserve the preview/details lifecycle and existing review-intent guards.
5. Update focused tests, perform visual/keyboard checks, and record the results here. Mark this plan implemented only after those checks.

Expected files: `ScheduleApprovalDetailsModal.tsx`, `ScheduleApprovalPage.tsx`, `pages/dean/Schedules.tsx`, one small shared schedule-table module/component, narrowly scoped presentation changes to `PreApprovalCheck.tsx`, `RevisionDiffPanel.tsx`, and `RevisionChangesPanel.tsx` if required, plus the existing focused tests. Reuse `Modal`, `DataTable`, and `ScheduleChangesTable` as they are unless a demonstrated gap requires a focused fix. Preserve other uncommitted work in these files.

## Acceptance and verification

- Both Dean and VPAA can identify the submission, status, term, submitter, date, and included scope without scrolling through repeated cards.
- Details and PDF contain identical unfiltered meeting IDs for each selected entry/source. Search and section filtering reset pagination and can be cleared back to the full selected scope.
- Table reuse is structural: both consumers import the same schedule column/rendering implementation. Verify parity in column order, badges, time sorting, conflict highlighting, and pagination.
- Cover first/reset, modified, returned, approved, fully recalled, partially recalled, and subsequently resubmitted recalled sections. For 17 included out of 18, the table and review action concern only those 17; the excluded section's name/current status stays available.
- Cover snapshot available, unavailable, failed, and loading; empty schedules; incomplete loads; no filter results; clean checks; conflicts; rule warnings; and failed/loading checks. Unknown checks must never display green No conflict.
- Keep return reasons and comparison provenance even with no changed meeting rows. Keep the instructor-comparison limitation visible in the relevant disclosure. Working-copy event and change-row counts must not be conflated.
- Keep approval blocking while Details is closed and the existing stale queue/scope/409 regression checks. Do not replace those assertions with copy-only tests.
- Verify close, Escape, tab order, focus containment/return, inert preview, and Modified-badge entry in a browser. Check desktop, narrow mobile, and 200% zoom for clipped columns, wrapped controls, readable status labels, and reachable pagination.
- Run focused approval, check, and queue tests, plus meaningful coverage of the extracted schedules table. Run lint on touched code and the project build; distinguish pre-existing failures from introduced failures. No application tests were run for this documentation-only planning pass.

Completion means the schedule is the primary content, repeated explanations/cards are removed, the actual existing TanStack schedule table is shared, and approval/history safeguards still pass.

## Implementation status

Implemented 2026-11-08 in the working tree, uncommitted. Earlier uncommitted approval, recall, signatory, and partial-recall work in the same files was preserved.

### What changed

| File | Change |
| --- | --- |
| `src/components/scheduling/scheduleTableColumns.tsx` (new) | The Dean Schedules table moved here unchanged: row contract, seven columns, Lec/Lab and mode badges, conflict chips, chronological `sortKey`, and the TanStack configuration (`useScheduleTable`; the parent owns search, sorting, and paging state). Adds an explicit `ScheduleConflictState`: only `ready` can show No conflict; `loading`, `failed`, and `not-checked` show Checking…, Check unavailable, and Not checked. `scheduleItemToTableRow` adapts `ScheduleItem` from its numeric day/slot fields and mapped room labels. |
| `src/components/scheduling/ScheduleMeetingsTable.tsx` (new) | Renders that table through the existing `DataTable` with the Dean options (embedded, `classes` total, 10/25/50 rows, conflict row highlight). |
| `src/pages/dean/Schedules.tsx` | Imports the shared columns, hook, and component; its filters, Reset, Gantt view, and row-detail popup are unchanged. Moving `useReactTable` out let the React Compiler analyze the page, which surfaced two existing lint errors; both were fixed without behavior change (a redundant `setIsLoading(false)` on a fresh cache, and `useMemo(currentStandardHours, [])` → inline function). |
| `src/components/scheduling/ScheduleApprovalDetailsModal.tsx` | Rewritten on `Modal size="full"`: status badge, Term, and `Submitted by Name · Date` on one compact line; one scope line (`17 of 18 sections included · 1 recalled`, `18 sections`, or `18 recalled sections`); the exclusion note once; recalled names and current statuses in a native disclosure; the check summary only for pending packages; source/incomplete notices; the shared table (search, section filter, paging, no row click); and one Changes disclosure. No Submission/Sections/Checks cards, repeated department/program facts, or explanatory boilerplate. |
| `src/pages/shared/ScheduleApprovalPage.tsx` | Feeds Details `printInput.allSchedules` and `printInput.sections` (the PDF's exact scope and snapshot choice). Builds the table conflict state from the open package check (`result.open`, including external meetings), labels the source (As submitted / Current schedule / Current working copy), shows a persistent `Submitted version unavailable — showing current working copy.` notice, and repeats the truncation notice inside Details. First/reset versions get a short label instead of an empty Changes card. Opening from the Modified badge starts with Changes expanded. Approval, queue freshness, intent, and 409 handling are untouched. |
| `src/components/scheduling/PreApprovalCheck.tsx` | Adds `variant="summary"`: `No conflicts or rule issues.`, `N open conflict(s) — approval blocked` as the single `role="alert"` with its findings, and distinct short loading/failed copy. The default variant is unchanged. The duplicate approval-blocked alert in Details was removed. |
| `src/components/scheduling/RevisionDiffPanel.tsx` | One change count, compact `Section vs. returned version #N` provenance with return reasons kept visible, and `Instructor changes are not included.` stated in both empty and non-empty cases. |
| `src/components/scheduling/RevisionChangesPanel.tsx` | Drops the audit-entry count; the table's change-row total is the only count. |

### Verification

| Check | Result |
| --- | --- |
| `npx vitest run src/pages/shared/ScheduleApprovalPage.test.tsx src/pages/dean src/components/scheduling src/lib/approvalQueue.test.ts src/lib/liveUpdates.test.ts` | 14 files, 105/105 pass. |
| New `src/pages/dean/Schedules.test.tsx` (parity): column order, chronological rows and Day & Time sort, Lec/Lab and mode badges, 12-hour times, Unassigned, conflict chip and row highlight, filters and Reset, 10/25/50 page sizes, row-detail popup | 2/2 pass on the refactored page **and** on the HEAD version of `Schedules.tsx`, so the extraction preserves behavior. |
| Details tests (both roles) | Table columns equal Dean's; table rows equal the PDF scope (17 of 18; recalled section absent from table and section filter); section filter and search narrow, reset paging, and clear back to 17; Checking… → No conflict only after the check settles; failed check → Check unavailable, never No conflict; returned entry → Not checked, no checks section, persistent fallback notice; one blocking alert plus findings and a highlighted conflicting row; first submission label with no Changes card; return reason, provenance, and instructor limitation in the disclosure; existing stale-queue, scope-change, 409, and focus-return tests unchanged and passing. |
| `npx eslint` on all touched files | 0 errors; 2 existing TanStack `incompatible-library` warnings (now reported on the shared hook and the approval queue table). |
| `npm run build` | `tsc -b` stops on the existing `src/pages/vpaa/Archive.test.tsx` error (missing `buildings`), unrelated to this change; `npx vite build` succeeds. |
| Browser (Playwright, Chromium, Vite dev server, every `/api` call answered from an in-browser fixture: Dean, 18 sections with 1 recalled, 72 meetings, one external room conflict, a modified revision with a return reason) | **1440×900:** dialog 1408 px wide; identity/scope/alert above the table; 68 meetings (17 × 4); conflicting meeting highlighted with Room Conflict; disclosures expand to recalled status and the comparison. **Keyboard:** focus starts on Close; 40 Tab presses stayed inside Details and wrapped; preview `inert` while Details is open; Escape closed Details only and returned focus to View details; Modified-badge entry opens with Changes expanded and Escape behaves the same. **390×844:** no page-level horizontal scroll; the table scrolls horizontally inside its region; pagination reachable and working (11–20 of 68). **720×450 (200% zoom equivalent):** dialog fits, Close visible, no controls outside the dialog; the Status column is reached by horizontal table scroll. |

### Remaining limitations

- Browser checks used fixture API responses, not a running backend or real accounts; snapshot-available/loading states and the truncation notice were verified by tests, not in the browser.
- The search placeholder is clipped at its existing Dean width (`sm:w-72`), kept for parity with Dean Schedules.
- At narrow widths the Status column needs horizontal table scrolling, as on Dean Schedules.
- The full frontend suite was not run (it exhausts the Node heap in an unrelated PDF worker in this environment).
