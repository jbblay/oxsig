# Oxsig

Oxsig is a learning and collaboration workspace that connects visual explanation, shared resources, and practical cloud labs.

## Core architecture

- **Vercel** — Next.js web application
- **Clerk** — user identity and sessions
- **Neon** — PostgreSQL application data
- **AWS S3** — workspace files
- **AWS EC2 + SSM** — temporary lab machines

## Current product surface

- Home workspace
- Account/profile
- Storyboards: drawing, voice recording, replay, and sharing
- Cloud storage
- AWS Cyber Lab

## Local development

1. Install dependencies: `pnpm install`
2. Copy `.env.example` to `.env.local` and add development values.
3. Apply database migrations: `pnpm db:migrate`
4. Start Next.js: `pnpm dev`

`.env.local` is the development configuration source. Production uses the same application variable names in Vercel, except local AWS authentication (`AWS_PROFILE`) is replaced by a production IAM/OIDC role.

Historical experiments and removed features remain available through Git history and older branches.
