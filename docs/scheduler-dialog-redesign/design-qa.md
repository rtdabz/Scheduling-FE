# Scheduler dialog redesign QA

Date: 2026-11-09

final result: passed

## Visual truth and comparison

The user supplied a 558 x 697 screenshot of Submit schedule and confirmed the scope as all scheduler dialogs and confirmation flows. This is an intentional redesign using that dialog and the existing application palette, rather than a pixel-for-pixel clone.

The same pre-change component and redesigned component were rendered with identical 18-section fixtures at a 558 x 697 CSS viewport and deviceScaleFactor 1. Source: [source-558.png](source-558.png). Implementation: [submit-558.png](submit-558.png). Both images were opened together for comparison. The supplied attachment's display scaling is unknown; the reproduced component provides the normalized 1x baseline. The original user screenshot remains the product reference.

Full-size desktop and mobile captures were inspected, including submission, checklists, recall, instructor assignment/selection, room occupancy, alternatives, conflict resolution, generation, manual placement, and configuration. Focused views included the section list/actions, mobile selection controls, and short-screen header/field/footer behavior. No raster assets require separate region inspection.

## Findings and corrections

- Fixed: exact readiness replaces the old approximate width buckets. The submission summary distinguishes the current revision from protected sections.
- Fixed: bespoke confirmation frames now reuse shared focus and scroll handling. Only the top dialog handles Escape; save-time controls cannot dismiss an action in flight.
- Fixed: shared focus handling excludes controls disabled through a fieldset and moves focus to the dialog when an active action becomes busy. Permanent regression checks cover both cases.
- Fixed: short landscape screens could scroll the heading out of view when focusing Cancel. Sticky headers and footers keep both controls available. Compact chrome, a single scrolling generator workspace, and native scroll padding prevent fields from being hidden behind the sticky controls. The persistent header also covers the generator's existing step markers correctly while scrolling.

No remaining P0/P1/P2 findings in the checked fixtures.

## Required visual surfaces

- **Fonts and typography:** Existing DM Sans and Playfair Display are retained with production font loading. Serif titles, quieter descriptions, wrapping labels, and tabular readiness counts give consistent hierarchy. Existing compact generator step labels remain; they are not a new route or workflow.
- **Spacing and layout:** Shared 20px frames, cream headers, white content, warm borders, and 40–44px controls replace inconsistent shells. Larger workspaces retain their width. Mobile actions wrap; long lists scroll within the viewport. Short screens allow the frame to scroll with persistent header/footer controls.
- **Colors and tokens:** Maroon `#4e0a10`, gold `#c9952a`, cream, and semantic emerald/amber states follow the product's palette. Destructive confirmations retain red actions and the permanent-delete warning. Protected status is named explicitly.
- **Image quality and assets:** Reuses existing Lucide icons and existing department logos. No generated or placeholder raster artwork, new icon system, or production dependency was added.
- **Copy and content:** Submission names the Dean and gives the actual revision count. Reset warnings, recall stage/released-instructor warnings, blocked choices, instructor restrictions, and existing save/approval behavior remain. The primary submit label is now “Submit to Dean.”

## Follow-up: manual section selection

The user requested no automatic section choices. All action checklists now open unchecked, including the current timetable section. Switching generation/configuration from All to Selected starts empty; reopening an intentionally saved subset retains that subset. Manual Select all is still available. Reset and Recall reopen unchecked, and Recall excludes choices that become ineligible.

Verified with 17 focused component checks, scoped lint, a production build, and 19 browser interaction checks. Current evidence: [manual-selection verification](verification-manual-selection.json), [Finalize unchecked](finalize-manual-selection-390.png), [Recall unchecked](recall-manual-selection-390.png), [generation selection](generator-manual-selection-1440.png), and [course configuration selection](configure-manual-selection-1440.png). The older captures below document the original redesign and its former defaults.

## Initial verification

- Production TypeScript/Vite build passed.
- 166 distinct focused component checks passed: 20 shared/submission/checklist checks, 58 placement/faculty/room/alternatives/conflict checks, and 88 bulk-assignment/generator checks. Initial contention caused timeouts; affected cases passed with one worker and CLI-only time limits. No test timeout configuration was changed.
- 64 browser layout checks cover 16 dialog fixtures at 1440 x 900, 390 x 844, 320 x 568, and 844 x 390, all at 1x density. Frames and close controls remain within the viewport without document-wide horizontal overflow. Short-screen actions and generator fields remain reachable.
- 17 browser interaction checks cover protected/blocked/busy submission states, long-list scrolling, checklist selection defaults and empty-selection guards, recall eligibility and release warnings, nested picker Escape handling, save-time dismissal guards, Tab looping, and focus restoration.
- Final browser runs recorded zero console errors and zero runtime exceptions. See [verification.json](verification.json); it aggregates the successful desktop/mobile checks and the corrected landscape run. The original landscape failure is retained as evidence of the resolved issue.
- Scoped lint found no new issues in the shared behavior, submission component/tests, and helper. Existing lint findings remain in ToastContext, conflict reload, and generator state/ref effects; the existing Drop dependency warning also remains. The withdrawal selection reset effect was removed in the manual-selection follow-up.
- Whitespace checks passed.

The browser harness imports the real components and replaces its API transport with isolated in-memory fixtures. No authenticated schedule mutation, production approval, backend change, manual assistive-technology audit, or exhaustive data-volume test was performed.

## Implementation checklist

- [x] Write and save the design plan before implementation.
- [x] Opt scheduler workflows into a shared appearance; preserve other application modal defaults.
- [x] Apply the visual language to all scheduler dialog entry points, including generator side panels and final confirmations.
- [x] Preserve eligibility, callbacks, reset preview/token, warnings, permissions, and API contracts.
- [x] Verify real components across desktop, mobile, landscape, and core interaction states.
- [x] Preserve pre-existing work in both checkouts.

Local fixture preview: http://localhost:5173/scheduler-dialog-preview.local/
