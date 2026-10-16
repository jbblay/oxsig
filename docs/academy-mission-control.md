# OXSIG Academy Mission Control v1 (Docker)

## Scope

This release adds an authenticated **/academy/missions** experience with three Docker missions:

1. Deploy an Nginx container named `oxsig-academy-web` on **localhost:18080**.
2. With explicit confirmation, seed a deliberate port-mapping fault on the **Academy-owned** container only. Diagnose and repair it.
3. Deploy the same container using a named volume `oxsig_academy_data`, write the requested one-line index page, and verify it remains reachable.

The UI reuses the existing learner-owned AWS EC2 / SSM terminal. The backend runs fixed **read-only** verification commands through AWS Systems Manager, never trusts the browser to report success, and stores verification in `academy_mission_progress`. The only server-driven mutation is the learner-confirmed, reserved-container fault seeding for Mission 02. Students use their live terminal for deployment and repair.

## Deployment prerequisites

- Apply migration **060_academy_mission_control.sql**, retaining its checksum in `migrations/checksums.json`.
- The existing Clerk authentication, PostgreSQL, AWS lab runtime, and SSM terminal must work.
- Start a Linux Cyber Lab that supports Docker. On the current Ubuntu lab images Docker **is not preinstalled by OXSIG**. Install and enable Docker *inside a disposable lab* following official OS/Docker instructions before attempting these missions. The app shows a failed Docker-daemon check until it is available.
- Ensure the lab can pull `nginx:alpine` or pre-pull the image. No public port ingress is required: probes use `127.0.0.1`.
- Configure `OPENAI_API_KEY` to use the live AI mentor. Hint presets are available without the AI provider.

## Manual smoke test

1. Sign in. Open **Academy → Mission Control** and choose a running Linux lab.
2. In the terminal, check `docker info`, then run `docker run -d --name oxsig-academy-web -p 18080:80 nginx:alpine`.
3. Choose **Tests → Run live verification**. All four checks should pass. Refresh the page: XP and completion should remain persisted.
4. Open Mission 02. Click **Seed broken deployment**, confirm the explicit warning, and verify the service is broken at port 18080. Inspect using `docker ps` and `docker port`; repair only the reserved container; rerun verification.
5. For Mission 03, create `oxsig_academy_data`, recreate with `-v oxsig_academy_data:/usr/share/nginx/html`, then place the line `OXSIG Academy persistent` in `index.html`. Verify HTTP 200 and all six checks.
6. In each mission, add an engineering note and reload to confirm durable state. Switch difficulty; this changes guidance but **not** the passing standard.
7. Confirm a learner cannot access another account's lab ID and that a mission cannot be verified while the previous one is incomplete.

## Explicit limitations

- This is an initial Docker mission engine, **not** a general-purpose isolated container service. Labs are still learner-owned EC2 machines and may incur costs.
- Verification is a snapshot of the live lab, not proof of long-term uptime, or a destructive storage-recreation test.
- No automated Docker installation is performed. Existing lab lifecycle/expiration rules remain in force.
- This release does **not** merge automatically or deploy to production. Apply the migration and confirm CI, permissions, lab readiness and acceptance tests before merging.
