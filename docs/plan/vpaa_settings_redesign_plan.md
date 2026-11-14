# VPAA Settings redesign and workflow

Date: 2026-11-09. Status: implemented following approval to proceed. The original planning specification is retained below as a dated baseline.

## Implemented behavior

- One URL-aware settings menu displays one section at a time, retaining the existing main sidebar and maroon/gold theme. Drafts survive section changes. Leaving Settings through navigation or browser history requires a discard decision; refresh/close uses the browser's native unsaved-change warning.
- Academic Semesters always groups records into three cards. The active context is prominent. Where several years exist, each card can select a saved academic year. Active/used identities are locked; **Prepare another academic year** creates a separate inactive period using the existing semester creation endpoint. New Summer periods start disabled. Existing period records, schedules, and history are retained.
- Summer availability is saved independently from activation and can change only while 2nd Semester is active. Disabled Summer cannot be activated; active Summer cannot be disabled. No local auto-reset of Summer availability occurs.
- Activation compares the confirmed academic year and active context with saved state, rejects stale confirmations, and treats repeat activation as a no-op. Ordered transaction locks protect active-context changes. Schedules, sections, submissions, and all existing Schedule History remain unchanged. Following the completed-schedule history fix, activation also adds an immutable snapshot of each outgoing department's VPAA-approved schedules, visible under Schedule History → Semester snapshots, and links it from the Ended audit event. This adds history without archiving or deleting live rows; the dated proposal below describes the earlier no-new-snapshot policy.
- Operating hours place three compact inputs before the slim preview, with explicit field cutoff, range/slot validation, draft feedback, discard, and a bottom-right Save action. Saving time settings does not reschedule existing classes.
- Signatory details and the live signature-block preview use a compact two-column layout. The shared footer contains Discard and Save. Failed loads display Retry instead of editable fallback defaults.
- Historical exports retain stored signatories. Closed legacy records without snapshots and history exports without recorded officials display **Not recorded** instead of today's officials. Existing stored/backfilled snapshots are preserved; missing original names cannot be reconstructed. PDF signature names and designations wrap within their cells.
- Activation History lists event actions, actor, event-time academic year, and timestamp. New events store immutable identity/actor details; legacy missing years remain **Not recorded**, and no end events are fabricated. The server's configured timezone is returned in the exposed `X-Timezone` header; the UI labels its timezone explicitly, using UTC only when that header is unavailable/invalid.
- Existing VPAA semester recovery remains available through **View archived semesters**; no new archiving action was added. All sections distinguish load failures from empty states and retain drafts after failed writes. Initial-load generation guards prevent stale responses from erasing edits.

The router now uses React Router's existing data-router API with the same route definitions so its supported navigation blocker can protect drafts. The router is initialized once outside React to avoid StrictMode duplicate listeners. No database migration or dependency was added.

## Verification and remaining limits

- Settings behavior: 25 frontend tests passed, including new-period creation, three-card grouping across years, confirmation/stale failures, loading errors, drafts, and out-of-order StrictMode responses.
- Related frontend coverage: 18 PDF/signatory and room-transfer tests, 18 academic-year/operating-hour helper tests, 23 report/archive tests, and 2 Activity Log tests passed. The report/archive suites passed on a serial rerun after timing failures in the initial parallel run.
- A combined seven-suite backend run passed 44 tests / 417 assertions, covering semester settings, historical signatories, faculty teaching history, cache consistency, CRUD audit, Activity Log, and operating hours. Subsequent no-op-save and audit-marker refinements passed their focused suites (10 / 111 and 5 / 55 respectively); these overlap the combined run.
- Production TypeScript/Vite build and whitespace checks passed. Scoped frontend lint and semester/signatory Pint checks passed. ActivityLogController has pre-existing Pint spacing findings; its unrelated formatting was retained. A pre-existing report test fixture's return annotation was narrowed to its existing detail contract to unblock type checking, without product behavior changes. Activity Log's initial load now schedules/cancels its effect callback consistently with existing project patterns.
- Rendered browser/visual verification remains outstanding because browser and native capture tools were unavailable. Automated DOM tests do not establish visual fit, contrast, or full accessibility compliance. No live data was modified.

