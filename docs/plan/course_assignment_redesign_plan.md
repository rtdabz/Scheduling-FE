# Course Assignment redesign plan

Date: 2026-11-08. Status: proposed; no application changes implemented.

## Goal

Make bulk teaching assignments faster through a clear, full-width course table. Users should be able to identify a course's origin, see who currently teaches it, select eligible courses together, and confidently assign them to one teaching department or program.

User priority: **faster bulk assignment with a clearer table**. Keep **Origin Department** terminology, the existing maroon/gold visual language, and the current assignment rules.

## Evidence and limits

This plan reviews the current working-tree implementation, including the recently added assigned-course summary and Origin Department wording. Browser and native capture were unavailable, so this is a source-based plan, not a screenshot-based visual audit. Responsive fit, visual density, focus behavior, and contrast must be checked on the rendered redesign before acceptance.

Sources:

- [Current Course Assignment page](../../src/pages/ClassSchedules/CourseTeachingAssignments.tsx).
- [Shared table](../../src/components/ui/DataTable.tsx), [table hook](../../src/components/ui/useDataTable.ts), [filter bar](../../src/components/ui/FilterBar.tsx), and [modal](../../src/components/ui/Modal.tsx).
- [Existing course assignment API](../../../backend/app/Http/Controllers/Faculty/CourseTeachingAssignmentController.php) and [scheduling policy](../../../backend/app/Services/Scheduling/Support/SchedulingPolicy.php).
- [Assignment regression tests](../../../backend/tests/Feature/CourseTeachingAssignmentTest.php) and [approval gate tests](../../../backend/tests/Feature/CrossDepartmentApprovalGateTest.php).

## Current friction and proposed treatment

| Priority | Verified current structure or behavior | Proposed treatment |
| --- | --- | --- |
| High | A permanent 300px teaching-college sidebar shares space with an eight-column course table. | Replace it with compact destination controls above a full-width table. Keep destination identity visible while selecting. |
| High | `Program (optional)` changes the receiving program, while the table's `Program` is the course's curriculum program. | Label these **Teaching Program** and **Origin Program**. Group destination controls separately from course filters. |
| High | Search can hide selected courses while Save still includes them. | Show total selections, units, target, and the number hidden by filters. Provide **Show selected** and **Clear selection**. |
| Medium | A Course dropdown duplicates much of the existing course search. | Use one search box plus year, origin-program, and assignment-status controls. |
| Medium | The selected state replaces a course's normal status text. | Use the checkbox and row highlight for selection; retain assignment status and any lock reason. |
| Medium | Teaching department and teaching program are collapsed into one `Taught by` value. | Display the teaching department with its specific program on a second line, where assigned. |
| Medium | Navigation says Course Assignment while the heading says Course Teaching. | Use **Course Assignment** as the page title and **Assign teaching responsibility** as the short description. |

## Recommended layout

### 1. Compact header

- **Course Assignment**, the acting department, and the active academic year/semester.
- **View assigned courses** with the existing assignment count; retain the current summary modal and workflow guide.
- Avoid extra dashboard cards. Existing counts represent explicit teaching overrides, not every course currently taught by its origin department.

### 2. Teaching destination

One compact section labeled **Assign selected courses to**:

- **Teaching Department**: choose from the existing department payload.
- **Teaching Program**: show only programs belonging to that department; an empty value means **Whole department**, not an origin-program filter.
- Show the selected destination as `CIT / BSIT` or `CIT / Whole department` beside the selection action.
- Require an explicit destination choice before selecting courses; do not silently use the first department in the list.
- For a major assigned within its origin department, explain that a specific teaching program is required. Keep the option unavailable until that requirement is met.

This remains a single workspace with one confirmation, rather than a multi-step wizard.

### 3. Course filters

