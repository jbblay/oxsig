# OXSIG UI/UX Audit — Phase 1

## Goal

Create one coherent OXSIG application interface without copying another product. External products and design systems are references for interaction principles only. OXSIG keeps its own dark console identity, workspace colors, topology visuals, and operational workflows.

## Core design rules

1. Application routes behave like applications, not vertically growing marketing pages.
2. The app shell owns the viewport. Tool-specific regions scroll internally.
3. Primary actions remain visible and easy to reach.
4. One action should have one obvious control in a given context; remove duplicated toolbars and duplicate empty-state actions.
5. Progressive disclosure: secondary controls appear when relevant instead of occupying permanent space.
6. Workspace identity comes from consistent structure plus restrained workspace accent colors, not a different layout language per page.
7. Responsive behavior is structural: resize, reflow, collapse secondary panes into drawers, and preserve the primary task.
8. Keyboard, focus, contrast, reduced-motion, touch-target, and zoom behavior are part of the design system, not later polish.

## Repository findings

### Shared shell

`src/components/app/AppShell.tsx` uses `min-h-screen` for the application wrapper and injects `WorkspaceEnhancements` above each workspace page. Several workspace pages then create their own viewport-derived minimum heights. This can make the total document taller than the visible viewport.

Target: make the authenticated application shell viewport-bound (`100dvh`) and let the main workspace region own the remaining height below the header. Workspace pages should consume available height rather than independently guessing header/rail height.

### CSS architecture

The current visual system is spread across `globals.css`, `oxsig-design.css`, `compact-console.css`, `workspace-enhancements.css`, `lab-flow.css`, and `workspace-mode.css`.

There are repeated definitions of shared selectors such as `.oxsig-app-background`, and later styles override earlier design decisions through import order. `workspace-enhancements.css` also reaches into page internals with selectors such as `main[data-oxsig-workspace="..."] > .oxsig-workspace-rail + div > .grid` and `!important` column overrides.

Target: retain existing OXSIG tokens and primitives, but move page geometry into explicit layout components/classes. Avoid DOM-position-dependent CSS and minimize `!important` layout overrides.

### Collaboration

`src/components/collab/CollaborationWorkspace.tsx` already has good internal mechanics: the message region can scroll and secondary people UI already adapts at smaller breakpoints. The main problem is outer height ownership. The component uses `min-h-[calc(100dvh-5rem)]` while the AppShell header, workspace rail, padding, and New Session UI also consume height.

Phase 1:
- Bind Collaboration to the available workspace height.
- Keep the composer visible.
- Scroll messages internally.
- Keep account/logout controls reachable.
- Preserve desktop Sessions + Chat + People layout.
- Collapse secondary panes to drawers/panels at narrower widths.

### Live Workspace

`src/app/live/page.tsx` renders `ControlLeasePanel` above Participants and Resources. `ControlLeasePanel` is also used elsewhere, including War Room, so the component must not be deleted globally.

Phase 1:
- Remove Machine Control from the Live Workspace render path only.
- Keep workspace header, Participants, Resources, and workspace selection.
- Preserve APIs and machine-control implementation for contexts that still use it.

### Boards

`WorkspaceEnhancements` renders the preferred compact Board Controls rail with Pen, Arrow, Grid, Snap, and Fit. `src/app/collab/storyboards/page.tsx` also owns a richer toolbar containing drawing tools and board actions. This produces the duplicated UI seen in the current screen.

Phase 1:
- Keep the compact Board Controls visual language.
- Consolidate Pen, Eraser, Line, Arrow, Rectangle, Ellipse, Color, Stroke, Grid, Snap, Fit/Zoom, Export, and Duplicate into one board command surface.
- Keep the storyboard title and canvas.
- Preserve drawing state, shortcuts, export, duplication, and collaboration behavior.
- On narrow screens, move secondary commands into overflow rather than allowing horizontal page overflow.

### War Room

`src/app/warroom/page.tsx` contains the explanatory heading and paragraph immediately above the Start Team Operation button.

Phase 1:
- Keep Shared Mission Environment/topology.
- Remove the `Start the team Operation here` heading and provisioning paragraph.
- Keep the Start Team Operation action and existing operation logic.

### Vault

`src/app/vault/page.tsx` already has strong underlying state: search, type filters, pinned filtering, creation, selection, editing, handoff, archive, and deletion. The problem is presentation. Empty state, list panel, editor panel, and New Item actions compete for attention.

Phase 1:
- Use one compact command bar for Search, Type, Pinned, and New Item.
- Use one clear New Item action in the normal interface.
- Keep the empty state lightweight.
- Reveal creation UI after New Item is invoked.
- Show a detail/editor surface when creating or when an item is selected.
- On small screens, use list -> detail navigation/drawer behavior instead of forcing a desktop split pane.

## OXSIG visual language

Keep:
- dark operational-console identity;
- restrained cyan/teal primary interaction color;
- per-workspace accent identity;
- topology/node visuals;
- compact controls suitable for technical workflows;
- existing focus-visible and reduced-motion foundations.

Standardize:
- one spacing scale;
- one radius scale;
- one border/surface hierarchy;
- primary/secondary/ghost/destructive action hierarchy;
- toolbar height and density;
- panel headers;
- empty/loading/error states;
- drawers and responsive side panels;
- typography hierarchy;
- focus and keyboard behavior.

## Responsive model

Desktop: persistent primary navigation; workspace-specific secondary panes when useful; primary task gets the largest region.

Laptop/tablet: progressively collapse tertiary panes first. Preserve the main task and primary action.

Mobile: navigation becomes a drawer; secondary lists/details become staged views or drawers; avoid multi-column compression; use the dynamic viewport; keep critical actions visible and respect safe areas.

## Accessibility baseline

Target WCAG 2.2 AA behavior for the application UI. In particular: keyboard operability, visible focus, predictable navigation, sufficient contrast, reflow/zoom support, meaningful labels, non-color status cues, touch/pointer target sizing, and reduced-motion support.

## Implementation order

1. AppShell viewport/scroll ownership and shared workspace geometry.
2. Collaboration height and responsive behavior.
3. Live Workspace removal of Machine Control.
4. Board toolbar consolidation.
5. War Room copy removal.
6. Vault progressive-disclosure redesign.
7. Cross-screen spacing, typography, states, accessibility, and responsive QA.
8. Run tests/build and manually validate desktop, laptop, tablet, and mobile widths before merge.

## Non-goals for Phase 1

- Do not rewrite backend APIs.
- Do not remove machine-control capabilities globally.
- Do not redesign every screen simultaneously.
- Do not copy another application's branding or exact layout.
- Do not merge directly into `main` before local/preview validation.
