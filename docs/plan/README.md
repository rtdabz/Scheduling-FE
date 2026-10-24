# WICARS plans and supporting documentation

This folder preserves all 45 documents from the former combined repository's
`docs/` folder, copied on October 22, 2026. The original document contents and
`reports/` structure are preserved, including plans, phase reviews, architecture,
business rules, and workflow references.

## Start here

- [Dynamic room reassignment and schedule recovery](dynamic_room_recovery_integration_plan.md)
- [Room request implementation plan](room_request_implementation_plan.md)
- [Generate schedule implementation plan](generate_schedule_implementation_plan.md)
- [Recommendation engine integration plan](recommendation_engine_integration_plan.md)
- [Scheduling profile removal plan](scheduling_profile_removal_plan.md)
- [Scheduling core phase 0](scheduling_core_phase_0.md) (phases 1–9 are alongside it)
- [Cleanup plan report](reports/cleanup_plan_report.md)
- [Original documentation dashboard](DASHBOARD.md)

## Using the migrated documents

These documents retain their original status and historical verification claims.
Copying them does not establish that a proposed feature is implemented or that
older implementation details match the current checkouts. Inspect current code
before acting on a plan.

The former repository contained both `backend/` and `wicars-ui/`. References to
those source paths now correspond to `C:/Users/toman/backend/` and
`C:/Users/toman/wicars-ui/`. Original references to `docs/<file>` correspond to
`docs/plan/<file>` in this frontend checkout.

The migration covers the former top-level `docs/` folder. It does not back up the
old repository's ignored files, local environment settings, database backups,
application uploads, or other directories. The source directory was left intact.
