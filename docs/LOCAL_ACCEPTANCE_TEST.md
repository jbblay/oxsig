# OXSIG local acceptance walkthrough

This checklist is the user-level acceptance path for PR #120 after the product-readiness audit that began from `bd171f8b069eba326b74342a8f8cc8b783ca1354`.

The goal is to test OXSIG as a user, not to debug implementation details. A surface is called **ready** here only when its visible actions are backed by real APIs, persistence, or runtime behavior. Features that still need real provider/AWS proof are called **live validation required**. Features without the full backing implementation are called **pending**.

## Product readiness map

### Ready for local user testing

- Authentication and application shell
- Account/profile editing and avatar rendering
- Dashboard/action-first navigation
- Global AI Helper when `OPENAI_API_KEY` is configured
- Knowledge Vault CRUD, search, pin/archive, copy, and workflow handoffs
- Collaboration sessions, messages, members/invites, files/voice where providers are configured
- Live Workspace lifecycle, participants, resource contribution, and terminal View / Assist / Control foundations
- Storyboards / Boards editing and persistence; audio where storage/browser support is configured
- Resources management for collaborations, workspaces, invites, and infrastructure designs
- Cyber Lab lifecycle and AWS terminal/desktop implementation paths
- Infrastructure Designer persistence and its supported controlled one-VM execution path
- Operations catalog with Black Domain as the only launchable automated Operation
- Black Domain durable three-node Operation implementation
- WarRoom coordination surface and Live Workspace terminal-control handoff

### Live validation required before production-proven

- EC2 + SSM terminal end-to-end from the browser
- Windows/Kali desktop end-to-end, including keyboard and pointer behavior
- Black Domain three-node AWS launch, AD bootstrap, DNS, and workstation domain join
- Two-user WarRoom/Live Workspace observer and control-lease behavior
- Ably realtime behavior with multiple users
- S3-backed attachments/recordings where enabled
- Provider-backed AI Helper responses

### Pending implementation

- Automated runtimes for the five non-Black-Domain Operation scenarios
- Villain badge progression, unlock tracking, and scoring
- Shared desktop View / Assist / Control
- A durable Operation/WarRoom run relationship persisted directly onto a Live Workspace
- Arbitrary multi-node/router/switch/firewall/custom-network execution from Infrastructure Designer

### Retained but not a primary navigation surface

- Academy remains implemented and preserved in the codebase, but it is not part of the current action-first primary navigation. Do not use Academy as a release blocker for this acceptance pass.

## 1. Pull the audited branch

```bash
git fetch origin
git switch feature/operations-warroom-villain-badges-v1
git pull --ff-only origin feature/operations-warroom-villain-badges-v1
git rev-parse HEAD
```

Keep `.env.local` local. If it is ignored and untracked, Git will leave it untouched during the pull.

Install dependencies if needed:

```bash
pnpm install --frozen-lockfile
```

## 2. Local environment

Your existing `.env.local` should contain the providers you intend to test. For the AWS Operation path, verify at least:

```dotenv
LAB_AWS_ENABLED=true
LAB_AWS_REGION=eu-central-1
LAB_AWS_SUBNET_ID=...
LAB_AWS_SECURITY_GROUP_ID=...
LAB_AWS_OPERATION_SECURITY_GROUP_ID=sg-06296b32d174521ef
LAB_AWS_INSTANCE_PROFILE=...
```

Also keep your existing database, Clerk, AWS credential/profile, terminal bridge, OpenAI, Ably, S3, and other configured values as applicable.

The dedicated Operation security group is intentionally separate from the ordinary single-node lab security group.

## 3. Start OXSIG

```bash
pnpm dev:up
```

`dev:up` is the repository's normal local bring-up command. If you want an explicit schema check before the UI pass, the repository also exposes:

```bash
pnpm db:migrate
pnpm db:parity
```

## 4. Sign-in and Account

1. Sign in normally.
2. Open **Account**.
3. Change display name, bio, or avatar and save.
4. Navigate away and return.
5. Confirm the saved profile persists and the avatar/initials render consistently in the application chrome.
6. Inspect Villain badges.

**Pass:** profile mutations persist and avatar rendering updates correctly.

**Expected limitation:** Villain badges remain a criteria preview. They should not claim that real progression/unlocks are already being tracked.

## 5. Dashboard and navigation

1. Open **Dashboard**.
2. Use its primary actions to open Collaboration, Live Workspace, Operations, Cyber Lab, and Vault.
3. Return to Dashboard after creating activity later in this checklist and confirm relevant recent/active state is surfaced.
4. Check navigation at laptop width and at a narrow/mobile width.

**Pass:** actions open directly into the requested workspace and navigation remains usable without documentation-style dead ends.

## 6. AI Helper

Requires `OPENAI_API_KEY` for a live provider test.

1. Open AI Helper from Dashboard.
2. Ask a simple question.
3. Open it again from Operations and WarRoom and ask a context-sensitive question.
4. Reload and confirm prior helper history restores where expected.

**Pass:** responses arrive, errors are handled cleanly, and the helper recognizes the active OXSIG surface without inventing capabilities.

## 7. Knowledge Vault

1. Open **Vault**.
2. Create a useful command/note/item.
3. Edit and save it.
4. Pin it.
5. Search for it and use the kind/status filters.
6. Copy its content.
7. Exercise available workflow handoffs into Labs, Boards, or Collaboration.
8. Archive/unarchive it, then delete a disposable item.
9. Reload the page between actions to confirm persistence.

**Pass:** CRUD, filtering, pin/archive state, copy, and handoff actions work without losing persisted data.

## 8. Collaboration

