# Faculty availability workflow plan

Date: 2026-11-09. Status: proposed; no application changes implemented.

## Goal and recommendation

Make employment type supply a usable weekly teaching schedule automatically. Most instructors should require no separate availability setup. Staff should open an editor only to record exceptions.

Recommended flow: **Choose employment type -> see standard hours -> optionally customize -> save.** Reuse the current instructor form, details panel, availability editor, and API. Keep one compact editor instead of adding another page or wizard.

## Proposed teaching hours

| Employment type | Monday-Friday | Saturday | Sunday |
| --- | --- | --- | --- |
| Full-time | 7:00 AM-5:00 PM | Unavailable | Unavailable |
| Part-time | 5:00 PM-8:30 PM | 7:00 AM-8:30 PM | Unavailable |

These are the user's proposed hours, not an already established system policy. Full-time Saturday and all Sunday availability are assumed unavailable because they were not included in the request.

**Decision before implementation:** Are these strict employment limits or editable starting templates? This plan describes the strict version as the proposed target: personal availability can narrow these hours. If they are templates only, retain the same workflow and state model but allow custom windows anywhere institution and course rules permit. Do not implement a new settings switch just to support both possibilities.

The blocks express when an instructor may be scheduled, not their required teaching load or a guarantee that they personally accept every evening. Actual exceptions belong in custom availability. Existing load, room, course, department, and approval rules remain applicable.

## Verified current behavior

This is a source-based implementation plan, not a screenshot-based UX audit. No application tests or live database checks were run for this document.

| Priority | Current behavior | Required change |
| --- | --- | --- |
| High | Both backend validation implementations enforce recorded availability only for part-time instructors. Full-time windows are saved but ignored. | Enforce resolved availability for both employment types. |
| High | A part-time instructor with no recorded windows is currently unrestricted. The details panel incorrectly says they cannot be assigned. | Give empty states explicit meanings and align UI wording, API results, validation, and tests. |
| High | Changing availability or employment type does not check whether existing assignments would become invalid. | Preview affected active assignments before saving changes and retain their schedules for review. |
| Medium | Users add and edit a separate time row for each day. Newly added rows span global operating hours. | Supply standard hours automatically; let one action set several selected weekdays. |
| Medium | The editor labels every blank day as unrestricted, including omitted days in a nonempty part-time schedule. | Display the actual effective state: standard hours or unavailable. |
| Scope | Generated schedules currently have no instructor assigned (`faculty_id: null`). Instructor selection happens later. | Apply availability wherever an instructor is known. Do not claim this change makes generation plan classes around instructors. |

The institution defaults are 7:00 AM-8:30 PM with a 30-minute grid. Runtime operating hours may differ and must come from the backend. Field courses have a separate end-time restriction, defaulting to 5:00 PM; standard part-time evening hours do not override that restriction.

## Proposed user flow

### 1. Instructor creation and employment type

- Immediately below Employment Type, show a short **Teaching availability** summary using the selected type's standard hours.
- Standard availability applies when the instructor is created; no second modal or extra save is necessary.
- Provide **Customize availability** for exceptions, using the existing editor with standard hours prefilled. If customized during creation, save the instructor and availability together in one backend transaction.
- Keep changes in a draft until Save. Cancel must persist nothing.
- When employment type changes, update a standard-mode preview immediately. If custom windows exist, retain the draft and flag incompatible times; never silently discard them or convert them to standard.

### 2. Instructor details

- Show **Standard hours** or **Custom availability**, followed by a compact weekly summary.
- Group identical consecutive weekdays, for example `Mon-Fri: 5:00 PM-8:30 PM`, with Saturday on its own line.
- Show unavailable days clearly. Avoid a seven-day input form in the read-only view.
- Keep an **Edit availability** action for existing authorized staff. Do not expand access to other accounts.

### 3. Availability editor

