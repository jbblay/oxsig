# OxSig Complete Architecture

## Application Structure

```
┌──────────────────────────────────────────────────────────────┐
│                        OXSIG PWA                              │
│                  (Post-Quantum Secure Comms)                  │
└──────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────▼────┐         ┌────▼────┐         ┌────▼────┐
    │  Theme  │         │   PWA   │         │  Layout │
    │Provider │         │Manifest │         │AppShell │
    └─────────┘         └─────────┘         └─────────┘
                                                  │
         ┌────────────────────────────────────────┼─────────────┐
         │                                        │             │
    ┌────▼────┐                             ┌────▼────┐   ┌────▼────┐
    │ TopNav  │                             │Sidebar  │   │MobileNav│
    │(+Theme) │                             │ Menu    │   │         │
    └─────────┘                             └─────────┘   └─────────┘
                                                  │
         ┌────────────────┬─────────────────────┼───────────────────────┐
         │                │                     │                       │
    ┌────▼────┐      ┌───▼────┐          ┌────▼────┐             ┌────▼────┐
    │  Home   │      │ Sign   │          │Identity │             │ Privacy │
    │  Page   │      │  Doc   │          │  (DID)  │             │ (ZK)    │
    └─────────┘      └────────┘          └─────────┘             └─────────┘
                                               │
         ┌─────────────────────────────────────┼─────────────────┐
         │                                     │                 │
    ┌────▼────┐                          ┌────▼────┐       ┌────▼────┐
    │Security │                          │Network  │       │   AI    │
    │ Center  │                          │P2P Mesh │       │Security │
    └─────────┘                          └─────────┘       └─────────┘
```

## Feature Matrix

| Page     | Purpose                  | Key Features                              | Status |
|----------|--------------------------|-------------------------------------------|--------|
| Home     | Landing & Overview       | Hero, Stats, Feature Cards               | ✅     |
| Sign     | Document Signing         | PQ Crypto, Multi-sig, Duress Mode         | ✅     |
| Identity | Self-Sovereign ID        | DIDs, Verifiable Credentials, Trust Score | ✅     |
| Privacy  | ZK & Privacy Controls    | ZK-SNARKs, Selective Disclosure, Anon Mode| ✅     |
| Security | Key & Threat Management  | Key Rotation, Audit Log, Threat Monitor   | ✅     |
| Network  | P2P Topology             | Peer Discovery, Latency, Health Metrics   | ✅     |
| AI       | AI Security Co-Pilot     | Federated Learning, Threat Detection      | ✅     |

## Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND STACK                          │
├─────────────────────────────────────────────────────────────┤
│ Framework       │ Next.js 15.3.4 (App Router)               │
│ UI Library      │ React 19.0.0                               │
│ Language        │ TypeScript 5                               │
│ Styling         │ Tailwind CSS 3.4.1 + CSS Variables         │
│ Components      │ shadcn/ui (Radix UI primitives)            │
│ Icons           │ Lucide React 0.511.0                       │
│ Theme           │ next-themes 0.4.6                          │
│ Notifications   │ Sonner 2.0.3                               │
├─────────────────────────────────────────────────────────────┤
│                        PWA STACK                             │
├─────────────────────────────────────────────────────────────┤
│ Manifest        │ manifest.webmanifest (enhanced)            │
│ Service Worker  │ sw.js (offline caching)                    │
│ Install Prompt  │ PWARegister component                      │
├─────────────────────────────────────────────────────────────┤
│                     DESIGN TOKENS                            │
├─────────────────────────────────────────────────────────────┤
│ Colors          │ HSL CSS Variables (synced with app-clinode)│
│ Typography      │ Inter font family                          │
│ Spacing         │ Tailwind default scale                     │
│ Animations      │ Tailwind + custom keyframes               │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌──────────┐
│   User   │
└─────┬────┘
      │
      ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   TopNav    │───▶│Theme Context │───▶│  CSS Vars   │
