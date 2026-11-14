# Historical actor integrity

Implemented locally on 2026-11-14. Applies to Dean, Secretary, Director, Program Head, VPAA, and configured President signatures, including former/deactivated officials and their successors.

Historical approval/history/log/notification displays read recorded identity snapshots. Missing historical names display as unavailable and never use today's officeholder. A current account name or role does not establish the original actor. Draft documents can use eligible current reviewers, while preparer identity comes from the recorded creator. Frozen signature blocks remain authoritative even after an account changes.

Users status changes call `PATCH /user/{id}/status` with only `is_active`. Account and profile edits include the loaded `account_version` as `expected_version`; 409 means the account changed and must be reloaded. The Users cache format was bumped to discard rows without version tokens.

Room-transfer printouts use the transfer's own signatory snapshot. Closed legacy transfers and missing historical schedule/load signatures remain unrecorded. Delegated action actors remain distinct from the officials named in a document signature block. No President approval stage was added.

See the [full audit and prioritized findings](../../../backend/docs/data-integrity-audit-2026-11-13.md) and [database/operations rules](../../../backend/docs/historical-actor-integrity.md). Existing suspect history was preserved; unknown legacy identities require independent evidence and cannot be recovered by renaming accounts.

The [system-wide follow-up ledger](../../../backend/docs/system-wide-actor-integrity-follow-up-2026-11-14.md) covers additional report/history, import, queued-work and archive-atomicity fixes. Frontend mapping preserves inline signatures and creator evidence, including the difference between omitted mutation fields and explicit null. Individual teaching-load printouts retain the recorded preparer/capacity; dashboard unknown actors and missing import confirmers never become `System` or the current reader. Room-request decisions show each action's own recorded actor, timestamp and remarks; legacy terminal remarks without attribution remain explicitly unknown. Persisted data cache v6 invalidates the older identity display format.
