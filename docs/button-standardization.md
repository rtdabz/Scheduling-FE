# Button standardization — audit and priorities

Date: 2026-11-15
Scope: every action button in `wicars-ui` (tables, modals, forms, toolbars, headers, action menus).
Rule: styling only. No handler, permission, label-meaning or workflow changes.

## 1. What the audit found

| Measure | Count |
| --- | --- |
| `<button>` elements in non-test `.tsx` files | 515 (in 159 files) |
| …with no background class of their own (inherit from a CSS class/constant, or are text/ghost) | 307 |
| …using a faint fill (`/5`, `/10`, `-50`, `white/10`) | ~37 (≈15 are real actions; the rest are selection rows/menu items) |
| Separate button style systems | 8 (listed below) |
| Maroon values used for primary buttons | 3: `#4e0a10` (Tailwind `primary`, 90 files), `#5A1220` (54 files), `#701522` (activity log) |

### Button style systems in use before this change

| System | Where | Problem |
| --- | --- | --- |
| `modalButton` | `components/ui/modalStyles.ts` | Good baseline, but only used in 4 places |
| `TableActionButton` | `components/ui/TableActionButton.tsx` (19 files) | Pastel `-50` fills with `-200` borders: reads as a disabled/decorative chip; rainbow of sky/violet/blue/amber that doesn't map to meaning (Edit is amber = "warning") |
| `ConfirmModal` confirm button | `components/ui/ConfirmModal.tsx` | Own copy of the button recipe; warning uses `amber-600` not WICARS amber |
| Header buttons | `layout/headerStyles.ts`, `scheduling/timetableStyles.ts`, Modal close | `bg-white/10` on maroon: translucent, low contrast |
| `.scheduler-dialog-button` | `styles/scheduler-dialogs.css` | 44px tall, own colors; disabled = `opacity .5` |
| `.assign-button` | `AutoAssignModal.css` | Own colors and shadows; disabled = `opacity .45` |
| `.transfer-button` | `RoomReassignmentPanel.css` | 6px radius (everything else is 8–10px) |
| Page constants | `CurriculumImportPage.tsx`, `vpaa/activityLog/styles.ts` | Copies of the recipe at different heights and in `#701522` |

### Cross-cutting problems

1. **Disabled = `opacity-50` everywhere.** A pastel action button at full opacity and a disabled solid button at 50% look alike, so active buttons read as disabled and the reverse.
2. **No single maroon.** Primary buttons use three different maroons.
3. **Heights drift:** 28, 32, 36, 40 and 44px all appear for the same kind of action; radius drifts between 6, 8, 10, 12px and full pills.
4. **Focus rings differ** (gold, maroon, slate, none).

## 2. The standard

One recipe in `components/ui/buttonStyles.ts`, used by `Button`/`IconButton` and by every shared constant. CSS-based systems read the same values from the `--btn-*` custom properties in `index.css`.

| Variant | Use | Look |
| --- | --- | --- |
| `primary` | The one main action in a view/dialog | Solid maroon `#4e0a10`, white text, hover `#640d14`, pressed `#34070a` |
| `secondary` | Cancel, Back, Export, View, filters | White fill, `slate-300` border, `slate-800` text, hover `slate-100` |
| `danger` | Delete, Remove, Reject (final) | Solid `red-600`, white text |
| `dangerSoft` | Destructive actions that open a confirm step, row-level remove | White fill, `red-300` border, `red-700` text, hover `red-50` |
| `success` | Approve, Confirm, Publish | Solid `emerald-700`, white text |
| `successSoft` | Row/card-level Activate, Mark available | `emerald-50` fill, `emerald-300` border, `emerald-800` text |
| `accentSoft` | Edit and other "change this" actions beside neutral ones | Light maroon fill `#F6ECEC`, maroon border and text |
| `warning` | Return, Override, Force actions | Solid WICARS amber `#F5A623`, dark brown text (white on amber fails contrast) |
| `ghost` | Inline text links inside dense content only | No fill, maroon text, hover tint |
| `onDark` | Main button on a maroon header | Solid white, maroon text (replaces `bg-white/10`) |
| `onDarkMuted` | Other controls on maroon (close, Back, view toggles) | Solid lighter maroon `#6b1a24`, light edge, white text; a pressed toggle turns solid white |

### Table row actions: always colored

Action buttons inside table rows always have a solid colored fill. Outside tables, the variants above apply (secondary stays white with a border). Table rows use the `*Tint` variants, and `TableActionButton` maps to them automatically:

| Variant | Row action | Look |
| --- | --- | --- |
| `infoTint` | View, Show | `sky-100` fill, `sky-300` border, `sky-800` text |
| `accentTint` | Edit | Maroon tint `#F3E3E4`, maroon text |
| `successTint` | Approve, Activate, Restore | `emerald-100` fill, `emerald-800` text |
| `warningTint` | Archive, flagged-value fixes | `amber-100` fill, `amber-900` text |
| `dangerTint` | Remove, Deactivate, Delete rule | `red-100` fill, `red-800` text |
| `neutralTint` | Print, Copy, Cancel | Warm neutral `#EDE6DF`, dark text |
| `danger` | Delete (final) | Solid `red-600`, white text |