- Begin with **Use standard hours** selected for standard-mode instructors. Show the schedule without requiring day-by-day input.
- **Customize** copies the effective standard week into an editable draft, or opens the instructor's existing custom week.
- Offer weekday checkboxes plus one start/end pair and **Apply to selected days**. This replaces windows for those selected days in the draft; show the result before saving. Saturday remains independently editable.
- Allow a day to be marked **Unavailable**, and retain multiple non-overlapping windows for breaks or split availability. Put additional-window controls behind the normal edit action.
- In the strict version, limit inputs to the type's permitted days and times and explain invalid ranges inline. All saves are still validated on the server.
- Replace **Clear the week** with two unambiguous actions: **Use standard hours** and **Mark all days unavailable**. Both change only the draft until saved.
- Use **Save availability** and **Cancel**. Label time inputs, maintain keyboard focus, support narrow screens, and keep errors beside the affected controls.

### 4. Instructor assignment

- Show the instructor's effective availability beside selection so staff can see why a class is eligible or blocked.
- Validate the full meeting interval and every linked meeting. A class starting within a window but ending after it is blocked.
- Give a specific reason, for example: `Outside full-time hours: Monday-Friday, 7:00 AM-5:00 PM` or `Unavailable on Tuesday in this instructor's custom schedule`.
- Check single assignment, bulk assignment, cross-department assignment, placement changes with an instructor, conflict resolution, and room transfers consistently.
- If no eligible instructor fits an already plotted class, show that outcome and let staff use the existing assignment or permitted time-editing workflow. Do not silently move a class or restore retired instructor recommendations.

## Minimal data and API design

Reuse the `faculties` and `faculty_availabilities` tables. Add one field on `faculties`: **`availability_mode`**, with values `standard` and `custom`.

| State | Meaning |
| --- | --- |
| `standard` | Resolve the weekly hours from the current employment type; no per-day rows are needed. |
| `custom` with rows | Only the recorded windows are available. Omitted days are unavailable. |
| `custom` with no rows | Unavailable all week. Never interpret this as unrestricted or reset to standard. |

One explicit mode is necessary because an empty list cannot distinguish inheriting defaults from deliberately being unavailable. Do not add a separate unavailable flag, template table, recurrence engine, or per-instructor copies of the standard week.

Backend responsibilities:

1. Own the two standard profiles in one scheduling policy/helper. Reuse existing time normalization, day mapping, and continuous-coverage logic.
2. Resolve effective windows as employment profile intersected with institution hours, and, in custom mode, personal windows. Other course and placement restrictions continue to apply independently. In the templates-only variant, custom windows replace the profile rather than intersect it.
3. Reject new custom windows outside permitted hours, reversed times, overlaps, invalid days, or unsupported grid boundaries. Do not silently trim a saved custom window. If global hours later narrow an existing window, retain its stored value, show the effective restriction, and flag affected assignments for review.
4. Extend the existing availability GET/PUT contract with explicit `availability_mode` and backend-resolved `effective_availabilities`. Keep `availabilities` as stored custom rows; return the standard profile as well so the frontend does not duplicate business-hour constants.
5. Include mode and effective windows in faculty payloads used by instructor selection, `/initial-data`, and scheduling snapshots. Update TypeScript types and data mappers together. Include these values in relevant snapshot fingerprints and invalidate existing faculty, initial-data, and assignment cache groups when they change.
6. Reuse the existing availability replacement transaction and authorization. Treat instructor creation with custom availability, and employment-type changes with availability edits, as atomic operations. Revalidate current employment type, policy, and assignment impact at save; serialize against affected assignment saves. Include `InstructorAssignmentController` single-assignment writes, which currently use a transaction without the shared schedule write lock. Use consistent lock ordering for faculty and affected schedules across both edit and assignment paths.
7. Update every availability-write caller to send explicit mode, and reject missing mode with a validation error (`422`) in the new contract. Coordinate backend/frontend rollout so an older empty-list request cannot unexpectedly mean unavailable all week. Saving standard mode removes unused custom rows in the same transaction; reopening Customize then starts from the standard week. Unrelated faculty edits do not need to resend availability.

