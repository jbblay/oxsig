# Phase 2 — Free mentorship and Rescue Rooms

Builds on [Phase 1](./phase-1-mentor-foundation.md). Free, bookable mentorship with mission-based help requests and time-limited Rescue Rooms built on the existing Live Workspace. No payments.

## What users can do

| Who | Where | Capability |
| --- | --- | --- |
| Approved mentor | Mentor center → "Sessions you offer" | Create session types (quick help 15 min, guided coaching 30, deep session 60, project review) limited to their approved specializations; weekly availability in their time zone |
| Learner | Academy lesson → **Request human help** | Opens Find a mentor with the lesson topic prefilled and context sharing pre-ticked |
| Learner | Mentor profile → Book a free session | See open slots in their own time zone, describe the goal and what they tried, optionally share the current Academy lesson |
| Both | `/academy/sessions` | Confirm/decline (mentor), cancel (either, with reason; inside 2 h is flagged late), reschedule (learner, mentor re-confirms), complete with summary / no-show (mentor), join Rescue Room |
| Both | Rescue Room (`/live?workspace=…`) | Existing Live Workspace: chat, shared board, coordination notes, terminal observation and control leases |

## Security model

- **Free only, at the schema level.** `price_cents` has `CHECK (price_cents = 0)` on offerings and sessions; the API has no price field. Enabling paid sessions requires a reviewed migration.
- **Qualification restriction.** Offerings may only list held specializations; booking re-checks that the mentor *currently* holds the requested one.
- **Double-booking protection.** Booking takes per-user advisory locks (learner and mentor, sorted) and then checks overlap for both people in either role (`tstzrange &&`). Unique partial indexes on `(mentor_id, starts_at)` and `(learner_id, starts_at)` back this up. Lifecycle changes take the same locks first, so the paths cannot deadlock.
- **Pilot limits.** Up to 3 upcoming sessions per learner, bookings 30 min to 30 days ahead on 15-minute boundaries, 10 bookings/hour (fail-closed).
- **Roles come from the database row**, never from client input. Non-participants get 404.
- **Shared context is derived on the server** from the learner's active course: course/lesson title, summary and practice instruction only. Never commands, terminal output, lab ids or credentials.
- **Rescue Room = learner-owned Live Workspace with a hard end.**
  - **Timing:** it opens 10 minutes before the start, and `live_workspaces.expires_at` is set to the end + 10 minutes.
  - **Mentor role:** `instructor`. They can observe, chat, request control, and approve the learner's own terminal lease. They cannot attach the learner's resources or end the room.
  - **Sharing:** nothing is attached automatically. The terminal is visible only while the learner holds a control lease.
  - **Mentor control:** the mentor must request control and the learner must approve it. Every lease is time-limited and revocable. The existing bridge re-checks it every 2 s.
- **Expiry is enforced without a background job.** It is checked in `getLiveWorkspaceAccess`, control access, `getActiveControlLease`, terminal preparation, the terminal bridge (`assertTerminalWorkspaceControl`) and `getCollaborationAccess` (chat and realtime). Lease grants are clamped to the room end.
- **Closing a room** happens on cancel, completion, no-show, reschedule or lazy sweep. It cancels pending control requests, revokes leases, ends the workspace and removes the mentor's membership.
- **Admin suspension or revocation** of a mentor cancels their upcoming sessions, closes their rooms and notifies the affected learners.

## Data

Migration `062_free_mentorship.sql` is additive:
- New tables: `mentor_session_offerings`, `mentor_availability_rules`, `mentorship_sessions`, `mentorship_session_events`.
- New nullable column `live_workspaces.expires_at`. `NULL` means existing rooms behave exactly as before.

Deletion rules:
- Deleting a learner cascades their sessions.
- Deleting a mentor sets `mentor_id` to NULL, so the learner keeps their history. Open sessions without a mentor are cancelled lazily.
- `offering_id`, `rescheduled_from` and `collaboration_id` are snapshot references without foreign keys. With FKs, deleting a mentor account put two referential actions on the same session row (user → profile → offering, plus `mentor_id`), and PostgreSQL rejected the deletion. CI now guards this case. The application treats a missing offering, original booking or room as "no longer available".

The new tables are added to the account export and `REQUIRED_RUNTIME_RELATIONS`. `db:verify` now exercises on real PostgreSQL:
- paid offering rejected;
- duplicate mentor slot rejected;
- window/duration mismatch rejected;
- self-session rejected;
- confirmation without a timestamp rejected;
- overlap query correct, and back-to-back sessions allowed;
- mentor deletion keeps the learner's history.

## Manual smoke test (non-production, migrations 061–062, Ably + a lab available)

1. As an approved mentor: add a 30-min session type and a weekly window starting at least an hour from now.
2. As a learner: open an Academy lesson → Request human help → pick the mentor → book with "share lesson" ticked.
3. Book the same slot from a second learner → refused (`SLOT_TAKEN`).
4. Mentor confirms; within 10 minutes of the start both see **Join Rescue Room**.
5. Learner attaches their own running lab, requests terminal control; mentor approves; mentor observes output.
6. Mentor requests control; learner approves, then revokes → mentor input stops within ~2 s.
7. Mentor marks complete with a summary → room ends, mentor can no longer open it or its chat; learner sees the summary.
8. Admin suspends a mentor with an upcoming session → the session is cancelled and the learner notified.

## Known limitations

- **No reminders or scheduled notifications.** There is no job scheduler. Expiry and stale-request handling happen when someone next reads or acts on the data.
- **No group workshops, office hours or availability exceptions** (holidays). Mentors pause instead.
- **Screen sharing, voice/video and remote desktop are not implemented in rooms.** The Live Workspace Screen control stays disabled. Terminal observation and control are the only machine surfaces.
- **Terminal observation consent is implicit.** The learner's own lease approval is the consent, and there is no separate observation toggle yet.
- **Expired rooms may remain listed** in the mentor's collaboration list until the next sweep, but every access path refuses them.
- **Ratings, Proof of Help, disputes and reports** belong to Phase 3.