Use the `*Tint` variants only for table row actions.

Sizes: `xs` 24px (compact table cells only) / `sm` 32px / `md` 36px (default) / `lg` 40px (dialog footers). Radius 8px (6px on xs). Text 13px semibold (sm 12px). Icon 16px, gap 8px (6px on sm).
Icon buttons: square at the same three heights, always with a visible fill and border.
States: hover darkens one step; `active` darkens two; focus-visible = 2px gold (`#C9952A`) ring with offset.
Disabled (all variants): `slate-100` fill, `slate-200` border, `slate-400` text, no shadow, `cursor-not-allowed`. No opacity tricks.

**Maroon decision:** buttons use the Tailwind `primary` token `#4e0a10`. It is the sidebar/header color and the most widely used value. `#5A1220` and `#701522` are drift and should be folded into `primary` when their pages are touched (P2). If `#5A1220` is the intended brand value instead, change `primary` and `--btn-primary` in one place and every button follows.

## 3. Priorities

### P0 — shared foundation (most reach per line changed) ✅ done in this pass
1. `buttonStyles.ts` + `Button` + `IconButton`, and `--btn-*` tokens in `index.css`.
2. `modalButton` → built on the recipe (all modal footers that use it).
3. `ConfirmModal` confirm button → recipe; warning uses WICARS amber (every confirm dialog in the app).
4. `TableActionButton` → semantic, visible fills (every table row action in 19 files).
5. Header buttons on maroon: `HEADER_ICON_BUTTON`, `TIMETABLE_HEADER_BUTTON`, Modal close.
6. CSS systems (`.scheduler-dialog-button`, `.assign-button`, `.transfer-button`) → shared tokens, real disabled state, 8px radius.
7. Page constants (`CurriculumImportPage`, activity log `styles.ts`) → recipe.
8. `LoadErrorBanner` retry button.

### P1 — faint-filled action buttons ✅ done in this pass
| File | Button(s) |
| --- | --- |
| `components/curriculum/CurriculumCard.tsx` | View / Edit / Copy / Lock / Archive row of actions |
| `components/curriculum/CurriculumArchiveModal.tsx` | Restore |
| `components/overview/ScheduleProgressCard.tsx` | Card footer action |
| `components/ui/DepartmentScheduleStatus.tsx` | Inline action |
| `pages/ClassSchedules/CourseTeachingAssignments.tsx:617` | Toolbar action |
| `pages/curriculum/CurriculumImportPage.tsx:578` | Remove chip |
| `pages/shared/Faculty.tsx:1002` | Edit icon |
| `pages/shared/RoomRequests.tsx:821` | Toolbar action |
| `pages/shared/Rooms.tsx` (915, 1048, 1063, 1071) | Room card actions |

Not changed on purpose: selection rows, list options, tabs, segmented toggles and menu items that use `/5` tints to show *selection*. They are choices, not actions, and the tint is their selected state.

### P2 — migrate remaining inline buttons (do when a page is next touched)
Replace hand-written class strings with `<Button variant=… size=…>` / `buttonClass()`. Files with the most hand-styled buttons:
`curriculum/CurriculumImportPage.tsx` (20), `vpaa/Departments.tsx` (14), `SchedulerPanel/Modals/AutoAssignModal.tsx` (13), `shared/RoomRequestModals.tsx` (13), `GenerateSchedule/YearLevelGenerateScheduleWorkflow.tsx` (10), `vpaa/Settings.tsx` (9), `shared/Faculty.tsx` (8), `vpaa/Users.tsx` (8), `vpaa/ActivityLog.tsx` (7), `vpaa/archive/ArchivePanel.tsx` (7).
Also fold `bg-[#5A1220]` (18 buttons) and `bg-[#701522]` into `primary`.

### P3 — polish
- Dropdown action menus: shared `menuItemClass` (36px rows, icon gap 8px, red text for destructive items).
- Lint rule or test that flags new `<button className="…bg-…">` outside `components/ui`.

## 4. How to use

```tsx
// No path alias in this project: import relatively, e.g. from src/pages/x/Page.tsx
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { buttonClass } from '../../components/ui/buttonStyles';

<Button variant="primary" icon={<Save size={16} />}>Save changes</Button>
<Button variant="secondary" size="lg" onClick={onCancel}>Cancel</Button>
<IconButton label="Delete room" variant="dangerSoft"><Trash2 size={16} /></IconButton>
<Link className={buttonClass({ variant: 'secondary', size: 'sm' })} to="…">Open</Link>
```

Don't add `!important` overrides on top of a variant: they beat the disabled styles. Add or adjust a variant in `buttonStyles.ts` instead.

One `primary` per view or dialog. Put destructive actions on the left of a dialog footer, or behind a `dangerSoft` button that opens a confirmation.
