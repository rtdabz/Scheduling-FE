# Schedule Builder Audit Report

**System**: Web-Based Intelligent Conflict Detection and Recommendation System for Academic Scheduling (WICARS)
**Scope**: `wicars-ui/src/pages/ClassSchedules/**` (16,913 lines), `components/scheduling/**`, and the endpoints it drives — `ScheduleController`, `ScheduleRecommendationController`, `InitialDataController`, `RuleEngine`
**Date**: August 18, 2026
**Method**: full read of the module, plus `tsc -b` (clean) and `eslint` (63 problems: 45 errors, 18 warnings)

---

## Executive summary

The Schedule Builder works, and its structural bones are good — `WeeklyTimetableGrid` is properly shared across 13 call sites, the conflict-query indexes exist, and the backend has 18 test files. The problems are concentrated in three places:

1. **Conflict rules are implemented four separate times** and have already drifted apart. The browser's rule set is a strict subset of the server's, so the UI can show "Placement is ready to be added" for a placement the server will reject.
2. **The save path has no concurrency control.** `ScheduleController::batch()` validates *before* opening its transaction and takes no row locks, so two schedulers can both pass validation and both commit into the same room-hour.
3. **`useScheduler.tsx` is a 2,575-line hook** that owns 60+ state variables and returns ~150 unmemoized members spread into every child. This defeats every `memo()` in the module and drives an effect that resets the placement modal mid-edit.

Nothing here is cosmetic-only: findings 1–5 can each produce a wrong schedule or a dead screen.

---

## Prioritized findings

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | ~~Critical~~ **Fixed** | `ScheduleController::batch()` | Validation ran outside the transaction with no row locks — concurrent saves could double-book |
| 2 | ~~Critical~~ **Fixed** | `useConflict.ts` vs `RuleEngine` | Client conflict engine was missing the entire day/category rule family the server enforces |
| 3 | ~~Critical~~ **Fixed** | `useScheduler.refreshData()` | Silently dropped faculty `availabilities` and widened the section filter vs. initial load |
| 4 | ~~Critical~~ **Fixed** | Cross-stack | Conflict logic duplicated 4× with demonstrated drift between copies |
| 5 | ~~Critical~~ **Fixed** | `useScheduler.tsx:338` | Unguarded `JSON.parse` of `localStorage.user` in the render path — white-screened the module |
| 6 | ~~High~~ **Fixed** | `useScheduler.tsx:1077` | Modal-init effect re-ran on every `schedules` change, discarding in-progress user edits |
| 7 | ~~High~~ **Fixed** | `DropModal.tsx:263` | Recommendation effect re-fired on unrelated parent renders, issuing a fresh POST each time |
| 8 | ~~High~~ **Fixed** | `ScheduleController::batch()` | ~900 queries for a 40-operation batch (validation `exists` + per-op RuleEngine + per-op `load`) |
| 9 | ~~High~~ **Fixed** | `handleBulkFacultyAssign` | Auto-Assign issues N sequential PUTs with no transaction; partial failure leaves half-applied state |
| 10 | ~~High~~ **Fixed** | `InitialDataController` | Course collection serialized twice; all users, all columns; unbounded schedules for VPAA |
| 11 | ~~High~~ **Fixed** | `useScheduler` / `useConflict` | Unmemoized callbacks defeated `memo()` on 168 `GridCell`s and every `ScheduleCard` |
| 12 | ~~High~~ **Fixed** | `TimetableGrid` | Schedules whose course is absent from `subjects` render as nothing but still block slots |
| 13 | ~~High~~ **Mostly fixed** | `useScheduler.tsx` | 22 `react-hooks/set-state-in-effect` errors — cascading renders in the modal state machine |
| 14 | ~~Medium~~ **Fixed** | `WideTimetableGrid.tsx` | 323-line near-verbatim copy of `TimetableGrid/index.tsx`; only 6 semantic differences |
| 15 | ~~Medium~~ **Fixed** | `ScheduleCard.tsx` | Two parallel ~200-line JSX trees; tooltip duplicated while `TimetableCardTooltip` sits unused |
| 16 | ~~Medium~~ **Fixed** | `useScheduler.tsx` | Five near-identical faculty-assignment handlers |
| 17 | ~~Medium~~ **Fixed** | `DropModal.applyRecommendation` | ~60 lines duplicated across its two branches |
| 18 | ~~Medium~~ **Fixed** | Module-wide | Time/day helpers duplicated 2–5× — including **three different rounding rules** for the same conversion |
| 19 | ~~Medium~~ **Fixed (client); server policy still open** | `types.ts` / `useScheduler` | Three mutually inconsistent slot-duration formulas (open item from the July 2026 split-hours audit) |
| 20 | ~~Medium~~ **Mostly fixed** | Module-wide | 18 `no-unused-vars` errors, including a 185-line dead component and two dead `useMemo`s |
| 21 | ~~Medium~~ **Fixed** | `TopBar.tsx:373` | Print dropdown's outside-click close only works while the *section* dropdown is open |
| 22 | ~~Medium~~ **Fixed** | `useConflict.getDragOverConflict` | Passes `roomId: ""` — drag preview never reports room conflicts |
| 23 | ~~Medium~~ **Fixed** | `useGenerateSchedule.ts:263` | `useCallback` deps are `[baseSchedules.length]` but the body reads the array |
| 24 | ~~Medium~~ **Fixed** | `wicars-ui` | Zero frontend tests; the client-side conflict engine is entirely untested |
| 25 | ~~Medium~~ **Fixed** | `getConflictedScheduleMap` | Linear lookups inside the pair loop; capacity window uses the wrong span |
| 26 | ~~Low~~ **Fixed** | `mapApiScheduleToItem` | Unknown day silently becomes Monday; short/long day names mixed |
| 27 | Low | `useScheduler` / `useConflict` | Online/field rooms identified by the magic strings `"ONLINE"` / `"FIELD"` |
| 28 | ~~Low~~ **Fixed** | `refreshSchedules` | Swallows every error silently |
| 29 | ~~Low~~ **Fixed** | `handleCellClick`, `onScheduleRelocated` | Missing the summer weekend guard that `GridCell` applies |
| 30 | Low | `isPartTimeOutsideAvailability` | Hardcoded fallback rule when no availability rows exist |
| 31 | Low | `AutoAssignModal.getIssue` | Re-derives conflicts per rendered row |
| 32 | ~~Low~~ **Fixed** | `split_hours_audit_report.md` | Items 1 and 2 are now fixed but still documented as Critical |

---

## What to address first

**Fix in this order.** The sequencing matters: 1–3 are correctness bugs that silently produce wrong data, 4 is the reason they keep recurring, and 5 is a one-line fix with an outsized failure mode.

> **Status (August 18, 2026): Sprints 1–4 are complete** — findings 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 28, 29 and 32 are fixed (13, 19 and 20 partly; see the logs) — see the *Remediation log* sections for what changed, what is now covered by tests, and what remains. Still open: #20's dead 185-line component, #27, #30, #31, and Part 2's #40 and #42–#50.

### Sprint 1 — stop producing wrong schedules ✅ done

