# Split Hours Comprehensive Audit Report
**System**: Web-Based Intelligent Conflict Detection and Recommendation System for Academic Scheduling (WICARS)  
**Target Module**: Split Hours & Multi-Session Course Scheduling  
**Date**: July 31, 2026  
**Auditor**: Senior Frontend & Systems Developer (Antigravity AI)

---

## Executive Summary

A end-to-end architectural and functional audit of the **Split Hours** feature was conducted across the entire WICARS system stack: Frontend UI (`wicars-ui`), API Controllers (`ScheduleController`), Scheduling Services (`GenerateScheduleService`), Rule Engine (`RuleEngine`), Constraint Satisfaction Problem Solver (`CSPSolver`), Scheduling Policies (`SchedulingPolicy`), Database Schema & Transactions, Timetable Grid rendering, and Printable exports.

The audit revealed **10 significant findings** ranging from critical data integrity vulnerabilities to minor UI desynchronization issues. Most notably, the underlying database schema lacks metadata to group split meetings (`split_group_id`, `meeting_type`, `meeting_index`), batch API operations lack intra-payload conflict validation, and the CSP engine does not calculate contact hours for combined Lecture + Laboratory courses according to CHED academic standards.

---

## Prioritized Audit Findings Summary

| # | Severity | Affected Module | Short Description |
|---|----------|-----------------|-------------------|
| **1** | ~~Critical~~ **Fixed** | Database Schema & Models | Missing `split_group_id`, `meeting_type`, and `meeting_index` database columns. |
| **2** | ~~Critical~~ **Fixed** | Backend API (`ScheduleController`) | Missing intra-batch conflict detection in `batch()` and `validateSplits()`. |
| **3** | **Critical — open, needs a policy decision** | CSP Engine (`CSPSolver`) | Discrepancy between course unit calculation vs. Lecture/Laboratory contact hours. |
| **4** | ~~High~~ **Fixed** | Frontend (`GenerateScheduleModal`) | Invalid room assignment (lecture room) for split Laboratory sessions (`-m2`). |
| **5** | **High** | Backend API (`validateSplits`) | Inflexible single-direction forward slot-shifting during auto-resolution. |
| **6** | **High** | Rule Engine (`RuleEngine`) | Section online limit overcounts split hybrid sessions as full online courses. |
| **7** | **Medium** | Timetable Grid & Modals | Unsynchronized manual editing and drag-and-drop of split meetings. |
| **8** | **Medium** | Backend API & Timetable Grid | Absence of atomic deletion for linked split sessions leading to orphaned rows. |
| **9** | **Medium** | Timetable Grid & Printing | Missing visual indicators (`[Lec]`, `[Lab]`, `[Split 1/2]`) in timetable & exports. |
| **10** | **Low** | Frontend State Management | Inconsistent synthetic ID parsing (`-m1`, `-n1`) for temporary split UI cards. |

---

> **Status (August 18, 2026).** Findings **1** and **2** have shipped: the three
> columns exist (`schedule_splits`, surfaced through `Schedule`'s appended
> attributes) and `ScheduleController::checkIntraBatchConflicts` runs inside the
> batch transaction. Finding **4** is fixed — a laboratory course is no longer
> offered a lecture room anywhere: `LaboratoryScheduleRequirementBuilder` lists
> only `['laboratory']` for a laboratory component, `CSPSolver` no longer builds
> lecture-room candidates for one, and `GenerateScheduleModal` reads the course's
> real `room_type_required` instead of assuming `"lecture"`. Finding **7** is
> partly addressed by finding #6 of `schedule_builder_audit_report.md` (the
> placement modal is now keyed on its editing session rather than on `schedules`).
>
> **Finding 3 remains open, and deliberately so.** The client no longer *conflates*
> the two conventions — `wicars-ui/src/pages/ClassSchedules/SchedulerPanel/courseSlotPlan.ts`
> names them separately and mirrors the server exactly: a single block is
> `units * 2` slots, a lecture/laboratory split is `lectureHours * 2` plus
> `labHours * 6`. But whether an *unsplit* laboratory course should occupy
> `units * 2` (today, 3 hours for a 3-unit course) or the CHED contact total
> (5 hours) is an institutional policy question, not a bug to be fixed in code:
> moving every unsplit laboratory course from 3 to 5 hours would change room
> capacity requirements across every department. This needs a decision from the
> scheduling owners, like finding #40 of the schedule-builder audit.

