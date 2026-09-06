# Live Workspace Shared Terminal Transport v1

This document defines the authorization and transport boundary for shared terminal control in OXSIG Live Workspace.

## Scope

Shared Terminal Transport v1 allows only the authenticated participant who currently holds the active terminal control lease for an exact attached lab binding to open and send input to that lab's AWS Systems Manager shell.

This slice does not add desktop control, output broadcast to observers, multi-controller input, recording, replay, or generic PTY/SSH transport.

## Authorization chain

```text
Authenticated participant
  -> active Live Workspace
  -> active collaboration membership / eligible role
  -> exact attached lab resource binding
  -> exact underlying lab instance
  -> terminal provisioned surface
  -> active unexpired terminal control lease
  -> encrypted one-time terminal bridge ticket
  -> Vercel terminal bridge
  -> live lease revalidation
  -> AWS SSM data channel
```

Workspace membership, resource attachment, a control request, and possession of a lease ID are each insufficient by themselves.

## Session creation

`POST /api/live-workspaces/[id]/terminal/session`

The browser supplies only the attached resource binding ID. The server derives the participant from authentication and resolves the active lease server-side.

Before starting AWS SSM, the server requires:

- active Live Workspace and collaboration;
- authenticated participant currently eligible for terminal control;
- active, unexpired terminal lease for that participant and exact binding;
- exact lease-to-lab identity match;
- attached owner-owned lab resource;
- terminal provisioned access mode;
- unexpired AWS EC2 lab runtime;
- EC2 running;
- SSM instance profile configured;
- SSM registration present and Online.

The browser cannot choose `participantId`, `leaseId`, `labInstanceId`, grantor identity, AWS target, or AWS StreamUrl during session creation.

If AWS starts a Session Manager session but ticket minting or the remainder of setup fails, OXSIG performs best-effort termination of that partially started SSM session.

## Bridge ticket

The existing OXSIG encrypted one-time terminal bridge ticket remains the transport credential. Shared terminal tickets additionally contain a server-generated encrypted control binding:

```text
collaborationId
participantId
resource binding ID
lab instance ID
lease ID
surface = terminal
```

The binding is encrypted inside the ticket and is not sufficient by itself. The terminal bridge independently revalidates it against PostgreSQL.

Ordinary owner terminal and desktop bridge tickets do not need this additional field and remain backward compatible.

## WebSocket enforcement

Production continues to use `src/app/__oxsig/terminal-bridge/route.ts` with Vercel's App Router WebSocket upgrade support.

For a shared terminal ticket, the bridge:

1. verifies the encrypted ticket;
2. atomically consumes the one-time ticket in PostgreSQL;
3. revalidates the active Live Workspace terminal authorization before opening AWS;
4. validates and SigV4-signs the AWS SSM data-channel endpoint;
5. revalidates the live control lease before forwarding every SSM `input_stream_data` frame from the browser;
6. revalidates an idle shared connection approximately every two seconds;
7. closes both sides and best-effort terminates the shared SSM session when authorization becomes invalid.

A revoked or expired lease therefore cannot continue sending terminal input merely because a WebSocket was already open.

Malformed binary browser frames are handled fail-closed by requiring live authorization before they can be queued or forwarded.

## Client behavior

The Live Workspace UI shows the shared terminal only to the participant whose active lease covers that exact terminal resource.

The client uses the existing `SsmBrowserDataChannel` and xterm stack. Normal keystrokes are briefly batched to avoid a database lookup for each physical key event; Enter/newline, Ctrl-C, and Ctrl-D flush immediately. The bridge remains the authoritative enforcement point.

The client lease-expiry timer is a usability mechanism only. Security does not depend on it; the server and bridge revalidate authorization independently.

## Invalidation

PR #90 already invalidates control leases when relevant Live Workspace relationships change, including resource detach and participant demotion to observer. Shared Terminal Transport v1 consumes that same authorization state.

The bridge also rejects authorization when the current workspace/member/resource/lab/surface state no longer satisfies `getActiveControlLease(...)` and the exact server-bound lease/lab identity checks.

## Required live validation

CI can prove application contracts, schema compatibility, type safety, unit/API tests, and production build. It cannot prove the external AWS/Vercel runtime.

After merge, live validation should cover:

- learner requests terminal control;
- owner/instructor approves;
- lease holder opens the shared terminal and executes a harmless command;
- non-holder cannot obtain a shared terminal session;
- revoking the lease closes an already-open terminal and blocks further input;
- lease expiry closes an already-open terminal and blocks further input;
- detaching the lab closes/invalidates shared control;
- demoting the controller to observer closes/invalidates shared control;
- existing owner terminal continues to work;
- existing desktop transport continues to work.

Do not describe the AWS/Vercel shared-terminal path as live-proven until those tests are performed against the deployed environment.
