# Landing Page Refinement — Audit and Fix List

Reviewed 2026-11-17 against `src/pages/landing/LandingPage.tsx` and `landingContent.ts`, rendered at
1440px, 768px and 390px in the local dev server. Section order, branding (login campus photo, maroon
gradient, maroon/amber palette, DM Sans + Playfair Display, TCC logo) and the `/login` route stay as is.

Priority: **P1** broken or misleading, **P2** clear quality gap the brief names, **P3** polish.

## P1 — Fix first

| # | Area | Finding | Fix |
|---|---|---|---|
| 1 | All sections | Scroll-reveal content stays invisible when an element is passed without being observed while in view (anchor jumps, fast scrolling, full-page capture, print). At 768px, Showcase, Features, How It Works, Roles and half of Team rendered blank. | Reveal also when the element is already above the viewport; never hide content when printing. |
| 2 | Showcase | Subtitle says every view is captured from TCCSched while frames still show placeholders — misleading. | Show that line only when every screenshot file is present. |
| 3 | Hero / Showcase | No real screenshots yet. Capturing them needs a signed-in session; creating a token from the CLI was refused. | Not fixable in code. Files drop into `src/assets/landing/` by name (see its README). |
| 4 | Skip link | "Skip to content" jumps to Features, skipping the hero and product tour. | Target `<main>`. |

## P2 — Quality gaps named in the brief

| # | Area | Finding | Fix |
|---|---|---|---|
| 5 | Navigation | No active-section indicator. | Track the section in view; amber underline and `aria-current` on the matching link (desktop and mobile). |
| 6 | Hero | Headline breaks mid-phrase ("…Scheduling. Better / Campus Coordination."). Frame alt name is hard-coded. | Second phrase on its own line; take the frame name from the data. Load the backdrop photo at high priority (it is the LCP image). |
| 7 | Showcase | Tabs wrap 4 + 1 at desktop and stack on phones; no arrow-key support for the tablist. | One row (scrolls inside its own container on small screens, no page overflow); arrow / Home / End keys. |
| 8 | How It Works | Fixed `min-h` gives uneven cards; no progression cue on mobile; number badge and icon compete. | Equal-height cards, vertical connector on mobile, step label ("Step 1") above the title. |
| 9 | Roles | Cards at 6% white barely separate from the gradient; summary and duties have similar weight. | Stronger card fill and border, amber rule under the role name, lighter duty text. |
| 10 | About | Supporting cards repeat Features (conflicts, reports). | Reword to outcomes not covered elsewhere (shared source, recorded accountability, consistent rules, planning data). |
| 11 | Team | Cards have unequal heights once real text varies; no way to tune crop per photo; name is small. | Flex column with equal heights, `photoPosition` per member, larger name. |
| 12 | Final CTA | Get Started is the same size as the hero button. | Larger size variant. Lazy-load the repeated backdrop photo. |
| 13 | Footer | Copyright at 12px / 70% opacity is hard to read; links lack focus styles. | 13–14px at higher contrast, focus rings, tighter mobile spacing. |

## P3 — Polish

| # | Area | Finding | Fix |
|---|---|---|---|
| 14 | Features | Hover lifts the card but the icon tile does not respond; body text 15px on 3 columns is dense. | Icon tile shifts to amber on hover; slightly larger line height. |
| 15 | Motion | Hover lifts and button press scale ignore reduced-motion. | `motion-safe:` on transforms. |

## Status (2026-11-17)

- Done: 1, 2, 4–15.
- Item 1 root cause: `IntersectionObserver` fires only on threshold crossings, so an element jumped
  past in one scroll never reported. `Reveal` now extends the observer root far above the viewport,
  so passed content counts as intersecting. Verified by jumping straight to the page bottom at 360,
  768 and 1440px: 0 hidden elements, no horizontal overflow.
- Open: 3 (real screenshots) and the team's real names, roles and photos.

## Out of scope

- Laravel APIs, authentication, routes other than the landing page, scheduling logic.
- Real team names, roles and photos (placeholders until the team provides them; no generated faces or stock photos).
