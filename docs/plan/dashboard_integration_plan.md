# Dashboard integration plan: VPAA, Dean, and Secretary

Prepared: 2026-10-30. Status: **Phases 1–2 implemented in source and covered by unit/component tests; Phase 3 partly implemented; authenticated UI verification and backend-owner contract confirmation outstanding.** See [Implementation record](#implementation-record-2026-10-30).

Related assessment: [Dashboard role review](reports/dashboard_role_review.md). Existing rules: [architecture](architecture.md), [business rules](business_rules.md), and [coding standards](coding_standards.md).

## Outcome and boundaries

Make each dashboard a reliable starting point for that role's next action. Use the existing components, data clients, approval workflow, scheduling workspaces, capabilities, caching, and live-update mechanisms. Fix hidden work and misleading summaries before simplifying presentation.

This plan covers frontend integration and identifies backend verification dependencies. The backend is outside this checkout. Endpoint references below are existing frontend calls, not claims that their complete server behavior was verified. No new API route, database column, permission, deadline, or approval transition is assumed.

Implementation should not add dashboard-side approve/reject/submit mutations, a second conflict engine, a new chart library, a configurable widget framework, or a new analytics service. Shared components should be removed only if every consumer has been checked. Program Head reuses the Secretary page and must retain its program scope and restricted navigation.

## Target content and order

| Position | VPAA | Dean | Secretary |
| --- | --- | --- | --- |
| 1. Context | Active semester; pending decisions; data status | Active semester; departmental review context; data status | Active semester; specific next action; concurrent-work context; data status |
| 2. Compact metrics | Decisions awaiting you; approved sections / total, with approved-department count as secondary text | Pending review requests; forwarded sections / total; returned sections when relevant | Sections still to draft; returned sections; eligible instructor assignments, each shown when relevant; maximum three |
| 3. Main queue | Pending schedule and room-transfer decisions; request type, department, affected scope, stage-entry age, override | Pending schedule and room-transfer reviews; request type, program/scope, submitter, stage-entry age | Actionable returns, room recovery, preparation failures, eligible instructor assignments, delegated work, and permitted received borrowing requests |
| 4. One progress breakdown | Department progress, attention first | Program progress, attention first | Year-level/workflow counts with preparation checks available on expansion |
| 5. Conditional detail and links | Verified workload/rule exceptions; Calendar, Reports | Verified exceptions; Schedules, Instructors, Facilities, Reports | Relevant issue detail; Schedule Management, Instructor Assignment, Cross-Department, Room Requests |
| 6. Optional preview | Collapsed timetable; load on demand | Collapsed departmental timetable; load on demand | Collapsed timetable; load on demand |

The queue provides detail for the summary, so repeating its total is acceptable. Do not retain a second donut or resource-statistics panel for the same facts. Display a bounded preview of long queues with a clear total and View all; do not make unseen pending work look absent. Do not introduce arbitrary institutional alert thresholds.

## Metric and state contract

These definitions are proposed presentation rules. Existing API payload names and workflow enums remain unchanged. Confirm complete populations with the backend owner before deriving an exact metric from a list that may be capped.

| Measure | Definition and unit | Ownership / guard |
| --- | --- | --- |
| Pending decisions | Distinct actionable request/slice identities for the user's review stage; split into schedule requests and room transfers | Share selection with the approval workspace. Affected sections and transfer meetings are separate metadata, not additive counts. |
| Drafting remaining | Required active-semester sections still in draft, excluding separately displayed returns | Reuse department status facts. The hook's `draft` count currently includes `revision`, so subtract returns for mutually exclusive displays. |
| Returned sections | Unique sections with current returned/revision work | Show source reviewer/reason only when known; do not assume Dean was the rejecting role. |
| Forwarded by Dean | Sections cleared by Dean, including conditional approval, with final approval distinguishable | Map existing section/submission statuses; retain override metadata. |
| VPAA approval progress | Unique approved sections / required sections in the same semester and authorized scope | Submission records describe approval lifecycle. Schedule statuses such as `faculty_assignment`, `reassignment`, and `finalized` are operational descendants; reuse existing mappings. |
| Instructor assignments due | Authorized, currently assignable meetings without an instructor; finalized/locked work is excluded | Reuse assignment eligibility and teaching-department/program rules. Label as meetings until assignment-group identity is verified. Unapproved rows do not count as due now. |
| On-site meetings without rooms | Eligible on-site meetings with no physical room assigned | Online/field meetings do not require physical rooms. Missing data yields unknown, not zero. |
| Received borrowing requests | Pending requests owned by the user's department that they may review | Reuse Room Requests ownership and `room.review_requests`; destination access must also satisfy its existing capability gates. |
| Workload exception | Basic-load overload versus permitted-ceiling exceedance, per active instructor | Reuse `loadBandsOf`/`loadLevelOf`, including deload and overload allowance; align with Faculty's source/population. |
| Open conflict/rule issue | Distinct current issue IDs from the established scoped APIs | Keep conflict pairs, rule issues, affected meetings, and recovery cases distinguishable; never sum overlapping categories into a misleading total. |
| Waiting age | Time since this request entered this user's stage | Dean: submitted time. VPAA: Dean-review/handoff time when present, otherwise explicitly qualified fallback. Multiple requests keep separate ages. Unknown time stays unknown. |

### Mixed states and preparation checks

Do not replace the department with a single highest stage. A section under revision can coexist with another awaiting VPAA approval and another eligible for instructor assignment. Build the queue from current actionable scopes and show counts for work still under review.

The context action should open the highest-priority actionable category without hiding other categories. Suggested display order is recovery/returned work, incomplete preparation, then eligible assignment work; requests within a review queue use stage-entry age. This is UI ordering, not a new validation rule or approval policy.

Retain missing-Dean guidance and preparation checks. Do not present `canSubmit` as a complete course/contact-hour/conflict validator. Avoid counting Dean presence both inside a stage-completion check and as an independent readiness point. Actual submission continues to use the existing workflow and fresh server validation. Instructor assignment remains a separate post-VPAA phase.

### Loading, freshness, and completeness

Each data-dependent block needs a known state: loading, current, saved/stale, partial, unavailable, or no active semester. Use existing connection/cache warnings where possible and track last successful retrieval per source. `generated_at` from VPAA insights applies to that response only; it is not a freshness certificate for approvals or department status.

Do not show "nothing to do," "all approved," "no rooms," "ready to submit," or "no conflicts" while a required source is unknown or failed. Preserve readable saved values with a stale notice. A secondary insight failure must not block an independently loaded approval queue. Missing department/semester context must not broaden a dashboard's intended scope.

Use explicit server completeness/truncation signals where available. VPAA currently infers its preview limit from row length, Dean retains `schedules_truncated`, and Secretary does not retain it. A capped calendar can be labelled as a preview; exact totals must come from verified complete status/aggregate sources. Do not solve incomplete counts by downloading every meeting.

## Existing integration points

| Existing source | Current consumer / reusable behavior | Integration limitation to resolve |
| --- | --- | --- |
| `GET /initial-data` with existing parameters | All dashboards; shared approval workspace | Verify semester/department/program scope and completeness of sections/submissions independently of capped schedules. Explicit program metadata already appears in approval types; do not infer program identity from section names. |
| `GET /departments/{id}/schedule-status` | `useDepartmentScheduleStatus` | Verify normalized section stages, active-semester population, and delegated pending count. Coordinate loading/error state with each dependent summary. |
| `GET /vpaa/dashboard-insights` | VPAA; typed by `vpaaInsights.ts` | Verify semester, denominator, and metric population before reusing coverage. Show local failure state rather than empty insight defaults. Move detailed utilization to Reports. |
| `GET /room-recovery/transfers` | Unified `ScheduleApprovalPage` | Reuse stage selection and authorized scope; verify complete list/count behavior. Keep identities distinct from schedule submissions. |
| `getRecovery()` / `GET /room-recovery` | `RoomRecoveryAlerts`, Schedule Management | Preserve recovery links and reasons. Consolidate display without losing current recovery behavior or treating a case count as a meeting count. |
| `fetchRoomRequests()` | `src/lib/roomRequests.ts`, Room Requests page | Reuse received/owner scope and reviewer capability. Borrowing approvals remain separate from Dean/VPAA transfer decisions. |
| `fetchConflicts()` / `fetchRuleIssues()` | `src/lib/conflicts.ts`, established scheduling workspaces | Verify permitted scope, complete population, and an existing destination before surfacing counts. Avoid loading unbounded conflict lists for an overview. |
| `approvalQueue.ts`, `vpaaOverview.ts`, `scheduleStatus.ts` | Existing status and approval helpers | Reuse partial-withdrawal handling and operational status descendants. Reconcile overlapping mappings narrowly; do not invent a replacement state machine. |
| `facultyLoad.ts` | Faculty and dashboard calculations | Reuse existing load tiers; ensure required fields are available before claiming an allowed-ceiling violation. |
| `dataCache`, `cacheGroups`, `useLiveRevision`, `liveUpdates` | Existing cache and event system | Preserve scoped keys; refresh affected sources on relevant events, including semester/context changes. Test invalidation, not only subscriptions. |

If these sources cannot provide complete, correctly scoped counts, request the smallest extension to an existing backend read contract with its owner. Any additional summary fields must be explicitly documented and tested before frontend use. A new dashboard endpoint is not a prerequisite or an assumed existing route.

## Implementation phases

### Phase 0 — Confirm the contract and capture a baseline

Owner: frontend, with backend owner for API verification.

1. Preserve the current working tree and isolate dashboard changes from ongoing work. Do not reset existing edits.
2. Capture authenticated VPAA, Dean, and Secretary screens when browser access is available; include empty, mixed-stage, and pending-transfer examples. Keep screenshot evidence separate from mock fixtures.
3. Confirm source completeness, stage meanings, scope, permitted instructor assignment, and faculty load fields. Resolve documentation/implementation differences rather than assuming new business rules.
4. Record the agreed metric definitions above and choose supported detail destinations.

Exit: an explicit source and unit for every proposed visible count. Current source baseline: 26 existing dashboard tests pass; no accepted authenticated screenshots yet.

### Phase 1 — Correct missing and misleading work

Owner: frontend; backend participation only for confirmed response gaps.

1. Derive pending schedule/transfer decisions from the same selection rules as the shared approval workspace. Use request identities and active section slices.
2. Replace Secretary's maximum-stage selection with per-scope actionable facts. Handle concurrent drafts, returns, reviews, and assignment work.
3. Include conditional Dean approval consistently and preserve override reasons. Correct request-age aggregation and replace name-based program identity where explicit metadata exists.
4. Apply instructor assignment eligibility/teaching scope. Correct workload tiers with existing helpers and verified fields.
5. Represent unavailable, partial, stale, and missing-context data explicitly. Do not infer successful readiness from defaults.

Exit: F1–F3 cannot produce a false "no work" or whole-department completion claim; F4–F6/F8 counts agree with the relevant workspace for the same source fixture and scope.

### Phase 2 — Consolidate each dashboard's content

Owner: frontend.

1. VPAA: merge approval-progress cards, retain the decision queue and department breakdown, make exceptions conditional, and move resource details to Reports.
2. Dean: retain pending/forwarded/returned summaries, merge progress into one program table, and use the unified review queue.
3. Secretary: make its queue primary; merge readiness/section distribution/milestones into one compact progress area. Integrate permitted borrowing work and preserve recovery context.
4. Remove duplicate status donuts and detailed room/workload panels from these page compositions. Preserve shared components for other consumers.
5. Keep the existing timetable destinations and optionally render the shared preview only after expansion. Match skeletons to the final content.

Exit: each role has at most three headline metrics, one main queue, one progress breakdown, and conditional details. Every removed panel has either a retained essential fact or an existing destination.

### Phase 3 — Finish navigation and refresh integration

Owner: frontend.

1. Review actions open the selected request or an appropriately filtered queue. Reuse `room_transfer` detail selection, which already exists. Implement and test schedule-submission selection in the destination before using a new parameter.
2. Use the existing role/capability routes: VPAA `/schedules/approval`, Dean `/dean/schedules/approval`, and Secretary's Schedule Management, Instructor Assignment, Cross-Department, Room Requests, and Schedule History routes.
3. Correct the Secretary history label/destination. Preserve semester and scope where supported; do not silently invent unsupported filters.
4. Validate cache invalidation for schedules, approvals, assignments, room changes, sections, department/user context, and semester settings. Existing event topics and cache groups should handle refresh; extend only the missing mapping.
5. Keep summary/detail requests bounded and reuse cached results. Do not introduce a second polling loop or a new data-fetching library for these dashboards.

Exit: following a queue item reveals the intended work, Back preserves usable context, and returning after a successful workflow action updates the corresponding count.

### Phase 4 — Verify and release in small changes

Owner: frontend/QA; backend owner for server authorization and response guarantees.

Use separate reviewable changes for correctness, content consolidation, and navigation/refresh where practical. Do not merge unrelated working-tree changes. Re-run focused tests while editing; run `npm run lint` and `npm run build` for implementation changes and broader tests when shared behavior changes. Record unrelated baseline failures separately.

Release role-by-role after shared correctness is verified. Rollback restores only the introduced dashboard commits; existing mutation endpoints, history, and workflows remain the authority. No database migration is planned. Update this plan and the review with implementation evidence when phases actually complete.

## Likely files affected during implementation

| Area | Existing files | Expected change |
| --- | --- | --- |
| Role pages and tests | `src/pages/vpaa/VpaaDashboardPage.*`, `src/pages/dean/DeanDashboardPage.*`, `src/pages/secretary/SecretaryDashboardPage.*` | Correct source use and summaries; consolidate panels; test role scenarios. |
| Approval selection/navigation | `src/lib/approvalQueue.ts`, `src/lib/vpaaOverview.ts`, `src/pages/shared/ScheduleApprovalPage.tsx` and tests | Reuse queue rules, preserve request identity, correct age, support focused review. Extract only logic actually shared by consumers. |
| Status/load/data boundaries | `src/hooks/useDepartmentScheduleStatus.ts`, `src/lib/scheduleStatus.ts`, `src/lib/facultyLoad.ts`, existing room/conflict clients | Narrow reuse and explicit state; preserve API contracts and policies. |
| Shared presentation | `src/components/dashboard/Analytics.tsx`, `Ledger.tsx`, `src/components/vpaa/DashboardPrimitives.tsx`, `src/components/ui/DashboardSkeleton.*` | Reuse current tokens, panels, labels, and focus behavior; change shared APIs only when necessary. |
| Refresh | `src/lib/cacheGroups.ts`, `src/lib/liveUpdates.ts`, relevant tests | Correct only verified missing invalidation/context behavior. |
| Shared Secretary consumer | `src/pages/program_head/ProgramHeadDashboardPage.tsx`, Program Head navigation/routes | Regression verification; no separate redesign requested. |
| Documentation | This plan, role review, `docs/plan/DASHBOARD.md` | Record agreed definitions and phase evidence. Update stable business rules only if they actually change. |

## Acceptance and verification matrix

| Scenario | Required result |
| --- | --- |
| No pending schedule submission, one pending transfer | VPAA/Dean dashboard shows the decision; request type and correct review destination are clear. |
| One approved section, one returned, one draft, one under review | Secretary shows concurrent work; it does not declare all submission work complete or count unapproved meetings as assignable. |
| Conditional Dean approval / override | Counts as forwarded and waiting for VPAA; override remains visible and is not final approval. |
| Multiple submissions in one department/program | Separate request identities and correct stage-entry ages; genuine oldest pending request remains visible. |
| Partial withdrawal, resubmission, or changed revision | Active/recalled scopes match shared approval behavior; no double counting. |
| Linked/split meetings | Row counts say meetings; any class/group count matches an existing verified domain identity. |
| Approved work still needs instructors | Only authorized eligible work is due; delegated teaching scope is preserved. Finalized/locked work is not advertised as assignable. |
| Basic load 18, allowed overload 6, assigned 21 | Overload is distinguishable from Over Limit; assigned 25 exceeds the 24-unit ceiling. |
| No active semester, missing department, or wrong scope | Clear context state; no broad all-semester/all-department fallback. Server rejects unauthorized reads/mutations in backend verification. |
| Insights/status/transfer/conflict source fails or returns partial data | That block shows unavailable/partial/stale state; other loaded blocks work; no false zero or all-clear. |
| Meeting preview reaches its cap | Preview labelled correctly; exact totals come only from verified complete sources. |
| Online/field meetings and missing physical rooms | Only on-site meetings require rooms; virtual room placeholders stay outside physical-room inventories. |
| Pending received borrowing request | Appears only for an authorized owner reviewer with destination access; it is not mixed into Dean/VPAA transfer counts. |
| Semester activation, department/user change, or live workflow update | Old scope data does not leak into current metrics; relevant cache entries refresh. |
| Read-only account / Program Head consumer | No unauthorized action controls; established program scope and restricted navigation are preserved. |
| Keyboard, screen reader, narrow viewport, and 200% zoom | Main queue precedes secondary detail; labels, focus, counts, errors, and expandable content remain understandable and operable. |

Initial evidence command:

```powershell
npm test -- src/pages/vpaa/VpaaDashboardPage.test.tsx src/pages/dean/DeanDashboardPage.test.tsx src/pages/secretary/SecretaryDashboardPage.test.tsx --maxWorkers=1
```

Baseline result on 2026-10-30: **3 files passed; 26 tests passed**. Add targeted regression cases for the scenarios above during implementation. Current passing tests do not establish real API completeness, browser accessibility, or absence of the identified mixed-state issues.

## Completion criteria

All three roles can identify their next action from the main queue; dashboard request totals reconcile with their established workspaces; unknown/partial data is explicit; duplicate distributions are removed; detail links carry supported context; and the verification matrix has recorded evidence. The remaining prerequisite for visual sign-off is authenticated capture and interaction testing for each role.

## Implementation record (2026-10-30)

### Contract checks (Phase 0)

The backend checkout was read (not modified) to confirm the sources used. `GET /initial-data` returns active-semester sections with an explicit `program` relation, submissions with `sections.program` and `submitter`, `schedules_truncated`, and faculty rows carrying `max_units`, `deload_units`, `overload_units`, `assigned_units` and `status`. `GET /room-recovery/transfers` is scoped by the server (Dean: own department; Program Head: own requests; VPAA: excludes Dean-stage and Dean-rejected plans) and is not semester-filtered. `GET /departments/{id}/schedule-status` returns active sections in the active semester and derives `faculty_assignment`, `reassignment` and `finalized` as `approved`. Live responses were not exercised.

### What changed

| Area | Change |
| --- | --- |
| Shared logic | `src/lib/dashboardQueue.ts`: pending request identities for Dean/VPAA built from `splitSubmission` (a partial withdrawal is one active slice) plus pending room transfers; stage-entry age (Dean: submitted; VPAA: Dean handoff, flagged approximate when it falls back to submission time); oldest-first sort with unknown times last; transfer detail link through the existing `room_transfer` parameter. `facultyLoad.ts`: `workloadExceptions()` uses `loadLevelOf` (deload and overload allowance) over active instructors. `vpaaOverview.ts`: the department rollup now keeps the **oldest** pending handoff. |
| Shared UI | `components/dashboard/RequestQueue.tsx` (bounded preview with total, override reason, revision, age; an incomplete-source note replaces the empty all-clear). `RelatedLinks` in `Analytics.tsx`. `DashboardSkeleton` role variants now mirror context + 3 KPIs + queue + breakdown. |
| VPAA | KPIs: Decisions awaiting you (schedule + transfer requests), Sections approved (fully approved departments as secondary text), Over workload limit (overload within limit as secondary text). Queue: schedule and transfer requests. Breakdown: department progress, attention first. Removed: duplicate approval KPIs, status donut, faculty-load panel, room-use panel, timetable preview and the `/vpaa/dashboard-insights` request; links to Calendar and Reports. |
| Dean | KPIs: Awaiting your review (requests), Forwarded to the VPAA (includes conditional approval; override count and final approvals shown separately), Returned for revision. Queue: pending submissions (explicit program, real submitter, section names) and pending transfers. Breakdown: program progress by `section.program`, not section-name parsing. Over-limit instructors appear as a conditional note. Removed: drafted KPI, donut, workload panel, timetable, room usage; links to Schedules, Instructors, Facilities, Reports. |
| Secretary / Program Head | No single maximum stage: the context lists concurrent counts and acts on the most urgent category (returned → drafting → ready to submit → instructor assignment → under review). Up to three KPIs chosen from Sections to draft (excludes returns), Returned sections, Instructor assignments due, Under review, Sections approved. Assignment counts include only `approved`/`faculty_assignment`/`reassignment` meetings without an instructor, only with `schedule.assign_instructor`; finalized work is excluded. Missing rooms and incomplete entries count only meetings still in preparation. Received pending borrowing requests appear only for a Secretary with `room.request` and `room.review_requests`. Queue rows open Instructor Assignment, Cross-Department, Room Requests or Schedule Management. Preparation checks are expandable guidance with the Dean counted once. "View history" now opens Schedule History. Program Head keeps `/program_head/*` routes and gets no Room Requests link. Removed: donut, milestone track, readiness KPI, instructor-load and room-assignment panels, timetable preview. |
| Data states | No department, no active semester and a failed first load render an explicit context state without figures. Failed transfer, borrowing or schedule-status sources show an inline notice, dashes instead of zeros, and no "nothing to do" message. Truncation is retained for Dean and Secretary; Secretary suppresses unscheduled-section counts when truncated. |

### Verification results

Results for the implementation as completed at about 18:35 on 2026-10-30:

- New and updated tests: `src/lib/dashboardQueue.test.ts` (8), `VpaaDashboardPage.test.tsx` (12), `DeanDashboardPage.test.tsx` (9), `SecretaryDashboardPage.test.tsx` (12), `DashboardSkeleton.test.tsx`: all passed. Baseline was 4 files, 38 tests.
- Watched failing against the old behavior: the rollup oldest-handoff test; mutation checks confirmed the Secretary eligible-assignment test and the VPAA pending-transfer test fail when those fixes are removed. The other page tests were written with the rewrite and were not run against the previous pages.
- `npx tsc --noEmit -p tsconfig.app.json`: passed.
- `npm run build`: passed (baseline also passed).
- `npm run lint`: fails with 1074 problems (1046 errors, 28 warnings), the same count as the pre-change baseline. None are in the dashboard files touched here; all are pre-existing elsewhere in the repo.
- Full `vitest run`: the runner crashed with `ERR_IPC_CHANNEL_CLOSED` at both 2 workers and 1 worker. Before the crash, 137 of 139 test files passed. `YearLevelGenerateScheduleWorkflow.test.tsx` had 1–2 timeout failures that changed between runs; it imports no file changed here. `GanttDepartmentLogos.test.tsx` was not reported before the crash.

**Concurrent change after verification:** between 20:13 and 20:20 the three dashboard pages and `Analytics.tsx` were edited outside this work, with a new `WeekGlance.tsx`. The edits added `KpiStrip` with four KPIs, `StageRows`, and a compact `StatusDonut` again. With those edits, seven of the page tests above fail: the three-KPI limit, removed labels, and the preparation checks. Type-check still passes. Before this plan can be marked complete, someone needs to decide which version to keep. Then reconcile the tests, or the layout rules in this plan, with that choice.

### Remaining work and backend dependencies

- **Schedule-submission focus:** `ScheduleApprovalPage` accepts only `room_transfer`; schedule rows open the pending queue. A submission parameter needs destination support and tests before use.
- **Room Requests focus:** the page has no parameter that opens the received-requests view; the dashboard opens the page.
- **Room recovery:** `RoomRecoveryAlerts` is unchanged and still renders above the Secretary dashboard rather than as queue rows.
- **Transfers by semester:** the server does not filter transfers by semester. The dashboard matches the approval workspace (all pending transfers) and labels a transfer from another semester.
- **Completeness:** Secretary `/initial-data` uses the server's default schedule cap; meeting-derived counts are labelled possibly low when `schedules_truncated` is set. An exact count needs an aggregate field agreed with the backend owner.
- **Conflicts/rule issues:** not surfaced; no bounded, scoped count source was verified.
- **Unused components:** `FacultyLoadPanel`, `MilestoneTrack`, `submissionStage.ts` and `InstructorWorkloadChart` no longer have dashboard consumers. They were left in place (some hold uncommitted work) pending a separate cleanup decision.
- **Authenticated UI:** see the 2026-10-30 layout revision below for the rendered checks performed. Visual layout, narrow viewport/200% zoom, keyboard and screen-reader checks remain required.

### Layout revision (2026-10-30)

A compact admin layout (TailwindAdmin, then Tabler/shadcn as reference) replaced the three-KPI ledger. Calculations, permissions, approval routing and live refresh are unchanged; this supersedes the KPI, panel and "Removed" lists in the table above where they differ.

| Area | Current layout |
| --- | --- |
| Shared UI | `KpiCard` carries a tinted icon tile (tone on the tile and status line), in `KpiStrip` (2 columns, 4 from `xl`). Panel titles use DM Sans; Playfair stays on the page title. `StageRows` compares groups as stacked bars with per-stage counts. `DistributionWithGroups` puts a `StatusDonut` beside those rows in one full-width card, so unrelated cards no longer stand side by side at mismatched heights. `WeekGlance` is a meetings-per-hour preview from the department's own meetings and `time_grid`. |
| VPAA | KPIs: Decisions awaiting you, Sections approved, Departments complete (of departments with sections), Returned for revision. Then the decision queue (full width), Institution status (donut + department rows; departments without sections folded into one line), and Room use beside Exceptions to watch (over limit, overload within limit, Dean overrides awaiting you, departments still drafting). Room use reads `/vpaa/dashboard-insights` with its own unavailable state and retry, never an empty-insights fallback; one bar colour, because no utilization threshold is an agreed limit. `coverage.classes_without_room` is not shown: the server counts online classes too. |
| Dean | KPIs: Awaiting your review, With the VPAA (override count as status), Returned for revision, Approved by the VPAA. Then the review queue (full width) and Department status (donut + program rows). The over-limit note stays with the links. |
| Secretary / Program Head | Four fixed KPIs: Sections drafted, Under review, Approved by the VPAA, Instructors assigned (assigned of approved meetings; needs `schedule.assign_instructor`). The task list sits beside Submission readiness while sections are still being prepared, and spans the row otherwise. Week at a glance sits beside progress by year level (stacked bars). |
| Verification | Rendered against the local backend at 390, 1024 and 1440px for all four roles (Dean, Secretary and Program Head presented as CIT accounts over VPAA-readable data), plus a browser-only busy-state rewrite. No horizontal overflow. Screen-reader and 200% zoom checks remain outstanding. |