- Retain the existing year-level buttons and curriculum-derived counts.
- Keep one labeled search field for course code/title, origin program, and displayed department/program codes.
- Add **Origin Program** only when the current course scope contains multiple programs. This filters existing rows; it must not fetch another department's curriculum.
- Add **Assignment status**: All, Available to assign, Assigned. Keep lock reasons visible on the rows in every applicable view.
- Include a small Reset filters action. Reset must not change the chosen teaching destination or silently expand the selected set.
- Preserve the existing all-results table for the active year initially. Do not add pagination or virtualization without evidence that this scope needs it.

### 4. Full-width course table

| Column | Content and behavior |
| --- | --- |
| Select | Individual checkbox plus a header checkbox for eligible rows in the current filtered view. Support checked, unchecked, and indeterminate states. |
| Course | Course code above title; retain major/minor information when it explains eligibility. Allow long titles to wrap. |
| Origin Department | Department code with the full name available; show **Shared** when the origin is null. |
| Origin Program | Curriculum-placement program first, then the existing course-program fallback. Do not derive it from the teaching destination. |
| Teaching Assignment | Current teaching department and optional program. With no override, show the existing origin/default meaning; do not label a default-taught course as having no instructor. |
| Units | Right-aligned course units. Count each course once. |
| Status | Assigned or Available to assign, with a visible constraint such as `Instructor assigned in 2 classes` or `Choose a teaching program`. |
| Actions | Existing Remove assignment action for eligible saved assignments. Use an accessible label naming the course; show material restrictions in the row, not only in a tooltip. |

Use stable `course.id` row identity. Do not create extra rows for sections, meeting blocks, or multiple curriculum references. Keep origin and destination details visible together instead of combining both into an ambiguous Department column.

### 5. Persistent selection bar

Show a compact action bar while at least one course is selected:

- `6 courses selected · 18 units` and the full teaching destination.
- If filters hide selections: `2 selected courses hidden by filters`, with **Show selected** available before saving.
- **Show selected** temporarily bypasses search and status filters while retaining the current year/origin scope; leaving it restores the prior filters. Every selected course must be inspectable.
- **Clear selection** and one primary action: **Assign 6 courses**.
- Preserve selected IDs across search, status changes, and sorting within the same assignment scope. Never add newly matching courses automatically.
- Clear selection when year, origin-program scope, teaching department, or teaching program changes. The removed Course dropdown no longer needs its own selection state.
- The header checkbox adds/removes only currently visible eligible IDs. It must not affect selections hidden by filters.
- On live refresh, remove any selected IDs that are no longer present or eligible, explain the change, and require review of the remaining selection. Recompute target-dependent eligibility before enabling Save.

Reuse the existing confirmation flow. Its text should state the course count, units, target department/program, and course codes. Keep the full selected list inspectable through Show selected. Snapshot the exact IDs and destination for that confirmation; freeze destination/scope/selection changes and removal actions during confirmation and saving. If live data invalidates that selection, require a fresh review before writing. Disable repeated writes while saving; cancellation and failed saves preserve the selection. Apply successful updates only to IDs confirmed by the server, merging into the latest rows rather than replacing refreshed data with a stale whole-array snapshot.

### 6. Assigned-course summary

Keep the existing summary modal as a secondary review surface. Preserve grouping by teaching department, course counts, units, and teaching-program chips. Use the same terminology as the main table. Do not turn this into a second assignment editor or add export/reporting features to this redesign.

## Rules that must remain intact

- Capability checks and the existing VPAA approval gate continue to protect Course Assignment. A stale page must still honor backend refusal.
- List only active courses in the acting department's active curriculum scope. Use curriculum placement for year level and origin program. No active curriculum means an explicit empty state, not a global fallback.
- Keep incoming delegated courses in Cross-Department rather than merging them into this origin-course table.
- Preserve current semester-placement behavior. Missing semester information must not introduce an invented new scheduling rule; state the missing context clearly.
- Support both cross-department and sibling-program assignments. Teaching programs must belong to the selected teaching department.
- Current policy allows majors to another department and to a specific sibling program. Within the origin department, a major requires a specific teaching program; the page must continue preventing an ineffective assignment back to its own program.
- Keep existing instructor-assignment locks and their explanations. Do not unlock a course, clear instructors, or change teaching responsibility automatically.
- Assigned courses continue through the existing confirmed removal flow before becoming selectable again. Preserve the existing server rules and distinguish removal of a teaching assignment from removal of an instructor.
- Counts and selected units describe unique course IDs, not instructors, sections, meeting blocks, or duplicated curriculum placements.