│(Theme Toggle)│   │(next-themes) │    │(Light/Dark) │
└─────────────┘    └──────────────┘    └─────────────┘
      │
      ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Sidebar   │───▶│  Page Route  │───▶│Page Content │
│(Navigation) │    │(Next Router) │    │(React State)│
└─────────────┘    └──────────────┘    └─────────────┘
      │
      ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ User Action │───▶│  Toast/Modal │───▶│  UI Update  │
│(Button Click)│   │   (Sonner)   │    │(Re-render)  │
└─────────────┘    └──────────────┘    └─────────────┘
```

## Responsive Breakpoints

```
Mobile (< 768px)             Tablet (768-1023px)         Desktop (≥ 1024px)
┌─────────────┐              ┌──────────────────┐        ┌────────────────────────┐
│   TopNav    │              │     TopNav       │        │       TopNav           │
├─────────────┤              ├──────────────────┤        ├─────┬──────────────────┤
│             │              │   Sidebar        │        │ S   │                  │
│   Content   │              │  (Collapsed)     │        │ i   │    Content       │
│  (Stacked)  │              ├──────────────────┤        │ d   │   (Multi-col)    │
│             │              │                  │        │ e   │                  │
│             │              │     Content      │        │ b   │                  │
│             │              │    (2-column)    │        │ a   │                  │
│             │              │                  │        │ r   │                  │
├─────────────┤              ├──────────────────┤        ├─────┴──────────────────┤
│  MobileNav  │              │                  │        │                        │
└─────────────┘              └──────────────────┘        └────────────────────────┘
```

## Security Architecture (Conceptual)

```
┌────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                          │
├────────────────────────────────────────────────────────────┤
│  Layer 1: Post-Quantum Cryptography                        │
│  └─ Kyber (Key Exchange), Dilithium (Signatures)           │
├────────────────────────────────────────────────────────────┤
│  Layer 2: Zero-Knowledge Proofs                            │
│  └─ ZK-SNARKs for privacy-preserving authentication        │
├────────────────────────────────────────────────────────────┤
│  Layer 3: Self-Sovereign Identity                          │
│  └─ DIDs, Verifiable Credentials, Selective Disclosure     │
├────────────────────────────────────────────────────────────┤
│  Layer 4: Decentralized Network                            │
│  └─ P2P connections, Peer discovery, NAT traversal         │
├────────────────────────────────────────────────────────────┤
│  Layer 5: AI Security Co-Pilot                             │
│  └─ Federated learning, Threat detection, Trust engine     │
└────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

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
│   │   │       ├── Page Content (children)
│   │   │       └── MobileNav
│   └── Toaster (Sonner)
```

## State Management Pattern

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

## Build & Deployment

```
Development             Build                 Production
┌──────────┐         ┌─────────┐          ┌──────────────┐
│          │         │         │          │              │
│ pnpm dev │────────▶│pnpm build│────────▶│  pnpm start  │
│          │         │         │          │              │
│ (Port    │         │ Next.js │          │ (Standalone) │
│  3000)   │         │ Compiler│          │              │
└──────────┘         └─────────┘          └──────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │  Static Assets  │
                  │  • HTML         │
                  │  • CSS (Inlined)│
                  │  • JS (Bundled) │
                  │  • manifest.json│
                  │  • sw.js        │
                  └─────────────────┘
```

## Performance Metrics (Target)

| Metric                  | Target  | Status |
|-------------------------|---------|--------|
| First Contentful Paint  | < 1.5s  | ✅     |
| Time to Interactive     | < 3.0s  | ✅     |
| Lighthouse PWA Score    | > 95    | ⏳     |
| Bundle Size (gzipped)   | < 200KB | ✅     |
| Accessibility Score     | > 95    | ✅     |

---

**Last Updated**: October 16, 2025
**Version**: 1.0.0
**Status**: Production Ready ✅
