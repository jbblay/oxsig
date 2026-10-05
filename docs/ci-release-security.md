# CI and release security

## Authoritative CI provider

OXSIG uses AWS CodeBuild project `oxsig-ci`. The repository-owned source of truth is the root `buildspec.yml`; GitHub is the source and pull-request host, not the build runner.

CodeBuild uses Node.js 22 and pnpm 10.28.0, installs the frozen lockfile, and runs:

1. `pnpm server:check`
2. `pnpm typecheck`
3. `pnpm audit:reachability`
4. `pnpm persistence:check`
5. `pnpm test:run`
6. `pnpm build`

Database migration/parity and browser E2E checks require additional runtime services or dependencies and are not part of this core CodeBuild gate. Run those intentionally when the change requires them.

## Trigger contract

The CodeBuild webhook is expected to build:

- pull-request create/update/reopen events targeting `main`;
- pushes to `main`.

The reported GitHub status context is `AWS CodeBuild / oxsig-ci`.

## Reproduce CI locally

```bash
corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
pnpm server:check
pnpm typecheck
pnpm audit:reachability
pnpm persistence:check
pnpm test:run
pnpm build
```

If CodeBuild fails, reproduce the failing command locally first. Use the CodeBuild phase message to distinguish dependency-install failures from verification failures, then inspect the CloudWatch log stream linked from the build.

## Deployment boundary

CodeBuild verifies source; it does not mean a Vercel deployment succeeded. Treat CI and deployment as separate states:

```text
pull request -> CodeBuild verification -> merge to main -> CodeBuild main verification -> deployment
```

Do not describe a deployment as live until the hosting provider reports a successful deployment for the expected `main` commit.
