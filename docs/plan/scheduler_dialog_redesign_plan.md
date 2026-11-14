# Scheduler dialog redesign

Date: 2026-11-09. Scope confirmed by the user: all scheduler dialogs and confirmation flows.

## Design brief

Use the supplied Submit schedule screenshot as the starting point for a consistent, more spacious scheduling workflow. Preserve the application's DM Sans body, Playfair Display headings, maroon primary action, gold accents, and cream surfaces. This is a redesign of the existing frontend, with its real API and workflow contracts preserved.

## Plan before implementation

1. Reuse the shared Modal for workflow confirmations with an opt-in scheduler appearance. Keep other application dialogs unchanged.
2. Standardize scheduler frames: 20px corners, subtle warm borders, cream header, white content, clear title/description, consistent icon and close control. Use existing Lucide icons; no new assets or dependencies are needed.
3. Keep headers and footers visible, constrain content to the dynamic viewport, and let long content scroll. Large schedule and instructor workflows retain appropriate workspace widths. At narrow widths, wrap actions into full-width controls and keep text readable.
4. Redesign Submit schedule with an exact readiness indicator, clear submission summary, readable section status rows, explicit protected-section labels, and an action footer. Preserve readiness and revision-cohort eligibility rules.
5. Apply the same visual language to section done/finalize/reassign/reset, recall, manual placement and alternatives, faculty and instructor selection, bulk instructor assignment, room occupancy, conflict resolution, generation dialogs, print, and scheduler confirmations.
6. Require deliberate section selection, with no automatic checking or picking. Preserve disabled/blocked choices, reset preview/token and permanent-delete warning, instructor-release warnings, save guards, conflict checks, permissions, and callbacks. Improve dialog semantics, keyboard focus, scroll locking, and nested Escape handling where wrappers are migrated.
7. Run focused existing regression tests, targeted lint, and the production build. With browser permission, capture real components using isolated fixtures at desktop and mobile sizes, check core interactions and runtime errors, and record visual QA evidence. Do not mutate real schedules during visual checks.

## Acceptance

- All scheduler dialog entry points use the shared visual language.
- No viewport clipping hides close or action controls at 320px width or short viewports.
- The submission list clearly distinguishes sections being sent from protected and incomplete sections.
- In-flight actions cannot be dismissed or submitted again.
- Existing scheduling behavior and unrelated work in the checkout remain intact.
- Verification results and any limits are recorded after implementation.

## Implementation result

Implemented with the Product Design frontend workflow. Shared scheduler appearance, confirmation plumbing, submission review, checklist/recall frames, placement and instructor dialogs, room/conflict views, and generation workspaces now use one visual language. The generic Modal retains its default appearance for unrelated screens; its shared keyboard handling also correctly respects stacked dialogs, inherited disabled controls, and busy transitions.

The short-screen pass found and corrected sticky-control occlusion. Existing scheduling/API behavior, user edits, and backend files were preserved. No dependency was added.

Initial validation: production build, 166 focused component checks, 64 layout checks, and 17 browser interaction checks passed. Existing lint findings remain in unrelated effect/ref code. See [design QA and limitations](../scheduler-dialog-redesign/design-qa.md) and [browser verification](../scheduler-dialog-redesign/verification.json).

## Follow-up: manual section selection

The user requested no automatic checking or picking of sections. Done, Finalize, Reassign, Reset, and Recall now open with no sections selected. Confirm remains disabled until the user chooses an eligible section. Closing and reopening discards the checklist selection; changing timetable context does not pick a section for the user.

Switching generation or course configuration from All to Selected also starts unchecked. Previously saved explicit subsets are retained when reopened. Select all remains a deliberate user action. Existing timetable navigation context and all-scope API behavior are unchanged.

Follow-up validation: 17 focused component checks, scoped lint, production build, and 19 browser interaction checks passed. Current screenshots and results are in [manual-selection verification](../scheduler-dialog-redesign/verification-manual-selection.json).
