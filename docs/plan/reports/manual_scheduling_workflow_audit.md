# Manual Scheduling and Generate Schedule — Workflow Audit

Date: 2026-09-20

Scope: the end-to-end path from configuration to a final timetable, with emphasis on Manual Scheduling. It covers:

- whether Manual Scheduling is truly manual;
- whether conflict detection after each manual action matches the server rules;
- whether recommendations are valid and are revalidated when applied;
- whether Manual Scheduling and Generate Schedule share one rule set;
- whether generation has the prerequisites and validation it needs for Required Day, Preferred Days, Preferred Meeting, Preferred Room, Hybrid, Split Session, Field Courses and Custom Duration.

This report follows [conflict_detection_and_recommendation_audit.md](conflict_detection_and_recommendation_audit.md) (2026-09-19). Findings fixed there are not repeated. No application code was changed. Every finding comes from reading the code; each one names the lines involved.

Working-tree note: the split-pair "same time" work (`split_group_same_time`, `moveSameTimePartners`, `meetsAtOneTime`) is uncommitted at the time of writing. Findings that touch it say so.

---

## Fix status (manual-only scope)

Generate Schedule changes (H1, and the generator halves of M5/M6) are out of scope for this round.

| Finding | Status | Where |
|---|---|---|
| H3 client online limit | **Fixed** 2026-09-20: limit removed; a regression test proves a sixth online course passes `checkConflict` | `useConflict.ts`, `useConflict.test.ts` |
| H2 schedule cap | **Partly fixed** 2026-09-20: the scheduler asks for 2,000 rows; the server reports `schedules_truncated` and the scheduler warns once; client cache key bumped to `scheduler:v17`. **Open:** cross-department room/instructor clashes still show only on save (needs the occupancy endpoint) | `InitialDataController.php`, `useScheduler.tsx`, `initialDataMapper.ts`, `InitialDataPayloadTest` |
| H4 drift blocks staffing | **Fixed** 2026-09-20: confirmed by a failing test first on all three assignment paths (and on removing an instructor). A change of instructor on a class that is not moving now answers only to the `faculty` and `relational_integrity` catalog rules plus `faculty_conflict`; moving a class still runs every rule | `RuleEngine::validateInstructorAssignment`; `ScheduleController::update` / `batchFaculty`; `InstructorAssignmentController`; `InstructorAssignmentIgnoresPlacementDriftTest` |
| M1 placement rewrites settings | **Fixed** 2026-09-20: a refused placement restores the Force Day / Field Course settings it saved (warns if the restore fails); an alternative never rewrites Force Day, and one off the forced day cannot be applied; the dialog says the setting applies to every section. Kept client-side: the placement is validated against the saved settings, so they must be written first. The rollback itself has no automated test (no `useScheduler` harness) | `useScheduler.handleConfirmSchedule`, `DropModal.tsx`, `DropModal.test.tsx` |
| M2 relocate pre-check | **Fixed** 2026-09-20: drag, click-to-move and the drag-over hint share `checkMoveConflict`, which passes the class's instructor and checks the saved Required Day (kept out of `checkConflict`, where the dialog may be setting a new one) | `useConflict.checkMoveConflict`, `useDragDrop.ts`, `useScheduler.tsx`, `useConflict.test.ts` |
| M3 stale split partner | **Fixed** 2026-09-20: the move pre-check also checks a same-time partner at the new time on its own day, and refuses moving onto the partner's day; `update` returns `moved_partners`, merged at once | `useConflict.sameTimePartner`, `ScheduleController::update`, `SplitPairSameTimeTest` |
| R1 (new, user-reported) alternatives follow a meeting's trial mode | **Fixed** 2026-09-20: the preview sent the first meeting's current mode as the course's delivery, and the solver treats an explicit `online` as online-only for every meeting, so switching one meeting of BAC 100 to Online made every alternative (both meetings) online. It now sends `field` or the default `on-site` (on-site first, online fallback), and changing a meeting's room no longer re-runs the solve | `DropModal.recommendationPayload`, `DropModal.test.tsx` |
| R2 (new) applying an alternative lost its room and mode | **Fixed** 2026-09-20: applying a single-meeting option moved `dropContext` to the option's cell, which is part of the placement-session key, so the dialog re-initialised: its own room pick replaced the recommended room, an online option became on-site, and the selection was cleared (saved via batch, not accept) | `DropModal.applyRecommendationRows`, `DropModal.test.tsx` |
| All others | Open | |

---

## 1. Verdict

