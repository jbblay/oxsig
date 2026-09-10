# OXSIG UI/UX Phase 1 implementation

This branch applies the first interface consistency pass without changing authentication, environment loading, API contracts, database migrations, or lab infrastructure.

## Changes

### Application shell and shared content geometry
- Workspace routes run inside a viewport-bound application shell.
- `AppShell` now owns three explicit content modes:
  - **standard** — centered application content with a shared `max-width: 80rem` canvas and consistent horizontal gutters.
  - **wide** — full-width spatial work surface, currently used by Boards.
  - **immersive** — full-width viewport-oriented work surface, currently used by Cyber Lab.
- Standard is the default for normal application pages. Dashboard, Operations, WarRoom, Resources, Account, Collaboration, Live Workspace, Vault, and similar screens therefore share the same overall canvas behavior instead of independently stretching across large displays.
- Boards and Cyber Lab remain intentional exceptions because drawing and machine interaction require additional horizontal space.

### Collaboration
- Collaboration owns the remaining workspace height instead of creating a second viewport-height page.
- The message history remains the vertical scrolling region so the composer stays reachable.
- Session navigation scrolls internally on desktop.
- The duplicate page-level **New session** control is removed from the visible layout.
- **New session** now lives in the Collaboration workspace rail and opens the existing creation form as a temporary overlay, so creating a session does not push the conversation surface downward.
- Existing collaboration APIs and session behavior remain unchanged.

### Live Workspace
- Removed Machine control from the Live Workspace page.
- Kept workspace selection, Participants, invitations/roles, and Resources.
- Removed machine-control eligibility copy from participant rows.
- Simplified the Live Workspace enhancement rail to Participants and Resources.
- Machine-control components and backend behavior remain available to surfaces such as WarRoom; they were not deleted.

### Boards
- Expanded the primary Board controls rail to Pen, Eraser, Line, Arrow, Rectangle, Ellipse, Grid, Snap, and Fit.
- Removed repeated drawing-tool buttons from the in-card options strip through workspace-scoped styling.
- Removed the visible “Board workspace” heading while preserving the board title and contextual options.
- Export, Duplicate, sharing, focus, save, recording, color, stroke, zoom, undo/redo, and clear remain functional in their existing contextual locations for this first pass.
- Boards deliberately retain the wide content mode.

### WarRoom
- Removed the “Start the team Operation here” heading and provisioning explanation.
- Kept the mission topology and the Start team Operation action.

### Vault
- Replaced the oversized filter card with one compact toolbar.
- Kept one primary New item action.
- Removed duplicate empty-state/new-item panels.
- The detail/editor pane appears only after selecting or creating an item.
- Kept search, filters, pinning, create/edit/save, handoff, archive, delete, and copy behavior.

## Deliberate non-goals
- No auth or environment-file changes.
- No API or database changes.
- No visual cloning of third-party products.
- No full design-system rewrite in this pass.
- No deletion of machine-control backend capability.
- No attempt to force Boards or Cyber Lab into the standard narrow application canvas.

## Verification targets
- TypeScript typecheck.
- Existing Vitest suite.
- Production build.
- Manual checks at mobile, tablet, laptop, and wide desktop sizes.
- Confirm Dashboard, Collaboration, Live Workspace, Vault, Resources, Operations, and WarRoom share the same centered content rhythm on large displays.
- Confirm Boards and Cyber Lab still have the space required by their primary tasks.
- Confirm Collaboration composer is visible without page-level scrolling.
- Confirm opening New session does not push the conversation surface downward.
- Confirm sidebar account and sign-out controls remain reachable.
