# Schedule Management workspace redesign

Date: 2026-11-13. Scope: the Schedule Management page (`SchedulerPanel`) used by Secretary, Director and Program Head — workspace header, progress and actions, Manual Plotting panel, timetable grid, and page layout. UI only.

## Out of scope (must not change)

- `hooks/useScheduler.tsx`, `useConflict.ts`, `useDragDrop.ts` logic, the Rule Engine, CSP Solver, recommendation logic, API calls and payloads, database, permissions and workflow gates.
- Dialogs and modals (redesigned on 2026-11-09), the generator workflow, print/PDF output.
- The global `PageHeader` (breadcrumb + page title) shared by every page.
- Help-guide anchors: every `#schedule-builder-*` id and the `aria-pressed` / `aria-expanded` / `data-selected-section-id` attributes the guides read stay as they are.

## Audit of the existing components

The page already has the right bones: a section picker, a two-step workflow indicator, an action row, a collapsible Manual Plotting panel on the left and the timetable on the right. The problems are structural details, listed here in the order they should be fixed.

### P0 — layout and usability

| # | Problem | Where | Fix |
|---|---------|-------|-----|
| 1 | Manual Plotting is hidden by default. `isWideView` starts `true` when nothing is saved, so a first-time Secretary sees no subject list at all. | `hooks/useScheduler.tsx` (`timetable_wide_view`) | Default to the two-column view. A saved preference is still honoured and the toggle stays. |
| 2 | The workspace is not bound to the viewport. The timetable grows to its full height (27+ rows) and the whole page scrolls, so the day headers scroll away and the subject list scrolls out of reach while plotting low in the grid. The subject panel is stretched to the timetable's height rather than the screen. | `index.tsx` workspace row, `TimetableGrid/index.tsx` | On large screens give the workspace row a viewport-based height. The subject list and the timetable each scroll inside their own panel; day headers and the time column stay pinned. Small screens keep the stacked, page-scrolling layout. |
| 3 | The page wrapper adds `overflow-x-auto`, which turns it into a scroll container (breaks pinned headers, can clip the section dropdown) and a redundant `mt-6` under the page title. | `pages/secretary/ScheduleBuilder.tsx`, `pages/program_head/ScheduleBuilder.tsx` | Remove both; the timetable already scrolls horizontally inside its own panel. |
| 4 | The timetable is a card inside a card: panel border + shadow, 16px padding, then a second rounded, bordered, shadowed grid. About 34px of width is lost, and the time column is 80px wide. The left panel takes 25% of the row however wide the screen is. | `TimetableGrid/index.tsx`, `WeeklyTimetableGrid.tsx`, `index.tsx` | Render the grid flush inside the panel, narrow the time column to 64px, and give the left panel a fixed width so every extra pixel goes to the timetable. |
| 5 | Schedule cards can slide over the pinned headers once the grid scrolls (card and header share the same stacking level). Today this only shows on horizontal scroll; it becomes visible with fix 2. | `WeeklyTimetableGrid.tsx` | Raise header and time-column layers above ordinary cards. |

### P1 — hierarchy and clarity

| # | Problem | Where | Fix |
|---|---------|-------|-----|
| 6 | Progress is shown three times with four different words: "plotted" (stepper), "placed / to place" (subject panel), "placed / left" (timetable header), "unplaced" (tooltip). No completion percentage anywhere. | `TopBar.tsx`, `CourseBank/index.tsx`, `TimetableGrid/index.tsx` | One progress overview in the workspace header (plotted, remaining, percent). Subject panel keeps plain counts. Timetable header drops its copy. One vocabulary: **plotted / remaining**. During instructor assignment the same overview reports assigned / unassigned classes. |
| 7 | The header is half a card (`rounded-t-2xl border-b`, no sides) and its second band is a tall three-column block.  | `TopBar.tsx` | A single bordered panel: row 1 = section + stepper + action toolbar; row 2 = compact strip with progress, next step (with the submission and revision status), department readiness and the workflow action. |
| 8 | Slot states are off-brand and incomplete. Placement targets, the placing banner and the selected card all use blue; there is no legend, and nothing explains what a tinted cell means. | `GridCell.tsx`, `ScheduleCard.tsx`, `TimetableGrid/index.tsx` | Available = white, placement target = gold tint, selected = maroon ring, invalid = rose with a "Conflict" label. Add a slot legend to the footer while editing. |
| 9 | Grid lines are uniform and time labels group in 90-minute bands ("7:00 AM to 8:30 AM"), which does not match the 30-minute rows. | `WeeklyTimetableGrid.tsx`, `GridCell.tsx` | Hourly labels, a stronger line on the hour and a lighter one on the half hour. Still seven days and 30-minute rows. |
| 10 | No empty state when a section has nothing plotted; the "no section" state uses a large bouncing warning icon. | `TimetableGrid/index.tsx` | A quiet hint over the empty grid that does not block clicking or dropping; a calm no-section state. |
| 11 | Subject cards show status only when plotted, show lecture/lab hours only when a subject has both, and have no visible "selected" label. | `CourseBank/CourseCard.tsx` | Always show status (Plotted / To plot / Selected), units, lecture and lab hours, and the laboratory-room requirement. |

