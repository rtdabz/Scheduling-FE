# Action visibility review - 2026-11-14

No additional instance of the missing **Add Instructor** regression was confirmed.
The restored VPAA action and its availability-control restriction remain covered by tests.

## Scope and method

- Inspected 230 production TSX files under `src/pages` and `src/components`.
- Compared existing changes with HEAD for creation and management controls, including text, icon-button labels, links, and handlers.
- Traced creation/edit modes, dialog openers, shared-component callers, navigation, route guards, backend routes, and role defaults.
- Checked all five roles: VPAA, Dean, Secretary, Director, and Program Head.

## Findings

| Area | Result |
| --- | --- |
| Instructors | Add Instructor is available to VPAA in List and Grid, including when a search returns no instructors. Creation clears prior edit state and uses the existing POST endpoint. |
| Instructor availability | VPAA details offer neither Add window nor Edit added windows. Secretary, Director, and Program Head retain their capability-based controls; Dean remains read-only. |
| Accounts | Add User and its creation form are connected, including the Director role and teaching-profile choices. |
| Departments and programs | Add Department, Add Program, and program management remain connected. |
| Facilities | Add Building and Add Room remain available to VPAA; existing room-editing and availability controls pass their role/view checks. |
| Designations | Add Designation remains connected. The former direct Add Sub-designation controls moved into the Sub-designations manager; creation through that manager works in both List and Grid. |
| Sections and curriculum | Add Section and authorized curriculum creation/import remain connected. VPAA/Dean curriculum review and the curriculum-derived Courses list intentionally have no independent creation actions. |
| Scheduler and navigation | Apparent unconnected section-dropdown, room-dialog, and print setters are exported by the scheduler hook and opened by consuming components. Director navigation preserves Secretary features. |

The VPAA availability change controls the instructor-details UI. Backend availability writes retain their existing capability-based authorization.

## Verification

- 88 frontend tests passed across 11 suites covering instructor actions, accounts, departments, rooms, designation creation, curriculum, sections, navigation, capability checks, and direct route access.
- Two initial frontend checks exceeded the five-second limit during a parallel run. Both passed when their suites were rerun with one worker and a fifteen-second limit; no production changes were needed.
- 36 backend tests passed with 224 assertions: `InstructorManagementTest`, `RoleOperationAuthorizationTest`, and `RoleCapabilityDefaultsTest`. They ran against an in-memory SQLite database.
- Added coverage for every instructor role, empty List/Grid creation, and designation creation through the relocated manager.
- TypeScript checking, scoped ESLint on the changed tests, and diff whitespace checks passed.

## Changes and limits

This review expanded [instructor regression coverage](../../../src/pages/shared/Faculty.cache.test.tsx) and added [designation action coverage](../../../src/pages/shared/Designations.actions.test.tsx). No additional production fix was required.

This was a source review plus automated component/API checks. It does not establish that every screen, viewport, and interaction has been exercised in a running browser.
