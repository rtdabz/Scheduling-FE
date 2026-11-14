# Schedule Management workspace refinement

Audited 2026-11-14. This covers the plotting workspace at **Academic Scheduling → Schedule Management**: `SchedulerPanel/TopBar.tsx`, `SchedulerPanel/TimetableGrid/*`, `components/scheduling/WeeklyTimetableGrid.tsx`, and the Manual Plotting panel (`SchedulerPanel/CourseBank/*`).

**Scope.** This is a visual refinement only. Scheduling logic, the generator, manual plotting, drag-and-drop, instructor assignment, reset, print, submission, recall, permissions, and API calls stay unchanged. No props, handlers, or state were added to or removed from the scheduler hook.

**Design direction already set by the product owner.** Table headers, the Gantt time axis, the timetable day headers, the workspace toolbar band, and the Timetable title bar use the system header's maroon gradient. The cream progress row between the toolbar band and the timetable stays light. This audit refines within that direction. It does not reverse it.

## How to read the priorities

- **P0. Fix first.** These break hierarchy or legibility on every visit, are cheap, and carry no risk to scheduling logic.
- **P1. Fix next.** These are noticeable polish or responsive gaps.
- **P2. Later.** Worth doing, but they need a product decision, touch shared components used elsewhere, or have low user impact.

## Findings

| # | Area | Finding | Fix | Priority |
| --- | --- | --- | --- | --- |
| 1 | Timetable headers | The Timetable title bar and the day-header row are two separate maroon bands, about 100px tall together. Each has its own border, so together they read as heavy. | Make them one header block: no border between the bands, a shorter day row, gold hairlines between days, and lighter weight for day names. | P0 |
| 2 | Progress row | The stats have two layouts side by side. PLOTTED and REMAINING put the label above the value, while COMPLETE puts the label and value on one line above its bar, so the numbers do not share a baseline. | Use one stat pattern: label above value for every stat, with the bar under the percentage. | P0 |
| 3 | Progress row | The same "6/6 plotted" fact appears four times: in the stepper subtitle, the PLOTTED stat, the REMAINING stat (as 0), and the Manual Plotting header. | Keep the stepper subtitle and the Manual Plotting count. Fold PLOTTED, REMAINING, and COMPLETE into one compact "6 of 6" block with a bar. Show "remaining" only when it is above zero. | P0 |
| 4 | Department readiness | The readiness bar has one segment per section with 1px gaps. With 25 sections it renders as a dashed line that looks broken, not full. | Use a solid continuous bar. Keep the count text. Keep each section's status in the View sections list. | P0 |
| 5 | Timetable actions | When open, Manual Plotting is a solid gold button. That makes it look like the primary action and competes with the gold Generate Schedule button directly above it. | A toggle should show state, not priority. Pressed is a brighter translucent fill with a gold icon. Unpressed is the standard translucent button. | P0 |
| 6 | Toolbar layout | The toolbar is a flex-wrap row with `ml-auto` actions. At tablet widths the stepper drops under the section picker and the actions float to the right, so the three groups never line up. | Use a 3-column grid: section picker, stepper (flexible), actions (end). On narrow screens it stacks predictably. | P0 |
| 7 | Schedule blocks | Blocks fill their grid area edge to edge, so back-to-back classes (for example GEC 2 at 11:30 and IT 106 at 1 PM) touch and read as one block. | Inset each block by 2px so adjacent classes separate without changing their time position. | P0 |
| 8 | Time axis | Band labels ("7 AM / to 8:30 AM") sit vertically centred in a 72px band. The start time is not on the line where the band starts, so you have to read it against the wrong line. | Top-align the start label to the band's opening line. Keep the "to" label quieter. | P1 |
| 9 | Grid lines | Vertical day dividers (`slate-200/70`) are heavier than the 30-minute lines (`slate-100`), so the columns dominate and the half-hour rhythm is hard to see. | Use quiet vertical dividers, faint 30-minute lines, and a slightly stronger line at the end of each 1.5-hour band. 30-minute rows keep their 24px height. | P1 |
| 10 | Responsive grid | The workspace grid uses `minWidth: 0` with seven `minmax(0, 1fr)` columns. On phones each day is about 40px wide and blocks become unreadable. The card clips (`overflow-clip`), so nothing scrolls. | Below `lg`, give the grid a 760px minimum and let the timetable body scroll sideways. Desktop keeps no horizontal overflow. | P1 |
| 11 | Day headers | Days with no classes ("0 classes") look the same as busy days. | Dim the count for empty days. | P1 |
| 12 | Type scale | Blocks use 8px, 8.5px, 9px, and 9.5px text for badges, units, and times. That is below a legible minimum. | Raise block text to 10px. Allow 9px only for the badges in 1-hour blocks, which are 44px tall and would otherwise overflow. | P1 |
| 13 | Code health | The header gradient string is copied into five files. | Add one shared utility (`bg-wicars-header`, plus a vertical version) in `index.css` and use it everywhere. | P1 |
| 14 | Manual Plotting panel | Its header is white with a title, subtitle, and progress, next to the maroon Timetable bar. The two cards' tops do not match in height or style. | Choose one: make the panel header match the Timetable bar, or keep it white and match its height. Needs a product decision. | P2 |
| 15 | Block content | A 1.5-hour block shows code, a mode badge, a room label, a units badge, and a time. The time, which planners scan for, is the smallest element. | Reorder to code, time, room, and drop "Room:". The units badge could move to the tooltip. | P2 |
| 16 | Mode badges | On-site badges are blue, which is outside the maroon, amber, and neutral palette. | Move to the neutral and amber palette. These badges are shared with print and other timetables and covered by `ScheduleCard.test.tsx`, so change them together. | P2 |
| 17 | Labels | "View Schedule" opens room schedules, but the label does not say so. | Consider "Room schedules". This is a copy change, so it needs product sign-off. | P2 |
| 18 | Motion | The conflict badge pulses forever, which is distracting during long sessions. | Pulse only with `motion-safe`, or pulse briefly and then stay still. | P2 |
| 19 | Tokens | Colours are hard-coded hex values (`#4e0a10`, `#C9952A`) across about 40 class strings, even though `primary`, `accent`, `parchment`, and `muted` tokens exist. | Migrate gradually when each file is touched. | P2 |

