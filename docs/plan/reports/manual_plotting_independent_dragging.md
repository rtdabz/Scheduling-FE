# Manual Plotting: independent moves of consecutive meetings

Date: 2026-11-14.

## Root cause

Consecutive meetings share a `split_group_id` and `preferred_pattern = consecutive:N`.
Those links describe the run and support its repeated duration allowance. They
were also treated as an instruction to relocate the entire run:

- Frontend `useConflict.checkMoveConflict` calculated the selected meeting's day
  shift, applied it to every sibling, ignored all their existing IDs, and checked
  all the hypothetical destinations. A valid individual destination could fail
  because a sibling would collide elsewhere or shift beyond the week.
- Backend `ScheduleController.update` excluded the run's siblings from normal
  overlap checks. `SameTimePartnerMover.project` shifted all their days and times,
  and `move` persisted those shifts. A locked sibling could also reject the move.
- `ResolveScheduleConflict` used the same sibling exclusions and mover.
- `useScheduler` already sent one selected-ID `PUT`; it then applied the server's
  `moved_partners` response. The unwanted multi-record writes originated on the
  server, rather than in shared React drag state.

## Targeted changes

| Component | Change |
| --- | --- |
| `src/pages/ClassSchedules/SchedulerPanel/hooks/useConflict.ts` | Check only the selected destination, excluding only the selected ID. Check real overlaps before reporting a different-day restriction. No hypothetical sibling shifts. |
| Backend `SameTimePartnerMover.php` | Project consecutive siblings unchanged and return no partner moves. Retain group validation, allowing differing times only during individual consecutive relocation. Remove the whole-run shift code. |
| Backend `ScheduleController.php`, `ResolveScheduleConflict.php` | Remove consecutive-sibling conflict exclusions; siblings continue occupying their actual slots. |
| `src/pages/ClassSchedules/SchedulerPanel/hooks/useScheduler.tsx` | Click-to-move now displays the backend's specific violation messages, matching drag error handling. |

The drag handlers and selected-card/click-destination relocation path both use
`checkMoveConflict` and `PUT /schedules/{selectedId}`. There is no separate
handler or UI label named **Replace Drag**, and no swap operation in this
checkout. The existing replacement/relocation interaction was therefore tested
through both actual entry points. Explicit whole-course editing in the placement
dialog is a separate group operation and keeps its existing behavior.

## Preserved rules and persistence

- Keep `split_group_id`, the consecutive marker, meeting count, delivery mode,
  different-day restrictions, and configured meeting days. A move onto a sibling's
  occupied time reports the actual overlap; a nonoverlapping move onto that same
  day still reports the existing different-day rule.
- Keep room eligibility/access/status, instructor availability and overlaps,
  section overlaps, duration limits, operating hours, Sunday rules, authorization,
  approval locks on the selected row, transactions, history and cache updates.
- A locked stationary sibling does not block a valid selected-row move.
- Creation, generation, slot recommendations, and explicit group editing retain
  strict consecutive-group formation rules. Ordinary Split Session/Hybrid Split
  partner movement remains unchanged.
- Successful individual moves write only the selected schedule's position.
  Rejected moves write no schedule positions. No migration or automatic repair
  changes existing schedules.

## Verification

- `useConflict.test.ts`: **65 passed**. Added selected-only checks, hypothetical
  sibling conflicts, week boundaries, stationary sibling overlaps, and retained
  different-day restrictions.
- `useScheduler.relocation.test.tsx`: **8 passed**. Both drag and click-to-move
  issue exactly one selected-ID request, update only that row, preserve siblings,
  reject local overlaps without a request, and show actual server errors without
  changing state on refusal.
- Backend `ConsecutiveDaysManualSchedulingTest.php`: **26 passed, 123 assertions**.
  Covers repeated full-day duration, repeated individual moves, unchanged sibling
  records, configured days, locked siblings, week boundaries, room/instructor/
  section conflicts, room/instructor availability, operating hours, duration,
  strict creation alignment, and the conflict-resolution endpoint.

- Neighboring backend suites: **96 passed, 499 assertions** across
  `ConsecutiveDaysGenerationTest`, `ConsecutiveDaysYearLevelGenerationTest`,
  `ScheduleConflictResolutionTest`, `ScheduleBatchAtomicConflictValidationTest`,
  `ScheduleWorkflowIntegrityTest`, and `ConsecutiveDaysPolicyTest`. These include
  ordinary linked-pair behavior, generation rules, permissions, and atomic
  conflict handling.
- PHP syntax and targeted `git diff --check`: passed.
- `npm run build`: passed, including TypeScript checking and Vite production
  bundling. Total automated coverage above: **122 backend tests (622 assertions)
  and 73 frontend tests**.
- Scoped ESLint: `useConflict.ts` and both relevant test files have no
  diagnostics. `useScheduler.tsx` retains **6 existing errors and 1 existing
  warning** (`set-state-in-effect` and `exhaustive-deps`). Linting the pre-change
  backup under the same filename produced identical diagnostics; no new lint
  issue was introduced.

## Remaining limitations

No live browser drag session or production database was used. React hook tests
exercise the real drag/click handlers with a mocked API; backend feature tests
exercise real endpoints against SQLite in memory. There is no separately named
Replace Drag/swap interaction to verify in the supplied checkout. Existing
schedules that were unintentionally shifted in earlier sessions are not moved
back automatically because their intended positions cannot be inferred safely.
