# Phase 1 — Mentor foundation

Builds on the [Phase 0 audit](./phase-0-audit.md). Adds mentor applications, evidence-based eligibility, the progression ladder, administrator review, qualifications, profiles and the mentor directory. No booking, sessions, payments or Live Workspace changes.

## What a user can do

| Who | Where | Capability |
| --- | --- | --- |
| Any signed-in user | `/academy/mentor-center` | See their stage on the ladder, Academy evidence per specialization, apply (Academy-grown or industry professional), withdraw, resubmit after requested changes, view history |
| Approved mentor | `/academy/mentor-center` | Edit headline, bio, time zone, availability note; list/unlist; pause/resume. Cannot change tier or qualifications |
| Any signed-in user | `/academy/mentors`, `/academy/mentors/[id]` | Browse approved mentors, filter by specialization and mentor type, view profile. Booking shows "coming soon"; no reviews are shown or fabricated |
| Platform admin | `/admin?tab=mentors` | Review queue, live evidence check, credential verification, start review / request changes / reject / approve; manage mentors (suspend, reinstate, revoke, tier, grant/revoke qualification) |

## Rules enforced on the server

- **Eligibility is evidence, not XP.** A capability counts only when demonstrated (assessment, or passed practice + reflection in the same enrollment) — the same rule as the proved-skills transcript. `academy_mastery`, active days and XP are never read.
- Academy-track applications require at least one specialization meeting its threshold (Linux systems 6/8, Windows identity 5/6), and may only claim evidenced specializations. Specializations without an Academy pathway (Docker, networking, cloud, security, databases, DevOps) are external-only until missions provide evidence.
- Evidence is re-checked at approval and when granting extra qualifications; an eligibility snapshot is stored on the application and each qualification.
- Academy-grown mentors start as **Approved Peer Mentor**; Verified/Senior require a later, justified admin action (Phase 3 will add Mentor Forge and Proof of Help inputs). External professionals can be approved at any tier.
- Only reviewer-verified credentials appear publicly. Internal reviewer notes are never returned to applicants or included in their data export.
- Administrators cannot review their own application or manage their own mentor profile.
- One open application per user (unique index), 14-day cooldown after rejection or revocation, suspended mentors cannot reapply.
- Directory shows only `active` + listed mentors with an active qualification whose account is active and not suspended. Email is never exposed.
- All mutations: authenticated, CSRF-protected, rate-limited (applications fail-closed 10/hour), audited (`mentor.*`, `admin.mentor.*`). Applicants and admins receive in-app notifications.

## Data

Migration `061_mentor_foundation.sql` (additive): `mentor_applications`, `mentor_application_events`, `mentor_profiles`, `mentor_qualifications`. All `users` FKs declare `ON DELETE` (owner → CASCADE, actor → SET NULL). Tables are registered in `REQUIRED_RUNTIME_RELATIONS` and the account export (`EXPORT_SOURCES`). `db:verify` now exercises the constraints on real PostgreSQL (duplicate open application, decision timestamp, https links, tier ladder, duplicate qualification, reviewer and applicant deletion).

Numbered 061 so it does not collide with PR #239's 060; the two can merge in either order.

## Manual smoke test (after migration 061 on a non-production database)

1. As a learner with no evidence, open Mentor center: stage is Learner, Academy track disabled.
2. Apply as an industry professional with a credential; confirm the application appears under `/admin?tab=mentors`, and the admin received a notification.
3. As a second admin, request changes; the applicant sees the feedback, edits and resubmits.
4. Approve with one specialization, tier Verified Mentor, verify the credential. The mentor appears in `/academy/mentors`; only the verified credential is shown.
5. Suspend the mentor → disappears from the directory and their profile URL returns 404; reinstate → reappears.
6. Try to approve your own application as an admin → refused.
7. Export the applicant's account data: mentor rows present, `reviewer_note` absent.

## Known limitations

- Booking, availability, Rescue Rooms, session history, ratings and Proof of Help are not implemented (Phase 2/3). The UI says so.
- Founders who are admins only through `OXSIG_FOUNDER_EMAILS` (without `users.role='admin'`) do not receive new-application notifications; they still see the queue.
- No identity-document or employer verification for external professionals; credential verification is a manual reviewer judgement recorded with a timestamp. Required before paid mentoring (Phase 5).
- Time zones are free-text IANA names validated server-side; there is no picker yet.
