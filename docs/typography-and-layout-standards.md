# Typography and responsive layout standards

Audit date: 2026-11-15. Scope: the whole WICARS interface, with 100% browser zoom on a 1366×768 laptop as
the primary target, and 90% / 110% zoom and 1920×1080 as secondary targets.

This document records what the audit found, the order the problems should be fixed in, what has been
fixed so far, and the rules new screens should follow.

## 1. Why 90% zoom looked right and 100% did not

Page content is not the viewport. It is the viewport minus the 288px sidebar and 32px of page padding.

| Screen / zoom | Viewport (CSS px) | Content width |
| --- | --- | --- |
| 1366×768 at 90% | 1518 | 1198 |
| 1366×768 at 100% | 1366 | 1046 |
| 1366×768 at 110% | 1242 | 922 |
| 1920×1080 at 125% display scaling | 1536 | 1216 |
| 1920×1080 at 100% | 1920 | 1600 |

Tailwind's stock `xl` breakpoint (1280px) is measured against the viewport, so "wide desktop" layouts
switched on at 1366px even though only 1046px was available. Seven dashboard stat cards were squeezed
into one row and their labels broke mid-word ("Departmen / ts", "Completio / n"). At 90% zoom the same
layout had 150px more room and happened to fit.

## 2. Audit findings

Measured in code (class counts across `src/`) and in a headless browser at the sizes above.

### Layout

| # | Finding | Where |
| --- | --- | --- |
| L1 | `xl` / `2xl` layouts ignore the sidebar, so they apply with ~230px less room than they were designed for. 79 `xl:` usages, mostly dashboards, scheduler top bar, overview cards. | `tailwind.config.js` |
| L2 | `DataTable` (card variant) only scrolled sideways below 1024px. On desktop a table wider than its card was clipped by the card's `overflow-hidden`, leaving the last columns unreachable. | `src/components/ui/DataTable.tsx` |
| L3 | `FilterBar` switched to a single row at 1024px without wrapping, so on pages with many controls the groups overlapped or wrapped unevenly (Instructors: filter icon over the "Part-time" chip, "Add Instructor" dropped to its own misaligned row). | `src/components/ui/FilterBar.tsx`, 9 pages |
| L4 | VPAA dashboard: seven stat cards had no intermediate column count between 3 and 7. | `src/pages/vpaa/VpaaDashboardPage.tsx` |
| L5 | Fixed minimum widths on tables and grids (`min-w-[1040px]`, `min-w-[900px]`, `min-w-[56rem]`, `min-w-[760px]`, …). These are inside their own horizontal scrollers and are legitimate for timetables and wide review tables; each still needs a check with real data. | scheduler, calendar, import review |
| L6 | The `md` range (768–1023px) with the sidebar open leaves 480–735px of content while `md:` layouts assume 768px. | app shell |

### Typography

Font family is already consistent: Plus Jakarta Sans everywhere. The sizes were not:

| # | Finding | Count |
| --- | --- | --- |
| T1 | 27 distinct font sizes in TSX, including fractional ones (8.5, 9.5, 10.5, 11.5, 12.5px) and off-scale ones (15px, plus arbitrary `text-[14px]` / `text-[16px]` duplicating `text-sm` / `text-base`). | ~60 usages |
| T2 | Text below 10px (8px, 8.5px, 9px, 9.5px) on badges, tags and labels. | 42 usages in 16 files |
| T3 | Page title rendered at 30px on desktop (24px on phones), large against 11–14px content. | `PageHeader.tsx` |
| T4 | Headings have no fixed level-to-size mapping: `h2` appears at 12, 13, 14, 15, 16, 18 and 20px; `h3` at 11, 12, 13, 14, 15, 16 and 18px. | ~100 headings |
| T5 | Default search field height came from padding (≈42px) rather than the 40px control height used by form controls and buttons. | `SearchInput.tsx` |
| T6 | CSS files (`scheduler-dialogs.css`, `AutoAssignModal.css`, `RoomReassignmentPanel.css`, `onboarding.css`) set their own px/rem sizes, including 0.62–0.72rem and 17px. | ~80 declarations |

## 3. Fix order

Ordered by how much breaks for the user, then by how many screens one change repairs.

| Priority | Item | Status |
| --- | --- | --- |
| P0 | L1 Sidebar-aware `xl` / `2xl` breakpoints | Done |
| P0 | L2 Card tables scroll instead of clipping columns | Done |
| P0 | L4 VPAA stat cards: 4 columns between `lg` and `xl` | Done |
| P1 | L3 `FilterBar` groups wrap cleanly | Done |
| P1 | T3 Page title 24px desktop / 20px phone, tighter header spacing | Done |
| P1 | T1 Remove fractional and off-scale sizes | Done |
| P1 | T2 Raise sub-10px text to 10px outside timetable cards | Done |
| P1 | T5 Search field uses the 40px control height | Done |
| P2 | T4 Heading levels: bring every `h2` / `h3` onto the scale in section 4, module by module | Open |
| P2 | L5 Check each fixed-min-width table and grid with real data at 1366×768 | Open |
| P2 | T6 Move the CSS-file font sizes onto the scale | Open |
| P3 | L6 Tablet range with the sidebar open | Open |
| P3 | Sub-10px text inside timetable and Gantt cards (needs card-height changes first) | Open |

