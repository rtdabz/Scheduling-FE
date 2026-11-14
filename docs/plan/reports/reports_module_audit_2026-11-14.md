# Reports module audit and fix priorities

Date: 2026-11-14

Status: findings 1 to 4 and 8 implemented on 2026-11-14; 5 to 7 remain open.

Scope: `wicars-ui/src/pages/shared/Reports.tsx`, `src/lib/reports.ts`,
`src/components/reports/ReportDetailTables.tsx`, the PDF builders it calls
(`PrintSchedule`/`schedulePdf`, `TeachingLoad`/`teachingLoadRows`/`teachingLoadSignatories`,
`roomUtilizationPdf`), and `backend/app/Http/Controllers/Reports/ReportsController.php`
with `FacultyLoadService` and `ScheduleSignatories`.

## What is already correct (keep)

| Area | Evidence |
| --- | --- |
| Approval gate | Sections count only when **every** schedule row is in `SchedulingPolicy::INSTRUCTOR_ASSIGNED_STATUSES` (`approved`, `faculty_assignment`, `reassignment`, `finalized`), all post-VPAA. `draft`, `submitted`, `approved_by_dean`, `conditionally_approved`, rejected and revision rows never reach a report. |
| Workload source | Loads come from `FacultyLoadService` assignment rows filtered to the same post-VPAA statuses. |
| Signatories | Schedule and load PDFs sign with the officials frozen on each submission (`schedule_signatories`, `loadSheetSignatories`). Missing history prints "Not recorded", never today's official. |
| Access scope | Non-VPAA users see only their department; program heads only their program (enforced server-side in `index` and `show`). |
| Generation gating | A schedule PDF with no fully approved section is refused; rows with a zero count expose no actions. |

## Findings, in fix order

| # | Priority | Finding | Fix |
| --- | --- | --- | --- |
| 1 | **P0, integrity** | `show()` returns approved data from **every** semester with `active_semester: null`. Teaching-load sheets classify all of an instructor's terms against one basic/overload ceiling and print blank semester/year fields; schedule PDFs lack term headings. (Previously logged as open High item 1 in `print_download_review.md`.) | Optional `semester_id` on `GET /reports` and `GET /reports/departments/{id}`; responses list the terms that have approved data. The page requires a term before preview or export, and the PDF builders receive that term. Calling without `semester_id` keeps the all-term contract (`test_reports_include_every_semester`). |
| 2 | **P0, accuracy** | Room Utilization rows show a fabricated count ("1 room") derived from `complete_section_count > 0 ? 1 : 0`. | Show readiness ("Approved schedules available") instead of a count. |
| 3 | P1 | Room Utilization PDF downloads are not audit-logged; `log-download` rejects `report_type=room`. | Accept `room` and log the room PDF like the other two. |
| 4 | P1 | The directory gives one generic reason ("Awaiting approved schedules") for every unavailable report. | Per-type explanations: no fully approved section, no instructor with an approved load. |
| 5 | P2, deferred | Downloads are logged when the PDF job starts, not when generation succeeds (also in `print_download_review.md`). | Needs a success callback from `PrintSchedule`/`TeachingLoad`. Not changed. |
| 6 | P2, deferred | `show()` writes `schedule_report_generated` on every **View Details** open, so previews look like generated reports in the Activity Log. With term switching this becomes more frequent. | Product decision: log previews under a separate action, or only on export. Not changed. |
| 7 | P2, deferred | The room summary (inventory and room requests) has no term dimension; only scheduled-class counts are term-scoped. | Acceptable: inventory is term-independent. Revisit if room requests gain a semester. |
| 8 | P3, UX | Oversized gradient banner, radio-dot selection indicator on report cards, unbalanced two-column directory with mostly empty left column, single action per row, no term or generation context. | Refined header, compact KPI cards, subtle selected state on fully clickable report cards, aligned department rows with Ready / Not ready badges, a term selector, and a Preview action; the preview shows term, generation time and approval basis and offers Generate PDF (printable from the PDF preview tab). |

## Decisions carried forward

- **Excel / CSV export is not offered.** It was removed deliberately (`Reports.test.tsx`: "offers no CSV
  export"). Reintroducing it needs its own decision; no export path exists to reuse.
- **PDF generation stays inside the report preview** (`Reports.test.tsx`: "offers the PDF only from
  View Details"). The preview is where the term and approval context are confirmed, so export is
  enabled only after the scoped data has loaded.
- **Print** uses the generated PDF (the preview tab has the browser print control); no second print layout
  is introduced, so printed and exported documents cannot diverge.

## Implementation notes (2026-11-14)

- `GET /reports` and `GET /reports/departments/{id}` accept an optional `semester_id` (validated) and return
  `terms`; `index` also returns `semester`. `FacultyLoadService::getAcrossSemesters` became
  `getForReport($departmentId, $programId, $semesterId)`; without a term it behaves as before.
- The page opens on the current term when it has approved data, otherwise the newest term with any.
- The PDF is built from the data shown in the preview (no second fetch), so the document matches what was
  reviewed. Room PDFs are logged after the preview opens, with their term.
- The breadcrumb and page title come from the shared `PageHeader` and were left unchanged; restyling them
  would change every page.
