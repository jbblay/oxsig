# OXSIG interface reference principles

OXSIG should borrow interaction principles, not visual identity, from mature application systems.

## Application shell
- Persistent global navigation and account controls.
- Workspace content owns the remaining viewport.
- Long data regions scroll internally instead of expanding the entire page.

## Progressive disclosure
- Keep the default state quiet.
- Reveal creation/editing controls after intent is expressed.
- Do not render empty detail panels merely to fill a desktop grid.

## Action hierarchy
- One obvious primary action per task state.
- Avoid duplicated commands in adjacent toolbars.
- Separate global workspace actions from contextual object actions.

## Responsive behavior
- Reflow before squeezing.
- Move secondary side panels into drawers at narrower widths.
- Preserve the primary task and its action controls at every viewport size.

## OXSIG identity
- Technical operations console rather than a generic dashboard.
- Dense enough for practitioners, but not visually noisy.
- Dark and light surfaces use the existing OXSIG token system.
- Workspace accents identify context; status remains separately labelled.
- Topology, terminals, evidence, boards, and knowledge tools keep their own functional character while sharing shell geometry and control hierarchy.

## Accessibility baseline
- Keyboard reachability and visible focus states.
- Reduced-motion preferences remain respected.
- Controls retain accessible names when layouts collapse.
- Critical actions stay reachable without page-level scroll traps.
