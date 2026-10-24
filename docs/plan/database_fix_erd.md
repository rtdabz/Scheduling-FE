# Database Fix ERD and Integration Plan

This document translates the database review findings into an implementation-oriented ERD. It is a planning artifact only; it does not change the current database or migrations.

## Findings Represented

- Bulk schedule updates can bypass `Schedule` model events and therefore omit schedule-history rows.
- Recommendation acceptance/auto-application mass-deletes replaceable schedules without firing per-model delete events.
- Schedule submission updates schedules before writing audit/history records and is not fully atomic.
- Asynchronous generation stores its result in `schedule_generation_runs.result`; preview output is not necessarily persisted as `schedule_recommendations`.

## Current-State ERD

The current schema is structurally valid and all checked-in migrations are applied. The weak points are persistence paths rather than missing core tables.

```mermaid
erDiagram
    USERS ||--o{ SCHEDULE_GENERATION_RUNS : requests
    USERS ||--o{ SCHEDULE_RECOMMENDATIONS : requests
    USERS ||--o{ SCHEDULE_HISTORIES : acts
    USERS ||--o{ SCHEDULING_AUDIT_LOGS : creates

    SEMESTERS ||--o{ SECTIONS : contains
    SEMESTERS ||--o{ SCHEDULES : scopes
    SEMESTERS ||--o{ SCHEDULE_RECOMMENDATIONS : scopes
    SEMESTERS ||--o{ SCHEDULE_GENERATION_RUNS : scopes

    DEPARTMENTS ||--o{ SECTIONS : owns
    DEPARTMENTS ||--o{ SCHEDULES : owns
    DEPARTMENTS ||--o{ SCHEDULE_RECOMMENDATIONS : owns
    DEPARTMENTS ||--o{ SCHEDULE_GENERATION_RUNS : owns

    SECTIONS ||--o{ SCHEDULES : receives
    SECTIONS ||--o{ SCHEDULE_RECOMMENDATIONS : targets
    COURSES ||--o{ SCHEDULES : scheduled_as
    FACULTIES ||--o{ SCHEDULES : teaches
    ROOMS ||--o{ SCHEDULES : hosts

    SCHEDULES ||--o| SCHEDULE_SPLITS : extends
    SCHEDULES ||--o{ SCHEDULE_HISTORIES : snapshots

    SCHEDULE_GENERATION_RUNS {
        bigint id PK
        uuid run_id UK
        bigint requested_by FK
        bigint semester_id FK
        bigint department_id FK
        tinyint year_level
        varchar status
        json result
        text error_message
    }

    SCHEDULE_RECOMMENDATIONS {
        bigint id PK
        bigint semester_id FK
        bigint section_id FK
        bigint department_id FK
        bigint requested_by FK
        enum status
        json input_payload
        json recommended_schedules
    }

    SCHEDULE_HISTORIES {
        bigint id PK
        bigint schedule_id "historical id, intentionally no FK"
        bigint semester_id FK
        bigint section_id FK
        bigint course_id FK
        bigint department_id FK
        bigint actor_user_id FK
        varchar action
        json snapshot
        json changes
    }
```

## Recommended Target ERD

The target design keeps the existing live scheduling tables, but adds an immutable action-level history boundary. This allows one user operation to be represented once, with all affected schedule rows captured beneath it.

