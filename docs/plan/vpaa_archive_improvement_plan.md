# VPAA Archive: problems and improvement plan

Date: 2026-11-01  
Status: review and proposed plan; application changes have not been implemented.

## 1. Scope and evidence

Reviewed the current `/archive` frontend, its shared table and cache behavior, the Laravel archive endpoints, related model events, account-role rules, curriculum archival, semester history, and relevant tests and documentation.

The browser access host and native computer connection were unavailable. **This is a source and behavior review, not a completed visual UX audit.** No screenshots were captured. Actual layout, mobile behavior, contrast, focus movement, and screen-reader announcements still need browser verification.

Verification used the configured SQLite in-memory test database, not the application's working database:

- Existing focused backend checks: **36 tests passed, 196 assertions**.
- Temporary diagnostic probes: **3 tests passed, 8 assertions**, demonstrating audit-write failure behavior, a stale role-slot precondition, and restoration of an inactive account. These probes asserted current behavior to establish evidence; they do not mean those defects are fixed. The temporary file was removed afterward.
- The role probe inserted a competing holder between validation and restoration using a model event. This establishes the stale-precondition gap; it is not a real concurrent MySQL stress test.
- No application source files were changed for this review. Existing unrelated edits were left intact.

## 2. Problems identified first

Priorities: **P1** = correctness/integrity before redesign; **P2** = core recovery workflow; **P3** = usability and accessibility improvements. “Confirmed” below means reproduced in a diagnostic probe or directly established by the current implementation, not visually observed.