## Original proposal (planning baseline)

The remaining sections describe the source-informed proposal as written before implementation. Statements about then-current destructive activation, missing contracts, and future prerequisites are historical findings; the implementation and verification notes above supersede them.

## Goal and scope

Make Settings easy to navigate, scan, and update while retaining the existing main sidebar and system theme. Organize the module into exactly four sections: **Academic Semesters**, **Operating Hours**, **Document Signatories**, and **Activation History**. Display only the selected section.

The final sentence of the supplied brief ends at “instead.” This plan interprets it as replacing historical status labels such as **Active** and **End** with event actions such as **Activated** and **Ended**.

This is a source-informed plan based on the current working tree and the user's reported friction. Live browser/computer capture was unavailable in this session; no screenshot-based visual audit or rendered design verification is claimed. Repeated navigation is reported in the brief; the inspected Settings source currently defines one anchor menu and renders all four sections together.

## Priority decisions

| Priority | Finding | Proposed decision |
| --- | --- | --- |
| Critical | Current activation archives approved schedules and deletes sections for both the outgoing and incoming semesters, with cascading effects on linked records. | The target workflow must change active-semester context without changing schedules, sections, submissions, or Schedule History. This requires a separate future behavior change before the redesigned activation workflow can be released. |
| High | Activation history reads each semester's present status and academic year; its response omits the actor and end-event details. | Treat history as past events. Do not represent current status, invent actors, or attach an activation timestamp to an **Ended** action. |
| High | Editing a semester's year changes its live record and can relabel associated views and past activation rows. | Use one academic-year control per card; prevent historical relabeling. Define the handling of an already-used semester before enabling year changes in that case. |
| High | Closed schedule signatories already have preservation behavior, but unsigned/legacy exports can fall back to current officials. | Retain recorded signatories and verify historical records without snapshots before promising preservation for every historical document. |
| Medium | All four sections remain on one page; the main form controls compete with previews. | Use one settings menu, one visible section, forms before previews, and consistent action placement. |
| Medium | The Archived tab provides actual VPAA recovery access. | Remove it from the primary three-card workflow only after checking legacy inventory and preserving any needed authorized recovery access. Add no new archiving workflow. |

The user-requested preservation policy is the target of this proposal. Existing documentation describing destructive semester rollover remains a record of current behavior, not authorization to carry that behavior into the redesign.

## Shared layout and theme

Keep the current application sidebar and header. Within the Settings content area, place a compact **Settings** heading, a short description, one section menu, and the selected section beneath it. Prefer a horizontal menu to leave room for the semester cards and two-column forms; do not add another permanent sidebar.

| Layer | Proposed content |
| --- | --- |
| Page heading | **Settings** — Manage academic periods, operating hours, and document details. |
| Section menu | Academic Semesters · Operating Hours · Document Signatories · Activation History |
| Selected section | Its title, one explanatory sentence, saved/unsaved state where relevant, and the working content. |
| Form footer | A secondary **Discard changes** action when dirty and one descriptive primary Save action at the bottom right. Activation remains a separate explicit action. |

Use the existing maroon primary color (`#4e0a10`), gold accent (`#C9952A`), parchment background (`#F7F4F0`), white surfaces, border treatment, DM Sans controls/body text, and established display-heading typography. Reuse the application's icons, buttons, confirmation dialog, toast, and table patterns. The current global styles suppress shadows; use borders and spacing rather than relying on elevation.

Highlight the selected section with an indicator, stronger text, and an appropriate background. Selection must remain understandable without color. Default to Academic Semesters on a fresh visit; preserve an explicitly selected section across refresh and browser Back/Forward. Use a two-row menu at narrow widths rather than truncating labels or adding a second menu.