| Area | Verdict |
|---|---|
| Server-side conflict detection | **Accurate and complete.** Every write path re-runs `RuleEngine::validate`: manual batch save, drag/click relocate, instructor assignment and generated apply. Recommendation accept re-runs the kernel against a fresh snapshot. No path can persist a hard conflict. |
| Manual vs Generate rule parity | **Good.** The kernel covers every placement rule id the RuleEngine emits, guarded by `EngineParityMatrixTest`. The only difference is instructor rules, because generation assigns no instructors. |
| Client-side detection (what the user sees after a manual action) | **Incomplete, and in one case wrong.** It reads a department-scoped slice of at most 500 rows. It enforces one rule the server no longer has and misses several the server does enforce. |
| Manual Scheduling stays manual | **Mostly.** Nothing generates without an explicit click. There is a dormant auto-relocate branch, and a placement can silently rewrite department configuration. |
| Generate Schedule prerequisites | **Mostly good**, but it lacks cross-setting checks for Required Day. Applying a result **deletes hand-placed classes of courses the user excluded**. |

| Severity | Count |
|---|---|
| Critical / High | 4 |
| Medium | 7 |
| Low | 5 |

---

## 2. The workflow as implemented

```
CONFIGURATION
  Department settings (SchedulingSettingsController)
    Required Day (department_forced_course_days), Field course codes, Sunday-online-only,
    Custom Lab Duration, lecture/lab + GEC split overrides
  Per-run wizard settings (YearLevelGenerateScheduleWorkflow, Setup Courses step)
    Preferred Days, Preferred Meeting (pattern), Preferred Room, Hybrid (Integrated / Split),
    Split Session, Field delivery, Custom Duration, excluded courses
        │
VALIDATION (generation only)
  CourseSetupOverrides   → duration ≤ weekly ceiling, fits the day; preferred room available,
                           reachable (RoomAccessPolicy), right type; Required Day ∈ Preferred Days
  ValidateGenerationConfiguration → references, curriculum/semester alignment, hybrid/split
                           eligibility, room supply, Required Day vs multi-meeting / day capacity /
                           room pressure (warnings need explicit confirmation + fingerprint)
  ScheduleGenerationPreflightService → department profile
        │
PLACEMENT
  Manual:   drag / click-to-place → DropModal (user chooses day, time, room, mode, pattern)
            drag / click-to-move → PUT /schedules/{id}
  Generate: CspSolver over SchedulingSnapshot → preview → Apply → POST /schedules/batch
        │
CONFLICT DETECTION
  Client (advisory): useConflict.checkConflict (per placement), getConflictedScheduleMap (grid)
  Server (authoritative): RuleEngine::validate per row + validateConfiguredMeetingGroups
                          + checkIntraBatchConflicts, under a semester write lock
        │
CONFLICT RECOMMENDATION
  DropModal → POST /schedule-recommendations/preview (CspSolver, ≤5 s, 3 solutions)
            → /select (by plan_id) → rows pushed into the modal → user confirms
  New placement:  /accept → CommitSchedulePlan (fingerprint check + kernel re-validation)
  Reschedule:     /schedules/batch (RuleEngine), recommendation marked rejected
  Year-level failure: pre-check → baseline → preference-only retry ladder → Recommended Adjustment
        │
FINAL SCHEDULE
  Mark Done (status completed) → Submit (Dean) → VPAA → faculty assignment → Finalize
```

What should exist, and doesn't yet, is marked ⚠ in section 4.

---

## 3. What is accurate (keep as is)

- **Every write is server-validated inside the write lock.** This covers `batch` (`ScheduleController.php:410-453`), `update` (`:1362`) and `store`. The client check is advisory only, so a stale client can never persist a conflict.
- **Recommendation accept is safe.** `CommitSchedulePlan::commit` refuses a stale snapshot fingerprint (`:55`), re-runs configuration and candidate validation (`:68-84`), and refuses to overwrite protected (submitted/approved) rows (`:86-105`).
- **Any modal edit discards a selected recommendation.** `DropModal.tsx:1031` (`onChangeCapture`) means Confirm can never save rows other than what is on screen.
- **Rule parity.** The kernel emits the same ids as the RuleEngine for section, room, online-course, operating-hours, field-window, day-category, Required Day, Sunday-major, preferred-pattern, room-type, class-duration, split-group and room-department rules.
- **Generation snapshot.** It keeps the section's non-target courses occupied, so generated rows cannot double-book a section against its own classes (`SchedulingSnapshotRepository.php:123-143`).
- **Required Day ∈ Preferred Days** is checked before solving (`CourseSetupOverrides::assertRequiredDaysAllowed`).
- **Custom Duration and Preferred Room** are validated with the same ceilings and room rules the save applies (`CourseSetupOverrides::normalizeDurations`, `normalizePreferredRooms`).