| ID | Priority | Problem and user impact | Evidence |
| --- | --- | --- | --- |
| A01 | P1 | **A restore can commit and then report failure.** Non-timetable restoration commits before writing its audit entry. If that write fails, the record is already restored, the request fails, and subsequent cache invalidation is skipped. The user can retry an operation that already happened, while the restoration has no audit entry. | Backend `ArchiveController.php:108-133`; reproduced with a failed audit-write event. Timetable restoration already writes its audit entries inside its transaction. |
| A02 | P1 | **The occupied-role check can become stale.** User restoration checks the active dean/secretary/program-head holder before entering its transaction, without a shared role-scope lock or database role-slot constraint. A holder created after the check does not prevent restoration. | Backend `ArchiveController.php:92-114`, `User.php:87-107`, users migration. Controlled interleaving produced two active secretaries for one department. Real concurrent MySQL verification remains outstanding. |
| A03 | P2 | **One restore can leave several already-restored rows in the archive screen.** Required meeting patterns restore linked schedules together, and schedule model events also restore split metadata. The frontend removes only the clicked record and decrements only its type count; it neither receives affected identities nor reloads the archive. Users can see stale schedule/split entries and attempt to restore them again. | Frontend `Archive.tsx:103-110`; backend `ArchiveController.php:142-172`, `Schedule.php:149-151`; existing atomic meeting-group test passed. |
| A04 | P2 | **Known blockers appear only after confirmation, and detailed errors are discarded.** Every row offers Restore, including records with archived parents, occupied roles, an inactive semester, or a conflicting unique value. Scheduling responses may contain a `violations` list, but the screen passes them through a message-only formatter. Users get a failed operation without the complete explanation or a route to its dependency. | Frontend `Archive.tsx:93-115,167-179`, `apiError.ts`; backend dependency/role checks and `ScheduleConflictException::payload()`. Error notices persist in the shared notice modal; the problem is lost structure and missing recovery actions, not disappearing error toasts. |
| A05 | P2 | **Pagination does not bound the work.** Every request loads all archived rows from ten model types, builds lookups, combines and sorts them in PHP, then downloads the complete result. The 25-row table pagination happens afterward in the browser. Growth increases database reads, PHP memory, download size, and browser filtering work. Full model reads also load unnecessary columns such as image data. | Backend `ArchiveController.php:49-68`; frontend `Archive.tsx:66-69,84-91,185-191`. No load test was run, so this is a confirmed unbounded design, not a measured latency claim. |
| A06 | P2 | **There is insufficient information to identify and assess a record safely.** The payload exposes only ID, type, label, a short context string, and deletion date. There is no detail view, archived-by/reason information, retained status, dependency list, or restore impact. Same-name users cannot be distinguished by username here; rooms omit building/home program, and instructors omit middle name/suffix. Several archive endpoints do not record archive events, so provenance cannot always be recovered from existing logs. | Backend `ArchiveController.php:59-65,321-377`; frontend record interface and columns; related domain `destroy` methods. Missing historical actor/reason must be shown as unknown, not inferred. |
| A07 | P2 | **Restored is incorrectly described as active or usable.** The user confirmation says the account can sign in again and success says the record is active again. Restoring only clears `deleted_at`; an inactive user remains inactive. Faculty/course/room status can likewise remain restrictive. | Frontend `Archive.tsx:34-41,96,110`; backend generic restore path. An inactive-account probe confirmed the account remains inactive after successful restoration. Preserve that behavior; correct the explanation. |
| A08 | P2 | **“Archive” describes different destinations without explaining them.** The system archive uses soft deletes, curricula use a separate archived status/modal, and ended-semester schedules use immutable Schedule History. Curriculum confirmation says “restore it later from the Archive,” but curricula are absent from `/archives`. The system page provides no explanation or links between these destinations. | `CurriculumListPage.tsx:110-123,515-520`, `CurriculumArchiveModal.tsx`, `ArchiveController::TYPES`, `ScheduleSemesterArchiver.php`; documented persistence rules. Separate storage mechanisms are intentional; navigation and wording are the gap. |
| A09 | P2 | **The page can stay stale while open.** It loads on mount, has no ordinary Refresh action or `useLiveRefresh` subscription, and `page:archive` is absent from the cache-group map. Other users' changes do not update the visible list. If a refresh fails, the page replaces even previously loaded records with an error panel. | Frontend `Archive.tsx:49-80,217-235`, `cacheGroups.ts`, `useLiveRefresh.ts`. Cached records may be shown initially, but there is no archive-specific last-checked indicator. |
| A10 | P2 | **Restore audit entries lose the real entity in Activity Log.** Generic restores store the actual type and ID in metadata, but the activity mapper gives them a `schedule_workflow` target, often with a null ID, and categorizes them as scheduling. An account restoration is excluded by the Account & Access category query. The data exists but is presented under the wrong target/category. | Backend `ArchiveController.php:279-294`; `ActivityLogController.php:44-46,134-151` and `schedulingCategory`; frontend `ActivityLog.tsx` maps every `record_restored` event to scheduling. |
| A11 | P3 | **Finding records is unnecessarily limited.** Search covers only label/context. There are no structured department, program, term, or archive-date filters, no reset action, and no URL-preserved state. Search/type changes are applied before the shared table hook, so its `globalFilter` page-reset effect does not reset this page to the first result page. | Frontend `Archive.tsx:56-57,84-91,185-213`; `useDataTable.ts:45-78`. The hook clamps out-of-range pages but can retain a later valid page after narrowing a search. |
| A12 | P3 | **Some controls and states need clearer labels.** The type select has no label or accessible name; search relies on placeholder text. An actually empty archive and a filter with zero matches show the same advice. The table offers only an icon restore action and no visible review step. | Frontend `Archive.tsx:196-213,228-233`; `SearchInput.tsx`. Restore buttons already have descriptive `aria-label`s through `TableActionButton`; retain this strength. Contrast, touch sizing, focus, and responsive layout require actual browser checks. |

### Existing safeguards to preserve

- Archive listing and restoration require an authenticated, active VPAA account.
- Archived department/program references and designation-parent/name blockers are checked.
- User restoration refuses an already-occupied administrative role in the sequential case.
- Timetable restoration uses the existing scheduling lock, transaction, rule engine, configured meeting-group validation, and conflict scanner; linked required meetings are restored atomically.
- Unique-value database failures roll back restoration and return an error. The issue is explaining and classifying that failure, not an absence of uniqueness checks everywhere.
- Restoring a semester does not activate it. The active semester cannot be archived through the ordinary endpoint.
- The existing table already supports sorting, pagination controls, an accessible table name, and labelled action buttons.