---

## Detailed Audit Findings

### 1. Missing Database Schema Columns for Split Metadata (`meeting_type`, `meeting_index`, `split_group_id`)
- **Severity**: Critical
- **Affected Module**: Database Migrations (`schedules` table), `Schedule` Model, Backend API, Timetable Rendering
- **Root Cause**: The `schedules` table schema stores only base schedule attributes (`course_id`, `section_id`, `room_id`, `day`, `start_time`, `end_time`, `mode`, `is_hybrid`, `preferred_pattern`). It lacks `meeting_type` (`lecture`/`laboratory`), `meeting_index` (1, 2, ...), and `split_group_id` (UUID linking split sessions of the same course).
- **Impact**:
  1. Once saved, split sessions become unlinked, standalone database records.
  2. Re-fetching schedules strips split identity, preventing the UI from knowing which cards belong together.
  3. Editing or deleting one split session leaves an orphaned half-session in DB with missing contact hours.
  4. Laboratory sessions cannot be distinguished from lecture sessions in DB, breaking room-type validation during manual updates.
- **Recommended Fix**: Add a database migration for `schedules`:
  - `split_group_id` (`uuid|nullable`, indexed)
  - `meeting_type` (`enum['lecture', 'laboratory']|nullable`)
  - `meeting_index` (`unsignedTinyInteger|default(1)`)  
  Update `Schedule` model `$fillable` and API responses.

---

### 2. Missing Intra-Batch Conflict Detection in `ScheduleController::batch()` and `validateSplits()`
- **Severity**: Critical
- **Affected Module**: Backend API (`ScheduleController::batch`, `ScheduleController::validateSplits`), `RuleEngine`
- **Root Cause**: Both `batch()` and `validateSplits()` loop through `$validated['operations']` and validate each item individually against existing database schedules using `RuleEngine::validate()`. Neither endpoint validates operations within the array *against each other*.
- **Impact**: If two split meetings (e.g. Session 1 and Session 2) in the same batch payload land on the same day and overlapping time slot, or assign the same room/faculty at the same time, `RuleEngine` approves both because neither exists in the DB yet. The transaction then executes and saves colliding split records into the DB.
- **Recommended Fix**: Implement intra-batch validation in `ScheduleController`:
  1. Maintain a transient list of all pending operations in the current batch.
  2. For each operation $i$, validate it against DB *and* against all other operations $j \neq i$ in the batch array.
  3. Reject the payload with 422 if an intra-batch overlap (same room, faculty, or section at overlapping times) occurs.

---

### 3. Discrepancy Between CSP Unit Calculations vs. Lecture/Laboratory Contact Hours
- **Severity**: Critical
- **Affected Module**: CSP Engine (`CSPSolver::getDurationSlots`), `GenerateScheduleService`
- **Root Cause**: `CSPSolver::getDurationSlots` calculates duration solely as `$course->units * 2` (30-min slots). It ignores CHED academic policies where 1 Lecture unit = 1 contact hour/week (2 slots) while 1 Laboratory unit = 3 contact hours/week (6 slots).
- **Impact**:
  - A 3-unit course comprising 2 Lecture units + 1 Lab unit requires 5 contact hours (10 slots total: 2h Lec + 3h Lab).
  - CSP calculates duration as $3 \times 2 = 6$ slots (3 hours total), causing severe under-scheduling of laboratory contact hours (missing 2 full hours of required instruction).
  - CSP solver cannot auto-generate authentic Lecture + Laboratory split domains.
