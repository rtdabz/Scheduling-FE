# SchedulerPanel — UI/UX Evaluation & Improvement List

Scope: `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/**`
(shared by the Secretary and Program Head panels).

## What works well

- Clean two-phase workflow (Plotting → Faculty Assignment) with a clear
  stepper and status badges.
- Live conflict detection for section / room / faculty overlaps, surfaced in
  the drop modal, the inline faculty panel, and a dismissible banner.
- Good empty states ("No Section Selected", "No subjects found").
- Logical component split with hooks (`useScheduler`, `useConflict`,
  `useDragDrop`) and well-organized category color coding.
- Nice touches: auto-computed end time, drag-to-reschedule, per-day class
  counts, assignment progress bar.

## Overall assessment

The visual design is polished and the interaction model is thoughtful. The
gaps are concentrated in **accessibility**, **interaction robustness** (touch /
keyboard / feedback), and a few **correctness/UX logic** issues. The panel also
runs entirely on mock data (`MOCK_*` in `constants.ts`) and is not yet wired to
the backend API.

Legend — Severity: Critical / High / Medium / Low | Effort: S / M / L

## Implemented (age-friendly pass — round 1)

- **Click-to-place is now a primary interaction** (not just drag): click a
  subject in the bank → it highlights ("Click a slot") → click any empty grid
  cell to open the Place modal. An instruction banner shows what's being placed
  with a Cancel button. Cells and subjects are keyboard-activatable
  (Enter/Space). *(addresses A1)*
- **Click-to-move placed classes**: in the plotting phase, click a class to arm
  it (blue ring) then click a new slot; conflicts are checked and reported.
  Drag-and-drop still works for users who prefer it.
- **Delete control is always visible and larger** (24px, was 16px hover-only)
  with an `aria-label`. *(addresses A7 + click-target size)*
- **Reduced motion**: removed the continuous `animate-pulse` on awaiting-faculty
  cards (replaced with a static ring) and gated hover scale/translate behind
  `motion-reduce`. *(addresses A6)*
- Minor contrast bump on subject name text.

Remaining high-value age-friendly items: global text-size toggle + "Comfort
mode" (A5), styled dialogs/toasts replacing native confirm/alert (B2/B3),
broader contrast audit (A5), accessible custom dropdowns (A2), modal focus
management (A3).

---

## Phase 1 — Accessibility (highest impact, currently the weakest area)

- [ ] **A1. Drag-and-drop has no keyboard or touch alternative**
  - Severity: High | Effort: L | Files: `useDragDrop.ts`, `GridCell.tsx`,
    `SubjectCard.tsx`
  - Placing subjects is only possible via native HTML5 drag-and-drop. This
    excludes keyboard users entirely and is unreliable on touch devices
    (tablets/phones). Add a click-to-select-then-click-cell flow (or a "Place"
    button on each subject that opens the day/time picker) as a first-class
    alternative.

- [ ] **A2. Custom dropdowns are not accessible**
  - Severity: High | Effort: M | Files: `TopBar.tsx` (section), `FacultyPanel`
  - Built from `<button>` + `<div>` with no `role="listbox"`/`option`,
    `aria-expanded`, arrow-key navigation, Escape-to-close, or click-outside to
    close. The section dropdown in particular never closes on outside click.
    Either use a headless accessible combobox or add the ARIA + key handling.

- [ ] **A3. Modals lack focus management and ARIA**
  - Severity: High | Effort: M | Files: `DropModal.tsx`, `FacultyModal.tsx`
  - No `role="dialog"`/`aria-modal`, no focus trap, focus is not moved into the
    modal on open or restored on close, and Escape does not close them
    (DropModal closes on backdrop click only; FacultyModal only via the X).

- [ ] **A4. Color is the only signal in several places**
  - Severity: Medium | Effort: S | Files: `constants.ts`, `ScheduleCard.tsx`,
    `GridCell.tsx`
  - Category and class-mode meaning rely on color. There are text labels for
    categories (good), but mode/status/conflict states lean on color alone.
    Add icons or text so color-blind users aren't excluded, and verify contrast
    (see A5).

- [ ] **A5. Font sizes and contrast below accessible minimums**
  - Severity: Medium | Effort: M | Files: throughout
  - Heavy use of `text-[9px]`/`text-[10px]`/`text-[11px]`, plus low-contrast
    `text-gray-400` on white. Many fall short of WCAG AA. Establish a minimum
    readable size and audit contrast. (Full validation needs manual testing
    with assistive tech and expert review.)

- [ ] **A6. Animations don't respect `prefers-reduced-motion`**
  - Severity: Low | Effort: S | Files: `ScheduleCard.tsx` (`animate-pulse`),
    `TimetableGrid` (`animate-bounce`), various `animate-in`
  - The continuously pulsing "awaiting faculty" cards can be distracting and
    problematic for motion-sensitive users. Gate animations behind the
    reduced-motion media query.

- [ ] **A7. Icon-only buttons need accessible labels**
  - Severity: Low | Effort: S
  - Card delete / remove-faculty buttons rely on `title` only in places; add
    consistent `aria-label`s.

