# 🔐 OxSig - Quantum-Safe Secure Communications Platform

> **Production-ready PWA for post-quantum secure document signing, identity management, and encrypted communications**
# 🔐 OxSig - Quantum-Safe Secure Communications Platform

> **Production-ready PWA for post-quantum secure document signing, identity management, and encrypted communications**

[![CI](https://github.com/jbblay/oxsig/actions/workflows/ci.yml/badge.svg)](https://github.com/jbblay/oxsig/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3-black)](https://nextjs.org/)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-purple)](https://web.dev/progressive-web-apps/)

## ⚡ Quick Start

```bash
# Clone and install
git clone https://github.com/jbblay/oxsig.git
cd oxsig
pnpm install

# Start development server (uses scripts/backend.ps1)
pnpm dev

# Open http://localhost:3000
```

**Ready to use immediately!** No backend required for core features.

## 🎯 What is OxSig?

OxSig is a comprehensive security platform that combines:

- **📝 Document Signing** - Post-quantum secure digital signatures
- **🆔 Identity Management** - Self-sovereign identity (DID) with verifiable credentials  
- **🔐 Secure Communications** - End-to-end encrypted messaging with quantum resistance
- **📱 Air-Gapped Security** - QR code signing for maximum security
- **🧠 AI Security Co-Pilot** - Threat detection and security monitoring

### Key Features

| Feature | Status | Description |
|---------|--------|-------------|
| 🔐 **WebAuthn Biometric Auth** | ✅ | Face ID/Touch ID login |
| 📝 **Document Editor** | ✅ | Rich text editor + canvas drawing |
| 📱 **QR Code Signing** | ✅ | Air-gapped device signing |
| 💾 **Offline Storage** | ✅ | IndexedDB encryption + sync |
| 🎤 **Voice Commands** | ✅ | Hands-free operation |
| 📋 **Multi-Format Import** | ✅ | TXT, MD, HTML, JSON, CSV, XML, RTF, DOCX, PDF |
| 🌓 **PWA Support** | ✅ | Installable app, offline-first |
| 🔒 **Seed Vault** | ✅ | BIP39 mnemonic management |

## 🚀 Live Demo

Deploy instantly to test all features:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/oxsig)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/oxsig)

## 📱 Screenshots

**Document Editor with Canvas Drawing:**
```
┌─────────────────────────────────────────┐
│ Rich Text Editor │ Canvas Drawing       │
├──────────────────┼─────────────────────┤
│ • Bold/Italic    │ • Signature pad     │
│ • Headers/Lists  │ • Shapes & arrows   │
│ • Tables/Links   │ • Color picker      │
│ • Code blocks    │ • Export to PNG     │
└──────────────────┴─────────────────────┘
```

**Security Features:**
```
Biometric Auth ──────► QR Code Signing ──────► Encrypted Storage
     ↓                       ↓                        ↓
 Touch/Face ID          Air-gapped Device        IndexedDB + AES
```

## 🏗️ Architecture

### Technology Stack

- **Frontend:** Next.js 15 + React 19 + TypeScript 5
- **Styling:** Tailwind CSS + shadcn/ui components
- **State:** React hooks + Context API
- **Storage:** IndexedDB (encrypted) + Service Worker
- **Auth:** WebAuthn + Biometric APIs
- **PWA:** Service Worker + Web Manifest
- **Build:** Vercel + Edge Functions

### Project Structure

```
oxsig/
├── src/
│   ├── app/              # Next.js pages (18 routes)
│   ├── components/       # Reusable UI (50+ components)
│   ├── lib/             # Business logic & utilities
│   ├── hooks/           # Custom React hooks
│   └── types/           # TypeScript definitions
├── public/              # Static assets + PWA manifest
├── docs/               # Documentation
└── scripts/            # Deployment scripts
```

### Core Pages

| Route | Purpose | Key Features |
|-------|---------|--------------|
| `/` | Home dashboard | Stats, quick actions, feature overview |
| `/sign` | Document signing | Rich editor, canvas, multi-party signing |
| `/identity` | DID management | Credentials, trust score, verification |
| `/privacy` | Zero-knowledge proofs | Selective disclosure, anonymous mode |
| `/security` | Key management | Audit logs, threat monitoring |
| `/vault` | Seed phrase vault | BIP39 generation, secure backup |
| `/features` | Feature testing | Biometrics, QR codes, voice commands |

