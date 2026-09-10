# UI/UX Phase 1 review checklist

Use this after checking out `ui/phase-1-consistency` locally.

## Shared geometry
- Confirm Dashboard, Operations, WarRoom, Resources, Account, Collaboration, Live Workspace, and Vault feel like they live inside the same centered application canvas.
- On wide displays, confirm normal pages have visible breathing room on both sides instead of stretching edge to edge.
- Confirm narrow displays remain fluid without introducing horizontal page scrolling.
- Confirm Boards remain intentionally wide.
- Confirm Cyber Lab remains intentionally immersive.

## Collaboration
- Confirm no duplicate page-level New session button is visible above the workspace.
- Confirm New session is available from the Collaboration workspace rail.
- Confirm opening session creation does not push the conversation downward.
- Open a session with enough messages to overflow.
- Confirm the composer remains visible without scrolling the whole page.
- Confirm only message history scrolls vertically.
- Confirm Sessions scrolls independently.
- Confirm People opens as the smaller-screen panel and closes normally.
- Confirm Account and Sign out remain reachable in the application shell.

## Live Workspace
- Confirm Machine control is no longer rendered on `/live`.
- Confirm Participants still load, invite, change roles, leave/remove as permitted.
- Confirm Resources still attach/contribute/detach as permitted.
- Confirm WarRoom machine-control behavior was not removed.
- Confirm the page has the same centered left/right breathing room as other standard screens.

## Boards
- Confirm the primary pink Board controls rail contains the main drawing tools.
- Confirm the same drawing-tool buttons are not repeated in the editor options strip.
- Confirm board title, color, stroke, zoom, undo/redo, clear, export, duplicate, recording, secure save, and sharing still work.
- Confirm the canvas still has the horizontal room required for drawing.

## WarRoom
- Confirm topology remains visible.
- Confirm no launch explanation block appears.
- Confirm Start team Operation still starts the operation.

## Vault
- Confirm one compact toolbar contains Search, type, Pinned, and New item.
- Confirm an empty Vault does not show multiple New item boxes/buttons.
- Confirm the editor does not appear until an item is selected or New item is clicked.
- Confirm the page uses the same centered application canvas as the other standard screens.
- Confirm mobile Back/Close behavior does not discard dirty changes without confirmation.
- Confirm create, update, pin, copy, handoff, archive, and delete still work.

## Responsive widths
Review at approximately 390px, 768px, 1024px, 1366px, 1440px, and 1920px. At each width, check for horizontal page overflow, clipped controls, unreachable scroll regions, and oversized empty space.