## 1. Academic Semesters

### Content hierarchy

1. A compact summary: **Current active semester: [semester] · AY [academic year]**. Derive this from saved state, never an unsaved year draft. Show **No active semester** if none is recorded; do not silently activate one.
2. Three consistent cards in this order: **1st Semester**, **2nd Semester**, **Summer**. Use three columns where space permits, then stack the cards on narrow screens.
3. Each card shows its name, saved academic year, an explicit **Active** or **Inactive** status, its academic-year control, and available actions.
4. Summer includes a separate, visibly labeled **Enable Summer** switch and availability explanation. Availability and activation status are separate facts.

### Academic-year editing

Use one labeled academic-year input per card, displaying a full value such as `2026-2027`. Retain the consecutive-year rule and show an inline example. Do not introduce a shared field that silently updates all three semesters; the existing records hold their own academic years.

Validate the complete range and show a message such as **Enter two consecutive years, for example 2026-2027.** A changed value is a draft until **Save academic year** succeeds. Do not activate from an unsaved or invalid year: show **Save the academic year before activating this semester** beside the unavailable action.

Saving a year and activating a semester are separate operations. Neither should implicitly perform the other. For an already-used semester, the future workflow must preserve its historical identity; deciding whether a new period record is needed is outside this UI-only plan. Until that rule is resolved, year editing for a used semester must not be treated as safe merely because its input is valid.

### Summer availability and activation

| Summer state | Availability display | Activation display/action |
| --- | --- | --- |
| Disabled and inactive | **Not offered**; Enable Summer is off. Keep the year readable. | **Inactive**; explain that Summer must be enabled before activation. |
| Enabled and inactive | **Offered**; Enable Summer is on. | **Inactive**; **Set as Active** is available when the saved year and policy conditions are valid. |
| Enabled and active | **Offered**; Enable Summer is on. | **Active**; show **Currently Active** and explain that another semester must be activated before Summer can be disabled. |

Helper text: **Enabling Summer makes it available for scheduling. It does not make Summer the active semester.**

The current UI only allows changing Summer availability while 2nd Semester is active. Preserve that visible eligibility condition as the planning default and explain it inline: **Summer availability can be changed while 2nd Semester is active.** Its policy and future server enforcement must be verified; it is not currently a reliable backend guarantee.

Do not copy the current frontend-only auto-disable effect into the target workflow: opening Settings or switching the active semester must not silently change Summer's saved availability. If a yearly reset is required later, it needs an explicit, documented policy and visible outcome. If inconsistent legacy data says Summer is both active and disabled, show a configuration warning; do not silently hide or correct the conflict.

### Activation workflow

1. User selects **Set as Active** on an eligible card with a valid, saved academic year.
2. Show **Change active semester?** with both saved identities: **From: [current semester / year]** and **To: [selected semester / year]**. If none is active, show that explicitly.
3. Under the target preservation policy, explain: **This changes the semester used as the current scheduling context. Existing schedules, sections, submissions, and Schedule History are retained.**
4. Provide **Cancel** and **Activate semester**. Cancel changes nothing. Prevent repeat activation submissions while the action is in progress.
5. After confirmed success, update the summary and card statuses and refresh the displayed activation history. Announce **[semester] · AY [year] is now active.** On failure, retain the previous saved status and the user's draft.

**Release prerequisite:** The preservation wording in step 3 must not be shown over the current destructive activation operation. A later implementation must first establish and verify the target behavior. Activation must not clear or regenerate schedules, delete sections, create a schedule archive, or rewrite any existing Schedule History version. A change in the currently visible schedule filter must not be described as data deletion.

Switching the active semester creates an **Ended** event for the outgoing active context and an **Activated** event for the incoming context at the same transition time. **Ended** means it ceased to be the active context; it does not mean its schedules were deleted, archived, or otherwise changed. No separate **End semester**, delete, or rollover wizard is proposed.

