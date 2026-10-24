# Scheduling Core Phase 7 Plan Commit

## Decision

Phase 7 introduces `CommitSchedulePlan`, the application-service boundary that
persists one final, fingerprinted `SchedulePlan` atomically.

The commit sequence is fixed:

1. Reject plans that are not room-complete, fully confirmed, resource-resolved,
   non-empty, draft-only, and aligned to one section/course scope.
2. Acquire the shared term scheduling lock.
3. Start one database transaction.
4. Capture a fresh scheduling snapshot inside the lock and transaction.
5. Reject the plan when its snapshot fingerprint is stale.
6. Revalidate the configuration and all candidate rows against the fresh snapshot.
7. Reject protected schedules for any selected section/course.
8. Archive only `draft`, `completed`, or `revision` rows in the selected scope.
9. Create every replacement row through Eloquent.
10. Record one aggregate history version and linked scheduling audit event.
11. Commit, invalidate affected caches, and return the plan as `committed`.

No controller, queue job, generation run, or recommendation endpoint uses this
service yet. Adoption remains a later compatibility step.

## Shared Lock Boundary

The term advisory lock previously embedded in `ScheduleController` is now the
`SchedulingScopeLock` port with `DatabaseSchedulingScopeLock` as its runtime
adapter. Existing batch writes and `CommitSchedulePlan` therefore use the same:

- Lock name: `wicars:schedule-write:{termId}`.
- Sorted term acquisition order.
- Ten-second MySQL/MariaDB timeout.
- `concurrent_write` violation on failure.
- Direct callback execution for SQLite and other non-MySQL test drivers.

The lock is acquired before the transaction and released after the transaction
finishes. This closes the validation-to-insert race for new schedule rows.

## Commit Eligibility

A plan can enter persistence only when:

- Its status is `room_assignment_complete`.
- It contains at least one row.
- It contains no hard violation.
- It contains no unresolved resource.
- It requires no warning or adjustment confirmation.
- Every row is `draft` and uses the same term and department.
- Every row matches the configured section.
- The distinct row course IDs exactly match the configured course IDs.

Failures use structured `ConstraintViolation` contracts through
`SchedulePlanCommitException`.

## Fresh Validation And Staleness

The source snapshot fingerprint is an optimistic concurrency token. Any
scheduling-relevant database change captured by the snapshot repository makes
the plan stale, even when that change would not ultimately conflict with the
candidate.

Fingerprint equality does not skip validation. The service still reruns:

- `ValidateGenerationConfiguration::validateSnapshot()`.
- `ValidateScheduleCandidate::validate()` through the central constraint kernel.
- The protected same-section/course check for non-replaceable workflow statuses.

No schedule mutation occurs before these checks pass.

## Persistence Semantics

Replacement is limited to the plan's term, configured section, configured
courses, and the existing replaceable statuses:

- `draft`
- `completed`
- `revision`

Submitted, approved, instructor-assignment, reassignment, finalized, and other
protected rows are never replaced. A protected row for a selected course blocks
the commit with `duplicate_section_course`.

Deletes and creates use Eloquent model instances so soft deletes, row history,
and `ScheduleSplit` lifecycle behavior remain active. New rows always persist as
`draft` with `faculty_assignment_done = false`; workflow advancement remains
owned by the approval and instructor-assignment stages.

The aggregate `schedule_plan_committed` history version and audit event include:

- Plan ID.
- Snapshot fingerprint.
- Replaced schedule IDs.
- Created schedule IDs.

All schedule, split, history, and audit writes share the same transaction.

## Virtual Resource Persistence

Snapshot-only `ONLINE` and `FIELD` resources use deterministic IDs `99998` and
`99999` for validation and capacity accounting. These synthetic IDs are never
written to the `rooms` foreign key.

- Online rows persist with `room_id = null`.
- A virtual field resource persists with `room_id = null` and `mode = field`.
- A real database-backed field room keeps its actual room ID.

This preserves the generated delivery mode without creating invalid foreign-key
references.

## Exit Criteria

- Existing batch writes and plan commits share one lock implementation.
- Non-final, unresolved, unconfirmed, malformed, and stale plans cannot write.
- Configuration and candidate validation run against a fresh locked snapshot.
- Protected schedules are preserved.
- Allowed replacements and all new rows are persisted atomically.
- Eloquent split and history behavior remains active.
- Synthetic resource IDs are never persisted.
- A successful commit returns the same plan identity with status `committed` and
  persistence metadata.
- Controllers remain unchanged except for using the extracted shared lock.