## Phase 2 — Interaction robustness & feedback

- [ ] **B1. Remove the "DEV" status switcher from the production UI**
  - Severity: High | Effort: S | File: `TopBar.tsx`
  - The DEV `<select>` that force-changes a section's workflow status ships in
    the live top bar. Any user can jump a schedule to "approved"/"finalized".
    Remove it or guard behind a dev-only flag.

- [ ] **B2. Replace native `confirm()` / `alert()` with styled dialogs/toasts**
  - Severity: Medium | Effort: M | File: `useScheduler.tsx`
    (`handleClearAll`, `handleInlineFacultyAssign`)
  - Native dialogs are jarring, unstyleable, and inconsistent with the custom
    modal design already in use.

- [ ] **B3. No success feedback (toasts) for key actions**
  - Severity: Medium | Effort: M
  - Placing, assigning faculty, submitting, finalizing, and clearing happen
    silently. Add lightweight toast confirmations.

- [ ] **B4. No undo for destructive actions**
  - Severity: Medium | Effort: M
  - Clear All, delete schedule, and remove faculty are irreversible. Pair with
    an undo toast (or at least confirm consistently — see B2).

- [ ] **B5. Drag preview doesn't show the full time block it will occupy**
  - Severity: Medium | Effort: M | Files: `useDragDrop.ts`,
    `TimetableGrid/index.tsx`, `GridCell.tsx`
  - Only the single hovered cell is highlighted, but a subject spans N slots
    (`units * 2`). Users can't preview how far down the block extends. Highlight
    the full span on hover.

- [ ] **B6. Hover conflict check ignores room conflicts**
  - Severity: Low | Effort: M | File: `useConflict.ts` (`getDragOverConflict`
    passes `roomId = ""`)
  - During drag, a cell can read as "Place" (no conflict) even when the chosen
    room will conflict, because room isn't known until the modal. Consider
    signalling "room TBD" rather than implying it's free.

- [ ] **B7. Touch/responsive layout needs work**
  - Severity: Medium | Effort: L | Files: `index.tsx`, `TimetableGrid`
  - Side panels (`min-w-280px`) plus a `min-w-[900px]` grid don't fit small
    screens; combined with drag-and-drop this makes the panel hard to use on
    tablets. Define a tablet/mobile layout and the touch interaction (ties to
    A1).

## Phase 3 — UX logic & correctness

- [ ] **C1. "Unplaced / Remaining" subject counts are misleading**
  - Severity: Medium | Effort: M | File: `useScheduler.tsx`
    (`totalSubjects = MOCK_SUBJECTS.length`)
  - The count compares against the entire subject bank, not the section's
    actual curriculum/required subjects. A section will never need every subject
    listed, so "X Unplaced" is conceptually wrong. Base it on the section's
    required subject set.

- [ ] **C2. Hardcoded term label in the grid header**
  - Severity: Low | Effort: S | File: `TimetableGrid/index.tsx`
    ("1st Semester AY 2026-2027")
  - Should come from the active term, not a literal string.

- [ ] **C3. Two inconsistent faculty-assignment UIs**
  - Severity: Low | Effort: M | Files: `FacultyPanel/index.tsx`,
    `Modals/FacultyModal.tsx`
  - The inline panel overrides conflicts with a native `confirm()`; the card
    modal uses an "Assign Anyway" button. The inline "Assign" button also only
    appears when a conflict exists, which is confusing. Unify the pattern.

- [ ] **C4. No support for split/multiple meeting patterns**
  - Severity: Low | Effort: L
  - A subject is placed as one contiguous block (`units * 2` slots). Real
    timetables often split a course across days (e.g., MWF 1hr). Worth noting as
    a design limitation if multi-session scheduling is expected.

- [ ] **C5. Visual token inconsistency**
  - Severity: Low | Effort: S
  - Mixed radii (`rounded-md`/`lg`/`xl`/`2xl`) and ad-hoc colors. Consolidate
    into Tailwind theme tokens for consistency and easier theming.

## Phase 4 — Backend integration readiness

- [ ] **D1. Replace mock data with API data + loading/error states**
  - Severity: High (when integrating) | Effort: L | File: `constants.ts`
    (`MOCK_SUBJECTS`, `MOCK_SECTIONS`, `MOCK_FACULTY`, `MOCK_ROOMS`,
    `DEFAULT_SCHEDULES`)
  - Everything is mock. When wiring to the backend, add skeleton loaders,
    error/empty states, and optimistic-update handling for drag/drop and
    assignment. (Note: backend conflict detection does not yet exist — see
    `backend/issues-and-improvements.md`.)

---

## Suggested order

1. **Phase 1 (A1–A3)** — biggest real-world impact; the panel is currently hard
   to use without a mouse and on touch devices.
2. **B1** — remove the DEV switcher immediately (it's effectively a bug in prod).
3. **B2–B5** — feedback and interaction polish that users feel every session.
4. **C1** — fix the misleading counts.
5. **D1** — tackle alongside backend integration.
