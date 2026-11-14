# WICARS Documentation Dashboard

## System Architecture

- [[architecture]]
- [[database]]
- [[business_rules]]

## Development

- [[coding_standards]]
- [[print_download_review]] — Print/download inventory, filename conventions, verification, and prioritized export improvements.
- [[performance]]
- [Action visibility review](reports/action_visibility_review_2026-11-14.md) - Missing creation controls, role-specific availability actions, and verification across the system; reviewed 2026-11-14.
- [Dashboard role review](reports/dashboard_role_review.md) — VPAA, Dean, and Secretary content priorities, redundancy findings, verification limits, and per-finding implementation status.

## Architecture & Decisions

- [Historical actor integrity](historical_actor_integrity.md) ? Account freshness, immutable approval/log identities, former and replacement officials, historical PDFs, local rollout, and prioritized legacy evidence review; implemented 2026-11-14.

- [Schedule Reset and module archives](schedule_reset_and_module_archives.md) — Permanent draft-only Reset endpoint independent of Schedule History, module Archived tabs replacing `/archive`, restore stage guard, read-only legacy inventory, and verification; implemented 2026-11-09.
- [Schedule archive policy review](reports/schedule_archive_policy_review.md) — Delete/Clear behavior, permanent replacement exceptions, VPAA and Secretary recovery scope, verified risks, and recommended policy; review only, 2026-11-01; Reset recommendation superseded 2026-11-09.
- [VPAA Archive improvement plan](vpaa_archive_improvement_plan.md) — Archive fixes A01–A12 and the `/archive` redesign implemented 2026-11-01: atomic restores, shared role-slot locking with a database backstop (verified under real MariaDB concurrency), server pagination, record details and provenance, accurate outcomes, Activity Log mapping, and browser/keyboard checks; remaining limitations listed in section 0.
- [[decisions]]
- [Department module locking](department_module_locking_plan.md) — Program-bound locks for Sections, Academic Scheduling, Facilities, Curriculum, Courses, and Schedule History; Cross-Department open without a program; Course Assignment needs a program and final VPAA approval. Prioritized findings, fixes, and open decisions; implemented 2026-11-10.
- [Dashboard integration plan](dashboard_integration_plan.md) — Role-specific content, metric definitions, and acceptance checks; Phases 1–2 implemented 2026-10-30, authenticated UI checks and backend contract sign-off outstanding.
- [[curriculum_document_import_plan]] — Implemented reviewed curriculum import (PDF/CSV/XLSX/DOCX), classification rules, and conversion settings; Phase 2 scheduling integration deferred (see section 16).
- [[scheduling_profile_removal_plan]] ? Completed course-driven replacement of the department Scheduling Profile and verification record.
- [[room_request_implementation_plan]] — Room Request authorization, scheduling integrity, reliable responses, and frontend correctness; implemented 2026-11-03.
- [Room Request follow-up review](reports/room_requests_followup_review_2026-11-03.md) — 2026-11-03 recheck and fix pass: nine issues resolved, with test, MariaDB, and browser evidence and remaining limits.
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

- [Independent Manual Plotting moves](reports/manual_plotting_independent_dragging.md) - Consecutive meeting drag/click relocation, root cause, preserved validation, and regression evidence; fixed 2026-11-14.
- [Integrated Required Days plan](integrated_required_days_plan.md) - Proposed separate Lecture and Laboratory Required Day controls for Integrated generation, with section scope, solver enforcement, review/save parity and acceptance checks; 2026-11-11.
- [Schedule Management workspace redesign](schedule_management_workspace_redesign_plan.md) — Prioritized UI audit and implemented viewport-bound two-column workspace, compact header with one progress overview, Manual Plotting panel, flush timetable grid with branded slot states; 2026-11-13.
- [Modal refinement audit](modal_refinement_audit.md) — Inventory of all 67 dialogs, inconsistencies found, the shared dialog standard (`Modal`, `ModalButton`, `ModalField`, `ModalNotice`, `ModalState`, `modalStyles.ts`), and the checklist: 26 hand-rolled dialogs moved onto `Modal`, 16 normalised, scheduler workflow family left as is; 2026-11-13.
- [Scheduler dialog redesign](scheduler_dialog_redesign_plan.md) — Implemented shared dialog styling, responsive submission/checklist/recall and scheduling workspaces, keyboard/busy safeguards, and desktop/mobile/landscape verification; 2026-11-09.
- [VPAA Settings redesign](vpaa_settings_redesign_plan.md) — Implemented four-section navigation, compact forms, new-year preparation, non-destructive semester activation, immutable event history, and historical-signatory safeguards; verification and visual-check limits recorded, 2026-11-09.
- [Faculty availability workflow plan](faculty_availability_workflow_plan.md) — Proposed automatic full-time/part-time hours, exception editing, consistent enforcement, migration safeguards, and acceptance checks; 2026-11-09.
- [Tour Guide repair plan](tour_guide_repair_plan.md) — All 12 existing guides repaired; 164 focused tests, 51 authenticated browser scenarios, production build, and scoped lint passed. Verification evidence and repository-wide check limitations recorded; implemented 2026-11-09.
- [Course Assignment redesign plan](course_assignment_redesign_plan.md) — Proposed table-first bulk assignment workspace, explicit origin/teaching labels, selection safeguards, reuse scope, and acceptance checks; 2026-11-08.
- [Schedule Approval View Details redesign plan](schedule_approval_details_redesign_plan.md) — Schedule-first modal, shared Dean TanStack schedule table, wider layout, and verification results; implemented 2026-11-08.
- [Schedule recall and approval fix plan](schedule_recall_approval_fix_plan.md) — Backend concurrency and stale-dialog fixes, regression matrix, and verification evidence; implemented 2026-11-08, browser check outstanding.
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

