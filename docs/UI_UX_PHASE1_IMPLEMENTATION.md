# OXSIG UI/UX Phase 1 implementation

This branch applies the first interface consistency pass without changing authentication, environment loading, API contracts, database migrations, or lab infrastructure.

## Changes

### Application shell and Collaboration
- Workspace routes now run inside a viewport-bound application shell.
- Collaboration owns the remaining workspace height instead of creating a second viewport-height page.
- The message history remains the vertical scrolling region so the composer stays reachable.
- Session navigation scrolls internally on desktop.

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

## Verification targets
- TypeScript typecheck.
- Existing Vitest suite.
- Production build.
- Manual checks at mobile, tablet, laptop, and wide desktop sizes.
- Confirm Collaboration composer is visible without page-level scrolling.
- Confirm sidebar account and sign-out controls remain reachable.
