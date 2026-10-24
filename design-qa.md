# Room Transfer schedule preview design QA

final result: passed

## Follow-up correction — 2026-10-24

A deeper comparison also found that transfer rejection still used a generic confirmation form. The existing regular Schedule Approval rejection form is now extracted as `ScheduleRejectionModal` and shared by both paths. The regular form's before/after screenshots are pixel-identical. An identical 27-meeting sample produced two-page PDFs with matching text, unchanged-text positions and table/signature/footer geometry; only the proposed room cells are highlighted. Current comparison artifacts and the detailed findings are in the task workspace's `output/approval-format-audit/` folder. The in-app browser's blank embedded PDF surface was verified separately through downloaded and rendered PDF pages.

The expandable-list behavior described in the earlier evidence below has been replaced. View Details now opens the existing revision-diff table modal, extracted as `ScheduleChangesModal` and shared with regular Schedule Approval. The preview continues to use `ScheduleApprovalPreviewModal` and `buildSchedulePdf`. Room transfers now supply real scoped official records through `preview_users`; the fabricated Secretary record was removed. Focus returns to View Details after dismissing the changes modal. Current verification covers pagination beyond 25 changes, ordinary revision details, actual generated PDF names/designations/placements, and the Secretary → Dean → VPAA workflow. The browser check used isolated fixture responses, without applying production approvals.

Previous [Secretary modal QA](docs/secretary-room-transfer-redesign/design-qa.md) and [unified approval verification](docs/unified-approvals/README.md) are preserved.

## Source and scope

The requested first screenshot was not attached to this message. The explicitly named existing Schedule Approval preview was used as the visual reference, captured from its pre-change component in `transfer-schedule-preview.local/ScheduleApprovalPreviewModal.source.tsx`. Source images: `docs/room-transfer-schedule-preview/source-schedule-preview-desktop.png` and `source-schedule-preview-mobile.png`. This is a comparison against the actual existing interface, not a claim of matching an unseen attachment.

The Dean/VPAA Room Transfer Request Details presentation now reuses ScheduleApprovalPreviewModal and its PDF viewer. A Changes Summary replaces the separate paginated details table. It shows two changes initially, physical schedule count, original/proposed room and day/time, and View Details expands the complete scrollable list. Existing confirmation and decision handlers remain in use. The approval page, Secretary monitoring presentation, approval sequence and final-application rules are preserved.

## Evidence and comparison

Implementation captures are in `docs/room-transfer-schedule-preview/`: `01-transfer-preview-desktop.png`, `02-expanded-changes.png`, `03-dean-confirmation.png`, `04-rejected-preview.png`, `05-vpaa-preview.png`, `06-vpaa-confirmation.png`, responsive previews/expanded lists, `09-preview-failure.png`, and `10-dean-mobile.png`.

Both primary desktop captures are 1440 x 1000 image pixels and CSS viewport; both primary mobile captures are 390 x 844. Device scale factor is 1. Additional implementation viewports: 320 x 740, 768 x 1024, and 1440 x 1000. No image stretching or density normalization was applied.

Opened and inspected these combined inputs:

- `desktop-comparison.png` (2904 x 1040): pending Dean source and transfer preview, same viewport, theme and density.
- `mobile-comparison.png` (804 x 884): pending Dean source and transfer preview at 390 x 844.
- `header-comparison.png` (2584 x 110) and `footer-comparison.png` (2584 x 100): native-scale 1280px crops of the shared frame and actions.
- `pdf-changes-comparison.png` (2338 x 146): matching first-course regions from the regular and proposed PDF pages, rendered at 1.5 scale. Each crop uses the same page width and height, aligned to the first course row.

The source contains one section with a physical and online class; the proposal contains six physical meetings across two sections and a changed Friday time slot. Content, proposal banner, summary height and PDF page count intentionally differ. Native PDF zoom can vary by document/page count; frame/layout judgments use the full-view comparison, while document typography and changed cells use normalized PDF artifacts.