### Behaviors that are not missing archive features

Sections are permanently removed after dependency checks; cleared working schedules can also be permanently removed through documented replacement flows. Neither should acquire a Restore promise during this redesign. Timeslot overrides have been removed by migration and should not be added back because old documentation mentions them. Curriculum restoration and historical schedule recovery must retain their distinct permissions and lifecycle rules.

## 3. Proposed experience

The goal is to let the VPAA **find the intended record, understand its condition and dependencies, and restore exactly the permitted records with an accurate result**.

Keep the existing `/archive` route and application design system. Reuse the table, filter inputs, dialogs, notices, and live-refresh hook. The recommended screen structure is:

1. **Purpose and scope.** A short explanation that this screen contains deleted records that may be recoverable. Show the total and when the list was last checked. Provide clearly named links to the existing curriculum and Schedule History destinations. Fix curriculum confirmation to name its actual archive location.
2. **Search and labelled filters.** Search, record type with counts, department, and archive-date range; reveal program/term filters when relevant. Include Refresh, Clear filters, and the matched-result count. Use URL parameters so Back and reload retain the investigation.
3. **Recovery table.** Record identity, type, department/program/term as applicable, archived date, known restore condition, and labelled View details / Restore actions. Keep ten types in a compact selector instead of ten separate dashboard cards. Hide redundant columns when a single-type view supplies richer context.
4. **Record details.** Use the existing accessible detail/dialog convention. Show safe type-specific fields, retained operational status, known provenance, archived parents, linked meetings affected, and the expected result. Provide a way to locate required parent records with their type and identity.
5. **Informed confirmation.** Identify all records being restored and explain status accurately: for example, “Restore this account. It will remain inactive,” or “Restore this class and its linked meetings after current timetable validation.”
6. **Definitive result.** Revalidate and restore on the server, return the complete affected set, refetch the archive, and update related cached views. On failure, retain the selected record and show all actionable reasons with links where possible.

Eligibility wording must distinguish **a known block** from **validation still required**. Passing inexpensive dependency checks does not prove a schedule is safe to restore; current scheduling rules are authoritative at submission. Avoid a “Ready to restore” total unless it can be computed truthfully and efficiently.

Empty states should distinguish “Nothing has been archived” from “No records match these filters.” On a failed background refresh, retain previously loaded results with a saved-data warning and last successful check time. Permission/session failures continue through the existing authentication handling and must not expose cached data to another account.

This is a proposed information structure, not an approved visual mockup. Capture the current page and its main states before choosing a visual treatment.

## 4. Implementation plan in dependency order

### Phase 1 — Correctness and restoration results (A01, A02, A03, A07)

- Put non-timetable restoration, linked-profile synchronization, and audit writes in one database transaction. Keep cache/live-update work after successful commit. Re-fetch and lock the archived record before mutating it, and recheck relevant preconditions inside the transaction.
- Protect role-slot changes through one shared locking convention used by restore, account creation, and account activation/role reassignment. Lock the relevant existing department/program scope and recheck the holder after acquiring it; do not add a restore-only lock that other writers ignore. Evaluate database enforcement against the existing nullable scope rules rather than inventing an independent role policy.
- Keep `is_active`, faculty/course status, and room availability unchanged by restoration. Return and display the actual resulting state.
- Classify actual unique-constraint violations specifically. The current broad `QueryException` handlers describe every database failure as a duplicate value; deadlocks and infrastructure failures need accurate server-side handling and diagnostics.
- Extend the restore response with all affected `{type, id}` identities, affected count, and resulting state where relevant. Include implicitly restored split metadata and linked schedules. On success, reload the current archive query and update counts from the authoritative response rather than subtracting one locally.
- Preserve existing idempotency behavior. A repeat after a lost response or another user's restore should reconcile the list and explain the current state without performing a second mutation.

