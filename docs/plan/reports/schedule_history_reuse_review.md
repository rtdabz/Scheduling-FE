# Schedule History: Reuse Schedule and Export JSON

Date: 2026-11-10. Rechecked: 2026-11-11. Scope: Schedule History listing, Reuse Schedule, Export JSON (backend `backend/` + `wicars-ui/`).

## 1. How approved schedules are identified (as found)

| Concept | Where | Notes |
|---|---|---|
| Final approval | `DepartmentScheduleController::approveByVpaa` | Moves rows to `faculty_assignment`, sets the submission to `approved`, writes a `schedule_approved_by_vpaa` history version (source `department_workflow`) with the officials frozen in `signatories`. |
| VPAA-approved statuses | `ScheduleSemesterArchiver::VPAA_APPROVED_STATUSES` | `approved`, `faculty_assignment`, `reassignment`, `finalized`. |
| Semester snapshot | `SemesterController::activate` → `ScheduleSemesterArchiver` | On a semester switch, writes one `schedule_semester_archived` version (source `semester_change`) per department, holding only rows in a VPAA-approved status, plus instructor, split and label metadata. |
| Snapshot storage | `schedule_history_versions` / `schedule_history_items` | Each item keeps the full row in `after_snapshot` and display labels in `snapshot_metadata`. `original_schedule_id` is provenance only. |
| Shared validation | `RuleEngine`, `BatchConflictValidator` + `BatchConflictMessages`, `RuleEngine::validateConfiguredMeetingGroups`, `FacultyLoadService::projectLoad` | The same pipeline `POST /schedules/batch` uses. |

## 2. Issues found, by priority

1. **Fixed: Schedule History listed non-final events.** Dean approvals, Dean/VPAA returns and recalls were listed with approvals. The list now uses `ApprovedScheduleHistory` (VPAA approval + semester snapshot only). The `rejected` and `recalled` filters were removed, and the API answers `422` for them.
2. **Fixed: VPAA-approval snapshots lacked split metadata.** `ScheduleHistoryRecorder` stored `getAttributes()` only, so `split_group_id`, `meeting_type` and `meeting_index` (kept on `schedule_splits`) were lost. New versions include them. Older versions can read surviving split rows. When those rows have been permanently deleted, reuse reconstructs a legacy hybrid pair only from two recorded hybrid meetings for the same semester, section and course: one online and one on-site, with matching recorded lecture/laboratory hours and preferred pattern, and all three split fields absent. Courses with laboratory hours use an online lecture and on-site laboratory; lecture-only pairs use two lectures. The normal validation pipeline still checks the result. Incomplete or ambiguous legacy pairs return a `snapshot` issue; explicit null split fields in newer snapshots are not overwritten. Recovery changes only the proposed draft, never the saved history or exported JSON.
3. **By design: reuse never carries instructors.** Only the timetable (sections, courses, rooms, days, times, delivery modes) is reused; `faculty_id` is always null, and instructors are assigned again after VPAA approval, as in the normal workflow. The export still records the instructors of the approved schedule.
4. **Open (medium): approval versions do not stamp `academic_year` / `semester`.** Only the archiver writes these columns. Readers fall back to the `semesters` row; if that semester is soft-deleted, the term is unknown and reuse is refused. Fix: stamp both columns in `ScheduleHistoryRecorder::record`.
5. **Open (low): the same approved schedule can appear twice**, once as the VPAA approval and once as the semester snapshot. Both are legitimate records, so both stay listed with distinct labels.
6. **Open (low, pre-existing): `POST /schedules/batch` does not check the instructor unit ceiling** when a create operation carries `faculty_id`. Reuse is not affected because it never sets an instructor.
7. **Design constraint: sections are per-semester records.** Reuse matches each historical section to the active semester's section by department, program and name. Missing sections must be created first; reuse does not create sections.
8. **Fixed: reused drafts could be hidden by the frontend cache.** Successful reuse now invalidates schedule and dashboard data so returning to the Schedule Builder immediately loads the new drafts.
9. **Open (medium): mixed-program department snapshots have no partial reuse.** Every mapped section must be writable by the caller. A snapshot containing programs managed by different owners can therefore be refused even when part belongs to the caller. Supporting that case requires an ownership-scoped section/program selection; the existing ownership check must remain enforced.

## 3. What was built

### Endpoints

| Method | Path | Capability | Result |
|---|---|---|---|
| GET | `/api/schedule-history` | `schedule.view` | VPAA-approved entries only (`type=approved` or `type=archived`). |
| POST | `/api/schedule-history/{version}/reuse` | `schedule.create` (secretary, director, program head) | `201` with new draft schedule IDs, or `422`/`403` with `issues[]`. |
| GET | `/api/schedule-history/{version}/export` | `schedule.view` | `application/json` attachment, pretty-printed. |

Both actions return `404` for any entry that is not VPAA-approved or not visible to the user (other departments; the VPAA sees all). They are independent: export never creates schedules, and reuse never reads an exported file.

### Reuse checks (`ScheduleReuseService`)

| Check | Rule |
|---|---|
| Department | The entry's department must be the user's. Program heads may reuse only their program's sections. |
| Semester | The term (1st, 2nd or Summer) must match the active semester. The academic year may differ. |
| Sections | Each section must exist in the active semester (same program and name), be active, and have the same year level. |
| Curriculum | The active section must follow the same curriculum, and that curriculum must still be active. Course membership and placement come from `CurriculumPlacementRule`. |
| Facilities | The room must still exist and be available, the room type must fit, and borrowed rooms need a valid grant (`RuleEngine`). |
| Instructors | Not checked and not copied: reused classes have no instructor. |
| Saved schedule details | Legacy hybrid pairs with omitted split metadata must have enough recorded information to reconstruct both meetings safely. Incomplete or ambiguous legacy hybrid pairs require rebuilding the course or choosing a newer snapshot. |
| Conflicts | No room or section overlaps with the active semester (`RuleEngine`) or among the reused rows (`BatchConflictValidator`). The section must not already have the course this semester, and delegated-course duplicates are refused. |

