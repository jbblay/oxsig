# OXSIG production incident audit — 9 September 2026

## Scope and limits

Reviewed the supplied 100 runtime log records and seven screenshots against repository commit `03a8d026a7db829dbd010b9bf5b58ccb9d878bdb`. Source review covered bridge routing/authentication, terminal and desktop session APIs, SSM diagnostics and desktop bootstrap, operation allocation, cleanup scheduling, authentication/CSRF/rate limiting, and monitoring/build configuration. This is a targeted production incident audit, not a completed application-wide security certification.

The supplied logs reference deployment `dpl_3YjY9H6CceCvJCiLxaGRpcp9WMh2`. The current source includes a subsequent middleware exclusion change; equivalence between this commit and that deployment was not verified. Live Vercel project inspection returned `403 Forbidden`. No AWS account state, database state, authenticated browser session, or live WebSocket handshake was available. GitHub source was available through the connector; direct git clone authentication was unavailable.

## Findings and disposition

| Priority | Evidence | Diagnosis / action | Status |
| --- | --- | --- | --- |
| P0 | Two logged `GET /__oxsig/terminal-bridge` responses are 404; both terminal and desktop repeatedly disconnect | `src/app/__oxsig` starts with `_` and is private to Next.js. Rename it to `%5F_oxsig`, which preserves the public `/__oxsig` URL. The middleware exclusion alone cannot register a private route. | Corrected in this change; deployment and live handshake still required |
| P1 | Screenshot reports Systems Manager must be Online | Session APIs already reject unregistered/offline SSM nodes. EC2 `running` does not prove SSM readiness. Inspect agent service/logs, actual attached instance profile, region/account, and outbound endpoint connectivity. | AWS-side cause unresolved; checks retained |
| P1 | Repeated `Invalid Sentry Dsn: https://sentry.io` | A homepage is not a project DSN. Production contract previously validated only URL syntax. It now requires a key and numeric project ID. Set both intended server/browser DSNs to real project values, or intentionally unset unused integrations. | Validation corrected; live environment values not changed |
| P1 | `next.config.ts` sets production `removeConsole: true` | Application warnings/errors are removed from compiled code, impairing fallback diagnostics when Sentry is broken. Preserve `console.warn` and `console.error`. | Corrected |
| P1 | Existing bridge tests passed on source in a private folder | Source-level tests do not establish route deployment. The build now checks Next.js route manifests and the emitted bridge handler. | Build gate added |
| P2 | One desktop session POST returns 425 | Source returns `DESKTOP_BOOTSTRAP_PENDING` or `DESKTOP_SERVICE_NOT_READY`. The copied logs lack the response body, so the precise case is unknown. Verify installer completion, bootstrap lock, service, ready marker and loopback listener. | Expected readiness gating; pending runtime verification |
| P2 | Two operation launch POSTs return 409 | Black Domain checks for an existing lab allocation and returns a structured conflict. A running lab is visible in the screenshots, making allocation conflict plausible; the exact response code/body is required to confirm. | No bypass of allocation protection |
| P2 | Three 401 records followed by later successful requests | Could be an absent/expired session or an authentication transition; the logs cannot identify which. Authentication helper returns 503 on account lookup failure and 401 when unauthenticated. | Needs browser response/session evidence |
| P2 | Cleanup cron is `17 2 * * *` | Repository scheduler is daily. If no external cleanup scheduler exists, this alone cannot enforce prompt EC2 termination at a one-hour UI expiry. Confirm external scheduling before changing cadence or promises. | Operational verification outstanding |
| P3 | Repeated `/api/labs` reads approximately every seven seconds | Consistent with polling; not enough evidence to call it an infinite loop. Consider pausing polling for hidden tabs after measuring browser traffic. `cache: MISS` is not itself an error for private dynamic APIs. | Optimization candidate |

## Relevant controls observed

- Owned-lab queries bind both lab ID and owner ID; session creation checks authentication, CSRF, expiry and runtime readiness.
- Bridge tickets are encrypted, short lived and claimed once through a database uniqueness boundary. Shared workspace control is revalidated. The route rename preserves these controls and the middleware exclusion.
- Desktop readiness requires a loopback listener before creating the tunnel. Windows bootstrap verifies its installer checksum. These source checks do not establish current guest state.
- Cleanup authenticates a cron secret and takes an advisory lock; it checks expired database records and tagged AWS instances. Execution and cadence have not been verified in production.

## Validation

Local `node --test scripts/tests/production-regressions.mjs`: 5 tests passed. Tests cover optional/valid/invalid server and browser DSNs, redaction of invalid values, and rejection of missing route mappings or compiled artifacts.

A complete local Next.js build, full test suite and live AWS/browser tests were not run from the partial connector checkout. Repository CI should run its existing install, typecheck, tests, database checks and build, plus the new regression tests and post-build route gate. A green build establishes route emission, not working AWS connectivity.

## Production acceptance

1. Correct production Sentry configuration and deploy a build that passes the route gate. An unauthenticated GET to `/__oxsig/terminal-bridge` should reach the handler and return 401, not 404. This does not prove an upgrade works.
2. Inspect the affected instance in the configured AWS region: EC2 state, actual IAM profile, SSM registration/PingStatus and SSM Agent logs. The app's `instanceProfileConfigured` flag reflects environment configuration, not proof of the instance's actual attachment.
3. Start a fresh terminal session and verify WebSocket upgrade, SSM channel negotiation, visible command output and clean disconnect. Never reuse consumed bridge tickets or log ticket/token values.
4. Verify Windows desktop service bootstrap and loopback readiness, then RFB handshake, rendered pixels and input. Test reconnect and expired-session denial.
5. Capture structured 409/425/401 response bodies without cookies or credentials; retain readiness/allocation protections.
6. Verify cleanup execution and reconcile expired instances. Confirm no billed runtime survives beyond the intended cleanup window.

## References

- [Next.js private folders and encoded underscore routes](https://nextjs.org/docs/app/getting-started/project-structure#private-folders)
- [Next.js compiler console removal](https://nextjs.org/docs/architecture/nextjs-compiler#remove-console)
- [AWS managed-node availability troubleshooting](https://docs.aws.amazon.com/systems-manager/latest/userguide/fleet-manager-troubleshooting-managed-nodes.html)
- [Sentry DSN configuration](https://docs.sentry.io/platforms/javascript/configuration/options/#dsn)