## Changes made (2026-11-14)

All P0 and P1 items (1–13) are done. P2 items (14–19) are open.

| # | Change | Files |
| --- | --- | --- |
| 1 | The day row now continues the Timetable title bar as one header block. One sticky left-to-right gradient sits behind the whole day row, so the two bands have no seam. The border between them is gone. The day row is 40px instead of 48px. Day names are semibold, and gold hairlines separate the days. Other timetables (rooms, history, instructor assignment) keep their existing header. | `WeeklyTimetableGrid.tsx` (workspace variant only), `TimetableGrid/index.tsx` |
| 2–3 | Progress uses one stat pattern: label, a value line ("6 of 6 … 100%"), then a bar. PLOTTED, REMAINING, and COMPLETE are merged into one block. REMAINING (or UNASSIGNED) appears only while it is above zero. Next step follows the same label-above-title layout. | `TopBar.tsx` |
| 4 | Department readiness uses a solid progress bar (`role="progressbar"`) instead of one segment per section. Section-by-section status stays under View sections. | `TopBar.tsx` |
| 5 | When pressed, Manual Plotting is a brighter translucent fill with a gold icon, not solid gold. View Schedule uses the same base button. | `TimetableGrid/index.tsx` |
| 6 | The toolbar band is a grid: section, workflow, actions on `xl`. On `md`, actions move to a second row. Below that, everything stacks. | `TopBar.tsx` |
| 7 | Blocks are inset 3px horizontally and 1px vertically, so back-to-back classes separate. Grid position and spans are unchanged. | `TimetableGrid/ScheduleCard.tsx` |
| 8 | Time-band labels align to the top of their band. | `WeeklyTimetableGrid.tsx` (workspace variant only) |
| 9 | Day dividers are `slate-100`, 30-minute lines are `slate-100/80`, and band-closing lines are `slate-200`. Rows stay 24px per 30 minutes. | `TimetableGrid/GridCell.tsx` |
| 10 | Below `lg`, the timetable body scrolls sideways and the grid keeps a 760px minimum. Desktop is unchanged and has no horizontal overflow. Known trade-off: below `lg`, the day row sticks within the scrolling body, not to the page. | `TimetableGrid/index.tsx` |
| 11 | Empty days show their "0 classes" count at 40% white. | `WeeklyTimetableGrid.tsx` |
| 12 | Block text is at least 10px, or 9px for the badges in 1-hour blocks. | `TimetableGrid/ScheduleCard.tsx` |
| 13 | Added the `bg-wicars-header` and `bg-wicars-header-v` utilities. They are used by the workspace band, Timetable bar, timetable grid headers, Gantt axis, and curriculum import headings. The table-header rule keeps its own copy because it needs `!important`. | `index.css`, `TopBar.tsx`, `TimetableGrid/index.tsx`, `WeeklyTimetableGrid.tsx`, `MasterGantt.tsx`, `importTheme.ts` |

### Verification

- TypeScript (`tsc --noEmit`) and ESLint on the changed files passed.
- 94 of 95 tests passed in the grid, card, generator-button, help-guide, and calendar suites. The one failure was `RevisionDiffPanel.test.tsx`, an untouched component, and its 3 tests pass when run alone. It looks like a timeout under parallel load.
- A full `src/pages/ClassSchedules` run before this work already had 7 failing tests in `withdrawalEligibility.test.ts` and `CourseTeachingAssignments.test.tsx`. Those cover recall eligibility and saving program selections, which are logic this refinement does not touch.
- **Not yet verified in a browser.** The local seed has only a VPAA account, which cannot open the plotting workspace. A visual check at 390px, 768px, 1024px, and 1440px with a Program Head or Secretary account is still needed.
