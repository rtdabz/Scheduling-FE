# Department module locking (program and VPAA-approval conditions)

Status: evaluated and implemented 2026-11-10. This file records what the
evaluation found, the order the fixes were made in, and the decisions left open.

## Target behaviour

| Condition | Department modules¹ | Cross-Department | Course Assignment |
|---|---|---|---|
| No registered program | Locked | Unlocked | Locked |
| Program exists, schedule not yet fully VPAA-approved | Unlocked | Unlocked | Locked |
| Program exists, schedule fully VPAA-approved | Unlocked | Unlocked | Unlocked |
| Last program removed | Locked | Unlocked | Locked |

¹ Sections, Academic Scheduling, Facilities, Curriculum, Courses, Schedule History
(Schedule History added 2026-11-10 on request; the VPAA's `/schedule-history` is
not department-scoped and stays open).

The only sources of truth are the department's `programs` rows (exposed to the
UI as `scheduling_ready` and `department_program_count` on `/api/me`) and the VPAA approval state derived by
`CrossDepartmentApprovalGate::isOpen`.

## Program Rooms access (2026-11-13)

Program Rooms has a stricter condition than the other Facilities pages: the
department office (Secretary or Director) needs at least two non-archived
programs in its own department. With one program, Rooms stays available and
Program Rooms shows the existing disabled navigation style with an explanation
that allocation is unnecessary for a single program. With no programs, the
existing department module lock applies.

`/api/me` exposes `department_program_count`. Navigation and the direct Program
Rooms route both check this count and refresh through the existing `departments`
live topic when programs are added, archived, moved, or restored. An open Program
Rooms page also reloads its program options on those events. `scheduling_ready`
continues to require only one program.

The API independently recalculates the department count on every Program Rooms
management read and write, returning 403 below two programs. Existing capability
checks still apply. Read-only Program Head and Dean API access remains available;
Program Heads use it to filter their Facilities room list. A forbidden load or
save clears cached assignment controls and displays the existing lock view.
Existing assignments and sharing policies are retained when access is locked.

Regression coverage: `ProgramRoomAssignmentTest` and its Director parity suite
cover API access across additions, archives, and restores; `navLocks.test.ts`
covers navigation, and `App.programRooms.test.tsx` covers the direct URL, live
relocking/unlocking, and a forbidden save with cached data.

## How locking worked before this change

- **Program condition (backend):** `CapabilityMiddleware` refuses a capability
  marked `requires_program` in `config/capabilities.php` when the user's
  department has no program. Schedule create/update/delete/generate/submit/withdraw,
  cross-department assignment, room requests and program rooms carry the flag.
  `schedule.view`, `schedule.assign_instructor` and `curriculum.manage` do not.
- **Program condition (frontend):** `hasStoredCapability` drops `requires_program`
  capabilities while `scheduling_ready === false`; nav items and
  `CapabilityRoute` lock through it. A module therefore locked only if its gate
  capability happened to be program-bound.
- **VPAA condition:** `CrossDepartmentApprovalGate` opens Course Assignment only
  when every active section in the active semester derives to `approved` (final
  VPAA). Dean approval, pending, returned, recalled, or reset sections keep it
  closed. Enforced on the API (`CourseTeachingAssignmentController`), on the route
  (`CrossDepartmentApprovalRoute`), and in the sidebar (`lockCrossDepartmentItems`).

## Findings, in fix order

| # | Priority | Finding | Fix |
|---|---|---|---|
| 1 | High (reported bug) | The **Cross-Department** parent and its Cross-Department page were gated on `schedule.assign_instructor_cross_department`, which is program-bound, so a department without programs saw the whole group locked. The receiving page itself only calls `schedule.view` / `schedule.assign_instructor` endpoints (`initial-data`, `instructor-assignments`), which need no program. | Gate the parent and the Cross-Department page (nav and route) on `schedule.assign_instructor`, the capability the API already enforces for that page. Course Assignment keeps the program-bound capability plus the VPAA gate. |
| 2 | High | Sections, Academic Scheduling (Schedules), Facilities (Rooms), Curriculum, Courses, and Schedule History stayed open without a program because they are gated on `schedule.view`, which cannot become program-bound: the Cross-Department page, the dashboard and the Department page read through it. | Add an explicit `requiresProgram` flag to those nav items and their office routes; it locks them while `scheduling_ready === false`. Children inherit the parent's lock. |
| 3 | Medium | Backend: curriculum writes (`curriculum.manage`) were accepted for a department with no program; every other write in these modules was already program-bound (`schedule.create` for sections and courses, `room.assign_program`). | Mark `curriculum.manage` `requires_program`. Reads stay on `schedule.view` (see finding 2). |
| 4 | Medium | The lock state refreshed only on page load or navigation, so adding or removing a program did not unlock or relock the sidebar until then. Program writes already publish the `departments` live topic. | `AppLayout` refetches `/api/me` when the `departments` topic changes. |
| 5 | None | Course Assignment's VPAA rule already matches the brief: only final VPAA approval opens it; recall, return, reset or new sections relock it. | No change. |

## Open decisions

- **Department with programs but no active sections this semester.**
  `isOpen` treats "no sections" as open, so Course Assignment is available
  before any schedule exists. Room borrowing shares `isOpen`, so this was left
  unchanged (the brief says not to change scheduling logic). Changing it means
  deciding the room-borrowing rule at the same time.
- **Dean navigation** gets the same program lock for the five modules, because
  the rule is department-level. A Dean in a department without programs still
  has the Dashboard, Department, Instructors, Reports and Schedule History.

## Verification

Recorded 2026-11-10:

- Backend: new `tests/Feature/DepartmentProgramModuleLockTest.php` (Secretary and
  Director; no program, add program, remove last program) passes, as does
  `CrossDepartmentApprovalGateTest` (VPAA-only unlock, relock on status change).
  Three curriculum suites that authored curricula in program-less departments
  now add a program to their fixtures. 171 of 172 test files pass one by one;
  `RealisticDepartmentLoadTest` exceeds the 512 MB `phpunit.xml` limit regardless
  of this change.
- Frontend: `src/navigation/navLocks.test.ts` covers the table for the Secretary,
  Director, Program Head, and Dean navigation; the catalog-less fallback is
  covered in `storedUser.capability.test.ts`. `npm run build` passes; no lint
  errors on changed lines. Remaining full-suite failures are in suites this
  change does not touch and failed before it.
- Browser (Chromium, mocked API, read-only): for Secretary and Director, each
  of the three states shows the expected sidebar locks; without a program,
  Sections and Curriculum pages show the no-program lock, Cross-Department opens,
  and Course Assignment is locked.
