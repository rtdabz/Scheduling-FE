# VPAA, Dean, and Secretary dashboard review

Review date: 2026-10-30. Status: findings F1–F8 addressed and F9 partly addressed in source on 2026-10-30; see [Implementation status](#implementation-status-2026-10-30). Authenticated UI verification is still outstanding.

## Recommendation

Give each dashboard one primary responsibility: **VPAA decides**, **Dean reviews**, and **Secretary prepares and follows up**. Keep a short summary, one actionable queue, and one breakdown relevant to that responsibility. Move detailed timetable browsing, room statistics, workload distributions, and history to their existing workspaces.

Some repeated information is useful. A pending-request total followed by the requests that make up that total supports a decision. Showing the same approval distribution as cards, a donut, and progress panels adds little. Likewise, displaying a department's progress to both its Dean and the VPAA is appropriate because their scope and next actions differ.

Fix inaccurate or incomplete summaries before removing panels. A shorter dashboard must still reveal every category of work the user can act on.

## Scope and evidence

Reviewed the current working tree, including existing uncommitted dashboard changes. Sources include the three dashboard pages, their tests, approval and instructor-assignment workspaces, room recovery and borrowing flows, shared status/load helpers, routing, caching, and the current architecture/business-rule documentation.

This is a **source-based functional and information-architecture review**. The in-app browser reached the sign-in page. The existing Chrome window was minimized, and Windows browser control then stopped because it could not reliably identify the current browser URL. No dashboard screenshots were accepted. Visual layout, responsive behavior, contrast, keyboard operation, and real authenticated API responses remain unverified. No backend checkout or production data was reviewed; API behavior described below is what the frontend consumes, rather than an independently verified server implementation.

Existing baseline checks passed: **3 dashboard test files, 26 tests**. These tests establish current behavior; they do not cover every finding below.

## Role responsibilities

| Role | Primary question | Scope | Primary destination |
| --- | --- | --- | --- |
| VPAA | What needs my final decision, and which departments need follow-up? | Institution, active semester | Schedule Approval; department progress |
| Dean | Which submissions need departmental review, and what has been returned? | Assigned department and its programs, active semester | Department Schedule Approval |
| Secretary | What can I finish, correct, submit, or assign now? | Authorized departmental work, active semester; teaching assignments may cross department ownership | Schedule Management, Instructor Assignment, Cross-Department, room workflows |

Preserve capability checks and server authorization. A role name alone does not authorize an action. Keep timetable preparation separate from instructor assignment: the current workflow opens instructor assignment after VPAA approval. Approval is also distinct from finalization.

## Current content and decisions

### 1. VPAA

Current implementation: five KPI cards and six main panels. Its approval queue and institution-level scope are useful foundations.

| Current content | Decision | Recommended treatment |
| --- | --- | --- |
| Semester context and Review approvals action | Keep | Add clear data freshness/error context; the action remains navigation to the established review workflow. |
| Awaiting your approval KPI and Waiting on your approval panel | Merge conceptually | One **Decisions awaiting you** summary and its request list. Include schedule submissions and pending room transfers. Show request totals separately from affected section/meeting totals. |
| Sections approved and Departments fully approved KPIs | Merge | One approval-progress card: approved sections / total, with fully approved departments as secondary text. These are different measures, so retain their labels. |
| Departments by approval | Keep, focus | One department progress table with pending stage, returned sections, and approval progress. Put departments needing attention ahead of completed ones. |
| Returned for revision KPI | Move into breakdown | Display returned counts beside the responsible department; use a conditional notice when follow-up is needed. |
| Approval status donut | Remove from default dashboard | The same stages belong in the department breakdown. Detailed distributions can remain in Reports. |
| Instructors over max load KPI and Workload exceptions | Merge, conditional | One exception summary with a short list when relevant; distinguish basic-load overload from exceeding the allowed ceiling. Open Instructors for detail. |
| Room use by building | Move to Reports | Keep a Reports link; show an exceptional issue only when its meaning and response are established. Current color thresholds are presentation heuristics, not verified institutional limits. |
| Master timetable and fullscreen browsing | Move behind Open master calendar | Preserve the existing calendar. An optional collapsed preview can remain after the main decision content. |

**Recommended default:** two permanent KPIs, a unified decision queue, department progress, and conditional exceptions. Avoid adding user totals, course totals, activity feeds, or general shortcut grids that repeat navigation.

### 2. Dean

Current implementation: five KPI cards and six main panels. The department scope, actual submitter names, and per-program visibility are useful.

| Current content | Decision | Recommended treatment |
| --- | --- | --- |
| Semester context and Review schedules action | Keep | Summarize actionable requests and returned sections without declaring the whole department complete from a partial result. |
| Awaiting your review KPI and Review queue | Keep as summary and detail | Count real pending requests, including room transfers; identify their type and affected scope. |
| Approved and forwarded KPI | Keep, correct | Include conditional Dean approval; keep final VPAA approval distinguishable in the breakdown. |
| Returned for revision KPI | Keep when relevant | Make returned sections visible with their program and the existing review reason when available. |
| Sections drafted KPI and Program completion | Merge | One program progress table: drafting, awaiting Dean, awaiting VPAA, approved, returned. Preserve the difference between drafted and approved. |
| Section status donut | Remove from default dashboard | Its information belongs in program progress. |
| Instructors over max load and Instructor workload | Conditional exceptions only | Workload becomes relevant to follow-up after assignment; replace the general heaviest-load list with correctly classified exceptions. |
| Room usage and classes per room | Move to Facilities/Reports | Room inventory usage does not establish an approval blocker. Review unresolved room issues through the relevant schedule or transfer. |
| Filtered timetable and fullscreen view | Move behind Open department schedules | Keep the existing schedule workspace and shared calendar components. |

**Recommended default:** at most three KPIs, one pending-review queue, one program progress table, and conditional exceptions. Keep room-transfer decisions in the same approval entry point as ordinary submissions.

### 3. Secretary

Current implementation: two to five dynamic KPI cards, up to seven panels, and conditional room-recovery alerts. Its actionable queue, capability checks, and post-approval assignment phase should be retained.

| Current content | Decision | Recommended treatment |
| --- | --- | --- |
| Semester context and next action | Keep, correct mixed-state handling | State which sections need action. A department can simultaneously have drafts, returns, items under review, and approved sections awaiting instructors. |
| Sections drafted and Drafting by year level | Merge | One progress breakdown by year level; use **Sections still to draft** as a compact KPI when preparation work exists. |
| Sections approved KPI, Section status donut, and Submission milestones | Merge | One compact workflow summary with stage counts. Show a full milestone track only for a selected submission with one coherent lifecycle. |
| Submission readiness KPI and full readiness checklist | Merge | Keep one expandable preparation checklist near the work queue. A dashboard estimate must not promise that server submission validation will pass. |
| Returned sections KPI and queue row | Keep when relevant | Useful summary and detail, provided the row opens the returned work. Do not label every return as coming from the Dean without source evidence. |
| Classes without instructors KPI and assignment row | Keep only for eligible work | Count only currently assignable, authorized meetings or verified assignment groups. Do not include draft/unapproved meetings in an actionable assignment count. |
| What's left to do | Keep as primary panel | Prioritize actionable returns, room recovery, preparation failures, and eligible instructor assignments. Include delegated teaching work separately. |
| Room and Laboratory Alerts | Keep, consolidate presentation | Preserve recovery reasons and links. If surfaced in the queue, do not also create a second unrelated headline for the same affected work. |
| Room assignment panel | Merge into queue | Keep missing on-site rooms as actionable work. Move room inventory totals, lab totals, and online/field totals to Facilities/Reports. |
| Instructor load panel | Move details to Instructors | Show a conditional workload exception only when it changes a current action. |
| Timetable preview | Optional collapsed preview or link | Continue drafting in Schedule Management; inspect broader schedules in the existing timetable workspace. |
| Incoming room-borrowing requests | Add conditionally to queue | Existing Room Requests supports owner review. Show pending received requests only when department ownership and the required review/navigation capabilities permit action. |

**Recommended default:** at most three actionable KPIs (drafting remaining, returns, eligible instructor assignments), one work queue, and one year-level/workflow breakdown. Hide irrelevant phase-specific cards. Keep approval progress inside the workflow breakdown rather than a separate permanent KPI.

## Prioritized findings

Priorities describe operational impact: P1 can hide required work or give a misleading readiness/completion message; P2 affects trust, navigation, or efficient use. These are source-confirmed behaviors or explicit contract-verification gaps, not claims of production incidents.

### F1 — P1: Dashboard approval queues omit room-transfer decisions

VPAA and Dean dashboards derive their queues from schedule submissions/section statuses. The shared approval page also loads `/room-recovery/transfers` and merges pending transfers into its queue. A dashboard can therefore say nothing is waiting while the approval workspace contains a transfer requiring that role's decision.

Integrate the existing transfer source and stage predicates into the dashboard queue. Count requests by identity and type; do not add meetings affected by transfers to section totals. Secretary borrowing requests are another existing actionable source missing from its main queue, subject to its separate owner-review permissions.

Evidence: [VPAA queue](../../../src/pages/vpaa/VpaaDashboardPage.tsx#L220), [Dean pending total](../../../src/pages/dean/DeanDashboardPage.tsx#L418), [unified approval page](../../../src/pages/shared/ScheduleApprovalPage.tsx#L289), [room-request owner review](../../../src/pages/shared/RoomRequests.tsx#L1195).

### F2 — P1: Secretary's single stage can hide concurrent work

`currentStage` selects VPAA approval if **any** section is approved, before considering returned, submitted, or draft sections. For example, one approved section plus one returned section produces an assignment-oriented summary and hides preparation content. It also enables the no-instructor count across all visible meetings, rather than only eligible approved work. Conditional Dean approval is included in the donut but omitted from this stage selection.

Derive next actions from the affected sections and their actual eligibility. Show concurrent counts; never say the department has completed submission because one section advanced. Preserve instructor assignment after VPAA approval.

Evidence: [stage, queue, and summary](../../../src/pages/secretary/SecretaryDashboardPage.tsx#L264), [assignment eligibility statuses](../../../src/pages/ClassSchedules/SchedulerPanel/types.ts#L26).

### F3 — P1: Unavailable or partial data can resemble a valid result

VPAA insights errors fall back to `EMPTY_INSIGHTS` without a local error state; Room use can then say no rooms are set up. Secretary does not retain an explicit schedules-truncated flag, while Dean does. Missing active-semester values also permit unfiltered schedule fallbacks. Independent status requests can finish after the dashboard starts presenting defaults. These are reasons to verify completeness, rather than evidence that the server returns unauthorized data.

Use loading, current, saved/stale, partial, unavailable, and no-active-semester states. Do not infer zero work, readiness, or all-clear from an unavailable dependency. Keep independent panels usable when a secondary request fails. Confirm complete aggregate sources before displaying uncapped totals; do not fetch unlimited meeting rows merely to count them.

Evidence: [VPAA insights error path](../../../src/pages/vpaa/VpaaDashboardPage.tsx#L170), [room-use empty state](../../../src/components/vpaa/BuildingUtilizationPanel.tsx#L38), [Secretary data contract](../../../src/pages/secretary/SecretaryDashboardPage.tsx#L46), [Dean partial-data notice](../../../src/pages/dean/DeanDashboardPage.tsx#L517).

### F4 — P2: Queue grouping and age can misidentify the work

Dean derives programs by stripping digits from section names and groups all sections of that inferred program into a "package." This is not a submission identity. Its latest submission is chosen by ID, and every Review button opens the general queue. VPAA groups requests by department; its rollup retains the **latest** pending handoff timestamp although the UI describes longest-waiting work. Multiple requests from one department can therefore obscure an older pending request.

Use submission ID, active section membership, revision, and explicit program metadata where provided. Reuse approval queue handling for partial withdrawals. Keep department/program grouping for progress, not request identity. Sort pending request rows by their actual stage-entry timestamp; unknown timestamps must not imply a fresh request. Do not turn the existing two/five-day display thresholds into an institutional service-level commitment.

Evidence: [Dean grouping](../../../src/pages/dean/DeanDashboardPage.tsx#L58), [Dean submission mapping](../../../src/pages/dean/DeanDashboardPage.tsx#L236), [VPAA handoff aggregation](../../../src/lib/vpaaOverview.ts#L140), [existing submission slicing](../../../src/lib/approvalQueue.ts#L34).

### F5 — P2: Conditional approval is not consistently treated as forwarded

Dean's readiness calculation counts `approved_by_dean` and `approved` as reviewed but puts `conditionally_approved` into a preparation/not-started branch. Secretary includes it in the stage distribution but not its main phase calculation. The shared approval workspace recognizes it as pending VPAA review.

Reuse the established status mappings, preserve the override indicator/reason, and reconcile section totals across summaries and queues. Do not create another workflow vocabulary or treat a conditional approval as final VPAA approval.

Evidence: [Dean readiness](../../../src/pages/dean/DeanDashboardPage.tsx#L210), [Secretary status distribution](../../../src/pages/secretary/SecretaryDashboardPage.tsx#L336), [approval mapping](../../../src/lib/approvalQueue.ts#L98).

### F6 — P2: Workload labels confuse basic load and allowed ceiling

The dashboards compare assigned units with `basicLoadOf(max_units, deload_units)` and describe exceedances as over the maximum/ceiling. The shared Faculty workspace also accounts for `overload_units` and distinguishes Overload from Over Limit. VPAA/Secretary dashboard collections additionally lack Dean's explicit active-instructor filter, so their "active" denominators depend on the API returning the expected population.

Reuse `loadBandsOf`/`loadLevelOf` with a verified faculty payload. Label basic-load overload separately from an exceeded permitted ceiling. Align active population, semester scope, and delegated-teaching load with the existing Faculty workspace.

Evidence: [load definitions](../../../src/lib/facultyLoad.ts#L41), [Faculty mapping](../../../src/pages/shared/Faculty.tsx#L193), [VPAA calculation](../../../src/pages/vpaa/VpaaDashboardPage.tsx#L265), [Dean calculation](../../../src/pages/dean/DeanDashboardPage.tsx#L287).

### F7 — P2: Repeated distributions compete with the main task

VPAA repeats approval progress across multiple KPIs, department progress, and a status donut. Dean repeats drafting/review information in cards, program completion, a queue, and a donut. Secretary repeats readiness and room/instructor gaps across cards and several panels. The component structure confirms repetition; its exact effect on users still needs authenticated observation or usability feedback.

Apply the content decisions above. Preserve summary-to-detail repetition when the detail supplies a useful next action. Remove whole extra presentations of the same distribution and keep detailed resource reporting in its existing module.

Evidence: [VPAA composition](../../../src/pages/vpaa/VpaaDashboardPage.tsx#L408), [Dean composition](../../../src/pages/dean/DeanDashboardPage.tsx#L529), [Secretary composition](../../../src/pages/secretary/SecretaryDashboardPage.tsx#L472).

### F8 — P2: Count units and readiness language need precision

Secretary's "classes" without instructors/rooms are counts of meeting rows; split or linked meetings can represent several rows for one assignment task. Its checklist proves neither complete course/contact-hour coverage nor full server validation. `canSubmit` checks Dean presence and year-level stage completion, and Dean presence is also displayed as a separate check. Calendar overlap highlighting is not an authoritative count of all scheduling conflicts.

Use "meetings" for row counts unless an existing domain grouping has been verified. Keep sections, requests, meetings, instructors, and departments separate. Present the checklist as preparation guidance, avoiding double-counted checks. Surface verified conflict/rule issues through existing clients when scope/completeness is established; never advertise "conflict-free" from a capped preview.

Evidence: [Secretary counters and checks](../../../src/pages/secretary/SecretaryDashboardPage.tsx#L222), [submission predicate](../../../src/hooks/useDepartmentScheduleStatus.ts#L159), [conflict client](../../../src/lib/conflicts.ts#L245).

### F9 — P2: Actions often reopen broad workspaces

Queue rows and several cards route to a general page without carrying the selected request or issue. Secretary's "View history" action opens Schedule Management. The unified approval page currently accepts `room_transfer` for a transfer detail; a schedule-submission detail parameter is not implemented there.

Reuse supported links immediately. Add and test narrowly scoped navigation for specific submissions/issues where needed; do not assume a query parameter already works. Keep the established review/confirmation screens responsible for mutations.

Evidence: [VPAA Review action](../../../src/pages/vpaa/VpaaDashboardPage.tsx#L524), [Dean Review action](../../../src/pages/dean/DeanDashboardPage.tsx#L618), [Secretary Submission action](../../../src/pages/secretary/SecretaryDashboardPage.tsx#L552), [transfer detail selection](../../../src/pages/shared/ScheduleApprovalPage.tsx#L732).

## Important information to add, with limits

| Information | Who needs it | Integration rule |
| --- | --- | --- |
| Pending room-transfer decisions | VPAA, Dean | Reuse the unified approval source, current stage, and authorized scope. |
| Pending received room-borrowing requests | Secretary with owner-review access | Reuse Room Requests; keep borrowing distinct from Dean/VPAA room-transfer approval. |
| Concurrent preparation, revision, review, and assignment work | Secretary; progress visible to Dean/VPAA | Per-section/request facts, rather than a single maximum department stage. |
| Override reason and request age | VPAA, Dean | Existing record metadata, with missing values shown as unknown. |
| Verified unresolved conflicts/rule issues | Responsible authorized user; scoped oversight for reviewers | Reuse existing conflict clients and destinations; verify population and deduplicate by issue identity. Keep separate from visual timeline overlaps. |
| Freshness, unavailable sources, and partial-data notices | All three roles | A failed source is not a zero; one successful source cannot certify another. |

Do not add deadlines, attendance, student enrollment, predictive risk scores, solver success rates, or resource pressure alarms without an established source and a real role-specific action. No evidence in this review establishes new business rules for those features.

## Accessibility and verification limits

Source strengths include labelled dashboard regions, keyboard-native buttons, chart text alternatives, textual stage labels, and shared focus styles. Preserve those when consolidating panels. Long labels currently use truncation/title attributes; important issue descriptions should remain readable without hovering. Changing a donut to a table/list must retain stage counts and meaningful reading order.

Authenticated screenshots and browser checks are still required for all three roles: desktop and narrow viewport, 200% zoom, keyboard focus/return from details, screen-reader names, status/error announcements, and contrast. No accessibility compliance claim is made from this source review.

## Delivery and next step

The companion [dashboard integration plan](../dashboard_integration_plan.md) defines metric ownership, existing data sources, implementation phases, affected files, acceptance checks, and rollout. Start with F1–F3 and shared status/load corrections, then apply the content consolidation. The report does not authorize changes to approval rules, permissions, or backend contracts.

## Implementation status (2026-10-30)

Implemented in source with unit and component tests; not yet observed against a live backend or in an authenticated browser. Details and remaining dependencies are in the integration plan's [implementation record](../dashboard_integration_plan.md#implementation-record-2026-10-30).

| Finding | Status | Notes |
| --- | --- | --- |
| F1 Transfers missing from queues | Done | VPAA/Dean queues include pending transfers as separate requests; a failed transfer load is shown, never treated as zero. Secretary shows received borrowing requests to owner reviewers only. |
| F2 Secretary single stage | Done | Concurrent counts and a priority-ordered next action; assignment counts limited to approved, unlocked meetings. |
| F3 Unavailable or partial data | Done for dashboard sources | Explicit no-department, no-semester, unavailable and partial states; the VPAA insights request was removed with the room-use panel. |
| F4 Grouping and age | Done | Request identities from submission slices; explicit program metadata; oldest handoff retained; unknown age shown as unknown. |
| F5 Conditional approval | Done | Counted as forwarded and awaiting VPAA, with override count and reason; never final approval. |
| F6 Workload labels | Done | `loadLevelOf` with overload allowance; over-limit separated from overload; inactive instructors excluded. |
| F7 Repeated distributions | Done | Each role: at most three KPIs, one queue, one breakdown; donuts, room statistics and timetables removed from dashboards. |
| F8 Units and readiness wording | Done | "Meetings" for row counts; checks are expandable guidance; Dean counted once. Conflict counts not added. |
| F9 Broad destinations | Partial | Transfers open their detail; assignment, delegated, borrowing and history rows open their modules. Schedule-submission and received-borrowing focus need destination support first. |
