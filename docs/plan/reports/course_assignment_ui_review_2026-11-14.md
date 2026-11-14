# Course Assignment UI Review — 2026-11-14

Scope: the **Cross-Department › Course Assignment** page (`/{role}/course-assignments`).
This review covers how the page looks and lays out. Assignment logic, APIs, permissions and validation are not in scope and are unchanged.

## Components involved

| File | Role |
|---|---|
| `src/pages/ClassSchedules/CourseTeachingAssignments.tsx` | The page: teaching-college panel, year tabs, filters, course table, save footer, summary modal |
| `src/pages/ClassSchedules/CourseTeachingAssignments.css` | Table column padding plus the stacked-card layout for narrow containers |
| `src/components/ui/DataTable.tsx` | Shared table (sticky `thead`, sorting, row click). Reused as-is |
| `src/styles/selection-indicators.css` | Shared active-pill tokens, used by the year tabs |
| `src/index.css` | Global maroon table header gradient and row hover |

## Findings, by priority

### P1: layout and scrolling
1. **The whole page scrolls, not the table.** The table used `scrollClassName="overflow-visible"`, so long year levels pushed the Save footer below the fold. The sticky `thead` stuck to the app's `<main>` scroller, not to the table.
2. **The Save footer was not fixed.** The selected count and the Save button scrolled away with the rows.
3. **The college panel was sticky, but the main column was not height-bound.** The two panels scrolled differently, and the aside's `max-h-[calc(100vh-7rem)]` did not match the main column's height.

### P2: table clarity
4. **Status mixed three visual systems.** Dot plus text was used for Available, Assigned and Selected. Raw reason strings were shown for blocked rows ("Select a program for majors"). The locked note was a separate gray subline. There was no single **Unassigned / Assigned / Locked** vocabulary.
5. **Column widths were inconsistent.** Course and Program were both `!w-auto`, so they competed for space. Long program names wrapped to 3–4 lines and made row heights uneven.
6. **Ownership was hard to scan.** "Taught by" used a gray chip for assigned rows and gray text for unassigned rows. "Origin Department" was a long header for a short code.
7. **The selected-row state was barely visible:** a 4% maroon tint with no edge marker.

### P3: controls and panel polish
8. **Filter row misalignment.** The program select had a two-line description, while "Remove all" used an invisible label spacer to line up. The result was ragged.
9. **"Remove all" was too prominent.** It was a filled rose button next to the primary filters, so it competed with Save.
10. **Year tabs** were loose bordered pills that did not read as a single tab group.
11. **College cards** used a gray `bg-slate-100` count pill that was hard to see, and a full ring plus border for the active state. The logo frame did not match the rest of the app.

## Fixes applied

- The workspace is height-bound on `lg+` (`calc(100dvh - 13rem)`, min 520px). The college panel and the course table each scroll on their own. The table's `thead` sticks inside its own scroll area. The selection summary and Save footer always stay visible. Below `lg` the page scrolls normally, and the table is capped at `65vh` so the footer stays nearby.
- One `StatusPill` with four tones: **Unassigned** (emerald), **Assigned** (amber), **Locked** (slate, lock icon, tooltip with the instructor-class count) and **Selected** (maroon). Blocked-but-unlocked rows show **Unassigned** with a short reason underneath.
- Fixed column widths (`table-fixed`). Course name and program name are clamped to 2 lines with a tooltip. Units are tabular and centered. The Taught-by chip is maroon-tinted when assigned. "Origin Department" is shortened to "Origin".
- Selected rows get a maroon tint plus an amber inset edge. Locked and disabled rows keep the default cursor.
- Year tabs are a segmented control using the shared `selection-indicator` tokens. Filters sit on one aligned two-column grid. "Remove all" is now a quiet ghost button in the year row and turns rose on hover.
- College cards: rounded-square logo frame, amber "N assigned" count, maroon left edge and tint for the selected college, and tighter spacing.

## Not changed (intentionally)
- No change to `statusOf`, selection rules, the batch save and remove endpoints, the cache shape, permissions, or workflow-guide anchors (all `#course-teaching-*` ids are kept).
- The summary modal is unchanged.