1. Create a collaboration session.
2. Send several messages.
3. Reload and confirm history persists.
4. Invite a second account if available.
5. In a second browser/private session, join and send messages both ways.
6. If S3 is configured, upload/download an attachment.
7. If browser recording and storage are configured, record/send a short voice message.

**Pass:** durable messages/members survive reloads and, with Ably configured, the second user sees realtime changes without requiring a refresh.

## 9. Boards / Storyboards

1. Create a board/storyboard.
2. Draw/write several elements.
3. Exercise undo/redo, zoom, move, and other visible editing controls.
4. Save, reload, and reopen.
5. If audio storage is configured, record and play back a short segment.
6. Exercise share/revoke if exposed to your account.

**Pass:** saved visual state survives reload and audio/share operations work when their providers are configured.

## 10. Ordinary Cyber Lab

Start with Ubuntu before Windows/Kali.

1. Open **Cyber Lab**.
2. Provision an Ubuntu lab.
3. Confirm EC2 lifecycle reaches running.
4. Confirm SSM/readiness becomes available.
5. Open the terminal.
6. Run basic commands such as `whoami`, `uname -a`, and `ip addr`.
7. Close/reopen the terminal and verify reconnection.
8. Stop/start where supported and reconnect.
9. Destroy the lab and confirm the runtime is removed.

**Pass:** the application lifecycle matches AWS state and the terminal is genuinely interactive through the managed path.

### Desktop pass

1. Provision a Windows or Kali desktop-capable lab.
2. Open the desktop.
3. Test pointer movement/clicks.
4. Test keyboard input and required special-key/unlock behavior.
5. Resize/reconnect the browser.
6. Destroy the lab.

**Pass:** desktop is interactive, input maps correctly, and reconnect works.

If there are duplicate cursors, keyboard capture problems, or special-key failures, record those as concrete desktop transport issues for the next targeted fix pass.

## 11. Infrastructure Designer

1. Create/save a supported single-VM design.
2. Reload to confirm design persistence.
3. Generate/review the execution plan.
4. Authorize/execute through the visible controlled path.
5. Inspect runtime/evidence state.
6. Destroy/reset the runtime/design as appropriate.

**Pass:** supported one-VM execution is controlled, persisted, and reversible.

**Expected limitation:** complex routers/switches/firewalls/custom networks or arbitrary multi-node designs may be designed visually but are not a supported general execution runtime yet. The server should reject unsupported execution rather than pretend to deploy it.

## 12. Operations catalog

1. Open **Operations**.
2. Confirm **Black Domain** is the launchable automated Operation.
3. Confirm the other five scenarios are visibly marked **Planned** and do not expose misleading live-launch controls.

**Pass:** product readiness shown in the UI matches actual runtime support.

## 13. Black Domain — Practice

This is the most important AWS acceptance test.

1. From Operations, start **Black Domain** in Practice mode.
2. Confirm a durable Operation run is created.
3. Confirm the topology provisions:
   - Ubuntu operator
   - Windows Server 2022 domain controller
   - Windows Server 2022 workstation
4. Keep the Operation run/status strip visible while moving through the app.
5. Open the Ubuntu operator in Cyber Lab and confirm its terminal works.
6. Inspect `/opt/oxsig/operation.env`.
7. Confirm it exposes the Operation scope/private target information and initial lab identity expected by the runtime.
8. Verify `blackdomain.local` DNS/domain bootstrap from the operator where appropriate.
9. Verify the workstation has joined the domain after guest bootstrap completes.
10. Verify the operator can reach the private Windows targets through the Operation network.
11. End the Operation.
12. Verify all three EC2 instances terminate, not just the operator instance.

**Pass:** lifecycle, topology, guest bootstrap, private connectivity, and full teardown all succeed.

Remember: EC2 `running` means the instance is running; it does not by itself prove AD promotion/domain join has finished.

## 14. WarRoom / Live Workspace — two-user test

1. Start Black Domain in WarRoom mode.
2. Open **WarRoom**.
3. Confirm WarRoom presents the Operation/objectives/evidence/team model but does **not** display fake embedded terminals.
4. Confirm the active run remains associated through the navigation URLs.
5. Open **Live Workspace** from WarRoom.
6. Create/select a workspace.
7. With two accounts/browser sessions, join the same workspace.
8. Contribute an owned Cyber Lab terminal resource.
9. From the second account, test **View**: terminal output should be observable without an input path.
10. Test **Assist** request/grant behavior.
11. Test **Control** with an active server-approved control lease.
12. While the observer does not own a valid active lease, verify it cannot inject terminal input.
13. Revoke/expire/release control and verify input is blocked afterward.

**Pass:** live terminal sharing follows the participant/resource/control-lease model and observers never gain an unrestricted AWS SSM input session.

**Expected limitation:** shared desktop View/Assist/Control is not implemented yet.

## 15. Resources and lifecycle cleanup

1. Open **Resources**.
2. Rename/delete disposable collaborations.
3. Revoke a disposable invitation.
4. End/delete a disposable Live Workspace.
5. Reset/delete a disposable infrastructure design where appropriate.
6. Return to AWS and verify no test EC2 instances that should have been destroyed remain running.

**Pass:** user-visible lifecycle controls clean up both persisted product state and runtime resources as designed.

## Acceptance result

Record each section as:

- **PASS** — behavior matches the checklist.
- **FAIL** — the feature is implemented but a concrete action fails; capture the exact action, visible error, browser console/server log if relevant, and AWS state if applicable.
- **NOT TESTED** — required provider/account/second user is unavailable.
- **EXPECTED LIMITATION** — behavior matches one of the explicitly pending areas above.

The next engineering pass should fix **FAIL** results, not expand unrelated scope. That keeps the application foundations stable while turning live-test evidence into targeted remediation.