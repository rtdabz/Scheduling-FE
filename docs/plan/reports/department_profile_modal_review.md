# Department Profile Modal — Review and Redesign Plan

**Scope:** the read-only department detail dialog opened from **Departments** (`src/pages/vpaa/Departments.tsx`, the `isDetailModalOpen` block). The **Manage programs** dialog and the department create/edit form are separate dialogs. They are out of scope, except that they share the `programDirectory` block.

## 1. How the modal works today

| Area | Current behavior |
|---|---|
| Shell | Shared `Modal` with `size="xl"` and `!max-w-6xl` (1152px). Header shows the logo, the department name, the "Department profile" description and a code chip. The body scrolls; the header and footer stay fixed. |
| Statistics | One flat `<dl>` strip: Instructors, Sections, Programs, Total Facilities (VPAA only), Created. Every stat has the same weight, and the date is mixed in with the counts. |
| Layout | `lg:grid-cols-3`. Column 1 holds Leadership and Program heads. Column 2 holds Program directory (non-VPAA) or Instructors (VPAA). Column 3 holds Instructors (non-VPAA) or Facilities (VPAA). Which content lands in which column depends on the role. |
| Leadership | Dean and Secretary/Director rows, with a dashed placeholder when nobody is assigned. |
| Program heads | Clickable rows that filter the instructor list by program. Empty state: "No program heads assigned." |
| Instructors | Full-Time/Part-Time segmented control, a single-column list, and 8 per page with prev/next. |
| Facilities (VPAA) | Laboratory/Lecture Room tabs, 8 per page, and loading/error/retry states. |
| Footer | Manage programs (VPAA, left-aligned), Close, Edit Department (when the user can manage departments). |

## 2. Problems, in fix order

### P1 — Structure (fix first; everything else depends on it)
1. **Three equal columns in a 1152px dialog.** Each column is about 360px wide. The instructor list is the densest data, but it gets the same narrow column as two short Leadership rows, so it grows tall while the other columns leave large empty areas underneath.
2. **Columns change by role.** The instructor list moves between columns 2 and 3 depending on the role, so the layout has no fixed reading order.
3. **No surface hierarchy.** Sections are bare headings floating on the beige body. Nothing groups related content, so the page reads as one long list of cards.
4. **Modal height follows the active tab.** Switching Full-Time/Part-Time or Laboratory/Lecture changes the list length, and the whole dialog resizes and jumps.

### P2 — Information design
5. **Flat statistics strip.** The counts have no visual weight and the creation date sits among them. It should become four compact metric cards, with the date moved into the header identity.
6. **Thin header identity.** The code chip sits alone on the right, and the creation date is buried in the stats.
7. **Weak program-head empty state.** A dashed box with two lines of text. It doesn't say which programs are affected.
8. **The program filter is hidden.** Clicking a program head filters the instructor list, but the instructor section shows no sign of it and offers no way to clear it there.
9. **No instructor search.** In large departments, finding one person means paging through the list.

### P3 — Visual consistency
10. Mixed radii, paddings, text sizes and borders (`text-[10px]` to `text-sm`, `py-1.5` to `py-2`, `shadow-sm` on every row, `border-l-4` accents only on head rows).
11. Instructor rows take the full column width for one short name, so most of each row is empty.
12. Count badges are solid maroon pills that compete with the headings. The maroon accent is overused.
13. Pagination controls are duplicated markup in the instructor and facility lists.

## 3. Constraints to keep (from existing tests and decisions)

- VPAA reaches the program directory through **Manage programs**, so the profile must not show a second "Program directory" heading for VPAA (`Departments.test.tsx`).
- Heading order must stay **Leadership → Program heads → Instructors → Facilities** for VPAA.
- The `Department profile` description, the Dean row's "Not assigned" text in the same parent element, the code shown once, facility list labels, pagination labels (`Previous/Next facilities`, `1–8 of 10`) and tab button names all stay the same.
- Data sources (`/departments`, `/faculties`, `/rooms`), live refresh, the program filter, permissions (`isVpaa` and `canManageDepartments`) and the 8-per-page pagination are unchanged.

## 4. Target design

```
┌ Header: logo · name · "Department profile" · [CODE] Created … · ✕ ┐
├────────────────────────────────────────────────────────────────────┤
│ [Instructors] [Programs] [Sections] [Facilities | Program heads]   │  ← 4 metric cards
│ ┌ Department information (≈5/12) ┐ ┌ Instructor directory (≈7/12) ┐ │
│ │ Leadership                     │ │ Full-Time | Part-Time  Search │ │
│ │ Program directory (non-VPAA)   │ │ filter chip (when active)     │ │
│ │ Program heads                  │ │ 2-column compact records      │ │
│ │                                │ │ pagination                    │ │
│ └────────────────────────────────┘ │ Facilities (VPAA)             │ │
│                                    └───────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────┤
│ Manage programs                          Close · Edit Department  │
└────────────────────────────────────────────────────────────────────┘
```

- Dialog: `size="wide"` (1024px) with a fixed desktop height (`min(780px, 100vh - 2rem)`). The body scrolls; the header and footer stay put.
- Grid: one column on mobile and tablet portrait, `lg:grid-cols-12` split 5/7 on desktop.
- The fourth metric card is Facilities for VPAA (the existing count) and Program heads for other roles (the existing `programHeads.length`).
- Cards: white surface, `border-slate-200`, `rounded-xl`, 16px padding, 13px semibold section titles, neutral count badges.
- Instructor search filters the active tab by name on the client. It reuses `SearchInput compact` and resets when the dialog opens.

## 5. Status (2026-11-14)

P1–P3 are implemented in `Departments.tsx`. New shared helpers: `ProfileSectionHeader` and `ProfilePager`, which replaces the duplicated pager markup. The VPAA layout puts Facilities under the left column on desktop through grid placement. The DOM order (and the mobile stacking order) is still Leadership → Program heads → Instructors → Facilities. A new test covers instructor search and clearing the program-head filter.

**Not yet done:** the layout has not been checked visually in a browser at desktop, tablet or phone widths.