---

## 4. Findings

### Critical / High

#### H1. Applying a generated timetable deletes hand-placed classes of excluded courses (data loss)

`YearLevelGenerateScheduleWorkflow.tsx:1054-1094` sends `replace_section_ids` for every scoped section. The server resolves that to **every** draft/completed/revision row of those sections (`ScheduleController.php:279-287`). The course filter is ignored.

The generation snapshot, however, deliberately keeps the section's *non-selected* courses as occupied (`SchedulingSnapshotRepository.php:127-142`: "commit deletes nothing else"). The two sides disagree about what Apply replaces.

**Scenario:** a secretary places NSTP 1 by hand, excludes it in Setup Courses, generates the rest and clicks Apply. NSTP 1 is deleted. The generated classes were placed around NSTP 1's time, so the section is left with a hole and one fewer course. No step warns about this.

**Fix:** delete only rows whose `course_id` is in the generated course set. Either stop sending `replace_section_ids` and send the filtered `delete_ids`, or add `replace_course_ids` to the batch endpoint. Add a feature test: a manual row for an excluded course must survive Apply.

#### H2. The client checks conflicts against an incomplete timetable

The scheduler loads schedules from `/initial-data` (`useScheduler.tsx:349`, `:428`). That payload is:

- scoped to the viewer's department plus delegated courses (`InitialDataController.php:336-350`);
- capped at the **500 most recent rows** (`:358-362`); neither call passes `schedule_limit`;
- stripped of `faculty_id` on delegated rows the receiving department has not marked done (`:412-423`).

Consequences after a manual action:

1. Another department's booking of a shared or borrowed room never shows as a room conflict. The cell shows "Place", and the save then fails with 422.
2. An instructor who also teaches for another department never shows a faculty conflict.
3. A department with more than 500 meeting rows (about 25+ sections) **silently loses its oldest rows from the grid**. Those classes are not drawn, not counted in progress, and not checked for conflicts. The section can look incomplete, and the Done/Submit counts are wrong.

The 2026-09-19 audit (F9) accepted point 1 as advisory. Point 3 is not advisory: it is missing data.

**Fix:**

- Short term: pass an explicit `schedule_limit` large enough for the department. Show a banner when the returned count equals the limit.
- Proper fix: a lightweight "occupancy" endpoint that returns only `(day, start, end, room_id, faculty_id, section_id, course_id, mode)` for the whole semester. `useConflict` would read it for room and faculty checks, while the grid keeps the department slice.

#### H3. The client blocks placements the server allows (online limit of 5)

`useConflict.ts:83`, `:216-248` and `:554-559` refuse a sixth online course per section ("Online limit…"). The server rule was removed (`section_online_limit`; online balance is now a soft solver target only), and no server code references it any more.

As a result, the modal disables Confirm for a valid placement, and a generated section with six or more online courses shows no card conflict but cannot be edited through the modal.

**Fix:** delete `SECTION_ONLINE_COURSE_LIMIT`, `checkSectionOnlineLimit` and its call, plus their tests. Update the header comment at `:68-75`.

#### H4. A Required Day change can block unrelated edits of already-placed classes

Required Day is department-wide (`department_forced_course_days`). It is saved by `SchedulingSettingsController::syncForcedDayRules` (`:479`) with no check against existing placements.

`ScheduleController::update` validates the **merged stored row** in full, even for an instructor-only change (`:1337`, `:1365`). `MeetingDayRule::forcedDay` has no "only when the day changes" guard. `class_duration` was given exactly that guard (`ClassDurationRule`: "Data that was already over must not block unrelated edits").

**Scenario:** GEC 101 is placed on Tuesday in section A. Later, Required Day = Monday is set for GEC 101, in section B's modal or the wizard. Assigning an instructor to section A's GEC 101 now fails with "This course is configured to meet on Monday."

The same drift can happen with field-code changes (`field_evening_window`, `field_day_constraint`), room deactivation (`room_availability`) and the Sunday-online toggle.

**Fix:** in `update`, when no plotting field changed, report only rules that concern the changed fields: instructor, availability, faculty-active and department alignment. Alternatively, apply the `class_duration` "not newly introduced" pattern to the placement rules. When Required Day is saved, return the count of existing placements that now violate it, so the UI can warn.