Acceptance: a forced audit failure leaves the record archived; concurrent operations cannot create two active holders in one protected role scope; one linked-meeting restore removes every affected archive row/count; inactive accounts remain inactive and the UI says so. Re-run group/conflict rollback checks.

### Phase 2 — Bounded archive queries and record inspection (A04, A05, A06, A10)

Keep the existing models and soft-delete approach. A second archive database or generalized archival framework is unnecessary.

Proposed contracts, to implement together with their consumers:

| Endpoint | Proposed behavior |
| --- | --- |
| `GET /archives` | Validate allowlisted `type`, bounded `search`, optional department/program/term/date filters, page and page size (default 25, maximum 100), and allowlisted sorting. Return one page, pagination metadata, and explicitly defined type counts. |
| `GET /archives/{type}/{id}` | New detail endpoint with allowlisted display fields, retained status, known dependency blockers, linked records/restore impact, and available provenance. Require the same VPAA access checks. |
| `POST /archives/{type}/{id}/restore` | Keep the existing endpoint; revalidate under the appropriate lock/transaction and add affected identities/result state. Return structured blocker/violation details without removing existing human-readable messages. |

For a selected type, paginate its query directly. For All types, combine only the necessary identity/timestamp/search projections with `UNION ALL`, paginate that result, then hydrate only that page's display data. Use deterministic ordering with timestamp, type, and ID tie-breakers. Do not fetch ten complete tables and slice the combined collection afterward. Reuse targeted joins/lookups for searchable context; keep all type/column/sort choices server-owned and parameterize user input.

Type counts should have one documented meaning. Recommended: counts match search/department/program/term/date filters before the selected type is applied; the selected result total is separate. Count linked metadata consistently with the visible representation. Inspect query plans before adding indexes; a deleted-date/ID index may be warranted on large tables after measurement.

Expose cheap known blockers on the loaded page or in details. Return full rule-engine violations when a schedule restore fails. If a dedicated schedule preview is later justified, reuse the same validation path and still revalidate at commit; do not run a full scheduling scan for every archive row.

Map `record_restored` to its metadata entity in Activity Log and derive category from that type. Ensure the category query does not filter out those events before mapping them. Derive schedule-split department/term scope from its parent when auditing. Reuse existing audit storage for new archive actor/target events; do not infer missing historical actors/reasons or require a reason before a product rule exists.

Acceptance: an archive with many records returns bounded pages and correct stable totals; archived-parent filter choices remain available; response details omit secrets and unnecessary image/blob data; the restored entity is identifiable and appears under the appropriate Activity Log filter.

### Phase 3 — Recovery workflow and screen redesign (A04, A06, A07, A08, A11, A12)

- Implement the structure in section 3 using established application components and styling.
- Add type-specific identity and operational-status details. Start with users, rooms, instructors, and schedules, where a wrong assumption has the greatest consequence.
- Add persistent labels, clear filter resets, first-page reset on query changes, and distinct empty/no-match states.
- Show known dependency reasons before confirmation. Keep blocked records inspectable, with a clear route to the prerequisite. Show complete schedule violations after validation rather than a generic failure alone.
- Preserve the existing curriculum archive and immutable semester history flows; clarify and connect their entry points. Link to the actual existing route/modal behavior, adding an explicit query-driven entry only if needed and implemented.
- Capture the current page, detail/confirmation state, dependency failure, successful group restore, and narrow-width state when browser access is restored. Use that evidence to finalize spacing, density, hierarchy, and responsive behavior before visual sign-off.

Acceptance: the VPAA can identify a same-name account, understand an inactive account's outcome, locate an archived parent, review all meetings affected, and distinguish historical/curriculum archives. Complete the workflow with keyboard input; verify focus entry/return, labelled controls, readable contrast, zoom, and narrow-screen overflow in the browser.

