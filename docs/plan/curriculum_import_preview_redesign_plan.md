# Import Curriculum Step 2: tabbed preview redesign

Date: 2026-11-03
Status: Proposed; planning only. No application changes made.

Latest policy proposal: [Formal review of import changes](curriculum_import_review_simplification_plan.md). It supersedes all earlier mandatory reason fields and per-item acknowledgement requirements: show original versus final values and the proposed import outcome, then use one **Confirm and import** action. Preserve authoritative validation, source-note integrity, and the modal/header layout. It is a plan, not an implemented policy change.

## Latest amendment: preserve original curriculum notes and colors

### Verified source and current gap

Source: `C:/Users/toman/Downloads/Applications/TCC_BSIT_active_curriculum-1.pdf`, one page, visually rendered and inspected. Its note below the First Year table reads:

> Note: Math prep(Pre-Calculus for NON-STEM(Algebra & Trigo) for GAS, HUMSS, ABM to be taken only

The PDF text span has RGB color **#C00000**. Its raw text also starts with seven form underscores; preserve raw source text separately from any explicitly reviewed display cleanup. The visible sentence ends at "only"; do not invent a continuation, fix punctuation, or turn it into an additional course. Location beneath the first-semester column is source evidence, not proof of an enforceable semester restriction.

The current PDF extractor/test already captures the visible note text as `metadata.notes: string[]`. `pdfSource.ts` discards text color, `pdfLayout.ts` only recognizes lines beginning with Note within limited table regions, and the server validates note string lengths. `CurriculumImportService` stores notes in the import audit metadata, but does not save notes on `curriculum`. The curriculum API/type and printable export have no structured notes representation. The server explicitly records that the file hash is client-declared: it receives extracted JSON, not original file bytes.

### Required implementation

1. Preserve all curriculum notes as first-class source content across extraction, draft review, server validation, atomic persistence, reload/detail display, duplication where supported, and curriculum print/PDF export. Do not limit detection to red text, this particular note, or single lines starting with Note. Preserve multiline continuations, source order, and distinct notes in different source locations.
2. Introduce a minimal structured note representation with stable identity, exact source text, display text only if reviewed separately, ordered text/color runs for mixed-color notes, source provenance, and reviewed display scope (curriculum/year/term/course when known). Preserve source page/bounds for PDFs; do not silently infer curricular rules from spatial placement. Unknown color or scope must remain explicitly unknown and reviewable.
3. Read source color from document styling/graphics data and normalize to RGB for rendering. This PDF must yield `#C00000`; do not hardcode red for all notes, sample arbitrary antialiased pixels, or replace original red with the system maroon. Retain relevant source style data where conversion is required. Preserve explicit line breaks and emphasis where supported. Reuse existing extraction/rendering tools before adding a dependency.
4. Inspect each supported adapter: PDF, DOCX, XLSX, and CSV. Preserve note text and actual available styling. CSV has no intrinsic color; never invent original formatting. If an image-only note, unsupported layout, or unsupported color cannot be faithfully extracted, surface that limitation and require source review/manual transcription instead of silently omitting it or claiming complete fidelity.
5. Extend server rules for structured notes: bounded text/run counts and lengths, allowed RGB colors, valid placement references, unique note identity, and consistent source/display data. Include notes in the existing payload fingerprint, validation response, idempotency comparison, and import audit. Note changes invalidate validation. Display ambiguous/truncated/unknown-style findings through Errors & reviews; acceptance must not mean the note can be discarded silently.
6. Be precise about verification: checking client-supplied notes is not independently checking the PDF. If claiming original-file verification, add an authenticated, department-scoped original-file upload/check flow, server-computed source hash, safe bounded parsing, and comparison against source notes before committing. Report unsupported formats and incomplete extraction honestly. Do not treat client-declared provenance/hash as verified evidence. This is a deliberate expansion beyond the current local-extraction architecture and must be documented.
7. Persist structured notes on the curriculum using a minimal backward-compatible schema change (for example a nullable JSON notes column with a model cast), not just import history or a flattened description. Return them from all applicable detail/export paths. Preserve legacy string-note imports and existing curricula with no notes; historical audit text can be recovered without inventing lost color or placement. Do not blindly rewrite historical records.
8. Render a shared source-note presentation in Curriculum details, the applicable year/term view, and the saved curriculum. Keep source content visually separate from validation errors: red source text is not automatically an error. Use the preserved color on a light surface. Escape text and validate style values; do not accept executable HTML/CSS from document content.
9. Include notes in generated curriculum PDFs/printing at their reviewed source-associated section, preserving text, color, and line breaks. Allow page growth/extra pages for long notes rather than clipping them. Preserve existing course rows and totals. For this sample, show the note beneath the First Year section, with any narrower scope requiring review.
10. Treat academic instructions inside source notes as curriculum data. Do not execute document instructions or silently create eligibility, prerequisite, scheduling, or additional-course rules from prose. Preserve the note for reviewers and students exactly; implementing enforcement requires an explicit supported rule representation.

### Acceptance evidence

- The real sample PDF is the regression fixture: the visible sentence survives import, reload, and exported PDF in `#C00000`; all 59 course rows and their totals remain unchanged.
- Test multiline notes, notes outside course tables, mixed colors, separate repeated notes, unknown scope, plain CSV, invalid style payloads, and unsupported/image-only extraction feedback.
- Backend tests verify validation, persistence, API serialization, atomic rollback, stale fingerprints, idempotency, and legacy compatibility. If original-file checking is implemented, test a note omitted from the draft against the uploaded source and cross-department access.
- Render the exported PDF and visually compare its note with the original source; verify the output text and color data as well as appearance. Run relevant frontend/backend suites and report any unsupported fidelity cases.

This amendment records source inspection and implementation requirements for Claude; no application code or PDF source was changed.

## Earlier amendment: remove duplicate settings banner and style main header

Interpret the requested banner removal as Configure's Lecture / Laboratory / Classification rules summary containing **Edit settings** or **View settings**. Remove that entire redundant block and its resulting empty spacing. Retain the top-level **Import settings** action as the settings entry point, including read-only access for users without management rights. Keep rates, rules, permissions, saving, and validation invalidation behavior inside the existing settings modal intact.

Apply the existing maroon gradient treatment to the main **Import curriculum** title/action row containing the back control, filename, Import settings, and Discard draft. Keep the title light, the filename readable, and all controls clearly visible with hover, focus, and disabled states appropriate to the dark background. Reuse the gradient already used by the import section/modal headers. Preserve the outer card's rounded corners and responsive action wrapping; long filenames must not push controls off-screen.

Keep the four-step progress indicator below the title row on its light background, with existing active/completed states and navigation. The screenshot identifies the header to recolor; this amendment does not remove that header or its step indicator.

Verify the remaining Import settings action opens the existing modal in both editable and read-only states, settings changes still invalidate validation, and Configure has no duplicate settings action/banner. Visually check the header at laptop and narrow widths. Preserve the details/issues modal and tab work, including any changes completed concurrently. This amendment updates the plan/prompt only.

## Earlier amendment: errors and reviews modal

Replace the long inline validation issue lists with an **Errors & reviews** button and modal following the Curriculum details treatment. This specifically includes Step 4's bottom `ImportIssuesPanel`, and consolidates duplicate expanded lists in Preview/Configure. It supersedes the earlier exclusion of Step 4 only for issue presentation; retain Step 4's import summary, credit ledger, and actions.

- Place the button in the top content toolbar of Steps 2, 3, and 4, alongside Curriculum details where present. Show separate labeled counts, for example **2 errors · 1 review pending**, with red and gold accents. Keep a compact blocking explanation next to the disabled Import action so moving the list does not hide why import is unavailable.
- Build `ImportIssuesModal` on the existing shared `Modal` and reuse `ImportIssuesPanel` content/logic. Match the details modal's maroon gradient header and light body. Keep Errors to fix, Reviews to accept, and For your information distinct.
- Keep acknowledgements in the parent draft state. Preserve reasons on Done, X, Escape, overlay dismissal, and reopening. Preserve the existing trimmed minimum-three-character rule and maximum length, and all server validation. A typed reason is not a substitute for a fresh successful server validation.
- Show local draft problems before server validation without presenting them as a completed server check. Merge/deduplicate overlapping current local and server findings; do not count the same finding twice. Distinguish Not validated, Changed since last check, current unresolved results, and successfully validated zero-issue state. Stale counts must be labeled as last-check results, not current authoritative totals.
- **Show course** closes the issues modal, navigates to the correct step and year/term (or Unassigned), clears obstructing filters, and focuses the target row/control after rendering. Classification and scheduling-basis issues should target Configure; extraction/placement issues should target Preview. Metadata issues offer **Open curriculum details**, closing this modal before opening the details modal and focusing the field. Do not stack dialogs or allow focus restoration to override destination focus.
- Keep row markers, tab badges, inline field messages, and immediate request failure feedback. This replaces long lists, not actionable local feedback. Group-level issues retain their full context even when no row is linked.
- Keep the modal closed until requested; announce validation results through a compact live status. Closing the modal never resolves or acknowledges an issue by itself. Preserve whole-draft validation and the existing final import gate.
- Verify count accuracy, local/stale/zero-result states, reason persistence, modal handoff and focus, navigation to off-screen courses, and unchanged blocking behavior. Check that Step 4 no longer requires scrolling through the full issue list to reach its actions.

This is a planning/prompt amendment; no application implementation or live visual verification was performed for it.

## Earlier amendment: curriculum details modal and maroon accents

Replace the earlier inline details disclosure proposal with a **Curriculum details** button available in both Preview and Configure. Keep a compact summary of program, effective school year, and proposed/validated internal code beside it; move the large editable form into a dedicated `ImportCurriculumDetailsModal` built on `src/components/ui/Modal.tsx`. Existing `CurriculumDetailModal` serves persisted curricula and should not be repurposed without checking its contract.

- Start with the modal closed. Include curriculum name, Program, effective school year, CMO number, Series, read-only generated code, source program text, and document notes. Preserve existing authorization restrictions and field validation.
- Use the current parent draft as the source of truth. Edits update the import draft immediately; opening/closing alone changes nothing. Label the footer **Done**, with helper text explaining that changes are kept in the draft and the curriculum is created only on import. Close, Escape, and overlay dismissal preserve draft edits. Do not introduce a misleading Cancel action or an additional server save endpoint.
- Keep metadata problems visible outside the modal through a **Needs correction** badge and a compact actionable error summary. An explicit metadata issue action opens the modal and focuses the relevant field. Do not continuously force the modal open while a field is incomplete. Content changes preserve stale-validation behavior and update the proposed code.
- Reuse the shared Modal's focus trap, focus return, accessible title, scroll locking, and responsive body/footer. Use a two-column form on wider screens and one column on narrow screens. Ensure field labels and error descriptions are programmatically associated.
- Add restrained maroon gradient accents using the existing system palette and styling. Source references include `src/components/layout/SystemHeader.tsx` (`#36060b`, `#4e0a10`, `#5A1220`) and `src/components/scheduling/WeeklyTimetableGrid.tsx` (`#4e0a10` to `#3d080c`). Inspect existing shared classes before adding a small reusable style.
- Apply the gradient to a compact import section heading and the details modal header, with readable light text. Keep course rows and form fields on light surfaces; use existing maroon selected-tab styling and gold accents for emphasis. Do not copy image overlays or multiply blending into plain headers.
- If the shared Modal needs header styling support, add one optional header class/variant with its existing default preserved. Avoid CSS selectors that depend on the Modal's internal DOM or a global restyle of all dialogs.
- Verify open/close and keyboard focus behavior, edit persistence, metadata errors while closed, program restrictions, code preview invalidation, and layout/contrast on narrow screens and at zoom. Preserve the Step 2/3 tab work and CMO backend behavior already implemented.

This amendment is a plan/prompt update only. Subsequent source inspection shows shared Step 2/3 tab work is now present; inspect current code before modifying it and avoid repeating completed work.

## Scope amendment: include Step 3 Configure (2026-11-03)

This amendment supersedes the Step-2-only navigation scope and the instruction below to retain Configure's rail. The original planning task made no application changes. A subsequent source inspection now finds `ImportTermTabs` implemented for Preview, while Configure still uses `ImportTermRail` and a separate `activeGroup` selection. Extend the existing implementation; do not rebuild completed Preview work. This finding is based on source inspection, not a live visual check.

- Apply the same full-width year/semester tab navigation to both Step 2 Preview and Step 3 Configure. Keep Step 4's existing layout outside this change.
- Reuse `ImportTermTabs`, grouping helpers, totals, and a shared selection model across Preview and Configure, including Unassigned and the explicit View all courses mode. Preserve the selected group when moving forward or back. Do not translate Unassigned to All courses.
- In Configure, order the content as: compact class-time/settings summary; year and semester tabs; active-term summary; status filters; bulk category actions; course table; action footer.
- Preserve category suggestions, Major/Minor overrides, override reasons, Use rule, lecture/laboratory minutes, and existing validation rules. Status filters operate within the active term and show counts for that term; reset the status filter to All when changing year/term so a stale filter does not misleadingly hide courses.
- Keep bulk operations scoped to selected rows in the currently visible filtered group, preserving the current `selectedInView` behavior. Clear selection when changing the term, status filter, or step to prevent hidden selections from becoming surprising later. Select all means visible rows only.
- Keep whole-draft issue feedback available above the filtered view. Issue navigation clears the status filter, activates the correct term or Unassigned, and focuses the target row. Draft changes still invalidate validation; tab and filter changes do not.
- Keep Back, Validate, and Continue to Import reachable, and ensure the footer does not cover the table. Validate and Import always process the complete draft.
- Add tests for selection continuity between Steps 2 and 3, Unassigned continuity, status counts and filter reset, visible-row-only bulk updates, selection clearing, category/minutes persistence, and issue navigation to hidden terms. Verify Configure on laptop and narrow viewports and with keyboard navigation.

The original CMO/Series code requirements remain in scope for the overall redesign. For this follow-up, inspect and preserve completed backend work; only change it if verification identifies an actual gap.

## Outcome and scope

Review one year and semester at a time instead of scrolling through all 59 courses. Use the supplied underline tab reference with the existing maroon, gold, parchment, typography, and controls. Derive new import codes from CMO number and Series.

Scope: Step 2 layout and navigation, shared import selection compatibility, and server-side code generation for new imports. Preserve extraction, source provenance, course editing, permissions, Configure behavior, whole-draft validation, and atomic import. Existing curriculum codes and manual creation remain unchanged.

## Verified starting point

- `src/pages/curriculum/CurriculumImportPage.tsx` initializes and resets `activeGroup` to `all`. It already derives `termRows` and `visibleRows`, and supports issue navigation to a row's group.
- `src/components/curriculum/import/ImportTermRail.tsx` supplies year/semester navigation, course counts, totals, and mismatch indicators. Preview, Configure, and Import currently share its surrounding layout.
- The footer already uses `sticky bottom-0`; verify its actual scrolling container instead of adding another sticky footer.
- The supplied tall screenshot shows repeated rail imagery. The component is mounted once in the inspected page; verify in a live browser before treating the repetition as a rendering bug.
- Backend `CurriculumCodeGenerator` currently builds `PROGRAM[-MAJOR]-STARTYEAR`, or a department fallback, with numeric collision suffixes. Validation previews it and commit calculates it again.
- `curriculum.code` has a global unique constraint. CMO number and Series are separate nullable fields and their combination is not constrained to be unique.

## Proposed screen structure

1. Keep the import heading, filename, settings, and four-step progress indicator.
2. Use a full-width Preview card; remove the left term rail from Step 2 only.
3. Place a compact curriculum-details disclosure above the courses. Open it initially for metadata review; when collapsed, show program, effective school year, and code. Keep it expanded when metadata needs correction. Move long source notes into a separate disclosure with a note count.
4. Render year tabs: **First Year / Second Year / Third Year / Fourth Year**. Display course counts and attention badges. Use a maroon underline and clear selected text, following the reference.
5. Below them, render **First semester / Second semester / Summer** for the selected year. Show course counts. An absent term is disabled and labeled “Not in source”; an extracted but empty group remains selectable with an explicit empty state.
6. Show a compact active-term summary, for example **6 courses · 17 units**, alongside **Edit table**. Preserve calculated-versus-printed totals and discrepancies.
7. Render only the active term's rows. Retain code, title, lecture/laboratory/total units, prerequisites, and review actions. In read mode the selected year/term need not repeat in every row; keep placement fields available in edit mode.
8. Keep validation status, **Validate**, and **Continue to Configure** in the existing footer. Test its visibility and reserve enough space so it cannot cover the last row or focused control.

This reduces the normal preview from 59 rows to one term, approximately 1–10 rows for the supplied example. It reduces scrolling; it does not promise that every term and expanded metadata fit at every viewport or zoom level. Avoid fixed-height nested vertical scroll areas and pagination for these small term groups. On narrow screens, allow horizontal tab overflow and contain wide-table overflow without widening the whole page.

## Interaction and state rules

- On extraction, select the earliest populated year and semester. If all rows lack valid placement, select **Unassigned** instead.
- Provide an **Unassigned (N)** entry whenever rows have missing or invalid year/term values. These rows must never disappear because the default view is filtered.
- Switching years retains the selected semester if available; otherwise choose that year's first populated semester, then an extracted empty group if necessary.
- Keep edits in the existing full draft, keyed by `row_id`. Tab navigation changes only the view and does not invalidate validation. Content edits retain the existing stale-validation behavior.
- Moving a course to another year/term updates counts and totals immediately. Announce its destination and provide a way to open that group. Keep an emptied active group visible until the user navigates away, avoiding sudden tab changes during editing.
- Preserve the existing optional all-course view as a secondary **View all courses** action, never the initial selection. Returning to term view restores the last selected group.
- Issue links select the correct year/semester or Unassigned view before focusing the row. Whole-draft errors and reviews remain visible in a compact summary even when their rows are on other tabs; selecting an issue takes the user to it.
- Badge labels distinguish errors, reviews, and stale results. A populated tab or matching total alone does not mean the term was validated.
- **Validate** always submits the entire draft, never just visible rows. Continue retains current step-transition rules; final import remains subject to complete server validation.
- Keep Configure's current rail and filtering for this scope. Translate an Unassigned preview selection safely when entering Configure, and restore it when returning to Preview. Do not apply Step 2 visibility changes accidentally to later steps.
- Both tab rows need accessible labels, selected state, associated panels, visible focus, and keyboard navigation. Support Arrow keys and Home/End, skip disabled tabs, and do not rely only on badge colors.

## Internal code proposal

For CMO number `25` and Series `2015`, use **CMO-25-2015** as the generated base. Keep the field read-only and keep both source fields editable. Display a local base preview immediately as “Proposed”; server validation returns the available code, and the commit result is authoritative.

CMO and Series identify the reference used by the curriculum, but the application currently permits multiple curricula to share those values. Recommended policy: retain collision suffixes, producing `CMO-25-2015-2`, `CMO-25-2015-3`, and so on. Do not add a unique constraint to the CMO pair or silently overwrite an existing curriculum.

Recommended missing-data behavior: preserve the existing program/year fallback if both CMO fields are absent, with explanatory text. If only one is supplied, request the missing field or allow both to be cleared. This pairing rule would be a deliberate new import validation rule; do not invent values from the school year.

Normalize CMO number consistently on the server, retain the existing accepted-character and length rules, and validate Series using the existing year bounds. Keep CMO metadata stored separately. Never accept a client-supplied `metadata.code`.

Update the same generator used by validation and commit. Preserve the global database uniqueness constraint and idempotency. Because a CMO-only base can collide across departments, the existing department lock alone cannot serialize allocation: handle a code-specific unique-constraint conflict with a bounded retry of the whole import transaction. Do not swallow unrelated database errors or replay errors as successes. Confirm the chosen retry behavior under concurrent imports before release.

Do not rename previously created curricula or reuse codes reserved by archived records. Changes to CMO fields after creation remain outside this import-only proposal.

## Implementation sequence

1. Add a small `ImportTermTabs` component reusing existing totals, year/term labels, and styling. Extend Preview selection to represent Unassigned without duplicating draft data.
2. Refactor only the Step 2 layout in `CurriculumImportPage.tsx`; reuse `ImportDraftTable`, row detail modal, and source previews. Add the compact metadata disclosure and term header.
3. Update initial selection, issue navigation, placement changes, and compatibility with Configure. Preserve source order within each term.
4. Extend backend `app/Services/Curriculum/CurriculumCodeGenerator.php`, its calls in `CurriculumImportValidator.php` and `CurriculumImportService.php`, pairing validation, and collision handling. Use existing API response fields; no new endpoint or schema migration is expected.
5. Add focused behavioral coverage in `CurriculumImportPage.test.tsx` and backend `tests/Feature/CurriculumImportTest.php`; update import documentation when implemented.

## Acceptance checks

- The 59-course fixture opens on Year 1 / First semester with six visible courses; all 59 remain in the draft and validation payload.
- Switching tabs preserves corrections and source values, and displays the correct course counts and units.
- Year 3 / Second semester still exposes the 30-versus-27 unit discrepancy.
- Summer, absent terms, extracted empty groups, Unassigned rows, and rows moved between groups remain reachable and accurately represented.
- An issue in another term opens that term and focuses the correct row. Hidden errors still block final import.
- Keyboard navigation, narrow screens, typical laptop height, and 200% zoom retain usable tabs, readable controls, and reachable footer actions. Verify live scrolling and the reported rail repetition.
- CMO 25 / Series 2015 produces the proposed base and the server-confirmed code; metadata edits clear stale confirmation.
- Backend tests cover normalization, missing/partial pairs, fallback, collisions including archived records and other departments, concurrent allocation, and request-key replay. Client code injection remains rejected.
- Run the focused frontend and backend suites, frontend type/build checks, and a live visual pass after implementation. This planning task did not run application tests or verify the rendered redesign.