Keep the existing part-time violation identifier where callers depend on it; add a full-time counterpart and register it in the existing rule metadata, ordering, and frontend consumers. Use employment-neutral helper names for shared checks. A broad rule-engine rewrite is unnecessary.

## Changes to existing instructors and schedules

Run a read-only impact report before activating the new behavior:

- Instructors with no recorded windows: proposed migration to standard mode. This narrows previously unrestricted scheduling, so list affected assignments first.
- Instructors with recorded windows: preserve them as custom mode. Full-time windows were previously ignored, so list assignments that would become invalid when enforcement starts.
- Custom windows outside the proposed strict profile: retain the rows, list them for correction, and do not silently clip, delete, or widen them. Resolve these cases before strict activation.
- Include active/current-semester assignments and future editable schedules in the report. Preserve approved schedules and historical snapshots; surface active conflicts through the normal authorized review/revision process.

Do not activate strict enforcement until all newly invalid active assignments are resolved, including those affected by previously ignored full-time windows or the change from unrestricted empty availability to standard hours. Data migration and enforcement activation must be sequenced so they do not introduce an interval where these assignments are silently invalid.

For later availability or employment-type edits, show the number and details of assignments that would become invalid before Save. Recompute that impact when saving and block any change that would invalidate an active assignment, including a draft assignment. Staff must first use the existing authorized assignment/time-editing workflow; protected schedules require their normal revision process. Never auto-delete, unassign, move, or rewrite existing schedules.

This blocking approach avoids introducing a new unresolved-conflict lifecycle. The current conflict scanner counts overlapping bookings and does not automatically surface a standalone availability violation. Revalidate current effective availability at assignment completion/finalization and any later submission boundary accepting assigned instructors; do not rely on a previously loaded client preview or overlap counts alone.

## Implementation sequence

| Phase | Deliverable | Main touchpoints |
| --- | --- | --- |
| 1. Settle policy and audit data | Confirm strict limits versus templates, Saturday/Sunday assumptions, and review the read-only impact report. | This plan; existing faculty and schedule records. |
| 2. Resolve availability on the backend | Add mode/migration, central profiles and resolution, API fields, create/update handling, both validation implementations, cache/snapshot updates, and impact checks. | `FacultyAvailabilityController`, `FacultyController`, `Faculty`, scheduling policy/helper, `InstructorAvailabilityRule`, `InstructorAvailabilityConstraints`, `SchedulingSnapshotRepository`, faculty/initial-data/assignment serializers. |
| 3. Simplify frontend entry and display | Automatic preview on employment choice, grouped summary, standard/custom editor, apply-to-days, consistent blocked messages, and generic availability checks. | `Faculty.tsx`, `FacultyAvailabilityPanel`, `FacultyAvailabilityEditor`, `facultyAvailability.ts`, `availabilityWindows.ts`, `useConflict.ts`, `InstructorAssignment.tsx`, scheduler types and `initialDataMapper.ts`. |
| 4. Verify and release together | Run focused parity/API/UI checks, visually check rendered interactions, resolve legacy data findings, and publish the stable rule in project documentation. | Existing instructor, cache, capability, engine parity, assignment, transfer, and frontend availability tests; `business_rules.md`, `database.md`, `decisions.md`. |

## Acceptance checks

