# Board broadcasting and Windows desktop sign-in

## Windows

Standalone Windows browser labs configure a dedicated **standard** local account,
`oxsig-desktop`, matching the dedicated Linux desktop model. The guest generates
its password and stores the Winlogon password through Windows LSA private data;
no password is embedded in SSM input, output, or a plaintext Winlogon value.
This is persistent automatic console sign-in for the lifetime of the lab VM.
Local administrators can access LSA secrets; this is for isolated lab guests.

The shared Labs/Operations desktop bootstrap upgrades older VNC-only guests.
A fresh guest with no interactive user restarts once. An existing interactive
session is preserved and switches on its next restart. Domain-joined guests
retain manual login. Administrator password issuance remains available separately;
rotating that password does not invalidate the dedicated desktop account.
The browser waits up to ten minutes for initial installation and startup.

This does not automatically unlock a manually locked session or override domain
logon policies. Live verification is required on the supported Windows AMIs:
new guest, existing VNC-only guest, reboot, and manual administrator elevation.
The PowerShell/native LSA code cannot be execution-tested in the Linux test runner.

## Board streaming

The Board owner selects **Present Board**, grants microphone permission, and can
optionally include camera video. Drawing pixels and the camera inset are composed
into a 1280x720 stream, sent with microphone audio using WebRTC. Shared Board
members select **Watch live**. This is a one-presenter broadcast, not a group call.
Streams are not recorded. Eight viewers are supported; streams end after 45 minutes.

Apply migration `059_board_live_streams.sql`. Configure:

- `BOARD_TURN_URLS`: comma-separated TURN/TURNS relay URLs.
- `BOARD_TURN_SECRET`: the coturn REST shared secret, stored server-side.

The relay must support time-limited HMAC-SHA1 REST credentials. Clients receive
one-hour credentials, never the shared secret. A missing relay configuration
produces an explicit unavailable message before camera/microphone acquisition.
No relay infrastructure or paid service is created by this change.

Authenticated, CSRF-protected requests carry only SDP/ICE signaling. Each poll
checks current Board membership. Sessions expire after 20 seconds without a
heartbeat. Revoked peers disappear from the presenter's peer list on its next
poll; local capture stops on leave, navigation, expired access, or network failure.
Cleanup deletes expired leases and old signals during subsequent requests. No
media bytes are persisted, but SDP/ICE metadata may remain until that cleanup runs.

Before rollout: verify two separate accounts and networks through the configured
relay; camera/microphone denial, muted playback, late join, presenter exit,
revocation, mobile backgrounding, and Board switching. Mobile browsers can suspend
background capture and polling; rejoin after returning to the foreground.

## Validation

Automated coverage includes server authorization, CSRF, session ownership,
presenter-only offers, viewer limits, expiring relay credentials, permission-prompt
cancellation, and Windows bootstrap secret-handling contracts. Live Windows and
cross-network media checks remain deployment gates.
