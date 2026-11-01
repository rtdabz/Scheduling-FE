Act as a senior software engineer, software architect, technical reviewer, and product designer. Implement the VPAA Archive improvements and redesign as one complete task across these repositories:

- Frontend: C:\Users\toman\wicars-ui
- Backend: C:\Users\toman\backend

Read the applicable AGENTS.md / CLAUDE.md instructions. Start documentation discovery at frontend docs/plan/DASHBOARD.md, then read docs/plan/vpaa_archive_improvement_plan.md and only the relevant referenced files. Verify the findings against the current code before changing it. Preserve unrelated working-tree changes.

Complete the work in this order: HIGH priority, MEDIUM priority, LOW priority, then the redesign and final verification. This is an implementation request: do not stop after giving another plan or completing only one priority group. Use the simplest maintainable solution, reuse existing components and services, and avoid unrelated refactoring or new dependencies.

HIGH PRIORITY

1. Make restoration and audit writes atomic. Non-timetable restores currently commit before the audit entry is written. Put record restoration, linked-profile synchronization, and the audit write in one transaction. Re-fetch/lock the record and revalidate relevant preconditions before mutation. An audit failure must leave the record archived. Invalidate caches and publish updates after successful commit.

2. Prevent administrative role races. The active dean/secretary/program-head check currently happens before the restore transaction. Use shared role-scope locking and revalidation across restoration, account creation, and activation/role reassignment. A restore-only lock is insufficient. Preserve existing department/program scope rules and evaluate database enforcement where appropriate. Add regression coverage for competing operations.

MEDIUM PRIORITY

3. Reconcile every restored record. Restoring a schedule may restore linked schedules and split metadata. Return all affected type/ID identities and actual resulting states. Refetch the current archive query and counts instead of removing only the clicked row and subtracting one. Preserve existing idempotency and reconcile already-restored records or lost responses safely.

4. Explain blockers and failures. Surface known archived-parent, role, semester, and uniqueness blockers before confirmation. Keep blocked records inspectable and make prerequisites easy to locate. Display the complete scheduling violations, not only a generic message. Revalidate authoritatively at submission; passing preliminary checks must not promise success. Distinguish unique-constraint errors from unrelated database failures.

5. Implement server-side pagination, filtering, and stable sorting. Bound page size and search input; allowlist types and sorting. Paginate selected types directly. For All types, use a bounded database query such as a minimal UNION ALL projection, then hydrate only the selected page. Do not load all archived models and paginate afterward. Define count semantics, include deterministic tie-breakers, and return accurate pagination metadata.

6. Add safe record details and restore impact. Show enough identity and context to distinguish similar records: username/role, full instructor name, room building/home program, department/program/term, and retained operational status as applicable. Show dependencies, linked records, and available archive actor/reason information. Historical provenance that was never recorded must remain unknown. Reuse existing audit storage for future archive events; exclude secrets and unnecessary blobs.

7. Correct restoration wording. Restoring clears archival status; it must not automatically activate accounts, faculty, courses, rooms, or semesters. Confirmation and success messages must describe the actual result, including records that remain inactive or unavailable.

8. Clarify archive destinations. Explain and connect the soft-deleted-record archive, curriculum archive, and immutable semester Schedule History. Correct curriculum confirmation text to name its actual archive location. Preserve their different storage, permissions, and lifecycle rules.

9. Fix freshness and refresh failures. Add explicit Refresh, a last-successful-check indicator, and integration with existing live-update/cache mechanisms. Refresh after restoration. Prevent older requests from overwriting newer query/mutation results. Keep previously loaded results visible with a clear warning on recoverable refresh failure. Preserve session/account cache isolation.

10. Correct Activity Log restoration entries. Derive the target entity/ID and category from the restored record rather than assigning every restore to schedule_workflow/scheduling. Fix backend category filtering and frontend mapping together. Preserve department/term scope, including records whose scope comes from their parent schedule.

LOW PRIORITY

11. Improve navigation through results. Add labelled search, type, department, archive-date, and context-relevant program/term filters. Include Clear filters and matched totals. Preserve filters/sort/page in URL state and reset to the first page when the query changes. Include archived parent options where needed.

12. Improve accessibility and states. Add persistent control labels, clear View details/Restore actions, keyboard operation, visible focus, accessible dialogs, focus return, and status/error announcements. Distinguish a genuinely empty archive from no matching results. Verify responsive overflow, touch usability, zoom, and contrast.

REDESIGN AFTER THE FUNCTIONAL FIXES

Redesign /archive around this workflow: find the record -> inspect details/dependencies -> understand restore impact -> confirm -> see an accurate result.

- Reuse the application's current visual language, shared table, inputs, dialogs, and notifications.
- Add a concise purpose/scope header, archive total, last-checked time, and links to curriculum archives and Schedule History.
- Use a compact filter toolbar with Refresh and Clear filters.
- Show record identity, type, relevant context, archive date, known restore condition, and clear actions in the table. Avoid a separate dashboard card for every record type.
- Add an accessible details dialog/panel containing retained status, available provenance, dependencies, affected linked records, and expected outcome.
- Make confirmation specific to the selected record and every linked record affected.
- Show actionable failures without discarding the user's investigation.
- Capture the existing UI before visual changes when browser access is available. Verify the finished page on desktop and narrow widths. Report any unavailable visual checks honestly.

PRESERVE EXISTING RULES

Keep active-VPAA authorization, archived-parent checks, unique constraints, scheduling scope locks, rule-engine validation, conflict scanning, meeting-group atomicity, and approval-stage restrictions. Do not change section deletion or cleared-working-schedule persistence semantics. Do not add restore promises for permanently removed data, bring back removed timeslot overrides, introduce historical schedule replay, expand permissions, or add bulk restore/permanent-delete features.

VERIFICATION AND HANDOFF

Use disposable test databases; do not reset or mutate the application's working database to test this task. Add focused regression tests for the corrected behavior, including audit-failure rollback, role races, linked restores, preserved inactive states, authorization, dependency/unique/conflict failures, bounded pagination, audit mapping, filtering, refresh races, and structured errors.

The earlier review passed 36 existing backend tests and used three temporary diagnostic probes. Those probes demonstrated current defects/behavior and were removed; they are not regression tests or proof that the issues are fixed. Rerun relevant tests yourself. Verify actual concurrent MySQL behavior on a disposable database when available; SQLite or model-event interleaving alone does not establish production concurrency correctness.

Run relevant frontend tests, build, lint, and backend checks. Update docs/plan/vpaa_archive_improvement_plan.md and DASHBOARD.md with actual implementation status. Report changed files, completed fixes/redesign, verification results, and remaining limitations. Do not claim checks passed unless they ran successfully.