### Phase 4 — Freshness and release checks (A09 plus regressions)

- Connect relevant existing live topics to archive refresh and cache invalidation. Add an archive cache group or equivalent mapping to the existing mechanism; avoid introducing another event system.
- Refresh after restoration and on explicit Refresh; prevent older in-flight loads from overwriting newer query or mutation results. Keep background-refresh state distinct from first load.
- Preserve saved results on recoverable refresh failure with a clear timestamp/warning. Recheck dependencies when a previously blocked record is reopened or retried.
- Run focused backend and frontend checks, then build/lint checks appropriate to the implementation. Validate MySQL constraint/locking behavior on a disposable database before sign-off.
- Update the documentation dashboard and current archive contracts/workflow with the implemented behavior and any remaining limits.

Acceptance: two open authorized clients reconcile changes without navigating away; a disconnected refresh preserves readable saved results; a restore race or lost response is reconciled accurately; no unresolved integrity regression remains.

## 5. Verification matrix for implementation

| Area | Required scenarios |
| --- | --- |
| Authorization | Unauthenticated, inactive, and non-VPAA list/detail/restore denied; VPAA succeeds within the existing policy; cached data cleared on account/session change. |
| Non-timetable correctness | Successful restore; forced audit failure rolls back record/profile changes; stale/deleted/already-restored identity; duplicate unique value; archived department/program/designation parent; preserved operational status. |
| Administrative role integrity | Existing holder; two competing restores; restore versus new account; restore versus activation/role reassignment; department and program scope variants. Use real MySQL concurrency for the race assertions. |
| Scheduling | Active-term requirement; parent dependencies; current curriculum/room policy; all relevant conflict violations; linked-group atomic success/rollback; approval-stage rules for split restoration; actual affected identities and audit scope. |
| Querying | Every supported type; tied timestamps across pages; All types; combined filters; archived parent filter options; counts; bounded payload; invalid input and unsupported sort rejection. |
| Frontend behavior | Search/filter resets; preserved URL state; informative details/confirmation; structured failures; correct inactive/closed result wording; linked rows/counts removed; repeated restore reconciled; refresh/load races; stale-data warning; live updates. |
| Accessibility and visual QA | Control names; keyboard operation; modal focus; status/error announcements; empty and loading states; 200% zoom; narrow and desktop widths; measured contrast. Browser evidence required. |

## 6. Scope boundaries and decisions

No bulk restore, permanent-delete/retention feature, historical schedule replay, permission expansion, replacement component library, or separate archive storage is needed to address these findings. Consider bulk recovery only after dependency previews and multi-record results are reliable and a real workflow requires it.

The recommended order is correctness, bounded data/detail contracts, recovery UI, then browser verification and release checks. The main remaining design decision is the visual treatment of details and filters, to be grounded in current screenshots when browser access is available. This plan does not authorize changing documented deletion semantics or automatically activating restored records.

## 7. Primary implementation references

- [Archive screen](../../src/pages/vpaa/Archive.tsx), [shared table behavior](../../src/components/ui/useDataTable.ts), [error formatting](../../src/lib/apiError.ts), and [cache groups](../../src/lib/cacheGroups.ts).
- [Archive API](../../../backend/app/Http/Controllers/Admin/ArchiveController.php), [schedule model events](../../../backend/app/Models/Schedule.php), [role-slot lookup](../../../backend/app/Models/User.php), and [Activity Log mapping](../../../backend/app/Http/Controllers/Admin/ActivityLogController.php).
- [Archive tests](../../../backend/tests/Feature/ArchiveTest.php), [integrity checks](../../../backend/tests/Feature/CrudIntegrityGuardsTest.php), [parent validation](../../../backend/tests/Feature/AcademicParentValidationTest.php), and [schedule restoration checks](../../../backend/tests/Feature/MultipleCurriculaPerSemesterTest.php).
- [Persistence decisions](decisions.md), [database rules](database.md), and [Schedule History workflow](schedule_history_workflow.md).
