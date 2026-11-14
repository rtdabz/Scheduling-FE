# Assign Instructors Modal: UI Audit

Date: 2026-11-14
Scope: `src/pages/ClassSchedules/SchedulerPanel/Modals/AutoAssignModal.tsx` and `AutoAssignModal.css`, covering steps 1 (Build list), 2 (Review), and 3 (Confirm & save). This is a presentation-only change. Load calculations (`loadDisplay`, `loadTierForUnits`), eligibility (`facultyEligibilityForSubject`), conflict checks, queueing, removal, and saving are unchanged.

Companion document: [generate_schedule_color_audit.md](generate_schedule_color_audit.md). The two modals now share one header and one set of tokens.

## How the workflow works

- **Instructor list.** It filters by department tab (My department or Other departments), then by department within Other departments, then by search, then by employment type. Load = `assignedUnits` plus the units of queued assignments. The ceiling is the basic load plus the overload allowance.
- **Section table.** It groups the schedules for each course and section. Status comes from `getIssue` first (assigned, on the list, wrong teaching department, or ineligible). If there is no issue, `getConflictDetail` decides (an instructor clash, an availability window, or an overlap with the list or the current selection).
- **Selection.** A section is blocked when it has an issue or a conflict, or when adding it would push the projected load past the ceiling. "Select all available" adds sections greedily without going past the ceiling.
- **Review and Confirm.** Assignments are grouped by instructor and rechecked for conflicts. Saving is blocked when there is a conflict or a load is past the ceiling.

## Findings, in priority order

| # | Area | Problem | Severity |
|---|---|---|---|
| 1 | Load colors | The **Overload** badge is red (`LOAD_TIER_BADGE_CLASSES.overload = red`), but its bar is amber. Overload is an allowed allowance, so red tells people "error" when the load is valid. Red should mean only *Over limit* (past the ceiling). | High: misleading |
| 2 | Header | It uses the cream `#faf8f5` surface and is 112px tall, so it doesn't match the Generate Schedule modal and takes too much vertical space. | High: identity and space |
| 3 | Section states | Conflict rows are orange, the conflict badge is rose, and the review conflict text is orange again. A selected row is tinted only 4%, so it looks nearly the same as an available row. Assigned, On list, and Unavailable all share one gray badge. | High: state clarity |
| 4 | Tabs | The department tabs use `.selection-indicator`, which fills the active tab with solid maroon. That reads as a button rather than a tab. | Medium |
| 5 | Instructor card | The check mark sits in a column of its own while the load wraps beneath it. The selected border (`#a77e80`) is faint. Employment type, status, and department are packed into one gray line. | Medium |
| 6 | Selection footer | It is text only: the projected load has no bar and no tier color, the instructor isn't identified visually, and the empty state reads as an instruction rather than a summary. | Medium |
| 7 | Stepper | The numbers sit inline with no connectors. Completed and active steps look the same (both filled maroon). | Medium |
| 8 | Wrapping | The "Assigned Instructor: Name from Department" detail wraps freely. The schedule entries can break in the middle of a time range. | Medium |
| 9 | Modal footer | The buttons are 44px tall on desktop, while the generator uses 40px. Hover colors use the older `#34070a`. | Low |
| 10 | Typography | `.assign-modal .font-black, .font-bold { 600 }` flattens every heading to one weight. It was kept, and the hierarchy now comes from size and color. | Low (noted) |
| 11 | Table header | The global `table thead th` rule already gives the table a maroon gradient. The local `thead { #f3efea }` and `th { color }` rules are dead code. | Low (cleanup) |

## Applied fixes

1. **Load colors**, local to this modal: green for Basic Load, amber for Overload, red for Over limit. These match the bars. The shared `LOAD_TIER_BADGE_CLASSES` is left alone because other screens use it.
2. **Header**: the shared `.scheduler-brand-header` (deep maroon gradient, amber eyebrow, translucent close button), compacted to about 76px.
3. **Section states**, one visual for each: *Available* green; *Selected* Soft Maroon row with a maroon inset bar; *On list* maroon; *Assigned* neutral with the instructor shown on one line; *Unavailable* muted red; *Conflict* red; *Availability warning* amber.
4. **Tabs**: plain text tabs with a 2px maroon underline. Employment filters became a segmented control.
5. **Instructor card**: a fixed layout of avatar, name with an employment chip, and the load figure on the right, with a full-width tier-colored bar beneath. Selection adds a maroon border, a Soft Maroon fill, and a check badge on the avatar.
6. **Selection footer**: the instructor's avatar and name, the projected load with a two-part bar (current load plus selected sections), a tier chip, and the Add button. It sits below the table's scroll area, so it never covers rows on desktop.
7. **Stepper**: completed steps show a maroon check, the active step is deep maroon with an amber halo, upcoming steps are neutral, and the connectors fill as progress is made.
8. **Wrapping**: each schedule entry stays on one line. Availability details are clamped to two lines, with the full text in a tooltip.
9. **Footer**: 40px buttons on desktop (44px on phones), a Deep Maroon primary that turns Primary Maroon on hover, and a Warm Neutral surface.

## Not changed (future candidates)

- **Shared overload color.** `LOAD_TIER_BADGE_CLASSES.overload` is still red in the shared lib. Changing it would recolor overload everywhere else (dashboard, faculty pages) and should be its own decision.
- **Step 2 and 3 layouts.** Their layouts are unchanged. They inherit the new header, stepper, footer, and load colors.
