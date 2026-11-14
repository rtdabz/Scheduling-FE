# Request Room modal refinement

Scope: `RequestRoomModal` in `src/pages/shared/RoomRequestModals.tsx`, together with its schedule picker (`SchedulePickerModal`), the `useOccupancy` hook, the shared `Modal`, and `components/ui/modalStyles.ts`.

Not changed: the request API (`submitRoomRequest`), the occupancy endpoint, ownership and department permissions, VPAA borrowing gate, approval rules, the picker's slot-validation logic (`fitsSchedule`, `windowConflicts`), and the shared `Modal`.

Design tokens: the codebase uses maroon `#4e0a10` / `#5A1220` and the accent `#C9952A` (`--color-accent` in `src/index.css`). The brief mentions amber `#F5A623`, but no component uses it, so the existing `#C9952A` accent is kept for consistency.

## Audit (prioritized)

| # | Priority | Area | Finding | Fix |
| --- | --- | --- | --- | --- |
| 1 | P1 | Requested time | Schedule state is split between the choice card and a separate stack of notices below it (loading, error, conflict, success). A user has to look in two places to learn whether the chosen time is usable. | Single schedule card whose border and status row reflect the state: checking, free, conflicting (with the conflicting bookings), or unconfirmed with Retry. |
| 2 | P1 | Footer / submit | The Cancel and close controls stay active while the request is being sent, so the modal can be dismissed mid-request and `onSubmitted` then fires for a closed form. | Pass `busy` to `Modal` while submitting (it already disables close, Escape, and overlay click) and disable Cancel. |
| 3 | P1 | Summary | The Summary panel is a full bordered card that repeats room, owner, time, and semester already visible above, and adds about 100px of height. | Removed. The footer now shows a one-line contextual status: what is still missing, or, when ready, who will review which room and time. |
| 4 | P2 | Room information | Three separate boxed facts stack into three rows on mobile and dominate the top of the form. | One bordered strip with dividers; three columns on `sm+`, compact rows on mobile. Labels and hierarchy unchanged. |
| 5 | P2 | Purpose | Section title "Purpose" and the field label "Why do you need this room?" duplicate each other. The 1000-character limit is enforced silently. | One label row (title plus question) with a live character counter and a helper line saying who reads it. |
| 6 | P2 | Spacing | `space-y-6` between sections plus large card padding leaves the modal taller than its content needs. | `space-y-5`, tighter card padding, `size="form"` (672px) instead of `lg` overridden with `!max-w-2xl`. |
| 7 | P3 | Header | The description is a long sentence that wraps to two lines on most widths. | Shorter description and a room icon in the header badge (existing `Modal` `icon` prop). |
| 8 | P3 | Empty schedule state | Copy hardcodes "1.5 or 3 hours". | Built from `REQUEST_DURATIONS`, so it follows the configured durations. |
| 9 | P3 | Footer layout | On mobile the hint sits below the buttons (`flex-col-reverse`), after the action it explains. | Hint first, buttons below in an even two-column row. |

## Deferred (outside this change)

- **Shared close button and header.** The close button and maroon header come from the shared `Modal`. Restyling them here would change every dialog in the app, so they are left as they are.
- **Schedule picker.** The picker's grid, legend, duration toggle, and confirmation footer already show selected day, time range, and duration, plus availability states. Its markup is covered by detailed accessibility-name tests (RR-04, RR-05, RR-09). It was reviewed and left unchanged.
- **Multiple windows.** The API accepts `windows[]`, but the form sends one window. Supporting several windows is a product change, not a UI refinement.

## Verification

- `RoomRequests.test.tsx` and `RoomRequestModals.test.tsx`: 19/19 passed with no test changes. Assertions on accessible names, the "Every {day}" line, duration labels, the submit payload, and kept entries after a failed submit still hold.
- `Rooms.test.tsx` also passed when run alongside them. Under heavy machine load, some picker tests can exceed Vitest's 5s default timeout; with `--testTimeout=30000` all 38 passed at baseline durations.
- ESLint on the changed file, TypeScript, and `npm run build` passed.
- Not done: browser screenshots against a live backend, and a manual screen-reader pass.
