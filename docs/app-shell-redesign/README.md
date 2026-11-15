# App shell redesign: Header and Sidebar (2026-11-15)

## Scope

The shell is shared by every role (VPAA, Dean, Program Head, Secretary, Director): `AppLayout` renders
`Sidebar` and `SystemHeader`, and only the nav data (`src/navigation/*Nav.ts`) differs per role. No
routes, role visibility, permissions, badge logic, or backend code changed.

| File | Change |
| --- | --- |
| `src/index.css` | Shell tokens (`--shell-maroon #5A1220`, `--shell-maroon-deep #26090E`, `--shell-gold #F5A623`, `--shell-content-bg #F7F5F2`); `.bg-shell-header` maroon gradient; `.shell-sidebar-overlay` maroon wash over the photo; new active, hover and submenu states |
| `src/components/layout/SystemHeader.tsx` | Single maroon gradient (black overlays removed), 64px height, compact semester pill, brand shown in header on phones |
| `src/components/layout/headerStyles.ts` | New: shared 36px icon-button style plus open state for menu, notifications and profile |
| `src/components/layout/Sidebar.tsx` | Campus photo kept (`campus-bg.webp`), one maroon overlay instead of multiply plus black stacks; 64px brand row aligned with header; 36px items; gold pill indicator; submenu guide line; static gold badges (no ping); collapsed 40px tiles; drawer above header on phones |
| `src/components/notifications/NotificationBell.tsx` | Uses the shared header button; gold unread badge |
| `src/components/layout/UserProfileMenu.tsx` | Uses the shared header button; 34px avatar |
| `src/components/layout/AppLayout.tsx` | Content background `#F7F5F2`; mobile backdrop z-index raised |

Fixed along the way:
- The 3px `border-left` on hover and active moved icons and labels sideways. The indicator is now an overlaid pseudo-element.
- Items had a double gap (`gap-3` plus `ml-3`) between the icon and the label.
- On phones the header (z-50) covered the drawer's brand row and close (X) button. The drawer is now z-60 below `md`.
- The room-requests badge showed "9+" at exactly 9; it now shows "9+" only above 9, like the other badges.

## Verification

- `tsc -b`, `eslint` on layout and notifications, and `vitest` (layout and notifications: 24 tests) all pass.
- Checked in the browser as VPAA at 1440, 820 and 390px: expanded and collapsed sidebar, submenu expand and active child, notifications panel, profile menu, mobile drawer open and close (X), and campus photo visible under the overlay.
- **Not checked visually:** Dean, Program Head, Secretary and Director. Only the `vpaa` account is seeded. These roles use the same components, so the risk is limited to nav-data cases such as long labels or locked items.

## Follow-ups, in priority order

1. **(High) Check the other roles visually.** Seed or obtain Dean, Program Head and Secretary accounts. Check locked (Cross-Department) items, badge counts, and long department and program names in the brand row, which are truncated with a tooltip.
2. **(High) Unify the old brand tokens.** Pages still use `#4e0a10` and `#C9952A` (`--color-primary`, `--color-accent`, Tailwind `primary.*`, and table headers in `index.css`), while the shell now uses `#5A1220` and `#F5A623`. Decide on one palette and move `tailwind.config.js` and `:root` to it, so the shell and the page content match.
3. **(Medium) Breadcrumb overflow on phones.** `PageHeader` shows a horizontal scrollbar at 390px (seen on Master Calendar). Truncate the middle crumbs instead.
4. **(Medium) Hover labels on the collapsed rail.** Collapsed icons rely on the native `title` tooltip, which is slow and does not work on touch. Add a styled tooltip or flyout submenu.
5. **(Medium) Mobile drawer focus.** The open drawer does not trap focus or move focus to its first link. Add focus management for keyboard and screen-reader users.
6. **(Low) Remember the sidebar state.** The collapsed or expanded choice resets on reload. Store it per viewer in `localStorage`.
7. **(Low) Semester on phones.** The semester pill is hidden below `sm`. Consider a short form (for example "2nd Sem") in the drawer's brand row.
8. **(Low) Global shadow reset.** `index.css` removes every `shadow-*` class with `!important`, so dropdown elevation comes only from borders. Review whether menus should be allowed a light shadow.
