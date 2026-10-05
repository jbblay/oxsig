# OXSIG

## Local development

Requirements:

- Node.js 22
- pnpm 10.28.0

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

## Verification

Run the same core checks used by AWS CodeBuild:

```bash
pnpm server:check
pnpm typecheck
pnpm audit:reachability
pnpm persistence:check
pnpm test:run
pnpm build
```

AWS CodeBuild is the authoritative CI provider. GitHub hosts source and pull requests; GitHub Actions is not used for CI.

See [CI and release security](docs/ci-release-security.md) for the build contract, triggers, failure triage, and deployment boundary.
