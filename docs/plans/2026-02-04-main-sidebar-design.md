# Main Sidebar (Crisp-Inspired) — Design

## Overview
We will replace the current compact `GlobalRail` with a crisp-inspired main sidebar that defaults to a wide state and can collapse to an icon-only state. The visual language will be clean and light, with a single accent color for active items, neutral icons, and tighter vertical spacing similar to Crisp. The sidebar will use Plus Jakarta Sans globally for typography.

## Approaches Considered
1. **Extend GlobalRail**: Convert the existing rail into a full-width sidebar with collapse state. Low file churn but muddier semantics.
2. **New MainSidebar (Chosen)**: Introduce a new `MainSidebar` design component and replace `GlobalRail` usage in the dashboard layout. Clearer intent and easier evolution.
3. **Hybrid Rail + Sidebar**: Keep a thin rail plus a wide sidebar for Crisp-like two columns. Higher complexity and screen cost.

## Architecture
- **Design component**: `src/design/MainSidebar.tsx` containing structure, collapse behavior, and theming.
- **Layout**: `src/app/[locale]/(dashboard)/layout.tsx` uses `MainSidebar` instead of `GlobalRail`.
- **State**: `localStorage` persists collapsed state (`leadqualifier.sidebarCollapsed`). Default: expanded.
- **Typography**: Plus Jakarta Sans imported in `src/app/globals.css` and used as global `--font-sans`.

## Components
- **Header**: App mark + name (from `common.appName`), small user label below if needed. Toggle button under the mark, Netlify-style chip.
- **Nav**: Items defined in a single array, grouped if needed. Neutral icons, single accent for active state.
- **Footer**: User avatar/initial and sign-out access (consistent with current behavior).

## Data Flow
1. Sidebar mounts (client).
2. Reads collapse state from `localStorage`.
3. Renders nav items; active item derived from `usePathname`.
4. On toggle, state updates and persists.

## Error Handling
- If `localStorage` is unavailable, silently fall back to expanded.
- `prefers-reduced-motion` reduces transition intensity.

## i18n
- Labels use `messages/en.json` + `messages/tr.json` (no hardcoded strings).
- Any new strings must be mirrored across both locales.

## Testing
- Manual: verify expand/collapse, persisted state, active nav highlight, tooltips in collapsed state, and responsiveness.
- Accessibility: ensure focus styles and `aria-expanded` on the toggle.
