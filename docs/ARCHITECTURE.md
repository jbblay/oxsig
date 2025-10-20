# 🏗️ OxSig Architecture

## Overview

OxSig is built on a modern, scalable architecture designed for security, performance, and maintainability. The application follows a client-first approach with optional backend integration.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER INTERFACE LAYER                         │
│  React + Next.js + Tailwind + Framer Motion                     │
│  - Identity Management UI                                        │
│  - Secure Messaging Interface                                    │
│  - Document Signing Workspace                                    │
│  - AI Security Dashboard                                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓↑
┌─────────────────────────────────────────────────────────────────┐
│                   CRYPTOGRAPHIC LAYER                            │
│  - Post-Quantum Crypto (Kyber, Dilithium, SPHINCS+)            │
│  - Zero-Knowledge Proofs (ZK-SNARKs, Bulletproofs)             │
│  - Threshold Cryptography (Shamir Secret Sharing)              │
│  - End-to-End Encryption (Signal Protocol + PQ)                │
└─────────────────────────────────────────────────────────────────┘
                              ↓↑
┌─────────────────────────────────────────────────────────────────┐
│                   APPLICATION LOGIC LAYER                        │
│  - Identity Management (DIDs, VCs)                              │
│  - Document Processing (Sign, Verify, Audit)                    │
│  - Communication Protocol (P2P, Relay)                          │
│  - AI Security Engine (Threat Detection, Trust Scoring)         │
└─────────────────────────────────────────────────────────────────┘
                              ↓↑
┌─────────────────────────────────────────────────────────────────┐
│                    STORAGE & SYNC LAYER                          │
│  Local: IndexedDB + Service Worker                              │
│  Cloud: IPFS + Internet Computer + Supabase                     │
│  Blockchain: Ethereum + Solana (for anchoring)                  │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend Framework
- **Next.js 15** - App Router, Server Components
- **React 19** - Latest features, concurrent rendering
- **TypeScript 5** - Strict type safety

### UI & Styling
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library
- **Framer Motion** - Animations and transitions
- **Lucide Icons** - Consistent iconography

### State Management
- **React Hooks** - Local state management
- **Context API** - Global state (theme, sidebar)
- **IndexedDB** - Persistent storage
- **Service Worker** - Background sync

### Security & Crypto
- **WebAuthn API** - Biometric authentication
- **Web Crypto API** - Browser-native cryptography
- **@noble/curves** - Elliptic curve operations
- **@noble/hashes** - Cryptographic hashing

### PWA Features
- **Service Worker** - Offline functionality
- **Web Manifest** - Installable app
- **Push API** - Notifications
- **Background Sync** - Offline queue

## Component Architecture

### Layout Structure

```
RootLayout (layout.tsx)
├── ThemeProvider
│   ├── PWARegister
│   ├── AppShell
│   │   ├── SidebarProvider
│   │   │   ├── Sidebar
│   │   │   │   ├── SidebarHeader
│   │   │   │   ├── SidebarContent
│   │   │   │   │   ├── SidebarGroup (Core Features)
│   │   │   │   │   └── SidebarGroup (Security)
│   │   │   │   └── SidebarFooter
│   │   │   └── SidebarInset
│   │   │       ├── TopNav
│   │   │       │   ├── Menu Button (Mobile)
│   │   │       │   ├── Privacy Mode Switch
│   │   │       │   ├── Theme Toggle (Sun/Moon)
│   │   │       │   └── User Dropdown
│   │   │       └── PageContent
│   │   │           └── [Dynamic Page Components]
│   │   └── Toaster (Notifications)
│   └── ErrorBoundary
```

### Component Categories

#### UI Primitives (`/components/ui/`)
- **Button, Input, Card** - Basic form elements
- **Dialog, Sheet, Popover** - Overlay components
- **Table, Tabs, Accordion** - Data display
- **Progress, Badge, Avatar** - Status indicators

