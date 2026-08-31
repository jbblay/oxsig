# OxSig

OxSig is a focused document-signing application. The supported web flow stores a file privately, computes its SHA-256 digest, creates an Ed25519 signature, verifies that signature against the server-stored digest, and records a downloadable receipt.

## Supported core

- Email/password accounts with short-lived Ed25519-signed access tokens
- Rotating, server-validated refresh sessions
- Owner-scoped document upload, listing, download, update, and deletion
- Private MinIO object storage with a 25 MB upload limit
- SHA-256 integrity digests computed independently by client and server
- Ed25519 signature creation and server-side verification
- Downloadable JSON signature receipts

Ed25519 is a modern digital-signature algorithm, but it is **not post-quantum**. Experimental post-quantum, blockchain, zero-knowledge, collaboration, and AI claims are not part of the supported signing path.

## Quick start

Requirements: Node.js 22.13+ (Node.js 24 recommended), pnpm 11.19+, and Docker with Compose.

```bash
pnpm install --frozen-lockfile
pnpm setup
pnpm services:up
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and choose **Sign a document**.

The minimum runtime stack is:

- PostgreSQL on port `5432`
- MinIO on ports `9000` (API) and `9001` (console)

pgAdmin remains an optional development tool and is not required by the signing flow.

```bash
docker compose --env-file .env.local --profile tools up -d pgadmin
```

Stop local services with:

```bash
pnpm services:down
```

## Preview demo

Vercel Preview deployments show an **Enter demo workspace** button. The demo uses a short-lived, HTTP-only preview session, does not require PostgreSQL, returns an empty workspace, and rejects every write operation. It is disabled on production deployments.

To exercise the same flow locally, set `OXSIG_DEMO_MODE=true` while running in development.

## Configuration

`pnpm setup` creates `.env.local`, preserves existing values, and generates a persistent Ed25519 JWT key pair without printing private key material. See `.env.example` for every supported setting.

The checked-in PostgreSQL and MinIO credentials are development defaults. Replace them, use TLS, and provision durable storage before deployment. Production startup refuses to create ephemeral JWT keys.

Fresh PostgreSQL volumes run the SQL files in `migrations/` automatically. `pnpm db:migrate` is idempotent and applies any migration not recorded in `schema_migrations`, which also supports existing development volumes.

## Verification

Run the complete local quality gate:

```bash
pnpm check
```

Or run individual checks:

```bash
pnpm lint
pnpm typecheck
pnpm test:run
pnpm build
pnpm audit --prod --audit-level=high
```

CI runs migrations against PostgreSQL 16 before linting, type checking, testing, auditing production dependencies, and building the application.

## Core API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/auth/register` | Create an account and session |
| `POST /api/auth/login` | Start a session |
| `POST /api/auth/refresh` | Validate and rotate a refresh session |
| `POST /api/auth/logout` | Revoke the current refresh session |
| `GET/POST /api/documents` | List or create owner-scoped documents |
| `POST /api/documents/upload` | Store and hash a private file |
| `GET/PATCH/DELETE /api/documents/:id` | Manage an owned document |
| `GET /api/documents/:id/download` | Download an owned file |
| `GET/POST /api/signatures` | List or create verified signatures |
| `POST /api/signatures/verify` | Re-verify a stored signature and digest |

All non-authentication API routes require a valid access token. Document and signature queries are scoped by the authenticated user on the server; client-provided owner or signer IDs are not trusted.

## Security notes

- Refresh tokens are stored as SHA-256 fingerprints, not reusable plaintext tokens.
- HTTP-only, `SameSite=Strict` cookies carry browser sessions.
- Uploaded objects are private; the application streams downloads only after ownership checks.
- The signing API verifies the submitted Ed25519 signature before inserting a record.
- Signature records cannot be deleted through the API.
- The browser creates a fresh Ed25519 key for each signature and discards the private key afterward. The server binds the verified public key and digest to the authenticated account; this is an integrity record, not a government-issued identity certificate.

For a production deployment, add managed secrets, TLS, backups, centralized rate limiting, malware scanning, monitoring, and an external security review.