### Archived-tab decision

The daily workflow needs the three cards, not an additional archive tab. No new **Archive semester** action is proposed. Activation History records changes in active context; it does not replace recovery of an archived record.

Before removing the existing tab, inspect the archived-semester inventory and its recovery entry points. If legacy records require recovery, keep a subdued **View archived semesters** link within Academic Semesters, using the existing VPAA-only recovery experience. It is not a fifth main section. If no records or supported recovery need exist, omit that secondary link after the check. Do not orphan existing recovery URLs or change the archive module's authority through this redesign.

## 2. Institution Operating Hours

Place the controls first, in a compact row on wide screens and a single column on narrow screens:

| Field | Explanation |
| --- | --- |
| **Opening Time** | Earliest time classes may begin. |
| **Closing Time** | Latest time non-field classes may finish. |
| **Field Class Cutoff** | Classes held on the field must finish by this time; it does not shorten the window for other classes. |

Below the form, show one concise summary: **Classes: [opening]–[closing]. Field classes: [opening]–[cutoff].** If the cutoff equals closing, explain that field classes share the full operating window.

Use a slim timeline beneath that summary, with opening/closing labels and one clearly labeled field-cutoff marker. Avoid a large decorative 24-hour panel. The written summary provides the same information without relying on the graphic. Preview changes as the user edits and label them **Unsaved preview** until saved. With invalid values, show the validation message instead of a misleading valid-looking range.

Place **Discard changes** and **Save operating hours** in the section footer, with Save at the bottom right. These changes affect future scheduling rules and checks; saving must not automatically move existing classes. Existing timetables may subsequently need review against changed limits, which must not be represented as automatic rescheduling.

### Validation and feedback

- Opening and closing times must be present and valid.
- Closing must be later than opening on the same day. Do not add overnight scheduling in this redesign.
- Field cutoff must be later than opening and no later than closing.
- Field cutoff must align with the existing 30-minute slots measured from opening. Do not claim that the server currently requires all opening/closing values to fall at `:00` or `:30`.
- An empty cutoff must not silently mean “clear the saved value”: the current save path omits it. Recommend an explicit displayed cutoff; use closing time when the intent is to allow the full window, after verifying the saved configuration.

Show errors beside the relevant field, including **Closing time must be later than opening time** and **Field class cutoff cannot be later than closing time**. Explain invalid/unchanged states near Save. After success, show a saved confirmation; after failure, retain all entered values and offer another save attempt.

## 3. Document Signatories

Use a compact two-column section: **Signatory details** on the left and **Document preview** on the right. Stack details before preview on a narrow screen.

Retain exactly two editable fields: **President's Name** and **Designation**, with both required and the existing 150-character limit. Keep useful example text without instructions tied to a specific appointment. Avoid forced display casing that differs from the stored text or exported document.

The preview shows only the relevant signature block, using the existing document wording, signature line, entered name, and designation. Remove decorative page content that adds height. Update the preview immediately from the draft; show a neutral placeholder when a field is empty rather than inventing a person's name. Mark changed content as **Unsaved preview**. Long names and designations must wrap without clipping, including in the actual export.

Place **Discard changes** and **Save signatory** at the bottom of the entire section, with Save aligned right. Disable saving until both fields are valid and a change exists; put the required-field explanation beside the affected input.

Proposed helper text under the target preservation policy: **Updates apply to future documents that have not recorded a signatory. Previously recorded signatories remain unchanged.**

### Historical preservation

- Approved, rejected, recalled/withdrawn records and historical versions must continue to show the name and designation recorded for their relevant workflow event, including on reprint/export.
- Saving current settings must not rewrite these snapshots or regenerate historical documents with the new President's name.
- A later resubmission/revision may record the then-current signatory according to the established workflow, without changing earlier versions.
- Existing closed-status snapshot behavior should be retained. Legacy historical documents without a recorded signatory need an explicit preservation decision before release; do not guess the previous President or silently substitute the current one.