| Case | Expected result for the proposed strict version |
| --- | --- |
| New full-time instructor, no custom edits | Standard Monday-Friday 7:00 AM-5:00 PM; no availability setup step. |
| New part-time instructor, no custom edits | Standard weekday evenings and Saturday; no availability setup step. |
| Full-time Monday 4:00 PM-5:00 PM | Fits availability; other rules are evaluated separately. |
| Full-time Monday 5:00 PM-6:00 PM or Saturday | Blocked by employment hours. |
| Part-time Monday 4:30 PM-5:30 PM | Blocked because part of the meeting is outside availability. |
| Part-time Monday 5:00 PM-8:30 PM | Fits standard availability; other rules are evaluated separately. |
| Part-time Saturday 7:00 AM-8:30 AM | Fits standard availability; other rules are evaluated separately. |
| Any meeting ending after 8:30 PM; either type on Sunday | Blocked by the proposed profile. |
| Custom week omits Tuesday; custom week is empty | Tuesday unavailable; entire week unavailable, respectively. |
| Two adjacent custom windows; two windows with a gap | Continuous coverage allowed; a class spanning a gap blocked. |
| Use standard hours after customization | Mode returns to standard and resolves current type's profile. |
| Employment change with custom windows | Preserve draft, flag incompatible windows, and require correction before save. |
| Change invalidates existing assignments | Show impact and block the availability/type save until assignments are corrected; retain schedules. |
| Operating hours narrower than the standard profile | Effective hours are reduced consistently in UI and both backend validators. |
| Unauthorized or out-of-scope editor; direct invalid API write | Existing access restrictions preserved; invalid writes rejected server-side. |
| Single/bulk assignment, grid edit, conflict move, room transfer | Same availability decision; no override bypass. |
| Linked meetings or a field course | Every meeting checked; independent field and course restrictions still apply. |
| Assignment completion or submission after availability changed | Revalidate current availability; block invalid assignments even if a prior preview passed. |
| Browser refresh, cancel, save failure, repeat save | Saved mode survives refresh; cancel persists nothing; errors preserve draft; repeated identical save has the same outcome. |

Extend the existing PHPUnit and Vitest suites rather than adding a new test framework. Update tests that currently assert unrestricted empty part-time availability or ignored full-time windows. Check exact boundaries, API payloads, permissions, cache freshness, snapshot changes, and concurrent assignment/availability edits. Run frontend build and scoped lint, then verify the rendered standard/custom flow with keyboard and mobile-width checks before acceptance.

## Source references

Frontend:

- [Instructor form](../../src/pages/shared/Faculty.tsx).
- [Availability panel](../../src/components/faculty/FacultyAvailabilityPanel.tsx), [editor](../../src/components/faculty/FacultyAvailabilityEditor.tsx), and [response types](../../src/components/faculty/facultyAvailability.ts).
- [Shared coverage helper](../../src/lib/availabilityWindows.ts), [scheduler availability checks](../../src/pages/ClassSchedules/SchedulerPanel/hooks/useConflict.ts), and [instructor assignment](../../src/pages/ClassSchedules/InstructorAssignment.tsx).
- [Current frontend availability tests](../../src/pages/ClassSchedules/SchedulerPanel/hooks/partTimeAvailability.test.ts).

Backend, in the sibling checkout:

- [Availability API](../../../backend/app/Http/Controllers/Faculty/FacultyAvailabilityController.php), [faculty management](../../../backend/app/Http/Controllers/Faculty/FacultyController.php), and [availability model](../../../backend/app/Models/FacultyAvailability.php). The model exposes `day_index` through a `day`-column accessor/mutator; do not assume a new physical `day_index` column is required.
- [Rule implementation](../../../backend/app/Services/Scheduling/Engine/Rules/InstructorAvailabilityRule.php) and [snapshot constraint implementation](../../../backend/app/Services/Scheduling/Engine/Constraints/Families/InstructorAvailabilityConstraints.php).
- [Snapshot builder](../../../backend/app/Services/Scheduling/Support/SchedulingSnapshotRepository.php), [policy](../../../backend/app/Services/Scheduling/Support/SchedulingPolicy.php), [institution defaults](../../../backend/app/Models/InstitutionSetting.php), and [generation solver](../../../backend/app/Services/Scheduling/Engine/CspSolver.php).
- [Instructor management tests](../../../backend/tests/Feature/InstructorManagementTest.php), [engine parity tests](../../../backend/tests/Feature/EngineParityMatrixTest.php), and [continuous-window parity tests](../../../backend/tests/Feature/ConflictDetectionParityTest.php).
