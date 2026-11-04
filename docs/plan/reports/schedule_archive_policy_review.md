# Schedule deletion, archives, and restore access

Date: 2026-11-01

Status: review and recommendation only; application behavior and permissions were not changed.

**Recommendation:** archive schedules removed through explicit Delete or Clear actions, and let the current authorized schedule author recover them within an editable workflow stage. Keep the institution-wide Archive under VPAA control. Automatic regeneration can remain a replacement of working data, with complete retained snapshots, rather than filling the recovery archive with every generated alternative.

This deliberately reconsiders the documented exception that makes Clear schedules permanent. It is a proposed policy, not the policy currently implemented.

## Current behavior

| Action | What is retained? | Archive restoration |
| --- | --- | --- |
| Delete one saved class | Soft-deletes the schedule and its split metadata. | Active VPAA can restore, subject to current term, dependencies, rules, and conflicts. |
| Delete linked meetings through the class delete action | Soft-deletes linked schedules and split metadata. | Required meeting patterns restore together atomically. |
| Clear / Reset schedules for selected sections, including selecting all eligible sections | `/schedules/batch` permanently deletes `draft`, `completed`, and `revision` rows and their split metadata. Retains deletion snapshots separately. | **Cannot be restored, even by VPAA.** |
| Apply a generated timetable | The same batch endpoint permanently replaces targeted working rows. Courses excluded from generation remain. | Removed working rows cannot be restored from Archive. |
| Other allowed batch deletion of returned rows | `rejected` / `rejected_by_dean` rows are soft-deleted; only the three working statuses above are permanently deleted. | Soft-deleted rows remain recoverable. Persistence depends on endpoint and status. |
| Change an existing placement | Updates existing rows where possible. Surplus meetings removed during a pattern change follow batch deletion behavior. | An earlier placement is not automatically an archived copy. |
| Clear All Instructors | Sets eligible schedules' `faculty_id` to null; retains placements and approval status. | Does not archive or delete schedules. Instructors must be assigned again. |

The Clear dialog correctly warns that the action is permanent and cannot be restored from Archive. Locked workflow rows are blocked from ordinary deletion; the clear checklist disables locked sections. Current Archive restoration retains a schedule's archived workflow status rather than returning it to draft automatically.