### P2 — consistency

| # | Problem | Fix |
|---|---------|-----|
| 12 | Mixed radii (`rounded-lg/xl/2xl`), `shadow-md` on the timetable, gradients on the day header, `border-2` schedule blocks, 8–9px text in places. | Panels: 12px radius, one hairline border, no shadow. Controls: 36px high, 8px radius. Schedule blocks: 1px border + 3px category accent, no shadow. |
| 13 | "Generate Schedule" collapses to "Generate" below 1536px. | Show the full label from the small breakpoint up. |

## Decisions made while planning (not confirmed with the user)

- The shared `WeeklyTimetableGrid` is used by five other screens. The new look is opt-in through a `variant="workspace"` prop; the default rendering is untouched.
- Day headers stay maroon (flat, no gradient) so the page still matches the rest of WICARS.
- The global page title stays; only the gap beneath it is tightened.
- Changing the Manual Plotting default (fix 1) touches one line of view-preference state in `useScheduler`; no scheduling logic is involved.

## Acceptance

- Everything that worked before still works: section selection, click-to-place, drag from the panel, drag between slots, move/edit/remove, conflict badges, generate, reset, print, room reassignment, submit, recall, finalize, reassignment, and the three help guides.
- At 1366×768 with the sidebar open, the subject list and the timetable are both usable without scrolling the page.
- Existing unit tests, the type check and the production build pass.

## Implementation result

Implemented on 2026-11-13. All thirteen items above are done.

| Area | Files |
|------|-------|
| Workspace header, stepper, progress overview, action toolbar | `SchedulerPanel/TopBar.tsx`, `GenerateSchedule/GenerateScheduleButton.tsx` |
| Two-column, viewport-bound layout | `SchedulerPanel/index.tsx`, `pages/secretary/ScheduleBuilder.tsx`, `pages/program_head/ScheduleBuilder.tsx` |
| Manual Plotting panel and subject cards | `CourseBank/index.tsx`, `CourseBank/CategorySection.tsx`, `CourseBank/CourseCard.tsx` |
| Timetable panel, slot states, empty states, legend | `TimetableGrid/index.tsx`, `TimetableGrid/GridCell.tsx`, `TimetableGrid/ScheduleCard.tsx`, `SchedulerPanel/constants.ts` |
| Shared grid, opt-in `variant="workspace"` | `components/scheduling/WeeklyTimetableGrid.tsx` |
| Manual Plotting visible by default | `hooks/useScheduler.tsx` (one line of view-preference state) |

Notes for future work:

- Workspace height on large screens is `max(100dvh - 21rem, min(40rem, 100dvh - 7.5rem))`. The 21rem is the system header, page padding, page title and a single-row workspace header. If the global chrome changes height, adjust it in `SchedulerPanel/index.tsx`.
- The progress overview switches from subjects (Plotted / Remaining) to classes (Assigned / Unassigned) once instructor assignment starts. It reuses counts `useScheduler` already exposed.
- The moving (selected) card deliberately sits above the pinned day header so its Edit / Remove popover is never hidden.
- With the sidebar open on a 1366px screen the timetable is narrower than its 840px minimum, so Saturday and Sunday are reached by scrolling the grid sideways (the time column stays pinned). Collapsing the sidebar or hiding Manual Plotting shows all seven days.
- For roles that also see "Reassign Room Schedule", the action toolbar wraps to a second line below about 1600px.

## Verification

- Type check: no errors in the changed files. `tsc -b` reports one error in `GenerateSchedule/YearLevelGenerateScheduleWorkflow.tsx` (`ReviewCourseRow` not found); that file was already modified in the working tree and is not part of this change, so `npm run build` fails on it until it is fixed.
- ESLint on the changed files: clean.
- Vitest: 23 files, 208 tests passed (shared scheduling components, timetable grid, scheduler hooks, workflow guide content, room recovery, instructor assignment).
- Visual check with a local fixture (`schedule-workspace-preview.local/`, git-ignored, real components with sample data and no API calls) at 1366x768, 1536x864 and 390x844: plotting, placing with a conflict target, empty section, and instructor assignment. No console errors and no horizontal page overflow.
- Not verified: the page against the live backend, real drag-and-drop with a mouse, and the three help guides end to end.