## Findings and fidelity

No actionable P0/P1/P2 differences remain. The first completed source/implementation visual comparison passes. The new summary, shorter request title, proposal highlighting and responsive heading wrapping are intentional changes. No visual fix was required after that comparison.

- **Typography:** Existing DM Sans body and Playfair Display headings remain. The PDF embeds DM Sans and Playfair Display, as confirmed from the generated document. Names, status and room/time changes wrap on narrow screens; controls remain visible.
- **Spacing/layout:** Reuses the white header, bordered cream frame, PDF area and fixed action footer. Summary expansion uses a bounded scrolling region so the document and Approve/Reject/Close actions remain accessible. The existing approval page was not redesigned.
- **Colors:** Existing maroon actions, cream/white surfaces, neutral borders and status badges remain. Proposed PDF room/day/time changes use pale amber fill and bold maroon text; the proposal label explicitly states that viewing does not apply changes.
- **Assets:** Existing TCC/municipal assets, optional department-logo behavior and Lucide controls are reused. No new raster assets, decorative artwork or production dependencies were added.
- **Copy/content:** Summary includes affected class/section, before/after rooms, original/proposed day/time and physical schedule count. Rejection reason remains visible. The PDF uses stored proposal placements and captured class/section labels; catalog metadata supplies course descriptions/units. Historical request semester metadata is used independently of the active queue.

## Verification

- 111 targeted frontend regression tests passed. The final helper/preview checks also passed after extending the complete-list case to 24 physical schedules and checking captured labels against renamed catalog labels.
- 80 backend tests passed for room recovery and schedule approval targeting. Additional assertions verified readable proposed PDF data, correct semester/course/section information, online exclusion, complete stored plan membership and unchanged schedules before final approval.
- Production TypeScript/Vite build, targeted ESLint, PHP syntax and whitespace checks passed.
- 37 headless Chromium checks passed with the actual components and isolated fixture responses. Includes PDF generation, collapsed/full change list, PDF reuse on expansion, no schedule mutation while viewing, both approval stages, rejection, status update, cancellation, nested scroll restoration, notification links, keyboard focus, responsiveness and PDF failure fallback. No browser console errors or runtime exceptions were recorded. See `verification.json`.
- Axe reported zero WCAG A/AA violations in inspected preview/confirmation states at 320, 390, 768 and 1440px. Results are saved as `axe-*.json`.
- 14 independent PDF checks passed (`pdf-verification.json`): both Dean and VPAA documents contain all six proposed rooms, the correct changed day/time and stage label, exclude online classes, and contain eight highlighted cells (six rooms plus one day/time change).
- The regular schedule PDF remains pixel-identical to its pre-change render at native scale, with the same page count and online class included. It has no proposal banner. Before/after PDFs are preserved as `source-schedule.pdf` and `regular-schedule-after.pdf`.

Authenticated production approvals, manual screen-reader testing and very large historical-queue load testing were not performed. Automated checks do not establish full accessibility compliance. Missing academic metadata or PDF generation failures retain the full changes summary and existing review controls without inventing schedule information.

## Implementation checklist

- [x] Reuse the existing schedule preview and PDF viewer.
- [x] Replace only the reviewer details presentation; preserve queue and decision logic.
- [x] Expand the complete physical change list without table pagination or PDF regeneration.
- [x] Render stored proposals as copies with highlighted room/day/time changes.
- [x] Preserve Secretary -> Dean -> VPAA approval and final-only schedule application.
- [x] Verify regular online approvals and unchanged regular PDF rendering.
- [x] Inspect full-view and focused comparisons; verify responsiveness, keyboard behavior, build and regressions.

Local sample preview: http://localhost:5173/transfer-schedule-preview.local/?linked
VPAA sample: http://localhost:5173/transfer-schedule-preview.local/?stage=vpaa&linked
Both use isolated fixtures and do not approve or change real schedules.
