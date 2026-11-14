# Modal Refinement Audit

Date: 2026-11-13. Scope: every dialog in the frontend, across VPAA, Dean, Program Head and Secretary.
No workflow, permission, validation rule or API call was changed.

## 1. What was found

There were 67 dialogs in three states:

| State before | Count | Problem |
|---|---|---|
| Hand-rolled overlay (`fixed inset-0` + own header/footer) | 26 | No shared focus trap or focus return; Escape and backdrop behaviour differed per dialog; some were not portalled and sat at `z-50` under other layers |
| On the shared `Modal`, default look | 24 | Shell was consistent, but footers, buttons and fields were styled locally |
| Scheduler "workflow" family (`scheduler-dialog-*`) | 17 | Already consistent with each other |

Inconsistencies, most frequent first:

1. **Headers.** Maroon bar, white bar, grey bar and a gradient bar were all in use. Titles ranged from `text-sm` to `text-2xl`, some uppercase. Close buttons were round, square or bare icons, and eleven had no accessible name.
2. **Footers.** Some pinned, some scrolled away with the form. Buttons were right-aligned in some dialogs and stretched full-width in others.
3. **Buttons.** Seven sizes (`text-xs` to `text-sm`, `py-1.5` to `py-2.5`, `rounded-lg` and `rounded-xl`), two maroons (`#4e0a10`, `#5A1220`), and primary hover states that turned gold in some dialogs and darker maroon in others.
4. **Fields.** Labels at 10, 11, 12 and 13px. Inputs 34 to 44px tall with `rounded-lg` or `rounded-xl`. Three focus rings (gold, maroon, red at full strength). Many labels were not tied to their input.
5. **Validation.** Error text at 11px or 12px, `red-500` or `red-600`. In several fields the helper text and the error both showed.
6. **States.** Loading shown as pulsing text, a spinner or a skeleton; empty states as italic text, dashed boxes or icons.
7. **Close behaviour.** Escape worked in about half the hand-rolled dialogs. A stray backdrop click discarded a half-filled form in some and did nothing in others.
8. **Sizing.** The only steps between 512px and 1280px were ad-hoc `max-w-*` classes.

## 2. The standard

Everything lives in `src/components/ui/`:

| Piece | Use |
|---|---|
| `Modal` | Every dialog shell. Sizes: `sm` 384, `md` 512, `form` 672, `lg` 768, `wide` 1024, `xl` 1280, `full`. New props: `icon`, `leading` (avatar or logo), `headerActions`, `id` |
| `ConfirmModal` | Every confirmation, success, warning, error and destructive prompt (also what `confirm()` from `ToastContext` renders) |
| `ModalButton` | `secondary` for Cancel/Close, one `primary` or `danger` per dialog, `dangerOutline` and `ghost` for lesser actions; `loading` shows the spinner |
| `ModalField` | Label, required mark, control, then the error **or** the hint |
| `ModalNotice` | Inline error, warning, info or success message |
| `ModalState` | Loading and empty states |
| `modalStyles.ts` | `modalControl()`, `modalTextarea()`, `modalLabel`, `modalBody`, `modalFormBody`, `modalFormFooter` |

Rules:

- Header is solid maroon with a 16px bold title and an optional one-line description. The close button is always top right and always named.
- Body padding is 16px on phones and 20px from `sm`. The body scrolls; header and footer stay pinned.
- Footer actions sit right, Cancel before the main action. Status text or a secondary action may sit left.
- Controls are 40px tall, `rounded-lg`, with a gold focus ring and a red border when invalid.
- Forms do not close on a backdrop click. Read-only dialogs do. Escape closes the top dialog only, and not while it is saving.
- Tall previews and tables set a height on the dialog and let one inner region scroll.

## 3. Checklist

Priority 1: shared foundation

- [x] Extend `Modal` (sizes, icon badge, `leading`, `headerActions`, `id`, drop shadow)
- [x] Add `ModalButton`, `ModalField`, `ModalNotice`, `ModalState` and `modalStyles.ts`
- [x] Bring `ConfirmModal` buttons onto the shared sizes
- [x] Match `SearchableSelect` to the 40px control and focus ring

Priority 2: hand-rolled dialogs moved onto `Modal` (26)

- [x] Users: account form, user details
- [x] Departments: department form, department profile
- [x] Rooms: room/building form, edit building
- [x] Instructors: instructor form, instructor details, teaching history, teaching load, teaching availability, designation picker
- [x] Curriculum: curriculum form, add courses, edit course, archived curriculum, curriculum preview
- [x] Sections: add/edit sections
- [x] Approvals: schedule preview, return/reject reason
- [x] Reports: detailed report
- [x] Dean schedules: class details
- [x] Activity log: event details
- [x] Instructor timetable
- [x] Session timed out
- [x] Login: reset password

Priority 3: dialogs already on `Modal`, footers and fields normalised (16)

- [x] Edit hours per unit
- [x] Curriculum import: curriculum details, issues, review, row detail, settings (gradient header removed)
- [x] My profile
- [x] Schedule reuse issues (oversized title removed)
- [x] Archive record (details, confirm, result)
- [x] Designations: form, sub-designations, holders
- [x] Room requests: request form, schedule picker, request list, request details

Priority 4: reviewed and left as they are

- [ ] Scheduler workflow family (17): submit for approval, recall, mark sections done, resolve conflict, clear, generation changes, recommended adjustment, resolution details, class placement (drop), instructor picker, placement alternatives, room view, instructor view, assign instructors, schedule generator, draft issues, slide-over panel. They follow `scheduler_dialog_redesign_plan.md`, already share one header, close button, footer and button style, and have the densest test coverage. Left untouched on purpose.
- [ ] Eight dialogs already on `Modal` with no footer or form of their own, checked and unchanged: room details, approval details, schedule changes, incoming courses, assigned courses, manage programs, room schedule reassignment, submitted reassignments. The last two keep their own stylesheet from the room-transfer redesign.
- [ ] Curriculum import fields stay at 36px to keep the import sheet dense.

## 4. Open decision

The system still has two dialog looks: maroon header for application dialogs, light header for the scheduler workspace. `scheduler-dialogs.css` records that as intentional. Making them one look means restyling the scheduler family and should be decided before it is done.

## 5. Behaviour changes to know about

- Forms no longer close on a backdrop click (Users, Departments, Rooms, Instructors, Curriculum, Sections).
- Escape now closes every dialog that is not saving, and focus returns to the control that opened it.
- User details: the status dot is grey for inactive accounts; it was always green and pulsing.
- Logo and photo pickers are real buttons, so they work from the keyboard.
