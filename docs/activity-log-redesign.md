# Activity Log redesign (VPAA)

Visual and interaction changes to `/activity-log`. The audit-integrity findings are recorded separately in `backend/docs/activity-log-audit-2026-11-14.md` (AL-01 to AL-11).

## Files

| File | Role |
| --- | --- |
| `src/pages/vpaa/ActivityLog.tsx` | Page: summary strip, filter toolbar, results table, server-side pager |
| `src/pages/vpaa/activityLog/activityLogModel.ts` | Types, category and status semantics, event labels, formatters |
| `src/pages/vpaa/activityLog/ActivityDetailDrawer.tsx` | Side drawer that shows the full audit record |
| `src/index.css` | `drawerIn` and `overlayIn` keyframes. They are disabled when the user prefers reduced motion. |

## Layout

```
Activity Log  (shared PageHeader)
One-line description of what the log is and what it guarantees
┌ Events │ Approvals │ Returned or rejected │ Failed sign-ins │ People involved ┐   one segmented strip
┌ Search ……………………………… │ From │ To │ [Apply filters] [Clear filters] ┐
│ Category │ Department │ Actor │ Role │ Status                            │   toolbar
└ applied-filter chips (removable) · "changes not applied yet" ┘
┌ 1,234 events matching 2 filters · updated 2:31:05 PM   [Refresh] [Export CSV] ┐
│ Date and time │ Event + related record │ Category │ Actor │ Status             │   TanStack DataTable
└ Showing 26–50 of 1,234   Rows per page [25]   « ‹ Page 2 of 50 › » ┘
```

## Design decisions

- **Tokens.** Primary actions and active controls use Primary Maroon `#701522`, which changes to Deep Maroon `#4A0D16` on hover. The drawer header also uses `#4A0D16`. Soft Maroon `#F5E9EA` marks applied-filter chips, selects that are in use, the selected row and actor avatars. Amber `#F5A623` appears only as the "unapplied changes" dot and as the focus ring on maroon surfaces. The table body stays white. Table headers keep the app-wide maroon header from `index.css`.
- **Category and status.** Each category is an outlined tag with its own coloured dot. Each status is a filled pill: Completed is neutral, Approved is green, Returned is amber, and Rejected and Failed are red. Because the shapes differ, a category is never mistaken for an outcome.
- **Summary.** All five figures come from `meta.summary`, which the server computes over the full filtered set, so they stay accurate on every page. They are drawn as a single divided strip, not as five decorative cards.
- **Filters.** Changing a filter does not trigger a request until **Apply filters** is pressed; Enter in the search box also applies. Applied filters appear as chips, and each chip can be removed on its own. The date range is validated in the UI before it reaches the API.
- **Actor filter.** The list of actors is built from `meta.facets.actors`. These are the identities recorded on the events, so archived accounts are included. A Role filter matches the role the actor held when the event happened. Commit `ea5d40a` had removed the actor filter, and this brief asked for it back.
- **Table.** Date and time take two lines, with time to the second in Philippine time. Each event shows its related record and the department code. Each actor has an initials avatar with the recorded role underneath. Identities that were not recorded are greyed out and never filled in from the live account. On narrow screens the Category column is hidden.
- **Detail drawer.** The drawer shows these sections: Description (only if the event recorded one), When (exact time plus the stored ISO value), Who (with a note on where the identity came from), Context, Changes, Additional details, and Audit record. Changes compares previous and new values side by side and also lists status changes. The Audit record section gives the entry ID, source, event key, references, IP address, device and the raw metadata. The drawer only shows sections for which data was recorded. Previous/Next buttons step through the rows on the current page. Escape closes the drawer, Tab stays inside it, and focus returns to the row that opened it.
- **Pagination and export.** Pages are fetched from the server at 10, 25, 50 or 100 rows. Paging keeps the applied filters, and the cache key includes the page size. Export CSV sends the same applied filters to the same VPAA-only endpoint. If the server refuses an export, for example because it would exceed 10,000 rows, its message is shown in the UI.

## Not changed

Page access is unchanged: `RoleRoute role="vpaa"` in the UI and `role:vpaa` on the API. No new dependencies were added. No activity data is mocked or generated.