## 4. Typography scale

One typeface (Plus Jakarta Sans). Use only these sizes. They are existing Tailwind utilities, so no new
class names are needed.

| Role | Size / line height | Utility | Weight |
| --- | --- | --- | --- |
| Page title (`h1`) | 24 / 32 (20 / 28 on phones) | `text-xl sm:text-2xl` | bold |
| Dialog title | 18 / 28 | `text-lg` | bold |
| Section title (`h2`) | 16 / 24 | `text-base` | semibold |
| Card or panel title (`h3`, dashboard panels) | 14 / 20 | `text-sm` | semibold |
| Body, form controls, buttons | 14 / 20 | `text-sm` | medium–semibold |
| Navigation, dense body | 13 | `text-[13px]` | medium |
| Table cells, toolbar controls, helper text | 12 / 16 | `text-xs` | medium |
| Table headers, field labels, badges | 11 | `text-[11px]` | semibold, uppercase where it is a label |
| Micro labels, counters, tags | 10 | `text-[10px]` | bold |
| Metric numerals (dashboards) | 22 or 26 | `text-[22px]` / `text-[26px]` | bold, `tabular-nums` |

Rules:

- 10px is the floor. The only exceptions are timetable and Gantt cards (`ScheduleCard`,
  `WeeklyTimetableGrid`, `MasterGantt`, tooltips), where card height limits the text, and print footers.
- No fractional sizes and no `text-[14px]` / `text-[16px]`: use `text-sm` / `text-base`.
- Control height is 40px in forms and dialogs (`modalControl`, `modalButton`, `SearchInput`), 36px for
  compact toolbar controls, 32px for table row actions.
- Shared sources of truth: `tableStyles.ts` (tables), `modalStyles.ts` (dialog forms and buttons),
  `Badge.tsx`, `SearchInput.tsx`, `FilterBar.tsx`, `PageHeader.tsx`, `DataTable.tsx`. Change a size there,
  not per page.

## 5. Layout rules

- **Breakpoints.** `sm` 640, `md` 768, `lg` 1024 are viewport widths. `xl` is 1568 and `2xl` is 1824:
  they mean the *content area* is at least 1280px / 1536px wide. A 1366px laptop is an `lg` screen.
  Give grids an `lg:` column count that works in ~1000px, and reserve `xl:` for the wide arrangement.
- **Tables.** Use `DataTable`. A table inside a card must be allowed to scroll sideways; never rely on the
  card clipping it. Hide secondary columns with the column `meta.hideBelow` option before adding a fixed
  minimum width.
- **Flex rows.** A flexible child that holds a table, a scroller or truncated text needs `min-w-0`.
  Toolbars use `FilterBar`, which wraps its groups.
- **Fixed sizes.** Prefer `max-w-*`, `min-w-0`, `w-full`, `flex` and `grid` with `minmax(0, 1fr)`. Fixed
  pixel widths are for icons, avatars, time-axis columns and other intrinsically sized items only.
- **Horizontal scrolling.** Allowed inside a component that needs it (timetables, Gantt, wide review
  tables). The page itself (`main`) must not scroll sideways.
- **Do not solve fit with browser zoom or by shrinking text.** Change the column count, wrap, or hide a
  secondary column.

## 6. How this was tested

A headless Chrome run loads every route for the VPAA, Secretary, Dean and Program Head workspaces at six
viewports: 1366×768 and 1920×1080, each at 90%, 100% and 110% zoom (zoom is reproduced as viewport width
÷ zoom). For each page it records whether `main`, the document or the system header overflow horizontally,
which elements stick out, and the rendered font sizes.

The run uses local fixtures instead of a signed-in session, so pages render their shell, toolbars, table
headers and empty or error states, **not real rows**. Overflow that only appears with long real values
(long instructor names, many columns of data) is therefore not covered and is tracked as P2 item L5.

Results are in section 7.

## 7. Results (2026-11-15)

| Check | Result |
| --- | --- |
| Overflow matrix: 47 routes × 2 resolutions × 3 zoom levels (282 page loads) | No horizontal overflow in `main`, the document or the system header at any size |
| Page title | 24px on every route at 100% zoom (was 30px) |
| VPAA dashboard stat cards, 1366×768 at 100% | 4 + 3 grid, labels on one or two lines (was 7 cramped columns with mid-word breaks) |
| VPAA dashboard, 1920×1080 at 100% | Unchanged: 7 cards in one row |
| Instructors toolbar, 1366×768 at 100% | Filters wrap to a second row; no overlapping controls |
| `tsc -b` | Passes |
| `vite build` | Passes; built CSS contains the 1568px / 1824px breakpoints |
| Unit tests | 1762 pass, 27 fail in 4 files, none related to this work: `Reports.test.tsx` (20, the page has separate uncommitted edits), `withdrawalEligibility.test.ts` (5, logic only), `TaskGuideRunner.integration.test.tsx` (1, focus order) and `LoginDetailsPage.test.tsx` (1, passes when run alone) |
| ESLint on changed files | Only existing React hook-rule findings remain; none are on lines changed here |

Not covered: pages with real data (see section 6), dialogs opened from each page, and the 768–1023px tablet range.