Evidence: [single deletion](../../../../backend/app/Http/Controllers/Scheduling/ScheduleController.php#L1596), [batch persistence](../../../../backend/app/Http/Controllers/Scheduling/ScheduleController.php#L534), [split lifecycle](../../../../backend/app/Models/Schedule.php#L141), [Clear request and warning](../../../src/pages/ClassSchedules/SchedulerPanel/hooks/useScheduler.tsx#L1968), [generated replacement](../../../src/pages/ClassSchedules/SchedulerPanel/GenerateSchedule/YearLevelGenerateScheduleWorkflow.tsx#L1289), [instructor clearing](../../../../backend/app/Http/Controllers/Faculty/InstructorAssignmentController.php#L354).

## Why Secretary cannot restore

All archive list, detail, and restore API routes are inside `role:vpaa` middleware. The frontend `/archive` route also uses `RoleRoute role="vpaa"`. This is a server-enforced restriction, not just a hidden button.

There is no separate `schedule.restore` capability. Secretary schedule create/update/delete permissions do not grant Archive access. Current role defaults give Secretaries and Program Heads authoring capabilities; VPAA does not hold ordinary schedule create/update/delete/generate capabilities.

The documented decision centralizes domain-record recovery under VPAA. No separate business justification for excluding Secretaries from recovery of their own working schedules was found. A reasonable rationale for the global restriction is that Archive also restores accounts, departments, programs, rooms, and other institutional records. That rationale does not establish a technical need for VPAA to undo every routine schedule removal.

**Do not admit Secretary to the entire Archive route group.** Provide schedule-only recovery instead. Secretary ownership is also narrower than the whole department: existing write-scope rules reserve a program to its active Program Head. Recovery must respect this boundary and the Program Head's corresponding ownership.

Evidence: [backend role gate](../../../../backend/routes/api.php#L66), [frontend role gate](../../../src/App.tsx#L218), [role defaults](../../../../backend/config/capabilities.php#L197), [program ownership](../../../../backend/app/Services/Scheduling/Schedule/ScheduleAuthorizationService.php#L211), [documented archive decision and Clear exception](../decisions.md#archive-domain-records-instead-of-permanently-deleting-them).

## Findings by priority

| Priority | Finding | Consequence and recommendation |
| --- | --- | --- |
| P1 | Individual Delete archives a draft; Clear permanently deletes the same draft. | A bulk mistake can lose an entire working timetable. Make explicit Delete and Clear consistently recoverable; distinguish them from automatic replacement. |
| P1 | Schedule restore checks dependencies, scheduling rules, and conflicts, but does not check whether the destination section has entered a locked submission stage. | A disposable fixture confirmed HTTP 200 when VPAA restored an archived draft beside a `submitted` class in the same section, creating mixed workflow stages. Add a current section/submission-stage guard under the scheduling lock before expanding recovery access. This probe did not exercise an entire real submission cycle. |
| P2 | Retained batch-deletion snapshots are not a usable recovery feature. | The normal history API includes only `department_workflow` approval/return/recall events, excluding `batch_delete`. Deletion snapshots also omit `split_group_id`, `meeting_type`, and `meeting_index`: `getAttributes()` excludes these split-backed fields. Do not promise that retained history can reconstruct a cleared timetable. |
| P2 | The author can archive a class but cannot undo that removal. | VPAA-only recovery adds a handoff for routine editing. Give the current authorized author schedule-only recovery within existing ownership and lifecycle boundaries. |

The first and fourth findings are proposed improvements to intentional current behavior. The second is a workflow guard gap. The third is a verified limitation of retained snapshots and their visibility.

Evidence: [restore transaction and validation](../../../../backend/app/Http/Controllers/Admin/ArchiveController.php#L221), [restore preconditions](../../../../backend/app/Services/Archive/ArchiveRestoreChecks.php#L141), [batch history write](../../../../backend/app/Http/Controllers/Scheduling/ScheduleController.php#L646), [snapshot serialization](../../../../backend/app/Services/ScheduleHistoryRecorder.php#L87), [history API filter](../../../../backend/app/Http/Controllers/Scheduling/ScheduleHistoryController.php#L45).

## Recommended policy

| Situation | Treatment | Recovery authority |
| --- | --- | --- |
| Explicit Delete or Clear in an editable active-term timetable | Soft-delete schedules and linked meetings. Identify the affected rows as one removal operation for bulk review. | Current authorized Secretary or Program Head within existing write scope; VPAA retains administrative recovery oversight. |
| Routine rescheduling | Update the existing placement and record the change. | Current authorized author; previous values are history. |
| Automatic generation replacement | Permanent replacement can remain an exception, with complete before-state snapshots and an accurate warning. Repair the snapshot limitation first. | No ordinary Archive restore of replaced rows. Do not advertise snapshot-to-draft recovery unless implemented. |
| Submitted, approved, instructor-stage, or finalized timetable | Require the appropriate recall/return/revision transition before restoring placements. | Existing workflow authorities; restoration must not confer approval. |
| Past semester | Preserve historical records read-only; block restoration into the live timetable. | Existing historical-view permissions. |
| Accounts and institutional master records | Keep the global Archive policy. | VPAA. |

Changing a schedule does not, by itself, justify permanently erasing an explicitly removed class. Recovery can reject obsolete placements against today's rules and conflicts. Automatic replacement is different: archiving every superseded generated row would create clutter and confusing duplicates.

Schedule recovery must require an active account, active semester, current ownership, and an editable destination workflow. Restore into the appropriate draft/revision state, retaining valid revision-cycle linkage; require normal completion and submission again. Never silently restore an old approval stage over the current workflow. Reuse the semester lock, transaction, rule engine, linked-group validation, audit logging, and cache invalidation. A failed validation must leave the entire affected group archived.

No automatic purge period is proposed: no institutional retention requirement was verified in this review.

## Smallest implementation sequence, if adopted

1. Add the destination section/submission-stage guard and regression coverage, including for VPAA recovery.
2. Make explicit Delete/Clear archive consistently while distinguishing automatic generation replacement. Preserve split metadata and removal provenance; do not change every batch caller to archive indiscriminately.
3. Expose schedule-only recovery through the existing role/capability and ownership mechanisms. Enforce scope on list, detail, and restore at the backend; keep institutional archives VPAA-only.
4. Update UI wording and documentation together. Verify department/program isolation, active Program Head ownership, atomic linked restore, locked/past-term refusal, and unchanged generation replacement behavior.

## Verification and limits

Reviewed the current local worktrees, including pre-existing uncommitted Archive changes. No application code, permissions, migrations, or working database records were changed for this report.

- Existing backend checks: **52 tests, 290 assertions passed** across `ArchiveTest`, `ArchiveRecoveryTest`, `ScheduleWorkflowIntegrityTest`, `InstructorAssignmentClearTest`, and two focused restore checks in `MultipleCurriculaPerSemesterTest`.
- Existing frontend checks: **13 tests passed** across `ClearAllModal.test.tsx`, `sectionClearCandidates.test.ts`, and `Archive.test.tsx`.
- Temporary probes outside both repositories: **2 tests, 18 assertions passed**, using the configured SQLite in-memory database. They reproduced mixed-stage restoration and confirmed permanent Clear removal, omitted split snapshot fields, exclusion from the history API, and VPAA restore returning 404 after Clear. Passing probes confirm current behavior, not its desirability.
- No authenticated browser walkthrough or production-data inspection was performed. The recommended policy remains unimplemented.
