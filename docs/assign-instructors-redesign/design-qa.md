# Assign Instructors design QA

final result: passed

Previous [Room Transfer QA](docs/room-transfer-redesign/design-qa.md) is preserved separately.

## Source and comparison evidence

Source visual truth: `assign-instructors-preview.local/evidence/before-01-build.png`, `before-03-review.png`, `before-04-confirm.png`, and `before-07-mobile-build.png`, captured from the existing component before edits. The referenced screenshot attachment was not available.

Implementation screenshots are in `docs/assign-instructors-redesign/`: `01-build.png`, `03-review.png`, `04-confirm.png`, `05-mobile-confirm.png`, `07-mobile-build.png`, `08-conflict-reason.png`, `09-mobile-selected.png`, and `10-small-desktop.png`.

Source and implementation desktop captures: 1440×1000 image pixels and CSS viewport, deviceScaleFactor 1. Mobile: 390×844 image pixels and CSS viewport, deviceScaleFactor 1. No density normalization or stretching was applied. Both sets use the same IT 101 course, instructors, seven sections, linked meetings, conflict, and existing assigned section. Review/confirmation show one queued class with two meetings.

Combined before/after files were opened and inspected: `01-build-comparison.png`, `03-review-comparison.png`, `04-confirm-comparison.png`, and `07-mobile-build-comparison.png`, all under `docs/assign-instructors-redesign/`. Desktop comparison images are 2896×1032px and mobile 796×876px, including labels. The focused `instructor-detail-comparison.png` compares native-scale 376×260px and 374×260px crops to check names, employment/status, load, and selected state.

## Findings and iteration history

1. [P2, resolved] A mobile capture clipped the title after opening a course with a hidden conflict explanation. Positioned the scrolling body and footer to contain absolutely positioned screen-reader text. Final metrics show dialog scrollHeight and clientHeight both 828px at 390×844. Final mobile captures retain title/close controls.
2. [P2, resolved] The initial sticky selection bar obscured the section heading before selection. It now sticks only when sections are selected. `07-mobile-build.png` shows the unobstructed initial flow; `09-mobile-selected.png` shows the selected section and visible Add action.
3. [P2, resolved] A changed pending conflict left the confirmation heading reading “Ready to save,” although validation blocked saving. The heading now uses the existing blocked result. A regression test verifies the corrected message and disabled save button.
4. [P3, addressed] Removed repeated employment group headings and combined numeric load/bar into one row. Employment information and the existing ordering remain.

No actionable P0/P1/P2 findings remain in the inspected states. Frame size, typography weights, scrolling, and hierarchy intentionally differ from the old layout according to the redesign brief.

## Required fidelity surfaces

- **Typography:** Existing DM Sans/Playfair Display declarations remain; excessive 900-weight UI text becomes semibold. Names, course details, and explanations wrap. Source/final captures use matching fallbacks; external font delivery was not checked.
- **Spacing/layout:** 1360px cap; desktop 3fr/7fr grid; 16px gaps; 40–45px progress row; compact instructor entries; fixed footer; mobile table reflow. Header/footer remain visible without horizontal dialog overflow.
- **Colors:** Existing maroon `#4e0a10`, white, cream `#f7f4f0`, and neutral borders. Available/conflict/assigned states include text and icons. Permitted overload uses amber. No gradients or decorative cards were introduced.
- **Assets:** Existing Lucide and ProfileAvatar assets are reused. No generated imagery or production dependencies were needed.
- **Copy/content:** Shorter instructions and explicit selected/pending counts. Full conflict reasons remain expandable. Employment/status, loads, linked meetings, modes, units, removals, and validation are retained. Blocked confirmation copy is accurate.

## Verification and limits

- 12 focused tests passed, retaining the original four. They cover grouped saves, all three steps, failed-save retry, filters, unit limits, conflicts, focus restoration, scroll lock, Escape, and saving protection.
- Targeted ESLint and production TypeScript/Vite build passed.
- Chromium exercised selection → add → review → confirm → save with fixture callbacks and real Tab/Shift+Tab focus wrapping. No runtime exceptions were recorded.
- Axe: zero WCAG A/AA violations in build, review, confirm, mobile confirm, and mobile build. Results are saved as `docs/assign-instructors-redesign/a11y-*.json`.
- Chromium retained table/row/cell roles on mobile; see `mobile-table-semantics.json`.
- `responsive-checks.json` records 320×740, 390×844, 768×1024, 1024×768, 1440×1000, and 1920×1080: no dialog overflow/clipping, visible footer, and desktop pane ratio approximately 0.4286 (3/7).

Live authenticated saves, manual screen-reader testing, and external font delivery were not performed. Automated checks do not establish full accessibility compliance.

## Implementation checklist

- [x] Preserve existing assignment rules, filters, grouped selection, load limits, removals, and save payloads.
- [x] Inspect combined full-view and focused evidence.
- [x] Resolve mobile clipping and action placement.
- [x] Verify the complete workflow, retry behavior, and changed conflicts.
- [x] Verify keyboard behavior, responsive geometry, and automated accessibility.

The sample preview remains at `/assign-instructors-preview.local/` on the existing Vite server. It uses the actual component and isolated fixture callbacks; it does not alter real assignments or login storage.
