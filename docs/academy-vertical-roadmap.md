# Academy career roadmaps and practical workspace (UI implementation)

The Academy follows **Career -> Skill -> Module -> Mission -> Verified task**.

## Routes

- /academy: four career entry cards, no nested skill browser requiring scrolling.
- /academy/learn/devops: Linux Fundamentals -> Networking Fundamentals -> Docker -> Kubernetes, drawn as a straight vertical energy path.
- /academy/learn/cybersecurity, /academy/learn/systems, /academy/learn/programming: the same map, with planned syllabi visible on demand.
- /academy/learn/docker: existing real SSM/Linux Docker workspace with an embedded terminal, live environment controls, a right-hand module/mission panel, server-observed acceptance checks, copyable examples, and a floating AI mentor.

The roadmap shares definitions in src/lib/academy/roadmap-catalog.ts. Expand those definitions rather than adding one-off skill cards or hardcoded nested navigation.

## Visual meaning and safety

- Red illuminated node and animated beam: an available practical skill that has not yet been completely verified.
- Green: all associated server-verified missions completed, using the existing authenticated Academy mission progress API.
- Gray: future subject without a working practical curriculum. Clicking shows only a **clearly labeled planned module preview**. It must not launch an unready environment or claim a completed step.
- Animations respect prefers-reduced-motion. Labels accompany all colors, and routes are keyboard navigable.

Only Docker is currently a live DevOps skill. Linux Fundamentals and Networking precede Docker conceptually but remain planned; this intentionally **does not block access to Docker**, since the missing earlier lessons cannot be earned.

## Modules and verification

Docker modules reference the existing immutable mission identifiers (deploy, repair, persist). A module can eventually reference more than one mission. Mission progress and checks continue to come exclusively from /api/academy/missions; the browser never calculates success from submitted commands.

The right panel separates: objective, acceptance-check progress, module navigation, concept guidance, suggested commands and coaching level. Suggested shell commands are copied to the clipboard only after learner action. No AI command execution is added here.

The terminal remains mounted as the learner opens results or AI chat. The mentor is a floating bottom-right panel using the existing AI mission API. Existing independent Cyber Lab remains unchanged; Academy uses the same authorized lab APIs without redirecting the learner.

## Next development tasks

1. Implement a real Linux Fundamentals curriculum and owner-scoped acceptance tests before labeling its node live. Create a Linux-specific environment readiness pathway; do not make Linux learners install Docker unnecessarily.
2. Add mission-aware automatic verification at safe, rate-limited checkpoints, while retaining manual Check progress. Do not poll AWS command verification on every keystroke.
3. Preserve safe resume semantics when moving between modules or temporary labs.
4. Introduce subject-specific working surfaces (Python editor, Windows desktop, multi-node Active Directory), keeping the same right-hand curriculum contract.
5. Add recorded narration later, with accessible transcripts and opt-in playback.

## Validation

Added/updated src/lib/academy/roadmap-catalog.test.ts and e2e/academy-mission-first.spec.mjs. Verify typecheck, unit tests, build, and desktop/mobile E2E on a machine with the repository and dependencies; preview the design before merging. Live AWS provisioning was deliberately not changed by the roadmap feature.