Routine signatory saving does not need a confirmation modal. The persistent explanation, live draft preview, and explicit Save action provide the necessary clarity.

## 4. Semester Activation History

Make this a separate, read-only settings section with a short description: **A record of changes to the active academic semester.** It is distinct from Schedule History and from archived-semester recovery.

| Column | Meaning |
| --- | --- |
| **Semester** | Semester named in the event. |
| **Academic Year** | Academic year at the time of the event, preserved when current configuration changes. |
| **Action** | **Activated** or **Ended**. Never a current-status badge labeled **Active**. |
| **Changed By** | Actor recorded for the transition. Use **Not recorded** when unavailable; use **System** only for a verified system event. |
| **Date & Time** | Actual event time, displayed consistently in the institution's verified timezone with that timezone stated. Do not infer the institution's timezone from the viewer's device. |

Show newest transitions first with deterministic ordering for events sharing a timestamp. Start with the existing table's pagination, defaulting to 10 rows, and its normal page-size controls. Do not add export, bulk actions, a search dashboard, or history editing to this scope. Add filters later only if actual volume and tasks require them.

Explain once that **Ended** means the semester stopped being the active context. Repeated activations are separate events; reactivating a semester must not change the wording, year, actor, or date of older rows.

The current response supplies activation timestamps and a mutable semester status, not a complete event history. A verified activation record can be labeled **Activated** regardless of that semester's present status. Do not manufacture an **Ended** event from `is_active = false`, reuse an activation timestamp as its end time, or invent an actor. A future event view may use verified transition audit data; where evidence is absent, show missing data honestly. Preserve legacy records without backfilling assumptions.

Provide distinct states: **Loading activation history**, **No activation events recorded**, and **Activation history could not be loaded** with **Retry**. A failed request must not appear as an empty history.

## Shared interaction, responsive, and accessibility requirements

- Retain each section's drafts while moving between Settings sections. Mark unsaved sections in the single menu without adding duplicate navigation.
- When leaving Settings with unsaved changes, offer **Keep editing** or **Discard changes**. An explicit discard resets only the relevant draft; do not silently save on navigation.
- Saving one section must not submit another section's draft. Do not introduce a page-wide Save button with ambiguous scope.
- Keep entered values after validation or save failures. Show a section-specific error and retry action when initial data cannot load; never present fallback defaults as successfully loaded institution settings.
- Use existing VPAA access boundaries. A missing permission should be explained through the existing access pattern; the redesign does not grant new authority.
- Every control needs a persistent label, visible keyboard focus, and an accessible name. Identify selected navigation programmatically. If implemented as tabs, support the full tab keyboard pattern; if implemented as section links, use normal link behavior and current-section semantics.
- Make disabled actions' reasons visible; do not rely solely on hover tooltips. Associate field errors with inputs, and announce save/error results without moving focus unexpectedly.
- The activation dialog must receive focus, support cancellation, and return focus to its trigger. Keep confirmation details readable on narrow screens.
- Retain readable text sizes and adequate contrast; use status words as well as colors. Check at 200% zoom and at narrow widths. Stack cards/forms, allow long names to wrap, and keep any history-table horizontal scrolling within the table rather than the page.

## Walkthrough and acceptance checklist for a later implementation

