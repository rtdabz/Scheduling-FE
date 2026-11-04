# Curriculum import: formal review of changes

Date: 2026-11-03
Status: Implemented 2026-11-03 (frontend and backend). Supersedes the earlier per-item confirmation/reason proposal.

## Decision

Remove all mandatory reason fields and per-item acknowledgement steps from new curriculum imports. Replace them with a formal, automatically generated review of the proposed import and one final **Confirm and import** action. Users correct values and choose actual domain options in Preview/Configure; they do not explain each correction in prose.

Keep server validation and actionable errors. A formal review confirms a specific import outcome; it cannot supply missing course data or make an unsupported operation valid.

## User flow

1. Preview and Configure retain the current tabs, editable data, source notes, and settings. Corrections are recorded automatically. No reason inputs or individual approval checkboxes.
2. Validate checks the full draft and computes the final proposed outcome. Missing categories, ambiguous choices without a selected value, invalid units, catalog conflicts, and incomplete required source content receive direct correction actions.
3. Step 4 displays **Review and import** with an automatically generated summary: curriculum details; courses to create/reuse; corrected fields; category and class-time choices; original notes and colors; term totals and discrepancies; informational notices.
4. Display changes in a readable comparison: **Course / Field / Original / Will be imported**. For reused courses, distinguish the extracted source, edited draft, and existing catalog value whenever those differ. Never imply a draft title will replace an immutable catalog title.
5. Group changes by course. Consolidate overlapping extraction warnings and source corrections into the same comparison. Keep substantive uncertainties and their final selected treatment visible. Collapse formatting-only details under Information; never hide material decisions there.
6. Use one **Confirm and import** button for final confirmation. No extra acknowledgement modal, no per-row confirmation, no checkbox for every finding, and no typed reasons. Keep the action disabled until server validation is current and no unresolved errors/required domain choices remain.
7. Edits after validation mark the review out of date and require fresh validation. Navigating tabs or opening/closing details does not. Closing the review never imports anything.

## Examples

| Item | Formal review presentation |
|---|---|
| PATH FIT code corrected | Show source code and final code once; retain the extraction flag in the same comparison/audit |
| Catalog title differs by spaces/capitalization | Information: existing catalog title will be reused; no blocker or reason |
| Category changed from suggested Minor to Major | Show suggested and selected categories; the explicit Configure selection is the decision |
| Source credits corrected | Show original and final lecture/laboratory/total units; still enforce arithmetic and catalog integrity |
| Calculated total 30, printed total 27 | Display both and state explicitly that reviewed course rows yield 30 units; preserve 27 as the printed source total. User may correct rows before final confirmation |
| Practicum describes 486 hours | Require an actual supported scheduling-basis selection in Configure; show its consequences in the review. Do not infer weekly hours from total hours |
| Original red source note | Show exact preserved text/color and its display placement; identify any unresolved fidelity limitation instead of claiming exact preservation |

## Validation policy

- Remove generic reason-length checks and acknowledgement requirements for new imports on both client and server. Do not replace them with fabricated strings such as `Reviewed` or silently auto-fill old acknowledgements.
- Non-blocking source corrections, extraction flags with a complete reviewed outcome, title formatting differences, absent printed totals, category overrides, inactive-course reuse, and documented printed/calculated discrepancies become review summary facts. Preserve explicit warnings and final values.
- Keep invalid arithmetic, missing required data, duplicate placements, catalog credit/category conflicts, archived matches, invalid note text/style/scope, and other integrity errors as blockers.
- If a finding needs an actual value/choice (category, placement, supported scheduling basis, source transcription), require that value in the relevant editor. Do not substitute an essay, generic confirmation, or the final import click for missing data.
- Unknown colors or unread original notes need an accurate representation and correction path under the source-preservation policy. The final review cannot dismiss missing content or label a default color as exact. Plain CSV without intrinsic styling is not an extraction failure.
- Verify actual scheduler support before changing treatment of total-hours/conversion warnings. Do not silently remove existing safeguards for unsupported behavior as part of this UX change.
- Preserve source text and styling. Comparison-only normalization must not mutate source data or merge different course identities.

## Implementation sequence

1. Backend: classify findings into errors requiring a correction and non-blocking facts/notices for the formal review. Inspect `CurriculumImportValidator`, `IssueList`, `CurriculumNotes`, and import commit logic. Preserve integrity checks while removing the universal reason gate.
2. Return the proposed import outcome and changes using existing validation data where sufficient. Extend the validation response only where necessary. Derive the summary from the same normalized/resolved data used by commit, including catalog reuse and notes; avoid an independent frontend interpretation of what will be saved.
3. Reuse the existing fingerprint to bind the final confirmation to the validated draft, settings, catalog decisions, and displayed outcome. If adding a final confirmation flag, require it with the matching fingerprint at commit. Preserve transaction revalidation, stale-conflict handling, authorization, and idempotency. Reuse existing validate/commit endpoints.
4. Frontend: remove reason inputs, acknowledgement handlers/payloads, accepted-reason progress, and per-item approval controls from new import flows. Replace pending-review wording with accurate error/change/notice counts. Keep the header-aligned Validation results button for actionable errors/notices, and use Step 4 for the formal final summary.
5. Audit automatically records original and imported values, reused catalog values, source provenance, selected options, preserved notes, authenticated importer, server timestamp, and confirmed fingerprint. Preserve historical reasons in old import records; do not rewrite them or require fake reasons on new records.
6. Update types, tests, and documented business rules. Coordinate API/client compatibility so stale clients must revalidate under the new policy rather than bypass new gates. Keep completed tabs, modal styling, header layout, CMO generation, and unrelated changes intact.

## Acceptance checks

- No reason inputs or per-item acknowledgement controls appear anywhere in a new import.
- PATH FIT corrections appear once per affected field; no duplicate mandatory review tasks.
- A valid draft with corrections can be validated, reviewed, and imported with one final Confirm and import action and no explanation text.
- The review accurately distinguishes newly created courses, existing courses reused unchanged, selected categories/minutes, source discrepancies, and exact preserved notes.
- Invalid/missing values and source-note integrity errors still block direct API commits as well as the UI.
- Changing relevant draft/settings/catalog values makes an old confirmation stale. Idempotent retry does not create a duplicate curriculum.
- Audit records retain what changed, who imported it, and when without fabricated reasons; historical reason records remain readable.
- Test backend validation/commit and note preservation, frontend review/edit/revalidate/import behavior, and summary accuracy. Run build/type checks and visually verify readable comparisons at narrow widths.

This plan replaces repetitive reason entry with a concrete review of the import outcome. No application code was changed in this planning task.
