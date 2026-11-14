# Generate Schedule Modal: Color Hierarchy Audit

Date: 2026-11-14
Scope: the Generate Schedule workflow modal (`YearLevelGenerateScheduleWorkflow` and its step 4 summary). This audit covers only visual styling. Workflow steps, generation, filters, and saving are not changed.

## Existing tokens

| Source | Token | Value | Notes |
|---|---|---|---|
| `tailwind.config.js` | `primary` | `#4e0a10` | System maroon. Very close to the requested Deep Maroon `#4A0D16`. |
| `tailwind.config.js` | `primary.light` | `#640d14` | Hover maroon. The requested Primary Maroon is `#701522`. |
| `tailwind.config.js` | `accent` | `#C9952A` | System gold. The requested Amber is `#F5A623`. |
| `tailwind.config.js` | `parchment` | `#F7F4F0` | Same value as the requested Warm Neutral. |
| `tailwind.config.js` | `stage.warnText` | `#8A5A12` | Dark amber that is readable on light surfaces. |
| `src/index.css` | `.bg-wicars-header` | `#36060b → #4e0a10 → #5A1220` | The system header gradient. |
| `src/index.css` | `table thead th` | vertical maroon gradient | Applies globally, so the generated table header already uses the maroon gradient. |
| `scheduler-dialogs.css` | dialog header/footer | `#faf8f5` | Cream. This is the main cause of the flat look. |

The requested palette is nearly the same as the system palette. The new values are scoped to the generator through CSS custom properties on `.scheduler-generator-workspace`, so the rest of WICARS keeps its current tokens. Amber `#F5A623` reads at only about 2:1 on white, so it is used only for fills, rings, and borders. Amber text uses `#8A5A12`.

## Findings, in priority order

| # | Area | Problem | Severity |
|---|---|---|---|
| 1 | Modal header | It uses a cream `#faf8f5` surface with a dark title. Nothing marks it as a WICARS surface, and the logo, title, and actions have the same visual weight. | High: identity |
| 2 | Footer buttons | Each button stacks Tailwind utilities (`rounded-lg px-4/px-5 font-bold/semibold hover:bg-[#3d080c]`) on top of `.scheduler-dialog-button`. Padding, weight, and hover colors vary from button to button, and the utilities override the shared class because they load later. | High: consistency |
| 3 | Footer surface | The utilities (`bg-white border-slate-200`) contradict the CSS (`#faf8f5`). The footer is not visually separate from the content. | Medium |
| 4 | Stepper | It is a bordered white card inside a white strip, which doubles the framing. The active step is a white circle that looks like an upcoming step, and the Slate grays don't belong to the warm palette. | High: hierarchy |
| 5 | Generation summary | The meeting, class, and section counts sit in one gray sentence on white. They are not separated from each other or tinted as summary information. | Medium |
| 6 | Suggestions notice | The `neutral` tone is white with slate text, so it can't be told apart from the filter bar or the table. Warning and suggestion notices look the same as ordinary content. | Medium |
| 7 | Filters and table | The borders use cool `slate-200` against the warm parchment. An active filter is shown only by its text color. The checkbox uses the browser's blue. The section column has the same weight as the meeting columns. | Medium |
| 8 | Change badges | They use stock `amber-100/800`, which is not tied to the palette. | Low |
| 9 | Header focus ring | The dialog focus color `#8c6420` would be nearly invisible on a maroon header. | Must fix together with #1 |

## Applied fixes

1. Header: a deep maroon gradient (`#4A0D16 → #701522`) with a 1px amber hairline, a white title, an amber eyebrow, a light subtitle, a ringed logo, and translucent header action buttons. The focus ring switches to amber inside the header.
2. Buttons: one size and weight for every footer action (40px tall, or 44px on phones). Primary uses Deep Maroon and turns Primary Maroon on hover. Secondary is white with a warm border and a Soft Maroon hover. Cancel during generation uses its own rose outline variant.
3. Footer: a Warm Neutral surface with a warm divider.
4. Stepper: drops the card frame and sits on a white strip with a hairline divider. Completed steps are maroon with a check and a green "Completed" label. The active step is maroon with a restrained amber ring. Upcoming steps are warm neutral.
5. Summary: a Soft Maroon tinted strip. The three counts are separate stats with maroon numbers. The green "Generated" indicator stays.
6. Notices: `CollapsibleNotice` gives each tone its own tinted header surface (amber for suggestions and warnings, rose for critical). The expanded content stays white.
7. Filters and table: warm borders, an active filter shown with a Soft Maroon fill, and a maroon checkbox. The section column is Deep Maroon. Course code, time, and room each get their own text weight. The mode badges have hairline rings. The table header keeps the global maroon gradient.

## Not changed (future candidates)

- The global table header and system tokens (`#4e0a10`, `#C9952A`) were left alone. Moving the whole app to `#4A0D16` / `#F5A623` should be a separate, app-wide decision.
- The colors inside steps 1–3 (`ConfigurationStep`, `SetupCoursesStep`, `ReviewGenerateStep`) were not changed. They inherit the new header, stepper, and footer.
- `RecommendedAdjustmentPanel` and `DraftIssuesPanel` keep their current notice styling.