```mermaid
erDiagram
    USERS ||--o{ SCHEDULE_GENERATION_RUNS : requests
    USERS ||--o{ SCHEDULE_RECOMMENDATIONS : requests
    USERS ||--o{ SCHEDULE_HISTORY_VERSIONS : acts
    USERS ||--o{ SCHEDULING_AUDIT_LOGS : creates

    SEMESTERS ||--o{ SCHEDULE_GENERATION_RUNS : scopes
    SEMESTERS ||--o{ SCHEDULE_RECOMMENDATIONS : scopes
    SEMESTERS ||--o{ SCHEDULE_HISTORY_VERSIONS : groups
    DEPARTMENTS ||--o{ SCHEDULE_GENERATION_RUNS : owns
    DEPARTMENTS ||--o{ SCHEDULE_RECOMMENDATIONS : owns
    DEPARTMENTS ||--o{ SCHEDULE_HISTORY_VERSIONS : owns

    SCHEDULE_GENERATION_RUNS ||--o{ SCHEDULE_RECOMMENDATIONS : produces
    SCHEDULE_HISTORY_VERSIONS ||--|{ SCHEDULE_HISTORY_ITEMS : contains
    SCHEDULE_HISTORY_VERSIONS ||--o{ SCHEDULING_AUDIT_LOGS : references

    SCHEDULES ||--o| SCHEDULE_SPLITS : extends
    SECTIONS ||--o{ SCHEDULES : receives
    COURSES ||--o{ SCHEDULES : scheduled_as
    FACULTIES ||--o{ SCHEDULES : teaches
    ROOMS ||--o{ SCHEDULES : hosts

    SCHEDULE_HISTORY_VERSIONS {
        bigint id PK
        bigint semester_id FK
        bigint department_id FK
        bigint actor_user_id FK
        varchar action
        varchar source
        text reason
        json change_summary
        timestamp created_at
    }

    SCHEDULE_HISTORY_ITEMS {
        bigint id PK
        bigint history_version_id FK
        bigint original_schedule_id "no cascading FK"
        bigint section_id FK
        bigint course_id FK
        bigint faculty_id FK
        bigint room_id FK
        varchar day
        time start_time
        time end_time
        varchar mode
        boolean is_hybrid
        varchar preferred_pattern
        varchar split_group_id
        varchar meeting_type
        tinyint meeting_index
        varchar status
        text rejection_reason
        json snapshot_metadata
    }

    SCHEDULE_GENERATION_RUNS {
        bigint id PK
        uuid run_id UK
        bigint requested_by FK
        bigint semester_id FK
        bigint department_id FK
        tinyint year_level
        varchar status
        json result
        text error_message
    }

    SCHEDULE_RECOMMENDATIONS {
        bigint id PK
        bigint generation_run_id FK "nullable for synchronous/manual generation"
        bigint semester_id FK
        bigint section_id FK
        bigint department_id FK
        bigint requested_by FK
        enum status
        json input_payload
        json recommended_schedules
    }
```

## Integration Rules

1. Begin one database transaction for each schedule action.
2. Lock the affected semester/department scope and read the before-state.
3. Apply normal schedule changes, replacement, status transition, or assignment.
4. Create one `schedule_history_versions` row and one item per affected schedule.
5. Write the scheduling audit row with `history_version_id` in its metadata.
6. Commit all schedule, history, and audit writes together.
7. Invalidate caches and send notifications only after commit.

For recommendation acceptance, capture the schedules being replaced before deleting them. Create the accepted schedules, the history version, and the recommendation status update in the same transaction.

For asynchronous previews, retain `schedule_generation_runs` as the durable job record. Add the nullable `generation_run_id` link to recommendations only if the product requires every generated candidate to remain queryable after the preview response.

## Safe Migration Sequence

1. Add `schedule_history_versions` and `schedule_history_items` without changing existing tables.
2. Add nullable `generation_run_id` to `schedule_recommendations` if retention is required; backfill only where a reliable run-to-recommendation relationship exists.
3. Introduce a history-capture service and write-path transaction wrapper.
4. Migrate bulk status, instructor assignment, workflow, and recommendation replacement paths to that service.
5. Add feature tests for rollback, replacement history, and one-version-per-action behavior.
6. Run a production-like data audit before adding any stricter uniqueness or check constraints.
7. Keep the existing `schedule_histories` table during rollout for compatibility; deprecate it only after all readers and reports use the new version/item model.

## Important Constraint Decisions

- Do not add a foreign key from `schedule_history_items.original_schedule_id` to `schedules`; deleted schedule history must remain readable.
- Keep nullable foreign keys for historical references to users, departments, sections, courses, faculties, and rooms where deletion should not erase history.
- Do not add database checks for conflict detection or approval sequencing until existing data has been audited and all write paths use the same validation service.
- Do not remove `schedule_generation_runs.result` merely because recommendations become linkable; it remains useful for failed and diagnostic runs.
