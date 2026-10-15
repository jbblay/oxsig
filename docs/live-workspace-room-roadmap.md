# Live Workspace: a single collaboration room

## Scope and principle

Live Workspace is the **room**. Board, Cyber Lab, and Screen are **presentation surfaces** inside it, not three independent meeting products. Do not replace Board's drawing tools or duplicate the machine runtime. Preserve server-side permissions and existing resource ownership.

## Audited state (2026-10-15)

| Capability | Present in main before this work? | Technical component |
| --- | --- | --- |
| Create workspaces, invite participants, roles and presence | Yes | live-workspaces and collaborations APIs; Ably |
| Attach Board and Cyber Lab | Yes | live_workspace_resources |
| Persistent chat messages | Yes, in Collaboration, not on Live Workspace page | collaborations messages API |
| Board owner broadcasting canvas + microphone + optional camera | Yes, in Board editor only; deployment-gated by TURN | BoardStream, /api/storyboards/[id]/stream, migration 059 |
| Request, approve, revoke terminal control; terminal observation | Yes, control leases | ControlLeasePanel, SSM terminal APIs |
| Shared desktop input and observation | No fully working transport | Lease model exists; desktop transport not connected |
| Main stage shared by participants | No | New stage API and UI in first phase |
| Group voice/video, screen sharing, in-room recording | No | Requires separate media implementation |

## First phase: room foundation

- Add main stage (Board/Machine), persisted on existing collaborations.settings JSONB with no schema migration. Host or instructor chooses **only an attached resource**. Workspace participants follow via Ably session changed and existing fallback reconciliation. Stage selection is NOT authorization to open a resource or control a machine.
- Add live room chat using existing authenticated messages API and realtime invalidation; leave history in Collaboration's durable store.
- Add a Go Live action on an owned, saved Board. It creates a normal Live Workspace, attaches that Board, and navigates to the room. No AWS machine or paid streaming infrastructure is provisioned.
- Keep people, invitations, resource attachments, plans, and machine-control leases available; present stage and chat first. Avoid nested scrolling canvases and overlaying machine controls.
- Deliberately disable Screen presentation rather than show a broken action. The Board editor (including BoardStream) still opens separately for now. Never claim embedded board video or machine/desktop streaming is complete.

## Q follow-on delivery: end-to-end collaboration

1. **Stage embedding**: extract a least-privilege Board presenter/viewer surface shared with the normal editor and Live Workspace. Board access must be individually authorized; attaching to a room must not silently grant edit or stream rights. Avoid iframe embedding a full application screen and scroll capture regressions.
2. **Media**: explicitly opt-in microphone, camera, and screen capture (getUserMedia/getDisplayMedia) only on click. Reuse or rationalize existing BoardStream signaling into a single room-scoped transport. Restrict join to workspace participants. Provide one presenter, visible speaking status, view-only attendees, safe handover, host ability to stop, and a bounded participant count. Do not create a parallel Board-only call system. Media must be encrypted in transit and all grants revocable.
3. **Screen and machine**: host can switch Board/Machine/Screen, everyone follows. No direct EC2/SSM credentials sent to observers. Bind machine input to existing single-owner, time-limited server-enforced leases; revoke on removal, expiry and session end. Shared desktop observation/control is a separate, currently incomplete feature, and must be finished and tested.
4. **Chat and people**: reuse collaboration messages, roles and invitations; support mobile tabs and accessible focus. No camera/mic auto-enablement on join.
5. **Recordings**: default off. Explicit consent/indication, owner-controlled stop, bounded length, quota and retention before any storage pipeline is enabled. Keep Board/chat as permitted after a meeting ends, while machines follow independent expiry.
6. **Admin split**: hide EC2, SSM, regions, raw diagnostics and provider configuration from learners. Keep useful statuses (starting, ready, connecting, stopped, expires), actions appropriate to policy, and incident identifiers. Require server-side RBAC to protect metadata, not merely conditional UI. Maintain administrator operational views.

## Security and operating limits

- No infrastructure or TURN relay provisioning as a side effect of visiting/creating a Live Workspace.
- Existing BoardStream requires BOARD_TURN_URLS, BOARD_TURN_SECRET and migration 059; no live-cross-network claim until configured and tested.
- Specify a media provider/relay budget and enforce maximum duration, participants, bitrates and concurrent sessions; alarms alone are not cost caps.
- Keep all lab CPU/storage spending governed by the pre-existing lab lifecycle. Room creation must never start an EC2 machine.
- Never auto-enable camera, microphone, screen sharing, recordings or machine control.
- Backend access must be checked for every resource, stream subscription, control token and chat mutation.
- Board sharing and workspace membership are not equivalent. Attaching a Board must not let a workspace observer bypass storyboard authorization.

## Release gates

- CodeBuild: lint/types, unit tests, server authorization tests and full Next production build.
- Browser on desktop and phone: create room, invite viewer, attach board, stage switch propagates, chat sends/receives, room retains previous chat, non-host cannot switch, revoked user cannot open room or resources, owner can leave and reconnect.
- Cross-account/cross-network: Board broadcast with and without TURN; deny/revoke while streaming; camera/mic/screen permission denied; presenter disconnect and reconnect; host handover.
- Desktop control: one controller at a time, revoked lease cannot send input; no unauthenticated observer desktop access.
- Real streaming and media costs measured before general rollout.

Do not merge or describe the full live collaboration experience as production-ready based only on the room-foundation PR.