#### Feature Components (`/components/app/`)
- **DocumentEditor** - Rich text editing
- **CanvasDrawing** - Signature pad and drawing
- **QRGenerator** - QR code creation and scanning
- **BiometricAuth** - WebAuthn integration
- **VoiceCommands** - Speech recognition

#### Layout Components (`/components/layout/`)
- **AppShell** - Main application container
- **Sidebar** - Navigation and quick actions
- **TopNav** - Header with user controls
- **MobileNav** - Mobile-specific navigation

## Data Flow

### Authentication Flow

```
User Action → WebAuthn API → Browser Secure Element
     ↓
Credential Verification → Local Storage (encrypted)
     ↓
Session Management → Context Provider → UI Update
```

### Document Signing Flow

```
Document Import → Content Processing → Editor State
     ↓
User Editing → Real-time Updates → Auto-save (IndexedDB)
     ↓
Signature Request → QR Code Generation → Air-gapped Device
     ↓
Signature Return → Document Assembly → Export/Storage
```

### Offline Sync Flow

```
Online Actions → IndexedDB Queue → Service Worker
     ↓
Network Available → Background Sync → Server API
     ↓
Conflict Resolution → Local Update → UI Refresh
```

## Security Architecture

### Client-Side Security

```
┌─────────────────────────────────────────┐
│           Browser Security               │
├─────────────────────────────────────────┤
│ • Same-origin policy                     │
│ • Content Security Policy (CSP)         │
│ • Subresource Integrity (SRI)          │
│ • Secure contexts (HTTPS only)         │
└─────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│        Application Security              │
├─────────────────────────────────────────┤
│ • WebAuthn biometric auth               │
│ • Client-side encryption (AES-GCM)     │
│ • Secure key derivation (PBKDF2)       │
│ • Memory protection (no plaintext)     │
└─────────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────┐
│          Storage Security                │
├─────────────────────────────────────────┤
│ • IndexedDB encryption                  │
│ • Service Worker isolation             │
│ • Secure deletion patterns            │
│ • Key rotation mechanisms             │
└─────────────────────────────────────────┘
```

### Cryptographic Layers

1. **Transport Layer** - TLS 1.3 + Certificate Pinning
2. **Application Layer** - End-to-end encryption (Signal Protocol)
3. **Storage Layer** - AES-256-GCM with HKDF key derivation
4. **Identity Layer** - Ed25519 signatures + Dilithium (post-quantum)

## Performance Architecture

### Bundle Optimization

```typescript
// next.config.ts optimizations
{
  experimental: {
    optimizePackageImports: ['@radix-ui', 'lucide-react'],
    turbo: {
      rules: {
        '*.tsx': ['typescript-transform']
      }
    }
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  }
}
```

### Code Splitting Strategy

- **Route-based splitting** - Automatic via Next.js
- **Component-level splitting** - Dynamic imports for heavy components
- **Library splitting** - Vendor chunks separated
- **Critical path optimization** - Above-fold content prioritized

### Caching Strategy

```
Browser Cache (1 year) → Static assets
     ↓
Service Worker Cache (7 days) → App shell + API responses
     ↓
IndexedDB Cache (persistent) → User data + documents
     ↓
Memory Cache (session) → Active document state
```

## Development Architecture

### File Organization

```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Auth-protected routes
│   ├── api/               # API routes (stubs)
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # Reusable UI primitives
│   ├── app/              # Feature components
│   └── layout/           # Layout components
├── lib/                  # Business logic
│   ├── auth/             # Authentication utilities
│   ├── crypto/           # Cryptographic functions
│   ├── db/               # Database operations
│   └── utils.ts          # Common utilities
├── hooks/                # Custom React hooks
├── types/                # TypeScript definitions
└── styles/               # CSS modules (if needed)
```

### State Management Pattern