Documentation correction required during implementation: [business_rules.md](business_rules.md) still says majors cannot be delegated. That conflicts with current policy and regression tests. Update that paragraph to describe the verified cross-department and sibling-program rules; do not change backend policy to match the stale paragraph.

## Reuse and implementation scope

Keep the main changes in `CourseTeachingAssignments.tsx` and add focused interaction tests in `CourseTeachingAssignments.test.tsx`.

Reuse `DataTable`, `useDataTable`, `Modal`, `TableActionButton`, existing form controls, program labels, confirmation/toast handling, the workflow guide, and cache/live-refresh behavior. Reuse `FilterBar` only if its current styling fits the surrounding page without a shared-component redesign. Keep the existing GET, batch assignment, and DELETE contracts. No new table framework, dependency, schema, backend endpoint, or global visual system is expected.

Update workflow-guide anchors if controls move. Keep the existing assigned-course summary, recent Origin Department wording, and other uncommitted work intact.

## Delivery order

1. **Validate the visual direction.** Produce a desktop mockup of this table-first workspace with realistic available, assigned, shared-origin, and instructor-locked rows. Check tablet/mobile arrangements and choose the visual target before implementation.
2. **Restructure the workspace.** Apply the header, compact destination controls, filter grouping, table labels, and existing summary using current components and handlers.
3. **Complete bulk interactions.** Implement explicit destination selection, visible-only header selection, hidden-selection messaging, selected-only view, resets, and the persistent action bar.
4. **Verify and document.** Run focused frontend/backend regressions, capture the rendered workflow, verify keyboard/responsive behavior, and correct the stale major-delegation documentation.

## Acceptance checks

- One batch can assign several eligible courses to a department or a specific teaching program. Confirmation and the request contain exactly the distinct selected IDs and intended destination.
- Header selection excludes already-assigned, instructor-locked, and target-ineligible major rows. Mixed selection is visibly indeterminate; displayed totals and units are exact.
- Search/status/sort never silently add courses. Hidden selections are disclosed and inspectable. Scope/destination changes clear selections consistently.
- Shared-origin courses, long course names, department-only destinations, cross-department majors, and same-department sibling programs display accurately.
- Cancel and server failure preserve the course rows and selections. Success updates the returned IDs, summary, and counts once. Remove failure preserves the saved assignment.
- A refreshed instructor lock or approval rejection cannot be bypassed by a previously enabled button or stale selection.
- A target change, live refresh, or delayed response during confirmation/save cannot change the intended payload, clear unrelated selections, or overwrite newer rows. Show selected reveals selections hidden by ordinary filters and restores those filters on exit.
- Loading, cached-refresh failure, no active curriculum, no active semester, no results, and empty summary states remain distinct and understandable.
- Keyboard users can choose a destination, filter, select rows, review, confirm/cancel, and remove an assignment without a mouse. Labels, focus return, disabled explanations, and selection announcements are meaningful; color is not the only status cue.
- Visually inspect desktop, tablet, mobile, and 200% zoom. Keep scrolling within the table when needed; long labels, the action bar, and the confirmation must remain usable.
- Run the focused new page tests plus existing CourseTeachingAssignment, CrossDepartmentApprovalGate, and relevant CrossDepartmentInstructorAssignment backend tests. Record unrelated pre-existing check failures separately.

## Out of scope

Instructor picking, the Assign Instructors modal, automatic course allocation, new approval rules, cross-year or mixed-destination batches, new reports/exports, and application-wide navigation/style changes.