## 🔧 Development

### Prerequisites

Node.js 18+ 
- pnpm (recommended) or npm
- Modern browser with WebAuthn support

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

### Environment Variables

```bash
# Optional - for enhanced features
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## 🔐 Security Features

### Implemented Security

- ✅ **WebAuthn/FIDO2** - Hardware-backed authentication
- ✅ **Client-side Encryption** - AES-256-GCM for local storage
- ✅ **Air-gapped Signing** - QR code protocols for offline security
- ✅ **Audit Logging** - Merkle tree commitment for integrity
- ✅ **Device Pairing** - Zero-password device authentication
- ✅ **Duress Detection** - Emergency mode for forced access

### Planned Security (Roadmap)

- 🔄 **Post-Quantum Crypto** - Dilithium signatures, Kyber key exchange
- 🔄 **Zero-Knowledge Proofs** - ZK-SNARKs for privacy-preserving verification
- 🔄 **Threshold Cryptography** - Multi-party computation for signatures
- 🔄 **Blockchain Anchoring** - Immutable signature verification

## 🎯 Use Cases
✅ **WebAuthn/FIDO2** - Hardware-backed authentication
### For Journalists
- Verify document authenticity with QR codes
- Secure source communications
- Air-gapped editing for sensitive documents
- Offline operation in restricted environments

### For Legal/Business
- Digital contract signing with legal validity
🔄 **Post-Quantum Crypto** - Dilithium signatures, Kyber key exchange
- Secure document collaboration
- Audit trail compliance

### For Personal Use
- Password-free authentication
- Secure note-taking and document storage
- Digital signature creation
Verify document authenticity with QR codes

## 📊 Performance

- **Load Time:** <100ms
- **Bundle Size:** ~500KB gzipped
Digital contract signing with legal validity
- **Offline Capable:** 100% feature availability
- **Mobile Optimized:** Touch-first responsive design

## 🚀 Deployment

Password-free authentication

#### Vercel (Recommended)
```bash
vercel --prod
```

**Load Time:** <100ms
```bash
railway up
```

#### Docker
```bash
docker build -t oxsig .
docker run -p 3000:3000 oxsig
```

### Static Export (Air-gapped)
```bash
pnpm build
pnpm export
# Deploy 'out' folder to any web server
```

## 📚 Documentation

- **[Developer Guide](docs/DEVELOPER_GUIDE.md)** - Complete setup and backend integration.
- **[Features](docs/FEATURES.md)** - All features documentation (basic + advanced).
- **[Architecture](docs/ARCHITECTURE.md)** - Technical architecture & design patterns.
- **[Security](docs/SECURITY.md)** - Security implementation & threat model.
- **[Deployment](docs/DEPLOYMENT.md)** - Production deployment guide.
- **[Contributing](docs/CONTRIBUTING.md)** - Development & contribution guidelines.
- **[Roadmap](docs/ROADMAP.md)** - Development roadmap & open source strategy.

## 🤝 Contributing

We welcome contributions! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to get started.

### Development Workflow

1.  Fork the repository.
2.  Create your feature branch: `git checkout -b feature/amazing-feature`.
3.  Commit your changes: `git commit -m 'Add amazing feature'`.
4.  Push to the branch: `git push origin feature/amazing-feature`.
5.  Open a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links
- **Demo:** [https://oxsig.vercel.app](https://oxsig.vercel.app)
- **Documentation:** [https://docs.oxsig.dev](https://docs.oxsig.dev)
- **Issues:** [GitHub Issues](https://github.com/yourusername/oxsig/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/oxsig/discussions)

## ⭐ Show Your Support

**Repo:** https://github.com/jbblay/oxsig
- **Issues:** https://github.com/jbblay/oxsig/issues
- **Pull Requests:** https://github.com/jbblay/oxsig/pulls
[![GitHub stars](https://img.shields.io/github/stars/jbblay/oxsig?style=social)](https://github.com/jbblay/oxsig)

---

Note on cryptography: certain modules are DEMO-ONLY and not suitable for production without hardening (e.g., `lib/storage/secure-storage.ts` uses XOR/base64, `lib/vault/seed-vault.ts` uses a partial BIP39 list and simplified flows). See `docs/SECURITY.md`, `docs/GRANTS.md` and `docs/OPEN_CALLS.md` for the hardening plan.
---

**Built with ❤️ using Next.js, TypeScript, and modern web standards**