(Marked high because it blocks the post-approval instructor-assignment phase. Confirm with a feature test before fixing.)

### Medium

#### M1. Manual placement writes department-wide configuration as a side effect, and does not roll back

`useScheduler.tsx:1586-1611` PATCHes `/scheduling-settings` (Required Day and field codes) **before** saving the placement.

- If the batch save then fails, the configuration change stays.
- Required Day and field codes apply to every section of the department and to future generation runs. A "Force day" tick in one section's placement dialog therefore changes all of them.
- `DropModal.tsx:793` goes further: applying a recommendation while "Force day" is ticked overwrites the Required Day with whatever day the recommendation picked. A user's stated constraint is silently replaced by the solver's output.

The recommendation payload (`DropModal.tsx:495-510`) does not send the unsaved Force-day or Field toggles. The solver therefore recommends against the *saved* configuration, not what the dialog shows.

**Fix:** save the settings change only after the placement succeeds, or in the same request. Label the checkboxes "applies to all sections". Remove `DropModal.tsx:793`, and instead send the dialog's forced day and field flag in the preview payload so the solver honours them.

#### M2. The relocate paths skip instructor and Required Day checks on the client

`useDragDrop.ts:111-121` and `useScheduler.tsx:2811-2821` call `checkConflict(..., facultyId: null, ...)` when moving an existing class. The drag-over hint does the same (`useConflict.ts:721`). The assigned instructor's clash and part-time availability are therefore not checked before the PUT.

`checkConflict` also has no `forced_course_day` rule, so moving a Required-Day class to another day shows "Place" and then fails. The server does catch both, so this is feedback quality rather than correctness.

**Fix:** pass `sched.facultyId` on both move paths. Add `forcedDayByCourseId` from `manualSchedulingSettings.forced_day_rules` to `checkConflict`.

#### M3. Moving one meeting of a Split Session / Hybrid Split leaves the partner stale on screen (uncommitted work)

The server now moves the partner to the same time (`ScheduleController::moveSameTimePartners`, uncommitted). The client merges only the moved row (`useScheduler.tsx:1376-1381`, `:2843-2848`), and the partner catches up only after the background `refreshSchedules`. The client pre-check also validates only the moved meeting at the new time, not the partner on its own day.

**Fix:** return the partner rows from `update` and merge them. Pre-check the partner with `checkConflict` before the PUT.

#### M4. No completeness or validity gate before Mark Done / Submit

`batchStatus` → `completed` (`ScheduleController.php:2055`) checks only ownership and status transitions. Instructor presence is checked only at `finalized`.

The client "Done" rule counts *courses placed*, not *hours placed* (`sectionDoneCandidates.ts:31-34`). A course with one of its two split meetings, or a Custom Duration shorter than its hours, counts as done. Nothing re-runs the rules at submit. Drifted violations (H4) or conflicts deliberately assigned over reach the Dean unflagged.

**Fix:** add a server-side readiness check used by both Done and Submit. It should cover:

- every curriculum course of the section placed;
- weekly minutes ≥ the course requirement, or an explicit Custom Duration recorded;
- `RuleEngine::validate` clean for every row, with faculty overrides listed.

The UI should list what is missing.

#### M5. The summer Monday–Friday rule exists only in the client

`useScheduler.tsx:416-419` and `useDragDrop.ts:63,90` block weekends in a summer semester. No server rule enforces it (no `summer` rule in `Engine/`). The generator can place Saturday classes in summer, and the API accepts them.

**Fix:** add the rule to `MeetingDayRule` and the kernel (one scenario in `EngineParityMatrixTest`), or remove it from the client if it is not a real business rule. Record the decision in `business_rules.md`.

#### M6. Required Day is not validated against the course's own day limits

Neither `SchedulingSettingsController` (`:42-44` validates only the day name) nor `ValidateGenerationConfiguration::validateForcedDays` (`:415-486`) checks the Required Day against:

- the category day limits: a field course on Saturday or Sunday, or a minor course on Sunday;
- Sunday-online-only for an on-site major;
- a summer weekend (M5);
- a Preferred Meeting pattern for a single-meeting course, such as Required Monday with pattern TTh (only multi-meeting shapes are checked).

The generator then fails the course with a generic "no candidate" error instead of naming the contradiction. Manual placement shows it only as a refused save.

