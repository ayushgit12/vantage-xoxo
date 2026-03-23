# Frontend Redesign Plan (Page-by-Page)

## Objective
Redesign the frontend into a cleaner, more professional product UI using shadcn patterns, with a white/black color direction, better motion, and phased delivery route by route.

## Theme Decision
Current theme status:
- The existing UI is neon-dark and visually striking, but it is overloaded for dense planner workflows.
- Strong cyan/purple glow effects reduce scan speed for data-heavy pages (goals, stats, settings).

Decision:
- Move to a white/black neutral system (light-first) with subtle grayscale surfaces and one restrained accent for interactive states.
- Keep the current dark-neon style only as inspiration for hero moments on the landing page, not core app pages.

Why this is better for this app:
- Better readability and information hierarchy.
- More enterprise/professional feel for scheduling and analytics.
- Easier accessibility tuning (contrast, focus states, reduced visual fatigue).

## shadcn MCP Inputs Used
Registry available:
- @shadcn

Useful block references from MCP:
- dashboard-01: sidebar + chart + table composition
- sidebar-01: grouped sidebar navigation
- sidebar-13: sidebar inside dialog pattern (useful for settings overlays)

Useful component references from MCP:
- sidebar, card, table, chart, tabs
- form, input, select, textarea
- dialog, sheet, calendar
- breadcrumb, separator, tooltip, skeleton
- accordion, collapsible

Install command from MCP:
```bash
npx shadcn@latest add @shadcn/sidebar @shadcn/card @shadcn/table @shadcn/chart @shadcn/tabs @shadcn/form @shadcn/input @shadcn/select @shadcn/textarea @shadcn/dialog @shadcn/sheet @shadcn/calendar @shadcn/tooltip @shadcn/skeleton @shadcn/breadcrumb @shadcn/separator @shadcn/accordion @shadcn/collapsible
```

## Visual System (Target)
### Global CSS foundation (required)
- Keep a single source of truth in `frontend/src/app/globals.css` for:
  - Theme tokens (`:root` variables for colors, borders, radii, shadows, spacing).
  - Typography tokens (font families, sizes, line-heights, tracking scale).
  - Global element defaults (`body`, headings, links, form controls, focus ring).
  - Shared utility classes for motion and state styling.
- All redesigned pages should consume these tokens/utilities instead of hardcoded page-level colors.

### Color tokens
- Background: pure/near white (`#FFFFFF`, `#F8F8F8`)
- Foreground: near black (`#111111`, `#1A1A1A`)
- Borders: neutral grays (`#E5E5E5`, `#D4D4D4`)
- Muted text: `#666666` to `#737373`
- Accent: single controlled accent (proposed blue-gray) for active/focus states only

### Typography
- Replace default system stack with a more intentional pairing:
  - Headings: `Space Grotesk`
  - Body/UI: `Manrope`

### Surfaces
- Remove glassmorphic neon cards on app pages.
- Use clean cards with thin borders, soft shadows, and consistent radius scale.

## Animation Strategy (Clean + Useful)
Principles:
- Motion should explain transitions, not decorate every element.
- Keep durations short and consistent.
- Respect reduced motion preferences.

Standards:
- Page enter: opacity + translateY 8px, 180-240ms.
- Section stagger: 40-60ms increments, max 4 items visible in sequence.
- Hover: only subtle elevation or border tint changes (120-160ms).
- Avoid infinite floating/glow loops on data pages.
- Keep rich animation only on marketing/landing hero.

## Skeleton Loading Strategy (Required)
Principles:
- Every async page/section must show a meaningful skeleton state instead of blank space or spinner-only loading.
- Skeletons must mirror final layout geometry (title lines, cards, tables, chart blocks, form rows).
- Keep shimmer subtle and short; avoid high-contrast animated effects.

Implementation:
- Use shadcn `skeleton` component for all loading placeholders.
- Add reusable skeleton patterns under `frontend/src/components/ui/` (for cards, table rows, chart panels, form sections).
- For route-level loading, add Next.js `loading.tsx` where useful.
- For client-side data refreshes, render inline section skeletons while preserving existing layout.

Minimum skeleton coverage:
- Dashboard/list pages: metric cards + list/table rows.
- Detail pages: header, key metadata, schedule/chart panel placeholders.
- Forms: grouped field placeholders and submit area.
- History pages: list rows and detail section placeholders.