```
┌─────────────────────────────────────────────────────────┐
│              STATE MANAGEMENT                            │
├─────────────────────────────────────────────────────────┤
│ Global State:                                            │
│  • Theme (next-themes) ────────────────────┐            │
│  • Sidebar collapsed (useSidebar hook) ────┼────────┐   │
│                                             │        │   │
│ Page-Level State (React.useState):         │        │   │
│  • Form inputs ────────────────────────────┼────┐   │   │
│  • Toggle switches ────────────────────────┼────┼───┤   │
│  • Tab selections ─────────────────────────┼────┼───┤   │
│  • Modal visibility ───────────────────────┼────┼───┤   │
│                                             │    │   │   │
│ Derived State (React.useMemo):             │    │   │   │
│  • Security score calculations ────────────┼────┼───┤   │
│  • Privacy score computations ─────────────┘    │   │   │
│                                                  │   │   │
│ Side Effects (toast notifications): ────────────┼───┘   │
│  • Success/Error messages ──────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## API Architecture

### RESTful API Design (Backend)

```
GET    /api/auth/session          # Current session
POST   /api/auth/webauthn        # WebAuthn authentication
GET    /api/documents            # List documents
POST   /api/documents            # Create document
GET    /api/documents/:id        # Get document
PUT    /api/documents/:id        # Update document
POST   /api/documents/:id/sign   # Sign document
GET    /api/identity/did         # Get DID document
POST   /api/identity/credential  # Issue credential
POST   /api/communications/send  # Send message
GET    /api/communications/inbox # Get messages
```

### GraphQL Schema (Alternative)

```graphql
type User {
  id: ID!
  did: String!
  publicKey: String!
  trustScore: Float!
  credentials: [Credential!]!
}

type Document {
  id: ID!
  title: String!
  content: String!
  signatures: [Signature!]!
  auditLog: [AuditEntry!]!
}

type Mutation {
  signDocument(id: ID!, signature: String!): Document!
  sendMessage(to: String!, content: String!): Message!
}
```

## Deployment Architecture

### Production Stack

```
CDN (Cloudflare) → Load Balancer → App Servers (Vercel/Railway)
                                          ↓
Database (Supabase/PostgreSQL) ← → Cache (Redis)
                                          ↓
File Storage (IPFS/S3) ← → Background Jobs (Vercel Functions)
```

### Environment Configuration

```typescript
// Environment variables
NEXT_PUBLIC_APP_URL=https://oxsig.app
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

// Runtime configuration
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
IPFS_API_KEY=...
WEBHOOK_SECRET=...
```

## Monitoring & Observability

### Performance Monitoring

- **Core Web Vitals** - LCP, FID, CLS tracking
- **Bundle Analysis** - Size and composition monitoring
- **Runtime Performance** - Memory usage, CPU utilization
- **Network Performance** - API response times, cache hit rates

### Error Tracking

- **Client-side Errors** - JavaScript exceptions, React errors
- **API Errors** - HTTP status codes, response validation
- **Security Events** - Authentication failures, permission violations
- **User Experience** - Failed actions, incomplete workflows

### Analytics

- **Usage Patterns** - Feature adoption, user journeys
- **Performance Metrics** - Page load times, interaction delays
- **Security Metrics** - Authentication success rates, threat detection
- **Business Metrics** - Document signatures, user retention

## Future Architecture Considerations

### Scalability Improvements

1. **Micro-frontends** - Module federation for large teams
2. **Edge Computing** - Cloudflare Workers for geo-distribution
3. **Database Scaling** - Read replicas, connection pooling
4. **CDN Optimization** - Smart caching, image optimization

### Advanced Security

1. **Zero-Trust Architecture** - Continuous verification
2. **Hardware Security Modules** - HSM integration for key storage
3. **Formal Verification** - Mathematical proof of security properties
4. **Quantum-Safe Migration** - Gradual transition to post-quantum crypto

### Emerging Technologies

1. **WebAssembly** - High-performance cryptographic operations
2. **WebXR** - Immersive signature experiences
3. **WebGPU** - GPU-accelerated cryptography
4. **Web3 Integration** - Decentralized identity and storage

---

This architecture provides a solid foundation for a secure, scalable, and maintainable application while remaining flexible for future enhancements and integrations.