# OxSig Monorepo Migration Plan

## Goal
Restructure OxSig into a clean monorepo demonstrating enterprise security architecture patterns for CISA/CISM/CISSP/CEH portfolio.

## New Structure

```
oxsig/
├── packages/
│   ├── frontend/              # Next.js 15 PWA
│   ├── backend-ws/            # WebSocket Gateway (Rust)
│   ├── backend-auth/          # Auth Service (Future)
│   ├── backend-audit/         # Audit Service (Future)
│   └── shared/                # Shared types/contracts
├── infrastructure/
│   ├── docker/                # Container configs
│   ├── kubernetes/            # K8s manifests (future)
│   └── terraform/             # IaC (future)
├── docs/                      # Documentation
├── scripts/                   # Build/deploy scripts
└── tests/                     # Integration tests
```

## Migration Steps

### Phase 1: Setup Monorepo Structure ✅
- [x] Create pnpm-workspace.yaml
- [x] Create packages/ directory
- [ ] Move frontend code to packages/frontend/
- [ ] Move backend code to packages/backend-ws/
- [ ] Update all path references

### Phase 2: Update Configuration
- [ ] Update package.json references
- [ ] Update Docker Compose paths
- [ ] Update tsconfig.json paths
- [ ] Update next.config.ts

### Phase 3: Shared Package
- [ ] Create @oxsig/shared package
- [ ] Move common types
- [ ] Setup proper exports
- [ ] Configure TypeScript project references

### Phase 4: Testing & Validation
- [ ] Test frontend build
- [ ] Test backend build
- [ ] Test Docker builds
- [ ] Update CI/CD workflows

## Benefits for Security Portfolio

### CISM (Management)
- **Service-oriented architecture**: Clear boundaries between components
- **Risk management**: Isolated failure domains
- **Resource optimization**: Independent scaling

### CISSP (Architecture)
- **Defense in depth**: Layered security architecture
- **Least privilege**: Services with minimal permissions
- **Separation of duties**: Frontend/backend/audit separation

### CISA (Audit & Compliance)
- **Traceability**: Clear service ownership
- **Compliance**: Independent audit service
- **Change management**: Version control per service

### CEH (Ethical Hacking)
- **Attack surface**: Easier to identify and test
- **Penetration testing**: Test services independently
- **Vulnerability management**: Isolated patches

## Golden Standard Practices Applied

1. **Workspace Management**: pnpm workspaces for efficiency
2. **Dependency Isolation**: No version conflicts
3. **Build Optimization**: Parallel builds, shared cache
4. **Type Safety**: Shared types across services
5. **Developer Experience**: Single repo, unified tooling
6. **CI/CD Ready**: GitHub Actions matrix builds
7. **Container Native**: Multi-stage Docker builds
8. **Infrastructure as Code**: Declarative configs

## Commands

```bash
# Install all packages
pnpm install

# Build everything
pnpm -r build

# Run frontend dev
pnpm --filter @oxsig/frontend dev

# Build specific service
pnpm --filter @oxsig/backend-ws build

# Run all tests
pnpm -r test

# Docker build all
docker compose -f infrastructure/docker/docker-compose.yml build
```

## Next Steps

1. Execute migration script
2. Test all builds
3. Update documentation
4. Commit to new branch: `feat/monorepo-structure`
5. Test deployment