- **Recommended Fix**: Update `CSPSolver` to calculate contact hours based on course composition:
  - `total_slots = (lecture_units * 2) + (lab_units * 6)`.
  - When generating split domains for courses with `lab_units > 0`, construct domain variable pairs: Block 1 = `lecture_units * 2` slots, Block 2 = `lab_units * 6` slots.

---

### 4. Invalid Room Assignment for Split Laboratory Sessions on Frontend
- **Severity**: High
- **Affected Module**: Frontend (`GenerateScheduleModal.tsx`), Backend (`validateSplits`)
- **Root Cause**: In `GenerateScheduleModal.tsx` lines 377–402, when splitting a major course with lab units into `-m1` (Lecture) and `-m2` (Laboratory), `-m2` inherits the original `item.room_id` (which is a lecture room). It does not lookup or assign an available Laboratory room (`room_type === 'laboratory'`).
- **Impact**: Split laboratory sessions get assigned to lecture rooms on-site, violating room type constraints and safety/equipment requirements for laboratory courses.
- **Recommended Fix**:
  - In `GenerateScheduleModal.tsx`, filter available rooms by `c.room_type_required === 'laboratory'` for `-m2` laboratory sessions.
  - Require room selection or pass `meeting_type` to `validateSplits` so backend enforces `room_type_match` specifically for laboratory meetings.

---

### 5. Inflexible & Rigid Slot-Shift Resolution in `validateSplits()`
- **Severity**: High
- **Affected Module**: Backend API (`ScheduleController::validateSplits`)
- **Root Cause**: `validateSplits()` attempts automatic conflict resolution by shifting start time forward on the *same day* by +30-minute intervals up to 4 hours. It never attempts to shift backwards, try an alternate valid pattern day, or switch to an alternate available room of the same type.
- **Impact**: If a conflict occurs at 4:00 PM, forward shifting past operating hours (9:00 PM) fails and returns `split_unresolvable`, rejecting valid schedule candidates that could be easily resolved by shifting earlier or changing pattern days.
- **Recommended Fix**: Enhance `validateSplits` slot-search algorithm to:
  1. Search both directions (forward and backward within operating hours: 07:00–21:00).
  2. If same-day resolution fails, attempt pattern-day swap (e.g. Tue $\leftrightarrow$ Thu).
  3. Allow room re-assignment among available rooms matching the required room type.

---

### 6. Online Class Count Overflow in Hybrid Split Courses
- **Severity**: High
- **Affected Module**: Backend Services (`RuleEngine::checkSectionOnlineLimit`)
- **Root Cause**: `RuleEngine::checkSectionOnlineLimit` enforces a maximum of 5 online classes per section per term. It counts each schedule row with `mode === 'online'` as 1 unit toward the limit. Split hybrid courses generate independent `online` rows for their online meetings.
- **Impact**: A section with 3 split hybrid courses (each having 1 online meeting row) consumes 3 slots of the section's online limit. If a section has 5 hybrid split meetings, the section hits the cap and cannot schedule any further online or hybrid courses, misinterpreting partial split sessions as full online courses.
- **Recommended Fix**: Update `checkSectionOnlineLimit` to count unique online *courses* or sum total online contact hours / weight split sessions (`0.5` per split online meeting) rather than raw row counts.

---

### 7. Unsynchronized Manual Editing & Drag-and-Drop of Split Meetings
- **Severity**: Medium
- **Affected Module**: Timetable Grid (`ScheduleViewer.tsx`, `Schedules.tsx`, `DropModal.tsx`)
- **Root Cause**: Moving or editing a schedule card on the grid triggers an isolated `PUT /schedules/{id}` call for that single database record. Because split meetings lack `split_group_id` linkage, the paired split session is not updated or validated together.
- **Impact**:
  - A user can move Session 1 to Wednesday, resulting in both Session 1 and Session 2 landing on Wednesday (violating pattern constraints).
  - Editing duration or room on Session 1 leaves Session 2 mismatched.
