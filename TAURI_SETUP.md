# 🚀 Tauri Desktop App Setup Guide

## Overview

OxSig now supports native desktop applications for **Windows**, **macOS**, and **Linux** using Tauri!

### Why Tauri?

- **Security First**: Rust-based backend, memory-safe
- **Small Bundle**: 15-25 MB (vs Electron's 120+ MB)
- **Native Features**: System tray, file dialogs, biometric auth
- **Same Codebase**: One codebase for web + desktop

---

## Prerequisites

### 1. Install Rust

**Windows:**
```powershell
# Download and run rustup-init.exe from:
# https://rustup.rs/

# Or use winget:
winget install Rustlang.Rustup
```

**macOS/Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Install Platform-Specific Dependencies

**Windows:**
- Microsoft C++ Build Tools (Visual Studio 2019+)
- WebView2 (usually pre-installed on Windows 10/11)

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

---

## Development

### Run Desktop App in Dev Mode

```bash
# Start Next.js dev server + Tauri window
pnpm tauri:dev
```

This will:
1. Start Next.js dev server on `http://localhost:3000`
2. Open a native window showing your app
3. Hot reload on code changes

### Run Web App Only

```bash
pnpm dev
```

---

## Building for Production

### Build for Current Platform

```bash
# Build for your current OS
pnpm tauri:build
```

Output locations:
- **Windows**: `src-tauri/target/release/bundle/nsis/oxsig_0.1.0_x64-setup.exe`
- **macOS**: `src-tauri/target/release/bundle/dmg/OxSig_0.1.0_universal.dmg`
- **Linux**: `src-tauri/target/release/bundle/appimage/oxsig_0.1.0_amd64.AppImage`

### Build for Specific Platforms

```bash
# Windows (x64)
pnpm tauri:build:windows

# macOS (Universal - Intel + Apple Silicon)
pnpm tauri:build:mac

# Linux (x64)
pnpm tauri:build:linux
```

---

## Features Enabled

### ✅ Native Features Available

1. **System Tray**
   - App runs in background
   - Click tray icon to show/hide window
   - Right-click for menu (Show, Quit)

2. **Native File Dialogs**
   - Save documents with OS file picker
   - Open files with native dialog
   - File type filters

3. **Native Notifications**
   - Desktop notifications
   - Action buttons
   - Badges (macOS)

4. **Native Filesystem**
   - Read/write files outside browser sandbox
   - Access user documents folder
   - File watchers

5. **Biometric Auth** (planned)
   - Windows Hello integration
   - Touch ID on macOS
   - Hardware security keys

---

## Code Integration

### Detect Tauri Environment

```typescript
import { isTauri } from '@/lib/tauri';

if (isTauri()) {
  // Running in desktop app
  console.log('Desktop mode');
} else {
  // Running in browser
  console.log('Web mode');
}
```

### Show Native Save Dialog

```typescript
import { showSaveDialog } from '@/lib/tauri';

const filePath = await showSaveDialog({
  defaultPath: 'document.pdf',
  filters: [
    { name: 'PDF', extensions: ['pdf'] },
    { name: 'All', extensions: ['*'] }
  ]
});
```

### Send Desktop Notification

```typescript
import { sendDesktopNotification } from '@/lib/tauri';

await sendDesktopNotification(
  'Document Signed',
  'Your document has been securely signed'
);
```

### Write File to Disk

```typescript
import { writeFile } from '@/lib/tauri';

await writeFile('signature.sig', signatureData);
```

---

## Configuration Files

### Key Files

- `src-tauri/tauri.conf.json` - Tauri configuration
- `src-tauri/Cargo.toml` - Rust dependencies
- `src-tauri/src/lib.rs` - Rust backend code
- `src/lib/tauri.ts` - TypeScript integration helpers
- `next.config.ts` - Next.js with static export enabled

---

## Code Signing (Production)

### Windows

1. Get a code signing certificate (DigiCert, Sectigo, etc.)
2. Update `src-tauri/tauri.conf.json`:
   ```json
   "windows": {
     "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
     "timestampUrl": "http://timestamp.digicert.com"
   }
   ```

### macOS

1. Join Apple Developer Program ($99/year)
2. Get Developer ID certificate
3. Update `src-tauri/tauri.conf.json`:
   ```json
   "macOS": {
     "signingIdentity": "Developer ID Application: Your Name (TEAM_ID)"
   }
   ```

---

## Troubleshooting

### Build Fails on Windows

**Error:** `link.exe not found`
- Install Visual Studio 2019+ with C++ Build Tools
- Run from "Developer Command Prompt for VS"

### Build Fails on macOS

**Error:** `xcrun: error: invalid active developer path`
- Run: `xcode-select --install`

### WebView2 Not Found (Windows)

- Download from: https://developer.microsoft.com/microsoft-edge/webview2/
- Or let installer download it automatically

### Slow First Build

- First Rust compilation downloads and compiles dependencies
- Subsequent builds are much faster
- Use `--release` flag only for production

---

## Distribution

### Windows

1. Build installer: `pnpm tauri:build:windows`
2. Output: `oxsig_0.1.0_x64-setup.exe` (NSIS installer)
3. Distribute via website or Microsoft Store

### macOS

1. Build DMG: `pnpm tauri:build:mac`
2. Output: `OxSig_0.1.0_universal.dmg`
3. Notarize with Apple (required for Gatekeeper)
4. Distribute via website or Mac App Store

### Linux

1. Build AppImage: `pnpm tauri:build:linux`
2. Also builds `.deb` for Debian/Ubuntu
3. Distribute via website or Flathub/Snap Store

---

## Auto-Updates (Future)

Tauri supports automatic updates via GitHub Releases:

1. Install `tauri-plugin-updater`
2. Configure update endpoint
3. App checks for updates on launch
4. Downloads and installs silently

---

## Performance Tips

1. **Static Export**: Already configured in `next.config.ts`
2. **Bundle Size**: Remove unused dependencies
3. **Lazy Loading**: Use dynamic imports for heavy components
4. **Asset Optimization**: Compress images, use WebP
5. **Code Splitting**: Leverage Next.js automatic splitting

---

## Security Considerations

- ✅ Content Security Policy (CSP) configured
- ✅ HTTPS only for external resources
- ✅ Sandboxed renderer process
- ✅ IPC validation between frontend/backend
- ✅ No `eval()` or unsafe-eval
- ✅ Rust backend prevents memory vulnerabilities

---

## Next Steps

1. **Install Rust**: Follow prerequisites above
2. **Test Dev Mode**: `pnpm tauri:dev`
3. **Build Installer**: `pnpm tauri:build`
4. **Get Code Signing Cert**: For production distribution
5. **Set Up CI/CD**: Automate builds on GitHub Actions

---

## Resources

- [Tauri Docs](https://tauri.app)
- [Tauri Examples](https://github.com/tauri-apps/tauri/tree/dev/examples)
- [Rust Book](https://doc.rust-lang.org/book/)
- [Next.js Static Export](https://nextjs.org/docs/app/building-your-application/deploying/static-exports)

---

**Questions?** Check `src/lib/tauri.ts` for integration examples!