**1 → 3 → 5 → 2.** Start with the race condition (#1) because it is the only finding that can corrupt committed data with no user error involved, and the fix is contained: move `checkIntraBatchConflicts` + the `ruleEngine->validate` loop *inside* the existing `DB::transaction`, and take a `lockForUpdate` on the affected `(term_id, room_id, day)` and `(term_id, section_id, day)` rows first. `ScheduleRecommendationController::accept()` already establishes this pattern at lines 588/629/730, so this is applying an in-house convention, not inventing one.

Then #3 (a 10-line mapping fix), then #5 (a `try`/`catch`), then #2 — which is the largest of the four but the one users feel most, since it is the difference between the builder telling the truth and the builder lying.

### Sprint 2 — make the module fast and predictable ✅ done

**11 → 6 → 13 → 8 → 10.** #11 is the unlock: once `checkConflict`, `checkFacultyConflict`, `getDragOverConflict` and the `useScheduler` handlers are wrapped in `useCallback`/`useMemo`, the existing `memo()` on `GridCell` and `ScheduleCard` starts working, #7 stops firing spurious requests as a side effect, and #6 becomes tractable. Do #11 before #6, not after.

### Sprint 3 — collapse the duplication ✅ done

**4 (shared rule module) → 14 → 15 → 16 → 18.** Finding #4 is the root cause of #2 and of the drift documented below; the other four are mechanical once a single rule module exists. Land #24 (tests for the extracted rule module) in the same sprint — extracting shared conflict logic without tests would trade one risk for another.

### Sprint 4 — the deferred correctness items ✅ done

**9 → 12 → 22 → 23 → 25 → 19 → 17 → 20/21/26/28/29 → 32.** #9 and #12 first because they are the two that can mislead a user about committed data; then the four small correctness defects; then #19, which needed the two server conventions named before anything could depend on them. See *Remediation log — Sprint 4* at the end of the document.

### Defer

Findings 27, 30 and 31 are real but none of them block a user or corrupt data.

> **See also Part 2 (findings 33–50)** for the configuration layer. Two of those — #34/#35 (institution-global field-course settings) and #36 (four editable settings that nothing reads) — should be scheduled alongside Sprint 1, because they are actively misleading operators today.

---

## Detailed findings

### 1. Critical — `batch()` validates outside its transaction and takes no locks

`backend/app/Http/Controllers/ScheduleController.php:237-290`

`checkIntraBatchConflicts()` (line 237) and the per-operation `ruleEngine->validate()` loop (lines 241-259) both run to completion, a `422` is returned or not, and only then does `DB::transaction()` open at line 271. No `lockForUpdate`, no unique constraint, no re-validation inside the transaction.

Two schedulers in the same department — a realistic scenario, since the department readiness panel actively encourages parallel work across sections — can each drag a class into the same free room-hour, both pass validation against a database state where the slot is empty, and both commit. The result is a double-booked room that no subsequent validation will catch, because `getConflictedScheduleMap` only surfaces it as a red card *after* the fact.

`grep -rn "lockForUpdate" app/` returns three hits, all in `ScheduleRecommendationController`. The main save path — used by drag-and-drop, the placement modal, Clear All, and generate-and-apply — has none.

**Fix**: move validation inside the transaction and lock the candidate rows first. Add a database-level guard (unique index on `term_id, room_id, day, start_time` where the room is not shared-capacity) as a backstop.

### 2. Critical — the browser's conflict engine is a strict subset of the server's

`wicars-ui/src/pages/ClassSchedules/SchedulerPanel/hooks/useConflict.ts:295-440` vs `backend/app/Services/Scheduling/RuleEngine.php:662, 926-988`

`RuleEngine::checkDayCategoryConstraint()` enforces four rules that `checkConflict()` knows nothing about:

- NSTP (ROTC/CWTS/LTS): Monday–Sunday
- Field / PATHFIT (non-NSTP): Monday–**Friday** only
- Minor (GEC, GEE): Monday–**Saturday** only
- Major on Sunday: online mode only, no room assignment

`checkSectionOnlineLimit()` (line 997) is likewise absent client-side. The server also accepts Sunday in `SchedulingPolicy::PERSISTABLE_DAYS`, so the grid happily renders a Sunday column outside summer terms.

The user-visible consequence: drop a GEC course on Sunday and the modal footer reads *"Placement is ready to be added"* with a green check, the Place button is enabled, and the save then fails with a `422`. For a system whose stated purpose is intelligent conflict detection, the detector disagreeing with the enforcer is the most damaging class of bug in the module.

A second gap in the same function: lines 364-378 skip room-type validation entirely when `preferredPattern` is set and the course is major or minor. Since `category` is always one of those two, **room-type checking is disabled for every split schedule** — a lecture-only course can be placed into a laboratory without client-side complaint.

### 3. Critical — `refreshData()` and the initial load map the same payload differently

`wicars-ui/src/pages/ClassSchedules/SchedulerPanel/hooks/useScheduler.tsx:459-471` vs `663-674`, and `477-491` vs `679-689`

`refreshData()` is a hand-copy of the initial-load mapper that has fallen out of sync in two ways that change behaviour:

**Faculty availabilities are dropped.** The initial mapper ends `status: f.status, availabilities: f.availabilities`. The `refreshData` copy ends `status: f.status` — no `availabilities`. `isPartTimeOutsideAvailability()` reads that array and, finding it empty, falls back to the hardcoded rule at `useConflict.ts:146` (`dayIndex !== 5 && dayIndex !== 6 && startSlot < 20`). So part-time availability enforcement silently switches from configured windows to a blanket "weekday evenings only" rule.

This is not a rare path. `refreshData()` runs on the Synchronize button *and* on every `404` recovery — `onScheduleRelocated`, `handleRemoveSchedule`, `handleAssignFaculty`, `handleRemoveFaculty`, `handleInlineFacultyAssign`, `handleRemoveInlineFaculty`, and `handleCellClick` all call it when a schedule was modified externally.

**The section filter is looser.** Initial load requires an academic-year match:

```ts
return !!(term.semester && s.semester === term.semester && s.term?.academic_year === term.academic_year);
```

`refreshData` drops that condition and additionally admits `!s.term_id`:

```ts
.filter((s) => !term || !s.term_id || Number(s.term_id) === Number(term.id) || (term.semester && s.semester === term.semester))
```

After a sync, sections from *other academic years* with a matching semester appear in the section dropdown.

The mappers also disagree on numeric coercion (`toNumber(s.units)` vs raw `s.units`; `toNumber(s.lecture_hours)` vs `s.lecture_hours ?? 0`). Downstream `Number()` calls mask this today, but it is the same copy-paste defect.

**Fix**: extract one `mapInitialData(response)` function and call it from both places.

### 4. Critical — conflict logic exists in four implementations, and they have drifted

| Implementation | Location | Sees |
|---|---|---|
| Client preview | `useConflict.ts:295` `checkConflict` | in-memory `schedules` |
| Server, per-row | `RuleEngine.php:675` `validate` | persisted rows only |
| Server, intra-batch | `ScheduleController.php:708` `checkIntraBatchConflicts` | the payload only |
| Server, intra-batch (again) | `ScheduleRecommendationController.php:941` `validateBatchConflicts` | the payload only |

The last two are near-line-by-line twins: same nested pair loop, same section/room/faculty triad, same two separate `rooms` queries for `room_type` and `max_concurrent_classes`, same field-vs-department capacity branch, each followed by its own pair of capacity helpers (`checkIntraBatchRoomCapacityConflicts` / `batchRoomCapacityViolations`, `checkIntraBatchOnlineCapacityConflicts` / `batchOnlineCapacityViolations`).

The drift is already measurable. `ScheduleController::checkIntraBatchConflicts` emits a `subject_section_time_conflict` violation when the same course is placed for two different sections online at overlapping times (lines 782-796). `ScheduleRecommendationController::validateBatchConflicts` has no equivalent. **Accepting a recommendation therefore bypasses a rule that saving the identical rows through the batch endpoint enforces.**

Finding #2 is the same disease across the stack boundary.

**Fix**: one `ScheduleConflictRules` service that takes `(candidateRows, persistedRows)` and is called by all three server entry points; export the shared predicates to the client via a generated constants module, or accept the client as a *hint* layer and make the modal state derive from a server `POST /schedules/validate` dry-run instead of re-deriving rules in TypeScript.

### 5. Critical — unguarded `JSON.parse` white-screens the module

`wicars-ui/src/pages/ClassSchedules/SchedulerPanel/hooks/useScheduler.tsx:338-339`

```ts
const userJson = localStorage.getItem('user') || sessionStorage.getItem('user');
const user = userJson ? (JSON.parse(userJson) as StoredUser) : null;
```

This runs in the hook body, so a truncated or malformed `user` entry throws during render and there is no error boundary in the path — the Schedule Builder renders nothing, with no in-app way to recover. `DropModal.tsx:124` solves the identical problem correctly with a `try`/`catch`; `RoomViewModal.tsx:49` and `TeachingLoad.tsx:158` are two further ad-hoc copies. There is no `AuthContext` in `src/context/` — only `ToastContext` — so every consumer re-parses storage by hand.

**Fix**: `try`/`catch` immediately; then add a single `getStoredUser()` accessor (or an auth context) and route all four call sites through it.

### 6. High — the modal-init effect discards in-progress user edits

`wicars-ui/src/pages/ClassSchedules/SchedulerPanel/hooks/useScheduler.tsx:1077-1225`

This 148-line effect initialises every `modal*` field, and its dependency array is `[dropContext, schedules, selectedSectionId]`. `schedules` changes whenever anything touches the timetable — and `refreshSchedules()` is awaited after every save, relocate, delete, status change, and faculty assignment.

So: open the placement modal, adjust Meeting 2's room and start time, and if any `schedules` update lands before you press Place — a background `refreshSchedules()`, another tab, a completing request — every field snaps back to its computed default. The user's edits are gone with no indication why.

ESLint additionally reports five missing dependencies (`checkConflict`, `fieldCourseAssignmentEnabled`, `fieldCourseCodes`, `rooms`, `subjects`), so the effect reads stale room and course data on the runs it *does* make.

**Fix**: split into an init effect keyed on `dropContext?.scheduleId` (or an explicit `modalSessionId`) and a separate derived-defaults `useMemo`. This is why #11 should land first — untangling the deps is much safer once the callbacks are stable.

### 7. High — recommendation requests re-fire on unrelated renders

`wicars-ui/src/pages/ClassSchedules/SchedulerPanel/Modals/DropModal.tsx:263-542`

The effect's dependency array includes `checkConflict` and `schedules`. `checkConflict` is a plain arrow function inside `useConflict` (`useConflict.ts:295`) with no `useCallback`, so its identity changes on **every render of `SchedulerPanel`**.

All of the modal's own form state lives in `useScheduler`, so every field change re-renders the parent, and every parent render aborts the in-flight request and issues a new `POST /schedule-recommendations/recommend-split` (up to two in parallel, one per meeting) or `POST /schedule-recommendations/preview`. Hovering the grid behind the modal, or any completing `refreshSchedules()`, does the same. Each of these calls a CSP solver with `timeout_seconds: 5`.

The effect body is also 280 lines long and closes over `isTwoMeetingPattern` and `departmentId`, both declared ~50 lines *below* it (lines 549, 568) and both flagged as missing dependencies.

**Fix**: memoize `checkConflict` (#11), and debounce the recommendation fetch on a stable key built from the actual query inputs.

### 8. High — a 40-operation batch costs roughly 900 queries

`backend/app/Http/Controllers/ScheduleController.php:118-290`

Three multiplicative sources, all per-operation:

1. **Validation** (lines 118-143): `exists:schedules,id`, `exists:terms,id`, `exists:sections,id`, `exists:courses,id` ×2, `exists:faculties,id`, `exists:rooms,id`, `exists:departments,id` — Laravel issues one query per rule per array element. ≈ 7 × N.
2. **Rule engine** (line 251): each `validate()` call runs `checkRelationalIntegrity` (including a `Curriculum` lookup at `RuleEngine.php:480`), `checkRoomConflict` (a `Rooms::find` plus two `Schedule` queries), `checkFacultyConflict`, `checkSectionConflict`, `checkSubjectSectionConflict`, `checkRoomTypeMatch`, `checkDayCategoryConstraint` (a `Departments` lookup at line 970), and for online rows `checkOnlineCapacity` + `checkSectionOnlineLimit`. ≈ 10 × N.
3. **Response hydration** (line 288): `$schedule->load(['term','section','course','faculty','room','department'])` inside the write loop, plus a `findOrFail` for updates. ≈ 7 × N, all inside the transaction.

Generate-and-apply for a full section routinely produces 20–40 operations, and the year-level wizard posts far more. The indexes from `2026_07_20_000002_add_scheduling_performance_indexes.php` are present and correct — the cost here is query *count*, not query plans.

**Fix**: batch the `exists` checks into `whereIn` pre-fetches; give `RuleEngine` a `validateMany(array $attempts)` that loads the relevant `schedules`/`rooms`/`courses`/`departments` slice once and evaluates in memory; hoist the `load()` out of the loop into a single eager-loaded re-query after commit.

### 9. High — Auto-Assign is N sequential writes with no transaction

`wicars-ui/src/pages/ClassSchedules/SchedulerPanel/hooks/useScheduler.tsx:2193-2232`

`handleBulkFacultyAssign` loops assignments, then loops `scheduleIds` inside that, `await`ing a separate `api.put('/schedules/{id}')` for each. A 30-slot auto-assign is 30 sequential round-trips.

Worse, there is no server-side transaction spanning them. If assignment 18 fails — a conflict, a `403`, a dropped connection — the `catch` fires, an "Auto-Assign Failed" toast appears, and assignments 1–17 remain committed. The user is told the operation failed while more than half of it succeeded.

**Fix**: add a `PATCH /schedules/batch-faculty` endpoint that takes `[{schedule_ids, faculty_id}]`, validates the whole set, and commits in one transaction. `PATCH /schedules/batch-status` already establishes this shape.

### 10. High — `/initial-data` ships more than it needs to, repeatedly

`backend/app/Http/Controllers/InitialDataController.php:149-169`

- **The course collection is serialized twice**: `'courses' => $courses` and `'subjects' => $courses` on adjacent lines. The client reads `initialData.courses ?? initialData.subjects` — the alias is pure waste.
- **All users, all columns**: `User::query()->with('department')->get()` with no `select`. Only `id`, `name`, `role`, and `department_id` are consumed.
- **Unbounded for VPAA**: when `departmentId` is `null`, the schedules query drops its department filter and returns every schedule in the term with six eager relations.
- **Two uncached `Schema::hasTable()` calls** (lines 36-37) hit `information_schema` on every request.

The client then compounds it: `dataCache.ts:writeStoredData` runs `JSON.stringify(entry)` on the whole cached dataset and writes it to `sessionStorage` — and `setCachedData` is called from `refreshSchedules`, `handleAcceptedRecommendation`, `applyUpdatedSchedules`, and `confirmClearAll`. Every faculty assignment triggers a synchronous full-dataset serialization on the main thread. When the payload passes the ~5 MB `sessionStorage` quota the write throws, is swallowed by the `catch`, and caching silently stops working with no signal.

**Fix**: drop the `subjects` alias, add explicit `select`s, cache the `Schema::hasTable` results in config, and store only `schedules` under its own cache key rather than rewriting the whole blob.

### 11. High — unmemoized callbacks defeat every `memo()` in the module

`useConflict.ts:295, 442, 465`; `useScheduler.tsx:1425, 1723, 1780, 2263, 2266, 2269, 2277, 2293, 2315, 2323, 2328`

`checkConflict`, `checkFacultyConflict`, and `getDragOverConflict` are plain arrow functions in `useConflict`. `handleConfirmSchedule`, `handleModalConfirm`, `handleRemoveSchedule`, `handleClearAll`, `getClassesCountForDay`, `toggleCategory`, `handleSectionSelect`, `handleEditMovingSchedule`, `handleScheduleCardClick`, `handleSubjectCardClick`, `cancelPlacement`, and `handleCellClick` are plain functions in `useScheduler`. All six `useDragDrop` handlers are plain functions. Every one is returned in the hook's ~150-member object and spread into children via `{...scheduler}`.

`GridCell` is wrapped in `memo` (`GridCell.tsx:19`) and `ScheduleCard` is wrapped in `memo` (`ScheduleCard.tsx:29`) — and neither ever hits. The grid renders 7 × 24 = 168 `GridCell`s, so every `hoveredCell` update (once per cell crossed during a drag) re-renders 168 memoized components plus every `ScheduleCard`, and pays 168 futile prop comparisons on the way.

The `{...scheduler}` spread also means `TopBar`, `CourseBank`, `TimetableGrid`, and five modals each receive ~150 props of which they use 20–40, so there is no prop-level firewall anywhere in the tree.

**Fix**: `useCallback` the handlers and `useMemo` the conflict functions. This is the highest leverage change in the module and it unblocks #6 and #7.

### 12. High — schedules with a missing course render as nothing

`TimetableGrid/index.tsx:264-266` and `WideTimetableGrid.tsx:262-264`

```ts
sectionSchedules.map((schedule) => {
  const subject = subjects.find((s) => s.id === schedule.subjectId);
  if (!subject) return null;
```

`subjects` comes from `/initial-data`, which returns only courses attached to an **active curriculum** (`InitialDataController.php:107-113` returns `collect()` when none exists). A schedule whose course was archived, or whose curriculum was deactivated, disappears from the grid — while remaining in `schedules`, still occupying its slot in `placed`, still generating section and room conflicts against everything the user tries to place there, and still counted by `getClassesCountForDay`.

The user sees an empty cell that refuses every placement with an unexplained conflict.

**Fix**: render a degraded "Unknown course (#id)" card so the row is visible and deletable.

### 13. High — 22 `set-state-in-effect` errors form a cascading render chain

`useScheduler.tsx:1233, 1243, 1249, 1273, 1332` and 17 more

The modal is driven by a chain of effects that each `setState` synchronously in their body: `modalPreferredPattern` → sets day indexes → `modalDay1StartSlot` → sets `modalDay2StartSlot` → `modalClassMode` → sets `modalRoomId` and `modalIsHybrid` → `modalDay2ClassMode` → sets `modalDay2RoomId` → and finally the conflict effect sets `modalConflict`. Opening the placement modal therefore costs a run of five-plus render passes, each of which re-renders the whole `SchedulerPanel` tree (see #11) and re-fires #7.

Two of these effects are also missing the very dependency they read (`modalRoomId` at line 1269, `modalDay2RoomId` at line 1291), so they act on a stale value of the field they are trying to correct.

**Fix**: fold the pattern/day/room/mode derivations into `useMemo` or a single reducer. React's own guidance ("You Might Not Need an Effect") applies almost verbatim here.

### 14. Medium — `WideTimetableGrid.tsx` is a copy of `TimetableGrid/index.tsx`

324 and 323 lines. A normalized `diff` reports **19 differing lines**, of which only six are semantic:

| | `TimetableGrid` | `WideTimetableGrid` |
|---|---|---|
| container | `overflow-x-auto overflow-y-hidden` | `overflow-hidden` |
| `minWidth` | `900` | `0` |
| toggle label | "Hide Course Bank" | "Show Course Bank" |
| toggle style | filled maroon | outlined white |
| `ScheduleCard` | — | `isWideView={true}` |

The header, badges, Room View and Clear All buttons, placement banner, empty state, 26-line loading skeleton, conflict banner, and category legend are byte-identical. `TimetableGrid` even still destructures an `isWideView` prop it never reads, and imports `useState` unused — fossils of the split.

**Fix**: one component taking `variant: "compact" | "wide"`. Deletes ~300 lines.

### 15. Medium — `ScheduleCard` carries two parallel render trees

`ScheduleCard.tsx:88-271` and `273-495`

`if (isWideView)` at line 88 returns a ~184-line tree; the fallthrough returns a ~222-line tree. The hover tooltip block — subject code, name, units badge, instructor, location, time, conflict panel, and the `startSlot + durationSlots > 12` flip logic — appears verbatim in both.

`components/scheduling/TimetableCardTooltip.tsx` already exists for exactly this and is imported only by `RoomDetailContent.tsx`.

**Fix**: extract the tooltip to the existing shared component and reduce the branch to the handful of layout classes that actually differ.

### 16. Medium — five near-identical faculty-assignment handlers

`useScheduler.tsx:2090, 2129, 2161, 2193, 2234`

`handleAssignFaculty`, `handleRemoveFaculty`, `handleInlineFacultyAssign`, `handleBulkFacultyAssign`, and `handleRemoveInlineFaculty` each repeat the same five steps: guard on `facultyActionSlotId`, look up the schedule, check `canManageScheduleFaculty`, `PUT /schedules/{id}`, then unwrap the response with the identical three-way expression

```ts
resData.schedules ?? (resData.schedule ? [resData.schedule] : (resData.id ? [resData as ApiScheduleRecord] : []))
```

followed by the same `isNotFoundError` → `clearCachedKey` → `refreshData` recovery block. Roughly 25 lines duplicated five times.

**Fix**: one `assignFacultyToSchedule(slotId, facultyId | null)`; the five public handlers become thin wrappers differing only in their toast copy.

### 17. Medium — `applyRecommendation` duplicates its own body

`DropModal.tsx:644-699` and `701-772`

The `isSingleMeeting` branch and the API branch differ only in where `sortedRows` comes from — locally sorted rows versus `response.data.recommendation.recommended_schedules`. The subsequent ~55 lines (sort, `firstRow` guard, room/mode/hybrid set, the `sortedRows.length > 1` split, the single-meeting reset with its `setDropContext` update, and the trailing three setters) are line-for-line identical.

**Fix**: resolve `sortedRows` in a small branch, then run one shared `applyRows(sortedRows, recommendationId)`.

### 18. Medium — time and day helpers are duplicated, with three different rounding rules

| Helper | Copies | Locations |
|---|---|---|
| `slotToTime24h` | 3 | `useScheduler.tsx:63`, `DropModal.tsx:136`, `GenerateScheduleModal.tsx:99` (+ a 4th as `slotToTime24hStr` in `InstructorTimetableModal.tsx:104`) |
| time → slot | 5 | `useScheduler.tsx:54`, `useConflict.ts:126`, `DropModal.tsx:143`, `GenerateScheduleModal.tsx:90`, `dean/Schedules.tsx:134`, `vpaa/ScheduleViewer.tsx:167` |
| `getPreferredPatternDayIndexes` | 3 | `useConflict.ts:7`, `useScheduler.tsx:81`, `DropModal.tsx:157` |
| `fullDayNames` | 2 | `useScheduler.tsx:52`, `DropModal.tsx:122` — both identical to the exported `DAYS` in `constants.ts:3` |
| `dayMapToIndex` | 3 | `useScheduler.tsx:42`, `dean/Schedules.tsx:122`, `vpaa/ScheduleViewer.tsx:155` |
| role from storage | 4 | `useScheduler.tsx:338`, `DropModal.tsx:124`, `RoomViewModal.tsx:49`, `TeachingLoad.tsx:158` |

The time → slot copies are not equivalent:

```ts
useScheduler.tsx:60   Math.max(0, Math.floor((totalMinutes - 420) / 30))   // floor, clamped
useConflict.ts:131    Math.round((totalMinutes - 420) / 30)               // round, unclamped
DropModal.tsx:148     Math.max(0, (hour - 7) * 2 + Math.floor(minute / 30))
```

For any time not landing exactly on `:00` or `:30` these disagree, and `useConflict`'s version can return a negative slot for pre-07:00 faculty availability windows. The same conversion producing different answers in the conflict engine, the mapper, and the modal is a latent source of off-by-one placements.

**Fix**: one `lib/timeGrid.ts` exporting `slotToTime24h`, `timeToSlot`, `dayNameToIndex`, `parsePreferredPattern`, and the grid constants. Delete the local copies and re-export `DAYS` rather than redeclaring `fullDayNames`.

### 19. Medium — three inconsistent slot-duration formulas

`types.ts:66-73`, `useScheduler.tsx:1091-1093`, `useScheduler.tsx:95-96`

```ts
// types.ts — accepts lectureHours and labHours, then ignores both
getSubjectTotalSlots = (subject) => Math.round(Number(subject.units ?? 3) * 2);
getSubjectContactHours = (subject) => getSubjectTotalSlots(subject) * 0.5;   // == units

// useScheduler.tsx:1091 — any major with both lecture and lab is hardcoded to 6 slots
const singleSlots = (isMajor && hasBoth) ? 6 : totalSlots;

// useScheduler.tsx:95 — a third convention, where 1 lab hour spans 6 slots
const lectureSlots = Number(subject?.lectureHours ?? 0) * 2;
const labSlots = Number(subject?.labHours ?? 0) * 6;
```

A 3-unit course with 2 lecture + 3 laboratory hours has 5 contact hours (10 slots), but `getSubjectTotalSlots` returns 6, the placement path forces 6, and `sortSplitMeetingsForEdit` classifies meetings against `4` and `18`. `getSubjectContactHours` returns units, not contact hours, despite its name.

This is finding #3 of `split_hours_audit_report.md` (July 31, 2026), still open.

**Fix**: one `getCourseSlotPlan(course)` returning `{ lectureSlots, labSlots, totalSlots, meetings }` derived from actual hours, used by the modal, the mapper, and the split sorter alike.

### 20. Medium — dead code

18 `@typescript-eslint/no-unused-vars` errors. The substantive ones:

- `YearLevelGenerateScheduleModal.tsx:1140` — `CourseConfigurationDrawer`, a **185-line component** (through line 1325) that is never rendered.
- `GenerateScheduleModal.tsx:647` — `previewSchedulesByDay`, a `useMemo` that is never read but still recomputes on every dependency change (and is itself missing a `rooms` dependency).
- `GenerateScheduleModal.tsx:297` — `eligibleSplitUnitCourses`, likewise dead.
- `useScheduler.tsx:1962` — `resolveRoomId`, an 11-line function neither used nor returned.
- `DropModal.tsx:553` — `existingDeleteIds`, computed and documented ("These tell the Rule Engine to ignore them when checking conflicts") but never sent. A half-wired feature, not merely unused: the `recommend-split` call at line 379 passes `delete_ids: excludeIds.map(Number)` from a *different* local, so the intent is served by accident.
- `DropModal.tsx:548, 609` — `termId`, `totalSelectedSlots`; `useScheduler.tsx:1092` — `splitDay1Slots`; `useDragDrop.ts:38` — `selectedSectionId` destructured and unused.
- Unused imports: `useCallback` and `Search` (`DropModal`), `useState` (`TimetableGrid/index.tsx`), `CheckCircle2`/`LayoutGrid`/`Loader2`/`Users` and the `ScheduleUpdateResponse` interface (`useScheduler`).

`useConflict.ts:466-467` additionally reports `no-useless-assignment`: `let dur = 6` and `let subjectId = ""` are dead initializers, since every branch either assigns or returns.

### 21. Medium — the print dropdown cannot be dismissed by clicking away

`TopBar.tsx:373-399`

The effect that registers `mousedown` and `keydown` listeners opens with `if (!isSectionDropdownOpen) return;` — but its handler closes *both* dropdowns. With only the Print menu open, no listener is registered, so clicking elsewhere and pressing Escape both leave it on screen until the toggle is clicked again.

**Fix**: gate on `isSectionDropdownOpen || isPrintDropdownOpen`, and add `isPrintDropdownOpen` to the dependency array.

### 22. Medium — the drag preview never reports room conflicts

`useConflict.ts:487`

```ts
return checkConflict(subjectId, selectedSectionId, null, "", d, t, dur, excludeId, prefPattern) !== null;
```

The `roomId` argument is the empty string, so `checkConflict`'s `if (roomId && !isOnlinePlacement)` room-type guard and its `samePhysicalRoom` capacity branch are both skipped. Every cell you drag across is judged on section overlap and grid bounds only.

The user drags to a cell that shows a blue "Place" hint, drops, and the modal immediately reports a room conflict. When relocating an existing card the schedule's own `roomId` is known (`getDragOverConflict` already reads `sched` at line 472) and could be passed.

### 23. Medium — stale closure in `useGenerateSchedule.generate`

`useGenerateSchedule.ts:263`

The dependency array is `[baseSchedules.length]`, but the body reads `baseSchedules` itself at lines 179 and 239 to build `anchored_schedules`. A regeneration that replaces a course's rows without changing the array length leaves `generate` closed over the previous array, so it anchors against superseded times.

**Fix**: depend on `baseSchedules`, or read it from a ref.

### 24. Medium — no frontend tests

`wicars-ui/package.json` declares no test runner and `find src -name "*.test.*" -o -name "*.spec.*"` returns nothing. The backend, by contrast, has 18 test files including `RuleEngineSplitValidationTest`, `SplitScheduleRecommendationTest`, and `ScheduleBatchDepartmentAuthorizationTest`.

`useConflict.ts` — 491 lines of pure, easily testable conflict logic that decides what the user is allowed to place — has no test at all. It is also the file most likely to be touched when fixing #2, #18, and #22.

**Fix**: add Vitest and cover `checkConflict`, `getConflictedScheduleMap`, `isPartTimeOutsideAvailability`, and `exceedsSharedRoomCapacity` before refactoring them.

### 25. Medium — hot spots in `getConflictedScheduleMap`

`useConflict.ts:162-275`

The slot-grid index is a good design, but inside the pair loop:

- `subjects.find(...)` runs per schedule *and* per unique pair — O(pairs × courses).
- `samePhysicalRoom` calls `resolveRoom` twice, each a linear `rooms.find`, per pair.
- For field/online rooms, `schedules.filter(...)` scans the entire schedule array per pair (line 236) before the sweep-line runs — O(pairs × schedules).

For a VPAA session holding every department's schedules this is the most expensive computation in the module, and it re-runs whenever `schedules`, `subjects`, `rooms`, `faculties`, or `departments` changes.

There is also a correctness wrinkle: because `comparedPairs` evaluates each pair only at the first overlapping slot, the capacity check is passed `start`/`end` from **s1's full span** (lines 191-192, 242-250) rather than the overlap window, so concurrency is measured across hours where the two schedules do not actually overlap — a possible false positive.

**Fix**: pre-build `Map`s for `subjects` and `rooms` by id, group schedules by physical room once, and pass the intersection window to `exceedsSharedRoomCapacity`.

### 26–32. Low

- **26** `mapApiScheduleToItem` (`useScheduler.tsx:222, 273`): `dayMapToIndex[item.day] ?? 0` turns any unrecognized day string into Monday with no warning, and `DAYS[dayIndex] || "Mon"` falls back to a short name inside a long-name domain.
- **27** Online and field rooms are identified by `room_code === "ONLINE"` / `"FIELD"` (`useScheduler.tsx:241-250`) and re-derived by `roomType` in `useConflict.resolveRoom`. Renaming a room record silently breaks placement.
- **28** `refreshSchedules` (`useScheduler.tsx:581`) catches everything into a `// silently fail` comment, so a failed refresh leaves the grid stale with no indication.
- **29** `handleCellClick` (line 2328) and `onScheduleRelocated` (line 1350) omit the summer weekend guard that `handleDragOver`/`handleDrop` apply (`useDragDrop.ts:80, 96`). `GridCell` currently prevents the click, so this is defense-in-depth only.
- **30** `isPartTimeOutsideAvailability` (`useConflict.ts:146`) falls back to `dayIndex !== 5 && dayIndex !== 6 && startSlot < 20` when a part-timer has no availability rows — an undocumented "weekday evenings only" policy buried in a conflict helper. See also #3, which makes this fallback fire unintentionally.
- **31** `AutoAssignModal.getIssue` (line 154) re-derives conflicts per rendered row, internally filtering `groups`, `assignments`, and `schedules` on each call. `@tanstack/react-table` also triggers four `react-hooks/incompatible-library` bailouts (lines 339, 440, 521 and `YearLevelGenerateScheduleModal.tsx:1915`), so the React Compiler cannot optimize these components.
- **32** `split_hours_audit_report.md` still lists its findings 1 (missing `split_group_id` / `meeting_type` / `meeting_index`) and 2 (missing intra-batch conflict detection) as **Critical**, but both have shipped — the columns exist and `checkIntraBatchConflicts` is in place. Its finding 3 (unit vs contact-hour math, #19 above) and finding 7 (unsynchronized split editing, related to #6) remain open. Worth reconciling so the document stays trustworthy.

---

## Verification notes

- `npx tsc -b` — clean, no errors.
- `npx eslint src/pages/ClassSchedules src/components/scheduling` — 63 problems (45 errors, 18 warnings), distributed as: `react-hooks/set-state-in-effect` 22, `no-unused-vars` 18, `react-hooks/exhaustive-deps` 13, `react-hooks/incompatible-library` 4, `no-useless-assignment` 2, plus 4 singletons.
- Duplication between the two grid components measured with a line-ending-normalized `diff` (19 differing lines of 324).
- The backend test suite was **not** executed as part of this audit; no runtime or load measurements were taken, so the query counts in #8 are derived by reading the code paths rather than by profiling.

---

## Remediation log — findings 1, 3, 5, 2

Applied August 18, 2026, in the order 1 → 3 → 5 → 2. Verification after all four: **backend 120 passed / 547 assertions** (was 110 / 488), **frontend 57 passed** (was no test runner), `tsc -b` clean, `vite build` clean, ESLint in scope down from 63 problems to 59.

### #1 — fixed: validation moved inside the transaction, behind a per-term advisory lock

*Root cause*: `batch()` read the database to validate, returned or fell through, and only then opened `DB::transaction`. Nothing serialized the gap. `update()` — the endpoint drag-relocate and every faculty assignment use — had the same read-then-write gap with no transaction at all.

*Change* (`ScheduleController.php`, `ScheduleConflictException.php`):

- `checkIntraBatchConflicts` and the per-operation `RuleEngine::validate` loop now run **inside** the write transaction, so the snapshot they read is the snapshot the write commits against.
- Violations are carried out of the closure by a new `ScheduleConflictException`, which rolls the transaction back and is translated to the same `422 {message, violations}` body as before. Response shape is unchanged.
- `withScheduleWriteLock()` wraps the transaction in a MySQL named lock per term (`wicars:schedule-write:{termId}`), acquired before `BEGIN` and released after `COMMIT`, with a 10-second wait. Locks are taken in sorted term order by every caller, so overlapping-term requests cannot deadlock.
- Row locks were deliberately **not** used: the colliding operation is normally an `INSERT`, so there is no row to lock, and taking wide `lockForUpdate` ranges alongside `ScheduleRecommendationController`'s existing recommendation-row locks would introduce a deadlock risk for no added protection.
- Non-MySQL drivers (sqlite under test) skip the lock and run the callback directly.
- `update()` now validates and writes inside one transaction under the same lock.

*Verified*: `GET_LOCK`/`DO RELEASE_LOCK` confirmed working against the project's MySQL 8.4.3. Cross-connection contention confirmed empirically — a second process was denied the lock while the first held it. New `ScheduleBatchAtomicConflictValidationTest` (5 tests) covers rejection-with-no-partial-write, rejected `delete_ids` not being applied, the valid save/delete path, and both `update()` outcomes.

*Residual*: `ScheduleRecommendationController::accept()` and `validateSplits()` were left alone — they are a separate write path and belong with finding #4's consolidation. Concurrency between `batch()` and those paths is still unserialized.

### #3 — fixed: one mapper for `/initial-data`

*Root cause*: `refreshData()` was a hand-copy of the mount-effect mapper and had drifted.

*Change*: extracted `hooks/initialDataMapper.ts` holding `mapInitialData`, `mapApiScheduleToItem`, `hasUsableSchedulerCache`, the day/time helpers and the two payload interfaces. Both call sites now call `mapInitialData(response.data, { isVpaa, userDepartmentId })`. The surviving implementation is the *stricter* mount-effect version, so `availabilities` is preserved and the section filter requires an academic-year match. Numeric coercion (`toNumber`) is now applied on both paths.

*Verified*: new `initialDataMapper.test.ts` (8 tests). Confirmed meaningful by reintroducing both defects — 3 tests failed, then passed again on revert.

*Residual*: `useScheduler.tsx` is ~320 lines shorter but still 2.2k lines; the rest of finding #11's memoization work is untouched.

### #5 — fixed: one guarded session accessor

*Root cause*: the parse ran in the hook body with no `try`/`catch`, and there was no shared accessor — every consumer re-read storage by hand.

*Change*: added `lib/storedUser.ts` exporting `getStoredUser`, `getStoredUserRole`, `getStoredUserDepartmentId`. Parsing is guarded, non-object JSON (`null`, arrays, scalars) is rejected, and `localStorage` access itself is wrapped so privacy-mode failures return `null` rather than throwing. Routed the four Schedule Builder call sites through it (`useScheduler`, `DropModal`, `RoomViewModal`, `TeachingLoad`) and deleted their three local `StoredUser` interfaces and ad-hoc parsers.

*Verified*: new `storedUser.test.ts` (17 tests), including six malformed-payload shapes and a throwing-storage case.

*Residual*: 26 other call sites across the dean/vpaa/secretary/program-head pages still parse storage inline. They already have `try`/`catch` or are outside the Schedule Builder, so they were left out of scope; migrating them is a follow-up.

### #2 — fixed: day/category rules and the section online limit mirrored client-side

*Root cause*: `checkConflict` implemented room, faculty, section and capacity rules but none of `RuleEngine::checkDayCategoryConstraint` or `::checkSectionOnlineLimit`, so the modal footer showed "Placement is ready to be added" for placements the save rejected with a `422`.

*Change* (`useConflict.ts`, `types.ts`):

- Added `isNstpSubject`, `isFieldSubject`, `subjectHasCategory`, `checkDayCategoryConstraint`, `checkSectionOnlineLimit` and `resolveDeliveryMode`, mirroring `SchedulingPolicy` and `RuleEngine`. `checkConflict` runs the day/category check before any room work, and the online-limit check whenever the resolved mode is online.
- Rules now enforced in the browser: NSTP/ROTC/CWTS/LTS any day; non-NSTP field courses Mon–Fri; minor courses Mon–Sat; major courses on Sunday online-only, honouring the per-department `sunday_online_only_enabled` flag (added to the `Department` and `ApiDepartmentRecord` types, defaulting to `true` when absent as the server does).
- Delivery mode is derived from the room id (`"online"` / `"field"` sentinels, else the room's type), so no call site signature changed.
- **Narrowed the split room-type exemption.** It previously applied to any split of a major or minor course — i.e. every course — disabling room-type validation for all split schedules. It now applies only to a split of a course that genuinely has both lecture and laboratory hours, where the two meetings need different room types and `checkConflict` is not told which meeting it is validating. Also added the lecture-into-lecture-capable-lab fallback so the client matches `RuleEngine::canUseLaboratoryForLecture` instead of over-rejecting.
- Fixed a regression this introduced: shared-capacity detection had been keyed partly off the subject (`|| subjectRequiresField`), which after the broader `isFieldSubject` definition would have applied the department FIELD limit to ordinary lecture rooms. It is now keyed off the room only.

*Verified*: new `useConflict.test.ts` (32 tests) and new backend `DayCategoryConstraintParityTest` (5 tests) assert the same rule set from both sides. Confirmed meaningful by stubbing `checkDayCategoryConstraint` to return `null` — 4 client tests failed, then passed again on revert.

*Residual — full parity is not reached*:

- `checkConflict` still has no `meetingType` argument, so a split of a lecture-plus-lab course accepts either physical room type. Threading `meetingType` through is the remaining work for exact `checkRoomTypeMatch` parity.
- `getConflictedScheduleMap` (the red-card map over already-saved rows) was **not** extended with day/category rules. Persisted rows have passed server validation, and adding the rules there risks flagging legacy data.
- `useScheduler`'s `dropSubjectIsField` still uses its own narrower field-course test. It only picks the modal's default delivery mode, not validation, so it was left alone to avoid changing UI defaults.
- Finding #4 (four implementations of the conflict rules) is untouched: this fix adds a *fifth* place the day/category rules are written down, now guarded by tests on both sides. Consolidation is still the real fix.

---
---

# Part 2 — Configuration settings applied to the Schedule Builder

**Scope**: `SchedulingSettingsController`, `SchedulingPolicy`, `TimeslotController` / `TimeslotService`, `DepartmentResourceSlotLimitService`, `DepartmentSchedulingProfileResolver`, the `departments` scheduling columns, `schedule_settings`, `field_course_settings`, `department_forced_course_days`, and the three UI surfaces that read or write them (`secretary/Settings.tsx`, `GenerationConstraintsStepper.tsx`, `YearLevelGenerateScheduleModal.tsx`).

## Executive summary

The configuration layer has a different failure mode from the builder itself. The builder's problems are drift between two implementations of the same rule; the settings layer's problems are **settings that do not mean what the UI says they mean**:

- Four settings are editable in the UI, validated, persisted, and read by nothing.
- The field-course settings are institution-global while every setting beside them is department-scoped — and the only control that enables them is a one-way switch buried in a generation wizard.
- The operating-hours window is a live, cache-invalidated server setting that the frontend hardcodes in roughly 40 places.
- One department profile transition leaves behind flags the UI can no longer clear but the CSP solver still reads.

Twelve of the eighteen findings below are "the stored value and the enforced behaviour disagree," which is the same category as Part 1's #2 — just moved from rule evaluation to configuration.

## Prioritized findings

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 33 | ~~Critical~~ **Fixed** | `schedule_settings` vs frontend | Operating hours are a live server setting; the client hardcodes 07:00/24 slots/19:00 in ~40 places |
| 34 | ~~Critical~~ **Fixed** | `field_course_settings` | Table has no `department_id` — field-course config is institution-global, and departments overwrite each other |
| 35 | ~~Critical~~ **Fixed** | `GenerationConstraintsStepper` | Adding one field course flips a global flag to `true`; nothing ever sets it back to `false` |
| 36 | ~~Critical~~ **Partly wrong, fixed** | `departments`, `schedule_settings` | Four settings are editable, validated, and persisted but read by no scheduling code |
| 37 | ~~High~~ **Fixed** | `DepartmentsController` / `CspSolver` | Switching to the `standard` profile leaves lab flags set; the solver still reads them, the UI can't clear them |
| 38 | ~~High~~ **Mitigated** | `GenerationConstraintsStepper` | The wizard's rules step silently writes department-wide permanent config with no cancel path |
| 39 | ~~High~~ **Fixed** | `DepartmentResourceSlotLimitService` vs `useConflict` | Slot-limit defaults disagree (server 3, client 1) and one department's limit leaks into another's checks |
| 40 | High — **needs your call** | `TimeslotService::generateStartTimes` | Candidate start times step by course duration, not `slot_interval` — generated and manual schedules use different grids |
| 41 | ~~High~~ **Fixed** | `field_evening_schedule_enabled` | Enforced in `CspSolver` only, never in `RuleEngine` — the documented field-hours limit does not apply to manual placement |
| 42 | Medium | `SchedulingSettingsController::update` | Department save and the three sync operations are not wrapped in one transaction |
| 43 | Medium | `SchedulingSettingsController::update` | Mutually exclusive toggles sent together resolve by `if`-block order instead of a 422 |
| 44 | Medium | `forced_day_rules`, `field_course_codes` | Whole-array PATCH with no concurrency control — last write silently discards the other editor's rules |
| 45 | Medium | `SchedulingSettingsController::show` | ~14 queries per load; `activeCurriculum()` re-queried 3–4× and `forcedDayCourses()` called twice |
| 46 | Medium | `mapSemesterToPivotValue` | `abort(422)` from a private mapper breaks the whole Generate wizard on an unexpected semester value |
| 47 | Low | `TimeslotController` / overrides | A load-bearing subsystem with no UI; non-boundary overrides are silently discarded |
| 48 | Low | `syncFieldCourseAssignmentEnabled` | `created_at` written on update; nullable unique column allows duplicate global rows under a race |
| 49 | Low | `SchedulingPolicy` | Config caches are process-local statics — correct today, would go stale under Octane |
| 50 | Low | Part-time availability cutoff | Hardcoded twice, in two different units, in two files |

## What to address first (configuration) — Criticals and Highs done

**36 → 35 → 34 → 33.** #36 is first because it is the cheapest and the most embarrassing: four toggles that operators can flip, that persist, and that change nothing. Either wire them or delete them — but stop shipping controls that lie. #35 and #34 come next because they are a live cross-department data problem, not just a modelling one. #33 is the largest of the four and can be deferred slightly *only* because nothing in the UI currently lets anyone change the operating hours (#47) — the moment someone does, #33 becomes an outage.

Then **37 → 41 → 39 → 40**, all of which are "the setting is stored correctly but only half the engine honours it."

Findings 42–50 are cleanup. #45 and #46 are worth folding into whatever change touches `SchedulingSettingsController` anyway.

## Detailed findings

### 33. Critical — operating hours are configurable on the server and hardcoded on the client

`backend/database/migrations/2026_08_09_110647_create_schedule_settings_table.php`, `TimeslotController.php:44-70`, `SchedulingPolicy.php:435-496` vs ~40 sites in `wicars-ui/src`

The server treats the timetable window as data. `schedule_settings` stores `opening_time` (default `07:00:00`), `closing_time` (default `19:00:00`) and `slot_interval` (default `30`). `PATCH /timeslots/settings` validates and persists changes, and correctly calls `SchedulingPolicy::clearTimeCache()` afterwards (`TimeslotController.php:60`). `SchedulingPolicy::openingTime()`, `closingTime()`, `totalSlots()`, and `slotToTime()` all derive from it, and `RuleEngine::checkTimeSlotGrid` and `checkOperatingHours` enforce it.

The frontend does not read it anywhere. `grep -rn "timeslots" wicars-ui/src` returns nothing. Instead the 07:00 origin and the 24-slot / 19:00 ceiling are hardcoded across 18 files, including:

| Site | Hardcode |
|---|---|
| `constants.ts:25` | `const totalMinutes = 7 * 60 + slotIndex * 30` |
| `useScheduler.tsx:60, 64` | `- 420`, `7 * 60` |
| `useConflict.ts:131` | `(totalMinutes - 420) / 30` |
| `useConflict.ts:173` | `Array.from({ length: 24 })` |
| `useConflict.ts:315-318` | `if (endSlot > 24)` — message: *"exceeds the grid operating hours (7:00 PM)"* |
| `useScheduler.tsx:1478` | `const maxSlots = 24` |
| `DropModal.tsx:137, 148, 589` | `7 * 60`, `(hour - 7) * 2`, `24 - durationSlots` |
| `TimetableGrid/index.tsx:204`, `WideTimetableGrid.tsx:202` | `slotCount={24}` |

If the window is ever widened, the builder desynchronizes silently rather than failing loudly:

- **Earlier than 07:00** — `timeStrToSlot("06:00")` is `Math.max(0, Math.floor((360 - 420) / 30))` = `Math.max(0, -2)` = **0**. A 6:00 AM class renders and conflict-checks as if it were at 7:00 AM, and now collides with whatever is genuinely at 7:00.
- **Later than 19:00** — a class at 19:30 gets `startSlot = 25`. `getConflictedScheduleMap` clamps it with `Math.min(23, s.startSlot)` (`useConflict.ts:179`), so it is conflict-checked at 18:30 instead. `ScheduleCard` sets `gridRow: startSlot + 2` = 27 against a 24-row template, so CSS Grid creates an implicit row and the card renders below the grid body.
- `checkConflict` rejects anything crossing slot 24 with copy that names 7:00 PM regardless of the configured closing time.

**Fix**: expose the window in `/initial-data` (it is already loaded server-side), derive `SLOT_COUNT`, `slotToTime`, and `timeToSlot` from it in the shared `lib/timeGrid.ts` proposed in #18, and make the out-of-hours message interpolate the configured closing time. Until then, treat the operating hours as a constant and remove `PATCH /timeslots/settings` from the reachable API surface so nobody breaks the grid by using it.

### 34. Critical — field-course configuration is institution-global while every setting beside it is department-scoped

`backend/database/migrations/2026_08_09_121000_create_field_course_settings_table.php`, `SchedulingSettingsController.php:245-344`

Compare the two tables created a day apart:

```php
// department_forced_course_days — correctly scoped
$table->foreignId('department_id')->constrained('departments')->cascadeOnDelete();
$table->foreignId('course_id')->constrained('courses')->cascadeOnDelete();
$table->unique(['department_id', 'course_id'], 'department_forced_course_day_unique');

// field_course_settings — no department at all
$table->boolean('enabled')->default(false);
$table->string('course_code')->nullable();
$table->unique('course_code');
```

Every read and write follows the schema. `fieldCourseAssignmentEnabled()` reads the single `course_code IS NULL` row with no department filter. `fieldCourseCodes()` reads every non-null row globally. `SchedulingPolicy::fieldCourseCodeMap()` does the same, and `InitialDataController:159-160` ships both to **every** user regardless of department.

Two concrete consequences:

1. A secretary in one department enabling field-course assignment enables it for every department in the institution — and `useConflict.ts:341-347` and `useScheduler.tsx:1000-1006` then treat those course codes as field courses in every department's builder.
2. `syncFieldCourseCodes` deletes rows `whereIn('course_code', $allowedCodesForThisDepartment)` and re-inserts only the codes *this* department submitted (lines 317-341). Because `unique('course_code')` means one row per code institution-wide, if two curricula both contain `PATHFIT1`, **department B saving its field-course list deletes department A's selection for that code.** There is no way to have PATHFIT1 be a field course in one department and not another.

**Fix**: add `department_id` to `field_course_settings`, change the unique index to `(department_id, course_code)`, scope the global `enabled` row per department, and backfill existing rows to every department that currently has the code in its curriculum.

### 35. Critical — the field-course flag is a one-way institution-wide switch flipped as a side effect

`GenerationConstraintsStepper.tsx:208-218`, `YearLevelGenerateScheduleModal.tsx:712-720`

```ts
const addFieldCourseRule = async () => {
  if (!effectiveFieldCourseCode) return;
  const saved = await patchSettings({
    field_course_assignment_enabled: true,
    field_course_codes: [...fieldCourseCodes, effectiveFieldCourseCode],
  });
```

Adding a single course to one department's field list also sets the global `enabled` flag (see #34) to `true`. `grep -rn "field_course_assignment_enabled" wicars-ui/src` finds only `: true` — **no UI path ever sends `false`.** Removing courses calls `patchSettings({ field_course_codes: [...] })` and leaves the flag on, so the system can sit in `enabled: true` with an empty code list indefinitely.

The flag is not cosmetic. It gates the `fieldCourseAssignmentEnabled && configuredCodes.has(code)` branch in `useConflict.ts:344-346`, `useScheduler.tsx:1003-1005`, and `RuleEngine::isFieldCourse` — which in turn drives room-type validation, the department-scoped field capacity limit, and `checkDayCategoryConstraint`'s Monday–Friday restriction.

So the sequence is: a program head opens the Generate wizard for one section, adds PATHFIT1 to "Configure Field Subjects" as a one-off, and permanently changes room and day validation for every department, with no visible indication and no way back through the UI.

**Fix**: derive `enabled` from `count(field_course_codes) > 0` per department rather than storing it separately, or add an explicit department-scoped toggle in `secretary/Settings.tsx` that can be turned off. Either way, stop setting it implicitly from a per-course action.

### 36. Critical — four settings are editable, persisted, and read by nothing

A `grep` for each setting's consumers outside `SchedulingSettingsController` and `app/Models/Departments.php`:

| Setting | Consumers in `app/Services` + `app/Http/Controllers` |
|---|---|
| `split_units_schedule_override_enabled` | **0** |
| `gec_split_schedule_override_enabled` | **0** |
| `force_schedule_reuse_enabled` | **0** |
| `slot_interval` | **0** (only echoed back by `TimeslotController`) |
| `custom_lab_duration_*_enabled` | 2 |
| `field_evening_schedule_enabled` | 1 |
| `sunday_online_only_enabled` | 2 |
| `online_slot_limit` / `field_slot_limit` | 1 each |

The first three have a full round trip — migration, `$fillable`, `$casts`, validation rule, assignment branch, payload key, and a rendered toggle in `secretary/Settings.tsx` (all three appear in the `updateSetting` `Pick<>` at line 227) — and no scheduling code reads them. Their behaviour was superseded by **per-run request options** on the generation endpoints: `split_session_enabled`, `split_gec_enabled`, `selected_split_session_course_ids`, `selected_gec_course_ids` (`ScheduleRecommendationController.php:292-324`), which the Generate wizard sends per invocation. The department-level toggles were left stranded.

`SchedulingSettingsController.php:75-101` even spends fourteen lines enforcing mutual exclusion between `split_units_schedule_override_enabled` and `gec_split_schedule_override_enabled` — two settings that do nothing.

`slot_interval` is the fourth. It is validated `integer|min:1|max:720` (`TimeslotController.php:49`), persisted, and returned by `GET /timeslots` — but every slot computation uses `SchedulingPolicy::SLOT_MINUTES`, which is `public const SLOT_MINUTES = 30`. Setting it to 45 returns `200 OK` and changes nothing.

**Fix**: decide per setting. If the intent is per-department defaults that pre-fill the wizard's per-run options, wire them into `ScheduleRecommendationController`'s validated defaults. If not, drop the columns, the validation rules, the payload keys, and the toggles. Leaving them is worse than either.

### 37. High — the `standard` profile transition leaves flags the UI cannot clear and the solver still reads

`DepartmentsController.php:77-85`, `SchedulingSettingsController.php:58-66`, `CspSolver.php:424, 3835`, `secretary/Settings.tsx:334, 556`

Switching a department from `laboratory_enabled` to `standard` is rejected only if it still has laboratory courses in its active curriculum. Once those are gone the switch succeeds — and `$department->update($validated)` writes only `scheduling_profile`. Any previously-enabled `lecture_lab_schedule_override_enabled`, `custom_lab_duration_override_enabled`, `custom_lab_duration_6_hours_enabled`, `custom_lab_duration_5_hours_enabled`, and `custom_lab_duration_other_enabled` stay `true`.

From there the state is unreachable in both directions:

- `SchedulingSettingsController.php:60` returns `422 invalid_department_setting` for any request that *enables* a laboratory setting on a standard department — but there is no branch that disables them.
- `secretary/Settings.tsx` renders those toggles with `disabled={!lectureLabAvailable || !isLaboratoryProfile}` (line 334) and `disabled={!isLaboratoryProfile}` (line 556), so the operator cannot switch them off either.
- `settingsPayload` keeps reporting them as `true`, so the UI shows enabled-but-greyed controls.

And the flags are not inert. `ScheduleRequirementBuilderResolver:26` does gate the laboratory requirement builder on the profile, but `CspSolver.php:424` reads `$department?->lecture_lab_schedule_override_enabled` directly and `CspSolver.php:3835` re-reads it with a raw `->value()` — neither checks the profile. `ScheduleGenerationPreflightService:170-171` inspects them too.

Net effect: a standard department can generate schedules under laboratory override behaviour that nobody can see or turn off.

**Fix**: reset the laboratory flags in the same update that sets `scheduling_profile = 'standard'`, and gate the two `CspSolver` reads on `DepartmentSchedulingProfileResolver` so the profile is the single source of truth.

### 38. High — the Generate wizard writes permanent department config with no cancel path

`GenerationConstraintsStepper.tsx:172-218, 470-500`

`patchSettings()` issues `PATCH /scheduling-settings` immediately on every action in the wizard's "Scope & Rules" step — adding a forced-day rule, removing one, adding a field course, removing one. There is no draft state, no Save button, and no rollback when the modal is dismissed. Open the wizard, add a forced-day rule, change your mind and close it: the rule is live.

The scoping is also presented incorrectly. The requests carry `?section_id=`, the step is framed as generation constraints, and the toast reads *"Generation constraints updated for this semester."* But `department_forced_course_days` stores only `(department_id, course_id, day)` — **no term, no semester, no section.** The `section_id` parameter only narrows which courses are *offered* and which rows `syncForcedDayRules` is allowed to delete (`SchedulingSettingsController.php:369-403`, via the year/semester filter in `forcedDayCourses`). Rules for courses outside the selected section's year and semester survive untouched, which is what creates the impression of per-section scoping.

So a rule added while preparing one section applies to that course for the whole department, in every term, until someone removes it from the same wizard screen.

**Fix**: either make the step a local draft that is submitted with the generation request, or relabel it honestly as department-wide configuration and move it next to the other department settings. If per-term scoping is the intent, `department_forced_course_days` needs a `term_id`.

### 39. High — slot-limit defaults disagree between server and client, and leak across departments

`DepartmentResourceSlotLimitService.php:19-20` vs `useConflict.ts:57-72`, `useScheduler.tsx:432-436`

The server defaults a missing limit to **3**:

```php
'online' => max(1, (int) ($department?->online_slot_limit ?? 3)),
'field'  => max(1, (int) ($department?->field_slot_limit  ?? 3)),
```

The client defaults to the room's own `max_concurrent_classes`, which is usually **1**:

```ts
return configuredLimit == null
  ? getRoomCapacity(room)                          // max(1, room.maxConcurrentClasses ?? 1)
  : Math.max(1, Number(configuredLimit) || 1);
```

For any department whose `online_slot_limit` / `field_slot_limit` is `NULL`, the builder reports a red capacity conflict on the second concurrent field class while the server would accept three. That is a false positive — the mirror image of #2's false negatives, and it blocks legitimate placements.

There is a second-order leak. `useScheduler.tsx:432-436` stamps `resource_slot_limits` — **the current user's own department limits** — onto every field and online room's `maxConcurrentClasses`. `getConflictedScheduleMap` then calls `getDepartmentRoomCapacity(room, s1.departmentId, departments)`, which falls back to that stamped value whenever the *other* department's configured limit is null. So the shared FIELD room's usage by department B is judged against department A's configured limit. (`resource_slot_limits` is also `null` for VPAA — `InitialDataController.php:161-163` — so the VPAA view uses yet a third set of numbers.)

**Fix**: make the default explicit and identical on both sides (a shared constant of 3), and send per-department limits as a `{departmentId: {online, field}}` map rather than stamping one department's numbers onto shared room records.

### 40. High — generated start times step by course duration, not by the slot interval

`backend/app/Services/TimeslotService.php:32-43`

```php
$start = Carbon::parse($settings->opening_time);
$end = Carbon::parse($settings->closing_time);

while ($start->copy()->addMinutes($durationMinutes)->lessThanOrEqualTo($end)) {
    $times[] = $start->format('g:i A');
    $start->addMinutes($durationMinutes);
}
```

The loop advances by `$durationMinutes`, not by `slot_interval`. This is the candidate-start generator for the whole CSP: `SchedulingPolicy::generatedStartSlotsForDuration()` (line 499) calls it, and `CspSolver.php:1263, 1463-1464, 1838-1839` and `SplitScheduleService.php:277` consume the result.

For a 12-hour day the practical effect is:

| Course duration | Generated start times | Count |
|---|---|---|
| 3 hours (6 slots) | 07:00, 10:00, 13:00, 16:00 | 4 |
| 2 hours (4 slots) | 07:00, 09:00, 11:00, 13:00, 15:00, 17:00 | 6 |
| 1.5 hours (3 slots) | 07:00, 08:30, 10:00, … | 8 |
| 1 hour (2 slots) | 07:00, 08:00, … 18:00 | 12 |

Every even-hour duration can only ever start on the hour — 07:30 is unreachable for a 1-, 2-, or 3-hour class. Meanwhile manual drag-and-drop offers all 24 half-hour slots, and `RuleEngine::checkTimeSlotGrid` (line 414) validates against `SLOT_MINUTES` (30), so manual half-hour starts are perfectly legal. **The generator and the manual builder operate on different grids**, which both shrinks the CSP's search space — a plausible contributor to "No valid schedule could be generated" — and makes generated output impossible to reproduce by hand.

That `slot_interval` exists, is validated, and is never read (#36) is strong evidence the step was meant to be `slot_interval`.

**Fix**: step by `slot_interval` (falling back to `SLOT_MINUTES`). Confirm with the scheduling owners first — if hour-aligned starts are a deliberate institutional policy, document it and delete `slot_interval`.

### 41. High — `field_evening_schedule_enabled` is honoured by the generator but not the validator

`CspSolver.php:425` is the only consumer. `RuleEngine` has none.

`secretary/Settings.tsx:429` describes the setting as: *"Disabled: field subjects are limited to 7 AM-5 PM. Enabled: 5 PM-7 PM is allowed but not preferred."* and its confirmation copy (line 438) promises *"The generator will still prefer 7 AM-5 PM when possible."*

Only the second sentence is true. With the setting disabled, the CSP avoids 17:00–19:00 for field courses — but a user can drag a field class to 18:00 manually and `RuleEngine::validate()` accepts it, because no rule checks the flag. The stated limit is a generator preference, not a constraint.

Contrast `sunday_online_only_enabled`, which is read by **both** `CspSolver.php:426` and `RuleEngine.php:972` and is therefore genuinely enforced. That is the pattern to copy.

**Fix**: add a `checkFieldEveningWindow` rule to `RuleEngine` alongside `checkDayCategoryConstraint`, or soften the settings copy to say it only guides generation.

### 42. Medium — the settings write is not atomic

`SchedulingSettingsController.php:117-127`

```php
$department->save();

if (array_key_exists('forced_day_rules', $validated))            { $this->syncForcedDayRules(...); }
if (array_key_exists('field_course_assignment_enabled', $validated)) { $this->syncFieldCourseAssignmentEnabled(...); }
if (array_key_exists('field_course_codes', $validated))          { $this->syncFieldCourseCodes(...); }
```

The department columns are committed first, then three independent writes follow. `syncForcedDayRules` and `syncFieldCourseCodes` each open their own inner transaction, but nothing spans all four. A failure in the second or third sync leaves the department booleans persisted and the related tables un-synced — and since #35 means `field_course_assignment_enabled: true` and `field_course_codes` arrive in the *same* request, a partial failure there produces exactly the "flag on, list empty" state described above.

**Fix**: wrap lines 117-127 in a single `DB::transaction`.

### 43. Medium — mutually exclusive toggles sent together resolve silently by code order

`SchedulingSettingsController.php:75-101`

The split-units branch runs first and clears the GEC flag; the GEC branch runs later and clears split-units. Send `{"split_units_schedule_override_enabled": true, "gec_split_schedule_override_enabled": true}` in one PATCH and the result is GEC on, split-units off — determined purely by which `if` appears first in the file, with a `200 OK` and a settings payload that contradicts the request.

**Fix**: validate the pair up front and return `422` when both are `true`. (Moot if #36 removes these settings, which is the more likely resolution.)

### 44. Medium — array settings are replaced wholesale with no concurrency control

`SchedulingSettingsController.php:369-403` and `309-344`

`forced_day_rules` and `field_course_codes` are both submitted as complete arrays and applied as delete-then-insert. Two program heads editing the same department concurrently — realistic, since both roles have access and the wizard writes on every click (#38) — will silently overwrite each other: the second PATCH's array wins and the first user's additions vanish with no error and no indication.

Combined with #34, the same applies *across* departments for `field_course_codes`.

**Fix**: send deltas (`add_forced_day_rule` / `remove_forced_day_rule`), or carry an `updated_at` for optimistic concurrency and return `409` on mismatch.

### 45. Medium — `GET /scheduling-settings` costs ~14 queries, most of them repeats

`SchedulingSettingsController.php:16-23, 136-170, 193-217, 346-367`

Tracing one `show()` call: `resolveDepartment` (1) + `resolveSection` (1) + `hasLectureLabCourses` (2 — it inlines its own `Curriculum` lookup instead of calling the `activeCurriculum()` helper that sits nine lines below it) + `fieldCourseOptions` (2) + `forcedDayCourses` (2) + `fieldCourseAssignmentEnabled` (1) + `forcedDayRules` (3 — it calls `forcedDayCourses()` again at line 354) + `fieldCourseCodes` (1) ≈ 14.

`update()` is worse: it calls `hasLectureLabCourses` at line 68 and again at line 132, `forcedDayCourses` inside both `syncForcedDayRules` and `forcedDayRules`, and `fieldCourseOptions` inside both `syncFieldCourseCodes` and `settingsPayload`.

This endpoint is hit every time the Generate wizard opens (`GenerationConstraintsStepper.tsx:112`), every time the year-level wizard opens (`YearLevelGenerateScheduleModal.tsx:213`), and after every `patchSettings` call — which, per #38, is every single click in the rules step.

**Fix**: resolve the active curriculum and the scoped course list once per request and pass them down; memoize `hasLectureLabCourses` on the instance.

### 46. Medium — a private mapper aborts the request on an unexpected semester

`SchedulingSettingsController.php:405-413`

```php
default => abort(422, "Unsupported semester '{$semester}' for generation constraints."),
```

`mapSemesterToPivotValue` is called from `forcedDayCourses` and `fieldCourseOptions`, both of which run inside `settingsPayload`. A section whose `semester` column holds anything other than `1st`, `2nd`, or `summer` — a legacy value, a manual edit, an import — makes `GET /scheduling-settings` return `422`. The client turns that into *"Failed to load generation constraints"* (`GenerationConstraintsStepper.tsx:119`) and the Generate wizard is unusable for that section with no indication of the cause.

Note that `useScheduler.tsx:877-884` has a `normalizeSemester` helper that tolerates `1`, `first`, `1st`, and similar — so the client already assumes semester values are messy while the server assumes they are not.

**Fix**: return `null` from the mapper and skip the pivot filter, or normalize on the way in the way the client does.

### 47. Low — the timeslot override subsystem has no UI, and silently discards misaligned overrides

`TimeslotController.php` (201 lines), `TimeslotService.php`, `TimeslotOverride` model, `timeslots/overrides` CRUD routes

Overrides are load-bearing: `generateStartTimes` gives active override rows priority over generated slots (lines 22-30), so a single override row reshapes the entire CSP candidate space for that duration. Yet nothing in `wicars-ui` calls `/timeslots`, so the feature is reachable only by direct API call.

If it is used, `SchedulingPolicy::timeToSlot` (line 524) drops any override whose offset from `opening_time` is not a multiple of `SLOT_MINUTES`:

```php
if ($offset < 0 || $offset % self::SLOT_MINUTES !== 0) {
    return null;
}
```

An override at 07:20 is filtered out with no warning, no log, and no validation error at write time — the admin sees `201 Created` and no behaviour change.

**Fix**: either build the UI or remove the routes. Either way, validate override alignment in `storeOverride`/`updateOverride` rather than discarding silently at read time.

### 48. Low — small defects in the global field-course row

`SchedulingSettingsController.php:252-259`

```php
DB::table('field_course_settings')->updateOrInsert(
    ['course_code' => null],
    ['enabled' => $enabled, 'updated_at' => now(), 'created_at' => now()],
);
```

`created_at` is in the update payload, so every toggle rewrites the row's creation timestamp. Separately, `unique('course_code')` on a nullable column does not prevent duplicate `NULL` rows in MySQL, so two concurrent first-time writes could both insert; `fieldCourseAssignmentEnabled()` then reads whichever `->value()` returns first. (The migration seeds the row, so this is unlikely in practice.)

### 49. Low — configuration caches are process-local

`SchedulingPolicy.php:18-33, 449-454, 801-813`

`$cachedOpeningTime`, `$cachedClosingTime`, `$cachedStartSlotsByDuration`, `$cachedFieldCourseSettingEnabled`, `$cachedFieldCourseCodeMap`, and `$cachedCourseCategoryMap` are `private static` properties, and the three `clear*Cache()` methods just null them. There is no shared cache store — `grep -n "Cache::" SchedulingPolicy.php` returns nothing.

**This is correct today.** `composer.json` has no Octane or Swoole, so under php-fpm PHP re-initializes class statics on every request and the caches are per-request by construction. Recording it because it is a latent constraint: adopting Octane (or any persistent worker) would make `clearTimeCache()` and `clearFieldCourseCache()` affect only the worker that handled the write, leaving other workers serving stale operating hours and stale field-course configuration until recycled. Worth a comment on the properties so the assumption is explicit.

### 50. Low — the part-time cutoff is hardcoded twice, in two units

`useConflict.ts:146` uses slot units:
/login
return dayIndex !== 5 && dayIndex !== 6 && startSlot < 20;   // slot 20 == 17:00
```

`InstructorAssignment.tsx:141` uses minutes for the same 5 PM boundary:

```ts
timeToMinutes(schedule.start_time) < 17 * 60
```

Neither is configurable, neither is documented as policy, and the two will drift if the boundary ever changes. This is the fallback path that #3 causes to fire unintentionally.

---

## Verification notes (Part 2)

- Setting-consumer counts obtained by grepping each column name across `app/Services` and `app/Http/Controllers`, excluding `SchedulingSettingsController` (the writer) and `app/Models/Departments.php` (`$fillable`/`$casts`), then confirming each zero by a second unrestricted grep across `app/`, `database/`, and `routes/`.
- Absence of a client-side timeslot surface confirmed by `grep -rn "timeslots" wicars-ui/src` (no matches).
- Octane absence confirmed by `grep -n "octane\|swoole\|roadrunner" backend/composer.json` (no matches); Laravel `^12.0`.
- Table schemas read directly from the migrations rather than from a live database, so any hand-applied schema changes are not reflected.
- No settings endpoint was executed and no query counts were profiled — #45's figure is derived by tracing the call graph.

---

## Remediation log — Sprint 3 (findings 4, 14, 15, 16, 18, 24)

Applied August 18, 2026, in the order 4 → 14 → 15 → 16 → 18. Verification after all five: **backend 131 passed / 562 assertions** (was 120 / 547), **frontend 98 passed** (was 57), `tsc -b` clean, `vite build` clean, ESLint in scope 63 → 57 problems.

### #4 — fixed: one batch conflict rule module, used by both server entry points

*Root cause*: `ScheduleController::checkIntraBatchConflicts` and `ScheduleRecommendationController::validateBatchConflicts` were near-line-by-line twins. Each owned its own pair loop, its own pair of capacity sweeps, its own rooms queries and its own time helpers — so a rule added to one silently did not exist in the other.

*Change*: new `Services/Scheduling/BatchConflictValidator` (rules) and `Services/Scheduling/BatchConflict` (a presentation-free result). Both controllers now call `validate($rows, $ignoreScheduleIds)` and only *render* the result into their own violation payload, so the two API contracts (`operation_index` + "Intra-batch …" vs `recommendation_row` + "Recommended row …") are byte-identical to before.

Deleted: `checkIntraBatchConflicts`' body, `checkIntraBatchOnlineCapacityConflicts`, `checkIntraBatchRoomCapacityConflicts`, `validateBatchConflicts`' body, `batchRoomCapacityViolations`, `batchOnlineCapacityViolations`, `timesOverlap`, `batchViolation`, and the recommendation controller's `timeToMinutes`.

**Two drift bugs closed by the consolidation:**

1. The recommendation-accept path now enforces `subject_section_time_conflict` — the same course cannot be placed online for two different sections at overlapping times. The batch save already rejected this, so accepting a recommendation could commit rows the equivalent batch save refused.
2. Both accept paths now pass the ids they are about to delete as `ignoreScheduleIds`. `accept()` and `autoGenerateAndApply()` validate *before* deleting the rows they replace, so shared-room and online capacity were counted against rows that were about to disappear — a false-positive rejection.

Also folded in: the rooms table was queried twice per validation for the same ids (once for `room_type`, once for `max_concurrent_classes`) in both controllers; it is now one query.

*Verified*: new `BatchConflictValidatorTest` (11 tests) covers each rule, the cross-department FIELD exemption, the capacity sweeps against persisted rows, `subject_id` aliasing, and both ignore-id behaviours.

*Note on a preserved limitation*: the capacity sweep reports the **candidate** row that pushes concurrency over the limit. A candidate starting at the same minute as everything it collides with is processed first and sees an empty window, so it is not reported; `RuleEngine::checkRoomConflict` is what catches that case. This is unchanged from both original implementations — it is documented in the test rather than altered, because changing detection strength belongs in a correctness sprint, not a deduplication one.

*Residual*: `RuleEngine::validate` remains a separate per-row implementation (by design — it validates one row against persisted rows), and `useConflict.ts` remains the client mirror. The count of conflict-rule implementations went from four to three, and the two that could silently disagree are now one.

### #14 — fixed: one timetable grid component

*Root cause*: `WideTimetableGrid.tsx` was a 323-line copy of `TimetableGrid/index.tsx` with 19 differing lines, six of them semantic.

*Change*: `TimetableGrid` now derives all six from the `isWideView` prop it already accepted but never read — the scroll container, `minWidth`, the course-bank toggle's label and styling, and `ScheduleCard`'s `isWideView`. `SchedulerPanel/index.tsx` renders one component instead of branching. `WideTimetableGrid.tsx` deleted, along with the unused `useState` import.

### #15 — fixed: one ScheduleCard tree and the shared tooltip

*Root cause*: `ScheduleCard` held two parallel JSX trees (184 and 222 lines) selected by `isWideView`, with the hover tooltip duplicated verbatim, while `components/scheduling/TimetableCardTooltip` existed and was used only by `RoomDetailContent`.

*Change*: `TimetableCardTooltip` gained additive `placement="vertical"`, `verticalAlign` and `children` props — the centred arrow and the conflict panel the grid cards need. Defaults preserve `RoomDetailContent`'s rendering exactly. `ScheduleCard` collapsed to one tree.

The density tiers (`isCompact`, `isMedium`) are now gated on `!isWideView`. The wide branch never applied them, and a one-hour class in wide view has `durationSlots === 2`, so without the guard it would have started rendering the compact layout — a visual regression the merge would otherwise have introduced.

### #16 — fixed: one faculty mutation, five thin entry points

*Root cause*: `handleAssignFaculty`, `handleRemoveFaculty`, `handleInlineFacultyAssign`, `handleRemoveInlineFaculty` and `handleBulkFacultyAssign` each repeated the guard, the `PUT /schedules/{id}`, the same three-way response unwrapping, and the same 404 → `clearCachedKey` → `refreshData` recovery.

*Change*: `mutateScheduleFaculty(slotId, facultyId | null)` owns the request and returns a discriminated outcome (`ok` / `restricted` / `resynced` / `failed`). Two thin dispatchers render failures where each surface expects them — popup validation text for the modal, a toast for the inline controls — and the five public handlers are now 3–8 lines each. The bulk path still applies every update in a single `applyUpdatedSchedules` call rather than one per slot.

The exported hook API is unchanged, so `FacultyModal`, `FacultyPanel` and `AutoAssignModal` were not touched.

### #18 — fixed: one time/day module

*Root cause*: `slotToTime24h` existed 3×, time→slot 4× *inside the Schedule Builder alone*, `getPreferredPatternDayIndexes` 3×, `fullDayNames` 2× (both identical to the exported `DAYS`) — and the time→slot copies used three different rounding rules.

*Change*: new `lib/timeGrid.ts` owns `GRID_OPENING_MINUTES`, `SLOT_MINUTES`, `SLOT_COUNT`, `FULL_DAY_NAMES`, `DAY_NAME_TO_INDEX`, `dayNameToIndex`, `timeToSlot`, `timeToSlotUnclamped`, `slotToTime24h`, `slotToTimeLabel`, `parsePreferredPattern` and `buildPreferredPattern`. Local copies removed from `useScheduler`, `useConflict`, `initialDataMapper`, `DropModal`, `GenerateScheduleModal` and `constants.ts`.

The rounding rules were reconciled to **round-to-nearest, clamped at slot 0**. All three variants agree for times on a 30-minute boundary, and `RuleEngine::checkTimeSlotGrid` enforces that boundary, so no valid data changes value.

The one place clamping would have changed behaviour is kept explicit: faculty availability windows use `timeToSlotUnclamped`, because clamping a 06:00 window start to slot 0 would silently narrow it to 07:00 and reject valid part-time assignments. Two named functions state the distinction the old copies left implicit.

`constants.ts` keeps `slotToTimeStr` as a deprecated alias for `slotToTimeLabel` — it has 28 call sites across the module, and rerouting them all is churn without benefit.

Centralising the window constants is also the prerequisite for Part 2's #33 (server-configurable operating hours the client ignores); `lib/timeGrid.ts` carries a note to that effect.

*Residual*: three files outside the Schedule Builder still keep their own copies — `components/InstructorTimetableModal.tsx`, `pages/dean/Schedules.tsx`, `pages/vpaa/ScheduleViewer.tsx`. They were out of the audited module's scope; migrating them is mechanical follow-up.

### #24 — fixed: the extracted modules are under test

Vitest 3.2.4 and jsdom 27.0.0 (both pinned) with `vitest.config.ts`, added during Sprint 1. Sprint 3 brought the frontend suite to **98 tests** across four files:

| Suite | Tests | Covers |
|---|---|---|
| `lib/timeGrid.test.ts` | 41 | every conversion, the rounding and clamping rules, round-trips, unrecognized input |
| `hooks/useConflict.test.ts` | 32 | the day/category rules, the section online limit, mode resolution |
| `lib/storedUser.test.ts` | 17 | malformed and hostile session payloads |
| `hooks/initialDataMapper.test.ts` | 8 | the `/initial-data` mapping contract |

Backend: `BatchConflictValidatorTest` (11) and `DayCategoryConstraintParityTest` (5) added, alongside Sprint 1's `ScheduleBatchAtomicConflictValidationTest` (5).

### Net effect

| | Before | After |
|---|---|---|
| `ScheduleController.php` | 1,354 | 1,152 |
| `ScheduleRecommendationController.php` | 1,468 | 1,223 |
| `BatchConflictValidator` + `BatchConflict` | — | 571 |
| `TimetableGrid/index.tsx` | 324 | 337 |
| `WideTimetableGrid.tsx` | 323 | deleted |
| `ScheduleCard.tsx` | 499 | 302 |
| `TimetableCardTooltip.tsx` | 58 | 92 |
| `useScheduler.tsx` | 2,575 | 2,244 |
| `lib/timeGrid.ts` | — | 122 |

Roughly 1,150 lines of duplicated logic became about 690 lines of shared modules. `useScheduler.tsx` is 331 lines shorter but still 2,244 lines.

*Still open after Sprint 3*: Sprint 2 (#6–#13), plus #17, #19–#23, #25–#31, all of Part 2's configuration findings, and #32.

---

## Remediation log — Sprint 2 (findings 11, 6, 13, 7, 8, 10)

Applied August 18, 2026, in the order 11 → 6 → 13 → 8 → 10; #7 fell out of #11 as the audit predicted. Verification after all six: **backend 136 passed / 578 assertions** (was 131 / 562), **frontend 119 passed** (was 98), `tsc -b` clean, `vite build` clean, ESLint in scope 57 → 47 problems.

### #11 — fixed: the conflict callbacks and grid handlers are memoized

*Root cause*: `checkConflict`, `checkFacultyConflict` and `getDragOverConflict` were plain arrow functions in `useConflict`, and ~22 handlers were plain functions in `useScheduler`. All of them are spread into children via `{...scheduler}`, so `memo()` on `GridCell` (168 instances) and `ScheduleCard` never skipped a render. Dragging across the grid updates `hoveredCell` once per cell, so each step re-rendered the whole grid.

*Change*:

- `useConflict`: the three callbacks are now `useCallback`, with dependency lists covering exactly the collections they read.
- `useDragDrop`: all six handlers are `useCallback`. `handleDragOver` deliberately does **not** depend on `hoveredCell` — it writes through a functional `setHoveredCell`, since depending on it would rebuild the callback on every hover, which is the problem being fixed. `selectedSectionId` was an unused parameter and is gone.
- `useScheduler`: 22 handlers wrapped, including everything reaching a memoized child — `handleCellClick`, `handleRemoveSchedule`, `handleScheduleCardClick`, `getClassesCountForDay`, `cancelPlacement`, `handleEditMovingSchedule`, `handleToggleWideView` — plus the status, submit and withdraw families.

*Deliberately not memoized*: `handleConfirmSchedule` and its `handleModalConfirm` wrapper. `handleConfirmSchedule` closes over about twenty pieces of modal state and neither function reaches a memoized child, so a dependency list would buy nothing — and memoizing the wrapper alone would pin a **stale** `handleConfirmSchedule` that saved outdated field values. The reason is recorded in a comment at the call site.

*Verified*: new `useConflict.stability.test.tsx` (11 tests) asserts identity stability across re-renders with unchanged inputs, **and** that each callback is rebuilt when any collection it reads changes — the second direction catches dependency lists that are too narrow and would serve stale data. Confirmed meaningful by unwrapping one callback: the stability test failed, then passed again on revert.

### #7 — fixed as a consequence of #11

The recommendation effect in `DropModal` lists `checkConflict` in its dependencies. That identity changed on every parent render, so every keystroke in the modal, every hover behind it, and every completing `refreshSchedules()` aborted the in-flight request and issued a fresh `POST /schedule-recommendations/recommend-split` — each invoking a CSP solver with a 5-second timeout. `checkConflict` now only changes when the schedule data actually changes, so the effect fires on real input changes.

### #6 — fixed: the placement modal is keyed on its session, not on `schedules`

*Root cause*: the 148-line init effect had `[dropContext, schedules, selectedSectionId]` as its dependency list, and `refreshSchedules()` runs after every save, relocate, delete and faculty assignment. A background refresh landing while the modal was open re-derived every field and discarded the user's edits.

*Change*: new `hooks/placementSession.ts` exports `buildPlacementSessionKey`, which identifies a session by course, schedule id, cell, create-vs-edit and section. The effect is keyed on that string. The reference data it still needs at open time (`schedules`, `subjects`, `rooms`, the field-course settings) is read through a ref that is refreshed every render, so the effect sees current values without being re-triggered by them.

*Verified*: new `placementSession.test.ts` (8 tests) covers stability for the same session and a distinct key for each way a session can differ, including two edits of different schedules for the same course and cell.

### #13 — mostly fixed: four cascading effects removed, two bugs with them

*Root cause*: the modal was driven by a chain of effects that each `setState` in their body, so opening it or changing one field cost several render passes.

*Change* — three effects became wrapped setters and one became derived state:

| Was | Now |
|---|---|
| effect: `modalPreferredPattern` → day indexes | `applyModalPreferredPattern` |
| effect: `modalClassMode` → `modalIsHybrid` + `modalRoomId` | `applyModalClassMode` |
| effect: `modalDay2ClassMode` → `modalDay2RoomId` | `applyModalDay2ClassMode` |
| effect: fields → `setModalConflict` | `modalConflict` as `useMemo` |

The wrapped setters are exposed under the names the modal already calls, so `DropModal` was not touched. The room-defaulting logic the two mode effects duplicated is now one `resolveDefaultPhysicalRoomId` callback.

**Two bugs fixed with them.** The two mode effects each read the very field they were correcting (`modalRoomId`, `modalDay2RoomId`) without listing it as a dependency, so they acted on a stale value. Writing through a functional `setModalRoomId` removes the staleness entirely. `modalConflict`'s effect was also the one ESLint reported as missing `checkConflict`, `schedules`, `selectedSectionId` and `subjects`; as a `useMemo` it lists them naturally.

*Not fixed*: four `set-state-in-effect` errors remain in `useScheduler`, and they are the legitimate cases — hydrating state from the session cache on mount, falling back to the first section when the selected one disappears, defaulting the room-view room, and mirroring meeting 2's start slot (still needed, because `DropModal` resets the "user modified" flag and relies on the re-mirror). The scope-wide count is 17 because 13 more live in the generate-schedule modals, which the finding did not cover. What #13 described — the modal cascade — is down from six effects to two.

### #8 — fixed: per-operation query costs removed from the batch save

*Root cause*: three multiplicative sources, all per-operation.

*Change*:

- **Response hydration.** `$schedule->load([...6 relations])` inside the write loop is replaced by one eager-loaded re-query after it, with the original operation order preserved. Updates also read their rows from a single `whereIn` pre-fetch instead of `findOrFail` per row. That removes about seven queries per operation from inside the transaction.
- **Rule-engine lookups.** `RuleEngine` gained a per-instance memo for primary-key reference lookups — term, section, course, room, faculty, the department's active curriculum, and the Sunday-mode flag. A batch almost always reuses the same term, section, room and department, so these collapse from once-per-operation to once-per-batch. Only *reference* entities are memoized; every schedule conflict query still runs live, so writes are always seen fresh. `RuleEngine` has no singleton binding, so the memo cannot outlive the request.

*Verified*: new `ScheduleBatchQueryCountTest` (2 tests) asserts on growth rather than absolute counts — per-operation query cost must *fall* as the batch grows, and relations must be eager-loaded once rather than per row. The full backend suite also dropped from ~150s to ~35s, because `GenerateScheduleService` re-validates through `RuleEngine` and benefits from the same memo.

*Not fixed*: the `exists:` validation rules still run one query per rule per operation (~7 × N). Batching them means hand-rolling the existence checks, which changes the validation error messages the client surfaces, so it was left out of a performance sprint.

### #10 — fixed: `/initial-data` stops shipping what nothing reads

*Root cause*: the course collection was serialized twice, users came back as full models, and two uncached `Schema::hasTable` probes ran per request.

*Change*:

- Dropped the `'subjects' => $courses` alias, halving the course payload. Two consumers read `data.subjects` with no `courses` fallback — `InstructorTeachingLoadButton` and `ProgramHeadDashboardPage` — and were given one; every other consumer already had it. `InitialDataResponse.subjects` is now optional and documented as a legacy alias, so cached payloads from before the change still map.
- `users` is now `get(['id', 'name', 'role', 'department_id'])` with no eager-loaded department. Only the teaching-load export's signatory lookup reads this, and it needs exactly those four columns.
- The two `Schema::hasTable` probes are memoized behind one accessor.

*Verified*: new `InitialDataPayloadTest` (3 tests) asserts the alias is gone, that user rows carry exactly the four columns, and that schema probes do not repeat.

*Not fixed*: schedules are still unbounded for VPAA. The VPAA view genuinely needs cross-department schedules, and the eager-loaded relations are all consumed by `mapApiScheduleToItem`, so there is nothing safe to trim without changing what that role can see.

### Net effect

| Metric | Before Sprint 2 | After |
|---|---|---|
| Backend tests | 131 / 562 assertions | 136 / 578 |
| Frontend tests | 98 | 119 |
| ESLint problems in scope | 57 | 47 |
| `react-hooks/set-state-in-effect` | 22 | 17 (4 in `useScheduler`) |
| `react-hooks/exhaustive-deps` | 13 | 9 |
| Backend suite duration | ~150 s | ~35 s |

*Still open*: #9 (Auto-Assign's N sequential PUTs with no transaction) and #12 (schedules whose course is missing from `subjects` render as nothing) were not part of Sprint 2's list. Plus #17, #19–#23, #25–#31, all of Part 2's configuration findings, and #32.

---

## Remediation log — unsplit laboratory courses need a laboratory room

Reported August 18, 2026. A new instance of finding #2 (client/server rule drift), found after Sprint 1 closed.

*Symptom*: a course with a laboratory component that is **not** split was offered — and pre-assigned — a plain classroom.

*Root cause*: `RuleEngine::checkRoomTypeMatch` derives the required room type as

```php
$requiredRoomType = $meetingType
    ?? (SchedulingPolicy::isLaboratoryCourse($course) ? 'laboratory' : $course->room_type_required);
```

and `isLaboratoryCourse` is true when the course has a `Laboratory` category, **or `lab_hours > 0`**, or `room_type_required === 'laboratory'`. So without an explicit `meeting_type` — which is exactly the unsplit case — any laboratory component forces a laboratory room, whatever the `room_type_required` column says.

The client read `subject.roomTypeRequired` on its own in four places, so for a course with lab hours but `room_type_required = 'lecture'` it filtered the room dropdown to lecture rooms, auto-selected one, reported no conflict, and the save then failed with `room_type_match`. Because the outcome depends on whether that column happens to say `laboratory`, the bug looked intermittent across courses.

*Change*: `useConflict.ts` now exports `isLaboratorySubject` and `requiredRoomTypeForMeeting`, mirroring the server derivation. The four sites use them:

| Site | Was | Now |
|---|---|---|
| `useConflict.checkConflict` | compared the room against `roomTypeRequired` | compares against the derived required type, with a laboratory-specific message |
| `useScheduler` auto room pick | filtered candidate rooms by `roomTypeRequired` | filters by the derived type |
| `useScheduler` mode-change defaulter | same | same |
| `DropModal.onSiteRoomOptions` | offered only `roomTypeRequired` rooms | offers the derived type |
| `CourseBank/CourseCard` | showed "Lab Required" only for `roomTypeRequired === "laboratory"` | shows it for any laboratory component |

The mixed-split exemption is unchanged and still necessary: for a split of a lecture-plus-laboratory course, `checkConflict` is not told which meeting it is validating, so both physical room types stay acceptable. `DropModal` keeps offering both for that case, and the lecture-into-lecture-capable-lab fallback now keys off the derived type so it cannot fire for a course that genuinely needs a laboratory.

*Verified*: new backend `LaboratoryRoomRequirementParityTest` (4 tests) pins the server contract — unsplit lab course rejected in a lecture room and accepted in a laboratory room, lab-only course likewise, split meetings with an explicit `meeting_type` free to use the matching room, lecture-only course unaffected. New client tests in `useConflict.test.ts` (11 tests) assert the same derivation. Confirmed meaningful by removing the laboratory branch: 2 client tests failed, then passed again on revert.

Totals after this fix: **backend 140 passed / 585 assertions**, **frontend 130 passed**, `tsc -b` clean, `vite build` clean, ESLint in scope unchanged at 47.

*Residual*: `GenerateScheduleModal` builds preview-only `Subject` objects with a hardcoded `roomTypeRequired: "lecture"` (line 268). It feeds the generated-schedule preview rather than placement validation, and the generator assigns rooms server-side, so it is not part of this bug — but it is the same "guess the room type on the client" pattern and is worth revisiting if preview room labels ever look wrong.

---

## Remediation log — Part 2 Criticals and Highs (33–39, 41)

Applied August 18, 2026, in the order 36 → 35 → 34 → 33 → 37 → 39 → 41 → 38. Verification after all of them: **backend 148 passed / 610 assertions** (was 140 / 585), **frontend 138 passed** (was 130), `tsc -b` clean, `vite build` clean, ESLint in the audited scope unchanged at 47.

### #36 — my finding was wrong about one of the four settings

**Correction first.** The report claimed four settings were read by nothing. That was measured by grepping `app/Services` and `app/Http/Controllers`, which missed a consumer outside both. `gec_split_schedule_override_enabled` **is** live: `GenerateScheduleModal.tsx:319` reads it from `/scheduling-settings` to gate the GEC-split UI, and three cases in `YearLevelScheduleGenerationTest` set it as a precondition. Acting on the finding as written would have deleted a working setting.

Re-verified across the whole repository. Genuinely unread:

| Setting | Verdict |
|---|---|
| `split_units_schedule_override_enabled` | dead — had a toggle, no consumer |
| `force_schedule_reuse_enabled` | dead — no toggle rendered, no consumer |
| `slot_interval` | stored and validated, never read (see #40) |
| `gec_split_schedule_override_enabled` | **live** — gates the GEC-split UI |

*Change*: dropped the two dead columns (`2026_08_18_000001_drop_unused_department_scheduling_flags`), their `$fillable`/`$casts` entries, validation rules, assignment branches, payload keys, and the "Split Units Override" card. The controller also lost fourteen lines of mutual-exclusion logic between two settings, one of which did nothing. `gec_split_schedule_override_enabled` keeps its branch, minus the exclusion of the removed flag.

### #35 + #34 — field-course configuration is per department, and "enabled" is derived

*Change* (`2026_08_18_000002_scope_field_course_settings_to_department`): `field_course_settings` gains a nullable `department_id`, and the unique index moves from `course_code` to `(department_id, course_code)`. Existing rows are attributed to the department that owns the course, one row per department when several own the same code. `department_id` stays nullable on purpose — a course with no owning department is a shared minor, whose field-ness genuinely is institution-wide.

`SchedulingPolicy::fieldCourseCodeMap($departmentId)` merges the department's codes with the shared ones, and `isFieldCourse` resolves via the course's own `department_id`, so none of the ~15 call sites (eight in `CspSolver`) needed a new argument.

**#35 resolved by removing the flag rather than fixing its writes.** `fieldCourseSettingEnabled` is now *derived* from whether any codes are configured. The stored marker row is gone, along with the `syncFieldCourseAssignmentEnabled` writer and the two wizard call sites that set it to `true`; the field is still returned for the UI but is read-only, and a write to it is ignored. Removing the last field course turns the behaviour off again, which the write-once flag could never do.

*Verified*: new `FieldCourseSettingScopeTest` (5 tests) — two departments configuring the same code keep separate rows, one clearing its list leaves the other intact, codes do not leak across departments (checked through both `isFieldCourse` and each department's `/initial-data` payload), the derived flag switches off when the list empties, a direct write cannot enable it, and a shared course with no department still applies institution-wide.

### #33 — the grid window comes from the server

*Change*: `/initial-data` now returns a `time_grid` block (opening time, closing time, slot minutes, slot count) from `schedule_settings`. `lib/timeGrid.ts` holds a module-level config with `configureTimeGrid()`, applied by `mapInitialData` before anything is mapped, and exposes `slotCount()`, `gridOpeningMinutes()`, `slotMinutes()` and `closingTimeLabel()` in place of the former constants. Defaults match the server defaults, so nothing changes until the setting does.

The hardcoded bounds are gone from the Schedule Builder: `slotCount={24}` and the static `rowTemplate` at all four grid call sites, `Array.from({ length: 24 })` in the conflict map and both DropModal slot pickers, the `endSlot > 24` ceiling, the two `newStart + nextDuration > 24` guards, `maxSlots = 24` in the slot search, and the `Math.min(23/24, …)` clamps in `getConflictedScheduleMap`. The out-of-hours message interpolates the configured closing time instead of naming 7:00 PM.

*Verified*: 6 new cases in `timeGrid.test.ts` (47 total) — a widened window changes `slotCount`, a 06:00 class stops clamping onto the 07:00 row once the window includes it, a 19:30 class stays inside a 21:00 window, a 60-minute interval is honoured, and malformed or absent payloads fall back to the defaults.

### #37 — the profile transition no longer leaves flags behind

*Change*: `DepartmentsController::update` clears the five laboratory flags whenever the profile is set to `standard`, and `2026_08_18_000003_clear_laboratory_flags_on_standard_departments` cleans rows that already drifted.

**I tried the report's other half and backed it out.** Gating `CspSolver`'s two reads on the profile broke five tests in `DefaultLectureLabGenerationTest`, all of which set `lecture_lab_schedule_override_enabled` on a department whose profile defaults to `standard` and expect it honoured. That is current, relied-upon behaviour, so gating the read would have changed generation well beyond what the finding described. The reset plus the backfill removes the unclearable state at its source, which is what the finding was actually about; the reads stay as they were, and the migration records why.

### #39 — the client and server agree on shared-room capacity

*Change*: `useConflict` defaults an unset online/field limit to **3**, matching `DepartmentResourceSlotLimitService`, instead of falling back to the room's own `max_concurrent_classes` (usually 1). Non-shared rooms still use their own column.

`mapInitialData` also stops stamping the requesting department's limits onto shared room records. That value was the fallback capacity when judging *another* department's use of the same room, so one department's configuration leaked into another's checks — and the VPAA, who receives no `resource_slot_limits`, saw a third set of numbers.

*Verified*: the mapper test that previously asserted the stamping now asserts the room keeps its own column, and 2 new cases confirm an unconfigured department allows three concurrent classes while a configured limit of 1 still conflicts.

### #41 — the field-evening limit applies to manual placement

*Change*: `RuleEngine` gained `checkFieldEveningWindow`, called from `checkRelationalIntegrity` beside the day/category rule. Field placements must end by 17:00 unless the department has `field_evening_schedule_enabled`. The constant mirrors `CspSolver::FIELD_DAY_END_TIME`, and the department lookup goes through the request-scoped memo added in #8.

*Verified*: 3 new cases in `DayCategoryConstraintParityTest` — an evening field placement is rejected, accepted once the department opts in, daytime field placements are unaffected, and non-field courses may still run into the evening.

**Behaviour change worth knowing about.** This is a new rejection. Departments that have not enabled evening field scheduling will now have manual 5–7 PM field placements refused, where previously only the generator avoided them. Existing rows are untouched until someone edits them.

### #38 — mitigated, not fixed

The wizard still writes department-wide config on every click with no cancel path; making the step a local draft submitted with the generation request is a UX refactor rather than a configuration fix. What changed is that it stops misdescribing itself: the step now reads "Department-wide rules. Saved as soon as you add or remove one, and they apply to every section and term until changed", and the toast says "This is a department-wide rule and applies to every section and term until you remove it" instead of "updated for this semester".

`department_forced_course_days` still has no `term_id`, so genuine per-term scoping would need a schema change as well.

### #40 — deliberately not changed

`TimeslotService::generateStartTimes` advances by `$durationMinutes`, so a 3-hour course can only ever be generated at 07:00, 10:00, 13:00 or 16:00, while manual placement offers every 30-minute slot. Stepping by `slot_interval` instead would expand the CSP's search space and change every generated schedule, and the unused `slot_interval` column is strong evidence that was the intent — but if hour-aligned starts are deliberate institutional policy, the fix is to document that and delete the column. **This needs a decision from the scheduling owners before either branch is taken.**

### Also fixed in this pass — the hardcoded preview room type

`GenerateScheduleModal` built preview-only `Subject` objects with `roomTypeRequired: "lecture"` regardless of the course. The schedule payload's course object does carry `room_type_required` (no `$hidden` on the `Course` model), it simply was not declared in the TypeScript type. It is now declared and used, falling back to the same rule the server applies — a laboratory component means a laboratory room — instead of assuming lecture.

### Still open in Part 2

#40 (pending the decision above) and the cleanup items #42–#50: non-atomic settings writes, the mutually-exclusive-toggle ordering (moot for the removed pair, still applicable if another is added), whole-array PATCH with no concurrency control, the ~14 queries per settings load, `mapSemesterToPivotValue` aborting from inside a private mapper, the UI-less timeslot-override subsystem, the `created_at`-on-update quirk, the process-local cache note, and the twice-hardcoded part-time cutoff.

---

## Remediation log — Sprint 4 (findings 9, 12, 17, 19, 20, 21, 22, 23, 25, 26, 28, 29, 32)

Applied August 18, 2026. Verification after all of them: **backend 159 passed / 749 assertions** (was 153 / 727), **frontend 164 passed** (was 150), `tsc -b` clean, `vite build` clean, ESLint in the audited scope down from 33 errors to **21 errors / 13 warnings**.

### #9 — fixed: one transaction for the whole Auto-Assign

*Change*: new `PATCH /schedules/batch-faculty` taking `[{schedule_ids, faculty_id}]`. It flattens the ids, rejects a schedule appearing in two assignments, checks department ownership once, then validates and writes under the same per-term advisory lock and transaction that `batch()` uses. `useScheduler.handleBulkFacultyAssign` pre-checks the client-side permission rules, then issues that single request instead of one PUT per schedule.

Because each row is written *before* the next is validated, the RuleEngine's queries see the in-flight assignments — so two schedules being given the same instructor at the same hour is caught inside the batch, which the per-request loop could never do. Violations carry the offending `schedule_id`.

*Verified*: new `ScheduleBatchFacultyAssignmentTest` (6 tests) — a two-schedule assignment succeeds; a set whose second member conflicts leaves *both* rows unassigned; two rows at the same hour cannot share an instructor; a duplicated schedule id is refused; another department's schedule is refused with 403; a null `faculty_id` clears an assignment.

### #12 — fixed: a missing course renders degraded instead of vanishing

*Change*: new `TimetableGrid/subjectResolution.ts`. The grid builds a `Map` of subjects by id once and calls `resolveScheduleSubject`, which returns an inert placeholder (`UNKNOWN`, zero units, zero hours, `status: "inactive"`) when the course is absent. The `subjects.find(...)` per rendered card and the `if (!subject) return null` are gone, so the slot stays visible, labelled `Unknown course (#id) — no longer in the active curriculum`, and deletable.

*Verified*: new `subjectResolution.test.ts` (5 tests) — a present course resolves normally, an absent one yields a placeholder carrying the id, numeric and string ids both resolve, and the placeholder derives zero slots.

### #22 — fixed: the drag preview knows the room

*Change*: `getDragOverConflict` passes the dragged schedule's own `roomId` instead of `""`, so the room-type guard and the shared-capacity branch of `checkConflict` run during the drag. A new placement still passes `""` — it has no room until the modal picks one.

### #23 — fixed: the generate callback depends on the array

*Change*: `useGenerateSchedule.generate` depends on `baseSchedules`, not `baseSchedules.length`. A regeneration that replaced rows without changing the count no longer anchors against superseded times. The `react-hooks/exhaustive-deps` warning on that hook is gone with it.

### #25 — fixed: indexes hoisted, and the capacity window is the overlap

*Change*: `getConflictedScheduleMap` builds its lookups once — subjects by id, a memoized room resolver, and schedules grouped by `(physical room, department)`. The pair loop no longer runs `subjects.find` twice, `rooms.find` twice via `samePhysicalRoom`, or a whole-array `schedules.filter` per shared-room pair. `physicalRoomKey` reproduces `samePhysicalRoom`'s semantics exactly: two ids share a room when their resolved records match, falling back to the raw id when a record cannot be resolved.

The correctness half mattered more. Each pair is evaluated once, at the first slot where the two overlap, but `exceedsSharedRoomCapacity` was handed **s1's whole span** — so concurrency was measured across hours where the pair does not overlap. A 07:00–08:00 field class was reported as a room conflict because two *other* classes shared the room at 09:00. It now receives the intersection window.

*Verified*: 2 new cases in `useConflict.test.ts` — a short class overlapping a long one at the limit is clean while two later classes that genuinely exceed the limit are both flagged, and a real three-way overlap still conflicts. Confirmed meaningful by restoring the old span: the first case failed, then passed again on revert.

### #19 — fixed on the client; the server-side policy question is still open

**The report said "three inconsistent formulas". Two of the three are the server's own, and they differ on purpose.** `CSPSolver::rawDurationSlots` makes a single block `units * 2` slots; `CSPSolver::buildVariables` makes a lecture/laboratory split `lectureHours * 2` plus `labHours * 6`, one laboratory unit being three clock hours. Rewriting either to match the other would have changed generation everywhere.

*Change*: new `SchedulerPanel/courseSlotPlan.ts` names both conventions (`singleBlockSlots`, `lectureSlots`, `laboratorySlots`, `splitTotalSlots`) and documents which server method each mirrors. `types.getSubjectTotalSlots` now delegates to `singleBlockSlots` — same result, one source. The genuinely wrong third formula is gone: `(isMajor && hasBoth) ? 6 : totalSlots` at three sites in `useScheduler` hardcoded a 3-unit answer, so a 5-unit major with both components was offered a 3-hour block; all three derive from the plan now.

`getSubjectContactHours` is deleted rather than fixed. It returned `units` under a "contact hours" name, and its single consumer — DropModal's meeting summary — now sums the durations the user actually selected, which is truthful for a same-type pattern split and for a lecture/laboratory split alike.

*Verified*: new `courseSlotPlan.test.ts` (7 tests) pinning both conventions against the same course (3 units → 6 slots single, 10 slots split), the 5-unit case the hardcoded 6 got wrong, and the `hasBothComponents` predicate.

**Still open, and not a code fix.** Finding 3 of `split_hours_audit_report.md` argues an *unsplit* laboratory course should occupy the CHED contact total (5 hours for a 3-unit course) rather than `units * 2` (3 hours). That would change room capacity requirements in every department, so it needs a decision from the scheduling owners — recorded in that document alongside #40 here.

### #17 — fixed: one shared body

*Change*: `applyRecommendation`'s two branches resolve their rows and hand them to `applyRecommendationRows(rows, rank, recommendationId)`. The ~55 identical lines exist once. One behaviour change: the single-meeting branch previously had no `catch`, so a throw escaped; both branches now share the recommendation-error handler.

### #20, #21, #26, #28, #29 — the small ones

- **#20 (mostly fixed)**: removed `eligibleSplitUnitCourses`, `previewSchedulesByDay` and the now-orphaned `PREVIEW_DAYS` from `GenerateScheduleModal`; `termId`, `existingDeleteIds`, `totalSelectedSlots` and the unused `useCallback`/`Search` imports from `DropModal`; `ScheduleUpdateResponse`, `splitDay1Slots` and `resolveRoomId` from `useScheduler`; and the two `no-useless-assignment` placeholders in `getDragOverConflict`. **`CourseConfigurationDrawer` (185 lines) is deliberately left in place** — `YearLevelGenerateScheduleModal.tsx` is uncommitted, so that component exists only in the working tree and deleting it would be unrecoverable. It should be either wired up or removed by whoever wrote it.
- **#21**: `TopBar`'s outside-click/Escape effect is gated on `isSectionDropdownOpen || isPrintDropdownOpen`, with both in the dependency array. The Print menu can now be dismissed by clicking away.
- **#26**: an unrecognized day still resolves to a grid row, but `mapApiScheduleToItem` warns once per distinct bad value instead of silently becoming Monday, and the emitted `day` falls back to `DAYS[0]` — a long name in a long-name domain — instead of the short `"Mon"`.
- **#28**: `refreshSchedules` reports a failed refresh ("what you see may be out of date") instead of swallowing it into a `// silently fail` comment.
- **#29**: `handleCellClick` and `onScheduleRelocated` apply the summer weekday-only guard through a shared `isSummerWeekendBlocked`, matching `useDragDrop`. `GridCell` already blocked the interaction, so this closes the code path rather than fixing a reachable bug.

### #32 — fixed: `split_hours_audit_report.md` reconciled

Its findings 1, 2 and 4 are marked fixed with a note on what shipped; 7 is cross-referenced to #6 here; 3 is restated as an open policy decision rather than a Critical bug.

### Also fixed in this pass — the test suite was order-dependent

Not in the audit, found while adding #9's tests: `ScheduleBatchFacultyAssignmentTest` passed alone and failed in the full suite. `SchedulingPolicy` memoizes course categories, teaching assignments, field-course codes and the operating-hours window in **static** properties, and nothing cleared them between tests — so a course id reused by a later test inherited an earlier test's categories. Individual tests cleared them by hand; `Tests\TestCase::setUp` now clears all four, making every test independent by default.

That exposed one test whose expectation had been calibrated against the leak: `InitialDataPayloadTest::test_schema_probes_run_once_per_request` asserted ≤2 schema probes, but a cold cache probes three *distinct* tables (`course_categories`, `course_category_mapping`, `field_course_settings`) once each. The assertion now checks what it means — no table is probed twice in one request — so it will not drift when another memoized table is added.

This is the test-side half of Part 2's #49 (process-local configuration caches). The production concern there is unchanged: a long-lived PHP process still holds these maps until something calls the matching `clear*` method.

### Net effect

| | Before Sprint 4 | After |
|---|---|---|
| Backend tests | 153 / 727 assertions | **159 / 749** |
| Frontend tests | 150 | **164** |
| ESLint errors in scope | 33 | **21** (17 of them `set-state-in-effect`, finding #13) |
| Auto-Assign requests for a 30-slot run | 30 sequential PUTs | **1 PATCH** |
| Schedules that render as an empty-but-blocking cell | any archived course | **none** |

Remaining open: #20's dead component (above), #27 (magic `"ONLINE"`/`"FIELD"` room codes), #30 (the undocumented part-time fallback), #31 (`AutoAssignModal.getIssue` re-deriving per row), the 17 `set-state-in-effect` errors from #13, and Part 2's #40 and #42–#50.