- **Recommended Fix**:
  - When editing or dragging a schedule card with a `split_group_id`, load all linked split sessions.
  - Provide a modal option to update "This session only" or "All split sessions for this course", sending batch updates via `/schedules/batch`.

---

### 8. Absence of Atomic Deletion for Linked Split Meetings
- **Severity**: Medium
- **Affected Module**: Frontend Scheduler Panel, Backend API (`ScheduleController::destroy`)
- **Root Cause**: `DELETE /schedules/{id}` only deletes a single record. There is no `delete_group` option or cascading delete for linked split meetings.
- **Impact**: Deleting a split schedule card leaves an orphaned split record in the database, causing section contact hour deficit and silent schedule corruption.
- **Recommended Fix**: Update `ScheduleController::destroy` to accept an optional `delete_group=true` query param. When `split_group_id` is present and `delete_group=true`, delete all schedules sharing the same `split_group_id`.

---

### 9. Missing Visual Indicators for Split Sessions in Timetable Grid & Printable Reports
- **Severity**: Medium
- **Affected Module**: UI Components (`ScheduleViewer.tsx`, Printable Timetable Export)
- **Root Cause**: Timetable grid cells and print previews render schedule cards using `course_code` and `course_name` only.
- **Impact**: Faculty and students viewing printed schedules cannot tell if two cards for the same course represent a Lecture vs. Laboratory session or Split Meeting 1 vs. Split Meeting 2.
- **Recommended Fix**: Render badges on schedule cards:
  - `[Lec]` for lecture meetings, `[Lab]` for laboratory meetings.
  - `[Split 1/2]` / `[Split 2/2]` when `split_group_id` is populated.

---

### 10. Inconsistent Synthetic ID Parsing for Temporary Split UI Cards
- **Severity**: Low
- **Affected Module**: Frontend State Management (`GenerateScheduleModal.tsx`, `useScheduler.tsx`)
- **Root Cause**: Frontend uses `-m1`, `-m2`, `-n1`, `-n2` suffixes for synthetic split cards in preview modals. However, `ScheduleImportModal` and `useGenerateSchedule` filter out synthetic IDs using regex `/-\w\d$/`, which can break if real schedule database IDs contain hyphens or non-numeric strings.
- **Impact**: Edge cases in CSV import or batch saving where synthetic UI IDs fail regex checks or leak into server payloads as invalid integer IDs.
- **Recommended Fix**: Standardize synthetic split ID prefixing (e.g. `temp-split-{uuid}-m1`) and use strict helper functions `isSyntheticId(id)` across all frontend modules.

---

## Action Plan & Order of Implementation

To ensure system stability, database consistency, and academic compliance, the fixes should be executed in the following 4 phases:

```
Phase 1: Data Model & Schema Integrity (Findings 1, 2)
  ├── 1. Add migration for `split_group_id`, `meeting_type`, `meeting_index`
  └── 2. Implement intra-batch validation in batch() and validateSplits()

Phase 2: Academic Contact Hours & Solver Accuracy (Findings 3, 4, 6)
  ├── 3. Update CSPSolver contact hours formula: (lec_units * 2) + (lab_units * 6)
  ├── 4. Fix frontend room selection to assign Laboratory rooms to -m2 sessions
  └── 5. Adjust RuleEngine online class limit to count unique online courses

Phase 3: Resilient Resolution & Manual Workflow Integration (Findings 5, 7, 8)
  ├── 6. Enhance validateSplits with bidirectional & pattern slot-shift search
  ├── 7. Synchronize manual drag-and-drop & editing for linked split meetings
  └── 8. Implement atomic split group deletion in backend & frontend UI

Phase 4: UI Polish & Export Visuals (Findings 9, 10)
  ├── 9. Add [Lec], [Lab], and [Split 1/2] badges to Timetable Cards & Prints
  └── 10. Standardize synthetic split ID generation & validation helpers
```
