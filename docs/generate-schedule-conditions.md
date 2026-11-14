# Generate Schedule: scheduling conditions

Audited 2026-11-14. This covers every warning and notice the Generate Schedule workflow shows (`SchedulerPanel/GenerateSchedule/*`). The change is presentational only. The conditions that trigger each message, the message wording, the search budget, Preferred Days rules, and generation behaviour are unchanged.

## Inventory of existing warnings

| Step | Message | Trigger | Current form | Placement |
| --- | --- | --- | --- | --- |
| Review & Generate | **Already scheduled**: "N of M sections already have classes. Generating again replaces those draft classes when you save the result." | `yearState.kind === "scheduled"` | Amber bordered banner with a heading and body (`YearLevelStateNotice`) | Between the scope header and the Course plan / Rules panels |
| Review & Generate | **Locked**: "Classes in N of M sections are past drafting…" | `yearState.kind === "locked"` | Rose bordered banner | Same |
| Review & Generate | Split load: "N courses are split into two meetings… raises the search budget…" | Hybrid + split courses ≥ 3 | Amber banner | Same, stacked |
| Review & Generate | Preferred Days: "Classes are limited to the Preferred Days (…)…" | Any Preferred Day set | Amber banner | Same, stacked |
| Review & Generate | Blocked reason (why Generate is disabled) | `blockedReason` | Rose `role="alert"` line; it replaces the notices above | Same |
| Review & Generate (running) | Worker stalled | `run.workerStalled` | Amber line inside the progress view | In the running view |
| Setup Courses | Component Required Days were adjusted | After a save that moved days | Amber banner with **Dismiss** | Above the course toolbar |
| Setup Courses | Every course is unchecked | No course included | Rose `role="alert"` | Above the table |
| Setup Courses | Same-day concentration | Every Required Day course lands on one day | Amber `role="alert"` | Above the table |
| Configuration | Required Days excluded by Preferred Days, Friday/Saturday pairing unavailable, and similar | Per control | Small inline `Notice` inside the card it describes | Next to its control |

## Findings, by priority

| # | Finding | Fix | Priority |
| --- | --- | --- | --- |
| 1 | On Review & Generate, up to three full-width banners (year-level state, split load, Preferred Days) stack between the scope header and the Course plan / Rules panels. Each is two to three lines, so together they push the configuration panels down by about 110–150px. They are also styled inconsistently: one has a bordered card with a heading, two are borderless strips. | Replace them with one collapsible **Scheduling conditions** component: a single 40px row when collapsed, and the full original text when expanded. | P0, done |
| 2 | Nothing tells the planner how many conditions apply or how serious they are. A blocking-level state (Locked) looks almost the same as an advisory one. | Show the count in the summary row. Each notice gets its own icon and tone. If any notice is critical (Locked), the summary turns rose and the component starts **expanded**. | P0, done |
| 3 | The blocked reason explains why Generate is disabled. Hiding it would leave the button unexplained. | Leave it as an always-visible `role="alert"` outside the component. When it shows, the conditions are hidden, as before. | P0, kept |
| 4 | Setup Courses can show a dismissible notice, an error, and a concentration warning together above the table. | The error and the dismissible feedback are not conditions and should stay. The concentration warning could move into the same component if Setup gains more advisory notices. With one advisory notice, a collapsible adds a click for no space saving. | P1, open |
| 5 | Configuration's inline `Notice`s sit inside the card whose control they describe. | Keep them inline, since their meaning depends on what they sit next to. Optionally align their styling with the new component's rows. | P2, open |
| 6 | The worker-stalled notice in the running view is a single line in a centred layout with plenty of room. | No change. | — |

## Behaviour of the new component

`SchedulingConditions.tsx`, used by `ReviewGenerateStep.tsx`:

- **Collapsed (default).** One row containing a warning icon, the "Scheduling conditions" label, a count pill, the short line "May affect how this run is generated", and a chevron. The whole row is a button with `aria-expanded` and `aria-controls`.
- **Expanded.** A list of every active notice with divider lines between them. Each row has its own icon (calendar for the year-level state, lock for Locked, split arrows for split load, calendar range for Preferred Days), a short title, and the **unchanged original message**.
- **Critical notices.** The component starts expanded and the summary icon and count turn rose, so a Locked state is never hidden behind a click. It can still be collapsed.
- **No data dropped.** The notices are always rendered. Collapsing animates the row height (`grid-template-rows`, about 200ms, off under `prefers-reduced-motion`) and marks the hidden list `inert`, so it stays in the DOM and is restored exactly as it was.
- **Responsive.** The summary line truncates on narrow screens, and the label, count, and chevron stay visible. Expanded rows wrap.
- **Count and visibility.** The count comes from the same conditions as before. With no active conditions the component renders nothing.

`YearLevelStateNotice`'s banner component was used only here. It is replaced by `yearLevelStateCondition()` in `yearLevelStateCondition.ts`, which returns the same title and text for the new component. `YearLevelStateBadge` (Configuration step) is unchanged.

## Result screen: Suggestions (added 2026-11-14)

After a run, the result screen showed a full-height **Suggestions** card between the summary line and the timetable filters. It had its own heading, a nested bordered list, and a card per suggestion, about 130px for a single suggestion.

- It is now the same compact pattern. One row shows a lightbulb icon, **Suggestions**, a count, and "Optional changes that may improve this timetable". It starts **collapsed** because suggestions are optional, unlike a Locked condition.
- Expanded, it shows the unchanged `RecommendationList`: each suggestion's target, reason, its own apply button, option chips, effect text, "Apply all" when more than one can be combined, the "Needs a manual change" items, and the "Resolved" list. In `embedded` mode the list drops its own heading and outer border, since the shell provides both.
- The count comes from the same `groupRecommendations()` grouping the list renders (groups plus manual changes), so it matches what opens below it.
- The failure dialog (`RecommendedAdjustmentPanel`, "Recommended fixes") is unchanged and fully visible. A failed run needs its fixes in front of the planner.
- The summary line above ("102 class meetings generated · 54 classes · 6 sections…") was already a single compact row and is unchanged.

The collapsible shell is shared as `CollapsibleNotice.tsx`. `SchedulingConditions` and Suggestions both use it, so they look and behave the same.

## Verification

- `tsc --noEmit` and ESLint on the changed files passed.
- All 240 Generate Schedule tests pass (20 files), including a new Suggestions case (collapsed by default with the count, opens on request). That also includes the workflow test that expects "Already scheduled" before Generate, and 5 new `SchedulingConditions.test.tsx` cases: no conditions renders nothing, collapsed by default with the count, expand and collapse, a critical condition opens it, and a critical condition arriving later opens it.
- **Not yet checked in a browser.** The local seed has no Program Head or Secretary account to open the generator with.
