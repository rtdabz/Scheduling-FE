# WICARS Documentation Dashboard

## System Architecture

- [[architecture]]
- [[database]]
- [[business_rules]]

## Development

- [[coding_standards]]
- [[print_download_review]] — Print/download inventory, filename conventions, verification, and prioritized export improvements.
- [[performance]]
- [Dashboard role review](reports/dashboard_role_review.md) — VPAA, Dean, and Secretary content priorities, redundancy findings, verification limits, and per-finding implementation status.

## Architecture & Decisions

- [[decisions]]
- [Dashboard integration plan](dashboard_integration_plan.md) — Role-specific content, metric definitions, and acceptance checks; Phases 1–2 implemented 2026-10-30, authenticated UI checks and backend contract sign-off outstanding.
- [[curriculum_document_import_plan]] — Implemented reviewed curriculum import (PDF/CSV/XLSX/DOCX), classification rules, and conversion settings; Phase 2 scheduling integration deferred (see section 16).
- [[scheduling_profile_removal_plan]] ? Completed course-driven replacement of the department Scheduling Profile and verification record.
- [[room_request_implementation_plan]] — Planned phases for Room Request authorization, scheduling integrity, reliable responses, and frontend correctness.
- [[recommendation_engine_integration_plan]] — Completed shared engine integration, session policy, phase evidence, compatibility boundaries, and verification matrix.
- [[scheduling_core_phase_0]]
- [[scheduling_core_phase_1]]
- [[scheduling_core_phase_2]]
- [[scheduling_core_phase_3]]
- [[scheduling_core_phase_4]]
- [[scheduling_core_phase_5]]
- [[scheduling_core_phase_6]]
- [[scheduling_core_phase_7]]
- [[scheduling_core_phase_8]]
- [[scheduling_core_phase_9]]

## Workflows

- [[schedule_history_workflow]]
- [[vpaa_activity_log_workflow]]

---

## Documentation Rules

> This `docs/` directory is the project's source of truth for
> architecture, business rules, workflows, technical decisions,
> and development conventions.

Before modifying behavior:

1. Check the relevant documentation in `docs/`.
2. Follow existing architecture and business rules.
3. Check `decisions/` for previous architectural decisions.
4. Do not introduce behavior that conflicts with documented rules.
5. Update the relevant documentation when a significant
   architectural or behavioral decision changes.

## Current Documentation Areas

### Architecture
Canonical system boundaries, scheduling services,
authorization ownership, transaction behavior, and
refactoring boundaries.

### Business Rules
Course ownership, teaching-department assignment,
curriculum scope, minor delegation, and instructor
assignment rules.

### Database
Current schema map, relationships, delete behavior,
constraints, indexes, migrations, and persistence rules.

### Coding Standards
Project-specific Laravel/React patterns, naming,
authorization, persistence, testing, and verification
standards derived from the current implementation.

### Decisions
Architectural decisions that should not be changed
without explicitly reconsidering the documented decision.

### Performance
Production configuration, queues, caching,
generation performance, and load-testing expectations.

### Workflows
Detailed workflows for schedule history and VPAA
activity logging.

