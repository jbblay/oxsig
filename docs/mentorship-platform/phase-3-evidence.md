# Phase 3: evidence-driven mentorship (Issue #257)

This branch builds on Phase 2 PR #242 and integrates the Docker Mission Control branch from PR #239. It is for independent review only. Do not merge or deploy until the verification gates below are satisfied.

## Source of truth and integration

- `learning_capability_evidence` and the existing proved-skills transcript remain the capability source. No duplicate Academy evidence service or XP entitlement is introduced.
- Docker mission verification remains in `academy_mission_progress`; Passport output projects only fixed mission identifiers and verification timestamps.
- `mentor_profiles` and `mentor_qualifications` remain the authorization source. Audition acceptance and quality review never update mentor roles automatically.
- Rescue Rooms remain ordinary Live Workspaces. Successful room access records attendance; this proves entry authorization, not continuous attendance or video participation.
- Migration 060 is preserved byte-for-byte from #239; 061 and 062 remain byte-for-byte from #242. The checksum manifest and schema parity retain all three. Migration 063 is additive.

## Implemented workflows

The Academy navigation links to `/academy/mentor-forge`. Applicants submit versioned Docker-port teaching auditions with explanation, diagnostic questions and reasoning. All four rubric dimensions must score at least 3/4 before a human reviewer can accept. One pending audition per applicant, 24-hour resubmission delay and no repeat accepted auditions prevent award farming. There are no AI approvals or rewards.

Participants in a completed session independently submit outcome, rating and reflection. Both must have requested valid Rescue Room access. Feedback is editable for 24 hours, stopping when quality review is requested. Outcome and star ratings are not technical proof.

Reports are visible only to the reporter and administrators. The admin queue at `/admin/mentorship-evidence` records reasons and transactional audit events. Session participants, audition owners, subjects and original appeal reviewers cannot decide their own cases. An upheld appeal reopens the underlying decision; it never grants privileges. Teaching quality review requires both participants' independent feedback.

A promotion to verified requires an accepted audition in the last year, active qualification, two independently reviewed sessions with two learners, and no unresolved/upheld conduct report. Senior requires five reviewed sessions with three learners. Administrators still make the final decision. This gate also blocks an external professional from bypassing evidence by selecting a high tier at initial approval; they can start as an approved peer. Existing mentor tiers are not retroactively changed.

Skills Passport is private until explicit share consent. A share stores only a SHA-256 token hash, expires in at most seven days, and is revocable. Every public read re-derives an allowlisted summary; no raw evidence JSON, commands, lab IDs, names or emails are exposed. Capabilities and missions older than one year are labeled expired; abandoned capabilities and inactive qualifications are marked withdrawn. No cash, wallet or payment behavior is introduced.

## Verification and deployment gates

Run typecheck, the complete Vitest/node suite, migration integrity, reachability, persistence, environment contract, production build, and `db:verify` against an empty disposable PostgreSQL database. CI fixtures cover audition versioning/self-review, feedback uniqueness, share TTL and deletion cascades, in addition to all Phase 1/2 and Docker checks.

Local PostgreSQL installation was blocked by host package-manager permissions. Do not infer database success from mocked unit tests. AWS CodeBuild is the required PostgreSQL gate.

Manual browser checklist (desktop and mobile): applicant submission/reload; another account cannot read or submit it; admin acceptance with rubric and reason; self-review rejection; independent appeal; two participants enter and complete a session; each records feedback; cancelled/no-show feedback rejection; report privacy; quality review; promotion refusal without prerequisites; Passport consent, open in signed-out browser, revoke and expire; account export and deletion. A live Docker lab, Clerk identity, real Ably room, and SSM terminal must be verified in an authorized live test environment before release.

Outstanding product limitation: promotion/suspension/revocation appeals through the profile management workflow need further implementation; the new appeal workflow currently covers auditions and report/quality decisions. Public Passport is a structured JSON summary rather than a styled public page. Audition v1 is deliberately limited to the Docker port simulation. The initial implementation requires independent security review and is not claimed production-ready.