## Page-by-Page Rollout
### Phase 0: Foundation (Before page rewrites)
Scope:
- Build/update a global CSS theme layer in `frontend/src/app/globals.css`.
- Introduce design tokens in global styles.
- Build core primitives and wrappers based on shadcn.
- Set app shell layout (top nav / optional sidebar behavior).
- Define shared skeleton variants and loading layout rules.

Files impacted:
- frontend/src/app/globals.css
- frontend/tailwind.config.ts
- frontend/src/app/layout.tsx
- new shared UI files under frontend/src/components/ui/

Deliverables:
- Stable color and spacing scale.
- Global typography system (heading/body scale, font families, readable defaults).
- Shared motion utilities.
- Base card/form/table styles.
- Shared skeleton component patterns and loading conventions.

### Phase 1: Landing page
Route:
- frontend/src/app/page.tsx

Goals:
- Keep bold brand feel, but convert to white/black with controlled accent.
- Simplify hero and remove excessive glow layers.
- Keep key storytelling sections (agents, workflow, chatbot, CTA).

shadcn ideas:
- card, button, separator, accordion/collapsible for workflow details.

### Phase 2: Goals list dashboard
Route:
- frontend/src/app/goals/page.tsx

Goals:
- Recompose page using dashboard-01 mental model: sidebar/nav + section cards + table/list area.
- Improve scanability for multiple goals and statuses.
- Add skeleton states for first load and refetch states.

shadcn ideas:
- sidebar, card, table, tabs, badge, tooltip, skeleton.

### Phase 3: Goal detail workspace
Route:
- frontend/src/app/goals/[id]/page.tsx

Goals:
- This is the highest complexity screen; redesign with strict information hierarchy.
- Split into clear zones: overview, retriever, schedule, sources, actions.
- Make weekly schedule easier to parse at a glance.
- Add sectional skeletons for schedule, retriever data, and sources.

shadcn ideas:
- tabs, collapsible, sheet/dialog for edits, calendar, tooltip, breadcrumb.

### Phase 4: New goal + edit goal forms
Routes:
- frontend/src/app/goals/new/page.tsx
- frontend/src/app/goals/[id]/edit/page.tsx

Goals:
- Standardize form UX and validation states.
- Reduce cognitive load in long forms using sections/steps.
- Add form skeleton layout for initial load/edit hydrate states.

shadcn ideas:
- form, field, input, select, textarea, calendar, accordion.

### Phase 5: History pages
Routes:
- frontend/src/app/goals/history/page.tsx
- frontend/src/app/goals/history/[id]/page.tsx

Goals:
- Improve archived-goal browsing and detail readability.
- Better timeline/config/material grouping.
- Add list and detail skeleton states.

shadcn ideas:
- table, card, tabs, collapsible, breadcrumb.

### Phase 6: Plan + analytics pages
Routes:
- frontend/src/app/goals/[id]/plan/page.tsx
- frontend/src/app/stats/page.tsx
- frontend/src/app/embeddings/page.tsx

Goals:
- Consistent data viz style and legend treatment.
- Replace custom chart visuals with shadcn chart patterns where possible.
- Add chart/table skeleton placeholders to reduce perceived latency.

shadcn ideas:
- chart, card, table, tooltip, tabs.

### Phase 7: Settings
Route:
- frontend/src/app/settings/page.tsx

Goals:
- Convert to structured settings sections with consistent controls.
- Optional sidebar-in-dialog pattern for advanced settings.
- Add settings-section skeletons for profile and preference blocks.

shadcn ideas:
- sidebar-13 pattern (for modal settings groups), form controls, separator.

## Definition of Done per Page
- Theme tokens applied (no legacy neon classes left in touched page).
- Typography and spacing aligned with foundation.
- Motion follows shared animation spec.
- Skeleton states implemented for initial load and key async sections.
- Mobile and desktop layouts both validated.
- No regressions in main interactions (forms, navigation, dialogs, calendar, status updates).

## Execution Process (How We Work Together)
For each page:
1. Audit current page structure and UI problems.
2. Propose wireframe-level section layout and shadcn mapping.
3. Implement the redesign.
4. Validate responsive behavior and interactions.
5. Move to next page only after acceptance.

## Proposed Start Order
1. Phase 0 foundation
2. Landing page
3. Goals list dashboard
4. Goal detail workspace
5. New/edit forms
6. History pages
7. Plan + stats + embeddings
8. Settings

## Notes
- We should migrate classes incrementally to avoid breaking behavior.
- Existing ChatBot integration should remain functional in every phase.
- If desired, a dark mode can be added later as a secondary theme, but the redesign baseline should be white/black.