Every failed check is returned as `{ check, message }`, and nothing is written. When all checks pass, inside the schedule write lock and one transaction, the service:

- creates new `schedules` rows with new keys and new split-group UUIDs, status `draft`, in the active semester and the mapped sections;
- records the change via `RevisionChangeRecorder`;
- writes a `schedule_created` audit entry with `source = schedule_history_reuse` and `reused_history_version_id`.

The history entry and the original rows are never modified. The new schedule follows the normal submit → Dean → VPAA workflow and does not inherit any approval.

A class that was temporarily online because of a room closure (`displaced_room_id`) is reused on-site in the room it was planned for. The room checks then decide whether that room is usable.

### JSON export (`ScheduleHistoryExporter`, schema `wicars.schedule-export` v1.0)

Top-level keys:

- `schema_version`, `exported_at`, `exported_by`
- `schedule`: history entry ID, event, original schedule IDs, counts
- `approval`: status, approver, approval time, submission ID, signatories
- `department`
- `academic_period`
- `curricula`
- `sections[].classes[]`: course, instructor, room (with building and type), day, times, `delivery_mode`, `is_hybrid`, `class_type`, split group
- `instructors[]`, `rooms[]`

Labels come from the recorded snapshot first; current records fill only the fields the snapshot did not keep.

## 4. Tests

- `backend/tests/Feature/ScheduleHistoryReuseTest.php`: successful reuse; different term refused, different academic year allowed; missing section; curriculum mismatch; unavailable room; reuse ignores the original instructor; conflicts with the active semester; no duplicate reuse; only VPAA-approved entries; department and role limits; export content and headers.
- `backend/tests/Feature/ScheduleHistoryTest.php`: listing limited to VPAA-approved entries.
- `wicars-ui/src/pages/vpaa/ScheduleHistory.test.tsx`: filters, export without reuse, confirmed reuse, issue list, cancelled reuse, Reuse hidden without `schedule.create`.

### 2026-11-11 follow-up verification

The local IT approval entry 736 contained 262 meetings across 18 sections, with no original schedule or split rows remaining. Before the fix, reuse returned 296 issues (232 meeting-detail issues and 64 facilities issues caused by missing component types). A read-only call through the corrected reuse planner reconstructed 116 hybrid pairs and validated all 262 meetings; the live schedule count stayed unchanged. Other sampled departments correctly reported existing-class duplicates or a different semester term. No live schedules were created, deleted or replaced during this check.

Regression coverage includes legacy lecture-only and lecture/laboratory hybrid reuse after original rows are permanently deleted, refusal of incomplete legacy pairs and explicit null metadata, preservation of recorded modern split links, and frontend schedule/dashboard cache invalidation.

Verification passed: 22 backend Schedule History/reuse tests (171 assertions), 10 frontend Schedule History tests, scoped PHP Pint and ESLint, and the frontend production build.

## 5. Readable reuse issue dialog (2026-11-11)

The narrow confirmation-style error dialog is replaced by a dedicated wide dialog using the existing shared `Modal`. Its desktop width can reach 1280px, with viewport limits, one scrolling content area, and visible header/footer controls. It shows the saved schedule name and period, a plain issue count, and confirmation that no classes were added.

Issues are grouped by category with counts. All groups are shown directly; the search bar, category filter buttons, Clear filters control, and redundant filtered-count line have been removed. Already scheduled courses are grouped under their sections, with one shared instruction: **Remove or reset the existing draft classes in Schedule Builder, then reuse this schedule.** Per-section **Full details** disclosures and repeated duplicate messages are omitted. Other errors, unknown check categories, and incomplete grouping fields remain readable. The footer Close button and header close control remain available.

Duplicate issues now include the optional fields `code: already_scheduled`, `section_name`, and `course_code`, alongside the existing `check` and `message`. Their concise message identifies the existing course and section. The UI also recognizes the older duplicate wording for compatibility. The shared instruction applies to draft classes; Reset eligibility and all scheduling/permission checks remain enforced. This dialog does not delete or reset classes.

Keyboard dismissal restores focus to the originating Reuse button, including when the async request and table rerender replace that button. Shared `Modal` callers retain automatic focus capture by default; this dialog supplies its original trigger explicitly.

Initial redesign verification passed: 16 backend reuse tests (147 assertions), 15 Schedule History frontend tests plus 4 shared Modal tests, scoped PHP Pint and ESLint, diff whitespace checks, and the frontend production build. Frontend checks covered 146 grouped issues across 18 sections, search/filter counts, original message disclosures, unknown categories, incomplete metadata, and keyboard dismissal/focus restoration.

The later copy refinement passed all 15 Schedule History tests and scoped ESLint. Structured and legacy duplicate errors show the shared instruction once, without Full details or repeated messages. The subsequent removal of search and filters also passed all 15 tests and scoped ESLint, including verification that all 146 course codes remain visible across 18 sections and only the two close controls remain.

Visual verification limit: automatic approval review blocked launching Chrome for screenshot checks with a generic `blocked by policy` response. Desktop/mobile rendering has not been visually verified.