**Fix:** reject these combinations when the Required Day is saved, and add them to `validateForcedDays` as hard violations with a `clear_forced_day` recommendation. The rule functions already exist (`MeetingDayRule::categoryDay`, `DeliveryModeRule::sundayMajorMismatch`).

#### M7. The course bank does not use the section's curriculum

`useScheduler.tsx:752-768` (`sectionCourses`) filters courses by department, year level and semester. The server's `CurriculumPlacementRule` and the generator resolve curriculum from the section (multi-curriculum architecture). A course from another active curriculum of the same department can be dragged in, and it is refused only on save. A course the section's curriculum does require can be missing from the bank.

**Fix:** filter by `section.curriculumId` when present, as `GenerationCourseSelection` does.

### Low

- **L1. Dormant auto-relocate in the manual save.** `useScheduler.tsx:1482-1534` searches for "an alternative time" and saves there ("Schedule Created at Alternative Time — Plotted to …", `:1722`, `:1728`). It is unreachable today because `handleModalConfirm` returns early on any `modalConflict` (`:1812`). It is still exported (`handleConfirmSchedule`, `:3029`), so any new caller would silently move a user's placement, which is not manual. Delete the search branch and treat a conflict as a validation error.
- **L2. Client day-category mirror differs on uncategorised courses.** `useConflict.ts:192` applies the Mon–Sat limit only to `category === "minor"`. The server applies it to every non-major (`MeetingDayRule::categoryDay`). The client NSTP check also uses keywords only, while the server also uses the category. Align both with `SchedulingPolicy`.
- **L3. Client checks stop at the first conflict.** `checkConflict` returns only the first problem, while the server returns all of them. The user fixes one, retries, and meets the next. Collect all of them, as the server does.
- **L4. The client has no mirror of** `faculty_active`, `class_duration`, `room_availability` (status is filtered in room options but not re-checked on move), `hybrid_component_shape` or the curriculum alignment rules. All are caught on save. Add only the cheap ones (`class_duration` needs course hours, which the client has).
- **L5. Silent day change on drop.** When a course has a Required Day, dropping it on another day opens the modal preset to the Required Day (`useScheduler.tsx:1157-1163`) with no message. Show "Moved to Monday (Required Day)".

---

## 5. Configuration coverage (manual vs generate)

| Setting | Generate: validated before solve | Generate: enforced | Manual: pre-checked on client | Manual: enforced on save | Gap |
|---|---|---|---|---|---|
| Required Day | ∈ Preferred Days; multi-meeting; day capacity; room pressure | kernel `forced_course_day` | modal preset only | `forced_course_day` | M2, M6, H4, M1 |
| Preferred Days | wizard | solver domain | n/a (manual) | n/a | — |
| Preferred Meeting (pattern) | allowed patterns | `preferred_pattern` | yes | yes | M6 (vs Required Day) |
| Preferred Room | available, reachable, type | soft ranking | n/a (user picks room) | room rules | — |
| Hybrid (Integrated / Split) | eligibility, component lengths | `hybrid_*`, `split_group_*` | partial (room type, same time) | yes | M3 |
| Split Session | eligibility, even length, ≤ units | `minor_split_*`, `split_group_*` | same-time only | yes | M3 |
| Field Courses | preferred field room | `field_day_constraint`, `field_evening_window` | yes | yes | M1 (codes saved as side effect) |
| Custom Duration | ≤ weekly ceiling, fits the day | `class_duration` | no | `class_duration` | M4 (under-hours never flagged) |
| Online balance | — | soft target | **hard limit 5** | none | **H3** |
| Summer weekdays | — | **none** | yes | **none** | M5 |

---

## 6. Order of work

1. **H1** — stop Apply deleting excluded courses. Small change and a feature test. This is the only data-loss item.
2. **H3** — remove the client online limit. A deletion, with no risk.
3. **H2** — raise and flag the schedule cap now; plan the occupancy endpoint.
4. **H4 + M6** — decide the "drift" policy (which rules an instructor-only edit re-checks), then validate Required Day when it is saved and before generation. Add one `EngineParityMatrixTest` scenario per new check.
5. **M1** — make settings changes transactional with the placement; stop recommendations rewriting Required Day.
6. **M4** — server readiness check for Done/Submit.
7. **M2, M3** — client relocation parity (faculty, Required Day, split partner). Land M3 with the uncommitted split-pair work.
8. **M5, M7**, then the low items.

A standing rule for future work: **every client mirror must name the server rule id it mirrors.** When a server rule is removed (as with `section_online_limit`), searching for the id finds the client copy too. H3 existed because the client copy had only a prose reference.