## Follow-up: 1 hour 30 minute time bands, no table scrolling

Requested by the user on 2026-11-13, replacing two decisions above (items 2 and 9, and the first and fourth notes).

- Time labels are grouped in 1 hour 30 minute bands again ("7 AM to 8:30 AM"), with the stronger grid line closing each band. Rows are still 30 minutes.
- The timetable no longer scrolls inside its panel, vertically or sideways. It renders every row at full height and all seven days fit the panel width at any size; the page scrolls instead. The day headers stay pinned to the top of the page while it scrolls.
- The Manual Plotting panel matches the timetable's height and still scrolls its own subject list.
- Day columns are narrower when Manual Plotting and the sidebar are both open (about 92px at 1366px). Schedule blocks now keep the course code readable there: the delivery badge shortens and the units badge wraps below the room.

Checked on the local fixture at 1366x768: no scrollable element inside the timetable, no horizontal overflow, subject list scrolls. ESLint clean; ScheduleCard and shared grid tests pass.

## Follow-up: Generated Schedule Overview (generator step 4)

Requested by the user on 2026-11-13. UI only; `summaryRows.ts`, the generator and its data are unchanged.

- **Summary banner** (`GenerationChangesPanel.tsx`, `ScheduleSummaryStep.tsx`): the three totals (class meetings, classes, sections) are the emphasis; the success check stays small and the "generated exactly as configured" sentence is secondary text. Gaps between the banner, toolbar and table went from 12px to 8px.
- **Filter toolbar** (`ScheduleSummaryStep.tsx`): one compact row. New search over course code, course name and section name. Section, Day, Course, Mode and "Changed only" are kept; an active filter is tinted maroon. "Clear filters" appears when anything is active (search included). The class count stays right-aligned.
- **Table** (`components/scheduling/ClassSummaryTable.tsx`): still one grouped row per class. Day, Time, Room, Instructor and Mode now print one fixed-height line per meeting, so a meeting reads straight across, with a hairline between meetings. LEC / LAB sit beside the time, times use tabular numbers, and each meeting carries its own mode badge (On-site, Online, Field) instead of one combined badge per class. Sorting, the sticky header and the internal scroll come from the shared `DataTable` and are unchanged.
- Behaviour change: a room or instructor shared by every meeting of a class used to be printed once; it is now repeated per meeting so every line is complete. `ClassSummaryTable.test.tsx` was updated for this.

Checks: ESLint clean; 45 tests pass (summary table, summary rows, changes panel, generator workflow, recommended adjustments); checked visually on `schedule-workspace-preview.local/summary.html`.

## Follow-up: Review & Generate screen (generator step 3)

Requested by the user on 2026-11-13. UI only, in `GenerateSchedule/ReviewGenerateStep.tsx` plus two spacing classes on the wizard footer in `YearLevelGenerateScheduleWorkflow.tsx`. Props, rule lists, validation and generation are unchanged.

- **Generation scope:** academic year, semester, curriculum and days are labelled facts that wrap instead of one truncated line; selected sections are listed as chips that wrap. The four metric tiles (Sections, Courses, Split, Rules) share one size, each with a hint that wraps. Tile icons were removed.
- **Course plan:** course code bold with the name as secondary text (it now wraps instead of forcing the table wide), units right-aligned in tabular numbers, and Meetings shown as a label with a one-line explanation. The last column is now "Delivery and rules": one soft delivery badge (On-site, Hybrid, Online or Field) followed by outlined rule tags. Sorting is unchanged.
- **Rules applied:** compact rows separated by hairlines, in two labelled groups with counts: "Always enforced" and "Course-specific, from your setup". The panel sizes to its content instead of stretching to the Course plan's height.
- **Layout:** Course plan takes the remaining width beside a fixed 19rem (21rem from 1280px) rules column; the columns stack below 1024px.
- **Footer:** the help text has a readable maximum width and tighter line height; Back and Generate are unchanged. The footer was already a non-overlapping fixed row below the scroll area.

The one-line explanations under Meetings ("Once a week", "Split across two days", "Lecture and laboratory meet separately", "One meeting each day") are new wording written for this change, not taken from the rule engine; confirm they match how each configuration is scheduled.

Checks: ESLint clean on `ReviewGenerateStep.tsx`; no type errors in the two files; the 25 generator workflow tests pass; checked visually on `schedule-workspace-preview.local/review.html`.