| Scenario | Required outcome |
| --- | --- |
| Open Settings and select each menu entry | One settings menu; only the selected section appears; the main sidebar is retained. |
| Refresh or use Back/Forward | Selected section remains understandable and recoverable; no hidden mutations occur. |
| Edit a year, then attempt activation | Year draft remains separate; invalid/unsaved year cannot be activated. Existing historical identities do not change. |
| Enable Summer | Availability changes only after a successful save; current active semester does not change. |
| Activate enabled Summer | Confirmation identifies old and new saved periods; only confirmed success changes active status. |
| Cancel activation, repeat-click, or encounter a failed/stale request | No accidental transition; no false success; no loss of drafts. Refresh changed saved state before a new confirmation when necessary. |
| Activate between periods containing schedules in multiple workflow statuses | Before/after comparison proves schedules, sections, submissions, signatures, and all existing Schedule History versions/items remain unchanged. Active-context audit events may be added; no schedule-history archive is created as a side effect. |
| Edit operating hours with an invalid range/cutoff | Field-specific error; no misleading preview or save. Valid drafts preview clearly without changing saved limits. |
| Save valid operating hours | Only intended time settings change; existing timetable rows are not moved. |
| Enter long signatory details and save | Preview/export match the intended text and fit; ordinary save feedback appears in the section. |
| Reprint approved, rejected, and recalled/withdrawn records after changing the President | Recorded historical names/designations remain unchanged, including the separately reviewed legacy/missing-snapshot cases. |
| View history after switching and reactivating semesters | Rows represent immutable events; actors and timestamps are truthful; no historical row reads as current status. |
| Fail to load each section, especially history | Error/retry state appears rather than an empty table, blank defaults, or false success. |
| Navigate away with drafts, use keyboard, zoom, and a narrow screen | Draft protection works; labels, focus, menu selection, forms, dialogs, and table remain usable. |
| Simplify archive access | Existing archived-semester recovery remains reachable where needed; no new archive action or authority is introduced. |

These are future acceptance checks, not claims that tests or rendered UI checks have already passed. For this planning pass, verification consists of reviewing relevant source, workflow documentation, local document links, and the documentation diff. Application tests are unnecessary because application code is unchanged.

## Decisions to settle before implementation

1. Adopt the requested non-destructive activation policy in place of the documented rollover/reset behavior, with retention verified across all workflow statuses and both semesters.
2. Define safe academic-year changes for used semester records; do not relabel past events through a shared mutable record.
3. Confirm Summer eligibility/reset policy and consistent saved-state enforcement; no silent frontend-only availability changes.
4. Verify which transition audit data can supply actors, event-time years, and end times, and how missing legacy information will be displayed.
5. Check archived-semester inventory and retain a minimal recovery entry point if needed.
6. Resolve historical signatory records without snapshots and confirm the institution's display timezone.

Proceed next to a design review of the four section layouts and activation confirmation using this plan; implementation remains a separate phase.

## Source references

- [Settings page](../../src/pages/vpaa/Settings.tsx): current navigation, cards, drafts, previews, confirmation, and history response mapping.
- [Theme tokens and global styles](../../src/index.css) and [Tailwind theme](../../tailwind.config.js).
- [Academic-year helpers](../../src/lib/academicYear.ts) and [operating-hours helpers](../../src/lib/operatingHours.ts).
- [Shared DataTable](../../src/components/ui/DataTable.tsx), [Toast/confirmation context](../../src/context/ToastContext.tsx), and [module archive tabs](../../src/pages/vpaa/archive/ModuleArchiveTabs.tsx).
- [Current archive entry points](schedule_reset_and_module_archives.md) and [current Schedule History workflow](schedule_history_workflow.md).
- [Semester controller](../../../backend/app/Http/Controllers/Academic/SemesterController.php): year updates, activation side effects, transition audit data, and history projection.
- [Timeslot controller](../../../backend/app/Http/Controllers/Scheduling/TimeslotController.php) and [request validation](../../../backend/app/Http/Requests/Timeslot/UpdateTimeslotSettingsRequest.php).
- [Schedule signatory policy](../../../backend/app/Services/Scheduling/ScheduleSignatories.php) and [historical signatory coverage](../../../backend/tests/Feature/ScheduleSignatoryHistoryTest.php).
- [Schedule PDF rendering](../../src/pages/ClassSchedules/SchedulerPanel/schedulePdf.ts): recorded-signatory preference and current-signatory fallback.
