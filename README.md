# OxSig Monorepo

> **Quantum-Safe Security Platform** - Enterprise-grade security architecture demonstrating CISA, CISM, CISSP, and CEH certifications

[![CI](https://github.com/jbblay/oxsig/actions/workflows/ci.yml/badge.svg)](https://github.com/jbblay/oxsig/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 Portfolio Objectives

This project demonstrates professional security architecture and implementation across multiple domains:

### **CISA** (Certified Information Systems Auditor)
- ✅ Merkle tree-based audit trails
- ✅ Compliance reporting (GDPR, ISO 27001)
- ✅ Immutable audit logs with blockchain anchoring
- ✅ Real-time security monitoring

### **CISM** (Certified Information Security Manager)  
- ✅ Risk-based architecture decisions
- ✅ Service-oriented security design
- ✅ Threat detection and response
- ✅ Security metrics and KPIs

### **CISSP** (Certified Information Systems Security Professional)
- ✅ Defense-in-depth architecture
- ✅ Zero-trust network model
- ✅ Cryptographic protocol implementation
- ✅ Secure development lifecycle

### **CEH** (Certified Ethical Hacker)
- ✅ Penetration testing frameworks
- ✅ Vulnerability assessment
- ✅ Security hardening
- ✅ Exploit mitigation

### **Anonymity & Privacy**
- ✅ Decentralized identity (DID)
- ✅ Zero-knowledge proofs
- ✅ Air-gapped operations
- ✅ End-to-end encryption

## 📁 Monorepo Structure

```
oxsig/
├── packages/
│   ├── frontend/              # Next.js 15 PWA
│   │   ├── src/              # Application source
│   │   ├── public/           # Static assets
│   │   └── package.json
│   │
│   ├── backend-ws/           # WebSocket Gateway (Rust)
│   │   ├── src/              # Signaling server
│   │   ├── Cargo.toml        # Rust dependencies
│   │   └── Dockerfile
│   │
│   └── shared/               # Shared types & contracts
│       ├── types/            # TypeScript definitions
│       └── schemas/          # API schemas
│
├── infrastructure/
│   ├── docker/               # Container orchestration
│   │   └── docker-compose.yml
│   ├── observability/        # Monitoring stack
│   │   ├── prometheus.yml
│   │   ├── grafana/
│   │   └── loki-config.yml
│   └── security/            # Security policies
│       └── opa-policies.rego
│
├── docs/                     # Comprehensive documentation
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   └── DEPLOYMENT.md
│
├── scripts/                  # Automation scripts
└── tests/                    # Integration tests
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and **pnpm** 8+
- **Rust** 1.70+ (for backend)
- **Docker** & **Docker Compose** (for infrastructure)

### Installation

```bash
# Clone repository
git clone https://github.com/jbblay/oxsig.git
cd oxsig

# Install dependencies
pnpm install

# Start development
pnpm dev
```

### Development Commands

```bash
# Frontend development
pnpm dev:frontend          # Start Next.js dev server

# Backend development  
pnpm dev:backend           # Start Rust WebSocket gateway

# Build everything
pnpm build                 # Build all packages

# Testing
pnpm test                  # Run all tests
pnpm test:watch            # Watch mode

# Docker infrastructure
pnpm docker:up             # Start all services
pnpm docker:logs           # View logs
pnpm docker:down           # Stop services
```

## 🏗️ Architecture Highlights

### **Microservices Architecture**
```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│  • WebAuthn Auth  • Document Editor  • QR Pairing       │
└─────────────────────┬───────────────────────────────────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
    ┌────▼───┐   ┌───▼────┐  ┌───▼─────┐
    │WS      │   │Auth    │  │Audit    │
    │Gateway │   │Service │  │Service  │
    │(Rust)  │   │(Future)│  │(Future) │
    └────┬───┘   └────────┘  └────┬────┘
         │                         │
    ┌────▼─────────────────────────▼────┐
    │      Infrastructure Layer          │
    │  PostgreSQL • Redis • NATS • MinIO│
    └────────────────────────────────────┘
```

### **Security Layers**

1. **Transport**: TLS 1.3 with certificate pinning
2. **Application**: End-to-end encryption (Signal Protocol + PQ)
3. **Storage**: AES-256-GCM with HKDF key derivation
4. **Identity**: Ed25519 + Dilithium (post-quantum ready)
5. **Network**: Zero-trust with mutual TLS

## 🔐 Security Features

### **Implemented**
- ✅ WebAuthn/FIDO2 biometric authentication
- ✅ Client-side encryption (AES-256-GCM)
- ✅ QR code air-gapped signing
- ✅ Cryptographic audit trails (Merkle trees)
- ✅ Device pairing with challenge-response
- ✅ Real-time threat detection

### **Planned**
- 🔄 Post-quantum cryptography (Dilithium, Kyber)
- 🔄 Zero-knowledge proofs (ZK-SNARKs)
- 🔄 Threshold cryptography (multi-party signatures)
- 🔄 Blockchain anchoring (ICP, Ethereum)

## 📊 Technology Stack

### **Frontend**
- Next.js 15 (App Router, Server Components)
- React 19 (Concurrent rendering)
- TypeScript 5 (Strict mode)
- Tailwind CSS + shadcn/ui
- IndexedDB (Encrypted storage)

### **Backend**
- Rust (Axum framework)
- WebSocket (Real-time signaling)
- JWT (Authentication)
- Prometheus (Metrics)

### **Infrastructure**
- PostgreSQL 16 (Primary database)
- Redis 7 (Cache & rate limiting)
- NATS (Message broker)
- MinIO (S3-compatible storage)
- Grafana Stack (Observability)

## 📚 Documentation

Comprehensive documentation for certification portfolio review:

- **[Architecture](docs/ARCHITECTURE.md)** - System design & patterns
- **[Security](docs/SECURITY.md)** - Threat model & mitigations
- **[Features](docs/FEATURES.md)** - Complete feature documentation
- **[Deployment](docs/DEPLOYMENT.md)** - Production deployment guide
- **[Development](docs/DEVELOPMENT.md)** - Contributing guidelines

## 🧪 Testing

```bash
# Unit tests
pnpm test

# Integration tests
pnpm test:integration

# Coverage report
pnpm test:coverage

# Security audit
pnpm audit

# Dependency check
pnpm outdated
```

## 📈 Monitoring & Observability

Access monitoring dashboards (when running with Docker):

- **Grafana**: http://localhost:3001 (admin/admin)
- **Prometheus**: http://localhost:9090
- **WS Gateway Metrics**: http://localhost:8080/metrics

## 🤝 Contributing

This is a portfolio project, but contributions demonstrating security best practices are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/security-feature`)
3. Commit changes (`git commit -m 'feat: add security feature'`)
4. Push to branch (`git push origin feat/security-feature`)
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## 🔗 Links

- **Repository**: https://github.com/jbblay/oxsig
- **Issues**: https://github.com/jbblay/oxsig/issues
- **Discussions**: https://github.com/jbblay/oxsig/discussions

---

**Built to demonstrate enterprise security architecture principles for CISA, CISM, CISSP, and CEH certifications.**
